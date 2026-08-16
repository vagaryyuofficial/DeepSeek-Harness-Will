/** Isolated renderer bridge and opt-in Will desktop control center. */

import { ipcRenderer } from 'electron'
import type {
  BalanceResult, ClientUpdateResult, DesktopSettings, DesktopState, OperationStatus, TerminalSnapshot,
} from './contracts.ts'
import {
  NATIVE_THEME_ID, WILL_THEMES, WILL_THEME_TOKEN_NAMES, resolveWillTheme,
} from './theme-catalog.ts'

const TITLEBAR_HEIGHT = 42

ipcRenderer.on('will:terminal-data', (_event, text: string) => {
  window.dispatchEvent(new CustomEvent<string>('will-terminal-data', { detail: text }))
})

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

function button(label: string, className = 'will-button'): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.textContent = label
  return element
}

function escapeText(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function applyTheme(id: string): void {
  const root = document.documentElement
  const body = document.body
  for (const name of WILL_THEME_TOKEN_NAMES) root.style.removeProperty(name)
  root.removeAttribute('data-will-theme')
  body.removeAttribute('data-will-theme')
  const theme = resolveWillTheme(id)
  if (theme === undefined) return
  root.setAttribute('data-will-theme', theme.id)
  body.setAttribute('data-will-theme', theme.id)
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value)
}

