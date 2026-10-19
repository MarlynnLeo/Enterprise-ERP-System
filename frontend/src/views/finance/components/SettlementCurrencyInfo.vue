<template>
  <el-form-item label="原币币种">
    <span>{{ currency === 'USD' ? '美元 USD' : currency === 'CNY' ? '人民币 CNY' : currency }}</span>
  </el-form-item>
  <el-form-item label="会计凭证">
    <span>收付款登记成功后自动生成</span>
  </el-form-item>
  <el-alert v-if="retryNotice" :title="retryNotice" type="warning" :closable="false" class="mb-md" />
  <template v-if="currency !== 'CNY'">
    <el-form-item label="确认汇率">
      <span>{{ validRate ? `1 ${currency} = ${form.exchangeRate} CNY` : '发票尚无有效的确认汇率' }}</span>
    </el-form-item>
    <el-form-item label="预计本位金额">
      <div>
        <div>{{ validRate ? formatSettlementAmount(Number(form.amount || 0) * Number(form.exchangeRate)) : '-' }} CNY</div>
        <div class="currency-hint">收付款金额按发票原币录入，沿用确认汇率。最后一次核销会吸收舍入尾差，实际人民币本位金额以保存后的记录为准。</div>
      </div>
    </el-form-item>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { formatSettlementAmount, settlementCurrency } from './settlementCurrency'

const props = defineProps({ form: { type: Object, required: true }, retryNotice: String })
const currency = computed(() => settlementCurrency(props.form))
const validRate = computed(() => Number.isFinite(Number(props.form.exchangeRate)) && Number(props.form.exchangeRate) > 0)
</script>

<style scoped>
.currency-hint { color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; }
</style>
