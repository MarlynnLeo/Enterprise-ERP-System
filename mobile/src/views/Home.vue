<!--
/**
 * Home.vue
 * @description 移动端首页 - KACON 工业风格
 * @date 2025-12-27
 * @version 4.0.0
 */
-->
<template>
  <div class="home-page">
    <!-- KACON 品牌 Header -->
    <header class="kacon-header">
      <div class="header-left" @click="navigateTo('/profile')">
        <div class="kacon-logo">
          <span class="logo-letter">K</span>
        </div>
        <div class="header-brand">
          <div class="brand-row">
            <h1 class="brand-name">KACON</h1>
            <span class="brand-tag">ERP</span>
          </div>
          <p class="brand-sub">Industrial OS v4.2</p>
        </div>
      </div>
      <div class="header-right">
        <button class="header-icon-btn" @click="handleNotification">
          <BellIcon class="hi-header" />
          <span v-if="notificationCount" class="header-badge"></span>
        </button>
        <div class="header-avatar" @click="navigateTo('/profile')">
          <img v-if="userAvatar" :src="userAvatar" alt="头像" class="avatar-img" />
          <UserIcon v-else class="hi-avatar" />
        </div>
      </div>
    </header>

    <!-- 可滚动主内容 -->
    <main class="main-scroll">
      <!-- 品牌数据看板 -->
      <div class="dashboard-card">
        <div class="dashboard-bg-icon">
          <BuildingOffice2Icon class="bg-factory" />
        </div>
        <div class="dashboard-content">
          <div class="dashboard-head">
            <div>
              <p class="dashboard-label">Real-time Dashboard</p>
              <h2 class="dashboard-title">数据运行概览</h2>
            </div>
            <div class="dashboard-icon-wrap">
              <ChartBarIcon class="hi-dashboard" />
            </div>
          </div>
          <div class="stats-grid-3">
            <div v-for="(stat, i) in dashboardStats" :key="i" class="stat-cell">
              <p class="stat-cell-label">{{ stat.label }}</p>
              <div class="stat-cell-value-row">
                <span class="stat-cell-value" :class="{ loading: stat.value === '--' }">{{
                  stat.value
                }}</span>
                <span v-if="stat.trend" class="stat-trend">{{ stat.trend }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 核心业务功能矩阵 -->
      <section class="section">
        <div class="section-head">
          <div class="section-title-row">
            <div class="title-accent"></div>
            <h2 class="section-label">核心业务 / CORE</h2>
          </div>
          <button class="toggle-btn" @click="showAllModules = !showAllModules">
            <span>{{ showAllModules ? '收起' : '全部' }}</span>
            <ChevronDownIcon class="hi-xs" :class="{ rotated: showAllModules }" />
          </button>
        </div>
        <div class="module-grid" :class="{ expanded: showAllModules }">
          <button
            v-for="menu in displayedMenus"
            :key="menu.title"
            class="module-btn"
            @click="navigateTo(menu.path)"
          >
            <div class="module-icon-box" :class="menu.colorClass">
              <component :is="menu.icon" class="hi-mod" />
            </div>
            <span class="module-label">{{ menu.title }}</span>
          </button>
        </div>
      </section>

      <!-- 实时监控列表 -->
      <section class="section section-last">
        <div class="section-head">
          <h2 class="section-label flex-label">
            <BoltIcon class="hi-bolt" />
            快捷操作
          </h2>
          <span class="sync-tag">QUICK ACCESS</span>
        </div>
        <div class="monitor-list">
          <div
            v-for="action in quickActions"
            :key="action.title"
            class="monitor-card"
            @click="navigateTo(action.path)"
          >
            <div class="monitor-left">
              <div class="status-dot-wrap">
                <div class="status-dot running"></div>
                <div class="status-dot-ping"></div>
              </div>
              <div class="monitor-info">
                <h3 class="monitor-name">{{ action.title }}</h3>
                <p class="monitor-desc">{{ action.desc }}</p>
              </div>
            </div>
            <div class="monitor-right">
              <span class="monitor-id">{{ action.tag }}</span>
              <ChevronRightIcon class="hi-chevron" />
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 悬浮扫码按钮 -->

  </div>
</template>

<script setup>
  // KeepAlive 需要组件名称
  defineOptions({ name: 'Home' })

  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import { inventoryApi, productionApi, salesApi, systemApi } from '@/services/api'

  import {
    BellIcon,
    UserIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ChartBarIcon,
    BuildingOffice2Icon,
    BoltIcon,
    // 功能模块图标
    WrenchScrewdriverIcon,
    CurrencyDollarIcon,
    ShoppingCartIcon,
    ArchiveBoxIcon,
    ShieldCheckIcon,
    UserGroupIcon,
    BanknotesIcon,
    Cog6ToothIcon,
    ClipboardDocumentListIcon,
    CircleStackIcon
  } from '@heroicons/vue/24/outline'

  const router = useRouter()
  const authStore = useAuthStore()

  const notificationCount = ref(0)
  const showAllModules = ref(false)

  // 用户头像
  const userAvatar = computed(() => authStore.user?.avatar || '')

  // 看板统计
  const dashboardStats = ref([
    { label: '库存物料', value: '--', trend: '' },
    { label: '生产任务', value: '--', trend: '' },
    { label: '待处理订单', value: '--', trend: '' }
  ])

  // 功能菜单
  const allMenus = ref([
    { title: '基础数据', path: '/baseData', colorClass: 'mod-indigo', icon: CircleStackIcon, permission: 'basedata' },
    { title: '生产管理', path: '/production', colorClass: 'mod-blue', icon: ClipboardDocumentListIcon, permission: 'production' },
    { title: '采购管理', path: '/purchase', colorClass: 'mod-purple', icon: ShoppingCartIcon, permission: 'purchase' },
    { title: '销售管理', path: '/sales', colorClass: 'mod-pink', icon: CurrencyDollarIcon, permission: 'sales' },
    { title: '库存管理', path: '/inventory', colorClass: 'mod-orange', icon: ArchiveBoxIcon, permission: 'inventory' },
    { title: '品质检验', path: '/quality', colorClass: 'mod-emerald', icon: ShieldCheckIcon, permission: 'quality' },
    { title: '财务管理', path: '/finance', colorClass: 'mod-yellow', icon: BanknotesIcon, permission: 'finance' },
    { title: '设备管理', path: '/equipment', colorClass: 'mod-amber', icon: WrenchScrewdriverIcon, permission: 'equipment' },
    { title: '人事管理', path: '/hr', colorClass: 'mod-teal', icon: UserGroupIcon, permission: 'hr' },
    { title: '系统设置', path: '/system', colorClass: 'mod-gray', icon: Cog6ToothIcon, permission: 'system' }
  ])

  // 过滤后的可用菜单
  const availableMenus = computed(() => {
    return allMenus.value.filter(menu => authStore.hasPermission(menu.permission))
  })

  // 控制显示的菜单（展开/折叠）
  const displayedMenus = computed(() =>
    showAllModules.value ? availableMenus.value : availableMenus.value.slice(0, 8)
  )

  // 快捷操作
  const quickActionsConfig = ref([
    { title: '扫码查询', desc: '扫描二维码/条形码快速定位', path: '/scan', tag: 'SCAN', permission: '*' },
    { title: '库存查询', desc: '查看物料实时库存与批次', path: '/inventory/stock', tag: 'INV', permission: 'inventory' },
    { title: '生产任务', desc: '查看和管理生产任务进度', path: '/production/tasks', tag: 'PROD', permission: 'production' }
  ])

  // 过滤后的快捷操作
  const quickActions = computed(() => {
    return quickActionsConfig.value.filter(action => authStore.hasPermission(action.permission))
  })

  const navigateTo = (path) => router.push(path)
  const handleNotification = () => router.push('/notifications')

  const loadHomeStats = async () => {
    try {
      const results = await Promise.allSettled([
        inventoryApi.getInventoryStock({ page: 1, pageSize: 1 }),
        productionApi.getDashboardStatistics(),
        salesApi.getSalesStatistics()
      ])
      if (results[0].status === 'fulfilled') {
        const d = results[0].value.data
        dashboardStats.value[0].value = String(d?.total || d?.totalCount || d?.length || 0)
        dashboardStats.value[0].trend = '↑'
      }
      if (results[1].status === 'fulfilled') {
        const d = results[1].value.data
        dashboardStats.value[1].value = String(d?.tasks?.in_progress || 0)
      }
      if (results[2].status === 'fulfilled') {
        const d = results[2].value.data
        dashboardStats.value[2].value = String(d?.pending_orders || 0)
      }
    } catch {
      /* 静默 */
    }
  }

  onMounted(async () => {
    if (authStore.isAuthenticated && authStore.token) {
      // 确保权限数据已加载（首页菜单过滤依赖此数据）
      if (!authStore.permissionsLoaded) {
        try {
          await authStore.fetchUserPermissions()
        } catch (e) {
          console.warn('[Home] 加载权限失败:', e.message)
        }
      }
      authStore.fetchUserProfile().catch(() => {})
      loadHomeStats()
      // 加载未读通知数
      systemApi.getUnreadCount().then(res => {
        notificationCount.value = res.data?.count || res.data || 0
      }).catch(() => {})
    }
  })
</script>

<style lang="scss" scoped>
  /* ==============================
   KACON 工业配色方案
   主色: #3C4858 (深灰蓝)
   强调: #67C1D9 (青色)
   背景: #F4F7FA (浅灰白)
   ============================== */

  .home-page {
    flex: 1;
    background: var(--bg-primary);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* ==============================
   KACON Header
   ============================== */
  .kacon-header {
    background: var(--bg-secondary);
    padding: 12px 20px;
    margin: 20px 20px 0 20px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid var(--van-border-color);
    box-shadow: none;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .kacon-logo {
    width: 44px;
    height: 44px;
    background: var(--color-accent);
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: none;
    transform: rotate(-2deg);
    transition: transform 0.2s;
  }

  .kacon-logo:active {
    transform: rotate(0deg);
  }

  .logo-letter {
    color: var(--color-brand);
    font-weight: 900;
    font-size: 1.5rem;
    font-style: italic;
    line-height: 1;
    margin-left: 2px;
  }

  .header-brand {
    display: flex;
    flex-direction: column;
  }

  .brand-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .brand-name {
    font-size: 1.25rem;
    font-weight: 900;
    letter-spacing: -0.05em;
    color: var(--text-primary);
    font-style: italic;
    margin: 0;
  }

  .brand-tag {
    font-size: 0.625rem;
    font-weight: 900;
    color: var(--color-accent);
    background: rgba(103, 193, 217, 0.1);
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid rgba(103, 193, 217, 0.2);
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }

  .brand-sub {
    font-size: 0.5625rem;
    color: var(--text-secondary);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.3em;
    margin: 2px 0 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .header-icon-btn {
    position: relative;
    padding: 10px;  /* 确保触摸目标 >= 44x44pt */
    margin: -6px;   /* 补偿视觉间距 */
    background: none;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    transition: transform 0.2s;
    -webkit-tap-highlight-color: transparent;
  }

  .header-icon-btn:active {
    transform: scale(0.9);
  }

  .hi-header {
    width: 24px;
    height: 24px;
  }

  .header-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 10px;
    height: 10px;
    background: var(--color-error);
    border-radius: 50%;
    border: 2px solid var(--bg-header);
  }

  .header-avatar {
    width: 40px;
    height: 40px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 2px;
    cursor: pointer;
    transition: transform 0.2s;
    -webkit-tap-highlight-color: transparent;
  }

  .header-avatar:active {
    transform: scale(0.9);
  }

  .header-avatar > .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 14px;
  }

  .header-avatar > .hi-avatar {
    width: 100%;
    height: 100%;
    padding: 6px;
    color: var(--color-accent);
    background: rgba(103, 193, 217, 0.1);
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  /* ==============================
   主滚动区域
   ============================== */
  .main-scroll {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 20px;
    padding-bottom: calc(var(--van-tabbar-height, 50px) + 24px);
  }

  /* ==============================
   数据看板卡片
   ============================== */
  .dashboard-card {
    background: var(--bg-secondary);
    padding: 20px 24px;
    border-radius: 16px;
    box-shadow: none;
    position: relative;
    overflow: hidden;
    border: 1px solid var(--van-border-color);
    margin-bottom: 24px;
  }

  .dashboard-bg-icon {
    position: absolute;
    right: -10%;
    top: -10%;
    opacity: 0.06;
    transform: rotate(12deg);
  }

  .bg-factory {
    width: 160px;
    height: 160px;
    color: var(--color-accent);
  }

  .dashboard-content {
    position: relative;
    z-index: 1;
  }

  .dashboard-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
  }

  .dashboard-label {
    color: var(--color-accent);
    font-size: 0.6875rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    margin: 0;
  }

  .dashboard-title {
    color: var(--text-primary);
    font-size: 1.375rem;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -0.05em;
    margin: 4px 0 0;
  }

  .dashboard-icon-wrap {
    background: rgba(103, 193, 217, 0.2);
    padding: 10px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(8px);
  }

  .hi-dashboard {
    width: 20px;
    height: 20px;
    color: var(--color-accent);
  }

  .stats-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .stat-cell {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 12px;
    border-radius: 12px;
    min-height: 44px;   /* 确保触摸目标最小高度 */
  }

  .stat-cell-label {
    color: var(--text-secondary);
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    margin: 0 0 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stat-cell-value-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .stat-cell-value {
    color: var(--text-primary);
    font-size: 1.25rem;
    font-weight: 900;
    font-style: italic;
    line-height: 1;
  }

  .stat-cell-value.loading {
    color: var(--text-disabled);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .stat-trend {
    font-size: 0.625rem;
    color: var(--color-success);
    font-weight: 700;
  }

  /* ==============================
   Section 通用
   ============================== */
  .section {
    margin-bottom: 24px;
  }

  .section-last {
    padding-bottom: 16px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding: 0 4px;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .title-accent {
    width: 5px;
    height: 16px;
    background: var(--color-accent);
    border-radius: 3px;
  }

  .section-label {
    font-size: 0.75rem;
    font-weight: 900;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin: 0;
  }

  .flex-label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hi-bolt {
    width: 14px;
    height: 14px;
    color: var(--color-accent);
  }

  .sync-tag {
    font-size: 0.625rem;
    font-weight: 700;
    color: var(--text-disabled);
    letter-spacing: 0.05em;
  }

  .toggle-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-accent);
    background: none;
    border: none;
    cursor: pointer;
    padding: 10px 12px;  /* 确保触摸目标 >= 44x44pt */
    margin: -6px -4px;   /* 补偿视觉间距 */
    min-height: 44px;
    border-radius: 8px;
    transition: all 0.2s;
    -webkit-tap-highlight-color: transparent;
  }

  .toggle-btn:active {
    background: rgba(103, 193, 217, 0.1);
  }

  .hi-xs {
    width: 14px;
    height: 14px;
    transition: transform 0.3s;
  }

  .hi-xs.rotated {
    transform: rotate(180deg);
  }

  /* ==============================
   功能矩阵
   ============================== */
  .module-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px 8px;
    overflow: hidden;
    transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    max-height: 200px;
  }

  .module-grid.expanded {
    max-height: 500px;
  }

  .module-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: transform 0.15s;
    padding: 6px 4px;   /* 扩大整体触摸区域 */
    min-width: 64px;    /* 确保按钮最小宽度 */
    border-radius: 12px;
  }

  .module-btn:active {
    transform: scale(0.9);
  }

  .module-icon-box {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: none;
    border: 1px solid var(--van-border-color);
  }

  .hi-mod {
    width: 24px;
    height: 24px;
    stroke-width: 2;
  }

  .module-label {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  /* 模块配色 */
  .mod-blue {
    background: var(--bg-secondary);
    color: var(--color-info);
  }
  .mod-cyan {
    background: var(--bg-secondary);
    color: var(--color-primary);
  }
  .mod-indigo {
    background: var(--bg-secondary);
    color: var(--color-info);
  }
  .mod-emerald {
    background: var(--bg-secondary);
    color: var(--color-success);
  }
  .mod-orange {
    background: var(--bg-secondary);
    color: var(--color-warning);
  }
  .mod-purple {
    background: var(--bg-secondary);
    color: var(--color-info);
  }
  .mod-pink {
    background: var(--bg-secondary);
    color: var(--color-error);
  }
  .mod-teal {
    background: var(--bg-secondary);
    color: var(--color-primary);
  }
  .mod-amber {
    background: var(--bg-secondary);
    color: var(--color-warning);
  }
  .mod-yellow {
    background: var(--bg-secondary);
    color: var(--color-warning);
  }
  .mod-slate {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  .mod-gray {
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
  }

  /* ==============================
   监控/快捷列表
   ============================== */
  .monitor-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .monitor-card {
    background: var(--bg-secondary);
    border: 1px solid var(--glass-border);
    padding: 16px;
    border-radius: 14px;
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .monitor-card:active {
    background: var(--bg-primary);
    transform: scale(0.98);
  }

  .monitor-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .status-dot-wrap {
    position: relative;
    width: 10px;
    height: 10px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .status-dot.running {
    background: var(--color-success);
  }

  .status-dot-ping {
    position: absolute;
    inset: 0;
    background: var(--color-success);
    border-radius: 50%;
    animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
    opacity: 0.4;
  }

  @keyframes ping {
    75%,
    100% {
      transform: scale(2);
      opacity: 0;
    }
  }

  .monitor-info {
    display: flex;
    flex-direction: column;
  }

  .monitor-name {
    font-size: 0.875rem;
    font-weight: 900;
    color: var(--text-primary);
    letter-spacing: -0.02em;
    margin: 0;
  }

  .monitor-desc {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-weight: 500;
    margin: 2px 0 0;
  }

  .monitor-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .monitor-id {
    font-size: 0.625rem;
    font-weight: 900;
    color: var(--text-tertiary);
    font-family: ui-monospace, monospace;
    background: var(--bg-tertiary);
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--glass-border);
    letter-spacing: 0.05em;
  }

  .hi-chevron {
    width: 16px;
    height: 16px;
    color: var(--text-disabled);
  }

  /* ==============================
   悬浮扫码 FAB
   ============================== */
  .fab-scan {
    position: fixed;
    bottom: calc(var(--van-tabbar-height, 50px) + 24px);
    right: 20px;
    width: 56px;
    height: 56px;
    background: var(--color-accent);
    border-radius: 16px;
    box-shadow: none;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-brand);
    border: 4px solid var(--bg-secondary);
    cursor: pointer;
    z-index: 40;
    transition: all 0.2s;
    -webkit-tap-highlight-color: transparent;
  }

  .fab-scan:active {
    transform: scale(0.9) rotate(3deg);
  }

  .hi-fab {
    width: 28px;
    height: 28px;
    stroke-width: 2.5;
  }

  .fab-badge {
    position: absolute;
    top: -2px;
    right: -2px;
    width: 14px;
    height: 14px;
    background: var(--color-error);
    border-radius: 50%;
    border: 2px solid var(--bg-secondary);
    animation: bounce-sm 2s infinite;
  }

  @keyframes bounce-sm {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }
</style>
