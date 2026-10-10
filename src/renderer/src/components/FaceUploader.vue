<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useIdCardStore } from '../stores/useIdCardStore'
import { CARD } from '../core/templates'

/**
 * 人像输入：点击（系统对话框）/ 拖拽 / 剪贴板粘贴。
 * 只接受 png·jpg·jpeg 且 ≤5MB，居中裁成 3:4 竖版后以 dataURL 存入 store。
 * 渲染进程不碰文件系统：桌面对话框由主进程读文件后回传 base64。
 */
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = ['image/png', 'image/jpeg']
/** 输出尺寸：人像框 78×104 的 6 倍，够 3x 导出用 */
const OUT_W = CARD.photo.w * 6
const OUT_H = CARD.photo.h * 6

const store = useIdCardStore()
const dragOver = ref(false)
const busy = ref(false)

const hasFace = computed(() => Boolean(store.faceDataUrl))

function isAccepted(file: File): boolean {
  return ACCEPT.includes(file.type)
}

async function cropToPortraitRatio(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('图片解码失败'))
    el.src = dataUrl
  })

  const ratio = CARD.photo.w / CARD.photo.h
  let sw = img.naturalWidth
  let sh = img.naturalHeight
  if (sw / sh > ratio) sw = sh * ratio
  else sh = sw / ratio
  const sx = (img.naturalWidth - sw) / 2
  const sy = (img.naturalHeight - sh) / 2

  const canvas = document.createElement('canvas')
  canvas.width = OUT_W
  canvas.height = OUT_H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布用于人像裁剪')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, OUT_W, OUT_H)
  // 只裁不拉伸：源矩形已是 3:4，目标矩形同比例，因此不变形
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function acceptDataUrl(dataUrl: string, sourceLabel: string): Promise<void> {
  busy.value = true
  try {
    const cropped = await cropToPortraitRatio(dataUrl)
    await store.applyFace(cropped)
    ElMessage.success(`已载入${sourceLabel}`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '人像处理失败')
  } finally {
    busy.value = false
  }
}

function validateFile(file: File): boolean {
  if (!isAccepted(file)) {
    ElMessage.error('仅支持 png / jpg / jpeg')
    return false
  }
  if (file.size > MAX_BYTES) {
    ElMessage.error(`图片不能超过 ${MAX_BYTES / 1024 / 1024}MB`)
    return false
  }
  return true
}

async function fromFile(file: File): Promise<void> {
  if (!validateFile(file)) return
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  }).catch((err: Error) => {
    ElMessage.error(err.message)
    return ''
  })
  if (dataUrl) await acceptDataUrl(dataUrl, '本地图片')
}

async function pickWithDesktopDialog(): Promise<void> {
  const res = await window.api.selectFace()
  if (res.canceled) {
    if (res.error) ElMessage.error(res.error)
    return
  }
  if (!res.base64) return
  if ((res.size ?? 0) > MAX_BYTES) {
    ElMessage.error(`图片不能超过 ${MAX_BYTES / 1024 / 1024}MB`)
    return
  }
  const mime = /\.png$/i.test(res.path ?? '') ? 'image/png' : 'image/jpeg'
  await acceptDataUrl(`data:${mime};base64,${res.base64}`, '本地图片')
}

async function onTriggerClick(): Promise<void> {
  if (hasFace.value || busy.value) return
  if (typeof window.api?.selectFace === 'function') return pickWithDesktopDialog()
  // 无桌面 API 时（浏览器调试）退回到文件选择框
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = ACCEPT.join(',')
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void fromFile(file)
  }
  input.click()
}

function onDrop(event: DragEvent): void {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) void fromFile(file)
}

function onPaste(event: ClipboardEvent): void {
  const file = event.clipboardData?.files?.[0]
  if (file) void fromFile(file)
}

async function onRemove(): Promise<void> {
  await store.applyFace(null)
  ElMessage.info('已回到默认头像')
}

onMounted(() => window.addEventListener('paste', onPaste))
onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <div
    class="face-uploader"
    :class="{ 'is-over': dragOver, 'is-filled': hasFace }"
    tabindex="0"
    @click="onTriggerClick"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <img v-if="hasFace" :src="store.faceDataUrl" class="face-uploader__thumb" alt="当前人像" />
    <div v-else class="face-uploader__hint">
      <strong>默认头像</strong>
      <span>点击选择 / 拖拽 / Ctrl+V 粘贴</span>
      <em>png·jpg·jpeg，≤ 5MB，自动居中裁成 3:4</em>
    </div>
    <span v-if="busy" class="face-uploader__busy">处理中…</span>
    <el-button v-if="hasFace" class="face-uploader__remove" size="small" text type="danger" @click.stop="onRemove">
      移除照片
    </el-button>
  </div>
</template>

<style scoped>
.face-uploader {
  position: relative;
  width: 78px;
  aspect-ratio: 3 / 4;
  border: 1px dashed #9db4cc;
  border-radius: 6px;
  background: #f4f8fc;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  outline: none;
  transition:
    border-color 0.2s,
    background 0.2s;
}

.face-uploader:hover,
.face-uploader:focus-visible {
  border-color: #409eff;
  background: #eef5ff;
}

.face-uploader.is-over {
  border-color: #409eff;
  background: #e3efff;
}

.face-uploader.is-filled {
  border-style: solid;
  cursor: default;
}

.face-uploader__thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.face-uploader__hint {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px;
  text-align: center;
}

.face-uploader__hint strong {
  font-size: 12px;
  color: #1f2937;
}

.face-uploader__hint span {
  font-size: 10px;
  color: #4b5563;
}

.face-uploader__hint em {
  font-size: 9px;
  font-style: normal;
  color: #93a3b5;
  line-height: 1.3;
}

.face-uploader__busy {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.75);
  font-size: 11px;
}

.face-uploader__remove {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 20px;
  border-radius: 0;
  background: rgba(255, 255, 255, 0.86);
}
</style>
