# 身份证正反面演示图生成器（id-generator）

> **用途声明**：本工具仅用于 UI 原型演示、测试数据 Mock、教学示例。
> 导出的图片**默认**带水印「仅作演示用，请勿用于任何真实业务」（可在高级选项关闭，关闭后导出干净卡面），代码与素材中**不包含任何真实公民个人信息**。
> 任何把产物用于真实业务、身份核验、对外宣称真实证件的用法都不在本工具的设计范围内。

Electron 28+ / Vue 3.5 / TypeScript 离线桌面工具，纯 Canvas 2D 手工绘制卡面，不依赖 html2canvas，全程断网可用。

---

## 一、从零初始化

```bash
# 1. 脚手架（electron-vite 官方模板，选 vue-ts）
pnpm create @quick-start/electron id-generator --template vue-ts
cd id-generator

# 2. 渲染层库：必须用 -D。vite 会把它们全量打进 out/renderer，放进 dependencies 的话
#    electron-builder 会再原样复制一棵依赖树进 asar（实测多 40 MB，见「八、打包」）
pnpm add -D vue@^3.5 pinia@^4 vue-router@^5 element-plus@^2.14 @element-plus/icons-vue

# 3. 构建与工具链
pnpm add -D electron electron-builder electron-vite \
  @vitejs/plugin-vue unplugin-auto-import unplugin-vue-components \
  typescript vue-tsc vitest @vitest/coverage-v8 \
  eslint eslint-plugin-vue typescript-eslint prettier @types/node

# 4. pnpm 12 默认拦构建脚本：放行 electron / esbuild / electron-winstaller
#    （写在 pnpm-workspace.yaml 的 allowBuilds，pnpm 12 起不再读 package.json 里的 onlyBuiltDependencies）
pnpm approve-builds --all

# 5. electron 的二进制若没下来（postinstall 被跳过），手动补一次
node node_modules/electron/install.js

# 6. 生成占位素材（卡面底纹 / 应用图标）
pnpm gen:assets

pnpm install
pnpm dev
```

版本矩阵（实测组合，`pnpm-lock.yaml` 已锁定）：

| 包            | 版本   | 说明                                         |
| ------------- | ------ | -------------------------------------------- |
| electron      | 44.7.0 | 满足「28+」；44 是当前 stable                |
| electron-vite | 5.0.0  | 三入口（main / preload / renderer）构建      |
| vite          | 7.3.7  | **不能升 8**：electron-vite 5 尚未支持       |
| vue           | 3.5.43 | 全部 `<script setup>` + Composition API      |
| vue-router    | 5.4.0  | hash 模式；要求 vite ≥ 7.3                   |
| pinia         | 4.0.3  | setup store                                  |
| element-plus  | 2.14.7 | 按需自动导入                                 |
| typescript    | 5.9.3  | 刻意不跟 7.x 原生端口                        |
| vitest        | 5.0.3  | `environment: 'node'`，用假 canvas 驱动 core |

## 二、目录骨架

