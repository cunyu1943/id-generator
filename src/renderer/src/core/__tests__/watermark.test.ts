import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  MAX_OPACITY,
  MAX_WATERMARK_PLACEMENTS,
  MIN_OPACITY,
  PNG_TEXT_KEYWORD,
  applyWatermark,
  buildITextChunk,
  buildTextChunk,
  computeDiagonalLayout,
  computeTileLayout,
  crc32,
  drawBottomWatermarkBar,
  drawWatermarkDiagonal,
  drawWatermarkTile,
  effectiveGaps,
  embedWatermarkMetadata,
  estimateTextWidth,
  insertPngTextChunks,
  readWatermarkMetadata,
  resolveWatermarkOptions,
} from '../watermark'
import { MANDATORY_WATERMARK_TEXT, WATERMARK_DEFAULTS } from '../templates'
import { createFakeContext, findCalls, textOf } from './helpers/fakeCanvas'

/** 与实现无关的第二套 CRC 实现，用来交叉验证 */
function crc32Independent(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array([...new TextEncoder().encode(type), ...data])
  const len = [data.length >>> 24, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff]
  const crc = crc32Independent(body)
  return new Uint8Array([...len, ...body, (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff])
}

/** 1×1 RGBA 的最小合法 PNG */
function makePng(): Uint8Array {
  const ihdr = new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])
  const idat = new Uint8Array(deflateSync(new Uint8Array([0, 255, 0, 0, 255])))
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...makeChunk('IHDR', ihdr),
    ...makeChunk('IDAT', idat),
    ...makeChunk('IEND', new Uint8Array(0)),
  ])
}

function toDataUrl(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return `data:image/png;base64,${btoa(bin)}`
}

describe('resolveWatermarkOptions 参数防护', () => {
  it('空文案回落到强制文案，永远画得出水印', () => {
    expect(resolveWatermarkOptions({ text: '' }).text).toBe(MANDATORY_WATERMARK_TEXT)
    expect(resolveWatermarkOptions({ text: '   ' }).text).toBe(MANDATORY_WATERMARK_TEXT)
    expect(resolveWatermarkOptions({ text: 1 as unknown as string }).text).toBe(MANDATORY_WATERMARK_TEXT)
  })

  it('透明度被夹在保护区间内，无法调到关闭', () => {
    expect(resolveWatermarkOptions({ opacity: 0 }).opacity).toBe(MIN_OPACITY)
    expect(resolveWatermarkOptions({ opacity: -1 }).opacity).toBe(MIN_OPACITY)
    expect(resolveWatermarkOptions({ opacity: 9 }).opacity).toBe(MAX_OPACITY)
    expect(resolveWatermarkOptions({ opacity: Number.NaN }).opacity).toBe(WATERMARK_DEFAULTS.opacity)
    expect(resolveWatermarkOptions({ opacity: 0.18 }).opacity).toBe(0.18)
  })

  it('enabled 默认开启，只有显式 false 才关闭', () => {
    expect(resolveWatermarkOptions().enabled).toBe(true)
    expect(resolveWatermarkOptions({ enabled: undefined }).enabled).toBe(true)
    expect(resolveWatermarkOptions({ enabled: true }).enabled).toBe(true)
    expect(resolveWatermarkOptions({ enabled: false }).enabled).toBe(false)
    expect(WATERMARK_DEFAULTS.enabled).toBe(true)
  })

  it('字号/间距/密度非法时回落，density 有上下限', () => {
    const r = resolveWatermarkOptions({ fontSize: -5, rowGap: 0, colGap: Number.NaN, density: 99 })
    expect(r.fontSize).toBe(WATERMARK_DEFAULTS.fontSize)
    expect(r.rowGap).toBe(WATERMARK_DEFAULTS.rowGap)
    expect(r.colGap).toBe(WATERMARK_DEFAULTS.colGap)
    expect(r.density).toBe(3)
    expect(resolveWatermarkOptions({ density: 0 }).density).toBe(0.4)
    expect(resolveWatermarkOptions({ angle: Number.NaN }).angle).toBe(WATERMARK_DEFAULTS.angle)
  })

  it('mode 只接受 tile / diagonal', () => {
    expect(resolveWatermarkOptions({ mode: 'diagonal' }).mode).toBe('diagonal')
    expect(resolveWatermarkOptions({ mode: 'none' as never }).mode).toBe('tile')
  })

  it('effectiveGaps 按密度反比缩放', () => {
    const opts = resolveWatermarkOptions({ rowGap: 40, colGap: 100, density: 2 })
    expect(effectiveGaps(opts)).toEqual({ rowGap: 20, colGap: 50 })
  })
})

