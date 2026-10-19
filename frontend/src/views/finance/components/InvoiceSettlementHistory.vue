<template>
  <section class="invoice-settlement-history">
    <el-divider>{{ kind === 'ar' ? '收款与核销记录' : '付款与核销记录' }}</el-divider>
    <div v-if="error" role="alert" class="history-feedback">
      <span>{{ error }}</span>
      <el-button link type="primary" :disabled="loading" @click="$emit('retry')">重新加载核销记录</el-button>
    </div>
    <p v-else-if="loading" role="status">正在加载核销记录…</p>
    <template v-else-if="records.length">
      <p class="history-note">共 {{ records.length }} 条记录；已作废记录保留供追溯，不计入已核销金额。人民币本位核销金额以保存结果为准。</p>
      <el-table :data="pageRecords" border class="w-full" :row-key="row => row.itemId ?? row.id">
        <el-table-column :label="kind === 'ar' ? '收款单号' : '付款单号'" min-width="170">
          <template #default="{ row }">{{ (kind === 'ar' ? row.receiptNumber : row.paymentNumber) || '-' }}</template>
        </el-table-column>
        <el-table-column label="日期" width="110">
          <template #default="{ row }">{{ String(row.receiptDate || row.paymentDate || '').slice(0, 10) || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><el-tag :type="row.status === 'normal' ? 'success' : row.status === 'void' ? 'info' : 'warning'">{{ row.status === 'normal' ? '正常' : row.status === 'void' ? '已作废' : '状态未知' }}</el-tag></template>
        </el-table-column>
        <el-table-column :label="kind === 'ar' ? '实收金额（原币）' : '实付金额（原币）'" min-width="160" align="right">
          <template #default="{ row }">{{ formatSettlementAmount(row.amount, recordCurrency(row)) }}</template>
        </el-table-column>
        <el-table-column label="核销金额（原币）" min-width="160" align="right">
          <template #default="{ row }">{{ formatSettlementAmount(row.settlementAmount, recordCurrency(row)) }}</template>
        </el-table-column>
        <el-table-column label="本位核销金额（CNY）" min-width="180" align="right">
          <template #default="{ row }">{{ formatSettlementAmount(row.baseSettlementAmount) }}</template>
        </el-table-column>
        <el-table-column label="备注 / 作废原因" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.status === 'void' ? row.voidReason || '未记录作废原因' : row.notes || '-' }}</template>
        </el-table-column>
      </el-table>
      <el-pagination v-if="records.length > pageSize" v-model:current-page="currentPage" :page-size="pageSize" :total="records.length" layout="total, prev, pager, next" class="history-pagination" />
    </template>
    <EmptyState v-else description="暂无核销记录" :image-size="72" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { formatSettlementAmount, settlementCurrency } from './settlementCurrency';

const props = defineProps({
  kind: { type: String, required: true },
  records: { type: Array, default: () => [] },
  invoice: { type: Object, default: () => ({}) },
  loading: Boolean,
  error: { type: String, default: '' },
});
defineEmits(['retry']);
const currentPage = ref(1);
const pageSize = 10;
const pageRecords = computed(() => props.records.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize));
const recordCurrency = row => settlementCurrency(row.currencyCode || row.currency || props.invoice);
watch(() => props.records, () => { currentPage.value = 1; });
</script>

<style scoped>
.invoice-settlement-history { min-width: 0; }
.history-feedback { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--el-color-danger); }
.history-note { color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
.history-pagination { margin-top: 16px; justify-content: flex-end; max-width: 100%; overflow-x: auto; }
</style>
