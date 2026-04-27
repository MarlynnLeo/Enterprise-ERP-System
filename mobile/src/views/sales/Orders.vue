<!--
/**
 * Orders.vue - 销售订单
 * @description 销售订单页面 - 使用通用列表组件
 * @date 2025-12-27
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadOrders"
    :show-add="true"
    add-permission="sales:orders:create"
    :show-filter="true"
    list-title="销售订单列表"
    @add="handleAdd"
    @filter="handleFilter"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { salesApi } from '@/services/api'
  import { showToast } from 'vant'
  import { SALES_ORDER_STATUS } from '@/constants/dict'

  const router = useRouter()

  // 页面配置
  const pageConfig = computed(() => ({
    title: '销售订单',
    searchPlaceholder: '搜索订单编号或客户',
    tags: [
      { label: '全部', value: 'all' },
      { label: '草稿', value: 'draft' },
      { label: '已确认', value: 'confirmed' },
      { label: '生产中', value: 'in_production' },
      { label: '待发货', value: 'ready_to_ship' },
      { label: '已完成', value: 'completed' }
    ],
    stats: [
      { label: '总订单', field: 'total', icon: 'shopping-bag', iconClass: 'bg-blue' },
      { label: '生产中', field: 'in_production', icon: 'beaker', iconClass: 'bg-yellow' },
      { label: '已完成', field: 'completed', icon: 'badge-check', iconClass: 'bg-green' }
    ],
    fields: {
      id: 'id',
      title: 'customer_name',
      subtitle: 'order_no',
      icon: 'clipboard-check',
      details: [
        { label: '订单金额', field: 'total_amount', prefix: '¥', format: 'money' },
        { label: '订单日期', field: 'order_date', format: 'date' },
        { label: '交货日期', field: 'delivery_date', format: 'date' }
      ],
      status: {
        field: 'status',
        map: SALES_ORDER_STATUS
      }
    },
    detailRoute: '/sales/orders/:id'
  }))

  // API 函数
  const loadOrders = async (params) => {
    try {
      const response = await salesApi.getSalesOrders(params)
      return response
    } catch (error) {
      console.error('加载销售订单失败:', error)
      throw error
    }
  }

  // 事件处理
  const handleAdd = () => {
    router.push('/sales/orders/create')
  }

  const handleFilter = () => {
    // 筛选功能由 UniversalListPage 内置处理
  }

  const handleItemClick = (item) => {
    router.push(`/sales/orders/${item.id}`)
  }
</script>
