import type { WatermarkOptions } from '../types/idcard'
import { FONT_CN, MANDATORY_WATERMARK_TEXT, WATERMARK_DEFAULTS } from './templates'

/** tEXt/iTXt 元数据关键字（需求指定） */
export const PNG_TEXT_KEYWORD = 'DemoOnly'

/**
 * 透明度下限：任何低于该值的设置都会被抬升。
 * 这是「水印要么有效、要么不存在」的兜底——启用时 UI 只能调节强弱，不能调到看似有实为无；
 * 需要完全没有水印时走 `enabled: false` 显式关闭。
 */
export const MIN_OPACITY = 0.06
export const MAX_OPACITY = 0.6

/** 单次平铺最多绘制的条目数，防止极端密度参数把渲染拖死 */
export const MAX_WATERMARK_PLACEMENTS = 4000

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

/** PNG 标准 CRC-32（多项式 0xEDB88320） */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** 合并默认值并做参数防护：默认带水印、文案不可为空、透明度不可为 0 */
export function resolveWatermarkOptions(input: Partial<WatermarkOptions> = {}): WatermarkOptions {
  const merged: WatermarkOptions = { ...WATERMARK_DEFAULTS, ...input }
  const text = typeof merged.text === 'string' ? merged.text.trim() : ''
  return {
    ...merged,
    // 只有显式传 false 才关闭，undefined / 脏值一律回到「有水印」
    enabled: merged.enabled !== false,
    text: text || MANDATORY_WATERMARK_TEXT,
    opacity: clampOpacity(merged.opacity),
    fontSize: positive(merged.fontSize, WATERMARK_DEFAULTS.fontSize),
    rowGap: positive(merged.rowGap, WATERMARK_DEFAULTS.rowGap),
    colGap: positive(merged.colGap, WATERMARK_DEFAULTS.colGap),
    density: clampDensity(merged.density),
    angle: Number.isFinite(merged.angle) ? merged.angle : WATERMARK_DEFAULTS.angle,
    mode: merged.mode === 'diagonal' ? 'diagonal' : 'tile',
  }
}

function clampOpacity(v: number): number {
  if (!Number.isFinite(v)) return WATERMARK_DEFAULTS.opacity
  return Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, v))
}

function clampDensity(v: number): number {
  if (!Number.isFinite(v)) return 1
  return Math.min(3, Math.max(0.4, v))
}

function positive(v: number, fallback: number): number {
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/** 密度换算成实际行/列间距 */
export function effectiveGaps(opts: WatermarkOptions): { rowGap: number; colGap: number } {
  return { rowGap: opts.rowGap / opts.density, colGap: opts.colGap / opts.density }
}

/** 无需 ctx 的字宽估算：CJK 按 1em、ASCII 按 0.55em */
export function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) units += ch.charCodeAt(0) > 0x2e80 ? 1 : 0.55
  return units * fontSize
}

export interface WatermarkPlacement {
  x: number
  y: number
  text: string
  fontSize: number
}

/**
 * 计算平铺水印的落点（旋转坐标系内，原点为画布中心）。
 *
 * 先把卡片旋转后的外接矩形算出来，再按行/列间距铺满，奇数行错开半个列距，
 * 保证旋转后不会出现空白带。
 */
export function computeTileLayout(
  width: number,
  height: number,
  input: Partial<WatermarkOptions> = {},
): WatermarkPlacement[] {
  const opts = resolveWatermarkOptions(input)
  const rad = (opts.angle * Math.PI) / 180
  const boxW = width * Math.abs(Math.cos(rad)) + height * Math.abs(Math.sin(rad))
  const boxH = width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad))
  const { rowGap, colGap } = effectiveGaps(opts)

  const rows = Math.max(1, Math.floor(boxH / rowGap))
  const placements: WatermarkPlacement[] = []
  for (let r = 0; r < rows; r++) {
    const y = -boxH / 2 + (r + 0.5) * rowGap
    const offset = r % 2 === 1 ? colGap / 2 : 0
    const cols = Math.max(1, Math.ceil((boxW + colGap) / colGap))
    for (let c = 0; c < cols; c++) {
      const x = -boxW / 2 + offset + c * colGap
      if (x > boxW / 2) break
      placements.push({ x, y, text: opts.text, fontSize: opts.fontSize })
      if (placements.length >= MAX_WATERMARK_PLACEMENTS) return placements
    }
  }
  return placements
}

