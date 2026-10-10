import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensureBuiltinAssets,
  getImages,
  getImage,
  loadImage,
  resetAssets,
  setFaceFromDataUrl,
  setImage,
} from '../assets'

/** 只用来驱动解码流程的假 Image：src 赋值后异步触发 onload / onerror */
class FakeImage {
  width = 120
  height = 160
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''

  set src(value: string) {
    this._src = value
    setTimeout(() => {
      if (value.includes('bad')) this.onerror?.()
      else this.onload?.()
    }, 0)
  }

  get src(): string {
    return this._src
  }
}

beforeEach(() => {
  resetAssets()
  vi.stubGlobal('Image', FakeImage)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadImage', () => {
  it('解码成功返回图片对象', async () => {
    const img = await loadImage('data:image/png;base64,AA')
    expect([img.width, img.height]).toEqual([120, 160])
  })

  it('解码失败抛错', async () => {
    await expect(loadImage('bad-url')).rejects.toThrow(/解码失败/)
  })

  it('环境不支持 Image 时明确报错', async () => {
    vi.stubGlobal('Image', undefined)
    await expect(loadImage('x')).rejects.toThrow(/不支持 Image/)
  })
})

describe('内置资源', () => {
  it('ensureBuiltinAssets 填好四张底图，男女头像各自独立', async () => {
    await ensureBuiltinAssets()
    expect(getImage('frontTemplate')).toBeTruthy()
    expect(getImage('backTemplate')).toBeTruthy()
    expect(getImage('defaultAvatarMale')).toBeTruthy()
    expect(getImage('defaultAvatarFemale')).toBeTruthy()
    expect(getImage('face')).toBeNull()
    const bundle = getImages()
    expect(Object.keys(bundle).sort()).toEqual(['backTemplate', 'defaultAvatars', 'face', 'frontTemplate'])
    // 槽位若接错（两张指向同一个对象）会立刻暴露
    expect(bundle.defaultAvatars?.male).not.toBe(bundle.defaultAvatars?.female)
  })

  it('resetAssets 清空全部槽位', async () => {
    await ensureBuiltinAssets()
    resetAssets()
    expect(getImage('frontTemplate')).toBeNull()
  })
})

describe('人像注入', () => {
  it('dataURL 成功时写入 face', async () => {
    await setFaceFromDataUrl('data:image/png;base64,AA')
    expect(getImage('face')).toBeTruthy()
  })

  it('解码失败或传 null 时回落到默认头像', async () => {
    await setFaceFromDataUrl('bad')
    expect(getImage('face')).toBeNull()
    await ensureBuiltinAssets()
    expect(getImages().face).toBeNull()
    expect(getImages().defaultAvatars?.female).toBeTruthy()
    await setFaceFromDataUrl(null)
    expect(getImage('face')).toBeNull()
  })

  it('setImage 允许单测直接注入假对象', () => {
    const fake = { width: 1, height: 2 }
    setImage('frontTemplate', fake)
    expect(getImage('frontTemplate')).toBe(fake)
    setImage('frontTemplate', null)
    expect(getImage('frontTemplate')).toBeNull()
  })
})
