<template>
  <div v-if="error" role="alert" class="bank-account-feedback">
    <span>{{ error }}</span>
    <el-button link type="primary" :disabled="loading" @click="$emit('retry')">重新加载银行账户</el-button>
  </div>
  <div v-else-if="loading" class="bank-account-feedback">正在加载银行账户…</div>
  <div v-else-if="!matchingSettlementBanks(accounts, currency).length" class="bank-account-feedback">
    暂无 {{ settlementCurrency(currency) }} 同币种银行账户
  </div>
</template>

<script setup>
import { matchingSettlementBanks, settlementCurrency } from './settlementCurrency'
defineProps({ error: String, loading: Boolean, accounts: { type: Array, default: () => [] }, currency: { type: [String, Object], default: 'CNY' } })
defineEmits(['retry'])
</script>

<style scoped>
.bank-account-feedback { width: 100%; font-size: 12px; line-height: 1.6; color: var(--color-text-secondary); overflow-wrap: anywhere; }
.bank-account-feedback[role='alert'] { color: var(--el-color-danger); }
</style>
