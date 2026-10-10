import type { CanvasImageLike, ImageBundle } from '../types/idcard'
import avatarMaleUrl from '../assets/default-avatar-male.png'
import avatarFemaleUrl from '../assets/default-avatar-female.png'
import backTemplateUrl from '../assets/back-template.png'
import frontTemplateUrl from '../assets/front-template.png'

/**
 * 内置图片资源的加载与注入。
 *
 * 绘制函数本身不碰网络也不碰 DOM，只从这里的 bundle 取图；
 * 单元测试通过 `setImage` 注入只带 width/height 的假对象即可驱动全部绘制分支。
 */
export type BuiltinAssetKey =
  | 'frontTemplate'
  | 'backTemplate'
  | 'defaultAvatarMale'
  | 'defaultAvatarFemale'
  | 'face'

const BUILTIN_URLS: Record<Exclude<BuiltinAssetKey, 'face'>, string> = {
  frontTemplate: frontTemplateUrl,
  backTemplate: backTemplateUrl,
  defaultAvatarMale: avatarMaleUrl,
  defaultAvatarFemale: avatarFemaleUrl,
}

/** 内置底图槽位（face 由用户上传，不在 BUILTIN_URLS 里） */
const BUILTIN_KEYS = Object.keys(BUILTIN_URLS) as Array<Exclude<BuiltinAssetKey, 'face'>>

const store: Partial<Record<BuiltinAssetKey, CanvasImageLike | null>> = {
  frontTemplate: null,
  backTemplate: null,
  defaultAvatarMale: null,
  defaultAvatarFemale: null,
  face: null,
}

/** 用 Image 解码一个 URL / dataURL */
export function loadImage(src: string): Promise<CanvasImageLike> {
  return new Promise((resolve, reject) => {
    if (typeof Image !== 'function') {
      reject(new Error('当前环境不支持 Image，无法解码图片'))
      return
    }
    const img = new Image()
    img.onload = () => resolve(img as unknown as CanvasImageLike)
    img.onerror = () => reject(new Error(`图片解码失败：${src.slice(0, 48)}…`))
    img.src = src
  })
}

/** 应用启动时调用一次，加载四张内置底图 */
export async function ensureBuiltinAssets(): Promise<void> {
  await Promise.all(
    BUILTIN_KEYS.map(async (key) => {
      try {
        store[key] = await loadImage(BUILTIN_URLS[key])
      } catch {
        store[key] = null // 底图缺失时绘制层走程序化回落，不影响导出
      }
    }),
  )
}

export function setImage(key: BuiltinAssetKey, image: CanvasImageLike | null): void {
  store[key] = image
}

export function getImage(key: BuiltinAssetKey): CanvasImageLike | null {
  return store[key] ?? null
}

/** 载入用户上传的人像（dataURL）；失败时回落到默认头像 */
export async function setFaceFromDataUrl(dataUrl: string | null): Promise<void> {
  if (!dataUrl) {
    store.face = null
    return
  }
  try {
    store.face = await loadImage(dataUrl)
  } catch {
    store.face = null
  }
}

/** 取当前图片包，供绘制函数作为 options.images 使用 */
export function getImages(): Partial<ImageBundle> {
  return {
    frontTemplate: store.frontTemplate ?? null,
    backTemplate: store.backTemplate ?? null,
    defaultAvatars: {
      male: store.defaultAvatarMale ?? null,
      female: store.defaultAvatarFemale ?? null,
    },
    face: store.face ?? null,
  }
}

/** 单测之间隔离状态 */
export function resetAssets(): void {
  for (const key of Object.keys(store) as BuiltinAssetKey[]) store[key] = null
}
