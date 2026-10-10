import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { ensureBuiltinAssets } from './core/assets'
// 编程式组件（ElMessage / ElMessageBox）不走模板自动导入，样式需显式引入
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'

async function bootstrap(): Promise<void> {
  // 先把内置底图/默认头像解码好，避免首帧预览出现空白卡面
  await ensureBuiltinAssets()
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)
  app.mount('#app')
}

void bootstrap()