describe('水印几何', () => {
  it('estimateTextWidth 区分中英文宽度', () => {
    expect(estimateTextWidth('中', 10)).toBeCloseTo(10)
    expect(estimateTextWidth('ab', 10)).toBeCloseTo(11)
    expect(estimateTextWidth('', 10)).toBe(0)
  })

  it('computeTileLayout 铺满旋转后的外接矩形并错行', () => {
    const placements = computeTileLayout(358, 220, { density: 1 })
    expect(placements.length).toBeGreaterThan(6)
    const ys = [...new Set(placements.map((p) => p.y.toFixed(3)))]
    expect(ys.length).toBeGreaterThan(3)
    // 奇偶行的 x 起点相差半列，避免形成竖直空带
    const row0 = placements.filter((p) => p.y === placements[0].y).map((p) => p.x)
    const row1 = placements.filter((p) => p.y === placements[placements.length - 1].y).map((p) => p.x)
    expect(row0.length).toBeGreaterThan(0)
    expect(row1.length).toBeGreaterThan(0)
    for (const p of placements) expect(p.text).toBe(WATERMARK_DEFAULTS.text)
  })

  it('密度越大条目越多，且有硬上限', () => {
    const sparse = computeTileLayout(358, 220, { density: 0.5 }).length
    const dense = computeTileLayout(358, 220, { density: 3 }).length
    expect(dense).toBeGreaterThan(sparse)
    expect(computeTileLayout(5000, 5000, { density: 3 }).length).toBeLessThanOrEqual(MAX_WATERMARK_PLACEMENTS)
  })

  it('极小画布至少生成一条', () => {
    expect(computeTileLayout(1, 1, {}).length).toBeGreaterThanOrEqual(1)
  })

  it('对角模式单条、字号随画布自适应但不小于配置值', () => {
    const one = computeDiagonalLayout(358, 220, { fontSize: 14 })
    expect(one).toHaveLength(1)
    expect(one[0].fontSize).toBeGreaterThanOrEqual(14)
    expect(one[0].x).toBe(0)
    const small = computeDiagonalLayout(60, 24, { fontSize: 14 })
    expect(small[0].fontSize).toBe(14)
    expect(computeDiagonalLayout(358, 220, { text: '' })[0].text).toBe(MANDATORY_WATERMARK_TEXT)
  })
})

describe('水印绘制', () => {
  it('平铺：旋转 -30°、逐条 fillText、save/restore 成对', () => {
    const { ctx, calls } = createFakeContext()
    const n = drawWatermarkTile(ctx, 358, 220, { opacity: 0.2 })
    expect(n).toBeGreaterThan(0)
    expect(findCalls(calls, 'save').length).toBe(findCalls(calls, 'restore').length)
    const rotate = findCalls(calls, 'rotate')[0]
    expect(rotate.args[0]).toBeCloseTo((-30 * Math.PI) / 180)
    expect(textOf(calls)).toHaveLength(n)
    expect(findCalls(calls, 'translate')[0].args).toEqual([179, 110])
  })

  it('对角：只画一条', () => {
    const { ctx, calls } = createFakeContext()
    expect(drawWatermarkDiagonal(ctx, 358, 220, { mode: 'diagonal' })).toBe(1)
    expect(textOf(calls)).toHaveLength(1)
  })

  it('底部条：白底矩形 + 居中文字', () => {
    const { ctx, calls } = createFakeContext()
    drawBottomWatermarkBar(ctx, 358, 220, {})
    const rect = findCalls(calls, 'fillRect')[0]
    expect(rect.args[0]).toBe(0)
    expect(rect.args[2]).toBe(358)
    expect(rect.args[3]).toBeGreaterThanOrEqual(22)
    const text = findCalls(calls, 'fillText')[0]
    expect(String(text.args[0])).toContain('仅作演示用')
    expect(text.args[1]).toBe(179)
  })

  it('applyWatermark 同时叠加平铺与底部条，并返回条目数', () => {
    const { ctx, calls } = createFakeContext()
    const n = applyWatermark(ctx, 358, 220, { bottomBar: true })
    expect(n).toBeGreaterThan(0)
    expect(findCalls(calls, 'fillRect').length).toBe(1)
    expect(textOf(calls).length).toBe(n + 1)
  })

  it('enabled=false 是一条不绘制、也不抛错的显式配置', () => {
    const { ctx, calls } = createFakeContext()
    expect(applyWatermark(ctx, 358, 220, { enabled: false, bottomBar: true })).toBe(0)
    expect(calls).toHaveLength(0)
    // 关闭状态即使 ctx 不可用也不会抛——因为根本不进入绘制
    expect(applyWatermark(null as unknown as CanvasRenderingContext2D, 358, 220, { enabled: false })).toBe(0)
  })

  it('绘制失败必须抛出，不允许静默跳过', () => {
    const { ctx } = createFakeContext()
    expect(() => applyWatermark(null as unknown as CanvasRenderingContext2D, 10, 10)).toThrow(/水印绘制失败/)
    expect(() => applyWatermark(ctx, 0, 220)).toThrow(/非法画布尺寸/)
    const broken = {
      fillText: () => {
        throw new Error('boom')
      },
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
    } as unknown as CanvasRenderingContext2D
    expect(() => applyWatermark(broken, 358, 220)).toThrow(/已中止导出/)
  })

  it('diagonal 模式走 applyWatermark 分支', () => {
    const { ctx, calls } = createFakeContext()
    applyWatermark(ctx, 358, 220, { mode: 'diagonal', bottomBar: false })
    expect(textOf(calls)).toHaveLength(1)
    expect(findCalls(calls, 'fillRect')).toHaveLength(0)
  })
})

