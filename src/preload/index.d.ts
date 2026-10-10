/**
 * 预加载 API 的类型出口。
 * window.api 的全局声明放在渲染进程侧（types/idcard.d.ts），此处不再重复 declare global，
 * 以免主进程/预加载与渲染进程两套 tsconfig 出现同名标识符冲突。
 */
import type { DesktopApi } from './index'

export type PreloadApi = DesktopApi
