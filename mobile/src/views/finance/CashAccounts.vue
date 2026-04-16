<!--
/**
 * CashAccounts.vue - 银行账户
 * @description 现金银行账户管理页面
 * @date 2026-04-15
 */
-->
<template>
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadAccounts"
    :show-add="false"
    list-title="银行账户"
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
    title: '银行账户',
    searchPlaceholder: '搜索账户名称或账号',
    fields: {
      id: 'id',
      title: (item) => item.accountName || item.account_name || '',
      subtitle: (item) => item.accountNumber || item.account_number || '',
      icon: 'bank',
      details: [
        { label: '开户行', field: (item) => item.bankName || item.bank_name || '—' },
        { label: '账号', field: (item) => item.accountNumber || item.account_number || '—' },
        { label: '币种', field: (item) => item.currency || item.currency_code || 'CNY' },
        {
          label: '余额',
          field: (item) => item.balance ?? item.current_balance ?? 0,
          prefix: '¥',
          format: 'money'
        }
      ],
      status: {
        field: 'status',
        map: {
          active: { text: '正常', class: 'status-success' },
          frozen: { text: '冻结', class: 'status-danger' },
          1: { text: '正常', class: 'status-success' },
          0: { text: '停用', class: 'status-default' },
          true: { text: '正常', class: 'status-success' },
          false: { text: '停用', class: 'status-default' }
        }
      }
    }
  }))

  const loadAccounts = async (params) => {
    return await financeApi.getCashAccounts(params)
  }

  const handleItemClick = (item) => {
    router.push(`/finance/cash/accounts/${item.id}`)
  }
</script>
