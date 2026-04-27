/**
 * main.js
 * @description 移动端应用入口
 * @date 2026-04-15
 * @version 2.0.0
 */

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'
import { initTheme } from './composables/useTheme'
import permissionDirective from './directives/permission'

import {
  Button,
  NavBar,
  Tabbar,
  TabbarItem,
  Form,
  Field,
  Cell,
  CellGroup,
  Popup,
  DatePicker,
  NumberKeyboard,
  ActionBar,
  ActionBarIcon,
  ActionBarButton,
  Icon,
  Loading,
  Toast,
  Dialog,
  Empty,
  Picker,
  PullRefresh,
  List,
  Card,
  Tag,
  Search,
  SwipeCell,
  Radio,
  RadioGroup,
  Checkbox,
  CheckboxGroup,
  Swipe,
  SwipeItem,
  Badge,
  Tabs,
  Tab
} from 'vant'
import 'vant/lib/index.css'
import './assets/styles/index.scss'

// 引入设计令牌样式（包含 CSS 变量、Vant 变量映射）
import './styles/design-tokens.css'

// Material Symbols 图标字体（本地化加载，避免 CDN 加载失败）
import 'material-symbols/rounded.css'

const app = createApp(App)
const pinia = createPinia()

// 注册 Vant 组件
const vantComponents = [
  Button,
  NavBar,
  Tabbar,
  TabbarItem,
  Form,
  Field,
  Cell,
  CellGroup,
  Popup,
  DatePicker,
  NumberKeyboard,
  ActionBar,
  ActionBarIcon,
  ActionBarButton,
  Icon,
  Loading,
  Toast,
  Dialog,
  Empty,
  Picker,
  PullRefresh,
  List,
  Card,
  Tag,
  Search,
  SwipeCell,
  Radio,
  RadioGroup,
  Checkbox,
  CheckboxGroup,
  Swipe,
  SwipeItem,
  Badge,
  Tabs,
  Tab
]
vantComponents.forEach((c) => app.use(c))

app.use(pinia)
app.use(router)

// 注册权限指令 — 与网页端同步
app.use(permissionDirective)

// 初始化主题系统
initTheme()

// 配置 Vue 警告处理器，抑制来自 Vant 组件库的 slot 警告
app.config.warnHandler = (msg, instance, trace) => {
  // 抑制 Vant 组件库的 slot 警告
  if (msg.includes('Slot "default" invoked outside of the render function')) {
    return
  }
  // 其他警告正常输出
  console.warn(`[Vue warn]: ${msg}`, trace)
}

app.mount('#app')

// iOS Safari 防止弹性过度滚动
document.documentElement.style.height = '100%'
document.body.style.height = '100%'

// iOS PWA 全屏模式支持
const isStandalone = window.navigator.standalone === true
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

if (isStandalone || isIOS) {
  document.documentElement.classList.add('fullscreen-mode')
  document.body.classList.add('fullscreen-mode')
}