function installStyles(): void {
  const style = document.createElement('style')
  style.id = 'will-desktop-style'
  style.textContent = `
    :root { --will-titlebar-height: ${TITLEBAR_HEIGHT}px; }
    html, body { overflow: hidden !important; }
    body { padding-top: var(--will-titlebar-height) !important; box-sizing: border-box !important; }
    #root { height: calc(100vh - var(--will-titlebar-height)) !important; min-height: 0 !important; }
    #will-titlebar {
      position: fixed; inset: 0 0 auto 0; z-index: 2147483646; height: var(--will-titlebar-height);
      display: grid; grid-template-columns: minmax(220px, 1fr) auto auto; align-items: center;
      color: var(--dsw-alias-label-primary, #eaf2f8); background: color-mix(in srgb, var(--dsw-alias-bg-base, #0b1118) 82%, transparent);
      border-bottom: 1px solid var(--dsw-alias-border-l1, #273341); backdrop-filter: blur(22px) saturate(140%);
      -webkit-app-region: drag; user-select: none; font: 12px/1.2 system-ui, sans-serif;
    }
    .will-brand { display: flex; align-items: center; gap: 9px; min-width: 0; padding-left: 14px; font-weight: 650; }
    .will-mark { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; color: #071827; background: linear-gradient(135deg,#5ce1e6,#7cf6bd); font-weight: 900; }
    .will-brand-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .will-status { color: var(--dsw-alias-label-secondary, #9ba8b5); font-weight: 400; margin-left: 4px; }
    .will-title-actions, .will-window-controls { display: flex; align-items: center; height: 100%; -webkit-app-region: no-drag; }
    .will-title-button { height: 28px; border: 1px solid var(--dsw-alias-border-l1, #314151); border-radius: 8px; margin: 0 4px; padding: 0 10px; color: inherit; background: var(--dsw-alias-bg-layer-1, #151d26); cursor: pointer; font: inherit; }
    .will-title-button:hover { background: var(--dsw-alias-bg-layer-2, #1e2935); }
    #will-balance { min-width: 86px; text-align: center; }
    .will-window-button { width: 46px; height: 100%; border: 0; color: inherit; background: transparent; cursor: pointer; font: 16px/1 system-ui; }
    .will-window-button:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary, white) 12%, transparent); }
    .will-window-button.close:hover { color: white; background: #c42b1c; }
    html[data-will-platform="darwin"] .will-brand { padding-left: 78px; }
    html[data-will-platform="darwin"] .will-window-controls { display: none; }
    #will-panel-backdrop { position: fixed; inset: var(--will-titlebar-height) 0 0; z-index: 2147483644; background: rgb(0 0 0 / .42); backdrop-filter: blur(2px); }
    #will-panel {
      position: fixed; z-index: 2147483645; top: calc(var(--will-titlebar-height) + 10px); right: 10px; bottom: 10px; width: min(560px, calc(100vw - 20px));
      display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, #39495a); border-radius: 18px;
      color: var(--dsw-alias-label-primary, #eaf2f8); background: var(--dsw-alias-bg-overlay, #121a23); box-shadow: 0 24px 80px rgb(0 0 0 / .45);
      font: 14px/1.5 system-ui, sans-serif;
    }
    .will-panel-head { display: flex; align-items: center; gap: 10px; padding: 18px 20px; border-bottom: 1px solid var(--dsw-alias-border-l1, #2b3744); }
    .will-panel-head h2 { margin: 0; flex: 1; font-size: 18px; }
    .will-panel-scroll { padding: 4px 20px 24px; overflow: auto; }
    .will-section { padding: 18px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #2b3744); }
    .will-section:last-child { border-bottom: 0; }
    .will-section h3 { margin: 0 0 6px; font-size: 14px; }
    .will-help { margin: 0 0 12px; color: var(--dsw-alias-label-secondary, #9ba8b5); font-size: 12px; }
    .will-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .will-theme { min-height: 74px; display: flex; flex-direction: column; justify-content: space-between; text-align: left; border: 1px solid var(--dsw-alias-border-l1, #314151); border-radius: 12px; padding: 10px; color: inherit; background: var(--dsw-alias-bg-layer-1, #17212b); cursor: pointer; }
    .will-theme:hover { border-color: var(--dsw-alias-brand-primary, #4c9aff); }
    .will-theme[aria-pressed="true"] { outline: 2px solid var(--dsw-alias-brand-primary, #4c9aff); outline-offset: -2px; }
    .will-theme strong { font-size: 13px; }
    .will-theme small { color: var(--dsw-alias-label-secondary, #9ba8b5); line-height: 1.25; }
    .will-swatch { height: 8px; margin-bottom: 8px; border-radius: 999px; background: var(--swatch); }
    .will-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .will-row.wrap { flex-wrap: wrap; }
    .will-grow { flex: 1; min-width: 0; }
    .will-input, .will-textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--dsw-alias-border-l1, #314151); border-radius: 10px; padding: 9px 11px; color: inherit; background: var(--dsw-alias-bg-layer-1, #17212b); font: inherit; }
    .will-textarea { min-height: 160px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; }
    .will-terminal { box-sizing: border-box; width: 100%; height: 220px; overflow: auto; margin: 0; border: 1px solid var(--dsw-alias-border-l1, #314151); border-radius: 10px; padding: 10px; color: #d7f7df; background: #07110b; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .will-button { border: 1px solid var(--dsw-alias-border-l1, #314151); border-radius: 9px; padding: 8px 12px; color: inherit; background: var(--dsw-alias-bg-layer-1, #17212b); cursor: pointer; font: inherit; }
    .will-button:hover { border-color: var(--dsw-alias-brand-primary, #4c9aff); }
    .will-button.primary { border-color: var(--dsw-alias-brand-primary, #4c9aff); background: var(--dsw-alias-brand-primary, #2577d4); color: white; }
    .will-button.danger { color: #ff8d86; }
    .will-button:disabled { opacity: .55; cursor: wait; }
    .will-card { border: 1px solid var(--dsw-alias-border-l1, #314151); border-radius: 12px; padding: 12px; background: var(--dsw-alias-bg-layer-1, #17212b); }
    .will-money { font-size: 22px; font-weight: 700; }
    .will-plugin { display: flex; align-items: center; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, #2b3744); }
    .will-plugin:last-child { border-bottom: 0; }
    .will-plugin code { flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .will-toggle { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .will-toast { position: fixed; z-index: 2147483647; left: 50%; bottom: 22px; transform: translateX(-50%); max-width: min(640px, 90vw); padding: 10px 14px; border-radius: 10px; color: white; background: rgb(18 25 34 / .94); box-shadow: 0 8px 28px rgb(0 0 0 / .35); white-space: pre-wrap; }
    [data-will-theme="windows-xp"] button, [data-will-theme="windows-xp"] input, [data-will-theme="windows-xp"] textarea { border-radius: 3px !important; }
    [data-will-theme="qq98"] button, [data-will-theme="qq98"] input, [data-will-theme="qq98"] textarea { border-radius: 1px !important; box-shadow: inset 1px 1px #fff8, inset -1px -1px #0005; }
    [data-will-theme="minecraft"] button, [data-will-theme="minecraft"] input, [data-will-theme="minecraft"] textarea { border-radius: 0 !important; image-rendering: pixelated; }
    [data-will-theme="paper-minimal"] body { background-image: repeating-linear-gradient(0deg, transparent 0 27px, rgb(76 107 87 / .06) 28px); }
    [data-will-theme="cyber-neon"] #will-panel, [data-will-theme="cyber-neon"] #will-titlebar { box-shadow: 0 0 26px rgb(255 79 216 / .18); }
    @media (max-width: 760px) { .will-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .will-status { display: none; } }
  `
  document.head.append(style)
}

