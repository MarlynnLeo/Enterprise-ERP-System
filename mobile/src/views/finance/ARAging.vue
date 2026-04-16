<!--
/**
 * ARAging.vue - 应收账龄分析
 * @description 客户应收账龄统计
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
    title: '应收账龄',
    searchPlaceholder: '搜索客户名称',
    fields: {
      id: 'customer_id',
      title: 'customer_name',
      subtitle: (item) => `${item.invoice_count || 0} 张发票`,
      icon: 'chart-trending-o',
      details: [
        { label: '应收总额', field: 'total_amount', format: 'money', prefix: '¥' },
        { label: '已收金额', field: 'paid_amount', format: 'money', prefix: '¥' },
        { label: '未收余额', field: 'balance_amount', format: 'money', prefix: '¥' }
      ]
    }
  }))

  const loadData = async (params) => {
    return await financeApi.getARAging(params)
  }

  const handleItemClick = (item) => {
    router.push(`/finance/ar/invoices?customer_id=${item.customer_id}`)
  }
</script>
