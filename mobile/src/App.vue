<!--
/**
 * App.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div
    :class="[
      'app-container',
      { 'standalone-mode': isStandalone, 'fullscreen-active': forceFullscreen }
    ]"
  >
    <!-- 错误边界 -->
    <ErrorBoundary ref="errorBoundaryRef">
      <RouterView v-slot="{ Component, route: viewRoute }">
        <Transition :name="transitionName" mode="out-in">
          <KeepAlive :include="keepAlivePages">
            <component :is="Component" :key="viewRoute.path" />
          </KeepAlive>
        </Transition>
      </RouterView>

      <Tabbar v-show="showTabbar" route>
        <TabbarItem name="Home" to="/" icon="home-o">首页</TabbarItem>
        <TabbarItem name="Scan" to="/scan" icon="scan">扫码</TabbarItem>
        <TabbarItem name="Notifications" to="/notifications" icon="bell">通知</TabbarItem>
        <TabbarItem name="Profile" to="/profile" icon="user-o">我的</TabbarItem>
      </Tabbar>

    </ErrorBoundary>
  </div>
</template>

<script setup>
  import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { Tabbar, TabbarItem } from 'vant'
  import { useAuthStore } from './stores/auth'
  import { useKeyboardScroll } from './composables/useKeyboardScroll'

  import ErrorBoundary from './components/ErrorBoundary.vue'

  const route = useRoute()
  const authStore = useAuthStore()
  const errorBoundaryRef = ref(null)

  // 路由转场动画方向
  const transitionName = ref('slide-fade')

  // 全局键盘遮挡自动滚动
  useKeyboardScroll()

  /**
   * 需要缓存的列表页组件名
   * 从详情页返回时保持列表滚动位置和数据状态
   */
  const keepAlivePages = [
    'Home',
    'Notifications'
  ]

  // 响应式状态
  const isStandalone = ref(false)
  const forceFullscreen = ref(false)

  // 局部定时器（避免污染 window 全局命名空间）
  let fullscreenRefreshTimer = null
  let visibilityChangeTimer = null

  // 检查是否是从主屏幕启动（standalone 模式）
  const checkStandaloneMode = () => {
    const isFromHomeScreen =
      window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches

    if (isFromHomeScreen) {
      localStorage.setItem('forceFullscreen', 'true')
    }

    isStandalone.value = isFromHomeScreen
    forceFullscreen.value = localStorage.getItem('forceFullscreen') === 'true'
  }



  // 计算是否显示底部导航栏
  const showTabbar = computed(() => {
    const noTabbarRoutes = ['/login', '/chat']
    if (noTabbarRoutes.includes(route.path)) {
      return false
    }
    return authStore.isAuthenticated
  })

  // 监听路由变化
  watch(
    () => route.path,
    () => {
      clearTimeout(fullscreenRefreshTimer)
      fullscreenRefreshTimer = setTimeout(() => {
        checkStandaloneMode()
      }, 300)
    },
    { immediate: true }
  )

  // 在可见性变化时重新检查状态
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      clearTimeout(visibilityChangeTimer)
      visibilityChangeTimer = setTimeout(() => {
        checkStandaloneMode()
      }, 500)
    }
  }

  // 在组件挂载时设置
  onMounted(() => {
    const isFromHomeScreen = window.navigator.standalone === true

    if (authStore.isAuthenticated || isFromHomeScreen) {
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('forceFullscreen', 'true')
    }

    checkStandaloneMode()

    // 添加可见性变化监听
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  // 在组件卸载前清理
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    clearTimeout(fullscreenRefreshTimer)
    clearTimeout(visibilityChangeTimer)
  })
</script>

<style lang="scss">
  @use '@/assets/styles/variables.scss' as *;

  html,
  body {
    margin: 0;
    padding: 0;
    height: 100% !important;
    font-family: var(--font-sans);
    background-color: var(--bg-primary);
    color: var(--text-primary);
    /* 防止iOS弹性滚动，但不阻止子容器滚动 */
    overscroll-behavior-y: none;
  }

  /* 全屏模式类 - 允许内部滚动 */
  .fullscreen-mode {
    position: fixed !important;
    width: 100% !important;
    height: 100% !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    margin: 0 !important;
    padding: 0 !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
  }

  .app-container {
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background-color: var(--bg-primary);
    color: var(--text-primary);

    /* 全屏模式下的样式调整 */
    &.standalone-mode,
    &.fullscreen-active {
      /* 适配iPhone X及以上刘海屏 */
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
  }

  // 页面通用容器
  .page-container {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    height: 100%;
    position: relative;
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  // 内容容器
  .content-container {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: calc(16px + var(--van-tabbar-height, 50px));
    background-color: var(--bg-primary);
  }

  // 卡片样式
  .card {
    background: var(--bg-secondary);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-lg);
    margin: 16px;
    overflow: hidden;
    box-shadow: none;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--glass-border);
    font-weight: bold;
  }

  .card-content {
    padding: 16px;
  }

  // 辅助类
  .text-center {
    text-align: center;
  }

  .flex {
    display: flex;
  }

  .justify-between {
    justify-content: space-between;
  }

  .align-center {
    align-items: center;
  }

  .p-xs {
    padding: $padding-xs;
  }

  .mt-xs {
    margin-top: $margin-xs;
  }

  // 盘盈盘亏状态颜色
  .profit-text {
    color: var(--color-success);
  }

  .loss-text {
    color: var(--color-error);
  }



  /* 顶级容器 */
  .standalone-mode {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .fullscreen-active {
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
  }

  /* ==================== 路由转场动画 ==================== */
  .slide-fade-enter-active {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .slide-fade-leave-active {
    transition: all 0.15s cubic-bezier(0.4, 0, 1, 1);
  }
  .slide-fade-enter-from {
    opacity: 0;
    transform: translateX(20px);
  }
  .slide-fade-leave-to {
    opacity: 0;
    transform: translateX(-10px);
  }

  /* ==================== 统一底部安全间距 ==================== */
  /* 所有路由页面的根容器自动追加底部间距，防止 TabBar 遮挡 */
  .app-container > .error-boundary-wrapper > div:first-child,
  .app-container > div:first-child {
    padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px));
  }
</style>