function toast(message: string, timeout = 4_000): void {
  document.querySelector('.will-toast')?.remove()
  const element = document.createElement('div')
  element.className = 'will-toast'
  element.textContent = message
  document.body.append(element)
  window.setTimeout(() => { element.remove() }, timeout)
}

function setBusy(element: HTMLButtonElement, busy: boolean, busyLabel: string, idleLabel: string): void {
  element.disabled = busy
  element.textContent = busy ? busyLabel : idleLabel
}

function asyncEvent(handler: () => Promise<void>): () => void {
  return () => { void handler() }
}

async function updateBalance(label: HTMLElement, card?: HTMLElement): Promise<void> {
  label.textContent = '余额 …'
  const result = await invoke<BalanceResult>('will:balance')
  if (result.status === 'ok') {
    const primary = result.balances.find(row => row.currency === 'CNY') ?? result.balances[0]
    label.textContent = primary === undefined ? '余额 --' : `余额 ${primary.currency === 'CNY' ? '¥' : '$'}${primary.totalBalance}`
    if (card !== undefined) {
      card.replaceChildren()
      for (const row of result.balances) {
        const line = document.createElement('div')
        line.className = 'will-row'
        const symbol = row.currency === 'CNY' ? '¥' : '$'
        const detail = document.createElement('div')
        detail.className = 'will-grow'
        const currency = document.createElement('strong')
        currency.textContent = row.currency
        const split = document.createElement('div')
        split.className = 'will-help'
        split.textContent = `充值 ${symbol}${row.toppedUpBalance} · 赠送 ${symbol}${row.grantedBalance}`
        detail.append(currency, split)
        const total = document.createElement('div')
        total.className = 'will-money'
        total.textContent = `${symbol}${row.totalBalance}`
        line.append(detail, total)
        card.append(line)
      }
    }
  } else if (result.status === 'unconfigured') {
    label.textContent = '余额 未配置'
    if (card !== undefined) card.textContent = '请先在原版「设置 → Models」中保存 DEEPSEEK_API_KEY。密钥只由主进程读取，不会发送到页面。'
  } else {
    label.textContent = '余额 !'
    if (card !== undefined) card.textContent = result.message
  }
}

