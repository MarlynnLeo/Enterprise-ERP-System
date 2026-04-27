<!--
/**
 * Layout.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-container class="layout-container tech-theme">
    <!-- 侧边栏 -->
    <el-aside width="220px" class="sidebar glass-sidebar" :class="{ 'collapsed': sidebarCollapsed }">
      <div class="logo-container">
        <img src="../assets/logo.svg" alt="Logo" class="logo">
        <h1 class="title tech-title">{{ $t('system.title') }}</h1>
      </div>
      
      <!-- 权限加载中的占位符 -->
      <div v-if="!permissionsReady" class="menu-loading">
        <el-skeleton :rows="10" animated />
      </div>

      <el-menu
        v-else
        :default-active="activeMenu"
        :default-openeds="defaultOpeneds"
        class="sidebar-menu tech-menu"
        router
        :collapse="sidebarCollapsed"
        :unique-opened="false"
        background-color="transparent"
        text-color="var(--el-text-color-primary)"
        active-text-color="var(--tech-primary)"
        @open="handleMenuOpen"
        @close="handleMenuClose"
      >
        <!-- 动态菜单（从数据库加载） -->
        <sidebar-menu 
          v-if="dynamicMenuTree.length > 0" 
          :menus="dynamicMenuTree" 
        />

      </el-menu>
    </el-aside>

    <!-- 主内容区 -->
    <el-container class="main-container">
      <!-- 头部导航 -->
      <el-header class="header glass-header">
        <div class="header-left">
          <el-tooltip content="展开/收起侧边栏" placement="bottom" :show-after="500">
            <div class="icon-button toggle-sidebar" @click="toggleSidebar">
              <el-icon>
                <icon-menu />
              </el-icon>
            </div>
          </el-tooltip>
          <breadcrumb />
        </div>

        <div class="header-right">
          <!-- 菜单搜索 -->
          <MenuSearch />

          <!-- 主题选择器 -->
          <el-tooltip content="主题设置" placement="bottom" :show-after="500">
            <div class="icon-button-wrapper">
              <ThemeSelector />
            </div>
          </el-tooltip>

          <!-- 通知中心 -->
          <el-tooltip content="通知中心" placement="bottom" :show-after="500">
            <div class="icon-button-wrapper">
              <NotificationCenter />
            </div>
          </el-tooltip>

          <el-tooltip content="用户菜单" placement="bottom" :show-after="500">
            <el-dropdown trigger="click">
              <div class="user-info">
                <el-avatar
                  :size="32"
                  :src="userAvatar"
                  class="tech-avatar"
                  @error="handleAvatarError"
                >{{ userInitials }}</el-avatar>
                <span class="username">{{ userName }}</span>
              </div>

              <template #dropdown>
                <el-dropdown-menu class="tech-dropdown">
                  <el-dropdown-item @click="handleProfile">
                    <el-icon><icon-user /></el-icon>
                    {{ $t('user.profile') }}
                  </el-dropdown-item>
                  <el-dropdown-item @click="handleAvatarFrame">
                    <el-icon><icon-picture-rounded /></el-icon>
                    头像特效
                  </el-dropdown-item>
                  <el-dropdown-item @click="handleSettings">
                    <el-icon><icon-setting /></el-icon>
                    {{ $t('user.settings') }}
                  </el-dropdown-item>
                  <el-dropdown-item>
                    <el-dropdown placement="left-start" trigger="hover">
                      <span class="language-trigger">
                        <el-icon><icon-globe /></el-icon>
                        {{ $t('language.title') }}
                        <el-icon class="el-icon--right"><icon-arrow-right /></el-icon>
                      </span>
                      <template #dropdown>
                        <el-dropdown-menu class="language-dropdown">
                          <el-dropdown-item
                            v-for="lang in languageStore.supportedLanguages"
                            :key="lang.code"
                            @click="switchLanguage(lang.code)"
                            :class="{ 'is-active': languageStore.currentLanguage === lang.code }"
                          >
                            <span class="language-item">
                              {{ lang.name }}
                              <el-icon v-if="languageStore.currentLanguage === lang.code" class="check-icon">
                                <icon-check />
                              </el-icon>
                            </span>
                          </el-dropdown-item>
                        </el-dropdown-menu>
                      </template>
                    </el-dropdown>
                  </el-dropdown-item>
                  <el-dropdown-item divided @click="handleLogout">
                    <el-icon><icon-turn-off /></el-icon>
                    {{ $t('user.logout') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </el-tooltip>
        </div>
      </el-header>
      
      <!-- 内容区 -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>

import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useLanguageStore } from '../stores/language'
import { ElMessageBox, ElMessage } from 'element-plus'
import Breadcrumb from '../components/layout/Breadcrumb.vue'
import ThemeSelector from '../components/common/ThemeSelector.vue'
import NotificationCenter from '../components/NotificationCenter.vue'
import MenuSearch from '../components/common/MenuSearch.vue'
import SidebarMenu from '../components/layout/SidebarMenu.vue'
import { usePermissionStore } from '../stores/permissionStore'
import { userApi } from '../api/user'

// 图标组件
import { 
  Tickets as IconStock, 
  Goods as IconMaterial, 
  Document as IconDocument, 
  ShoppingBag as IconShoppingBag,
  Menu as IconMenu,
  User as IconUser,
  PictureRounded as IconPictureRounded,
  Setting as IconSetting,
  Location as IconGlobe,
  ArrowRight as IconArrowRight,
  Check as IconCheck,
  SwitchButton as IconTurnOff
} from '@element-plus/icons-vue'
// 采购管理图标重命名，避免命名冲突
const IconQuotation = IconDocument
const IconGoods = IconMaterial
const IconSupplier = IconShoppingBag
const IconTickets = IconStock

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const authStore = useAuthStore()
const languageStore = useLanguageStore()
const permissionStore = usePermissionStore()

const sidebarCollapsed = ref(false)
// 如果权限已经加载过，直接标记为准备好
const permissionsReady = ref(authStore.permissionsLoaded)
// 是否使用动态菜单（从数据库加载）
const useDynamicMenu = ref(true)
// 动态菜单树
const dynamicMenuTree = computed(() => permissionStore.menuTree || [])

// 加载动态菜单（使用新的用户菜单API，返回已过滤的树形结构）
const loadDynamicMenus = async () => {
  if (!useDynamicMenu.value) return
  try {
    const response = await userApi.getUserMenus()
    if (response.data && Array.isArray(response.data)) {
      // API直接返回树形结构，无需转换
      permissionStore.setMenuTree(response.data)
    }
  } catch (error) {
    console.error('加载菜单失败:', error)
    // 如果加载失败，回退到硬编码菜单
    useDynamicMenu.value = false
  }
}

// 构建菜单树
const buildMenuTree = (menuList) => {
  const map = {}
  const tree = []
  
  // 创建映射
  menuList.forEach(item => {
    map[item.id] = { ...item, children: [] }
  })
  
  // 构建树
  menuList.forEach(item => {
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(map[item.id])
    } else if (!item.parent_id || item.parent_id === 0) {
      tree.push(map[item.id])
    }
  })
  
  // 过滤掉没有路径的父菜单的空子菜单
  return tree.filter(item => item.path || (item.children && item.children.length > 0))
}

// 获取当前路由应该展开的菜单
const getMenusForRoute = (path) => {
  const menus = []

  // 根据路径匹配需要展开的子菜单
  if (path.startsWith('/dataoverview')) menus.push('/dataoverview')
  if (path.startsWith('/production')) menus.push('/production')
  if (path.startsWith('/sales')) menus.push('/sales')
  if (path.startsWith('/inventory')) menus.push('/inventory')
  if (path.startsWith('/purchase')) menus.push('/purchase')
  if (path.startsWith('/quality')) menus.push('/quality')
  if (path.startsWith('/equipment')) menus.push('/equipment')
  if (path.startsWith('/basedata')) menus.push('/basedata')
  if (path.startsWith('/finance')) {
    menus.push('/finance')
    // 财务模块的二级子菜单
    if (path.startsWith('/finance/gl')) menus.push('finance-gl')
    if (path.startsWith('/finance/ar')) menus.push('finance-ar')
    if (path.startsWith('/finance/ap')) menus.push('finance-ap')
    if (path.startsWith('/finance/cash')) menus.push('finance-cashier')
    if (path.startsWith('/finance/expenses')) menus.push('finance-expenses')
    if (path.startsWith('/finance/assets')) menus.push('finance-assets')
    if (path.startsWith('/finance/reports')) menus.push('finance-reports')
    if (path.startsWith('/finance/tax')) menus.push('finance-tax')
    if (path.startsWith('/finance/budget')) menus.push('finance-budget')
    if (path.startsWith('/finance/cost')) menus.push('finance-cost')
    if (path.startsWith('/finance/settings') || path.startsWith('/finance/automation')) menus.push('finance-settings')
  }
  if (path.startsWith('/system')) menus.push('/system')

  return menus
}

// 当前激活的菜单项
const activeMenu = computed(() => {
  return route.path
})

// 根据当前路由自动展开对应的子菜单
const defaultOpeneds = computed(() => {
  return getMenusForRoute(route.path)
})

// 处理菜单打开事件
const handleMenuOpen = (_index) => {
  // 不需要保存状态,让路由自动控制展开
}

// 处理菜单关闭事件
const handleMenuClose = (_index) => {
  // 不需要保存状态,让路由自动控制展开
}

// 用户信息
const userName = computed(() => {
  return authStore.user?.real_name || '用户'
})

const userAvatar = computed(() => {
  return authStore.user?.avatar || ''
})

const userInitials = computed(() => {
  const name = userName.value
  return name ? name.charAt(0).toUpperCase() : 'U'
})

// 处理头像加载失败
const handleAvatarError = () => {
  // 头像加载失败，使用默认显示
}

// 切换侧边栏（带遮罩淡入淡出特效掩盖微抖动）
const toggleSidebar = () => {
  const sidebar = document.querySelector('.sidebar')
  sidebar?.classList.add('collapsing')
  sidebarCollapsed.value = !sidebarCollapsed.value
  setTimeout(() => sidebar?.classList.remove('collapsing'), 250)
}

// 用户操作
const handleProfile = () => {
  router.push('/profile')
}

const handleAvatarFrame = () => {
  router.push('/profile?tab=avatar-frame')
}

const handleSettings = () => {
  // 实现设置功能
}

// 语言切换
const switchLanguage = (langCode) => {
  languageStore.setLanguage(langCode)
  // 更新i18n的locale
  locale.value = langCode
  // 显示切换成功消息
  ElMessage.success(t('language.switchSuccess'))
}

const handleLogout = () => {
  ElMessageBox.confirm(t('message.operationConfirm'), t('common.warning'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  }).then(() => {
    authStore.logout()
    router.push('/login')
    ElMessage.success(t('message.logoutSuccess'))
  }).catch(() => {})
}

// 路由变化时,菜单展开状态由 defaultOpeneds 计算属性自动控制
// 不需要额外的 watch 来维护状态

// 确保在组件挂载时加载用户信息和权限
onMounted(async () => {
  try {
    // 并行加载用户信息、权限和菜单，避免串行等待
    const tasks = [
      authStore.fetchUserProfile(false),
      loadDynamicMenus()
    ]
    
    // 权限未加载时也并行加载
    if (!authStore.permissionsLoaded) {
      tasks.push(authStore.fetchUserPermissions())
    }
    
    await Promise.all(tasks)
    
    // 标记权限已准备好
    permissionsReady.value = true
  } catch (error) {
    console.error('加载用户信息或权限失败:', error)
    // 即使失败也设置为true，避免菜单永远不显示
    permissionsReady.value = true
  }
})
</script>

<style scoped>
/* ===== 科技主题变量 ===== */
.tech-theme {
  /* 主题色 */
  --tech-primary: #00c3ff;
  --tech-secondary: #1e88e5;
  --tech-accent: #64ffda;
  --tech-glow: rgba(0, 195, 255, 0.5);
  --tech-dark: #1a1a2e;
  --tech-light: #e9f4ff;
  
  /* 玻璃效果 */
  --glass-bg: rgba(255, 255, 255, 0.1);
  --glass-border: rgba(255, 255, 255, 0.2);
  --glass-shadow: rgba(0, 0, 0, 0.1);
  
  /* 圆角 */
  --border-radius-sm: 8px;
  --border-radius-md: 12px;
  --border-radius-lg: 16px;
  
  /* 浮空阴影 */
  --float-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  --float-shadow-hover: 0 15px 30px -5px rgba(0, 0, 0, 0.15);
  
  /* 公共按钮样式变量 */
  --btn-bg: rgba(255, 255, 255, 0.05);
  --btn-border: rgba(255, 255, 255, 0.1);
  --btn-hover-bg: rgba(0, 195, 255, 0.1);
  --btn-hover-shadow: 0 4px 12px rgba(0, 195, 255, 0.3);
}

