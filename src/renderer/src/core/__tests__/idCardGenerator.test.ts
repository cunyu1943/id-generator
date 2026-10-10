import { describe, expect, it } from 'vitest'
import {
  AGE_RANGE_LIMITS,
  ageFromBirthday,
  calcCheckCode,
  findProvince,
  genderFromId,
  generateIdCard,
  isLeapYear,
  isValidBirthday,
  MIN_BIRTH_YEAR,
  pickAddressCode,
  randomAddress,
  randomAuthority,
  randomBirthday,
  randomName,
  validateIdCard,
  validityTermYears,
} from '../idCardGenerator'
import { NATIONS, PROVINCES } from '../templates'

/** 用 GB 11643 公式独立复算，作为断言基准（避免与被测实现同源） */
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const CHECK_MAP = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']
const oracle = (first17: string): string => {
  let sum = 0
  for (let i = 0; i < 17; i++) sum += Number(first17[i]) * WEIGHTS[i]
  return CHECK_MAP[sum % 11]
}

describe('calcCheckCode', () => {
  it('命中加权表与映射表的经典样例', () => {
    expect(calcCheckCode('11010519491231002')).toBe('X')
    expect(calcCheckCode('44052419880101000')).toBe('3')
    expect(calcCheckCode('32050020000229000')).toBe('4')
    expect(calcCheckCode('99110119960229000')).toBe('2')
    expect(calcCheckCode('12010019040506000')).toBe('5')
  })

  it('与独立实现逐位一致', () => {
    for (let n = 0; n < 200; n++) {
      const first17 = String(n).padStart(17, '0')
      expect(calcCheckCode(first17)).toBe(oracle(first17))
    }
  })

  it('入参非法时抛错', () => {
    expect(() => calcCheckCode('123')).toThrow(TypeError)
    expect(() => calcCheckCode('1101051949123100A')).toThrow(/17 位数字/)
    // @ts-expect-error 运行期防御
    expect(() => calcCheckCode(undefined)).toThrow(TypeError)
  })
})

describe('生日与年龄', () => {
  it('闰年 2/29 判定正确', () => {
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2024)).toBe(true)
    expect(isValidBirthday('20000229')).toBe(true)
    expect(isValidBirthday('20010229')).toBe(false)
    expect(isValidBirthday('19000229')).toBe(false)
  })

  it('拒绝非法月份、日期与年份', () => {
    expect(isValidBirthday('20001301')).toBe(false)
    expect(isValidBirthday('20000431')).toBe(false)
    expect(isValidBirthday('20000031')).toBe(false)
    expect(isValidBirthday('18990101')).toBe(false)
    expect(isValidBirthday('2000-01-01')).toBe(false)
  })

  it('晚于今天的日期一律拒绝，避免出现负周岁', () => {
    const compact = (d: Date): string =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86_400_000)
    expect(isValidBirthday(compact(today))).toBe(true)
    expect(isValidBirthday(compact(tomorrow))).toBe(false)

    const first17 = `110101${compact(tomorrow)}001`
    expect(validateIdCard(`${first17}${calcCheckCode(first17)}`).reason).toMatch(/出生日期非法/)
  })

  it('周岁口径：生日未到减一', () => {
    const on = new Date(2026, 9, 9) // 2026-10-09
    expect(ageFromBirthday('20001009', on)).toBe(26)
    expect(ageFromBirthday('20001010', on)).toBe(25)
    expect(ageFromBirthday('20000930', on)).toBe(26)
    expect(ageFromBirthday('20000229', on)).toBe(26)
  })

  it('年龄区间取边界生日', () => {
    expect(ageFromBirthday('19261009')).toBe(100)
    expect(() => ageFromBirthday('not-a-date')).toThrow(RangeError)
  })

  it('randomBirthday 的年龄恒落在闭区间内', () => {
    for (let i = 0; i < 1500; i++) {
      const b = randomBirthday(16, 100)
      const age = ageFromBirthday(b)
      expect(age).toBeGreaterThanOrEqual(16)
      expect(age).toBeLessThanOrEqual(100)
    }
    // 覆盖 100+ 与极窄区间
    expect(ageFromBirthday(randomBirthday(100, 105))).toBeGreaterThanOrEqual(100)
    expect(ageFromBirthday(randomBirthday(30, 30))).toBe(30)
    // 参数颠倒/非法时自动纠正
    expect(ageFromBirthday(randomBirthday(60, 20))).toBeGreaterThanOrEqual(60)
    expect(() => randomBirthday(Number.NaN, 60)).not.toThrow()
  })

  it('randomBirthday 能取到闰日 2/29', () => {
    let hit = ''
    for (let i = 0; i < 50000 && !hit; i++) {
      const b = randomBirthday(0, 125)
      if (b.endsWith('0229')) hit = b
    }
    expect(hit).not.toBe('')
    expect(isValidBirthday(hit)).toBe(true)
  })

  it('年龄上界受 1900 年界约束，越界请求会被夹住', () => {
    const maxAge = AGE_RANGE_LIMITS.max
    expect(maxAge).toBeLessThanOrEqual(new Date().getFullYear() - MIN_BIRTH_YEAR)
    for (let i = 0; i < 800; i++) {
      // 传入超出上限的年龄（旧版可拖到 130）也必须回到合法年份
      const b = randomBirthday(maxAge - 5, maxAge + 40)
      expect(isValidBirthday(b)).toBe(true)
      const age = ageFromBirthday(b)
      expect(age).toBeGreaterThanOrEqual(maxAge - 5)
      expect(age).toBeLessThanOrEqual(maxAge)
    }
  })

  it('回归：100~130 岁区间不再随机到 1900 年以前的生日', () => {
    expect(() => generateIdCard({ minAge: 100, maxAge: 130, centuryRule: true })).not.toThrow()
    for (let i = 0; i < 300; i++) {
      const r = generateIdCard({ minAge: 100, maxAge: 130, centuryRule: true })
      expect(isValidBirthday(r.birthday)).toBe(true)
      expect(r.age).toBeGreaterThanOrEqual(100)
      expect(validateIdCard(r.idNumber, { allowCenturyRule: true })).toEqual({ valid: true })
      const strict = generateIdCard({ minAge: 100, maxAge: 130 })
      expect(validateIdCard(strict.idNumber)).toEqual({ valid: true })
    }
  })
})

