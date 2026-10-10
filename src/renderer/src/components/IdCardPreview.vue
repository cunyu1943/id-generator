<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RenderedSide } from '../core/drawBack'
import type { CardSide } from '../types/idcard'
import { COMBINE_LAYOUT, renderBackRaw, renderCombinedRaw, renderFrontRaw } from '../core/drawBack'
import { getImages } from '../core/assets'
import { CARD } from '../core/templates'
import { useIdCardStore } from '../stores/useIdCardStore'
import WatermarkLayer from './WatermarkLayer.vue'

/**
 * 实时预览：裸渲染（无水印）→ 交给 WatermarkLayer 破坏性叠加，
 * 因此预览与导出各自只叠一次水印，观感一致。
 * 任一参数变更后 300ms 防抖重渲染。
 */
const store = useIdCardStore()
const emit = defineEmits<{ (event: 'error', message: string): void }>()

const RENDER_DEBOUNCE_MS = 300

const tabs: Array<{ value: CardSide; label: string }> = [
  { value: 'front', label: '正面' },
  { value: 'back', label: '反面' },
  { value: 'both', label: '双面合并' },
]

const active = ref<CardSide>('front')
const sides = ref<Partial<Record<CardSide, RenderedSide>>>({})
const rendering = ref(false)

/** 预览缓冲按设备像素比渲染，避免高 DPI 下发虚 */
function previewScale(): number {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return Math.min(3, Math.max(1, dpr))
}

function render(): void {
  rendering.value = true
  try {
    const options = {
      scale: previewScale(),
      watermark: store.watermarkOptions,
      useTemplateBackground: true,
      images: getImages(),
    }
    const front = renderFrontRaw(store.card, options)
    const back = renderBackRaw(store.card, options)
    sides.value = { front, back, both: renderCombinedRaw(front, back, options) }
  } catch (err) {
    // 渲染异常同样不允许留下无水印画面
    sides.value = {}
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    rendering.value = false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
function schedule(): void {
  clearTimeout(timer)
  timer = setTimeout(render, RENDER_DEBOUNCE_MS)
}

const current = computed<RenderedSide | undefined>(() => sides.value[active.value])
const logical = computed(() => ({
  width: CARD.width,
  height: active.value === 'both' ? CARD.height * 2 + COMBINE_LAYOUT.gap : CARD.height,
}))

onMounted(render)
watch(() => store.card, schedule)
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <section class="preview">
    <div class="preview__bar">
      <el-radio-group v-model="active" size="small">
        <el-radio-button v-for="t in tabs" :key="t.value" :value="t.value">{{ t.label }}</el-radio-button>
      </el-radio-group>
      <el-tag v-if="store.selfCheck.valid" type="success" size="small" effect="plain">号码自校验通过</el-tag>
      <el-tag v-else type="danger" size="small" effect="plain">自校验未通过：{{ store.selfCheck.reason }}</el-tag>
    </div>

    <div class="preview__stage">
      <WatermarkLayer
        :source="current?.canvas ?? null"
        :logical-width="logical.width"
        :logical-height="logical.height"
        @error="emit('error', $event)"
      />
      <p v-if="!current && !rendering" class="preview__empty">正在准备卡面…</p>
    </div>

    <dl class="preview__meta">
      <div>
        <dt>姓名</dt>
        <dd>{{ store.card.name }}</dd>
      </div>
      <div>
        <dt>性别</dt>
        <dd>{{ store.effectiveGender === 'male' ? '男' : '女' }}（第 17 位 {{ store.idNumber.slice(16, 17) }}）</dd>
      </div>
      <div>
        <dt>年龄</dt>
        <dd>{{ store.age }} 岁</dd>
      </div>
      <div>
        <dt>区划</dt>
        <dd>{{ store.regionLabel }}</dd>
      </div>
      <div>
        <dt>号码</dt>
        <dd class="mono">{{ store.idNumber }}</dd>
      </div>
      <div>
        <dt>号段</dt>
        <dd>{{ store.advanced.demoSegment ? '演示 99 号段' : '标准区划码' }}</dd>
      </div>
      <div>
        <dt>水印</dt>
        <dd>{{ store.advanced.watermarkEnabled ? '已叠加' : '已关闭（导出干净图）' }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.preview__stage {
  background: repeating-conic-gradient(#f6f8fb 0% 25%, #eef2f7 0% 50%) 0 0 / 20px 20px;
  border: 1px solid var(--app-border, #dcdfe6);
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
  text-align: center;
}

.preview__empty {
  font-size: 12px;
  color: #909399;
}

.preview__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px 16px;
  margin: 0;
  font-size: 12px;
}

.preview__meta div {
  display: flex;
  gap: 6px;
}

.preview__meta dt {
  color: #909399;
  flex: none;
}

.preview__meta dd {
  margin: 0;
  color: #303133;
  word-break: break-all;
}

.mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
</style>