.dark .tech-theme {
  --glass-bg: rgba(26, 26, 46, 0.7);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-shadow: rgba(0, 0, 0, 0.3);
}

.layout-container {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--el-bg-color);
  background-image: 
    radial-gradient(circle at 10% 20%, rgba(0, 195, 255, 0.05) 0%, transparent 20%),
    radial-gradient(circle at 90% 80%, rgba(30, 136, 229, 0.05) 0%, transparent 20%);
}

.sidebar {
  transition: width var(--transition-base) ease, background-color var(--transition-base) ease;
  overflow-x: hidden;
  overflow-y: auto;
  height: 100%;
  position: relative;
  z-index: 1;
  border-radius: 0 var(--border-radius-lg) var(--border-radius-lg) 0;
  margin: 10px 0 10px 0;
  height: calc(100% - 20px);
  transform: translateZ(0);
}

.glass-sidebar {
  background: var(--glass-bg) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  border-right: 1px solid var(--glass-border) !important;
  box-shadow: var(--float-shadow), 0 8px 32px 0 var(--glass-shadow) !important;
}

.logo-container {
  height: 60px;
  display: flex;
  align-items: center;
  padding-left: 16px;
  background-color: transparent;
  border-bottom: 1px solid var(--glass-border);
  position: relative;
  border-radius: var(--border-radius-md) var(--border-radius-md) 0 0;
  gap: 12px; /* 使用gap替代margin-left，更好的对齐 */
}

