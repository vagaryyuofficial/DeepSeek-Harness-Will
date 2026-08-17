import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))

import { resolveAgentUpdateLaunches } from '../src/agent-update.ts'

describe('agent overlay update launches', () => {
  it('executes the bundled macOS npm CLI with standalone Node outside Finder PATH', () => {
    const resources = join('fixture-root', 'Will.app', 'Contents', 'Resources')
    const runtime = join(resources, 'runtime', 'node')
    const node = join(runtime, 'bin', 'node')
    const npmCli = join(runtime, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    const staging = join('fixture-root', 'data', 'Will', 'staging-test')
    const files = new Set([node, npmCli])

    const launches = resolveAgentUpdateLaunches(
      staging,
      'darwin',
      resources,
      { PATH: '/usr/bin:/bin' },
      path => files.has(path),
    )

    expect(launches.install).toEqual({
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
      pathPrefix: join(runtime, 'bin'),
    })
    expect(launches.install.command).not.toBe(join(runtime, 'bin', 'npm'))
    expect(launches.verify).toEqual({
      command: node,
      args: [
        '--expose-internals',
        join(staging, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
        '--version',
      ],
      pathPrefix: join(runtime, 'bin'),
    })
  })

  it('uses the bundled Windows node.exe and npm-cli.js without a cmd shell', () => {
    const resources = join('fixture-root', 'Will', 'resources')
    const runtime = join(resources, 'runtime', 'node')
    const node = join(runtime, 'node.exe')
    const npmCli = join(runtime, 'node_modules', 'npm', 'bin', 'npm-cli.js')
    const staging = join('fixture-root', 'data', 'Will', 'staging-test')
    const files = new Set([node, npmCli])

    const launches = resolveAgentUpdateLaunches(
      staging,
      'win32',
      resources,
      { PATH: 'C:\\Windows\\System32' },
      path => files.has(path),
    )

    expect(launches.install.command).toBe(node)
    expect(launches.install.args[0]).toBe(npmCli)
    expect(launches.install.args.slice(1)).toEqual([
      'install',
      '--prefix', staging,
      '--no-package-lock',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '@deepseek-ai/dsh@latest',
    ])
    expect(launches.install.pathPrefix).toBe(runtime)
    expect(launches.verify).toEqual({
      command: node,
      args: [
        '--expose-internals',
        join(staging, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
        '--version',
      ],
      pathPrefix: runtime,
    })
  })
})
