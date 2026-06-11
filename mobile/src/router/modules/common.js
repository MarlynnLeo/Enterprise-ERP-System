/**
 * 通用路由 — 登录、首页、关于、仪表盘等
 */
export const commonRoutes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: {
      title: '登录',
      allowGuest: true
    }
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/Home.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/about',
    name: 'About',
    component: () => import('@/views/About.vue'),
    meta: { title: '关于系统' }
  },
  // 仪表盘 — 重定向到首页（首页已包含数据概览）
  {
    path: '/dashboard',
    name: 'Dashboard',
    redirect: '/'
  }
]