.logo {
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 0 5px var(--tech-glow));
  animation: logoGlow 4s infinite alternate;
}

@keyframes logoGlow {
  0% { filter: drop-shadow(0 0 3px var(--tech-glow)); }
  100% { filter: drop-shadow(0 0 8px var(--tech-glow)); }
}

.tech-title {
  background: linear-gradient(90deg, var(--tech-primary), var(--tech-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.title {
  margin: 0; /* 移除默认margin */
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 1; /* 设置行高为1，确保文字垂直居中 */
  display: flex;
  align-items: center; /* 确保文字内容垂直居中 */
}

.sidebar-menu {
  border-right: none;
  padding: 5px;
}

.menu-loading {
  padding: 15px;
}

.tech-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, rgba(0, 195, 255, 0.1), transparent);
  border-left: 3px solid var(--tech-primary);
  border-radius: var(--border-radius-sm);
}

.tech-menu :deep(.el-menu-item), .tech-menu :deep(.el-sub-menu__title) {
  border-radius: var(--border-radius-sm);
  margin-bottom: 2px;
}

.tech-menu :deep(.el-menu-item:hover), .tech-menu :deep(.el-sub-menu__title:hover) {
  background-color: rgba(255, 255, 255, 0.05) !important;
}

/* 二级菜单项增加左侧缩进 */
.tech-menu :deep(.el-sub-menu .el-menu-item) {
  padding-left: 25px !important;
}

/* 三级菜单项（如果有）增加更多缩进 */
.tech-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item) {
  padding-left: 45px !important;
}

