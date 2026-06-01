<!--
/**
 * Layout.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-container class="layout-container app-shell">
    <!-- 侧边栏 -->
    <el-aside
      width="220px"
      class="sidebar app-sidebar"
      :class="{
        collapsed: sidebarCollapsed,
        'is-mini': isSidebarMenuCollapsed,
        'is-resizing': sidebarResizing
      }"
    >
      <div class="logo-container">
        <img src="../assets/logo.svg" alt="Logo" class="logo">
        <h1 class="title app-title">{{ $t('system.title') }}</h1>
      </div>

      <!-- 权限加载中的占位符 -->
      <div v-if="!permissionsReady" class="menu-loading">
        <el-skeleton :rows="10" animated />
      </div>
      <el-menu
        v-else
        ref="menuRef"
        :default-active="activeMenu"
        :default-openeds="defaultOpeneds"
        class="sidebar-menu app-menu"
        router
        :collapse="isSidebarMenuCollapsed"
        :unique-opened="false"
        background-color="transparent"
        text-color="var(--el-text-color-primary)"
        active-text-color="var(--shell-accent)"
      >
        <!-- 动态菜单（从数据库加载） -->
        <sidebar-menu
          v-if="dynamicMenuTree.length > 0"
          :menus="dynamicMenuTree"
        />
      </el-menu>
    </el-aside>
    <div
      v-if="isMobile && !sidebarCollapsed"
      class="sidebar-backdrop"
      @click="sidebarCollapsed = true"
    ></div>
    <!-- 主内容区 -->
    <el-container class="main-container">
      <!-- 头部导航 -->
      <el-header class="header app-header">
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
          <div class="icon-button-wrapper" aria-label="主题设置">
            <ThemeSelector />
          </div>
          <!-- 通知中心 -->
          <el-tooltip content="通知中心" placement="bottom" :show-after="500">
            <div class="icon-button-wrapper">
              <NotificationCenter />
            </div>
          </el-tooltip>
          <el-dropdown trigger="click">
            <div class="user-info">
              <el-avatar
                :size="32"
                :src="userAvatar"
                class="user-avatar"
                @error="handleAvatarError"
              >{{ userInitials }}</el-avatar>
              <span class="username">{{ userName }}</span>
            </div>
            <template #dropdown>
              <el-dropdown-menu class="user-dropdown">
                <el-dropdown-item @click="handleProfile">
                  <el-icon><icon-user /></el-icon>
                  {{ $t('user.profile') }}
                </el-dropdown-item>
                <el-dropdown-item @click="handleAvatarFrame">
                  <el-icon><icon-picture-rounded /></el-icon>
                  头像特效
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { resolveMenuNavigationState } from '../utils/menuNavigation'
// 图标组件
import {
  Menu as IconMenu,
  User as IconUser,
  PictureRounded as IconPictureRounded,
  Location as IconGlobe,
  ArrowRight as IconArrowRight,
  Check as IconCheck,
  SwitchButton as IconTurnOff
} from '@element-plus/icons-vue'
const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const authStore = useAuthStore()
const languageStore = useLanguageStore()
const permissionStore = usePermissionStore()
const sidebarCollapsed = ref(false)
const sidebarMini = ref(false)
const sidebarResizing = ref(false)
const isMobile = ref(false)
const menuRef = ref(null)
let sidebarResizeTimer = null
let sidebarToggleFrame = 0
// 如果权限已经加载过，直接标记为准备好
const permissionsReady = ref(authStore.permissionsLoaded)
// 动态菜单树
const dynamicMenuTree = computed(() => permissionStore.menuTree || [])
// 加载动态菜单（使用新的用户菜单API，返回已过滤的树形结构）
const loadDynamicMenus = async () => {
  try {
    const response = await userApi.getUserMenus()
    if (response.data && Array.isArray(response.data)) {
      // API直接返回树形结构，无需转换
      permissionStore.setMenuTree(response.data)
    } else {
      permissionStore.setMenuTree([])
    }
  } catch (error) {
    console.error('加载菜单失败:', error)
    permissionStore.setMenuTree([])
    ElMessage.error('菜单加载失败，请刷新后重试')
  }
}
const menuNavigationState = computed(() =>
  resolveMenuNavigationState(dynamicMenuTree.value, route.path)
)
// 当前激活的菜单项
const activeMenu = computed(() => {
  return menuNavigationState.value.activePath || route.path
})
// 根据当前路由自动展开对应的子菜单
const defaultOpeneds = computed(() => {
  return menuNavigationState.value.openeds || []
})
const isSidebarMenuCollapsed = computed(() => !isMobile.value && sidebarMini.value)

const syncRouteOpenMenus = async () => {
  if (isSidebarMenuCollapsed.value || defaultOpeneds.value.length === 0) return

  await nextTick()
  const menu = menuRef.value
  if (!menu) return

  defaultOpeneds.value.forEach((index) => {
    try {
      menu.open(index)
    } catch {
      // Element Plus registers submenu instances asynchronously while the tree is changing.
    }
  })
}

watch(
  () => [route.path, dynamicMenuTree.value, isSidebarMenuCollapsed.value],
  () => {
    syncRouteOpenMenus()
  },
  { flush: 'post' }
)

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
const clearSidebarToggleSchedule = () => {
  if (sidebarResizeTimer) {
    window.clearTimeout(sidebarResizeTimer)
    sidebarResizeTimer = null
  }
  if (sidebarToggleFrame) {
    window.cancelAnimationFrame(sidebarToggleFrame)
    sidebarToggleFrame = 0
  }
}
const scheduleSidebarFrame = (callback) => {
  if (sidebarToggleFrame) {
    window.cancelAnimationFrame(sidebarToggleFrame)
  }
  sidebarToggleFrame = window.requestAnimationFrame(() => {
    sidebarToggleFrame = 0
    callback()
  })
}
const syncMobileLayout = () => {
  isMobile.value = window.innerWidth <= 768
  if (isMobile.value) {
    clearSidebarToggleSchedule()
    sidebarCollapsed.value = true
    sidebarMini.value = false
    sidebarResizing.value = false
  } else if (sidebarCollapsed.value) {
    sidebarMini.value = true
  } else {
    sidebarMini.value = false
  }
}
const endSidebarToggle = () => {
  sidebarResizeTimer = null
  sidebarResizing.value = false
}
const scheduleSidebarToggleEnd = (delay = 140) => {
  if (sidebarResizeTimer) {
    window.clearTimeout(sidebarResizeTimer)
  }
  sidebarResizeTimer = window.setTimeout(endSidebarToggle, delay)
}
// 切换侧边栏
const toggleSidebar = () => {
  if (isMobile.value) {
    sidebarCollapsed.value = !sidebarCollapsed.value
    return
  }

  clearSidebarToggleSchedule()
  sidebarResizing.value = true

  if (sidebarCollapsed.value) {
    sidebarCollapsed.value = false
    scheduleSidebarFrame(() => {
      sidebarMini.value = false
    })
    scheduleSidebarToggleEnd(220)
    return
  }

  sidebarMini.value = true
  scheduleSidebarFrame(() => {
    sidebarCollapsed.value = true
  })
  scheduleSidebarToggleEnd(220)
}
// 用户操作
const handleProfile = () => {
  router.push('/profile')
}
const handleAvatarFrame = () => {
  router.push('/profile?tab=avatar-frame')
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
// 路由变化时只补展开当前路径的父菜单，避免重建菜单导致滚动位置丢失。
// 确保在组件挂载时加载用户信息和权限
onMounted(async () => {
  syncMobileLayout()
  window.addEventListener('resize', syncMobileLayout)

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
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobileLayout)
  clearSidebarToggleSchedule()
})
</script>
<style scoped>
/* ===== Application shell tokens ===== */
.app-shell {
  --shell-accent: var(--color-primary);
  --shell-accent-strong: var(--color-primary-dark-2, var(--color-primary));
  --shell-accent-soft: var(--color-primary-light-9, color-mix(in srgb, var(--color-primary) 12%, transparent));
  --shell-glow: color-mix(in srgb, var(--color-primary) 24%, transparent);
  --shell-surface: color-mix(in srgb, var(--color-bg-base) 92%, transparent);
  --shell-border: color-mix(in srgb, var(--color-border-base) 88%, transparent);
  --shell-shadow: var(--shadow-card, var(--shadow-sm));
  --shell-shadow-hover: var(--shadow-card-hover, var(--shadow-md));
  --shell-radius-sm: var(--radius-sm, 8px);
  --shell-radius-md: var(--radius-md, 12px);
  --shell-radius-lg: var(--radius-lg, 16px);
  --shell-control-bg: color-mix(in srgb, var(--color-bg-base) 72%, transparent);
  --shell-control-border: color-mix(in srgb, var(--color-border-base) 78%, transparent);
  --shell-control-hover-bg: var(--color-bg-hover);
  --shell-control-hover-shadow: var(--shadow-sm);
}
.dark .app-shell {
  --shell-surface: color-mix(in srgb, var(--color-bg-base) 78%, transparent);
  --shell-border: color-mix(in srgb, var(--ds-white) 12%, transparent);
  --shell-shadow: 0 8px 28px color-mix(in srgb, var(--ds-black) 28%, transparent);
}
.layout-container {
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--el-bg-color);
}
.sidebar {
  --shell-sidebar-expanded-width: 220px;
  --shell-sidebar-collapsed-width: 64px;
  --shell-menu-item-padding-x: 20px;
  --shell-menu-icon-size: 18px;
  flex: 0 0 var(--shell-sidebar-expanded-width);
  width: var(--shell-sidebar-expanded-width) !important;
  transition:
    flex-basis 180ms ease,
    width 180ms ease,
    background-color var(--transition-base) ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
  overflow-x: hidden;
  overflow-y: hidden;
  position: relative;
  z-index: 1;
  border-radius: 0 var(--shell-radius-lg) var(--shell-radius-lg) 0;
  margin: 10px 0 10px 0;
  height: calc(100% - 20px);
  transform: translateZ(0);
  display: flex;
  flex-direction: column;
  contain: layout paint style;
  will-change: auto;
}
.app-sidebar {
  background: var(--shell-surface) !important;
  border-right: 1px solid var(--shell-border) !important;
  box-shadow: var(--shell-shadow) !important;
}
.logo-container {
  flex: 0 0 60px;
  height: 60px;
  display: flex;
  align-items: center;
  padding-left: 16px;
  background-color: transparent;
  border-bottom: 1px solid var(--shell-border);
  position: relative;
  border-radius: var(--shell-radius-md) var(--shell-radius-md) 0 0;
  gap: 12px; /* 使用gap替代margin-left，更好的对齐 */
}
.logo {
  width: 32px;
  height: 32px;
}
.app-title {
  background: linear-gradient(90deg, var(--shell-accent), var(--shell-accent-strong));
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
.logo-container .title,
.app-menu :deep(.el-menu-item > span),
.app-menu :deep(.el-sub-menu__title > span),
.app-menu :deep(.el-sub-menu__icon-arrow) {
  transition:
    opacity 120ms ease,
    transform 120ms ease,
    color 150ms ease;
}
.sidebar-menu {
  flex: 1 1 auto;
  width: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: none;
  padding: 8px 0 12px;
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 18px), transparent 100%);
  mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 18px), transparent 100%);
}
.sidebar:hover .sidebar-menu,
.sidebar:focus-within .sidebar-menu {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--shell-accent) 34%, transparent) transparent;
}
.sidebar-menu::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.sidebar-menu::-webkit-scrollbar-track {
  background: transparent;
}
.sidebar-menu::-webkit-scrollbar-thumb {
  min-height: 48px;
  border-radius: 999px;
  background: transparent;
}
.sidebar:hover .sidebar-menu::-webkit-scrollbar-thumb,
.sidebar:focus-within .sidebar-menu::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--shell-accent) 34%, transparent);
}
.sidebar-menu::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--shell-accent) 52%, transparent);
}
.menu-loading {
  padding: 15px;
}
.app-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, var(--shell-accent-soft), transparent);
  border-left: 3px solid var(--shell-accent);
  border-radius: var(--shell-radius-sm);
}
.app-menu :deep(.el-menu-item), .app-menu :deep(.el-sub-menu__title) {
  width: 100%;
  box-sizing: border-box;
  border-radius: var(--shell-radius-sm);
  /* Element Plus submenu collapse measures height; vertical margins cause jumps. */
  height: var(--shell-menu-item-height, 44px) !important;
  min-height: var(--shell-menu-item-height, 44px) !important;
  line-height: var(--shell-menu-item-height, 44px) !important;
  margin: 0 !important;
  padding-left: var(--shell-menu-item-padding-x) !important;
  padding-right: 14px !important;
  display: flex;
  align-items: center;
  transition:
    color 150ms ease,
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease !important;
}
.app-menu :deep(.el-sub-menu),
.app-menu :deep(.el-menu--inline) {
  margin: 0 !important;
  padding: 0 !important;
}
.app-menu :deep(.el-menu--inline .el-menu-item),
.app-menu :deep(.el-menu--inline .el-sub-menu__title) {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
.app-menu :deep(.el-collapse-transition-enter-active),
.app-menu :deep(.el-collapse-transition-leave-active) {
  transition-property: height !important;
}
.app-menu :deep(.el-menu-item .el-icon),
.app-menu :deep(.el-sub-menu__title .el-icon) {
  width: var(--shell-menu-icon-size);
  min-width: var(--shell-menu-icon-size);
  margin-right: 8px;
  font-size: var(--shell-menu-icon-size);
}
.app-menu :deep(.el-sub-menu__icon-arrow) {
  right: 14px;
}
.app-menu :deep(.el-menu-item:hover), .app-menu :deep(.el-sub-menu__title:hover) {
  background-color: var(--shell-control-hover-bg) !important;
}
/* 二级菜单项增加左侧缩进 */
.app-menu :deep(.el-sub-menu .el-menu-item) {
  padding-left: 25px !important;
}
/* 三级菜单项（如果有）增加更多缩进 */
.app-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item) {
  padding-left: 45px !important;
}
/* ===== 二级子菜单视觉区分样式 ===== */
/* 二级子菜单标题样式 - 区分于一级菜单 */
.app-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title) {
  font-size: 13px !important;
  padding-left: 20px !important;
  position: relative;
  background: linear-gradient(90deg, color-mix(in srgb, var(--shell-accent) 4%, transparent), transparent) !important;
}
/* 二级子菜单标题左侧指示条 */
.app-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title)::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  background: linear-gradient(180deg, var(--shell-accent), color-mix(in srgb, var(--shell-accent) 30%, transparent));
  border-radius: 2px;
}
/* 二级子菜单图标更小 */
.app-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title .el-icon) {
  font-size: 14px !important;
  margin-right: 6px;
  opacity: 0.85;
}
/* 二级子菜单展开箭头更小 */
.app-menu :deep(.el-sub-menu .el-sub-menu > .el-sub-menu__title .el-sub-menu__icon-arrow) {
  font-size: 10px !important;
}
/* 三级菜单项（二级子菜单的子项）样式 */
.app-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item) {
  font-size: 12.5px !important;
}
.app-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item .el-icon) {
  font-size: 13px !important;
}
/* 三级菜单项激活状态 */
.app-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item.is-active) {
  color: var(--shell-accent) !important;
  font-weight: 500;
}
.app-menu :deep(.el-sub-menu .el-sub-menu .el-menu-item.is-active .el-icon) {
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
  border-radius: var(--shell-radius-lg);
}
.app-header {
  background: var(--shell-surface) !important;
  border: 1px solid var(--shell-border) !important;
  box-shadow: var(--shell-shadow) !important;
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
  border-radius: var(--shell-radius-md);
  cursor: pointer;
  color: var(--el-text-color-primary);
  background: var(--shell-control-bg);
  border: 1px solid var(--shell-control-border);
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}
.icon-button:hover,
.icon-button-wrapper :deep(.notification-bell:hover),
.icon-button-wrapper :deep(.theme-selector:hover) {
  color: var(--shell-accent);
  background: var(--shell-control-hover-bg);
  border-color: var(--shell-accent);
  box-shadow: var(--shell-control-hover-shadow);
}
.icon-button:active {
  transform: none;
}
.toggle-sidebar {
  font-size: 20px;
}
.toggle-sidebar:hover .el-icon {
  transform: none;
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
  background: var(--shell-control-bg);
  border: 1px solid var(--shell-control-border);
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}
.user-info:hover {
  background: var(--shell-control-hover-bg);
  border-color: var(--shell-accent);
  box-shadow: var(--shell-control-hover-shadow);
}
.user-avatar {
  border: 2px solid transparent;
  background: linear-gradient(var(--color-bg-base), var(--color-bg-base)) padding-box,
              linear-gradient(90deg, var(--shell-accent), var(--shell-accent-strong)) border-box;
  box-shadow: 0 0 10px var(--shell-glow);
}
.username {
  margin-left: 8px;
  font-size: 14px;
  color: var(--el-text-color-primary);
}
/* ===== 下拉菜单公共样式 ===== */
.user-dropdown,
.language-dropdown {
  background: var(--shell-surface) !important;
  border: 1px solid var(--shell-border) !important;
  box-shadow: var(--shell-shadow) !important;
  border-radius: var(--shell-radius-md) !important;
  overflow: hidden;
  padding: 6px;
}
.user-dropdown :deep(.el-dropdown-menu__item),
.language-dropdown :deep(.el-dropdown-menu__item) {
  border-radius: var(--shell-radius-sm);
  margin: 2px 0;
  padding: 8px 12px;
  transition: color 0.15s ease, background-color 0.15s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-dropdown :deep(.el-dropdown-menu__item .el-icon) {
  font-size: 16px;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.user-dropdown :deep(.el-dropdown-menu__item:not(.is-disabled):hover),
.language-dropdown :deep(.el-dropdown-menu__item:hover) {
  background: linear-gradient(90deg, var(--shell-accent-soft), color-mix(in srgb, var(--shell-accent) 5%, transparent));
  color: var(--shell-accent);
}
.user-dropdown :deep(.el-dropdown-menu__item:not(.is-disabled):hover .el-icon) {
  color: var(--shell-accent);
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
  color: var(--shell-accent);
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
  background: linear-gradient(90deg, var(--shell-accent-soft), color-mix(in srgb, var(--shell-accent) 8%, transparent));
  color: var(--shell-accent);
  border-left: 3px solid var(--shell-accent);
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
/* ===== 侧边栏折叠 ===== */
.sidebar.collapsed {
  flex-basis: var(--shell-sidebar-collapsed-width);
  width: var(--shell-sidebar-collapsed-width) !important;
}
.sidebar.is-resizing :deep(*) {
  transition-property: color, background-color, border-color, box-shadow, opacity, transform !important;
}
.sidebar.is-mini .sidebar-menu {
  width: 100%;
  padding-left: 0;
  padding-right: 0;
}
.sidebar.is-mini .app-menu {
  width: 100% !important;
}
.sidebar.is-mini .app-menu :deep(.el-menu-item),
.sidebar.is-mini .app-menu :deep(.el-sub-menu__title) {
  width: 100% !important;
  min-width: 0;
  justify-content: center;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}
.sidebar.is-mini .app-menu :deep(.el-menu-item > span),
.sidebar.is-mini .app-menu :deep(.el-sub-menu__title > span) {
  width: 0;
  opacity: 0;
  visibility: hidden;
  overflow: hidden;
  transform: translateX(-4px);
}
.sidebar.is-mini .app-menu :deep(.el-sub-menu__icon-arrow) {
  display: none;
}
.sidebar.is-mini .app-menu :deep(.el-menu-tooltip__trigger) {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 0 !important;
  padding-right: 0 !important;
}
.sidebar.is-mini .app-menu :deep(.el-menu-item .el-icon),
.sidebar.is-mini .app-menu :deep(.el-sub-menu__title .el-icon) {
  width: var(--shell-menu-icon-size);
  min-width: var(--shell-menu-icon-size);
  margin: 0 !important;
}
.sidebar-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: color-mix(in srgb, var(--ds-slate) 32%, transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
/* Logo区域收起样式 */
.sidebar.is-mini .logo-container {
  padding-left: 0;
  justify-content: center;
}
.sidebar.is-mini .logo-container .title {
  width: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transform: translateX(-4px);
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
    transform: translateX(0);
    transition: transform var(--transition-base) ease;
    width: var(--shell-sidebar-expanded-width) !important;
  }

  .sidebar.collapsed {
    transform: translateX(-100%);
    width: var(--shell-sidebar-expanded-width) !important;
  }

  .header, .main-content {
    margin: 5px;
  }
}
</style>