```
id-generator/
├─ electron.vite.config.ts        # main/preload/renderer 三目标 + Element Plus 按需插件
├─ electron-builder.yml           # Windows NSIS + macOS dmg
├─ vitest.config.ts               # 只测 core/，全局阈值 80/80/80/75
├─ pnpm-workspace.yaml            # onlyBuiltDependencies 白名单
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

需求清单里的文件全部到位，另加两个 core 文件：

- `core/templates.ts`：号段表、姓名库、街道库、卡面尺寸常量、字体栈、水印默认值。抽出来是因为绘制层和 store 都要用，放任何一边都会造成反向依赖。
- `core/assets.ts`：四张内置 PNG 的加载与注入点。绘制函数不直接 `import` 图片，而是从这里的注册表取，单测才能塞假图片对象。

内置素材体积（进 renderer 产物）：`front-template.png` 49.1 kB、`back-template.png` 319.5 kB（反面样例卡照片，460×292）、`default-avatar-male.png` 96.3 kB（320×427）、`default-avatar-female.png` 146.5 kB（477×419）。头像是两张，按卡面性别取用（`ImageBundle.defaultAvatars: Record<Gender, …>`，`drawFront` 用 `data.gender` 选，用户上传的 `face` 优先级更高；性别选「随机」时跟着本次解析出的性别走）。人像框 78×104、比例 0.75，`centerCrop` 只裁不拉伸：男性源图比例 0.749 几乎不用裁，女性源图横向裁到 314×419。反面底板是单张素材里最大的一块，要瘦身可以转 JPEG 或降到 358×220——`drawCardBackground` 只做整幅拉伸，不依赖具体尺寸。四张头像/底板是仅有的非程序化素材。

## 三、架构与 IPC

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

## 四、号码生成规则（阶段一）

- 18 位 = 6 位区划 + 8 位生日 + 3 位顺序码 + 1 位校验码；第 17 位**奇=男、偶=女**。
- 校验位：`W=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]`，`CHECK_MAP=['1','0','X','9','8','7','6','5','4','3','2']`。
- `addressCodeMode:'demo'`（默认）用 `99` 开头的明显虚构号段，仍按同一套加权算法算校验位。
- `addressCodeMode:'standard'` 才套用内置脱敏省市表里的真实区划码前缀（表里只留若干示例市，不是全量数据）。
- **历史规则**：`centuryRule` 开关打开且年龄 ≥ 100 时校验位强制 `X`。这会故意不符合现行加权算法，所以 `validateIdCard` 默认严格拒绝，只有显式传 `{allowCenturyRule:true}` 才放行——UI 里两个开关是分开的，自校验用的就是宽松口径，并在「关于」页写明。
- **生日边界**：`isValidBirthday` 只接受 `1900-01-01 ≤ 生日 ≤ 今天`（晚于今天会产生负周岁）。与之配套，年龄上界是 `AGE_RANGE_LIMITS.max = min(130, 今年 − 1900)`——2026 年即 126，「历史规则」打开后滑块也就推到这里，`randomBirthday` 再把区间下界夹一次 `MIN_BIRTH_YEAR`，双重保证随机出的生日永远落在可编码年份内。请求超过 126 岁的年龄（例如旧版残留的 `[100,130]`）会被静默夹回上限。

导出 API：`generateIdCard` / `validateIdCard` / `calcCheckCode` / `pickAddressCode` / `randomBirthday`（另有 `ageFromBirthday`、`isLeapYear`、`isValidBirthday`、`MIN_BIRTH_YEAR`、`randomName`、`randomAddress`、`randomAuthority` 供 store 复用）。

## 五、绘制与水印（阶段三、四）

- 逻辑坐标系固定 358×220（96dpi），所有绘制函数接收 `scale`，先 `ctx.scale(scale, scale)` 再按逻辑像素画，2x/3x 导出只是换倍率。
- 排版按用户提供的样例卡对齐（人像在右、文字在左，四周 3px 内缩圆角描边）：
  - 正面：暖粉底 + 程序化转印纹与示意山形；标签加粗、值紧跟。行位 `姓名 60 / 性别·民族 88 / 出生 113 / 住址 138（最多 3 行，超出省略号）/ 公民身份号码 190`，住址右边界止于人像左侧。人像框 `x=265, y=52, w=78, h=104`（尺寸沿用阶段三给定的 78×104，位置按样图移到右侧），圆角 `clip` + **只裁切不拉伸**的居中裁剪；出生按样图写成 `1990 年 3 月 7 日`；号码按 18 等分槽位用等宽字体逐位排布。
  - 反面：底板换成用户提供的样例卡照片——`assets/back-template.png` 是从原图裁出的 460×292 卡面外接矩形，铺满 358×220 逻辑坐标系。标题、国徽、「签发机关 / 有效期限」两行标签和圆角边框都在照片上，绘制层只做两件事（`drawBack` 靠 `drawCardBackground` 的返回值判断底板是否已画）：先用 `BACK_PLATE` 的两块遮罩盖掉照片里的原始值（`#dddee2`，取自原值区域的背景均值），再在标签右侧写生成值——签发机关 `x=142 / baseline=169`、有效期限 `x=142 / baseline=198`，字号 11px（底板标签字高 14px 折算而来），机构名超出遮罩净宽时按「…」截断。有效期格式 `2015.03.12-2035.03.12` / `2015.03.12-长期`（分隔符两侧不留空格，否则 OCR 会把两段日期拆成两个 token），日期段用等宽字体（与正面身份证号同族），「长期」是中文、另起一段走中文字体。**尾缀的起笔 x 必须在中文字体之前 `measureText`**：`drawValidityValue` 里先 `ctx.font = mono` 画日期、再切 `FONT_CN` 画「长期」，如果切完字体才量日期宽度，量到的是中文字体那套更窄的数字步进（真实 Chromium 下 `2026.10.10-` 等宽 72.6px / 中文 61.66px），「长期」就会往左压掉连字符，渲染成 `2026.10.10长期`。
  - 底板没画上时（缺素材，或调用方传 `useTemplateBackground: false`）回落到程序化反面：冷青渐变底纹 + 两行逐字居中标题（`中华人民共和国` 18px / `居民身份证` 25px）+ **程序化国徽占位图** + 自绘的 `签发机关 158 / 有效期限 184` 两行，日期用 `NUMBER_FONT`（16px）。
  - 正面模板 `front-template.png` 只负责底色与底纹，人像框与描边由绘制层负责，改布局不必重新生成素材。反面底板是例外：它是一张完整卡面照片，`scripts/gen-assets.mjs` 已删掉对应的生成块，跑 `pnpm gen:assets` 不会把它覆盖回去。
