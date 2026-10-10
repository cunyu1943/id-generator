import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IdCardDisplayData, RenderPipelineOptions } from '../../types/idcard'
import {
  BACK_PLATE,
  canvasToDataUrl,
  drawBack,
  renderCombined,
  renderCombinedRaw,
  renderFront,
  renderFrontRaw,
  renderBack,
  renderBackRaw,
  formatValidity,
  starPath,
  validityParts,
} from '../drawBack'
import {
  FRONT_LAYOUT,
  centerCrop,
  computeSlotPositions,
  createCanvas,
  drawCardBackground,
  drawFront,
  drawLabelValue,
  drawPortrait,
  drawSpacedText,
  get2dContext,
  NUMBER_FONT,
  roundRectPath,
  toDottedDate,
  toYearMonthDay,
  wrapText,
} from '../drawFront'
import { CARD, MANDATORY_WATERMARK_TEXT, WATERMARK_DEFAULTS } from '../templates'
import { createFakeCanvas, createFakeContext, findCalls, textOf } from './helpers/fakeCanvas'

const DATA: IdCardDisplayData = {
  name: '赵演示',
  gender: 'male',
  nation: '汉',
  birthday: '19900307',
  address: '江苏省苏州市演示大道1号示例大厦1801室',
  idNumber: '320500199003070019',
  faceDataUrl: '',
  issueAuthority: '苏州市公安局演示分局',
  validFrom: '20150312',
  validTo: '20350312',
  longTerm: false,
}

const IMAGE = { width: 300, height: 400 }
const OPTIONS: RenderPipelineOptions = {
  scale: 3,
  watermark: WATERMARK_DEFAULTS,
  useTemplateBackground: false,
  images: {
    frontTemplate: IMAGE,
    backTemplate: IMAGE,
    defaultAvatars: { male: IMAGE, female: IMAGE },
    face: IMAGE,
  },
}

describe('排版工具', () => {
  it('toDottedDate 归一化各种输入', () => {
    expect(toDottedDate('19900307')).toBe('1990.03.07')
    expect(toDottedDate('1990.03.07')).toBe('1990.03.07')
    expect(toDottedDate('2015-3-7')).toBe('2015.03.07')
    expect(toDottedDate('2015')).toBe('2015')
  })

  it('toYearMonthDay 用中文年月日，月日不补零', () => {
    expect(toYearMonthDay('19900307')).toBe('1990 年 3 月 7 日')
    expect(toYearMonthDay('1990-03-07')).toBe('1990 年 3 月 7 日')
    expect(toYearMonthDay('2015')).toBe('2015')
  })

  it('centerCrop 只裁不拉，横图裁宽、竖图裁高', () => {
    const wide = centerCrop({ width: 400, height: 200 }, 78, 104)
    expect(wide.sw / wide.sh).toBeCloseTo(78 / 104)
    expect(wide.sh).toBe(200)
    const tall = centerCrop({ width: 100, height: 500 }, 78, 104)
    expect(tall.sw).toBe(100)
    expect(tall.sw / tall.sh).toBeCloseTo(78 / 104)
    const exact = centerCrop({ width: 78, height: 104 }, 78, 104)
    expect(exact).toEqual({ sx: 0, sy: 0, sw: 78, sh: 104 })
  })

  it('wrapText 单行/多行/末行省略', () => {
    const { ctx } = createFakeContext()
    const short = wrapText(ctx, 'AB', 1000, 3)
    expect(short).toEqual({ lines: ['AB'], truncated: false })
    const two = wrapText(ctx, '演示大道1号示例大厦', 5 * 11, 3)
    expect(two.lines.length).toBeGreaterThan(1)
    expect(two.truncated).toBe(false)
    const long = wrapText(ctx, '江苏省苏州市演示大道1号示例大厦1801室附加超长地址内容', 60, 3)
    expect(long.lines).toHaveLength(3)
    expect(long.truncated).toBe(true)
    expect(long.lines[2].endsWith('…')).toBe(true)
    expect(wrapText(ctx, 'ABC', 0, 3).lines).toEqual([''])
    expect(wrapText(ctx, '', 50, 0)).toEqual({ lines: [''], truncated: false })
  })

  it('computeSlotPositions 均分且居中', () => {
    const slots = computeSlotPositions(150, 346, 18)
    expect(slots).toHaveLength(18)
    const step = (346 - 150) / 18
    expect(slots[0]).toBeCloseTo(150 + step / 2)
    expect(slots[17]).toBeCloseTo(346 - step / 2)
    expect(slots[1] - slots[0]).toBeCloseTo(step)
  })

  it('drawSpacedText 逐字绘制并整体居中', () => {
    const { ctx, calls } = createFakeContext()
    ctx.font = '15px sans-serif'
    const chars = Array.from('中华人民共和国居民身份证')
    drawSpacedText(ctx, '中华人民共和国居民身份证', 179, 46, 4)
    expect(textOf(calls)).toEqual(chars)
    const firstX = Number(findCalls(calls, 'fillText')[0].args[1])
    const lastX = Number(findCalls(calls, 'fillText').at(-1)!.args[1])
    expect(firstX).toBeLessThan(lastX)
    expect((firstX + lastX) / 2).toBeGreaterThan(100)
  })

  it('roundRectPath / starPath 产生路径调用', () => {
    const { ctx, calls } = createFakeContext()
    roundRectPath(ctx, 0, 0, 10, 10, 3)
    expect(findCalls(calls, 'beginPath')).toHaveLength(1)
    expect(findCalls(calls, 'arcTo')).toHaveLength(4)
    expect(findCalls(calls, 'closePath')).toHaveLength(1)
    const { ctx: ctx2, calls: calls2 } = createFakeContext()
    starPath(ctx2, 50, 50, 20, 8)
    expect(findCalls(calls2, 'moveTo')).toHaveLength(1)
    expect(findCalls(calls2, 'lineTo')).toHaveLength(9)
  })

  it('drawLabelValue 值紧跟标签之后', () => {
    const { ctx, calls } = createFakeContext()
    const valueX = drawLabelValue(ctx, '姓名', '赵演示', 105, 74)
    expect(valueX).toBeGreaterThan(105)
    expect(textOf(calls)).toEqual(['姓名', '赵演示'])
    expect(findCalls(calls, 'fillText')[1].args[1]).toBe(valueX)
  })
})

