import { defineConfig } from 'vitest/config'

/**
 * core/ 下全部为纯逻辑（Canvas 相关用可注入的假实现驱动），
 * 因此测试跑在 node 环境，不需要 jsdom。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/renderer/src/core/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/src/core/**/*.ts'],
      exclude: ['src/renderer/src/core/__tests__/**'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
      reporter: ['text', 'html'],
    },
  },
})
