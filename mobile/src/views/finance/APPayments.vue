<!--
/**
 * APPayments.vue - 付款管理
 * @description 付款记录管理页面
 * @date 2026-04-15
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadData"
    :show-add="false"
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
    title: '付款管理',
    searchPlaceholder: '搜索付款单号或供应商',
    fields: {
      id: 'id',
      title: (item) => item.supplierName || item.supplier_name || '未知供应商',
      subtitle: (item) =>
        `${item.paymentNumber || item.payment_number || ''} · ${item.invoiceNumber || item.invoice_number || ''}`,
      icon: 'credit-card',
      details: [
        {
          label: '付款金额',
          field: (item) => item.amount || item.total_amount,
          format: 'money',
          prefix: '¥'
        },
        {
          label: '付款日期',
          field: (item) => item.paymentDate || item.payment_date,
          format: 'date'
        },
        { label: '支付方式', field: (item) => item.paymentMethod || item.payment_method }
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

  const loadData = async (params) => {
    return await financeApi.getAPPayments(params)
  }

  const handleItemClick = (item) => {
    router.push(`/finance/ap/payments/${item.id}`)
  }
</script>
