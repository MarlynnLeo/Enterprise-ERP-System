<!--
/**
 * APAging.vue - 应付账龄分析
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
    title: '应付账龄',
    searchPlaceholder: '搜索供应商名称',
    fields: {
      id: 'supplier_id',
      title: 'supplier_name',
      subtitle: (item) => `${item.invoice_count || 0} 张发票`,
      icon: 'chart-trending-o',
      details: [
        { label: '应付总额', field: 'total_amount', format: 'money', prefix: '¥' },
        { label: '已付金额', field: 'paid_amount', format: 'money', prefix: '¥' },
        { label: '未付余额', field: 'balance_amount', format: 'money', prefix: '¥' }
      ]
    }
  }))

  const loadData = async (params) => {
    return await financeApi.getAPAging(params)
  }

  const handleItemClick = (item) => {
    router.push(`/finance/ap/invoices?supplier_id=${item.supplier_id}`)
  }
</script>
