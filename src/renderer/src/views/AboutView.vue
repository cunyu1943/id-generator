<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { MANDATORY_WATERMARK_TEXT, USAGE_NOTICE } from '../core/templates'
import { useIdCardStore } from '../stores/useIdCardStore'

/** 关于页：版本、用途声明、脱敏策略、水印与架构说明 */
const store = useIdCardStore()
const version = ref('…')
const platform = ref('')

onMounted(async () => {
  try {
    version.value = await window.api.getVersion()
  } catch {
    version.value = '未知（非 Electron 环境）'
  }
  platform.value = navigator.platform || '未知'
})
</script>

<template>
  <div class="about">
    <section class="about__card">
      <h2>身份证正反面演示图生成器</h2>
      <p class="about__muted">版本 {{ version }} · 离线桌面应用 · {{ platform }}</p>

      <el-alert :title="USAGE_NOTICE" type="warning" :closable="false" show-icon class="about__notice" />

      <h3>用途声明</h3>
      <ul>
        <li>仅用于 UI 原型演示、测试数据 Mock、教学示例。</li>
        <li>默认给导出图叠加水印「{{ MANDATORY_WATERMARK_TEXT }}」。</li>
        <li>水印可在「高级选项」关闭，关闭后导出的是干净卡面，请自行确保用途合规。</li>
        <li>不采集、不包含、不校验任何真实公民个人信息；断网环境可完整使用。</li>
      </ul>

      <h3>数据脱敏策略</h3>
      <ul>
        <li>内置省市表为脱敏样例（仅若干省及其示例城市），不是完整行政区划码表。</li>
        <li>默认使用 <code>99</code> 开头的虚构号段，仍可算出合法校验位；关闭「演示号段」才套用真实区划码格式。</li>
        <li>姓名取自虚构 surname/name 库，住址由「演示大道 / 示例路 / 原型巷」等占位街道拼出。</li>
        <li>正面底纹、程序化反面与国徽占位图、应用图标由脚本绘制（<code>scripts/gen-assets.mjs</code>）。</li>
        <li>反面底板是用户提供的样例卡照片，照片原有的签发机关与有效期限会被遮罩盖掉后重写。</li>
        <li>默认头像是项目自带的一张 AI 生成演示人像，不是真人照片；上传自己照片时也只留在内存与画布里，不写盘。</li>
      </ul>

      <h3>架构与安全边界</h3>
      <ul>
        <li>主进程：窗口管理、保存对话框、系统路径读写，全部经 <code>module:action</code> 命名的 IPC 暴露。</li>
        <li>
          预加载：<code>contextBridge</code> 白名单挂载 <code>window.api</code>，只用
          <code>ipcRenderer.invoke</code>，禁用 <code>sendSync</code>。
        </li>
        <li>
          渲染进程：纯业务逻辑，<code>nodeIntegration</code> 关闭、<code>contextIsolation</code> 开启，禁止直接访问
          <code>fs</code> / <code>path</code>。
        </li>
        <li>卡面由原生 Canvas 2D 手工绘制，未使用 html2canvas。</li>
      </ul>

      <h3>当前会话参数</h3>
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="号码">{{ store.idNumber }}</el-descriptions-item>
        <el-descriptions-item label="自校验">
          {{ store.selfCheck.valid ? '通过' : `未通过：${store.selfCheck.reason ?? '未知原因'}` }}
        </el-descriptions-item>
        <el-descriptions-item label="号段">{{
          store.advanced.demoSegment ? '演示 99 号段' : '标准区划码'
        }}</el-descriptions-item>
        <el-descriptions-item label="导出"
          >{{ store.advanced.exportScale }}x · {{ store.advanced.exportFormat.toUpperCase() }}</el-descriptions-item
        >
      </el-descriptions>
    </section>
  </div>
</template>

<style scoped>
.about {
  height: 100%;
  overflow-y: auto;
  padding: 16px 18px;
}

.about__card {
  max-width: 860px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  padding: 18px 22px 24px;
}

.about__card h2 {
  margin: 0 0 4px;
  font-size: 18px;
}

.about__card h3 {
  margin: 20px 0 8px;
  font-size: 14px;
}

.about__muted {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.about__notice {
  margin-top: 14px;
}

.about ul {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.9;
  color: #374151;
}

.about code {
  padding: 1px 5px;
  border-radius: 4px;
  background: #f2f4f7;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
</style>
