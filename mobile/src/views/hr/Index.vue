<!--
/**
 * Index.vue - 人事管理
 * @description 人事管理首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2026-04-18
 * @version 1.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="人事管理"
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
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    leaveToday: 0
  })

  const statsCards = computed(() => [
    {
      label: '在职员工',
      value: String(statistics.value.totalEmployees || 0),
      icon: 'friends-o',
      color: 'bg-blue'
    },
    {
      label: '今日出勤',
      value: String(statistics.value.presentToday || 0),
      icon: 'passed',
      color: 'bg-green'
    },
    {
      label: '请假',
      value: String(statistics.value.leaveToday || 0),
      icon: 'notes-o',
      color: 'bg-yellow'
    },
    {
      label: '缺勤',
      value: String(statistics.value.absentToday || 0),
      icon: 'warning-o',
      color: 'bg-red'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '员工考勤',
      path: '/hr/attendance',
      icon: 'calendar-o',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%)'
    },
    {
      label: '请假申请',
      path: '/hr/leave/create',
      icon: 'notes-o',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    },
    {
      label: '加班申请',
      path: '/hr/overtime/create',
      icon: 'clock-o',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
      label: '排班管理',
      path: '/hr/schedule',
      icon: 'todo-list-o',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    }
  ])

  // ---- 功能模块 ----
  const employeeModules = ref([
    {
      title: '员工档案',
      desc: '员工信息与档案在册',
      path: '/hr/employees',
      icon: 'friends-o'
    },
    {
      title: '部门管理',
      desc: '公司组织架构',
      path: '/hr/departments',
      icon: 'cluster-o'
    }
  ])

  const attendanceModules = ref([
    {
      title: '考勤记录',
      desc: '员工日常打卡考勤',
      path: '/hr/attendance',
      icon: 'calendar-o'
    },
    {
      title: '请假管理',
      desc: '员工请休假审批',
      path: '/hr/leave',
      icon: 'notes-o'
    },
    {
      title: '加班管理',
      desc: '员工加班审批',
      path: '/hr/overtime',
      icon: 'clock-o'
    }
  ])

  const moduleGroups = computed(() => [
    { title: '组织人事', icon: 'friends-o', color: 'text-blue-400', items: employeeModules.value },
    { title: '时间管理', icon: 'clock-o', color: 'text-green-400', items: attendanceModules.value }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    router.push(path)
  }
</script>
