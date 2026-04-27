/**
 * main.js
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
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
import axios from 'axios'
import Vue3Lottie from 'vue3-lottie'
import './assets/main.css'
import './assets/common-styles.css'
import './assets/scrollbar.css'
import './assets/avatar-effects.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
// 引入主题系统CSS文件
import './assets/themes/pc/default.css'
import './assets/themes/pc/dark.css'
import './assets/themes/pc/tech.css'
import './assets/themes/pc/business.css'
import './assets/themes/pc/vibrant.css'
import './assets/themes/pc/nature.css'
import './assets/themes/pc/professional.css'
import './assets/themes/pc/kacon.css'

import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import permissionDirective from './directives/permission'

const app = createApp(App)
const pinia = createPinia()

// 添加全局错误处理
app.config.errorHandler = (err, vm, info) => {
  console.error('全局错误:', err)
  console.error('错误信息:', info)
}

// 添加路由错误处理
router.onError((error) => {
  console.error('路由错误:', error)
})

app.use(pinia)
app.use(i18n)
app.use(router)

// 初始化语言设置
const languageStore = useLanguageStore(pinia)
languageStore.initLanguage()

// 初始化主题设置（仅应用本地主题，服务器主题在路由守卫中加载）
const themeStore = useThemeStore(pinia)
themeStore.initTheme()

// 初始化认证状态
const authStore = useAuthStore(pinia)
authStore.setAuthHeader()

// 初始化全局业务字典
const dictionaryStore = useDictionaryStore(pinia)
if (authStore.isAuthenticated) {
  dictionaryStore.fetchDictionary()
}

// 挂载到全局，让所有模板都可以直接使用 $dict.getOptions() 等方法，无需 import
app.config.globalProperties.$dict = dictionaryStore;

app.use(ElementPlus)
app.use(permissionDirective)
app.use(Vue3Lottie)

// 注册所有Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 配置 axios 默认值 - 修复路径，避免重复的 /api
axios.defaults.baseURL = import.meta.env.VITE_API_URL || '/api'

app.mount('#app')