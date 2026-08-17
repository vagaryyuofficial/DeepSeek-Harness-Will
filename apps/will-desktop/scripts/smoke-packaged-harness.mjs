/** Start the dsh Web profile from a packaged Electron dependency tree. */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    executable: { type: 'string' },
    resources: { type: 'string' },
  },
})

if (values.executable === undefined || values.resources === undefined) {
  throw new Error('Usage: node smoke-packaged-harness.mjs --executable <path> --resources <path>')
}

const executable = resolve(values.executable)
const resources = resolve(values.resources)
const entry = join(resources, 'app.asar.unpacked', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const smokeRoot = await mkdtemp(join(tmpdir(), 'will-packaged-harness-'))
const environment = {
  ...process.env,
  DSH_HOME: join(smokeRoot, 'home'),
  DSH_TELEMETRY_DISABLED: '1',
  ELECTRON_RUN_AS_NODE: '1',
}

try {
  const version = await runToExit(executable, ['--expose-internals', entry, '--version'])
  const reportedVersion = /\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/u.exec(version.output)?.[0]
  if (version.code !== 0 || reportedVersion === undefined) {
    throw new Error(`Packaged dsh --version failed (exit ${version.code}):\n${version.output}`)
  }

  const child = spawn(executable, ['--expose-internals', entry, 'web', '--host', '127.0.0.1', '--port', '0'], {
    cwd: smokeRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  const ready = new Promise((resolve, reject) => {
    const inspect = chunk => {
      output = `${output}${chunk.toString('utf8')}`.slice(-131_072)
      const match = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u.exec(output)
      if (match?.[1] !== undefined) resolve(match[1])
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      reject(new Error(`Packaged dsh exited before readiness (code=${String(code)}, signal=${String(signal)}):\n${output}`))
    })
  })
  try {
    const url = await withTimeout(
      ready,
      60_000,
      () => new Error(`Packaged dsh did not become ready within 60 seconds:\n${output}`),
    )
    await assertWebApplication(url)
    await new Promise(resolveDelay => { setTimeout(resolveDelay, 3_000) })
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Packaged dsh exited during the stability window:\n${output}`)
    }
    await assertWebApplication(url)
    console.log(`smoke-packaged-harness: dsh ${reportedVersion} served ${url}`)
  } finally {
    await stopChild(child)
  }
} finally {
  await rm(smokeRoot, { recursive: true, force: true })
}

/** Require a successful Harness Web document, not only a printed listen URL. */
async function assertWebApplication(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) throw new Error(`Packaged dsh returned HTTP ${response.status} for ${url}`)
  const body = await response.text()
  if (!/<(?:html|!doctype html)/iu.test(body)) {
    throw new Error(`Packaged dsh did not return the Web application for ${url}`)
  }
}

/** Run one short packaged command and retain both output streams. */
async function runToExit(command, args) {
  const child = spawn(command, args, {
    cwd: smokeRoot,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let output = ''
  child.stdout.on('data', chunk => { output = `${output}${chunk.toString('utf8')}`.slice(-131_072) })
  child.stderr.on('data', chunk => { output = `${output}${chunk.toString('utf8')}`.slice(-131_072) })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', value => { resolve(value ?? 1) })
  })
  return { code, output }
}

/** Reject an operation after a bounded interval without retaining a live timer. */
async function withTimeout(operation, milliseconds, failure) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => { reject(failure()) }, milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Stop the smoke process and its Windows descendants before returning. */
async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise(resolve => { child.once('exit', resolve) })
  child.kill('SIGTERM')
  let timer
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise(resolve => {
      timer = setTimeout(() => { resolve(false) }, 5_000)
    }),
  ]).finally(() => { clearTimeout(timer) })
  if (graceful) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    })
    await new Promise(resolve => { killer.once('exit', resolve) })
  } else {
    child.kill('SIGKILL')
  }
  await exited
}
