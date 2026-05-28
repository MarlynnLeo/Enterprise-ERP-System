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
import FinanceQueryCard from './components/common/FinanceQueryCard.vue'
import './assets/main.css'
import './assets/common-styles.css'
import './assets/theme-utilities.css'
import './assets/scrollbar.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import './assets/themes/pc/default.css'
import './assets/themes/pc/dark.css'
import './assets/themes/pc/tech.css'
import './assets/themes/pc/business.css'
import './assets/themes/pc/vibrant.css'
import './assets/themes/pc/nature.css'
import './assets/themes/pc/professional.css'
import './assets/themes/pc/kacon.css'
import './assets/themes/pc/premium.css'
import './assets/themes/pc/theme-compat.css'

import permissionDirective from './directives/permission'

const app = createApp(App)
const pinia = createPinia()

app.config.errorHandler = (err, vm, info) => {
  console.error('全局错误:', err)
  console.error('错误信息:', info)
}

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

const dictionaryStore = useDictionaryStore(pinia)
if (authStore.isAuthenticated) {
  dictionaryStore.fetchDictionary()
}

app.config.globalProperties.$dict = dictionaryStore

app.use(ElementPlus)
app.use(permissionDirective)
app.component('FinanceQueryCard', FinanceQueryCard)
registerElementIcons(app)

app.mount('#app')
