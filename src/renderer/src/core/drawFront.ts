import type { Canvas2DLike, CanvasFactory, CanvasImageLike, IdCardDisplayData, RenderOptions } from '../types/idcard'
import { CARD, FONT_CN, FONT_MONO } from './templates'
import { getImages } from './assets'

type Ctx2D = CanvasRenderingContext2D

/** 正面排版常量（全部为逻辑像素，实际输出尺寸由 ctx 的 scale 决定） */
export const FRONT_LAYOUT = {
  labelX: CARD.textLeft,
  labelGap: 7,
  rows: { name: 60, mixed: 88, birth: 113, address: 138, idNumber: 190 },
  /** 性别与民族同排；民族列固定起点，避免「男/女」与多字民族混排时列位跳动 */
  mixedColumns: { gender: CARD.textLeft, nation: 132 },
  /** 住址文字右边界：留到人像区左侧之外，不与照片叠字 */
  addressRight: CARD.photo.x - 10,
  lineHeight: 15,
  addressMaxLines: 3,
  fonts: { label: 12, value: 12, idNumber: 16 },
  colors: { label: '#12212e', value: '#12212e', idNumber: '#0b1a2b' },
} as const

/** 号码类数字串的统一字体：正面身份证号与反面有效期限的日期共用，避免两处漂移 */
export const NUMBER_FONT = `${FRONT_LAYOUT.fonts.idNumber}px ${FONT_MONO}`

/** 圆角矩形路径（不依赖 ctx.roundRect，兼容性更稳） */
export function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

/** 卡面四周的圆角描边：真实卡面有一圈深色细框，样图同样如此 */
export function drawCardFrame(ctx: Ctx2D, w: number, h: number): void {
  const { inset, radius, lineWidth, color } = CARD.frame
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  roundRectPath(ctx, inset, inset, w - inset * 2, h - inset * 2, radius)
  ctx.stroke()
  ctx.restore()
}

/**
 * 居中裁剪：把任意比例的图片裁成 targetW:targetH，返回源矩形。
 * 保证人像不变形（只裁不拉）。
 */
export function centerCrop(
  img: CanvasImageLike,
  targetW: number,
  targetH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const targetRatio = targetW / targetH
  const srcRatio = img.width / img.height
  let sw = img.width
  let sh = img.height
  if (srcRatio > targetRatio) sw = img.height * targetRatio
  else sh = img.width / targetRatio
  return { sx: (img.width - sw) / 2, sy: (img.height - sh) / 2, sw, sh }
}

export interface WrappedText {
  lines: string[]
  truncated: boolean
}

/**
 * 贪心换行：最多 maxLines 行，超出部分以「…」结尾。
 * 逐字度量，中文/数字混排都能填满栏宽。
 */
export function wrapText(ctx: Ctx2D, text: string, maxWidth: number, maxLines: number): WrappedText {
  const limit = Math.max(1, maxLines)
  if (!(maxWidth > 0)) return { lines: [''], truncated: false }
  const chars = Array.from(text ?? '')
  const lines: string[] = []
  let current = ''
  let truncated = false

  for (let i = 0; i < chars.length; i++) {
    const next = current + chars[i]
    if (ctx.measureText(next).width > maxWidth && current !== '') {
      if (lines.length === limit - 1) {
        // 最后一行：尽量塞进「…」
        let tail = next
        while (tail.length > 1 && ctx.measureText(`${tail}…`).width > maxWidth) tail = tail.slice(0, -1)
        lines.push(`${tail}…`)
        truncated = true
        return { lines, truncated }
      }
      lines.push(current)
      current = chars[i]
    } else {
      current = next
    }
  }
  if (current !== '' || lines.length === 0) lines.push(current)
  return { lines: lines.slice(0, limit), truncated }
}

/** 标签左对齐（加粗）+ 值紧跟，返回值的起始 x */
export function drawLabelValue(
  ctx: Ctx2D,
  label: string,
  value: string,
  x: number,
  y: number,
  fontSize = FRONT_LAYOUT.fonts.label,
  gap = FRONT_LAYOUT.labelGap,
): number {
  ctx.font = `bold ${fontSize}px ${FONT_CN}`
  ctx.fillStyle = FRONT_LAYOUT.colors.label
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(label, x, y)
  const valueX = x + ctx.measureText(label).width + gap
  ctx.font = `${fontSize}px ${FONT_CN}`
  ctx.fillStyle = FRONT_LAYOUT.colors.value
  ctx.fillText(value, valueX, y)
  return valueX
}

/** 带字距的文本（标题用），逐字排布避免依赖 ctx.letterSpacing */
export function drawSpacedText(ctx: Ctx2D, text: string, centerX: number, y: number, spacing: number): void {
  const chars = Array.from(text)
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1)
  let cursor = centerX - total / 2
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y)
    cursor += widths[i] + spacing
  })
}

/**
 * 把可用宽度均分成 count 个字符槽位，返回每个槽位的中心 x。
 * 身份证号用等宽字体按槽位绘制，视觉上与真实卡面等宽对齐。
 */
export function computeSlotPositions(startX: number, endX: number, count: number): number[] {
  const slot = (endX - startX) / count
  return Array.from({ length: count }, (_, i) => startX + slot * (i + 0.5))
}

/**
 * 卡面底图：优先模板图，缺失时程序化渐变 + 细纹，保证无素材也能渲染（正面暖、反面冷，与样图一致）。
 * 返回是否真的画了模板图——反面底板自带标题与标签，调用方据此决定要不要再画自己的一套。
 */