describe('正面绘制', () => {
  const { ctx, calls } = createFakeContext()

  beforeEach(() => {
    calls.length = 0
  })

  it('人像区按样图靠右、沿用 78×104 尺寸并做圆角裁切', () => {
    drawFront(ctx, DATA, OPTIONS)
    const clipIndex = calls.findIndex((c) => c.op === 'clip')
    expect(clipIndex).toBeGreaterThan(-1)
    const arcTos = calls.slice(0, clipIndex).filter((c) => c.op === 'arcTo')
    expect(arcTos.length).toBe(4)
    const portrait = findCalls(calls, 'drawImage')[0]
    expect(portrait.args.slice(5)).toEqual([CARD.photo.x, CARD.photo.y, CARD.photo.w, CARD.photo.h])
    expect(portrait.args[0]).toBe(IMAGE)
  })

  it('未上传人像时按卡面性别取对应的内置头像', () => {
    const MALE = { width: 320, height: 427 }
    const FEMALE = { width: 477, height: 419 }
    const images = { defaultAvatars: { male: MALE, female: FEMALE } }
    drawFront(ctx, { ...DATA, gender: 'male' }, { ...OPTIONS, images })
    expect(findCalls(calls, 'drawImage')[0].args[0]).toBe(MALE)
    calls.length = 0
    drawFront(ctx, { ...DATA, gender: 'female' }, { ...OPTIONS, images })
    expect(findCalls(calls, 'drawImage')[0].args[0]).toBe(FEMALE)
  })

  it('无模板底图时程序化渐变兜底', () => {
    drawFront(ctx, DATA, { ...OPTIONS, images: {}, useTemplateBackground: false })
    expect(findCalls(calls, 'createLinearGradient').length).toBeGreaterThan(0)
    // 无头像可画时，仍会画一块占位底色
    expect(findCalls(calls, 'fillRect').length).toBeGreaterThan(0)
  })

  it('有模板底图时整幅贴图', () => {
    drawFront(ctx, DATA, { ...OPTIONS, useTemplateBackground: true })
    const bg = findCalls(calls, 'drawImage')[0]
    expect(bg.args.length).toBe(9)
    expect(bg.args.slice(5)).toEqual([0, 0, CARD.width, CARD.height])
  })

  it('六个字段全部落字，性别与民族同排、出生独立成行', () => {
    drawFront(ctx, DATA, OPTIONS)
    const texts = textOf(calls)
    expect(texts).toEqual(
      expect.arrayContaining([
        '姓名',
        '赵演示',
        '性别',
        '男',
        '民族',
        '汉',
        '出生',
        '1990 年 3 月 7 日',
        '住址',
        '公民身份号码',
      ]),
    )
    const yOf = (t: string): number => Number(findCalls(calls, 'fillText').find((c) => c.args[0] === t)!.args[2])
    expect(yOf('民族')).toBe(FRONT_LAYOUT.rows.mixed)
    expect(yOf('性别')).toBe(FRONT_LAYOUT.rows.mixed)
    expect(yOf('出生')).toBe(FRONT_LAYOUT.rows.birth)
    expect(yOf('姓名')).toBe(FRONT_LAYOUT.rows.name)
    // 样图布局：人像在右，与人像纵向重叠的文字必须落在人像左侧
    const upperRows = findCalls(calls, 'fillText').filter((c) => Number(c.args[2]) < CARD.photo.y + CARD.photo.h)
    expect(upperRows.length).toBeGreaterThan(0)
    for (const c of upperRows) expect(Number(c.args[1])).toBeLessThan(CARD.photo.x)
  })

  it('身份证号 18 个槽位、等宽字体、居中逐字', () => {
    drawFront(ctx, DATA, OPTIONS)
    const idCalls = findCalls(calls, 'fillText').slice(-18)
    expect(idCalls.map((c) => c.args[0])).toEqual(DATA.idNumber.split(''))
    expect(idCalls.every((c) => String(c.args[2]) === String(FRONT_LAYOUT.rows.idNumber))).toBe(true)
    const xs = idCalls.map((c) => Number(c.args[1]))
    expect(xs[17]).toBeGreaterThan(xs[0])
    const xsAsc = [...xs].sort((a, b) => a - b)
    expect(xs).toEqual(xsAsc)
  })

  it('短号码补齐槽位、超长截断', () => {
    drawFront(ctx, { ...DATA, idNumber: '123' }, OPTIONS)
    expect(
      findCalls(calls, 'fillText')
        .slice(-18)
        .map((c) => c.args[0])[0],
    ).toBe('1')
  })

  it('住址超过 3 行时省略号收尾且不越过右边距', () => {
    const longData: IdCardDisplayData = {
      ...DATA,
      address: '江苏省苏州市演示大道1号示例大厦1801室' + '附加文字'.repeat(20),
    }
    drawFront(ctx, longData, OPTIONS)
    const addrLines = findCalls(calls, 'fillText').filter(
      (c) =>
        c.args[0] !== '住址' &&
        Number(c.args[2]) >= FRONT_LAYOUT.rows.address &&
        Number(c.args[2]) < FRONT_LAYOUT.rows.idNumber - 10,
    )
    expect(addrLines).toHaveLength(3)
    expect(String(addrLines.at(-1)!.args[0]).endsWith('…')).toBe(true)
    for (const line of addrLines) expect(Number(line.args[1])).toBeGreaterThanOrEqual(CARD.textLeft)
  })

  it('女款性别文案', () => {
    drawFront(ctx, { ...DATA, gender: 'female' }, OPTIONS)
    expect(textOf(calls)).toContain('女')
  })

  it('drawPortrait 无图时画占位块', () => {
    drawPortrait(ctx, null)
    expect(findCalls(calls, 'clip')).toHaveLength(1)
    expect(findCalls(calls, 'stroke')).toHaveLength(1)
    expect(findCalls(calls, 'drawImage')).toHaveLength(0)
  })

  it('drawCardBackground 直接贴图分支', () => {
    const seen = { width: 1074, height: 660 }
    drawCardBackground(ctx, seen, 358, 220, true)
    const call = findCalls(calls, 'drawImage').at(-1)!
    expect(call.args[0]).toBe(seen)
  })
})

