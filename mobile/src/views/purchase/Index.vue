<!--
/**
 * Index.vue - 采购管理
 * @description 采购管理首页 — 仅定义业务数据，布局由 ModuleIndexPage 统一控制
 * @date 2025-12-27
 * @version 3.0.0
 */
-->
<template>
  <ModuleIndexPage
    title="采购管理"
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
  import { purchaseApi } from '@/api'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()
  const addTargets = [
    { permission: 'purchase:orders:create', path: '/purchase/orders/create' },
    { permission: 'purchase:requisitions:create', path: '/purchase/requisitions/new' }
  ]
  const addPermission = computed(() => addTargets.map((item) => item.permission))
  const handleAdd = () => {
    const target = addTargets.find((item) => authStore.hasPermission(item.permission))
    if (target) router.push(target.path)
  }

  // ---- 统计数据 ----
  const statistics = ref({
    totalOrders: 0,
    totalAmount: 0,
    pendingOrders: 0,
    completedOrders: 0
  })

  const formatAmount = (amount) => {
    if (!amount) return '0'
    if (amount >= 10000) return (amount / 10000).toFixed(1) + 'w'
    return amount.toString()
  }

  const statsCards = computed(() => [
    {
      label: '采购订单',
      value: String(statistics.value.totalOrders || 0),
      icon: 'cart',
      color: 'bg-blue'
    },
    {
      label: '采购金额',
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
      label: '新建申请',
      path: '/purchase/requisitions/new',
      icon: 'document-text',
      permission: 'purchase:requisitions:create',
      gradient: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)'
    },
    {
      label: '新建订单',
      path: '/purchase/orders/create',
      icon: 'cart',
      permission: 'purchase:orders:create',
      gradient: 'linear-gradient(135deg, var(--color-success) 0%, var(--color-accent) 100%)'
    },
    {
      label: '采购入库',
      path: '/purchase/receipts/create',
      icon: 'cube',
      permission: 'purchase:receipts:create',
      gradient: 'linear-gradient(135deg, var(--color-error) 0%, var(--color-danger) 100%)'
    },
    {
      label: '采购概览',
      path: '/purchase/dashboard',
      icon: 'chart-trending-o',
      permission: 'purchase:reports:view',
      gradient: 'linear-gradient(135deg, var(--color-warning) 0%, var(--ds-orange-strong) 100%)'
    }
  ])

  // ---- 功能模块 ----
  const requisitionModules = ref([
    {
      title: '采购申请',
      desc: '查看和管理采购申请',
      path: '/purchase/requisitions',
      icon: 'document-text',
      permission: 'purchase:requisitions:view',
      badge: 0
    },
    {
      title: '新建申请',
      desc: '创建新的采购申请',
      path: '/purchase/requisitions/new',
      icon: 'plus',
      permission: 'purchase:requisitions:create'
    }
  ])
  const orderModules = ref([
    {
      title: '采购订单',
      desc: '查看和管理采购订单',
      path: '/purchase/orders',
      icon: 'cart',
      permission: 'purchase:orders:view',
      badge: 0
    },
    {
      title: '新建订单',
      desc: '创建新的采购订单',
      path: '/purchase/orders/create',
      icon: 'plus',
      permission: 'purchase:orders:create'
    }
  ])
  const receiptModules = ref([
    {
      title: '采购入库',
      desc: '查看和管理采购入库单',
      path: '/purchase/receipts',
      icon: 'cube',
      permission: 'purchase:receipts:view'
    },
    {
      title: '新建入库单',
      desc: '创建新的采购入库单',
      path: '/purchase/receipts/create',
      icon: 'plus',
      permission: 'purchase:receipts:create'
    },
    {
      title: '采购退货',
      desc: '采购退货管理',
      path: '/purchase/returns',
      icon: 'revoke',
      permission: 'purchase:returns:view'
    }
  ])

  const moduleGroups = computed(() => [
    {
      title: '采购申请',
      icon: 'document-text',
      color: 'text-blue-400',
      items: requisitionModules.value
    },
    { title: '采购订单', icon: 'cube', color: 'text-green-400', items: orderModules.value },
    { title: '采购入库', icon: 'wrench', color: 'text-purple-400', items: receiptModules.value }
  ])

  // ---- 路由跳转 ----
  const navigateTo = (path) => {
    if (path === '/purchase/orders/create' || path === '/purchase/receipts/create') {
      router.push(path)
      return
    }

    router.push(path)
  }

  // ---- 加载数据 ----
  const loadStatistics = async () => {
    if (!authStore.hasPermission('purchase:reports:view')) {
      return
    }

    try {
      const response = await purchaseApi.getStatistics()
      if (response.data) {
        statistics.value = response.data
        if (response.data.pendingOrders > 0) {
          orderModules.value[0].badge = response.data.pendingOrders
        }
      }
    } catch (error) {
      console.error('加载统计数据失败:', error)
      statistics.value = {
        totalOrders: 0,
        totalAmount: 0,
        pendingOrders: 0,
        completedOrders: 0
      }
    }
  }

  onMounted(() => {
    loadStatistics()
  })
</script>
