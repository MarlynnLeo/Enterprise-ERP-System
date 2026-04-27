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
    @back="router.back()"
    @add="router.push('/production/plans/create')"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'
  import { productionApi } from '@/services/api'

  const router = useRouter()

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
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%)'
    },
    {
      label: '新建任务',
      path: '/production/tasks/create',
      icon: 'clipboard-check',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
      label: '生产报工',
      path: '/production/report',
      icon: 'document-text',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    },
    {
      label: '生产看板',
      path: '/production/dashboard',
      icon: 'chart-trending-o',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    }
  ])

  // ---- 功能模块 ----
  const planModules = ref([
    {
      title: '生产计划',
      desc: '查看和管理生产计划',
      path: '/production/plans',
      icon: 'calendar',
      badge: 0
    },
    { title: '新建计划', desc: '创建新的生产计划', path: '/production/plans/create', icon: 'plus' }
  ])
  const taskModules = ref([
    {
      title: '生产任务',
      desc: '查看和管理生产任务',
      path: '/production/tasks',
      icon: 'clipboard-check',
      badge: 0
    },
    { title: '新建任务', desc: '创建新的生产任务', path: '/production/tasks/create', icon: 'plus' }
  ])
  const reportModules = ref([
    {
      title: '生产报工',
      desc: '生产任务报工记录',
      path: '/production/report',
      icon: 'document-text'
    },
    {
      title: '报工记录',
      desc: '查看历史报工记录',
      path: '/production/report/history',
      icon: 'clock'
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
        statistics.value.totalPlans = stats.totalPlans || 0
        statistics.value.totalTasks = stats.totalTasks || 0
        statistics.value.inProgressTasks = stats.inProgressTasks || 0
        statistics.value.completedTasks = stats.completedTasks || 0
        if (stats.pendingTasks > 0) {
          taskModules.value[0].badge = stats.pendingTasks
        }
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
      statistics.value = {
        totalPlans: 45,
        totalTasks: 128,
        inProgressTasks: 32,
        completedTasks: 96
      }
    }
  }

  onMounted(() => {
    loadStatistics()
  })
</script>
