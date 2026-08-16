/** Desktop-owned durable files and sanitized DeepSeek balance access. */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import yaml from 'js-yaml'
import type { BalanceInfo, BalanceResult, DesktopSettings } from './contracts.ts'
import { NATIVE_THEME_ID, resolveWillTheme } from './theme-catalog.ts'

/** Paths the shell owns beneath Electron's selected user-data root. */
export interface DesktopPaths {
  userData: string
  harnessHome: string
  willHome: string
  settings: string
  soul: string
  patch: string
  overlayRoot: string
  overlayCurrent: string
  overlayPrevious: string
  runtimeBin: string
}

/** Resolve every desktop-owned path from one already-selected user-data root. */
export function desktopPaths(userData: string): DesktopPaths {
  const willHome = join(userData, 'will')
  const overlayRoot = join(willHome, 'agent-overlay')
  return {
    userData,
    harnessHome: join(userData, 'harness'),
    willHome,
    settings: join(willHome, 'settings.json'),
    soul: join(willHome, 'soul.md'),
    patch: join(willHome, 'desktop.patch.yml'),
    overlayRoot,
    overlayCurrent: join(overlayRoot, 'current'),
    overlayPrevious: join(overlayRoot, 'previous'),
    runtimeBin: join(willHome, 'runtime-bin'),
  }
}

const DEFAULT_SETTINGS: DesktopSettings = Object.freeze({
  theme: NATIVE_THEME_ID,
  closeToTray: true,
  taskNotifications: true,
})

/** Validate untrusted JSON without letting unknown keys become preferences. */
export function normalizeDesktopSettings(value: unknown): DesktopSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_SETTINGS }
  const input = value as Partial<DesktopSettings>
  const candidate = typeof input.theme === 'string' ? input.theme : NATIVE_THEME_ID
  const theme = candidate === NATIVE_THEME_ID || resolveWillTheme(candidate) !== undefined
    ? candidate
    : NATIVE_THEME_ID
  return {
    theme,
    closeToTray: typeof input.closeToTray === 'boolean' ? input.closeToTray : DEFAULT_SETTINGS.closeToTray,
    taskNotifications: typeof input.taskNotifications === 'boolean'
      ? input.taskNotifications
      : DEFAULT_SETTINGS.taskNotifications,
  }
}

/** Read the desktop settings, treating a missing or corrupt file as defaults. */
export async function readDesktopSettings(paths: DesktopPaths): Promise<DesktopSettings> {
  try {
    return normalizeDesktopSettings(JSON.parse(await readFile(paths.settings, 'utf8')))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Atomically replace one desktop-owned UTF-8 file. */
async function atomicWrite(filename: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 })
  const temporary = `${filename}.next`
  await writeFile(temporary, content, { encoding: 'utf8', mode })
  await rename(temporary, filename)
}

/** Persist normalized desktop settings. */
export async function writeDesktopSettings(paths: DesktopPaths, value: DesktopSettings): Promise<DesktopSettings> {
  const normalized = normalizeDesktopSettings(value)
  await atomicWrite(paths.settings, `${JSON.stringify(normalized, null, 2)}\n`)
  return normalized
}

/** Return the current persona source, creating no implicit agent behavior. */
export async function readSoul(paths: DesktopPaths): Promise<string> {
  try {
    return await readFile(paths.soul, 'utf8')
  } catch {
    return ''
  }
}

function personaPatch(persona: string): string {
  if (persona.trim() === '') return '[]\n'
  const indented = persona.replace(/\r\n?/g, '\n').split('\n').map(line => `      ${line}`).join('\n')
  return `- id: system-prompt\n  config:\n    persona: |-\n${indented}\n`
}

/** Save soul.md and its dsh patch projection as one ordered operation. */
export async function writeSoul(paths: DesktopPaths, persona: string): Promise<void> {
  if (Buffer.byteLength(persona, 'utf8') > 65_536) {
    throw new Error('soul.md 超过 64 KiB 上限')
  }
  await atomicWrite(paths.soul, persona)
  await atomicWrite(paths.patch, personaPatch(persona))
}

/** Ensure every required directory and the projection of the current persona exist. */
export async function initializeDesktopFiles(paths: DesktopPaths): Promise<void> {
  await Promise.all([
    mkdir(paths.harnessHome, { recursive: true, mode: 0o700 }),
    mkdir(paths.willHome, { recursive: true, mode: 0o700 }),
    mkdir(paths.overlayRoot, { recursive: true, mode: 0o700 }),
    mkdir(paths.runtimeBin, { recursive: true, mode: 0o700 }),
  ])
  await writeSoul(paths, await readSoul(paths))
}

interface RawBalance {
  is_available?: unknown
  balance_infos?: unknown
}

function sanitizeBalances(value: unknown): BalanceInfo[] {
  if (!Array.isArray(value)) return []
  const rows: BalanceInfo[] = []
  for (const row of value) {
    if (typeof row !== 'object' || row === null) continue
    const input = row as Record<string, unknown>
    if (input.currency !== 'CNY' && input.currency !== 'USD') continue
    if (typeof input.total_balance !== 'string'
      || typeof input.granted_balance !== 'string'
      || typeof input.topped_up_balance !== 'string') continue
    rows.push({
      currency: input.currency,
      totalBalance: input.total_balance,
      grantedBalance: input.granted_balance,
      toppedUpBalance: input.topped_up_balance,
    })
  }
  return rows
}

async function storedDeepSeekKey(paths: DesktopPaths): Promise<string | undefined> {
  const inherited = process.env.DEEPSEEK_API_KEY?.trim()
  if (inherited !== undefined && inherited !== '') return inherited
  try {
    const document = yaml.load(await readFile(join(paths.harnessHome, '.credentials.yaml'), 'utf8'))
    if (typeof document !== 'object' || document === null) return undefined
    const value = (document as Record<string, unknown>).DEEPSEEK_API_KEY
    return typeof value === 'string' && value.trim() !== '' ? value : undefined
  } catch {
    return undefined
  }
}

/** Query DeepSeek's official balance endpoint without exposing the API key over IPC. */
export async function queryBalance(paths: DesktopPaths): Promise<BalanceResult> {
  const key = await storedDeepSeekKey(paths)
  if (key === undefined) return { status: 'unconfigured' }
  try {
    const response = await fetch('https://api.deepseek.com/user/balance', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return { status: 'error', message: `DeepSeek 余额接口返回 HTTP ${response.status}` }
    const payload = await response.json() as RawBalance
    return {
      status: 'ok',
      available: payload.is_available === true,
      balances: sanitizeBalances(payload.balance_infos),
    }
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) }
  }
}