/**
 * 单条对角大字：字号按可用对角线长度自适应，保证不超出卡面。
 */
export function computeDiagonalLayout(
  width: number,
  height: number,
  input: Partial<WatermarkOptions> = {},
): WatermarkPlacement[] {
  const opts = resolveWatermarkOptions(input)
  const diagonal = Math.hypot(width, height)
  const usable = diagonal * 0.86
  const perChar = 0.62
  const fitted = usable / (Math.max(1, opts.text.length) * perChar)
  const fontSize = Math.max(opts.fontSize, Math.min(Math.floor(fitted), Math.floor(height * 0.3)))
  return [{ x: 0, y: 0, text: opts.text, fontSize }]
}

type Ctx2D = CanvasRenderingContext2D

/** 平铺水印：直接画进传入 ctx，不做任何离屏保护 */
export function drawWatermarkTile(
  ctx: Ctx2D,
  width: number,
  height: number,
  input: Partial<WatermarkOptions> = {},
): number {
  const opts = resolveWatermarkOptions(input)
  const placements = computeTileLayout(width, height, opts)
  if (placements.length === 0) throw new Error('水印平铺失败：未计算出任何落点')

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate((opts.angle * Math.PI) / 180)
  ctx.globalAlpha = opts.opacity
  ctx.fillStyle = opts.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of placements) {
    ctx.font = `${p.fontSize}px ${FONT_CN}`
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.restore()
  return placements.length
}

/** 对角单条大字水印 */
export function drawWatermarkDiagonal(
  ctx: Ctx2D,
  width: number,
  height: number,
  input: Partial<WatermarkOptions> = {},
): number {
  const opts = resolveWatermarkOptions(input)
  const placements = computeDiagonalLayout(width, height, opts)
  if (placements.length === 0) throw new Error('水印绘制失败：对角模式未生成落点')

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate((opts.angle * Math.PI) / 180)
  ctx.globalAlpha = opts.opacity
  ctx.fillStyle = opts.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const p of placements) {
    ctx.font = `${p.fontSize}px ${FONT_CN}`
    ctx.fillText(p.text, p.x, p.y)
  }
  ctx.restore()
  return placements.length
}

/**
 * 底部固定居中水印条（导出时的第二重保险）。
 * 叠加在画面内部，随图一并栅格化，无法通过裁切绕开。
 */
