<template>
  <template v-for="menu in menus" :key="menu.id">
    <!-- 过滤掉按钮权限(type=2)和没有path的项目 -->
    <template v-if="menu.type !== 2 && (menu.path || hasVisibleChildren(menu))">
      <!-- 有可显示的子菜单的项目作为 sub-menu -->
      <el-sub-menu
        v-if="hasVisibleChildren(menu)"
        :index="getMenuIndex(menu)"
      >
        <template #title>
          <el-icon v-if="menu.icon">
            <component :is="getIconComponent(menu.icon)" />
          </el-icon>
          <span>{{ menu.name }}</span>
        </template>
        <!-- 递归渲染子菜单（过滤掉按钮权限） -->
        <sidebar-menu :menus="getVisibleChildren(menu)" />
      </el-sub-menu>

      <!-- 没有可显示子菜单的项目作为 menu-item -->
      <el-menu-item
        v-else
        :index="menu.path"
      >
        <el-icon v-if="menu.icon">
          <component :is="getIconComponent(menu.icon)" />
        </el-icon>
        <span>{{ menu.name }}</span>
      </el-menu-item>
    </template>
  </template>
</template>

<script setup>
import { House, DataAnalysis, DataLine, Calendar, Tickets, SetUp, Warning, Goods, Document, List, Box, TakeawayBox, Files, Fold, DocumentCopy, Van, ShoppingBag, Money, Wallet, Timer, ArrowRight, User, Lock, Menu, Collection, Setting, Tools, Connection, Monitor, Histogram, TrendCharts, PieChart, Grid, Share, Management, OfficeBuilding, CreditCard, Coin, PriceTag, DCaret, Link, Postcard, Edit, Search, Delete, Plus, Minus, Check, Close, InfoFilled, WarningFilled, CircleCheck, CircleClose, QuestionFilled, Refresh, Upload, Download, View, Hide, Expand, Operation, Switch, FullScreen, Position, Location, Compass, HomeFilled, Memo, Notebook, Stamp, Trophy, FirstAidKit, Suitcase, HelpFilled, Sunny, Moon, Clock, Promotion, VideoCamera, Microphone, Aim, Ticket, Odometer, Printer, ChatDotRound, Avatar, Briefcase, Sell, ShoppingCart, RefreshLeft } from '@element-plus/icons-vue'
defineOptions({
  name: 'SidebarMenu' // 递归组件需要名称
})

const props = defineProps({
  menus: {
    type: Array,
    default: () => []
  }
})

// 图标映射表
const iconMap = {
  'icon-home': House,
  'icon-dashboard': Histogram,
  'icon-data-analysis': DataAnalysis,
  'icon-data-line': DataLine,
  'icon-calendar': Calendar,
  'icon-tickets': Tickets,
  'icon-set-up': SetUp,
  'icon-warning': Warning,
  'icon-goods': Goods,
  'icon-document': Document,
  'icon-list': List,
  'icon-box': Box,
  'icon-takeaway-box': TakeawayBox,
  'icon-files': Files,
  'icon-fold': Fold,
  'icon-document-copy': DocumentCopy,
  'icon-van': Van,
  'icon-shopping-bag': ShoppingBag,
  'icon-money': Money,
  'icon-wallet': Wallet,
  'icon-timer': Timer,
  'icon-arrow-right': ArrowRight,
  'icon-user': User,
  'icon-lock': Lock,
  'icon-menu': Menu,
  'icon-collection': Collection,
  'icon-setting': Setting,
  'icon-tools': Tools,
  'icon-connection': Connection,
  'icon-monitor': Monitor,
  'icon-histogram': Histogram,
  'icon-trend-charts': TrendCharts,
  'icon-pie-chart': PieChart,
  'icon-grid': Grid,
  'icon-share': Share,
  'icon-management': Management,
  'icon-office-building': OfficeBuilding,
  'icon-credit-card': CreditCard,
  'icon-coin': Coin,
  'icon-price-tag': PriceTag,
  'icon-d-caret': DCaret,
  'icon-link': Link,
  'icon-postcard': Postcard,
  'icon-edit': Edit,
  'icon-search': Search,
  'icon-delete': Delete,
  'icon-plus': Plus,
  'icon-minus': Minus,
  'icon-check': Check,
  'icon-close': Close,
  'icon-info-filled': InfoFilled,
  'icon-warning-filled': WarningFilled,
  'icon-circle-check': CircleCheck,
  'icon-circle-close': CircleClose,
  'icon-question-filled': QuestionFilled,
  'icon-refresh': Refresh,
  'icon-upload': Upload,
  'icon-download': Download,
  'icon-view': View,
  'icon-hide': Hide,
  'icon-expand': Expand,
  'icon-operation': Operation,
  'icon-switch': Switch,
  'icon-full-screen': FullScreen,
  'icon-position': Position,
  'icon-location': Location,
  'icon-compass': Compass,
  'icon-home-filled': HomeFilled,
  'icon-memo': Memo,
  'icon-notebook': Notebook,
  'icon-stamp': Stamp,
  'icon-trophy': Trophy,
  'icon-first-aid-kit': FirstAidKit,
  'icon-suitcase': Suitcase,
  'icon-help-filled': HelpFilled,
  'icon-sunny': Sunny,
  'icon-moon': Moon,
  'icon-clock': Clock,
  'icon-promotion': Promotion,
  'icon-video-camera': VideoCamera,
  'icon-microphone': Microphone,
  'icon-aim': Aim,
  'icon-ticket': Ticket,
  'icon-stock': Box,
  'icon-sales': TrendCharts,
  'icon-quality': CircleCheck,
  'icon-data-board': Histogram,
  'icon-odometer': Odometer,
  'icon-printer': Printer,
  'icon-robot': ChatDotRound,
  'icon-customer': Avatar,
  'icon-outbound': Briefcase,
  'icon-sell': Sell,
  'icon-shopping-cart': ShoppingCart,
  'icon-return': RefreshLeft,
  'icon-finished': CircleCheck
}

// 获取图标组件
const getIconComponent = (iconName) => {
  if (!iconName) return null
  return iconMap[iconName] || iconMap['icon-document'] || Document
}

// 判断是否有可显示的子菜单（过滤掉 type=2 的按钮权限和没有 path 的项）
const hasVisibleChildren = (menu) => {
  if (!menu.children || menu.children.length === 0) return false
  // 检查是否有 type=1 或 type 不存在（默认为菜单项）且有 path 或者有可见子菜单的项
  return menu.children.some(child => 
    child.type !== 2 && (child.path || hasVisibleChildren(child))
  )
}

// 获取菜单索引（用于 sub-menu）
const getMenuIndex = (menu) => {
  // 关键修复：包含子菜单时返回随机或固定id作为index，防止 router = true 触发路由跳转导致白屏
  if (hasVisibleChildren(menu)) {
    return `menu-${menu.id}`
  }
  // 优先使用 path，如果没有则用 id
  return menu.path || `menu-${menu.id}`
}

// 获取可显示的子菜单列表（过滤掉 type=2 的按钮权限）
const getVisibleChildren = (menu) => {
  if (!menu.children) return []
  return menu.children.filter(child => 
    child.type !== 2 && (child.path || hasVisibleChildren(child))
  )
}
</script>
