import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'generator',
    component: () => import('../views/GeneratorView.vue'),
    meta: { title: '演示图生成器' },
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('../views/AboutView.vue'),
    meta: { title: '关于与用途声明' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

/** Electron 用 file:// 加载，hash 模式不需要服务端重写 */
export default createRouter({ history: createWebHashHistory(), routes })
