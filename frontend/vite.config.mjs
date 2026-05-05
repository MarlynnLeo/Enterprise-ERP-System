import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'lottie-web': 'lottie-web/build/player/esm/lottie_light.min.js'
      }
    },
    optimizeDeps: {
      include: [
        'dompurify'
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
          target: env.VITE_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          // 不重写路径，保留 /api 前缀
          rewrite: (path) => path,
          secure: false,
          ws: true
        },
        '/uploads': {
          target: env.VITE_API_TARGET || 'http://localhost:8080',
          changeOrigin: true,
          // 不重写路径，保留 /uploads 前缀
          rewrite: (path) => path,
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
      target: 'es2015',
      // CSS 代码分割
      cssCodeSplit: true,
      // 确保 CommonJS 模块正确转换
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
        requireReturnsDefault: 'auto'
      },
      rollupOptions: {
        output: {
          // 确保正确的模块格式
          format: 'es',
          // 完全禁用手动分块,让 Vite 自动处理
          // 这样可以避免所有循环依赖和模块初始化顺序问题
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            const normalizedId = id.replace(/\\/g, '/')

            if (/\/node_modules\/(vue|vue-router|pinia|vue-i18n)\//.test(normalizedId)) {
              return 'vendor-vue'
            }
            if (/\/node_modules\/(element-plus|@element-plus)\//.test(normalizedId)) {
              return 'vendor-element'
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
            if (/\/node_modules\/(vue3-lottie|lottie-web)\//.test(normalizedId)) {
              return 'vendor-lottie'
            }

            return undefined
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
