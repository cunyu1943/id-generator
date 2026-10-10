# 身份证正反面演示图生成器（id-generator）

[![Release](https://github.com/cunyu1943/id-generator/actions/workflows/release.yml/badge.svg)](https://github.com/cunyu1943/id-generator/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)

> **用途声明**
> 本工具仅用于 UI 原型演示、测试数据 Mock、教学示例。
> 导出的图片**默认**带水印「仅作演示用，请勿用于任何真实业务」（可在高级选项关闭，关闭后导出干净卡面），代码与素材中**不包含任何真实公民个人信息**。
> 任何把产物用于真实业务、身份核验、对外宣称真实证件的用法都不在本工具的设计范围内。

离线桌面应用：Electron + Vue 3.5 + TypeScript，卡面由纯 Canvas 2D 手工绘制（不依赖 html2canvas），全程断网可用。

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [使用说明](#使用说明)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [核心实现说明](#核心实现说明)
- [测试与质量](#测试与质量)
- [打包与发版](#打包与发版)
- [已知边界](#已知边界)
- [许可](#许可)

## 功能特性

| 模块     | 说明                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| 卡面生成 | 正面 / 反面 / 双面纵向合并（中间 40px 分隔带 + 说明文字），导出前可实时预览                   |
| 号码生成 | 18 位 = 6 位区划 + 8 位生日 + 3 位顺序码 + 1 位校验码，按 GB 11643 加权算法；第 17 位奇男偶女 |
| 生日来源 | 「年龄区间」随机取生日 或 「指定生日」精确指定，两者可切换                                    |
| 参数面板 | 姓名（重掷）、性别（男/女/随机）、民族（56 项）、省/市（脱敏表）、住址、签发机关、有效期      |
| 有效期   | 按「申领当日周岁」自动推算 5/10/20 年或长期，也可关掉档位手动填写                             |
| 人像     | 内置男女演示头像，按卡面性别自动取用；支持上传本地图片，圆角只裁不拉伸                        |
| 水印     | 平铺 / 对角线两种排布，可调文字、透明度、密度；PNG 内嵌 `tEXt`/`iTXt` 元数据                  |
| 导出     | 2x / 3x 倍率，PNG / JPG(q0.92)，系统保存对话框，导出后一键「打开所在文件夹」                  |
| 持久化   | 参数写入 `localStorage`，窗口缩放、最小化、重开都不丢（人像不入库）                           |
| 安全边界 | `nodeIntegration=off`、`contextIsolation=on`、`sandbox=on`，渲染进程只能走 preload 白名单 API |

## 快速开始

环境要求：Node 24、pnpm 12（版本已写在 `package.json` 的 `packageManager` 字段，`pnpm-lock.yaml` 已锁定依赖）。

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发模式（Electron 窗口 + 热更新）
pnpm build            # 类型检查 + 三目标构建（main / preload / renderer）
```

从零初始化项目时需要注意两点（pnpm 12 的默认行为）：

```bash
pnpm approve-builds --all    # 放行 electron / esbuild 等构建脚本
node node_modules/electron/install.js   # postinstall 被跳过时手动补 Electron 二进制
pnpm gen:assets              # 生成占位素材（卡面底纹 / 应用图标）
```

## 使用说明

1. 左侧面板填写/选择参数，右侧实时预览。任一参数变更后号码**同步**重算，预览 **300ms** 防抖重绘。
2. 点击「随机生成」一次性重掷籍贯、姓名、住址、机关、生日与顺序码；「重置」回到出厂参数（仍保证号码自校验通过）。
3. 未上传人像时导出会二次确认「当前使用默认头像，是否继续？」。
4. 「导出正面 / 导出反面 / 导出双面合并」走系统保存对话框，成功后提示完整路径并提供「打开所在文件夹」。
5. 「高级选项」折叠面板包含：演示号段、历史规则、有效期档位、水印（开关/文字/排布/透明度/密度）、导出倍率与格式。
6. 窗口宽度 < 1024px 时左右两栏自动变为上下堆叠。

## 技术栈

| 包               | 版本    | 说明                                              |
| ---------------- | ------- | ------------------------------------------------- |
| electron         | 44.7.0  | 桌面运行时                                        |
| electron-vite    | 5.0.0   | 三入口（main / preload / renderer）构建           |
| vite             | 7.3.7   | **不能升 8**：electron-vite 5 尚未支持            |
| vue              | 3.5.43  | 全部 `<script setup>` + Composition API           |
| vue-router       | 5.4.0   | hash 模式；要求 vite ≥ 7.3                        |
| pinia            | 4.0.3   | setup store                                       |
| element-plus     | 2.14.7  | 按需自动导入（unplugin-auto-import / components） |
| typescript       | 5.9.3   | 严格模式；`vue-tsc` 做模板类型检查                |
| vitest           | 5.0.3   | `environment: 'node'`，用假 canvas 驱动 core      |
| electron-builder | 26.15.3 | Windows NSIS + macOS dmg                          |

> 渲染层依赖全部放进 `devDependencies`：vite 会把它们打进 `out/renderer`，若留在 `dependencies`，electron-builder 会把整棵依赖树再复制进 asar（实测多出 40 MB）。

## 目录结构

```
id-generator/
├─ electron.vite.config.ts        # main/preload/renderer 三目标 + Element Plus 按需插件
├─ electron-builder.yml           # Windows NSIS + macOS dmg
├─ vitest.config.ts               # 只测 core/，覆盖率阈值 80/80/80/75
├─ pnpm-workspace.yaml            # 构建脚本白名单（pnpm 12 起不再读 package.json）
├─ scripts/gen-assets.mjs         # 零依赖 PNG 编码器，程序化绘制底纹/图标
├─ build/icon.png
└─ src/
   ├─ main/
   │  ├─ index.ts                 # 窗口、安全 webPreferences、加载策略
   │  └─ ipc/{app.ts,file.ts}     # app:getVersion / file:saveImage / file:selectFace / file:revealPath
   ├─ preload/
   │  ├─ index.ts                 # contextBridge 白名单 window.api，只用 invoke
   │  └─ index.d.ts
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ App.vue  main.ts  router/index.ts  env.d.ts
         ├─ views/{GeneratorView.vue,AboutView.vue}
         ├─ components/{ParamPanel,IdCardPreview,FaceUploader,WatermarkLayer}.vue
         ├─ core/{idCardGenerator,drawFront,drawBack,watermark,templates,assets}.ts
         ├─ core/__tests__/{idCardGenerator,draw,watermark,assets}.test.ts + helpers/fakeCanvas.ts
         ├─ stores/useIdCardStore.ts
         ├─ types/{idcard.d.ts,auto-imports.d.ts,components.d.ts}
         └─ assets/{front-template.png,back-template.png,default-avatar-male.png,default-avatar-female.png,fonts/README.md}
```

其中两个 core 文件是为打破反向依赖而拆出来的：

- `core/templates.ts`：号段表、姓名库、街道库、卡面尺寸常量、字体栈、水印默认值（绘制层和 store 都要用）。
- `core/assets.ts`：内置 PNG 的加载与注入点。绘制函数不直接 `import` 图片，而是从这里的注册表取，单测才能塞假图片对象。

内置素材：`front-template.png` 49.1 kB、`back-template.png` 319.5 kB（反面样例卡照片，460×292）、`default-avatar-male.png` 96.3 kB（320×427）、`default-avatar-female.png` 146.5 kB（477×419）。人像框 78×104，`centerCrop` 只裁不拉伸。

## 核心实现说明

### 号码生成规则

- 18 位 = 6 位区划 + 8 位生日 + 3 位顺序码 + 1 位校验码；第 17 位**奇=男、偶=女**。
- 校验位：`W=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]`，`CHECK_MAP=['1','0','X','9','8','7','6','5','4','3','2']`。
- `addressCodeMode:'demo'`（默认）用 `99` 开头的明显虚构号段，仍按同一套加权算法算校验位；`'standard'` 才套用内置脱敏省市表的区划码前缀（表内共 11 个示例省，非全量数据）。
- **历史规则**：`centuryRule` 打开且年龄 ≥ 100 时校验位强制 `X`（故意不符合现行加权算法），`validateIdCard` 默认严格拒绝，只有显式传 `{allowCenturyRule:true}` 才放行——UI 里两个开关分开，自校验用宽松口径。
- **生日边界**：只接受 `1900-01-01 ≤ 生日 ≤ 今天`；年龄上界为 `min(130, 今年 − 1900)`（2026 年即 126），超界请求静默夹回上限。
- 导出 API：`generateIdCard` / `validateIdCard` / `calcCheckCode` / `pickAddressCode` / `randomBirthday`，另有 `ageFromBirthday`、`isLeapYear`、`isValidBirthday`、`MIN_BIRTH_YEAR`、`randomName`、`randomAddress`、`randomAuthority`、`validityTermYears` 供 store 复用。

### 绘制与水印

- 逻辑坐标系固定 358×220（96dpi，真实身份证 85.6mm × 54mm），所有绘制函数接收 `scale`，先 `ctx.scale(scale, scale)` 再按逻辑像素画，2x/3x 导出只换倍率。
- **正面**：暖粉底 + 程序化转印纹与示意山形，人像在右、文字在左。行位 `姓名 60 / 性别·民族 88 / 出生 113 / 住址 138（最多 3 行）/ 公民身份号码 190`；人像框 `x=265, y=52, w=78, h=104`，圆角 `clip` + 居中裁剪。
- **反面**：底板为用户提供的样例卡照片（`back-template.png`），铺满逻辑坐标系。照片自带的签发机关与有效期限用两块纯色遮罩（`#dddee2`）盖掉后重写生成值；有效期格式 `2015.03.12-2035.03.12` / `2015.03.12-长期`，日期段用等宽字体、「长期」走中文字体。缺素材或 `useTemplateBackground: false` 时回落到程序化反面（冷青渐变 + 逐字标题 + 程序化国徽占位图）。
- **水印**：`tile`（-30° 错位平铺）与 `diagonal`（单条对角大字）两种模式，默认 `opacity 0.18 / #000000 / 14px`，随导出倍率放大；属**破坏性叠加**（直接画进最终画布，不是 DOM 覆盖层）。导出时再补一条底部固定水印，PNG 额外写 `tEXt`（关键词 `DemoOnly`，同时写 `iTXt`）。
- 水印可通过「高级选项 → 水印」关闭（默认开启）：`enabled` 只有显式 `false` 才关闭，启用时透明度被 `MIN_OPACITY=0.06` 夹住，文案清空则回落强制文案。写盘前用 `readWatermarkMetadata` 复核 PNG 元数据，不一致直接抛错中止；关闭时像素水印与元数据都不写。
- 水印绘制失败一律 `throw`：预览层把画布刷灰并提示，导出层弹错误信息，绝不静默产出没有水印的图。

### 有效期档位

按《居民身份证法》第五条，以「申领（签发）当日周岁」推算：未满 16 周岁 5 年、16~25 周岁 10 年、26~45 周岁 20 年、46 周岁及以上长期。纯函数 `validityTermYears(ageAtIssue)` 在 `core/idCardGenerator.ts`，store 里以 `form.validFrom` 为基准日计算，`syncValidity()` 把 `form.validTo` 写成「签发日 + N 年」（`shiftIso` 对 2/29 落到 2/28）。关掉「有效期档位」开关后回到手动填写，重掷也不再改动手填的值。

### 架构与 IPC

```
renderer（纯业务，禁 fs/path，nodeIntegration=off，contextIsolation=on，sandbox=on）
   │  window.api.*  ← 唯一出口
preload（contextBridge 白名单，全部 ipcRenderer.invoke，禁用 sendSync）
   │  ipcMain.handle('module:action')
main（窗口 / 对话框 / 写盘 / showItemInFolder）
```

| 通道              | 入参                             | 返回                                        | 说明                                                                        |
| ----------------- | -------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| `file:saveImage`  | `{dataUrl, defaultName, format}` | `{canceled, savedPath?, error?}`            | `showSaveDialog` → 校验 dataURL 魔数 → 写盘；文件名过滤路径分隔符与控制字符 |
| `file:selectFace` | —                                | `{canceled, path?, base64?, size?, error?}` | `openFile` 单选、≤5MB、按魔数判 png/jpeg；渲染进程拿不到 fd                 |
| `file:revealPath` | `path: string`                   | `{canceled, error?}`                        | `isAbsolute` + `fs.access` 后 `shell.showItemInFolder`                      |
| `app:getVersion`  | —                                | `string`                                    | 关于页显示                                                                  |

日期选择器面板通过 `App.vue` 最外层的 `<ElConfigProvider :locale="zhCn">` 注入中文 locale（按需导入下没有全局 `app.use(ElementPlus)`），`value-format="YYYY-MM-DD"` 保证持久化格式与界面语言无关。

## 测试与质量

```bash
pnpm typecheck   # tsc(node) + vue-tsc(web)，均 0 error
pnpm lint        # eslint --max-warnings 0 通过
pnpm test        # 103 passed（4 个文件，全部针对 core/）
pnpm coverage    # stmts 98.16% / branch 92.28% / funcs 99.03% / lines 98.86%
pnpm build       # out/main + out/preload + out/renderer 产出成功
```

`core/` 为纯逻辑，Canvas 相关通过可注入的假实现（`__tests__/helpers/fakeCanvas.ts`）驱动，因此测试跑在 node 环境，不需要 jsdom。

## 打包与发版

```bash
pnpm dist:win    # Windows NSIS 安装包 → release/
pnpm dist:mac    # macOS dmg，必须在 macOS 上执行（不支持跨平台产 dmg）
```

未配置签名证书：Windows 首次运行会有 SmartScreen 提示，macOS 产物需右键「打开」绕过 Gatekeeper。

体积构成（`electron-builder --win --dir` 实测 `release/win-unpacked`）：

| 项                       | 优化前           | 优化后         | 说明                                                  |
| ------------------------ | ---------------- | -------------- | ----------------------------------------------------- |
| **合计**                 | **418.7 MB**     | **330.3 MB**   | −88.4 MB（−21%）                                      |
| 主程序 exe               | 234.9 MB         | 234.9 MB       | Electron 44 x64 的 `electron.exe` 改名，动不了        |
| `resources/app.asar`     | 42.2 MB          | 2.1 MB         | 渲染层依赖挪进 `devDependencies` 后只剩 19 个条目     |
| `locales/`               | 49.6 MB（55 个） | 1.1 MB（2 个） | `electronLanguages: [zh-CN, en-US]`，要繁体补 `zh-TW` |
| GPU 后备 dll 组合        | 31.2 MB          | 31.2 MB        | ANGLE / SwiftShader 后备链，缺了部分机器黑屏          |
| `LICENSES.chromium.html` | 20.0 MB          | 20.0 MB        | Chromium 第三方声明的合规要求，不能删                 |

CI 实测 `id-generator-Setup-1.0.0.exe` = **98.8 MB**（默认压缩）。产物名（`artifactName`）必须纯 ASCII——electron-builder 会剥掉非 ASCII 字符，`${productName}` 实测得到的是 `-Setup-1.0.0.exe`。

### 自动发版

`.github/workflows/release.yml`：**push 到 `main`（或手动 `workflow_dispatch`）→ 验证 → 双平台打包 → 上传 GitHub Release**。

| 任务      | runner                               | 做什么                                                                      |
| --------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `verify`  | ubuntu-latest                        | `pnpm lint` / `pnpm typecheck` / `pnpm test`，Node 24 + `--frozen-lockfile` |
| `build`   | windows-latest、macos-latest（矩阵） | `electron-vite build` + `electron-builder --win` / `--mac --publish never`  |
| `release` | ubuntu-latest                        | 汇总产物并发布 Release                                                      |

发版按版本号滚动：Release tag 取 `package.json` 的 `version`，已存在则 `gh release upload --clobber` 覆盖并把 target 移到本次提交。无需额外 secret，使用内置 `GITHUB_TOKEN`。**同一版本反复 push 只会有一份最新安装包**，要留历史版本请先 bump `version`。上传后还会按 asset id 删掉不在本次产物列表里的旧文件（改名或换架构留下的残留，比缺一份更容易误导使用者）。

两个踩过一次的坑：**`build` 命令行只能给平台旗标**，写成 `--mac dmg` 会整段替换配置里的 `mac.target`，而 arch 是挂在 target 条目上的（`arch: [x64, arm64]`），一起被丢掉后就只出宿主架构一个 dmg；**只改文档不会触发发版**（`on.push.paths-ignore: ['**.md']`），macOS runner 的计费分钟数是 Linux 的 10 倍。首轮工作流四个任务全绿但 Release 里的产物名和个数都不对，所以发版后要核对的是 `/releases` 的 asset 列表，不是工作流的状态点。

## 已知边界

- 「历史规则」产生的号码故意不符合 GB 11643 校验算法，仅用于演示该开关。
- 水印按用户后续决定改为「可关闭」，与最初需求相反；默认仍开启，关闭时可见水印与 PNG `DemoOnly` 元数据都不产出。
- 反面底板换成了真实样例卡照片，与最初需求「不要抓取真实素材」相反：底板里的国徽是真实制式图案；照片自带的机关/有效期原值靠两块纯色遮罩盖掉，放大看会得到两条略平的浅带；底板仅 460×292，3x 导出时被放大 2.3 倍，花纹比程序化正面偏软。
- 年龄区间上限受编码年份约束（2026 年为 126），无法再填 127~130；`rebuild()` 对失效缓存走「重掷区间内生日」的自愈分支。
- 民族表、姓名库、街道库都是演示用短表，不做穷举覆盖。
- 字体不随包分发，走系统回退链（见 `src/renderer/src/assets/fonts/README.md`）。
- 在浏览器里直接打开 renderer（非 Electron）时导出会明确报「未检测到桌面端 bridge」，其余功能可正常联调。
- 开发模式控制台会有一条 Electron 官方 `Insecure Content-Security-Policy` **警告**，打包后自动消失。
- 导出对话框与「打开所在文件夹」是原生模态窗，自动化探针不代为点击，这两条链路由单测覆盖到边界为止。

## 许可

[MIT](./LICENSE) © 2026 村雨遥 (cunyu1943)
