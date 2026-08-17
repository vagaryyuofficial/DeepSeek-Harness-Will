/** Electron host for the Will desktop distribution of the official dsh Web profile. */

import { appendFile, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, shell, Tray,
  type IpcMainInvokeEvent,
} from 'electron'
import updater from 'electron-updater'
import { updateAgentOverlay, hasBundledNodeRuntime } from './agent-update.ts'
import { APP_DISPLAY_NAME, LEGACY_USER_DATA_DIRECTORY } from './branding.ts'
import type {
  ClientUpdateResult, DesktopSettings, DesktopState, OperationStatus, WindowAction,
} from './contracts.ts'
import { HarnessProcess } from './harness.ts'
import {
  desktopPaths, initializeDesktopFiles, queryBalance, readDesktopSettings, readSoul,
  writeDesktopSettings, writeSoul,
  type DesktopPaths,
} from './store.ts'
import { NATIVE_THEME_ID, resolveWillTheme } from './theme-catalog.ts'
import { PersistentTerminal } from './terminal.ts'

const { autoUpdater } = updater
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR?.trim()
const EXPLICIT_DATA_DIR = process.env.WILL_DATA_DIR?.trim()
app.setName(APP_DISPLAY_NAME)
const selectedDataDir = PORTABLE_DIR !== undefined && PORTABLE_DIR !== ''
  ? join(PORTABLE_DIR, 'DeepSeek-Harness-Will-Data')
  : EXPLICIT_DATA_DIR !== undefined && EXPLICIT_DATA_DIR !== ''
    ? EXPLICIT_DATA_DIR
    : join(app.getPath('appData'), LEGACY_USER_DATA_DIRECTORY)
mkdirSync(selectedDataDir, { recursive: true, mode: 0o700 })
app.setPath('userData', selectedDataDir)

let settings: DesktopSettings
let tray: Tray | undefined
let quitting = false
let runtimeReady = false
let harnessUrl = ''
let latestStatus: OperationStatus = { kind: 'idle', message: '等待启动' }
let paths: DesktopPaths
let harness: HarnessProcess
let mainWindow: BrowserWindow
let terminal: PersistentTerminal

