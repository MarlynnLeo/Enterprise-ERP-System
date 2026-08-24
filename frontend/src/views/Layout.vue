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

      <nav
        class="sidebar-menu app-menu"
        :class="{ 'is-mini-menu': isSidebarMenuCollapsed }"
        aria-label="主导航"
      >
        <sidebar-menu
          v-if="dynamicMenuTree.length > 0"
          :menus="dynamicMenuTree"
          :open-chain="openMenuChain"
          :active-path="activeMenu"
          :mini="isSidebarMenuCollapsed"
          @toggle="toggleMenuBranch"
          @navigate="navigateToMenu"
        />
      </nav>
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
            <button
              type="button"
              class="icon-button toggle-sidebar"
              aria-label="展开或收起侧边栏"
              :aria-expanded="!sidebarCollapsed"
              @click="toggleSidebar"
            >
              <el-icon>
                <icon-menu />
              </el-icon>
            </button>
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
            <div class="icon-button-wrapper" aria-label="通知中心" role="button" tabindex="0">
              <NotificationCenter />
            </div>
          </el-tooltip>
          <el-dropdown trigger="click">
            <div class="user-info">
              <DecorativeAvatarFrame
                :frame="activeAvatarFrame"
                :avatar="userAvatar"
                :name="userName"
                :size="44"
                class="header-avatar-frame"
                @avatar-error="handleAvatarError"
              />
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
                  {{ $t('common.avatarEffect') }}
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import DecorativeAvatarFrame from './auth/components/DecorativeAvatarFrame.vue'
import { usePermissionStore } from '../stores/permissionStore'
import { userApi } from '../api/user'
import { resolveMenuNavigationState } from '../utils/menuNavigation'
import { DEFAULT_AVATAR_FRAME, getAvatarFrameConfig } from '../utils/avatarFrames'
import './layout.css'
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
let sidebarResizeTimer = null
let sidebarToggleFrame = 0
// 动态菜单树
const dynamicMenuTree = computed(() => permissionStore.preparedMenuTree)
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
const openMenuChain = ref([])
const isSidebarMenuCollapsed = computed(() => !isMobile.value && sidebarMini.value)
const syncRouteOpenMenus = () => {
  if (isSidebarMenuCollapsed.value) return
  openMenuChain.value = defaultOpeneds.value.slice()
}
watch(
  () => [route.path, dynamicMenuTree.value, isSidebarMenuCollapsed.value],
  syncRouteOpenMenus,
  { flush: 'post' }
)
const toggleMenuBranch = (index, parentChain = []) => {
  const current = openMenuChain.value
  const position = current.indexOf(index)
  openMenuChain.value = position >= 0 ? current.slice(0, position) : [...parentChain, index]
}
const navigateToMenu = (path) => {
  if (path && path !== route.path) router.push(path).catch(() => {})
}

// 用户信息
const userName = computed(() => {
  return authStore.user?.realName || authStore.realName || '用户'
})
const userAvatar = computed(() => {
  return authStore.user?.avatar || ''
})
const activeAvatarFrame = computed(() => {
  return getAvatarFrameConfig(authStore.user?.avatarFrame, DEFAULT_AVATAR_FRAME)
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
  sidebarCollapsed.value = true
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
  }).then(async () => {
    try {
      await authStore.logout()
    } finally {
      // 硬跳转，确保内存缓存与 SPA 状态彻底重置
      window.location.replace('/login')
    }
    ElMessage.success(t('message.logoutSuccess'))
  }).catch(() => {})
}
// 路由变化时只补展开当前路径的父菜单，避免重建菜单导致滚动位置丢失。
// 确保在组件挂载时加载用户信息和权限
onMounted(async () => {
  syncMobileLayout()
  window.addEventListener('resize', syncMobileLayout)

  // 权限与用户信息已由路由守卫统一预加载，此处仅按需挂载动态菜单
  await loadDynamicMenus()
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobileLayout)
  clearSidebarToggleSchedule()
})
</script>
<style scoped>
/* 样式已抽取到 layout.css */
</style>