- 水印：`tile`（-30° 错位平铺）与 `diagonal`（单条对角大字）两种模式，默认 `opacity 0.18 / #000000 / 14px`，随导出倍率放大；绘制是**破坏性叠加**（直接画进最终画布，不是 DOM 覆盖层）；导出时再补一条底部固定水印；PNG 额外写 `tEXt`（关键词 `DemoOnly`，同时写 `iTXt` 供国际化读取）。
- **水印可通过「高级选项 → 水印」开关关闭**（默认开启）。原始需求写的是"不允许提供关闭水印的开关"，这一条已按用户明确决定改为可配置，取舍记录在第九节：
  1. `WatermarkOptions.enabled` 只有显式传 `false` 才关闭，缺省或脏值一律回到启用；
  2. 启用时透明度仍被 `MIN_OPACITY=0.06` 夹住，文案清空则回落到强制文案——要么有效、要么不存在，不会"看着有其实没有"；
  3. 导出链路 `renderFront/renderBack/renderCombined` 仍然无条件调用 `applyWatermark`（开关判断在函数内部），写盘前用 `readWatermarkMetadata` 复核 PNG 里的水印文本，不一致直接抛错中止；关闭开关时像素水印与 PNG 元数据都不写，导出的就是干净卡面。
- 水印绘制失败一律 `throw`：预览层（`WatermarkLayer.vue`）会把画布刷成灰色并写「水印叠加失败，卡面已屏蔽」，导出层直接把错误抛给 `GeneratorView` 弹 `ElMessage.error`，绝不静默产出一张没有水印的图（开关关闭属于显式配置，不算失败）。
- 预览与导出各只叠一次水印：预览走 `renderFrontRaw/renderBackRaw`（裸渲染）+ `WatermarkLayer` 叠加；导出走 `renderFront/renderBack`（内部叠加）。

## 六、交互与持久化（阶段二、五）

- 左参数右预览两栏；窗口宽度 < 1024px 时上下堆叠（`@media (max-width: 1023px)`）。
- 任一参数变更后号码**同步**重算（纯计算），预览**300ms 防抖**重绘，本地持久化 400ms 防抖。
- 五个动作：随机生成 / 重置 / 导出正面 / 导出反面 / 导出双面合并（纵向拼接，中间 40px 分隔带 + 说明文字）。
- 未上传人像时先 `ElMessageBox.confirm('当前使用默认头像，是否继续？')`；导出成功后 `ElMessage` 显示完整路径并带「打开所在文件夹」按钮（走 `file:revealPath`）。
- 参数存 `localStorage`（`id-generator:state.v1`），窗口缩放、最小化、重开都不丢；人像 dataURL 体积可能到 MB 级，**不入库**，只留在内存。
- 三个日期选择器（指定生日 / 有效期起 / 有效期止）用 `el-date-picker`，中文面板靠 `App.vue` 最外层的 `<ElConfigProvider :locale="zhCn">`——按需导入下没有全局 `app.use(ElementPlus)`，locale 只能从这个 provider 注入；`value-format="YYYY-MM-DD"` 保证存下来的格式与界面语言无关。
- **有效期限按「申领（签发）当日周岁」动态推算**，档位取自《居民身份证法》第五条：未满 16 周岁（自愿申领）5 年、16~25 周岁 10 年、26~45 周岁 20 年、46 周岁及以上长期。纯函数 `validityTermYears(ageAtIssue)` 在 `core/idCardGenerator.ts`（8 个边界值单测覆盖 15/16、25/26、45/46）；store 里 `validityRule` computed 以 `form.validFrom` 为基准日算周岁，`rebuild()` 末尾的 `syncValidity()` 把 `form.validTo` 写成「签发日 + N 年」（`shiftIso` 对 2/29 落到 2/28），长期档则勾上「长期」并把止期清空——反面因此显示 `2026.10.10-长期`。改生日、改签发日期、点重掷都会重新对档，面板在「有效期止」下方显示「申领时 31 周岁 → 20 年」这行提示。要手动填就关掉「高级选项 → 有效期档位」（`advanced.autoValidity`，默认开），此时 `syncValidity()` 直接返回，止期选择器与「长期」解除禁用，重掷也不会再改动手填的值。

