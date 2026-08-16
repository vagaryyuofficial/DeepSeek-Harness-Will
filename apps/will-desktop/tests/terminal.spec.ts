import { describe, expect, it } from 'vitest'
import { resolveTerminalProfile } from '../src/terminal.ts'

describe('native terminal profile', () => {
  it('uses PowerShell command framing on Windows', () => {
    expect(resolveTerminalProfile('win32', {
      WILL_TERMINAL_BINARY: 'C:\\Tools\\pwsh.exe',
    })).toEqual({
      command: 'C:\\Tools\\pwsh.exe',
      args: ['-NoLogo', '-NoProfile', '-NoExit', '-Command', '-'],
      lineEnding: '\r\n',
      label: 'PowerShell',
    })
  })

  it('uses the macOS login shell with POSIX command framing', () => {
    expect(resolveTerminalProfile('darwin', { SHELL: '/bin/zsh' })).toEqual({
      command: '/bin/zsh',
      args: ['-l'],
      lineEnding: '\n',
      label: 'zsh',
    })
  })

  it('falls back to zsh when macOS does not expose SHELL', () => {
    expect(resolveTerminalProfile('darwin', {})).toEqual({
      command: '/bin/zsh',
      args: ['-l'],
      lineEnding: '\n',
      label: 'zsh',
    })
  })
})
