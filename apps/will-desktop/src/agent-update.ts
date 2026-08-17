/** Transactional npm overlay updates for the official dsh agent package. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { app } from 'electron'
import type { OperationStatus } from './contracts.ts'
import type { HarnessProcess } from './harness.ts'
import type { DesktopPaths } from './store.ts'

interface RuntimeLayout {
  node: string
  npmCli: string
  bin: string
}

interface UpdateLaunch {
  command: string
  args: string[]
  pathPrefix: string
}

interface UpdateLaunches {
  install: UpdateLaunch
  verify: UpdateLaunch
}

function bundledRuntimeLayout(resourcesPath: string, platform: NodeJS.Platform): RuntimeLayout {
  const root = join(resourcesPath, 'runtime', 'node')
  return platform === 'win32'
    ? {
      node: join(root, 'node.exe'),
      npmCli: join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      bin: root,
    }
    : {
      node: join(root, 'bin', 'node'),
      npmCli: join(root, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      bin: join(root, 'bin'),
    }
}

function standaloneNode(
  layout: RuntimeLayout,
  environment: NodeJS.ProcessEnv,
  fileExists: (path: string) => boolean,
): string {
  const explicit = environment.WILL_NODE_BINARY
  if (explicit !== undefined && fileExists(explicit)) return explicit
  if (fileExists(layout.node)) return layout.node
  return 'node'
}

function npmCliScript(
  layout: RuntimeLayout,
  node: string,
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  fileExists: (path: string) => boolean,
): string {
  const explicit = environment.WILL_NPM_BINARY
  if (explicit !== undefined && fileExists(explicit)) {
    if (platform !== 'win32' || !explicit.toLowerCase().endsWith('.cmd')) return explicit
    const adjacent = join(dirname(explicit), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (fileExists(adjacent)) return adjacent
  }
  if (fileExists(layout.npmCli)) return layout.npmCli

  if (node !== 'node') {
    const root = platform === 'win32' ? dirname(node) : dirname(dirname(node))
    const adjacent = platform === 'win32'
      ? join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : join(root, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (fileExists(adjacent)) return adjacent
  }

  for (const bin of (environment.PATH ?? '').split(delimiter).filter(Boolean)) {
    const adjacent = platform === 'win32'
      ? join(bin, 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : join(dirname(bin), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (fileExists(adjacent)) return adjacent
    const npm = join(bin, platform === 'win32' ? 'npm-cli.js' : 'npm')
    if (fileExists(npm)) return npm
  }
  throw new Error(`未找到可由独立 Node 执行的 npm CLI：${layout.npmCli}`)
}

/**
 * Resolve the standalone Node launch vectors used to install and verify an agent overlay.
 * @param staging isolated overlay staging directory.
 * @param platform target operating system.
 * @param resourcesPath Electron resources directory.
 * @param environment launch environment and optional runtime overrides.
 * @param fileExists filesystem probe used while resolving the packaged toolchain.
 * @returns npm-install and dsh-verification commands with Node before each JavaScript entry.
 */
export function resolveAgentUpdateLaunches(
  staging: string,
  platform: NodeJS.Platform = process.platform,
  resourcesPath: string = process.resourcesPath,
  environment: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): UpdateLaunches {
  const layout = bundledRuntimeLayout(resourcesPath, platform)
  const node = standaloneNode(layout, environment, fileExists)
  const npmCli = npmCliScript(layout, node, platform, environment, fileExists)
  const pathPrefix = node === 'node' ? layout.bin : dirname(node)
  const entry = join(staging, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return {
    install: {
      command: node,
      args: [
        npmCli,
        'install',
        '--prefix', staging,
        '--no-package-lock',
        '--omit=dev',
        '--no-audit',
        '--no-fund',
        '@deepseek-ai/dsh@latest',
      ],
      pathPrefix,
    },
    verify: {
      command: node,
      args: ['--expose-internals', entry, '--version'],
      pathPrefix,
    },
  }
}

async function run(
  command: string,
  args: readonly string[],
  cwd: string,
  pathPrefix: string,
): Promise<{ code: number; output: string }> {
  const currentPath = process.env.PATH
  const child = spawn(command, [...args], {
    cwd,
    env: {
      ...process.env,
      PATH: currentPath === undefined || currentPath === ''
        ? pathPrefix
        : `${pathPrefix}${delimiter}${currentPath}`,
    },
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
    const launches = resolveAgentUpdateLaunches(staging)
    const install = await run(
      launches.install.command,
      launches.install.args,
      paths.overlayRoot,
      launches.install.pathPrefix,
    )
    if (install.code !== 0) throw new Error(`npm 更新失败（exit ${install.code}）\n${install.output}`)
    const verify = await run(
      launches.verify.command,
      launches.verify.args,
      staging,
      launches.verify.pathPrefix,
    )
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
  const layout = bundledRuntimeLayout(process.resourcesPath, process.platform)
  return existsSync(layout.node) && existsSync(layout.npmCli)
}