function createTitlebar(): { balance: HTMLButtonElement; status: HTMLElement; settings: HTMLButtonElement } {
  const titlebar = document.createElement('div')
  titlebar.id = 'will-titlebar'
  const brand = document.createElement('div')
  brand.className = 'will-brand'
  brand.innerHTML = '<span class="will-mark">W</span><span class="will-brand-text">DeepSeek Harness Will</span>'
  const status = document.createElement('span')
  status.className = 'will-status'
  status.textContent = '正在连接…'
  brand.append(status)

  const actions = document.createElement('div')
  actions.className = 'will-title-actions'
  const balance = button('余额 …', 'will-title-button')
  balance.id = 'will-balance'
  balance.title = '刷新 DeepSeek API 余额'
  const settings = button('Will 设置', 'will-title-button')
  actions.append(balance, settings)

  const controls = document.createElement('div')
  controls.className = 'will-window-controls'
  for (const [label, action, className] of [
    ['—', 'minimize', 'will-window-button'],
    ['□', 'toggle-maximize', 'will-window-button'],
    ['×', 'close', 'will-window-button close'],
  ] as const) {
    const control = button(label, className)
    control.addEventListener('click', () => { void invoke<void>('will:window-action', action) })
    controls.append(control)
  }
  titlebar.append(brand, actions, controls)
  document.body.append(titlebar)
  return { balance, status, settings }
}

function section(title: string, help?: string): { root: HTMLElement; body: HTMLElement } {
  const root = document.createElement('section')
  root.className = 'will-section'
  const heading = document.createElement('h3')
  heading.textContent = title
  root.append(heading)
  if (help !== undefined) {
    const hint = document.createElement('p')
    hint.className = 'will-help'
    hint.textContent = help
    root.append(hint)
  }
  const body = document.createElement('div')
  root.append(body)
  return { root, body }
}

