import type {
  AddressCodeMode,
  Gender,
  GenderChoice,
  GenerateOptions,
  IdCardResult,
  ProvinceNode,
  ValidateOptions,
  ValidateResult,
} from '../types/idcard'
import {
  DEMO_ADDRESS_PREFIX,
  DEMO_AUTHORITY_DISTRICT,
  DEMO_BUILDINGS,
  DEMO_STREETS,
  FEMALE_NAMES,
  MALE_NAMES,
  PROVINCES,
  SURNAMES,
} from './templates'

/** GB 11643 加权因子 */
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const

/** 校验码映射表，下标为 sum % 11 */
const CHECK_MAP = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'] as const

/** 号码可表示的最早出生年份，早于它（或晚于今天）的日期一律视为非法 */
export const MIN_BIRTH_YEAR = 1900

/**
 * 年龄上限同时受「当前年份 − {@link MIN_BIRTH_YEAR}」约束：
 * 否则上界调到 130 后随机到的生日会落在 1900 年以前，直接触发校验失败。
 */
const currentYear = new Date().getFullYear()
export const AGE_RANGE_LIMITS = {
  min: 0,
  max: Math.min(130, currentYear - MIN_BIRTH_YEAR),
  sliderMin: 16,
  sliderMax: 100,
} as const

/** 18 位身份证号的固定结构长度 */
export const ID_LENGTH = 18

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * 计算前 17 位对应的校验码。
 * @param first17 恰好 17 位的数字字符串
 * @returns 单个字符：0-9 或 'X'
 * @throws 当入参不是 17 位纯数字时抛出
 */
export function calcCheckCode(first17: string): string {
  if (typeof first17 !== 'string' || !/^\d{17}$/.test(first17)) {
    throw new TypeError(`calcCheckCode 需要 17 位数字字符串，收到：${JSON.stringify(first17)}`)
  }
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(first17[i]) * WEIGHTS[i]
  return CHECK_MAP[sum % 11]
}

/** 去掉「省/市/自治区/特别行政区」等后缀，便于用户少打字也能匹配 */
function normalizeProvinceName(name: string): string {
  return name.replace(/(省|市|自治区|特别行政区|回族|维吾尔|壮族|自治)$/g, '').trim()
}

/** 市/区名同样允许省略「市/区/县」后缀（注意不能剥掉「徐州」的「州」） */
function normalizeCityName(name: string): string {
  return name.replace(/(市|区|县)$/g, '').trim()
}

/** 在省级节点下定位市级节点，返回下标（未命中为 -1） */
function cityIndexOf(node: ProvinceNode, city?: string): number {
  if (!city) return -1
  const key = normalizeCityName(city)
  return node.cities.findIndex((c) => normalizeCityName(c.name) === key || c.code === city)
}

/**
 * 在脱敏码表中定位省级节点。
 * @param province 省级名称，可为空（空则随机取一个）
 */
export function findProvince(province?: string, rng: () => number = Math.random): ProvinceNode {
  if (!province) return PROVINCES[Math.floor(rng() * PROVINCES.length) % PROVINCES.length]
  const key = normalizeProvinceName(province)
  const hit = PROVINCES.find((p) => normalizeProvinceName(p.name) === key || p.code === province)
  if (!hit) {
    throw new RangeError(`地址码表中不存在省份「${province}」，请从内置脱敏码表中选择`)
  }
  return hit
}

/**
 * 按省/市挑选 6 位地址码。
 *
 * - `standard`：真实省级码前缀 + 示例市码前缀 + '00'（脱敏，只保留少量示例市）；
 * - `demo`：`99` + 省级序号(2) + 市级序号(2)，号段明显虚构，真实身份证不存在 99 开头。
 *
 * @param province 省级名称或 2 位码前缀
 * @param city 市级名称或 4 位码前缀
 * @param mode 号段模式，默认 `demo`
 */
export function pickAddressCode(
  province?: string,
  city?: string,
  mode: AddressCodeMode = 'demo',
  rng: () => number = Math.random,
): string {
  const node = findProvince(province, rng)
  const cityIndex = cityIndexOf(node, city)
  const chosenCity =
    cityIndex >= 0 ? node.cities[cityIndex] : node.cities[Math.floor(rng() * node.cities.length) % node.cities.length]
  const provinceIndex = PROVINCES.findIndex((p) => p.code === node.code)
  const citySlot = cityIndex >= 0 ? cityIndex : node.cities.indexOf(chosenCity)

  if (mode === 'demo') {
    return `${DEMO_ADDRESS_PREFIX}${pad2(provinceIndex + 1)}${pad2(citySlot + 1)}`
  }
  return `${node.code}${chosenCity.code.slice(2)}00`
}

