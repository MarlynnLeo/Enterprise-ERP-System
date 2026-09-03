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

// Vite/Rolldown 会根据共享依赖自动生成入口 modulepreload。Office/Excel/PDF/ECharts
// 只在用户主动打开预览、导出或图表面板时使用，入口 HTML 不应提前下载这些大包。
const stripHeavyEntryPreloads = () => ({
  name: 'strip-heavy-entry-preloads',
  enforce: 'post',
  transformIndexHtml(html) {
    return html.replace(
      /\s*<link\s+rel="modulepreload"[^>]+href="[^"]*(?:excel|office|pdf|echarts)[^\"]*"[^>]*>\s*/gi,
      '\n'
    )
  }
})

const releaseVersion = (buildId) => ({
  name: 'release-version',
  transformIndexHtml: {
    order: 'pre',
    handler() {
      return [{
        tag: 'meta',
        attrs: { name: 'app-build-id', content: buildId },
        injectTo: 'head'
      }]
    }
  },
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ buildId })
    })
  }
})

const isHeavyDeferredChunk = (dependency) =>
  /(?:excel|office|pdf|echarts)/i.test(dependency)

const heavyDeferredChunkGroups = [
  {
    name: 'office-vendor',
    test: /node_modules[\\/]@vue-office[\\/]/
  },
  {
    name: 'excel-vendor',
    test: /node_modules[\\/](?:exceljs|xlsx)[\\/]/
  },
  {
    name: 'pdf-vendor',
    test: /node_modules[\\/](?:html2pdf\.js|jspdf|html2canvas)[\\/]/
  },
  {
    name: 'echarts-vendor',
    test: /node_modules[\\/](?:echarts|zrender)[\\/]/
  }
]

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载环境变量
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || 'http://localhost:8080'
  const enableLegacy = mode === 'legacy' || env.VITE_LEGACY_BUILD === 'true'
  const buildId = process.env.APP_BUILD_ID || env.APP_BUILD_ID || new Date().toISOString()

  return {
    plugins: [
      vue(),
      // 编译时按需导入 Element Plus 组件及其样式，避免 app.use(ElementPlus) 将全量组件放入首屏。
      Components({
        resolvers: [resolveElementPlusComponent]
      }),
      releaseVersion(buildId),
      stripHeavyEntryPreloads(),
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
        'dayjs',
        'dayjs/plugin/advancedFormat.js',
        'dayjs/plugin/customParseFormat.js',
        'dayjs/plugin/dayOfYear.js',
        'dayjs/plugin/isSameOrAfter.js',
        'dayjs/plugin/isSameOrBefore.js',
        'dayjs/plugin/localeData.js',
        'dayjs/plugin/weekOfYear.js',
        'dayjs/plugin/weekYear.js',
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers',
        'echarts/features'
      ],
      // Element Plus is consumed through both auto-imported component
      // subpaths and programmatic APIs. Vite 8's incremental optimizer can
      // otherwise split those entries into a shared runtime that references
      // init_runtime_dom_esm_bundler without importing it, leaving the app on
      // a blank page after the "new dependencies optimized" reload.
      exclude: ['element-plus'],
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
    define: {
      __DEV__: mode === 'development',
      'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(buildId),
      __VUE_I18N_FULL_INSTALL__: true,
      __VUE_I18N_LEGACY_API__: false,
      __INTLIFY_PROD_DEVTOOLS__: false
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
      // Excel/PDF/Office 仅在导入、预览或导出时使用。Rollup 可能因为
      // 共享 lodash 模块把它们列入入口 modulepreload；过滤入口预加载，
      // 保留动态 import 的运行时依赖解析，避免登录和首页先下载近 4 MB。
      modulePreload: {
        resolveDependencies(filename, dependencies) {
          // Apply to route chunks too. Vite/Rolldown can otherwise discover a
          // shared Excel dependency through the login route's API graph and
          // preload it before the route is evaluated.
          return dependencies.filter((dependency) => !isHeavyDeferredChunk(dependency))
        }
      },
      // 确保 CommonJS 模块正确转换
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
        requireReturnsDefault: 'auto'
      },
      rollupOptions: {
        output: {
          // Rolldown otherwise recursively pulls a captured module's dependencies
          // into the same vendor chunk. That can make the login entry depend on
          // deferred Excel/Office code through shared helpers.
          strictExecutionOrder: true,
          codeSplitting: {
            includeDependenciesRecursively: false,
            // Only isolate genuinely deferred heavyweight features. Let
            // Rolldown's automatic splitter keep the app/runtime graph in a
            // smaller number of coherent chunks for old HTTP/1.1 clients.
            groups: heavyDeferredChunkGroups
          }
        }
      }
    }
  }
})
