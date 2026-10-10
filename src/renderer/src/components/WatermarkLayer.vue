<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Canvas2DLike } from '../types/idcard'
import { applyWatermark } from '../core/watermark'
import { CARD, MANDATORY_WATERMARK_TEXT } from '../core/templates'
import { useIdCardStore } from '../stores/useIdCardStore'

/**
 * 预览链路的水印层：把裸渲染的卡面贴到可见画布上，再破坏性叠加水印。
 *
 * 失败即清空画面（fail-closed）并向上抛错，绝不留下「看起来正常但没有水印」的卡面。
 * 导出链路不经过本组件，由 core 的 renderFront/renderBack 内部强制叠加。
 */
const props = defineProps<{
  source: Canvas2DLike | null
  /** 逻辑坐标系尺寸，默认单面卡面；双面合并图传入 358×480 */
  logicalWidth?: number
  logicalHeight?: number
}>()
const emit = defineEmits<{ (event: 'error', message: string): void }>()

const store = useIdCardStore()
const host = ref<HTMLCanvasElement | null>(null)
const failed = ref('')

const size = computed(() => ({
  width: props.logicalWidth ?? CARD.width,
  height: props.logicalHeight ?? CARD.height,
}))

const cssSize = computed(() => ({ width: `${size.value.width}px`, height: `${size.value.height}px` }))

function paint(): void {
  const el = host.value
  const source = props.source
  failed.value = ''
  if (!el || !source) return

  const { width, height } = size.value
  const dpr = window.devicePixelRatio || 1
  el.width = Math.round(width * dpr)
  el.height = Math.round(height * dpr)
  const ctx = el.getContext('2d')
  if (!ctx) {
    failed.value = '无法获取 2D 上下文'
    emit('error', failed.value)
    return
  }

  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.drawImage(source as unknown as CanvasImageSource, 0, 0, source.width, source.height, 0, 0, el.width, el.height)
    ctx.scale(dpr, dpr)
    applyWatermark(ctx, width, height, store.watermarkOptions)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    failed.value = message
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, el.width, el.height)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillRect(0, 0, el.width, el.height)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#9ca3af'
    ctx.font = `12px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(`水印叠加失败，卡面已屏蔽：${MANDATORY_WATERMARK_TEXT}`, width / 2, height / 2)
    emit('error', message)
  }
}

onMounted(() => void nextTick(paint))
watch(
  () => [props.source, store.watermarkOptions] as const,
  () => void nextTick(paint),
  { deep: true },
)
</script>

<template>
  <div class="watermark-layer">
    <canvas ref="host" :style="cssSize" />
    <p v-if="failed" class="watermark-layer__error">{{ failed }}</p>
  </div>
</template>

<style scoped>
.watermark-layer {
  display: inline-block;
  line-height: 0;
}

.watermark-layer canvas {
  display: block;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(15, 34, 61, 0.14);
  max-width: 100%;
}

.watermark-layer__error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: #b91c1c;
}
</style>