describe('反面绘制', () => {
  const { ctx, calls } = createFakeContext()

  beforeEach(() => {
    calls.length = 0
  })

  it('标题居中逐字、国徽占位、签发机关与有效期限成行', () => {
    drawBack(ctx, DATA, OPTIONS)
    const texts = textOf(calls)
    expect(texts).toContain('国徽占位')
    expect(texts).toContain('签发机关')
    expect(texts).toContain('有效期限')
    expect(texts).toContain('苏州市公安局演示分局')
    expect(texts).toContain('2015.03.12-2035.03.12')
    expect(findCalls(calls, 'arc').length).toBeGreaterThanOrEqual(2)
    // 标题十二字逐一排布，之后紧跟国徽占位字样
    expect(texts.slice(0, 12).join('')).toBe('中华人民共和国居民身份证')
    expect(texts[12]).toBe('国徽占位')
  })

  it('底板反面：盖两处遮罩、只补生成值，不再画标题/国徽/标签/卡框', () => {
    drawBack(ctx, DATA, { ...OPTIONS, useTemplateBackground: true })
    const P = BACK_PLATE
    expect(textOf(calls)).toEqual([DATA.issueAuthority, '2015.03.12-2035.03.12'])
    expect(findCalls(calls, 'fillRect').map((c) => c.args)).toEqual([
      [P.authority.mask.x, P.authority.mask.y, P.authority.mask.w, P.authority.mask.h],
      [P.validity.mask.x, P.validity.mask.y, P.validity.mask.w, P.validity.mask.h],
    ])
    // 底板是整幅照片，程序化的渐变底纹、国徽圆环与卡面描边都不该出现
    expect(findCalls(calls, 'createLinearGradient')).toHaveLength(0)
    expect(findCalls(calls, 'arc')).toHaveLength(0)
    expect(findCalls(calls, 'stroke')).toHaveLength(0)
    expect(findCalls(calls, 'drawImage')).toHaveLength(1)
  })

  it('底板签发机关过长时按遮罩净宽截断，不越到遮罩外', () => {
    drawBack(
      ctx,
      { ...DATA, issueAuthority: '内蒙古自治区公安局演示分局' },
      { ...OPTIONS, useTemplateBackground: true },
    )
    const text = textOf(calls)[0]
    expect(text.endsWith('…')).toBe(true)
    expect('内蒙古自治区公安局演示分局'.startsWith(text.slice(0, -1))).toBe(true)
  })

  it('底板反面长期有效：尾缀落在等宽日期段之后，不压住连字符', () => {
    drawBack(ctx, { ...DATA, longTerm: true, validTo: '' }, { ...OPTIONS, useTemplateBackground: true })
    const P = BACK_PLATE
    const parts = findCalls(calls, 'fillText')
    const datePart = parts.find((c) => String(c.args[0]).startsWith('2015.03.12-'))
    const tail = parts.find((c) => c.args[0] === '长期')
    expect(datePart?.font).toContain(`${P.fontSize}px`)
    expect(datePart?.font).toMatch(/mono/i)
    expect(tail?.font).toMatch(/Source Han Sans/i)
    const dateText = String(datePart?.args[0])
    const tailX = Number(tail?.args[1])
    expect(tailX).toBeCloseTo(P.validity.x + dateText.length * 0.6 * P.fontSize, 6)
    // 「长期」整段仍要留在有效期遮罩内，否则会盖到卡面右侧花纹上
    expect(tailX + 2 * P.fontSize).toBeLessThanOrEqual(P.validity.mask.x + P.validity.mask.w)
  })

  it('长期有效分两段绘制：日期段与「长期」之间没有空格', () => {
    drawBack(ctx, { ...DATA, longTerm: true, validTo: '' }, OPTIONS)
    const texts = textOf(calls)
    expect(texts).toContain('2015.03.12-')
    expect(texts).toContain('长期')
    expect(texts.some((t) => / - /.test(t))).toBe(false)
  })

  it('formatValidity 归一化日期', () => {
    expect(formatValidity('2015.03.12', '2035.03.12', false)).toBe('2015.03.12-2035.03.12')
    expect(formatValidity('20150312', '', true)).toBe('2015.03.12-长期')
    expect(formatValidity('2015-03-12', '2035-3-7', false)).toBe('2015.03.12-2035.03.07')
    expect(validityParts('20150312', '20350312', true)).toEqual(['2015.03.12-', '长期'])
  })

  it('有效期的日期与正面身份证号共用等宽字体，「长期」仍走中文字体', () => {
    drawFront(ctx, DATA, OPTIONS)
    const numberFont = findCalls(calls, 'fillText').find((c) => /^\d$/.test(String(c.args[0])))?.font
    expect(numberFont).toBe(NUMBER_FONT)

    calls.length = 0
    drawBack(ctx, DATA, OPTIONS)
    const drawn = findCalls(calls, 'fillText')
    expect(drawn.find((c) => String(c.args[0]).startsWith('2015.03.12-'))?.font).toBe(numberFont)
    expect(drawn.find((c) => c.args[0] === '有效期限')?.font).toContain('bold 12px')

    calls.length = 0
    drawBack(ctx, { ...DATA, longTerm: true, validTo: '' }, OPTIONS)
    const parts = findCalls(calls, 'fillText')
    const datePart = parts.find((c) => String(c.args[0]).startsWith('2015.03.12-'))
    const tail = parts.find((c) => c.args[0] === '长期')
    expect(datePart?.font).toBe(NUMBER_FONT)
    expect(tail?.font).toContain('16px')
    // 尾缀紧跟在日期之后，中间不额外留白（假 ctx 等宽字体栈的字宽 = 字符数 × 0.6 × 字号）
    // 用 0.6 而不是中文字体栈的 0.55：日期段换过字体之后再 measure 会算窄，「长期」就会压掉连字符
    const dateText = String(datePart?.args[0])
    expect(Number(tail?.args[1])).toBeCloseTo(Number(datePart?.args[1]) + dateText.length * 0.6 * 16, 6)
  })
})

