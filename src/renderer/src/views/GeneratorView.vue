<script setup lang="ts">
import { h, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { CardSide } from '../types/idcard'
import { useIdCardStore } from '../stores/useIdCardStore'
import ParamPanel from '../components/ParamPanel.vue'
import IdCardPreview from '../components/IdCardPreview.vue'

/**
 * 主视图：左参数右预览，窗口 < 1024px 时上下堆叠（见样式）。
 * 这里负责导出的编排：默认头像二次确认、水印失败中止、导出后给出路径与「打开所在文件夹」。
 */
const store = useIdCardStore()
const exporting = ref(false)

const SIDE_LABEL: Record<CardSide, string> = { front: '正面', back: '反面', both: '双面合并' }

onMounted(() => {
  // 窗口重开/刷新后回到上一次的参数；没有存档则生成一份随机数据
  if (!store.hydrate()) store.reset()
})

function notifySaved(path: string): void {
  ElMessage({
    type: 'success',
    duration: 8000,
    message: h('span', null, [
      `已导出：${path}　`,
      h(
        'span',
        {
          style: 'color:#409eff;cursor:pointer;text-decoration:underline',
          onClick: () => void reveal(path),
        },
        '打开所在文件夹',
      ),
    ]),
  })
}

async function reveal(path: string): Promise<void> {
  const res = await window.api.revealInFolder(path)
  if (res.canceled) ElMessage.error(res.error ?? '无法打开所在文件夹')
}

async function onExport(side: CardSide): Promise<void> {
  if (exporting.value) return

  if (!store.faceDataUrl) {
    try {
      await ElMessageBox.confirm('当前使用默认头像，是否继续？', '未上传人像', {
        type: 'warning',
        confirmButtonText: '继续导出',
        cancelButtonText: '取消',
      })
    } catch {
      return // 用户取消
    }
  }

  exporting.value = true
  try {
    const res = await store.exportCard(side)
    if (res.canceled) {
      if (res.error) ElMessage.error(`${SIDE_LABEL[side]}导出失败：${res.error}`)
      else ElMessage.info('已取消保存')
      return
    }
    if (res.savedPath) notifySaved(res.savedPath)
  } catch (err) {
    // 水印绘制/元数据校验失败必须显式提示，绝不静默导出不带水印的图
    ElMessage.error(err instanceof Error ? err.message : String(err))
  } finally {
    exporting.value = false
  }
}

function onPreviewError(message: string): void {
  ElMessage.error(`预览水印叠加失败：${message}`)
}
</script>

<template>
  <div class="generator">
    <section class="generator__panel">
      <ParamPanel @export="onExport" />
    </section>
    <section class="generator__preview">
      <IdCardPreview @error="onPreviewError" />
    </section>
  </div>
</template>

<style scoped>
.generator {
  display: grid;
  grid-template-columns: minmax(340px, 460px) minmax(0, 1fr);
  gap: 18px;
  height: 100%;
  padding: 16px 18px;
}

.generator__panel,
.generator__preview {
  min-height: 0;
  overflow-y: auto;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 14px 16px;
}

.generator__preview {
  display: flex;
  flex-direction: column;
}

/* 窗口宽度不足 1024px：两栏改为上下堆叠 */
@media (max-width: 1023px) {
  .generator {
    grid-template-columns: 1fr;
    grid-auto-rows: min-content;
    height: auto;
    min-height: 100%;
    overflow-y: auto;
  }

  .generator__panel,
  .generator__preview {
    overflow: visible;
  }
}
</style>
