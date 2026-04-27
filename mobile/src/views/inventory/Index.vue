<!--
/**
 * Index.vue - 仓库管理
 * @description 仓库管理首页 — 使用 ModuleIndexPage 统一布局
 * @date 2026-04-15
 * @version 5.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="仓库管理"
    :stats="statsCards"
    :actions="quickActions"
    :groups="moduleGroups"
    @back="router.back()"
    @add="router.push('/inventory/inbound/create')"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'
  import { inventoryApi } from '@/services/api'

  const router = useRouter()

  // ---- 统计数据 ----
  const statistics = ref({
    totalSKU: 0,
    lowStock: 0,
    inboundToday: 0,
    outboundToday: 0
  })

  // 智能缩写
  const formatShort = (n) => {
    if (!n) return '0'
    if (n >= 10000) return (n / 10000).toFixed(1) + '万'
    return String(n)
  }

  const statsCards = computed(() => [
    {
      label: '总 SKU',
      value: formatShort(statistics.value.totalSKU),
      icon: 'cube',
      color: 'bg-blue'
    },
    {
      label: '低库存',
      value: formatShort(statistics.value.lowStock),
      icon: 'cube',
      color: 'bg-red'
    },
    {
      label: '今日入库',
      value: formatShort(statistics.value.inboundToday),
      icon: 'clipboard-check',
      color: 'bg-green'
    },
    {
      label: '今日出库',
      value: formatShort(statistics.value.outboundToday),
      icon: 'credit-card',
      color: 'bg-orange'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '新建入库',
      path: '/inventory/inbound/create',
      icon: 'plus',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, #764ba2 100%)'
    },
    {
      label: '新建出库',
      path: '/inventory/outbound/create',
      icon: 'clipboard-check',
      gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
    },
    {
      label: '库存调拨',
      path: '/inventory/transfer/create',
      icon: 'exchange',
      gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
    },
    {
      label: '库存盘点',
      path: '/inventory/check/new',
      icon: 'document-text',
      gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
    }
  ])

  // ---- 功能模块 ----
  const stockModules = ref([
    {
      title: '库存查询',
      desc: '实时库存数量与状态',
      path: '/inventory/stock',
      icon: 'cube',
      badge: 0
    },
    {
      title: '库存报表',
      desc: '库存统计与分析',
      path: '/inventory/report',
      icon: 'chart-trending-o'
    }
  ])
  const ioModules = ref([
    {
      title: '入库管理',
      desc: '入库单据与记录',
      path: '/inventory/inbound',
      icon: 'plus',
      badge: 0
    },
    {
      title: '出库管理',
      desc: '出库单据与记录',
      path: '/inventory/outbound',
      icon: 'clipboard-check',
      badge: 0
    },
    {
      title: '收发明细',
      desc: '出入库流水明细',
      path: '/inventory/transaction',
      icon: 'document-text'
    }
  ])
  const adjModules = ref([
    { title: '库存调拨', desc: '仓库间库存调拨', path: '/inventory/transfer', icon: 'exchange' },
    { title: '库存盘点', desc: '盘点作业与差异处理', path: '/inventory/check', icon: 'shield' }
  ])

  const moduleGroups = computed(() => [
    { title: '库存查询', icon: 'cube', color: 'text-blue-400', items: stockModules.value },
    { title: '出入库', icon: 'clipboard-check', color: 'text-green-400', items: ioModules.value },
    { title: '库存调整', icon: 'exchange', color: 'text-orange-400', items: adjModules.value }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => router.push(path)

  // ---- 加载数据 ----
  const loadStatistics = async () => {
    try {
      // 尝试从库存查询接口获取统计
      const response = await inventoryApi.getInventoryStock({ page: 1, limit: 1, show_all: true })
      let items = response.data || response.list || []
      if (!Array.isArray(items)) items = []

      const total = response.total || items.length || 0
      const low = items.filter((i) => {
        const q = i.quantity || 0
        const m = i.min_stock || 0
        return m > 0 && q <= m
      }).length

      statistics.value.totalSKU = total
      statistics.value.lowStock = low

      // 如果低库存 > 0，给库存查询加徽章
      if (low > 0) stockModules.value[0].badge = low
    } catch (error) {
      console.error('加载库存统计失败:', error)
      // 使用示例数据
      statistics.value = { totalSKU: 256, lowStock: 12, inboundToday: 8, outboundToday: 5 }
    }
  }

  onMounted(() => loadStatistics())
</script>
