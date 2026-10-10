import type { ProvinceNode, WatermarkOptions } from '../types/idcard'

/**
 * 演示用静态数据表。
 *
 * 脱敏说明：
 * - 省级码前缀取自公开的行政区划编码，仅保留若干「示例市」，不是全量真实数据；
 * - 市一级名称虽然真实存在，但配合 `99` 开头的虚构号段与「演示/示例」街道，
 *   产出的地址码不可能对应任何真实签发记录；
 * - 姓名库为通用虚构名，街道一律带「演示」「示例」标记。
 */

/** demo 模式号段前缀：任何真实身份证地址码都不以 99 开头 */
export const DEMO_ADDRESS_PREFIX = '99'

/** 脱敏省级码表（10 个示例省 + 每省 2~3 个示例市） */
export const PROVINCES: ProvinceNode[] = [
  {
    code: '11',
    name: '北京市',
    cities: [
      { code: '1101', name: '东城区' },
      { code: '1102', name: '西城区' },
    ],
  },
  {
    code: '12',
    name: '天津市',
    cities: [
      { code: '1201', name: '和平区' },
      { code: '1202', name: '河东区' },
    ],
  },
  {
    code: '31',
    name: '上海市',
    cities: [
      { code: '3101', name: '黄浦区' },
      { code: '3102', name: '徐汇区' },
    ],
  },
  {
    code: '32',
    name: '江苏省',
    cities: [
      { code: '3201', name: '南京市' },
      { code: '3203', name: '徐州市' },
      { code: '3205', name: '苏州市' },
    ],
  },
  {
    code: '33',
    name: '浙江省',
    cities: [
      { code: '3301', name: '杭州市' },
      { code: '3303', name: '温州市' },
      { code: '3304', name: '嘉兴市' },
    ],
  },
  {
    code: '37',
    name: '山东省',
    cities: [
      { code: '3701', name: '济南市' },
      { code: '3702', name: '青岛市' },
    ],
  },
  {
    code: '42',
    name: '湖北省',
    cities: [
      { code: '4201', name: '武汉市' },
      { code: '4205', name: '宜昌市' },
    ],
  },
  {
    code: '44',
    name: '广东省',
    cities: [
      { code: '4401', name: '广州市' },
      { code: '4403', name: '深圳市' },
      { code: '4404', name: '珠海市' },
    ],
  },
  {
    code: '50',
    name: '重庆市',
    cities: [
      { code: '5001', name: '渝中区' },
      { code: '5002', name: '江北区' },
    ],
  },
  {
    code: '51',
    name: '四川省',
    cities: [
      { code: '5101', name: '成都市' },
      { code: '5107', name: '绵阳市' },
    ],
  },
  {
    code: '61',
    name: '陕西省',
    cities: [
      { code: '6101', name: '西安市' },
      { code: '6104', name: '咸阳市' },
    ],
  },
]

/** 56 个民族（公开常识数据，卡面惯例省略「族」字，默认「汉」） */
export const NATIONS: string[] = [
  '汉',
  '蒙古',
  '回',
  '藏',
  '维吾尔',
  '苗',
  '彝',
  '壮',
  '布依',
  '朝鲜',
  '满',
  '侗',
  '瑶',
  '白',
  '土家',
  '哈尼',
  '哈萨克',
  '傣',
  '黎',
  '傈僳',
  '佤',
  '畲',
  '高山',
  '拉祜',
  '水',
  '东乡',
  '纳西',
  '景颇',
  '柯尔克孜',
  '土',
  '达斡尔',
  '仫佬',
  '羌',
  '布朗',
  '撒拉',
  '毛南',
  '仡佬',
  '锡伯',
  '阿昌',
  '普米',
  '塔吉克',
  '怒',
  '乌孜别克',
  '俄罗斯',
  '鄂温克',
  '德昂',
  '保安',
  '裕固',
  '京',
  '塔塔尔',
  '独龙',
  '鄂伦春',
  '赫哲',
  '门巴',
  '珞巴',
  '基诺',
]

/** 虚构姓名库：姓 + 名，均为通用字，不指向任何真实个人 */
export const SURNAMES: string[] = [
  '赵',
  '钱',
  '孙',
  '李',
  '周',
  '吴',
  '郑',
  '王',
  '冯',
  '陈',
  '褚',
  '卫',
  '蒋',
  '沈',
  '韩',
  '杨',
  '朱',
  '秦',
  '尤',
  '许',
  '何',
  '吕',
  '施',
  '张',
]

export const MALE_NAMES: string[] = ['志强', '建国', '海涛', '文轩', '子轩', '梓豪', '明杰', '宇航', '嘉树', '睿哲']

export const FEMALE_NAMES: string[] = ['淑仪', '雨桐', '思远', '欣怡', '若彤', '梦琪', '静姝', '嘉怡', '芷若', '婉清']

/** 地址模板：一律带「演示」「示例」字样，保证肉眼可辨 */
export const DEMO_STREETS: string[] = ['演示大道', '示例路', '样街', '原型巷', '测试大道', 'Mock 路']

export const DEMO_BUILDINGS: string[] = ['示例大厦', '演示小区', '样版公寓', '原型大楼', '测试花园']

/** 签发机关后缀，配合市名构成明显虚构的机关名 */
export const DEMO_AUTHORITY_DISTRICT = '演示'

/** 卡面逻辑尺寸：按 96dpi 的真实身份证比例（85.6mm × 54mm） */
export const CARD = {
  width: 358,
  height: 220,
  /**
   * 人像区尺寸沿用需求给定的 78 × 104，位置按样图移到右侧
   * （真实卡面人像在右、文字在左）。
   */
  photo: { x: 265, y: 52, w: 78, h: 104, radius: 5 },
  /** 正面文字起始 x */
  textLeft: 16,
  /** 正面右侧留白 */
  rightMargin: 14,
  /** 卡面四周的圆角描边 */
  frame: { inset: 3, radius: 9, lineWidth: 1.1, color: '#4a5c6b' },
} as const

/** 字体回退链：中文优先思源黑体，数字用等宽 */
export const FONT_CN =
  "'Source Han Sans SC','Noto Sans CJK SC','思源黑体','Microsoft YaHei','微软雅黑','PingFang SC','Hiragino Sans GB','SimHei',sans-serif"
export const FONT_MONO =
  "'JetBrains Mono','SFMono-Regular','Consolas','Menlo','DejaVu Sans Mono','Courier New',monospace"

/** 默认水印文案（需求声明的强制内容，文案留空时回落到它） */
export const MANDATORY_WATERMARK_TEXT = '仅作演示用，请勿用于任何真实业务'

/** 水印默认参数 */
export const WATERMARK_DEFAULTS: WatermarkOptions = {
  enabled: true,
  mode: 'tile',
  text: MANDATORY_WATERMARK_TEXT,
  opacity: 0.18,
  color: '#000000',
  fontSize: 14,
  rowGap: 44,
  colGap: 120,
  density: 1,
  angle: -30,
  bottomBar: true,
}

/** 导出默认参数 */
export const EXPORT_DEFAULTS = { scale: 3, format: 'png', jpgQuality: 0.92, mergeGap: 40 } as const

/** 「演示/测试」用途声明，About 页与合并图分隔条共用 */
export const USAGE_NOTICE = '本工具生成内容仅作演示用，请勿用于任何真实业务'