describe('validityTermYears（申领周岁 → 有效期档）', () => {
  it.each([
    [0, 5],
    [15, 5],
    [16, 10],
    [25, 10],
    [26, 20],
    [45, 20],
    [46, 'long'],
    [101, 'long'],
  ] as Array<[number, 5 | 10 | 20 | 'long']>)('%i 岁 → %s', (age, term) => {
    expect(validityTermYears(age)).toBe(term)
  })
})

describe('pickAddressCode', () => {
  it('demo 模式使用 99 开头的虚构号段', () => {
    for (const p of PROVINCES) {
      const code = pickAddressCode(p.name, undefined, 'demo')
      expect(code).toMatch(/^99\d{4}$/)
      expect(code).toHaveLength(6)
    }
    expect(pickAddressCode('江苏省', '苏州市', 'demo')).toBe(pickAddressCode('江苏', '苏州', 'demo'))
  })

  it('standard 模式使用省级码前缀且不会撞上 99', () => {
    const code = pickAddressCode('江苏省', '苏州市', 'standard')
    expect(code).toBe('320500')
    expect(code.startsWith('99')).toBe(false)
    expect(pickAddressCode('北京市', '东城区', 'standard')).toBe('110100')
  })

  it('省略省份时随机取表内节点，且省级码可作入参', () => {
    expect(pickAddressCode(undefined, undefined, 'demo')).toMatch(/^99\d{4}$/)
    expect(pickAddressCode('44', '深圳市', 'standard')).toBe('440300')
  })

  it('未知省份抛 RangeError', () => {
    expect(() => findProvince('不存在省')).toThrow(RangeError)
    expect(() => pickAddressCode('不存在省')).toThrow(/脱敏码表/)
  })
})

