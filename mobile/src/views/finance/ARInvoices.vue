<!--
/**
 * ARInvoices.vue - 应收账款
 * @description 应收账款管理页面 - 替代GenericListView占位
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadInvoices"
    :show-add="false"
    list-title="应收账款"
    @item-click="handleItemClick"
  />
</template>

<script setup>
  import { computed } from 'vue'
  import { useRouter } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { financeApi } from '@/services/api'

  const router = useRouter()

  const pageConfig = computed(() => ({
    title: '应收账款',
    searchPlaceholder: '搜索客户或发票号',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待收款', value: 'pending' },
      { label: '已收款', value: 'paid' },
      { label: '逾期', value: 'overdue' }
    ],
    fields: {
      id: 'id',
      title: 'customer_name',
      subtitle: (item) => `${item.invoice_number || ''} · ${item.invoice_date || ''}`,
      icon: 'coin',
      details: [
        { label: '发票金额', field: 'total_amount', prefix: '¥', format: 'money' },
        { label: '已收金额', field: 'paid_amount', prefix: '¥', format: 'money' },
        { label: '到期日', field: 'due_date', format: 'date' }
      ],
      status: {
        field: 'status',
        map: {
          草稿: { text: '草稿', class: 'status-default' },
          已确认: { text: '已确认', class: 'status-info' },
          部分付款: { text: '部分收款', class: 'status-warning' },
          已付款: { text: '已收款', class: 'status-success' },
          已逾期: { text: '逾期', class: 'status-danger' },
          pending: { text: '待收款', class: 'status-warning' },
          partial: { text: '部分收款', class: 'status-info' },
          paid: { text: '已收款', class: 'status-success' },
          overdue: { text: '逾期', class: 'status-danger' }
        }
      }
    }
  }))

  const loadInvoices = async (params) => {
    const response = await financeApi.getARInvoices(params)
    return response
  }

  const handleItemClick = (item) => {
    router.push(`/finance/ar/invoices/${item.id}`)
  }
</script>
