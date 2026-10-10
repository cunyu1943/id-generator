/**
 * 测试替身：记录所有 Canvas 2D 调用的假上下文 / 假画布。
 * core/ 的绘制函数只用 ctx 的方法与 measureText，因此可以完整驱动。
 */

export interface RecordedCall {
  op: string
  args: unknown[]
  /** fillText / strokeText 额外记录当时的 ctx.font，用于断言两处文字用了同一套字体 */
  font?: string
}

export interface FakeCanvas {
  width: number
  height: number
  getContext(id: '2d'): CanvasRenderingContext2D
  toDataURL(mime?: string, quality?: number): string
  dataUrlCalls: Array<{ mime?: string; quality?: number }>
}

const CJK = 1
const LATIN = 0.55
/** 等宽字体栈里的 ASCII 比中文字体栈宽一点；不区分就抓不到「换了字体才 measureText」这类排版错位 */
const MONO_LATIN = 0.6

function fontSizeFrom(font: string): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : 10
}

export interface FakeContextOptions {
  /** 让 getContext 返回 null，用于验证失败分支 */
  breakContext?: boolean
}

export function createFakeContext(): { ctx: CanvasRenderingContext2D; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const record =
    (op: string) =>
    (...args: unknown[]): void => {
      const paintsText = op === 'fillText' || op === 'strokeText'
      calls.push(paintsText ? { op, args, font: String(state.font) } : { op, args })
    }

  const state: Record<string, unknown> = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowBlur: 0,
    shadowColor: 'transparent',
    letterSpacing: '0px',
  }
  const stack: Array<Record<string, unknown>> = []

  const target: Record<string, unknown> = {
    calls,
    state,
    save: () => {
      stack.push({ ...state })
      calls.push({ op: 'save', args: [] })
    },
    restore: () => {
      const prev = stack.pop()
      if (prev) Object.assign(state, prev)
      calls.push({ op: 'restore', args: [] })
    },
    measureText: (text: string) => {
      const font = String(state.font)
      const latin = /mono/i.test(font) ? MONO_LATIN : LATIN
      let units = 0
      for (const ch of String(text ?? '')) units += ch.charCodeAt(0) > 0x2e80 ? CJK : latin
      return { width: units * fontSizeFrom(font) }
    },
    createLinearGradient: (...args: unknown[]) => {
      calls.push({ op: 'createLinearGradient', args })
      return { addColorStop: record('addColorStop') }
    },
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    arcTo: record('arcTo'),
    rect: record('rect'),
    fill: record('fill'),
    stroke: record('stroke'),
    clip: record('clip'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    drawImage: record('drawImage'),
    fillText: record('fillText'),
    strokeText: record('strokeText'),
    translate: record('translate'),
    rotate: record('rotate'),
    scale: record('scale'),
    setLineDash: record('setLineDash'),
  }

  const ctx = new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj) return obj[prop]
      if (prop in state) return state[prop]
      return undefined
    },
    set(obj, prop: string, value: unknown) {
      if (prop in state || !(prop in obj)) state[prop] = value
      else obj[prop] = value
      return true
    },
  })

  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
}

export interface FakeCanvasOptions {
  breakContext?: boolean
}

export function createFakeCanvas(width = 358, height = 220, options: FakeCanvasOptions = {}): FakeCanvas {
  const { ctx, calls } = createFakeContext()
  const canvas: FakeCanvas = {
    width,
    height,
    dataUrlCalls: [],
    getContext: () => (options.breakContext ? (null as unknown as CanvasRenderingContext2D) : ctx),
    toDataURL(mime?: string, quality?: number) {
      canvas.dataUrlCalls.push({ mime, quality })
      return `data:${mime ?? 'image/png'};base64,AAAA`
    },
  }
  Object.defineProperty(canvas, 'calls', { value: calls })
  return canvas
}

export function findCalls(calls: RecordedCall[], op: string): RecordedCall[] {
  return calls.filter((c) => c.op === op)
}

export function textOf(calls: RecordedCall[]): string[] {
  return calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]))
}
