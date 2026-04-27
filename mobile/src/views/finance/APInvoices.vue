<!--
/**
 * APInvoices.vue - 应付账款
 * @description 应付账款管理页面
 * @date 2026-04-15
 * @version 2.1.0
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
  import { useRouter, useRoute } from 'vue-router'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { financeApi } from '@/services/api'

  const router = useRouter()
  const route = useRoute()

  const pageConfig = computed(() => ({
    title: '应付账款',
    searchPlaceholder: '搜索供应商或发票号',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '待付款', value: '已确认' },
      { label: '部分付款', value: '部分付款' },
      { label: '已付款', value: '已付款' },
      { label: '逾期', value: '已逾期' }
    ],
    fields: {
      id: 'id',
      title: 'supplierName',
      subtitle: (item) => `${item.invoiceNumber || ''} · ${item.invoiceDate || ''}`,
      icon: 'receipt',
      details: [
        { label: '发票金额', field: 'amount', prefix: '¥', format: 'money' },
        { label: '已付金额', field: 'paidAmount', prefix: '¥', format: 'money' },
        { label: '到期日', field: 'dueDate', format: 'date' }
      ],
      status: {
        field: 'status',
        map: {
          草稿: { text: '草稿', class: 'status-default' },
          已确认: { text: '已确认', class: 'status-info' },
          部分付款: { text: '部分付款', class: 'status-warning' },
          已付款: { text: '已付款', class: 'status-success' },
          已逾期: { text: '逾期', class: 'status-danger' },
          已取消: { text: '已取消', class: 'status-default' }
        }
      }
    }
  }))

  const loadInvoices = async (params) => {
    // 如果 URL 携带了有效的 supplier_id 参数，注入到请求中
    const supplierId = route.query.supplier_id
    if (supplierId && supplierId !== 'undefined') {
      params.supplier_id = supplierId
    }
    const response = await financeApi.getAPInvoices(params)
    return response
  }

  const handleItemClick = (item) => {
    router.push(`/finance/ap/invoices/${item.id}`)
  }
</script>
