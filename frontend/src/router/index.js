/**
 * index.js
 * @description 应用程序路由配置入口
 * @date 2025-08-27
 * @version 2.0.0 — 模块化重构
 */

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { ElMessage } from 'element-plus/es/components/message/index'
import 'element-plus/es/components/message/style/css'
import { runWhenIdle } from '@/utils/performanceMode'
import i18n from '../locales'

// 导入路由模块
import basedataRoute from './modules/basedata'
import inventoryRoute from './modules/inventory'
import financeRoute from './modules/finance'
import dataoverviewRoute from './modules/dataoverview'
import salesRoute from './modules/sales'
import purchaseRoute from './modules/purchase'
import productionRoutes from './modules/production'
import qualityRoute from './modules/quality'
import systemRoute from './modules/system'
import equipmentRoute from './modules/equipment'
import hrRoute from './modules/hr'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/auth/Login.vue'),
      meta: { requiresAuth: false }
    },
    {
      path: '/diagnose',
      name: 'NetworkDiagnosis',
      component: () => import('../views/system/NetworkDiagnosis.vue'),
      meta: { requiresAuth: false, title: '客户端网络与性能体检' }
    },
    {
      path: '/diagnosis',
      redirect: '/diagnose'
    },
    {
      path: '/force-password',
      name: 'forcePassword',
      component: () => import('../views/auth/ForceChangePassword.vue'),
      meta: { requiresAuth: true, title: '修改初始密码' }
    },
    {
      path: '/production-board',
      name: 'production-board',
      component: () => import('../views/public/ProductionBoard.vue'),
      meta: {
        requiresAuth: true,
        title: '生产流程可视化看板',
        permission: 'production:data-view'
      }
    },
    {
      path: '/',
      component: () => import('../views/Layout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('../views/dashboard/Dashboard.vue'),
          meta: {
            requiresAuth: true,
            permission: 'dashboard'
          }
        },
        {
          path: 'dashboard',
          redirect: '/'
        },
        // 业务模块路由（从模块文件导入）
        basedataRoute,
        inventoryRoute,
        financeRoute,
        dataoverviewRoute,
        salesRoute,
        purchaseRoute,
        ...productionRoutes, // 生产路由是平级数组，需要展开
        qualityRoute,
        // 个人中心
        {
          path: 'profile',
          name: 'userProfile',
          component: () => import('../views/UserProfile.vue'),
          meta: {
            requiresAuth: true,
            title: '个人中心'
          },
          beforeEnter: async () => {
            const authStore = useAuthStore()
            try {
              if (!authStore.user) {
                await authStore.fetchUserProfile()
              }
            } catch (error) {
              console.error('加载用户信息失败:', error)
              ElMessage.error('加载用户信息失败，请重新登录')
              return '/login'
            }
          }
        },
        {
          path: 'workflow/approvals',
          redirect: '/system/workflow'
        },
        systemRoute,
        equipmentRoute,
        hrRoute
      ]
    },
    // 404 兜底路由显示独立错误页，保留用户当前错误路径语义
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/views/NotFound.vue'),
      meta: { requiresAuth: false }
    }
  ]
})

let authenticatedEnhancementsPromise = null

function initAuthenticatedEnhancements() {
  if (authenticatedEnhancementsPromise) return authenticatedEnhancementsPromise

  authenticatedEnhancementsPromise = Promise.all([
    import('@/plugins/operationColumnAutoWidth').then(({ initOperationColumnAutoWidth }) => {
      initOperationColumnAutoWidth(document.body)
    }),
    import('@/plugins/statCardIcons').then(({ initStatCardIcons }) => {
      initStatCardIcons()
    })
  ]).catch((error) => {
    // 增强功能加载失败不应阻塞用户进入业务页面。
    console.error('页面增强功能初始化失败:', error)
  })

  return authenticatedEnhancementsPromise
}

// HMR：插件热更新时重置缓存，让下一次路由跳转重新初始化新版插件
if (import.meta.hot) {
  import.meta.hot.accept(['@/plugins/operationColumnAutoWidth'], () => {
    authenticatedEnhancementsPromise = null
    void initAuthenticatedEnhancements()
  })
}

router.afterEach((to) => {
  if (to.matched.some((record) => record.meta?.requiresAuth)) {
    void initAuthenticatedEnhancements()
  }
})

