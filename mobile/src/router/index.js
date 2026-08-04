/**
 * index.js
 * @description 应用程序路由 — 支持权限控制
 * @date 2025-08-27
 * @version 2.1.0 — 路由定义拆分为模块文件，路由守卫和权限逻辑保留在此
 */

import { createRouter, createWebHistory } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { loadThemeFromServer } from '@/composables/useTheme'

// ==================== 导入路由模块 ====================
import { commonRoutes } from './modules/common'
import { productionRoutes } from './modules/production'
import { baseDataRoutes } from './modules/baseData'
import { inventoryRoutes } from './modules/inventory'
import { purchaseRoutes } from './modules/purchase'
import { salesRoutes } from './modules/sales'
import { financeRoutes } from './modules/finance'
import { qualityRoutes } from './modules/quality'
import { otherRoutes } from './modules/other'

// ==================== 合并所有路由 ====================
const routes = [
  ...commonRoutes,
  ...productionRoutes,
  ...baseDataRoutes,
  ...inventoryRoutes,
  ...purchaseRoutes,
  ...salesRoutes,
  ...financeRoutes,
  ...qualityRoutes,
  ...otherRoutes
]

// ==================== 路由权限规则 ====================
const ROUTE_PERMISSION_RULES = [
  { pattern: /^\/production\/report$/, permission: 'production:reports:create' },
  { pattern: /^\/production\/report\/history$/, permission: 'production:reports:view' },
  {
    pattern: /^\/production\/dashboard$/,
    permission: ['production:data-view', 'production:plans:view', 'production:tasks:view', 'production:reports:view']
  },
  { pattern: /^\/production\/plans\/create$/, permission: 'production:plans:create' },
  { pattern: /^\/production\/plans(\/:id)?$/, permission: 'production:plans:view' },
  { pattern: /^\/production\/tasks\/create$/, permission: 'production:tasks:create' },
  { pattern: /^\/production\/tasks\/:id\/report$/, permission: 'production:tasks:update' },
  { pattern: /^\/production\/tasks(\/:id)?$/, permission: 'production:tasks:view' },
  { pattern: /^\/tasks(\/:id)?$/, permission: 'production:tasks:view' },
  { pattern: /^\/basedata\/materials\/create$/, permission: 'basedata:materials:create' },
  { pattern: /^\/basedata\/materials\/:id\/edit$/, permission: 'basedata:materials:update' },
  { pattern: /^\/basedata\/materials(\/:id)?$/, permission: 'basedata:materials:view' },
  { pattern: /^\/basedata\/boms(\/.*)?$/, permission: 'basedata:boms:view' },
  { pattern: /^\/basedata\/customers\/create$/, permission: 'basedata:customers:create' },
  { pattern: /^\/basedata\/customers\/:id\/edit$/, permission: 'basedata:customers:update' },
  { pattern: /^\/basedata\/customers(\/:id)?$/, permission: 'basedata:customers:view' },
  { pattern: /^\/basedata\/suppliers\/create$/, permission: 'basedata:suppliers:create' },
  { pattern: /^\/basedata\/suppliers\/:id\/edit$/, permission: 'basedata:suppliers:update' },
  { pattern: /^\/basedata\/suppliers(\/:id)?$/, permission: 'basedata:suppliers:view' },
  { pattern: /^\/basedata\/categories(\/.*)?$/, permission: 'basedata:categories:view' },
  { pattern: /^\/basedata\/units(\/.*)?$/, permission: 'basedata:units:view' },
  { pattern: /^\/basedata\/locations(\/.*)?$/, permission: 'basedata:locations:view' },
  {
    pattern: /^\/basedata\/process-templates(\/.*)?$/,
    permission: ['basedata:process-templates:view', 'basedata:processtemplates:view']
  },
  { pattern: /^\/inventory\/stock$/, permission: 'inventory:stock:view' },
  { pattern: /^\/inventory\/inbound\/create$/, permission: 'inventory:inbound:create' },
  { pattern: /^\/inventory\/inbound(\/:id)?$/, permission: 'inventory:inbound:view' },
  { pattern: /^\/inventory\/outbound\/create$/, permission: 'inventory:outbound:create' },
  { pattern: /^\/inventory\/outbound(\/:id)?$/, permission: 'inventory:outbound:view' },
  { pattern: /^\/inventory\/transfer\/create$/, permission: 'inventory:transfer:create' },
  { pattern: /^\/inventory\/transfer(\/:id)?$/, permission: 'inventory:transfer:view' },
  { pattern: /^\/inventory\/check\/new$/, permission: 'inventory:check:create' },
  { pattern: /^\/inventory\/check\/:id\/edit$/, permission: 'inventory:check:update' },
  { pattern: /^\/inventory\/check(\/:id)?$/, permission: 'inventory:check:view' },
  { pattern: /^\/inventory\/report$/, permission: 'inventory:report:view' },
  { pattern: /^\/inventory\/transaction$/, permission: 'inventory:transactions:view' },
  { pattern: /^\/purchase\/requisitions\/(create|new)$/, permission: 'purchase:requisitions:create' },
  { pattern: /^\/purchase\/requisitions(\/:id)?$/, permission: 'purchase:requisitions:view' },
  { pattern: /^\/purchase\/orders\/(create|new)$/, permission: 'purchase:orders:create' },
  { pattern: /^\/purchase\/orders\/:id\/edit$/, permission: 'purchase:orders:update' },
  { pattern: /^\/purchase\/orders(\/:id)?$/, permission: 'purchase:orders:view' },
  { pattern: /^\/purchase\/receipts\/create$/, permission: 'purchase:receipts:create' },
  { pattern: /^\/purchase\/receipts(\/:id)?$/, permission: 'purchase:receipts:view' },
  { pattern: /^\/purchase\/returns(\/:id)?$/, permission: 'purchase:returns:view' },
  { pattern: /^\/purchase\/processing(\/:id)?$/, permission: 'purchase:processing:view' },
  { pattern: /^\/purchase\/processing-receipts(\/:id)?$/, permission: 'purchase:processing-receipts:view' },
  { pattern: /^\/sales\/orders\/create$/, permission: 'sales:orders:create' },
  { pattern: /^\/sales\/orders(\/:id)?$/, permission: 'sales:orders:view' },
  { pattern: /^\/sales\/outbound\/new$/, permission: 'sales:outbound:create' },
  { pattern: /^\/sales\/outbound(\/:id)?$/, permission: 'sales:outbound:view' },
  { pattern: /^\/sales\/returns(\/:id)?$/, permission: 'sales:returns:view' },
  { pattern: /^\/sales\/exchanges(\/:id)?$/, permission: 'sales:exchanges:view' },
  { pattern: /^\/sales\/quotations(\/:id)?$/, permission: 'sales:quotations:view' },
  { pattern: /^\/sales\/customers(\/:id)?$/, permission: 'basedata:customers:view' },
  { pattern: /^\/finance\/gl\/accounts(\/:id)?$/, permission: 'finance:accounts:view' },
  { pattern: /^\/finance\/gl\/entries(\/:id)?$/, permission: 'finance:entries:view' },
  { pattern: /^\/finance\/ar\/aging(\/:id)?$/, permission: 'finance:reports:view' },
  { pattern: /^\/finance\/ar\/receipts\/create$/, permission: 'finance:ar:receive' },
  { pattern: /^\/finance\/ar\/(invoices|receipts)(\/:id)?$/, permission: 'finance:ar:view' },
  { pattern: /^\/finance\/ap\/aging(\/:id)?$/, permission: 'finance:reports:view' },
  { pattern: /^\/finance\/ap\/payments\/create$/, permission: 'finance:ap:pay' },
  { pattern: /^\/finance\/ap\/(invoices|payments)(\/:id)?$/, permission: 'finance:ap:view' },
  { pattern: /^\/finance\/assets(\/.*)?$/, permission: 'finance:assets:view' },
  { pattern: /^\/finance\/cash\/accounts(\/:id)?$/, permission: 'finance:cash:view' },
  { pattern: /^\/finance\/cash\/(transactions|cash-transactions)\/create$/, permission: 'finance:cash:create' },
  { pattern: /^\/finance\/cash\/(transactions|bank-transactions|cash-transactions)(\/.*)?$/, permission: 'finance:cash:view' },
  { pattern: /^\/finance\/cash\/reconciliation(\/.*)?$/, permission: 'finance:cash:reconcile' },
  { pattern: /^\/finance\/.*reports?/, permission: 'finance:reports:view' },
  { pattern: /^\/quality\/(incoming|process|final)\/create$/, permission: 'quality:inspections:create' },
  { pattern: /^\/quality\/(incoming|process|final)\/:id\/inspect$/, permission: 'quality:inspections:update' },
  { pattern: /^\/quality\/(incoming|process|final)(\/:id)?$/, permission: 'quality:inspections:view' },
  { pattern: /^\/quality\/templates(\/.*)?$/, permission: 'quality:templates:view' },
  { pattern: /^\/quality\/traceability(\/.*)?$/, permission: 'quality:traceability:view' },
  { pattern: /^\/quality\/nonconformance(\/.*)?$/, permission: 'quality:nonconforming:view' },
  { pattern: /^\/quality\/reports\/.*$/, permission: 'quality:reports:view' },
  { pattern: /^\/quality\/standards(\/.*)?$/, permission: 'quality:aql:view' },
  { pattern: /^\/quality(\/.*)?$/, permission: 'quality' },
  { pattern: /^\/equipment\/create$/, permission: 'production:equipment:create' },
  { pattern: /^\/equipment\/maintenance\/create$/, permission: 'production:equipment:update' },
  { pattern: /^\/equipment\/(check|repair)\/create$/, permission: 'production:equipment:update' },
  { pattern: /^\/equipment(\/.*)?$/, permission: 'production:equipment:view' },
  { pattern: /^\/hr\/employees\/create$/, permission: 'hr:employees:create' },
  { pattern: /^\/hr\/employees(\/:id)?$/, permission: 'hr:employees' },
  { pattern: /^\/hr\/departments(\/.*)?$/, permission: 'system:departments' },
  { pattern: /^\/hr\/attendance\/manual$/, permission: 'hr:attendance:create' },
  { pattern: /^\/hr\/(leave|overtime)\/create$/, permission: 'hr:attendance:create' },
  { pattern: /^\/hr\/(attendance|leave|overtime|schedule)(\/.*)?$/, permission: 'hr:attendance' },
  { pattern: /^\/hr(\/.*)?$/, permission: 'hr' },
  { pattern: /^\/system\/users\/create$/, permission: 'system:users:create' },
  { pattern: /^\/system\/users(\/:id)?$/, permission: 'system:users' },
  { pattern: /^\/system\/departments(\/.*)?$/, permission: 'system:departments' },
  { pattern: /^\/system\/hierarchy$/, permission: 'system:departments' },
  { pattern: /^\/system\/(positions|sessions)$/, permission: 'system:users' },
  { pattern: /^\/system\/(roles|permissions|access-control)(\/.*)?$/, permission: 'system:permissions' },
  { pattern: /^\/system\/(config|profiles)$/, permission: 'system:settings:read' },
  { pattern: /^\/system\/logs(\/:id)?$/, permission: 'system:logs' },
  { pattern: /^\/system\/maintenance$/, permission: 'system:logs' },
  { pattern: /^\/system\/backup$/, permission: 'system:backup:view' }
]

