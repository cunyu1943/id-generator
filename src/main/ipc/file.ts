import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { isAbsolute } from 'node:path'

/** 人脸图片上限（与需求一致） */
const MAX_FACE_BYTES = 5 * 1024 * 1024

export interface SaveImagePayload {
  dataUrl: string
  defaultName: string
  format?: 'png' | 'jpg'
}

export interface IpcResult<T = void> {
  canceled: boolean
  error?: string
  data?: T
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47]
const JPEG_MAGIC = [0xff, 0xd8, 0xff]

function startsWith(buf: Buffer, magic: number[]): boolean {
  return magic.every((b, i) => buf[i] === b)
}

/**
 * 只接受 base64 的 png/jpeg dataURL，杜绝把任意字符串写进磁盘。
 * 返回 null 表示入参非法。
 */
function decodeImageDataUrl(dataUrl: string): { buffer: Buffer; ext: 'png' | 'jpg' } | null {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim())
  if (!match) return null
  const mime = match[1].toLowerCase()
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length === 0 || buffer.length > 64 * 1024 * 1024) return null
  if (mime === 'png') {
    if (!startsWith(buffer, PNG_MAGIC)) return null
    return { buffer, ext: 'png' }
  }
  if (!startsWith(buffer, JPEG_MAGIC)) return null
  return { buffer, ext: 'jpg' }
}

/** 去掉路径分隔符与控制字符，只留一个安全的默认文件名 */
export function sanitizeFileName(raw: string, fallback: string): string {
  const cleaned = String(raw ?? '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim()
  const withoutExt = cleaned.replace(/\.(png|jpe?g)$/i, '')
  return (withoutExt.length > 0 ? withoutExt : fallback).slice(0, 80)
}

function ownerWindow(raw: unknown): BrowserWindow | undefined {
  const sender = (raw as { sender?: unknown })?.sender
  return sender ? (BrowserWindow.fromWebContents(sender as Electron.WebContents) ?? undefined) : undefined
}

/** file:saveImage / file:selectFace / file:revealPath */
export function registerFileIpc(): void {
  ipcMain.handle(
    'file:saveImage',
    async (event, payload: SaveImagePayload): Promise<IpcResult<{ savedPath: string }>> => {
      const win = ownerWindow(event)
      const decoded = decodeImageDataUrl(payload?.dataUrl ?? '')
      if (!decoded) return { canceled: true, error: '图片数据非法，已中止保存' }

      const ext = payload.format === 'jpg' ? 'jpg' : decoded.ext
      const name = `${sanitizeFileName(payload.defaultName ?? '', '身份证演示图')}.${ext}`
      const options = {
        title: '保存演示图',
        defaultPath: name,
        filters:
          ext === 'jpg'
            ? [{ name: 'JPG 图片', extensions: ['jpg', 'jpeg'] }]
            : [{ name: 'PNG 图片', extensions: ['png'] }],
      }
      const { canceled, filePath } = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)
      if (canceled || !filePath) return { canceled: true }

      const finalPath = filePath.toLowerCase().endsWith(`.${ext}`) ? filePath : `${filePath}.${ext}`
      try {
        await fs.writeFile(finalPath, decoded.buffer)
      } catch (err) {
        return {
          canceled: true,
          error: `写盘失败：${err instanceof Error ? err.message : String(err)}`,
        }
      }
      return { canceled: false, data: { savedPath: finalPath } }
    },
  )

  ipcMain.handle(
    'file:selectFace',
    async (event): Promise<IpcResult<{ path: string; base64: string; size: number }>> => {
      const win = ownerWindow(event)
      const openOptions: Electron.OpenDialogOptions = {
        title: '选择人像图片',
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg'] }],
      }
      const { canceled, filePaths } = win
        ? await dialog.showOpenDialog(win, openOptions)
        : await dialog.showOpenDialog(openOptions)
      if (canceled || filePaths.length === 0) return { canceled: true }

      const path = filePaths[0]
      try {
        const stat = await fs.stat(path)
        if (!stat.isFile()) return { canceled: true, error: '请选择文件而不是目录' }
        if (stat.size > MAX_FACE_BYTES) return { canceled: true, error: `图片超过 ${MAX_FACE_BYTES / 1024 / 1024}MB` }
        const buffer = await fs.readFile(path)
        const isPng = startsWith(buffer, PNG_MAGIC)
        const isJpg = startsWith(buffer, JPEG_MAGIC)
        // 只回传真正的图片，避免把文本/可执行文件当图片读进渲染进程
        if (!isPng && !isJpg) return { canceled: true, error: '文件不是 png/jpg 图片' }
        return {
          canceled: false,
          data: { path, base64: buffer.toString('base64'), size: stat.size },
        }
      } catch (err) {
        return { canceled: true, error: err instanceof Error ? err.message : String(err) }
      }
    },
  )

  ipcMain.handle('file:revealPath', async (_event, path: unknown): Promise<IpcResult> => {
    if (typeof path !== 'string' || !isAbsolute(path)) return { canceled: true, error: '路径非法' }
    try {
      // 只高亮定位、不打开文件内容，但仍需确认文件存在
      await fs.access(path)
    } catch {
      return { canceled: true, error: '文件不存在或已被移动' }
    }
    shell.showItemInFolder(path)
    return { canceled: false }
  })
}
