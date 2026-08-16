/** One opt-in Will palette applied over the official DeepSeek Harness tokens. */
export interface WillTheme {
  /** Stable persistence id. */
  id: string
  /** Chinese display name. */
  label: string
  /** Short visual description. */
  description: string
  /** CSS custom properties written inline on the document root. */
  tokens: Readonly<Record<string, string>>
}

/** The native option removes every Will override and preserves the upstream UI. */
export const NATIVE_THEME_ID = 'native'

/** Ten opt-in palettes requested by the Will desktop distribution. */
export const WILL_THEMES: readonly WillTheme[] = Object.freeze([
  {
    id: 'windows-xp',
    label: 'Windows XP',
    description: '蓝天、草地与经典任务栏蓝',
    tokens: {
      '--dsw-alias-bg-base': '#ece9d8',
      '--dsw-alias-bg-layer-1': '#f7f5ea',
      '--dsw-alias-bg-layer-2': '#dfe8f6',
      '--dsw-alias-bg-overlay': '#ffffff',
      '--dsw-alias-border-l1': '#7f9db9',
      '--dsw-alias-border-l2': '#3c7fb1',
      '--dsw-alias-brand-primary': '#245edb',
      '--dsw-alias-label-primary': '#0b1f33',
      '--dsw-alias-label-secondary': '#33506b',
      '--dsw-specific-sidebar-fill': '#d6e7ff',
    },
  },
  {
    id: 'qq98',
    label: 'QQ98',
    description: '银灰面板与复古网络蓝',
    tokens: {
      '--dsw-alias-bg-base': '#c8ced5',
      '--dsw-alias-bg-layer-1': '#eef1f4',
      '--dsw-alias-bg-layer-2': '#d7dde4',
      '--dsw-alias-bg-overlay': '#f8fafc',
      '--dsw-alias-border-l1': '#697785',
      '--dsw-alias-border-l2': '#2c3e50',
      '--dsw-alias-brand-primary': '#0086d1',
      '--dsw-alias-label-primary': '#15202a',
      '--dsw-alias-label-secondary': '#43515d',
      '--dsw-specific-sidebar-fill': '#b8c6d4',
    },
  },
  {
    id: 'miku-future',
    label: '初音未来',
    description: '青绿色声波与柔和深灰',
    tokens: {
      '--dsw-alias-bg-base': '#101b22',
      '--dsw-alias-bg-layer-1': '#17262e',
      '--dsw-alias-bg-layer-2': '#1e333b',
      '--dsw-alias-bg-overlay': '#203840',
      '--dsw-alias-border-l1': '#2d6f73',
      '--dsw-alias-border-l2': '#39c5bb',
      '--dsw-alias-brand-primary': '#39c5bb',
      '--dsw-alias-label-primary': '#e5fffc',
      '--dsw-alias-label-secondary': '#9bd9d4',
      '--dsw-specific-sidebar-fill': '#0d252a',
    },
  },
  {
    id: 'minecraft',
    label: '我的世界',
    description: '草方块绿与石材灰',
    tokens: {
      '--dsw-alias-bg-base': '#20251f',
      '--dsw-alias-bg-layer-1': '#30372d',
      '--dsw-alias-bg-layer-2': '#424a3d',
      '--dsw-alias-bg-overlay': '#4f5849',
      '--dsw-alias-border-l1': '#626b5b',
      '--dsw-alias-border-l2': '#8bad5b',
      '--dsw-alias-brand-primary': '#62a83b',
      '--dsw-alias-label-primary': '#f3f4e8',
      '--dsw-alias-label-secondary': '#c1c9ab',
      '--dsw-specific-sidebar-fill': '#293524',
    },
  },
  {
    id: 'tonghuashun',
    label: '同花顺',
    description: '行情黑底、红涨绿跌',
    tokens: {
      '--dsw-alias-bg-base': '#090909',
      '--dsw-alias-bg-layer-1': '#141414',
      '--dsw-alias-bg-layer-2': '#202020',
      '--dsw-alias-bg-overlay': '#242424',
      '--dsw-alias-border-l1': '#393939',
      '--dsw-alias-border-l2': '#6a4a22',
      '--dsw-alias-brand-primary': '#ff3b30',
      '--dsw-alias-label-primary': '#fff2c2',
      '--dsw-alias-label-secondary': '#c9b678',
      '--dsw-specific-sidebar-fill': '#101010',
      '--dsw-alias-state-success-primary': '#00c853',
    },
  },
  {
    id: 'whale-song',
    label: '鲸歌',
    description: '深海蓝与鲸鸣微光',
    tokens: {
      '--dsw-alias-bg-base': '#061421',
      '--dsw-alias-bg-layer-1': '#0b2234',
      '--dsw-alias-bg-layer-2': '#113149',
      '--dsw-alias-bg-overlay': '#143c56',
      '--dsw-alias-border-l1': '#1b4d68',
      '--dsw-alias-border-l2': '#2d718e',
      '--dsw-alias-brand-primary': '#61dafb',
      '--dsw-alias-label-primary': '#e8f8ff',
      '--dsw-alias-label-secondary': '#8dc6d9',
      '--dsw-specific-sidebar-fill': '#071c2d',
    },
  },
  {
    id: 'dunhuang',
    label: '敦煌',
    description: '矿物青、赭石与鎏金',
    tokens: {
      '--dsw-alias-bg-base': '#251b19',
      '--dsw-alias-bg-layer-1': '#352522',
      '--dsw-alias-bg-layer-2': '#47312a',
      '--dsw-alias-bg-overlay': '#543b31',
      '--dsw-alias-border-l1': '#72503f',
      '--dsw-alias-border-l2': '#a77946',
      '--dsw-alias-brand-primary': '#d4a84b',
      '--dsw-alias-label-primary': '#f4e4bd',
      '--dsw-alias-label-secondary': '#c5a978',
      '--dsw-specific-sidebar-fill': '#20312e',
    },
  },
  {
    id: 'cyber-neon',
    label: '赛博霓虹',
    description: '紫蓝夜色与洋红电光',
    tokens: {
      '--dsw-alias-bg-base': '#090515',
      '--dsw-alias-bg-layer-1': '#151027',
      '--dsw-alias-bg-layer-2': '#21163a',
      '--dsw-alias-bg-overlay': '#2d1c4b',
      '--dsw-alias-border-l1': '#4d2a72',
      '--dsw-alias-border-l2': '#8d43b5',
      '--dsw-alias-brand-primary': '#ff4fd8',
      '--dsw-alias-label-primary': '#f8efff',
      '--dsw-alias-label-secondary': '#bca6d9',
      '--dsw-specific-sidebar-fill': '#100923',
    },
  },
  {
    id: 'paper-minimal',
    label: '极简纸张',
    description: '暖白纸面与石墨线条',
    tokens: {
      '--dsw-alias-bg-base': '#f4f0e8',
      '--dsw-alias-bg-layer-1': '#fffdf8',
      '--dsw-alias-bg-layer-2': '#ebe5da',
      '--dsw-alias-bg-overlay': '#ffffff',
      '--dsw-alias-border-l1': '#d6cec0',
      '--dsw-alias-border-l2': '#a79e90',
      '--dsw-alias-brand-primary': '#4c6b57',
      '--dsw-alias-label-primary': '#292724',
      '--dsw-alias-label-secondary': '#6f6960',
      '--dsw-specific-sidebar-fill': '#eee8dd',
    },
  },
  {
    id: 'aurora',
    label: '极光',
    description: '午夜蓝与北境绿光',
    tokens: {
      '--dsw-alias-bg-base': '#07131d',
      '--dsw-alias-bg-layer-1': '#0e2230',
      '--dsw-alias-bg-layer-2': '#173544',
      '--dsw-alias-bg-overlay': '#1c4252',
      '--dsw-alias-border-l1': '#28596a',
      '--dsw-alias-border-l2': '#43a887',
      '--dsw-alias-brand-primary': '#62f0b5',
      '--dsw-alias-label-primary': '#edfff8',
      '--dsw-alias-label-secondary': '#a0d9c7',
      '--dsw-specific-sidebar-fill': '#0a1b28',
    },
  },
])

/** Every variable a Will theme can write, used to restore the native UI exactly. */
export const WILL_THEME_TOKEN_NAMES: readonly string[] = Object.freeze([
  ...new Set(WILL_THEMES.flatMap(theme => Object.keys(theme.tokens))),
])

/** Resolve one persisted theme id, falling back to the native upstream UI. */
export function resolveWillTheme(id: unknown): WillTheme | undefined {
  if (typeof id !== 'string') return undefined
  return WILL_THEMES.find(theme => theme.id === id)
}
