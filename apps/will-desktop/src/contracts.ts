/** Preferences owned by the Will desktop shell, never by upstream dsh. */
export interface DesktopSettings {
  /** Active Will theme id, or `native` for the unmodified upstream UI. */
  theme: string
  /** Hide the window instead of ending the agent when the close button is pressed. */
  closeToTray: boolean
  /** Emit an operating-system notification when a foreground task settles off-screen. */
  taskNotifications: boolean
}

/** One sanitized DeepSeek balance row. API credentials never cross IPC. */
export interface BalanceInfo {
  currency: 'CNY' | 'USD'
  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
}

/** Balance result safe to expose to the renderer. */
export type BalanceResult =
  | { status: 'ok'; available: boolean; balances: BalanceInfo[] }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string }

/** Public desktop state consumed by the injected control center. */
export interface DesktopState {
  settings: DesktopSettings
  versions: {
    desktop: string
    bundledAgent: string
    activeAgent: string
  }
  paths: {
    userData: string
    harnessHome: string
    soul: string
    portable: boolean
  }
  plugins: string[]
}

/** Status pushed while a long-running desktop operation is active. */
export interface OperationStatus {
  kind: 'idle' | 'starting' | 'ready' | 'updating-agent' | 'updating-client' | 'installing-plugin' | 'error'
  message: string
}

/** Supported chrome actions from the isolated preload script. */
export type WindowAction = 'minimize' | 'toggle-maximize' | 'close' | 'show'

/** Client update check result. */
export type ClientUpdateResult =
  | { status: 'available'; version: string }
  | { status: 'current' }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string }