## 七、验证结果

```bash
pnpm typecheck   # tsc(node) + vue-tsc(web) 均 0 error
pnpm lint        # eslint --max-warnings 0 通过
pnpm test        # 103 passed（4 个文件，全部针对 core/）
pnpm coverage    # stmts 98.16% / branch 92.28% / funcs 99.03% / lines 98.86%（阈值 80/75/80/80）
pnpm build       # out/main + out/preload + out/renderer 产出成功
pnpm dev         # Electron 窗口起得来，渲染进程 0 error / 0 exception
```

`pnpm dev` 的运行时核验（用 `--remote-debugging-port` + CDP 驱动真实窗口，非人工眼看）：

- `window.api` 只有 `getVersion / revealInFolder / saveImage / selectFace` 四个键；`window.require`、`window.fs` 均为 `undefined`。
- 预览画布在 175% 缩放（dpr 1.75）下：正面/反面 `627×385`，双面合并 `627×840`（= 358×(220×2+40)）。
- 三个视图采样像素里都有 4.7%~9.1% 的深色水印点；把水印密度从 1.0 拖到 2.5，深色占比升到 25.6%，且预览在防抖窗口内自动重绘。
- 「随机生成」后姓名与号码同步变化，`990402199109154754` 第 17 位为 5（奇=男）与姓名库性别一致，自校验标签显示「通过」。
- `Page.reload` 后参数与号码原样恢复（localStorage `id-generator:state.v1`）。
- 日期面板实测已是中文：星期表头 `日 一 二 三 四 五 六`、标题 `2026 年 / 10 月`、翻页按钮 aria-label「前一年 / 上个月 / 下个月 / 后一年」，面板文本里查不到英文月名与星期名；`Input.dispatchMouseEvent` 打开 → Esc 关闭后 `validFrom / validTo` 逐字节未变（合成 `click()` 打不开 popper，必须走真实鼠标事件）。
- 关于页显示的 `版本 1.0.0` 来自 `app:getVersion` 的真实 IPC 往返。
- 默认人像按性别分两张：隔离 profile 里真实点「女」单选后，人像框 5 个采样点（额头/左右颊/下巴/左肩）逐点变化、截图分别是男/女证件照，再点回「男」采样值与首启逐字节一致。
- 有效期档位四档全实测（`form.birthday` 逐档给定、其余走真实控件与真实鼠标点击）：11/15 岁 → 5 年（止期 2031-10-10）、16/25 岁 → 10 年、26/45 岁 → 20 年、46 岁 → 长期（`longTerm=true`、止期清空、反面渲染成 `2026.10.10-长期`），面板提示同步显示「申领时 N 周岁 → X 年」。关掉「高级选项 → 有效期档位」（真实点击开关，`elementFromPoint` 先校验命中）后：提示消失、止期与长期解禁、把生日换成 46 岁档再重掷，止期仍是手填的 `2030-05-06` 不被推算。折叠面板收起时控件 rect 是 0×0，直接按中心点点击会打到空白处——必须先展开、`scrollIntoView({behavior:'instant'})` 等 400ms 再量中心点。
- 长期档「压掉连字符」的回归实测：在渲染进程钩住 `CanvasRenderingContext2D.prototype.fillText`，把生日改成 1970-05-01（真实输入框 `input` 事件 + 真实 Enter）后取反面最后两段绘制，日期段 `2026.10.10-` 起笔 x=142、字体 11px mono，「长期」起笔 x=214.60 = 142 + 真实等宽量宽 72.60，间隙 0.00px（旧代码按中文字体量到 61.66，会左移 8.94px 盖住连字符）；再把生日换回 1995-06-15，反面回到单段 `2026.10.10-2046.10.10`、无「长期」。反面卡面截图肉眼确认 `2026.10.10-长期`。
- 控制台只有 Electron 自带的「Insecure Content-Security-Policy」**开发环境警告**（打包后自动消失），无任何 error。

验收标准对照：