/** 将生日格式化为 Date（本地时区零点） */
function birthdayToDate(ymd: string): Date | null {
  if (!isValidBirthday(ymd)) return null
  return new Date(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
}

/** 是否为闰年 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * 校验 YYYYMMDD 生日字符串，含大小月、闰年 2/29 与「不得早于 1900 / 晚于今天」边界。
 */
export function isValidBirthday(ymd: string): boolean {
  if (!/^\d{8}$/.test(ymd)) return false
  const y = Number(ymd.slice(0, 4))
  const m = Number(ymd.slice(4, 6))
  const d = Number(ymd.slice(6, 8))
  if (y < MIN_BIRTH_YEAR || y > new Date().getFullYear()) return false
  if (m < 1 || m > 12) return false
  const days = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (d < 1 || d > days[m - 1]) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(y, m - 1, d).getTime() <= today.getTime()
}

/**
 * 按周岁口径计算年龄（生日未到则减一）。
 * @param birthday YYYYMMDD
 * @param on 计算基准日，默认今天
 */
export function ageFromBirthday(birthday: string, on: Date = new Date()): number {
  const birth = birthdayToDate(birthday)
  if (!birth) throw new RangeError(`非法生日：${birthday}`)
  let age = on.getFullYear() - birth.getFullYear()
  const monthDiff = on.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < birth.getDate())) age -= 1
  return age
}

/**
 * 证件有效期档：按「申领（签发）当日周岁」定年限，`'long'` 表示长期。
 *
 * 口径来自《居民身份证法》第五条：未满 16 周岁自愿申领的发给 5 年，
 * 16~25 周岁发给 10 年，26~45 周岁发给 20 年，46 周岁及以上长期有效。
 */
export function validityTermYears(ageAtIssue: number): 5 | 10 | 20 | 'long' {
  if (ageAtIssue < 16) return 5
  if (ageAtIssue <= 25) return 10
  if (ageAtIssue <= 45) return 20
  return 'long'
}

/** 年份平移，遇到 2/29 落到 2/28，避免跨闰年漂移 */
function shiftYears(base: Date, years: number): Date {
  const day = base.getDate()
  const out = new Date(base.getTime())
  out.setFullYear(out.getFullYear() + years)
  if (out.getDate() !== day) out.setDate(0)
  return out
}

/**
 * 在 [minAge, maxAge] 年龄区间内随机一个 YYYYMMDD 生日。
 *
 * 取值范围为「最近一次 minAge 岁生日」到「最近一次 (maxAge+1) 岁生日的前一天」，
 * 因此该生日用 `ageFromBirthday` 反算必然落在闭区间内，且能覆盖到闰年 2/29。
 * 区间下界再夹一次 {@link MIN_BIRTH_YEAR}，保证不会吐出码表之外的年份。
 */
export function randomBirthday(minAge = 18, maxAge = 60, rng: () => number = Math.random): string {
  const lo = clampAge(minAge)
  const hi = Math.max(lo, clampAge(maxAge))
  const today = new Date()
  const latest = shiftYears(today, -lo)
  const earliest = new Date(
    Math.max(shiftYears(today, -(hi + 1)).getTime() + 86400000, new Date(MIN_BIRTH_YEAR, 0, 1).getTime()),
  )
  const t = earliest.getTime() + rng() * (latest.getTime() - earliest.getTime())
  const d = new Date(Math.min(Math.max(t, earliest.getTime()), latest.getTime()))
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
}

function clampAge(age: number): number {
  if (!Number.isFinite(age)) return 18
  return Math.min(AGE_RANGE_LIMITS.max, Math.max(AGE_RANGE_LIMITS.min, Math.round(age)))
}

/** 从身份证号第 17 位判断性别：奇男偶女 */
export function genderFromId(idNumber: string): Gender | null {
  if (!/^\d{17}[\dX]$/.test(idNumber)) return null
  return Number(idNumber[16]) % 2 === 1 ? 'male' : 'female'
}

/** 生成与性别奇偶要求相符的 3 位顺序码 */
function randomSequenceCode(gender: Gender, rng: () => number): string {
  const tail = gender === 'male' ? 1 + 2 * Math.floor(rng() * 5) : 2 * Math.floor(rng() * 5)
  return `${Math.floor(rng() * 10)}${Math.floor(rng() * 10)}${tail}`
}

/** 随机一个脱敏姓名 */
export function randomName(gender: Gender = 'male', rng: () => number = Math.random): string {
  const pool = gender === 'male' ? MALE_NAMES : FEMALE_NAMES
  const surname = SURNAMES[Math.floor(rng() * SURNAMES.length) % SURNAMES.length]
  const given = pool[Math.floor(rng() * pool.length) % pool.length]
  return `${surname}${given}`
}