async function createControlCenter(
  state: DesktopState,
  balanceLabel: HTMLElement,
  close: () => void,
): Promise<HTMLElement> {
  const panel = document.createElement('aside')
  panel.id = 'will-panel'
  const head = document.createElement('div')
  head.className = 'will-panel-head'
  const title = document.createElement('h2')
  title.textContent = 'Will 控制中心'
  const closeButton = button('关闭')
  closeButton.addEventListener('click', close)
  head.append(title, closeButton)
  const scroll = document.createElement('div')
  scroll.className = 'will-panel-scroll'
  panel.append(head, scroll)

  const themes = section('界面皮肤', '默认使用「原生」且不写入任何上游主题变量；其余 10 套皮肤互斥生效。')
  const grid = document.createElement('div')
  grid.className = 'will-grid'
  let activeTheme = state.settings.theme
  const cards: HTMLButtonElement[] = []
  const native = button('', 'will-theme')
  native.innerHTML = '<span class="will-swatch" style="--swatch:linear-gradient(90deg,#f5f6f7,#101820)"></span><strong>原生</strong><small>保持官方 DeepSeek Harness 外观</small>'
  grid.append(native)
  cards.push(native)
  for (const theme of WILL_THEMES) {
    const card = button('', 'will-theme')
    const swatch = theme.tokens['--dsw-alias-brand-primary'] ?? '#4c9aff'
    card.innerHTML = `<span class="will-swatch" style="--swatch:${swatch}"></span><strong>${theme.label}</strong><small>${theme.description}</small>`
    card.dataset.themeId = theme.id
    grid.append(card)
    cards.push(card)
  }
  native.dataset.themeId = NATIVE_THEME_ID
  const syncCards = (): void => {
    for (const card of cards) card.setAttribute('aria-pressed', String(card.dataset.themeId === activeTheme))
  }
  for (const card of cards) {
    card.addEventListener('click', asyncEvent(async () => {
      const id = card.dataset.themeId ?? NATIVE_THEME_ID
      try {
        await invoke<DesktopSettings>('will:set-theme', id)
        activeTheme = id
        applyTheme(id)
        syncCards()
      } catch (error) { toast(escapeText(error)) }
    }))
  }
  syncCards()
  themes.body.append(grid)
  scroll.append(themes.root)

  const balance = section('余额查看', '直接调用 DeepSeek 官方 /user/balance；点击金额可前往开放平台充值。')
  const balanceCard = document.createElement('div')
  balanceCard.className = 'will-card'
  balanceCard.textContent = '正在查询…'
  balanceCard.addEventListener('click', () => { void invoke<void>('will:open-deepseek') })
  const refresh = button('刷新余额')
  refresh.addEventListener('click', () => { void updateBalance(balanceLabel, balanceCard) })
  balance.body.append(balanceCard, refresh)
  scroll.append(balance.root)
  void updateBalance(balanceLabel, balanceCard)

  const soul = section('soul.md 人设', '保存后投影为独立 dsh patch；原版 profile 文件不会被覆盖，运行中的配置会自动重载。')
  const editor = document.createElement('textarea')
  editor.className = 'will-textarea'
  editor.placeholder = '留空即不覆盖原版 persona。'
  editor.value = await invoke<string>('will:read-soul')
  const saveSoul = button('保存人设', 'will-button primary')
  saveSoul.addEventListener('click', asyncEvent(async () => {
    setBusy(saveSoul, true, '保存中…', '保存人设')
    try {
      await invoke<void>('will:write-soul', editor.value)
      toast('soul.md 已保存，DeepSeek Harness 将热重载配置。')
    } catch (error) { toast(escapeText(error), 8_000) } finally { setBusy(saveSoul, false, '保存中…', '保存人设') }
  }))
  const showSoul = button('打开所在目录')
  showSoul.addEventListener('click', () => { void invoke<void>('will:show-path', 'soul') })
  const soulActions = document.createElement('div')
  soulActions.className = 'will-row'
  soulActions.append(saveSoul, showSoul)
  soul.body.append(editor, soulActions)
  scroll.append(soul.root)

  const terminal = section('持久终端', 'Windows 使用 PowerShell，macOS 使用登录 Shell；关闭设置页或重载 Web 页面都不会终止，重新打开会回放最近 128 KiB 输出。')
  const terminalOutput = document.createElement('pre')
  terminalOutput.className = 'will-terminal'
  const terminalInput = document.createElement('input')
  terminalInput.className = 'will-input will-grow'
  terminalInput.placeholder = '输入终端命令，按 Enter 执行'
  const runTerminal = button('执行', 'will-button primary')
  const restartTerminal = button('重启终端')
  const scrollTerminal = (): void => { terminalOutput.scrollTop = terminalOutput.scrollHeight }
  const executeTerminal = async (): Promise<void> => {
    const command = terminalInput.value
    if (command.trim() === '') return
    terminalInput.value = ''
    try { await invoke<void>('will:terminal-write', command) }
    catch (error) { toast(escapeText(error), 8_000) }
  }
  runTerminal.addEventListener('click', () => { void executeTerminal() })
  terminalInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void executeTerminal() }
  })
  restartTerminal.addEventListener('click', asyncEvent(async () => {
    if (!window.confirm('确认结束并重启当前终端会话？')) return
    try {
      const snapshot = await invoke<TerminalSnapshot>('will:terminal-restart')
      terminalOutput.textContent = snapshot.output
      scrollTerminal()
    } catch (error) { toast(escapeText(error), 8_000) }
  }))
  const terminalData = (event: Event): void => {
    terminalOutput.textContent = `${terminalOutput.textContent}${(event as CustomEvent<string>).detail}`.slice(-131_072)
    scrollTerminal()
  }
  window.addEventListener('will-terminal-data', terminalData)
  panel.addEventListener('will-dispose', () => { window.removeEventListener('will-terminal-data', terminalData) }, { once: true })
  try {
    const snapshot = await invoke<TerminalSnapshot>('will:terminal-read')
    terminalOutput.textContent = snapshot.output || `[${snapshot.shell} · ${snapshot.cwd}]\n`
  } catch (error) {
    terminalOutput.textContent = escapeText(error)
  }
  const terminalRow = document.createElement('div')
  terminalRow.className = 'will-row'
  terminalRow.append(terminalInput, runTerminal, restartTerminal)
  terminal.body.append(terminalOutput, terminalRow)
  scroll.append(terminal.root)
  scrollTerminal()

  const plugins = section('插件安装', '输入 npm、GitHub 或本地 package spec。插件可能执行安装脚本，仅安装你信任的来源。')
  const pluginInput = document.createElement('input')
  pluginInput.className = 'will-input will-grow'
  pluginInput.placeholder = '例如：github:owner/dsh-plugin-demo'
  const install = button('安装', 'will-button primary')
  const inputRow = document.createElement('div')
  inputRow.className = 'will-row'
  inputRow.append(pluginInput, install)
  const pluginList = document.createElement('div')
  const renderPlugins = (names: readonly string[]): void => {
    pluginList.replaceChildren()
    if (names.length === 0) pluginList.textContent = '尚未安装额外 profile 插件。'
    for (const name of names) {
      const row = document.createElement('div')
      row.className = 'will-plugin'
      const code = document.createElement('code')
      code.textContent = name
      const remove = button('卸载', 'will-button danger')
      remove.addEventListener('click', asyncEvent(async () => {
        if (!window.confirm(`确认卸载 ${name}？Harness 会自动重启。`)) return
        setBusy(remove, true, '处理中…', '卸载')
        try {
          renderPlugins(await invoke<string[]>('will:plugin', 'remove', name))
          toast(`${name} 已卸载。`)
        } catch (error) { toast(escapeText(error), 10_000) } finally { setBusy(remove, false, '处理中…', '卸载') }
      }))
      row.append(code, remove)
      pluginList.append(row)
    }
  }
  renderPlugins(state.plugins)
  install.addEventListener('click', asyncEvent(async () => {
    const spec = pluginInput.value.trim()
    if (spec === '') return
    if (!window.confirm(`将安装：${spec}\n\n插件拥有本机代码执行权限。只继续安装你信任的来源。`)) return
    setBusy(install, true, '安装中…', '安装')
    try {
      renderPlugins(await invoke<string[]>('will:plugin', 'add', spec))
      pluginInput.value = ''
      toast(`${spec} 已安装并重启 Harness。`)
    } catch (error) { toast(escapeText(error), 12_000) } finally { setBusy(install, false, '安装中…', '安装') }
  }))
  plugins.body.append(inputRow, pluginList)
  scroll.append(plugins.root)

  const updates = section('双重更新', `桌面 ${state.versions.desktop} · 当前 agent ${state.versions.activeAgent} · 内置 agent ${state.versions.bundledAgent}`)
  const updateAgent = button('更新官方 agent', 'will-button primary')
  updateAgent.addEventListener('click', asyncEvent(async () => {
    if (!window.confirm('将通过内置 npm 安装 @deepseek-ai/dsh@latest。新版本自检或启动失败会自动回退。是否继续？')) return
    setBusy(updateAgent, true, '更新中…', '更新官方 agent')
    try { toast(`官方 agent 已更新至 ${await invoke<string>('will:update-agent')}`) }
    catch (error) { toast(escapeText(error), 12_000) }
    finally { setBusy(updateAgent, false, '更新中…', '更新官方 agent') }
  }))
  const rollback = button('回退 agent')
  rollback.addEventListener('click', asyncEvent(async () => {
    try { toast(`已回退到 agent ${await invoke<string>('will:rollback-agent')}`) }
    catch (error) { toast(escapeText(error), 8_000) }
  }))
  const updateClient = button('检查客户端更新')
  updateClient.addEventListener('click', asyncEvent(async () => {
    setBusy(updateClient, true, '检查中…', '检查客户端更新')
    try {
      const result = await invoke<ClientUpdateResult>('will:check-client-update')
      if (result.status === 'available') {
        if (window.confirm(`发现客户端 ${result.version}。是否下载、退出并安装？`)) {
          setBusy(updateClient, true, '下载中…', '检查客户端更新')
          await invoke<void>('will:install-client-update')
        }
      }
      else if (result.status === 'current') toast('客户端已是最新版本。')
      else toast(result.message)
    } catch (error) { toast(escapeText(error)) }
    finally { setBusy(updateClient, false, '检查中…', '检查客户端更新') }
  }))
  const updateRow = document.createElement('div')
  updateRow.className = 'will-row wrap'
  updateRow.append(updateAgent, rollback, updateClient)
  updates.body.append(updateRow)
  scroll.append(updates.root)

  const behavior = section('桌面行为', state.paths.portable ? '当前为便携模式，数据跟随可执行文件目录。' : '当前为安装模式，数据写入系统用户目录。')
  for (const [key, label] of [
    ['closeToTray', '关闭窗口时继续在托盘运行'],
    ['taskNotifications', '窗口不在前台时发送任务完成通知'],
  ] as const) {
    const row = document.createElement('label')
    row.className = 'will-toggle'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = state.settings[key]
    checkbox.addEventListener('change', asyncEvent(async () => {
      try { await invoke<DesktopSettings>('will:set-preference', key, checkbox.checked) }
      catch (error) { checkbox.checked = !checkbox.checked; toast(escapeText(error)) }
    }))
    row.append(checkbox, document.createTextNode(label))
    behavior.body.append(row)
  }
  const dataPath = document.createElement('code')
  dataPath.textContent = state.paths.userData
  const showData = button('打开数据目录')
  showData.addEventListener('click', () => { void invoke<void>('will:show-path', 'userData') })
  const pathRow = document.createElement('div')
  pathRow.className = 'will-row'
  pathRow.append(dataPath, showData)
  behavior.body.append(pathRow)
  scroll.append(behavior.root)

  const statusSection = section('能力边界', '本版直接复用官方已有的模型设置、会话持久化、文件 diff 和插件 profile；逐文件一键还原、Codex/Claude 自动迁移将在后续桌面原生 provider 中完成。')
  statusSection.body.innerHTML = '<div class="will-card">已接通：免浏览器桌面运行、原生窗口/托盘、便携数据、10 套皮肤、余额、soul.md、持久终端、插件安装、agent 更新回退、客户端更新、任务通知。<br>沿用官方：模型选择、MCP 配置、会话文件记录与 diff 展示。</div>'
  scroll.append(statusSection.root)
  return panel
}

