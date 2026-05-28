<template>
  <div
    :class="[
      'app-container',
      {
        'is-pwa-standalone': isStandalone,
        'has-tabbar': showTabbar
      }
    ]"
  >
    <ErrorBoundary ref="errorBoundaryRef" class="app-boundary">
      <main class="app-main" role="main">
        <RouterView v-slot="{ Component, route: viewRoute }">
          <KeepAlive :include="keepAlivePages">
            <component :is="Component" :key="viewRoute.path" />
          </KeepAlive>
        </RouterView>
      </main>

      <footer v-show="showTabbar" class="app-tabbar-shell" aria-label="底部导航">
        <Tabbar class="app-tabbar" route :fixed="false" :safe-area-inset-bottom="false">
          <TabbarItem name="Home" to="/" icon="home-o" replace>首页</TabbarItem>
          <TabbarItem name="Scan" to="/scan" icon="scan" replace>扫码</TabbarItem>
          <TabbarItem name="Notifications" to="/system/notifications" icon="bell" replace>通知</TabbarItem>
          <TabbarItem name="Profile" to="/profile" icon="user-o" replace>我的</TabbarItem>
        </Tabbar>
      </footer>
    </ErrorBoundary>
  </div>
</template>

<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { Tabbar, TabbarItem } from 'vant'
  import { useAuthStore } from './stores/auth'
  import { useKeyboardScroll } from './composables/useKeyboardScroll'
  import { getPwaViewportState, onPwaViewportChange } from './utils/pwaViewport'
  import ErrorBoundary from './components/ErrorBoundary.vue'

  const route = useRoute()
  const authStore = useAuthStore()
  const errorBoundaryRef = ref(null)
  const pwaState = ref(getPwaViewportState())

  const keepAlivePages = ['Home', 'Notifications']
  const tabbarRouteNames = new Set(['Home', 'Scan', 'Notifications', 'Profile'])

  const isStandalone = computed(() => pwaState.value.isStandalone)
  const showTabbar = computed(() => {
    if (!authStore.isAuthenticated) return false
    if (route.meta?.hideTabbar) return false
    if (route.meta?.showTabbar) return true
    return tabbarRouteNames.has(route.name)
  })

  let stopViewportSync = null

  useKeyboardScroll()

  onMounted(() => {
    stopViewportSync = onPwaViewportChange((nextState) => {
      pwaState.value = nextState
    })
  })

  onBeforeUnmount(() => {
    stopViewportSync?.()
  })
</script>

