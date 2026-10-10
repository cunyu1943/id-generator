import type { Canvas2DLike, IdCardDisplayData, RenderOptions, RenderPipelineOptions } from '../types/idcard'
import { CARD, FONT_CN, FONT_MONO, USAGE_NOTICE } from './templates'
import { getImages } from './assets'
import { applyWatermark } from './watermark'
import {
  createCanvas,
  drawCardBackground,
  drawCardFrame,
  drawFront,
  drawLabelValue,
  drawSpacedText,
  FRONT_LAYOUT,
  get2dContext,
  toDottedDate,
  wrapText,
} from './drawFront'

type Ctx2D = CanvasRenderingContext2D

/** 反面排版常量（逻辑像素） */
export const BACK_LAYOUT = {
  /** 样图为两行标题：国家名一行、证件名一行，后者字号更大以对齐宽度 */
  title: {
    line1: { text: '中华人民共和国', y: 44, fontSize: 18, spacing: 2 },
    line2: { text: '居民身份证', y: 74, fontSize: 25, spacing: 6 },
    centerX: CARD.width / 2 + 18,
  },
  /** 国徽占位图移到左上角，配色改红，尺寸按样图缩小 */
  emblem: { cx: 46, cy: 52, radius: 21, ticks: 8, starPoints: 5, captionY: 82 },
  authority: { x: 26, y: 158 },
  validity: { x: 26, y: 184 },
  fonts: { label: 12 },
  colors: { title: '#12212e', label: '#12212e', value: '#12212e', emblem: '#b3261e' },
} as const

/** 底板上的一个字段：mask 是需要盖掉的原始值区域，x / baseline 是生成值的落笔位置 */
export interface PlateField {
  mask: { x: number; y: number; w: number; h: number }
  x: number
  baseline: number
}

/**
 * 反面样例底板（真实卡面照片裁成 460×292 后铺满 358×220）自带国徽、两行标题与
 * 「签发机关 / 有效期限」标签，所以启用底板时不再画我们自己的一套，只盖遮罩、补生成值。
 * 坐标由底板像素按 358/460、220/292 换算取整；字号按底板标签字高 14px 折算约 11px。
 */
export const BACK_PLATE: {
  fill: string
  fontSize: number
  authority: PlateField
  validity: PlateField
} = {
  /** 遮罩色：两行原始值区域的背景均值 */
  fill: '#dddee2',
  fontSize: 11,
  authority: { mask: { x: 139, y: 154, w: 146, h: 20 }, x: 142, baseline: 169 },
  validity: { mask: { x: 139, y: 182, w: 146, h: 21 }, x: 142, baseline: 198 },
} as const

/** 合并导出：正反面纵向拼接的参数 */
export const COMBINE_LAYOUT = { gap: 40, labelFontSize: 9 } as const

/** 五角星路径（国徽占位图内部使用，纯几何） */
export function starPath(ctx: Ctx2D, cx: number, cy: number, outerR: number, innerR: number, points = 5): void {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    const x = cx + r * Math.cos(angle)
    const y = cy + r * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
}

/**
 * 国徽占位图：虚线外圈 + 刻度 + 五角星 + 「国徽占位」字样。
 * 刻意保持抽象示意，不使用任何真实国徽素材。
 */
