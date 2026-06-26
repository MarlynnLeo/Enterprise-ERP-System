import { defineConfig, loadEnv } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:8080'
  const enableLegacy = mode === 'legacy' || env.VITE_LEGACY_BUILD === 'true'

  return {
    plugins: [
      vue(),
      enableLegacy && legacy({
        targets: ['defaults', 'Chrome >= 49', 'Edge >= 16', 'Firefox >= 52', 'Safari >= 10'],
        modernPolyfills: true,
        renderLegacyChunks: true
      })
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    optimizeDeps: {
      include: [
        'dompurify',
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers'
      ],
      // 强制预构建这些 CommonJS 模块
      force: false
    },
    server: {
      host: env.VITE_DEV_HOST || '0.0.0.0',
      port: parseInt(env.VITE_DEV_PORT) || 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          // 不重写路径，保留 /api 前缀
          rewrite: (path) => path,
          secure: false,
          ws: true
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
          // 不重写路径，保留 /uploads 前缀
          rewrite: (path) => path,
          secure: false
        },
        '/socket.io': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false
        }
      }
    },
    preview: {
      allowedHosts: [env.VITE_PREVIEW_ALLOWED_HOST || 'localhost']
    },
    // 确保在生产环境中正确设置环境变量
    define: {
      __DEV__: mode === 'development'
    },
    esbuild: {
      drop: mode === 'production' ? ['console', 'debugger'] : []
    },
    build: {
      // 调整块大小警告限制
      chunkSizeWarningLimit: 2000,
      // 启用压缩
      minify: 'esbuild',
      // 目标浏览器
      ...(enableLegacy ? {} : { target: 'es2015' }),
      // CSS 代码分割
      cssCodeSplit: true,
      // 确保 CommonJS 模块正确转换
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
        requireReturnsDefault: 'auto'
      },
      rolldownOptions: {
        output: {
          // 确保正确的模块格式
          format: 'es',
          // 使用 Rolldown 分组拆分大型三方依赖，避免 Element Plus 单包过大。
          // strictExecutionOrder 用于降低手动分组后的初始化顺序风险。
          strictExecutionOrder: true,
          codeSplitting: {
            includeDependenciesRecursively: false,
            minSize: 0,
            groups: [{
              name(id) {
                if (!id.includes('node_modules')) {
                  return null
                }

                const normalizedId = id.replace(/\\/g, '/')

                if (/\/node_modules\/(vue|vue-router|pinia|vue-i18n)\//.test(normalizedId)) {
                  return 'vendor-vue'
                }
                if (normalizedId.includes('/node_modules/@element-plus/icons-vue/')) {
                  return 'vendor-element-icons'
                }
                if (normalizedId.includes('/node_modules/element-plus/')) {
                  const componentMatch = normalizedId.match(/\/node_modules\/element-plus\/(?:es|lib)\/components\/([^/]+)/)
                  const componentName = componentMatch?.[1]
                  if (['table', 'table-v2', 'pagination', 'tree', 'tree-select', 'transfer'].includes(componentName)) {
                    return 'vendor-element-data'
                  }
                  if (['form', 'input', 'input-number', 'select', 'option', 'date-picker', 'time-picker', 'checkbox', 'radio', 'switch'].includes(componentName)) {
                    return 'vendor-element-form'
                  }
                  if (['dialog', 'drawer', 'message', 'message-box', 'notification', 'popover', 'tooltip', 'loading'].includes(componentName)) {
                    return 'vendor-element-feedback'
                  }
                  return 'vendor-element-core'
                }
                if (/\/node_modules\/(echarts|chart\.js|zrender)\//.test(normalizedId)) {
                  return 'vendor-charts'
                }
                if (normalizedId.includes('/node_modules/exceljs/')) {
                  return 'vendor-exceljs'
                }
                if (normalizedId.includes('/node_modules/@vue-office/docx/')) {
                  return 'vendor-office-docx'
                }
                if (normalizedId.includes('/node_modules/@vue-office/excel/')) {
                  return 'vendor-office-excel'
                }
                if (/\/node_modules\/(html2pdf\.js|jspdf|html2canvas)\//.test(normalizedId)) {
                  return 'vendor-pdf'
                }
                return null
              }
            }]
          },
          // 添加文件名哈希
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    }
  }
})
