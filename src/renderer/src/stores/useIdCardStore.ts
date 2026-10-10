import { defineStore } from 'pinia'
import type {
  BirthdayMode,
  CardSide,
  Gender,
  IdCardDisplayData,
  WatermarkMode,
  WatermarkOptions,
} from '../types/idcard'
import { computed, reactive, ref, watch } from 'vue'
import {
  ageFromBirthday,
  calcCheckCode,
  isValidBirthday,
  pickAddressCode,
  randomAddress,
  randomAuthority,
  randomBirthday,
  randomName,
  validateIdCard,
  validityTermYears,
} from '../core/idCardGenerator'
import { MANDATORY_WATERMARK_TEXT, PROVINCES, WATERMARK_DEFAULTS } from '../core/templates'
import {
  canvasToDataUrl,
  renderBack,
  renderBackRaw,
  renderCombined,
  renderFront,
  renderFrontRaw,
} from '../core/drawBack'
import { embedWatermarkMetadata, readWatermarkMetadata, resolveWatermarkOptions } from '../core/watermark'
import { getImages, setFaceFromDataUrl } from '../core/assets'

const STORAGE_KEY = 'id-generator:state.v1'

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' ↔ 'YYYYMMDD' */
const toIso = (compact: string): string =>
  /^\d{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` : compact
const toCompact = (iso: string): string => (iso ?? '').replace(/-/g, '')

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function shiftIso(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  const day = d.getDate()
  d.setFullYear(d.getFullYear() + years)
  if (d.getDate() !== day) d.setDate(0)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 顺序码：前两位取自 sequenceBase，第 3 位按性别取奇/偶，保证「第 17 位奇男偶女」 */
function buildSequenceCode(base: number, gender: Gender): string {
  const head = Math.abs(Math.trunc(base)) % 100
  const slot = head % 5
  const tail = gender === 'male' ? slot * 2 + 1 : slot * 2
  return `${pad2(head)}${tail}`
}

export interface IdCardForm {
  name: string
  gender: 'male' | 'female' | 'random'
  nation: string
  birthdayMode: BirthdayMode
  birthday: string
  ageRange: [number, number]
  region: string[]
  address: string
  issueAuthority: string
  validFrom: string
  validTo: string
  longTerm: boolean
}

export interface AdvancedOptions {
  demoSegment: boolean
  centuryRule: boolean
  /** 有效期止/长期按「申领当日周岁」自动推算（5/10/20 年或长期）；关掉后回到手动填写 */
  autoValidity: boolean
  /** 水印总开关，默认开；关闭后可导出干净卡面（原需求要求不可关闭，已按用户决定改为可配置） */
  watermarkEnabled: boolean
  watermarkText: string
  watermarkMode: WatermarkMode
  watermarkOpacity: number
  watermarkDensity: number
  exportScale: 2 | 3
  exportFormat: 'png' | 'jpg'
}

function defaultForm(): IdCardForm {
  return {
    name: '',
    gender: 'male',
    nation: '汉',
    birthdayMode: 'range',
    birthday: '1995-06-15',
    ageRange: [18, 45],
    region: [],
    address: '',
    issueAuthority: '',
    validFrom: todayIso(),
    validTo: shiftIso(todayIso(), 20),
    longTerm: false,
  }
}

function defaultAdvanced(): AdvancedOptions {
  return {
    demoSegment: true,
    centuryRule: false,
    autoValidity: true,
    watermarkEnabled: true,
    watermarkText: MANDATORY_WATERMARK_TEXT,
    watermarkMode: WATERMARK_DEFAULTS.mode,
    watermarkOpacity: WATERMARK_DEFAULTS.opacity,
    watermarkDensity: 1,
    exportScale: 3,
    exportFormat: 'png',
  }
}

export const useIdCardStore = defineStore('idcard', () => {
  const form = reactive<IdCardForm>(defaultForm())
  const advanced = reactive<AdvancedOptions>(defaultAdvanced())

  /** 顺序码前两位，随机生成时刷新；固定它可让号码在改参数时不整体跳动 */
  const sequenceBase = ref(0)
  /** 年龄区间模式下当前使用的生日（compact），区间变化时才重掷 */
  const rangeBirthday = ref('')
  /** 随机解析出的性别（form.gender 为 random 时生效） */
  const resolvedGender = ref<Gender>('male')
  /** 人像 dataURL，出于 localStorage 体积考虑不持久化 */
  const faceDataUrl = ref('')

  const idNumber = ref('')
  const activeBirthday = ref('')
  const age = ref(0)
  const selfCheck = ref<{ valid: boolean; reason?: string }>({ valid: false, reason: '尚未生成' })

  const provinceOptions = PROVINCES.map((p) => ({
    value: p.name,
    label: p.name,
    children: p.cities.map((c) => ({ value: c.name, label: c.name })),
  }))

  const effectiveGender = computed<Gender>(() => (form.gender === 'random' ? resolvedGender.value : form.gender))

  /** 申领（签发）当日周岁与据此定出的有效期档；生日或签发日期一变就重算 */
  const validityRule = computed<{ age: number; term: 5 | 10 | 20 | 'long' }>(() => {
    const parsed = new Date(`${form.validFrom}T00:00:00`)
    const issue = Number.isNaN(parsed.getTime()) ? new Date() : parsed
    const years = isValidBirthday(activeBirthday.value) ? ageFromBirthday(activeBirthday.value, issue) : 0
    return { age: years, term: validityTermYears(years) }
  })

  const watermarkOptions = computed<WatermarkOptions>(() =>
    resolveWatermarkOptions({
      enabled: advanced.watermarkEnabled,
      text: advanced.watermarkText,
      mode: advanced.watermarkMode,
      opacity: advanced.watermarkOpacity,
      density: advanced.watermarkDensity,
      bottomBar: true,
    }),
  )

  const card = computed<IdCardDisplayData>(() => ({
    name: form.name.trim() || '赵演示',
    gender: effectiveGender.value,
    nation: form.nation,
    birthday: activeBirthday.value,
    address: form.address,
    idNumber: idNumber.value,
    faceDataUrl: faceDataUrl.value,
    issueAuthority: form.issueAuthority,
    validFrom: form.validFrom,
    validTo: form.validTo,
    longTerm: form.longTerm,
  }))

  const regionLabel = computed(() => (form.region.length === 2 ? `${form.region[0]} ${form.region[1]}` : '未选择'))

  /** 依据当前表单重算号码，并做一次自校验 */
  function rebuild(): void {
    const mode = advanced.demoSegment ? 'demo' : 'standard'
    const [province, city] = form.region.length === 2 ? form.region : []

    if (form.birthdayMode === 'assign') {
      activeBirthday.value = toCompact(form.birthday)
    } else if (!isInRange(rangeBirthday.value)) {
      rangeBirthday.value = randomBirthday(form.ageRange[0], form.ageRange[1])
      activeBirthday.value = rangeBirthday.value
    } else {
      activeBirthday.value = rangeBirthday.value
    }

    if (!isValidBirthday(activeBirthday.value)) {
      // 日期选择器被清空、填了越界日期或持久化数据已失效：退回区间内随机生日，保证卡面始终可渲染
      activeBirthday.value = randomBirthday(form.ageRange[0], form.ageRange[1])
      if (form.birthdayMode === 'assign') form.birthday = toIso(activeBirthday.value)
    }

    resolvedGender.value = form.gender === 'random' ? resolvedGender.value : form.gender
    const addressCode = pickAddressCode(province, city, mode)
    const first17 = `${addressCode}${activeBirthday.value}${buildSequenceCode(sequenceBase.value, effectiveGender.value)}`
    const century = advanced.centuryRule && ageFromBirthday(activeBirthday.value) >= 100
    const checkCode = century ? 'X' : calcCheckCode(first17)

    idNumber.value = `${first17}${checkCode}`
    age.value = ageFromBirthday(activeBirthday.value)
    selfCheck.value = validateIdCard(idNumber.value, { allowCenturyRule: advanced.centuryRule })
    syncValidity()
  }

  /**
   * 写回推算出的止期：5/10/20 年档落在「签发日 + N 年」，长期档勾上「长期」并把止期清空
   * （`validityParts` 在长期时不读止期，面板上的止期选择器此时也是禁用态）。
   */
  function syncValidity(): void {
    if (!advanced.autoValidity) return
    const term = validityRule.value.term
    form.longTerm = term === 'long'
    form.validTo = term === 'long' ? '' : shiftIso(form.validFrom, term)
  }

  /** 生日是否仍是合法值且落在年龄区间内；非法值返回 false，让 rebuild() 重掷而不是抛错卡死 */
  function isInRange(compact: string): boolean {
    if (!isValidBirthday(compact)) return false
    const a = ageFromBirthday(compact)
    return a >= form.ageRange[0] && a <= form.ageRange[1]
  }

  /** 随机生成：籍贯/姓名/住址/机关/生日/顺序码全部重掷 */
  function randomize(): void {
    const pickedProvince = PROVINCES[Math.floor(Math.random() * PROVINCES.length)]
    const pickedCity = pickedProvince.cities[Math.floor(Math.random() * pickedProvince.cities.length)]
    form.region = [pickedProvince.name, pickedCity.name]
    resolvedGender.value = form.gender !== 'random' ? form.gender : Math.random() < 0.5 ? 'male' : 'female'
    sequenceBase.value = Math.floor(Math.random() * 100)
    rangeBirthday.value = randomBirthday(form.ageRange[0], form.ageRange[1])
    if (form.birthdayMode === 'assign') form.birthday = toIso(rangeBirthday.value)
    rebuild()
    form.name = randomName(effectiveGender.value)
    form.address = randomAddress(form.region[0], form.region[1])
    form.issueAuthority = randomAuthority(pickedCity.name)
    rebuild()
  }

  /** 重置为出厂参数（仍然保证号码自校验通过） */
  function reset(): void {
    Object.assign(form, defaultForm())
    Object.assign(advanced, defaultAdvanced())
    faceDataUrl.value = ''
    void setFaceFromDataUrl(null)
    // 固定性别时两者一致；只有「随机」才留一个 male 种子等下次解析覆盖
    resolvedGender.value = form.gender === 'random' ? 'male' : form.gender
    rangeBirthday.value = randomBirthday(form.ageRange[0], form.ageRange[1])
    sequenceBase.value = Math.floor(Math.random() * 100)
    rebuild()
    form.name = randomName(effectiveGender.value)
    if (form.region.length !== 2) form.region = [PROVINCES[0].name, PROVINCES[0].cities[0].name]
    form.address = randomAddress(form.region[0], form.region[1])
    form.issueAuthority = randomAuthority(form.region[1])
    rebuild()
  }

  async function applyFace(dataUrl: string | null): Promise<void> {
    faceDataUrl.value = dataUrl ?? ''
    await setFaceFromDataUrl(dataUrl)
    rebuild()
  }

  function buildFileName(side: CardSide): string {
    const label = side === 'front' ? '正面' : side === 'back' ? '反面' : '双面'
    const stamp = toCompact(todayIso())
    return `身份证${label}_${card.value.name}_${stamp}`
  }

  /**
   * 按导出倍率重新渲染（不复用预览画布），叠加水印后写盘。
   * 水印绘制或元数据校验失败会抛出，调用方必须中止而不是导出无水印图。
   */
  async function exportCard(side: CardSide): Promise<{ canceled: boolean; savedPath?: string; error?: string }> {
    if (typeof window === 'undefined' || typeof window.api?.saveImage !== 'function') {
      throw new Error('未检测到桌面端 bridge（window.api.saveImage），请在 Electron 窗口内导出')
    }
    const scale = advanced.exportScale * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)
    const base = { scale, watermark: watermarkOptions.value, useTemplateBackground: true, images: getImages() }
    const target =
      side === 'both'
        ? renderCombined(renderFrontRaw(card.value, base), renderBackRaw(card.value, base), base)
        : side === 'back'
          ? renderBack(card.value, base)
          : renderFront(card.value, base)

    const raw = canvasToDataUrl(target.canvas, advanced.exportFormat, 0.92)
    const wm = watermarkOptions.value
    // 显式关闭水印时既不叠加像素水印，也不写 PNG 元数据；启用时保持原有的失败即中止
    const final = wm.enabled ? embedWatermarkMetadata(raw, wm.text) : raw
    if (wm.enabled && advanced.exportFormat === 'png') {
      const embedded = readWatermarkMetadata(final)
      if (embedded !== wm.text) throw new Error('导出中止：水印元数据校验未通过')
    }

    const res = await window.api.saveImage({
      dataUrl: final,
      defaultName: `${buildFileName(side)}.${advanced.exportFormat === 'jpg' ? 'jpg' : 'png'}`,
      format: advanced.exportFormat,
    })
    return res
  }

  /** 本地持久化：窗口缩放/最小化/重开都不丢参数（人像体积可能很大，不入库） */
  function persist(): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          form,
          advanced,
          sequenceBase: sequenceBase.value,
          rangeBirthday: rangeBirthday.value,
          resolvedGender: resolvedGender.value,
          idNumber: idNumber.value,
          activeBirthday: activeBirthday.value,
        }),
      )
    } catch {
      // 配额异常不影响功能，只是下次启动回到默认值
    }
  }

  function hydrate(): boolean {
    if (typeof localStorage === 'undefined') return false
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const saved = JSON.parse(raw) as Partial<{
        form: IdCardForm
        advanced: AdvancedOptions
        sequenceBase: number
        rangeBirthday: string
        resolvedGender: Gender
        idNumber: string
        activeBirthday: string
      }>
      if (saved.form) Object.assign(form, saved.form)
      if (saved.advanced) Object.assign(advanced, saved.advanced)
      sequenceBase.value = Number(saved.sequenceBase) || 0
      rangeBirthday.value = typeof saved.rangeBirthday === 'string' ? saved.rangeBirthday : ''
      if (saved.resolvedGender === 'male' || saved.resolvedGender === 'female')
        resolvedGender.value = saved.resolvedGender
      rebuild()
      return true
    } catch {
      return false
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    [form, advanced, sequenceBase, rangeBirthday],
    () => {
      // 号码立刻重算（纯计算、开销极小），预览的重绘由视图层做 300ms 防抖
      rebuild()
      clearTimeout(timer)
      timer = setTimeout(persist, 400)
    },
    { deep: true },
  )

  return {
    form,
    advanced,
    sequenceBase,
    rangeBirthday,
    resolvedGender,
    faceDataUrl,
    idNumber,
    activeBirthday,
    age,
    selfCheck,
    provinceOptions,
    effectiveGender,
    validityRule,
    watermarkOptions,
    card,
    regionLabel,
    rebuild,
    randomize,
    reset,
    applyFace,
    exportCard,
    buildFileName,
    persist,
    hydrate,
  }
})
