/** One desktop-owned PowerShell process whose lifetime is independent of the Web page. */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface TerminalSnapshot {
  cwd: string
  output: string
  running: boolean
}

function powershellCommand(): string {
  const explicit = process.env.WILL_POWERSHELL_BINARY?.trim()
  if (explicit !== undefined && explicit !== '') return explicit
  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot?.trim()
    if (systemRoot !== undefined && systemRoot !== '') {
      const bundled = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      if (existsSync(bundled)) return bundled
    }
    return 'powershell.exe'
  }
  return 'pwsh'
}

/** Keep a bounded replay buffer so a reloaded renderer can reconnect without restarting the shell. */
export class PersistentTerminal {
  private child: ChildProcessWithoutNullStreams | undefined
  private output = ''
  private stopping: Promise<void> | undefined

  /** @param cwd project directory inherited by PowerShell. @param onData live output observer. */
  constructor(
    private readonly cwd: string,
    private readonly onData: (text: string) => void,
  ) {}

  /** Start lazily and return the replayable terminal state. */
  async snapshot(): Promise<TerminalSnapshot> {
    await this.ensureStarted()
    return { cwd: this.cwd, output: this.output, running: this.child !== undefined }
  }

  /** Send one bounded command line to the persistent process. */
  async write(command: string): Promise<void> {
    if (Buffer.byteLength(command, 'utf8') > 8_192) throw new Error('终端命令超过 8 KiB 上限')
    await this.ensureStarted()
    if (this.child === undefined) throw new Error('PowerShell 未运行')
    this.child.stdin.write(`${command.replace(/\r?\n$/u, '')}\r\n`)
  }

  /** Stop the process and wait for its exit. A later snapshot starts a fresh shell. */
  async stop(): Promise<void> {
    if (this.stopping !== undefined) {
      await this.stopping
      return
    }
    const child = this.child
    if (child === undefined) return
    this.child = undefined
    this.stopping = new Promise<void>((resolve) => {
      child.once('exit', () => { resolve() })
      child.kill()
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, 3_000).unref()
    }).finally(() => { this.stopping = undefined })
    await this.stopping
  }

  private append(text: string): void {
    this.output = `${this.output}${text}`.slice(-131_072)
    this.onData(text)
  }

  private async ensureStarted(): Promise<void> {
    if (this.child !== undefined) return
    await this.stopping
    const command = powershellCommand()
    const child = spawn(command, ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'], {
      cwd: this.cwd,
      env: { ...process.env },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child = child
    child.stdout.on('data', (chunk: Buffer) => { this.append(chunk.toString('utf8')) })
    child.stderr.on('data', (chunk: Buffer) => { this.append(chunk.toString('utf8')) })
    child.once('error', (error) => {
      if (this.child === child) this.child = undefined
      this.append(`\r\n[Will terminal] ${error.message}\r\n`)
    })
    child.once('exit', (code, signal) => {
      if (this.child === child) this.child = undefined
      this.append(`\r\n[Will terminal exited: code=${String(code)}, signal=${String(signal)}]\r\n`)
    })
  }
}