/** 由籍贯生成明显虚构的住址 */
export function randomAddress(province?: string, city?: string, rng: () => number = Math.random): string {
  const node = findProvince(province, rng)
  const slot = cityIndexOf(node, city)
  const cityNode =
    slot >= 0 ? node.cities[slot] : node.cities[Math.floor(rng() * node.cities.length) % node.cities.length]
  const street = DEMO_STREETS[Math.floor(rng() * DEMO_STREETS.length) % DEMO_STREETS.length]
  const building = DEMO_BUILDINGS[Math.floor(rng() * DEMO_BUILDINGS.length) % DEMO_BUILDINGS.length]
  const no = 1 + Math.floor(rng() * 200)
  const room = 101 + Math.floor(rng() * 1800)
  return `${node.name}${cityNode.name}${street}${no}号${building}${room}室`
}

/** 演示用签发机关名 */
export function randomAuthority(cityName: string): string {
  return `${cityName}公安局${DEMO_AUTHORITY_DISTRICT}分局`
}

/**
 * 生成一条演示身份证数据。
 *
 * 校验码默认严格遵循 GB 11643 加权算法；当 `centuryRule` 打开且算得年龄 ≥ 100 时，
 * 按需求描述的历史规则把校验码固定为 `'X'`（此时号码不再满足标准加权，
 * 需要 `validateIdCard(id, { allowCenturyRule: true })` 才能通过）。
 *
 * @throws 当指定生日非法、省份不在码表中时抛出
 */
export function generateIdCard(options: GenerateOptions = {}): IdCardResult {
  const rng = options.rng ?? Math.random
  const mode: AddressCodeMode = options.addressCodeMode ?? 'demo'
  const genderChoice: GenderChoice = options.gender ?? 'random'

  const provinceNode = findProvince(options.province, rng)
  const citySlot = cityIndexOf(provinceNode, options.city)
  const cityNode =
    citySlot >= 0
      ? provinceNode.cities[citySlot]
      : provinceNode.cities[Math.floor(rng() * provinceNode.cities.length) % provinceNode.cities.length]

  const addressCode = pickAddressCode(provinceNode.name, cityNode.name, mode, rng)

  let birthday: string
  if (options.birthday) {
    const compact = options.birthday.replace(/[^0-9Xx]/g, '').slice(0, 8)
    if (!isValidBirthday(compact)) throw new RangeError(`非法出生日期：${options.birthday}`)
    birthday = compact
  } else {
    birthday = randomBirthday(options.minAge ?? 18, options.maxAge ?? 60, rng)
  }

  const gender: Gender = genderChoice === 'random' ? (rng() < 0.5 ? 'male' : 'female') : genderChoice
  const sequenceCode = randomSequenceCode(gender, rng)
  const first17 = `${addressCode}${birthday}${sequenceCode}`

  const age = ageFromBirthday(birthday)
  const standardCheck = calcCheckCode(first17)
  const centuryRuleApplied = Boolean(options.centuryRule) && age >= 100
  const checkCode = centuryRuleApplied ? 'X' : standardCheck

  return {
    idNumber: `${first17}${checkCode}`,
    addressCode,
    birthday,
    gender,
    age,
    checkCode,
    first17,
    sequenceCode,
    centuryRuleApplied,
  }
}

/**
 * 校验一个 18 位号码的结构与校验码。
 *
 * @param id 待校验号码
 * @param options.allowCenturyRule 是否放行「年龄 ≥ 100 且校验码为 X」的历史规则号码
 */
export function validateIdCard(id: string, options: ValidateOptions = {}): ValidateResult {
  if (typeof id !== 'string') return { valid: false, reason: '号码必须是字符串' }
  const value = id.trim()
  if (value.length !== ID_LENGTH) return { valid: false, reason: `长度应为 ${ID_LENGTH} 位，当前 ${value.length} 位` }
  if (!/^\d{17}$/.test(value.slice(0, 17))) return { valid: false, reason: '前 17 位必须全部为数字' }
  if (!/^[0-9X]$/.test(value[17])) return { valid: false, reason: '校验码只能是 0-9 或大写 X' }

  const birthday = value.slice(6, 14)
  if (!isValidBirthday(birthday)) return { valid: false, reason: `出生日期非法：${birthday}` }

  const addressCode = value.slice(0, 6)
  if (addressCode.startsWith('00')) return { valid: false, reason: `地址码非法：${addressCode}` }

  const expected = calcCheckCode(value.slice(0, 17))
  if (expected === value[17]) return { valid: true }

  if (options.allowCenturyRule && value[17] === 'X') {
    const age = ageFromBirthday(birthday)
    if (age >= 100) return { valid: true }
  }
  return { valid: false, reason: `校验码不匹配：期望 ${expected}，实际 ${value[17]}` }
}
