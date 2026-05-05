<!--
/**
 * Orders.vue - 采购订单
 * @description 采购订单页面 - 使用通用列表组件
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadOrders"
    :show-add="true"
    add-permission="purchase:orders:create"
    :show-filter="true"
    list-title="采购订单列表"
    @add="handleAdd"
    @filter="handleFilter"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { purchaseApi } from '@/services/api'
  

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '采购订单',
    searchPlaceholder: '搜索订单编号或供应商',
    tags: [
      { label: '全部', value: 'all' },
      { label: '待审核', value: 'pending' },
      { label: '已审核', value: 'approved' },
      { label: '已完成', value: 'completed' }
    ],
    stats: [
      { label: '总订单', field: 'total', icon: 'shopping-cart', iconClass: 'bg-blue' },
      { label: '待审核', field: 'pending', icon: 'shopping-cart', iconClass: 'bg-yellow' },
      { label: '已完成', field: 'completed', icon: 'badge-check', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'supplier_name',
      subtitle: 'order_code',
      icon: 'clipboard-check',
      details: [
        { label: '订单金额', field: (item) => '¥' + Number(item.total_amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
        { label: '订单日期', field: 'order_date', format: 'date' },
        { label: '预计到货', field: 'expected_date', format: 'date' }
      ],
      status: {
        field: 'status',
        map: {
          pending: { text: '待审核', class: 'status-pending' },
          approved: { text: '已审核', class: 'status-progress' },
          completed: { text: '已完成', class: 'status-completed' }
        }
      }
    },
    detailRoute: '/purchase/orders/:id'
  }))

  // API 函数
  const loadOrders = async (params) => {
    try {
      const response = await purchaseApi.getOrders(params)
      return response
    } catch (error) {
      console.error('加载采购订单失败:', error)
      throw error
    }
  }

  // 事件处理
  const handleAdd = () => {
    router.push('/purchase/orders/create')
  }

  const handleFilter = () => {
    // 筛选功能由 UniversalListPage 内置处理
  }

  const handleItemClick = (item) => {
    router.push(`/purchase/orders/${item.id}`)
  }
</script>
