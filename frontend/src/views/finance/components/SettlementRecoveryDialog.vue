<template>
  <AppDialog :model-value="modelValue" :title="kind === 'receipt' ? '核对未确认的收款' : '核对未确认的付款'" mode="view" width="600px" :show-close="!saving" :close-on-click-modal="!saving" :close-on-press-escape="!saving" @update:model-value="$emit('update:modelValue', $event)">
    <el-alert :title="request.retryNotice.value || '这笔登记尚未确认，请重试原登记以核对结果。'" type="warning" :closable="false" class="mb-md" />
    <el-descriptions v-if="payload" :column="1" border>
      <el-descriptions-item label="关联发票">{{ summary?.invoiceNumber || `发票 #${payload.invoiceId}` }}</el-descriptions-item>
      <el-descriptions-item v-if="summary?.partnerName" :label="kind === 'receipt' ? '客户' : '供应商'">{{ summary.partnerName }}</el-descriptions-item>
      <el-descriptions-item label="日期">{{ payload.receiptDate || payload.paymentDate }}</el-descriptions-item>
      <el-descriptions-item label="原币金额">{{ formatSettlementAmount(payload.amount, payload) }}</el-descriptions-item>
      <el-descriptions-item label="收付款账户">{{ summary?.bankAccountName || (payload.bankAccountId ? `银行账户 #${payload.bankAccountId}` : '现金 / 其他') }}</el-descriptions-item>
      <el-descriptions-item label="备注">{{ payload.notes || '-' }}</el-descriptions-item>
    </el-descriptions>
    <template #footer>
      <el-button :disabled="saving" @click="$emit('update:modelValue', false)">稍后核对</el-button>
      <el-button v-permission="kind === 'receipt' ? 'finance:ar:receive' : 'finance:ap:pay'" type="primary" :loading="saving" @click="recover">重试原登记</el-button>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { financeApi } from '@/api/finance';
import { getApiErrorMessage } from '@/utils/errorHandler';
import { formatSettlementAmount } from './settlementCurrency';

const props = defineProps({ modelValue: Boolean, kind: { type: String, required: true }, request: { type: Object, required: true } });
const emit = defineEmits(['update:modelValue', 'resolved']);
const payload = computed(() => props.request.pending.value?.payload);
const summary = computed(() => props.request.pending.value?.summary);
const saving = ref(false);
const recover = async () => {
  if (saving.value) return;
  saving.value = true;
  try {
    await props.request.replay(props.kind === 'receipt' ? financeApi.createReceipt : financeApi.createPayment);
    ElMessage.success('原登记已核对成功');
    emit('update:modelValue', false);
    emit('resolved');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '核对原登记失败，请保持原内容重试'));
    if (!props.request.pending.value) emit('update:modelValue', false);
  } finally { saving.value = false; }
};
const closeForSessionChange = () => emit('update:modelValue', false);
onMounted(() => window.addEventListener('erp:session-changed', closeForSessionChange));
onBeforeUnmount(() => window.removeEventListener('erp:session-changed', closeForSessionChange));
</script>
