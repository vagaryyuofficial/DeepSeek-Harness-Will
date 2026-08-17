import { describe, expect, it } from 'vitest'
import { dshNodeArguments } from '../src/harness.ts'

describe('dsh Node launch arguments', () => {
  it('enables internal loader access before the Web entry script', () => {
    expect(dshNodeArguments('/runtime/dsh/lib/bin.js', [
      'web', '--host', '127.0.0.1', '--port', '0',
    ])).toEqual([
      '--expose-internals',
      '/runtime/dsh/lib/bin.js',
      'web', '--host', '127.0.0.1', '--port', '0',
    ])
  })

  it('uses the same Node option ordering for non-interactive commands', () => {
    expect(dshNodeArguments('/overlay/dsh/lib/bin.js', [
      'plugin', '--profile', 'web', 'add', '@scope/example',
    ])).toEqual([
      '--expose-internals',
      '/overlay/dsh/lib/bin.js',
      'plugin', '--profile', 'web', 'add', '@scope/example',
    ])
  })
})
