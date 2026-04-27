<!--
/**
 * Index.vue - 设备管理
 * @description 设备管理首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="设备管理"
    :stats="statsCards"
    :actions="quickActions"
    :groups="moduleGroups"
    @back="router.back()"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'

  const router = useRouter()

  // ---- 统计数据 ----
  const statistics = ref({
    totalEquipments: 0,
    runningEquipments: 0,
    maintenanceTasks: 0,
    errorEquipments: 0
  })

  const statsCards = computed(() => [
    {
      label: '设备总数',
      value: String(statistics.value.totalEquipments || 0),
      icon: 'desktop-o',
      color: 'bg-blue'
    },
    {
      label: '运行中',
      value: String(statistics.value.runningEquipments || 0),
      icon: 'play-circle-o',
      color: 'bg-green'
    },
    {
      label: '待保养',
      value: String(statistics.value.maintenanceTasks || 0),
      icon: 'setting-o',
      color: 'bg-yellow'
    },
    {
      label: '故障中',
      value: String(statistics.value.errorEquipments || 0),
      icon: 'warning-o',
      color: 'bg-red'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '设备台账',
      path: '/equipment/list',
      icon: 'desktop-o',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%)'
    },
    {
      label: '新建点检',
      path: '/equipment/check/create',
      icon: 'passed',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    },
    {
      label: '故障报修',
      path: '/equipment/repair/create',
      icon: 'warning-o',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
      label: '保养计划',
      path: '/equipment/maintenance',
      icon: 'clock-o',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    }
  ])

  // ---- 功能模块 ----
  const configModules = ref([
    {
      title: '设备台账',
      desc: '设备档案与台账',
      path: '/equipment/list',
      icon: 'desktop-o'
    },
    {
      title: '设备类型',
      desc: '设备分类管理',
      path: '/equipment/types',
      icon: 'cluster-o'
    }
  ])

  const taskModules = ref([
    {
      title: '点检管理',
      desc: '设备日常点检任务',
      path: '/equipment/check',
      icon: 'passed'
    },
    {
      title: '保养管理',
      desc: '设备定期保养计划',
      path: '/equipment/maintenance',
      icon: 'setting-o'
    },
    {
      title: '维修管理',
      desc: '设备故障及维修记录',
      path: '/equipment/repair',
      icon: 'tools'
    }
  ])

  const moduleGroups = computed(() => [
    { title: '基础档案', icon: 'desktop-o', color: 'text-blue-400', items: configModules.value },
    { title: '运维管理', icon: 'setting-o', color: 'text-purple-400', items: taskModules.value }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    router.push(path)
  }
</script>
