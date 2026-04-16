<!--
/**
 * Index.vue - 质量管理
 * @description 质量管理首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2025-12-27
 * @version 3.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="质量管理"
    :stats="statsCards"
    :actions="quickActions"
    :groups="moduleGroups"
    @back="router.back()"
    @add="router.push('/quality/incoming/create')"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'

  const router = useRouter()

  // ---- 统计数据 ----
  const statistics = ref({
    totalInspections: 0,
    passedInspections: 0,
    failedInspections: 0,
    passRate: 0
  })

  const statsCards = computed(() => [
    {
      label: '总检验数',
      value: String(statistics.value.totalInspections || 0),
      icon: 'badge-check',
      color: 'bg-blue'
    },
    {
      label: '合格数',
      value: String(statistics.value.passedInspections || 0),
      icon: 'badge-check',
      color: 'bg-green'
    },
    {
      label: '不合格数',
      value: String(statistics.value.failedInspections || 0),
      icon: 'close',
      color: 'bg-red'
    },
    {
      label: '合格率',
      value: (statistics.value.passRate || 0) + '%',
      icon: 'chart-trending-o',
      color: 'bg-yellow'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '来料检验',
      path: '/quality/incoming/create',
      icon: 'cube',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    {
      label: '过程检验',
      path: '/quality/process/create',
      icon: 'clipboard-check',
      gradient: 'linear-gradient(135deg, #2CCFB0 0%, #1BA392 100%)'
    },
    {
      label: '成品检验',
      path: '/quality/final/create',
      icon: 'badge-check',
      gradient: 'linear-gradient(135deg, #FF6B6B 0%, #EE5A52 100%)'
    },
    {
      label: '质量追溯',
      path: '/quality/traceability',
      icon: 'search',
      gradient: 'linear-gradient(135deg, #FF9F45 0%, #FF8A3D 100%)'
    }
  ])

  // ---- 功能模块 ----
  const inspectionModules = ref([
    {
      title: '来料检验',
      desc: '原材料质量检验',
      path: '/quality/incoming',
      icon: 'cube',
      badge: 0
    },
    {
      title: '过程检验',
      desc: '生产过程质量控制',
      path: '/quality/process',
      icon: 'clipboard-check',
      badge: 0
    },
    {
      title: '成品检验',
      desc: '最终产品质量检验',
      path: '/quality/final',
      icon: 'badge-check',
      badge: 0
    }
  ])
  const templateModules = ref([
    {
      title: '检验模板',
      desc: '检验标准与模板',
      path: '/quality/templates',
      icon: 'document-text'
    },
    { title: '质量标准', desc: '质量标准管理', path: '/quality/standards', icon: 'badge-check' }
  ])
  const traceabilityModules = ref([
    { title: '质量追溯', desc: '产品质量追溯查询', path: '/quality/traceability', icon: 'search' },
    { title: '不合格品处理', desc: '不合格品管理', path: '/quality/nonconformance', icon: 'cube' }
  ])
  const reportModules = ref([
    {
      title: '质量统计',
      desc: '质量数据统计分析',
      path: '/quality/reports/statistics',
      icon: 'document-text'
    },
    {
      title: '质量趋势',
      desc: '质量趋势分析',
      path: '/quality/reports/trends',
      icon: 'document-text'
    },
    {
      title: 'SPC控制图',
      desc: '统计过程控制',
      path: '/quality/reports/spc',
      icon: 'document-text'
    }
  ])

  const moduleGroups = computed(() => [
    {
      title: '检验管理',
      icon: 'badge-check',
      color: 'text-blue-400',
      items: inspectionModules.value
    },
    { title: '模板管理', icon: 'cube', color: 'text-green-400', items: templateModules.value },
    { title: '追溯管理', icon: 'search', color: 'text-red-400', items: traceabilityModules.value },
    {
      title: '报表分析',
      icon: 'clipboard-list',
      color: 'text-yellow-400',
      items: reportModules.value
    }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    router.push(path)
  }

  // ---- 加载数据 ----
  onMounted(() => {
    // TODO: 接入真实 API
    statistics.value = {
      totalInspections: 156,
      passedInspections: 142,
      failedInspections: 14,
      passRate: 91.0
    }
  })
</script>
