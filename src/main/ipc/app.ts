import { app, ipcMain } from 'electron'

/** app:getVersion —— 渲染进程展示版本号（About 页） */
export function registerAppIpc(): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())
}
