import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  desktopPaths, initializeDesktopFiles, normalizeDesktopSettings, readDesktopSettings,
  readSoul, writeDesktopSettings, writeSoul,
} from '../src/store.ts'

const roots: string[] = []

async function isolatedPaths() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-will-store-'))
  roots.push(root)
  return desktopPaths(root)
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Will desktop store', () => {
  it('normalizes corrupt and unknown settings to the native upstream experience', () => {
    expect(normalizeDesktopSettings(null)).toEqual({
      theme: 'native', closeToTray: true, taskNotifications: true,
    })
    expect(normalizeDesktopSettings({
      theme: 'unknown', closeToTray: false, taskNotifications: 'yes', ignored: true,
    })).toEqual({ theme: 'native', closeToTray: false, taskNotifications: true })
  })

  it('persists only normalized settings', async () => {
    const paths = await isolatedPaths()
    await writeDesktopSettings(paths, {
      theme: 'aurora', closeToTray: false, taskNotifications: false,
    })
    await expect(readDesktopSettings(paths)).resolves.toEqual({
      theme: 'aurora', closeToTray: false, taskNotifications: false,
    })
  })

  it('projects soul.md into an owned dsh patch without touching upstream profile files', async () => {
    const paths = await isolatedPaths()
    await initializeDesktopFiles(paths)
    await writeSoul(paths, 'You are calm.\nExplain trade-offs.')

    await expect(readSoul(paths)).resolves.toBe('You are calm.\nExplain trade-offs.')
    await expect(readFile(paths.patch, 'utf8')).resolves.toBe([
      '- id: system-prompt',
      '  config:',
      '    persona: |-',
      '      You are calm.',
      '      Explain trade-offs.',
      '',
    ].join('\n'))
    await expect(writeSoul(paths, 'x'.repeat(65_537))).rejects.toThrow(/64 KiB/)
  })

  it('uses an empty patch for a blank persona', async () => {
    const paths = await isolatedPaths()
    await writeSoul(paths, '   ')
    await expect(readFile(paths.patch, 'utf8')).resolves.toBe('[]\n')
  })
})
