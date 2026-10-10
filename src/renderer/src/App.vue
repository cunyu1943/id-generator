<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { USAGE_NOTICE } from './core/templates'
</script>

<template>
  <!-- Element Plus 默认英文，日期面板的月份/星期要靠这个切中文 -->
  <ElConfigProvider :locale="zhCn">
    <div class="app-shell">
      <header class="app-header">
        <div class="brand">
          <span class="brand-badge">DEMO</span>
          <div class="brand-text">
            <h1>身份证正反面演示图生成器</h1>
            <p>UI 原型 · 测试数据 Mock · 教学示例，全程离线</p>
          </div>
        </div>
        <nav class="app-nav">
          <RouterLink to="/">生成器</RouterLink>
          <RouterLink to="/about">关于</RouterLink>
        </nav>
      </header>

      <main class="app-main">
        <RouterView />
      </main>

      <footer class="app-footer">
        <ElAlert :title="USAGE_NOTICE" type="warning" :closable="false" show-icon />
      </footer>
    </div>
  </ElConfigProvider>
</template>

<style>
:root {
  --app-bg: #f2f4f7;
  --app-header: #ffffff;
  --app-border: #dfe5ec;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
  margin: 0;
}

body {
  font-family: 'Source Han Sans SC', 'Noto Sans CJK SC', 'Microsoft YaHei', '微软雅黑', 'PingFang SC', sans-serif;
  background: var(--app-bg);
  color: #1f2937;
  /* Electron 桌面工具不需要页面级滚动，滚动交给两栏内部容器 */
  overflow: hidden;
  user-select: none;
}

input,
textarea {
  user-select: text;
}
</style>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 18px;
  background: var(--app-header);
  border-bottom: 1px solid var(--app-border);
  flex: 0 0 auto;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 6px;
  background: #b9322a;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
}

.brand-text h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.brand-text p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #6b7280;
}

.app-nav {
  display: flex;
  gap: 6px;
}

.app-nav a {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #4b5563;
  text-decoration: none;
}

.app-nav a.router-link-active {
  background: #eaf1fb;
  color: #1d4ed8;
  font-weight: 600;
}

.app-main {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.app-footer {
  flex: 0 0 auto;
  padding: 0 18px 10px;
  background: var(--app-header);
  border-top: 1px solid var(--app-border);
}

.app-footer :deep(.el-alert) {
  margin-top: 8px;
  border-radius: 6px;
}
</style>