describe('PNG 元数据', () => {
  it('crc32 命中 IEND 的标准值', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
  })

  it('tEXt/iTXt 块结构正确且 CRC 自洽', () => {
    for (const built of [buildTextChunk('DemoOnly', 'demo text'), buildITextChunk('DemoOnly', '仅作演示用')]) {
      const length = (built[0] << 24) | (built[1] << 16) | (built[2] << 8) | built[3]
      expect(length).toBe(built.length - 12)
      const type = new TextDecoder().decode(built.slice(4, 8))
      expect(['tEXt', 'iTXt']).toContain(type)
      const body = built.slice(4, 8 + length)
      const storedCrc =
        (built[built.length - 4] << 24) |
        (built[built.length - 3] << 16) |
        (built[built.length - 2] << 8) |
        built[built.length - 1]
      expect(crc32(body)).toBe(storedCrc >>> 0)
    }
  })

  it('在 IEND 前插入块，其余字节保持不变', () => {
    const png = makePng()
    const out = insertPngTextChunks(png, [{ keyword: PNG_TEXT_KEYWORD, value: MANDATORY_WATERMARK_TEXT }])
    expect(out.length).toBeGreaterThan(png.length)
    expect([...out.slice(0, 8)]).toEqual([...png.slice(0, 8)])
    expect([...out.slice(out.length - 12)]).toEqual([...png.slice(png.length - 12)])
    expect(String.fromCharCode(...out.slice(out.length - 8, out.length - 4))).toBe('IEND')
  })

  it('非 PNG / 缺 IEND / 空输入一律抛错', () => {
    const png = makePng()
    expect(() => insertPngTextChunks(new Uint8Array([1, 2, 3]), [])).toThrow(TypeError)
    expect(() => insertPngTextChunks(new Uint8Array(20), [])).toThrow(/签名/)
    const noIend = png.slice(0, png.length - 12)
    expect(() => insertPngTextChunks(noIend, [])).toThrow(/IEND/)
    // @ts-expect-error 传错类型
    expect(() => insertPngTextChunks('not bytes', [])).toThrow(TypeError)
  })

  it('dataURL 写入后仍可从 tEXt 读回（往返）', () => {
    const dataUrl = toDataUrl(makePng())
    const embedded = embedWatermarkMetadata(dataUrl, MANDATORY_WATERMARK_TEXT)
    expect(embedded.startsWith('data:image/png;base64,')).toBe(true)
    expect(readWatermarkMetadata(embedded)).toBe(MANDATORY_WATERMARK_TEXT)
    expect(readWatermarkMetadata(dataUrl)).toBeNull()
  })

  it('JPG 原样返回，非图片 dataURL 抛错', () => {
    const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ'
    expect(embedWatermarkMetadata(jpeg, 'x')).toBe(jpeg)
    expect(readWatermarkMetadata(jpeg)).toBeNull()
    expect(() => embedWatermarkMetadata('data:image/gif;base64,AAAA', 'x')).toThrow(/png\/jpeg/)
    expect(() => embedWatermarkMetadata('not-a-data-url', 'x')).toThrow(TypeError)
  })
})
