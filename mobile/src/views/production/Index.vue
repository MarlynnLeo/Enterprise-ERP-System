<!--
/**
 * Index.vue - 生产管理
 * @description 生产管理首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2025-12-27
 * @version 3.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="生产管理"
    :stats="statsCards"
    :actions="quickActions"
    :groups="moduleGroups"
    :add-permission="addPermission"
    @back="router.back()"
    @add="handleAdd"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'
  import { productionApi } from '@/api'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()
  const addTargets = [
    { permission: 'production:plans:create', path: '/production/plans/create' },
    { permission: 'production:tasks:create', path: '/production/tasks/create' }
  ]
  const addPermission = computed(() => addTargets.map((item) => item.permission))
  const handleAdd = () => {
    const target = addTargets.find((item) => authStore.hasPermission(item.permission))
    if (target) router.push(target.path)
  }

  // ---- 统计数据 ----
  const statistics = ref({
    totalPlans: 0,
    totalTasks: 0,
    inProgressTasks: 0,
    completedTasks: 0
  })

  const statsCards = computed(() => [
    {
      label: '生产计划',
      value: String(statistics.value.totalPlans || 0),
      icon: 'calendar',
      color: 'bg-blue'
    },
    {
      label: '生产任务',
      value: String(statistics.value.totalTasks || 0),
      icon: 'clipboard-check',
      color: 'bg-purple'
    },
    {
      label: '进行中',
      value: String(statistics.value.inProgressTasks || 0),
      icon: 'clock',
      color: 'bg-yellow'
    },
    {
      label: '已完成',
      value: String(statistics.value.completedTasks || 0),
      icon: 'badge-check',
      color: 'bg-green'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '新建计划',
      path: '/production/plans/create',
      icon: 'calendar',
      permission: 'production:plans:create',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)'
    },
    {
      label: '新建任务',
      path: '/production/tasks/create',
      icon: 'clipboard-check',
      permission: 'production:tasks:create',
      gradient: 'linear-gradient(135deg, var(--ds-purple) 0%, var(--ds-pink) 100%)'
    },
    {
      label: '生产报工',
      path: '/production/report',
      icon: 'document-text',
      permission: 'production:reports:create',
      gradient: 'linear-gradient(135deg, var(--module-blue) 0%, var(--ds-cyan-strong) 100%)'
    },
    {
      label: '生产看板',
      path: '/production/dashboard',
      icon: 'chart-trending-o',
      permission: ['production:data-view', 'production:plans:view', 'production:tasks:view', 'production:reports:view'],
      gradient: 'linear-gradient(135deg, var(--color-success) 0%, var(--ds-green-strong) 100%)'
    },
    {
      label: '异常上报',
      path: '/production/anomaly',
      icon: 'shield',
      permission: ['production:anomaly', 'production:tasks:update'],
      gradient: 'linear-gradient(135deg, var(--color-danger) 0%, #f97316 100%)'
    }
  ])

  // ---- 功能模块 ----
  const planModules = ref([
    {
      title: '生产计划',
      desc: '查看和管理生产计划',
      path: '/production/plans',
      icon: 'calendar',
      permission: 'production:plans:view',
      badge: 0
    },
    {
      title: '新建计划',
      desc: '创建新的生产计划',
      path: '/production/plans/create',
      icon: 'plus',
      permission: 'production:plans:create'
    }
  ])
  const taskModules = ref([
    {
      title: '生产任务',
      desc: '查看和管理生产任务',
      path: '/production/tasks',
      icon: 'clipboard-check',
      permission: 'production:tasks:view',
      badge: 0
    },
    {
      title: '新建任务',
      desc: '创建新的生产任务',
      path: '/production/tasks/create',
      icon: 'plus',
      permission: 'production:tasks:create'
    }
  ])
  const reportModules = ref([
    {
      title: '生产报工',
      desc: '生产任务报工记录',
      path: '/production/report',
      icon: 'document-text',
      permission: 'production:reports:create'
    },
    {
      title: '报工记录',
      desc: '查看历史报工记录',
      path: '/production/report/history',
      icon: 'clock',
      permission: 'production:reports:view'
    }
  ])
  const anomalyModules = ref([
    {
      title: '异常上报',
      desc: '装配异常快速上报与跟踪',
      path: '/production/anomaly',
      icon: 'shield',
      permission: ['production:anomaly', 'production:tasks:update'],
      badge: 0
    }
  ])

  const moduleGroups = computed(() => [
    { title: '计划管理', icon: 'calendar', color: 'text-blue-400', items: planModules.value },
    {
      title: '任务管理',
      icon: 'clipboard-check',
      color: 'text-purple-400',
      items: taskModules.value
    },
    {
      title: '报工管理',
      icon: 'document-text',
      color: 'text-green-400',
      items: reportModules.value
    },
    {
      title: '异常管理',
      icon: 'shield',
      color: 'text-red-400',
      items: anomalyModules.value
    }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    router.push(path)
  }

  // ---- 加载数据 ----
  const loadStatistics = async () => {
    try {
      const response = await productionApi.getDashboardStatistics()
      if (response.data) {
        const stats = response.data
        const planStats = stats.plans || {}
        const taskStats = stats.tasks || {}
        const pendingTasks = Number(taskStats.pending ?? stats.pendingTasks) || 0

        statistics.value.totalPlans = Number(planStats.total ?? stats.totalPlans) || 0
        statistics.value.totalTasks = Number(taskStats.total ?? stats.totalTasks) || 0
        statistics.value.inProgressTasks = Number(taskStats.inProgress ?? stats.inProgressTasks) || 0
        statistics.value.completedTasks = Number(taskStats.completed ?? stats.completedTasks) || 0
        if (pendingTasks > 0) {
          taskModules.value[0].badge = pendingTasks
        }
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
      statistics.value = {
        totalPlans: 0,
        totalTasks: 0,
        inProgressTasks: 0,
        completedTasks: 0
      }
    }
  }

  onMounted(() => {
    loadStatistics()
  })
</script>
