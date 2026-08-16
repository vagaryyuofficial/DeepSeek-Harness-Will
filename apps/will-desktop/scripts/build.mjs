import { build } from 'esbuild'

const shared = {
  bundle: true,
  logLevel: 'info',
  platform: 'node',
  sourcemap: true,
  target: 'node24',
}

await Promise.all([
  build({
    ...shared,
    entryPoints: ['src/main.ts'],
    external: ['electron', 'electron-updater', '@deepseek-ai/dsh', 'pnpm'],
    format: 'esm',
    outfile: 'dist/main.js',
  }),
  build({
    ...shared,
    entryPoints: ['src/preload.ts'],
    external: ['electron'],
    format: 'cjs',
    outfile: 'dist/preload.cjs',
  }),
])
