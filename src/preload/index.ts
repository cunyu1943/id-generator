import { contextBridge, ipcRenderer } from 'electron'

/**
 * 预加载白名单：只暴露 4 个方法，全部走 ipcRenderer.invoke（禁用 sendSync）。
 * 渲染进程拿不到 fs / path / ipcRenderer 本身，contextIsolation + sandbox 已开启。
 */
interface RawResult<T> {
  canceled: boolean
  error?: string
  data?: T
}

const api = {
  /** 弹出保存对话框并写盘，返回 { canceled, savedPath, error } */
  saveImage(req: { dataUrl: string; defaultName: string; format?: 'png' | 'jpg' }) {
    return ipcRenderer.invoke('file:saveImage', req).then((res: RawResult<{ savedPath: string }>) => ({
      canceled: res.canceled,
      savedPath: res.data?.savedPath,
      error: res.error,
    }))
  },

  /** 选择本地人像图片，由主进程读取后以 base64 回传 */
  selectFace() {
    return ipcRenderer
      .invoke('file:selectFace')
      .then((res: RawResult<{ path: string; base64: string; size: number }>) => ({
        canceled: res.canceled,
        path: res.data?.path,
        base64: res.data?.base64,
        size: res.data?.size,
        error: res.error,
      }))
  },

  /** 在系统文件管理器中高亮定位导出的图片 */
  revealInFolder(path: string) {
    return ipcRenderer.invoke('file:revealPath', path).then((res: RawResult<void>) => res)
  },

  /** 应用版本号 */
  getVersion() {
    return ipcRenderer.invoke('app:getVersion') as Promise<string>
  },
}

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
