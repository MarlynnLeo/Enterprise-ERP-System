<!--
/**
 * Index.vue - 销售管理
 * @description 销售管理首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2025-12-27
 * @version 3.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="销售管理"
    :stats="statsCards"
    :actions="quickActions"
    :groups="moduleGroups"
    @back="router.back()"
    @add="router.push('/sales/orders/new')"
    @navigate="navigateTo"
  />
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { showToast } from 'vant'
  import ModuleIndexPage from '@/components/common/ModuleIndexPage.vue'
  import { salesApi } from '@/services/api'

  const router = useRouter()

  // ---- 统计数据 ----
  const statistics = ref({
    totalOrders: 0,
    totalAmount: 0,
    pendingOrders: 0,
    completedOrders: 0
  })

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0'
    if (amount >= 10000) return (amount / 10000).toFixed(1) + 'w'
    return parseFloat(amount).toFixed(0)
  }

  // 统计卡片（传给 ModuleIndexPage）
  const statsCards = computed(() => [
    {
      label: '销售订单',
      value: String(statistics.value.totalOrders || 0),
      icon: 'document-text',
      color: 'bg-blue'
    },
    {
      label: '销售金额',
      value: formatAmount(statistics.value.totalAmount),
      icon: 'cash',
      color: 'bg-green'
    },
    {
      label: '待处理',
      value: String(statistics.value.pendingOrders || 0),
      icon: 'clock',
      color: 'bg-yellow'
    },
    {
      label: '已完成',
      value: String(statistics.value.completedOrders || 0),
      icon: 'badge-check',
      color: 'bg-purple'
    }
  ])

  // ---- 快捷操作 ----
  const quickActions = ref([
    {
      label: '销售订单',
      path: '/sales/orders',
      icon: 'document-text',
      gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    {
      label: '新建订单',
      path: '/sales/orders/new',
      icon: 'plus',
      gradient: 'linear-gradient(135deg, #2CCFB0 0%, #1BA392 100%)'
    },
    {
      label: '销售出库',
      path: '/sales/outbound',
      icon: 'truck',
      gradient: 'linear-gradient(135deg, #FF6B6B 0%, #EE5A52 100%)'
    },
    {
      label: '客户管理',
      path: '/sales/customers',
      icon: 'users',
      gradient: 'linear-gradient(135deg, #FF9F45 0%, #FF8A3D 100%)'
    }
  ])

  // ---- 功能模块 ----
  const orderModules = ref([
    {
      title: '销售订单',
      desc: '查看和管理销售订单',
      path: '/sales/orders',
      icon: 'document-text',
      badge: 0
    },
    { title: '新建订单', desc: '创建新的销售订单', path: '/sales/orders/new', icon: 'plus' }
  ])
  const outboundModules = ref([
    { title: '销售出库', desc: '查看和管理销售出库单', path: '/sales/outbound', icon: 'truck' },
    { title: '新建出库', desc: '创建新的销售出库单', path: '/sales/outbound/new', icon: 'plus' }
  ])
  const afterSalesModules = ref([
    { title: '销售退货', desc: '查看和管理销售退货', path: '/sales/returns', icon: 'undo' },
    { title: '销售换货', desc: '查看和管理销售换货', path: '/sales/exchanges', icon: 'exchange' }
  ])

  const moduleGroups = computed(() => [
    { title: '订单管理', icon: 'document-text', color: 'text-blue-400', items: orderModules.value },
    { title: '出库管理', icon: 'cube', color: 'text-green-400', items: outboundModules.value },
    { title: '售后管理', icon: 'wrench', color: 'text-purple-400', items: afterSalesModules.value }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    const devPaths = ['/sales/orders/new', '/sales/outbound/new', '/sales/customers']

    router.push(path)
  }

  // ---- 加载数据 ----
  const loadStatistics = async () => {
    try {
      const response = await salesApi.getSalesStatistics()
      if (response.data) {
        statistics.value = response.data
        if (response.data.pendingOrders > 0) {
          orderModules.value[0].badge = response.data.pendingOrders
        }
      }
    } catch (error) {
      console.error('获取销售统计数据失败:', error)
    }
  }

  onMounted(() => {
    loadStatistics()
  })
</script>
