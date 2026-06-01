/**
 * index.js
 * @description 应用程序路由配置入口
 * @date 2025-08-27
 * @version 2.0.0 — 模块化重构
 */

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import { ElMessage } from 'element-plus'
import { runWhenIdle } from '@/utils/performanceMode'

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

// 路由守卫 - 验证登录状态和权限
router.beforeEach(async (to) => {
  const authStore = useAuthStore()

  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - ERP系统`
  } else {
    document.title = 'ERP系统'
  }

  // 检查用户是否登录。PC 端认证令牌在 HttpOnly Cookie 中，刷新页面或新标签页
  // 没有本地 user 缓存时，先向后端探测一次会话。
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    try {
      await authStore.fetchUserProfile()
    } catch {
      return '/login'
    }

    if (!authStore.isAuthenticated) {
      return '/login'
    }
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

  // 确保权限数据已加载（只在需要时加载一次）
  if (to.meta.permission && authStore.isAuthenticated && !authStore.permissionsLoaded) {
    try {
      await authStore.fetchUserPermissions()
    } catch (error) {
      console.error('加载权限数据失败:', error)
    }
  }

  // 检查用户是否有权限访问该路由
  // 统一复用 authStore.hasPermission，消除重复的权限判断逻辑
  if (to.meta.permission && authStore.isAuthenticated) {
    const requiredPermission = to.meta.permission

    // 路由级权限检查：精确匹配 + 拥有子权限也允许进入父级页面
    const checkRoutePermission = () => {
      // 核心判断委托给 authStore（支持 * 通配符、精确匹配、前缀通配符）
      if (authStore.hasPermission(requiredPermission)) {
        return true
      }
      // 父级菜单向上兼容：如果用户拥有该模块下任何子权限，也允许进入
      // 例如 meta.permission='finance' 且用户有 'finance:entries:view' → 允许
      return authStore.hasChildPermission(requiredPermission)
    }

    const hasPermission = checkRoutePermission()

    if (!hasPermission) {
      ElMessage.error('您没有权限访问此页面')
      return '/dashboard'
    }
  }
})

export default router
