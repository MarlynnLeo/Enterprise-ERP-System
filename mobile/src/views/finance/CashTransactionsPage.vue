<!--
/**
 * CashTransactions.vue - 现金交易
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
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { financeApi } from '@/services/api'


  const pageConfig = computed(() => ({
    title: '现金交易',
    searchPlaceholder: '搜索交易描述',
    fields: {
      id: 'id',
      title: (item) => item.description || '现金交易',
      subtitle: (item) => item.transaction_number || '',
      icon: 'cash',
      details: [
        { label: '交易金额', field: 'amount', format: 'money', prefix: '¥' },
        { label: '交易日期', field: 'transaction_date', format: 'date' },
        { label: '交易类型', field: 'transaction_type' }
      ]
    }
  }))

  const loadData = async (params) => {
    return await financeApi.getCashTransactions(params)
  }

  const handleItemClick = () => {}
</script>
