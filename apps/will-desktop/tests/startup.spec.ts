import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const mainPath = resolve(import.meta.dirname, '../src/main.ts')
const mainSource = readFileSync(mainPath, 'utf8')
const mainFile = ts.createSourceFile(mainPath, mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

function topLevelAwaitOffsets(): number[] {
  const offsets: number[] = []
  const visit = (node: ts.Node, functionDepth: number): void => {
    if (ts.isAwaitExpression(node) && functionDepth === 0) offsets.push(node.getStart(mainFile))
    const childDepth = ts.isFunctionLike(node) ? functionDepth + 1 : functionDepth
    node.forEachChild((child) => { visit(child, childDepth) })
  }
  mainFile.forEachChild((node) => { visit(node, 0) })
  return offsets
}

describe('desktop main-process startup', () => {
  it('does not await Electron readiness while the ESM entry module is evaluating', () => {
    expect(topLevelAwaitOffsets()).toEqual([])
    expect(mainSource).toContain('async function boot(): Promise<void>')
    expect(mainSource).toContain('void boot().catch(reportFatalStartupError)')
  })

  it('exits a second instance without continuing its bootstrap', () => {
    expect(mainSource).toMatch(
      /if \(!app\.requestSingleInstanceLock\(\)\) \{\s*app\.exit\(0\)\s*return\s*\}/u,
    )
  })

  it('persists and surfaces fatal startup errors before exiting nonzero', () => {
    expect(mainSource).toContain('appendFile(logPath')
    expect(mainSource).toContain("'startup-error.log'")
    expect(mainSource).toContain('dialog.showErrorBox(')
    expect(mainSource).toContain('app.exit(1)')
  })
})