| #   | 条目                            | 状态                                                                                                                                                                                                      |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm run dev` 启动无控制台报错 | ✅ 见上：CDP 实测 0 error / 0 exception                                                                                                                                                                   |
| 2   | 参数改动 → 预览 300ms 内更新    | ✅ 防抖常量 `RENDER_DEBOUNCE_MS = 300`                                                                                                                                                                    |
| 3   | 号码自校验通过 + 性别奇偶一致   | ✅ `store.selfCheck` 用 `validateIdCard`，预览区显示结果与第 17 位                                                                                                                                        |
| 4   | 生日/年龄往返一致               | ✅ `randomBirthday` ↔ `ageFromBirthday`，单测覆盖闰年 2/29                                                                                                                                                |
| 5   | 人像圆角不变形                  | ✅ `centerCrop` 只裁不拉伸，单测断言源矩形比例                                                                                                                                                            |
| 6   | 导出图水印不可去除              | ⚠️ 破坏性叠加 + PNG 元数据复核仍在，但按用户决定改为「高级选项」里可关闭（默认开启），本条验收口径相应放宽                                                                                                |
| 7   | 缩放/最小化/重开状态不丢        | ✅ Pinia + localStorage                                                                                                                                                                                   |
| 8   | `pnpm run build` 产出安装包     | ⚠️ Windows NSIS 可产；**dmg 只能在 macOS 上打**，配置已就绪                                                                                                                                               |
| 9   | `core/` 单测覆盖率 ≥ 80%        | ✅ 98.14% 语句                                                                                                                                                                                            |
| 10  | 不含真实公民信息 / 真实照片素材 | ⚠️ 号码、姓名、地址、机关名仍是脱敏生成值，正面底纹与默认头像仍是程序化 / AI 素材；但反面底板按用户要求换成了真实样例卡照片，其中的国徽也是真实制式图案——照片自带的原始值会被遮罩整块盖掉，不会随导出带出 |

## 八、打包

```bash
pnpm dist:win    # Windows NSIS 安装包 → release/
pnpm dist:mac    # macOS dmg，必须在 macOS 上执行（electron-builder 不支持跨平台产 dmg）
```

未配置签名证书：Windows 首次运行会有 SmartScreen 提示，macOS 产物需右键「打开」绕过 Gatekeeper。

体积构成（`pnpm exec electron-builder --win --dir` 实测 `release/win-unpacked`，非估算）：

| 项                                                             | 优化前           | 优化后         | 说明                                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **合计**                                                       | **418.7 MB**     | **330.3 MB**   | −88.4 MB（−21%）                                                                                                                                                                     |
| `身份证演示图生成器.exe`                                       | 234.9 MB         | 234.9 MB       | 就是 Electron 44 x64 的 `electron.exe` 改名，与 `node_modules/electron/dist/electron.exe` 字节数完全一致（rcedit 只重写图标与版本资源），本项目动不了                                |
| `resources/app.asar`                                           | 42.2 MB          | 2.1 MB         | 原先 `dependencies` 里那 5 个渲染层库被 electron-builder 当运行期依赖整棵树复制进来（7218 个条目）；它们已被 vite 打进 `out/renderer`，挪进 `devDependencies` 后 asar 只剩 19 个条目 |
| `locales/`                                                     | 49.6 MB（55 个） | 1.1 MB（2 个） | `electronLanguages: [zh-CN, en-US]`，en-US 是系统语言非中文时 Chromium 的回退；要加繁体就往列表里补 `zh-TW`                                                                          |
| `dxcompiler.dll` + `d3dcompiler_47.dll` + `vk_swiftshader.dll` | 31.2 MB          | 31.2 MB        | ANGLE / SwiftShader 的 GPU 后备链，缺了部分机器直接黑屏，不动                                                                                                                        |
| `LICENSES.chromium.html`                                       | 20.0 MB          | 20.0 MB        | Chromium 第三方声明的合规要求，不能删                                                                                                                                                |

剩下 330 MB 里约 235 MB 是 Electron 本体，所以**别指望 `compression: maximum`**（electron-builder 注释原话：doesn't lead to noticeable size difference, but increase build time）。这 88 MB 收益主要是 JS 与 `.pak` 文本，对 Setup.exe 的净压缩收益预计在 20~25 MB 量级（这个数是推算，NSIS 那步要联网取 nsis/7zip 工具链，得在有网络的终端里跑 `pnpm dist:win` 才能实测）。再想小一个数量级只能换框架：Tauri + WebView2 约 10~15 MB 安装包，代价是 main/preload 的 IPC 层用 Rust 重写；而 `out/renderer` 本身只有 2.1 MB，做成纯网页版是更便宜的路线。