function hasRoutePermission(authStore, requiredPermission) {
  if (!requiredPermission) return true
  if (authStore.hasPermission(requiredPermission)) {
    return true
  }
  return authStore.hasChildPermission(requiredPermission)
}

function findFirstAccessibleRoute(authStore, excludedPath) {
  const routes = router.getRoutes()
  const accessible = routes.find((route) => {
    if (!route.name || route.redirect || !route.meta?.requiresAuth) return false
    if (!route.path || route.path.includes(':') || route.path === excludedPath) return false
    return hasRoutePermission(authStore, route.meta.permission)
  })

  return accessible?.path || '/profile'
}

// 路由守卫 - 验证登录状态和权限
router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // 设置页面标题
  if (to.meta.title) {
    // i18n 就绪时用 meta.titleKey，否则回退中文 title
    const t = i18n?.global?.t
    const titleKey = to.meta.titleKey
    const pageTitle =
      (titleKey && t ? t(titleKey) : null) || to.meta.title || 'ERP'
    document.title = `${pageTitle} - ERP`
  } else {
    document.title = 'ERP'
  }

  // Already on login: do not bounce authenticated users through profile probes
  // that can race with a dying cookie session and thrash the browser.
  if (to.path === '/login') {
    if (authStore.isAuthenticated && authStore.sessionProbed && !authStore.mustChangePassword) {
      return '/'
    }
    return true
  }

  // 检查用户是否登录。PC 端认证令牌在 HttpOnly Cookie 中。
  // 冷启动即使本地有 user 缓存，也定期/首次向后端探测会话，避免 Cookie 失效仍显示已登录。
  if (to.meta.requiresAuth) {
    const needSessionProbe =
      !authStore.isAuthenticated ||
      !authStore.user ||
      !authStore.sessionProbed

    if (needSessionProbe) {
      try {
        // The guard handles an invalid session with an in-app redirect. Mark this
        // probe so the Axios fallback does not reload the entire application first.
        await authStore.fetchUserProfile(false, false, true)
      } catch {
        return '/login'
      }
    }

    if (!authStore.isAuthenticated) {
      return '/login'
    }
  }

  if (authStore.isAuthenticated && authStore.mustChangePassword && to.path !== '/force-password') {
    return '/force-password'
  }
  if (authStore.isAuthenticated && !authStore.mustChangePassword && to.path === '/force-password') {
    return '/'
  }

  // 如果用户已登录，按用户维度异步加载主题设置，避免同页切换账号时沿用旧主题
  if (authStore.isAuthenticated && to.path !== '/login') {
    const themeOwner = authStore.user?.id || authStore.user?.username || authStore.user?.name || 'authenticated'
    const themeStore = useThemeStore()
    if (themeStore.loadedForUser !== themeOwner) {
      themeStore.loadedForUser = themeOwner
      runWhenIdle(() => {
        themeStore.loadThemeFromServer().catch(() => {})
      }, 3000)
    }
  }

  // ✅ 修复: 不再基于 user.role 跳过权限检查
  // 所有用户都需要加载权限数据,由后端决定是否给予管理员权限

  // 确保权限数据已加载 — 在所有需要认证的路由中预加载（统一入口）
  // 避免 Layout.vue 和路由守卫两处重复加载，同时消除菜单骨架屏闪烁
  if (to.path !== '/force-password' && to.meta.requiresAuth && authStore.isAuthenticated && !authStore.permissionsLoaded) {
    try {
      await authStore.fetchUserPermissions()
    } catch (error) {
      console.error('加载权限数据失败:', error)
      ElMessage.error('权限数据加载失败，请重新登录')
      // fail-closed：权限未知时禁止进入受控页，避免半会话越权
      try {
        if (typeof authStore.clearClientSession === 'function') {
          authStore.clearClientSession()
        }
      } catch {
        // ignore
      }
      return '/login'
    }
  }

  // 检查用户是否有权限访问该路由
  // 统一复用 authStore.hasPermission，消除重复的权限判断逻辑
  if (to.meta.permission && authStore.isAuthenticated) {
    // 权限未成功加载时不得放行
    if (!authStore.permissionsLoaded) {
      ElMessage.error('权限未就绪，请重新登录')
      return '/login'
    }
    const requiredPermission = to.meta.permission

    const hasPermission = hasRoutePermission(authStore, requiredPermission)

    if (!hasPermission) {
      ElMessage.error('您没有权限访问此页面')
      return findFirstAccessibleRoute(authStore, to.path)
    }
  }
})

export default router
