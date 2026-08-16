import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface DesktopManifest {
  version: string
  build: {
    nsis: { artifactName: string }
    portable: { artifactName: string }
  }
}

describe('Windows packaging', () => {
  it('gives installer and portable targets distinct release names', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as DesktopManifest

    expect(manifest.version).toBe('0.1.1')
    expect(manifest.build.nsis.artifactName).toContain('Setup')
    expect(manifest.build.portable.artifactName).toContain('Portable')
    expect(manifest.build.nsis.artifactName).not.toBe(manifest.build.portable.artifactName)
  })
})
