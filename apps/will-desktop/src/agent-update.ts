/** Transactional npm overlay updates for the official dsh agent package. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { OperationStatus } from './contracts.ts'
import type { HarnessProcess } from './harness.ts'
import type { DesktopPaths } from './store.ts'

function standaloneNode(): string {
  const explicit = process.env.WILL_NODE_BINARY
  if (explicit !== undefined && existsSync(explicit)) return explicit
  const windows = join(process.resourcesPath, 'runtime', 'node', 'node.exe')
  if (process.platform === 'win32' && existsSync(windows)) return windows
  const posix = join(process.resourcesPath, 'runtime', 'node', 'bin', 'node')
  if (existsSync(posix)) return posix
  return 'node'
}

function npmCommand(): string {
  const explicit = process.env.WILL_NPM_BINARY
  if (explicit !== undefined && existsSync(explicit)) return explicit
  const windows = join(process.resourcesPath, 'runtime', 'node', 'npm.cmd')
  if (process.platform === 'win32' && existsSync(windows)) return windows
  const posix = join(process.resourcesPath, 'runtime', 'node', 'bin', 'npm')
  if (existsSync(posix)) return posix
  return 'npm'
}

async function run(command: string, args: readonly string[], cwd: string): Promise<{ code: number; output: string }> {
  const child = spawn(command, [...args], {
    cwd,
    env: { ...process.env },
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.cmd'),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString('utf8')}`.slice(-65_536) })
  child.stderr.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString('utf8')}`.slice(-65_536) })
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (value) => { resolve(value ?? 1) })
  })
  return { code, output: output.trim() }
}

async function installedVersion(directory: string): Promise<string> {
  const manifest = join(directory, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
  const value = JSON.parse(await readFile(manifest, 'utf8')) as { version?: unknown }
  if (typeof value.version !== 'string') throw new Error('更新包缺少有效版本号')
  return value.version
}

/**
 * Install `@deepseek-ai/dsh@latest` into a staging directory, verify its CLI,
 * then atomically rotate current/previous overlays. A failed restart restores
 * the previous overlay before returning the error.
 */
export async function updateAgentOverlay(
  paths: DesktopPaths,
  harness: HarnessProcess,
  status: (status: OperationStatus) => void,
): Promise<{ version: string; url: string }> {
  status({ kind: 'updating-agent', message: '正在下载官方 DeepSeek Harness 更新…' })
  await mkdir(paths.overlayRoot, { recursive: true, mode: 0o700 })
  const staging = await mkdtemp(join(paths.overlayRoot, 'staging-'))
  let rotated = false
  try {
    const install = await run(npmCommand(), [
      'install',
      '--prefix', staging,
      '--no-package-lock',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '@deepseek-ai/dsh@latest',
    ], paths.overlayRoot)
    if (install.code !== 0) throw new Error(`npm 更新失败（exit ${install.code}）\n${install.output}`)
    const entry = join(staging, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    const verify = await run(standaloneNode(), [entry, '--version'], staging)
    if (verify.code !== 0) throw new Error(`新 agent 自检失败（exit ${verify.code}）\n${verify.output}`)
    const version = await installedVersion(staging)

    await harness.stop()
    await rm(paths.overlayPrevious, { recursive: true, force: true })
    if (existsSync(paths.overlayCurrent)) await rename(paths.overlayCurrent, paths.overlayPrevious)
    await rename(staging, paths.overlayCurrent)
    rotated = true
    try {
      const url = await harness.start()
      status({ kind: 'ready', message: `官方 agent 已更新至 ${version}` })
      return { version, url }
    } catch (error) {
      await harness.stop()
      await rm(paths.overlayCurrent, { recursive: true, force: true })
      if (existsSync(paths.overlayPrevious)) await rename(paths.overlayPrevious, paths.overlayCurrent)
      const rollbackUrl = await harness.start()
      status({ kind: 'error', message: '新 agent 启动失败，已回退上一版本' })
      void rollbackUrl
      throw error
    }
  } finally {
    if (!rotated) await rm(staging, { recursive: true, force: true })
  }
}

/** Whether this build carries the standalone Node/npm distribution used by packaged updates. */
export function hasBundledNodeRuntime(): boolean {
  if (!app.isPackaged) return true
  return existsSync(process.platform === 'win32'
    ? join(process.resourcesPath, 'runtime', 'node', 'node.exe')
    : join(process.resourcesPath, 'runtime', 'node', 'bin', 'node'))
}