function installTaskObserver(): void {
  let wasRunning = false
  window.setInterval(() => {
    const running = [...document.querySelectorAll('button')].some((element) => {
      if (element.closest('#will-titlebar, #will-panel') !== null) return false
      const text = `${element.getAttribute('aria-label') ?? ''} ${element.textContent}`
      return /stop generating|停止生成|停止响应|中止任务/iu.test(text)
    })
    if (wasRunning && !running) ipcRenderer.send('will:task-finished')
    wasRunning = running
  }, 1_200)
}

async function initialize(): Promise<void> {
  if (document.getElementById('will-titlebar') !== null) return
  document.documentElement.dataset.willPlatform = process.platform
  installStyles()
  const titlebar = createTitlebar()
  const state = await invoke<DesktopState>('will:get-state')
  applyTheme(state.settings.theme)
  titlebar.status.textContent = '已连接'
  void updateBalance(titlebar.balance)
  window.setInterval(() => { void updateBalance(titlebar.balance) }, 300_000)
  let backdrop: HTMLElement | undefined
  const close = (): void => {
    backdrop?.querySelector('#will-panel')?.dispatchEvent(new Event('will-dispose'))
    backdrop?.remove()
    backdrop = undefined
  }
  titlebar.settings.addEventListener('click', asyncEvent(async () => {
    if (backdrop !== undefined) { close(); return }
    backdrop = document.createElement('div')
    backdrop.id = 'will-panel-backdrop'
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close() })
    try {
      backdrop.append(await createControlCenter(await invoke<DesktopState>('will:get-state'), titlebar.balance, close))
      document.body.append(backdrop)
    } catch (error) { close(); toast(escapeText(error)) }
  }))
  titlebar.balance.addEventListener('click', () => { void updateBalance(titlebar.balance) })
  ipcRenderer.on('will:status', (_event, value: OperationStatus) => { titlebar.status.textContent = value.message })
  installTaskObserver()
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void initialize() }, { once: true })
else void initialize()