<style lang="scss">
  @use '@/assets/styles/variables.scss' as *;

  :root {
    --app-viewport-height: 100dvh;
    --app-shell-height: var(--app-viewport-height);
    --app-width: 100%;
    --safe-area-top: env(safe-area-inset-top, 0px);
    --safe-area-right: env(safe-area-inset-right, 0px);
    --safe-area-bottom: env(safe-area-inset-bottom, 0px);
    --safe-area-left: env(safe-area-inset-left, 0px);
    --app-shell-width: 100%;
    --app-page-x: 12px;
    --app-tabbar-height: var(--van-tabbar-height, 56px);
    --app-tabbar-border-top: 1px solid var(--van-border-color, var(--surface-border));
    --app-tabbar-background: var(--van-tabbar-background, var(--bg-secondary));
    --app-scroll-bottom-space: calc(12px + var(--safe-area-bottom));
    --app-safe-bottom-space: var(--app-scroll-bottom-space);
    --app-fixed-bottom-space: max(12px, var(--safe-area-bottom));
    --app-fixed-control-height: 68px;
    --app-fixed-control-space: calc(var(--app-fixed-control-height) + var(--safe-area-bottom));
    --app-fixed-control-padding-bottom: calc(12px + var(--safe-area-bottom));
    --app-bottom-space: var(--app-scroll-bottom-space);
  }

  html {
    width: 100%;
    height: 100%;
    min-height: -webkit-fill-available;
    background-color: var(--bg-primary);
  }

  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    min-height: 100%;
    min-height: var(--app-shell-height);
    margin: 0;
    padding: 0;
    overflow-x: hidden;
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  body {
    font-family: var(--font-sans);
    min-height: -webkit-fill-available;
    overflow: hidden;
    overscroll-behavior: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }

  #app {
    height: 100%;
    height: var(--app-shell-height);
    min-height: -webkit-fill-available;
    overflow: hidden;
    background-color: var(--bg-primary);
  }

  .app-container {
    width: 100%;
    max-width: var(--app-shell-width);
    height: 100%;
    height: var(--app-shell-height);
    min-height: 100%;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    isolation: isolate;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  .app-container.is-pwa-standalone {
    padding: 0;
  }

  .app-boundary {
    width: 100%;
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
  }

  .app-main {
    width: 100%;
    min-height: 0;
    flex: 1 1 auto;
    position: relative;
    overflow: hidden;
    overscroll-behavior-y: contain;
    background-color: var(--bg-primary);
  }

  .app-main > * {
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .page-container {
    display: flex;
    flex-direction: column;
    min-height: 0;
    position: relative;
    background-color: var(--bg-primary);
    color: var(--text-primary);
  }

  .home-page,
  .module-page,
  .universal-page,
  .universal-list-page,
  .page-container,
  .profile-page {
    min-height: 0;
  }

  .content-container {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    padding-bottom: var(--app-bottom-space);
    background-color: var(--bg-primary);
  }

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

  .profit-text {
    color: var(--color-success);
  }

  .loss-text {
    color: var(--color-error);
  }

  .app-container.has-tabbar .app-tabbar-shell {
    flex: 0 0 var(--app-tabbar-height);
    width: 100%;
    height: var(--app-tabbar-height);
    min-height: var(--app-tabbar-height);
    box-sizing: border-box;
    display: block;
    padding: 0;
    z-index: 100;
    background: var(--app-tabbar-background);
    border-top: var(--app-tabbar-border-top);
    overflow: hidden;
  }

  .app-container.has-tabbar .app-tabbar-shell::after {
    display: none;
  }

  .app-container.has-tabbar .app-tabbar {
    position: relative;
    width: 100%;
    height: var(--app-tabbar-height);
    min-height: var(--app-tabbar-height);
    box-sizing: border-box;
    display: flex;
    padding: 0;
    border: 0;
    background: transparent;
    z-index: 1;
  }

  .app-container.has-tabbar .app-tabbar .van-tabbar-item {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    height: 100%;
  }

  .app-container.has-tabbar .app-tabbar .van-tabbar-item--active {
    background: transparent;
  }

  .app-container :where(
    .page-container,
    .create-page,
    .detail-page,
    .home-page,
    .module-page,
    .universal-page,
    .universal-list-page,
    .profile-page,
    .about-page,
    .chat-page,
    .chat-container,
    .notifications-page,
    .notification-page,
    .global-search-page,
    .theme-page,
    .scroll-container,
    .main-scroll
  ) {
    box-sizing: border-box;
  }

  .app-container :where(
    .page-container,
    .create-page,
    .detail-page,
    .record-page,
    .home-page,
    .module-page,
    .universal-page,
    .universal-list-page,
    .profile-page,
    .about-page,
    .chat-page,
    .notifications-page,
    .notification-page,
    .notification-detail-page,
    .global-search-page,
    .theme-page,
    .theme-settings,
    .scan-page,
    .unified-page,
    .accounts-page,
    .customer-detail-page,
    .equipment-detail-page,
    .material-detail,
    .order-detail-page,
    .create-order-page,
    .create-plan-page,
    .create-receipt-page,
    .transfer-page,
    .transaction-page,
    .stock-page,
    .check-page,
    .report-page,
    .report-history-page,
    .tasks-page,
    .dashboard-page,
    .config-page,
    .system-page,
    .users-page,
    .traceability-page,
    .trace-detail-page
  ) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .app-container :where(
    .content-container,
    .page-body,
    .module-body,
    .main-scroll,
    .scroll-container,
    .page-content,
    .search-container,
    .content-wrapper,
    .detail-body,
    .report-body,
    .report-list,
    .conversation-list,
    .message-area,
    .contacts-list
  ) {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }

  .app-container :where(
    .about-page,
    .theme-settings,
    .create-page,
    .detail-page,
    .record-page,
    .material-detail,
    .customer-detail-page,
    .equipment-detail-page,
    .order-detail-page,
    .create-order-page,
    .create-plan-page,
    .create-receipt-page,
    .transfer-page,
    .transaction-page,
    .stock-page,
    .check-page,
    .report-page,
    .report-history-page,
    .dashboard-page,
    .config-page,
    .system-page,
    .users-page,
    .traceability-page,
    .trace-detail-page
  ) > .content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
  }
</style>