export function drawBottomWatermarkBar(
  ctx: Ctx2D,
  width: number,
  height: number,
  input: Partial<WatermarkOptions> = {},
): void {
  const opts = resolveWatermarkOptions(input)
  const barHeight = Math.max(opts.fontSize + 8, Math.round(height * 0.11))
  const y = height - barHeight

  ctx.save()
  ctx.globalAlpha = Math.min(0.28, Math.max(0.12, opts.opacity))
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, y, width, barHeight)
  ctx.globalAlpha = Math.max(0.4, Math.min(MAX_OPACITY + 0.2, opts.opacity + 0.22))
  ctx.fillStyle = opts.color
  ctx.font = `${Math.max(9, Math.round(opts.fontSize * 0.8))}px ${FONT_CN}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(opts.text, width / 2, y + barHeight / 2)
  ctx.restore()
}

/**
 * 破坏性水印入口：平铺/对角 + 可选底部条。
 *
 * `enabled: false` 时整条链路不绘制，返回 0——这是用户显式配置，不算失败。
 * 启用时任何异常都会被重新包装抛出，绝不静默跳过。
 * @returns 实际绘制的水印条目数
 */
export function applyWatermark(
  ctx: Ctx2D,
  width: number,
  height: number,
  input: Partial<WatermarkOptions> = {},
): number {
  const opts = resolveWatermarkOptions(input)
  if (!opts.enabled) return 0
  if (!ctx || typeof ctx.fillText !== 'function' || typeof ctx.save !== 'function') {
    throw new Error('水印绘制失败：缺少可用的 2D 上下文')
  }
  if (!(width > 0) || !(height > 0)) {
    throw new Error(`水印绘制失败：非法画布尺寸 ${width}×${height}`)
  }
  try {
    const count =
      opts.mode === 'diagonal'
        ? drawWatermarkDiagonal(ctx, width, height, opts)
        : drawWatermarkTile(ctx, width, height, opts)
    if (opts.bottomBar) drawBottomWatermarkBar(ctx, width, height, opts)
    if (count === 0) throw new Error('未产生任何水印条目')
    return count
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`水印绘制失败，已中止导出：${message}`)
  }
}

const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s)

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function uint32BE(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = ascii(type)
  const crcInput = concat([typeBytes, data])
  return concat([uint32BE(data.length), crcInput, uint32BE(crc32(crcInput))])
}

/** 按需求写入 tEXt（keyword: DemoOnly） */
export function buildTextChunk(keyword: string, value: string): Uint8Array {
  return buildChunk('tEXt', concat([ascii(keyword), new Uint8Array([0]), utf8(value)]))
}

/** 追加一个严格合规的 iTXt（tEXt 正式规范只允许 Latin-1，中文另发一条 UTF-8 的 iTXt） */
export function buildITextChunk(keyword: string, value: string): Uint8Array {
  const data = concat([ascii(keyword), new Uint8Array([0, 0, 0]), ascii('zh-CN'), new Uint8Array([0, 0]), utf8(value)])
  return buildChunk('iTXt', data)
}

/**
 * 在 IEND 之前插入文本元数据块。
 * @throws 入参不是合法 PNG 时抛出
 */
export function insertPngTextChunks(png: Uint8Array, entries: Array<{ keyword: string; value: string }>): Uint8Array {
  if (!(png instanceof Uint8Array) || png.length < 12) throw new TypeError('insertPngTextChunks 需要非空的 PNG 字节流')
  for (let i = 0; i < 8; i++) {
    if (png[i] !== PNG_SIGNATURE[i]) throw new TypeError('数据不是 PNG（签名不匹配）')
  }
  const tail = png.slice(png.length - 12)
  const tailType = String.fromCharCode(...tail.slice(4, 8))
  if (tailType !== 'IEND') throw new TypeError('PNG 缺少结尾 IEND 块')

  const extras = concat(
    entries.flatMap((e) => [buildTextChunk(e.keyword, e.value), buildITextChunk(e.keyword, e.value)]),
  )
  return concat([png.slice(0, png.length - 12), extras, tail])
}

/** base64 ↔ Uint8Array，浏览器与 Node 都提供 atob/btoa */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(bin)
}

/**
 * 把水印文案写进 PNG 数据 URL 的元数据里（不改变可见像素）。
 *
 * 非 PNG（如 JPG）原样返回——JPG 没有等价文本块，
 * 但可见水印与底部条仍然已经烧进像素。
 */
export function embedWatermarkMetadata(dataUrl: string, text: string): string {
  const match = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl.trim())
  if (!match) throw new TypeError('embedWatermarkMetadata 只接受 png/jpeg 的 base64 data URL')
  const [, mime, body] = match
  if (mime.toLowerCase() === 'png') {
    const withMeta = insertPngTextChunks(base64ToBytes(body), [{ keyword: PNG_TEXT_KEYWORD, value: text }])
    return `data:image/png;base64,${bytesToBase64(withMeta)}`
  }
  return dataUrl
}

function indexOfZero(bytes: Uint8Array, from: number): number {
  const i = bytes.indexOf(0, from)
  return i < 0 ? bytes.length : i
}

/** 从 tEXt / iTXt 数据段里取出 DemoOnly 的文案 */
function extractTextPayload(type: string, data: Uint8Array): string | null {
  const nul = data.indexOf(0)
  if (nul < 0) return null
  if (String.fromCharCode(...data.slice(0, nul)) !== PNG_TEXT_KEYWORD) return null
  if (type === 'tEXt') return new TextDecoder().decode(data.subarray(nul + 1))
  // iTXt：压缩标志(1) + 压缩方式(1) + 语言标签\0 + 翻译关键词\0 + UTF-8 正文
  let p = nul + 3
  p = indexOfZero(data, p) + 1
  p = indexOfZero(data, p) + 1
  return new TextDecoder().decode(data.subarray(Math.min(p, data.length)))
}

/** 从 PNG data URL 中读回 DemoOnly 文案，用于导出后自检 */
export function readWatermarkMetadata(dataUrl: string): string | null {
  const match = /^data:image\/png;base64,(.+)$/i.exec(dataUrl.trim())
  if (!match) return null
  const bytes = base64ToBytes(match[1])
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const length =
      ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
    const payload = extractTextPayload(type, bytes.subarray(offset + 8, offset + 8 + length))
    if (payload !== null) return payload
    if (type === 'IEND') break
    offset += 12 + length
  }
  return null
}