describe('generateIdCard', () => {
  it('结构完整且通过自身校验', () => {
    for (let i = 0; i < 300; i++) {
      const r = generateIdCard({ addressCodeMode: 'demo', minAge: 16, maxAge: 60 })
      expect(r.idNumber).toHaveLength(18)
      expect(r.idNumber).toBe(`${r.first17}${r.checkCode}`)
      expect(validateIdCard(r.idNumber)).toEqual({ valid: true })
      expect(r.checkCode).toBe(calcCheckCode(r.first17))
      expect(r.age).toBeGreaterThanOrEqual(16)
      expect(r.age).toBeLessThanOrEqual(60)
    }
  })

  it('顺序码第 3 位（整体第 17 位）奇男偶女', () => {
    for (let i = 0; i < 120; i++) {
      const male = generateIdCard({ gender: 'male' })
      expect(Number(male.idNumber[16]) % 2).toBe(1)
      expect(genderFromId(male.idNumber)).toBe('male')
      const female = generateIdCard({ gender: 'female' })
      expect(Number(female.idNumber[16]) % 2).toBe(0)
      expect(genderFromId(female.idNumber)).toBe('female')
    }
    expect(['male', 'female']).toContain(genderFromId(generateIdCard({ gender: 'random' }).idNumber)!)
  })

  it('指定生日时忽略年龄区间并反算年龄', () => {
    const r = generateIdCard({
      birthday: '2000-02-29',
      gender: 'female',
      addressCodeMode: 'standard',
      province: '江苏',
      city: '苏州',
      minAge: 99,
    })
    expect(r.birthday).toBe('20000229')
    expect(r.age).toBe(ageFromBirthday('20000229'))
    expect(r.addressCode).toBe('320500')
    expect(r.idNumber.slice(0, 6)).toBe('320500')
    expect(r.idNumber.slice(6, 14)).toBe('20000229')
    expect(() => generateIdCard({ birthday: '20010229' })).toThrow(RangeError)
  })

  it('年龄 ≥ 100 的历史规则只在开关打开时把校验码固定为 X', () => {
    // 固定种子：该种子下自然校验位不是 X，才能证明「强制 X」确实改变了结果
    const rng = () => 0.42
    const withRule = generateIdCard({
      birthday: '19261009',
      centuryRule: true,
      addressCodeMode: 'standard',
      province: '广东省',
      rng,
    })
    expect(withRule.age).toBeGreaterThanOrEqual(100)
    expect(withRule.checkCode).toBe('X')
    expect(withRule.centuryRuleApplied).toBe(true)
    expect(calcCheckCode(withRule.first17)).not.toBe('X')
    expect(validateIdCard(withRule.idNumber).valid).toBe(false)
    expect(validateIdCard(withRule.idNumber, { allowCenturyRule: true }).valid).toBe(true)

    const withoutRule = generateIdCard({ birthday: '19261009', centuryRule: false, rng })
    expect(withoutRule.centuryRuleApplied).toBe(false)
    expect(withoutRule.checkCode).toBe(calcCheckCode(withoutRule.first17))
    expect(validateIdCard(withoutRule.idNumber).valid).toBe(true)

    // 未开启开关时，100 岁以下绝不会被强制 X
    const young = generateIdCard({ birthday: '20000101', centuryRule: true })
    expect(young.centuryRuleApplied).toBe(false)
  })

  it('rng 可注入，保证同种子产出稳定', () => {
    let seed = 1
    const rng = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const a = generateIdCard({
      province: '四川省',
      city: '成都市',
      gender: 'male',
      birthday: '19900101',
      addressCodeMode: 'standard',
      rng,
    })
    seed = 1
    const b = generateIdCard({
      province: '四川省',
      city: '成都市',
      gender: 'male',
      birthday: '19900101',
      addressCodeMode: 'standard',
      rng,
    })
    expect(a.idNumber).toBe(b.idNumber)
    expect(a.addressCode).toBe('510100')
  })

  it('默认使用 demo 号段', () => {
    expect(generateIdCard().addressCode.startsWith('99')).toBe(true)
  })
})

describe('validateIdCard', () => {
  it('逐类给出拒绝原因', () => {
    expect(validateIdCard('')).toEqual({ valid: false, reason: '长度应为 18 位，当前 0 位' })
    expect(validateIdCard('11010519491A310020').reason).toMatch(/前 17 位/)
    expect(validateIdCard('11010519491231002x').reason).toMatch(/大写 X/)
    expect(validateIdCard('110105194913320028').reason).toMatch(/出生日期/)
    expect(validateIdCard('000105194912310021').reason).toMatch(/地址码/)
    // @ts-expect-error 非字符串入参
    expect(validateIdCard(123).valid).toBe(false)
  })

  it('篡改任意一位后校验码不匹配', () => {
    const r = generateIdCard({ birthday: '19900101' })
    for (let i = 0; i < 17; i++) {
      const digit = r.idNumber[i]
      const flipped = String((Number(digit) + 1) % 10)
      const tampered = `${r.idNumber.slice(0, i)}${flipped}${r.idNumber.slice(i + 1)}`
      expect(validateIdCard(tampered).valid).toBe(false)
    }
  })

  it('允许前后空白', () => {
    const r = generateIdCard({ birthday: '19900101' })
    expect(validateIdCard(`  ${r.idNumber}  `).valid).toBe(true)
  })
})

describe('姓名 / 住址 / 机关', () => {
  it('随机姓名包含姓与名且随性别变化字库', () => {
    const male = randomName('male')
    const female = randomName('female')
    expect(male.length).toBeGreaterThanOrEqual(2)
    expect(female.length).toBeGreaterThanOrEqual(2)
    expect(randomName()).toBeTruthy()
  })

  it('住址带籍贯与「演示/示例」字样', () => {
    const addr = randomAddress('浙江省', '杭州市')
    expect(addr.startsWith('浙江省杭州市')).toBe(true)
    expect(addr).toMatch(/演示|示例|样街|原型|测试|Mock/)
  })

  it('签发机关为虚构演示机关', () => {
    expect(randomAuthority('苏州市')).toBe('苏州市公安局演示分局')
  })
})

describe('脱敏码表自检', () => {
  it('省份数量为示例规模、市码为 4 位、民族共 56 个', () => {
    expect(PROVINCES.length).toBeLessThanOrEqual(20)
    for (const p of PROVINCES) {
      expect(p.code).toMatch(/^\d{2}$/)
      expect(p.cities.length).toBeGreaterThan(1)
      for (const c of p.cities) expect(c.code).toMatch(new RegExp(`^${p.code}\\d{2}$`))
    }
    expect(NATIONS).toHaveLength(56)
    expect(NATIONS[0]).toBe('汉')
  })
})
