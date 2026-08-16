import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

interface DesktopManifest {
  version: string
  build: {
    productName: string
    nsis: { artifactName: string }
    portable: { artifactName: string }
    mac: {
      artifactName: string
      minimumSystemVersion: string
      target: Array<{ target: string; arch: string[] }>
    }
  }
}

describe('desktop packaging', () => {
  it('gives installer and portable targets distinct release names', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as DesktopManifest

    expect(manifest.version).toBe('0.1.3')
    expect(manifest.build.productName).toBe('Deepseek Harness Will — 组装未来')
    expect(manifest.build.nsis.artifactName).toContain('Setup')
    expect(manifest.build.portable.artifactName).toContain('Portable')
    expect(manifest.build.nsis.artifactName).not.toBe(manifest.build.portable.artifactName)
  })

  it('publishes installable DMGs for Apple Silicon and Intel Macs', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'),
    ) as DesktopManifest

    expect(manifest.build.mac.minimumSystemVersion).toBe('12.0')
    expect(manifest.build.mac.artifactName).toContain('macOS-${arch}')
    expect(manifest.build.mac.target).toContainEqual({ target: 'dmg', arch: ['arm64', 'x64'] })
  })
})
