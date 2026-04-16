<!--
/**
 * BankTransactions.vue - 银行交易记录
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
    title: '银行交易',
    searchPlaceholder: '搜索交易描述',
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '转入', value: '转入' },
      { label: '转出', value: '转出' }
    ],
    fields: {
      id: 'id',
      title: (item) => item.related_party || item.description || '银行交易',
      subtitle: (item) => `${item.transaction_number || ''} · ${item.account_name || ''}`,
      icon: 'exchange',
      details: [
        { label: '交易金额', field: 'amount', format: 'money', prefix: '¥' },
        { label: '交易日期', field: 'transaction_date', format: 'date' },
        { label: '交易类型', field: 'transaction_type' }
      ],
      status: {
        field: 'is_reconciled',
        map: {
          1: { text: '已对账', class: 'status-success' },
          0: { text: '未对账', class: 'status-warning' },
          true: { text: '已对账', class: 'status-success' },
          false: { text: '未对账', class: 'status-warning' }
        }
      }
    }
  }))

  const loadData = async (params) => {
    return await financeApi.getBankTransactions(params)
  }

  const handleItemClick = (item) => {
    // 银行交易暂无独立详情页
  }
</script>