export function drawEmblemPlaceholder(ctx: Ctx2D): void {
  const { cx, cy, radius, ticks, captionY } = BACK_LAYOUT.emblem
  ctx.save()
  ctx.strokeStyle = BACK_LAYOUT.colors.emblem
  ctx.fillStyle = BACK_LAYOUT.colors.emblem
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, radius * 0.82, 0, Math.PI * 2)
  ctx.stroke()

  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * radius * 0.86, cy + Math.sin(a) * radius * 0.86)
    ctx.lineTo(cx + Math.cos(a) * radius * 0.98, cy + Math.sin(a) * radius * 0.98)
    ctx.stroke()
  }

  starPath(ctx, cx, cy - 1, radius * 0.46, radius * 0.19)
  ctx.fill()

  ctx.globalAlpha = 0.95
  ctx.font = `bold 8px ${FONT_CN}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('国徽占位', cx, captionY)
  ctx.restore()
}

/**
 * 有效期限拆成两段：日期段用等宽字体（与正面身份证号一致），
 * 「长期」是中文，继续走中文字体，避免 mono 字体回退出另一套字形。
 */
export function validityParts(validFrom: string, validTo: string, longTerm: boolean): [string, string] {
  const from = toDottedDate(validFrom)
  return longTerm ? [`${from}-`, '长期'] : [`${from}-${toDottedDate(validTo)}`, '']
}

/** 有效期限文本：长期显示为「起始-长期」；日期之间不留空格，便于 OCR 整段识别 */
export function formatValidity(validFrom: string, validTo: string, longTerm: boolean): string {
  return validityParts(validFrom, validTo, longTerm).join('')
}

/** 有效期限的值：日期段用等宽字体（与正面身份证号同族），「长期」是中文、另起一段走中文字体 */
function drawValidityValue(ctx: Ctx2D, data: IdCardDisplayData, x: number, y: number, fontSize: number): void {
  const [dateText, tailText] = validityParts(data.validFrom, data.validTo, data.longTerm)
  ctx.fillStyle = BACK_LAYOUT.colors.value
  ctx.font = `${fontSize}px ${FONT_MONO}`
  ctx.fillText(dateText, x, y)
  if (tailText) {
    // 字宽必须在中文字体之前量：换字体之后再 measureText 得到的是另一套宽度，「长期」会压掉日期段的连字符
    const dateWidth = ctx.measureText(dateText).width
    ctx.font = `${fontSize}px ${FONT_CN}`
    ctx.fillText(tailText, x + dateWidth, y)
  }
}

/** 有效期限整行（程序化反面）：标签加粗中文 + 日期等宽 + 可选中文尾缀 */
function drawValidityRow(ctx: Ctx2D, data: IdCardDisplayData): void {
  const B = BACK_LAYOUT
  const label = '有效期限'
  ctx.font = `bold ${B.fonts.label}px ${FONT_CN}`
  ctx.fillStyle = B.colors.label
  ctx.fillText(label, B.validity.x, B.validity.y)
  const valueX = B.validity.x + ctx.measureText(label).width + FRONT_LAYOUT.labelGap
  drawValidityValue(ctx, data, valueX, B.validity.y, FRONT_LAYOUT.fonts.idNumber)
}

/**
 * 底板反面的两行生成值：先用遮罩盖掉底板自带的原始值，再在标签右侧落字。
 * 签发机关可能很长，超出遮罩宽度就按「…」截断，避免压到卡面右侧花纹以外的区域。
 */
function drawPlateValues(ctx: Ctx2D, data: IdCardDisplayData): void {
  const P = BACK_PLATE
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = P.fill
  for (const field of [P.authority, P.validity]) {
    ctx.fillRect(field.mask.x, field.mask.y, field.mask.w, field.mask.h)
  }

  ctx.font = `${P.fontSize}px ${FONT_CN}`
  ctx.fillStyle = BACK_LAYOUT.colors.value
  // 右侧留 4px 余量，避免长机构名的最后一个字贴着遮罩边缘
  const authorityWidth = P.authority.mask.x + P.authority.mask.w - P.authority.x - 4
  ctx.fillText(wrapText(ctx, data.issueAuthority, authorityWidth, 1).lines[0], P.authority.x, P.authority.baseline)

  drawValidityValue(ctx, data, P.validity.x, P.validity.baseline, P.fontSize)
  ctx.restore()
}

/**
 * 绘制身份证反面。
 * 同样只依赖 (ctx, data, options)，ctx 已按 scale 缩放。
 */
export function drawBack(ctx: Ctx2D, data: IdCardDisplayData, options: RenderOptions): void {
  const images = options.images ?? getImages()
  const w = CARD.width
  const h = CARD.height
  const B = BACK_LAYOUT

  const painted = drawCardBackground(ctx, images.backTemplate ?? null, w, h, options.useTemplateBackground, [
    '#eaf6f5',
    '#cde2e7',
  ])
  if (painted) {
    // 底板自带国徽、标题、两行标签和边框（连圆角也是照片里的），这里只补遮罩与生成值
    drawPlateValues(ctx, data)
    return
  }

  ctx.save()
  ctx.fillStyle = B.colors.title
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `bold ${B.title.line1.fontSize}px ${FONT_CN}`
  drawSpacedText(ctx, B.title.line1.text, B.title.centerX, B.title.line1.y, B.title.line1.spacing)
  ctx.font = `bold ${B.title.line2.fontSize}px ${FONT_CN}`
  drawSpacedText(ctx, B.title.line2.text, B.title.centerX, B.title.line2.y, B.title.line2.spacing)
  ctx.restore()

  drawEmblemPlaceholder(ctx)

  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  drawLabelValue(ctx, '签发机关', data.issueAuthority, B.authority.x, B.authority.y, B.fonts.label)
  drawValidityRow(ctx, data)
  ctx.restore()

  drawCardFrame(ctx, w, h)
}

/** 已渲染好的单面画布，供合并与导出复用 */
export interface RenderedSide {
  canvas: Canvas2DLike
  width: number
  height: number
}

/** 内部：创建高清画布 → 绘制 →（可选）叠加水印 */
function renderSide(
  draw: (ctx: Ctx2D, data: IdCardDisplayData, options: RenderOptions) => void,
  data: IdCardDisplayData,
  options: RenderPipelineOptions,
  withWatermark: boolean,
): RenderedSide {
  const scale = options.scale > 0 ? options.scale : 1
  const width = Math.round(CARD.width * scale)
  const height = Math.round(CARD.height * scale)
  const canvas = createCanvas(width, height, options.canvasFactory)
  const ctx = get2dContext(canvas)
  ctx.scale(scale, scale)
  draw(ctx, data, { ...options, images: options.images ?? getImages() })
  // 水印在缩放后的逻辑坐标系内绘制，与卡面一起栅格化，导出后不可分离
  if (withWatermark) applyWatermark(ctx, CARD.width, CARD.height, options.watermark)
  return { canvas, width, height }
}

/**
 * 渲染正面（含水印）。导出链路必须走这两个函数，
 * 水印叠加写在函数内部，调用方无法跳过。
 */
export function renderFront(data: IdCardDisplayData, options: RenderPipelineOptions): RenderedSide {
  return renderSide(drawFront, data, options, true)
}

/** 渲染反面（含水印） */
export function renderBack(data: IdCardDisplayData, options: RenderPipelineOptions): RenderedSide {
  return renderSide(drawBack, data, options, true)
}

/**
 * 不带水印的裸渲染，仅供预览层使用：
 * WatermarkLayer 组件会在这一步的结果上再做破坏性叠加，
 * 因此预览与导出各只叠一次，不会出现双重水印。
 */
export function renderFrontRaw(data: IdCardDisplayData, options: RenderPipelineOptions): RenderedSide {
  return renderSide(drawFront, data, options, false)
}

/** 不带水印的裸反面，用途同 renderFrontRaw */
export function renderBackRaw(data: IdCardDisplayData, options: RenderPipelineOptions): RenderedSide {
  return renderSide(drawBack, data, options, false)
}

/** 内部：纵向拼接两面 →（可选）整体叠加一次水印 */
function combineSides(
  front: RenderedSide,
  back: RenderedSide,
  options: RenderPipelineOptions,
  withWatermark: boolean,
): RenderedSide {
  const scale = options.scale > 0 ? options.scale : 1
  const width = Math.max(front.width, back.width)
  const gap = Math.round(COMBINE_LAYOUT.gap * scale)
  const height = front.height + gap + back.height
  const canvas = createCanvas(width, height, options.canvasFactory)
  const ctx = get2dContext(canvas)
  ctx.scale(scale, scale)

  ctx.fillStyle = '#f2f4f7'
  ctx.fillRect(0, 0, width / scale, height / scale)
  ctx.drawImage(
    front.canvas as CanvasImageSource,
    (width - front.width) / 2 / scale,
    0,
    front.width / scale,
    front.height / scale,
  )
  ctx.drawImage(
    back.canvas as CanvasImageSource,
    (width - back.width) / 2 / scale,
    (front.height + gap) / scale,
    back.width / scale,
    back.height / scale,
  )

  const dividerY = front.height / scale + gap / scale / 2
  ctx.fillStyle = '#4b5563'
  ctx.font = `${COMBINE_LAYOUT.labelFontSize}px ${FONT_CN}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`正面 / 反面 · ${USAGE_NOTICE}`, width / scale / 2, dividerY)

  if (withWatermark) applyWatermark(ctx, width / scale, height / scale, { ...options.watermark, bottomBar: true })
  return { canvas, width, height }
}

