<!--
/**
 * APInvoices.vue - 应付账款
 * @description 应付账款管理页面
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadInvoices"
    :show-add="false"
    list-title="应付账款"
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
    title: '应付账款',
    searchPlaceholder: '搜索供应商或发票号',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待付款', value: 'pending' },
      { label: '已付款', value: 'paid' },
      { label: '逾期', value: 'overdue' }
    ],
    fields: {
      id: 'id',
      title: 'supplier_name',
      subtitle: (item) => `${item.invoice_number || ''} · ${item.invoice_date || ''}`,
      icon: 'receipt',
      details: [
        { label: '发票金额', field: 'total_amount', prefix: '¥', format: 'money' },
        { label: '已付金额', field: 'paid_amount', prefix: '¥', format: 'money' },
        { label: '到期日', field: 'due_date', format: 'date' }
      ],
      status: {
        field: 'status',
        map: {
          草稿: { text: '草稿', class: 'status-default' },
          已确认: { text: '已确认', class: 'status-info' },
          部分付款: { text: '部分付款', class: 'status-warning' },
          已付款: { text: '已付款', class: 'status-success' },
          已逾期: { text: '逾期', class: 'status-danger' },
          pending: { text: '待付款', class: 'status-warning' },
          partial: { text: '部分付款', class: 'status-info' },
          paid: { text: '已付款', class: 'status-success' },
          overdue: { text: '逾期', class: 'status-danger' }
        }
      }
    }
  }))

  const loadInvoices = async (params) => {
    const response = await financeApi.getAPInvoices(params)
    return response
  }

  const handleItemClick = (item) => {
    router.push(`/finance/ap/invoices/${item.id}`)
  }
</script>
