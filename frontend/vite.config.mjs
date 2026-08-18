import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import Components from 'unplugin-vue-components/vite'
import path from 'path'

const toKebabCase = (value) => value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

const ELEMENT_PLUS_COMPONENT_ENTRY_OVERRIDES = {
  'anchor-link': 'anchor',
  aside: 'container',
  'avatar-group': 'avatar',
  'breadcrumb-item': 'breadcrumb',
  'button-group': 'button',
  'carousel-item': 'carousel',
  'checkbox-button': 'checkbox',
  'checkbox-group': 'checkbox',
  'collapse-item': 'collapse',
  'descriptions-item': 'descriptions',
  'dropdown-item': 'dropdown',
  'dropdown-menu': 'dropdown',
  footer: 'container',
  'form-item': 'form',
  header: 'container',
  main: 'container',
  'menu-item': 'menu',
  'menu-item-group': 'menu',
  option: 'select',
  'option-group': 'select',
  'radio-button': 'radio',
  'radio-group': 'radio',
  'skeleton-item': 'skeleton',
  'splitter-panel': 'splitter',
  step: 'steps',
  'sub-menu': 'menu',
  'tab-pane': 'tabs',
  'table-column': 'table',
  'timeline-item': 'timeline',
  'tour-step': 'tour'
}

// 直接指向单组件入口，避免 Element Plus 汇总入口进入动态页面。
const resolveElementPlusComponent = (name) => {
  if (!/^El[A-Z]/.test(name)) return undefined

  const component = toKebabCase(name.slice(2))
  return {
    name,
    from: `element-plus/es/components/${ELEMENT_PLUS_COMPONENT_ENTRY_OVERRIDES[component] || component}/index`,
    sideEffects: `element-plus/es/components/${component}/style/css`
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:8080'
  const enableLegacy = mode === 'legacy' || env.VITE_LEGACY_BUILD === 'true'

  return {
    plugins: [
      vue(),
      // 编译时按需导入 Element Plus 组件及其样式，避免 app.use(ElementPlus) 将全量组件放入首屏。
      Components({
        resolvers: [resolveElementPlusComponent]
      }),
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
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('exceljs') || id.includes('xlsx')) return 'excel-vendor'
              if (id.includes('html2pdf') || id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-vendor'
              if (id.includes('echarts') || id.includes('zrender')) return 'echarts-vendor'
              if (id.includes('@element-plus/icons-vue')) return 'icons-vendor'
              if (id.includes('element-plus')) return 'element-vendor'
              if (id.includes('vue-i18n') || id.includes('@intlify')) return 'i18n-vendor'
              if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) return 'vue-core-vendor'
              if (id.includes('axios') || id.includes('dayjs') || id.includes('lodash') || id.includes('crypto-js')) return 'utils-vendor'
              return 'deps-vendor'
            }
          }
        }
      }
    }
  }
})
