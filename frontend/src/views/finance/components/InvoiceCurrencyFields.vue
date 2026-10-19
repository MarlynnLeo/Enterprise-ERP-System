<template>
  <el-row :gutter="20">
    <el-col :span="12">
      <el-form-item label="币种" prop="currencyCode">
        <el-select v-model="editable.currencyCode" :disabled="invoiceCurrencyLocked(form)" class="w-full" @change="changeCurrency">
          <el-option label="人民币 CNY" value="CNY" />
          <el-option label="美元 USD" value="USD" />
        </el-select>
      </el-form-item>
    </el-col>
    <el-col :span="12">
      <el-form-item :label="form.currencyCode === 'USD' ? '汇率 USD/CNY' : '人民币汇率'" prop="exchangeRate">
        <el-input v-model="editable.exchangeRate" :disabled="form.currencyCode === 'CNY' || invoiceCurrencyLocked(form)" inputmode="decimal" placeholder="1 USD 对应的人民币金额" />
      </el-form-item>
    </el-col>
  </el-row>
  <p class="invoice-currency-hint">明细及合计均为 {{ form.currencyCode }} 原币金额；切换币种后请重新录入单价。美元汇率最多 8 位小数，确认发票后固定。</p>
</template>

<script setup>
import { computed } from 'vue'
import { invoiceCurrencyLocked } from './invoiceCurrency'
const props = defineProps({ form: { type: Object, required: true } })
const editable = computed(() => props.form)
const changeCurrency = currency => {
  editable.value.exchangeRate = currency === 'CNY' ? 1 : null
  for (const item of editable.value.items || []) {
    item.unitPrice = 0
    item.amount = 0
  }
}
</script>

<style scoped>
.invoice-currency-hint { margin: 0 0 16px; color: var(--color-text-secondary); font-size: 12px; line-height: 1.5; }
</style>