export function drawCardBackground(
  ctx: Ctx2D,
  image: CanvasImageLike | null,
  w: number,
  h: number,
  useTemplate: boolean,
  tint: [string, string] = ['#fdeceb', '#f3d5d0'],
): boolean {
  if (useTemplate && image) {
    ctx.drawImage(image as CanvasImageSource, 0, 0, image.width, image.height, 0, 0, w, h)
    return true
  }
  const gradient = ctx.createLinearGradient(0, 0, w, h)
  gradient.addColorStop(0, tint[0])
  gradient.addColorStop(1, tint[1])
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.globalAlpha = 0.25
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 0.6
  for (let y = -h; y < h * 2; y += 7) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y + w * 0.35)
    ctx.stroke()
  }
  ctx.restore()
  return false
}

/** 人像区域：圆角裁切 + 描边 */
export function drawPortrait(ctx: Ctx2D, image: CanvasImageLike | null): void {
  const { x, y, w, h, radius } = CARD.photo
  ctx.save()
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.clip()
  if (image) {
    const { sx, sy, sw, sh } = centerCrop(image, w, h)
    ctx.drawImage(image as CanvasImageSource, sx, sy, sw, sh, x, y, w, h)
  } else {
    ctx.fillStyle = '#dbe7f2'
    ctx.fillRect(x, y, w, h)
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = '#b9c6d2'
  ctx.lineWidth = 0.6
  roundRectPath(ctx, x, y, w, h, radius)
  ctx.stroke()
  ctx.restore()
}

/** 「2000.02.29」形式的显示日期；接受 20000229 / 2000.2.29 / 2000-02-29 */
export function toDottedDate(value: string): string {
  const raw = (value ?? '').trim()
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}.${raw.slice(4, 6)}.${raw.slice(6, 8)}`
  const parts = raw.split(/[-./]/).filter(Boolean)
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    return `${parts[0].padStart(4, '0')}.${parts[1].padStart(2, '0')}.${parts[2].padStart(2, '0')}`
  }
  return raw
}

/** 正面「出生」行按样图使用中文年月日；无法解析时原样输出 */
export function toYearMonthDay(value: string): string {
  const dotted = toDottedDate(value)
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(dotted)
  if (!m) return dotted
  return `${m[1]} 年 ${Number(m[2])} 月 ${Number(m[3])} 日`
}

/**
 * 绘制身份证正面。
 *
 * 纯函数约定：只依赖 (ctx, data, options)，不读全局、不访问 DOM/网络。
 * ctx 应已由调用方 `scale(options.scale, options.scale)` 完成高清缩放。
 */
export function drawFront(ctx: Ctx2D, data: IdCardDisplayData, options: RenderOptions): void {
  const images = options.images ?? getImages()
  const w = CARD.width
  const h = CARD.height
  const L = FRONT_LAYOUT

  drawCardBackground(ctx, images.frontTemplate ?? null, w, h, options.useTemplateBackground)
  drawPortrait(ctx, images.face ?? images.defaultAvatars?.[data.gender] ?? null)

  ctx.save()
  drawLabelValue(ctx, '姓名', data.name, L.labelX, L.rows.name)

  const genderText = data.gender === 'male' ? '男' : '女'
  drawLabelValue(ctx, '性别', genderText, L.mixedColumns.gender, L.rows.mixed)
  drawLabelValue(ctx, '民族', data.nation, L.mixedColumns.nation, L.rows.mixed)
  drawLabelValue(ctx, '出生', toYearMonthDay(data.birthday), L.labelX, L.rows.birth)

  ctx.font = `bold ${L.fonts.label}px ${FONT_CN}`
  ctx.fillStyle = L.colors.label
  ctx.textAlign = 'left'
  ctx.fillText('住址', L.labelX, L.rows.address)
  const addressValueX = L.labelX + ctx.measureText('住址').width + L.labelGap
  const addressWidth = L.addressRight - addressValueX
  const { lines } = wrapText(ctx, data.address, addressWidth, L.addressMaxLines)
  ctx.font = `${L.fonts.value}px ${FONT_CN}`
  ctx.fillStyle = L.colors.value
  lines.forEach((line, i) => ctx.fillText(line, addressValueX, L.rows.address + i * L.lineHeight))

  // 号码行固定在水印底条之上，住址占满 3 行时也不会压到一起
  const idLabelY = L.rows.idNumber
  ctx.font = `bold ${L.fonts.label}px ${FONT_CN}`
  ctx.fillStyle = L.colors.label
  ctx.fillText('公民身份号码', L.labelX, idLabelY)
  const idStartX = L.labelX + ctx.measureText('公民身份号码').width + L.labelGap + 4
  const slots = computeSlotPositions(idStartX, w - CARD.rightMargin, 18)
  ctx.font = NUMBER_FONT
  ctx.fillStyle = L.colors.idNumber
  ctx.textAlign = 'center'
  const chars = Array.from(data.idNumber.padEnd(18, ' ').slice(0, 18))
  chars.forEach((ch, i) => ctx.fillText(ch, slots[i], idLabelY))
  ctx.restore()

  drawCardFrame(ctx, w, h)
}

/** 创建画布：优先 HTMLCanvasElement（需要 toDataURL 导出），其次 OffscreenCanvas */
export function createCanvas(width: number, height: number, factory?: CanvasFactory): Canvas2DLike {
  if (factory) return factory(width, height)
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const el = document.createElement('canvas')
    el.width = width
    el.height = height
    return el
  }
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height) as unknown as Canvas2DLike
  throw new Error('当前环境既没有 document 也没有 OffscreenCanvas，无法创建画布')
}

/** 取 2D 上下文，失败即抛（不允许降级到无水印渲染） */
export function get2dContext(canvas: Canvas2DLike): Ctx2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法获取 2D 绘图上下文')
  return ctx
}
