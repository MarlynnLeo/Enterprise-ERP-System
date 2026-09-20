/**
 * Application entry.
 */

import { createApp, defineAsyncComponent } from 'vue'
import { createPinia } from 'pinia'
import { ElLoading } from 'element-plus/es/components/loading/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import 'element-plus/theme-chalk/el-loading.css'
import 'element-plus/theme-chalk/el-message-box.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-notification.css'
import 'element-plus/theme-chalk/el-overlay.css'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useLanguageStore } from './stores/language'
import { useThemeStore } from './stores/theme'
import { useDictionaryStore } from './stores/dictionary'
import i18n from './locales'
import { initPerformanceMode, runWhenIdle } from '@/utils/performanceMode'
import './assets/main.css'
import './assets/dialog-system.css'
import './assets/common-styles.css'
import './assets/ui-utilities.css'
import './assets/price-panel.css'
import './assets/theme-utilities.css'
import './assets/scrollbar.css'
/*
 * EP dark/css-vars：仅在 html.dark 时生效（theme store 对 dark/tech/premium 加 class）。
 * 与自有 data-theme token 双轨：语义色以 theme-compat + 各主题 CSS 为准，EP 变量作底层回退。
 */
import 'element-plus/theme-chalk/dark/css-vars.css'
/*
 * 主题加载顺序（后者可覆盖前者）：
 * 1) theme-compat — token 别名 / EP 映射
 * 2) theme-components — 全主题共享表格/按钮/卡片壳
 * 3) kacon — 默认皮肤 + 玻璃等品牌细则
 * 其余预设由 themeLoader 按需加载（只换色板，壳已共享）
 */
import './assets/themes/pc/theme-compat.css'
import './assets/themes/pc/theme-components.css'
import './assets/themes/pc/kacon.css'
import './assets/stat-cards.css'

import permissionDirective from './directives/permission'
import { setupErrorReporter } from '@/utils/errorReporter'
import { getApiErrorMessage } from '@/utils/errorHandler'
import { setupReleaseRecovery } from '@/utils/releaseRecovery'
import { installNavigationErrorHandler } from '@/utils/navigationError'
import { startOperationColumnAutoWidth } from '@/plugins/operationColumnAutoWidth'

setupReleaseRecovery()

// 兼容历史页面仍直接把 Error / response.data.message 传给 Element Plus 的写法。
// 统一在 UI 出口再次解析，避免错误码、英文异常和内部 ID 绕过 Axios 拦截器展示给用户。
const normalizeUserFacingMessage = (value, fallback = '操作失败') => {
  if (typeof value === 'string') return getApiErrorMessage(value, fallback)
  if (value instanceof Error) return getApiErrorMessage(value, fallback)
  if (value && typeof value === 'object' && (
    'response' in value ||
    'errorCode' in value ||
    'code' in value ||
    'message' in value ||
    'msg' in value ||
    'error' in value
  )) {
    return getApiErrorMessage(value, fallback)
  }
  return value
}

const wrapUserMessage = (method) => {
  const original = ElMessage[method]
  if (typeof original !== 'function' || original.__safeWrapped) return
  const wrapped = (options, ...args) => {
    if (options instanceof Error) {
      return original(normalizeUserFacingMessage(options), ...args)
    }
    if (typeof options === 'string') {
      return original(normalizeUserFacingMessage(options), ...args)
    }
    if (options && typeof options === 'object' && 'message' in options) {
      return original({
        ...options,
        // message 也可能是 VNode；只解析字符串和错误对象，避免破坏合法的富文本消息。
        message: normalizeUserFacingMessage(options.message, options.message || '操作失败'),
      }, ...args)
    }
    return original(options, ...args)
  }
  wrapped.__safeWrapped = true
  ElMessage[method] = wrapped
}

wrapUserMessage('error')
wrapUserMessage('warning')

const wrapMessageBox = (method) => {
  const original = ElMessageBox[method]
  if (typeof original !== 'function' || original.__safeWrapped) return
  const wrapped = (message, ...args) => original.call(
    ElMessageBox,
    normalizeUserFacingMessage(message),
    ...args
  )
  wrapped.__safeWrapped = true
  ElMessageBox[method] = wrapped
}

// 部分老页面直接把接口返回的 message 放进 alert/confirm，这里再兜底一次。
wrapMessageBox('alert')
wrapMessageBox('confirm')
wrapMessageBox('prompt')

const app = createApp(App)
const pinia = createPinia()
initPerformanceMode()

// 全局错误处理与上报（替代简单的 console.error）
setupErrorReporter(app)

app.config.warnHandler = (msg, _instance, trace) => {
  const message = typeof msg === 'string' ? msg : 'Non-string Vue warning'
  const warning = typeof trace === 'string' && trace
    ? `[Vue warn]: ${message}\n${trace}`
    : `[Vue warn]: ${message}`

  console.warn(warning)
}

installNavigationErrorHandler(router, { notify: ElMessage.error })

// 登录页不使用全局图标。进入受保护页面后在首帧完成、浏览器空闲时再
// 注册兼容旧页面的全局图标，避免图标模块阻塞路由解析和首屏绘制。
let elementIconsPromise = null
const ensureElementIcons = () => {
  if (elementIconsPromise) return elementIconsPromise

  elementIconsPromise = import('@/plugins/elementIcons')
    .then(({ registerElementIcons }) => registerElementIcons(app))
    .catch((error) => {
      elementIconsPromise = null
      console.error('按需加载全局图标失败:', error)
    })

  return elementIconsPromise
}

router.afterEach((to) => {
  if (to.meta?.requiresAuth) {
    runWhenIdle(() => {
      void ensureElementIcons()
    }, 1800)
  }
})

app.use(pinia)
app.use(i18n)
app.use(router)

const languageStore = useLanguageStore(pinia)
const languageReady = languageStore.initLanguage()

const themeStore = useThemeStore(pinia)
const themeReady = themeStore.initTheme()

const authStore = useAuthStore(pinia)
authStore.setAuthHeader()
setupErrorReporter(app, {
  canReport: () => authStore.isAuthenticated && authStore.sessionProbed
})

const dictionaryStore = useDictionaryStore(pinia)
if (authStore.isAuthenticated) {
  runWhenIdle(() => {
    dictionaryStore.fetchDictionary()
  }, 3000)
}


app.use(permissionDirective)
app.directive('loading', ElLoading.directive)
// 常用业务公共组件保持全局可用，但不再阻塞登录页下载和解析。
app.component('FinanceQueryCard', defineAsyncComponent(() => import('./components/common/FinanceQueryCard.vue')))
app.component('PageHeader', defineAsyncComponent(() => import('./components/ui/PageHeader.vue')))
app.component('EmptyState', defineAsyncComponent(() => import('./components/ui/EmptyState.vue')))
app.component('AppDialog', defineAsyncComponent(() => import('./components/ui/AppDialog.vue')))

languageReady.catch((error) => {
  console.error('Language initialization failed:', error)
})

themeReady
  .catch((error) => {
    console.error('Theme initialization failed:', error)
  })
  .finally(() => {
    app.mount('#app')
    startOperationColumnAutoWidth(document.body)
  })
