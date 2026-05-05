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

// 创建路由重定向映射
const redirects = [
  // 基础数据：从旧的中文路径重定向到新的英文路径
  { from: '/基础数据', to: '/basedata' },
  { from: '/基础数据/物料管理', to: '/basedata/materials' },
  { from: '/基础数据/BOM管理', to: '/basedata/boms' },
  { from: '/基础数据/客户管理', to: '/basedata/customers' },
  { from: '/基础数据/供应商管理', to: '/basedata/suppliers' },
  { from: '/基础数据/物料分类', to: '/basedata/categories' },
  { from: '/基础数据/计量单位', to: '/basedata/units' },
  { from: '/基础数据/库位管理', to: '/basedata/locations' },
  { from: '/基础数据/工序模板', to: '/basedata/process-templates' },
  { from: '/基础数据/产品分类', to: '/basedata/product-categories' }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 添加重定向路由
    ...redirects.map(({ from, to }) => ({
      path: from,
      redirect: to
    })),
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
        title: '生产流程可视化看板'
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
          beforeEnter: async (to, from, next) => {
            const authStore = useAuthStore()
            try {
              if (!authStore.user) {
                await authStore.fetchUserProfile()
              }
              next()
            } catch (error) {
              console.error('加载用户信息失败:', error)
              ElMessage.error('加载用户信息失败，请重新登录')
              next('/login')
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
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()

  // 处理旧的 dataOverview 驼峰式路径，重定向到小写路径
  if (to.path.includes('/dataOverview')) {
    const newPath = to.path.replace('/dataOverview', '/dataoverview')
    next({ path: newPath, replace: true })
    return
  }

  // 设置页面标题
  if (to.meta.title) {
    document.title = `${to.meta.title} - ERP系统`
  } else {
    document.title = 'ERP系统'
  }

  // 检查用户是否登录
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next('/login')
    return
  }

  // 如果用户已登录且主题未加载，异步加载主题设置（只触发一次）
  if (authStore.isAuthenticated && to.path !== '/login') {
    // 使用全局变量避免每次路由切换都创建新的 import Promise
    if (!window.__themeLoaded) {
      window.__themeLoaded = true
      const themeStore = useThemeStore()
      if (!themeStore.isLoaded) {
        themeStore.loadThemeFromServer().catch(() => {})
      }
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
      const permissions = authStore.permissions || []
      return permissions.some(p => p.startsWith(requiredPermission + ':'))
    }

    let hasPermission = checkRoutePermission()

    // 如果没有权限，尝试刷新权限后再检查一次
    if (!hasPermission && authStore.permissionsLoaded) {
      try {
        await authStore.refreshPermissions()
        hasPermission = checkRoutePermission()
      } catch (error) {
        console.error('[路由守卫] 刷新权限失败:', error)
      }
    }

    if (!hasPermission) {
      ElMessage.error('您没有权限访问此页面')
      next('/dashboard')
      return
    }
  }

  next()
})

export default router