const applyEnterpriseRoutePermissions = (routeList) => {
  routeList.forEach((route) => {
    if (route.meta?.permission) {
      const matchedRule = ROUTE_PERMISSION_RULES.find((rule) => rule.pattern.test(route.path))
      if (matchedRule) {
        route.meta.permission = matchedRule.permission
      }
    }
  })
}

applyEnterpriseRoutePermissions(routes)

const router = createRouter({
  history: createWebHistory(),
  routes,
  /**
   * 滚动位置恢复
   * - 按返回键 → 恢复之前的滚动位置
   * - 正常导航 → 滚动到页面顶部
   * - 带 hash → 滚动到锚点
   */
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return { el: to.hash }
    }
    return { top: 0 }
  }
})

const CHUNK_RELOAD_KEY = 'router_chunk_reload_attempted_v2'
const isChunkLoadError = (error) => {
  const message = String(error?.message || error || '')
  return error?.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk/i.test(message)
}

router.onError((error) => {
  if (!isChunkLoadError(error)) return
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return

  sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true')
  window.location.reload()
})

// W-27: 权限刷新节流 — 5 分钟内不重复刷新
let lastPermissionRefreshTime = 0
const PERMISSION_REFRESH_THROTTLE_MS = 5 * 60 * 1000

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `${to.meta.title} - ERP移动版` : 'ERP移动版'

  const authStore = useAuthStore()
  let isAuthenticated = authStore.isAuthenticated

  // 如果有登录标记但用户数据为空（浏览器重启后），尝试用 cookie 恢复会话
  if (isAuthenticated && !authStore.profileLoaded) {
    isAuthenticated = await authStore.fetchUserProfile()
    if (!isAuthenticated) {
      // cookie 已过期，清除本地登录标记
      await authStore.logout()
    }
  }

  // 如果仍未认证，再尝试一次 fetchUserProfile（可能是新标签打开）
  if (!isAuthenticated && !to.meta.allowGuest) {
    isAuthenticated = await authStore.fetchUserProfile()
  }

  if (!isAuthenticated && !to.meta.allowGuest) {
    return { name: 'Login', query: { redirect: to.fullPath } }
  }

  const themeOwner = authStore.userId || authStore.username || 'authenticated'
  if (isAuthenticated && to.name !== 'Login' && window.__mobileThemeLoadedFor !== themeOwner) {
    window.__mobileThemeLoadedFor = themeOwner
    loadThemeFromServer().catch(() => {})
  }

  if (to.meta.permission && isAuthenticated) {
    if (!authStore.permissionsLoaded) {
      try {
        await authStore.fetchUserPermissions()
        lastPermissionRefreshTime = Date.now()
      } catch (error) {
        console.error('[router] Failed to load permissions:', error)
      }
    }

    const requiredPermission = to.meta.permission
    // 与桌面对齐：精确权限 或 子权限前缀（system:users → system:users:view）
    const checkRoutePerm = (perm) => {
      if (Array.isArray(perm)) {
        return perm.some((p) => checkRoutePerm(p))
      }
      return (
        authStore.hasPermission(perm) || authStore.hasChildPermission(perm)
      )
    }

    let hasPermission = checkRoutePerm(requiredPermission)

    // W-27: 仅在距离上次刷新超过 5 分钟时才执行权限刷新
    if (!hasPermission && authStore.permissionsLoaded) {
      const now = Date.now()
      if (now - lastPermissionRefreshTime > PERMISSION_REFRESH_THROTTLE_MS) {
        try {
          await authStore.refreshPermissions()
          lastPermissionRefreshTime = now
          hasPermission = checkRoutePerm(requiredPermission)
        } catch (error) {
          console.error('[router] Failed to refresh permissions:', error)
        }
      }
    }

    if (!hasPermission) {
      showToast('您没有权限访问此页面')
      return '/'
    }
  }

  return true
})

export default router
