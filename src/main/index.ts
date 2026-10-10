import { app, BrowserWindow, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { registerFileIpc } from './ipc/file'
import { registerAppIpc } from './ipc/app'

/**
 * 主进程入口：只负责窗口与系统能力，业务逻辑全部在渲染进程。
 * 安全基线：nodeIntegration 关闭、contextIsolation 开启、sandbox 开启，
 * 渲染进程只能通过 preload 暴露的白名单 API 与系统交互。
 */
const DEV_URL = process.env['ELECTRON_RENDERER_URL']
const PROD_INDEX = join(__dirname, '../renderer/index.html')

function resolveIcon(): string | undefined {
  const candidates = [join(process.resourcesPath ?? '', 'build/icon.png'), join(app.getAppPath(), 'build/icon.png')]
  return candidates.find((p) => existsSync(p))
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: '身份证演示图生成器',
    autoHideMenuBar: true,
    icon: resolveIcon(),
    backgroundColor: '#f5f7fa',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  })

  win.on('ready-to-show', () => win.show())

  // 窗口内不打开新窗口：外链一律交系统浏览器，且禁止页面自行弹窗
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (DEV_URL) win.loadURL(DEV_URL)
  else win.loadFile(PROD_INDEX)
}

app.whenReady().then(() => {
  registerAppIpc()
  registerFileIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
