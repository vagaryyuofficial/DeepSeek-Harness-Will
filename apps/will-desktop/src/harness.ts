/** Child-process owner for the official dsh Web profile. */

import { spawn, type ChildProcess } from 'node:child_process'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import type { OperationStatus } from './contracts.ts'
import type { DesktopPaths } from './store.ts'

const require = createRequire(import.meta.url)
const READY_PATTERN = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u

interface LaunchSpec {
  command: string
  entry: string
  electronAsNode: boolean
}

function bundledDependencyManifest(packageName: string): string {
  const unpacked = join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    ...packageName.split('/'),
    'package.json',
  )
  if (existsSync(unpacked)) return unpacked
  return packageName === 'pnpm' ? require.resolve('pnpm') : require.resolve(`${packageName}/package.json`)
}

/**
 * Build the Node argv for a dsh invocation with internal ESM loader access enabled before the entry script.
 * @param entry absolute dsh entry-script path.
 * @param args dsh command arguments.
 * @returns arguments in Node-option, entry-script, command order.
 */
export function dshNodeArguments(entry: string, args: readonly string[]): string[] {
  return ['--expose-internals', entry, ...args]
}

/** Own exactly one dsh child and wait for exit during every restart or shutdown. */
export class HarnessProcess {
  private child: ChildProcess | undefined
  private stopping: Promise<void> | undefined
  private readonly expectedStops = new WeakSet<ChildProcess>()
  private readonly paths: DesktopPaths
  private readonly status: (status: OperationStatus) => void
  private readonly workingDirectory: string

  /**
   * @param paths desktop-owned runtime and data paths.
   * @param status operation observer.
   * @param workingDirectory stable user directory used instead of the launcher-inherited cwd.
   */
  constructor(paths: DesktopPaths, status: (status: OperationStatus) => void, workingDirectory: string) {
    this.paths = paths
    this.status = status
    this.workingDirectory = workingDirectory
  }

