#!/usr/bin/env node
/**
 * 零依赖 PNG 资源生成器。
 *
 * 正面模板与应用图标全部由这里按像素程序化绘制（纯渐变 + 几何图形，肉眼即知是示意
 * 素材）。反面底板是例外：它用的是用户提供的样例卡照片，脚本不再生成，见下方注释。
 * 默认头像是项目自带的 AI 生成演示人像，脚本只在它缺失时补一张程序化灰色剪影，不覆盖已有文件。
 *
 * 用法：node scripts/gen-assets.mjs
 */
import { deflateSync } from 'node:zlib'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // truecolour + alpha
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 极简画布：只提供本项目示意素材需要的几个图元 */
function createCanvas(width, height) {
  const buf = Buffer.alloc(width * height * 4)
  const px = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const i = (y * width + x) * 4
    const na = a / 255
    buf[i] = Math.round(buf[i] * (1 - na) + r * na)
    buf[i + 1] = Math.round(buf[i + 1] * (1 - na) + g * na)
    buf[i + 2] = Math.round(buf[i + 2] * (1 - na) + b * na)
    buf[i + 3] = Math.min(255, Math.round(buf[i + 3] + a))
  }
  const lerp = (a, b, t) => a + (b - a) * t

  return {
    width,
    height,
    px,
    fill(color) {
      const [r, g, b] = color
      for (let i = 0; i < buf.length; i += 4) {
        buf[i] = r
        buf[i + 1] = g
        buf[i + 2] = b
        buf[i + 3] = 255
      }
    },
    gradient(c0, c1) {
      for (let y = 0; y < height; y++) {
        const t = y / Math.max(1, height - 1)
        for (let x = 0; x < width; x++) {
          const s = (x / Math.max(1, width - 1) + t) / 2
          px(
            x,
            y,
            Math.round(lerp(c0[0], c1[0], s)),
            Math.round(lerp(c0[1], c1[1], s)),
            Math.round(lerp(c0[2], c1[2], s)),
          )
        }
      }
    },
    lines(step, color, alpha) {
      for (let y = -height; y < height * 2; y += step) {
        for (let x = 0; x < width; x++) {
          const yy = Math.round(y + x * 0.35)
          px(x, yy, color[0], color[1], color[2], alpha)
        }
      }
    },
    rect(x, y, w, h, color, alpha = 255) {
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) px(i, j, color[0], color[1], color[2], alpha)
    },
    strokeRect(x, y, w, h, t, color) {
      this.rect(x, y, w, t, color)
      this.rect(x, y + h - t, w, t, color)
      this.rect(x, y, t, h, color)
      this.rect(x + w - t, y, t, h, color)
    },
    circle(cx, cy, r, color, alpha = 255, filled = true) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          const d = Math.hypot(x - cx, y - cy)
          if (filled ? d <= r : Math.abs(d - r) <= 1)
            px(Math.round(x), Math.round(y), color[0], color[1], color[2], alpha)
        }
      }
    },
    toBuffer: () => buf,
  }
}

function save(rel, width, height, paint) {
  const path = resolve(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  const c = createCanvas(width, height)
  paint(c)
  writeFileSync(path, encodePng(width, height, c.toBuffer()))
  const kb = (c.toBuffer().length / 1024).toFixed(0)
  console.log(`✓ ${rel}  ${width}×${height}  (raw ${kb} kB)`)
}

/** 已存在的文件不覆盖：默认头像可由项目自带的人工素材替换 */
function saveIfMissing(rel, width, height, paint) {
  if (existsSync(resolve(root, rel))) {
    console.log(`· ${rel}  已存在，跳过`)
    return
  }
  save(rel, width, height, paint)
}

const S = 3 // 卡面模板倍率，对应导出 3x 时的清晰度上限
const AVATAR_S = 4

/**
 * 底纹公共层：细斜纹 + 一组同心圆「转印纹」。
 * 只做视觉示意，不模拟任何真实证件的防伪细节。
 */
function guilloche(c, ringColor, ringAlpha) {
  c.lines(21 * S, [255, 255, 255], 60)
  const cx = c.width * 0.78
  const cy = c.height * 0.22
  for (let r = 8 * S; r < 60 * S; r += 3 * S) c.circle(cx, cy, r, ringColor, ringAlpha, false)
}

/** 逐列填充的折线轮廓（山形示意），fn(x) 给出该列的顶部 y */
function silhouette(c, fn, color, alpha) {
  for (let x = 0; x < c.width; x++) {
    const top = Math.round(fn(x))
    if (top < c.height) c.rect(x, top, 1, c.height - top, color, alpha)
  }
}

// 正面底图（人像面）：暖粉底 + 转印纹 + 左下示意山形，对应样图色调
save(`src/renderer/src/assets/front-template.png`, 358 * S, 220 * S, (c) => {
  c.gradient([254, 238, 236], [243, 212, 207])
  guilloche(c, [228, 150, 142], 40)
  const base = c.height * 0.86
  silhouette(
    c,
    (x) =>
      base - Math.max(0, Math.sin((x / c.width) * Math.PI * 1.6) * c.height * 0.13 - (x / c.width) * c.height * 0.05),
    [206, 150, 142],
    70,
  )
  silhouette(
    c,
    (x) => base + 4 * S - Math.max(0, Math.sin((x / c.width) * Math.PI * 2.4 + 1) * c.height * 0.08),
    [186, 128, 122],
    55,
  )
})

// 反面底板（国徽面）不再程序化生成：改用 assets/back-template.png 里的样例卡照片，
// 标题、国徽与两行标签都在照片上，绘制层只盖遮罩补生成值（见 core/drawBack.ts 的 BACK_PLATE）。
// 这里如果重新生成一张纯色底纹，反面就会只剩两行字，所以刻意留空。

// 默认人像：仓库自带两张 AI 生成的演示人像（男/女各一张，绘制层按卡面性别取用）；
// 若被删除则退回程序化灰色剪影
const avatarPlaceholder = (c) => {
  c.fill([221, 232, 242])
  const cx = c.width / 2
  c.circle(cx, c.height * 0.34, c.width * 0.2, [150, 168, 188])
  c.circle(cx, c.height * 0.92, c.width * 0.42, [150, 168, 188])
  c.strokeRect(0, 0, c.width, c.height, AVATAR_S, [176, 194, 212])
}
for (const g of ['male', 'female']) {
  saveIfMissing(`src/renderer/src/assets/default-avatar-${g}.png`, 78 * AVATAR_S, 104 * AVATAR_S, avatarPlaceholder)
}

// 应用图标：一张带斜杠水印的示意卡片
save(`build/icon.png`, 512, 512, (c) => {
  c.fill([24, 34, 51])
  c.rect(64, 128, 384, 240, [225, 238, 250])
  c.rect(96, 168, 112, 160, [176, 200, 224])
  c.rect(240, 176, 176, 24, [120, 148, 178])
  c.rect(240, 224, 144, 24, [120, 148, 178])
  c.rect(240, 272, 160, 24, [120, 148, 178])
  for (let i = -512; i < 512; i += 44) {
    for (let t = 0; t < 720; t++) {
      const x = i + t
      const y = 60 + t * 0.55
      if (x >= 64 && x < 448 && y >= 128 && y < 368) c.px(Math.round(x), Math.round(y), 235, 90, 90, 70)
    }
  }
})

console.log('\n提示：卡面模板与图标为程序化绘制的示意图形；默认人像为项目自带的 AI 生成演示图（男/女各一张）。')