## 九、持续集成与自动发版

`.github/workflows/release.yml`：**push 到 `main`（或手动 `workflow_dispatch`）→ 验证 → 双平台打包 → 上传 GitHub Release**。

| 任务      | runner                               | 做什么                                                                                                                                                           |
| --------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify`  | ubuntu-latest                        | `pnpm lint` / `pnpm typecheck` / `pnpm test`。装依赖用 `pnpm install --frozen-lockfile`，Node 24、pnpm 版本读 `packageManager` 字段                              |
| `build`   | windows-latest、macos-latest（矩阵） | `electron-vite build` + `electron-builder --win nsis` / `--mac dmg`，`--publish never`；typecheck 不在这里重复跑。mac 任务设 `CSC_IDENTITY_AUTO_DISCOVERY=false` |
| `release` | ubuntu-latest                        | 把两个平台的产物收进一个 Release                                                                                                                                 |

发版口径是**按版本号滚动**：Release tag 取 `package.json` 的 `version`（当前 `v1.0.0`）。tag 不存在就 `gh release create`，已存在就 `gh release upload --clobber` 覆盖安装包、并把 release 的 target 移到本次提交，Notes 里写明构建提交与工作流链接。所以「同一版本反复 push」只会有一份最新安装包；要留住历史版本，先 bump `version` 再合主干。

不需要配任何 secret：上传用的是内置 `GITHUB_TOKEN`，工作流顶部声明 `permissions: contents: write`。产物文件名带中文（`${productName}` 决定），GitHub 的下载 URL 会 percent-encode，浏览器另存下来的文件名正常。

## 十、已知边界

- 「历史规则」产生的号码故意不符合 GB 11643 校验算法，只用于演示该开关，不要当成可用数据。
- 水印现在可以关闭（「高级选项 → 水印」），与最初需求的"不允许提供关闭水印的开关"相反——这是用户后续明确决定的改动，默认值仍为开启，关闭时可见水印与 PNG `DemoOnly` 元数据都不再产出。要恢复硬约束只需把这个开关从 UI 与 `AdvancedOptions` 去掉，`resolveWatermarkOptions` 的默认值本身就是启用。
- 反面底板按用户后续决定换成了真实样例卡照片，与最初需求的"不要抓取真实素材"相反。三点影响：① 底板里的国徽是真实制式图案；② 照片自带的签发机关与有效期限原值靠两块纯色遮罩盖掉，遮罩不带底纹，放大看会得到两条比周围略平的浅带；③ 底板只有 460×292，3x 导出时被放大 2.3 倍，花纹比程序化正面偏软，`back-template.png` 也从 50.1 kB 涨到 319.5 kB。要退回程序化反面：用 `gen-assets` 重新生成底纹图后，还得去掉 `drawBack` 里的 `painted` 分支，否则绘制层会以为底板自带文字、只剩两行字。
- 年龄区间不能再填 127~130：那会要求 1900 年以前的生日，号段本身无法编码（早于此版本的上界是 130，随机到 1896~1899 年时 `store.rebuild()` 会抛错、卡面与自校验一起冻住）。现在 `isInRange` 对非法生日返回 `false`，`rebuild()` 一律走「重掷区间内生日」的自愈分支，即使 localStorage 里还留着 1897 年这类失效缓存，启动后也会自动换掉而不是卡在「自校验未通过」。
- 民族表、姓名库、街道库都是演示用短表，不做穷举覆盖。
- 字体不随包分发，走系统回退链（见 `src/renderer/src/assets/fonts/README.md`）。
- 浏览器里直接打开 renderer（非 Electron）时导出会明确报「未检测到桌面端 bridge」，其余功能可正常联调。
- 开发模式控制台会有一条 Electron 官方 `Insecure Content-Security-Policy` **警告**：`file://` 下加 CSP 容易连带禁掉模板图与人像 dataURL，实测收益低于风险，故只在打包后（Electron 自动隐藏该提示）依赖 asar + 隔离上下文做边界。
- 导出对话框（`showSaveDialog`）与「打开所在文件夹」是原生模态窗，自动化探针不代为点击；这两条链路分别由 `file:saveImage` / `file:revealPath` 的单测与上面的 CDP 往返验证覆盖到边界为止。

## 十一、许可

MIT。