function status(value: OperationStatus): void {
  latestStatus = value
  mainWindow.webContents.send('will:status', value)
  refreshTrayMenu()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function reportFatalStartupError(error: unknown): Promise<void> {
  const message = errorMessage(error)
  const detail = error instanceof Error ? error.stack ?? message : message
  let logPath: string | undefined
  try {
    logPath = join(app.getPath('userData'), 'startup-error.log')
    await appendFile(logPath, `[${new Date().toISOString()}] ${APP_DISPLAY_NAME} startup failure\n${detail}\n\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
  } catch {
    logPath = undefined
  }
  try {
    dialog.showErrorBox(
      `${APP_DISPLAY_NAME} 启动失败`,
      `${message}${logPath === undefined ? '' : `\n\n诊断日志：${logPath}`}`,
    )
  } catch {
    // The native dialog may be unavailable when Electron fails before ready.
  }
  app.exit(1)
}

async function finishSmokeProbe(result: { status: 'ready' | 'error'; message: string }): Promise<void> {
  const target = process.env.WILL_SMOKE_FILE?.trim()
  if (target === undefined || target === '') return
  await writeFile(target, `${JSON.stringify(result)}\n`, { encoding: 'utf8', mode: 0o600 })
  if (process.env.WILL_SMOKE_EXIT !== '1') return
  quitting = true
  await Promise.all([harness.stop(), terminal.stop()])
  runtimeReady = false
  app.quit()
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (event.senderFrame === null) throw new Error('拒绝无页面来源的桌面 IPC')
  const sender = new URL(event.senderFrame.url)
  const expected = new URL(harnessUrl)
  if (sender.origin !== expected.origin) throw new Error('拒绝非 Harness 页面调用桌面 IPC')
}

async function listPlugins(): Promise<string[]> {
  try {
    const manifest = JSON.parse(await readFile(join(paths.harnessHome, 'profiles', 'web', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, unknown>
    }
    return Object.keys(manifest.dependencies ?? {}).sort()
  } catch {
    return []
  }
}

async function desktopState(): Promise<DesktopState> {
  return {
    settings,
    versions: {
      desktop: app.getVersion(),
      bundledAgent: await harness.bundledVersion(),
      activeAgent: await harness.activeVersion(),
    },
    paths: {
      userData: paths.userData,
      harnessHome: paths.harnessHome,
      soul: paths.soul,
      portable: PORTABLE_DIR !== undefined && PORTABLE_DIR !== '',
    },
    plugins: await listPlugins(),
  }
}

async function loadHarnessUrl(url: string): Promise<void> {
  harnessUrl = url
  await mainWindow.loadURL(url)
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: APP_DISPLAY_NAME,
    frame: isMac,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 13 } } : {}),
    show: false,
    backgroundColor: '#0b1118',
    webPreferences: {
      preload: join(app.getAppPath(), 'dist', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  window.removeMenu()
  window.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(APP_DISPLAY_NAME)
  })
  window.once('ready-to-show', () => { window.show() })
  window.on('close', (event) => {
    if (quitting || !settings.closeToTray) return
    event.preventDefault()
    window.hide()
  })
  window.on('maximize', () => { window.webContents.send('will:maximized', true) })
  window.on('unmaximize', () => { window.webContents.send('will:maximized', false) })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin === new URL(harnessUrl).origin) return
    event.preventDefault()
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
  })
  return window
}

async function trayImage() {
  const svg = await readFile(join(app.getAppPath(), 'assets', 'icon.svg'), 'utf8')
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 18, height: 18 })
  if (process.platform === 'darwin') image.setTemplateImage(true)
  return image
}

function refreshTrayMenu(): void {
  if (tray === undefined) return
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `显示 ${APP_DISPLAY_NAME}`, click: () => { mainWindow.show(); mainWindow.focus() } },
    { label: latestStatus.message, enabled: false },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ]))
}

async function createTray(): Promise<void> {
  tray = new Tray(await trayImage())
  tray.setToolTip(APP_DISPLAY_NAME)
  tray.on('click', () => { mainWindow.show(); mainWindow.focus() })
  refreshTrayMenu()
}

function setupIpc(): void {
  ipcMain.handle('will:get-state', async (event) => { assertTrustedSender(event); return await desktopState() })
  ipcMain.handle('will:set-theme', async (event, theme: unknown) => {
    assertTrustedSender(event)
    if (theme !== NATIVE_THEME_ID && resolveWillTheme(theme) === undefined) throw new Error('未知主题')
    settings = await writeDesktopSettings(paths, { ...settings, theme: String(theme) })
    return settings
  })
  ipcMain.handle('will:set-preference', async (event, key: unknown, value: unknown) => {
    assertTrustedSender(event)
    if ((key !== 'closeToTray' && key !== 'taskNotifications') || typeof value !== 'boolean') {
      throw new Error('无效桌面设置')
    }
    settings = await writeDesktopSettings(paths, { ...settings, [key]: value })
    return settings
  })
  ipcMain.handle('will:window-action', (event, action: WindowAction) => {
    assertTrustedSender(event)
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window === null) return
    if (action === 'minimize') window.minimize()
    else if (action === 'toggle-maximize') {
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    }
    else if (action === 'close') window.close()
    else { window.show(); window.focus() }
  })
  ipcMain.handle('will:read-soul', async (event) => { assertTrustedSender(event); return await readSoul(paths) })
  ipcMain.handle('will:write-soul', async (event, persona: unknown) => {
    assertTrustedSender(event)
    if (typeof persona !== 'string') throw new Error('soul.md 必须是文本')
    await writeSoul(paths, persona)
  })
  ipcMain.handle('will:balance', async (event) => { assertTrustedSender(event); return await queryBalance(paths) })
  ipcMain.handle('will:open-deepseek', async (event) => {
    assertTrustedSender(event)
    await shell.openExternal('https://platform.deepseek.com/')
  })
  ipcMain.handle('will:show-path', (event, target: unknown) => {
    assertTrustedSender(event)
    if (target !== 'userData' && target !== 'harnessHome' && target !== 'soul') throw new Error('未知路径')
    const value = target === 'userData' ? paths.userData : target === 'harnessHome' ? paths.harnessHome : paths.soul
    shell.showItemInFolder(value)
  })
  ipcMain.handle('will:terminal-read', async (event) => {
    assertTrustedSender(event)
    return await terminal.snapshot()
  })
  ipcMain.handle('will:terminal-write', async (event, command: unknown) => {
    assertTrustedSender(event)
    if (typeof command !== 'string') throw new Error('终端命令必须是文本')
    await terminal.write(command)
  })
  ipcMain.handle('will:terminal-restart', async (event) => {
    assertTrustedSender(event)
    await terminal.stop()
    return await terminal.snapshot()
  })
  ipcMain.handle('will:plugin', async (event, verb: unknown, spec: unknown) => {
    assertTrustedSender(event)
    if ((verb !== 'add' && verb !== 'remove') || typeof spec !== 'string'
      || spec.trim() === '' || spec.trim().startsWith('-') || spec.length > 512) {
      throw new Error('插件参数无效')
    }
    status({ kind: 'installing-plugin', message: verb === 'add' ? `正在安装 ${spec}…` : `正在卸载 ${spec}…` })
    await harness.stop()
    let operationError: unknown
    try {
      const result = await harness.run(['plugin', '--profile', 'web', verb, spec.trim()])
      if (result.code !== 0) throw new Error(result.output || `插件操作失败（exit ${result.code}）`)
    } catch (error) {
      operationError = error
    }
    try {
      await loadHarnessUrl(await harness.start())
    } catch (restartError) {
      if (operationError !== undefined) {
        throw new AggregateError([operationError, restartError], '插件操作失败，Harness 也未能恢复')
      }
      throw restartError
    }
    if (operationError !== undefined) {
      throw operationError instanceof Error ? operationError : new Error(errorMessage(operationError))
    }
    return await listPlugins()
  })
  ipcMain.handle('will:update-agent', async (event) => {
    assertTrustedSender(event)
    if (!hasBundledNodeRuntime()) throw new Error('当前安装包未包含独立 Node/npm 运行时，无法执行 agent overlay 更新')
    const result = await updateAgentOverlay(paths, harness, status)
    await loadHarnessUrl(result.url)
    return result.version
  })
  ipcMain.handle('will:rollback-agent', async (event) => {
    assertTrustedSender(event)
    if (!existsSync(paths.overlayPrevious)) throw new Error('没有可回退的 agent 版本')
    await harness.stop()
    const swap = `${paths.overlayCurrent}.rollback`
    const hadCurrent = existsSync(paths.overlayCurrent)
    await rm(swap, { recursive: true, force: true })
    if (hadCurrent) await rename(paths.overlayCurrent, swap)
    await rename(paths.overlayPrevious, paths.overlayCurrent)
    if (hadCurrent) await rename(swap, paths.overlayPrevious)
    try {
      await loadHarnessUrl(await harness.start())
    } catch (error) {
      await harness.stop()
      if (hadCurrent) {
        await rename(paths.overlayCurrent, swap)
        await rename(paths.overlayPrevious, paths.overlayCurrent)
        await rename(swap, paths.overlayPrevious)
      } else {
        await rename(paths.overlayCurrent, paths.overlayPrevious)
      }
      await loadHarnessUrl(await harness.start())
      throw error
    }
    return await harness.activeVersion()
  })
  ipcMain.handle('will:check-client-update', async (event): Promise<ClientUpdateResult> => {
    assertTrustedSender(event)
    if (!app.isPackaged) return { status: 'not-configured', message: '开发模式不检查客户端更新' }
    if (process.platform === 'darwin') {
      return { status: 'not-configured', message: 'macOS 版本当前请从 GitHub Releases 手动更新' }
    }
    try {
      autoUpdater.autoDownload = false
      autoUpdater.autoInstallOnAppQuit = false
      const result = await autoUpdater.checkForUpdates()
      if (result === null) return { status: 'current' }
      return result.updateInfo.version === app.getVersion()
        ? { status: 'current' }
        : { status: 'available', version: result.updateInfo.version }
    } catch (error) {
      const message = errorMessage(error)
      return /app-update\.yml|publish config|provider/iu.test(message)
        ? { status: 'not-configured', message: 'GitHub Release 尚未配置' }
        : { status: 'error', message }
    }
  })
  ipcMain.handle('will:install-client-update', async (event) => {
    assertTrustedSender(event)
    if (!app.isPackaged) throw new Error('开发模式不能安装客户端更新')
    if (process.platform === 'darwin') throw new Error('macOS 版本当前请从 GitHub Releases 手动更新')
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    status({ kind: 'updating-client', message: '正在下载客户端更新…' })
    const result = await autoUpdater.checkForUpdates()
    if (result === null || result.updateInfo.version === app.getVersion()) {
      status({ kind: 'ready', message: '客户端已是最新版本' })
      return
    }
    await autoUpdater.downloadUpdate()
    status({ kind: 'updating-client', message: '更新已下载，正在重启安装…' })
    quitting = true
    await Promise.all([harness.stop(), terminal.stop()])
    runtimeReady = false
    autoUpdater.quitAndInstall(false, true)
  })
  ipcMain.on('will:task-finished', (event) => {
    if (harnessUrl === '' || event.senderFrame === null
      || new URL(event.senderFrame.url).origin !== new URL(harnessUrl).origin) return
    if (!settings.taskNotifications || mainWindow.isFocused() || !Notification.isSupported()) return
    const notification = new Notification({ title: APP_DISPLAY_NAME, body: 'Agent 任务已完成，点击返回窗口。' })
    notification.on('click', () => { mainWindow.show(); mainWindow.focus() })
    notification.show()
  })
}

async function boot(): Promise<void> {
  if (!app.requestSingleInstanceLock()) {
    app.exit(0)
    return
  }

  await app.whenReady()
  paths = desktopPaths(app.getPath('userData'))
  await initializeDesktopFiles(paths)
  settings = await readDesktopSettings(paths)
  const workingDirectory = app.getPath('home')
  harness = new HarnessProcess(paths, status, workingDirectory)
  mainWindow = createWindow()
  terminal = new PersistentTerminal(workingDirectory, (text) => { mainWindow.webContents.send('will:terminal-data', text) })
  runtimeReady = true
  setupIpc()
  app.on('second-instance', () => { mainWindow.show(); mainWindow.focus() })
  app.on('before-quit', (event) => {
    quitting = true
    if (!runtimeReady) return
    event.preventDefault()
    runtimeReady = false
    void Promise.all([harness.stop(), terminal.stop()]).finally(() => { app.quit() })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !settings.closeToTray) app.quit()
  })
  app.on('activate', () => { mainWindow.show(); mainWindow.focus() })
  await createTray()
  try {
    await loadHarnessUrl(await harness.start())
    await finishSmokeProbe({ status: 'ready', message: harnessUrl })
  } catch (error) {
    const message = errorMessage(error)
    status({ kind: 'error', message })
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<h1>${APP_DISPLAY_NAME} 启动失败</h1><pre>${message}</pre>`)}`)
    await finishSmokeProbe({ status: 'error', message })
  }
}

void boot().catch(reportFatalStartupError)