/**
 * 双面纵向合并（含水印）：正面在上、反面在下，中间 COMBINE_LAYOUT.gap 的分隔带与说明文字。
 * 传入的两面应为裸渲染结果（renderFrontRaw/renderBackRaw），水印在这里整体叠加一次，
 * 避免与单面水印叠加导致合并图浓淡与单面导出不一致。
 */
export function renderCombined(front: RenderedSide, back: RenderedSide, options: RenderPipelineOptions): RenderedSide {
  return combineSides(front, back, options, true)
}

/** 不带水印的合并图，仅供预览层使用（WatermarkLayer 会整体叠加一次） */
export function renderCombinedRaw(
  front: RenderedSide,
  back: RenderedSide,
  options: RenderPipelineOptions,
): RenderedSide {
  return combineSides(front, back, options, false)
}

/** 画布导出为 dataURL；优先 toDataURL（HTMLCanvasElement），OffscreenCanvas 明确报错 */
export function canvasToDataUrl(canvas: Canvas2DLike, format: 'png' | 'jpg' = 'png', quality = 0.92): string {
  const withDataUrl = canvas as unknown as { toDataURL?: (type: string, q?: number) => string }
  if (typeof withDataUrl.toDataURL !== 'function') {
    throw new Error('当前画布不支持 toDataURL，请使用 HTMLCanvasElement（渲染层默认即为此类型）')
  }
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
  // JPG 无透明通道，白底由渲染层保证
  return withDataUrl.toDataURL(mime, format === 'jpg' ? quality : undefined)
}
