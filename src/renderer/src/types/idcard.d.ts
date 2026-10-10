/**
 * 全局类型声明：身份证演示数据、渲染参数、水印参数、预加载白名单 API。
 * 仅存在于类型层，不产生运行时代码。
 */

export type Gender = 'male' | 'female'
export type GenderChoice = Gender | 'random'
export type AddressCodeMode = 'demo' | 'standard'
export type BirthdayMode = 'assign' | 'range'
export type WatermarkMode = 'tile' | 'diagonal'
export type ExportScale = 2 | 3
export type ExportFormat = 'png' | 'jpg'
export type CardSide = 'front' | 'back' | 'both'

/** generateIdCard 的输入 */
export interface GenerateOptions {
  /** 省级名称，如 '江苏省'（可省略 '省'/'市'/'自治区' 后缀） */
  province?: string
  city?: string
  gender?: GenderChoice
  /** 指定生日（YYYYMMDD）；给定后忽略年龄区间 */
  birthday?: string
  minAge?: number
  maxAge?: number
  /** demo 使用明显虚构的 99 开头号段 */
  addressCodeMode?: AddressCodeMode
  /**
   * 历史规则开关：年龄 ≥ 100 时校验码强制为 'X'。
   * 关闭时严格使用 GB 11643 加权算法。
   */
  centuryRule?: boolean
  /** 注入随机源，便于单测复现；默认 Math.random */
  rng?: () => number
}

/** generateIdCard 的输出 */
export interface IdCardResult {
  idNumber: string
  addressCode: string
  birthday: string
  gender: Gender
  age: number
  checkCode: string
  /** 前 17 位，便于二次校验与调试 */
  first17: string
  /** 顺序码（第 15-17 位） */
  sequenceCode: string
  /** 本次是否命中「年龄 ≥ 100 强制 X」的历史规则 */
  centuryRuleApplied: boolean
}

export interface ValidateResult {
  valid: boolean
  reason?: string
}

/** validateIdCard 的可选行为 */
export interface ValidateOptions {
  /** 允许「年龄 ≥ 100 且校验码为 X」的历史规则号码通过校验 */
  allowCenturyRule?: boolean
}

export interface CityNode {
  code: string
  name: string
}

export interface ProvinceNode {
  /** 2 位省级区划码前缀（公开区划代码，仅保留若干示例市，非全量真实数据） */
  code: string
  name: string
  cities: CityNode[]
}

/** 卡片完整展示数据（正面 + 反面所有字段） */
export interface IdCardDisplayData {
  name: string
  gender: Gender
  nation: string
  /** YYYYMMDD */
  birthday: string
  address: string
  idNumber: string
  /** 3:4 竖版人像 dataURL；为空时由绘制层回落到默认头像 */
  faceDataUrl: string
  issueAuthority: string
  /** YYYY.MM.DD */
  validFrom: string
  /** YYYY.MM.DD；长期时忽略 */
  validTo: string
  longTerm: boolean
}

export interface WatermarkOptions {
  /** 是否叠加水印，默认 true；显式 false 时可见水印与 PNG 元数据都不写 */
  enabled?: boolean
  /** 平铺 / 单条对角大字 */
  mode: WatermarkMode
  text: string
  /** 0~1，越界会被裁剪；实现内另有下限保护，启用时不能调到不可见 */
  opacity: number
  color: string
  /** 逻辑像素字号，导出时按倍率放大 */
  fontSize: number
  /** 行间距（逻辑 px） */
  rowGap: number
  /** 列间距（逻辑 px） */
  colGap: number
  /** 密度倍数，>1 更密（等效于缩小行/列间距） */
  density: number
  /** 旋转角度（度），默认 -30 */
  angle: number
  /** 导出时追加的底部固定水印条 */
  bottomBar: boolean
}

/** 绘制入参：所有绘制函数按 scale 输出高清图 */
export interface RenderOptions {
  /** 导出倍率 × devicePixelRatio，通常 2 或 3；ctx 已按此缩放，绘制代码只用逻辑像素 */
  scale: number
  watermark: WatermarkOptions
  /** 底图是否可用（模板图缺失时回落为程序化绘制） */
  useTemplateBackground: boolean
  /** 注入图片资源，单测可传假对象；缺省读 core/assets 的已加载资源 */
  images?: Partial<ImageBundle>
}

export interface RenderPipelineOptions extends RenderOptions {
  canvasFactory?: CanvasFactory
  /** 是否在渲染管线末尾叠加水印；实现层忽略 false，水印不可关闭 */
  forceBottomBar?: boolean
}

export interface CanvasImageLike {
  width: number
  height: number
}

/** 2D 画布最小抽象：OffscreenCanvas / HTMLCanvasElement 都满足 */
export interface Canvas2DLike {
  width: number
  height: number
  getContext(contextId: '2d'): CanvasRenderingContext2D | null
}

export type CanvasFactory = (width: number, height: number) => Canvas2DLike

export interface ImageBundle {
  frontTemplate: CanvasImageLike | null
  backTemplate: CanvasImageLike | null
  /** 内置演示人像，男女各一张，绘制层按卡面性别取用 */
  defaultAvatars: Record<Gender, CanvasImageLike | null>
  /** 用户上传的人像 */
  face: CanvasImageLike | null
}

export interface SaveImageRequest {
  dataUrl: string
  defaultName: string
  format?: ExportFormat
}

export interface SaveImageResult {
  canceled: boolean
  savedPath?: string
  error?: string
}

export interface SelectFaceResult {
  canceled: boolean
  /** 主进程选中的绝对路径，仅作提示用，渲染进程无法据此读盘 */
  path?: string
  base64?: string
  size?: number
  error?: string
}

export interface RevealResult {
  canceled: boolean
  error?: string
}

/** preload 通过 contextBridge 暴露的白名单 API */
export interface DesktopApi {
  saveImage(req: SaveImageRequest): Promise<SaveImageResult>
  selectFace(): Promise<SelectFaceResult>
  revealInFolder(path: string): Promise<RevealResult>
  getVersion(): Promise<string>
}

declare global {
  interface Window {
    api: DesktopApi
  }
}
