<template>
  <div class="detail-page">
    <NavBar :title="pageTitle" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="state">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else-if="transaction" class="content">
      <div class="hero">
        <div>
          <div class="amount">{{ money(transaction.amount) }}</div>
          <div class="desc">{{ transaction.relatedParty || pageTitle }}</div>
        </div>
        <Tag :type="transaction.is_reconciled ? 'success' : 'warning'">
          {{ transaction.is_reconciled ? '已对账' : '未对账' }}
        </Tag>
      </div>

      <CellGroup inset title="交易信息">
        <Cell title="交易编号" :value="transaction.transactionNumber || transaction.transactionNo || '-'" />
        <Cell title="交易日期" :value="dateText(transaction.transactionDate)" />
        <Cell title="交易类型" :value="transaction.transactionType || '-'" />
        <Cell title="账户" :value="transaction.accountName || transaction.cashAccountName || '-'" />
        <Cell title="往来方" :value="transaction.relatedParty || '-'" />
        <Cell title="凭证" :value="transaction.entryNumber || transaction.voucherNo || '-'" />
      </CellGroup>

      <CellGroup inset title="附加信息">
        <Cell title="创建时间" :value="dateTimeText(transaction.createdAt)" />
        <Cell title="更新时间" :value="dateTimeText(transaction.updatedAt)" />
        <Cell title="备注" :label="transaction.notes || transaction.remark || transaction.description || '-'" />
      </CellGroup>
    </div>

    <Empty v-else description="交易记录不存在" />
  </div>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Cell, CellGroup, Empty, Loading, NavBar, Tag } from 'vant'
  import { financeApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(true)
  const transaction = ref(null)

  const isCash = computed(() => route.path.includes('/cash-transactions/'))
  const pageTitle = computed(() => (isCash.value ? '现金交易详情' : '银行交易详情'))

  const money = (value) => {
    if (value === null || value === undefined || value === '') return '--'
    const amount = Number(value)
    return Number.isNaN(amount) ? '--' : `¥${amount.toFixed(2)}`
  }
  const dateText = (value) => (value ? String(value).slice(0, 10) : '-')
  const dateTimeText = (value) => (value ? new Date(value).toLocaleString('zh-CN') : '-')

  const fetchDetail = async () => {
    loading.value = true
    try {
      const response = isCash.value
        ? await financeApi.getCashTransaction(route.params.id)
        : await financeApi.getBankTransaction(route.params.id)
      transaction.value = extractApiData(response, null)
    } catch (error) {
      console.error('加载交易详情失败:', error)
    } finally {
      loading.value = false
    }
  }

  onMounted(fetchDetail)
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .hero {
    margin: 0 12px 12px;
    padding: 16px;
    border-radius: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--surface-border);
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .amount {
    font-size: 20px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .desc {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .state {
    padding-top: 35vh;
  }
</style>