/* ===== 二级子菜单视觉区分样式 ===== */
/* 二级子菜单标题样式 - 区分于一级菜单 */
.tech-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title) {
  font-size: 13px !important;
  padding-left: 20px !important;
  position: relative;
  background: linear-gradient(90deg, rgba(100, 150, 255, 0.03), transparent) !important;
}

/* 二级子菜单标题左侧指示条 */
.tech-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title)::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: linear-gradient(180deg, var(--tech-primary), rgba(0, 195, 255, 0.3));
  border-radius: 2px;
}

/* 二级子菜单图标更小 */
.tech-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title .el-icon) {
  font-size: 14px !important;
  margin-right: 6px;
  opacity: 0.85;
}

/* 二级子菜单展开箭头更小 */
.tech-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title .el-sub-menu__icon-arrow) {
  font-size: 10px !important;
}

/* 三级菜单项（二级子菜单的子项）样式 */
.tech-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item) {
  font-size: 12.5px !important;
}

.tech-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item .el-icon) {
  font-size: 13px !important;
}

/* 三级菜单项激活状态 */
.tech-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item.is-active) {
  color: var(--tech-primary) !important;
  font-weight: 500;
}

.tech-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item.is-active .el-icon) {
  opacity: 1;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 60px;
  position: relative;
  z-index: 1;
  margin: 10px 10px 0 10px;
  border-radius: var(--border-radius-lg);
}