describe('渲染管线', () => {
  it('renderFront / renderBack 按倍率输出高清画布并叠加水印', () => {
    const factory = (w: number, h: number) => createFakeCanvas(w, h)
    const front = renderFront(DATA, { ...OPTIONS, canvasFactory: factory })
    expect(front.width).toBe(CARD.width * 3)
    expect(front.height).toBe(CARD.height * 3)
    const canvas = front.canvas as unknown as ReturnType<typeof createFakeCanvas>
    const calls = (canvas as unknown as { calls: ReturnType<typeof createFakeContext>['calls'] }).calls
    expect(findCalls(calls, 'scale')[0].args).toEqual([3, 3])
    // 水印文案出现在同一张画布的绘制序列里
    expect(textOf(calls).some((t) => t.includes('仅作演示用'))).toBe(true)

    const back = renderBack(DATA, { ...OPTIONS, canvasFactory: factory })
    expect(back.width).toBe(CARD.width * 3)
    const backCanvas = back.canvas as unknown as { calls: ReturnType<typeof createFakeContext>['calls'] }
    expect(textOf(backCanvas.calls).some((t) => t.includes('国徽占位'))).toBe(true)
  })

  it('watermark.enabled=false 时管线不叠加水印，卡面照常绘制', () => {
    const factory = (w: number, h: number) => createFakeCanvas(w, h)
    const off = { ...OPTIONS, watermark: { ...WATERMARK_DEFAULTS, enabled: false } }
    const back = renderBack(DATA, { ...off, canvasFactory: factory })
    const canvas = back.canvas as unknown as { calls: ReturnType<typeof createFakeContext>['calls'] }
    expect(textOf(canvas.calls).some((t) => t === MANDATORY_WATERMARK_TEXT)).toBe(false)
    expect(textOf(canvas.calls)).toContain('国徽占位')

    const merged = renderCombined(
      renderFrontRaw(DATA, { ...off, canvasFactory: factory }),
      renderBackRaw(DATA, { ...off, canvasFactory: factory }),
      { ...off, canvasFactory: factory },
    )
    const mergedCanvas = merged.canvas as unknown as { calls: ReturnType<typeof createFakeContext>['calls'] }
    expect(textOf(mergedCanvas.calls).some((t) => t === MANDATORY_WATERMARK_TEXT)).toBe(false)
  })

  it('scale 非法时按 1 处理', () => {
    const side = renderFront(DATA, { ...OPTIONS, scale: 0, canvasFactory: (w, h) => createFakeCanvas(w, h) })
    expect(side.width).toBe(CARD.width)
  })

  it('renderCombined 纵向拼接：高 = 正面 + 40 + 反面，整体只叠一次水印', () => {
    const factory = (w: number, h: number) => createFakeCanvas(w, h)
    const front = renderFrontRaw(DATA, { ...OPTIONS, canvasFactory: factory })
    const back = renderBackRaw(DATA, { ...OPTIONS, canvasFactory: factory })
    const merged = renderCombined(front, back, { ...OPTIONS, canvasFactory: factory })
    expect(merged.width).toBe(CARD.width * 3)
    expect(merged.height).toBe(CARD.height * 3 * 2 + 40 * 3)
    const canvas = merged.canvas as unknown as { calls: ReturnType<typeof createFakeContext>['calls'] }
    expect(findCalls(canvas.calls, 'drawImage')).toHaveLength(2)
    expect(textOf(canvas.calls).some((t) => t.includes('正面 / 反面'))).toBe(true)
    // 裸渲染的两面自身没有水印，水印只在合并后叠加一次
    expect(textOf(canvas.calls).filter((t) => t === MANDATORY_WATERMARK_TEXT).length).toBeGreaterThan(1)
  })

  it('renderCombinedRaw 与裸渲染一样不带水印，供预览层使用', () => {
    const factory = (w: number, h: number) => createFakeCanvas(w, h)
    const front = renderFrontRaw(DATA, { ...OPTIONS, canvasFactory: factory })
    const back = renderBackRaw(DATA, { ...OPTIONS, canvasFactory: factory })
    const merged = renderCombinedRaw(front, back, { ...OPTIONS, canvasFactory: factory })
    const canvas = merged.canvas as unknown as { calls: ReturnType<typeof createFakeContext>['calls'] }
    // 分隔说明里也含「仅作演示用」字样，所以这里按整串水印文案精确匹配
    expect(textOf(canvas.calls).some((t) => t === MANDATORY_WATERMARK_TEXT)).toBe(false)
    expect(textOf(canvas.calls).some((t) => t.includes('正面 / 反面'))).toBe(true)
  })

  it('getContext 返回 null 时抛错，不产出无水印图', () => {
    expect(() =>
      renderFront(DATA, { ...OPTIONS, canvasFactory: () => createFakeCanvas(10, 10, { breakContext: true }) }),
    ).toThrow(/2D 绘图上下文/)
  })

  it('canvasToDataUrl 区分 png / jpg 并带质量参数', () => {
    const canvas = createFakeCanvas()
    expect(canvasToDataUrl(canvas, 'png')).toBe('data:image/png;base64,AAAA')
    expect(canvasToDataUrl(canvas, 'jpg', 0.92)).toBe('data:image/jpeg;base64,AAAA')
    const calls = (canvas as unknown as { dataUrlCalls: unknown[] }).dataUrlCalls
    expect(calls).toEqual([
      { mime: 'image/png', quality: undefined },
      { mime: 'image/jpeg', quality: 0.92 },
    ])
    expect(() => canvasToDataUrl({ width: 1, height: 1, getContext: () => null } as never)).toThrow(/toDataURL/)
  })

  it('createCanvas 的三条环境分支', () => {
    const injected = createCanvas(20, 30, (w, h) => createFakeCanvas(w, h))
    expect([injected.width, injected.height]).toEqual([20, 30])

    // 优先 HTMLCanvasElement（导出需要 toDataURL）
    const el = createFakeCanvas(0, 0)
    vi.stubGlobal('document', { createElement: () => el })
    const fromDom = createCanvas(11, 22)
    expect([fromDom.width, fromDom.height]).toEqual([11, 22])
    vi.unstubAllGlobals()

    // 其次 OffscreenCanvas
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('OffscreenCanvas', function FakeOffscreen(w: number, h: number) {
      return createFakeCanvas(w, h)
    })
    const fromOff = createCanvas(7, 9)
    expect([fromOff.width, fromOff.height]).toEqual([7, 9])

    // 两者都没有时必须报错，而不是画一张空白图
    vi.stubGlobal('OffscreenCanvas', undefined)
    expect(() => createCanvas(10, 10)).toThrow(/OffscreenCanvas/)
    vi.unstubAllGlobals()

    expect(() => get2dContext(createFakeCanvas(10, 10, { breakContext: true }))).toThrow(/2D 绘图上下文/)
  })
})