  /** Read the version of the active overlay or bundled CLI. */
  async activeVersion(): Promise<string> {
    const manifest = this.activeManifest()
    try {
      const value = JSON.parse(await readFile(manifest, 'utf8')) as { version?: unknown }
      return typeof value.version === 'string' ? value.version : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /** Read the version shipped with the desktop application. */
  async bundledVersion(): Promise<string> {
    try {
      const value = JSON.parse(await readFile(this.bundledManifest(), 'utf8')) as { version?: unknown }
      return typeof value.version === 'string' ? value.version : 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /** Start dsh and resolve only after the loopback URL is ready. */
  async start(): Promise<string> {
    if (this.child !== undefined) throw new Error('DeepSeek Harness 已在运行')
    this.status({ kind: 'starting', message: '正在启动 DeepSeek Harness…' })
    const spec = this.launchSpec()
    const runtimeBin = await this.preparePnpmShim(spec.command, spec.electronAsNode)
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_HOME: this.paths.harnessHome,
      DSH_WILL_DESKTOP: '1',
      PATH: `${runtimeBin}${delimiter}${process.env.PATH ?? ''}`,
      ...(spec.electronAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
    }
    const args = dshNodeArguments(
      spec.entry,
      ['web', '--patch', this.paths.patch, '--host', '127.0.0.1', '--port', '0'],
    )
    const child = spawn(spec.command, args, {
      cwd: this.workingDirectory,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    return await new Promise<string>((resolve, reject) => {
      let stderr = ''
      let stdout = ''
      let settled = false
      const finish = (error?: Error, url?: string): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        if (error !== undefined) {
          this.status({ kind: 'error', message: error.message })
          reject(error)
        } else if (url !== undefined) {
          this.status({ kind: 'ready', message: 'DeepSeek Harness 已就绪' })
          resolve(url)
        }
      }
      const inspect = (): void => {
        const match = READY_PATTERN.exec(stdout)
        if (match?.[1] !== undefined) finish(undefined, match[1])
      }
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = `${stdout}${chunk.toString('utf8')}`.slice(-32_768)
        inspect()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString('utf8')}`.slice(-32_768)
      })
      child.once('error', (error) => { finish(error) })
      child.once('exit', (code, signal) => {
        const expected = this.expectedStops.has(child)
        this.child = undefined
        if (!settled) {
          finish(new Error(`DeepSeek Harness 启动失败（code=${String(code)}, signal=${String(signal)}）\n${stderr.trim()}`))
        } else if (!expected) {
          this.status({ kind: 'error', message: `DeepSeek Harness 已退出（code=${String(code)}）` })
        }
      })
      const timeout = setTimeout(() => {
        finish(new Error(`DeepSeek Harness 在 90 秒内没有就绪\n${stderr.trim()}`))
        void this.stop()
      }, 90_000)
    })
  }

  /** Stop the complete child process and wait for quiescence. */
  async stop(): Promise<void> {
    if (this.stopping !== undefined) {
      await this.stopping
      return
    }
    const child = this.child
    if (child === undefined) return
    this.expectedStops.add(child)
    this.stopping = this.stopChild(child).finally(() => {
      this.expectedStops.delete(child)
      this.stopping = undefined
      if (this.child === child) this.child = undefined
    })
    await this.stopping
  }

  /** Restart the same profile after a plugin or agent update. */
  async restart(): Promise<string> {
    await this.stop()
    return await this.start()
  }

  /** Run a non-interactive dsh command against the same home and toolchain. */
  async run(args: readonly string[]): Promise<{ code: number; output: string }> {
    const spec = this.launchSpec()
    const runtimeBin = await this.preparePnpmShim(spec.command, spec.electronAsNode)
    const child = spawn(spec.command, dshNodeArguments(spec.entry, args), {
      cwd: this.workingDirectory,
      env: {
        ...process.env,
        DSH_HOME: this.paths.harnessHome,
        PATH: `${runtimeBin}${delimiter}${process.env.PATH ?? ''}`,
        ...(spec.electronAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
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

  private activeManifest(): string {
    const overlay = join(this.paths.overlayCurrent, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
    return existsSync(overlay) ? overlay : this.bundledManifest()
  }

  private bundledManifest(): string {
    return bundledDependencyManifest('@deepseek-ai/dsh')
  }

  private launchSpec(): LaunchSpec {
    const overlayEntry = join(this.paths.overlayCurrent, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (existsSync(overlayEntry)) {
      return { command: this.standaloneNode(), entry: overlayEntry, electronAsNode: false }
    }
    return {
      command: process.execPath,
      entry: join(dirname(this.bundledManifest()), 'lib', 'bin.js'),
      electronAsNode: true,
    }
  }

  private standaloneNode(): string {
    const explicit = process.env.WILL_NODE_BINARY
    if (explicit !== undefined && existsSync(explicit)) return explicit
    const windows = join(process.resourcesPath, 'runtime', 'node', 'node.exe')
    if (process.platform === 'win32' && existsSync(windows)) return windows
    const posix = join(process.resourcesPath, 'runtime', 'node', 'bin', 'node')
    if (existsSync(posix)) return posix
    return 'node'
  }

  private async preparePnpmShim(nodeBinary: string, electronAsNode: boolean): Promise<string> {
    await mkdir(this.paths.runtimeBin, { recursive: true, mode: 0o700 })
    const pnpmCli = join(dirname(bundledDependencyManifest('pnpm')), 'bin', 'pnpm.mjs')
    if (process.platform === 'win32') {
      const shim = join(this.paths.runtimeBin, 'pnpm.cmd')
      const content = `@echo off\r\n${electronAsNode ? 'set ELECTRON_RUN_AS_NODE=1\r\n' : ''}\"${nodeBinary}\" \"${pnpmCli}\" %*\r\n`
      await writeFile(shim, content, 'utf8')
    } else {
      const shim = join(this.paths.runtimeBin, 'pnpm')
      const prefix = electronAsNode ? 'ELECTRON_RUN_AS_NODE=1 ' : ''
      await writeFile(shim, `#!/bin/sh\nexec env ${prefix}\"${nodeBinary}\" \"${pnpmCli}\" \"$@\"\n`, 'utf8')
      await chmod(shim, 0o700)
    }
    return this.paths.runtimeBin
  }

  private async stopChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>((resolve) => { child.once('exit', () => { resolve() }) })
    child.kill('SIGTERM')
    let timer: NodeJS.Timeout | undefined
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise<boolean>((resolve) => { timer = setTimeout(() => { resolve(false) }, 8_000) }),
    ]).finally(() => { clearTimeout(timer) })
    if (graceful) return
    if (process.platform === 'win32' && child.pid !== undefined) {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' })
      await new Promise<void>((resolve) => { killer.once('exit', () => { resolve() }) })
    } else {
      child.kill('SIGKILL')
    }
    await exited
  }
}
