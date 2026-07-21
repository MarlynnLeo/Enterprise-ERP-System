/**
 * Application entry.
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useLanguageStore } from './stores/language'
import { useThemeStore } from './stores/theme'
import { useDictionaryStore } from './stores/dictionary'
import i18n from './locales'
import { registerElementIcons } from '@/plugins/elementIcons'
import { registerStatCardIcons } from '@/plugins/statCardIcons'
import { initOperationColumnAutoWidth } from '@/plugins/operationColumnAutoWidth'
import { initPerformanceMode, runWhenIdle } from '@/utils/performanceMode'
import FinanceQueryCard from './components/common/FinanceQueryCard.vue'
import PageHeader from './components/ui/PageHeader.vue'
import EmptyState from './components/ui/EmptyState.vue'
import AppDialog from './components/ui/AppDialog.vue'
import './assets/main.css'
import './assets/dialog-system.css'
import './assets/common-styles.css'
import './assets/ui-utilities.css'
import './assets/price-panel.css'
import './assets/theme-utilities.css'
import './assets/scrollbar.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
/* 主题：兼容层 + 默认 KACON 首屏；其余预设由 themeLoader 按需加载 */
import './assets/themes/pc/theme-compat.css'
import './assets/themes/pc/kacon.css'
import './assets/stat-cards.css'

import permissionDirective from './directives/permission'
import { setupErrorReporter } from '@/utils/errorReporter'

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

router.onError((error) => {
  console.error('路由错误:', error)
})

app.use(pinia)
app.use(i18n)
app.use(router)

const languageStore = useLanguageStore(pinia)
languageStore.initLanguage()

const themeStore = useThemeStore(pinia)
themeStore.initTheme()

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


app.use(ElementPlus)
app.use(permissionDirective)
app.component('FinanceQueryCard', FinanceQueryCard)
app.component('PageHeader', PageHeader)
app.component('EmptyState', EmptyState)
app.component('AppDialog', AppDialog)
registerElementIcons(app)
registerStatCardIcons(app)

app.mount('#app')
initOperationColumnAutoWidth(document.body)
