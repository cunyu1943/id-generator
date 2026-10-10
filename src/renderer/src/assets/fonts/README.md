# 字体说明

本目录**不放字体二进制**，原因有三：

1. 卡面文字只用到中文姓名字、区划名与 18 位数字，系统自带字体完全够用；
2. 思源黑体 / 苹方 / 微软雅黑的再分发条款与体积（每个中文字体 5–15 MB）不适合一个演示工具；
3. Electron 的 `canvas` 文字测量依赖平台已安装字体，塞进 woff2 反而要额外注册 `@font-face` 且只对 DOM 生效。

绘制时使用的回退链见 `src/renderer/src/core/templates.ts`：

- `FONT_CN`：`'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', '微软雅黑', 'PingFang SC', sans-serif`
  （Windows 命中微软雅黑，macOS 命中苹方，Linux 命中思源黑体）
- `FONT_MONO`：`'JetBrains Mono', 'Consolas', 'Menlo', 'DejaVu Sans Mono', monospace`
  （身份证号按 18 个等宽槽位分布，等宽保证不挤行）

如果确实要自带字体：把 `.ttf`/`.otf` 放进本目录，在 `src/renderer/index.html` 里用 `@font-face` 注册，
并把 `FONT_CN` 的第一位换成该 family 名即可——Canvas 绘制与 DOM 共用同一份字体栈。
