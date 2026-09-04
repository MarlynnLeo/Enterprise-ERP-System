/**
 * Mobile app entry.
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { initTheme } from './composables/useTheme'
import { initPwaViewport } from './utils/pwaViewport'
import permissionDirective from './directives/permission'
import { useDictionaryStore } from './stores/dictionary'

import {
  ActionBar,
  ActionBarButton,
  ActionBarIcon,
  Badge,
  Button,
  Card,
  Cell,
  CellGroup,
  Checkbox,
  CheckboxGroup,
  DatePicker,
  Dialog,
  Empty,
  Field,
  Form,
  Icon,
  List,
  Loading,
  NavBar,
  NumberKeyboard,
  Picker,
  Popup,
  PullRefresh,
  Radio,
  RadioGroup,
  Search,
  Swipe,
  SwipeCell,
  SwipeItem,
  Tab,
  Step,
  Steps,
  Tabbar,
  TabbarItem,
  Tabs,
  Toast
} from 'vant'
import 'vant/lib/index.css'
import './assets/styles/index.scss'
import './styles/design-tokens.css'

initPwaViewport()
initTheme()

const app = createApp(App)
const pinia = createPinia()

const vantComponents = [
  ActionBar,
  ActionBarButton,
  ActionBarIcon,
  Badge,
  Button,
  Card,
  Cell,
  CellGroup,
  Checkbox,
  CheckboxGroup,
  DatePicker,
  Dialog,
  Empty,
  Field,
  Form,
  Icon,
  List,
  Loading,
  NavBar,
  NumberKeyboard,
  Picker,
  Popup,
  PullRefresh,
  Radio,
  RadioGroup,
  Search,
  Swipe,
  SwipeCell,
  SwipeItem,
  Tab,
  Step,
  Steps,
  Tabbar,
  TabbarItem,
  Tabs,
  Toast
]

vantComponents.forEach((component) => app.use(component))

app.use(pinia)
useDictionaryStore(pinia).fetchDictionary().catch(() => {})
app.use(router)
app.use(permissionDirective)

app.config.warnHandler = (msg, instance, trace) => {
  if (msg.includes('Slot "default" invoked outside of the render function')) {
    return
  }

  console.warn(`[Vue warn]: ${msg}`, trace)
}

app.mount('#app')
