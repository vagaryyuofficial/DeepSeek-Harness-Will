import { describe, expect, it } from 'vitest'
import {
  NATIVE_THEME_ID, WILL_THEMES, WILL_THEME_TOKEN_NAMES, resolveWillTheme,
} from '../src/theme-catalog.ts'

describe('Will theme catalog', () => {
  it('ships ten unique opt-in themes and keeps native outside the override catalog', () => {
    const ids = WILL_THEMES.map(theme => theme.id)
    expect(ids).toHaveLength(10)
    expect(new Set(ids).size).toBe(10)
    expect(ids).not.toContain(NATIVE_THEME_ID)
    expect(resolveWillTheme(NATIVE_THEME_ID)).toBeUndefined()
  })

  it('tracks every CSS token so native mode can remove all overrides', () => {
    const actual = new Set(WILL_THEMES.flatMap(theme => Object.keys(theme.tokens)))
    expect(new Set(WILL_THEME_TOKEN_NAMES)).toEqual(actual)
    expect(WILL_THEMES.every(theme => theme.tokens['--dsw-alias-brand-primary'] !== undefined)).toBe(true)
  })

  it('does not resolve untrusted or unknown identifiers', () => {
    expect(resolveWillTheme('windows-xp')?.label).toBe('Windows XP')
    expect(resolveWillTheme('not-a-theme')).toBeUndefined()
    expect(resolveWillTheme({ id: 'windows-xp' })).toBeUndefined()
  })
})
