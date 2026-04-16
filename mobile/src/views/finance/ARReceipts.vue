<!--
/**
 * ARReceipts.vue - 收款管理
 * @description 收款记录管理页面 - 使用 UniversalListPage
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadReceipts"
    :show-add="false"
    list-title="收款管理"
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
    title: '收款管理',
    searchPlaceholder: '搜索收款单号或客户',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '正常', value: 'normal' },
      { label: '已作废', value: 'void' }
    ],
    fields: {
      id: 'id',
      title: 'customer_name',
      subtitle: (item) => `${item.receipt_number || ''} · ${item.invoice_number || ''}`,
      icon: 'coin',
      details: [
        { label: '收款金额', field: 'total_amount', prefix: '¥', format: 'money' },
        { label: '收款日期', field: 'receipt_date', format: 'date' },
        { label: '支付方式', field: 'payment_method' }
      ],
      status: {
        field: 'status',
        map: {
          normal: { text: '正常', class: 'status-success' },
          void: { text: '已作废', class: 'status-danger' },
          正常: { text: '正常', class: 'status-success' },
          已作废: { text: '已作废', class: 'status-danger' }
        }
      }
    }
  }))

  const loadReceipts = async (params) => {
    const response = await financeApi.getARReceipts(params)
    return response
  }

  const handleItemClick = (item) => {
    router.push(`/finance/ar/receipts/${item.id}`)
  }
</script>