.glass-header {
  background: var(--glass-bg) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  border: 1px solid var(--glass-border) !important;
  box-shadow: var(--float-shadow), 0 4px 16px -2px var(--glass-shadow) !important;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* ===== 图标按钮公共样式 ===== */
.icon-button,
.icon-button-wrapper :deep(.notification-bell),
.icon-button-wrapper :deep(.theme-selector) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--border-radius-md);
  cursor: pointer;
  color: var(--el-text-color-primary);
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.icon-button:hover,
.icon-button-wrapper :deep(.notification-bell:hover),
.icon-button-wrapper :deep(.theme-selector:hover) {
  color: var(--tech-primary);
  background: var(--btn-hover-bg);
  border-color: var(--tech-primary);
  transform: translateY(-2px);
  box-shadow: var(--btn-hover-shadow);
}

.icon-button:active {
  transform: translateY(0);
}

.toggle-sidebar {
  font-size: 20px;
}

.toggle-sidebar:hover .el-icon {
  transform: rotate(90deg);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-button-wrapper {
  display: flex;
  align-items: center;
}

/* 用户信息区域 */
.user-info {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 12px 4px 4px;
  border-radius: 20px;
  background: var(--btn-bg);
  border: 1px solid var(--btn-border);
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.user-info:hover {
  background: var(--btn-hover-bg);
  border-color: var(--tech-primary);
  transform: translateY(-2px);
  box-shadow: var(--btn-hover-shadow);
}

.tech-avatar {
  border: 2px solid transparent;
  background: linear-gradient(white, white) padding-box,
              linear-gradient(90deg, var(--tech-primary), var(--tech-secondary)) border-box;
  box-shadow: 0 0 10px var(--tech-glow);
}

.username {
  margin-left: 8px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

/* ===== 下拉菜单公共样式 ===== */
.tech-dropdown,
.language-dropdown {
  background: var(--glass-bg) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
  border: 1px solid var(--glass-border) !important;
  box-shadow: var(--float-shadow), 0 8px 24px 0 var(--glass-shadow) !important;
  border-radius: var(--border-radius-md) !important;
  overflow: hidden;
  padding: 6px;
}

.tech-dropdown :deep(.el-dropdown-menu__item),
.language-dropdown :deep(.el-dropdown-menu__item) {
  border-radius: var(--border-radius-sm);
  margin: 2px 0;
  padding: 8px 12px;
  transition: color 0.15s ease, background-color 0.15s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tech-dropdown :deep(.el-dropdown-menu__item .el-icon) {
  font-size: 16px;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.tech-dropdown :deep(.el-dropdown-menu__item:not(.is-disabled):hover),
.language-dropdown :deep(.el-dropdown-menu__item:hover) {
  background: linear-gradient(90deg, rgba(0, 195, 255, 0.1), rgba(0, 195, 255, 0.05));
  color: var(--tech-primary);
  transform: translateX(4px);
}

.tech-dropdown :deep(.el-dropdown-menu__item:not(.is-disabled):hover .el-icon) {
  color: var(--tech-primary);
  transform: scale(1.1);
}

/* 语言切换样式 */
.language-trigger {
  display: flex;
  align-items: center;
  width: 100%;
  cursor: pointer;
  padding: 0;
}

.language-trigger .el-icon {
  margin-right: 8px;
}

.language-trigger .el-icon--right {
  margin-left: auto;
  margin-right: 0;
}

.language-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.language-item .check-icon {
  color: var(--tech-primary);
  font-size: 16px;
  animation: checkPulse 0.3s ease;
}

@keyframes checkPulse {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.2);
  }
  100% {
    transform: scale(1);
  }
}

.language-dropdown :deep(.el-dropdown-menu__item.is-active) {
  background: linear-gradient(90deg, rgba(0, 195, 255, 0.15), rgba(0, 195, 255, 0.08));
  color: var(--tech-primary);
  border-left: 3px solid var(--tech-primary);
}

.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  padding: 20px;
  background-color: transparent;
  overflow-x: hidden;
  overflow-y: auto;
  position: relative;
  z-index: 1;
  margin: 0 10px 10px 10px;
}

/* Hide main content scrollbar when dialog is open */
:global(body.el-popup-parent--hidden) .main-content {
  overflow-y: hidden;
}

/* 只移除表格的浮空效果，保留卡片的浮空效果 */
.main-content :deep(.el-card) {
  border-radius: var(--border-radius-md);
  transition: box-shadow 0.2s ease, transform 0.2s ease;
  box-shadow: var(--float-shadow);
  overflow-x: auto; /* 允许卡片内容水平滚动 */
  overflow-y: hidden;
  max-width: 100%; /* 限制卡片最大宽度 */
  border: 1px solid var(--glass-border);
}

.main-content :deep(.el-card:hover) {
  transform: translateY(-3px);
  box-shadow: var(--float-shadow-hover);
}

.main-content :deep(.el-table) {
  border-radius: 0;
  transition: none;
  box-shadow: none;
  /* 移除overflow:hidden，让表格组件自己处理滚动 */
  border: 1px solid var(--glass-border);
}

.main-content :deep(.el-table:hover) {
  transform: none;
  box-shadow: none;
}

/* 恢复卡片发光效果 */
.card-glow {
  display: block;
  position: absolute;
  top: -50px;
  left: -50px;
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, var(--tech-glow) 0%, rgba(0, 0, 0, 0) 70%);
  opacity: 0.5;
  z-index: -1;
  animation: glowPulse 10s infinite alternate;
}

@keyframes glowPulse {
  0% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.2);
  }
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
}

/* ===== 侧边栏折叠 ===== */
.sidebar.collapsed {
  width: 64px !important;
}

/* 折叠遮罩特效：短暂白色闪现，优雅掩盖布局重排 */
.sidebar::after {
  content: '';
  position: absolute;
  inset: 0;
  background: #ffffff;
  opacity: 0;
  pointer-events: none;
  z-index: 10;
  transition: opacity 0.12s ease;
}

.sidebar.collapsing::after {
  opacity: 0.7;
}

/* Logo区域收起样式 */
.sidebar.collapsed .logo-container {
  padding-left: 0;
  justify-content: center;
}

.sidebar.collapsed .logo-container .title {
  display: none;
}

/* ===== 移动端响应式 ===== */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    z-index: 1000;
    top: 0;
    left: 0;
    height: 100vh;
    margin: 0;
    border-radius: 0;
  }
  
  .sidebar.collapsed {
    transform: translateX(-100%);
  }
  
  .header, .main-content {
    margin: 5px;
  }
}
</style>