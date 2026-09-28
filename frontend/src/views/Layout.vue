<!--
/**
 * Layout.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-container class="layout-container app-shell" :class="{ 'workspace-layout': isWorkspace }">
    <ElFocusTrap
      :trapped="mobileNavigationOpen"
      :loop="mobileNavigationOpen"
      :focus-trap-el="sidebarElement"
      @release-requested="closeSidebar"
      @focus-after-released="restoreSidebarFocus"
    >
    <WorkspaceNavigation
      v-if="isWorkspace"
      id="app-navigation"
      ref="sidebar"
      :collapsed="sidebarCollapsed"
      :mobile="isMobile"
      :role="mobileNavigationOpen ? 'dialog' : undefined"
      :aria-modal="mobileNavigationOpen ? 'true' : undefined"
      :inert="isMobile && sidebarCollapsed ? '' : undefined"
      :aria-hidden="isMobile && sidebarCollapsed ? 'true' : undefined"
      tabindex="-1"
      @expand="expandSidebar"
      @close="closeSidebar"
      @navigate="navigateToMenu"
    />
    <!-- 侧边栏 -->
    <el-aside
      v-else
      id="app-navigation"
      ref="sidebar"
      width="220px"
      :role="mobileNavigationOpen ? 'dialog' : undefined"
      :aria-label="t('workspaceNavigation.mainNavigation')"
      :aria-modal="mobileNavigationOpen ? 'true' : undefined"
      :inert="isMobile && sidebarCollapsed ? '' : undefined"
      :aria-hidden="isMobile && sidebarCollapsed ? 'true' : undefined"
      tabindex="-1"
      class="sidebar app-sidebar"
      :class="{
        collapsed: sidebarCollapsed,
        'is-mini': isSidebarMenuCollapsed
      }"
    >
      <div class="logo-container">
        <img src="../assets/logo.svg" alt="Logo" class="logo">
        <h1 class="title app-title">{{ $t('system.title') }}</h1>
      </div>

      <nav
        class="sidebar-menu app-menu"
        :class="{ 'is-mini-menu': isSidebarMenuCollapsed }"
        :aria-label="t('workspaceNavigation.mainNavigation')"
      >
        <sidebar-menu
          v-if="dynamicMenuTree.length > 0"
          :menus="dynamicMenuTree"
          :open-chain="defaultOpeneds"
          :active-path="activeMenu"
          :mini="isSidebarMenuCollapsed"
          @expand="expandSidebar"
          @navigate="navigateToMenu"
        />
      </nav>
    </el-aside>
    </ElFocusTrap>
    <div
      v-if="isMobile && !sidebarCollapsed"
      class="sidebar-backdrop"
      aria-hidden="true"
      @click="closeSidebar"
    ></div>
    <!-- 主内容区 -->
    <el-container class="main-container" :inert="mobileNavigationOpen ? '' : undefined">
      <!-- 头部导航 -->
      <el-header class="header app-header">
        <div class="header-left">
          <button
            type="button"
            ref="sidebarToggle"
            class="icon-button toggle-sidebar"
            :title="t('common.expandCollapseSidebar')"
            :aria-label="t('common.expandCollapseSidebar')"
            :aria-expanded="!sidebarCollapsed"
            aria-controls="app-navigation"
            @click="toggleSidebar"
          >
            <el-icon>
              <icon-menu />
            </el-icon>
          </button>
          <NavigationTabs ref="navigationTabs" v-show="isWorkspace" />
          <breadcrumb v-if="!isWorkspace" />
        </div>
        <div class="header-right">
          <!-- 菜单搜索 -->
          <MenuSearch />
          <!-- 主题选择器 -->
          <div class="icon-button-wrapper" :aria-label="t('common.themeSettings')">
            <ThemeSelector />
          </div>
          <!-- 通知中心 -->
          <div class="icon-button-wrapper" :aria-label="t('common.notificationCenter')" :title="t('common.notificationCenter')">
            <NotificationCenter />
          </div>
          <el-dropdown trigger="click" :persistent="false">
            <div class="user-info">
              <DecorativeAvatarFrame
                :frame="activeAvatarFrame"
                :avatar="userAvatar"
                :name="userName"
                :size="isWorkspace || isMobile ? 30 : 44"
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
                  <el-dropdown placement="left-start" trigger="hover" :persistent="false">
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
      <LayoutContent :tabbed="isWorkspace" />
    </el-container>
  </el-container>
</template>
<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../stores/auth'
import { useLanguageStore } from '../stores/language'
import { useThemeStore } from '../stores/theme'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import ElFocusTrap from 'element-plus/es/components/focus-trap/index'
import ThemeSelector from '../components/common/ThemeSelector.vue'
import NotificationCenter from '../components/NotificationCenter.vue'
import MenuSearch from '../components/common/MenuSearch.vue'
import SidebarMenu from '../components/layout/SidebarMenu.vue'
import Breadcrumb from '../components/layout/Breadcrumb.vue'
import LayoutContent from '../components/layout/LayoutContent.vue'
import WorkspaceNavigation from '../components/layout/WorkspaceNavigation.vue'
import NavigationTabs from '../components/layout/NavigationTabs.vue'
import DecorativeAvatarFrame from './auth/components/DecorativeAvatarFrame.vue'
import { usePermissionStore } from '../stores/permissionStore'
import { userApi } from '../api/user'
import { useWorkspaceMenus } from '../composables/useWorkspaceMenus'
import { resolveMenuNavigationState } from '../utils/menuTree'
import { DEFAULT_AVATAR_FRAME, getAvatarFrameConfig } from '../utils/avatarFrames'
import './layout.css'
import './workspace-layout.css'
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
const themeStore = useThemeStore()
const isWorkspace = computed(() => themeStore.appearance.preset === 'workspace')
const isMobile = ref(window.innerWidth <= 768)
const sidebarCollapsed = ref(isMobile.value)
const sidebar = ref(null)
const sidebarToggle = ref(null)
const navigationTabs = ref(null)
const sidebarElement = computed(() => sidebar.value?.$el || sidebar.value)
const mobileNavigationOpen = computed(() => isMobile.value && !sidebarCollapsed.value)
const closeSidebar = () => { sidebarCollapsed.value = true }
const restoreSidebarFocus = async (event) => {
  event.preventDefault()
  await nextTick()
  if (isMobile.value && sidebarToggle.value?.isConnected) sidebarToggle.value.focus()
}
watch(isWorkspace, async () => {
  const focusedElement = document.activeElement
  const navigationHadFocus = sidebarElement.value?.contains(focusedElement)
    || navigationTabs.value?.$el?.contains(focusedElement)
  if (mobileNavigationOpen.value) closeSidebar()
  await nextTick()
  if (navigationHadFocus && (document.activeElement === document.body || document.activeElement === focusedElement)) {
    sidebarToggle.value?.focus()
  }
})
// 动态菜单树
const dynamicMenuTree = computed(() => permissionStore.preparedMenuTree)
useWorkspaceMenus({
  auth: authStore,
  permissionStore,
  loadMenus: async () => (await userApi.getUserMenus()).data,
  onError: (error) => {
    console.error('加载菜单失败:', error)
    ElMessage.error(t('workspaceNavigation.loadFailed'))
  }
})
const menuNavigationState = computed(() =>
  resolveMenuNavigationState(dynamicMenuTree.value, route.fullPath)
)
// 当前激活的菜单项
const activeMenu = computed(() => {
  return menuNavigationState.value.activePath || route.path
})
// 根据当前路由自动展开对应的子菜单
const defaultOpeneds = computed(() => {
  return menuNavigationState.value.openeds || []
})
const isSidebarMenuCollapsed = computed(() => !isMobile.value && sidebarCollapsed.value)
const navigateToMenu = async (path) => {
  if (!path) return
  try {
    const failure = path !== route.fullPath ? await router.push(path) : undefined
    if (!failure && isMobile.value) closeSidebar()
  } catch {
    // Router error handling reports failed imports; keep the menu available for another choice.
  }
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
const handleAvatarError = (failedAvatar) => {
  authStore.clearInvalidAvatar(failedAvatar)
}
const syncMobileLayout = () => {
  const mobile = window.innerWidth <= 768
  if (mobile === isMobile.value) return
  isMobile.value = mobile
  sidebarCollapsed.value = mobile
}
// Native menu geometry changes in a single Vue update. The old frame/timer
// sequence was needed by the removed Element Plus menu and repainted twice.
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
const expandSidebar = () => {
  if (sidebarCollapsed.value) toggleSidebar()
}
// 用户操作
const handleProfile = () => {
  router.push('/profile')
}
const handleAvatarFrame = () => {
  router.push('/profile?tab=avatar-frame')
}
// 语言切换
const switchLanguage = async (langCode) => {
  const changed = await languageStore.setLanguage(langCode)
  if (!changed) return
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
onMounted(() => {
  syncMobileLayout()
  window.addEventListener('resize', syncMobileLayout, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobileLayout)
})
</script>
<style scoped>
/* 样式已抽取到 layout.css */
</style>
