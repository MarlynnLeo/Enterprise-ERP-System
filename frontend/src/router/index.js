/**
 * index.js
 * @description 应用程序路由配置入口
 * @date 2025-08-27
 * @version 2.0.0 — 模块化重构
 */

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
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
    // ✅ 审计修复(A-7): 404 兜底路由改为显示 404 页面，而非静默重定向到首页
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
      import('../stores/theme').then(({ useThemeStore }) => {
        const themeStore = useThemeStore()
        if (!themeStore.isLoaded) {
          themeStore.loadThemeFromServer().catch(() => {})
        }
      }).catch(() => {})
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
  if (to.meta.permission && authStore.isAuthenticated) {
    const userPermissions = authStore.permissions || []
    const requiredPermission = to.meta.permission

    // 权限检查函数
    const checkRoutePermission = (permissions, required) => {
      // 超级管理员通配符: ["*"] 表示拥有所有权限
      if (permissions.includes('*')) {
        return true
      }
      // 精确匹配
      if (permissions.includes(required)) {
        return true
      }
      // 通配符匹配和层级权限
      else if (required.includes(':')) {
        const parts = required.split(':')
        const basePermission = parts[0]

        // 检查是否有通配符匹配
        if (permissions.includes(`${basePermission}:*`)) {
          return true
        }
        // 如果父级权限存在，也认为有权限
        else if (permissions.includes(basePermission)) {
          return true
        }
        // 检查子权限
        else {
          for (const p of permissions) {
            if (p.startsWith(`${basePermission}:`)) {
              // 如果有任何子权限，也允许使用父级菜单
              if (required === basePermission) {
                return true
              }
            }
          }
        }
      }
      // 为菜单处理特殊逻辑：检查是否有该菜单下的任何子权限
      else if (!required.includes(':')) {
        for (const p of permissions) {
          if (p.startsWith(`${required}:`)) {
            return true
          }
        }
      }
      return false
    }

    let hasPermission = checkRoutePermission(userPermissions, requiredPermission)

    // 如果没有权限，尝试刷新权限后再检查一次
    if (!hasPermission && authStore.permissionsLoaded) {
      console.log('[路由守卫] 权限不足，尝试刷新权限...')
      try {
        await authStore.refreshPermissions()
        const newPermissions = authStore.permissions || []
        hasPermission = checkRoutePermission(newPermissions, requiredPermission)

        if (hasPermission) {
          console.log('[路由守卫] 权限刷新成功，允许访问')
        } else {
          console.log('[路由守卫] 权限刷新后仍无权限')
        }
      } catch (error) {
        console.error('[路由守卫] 刷新权限失败:', error)
      }
    }

    if (!hasPermission) {
      ElMessage.error('您没有权限访问此页面')
      next('/dashboard') // 重定向到有权限的页面
      return
    }
  }

  next()
})

export default router