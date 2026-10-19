<template>
  <span v-if="isCreditNote" @click.stop>
    <el-button v-if="Number(invoice.balanceAmount) < 0" v-permission="refundPermission" type="success" size="small" :disabled="!supportedCurrency" @click="openRefund">{{ kind === 'ar' ? '客户退款' : '收取退款' }}</el-button>
    <el-button v-permission="'finance:tax:create'" size="small" :disabled="!supportedCurrency" @click="openRedLetter">红字税票</el-button>
    <span v-if="!supportedCurrency" class="credit-currency-note">{{ settlementCurrency(invoice) }} 退款及红字税票暂不支持</span>
    <AppDialog v-model="refundVisible" :title="kind === 'ar' ? '登记客户退款' : '登记供应商退款'" mode="form" width="560px" :show-close="!savingRefund" :close-on-press-escape="!savingRefund" :close-on-click-modal="!savingRefund">
      <el-alert :title="`${invoice.invoiceNumber}，可退金额 ${formatSettlementAmount(Math.abs(Number(invoice.balanceAmount)), invoice)}`" type="info" :closable="false" class="mb-md" />
      <el-form ref="refundRef" :model="refundForm" :rules="refundRules" :disabled="savingRefund" label-width="100px">
        <el-form-item label="退款日期" prop="refundDate"><el-date-picker v-model="refundForm.refundDate" value-format="YYYY-MM-DD" type="date" class="w-full" /></el-form-item>
        <el-form-item label="退款金额" prop="amount"><el-input-number v-model="refundForm.amount" :min="0.01" :max="Math.abs(Number(invoice.balanceAmount))" :precision="2" class="w-full" /></el-form-item>
        <el-form-item :label="kind === 'ar' ? '退款账户' : '收款账户'" prop="bankAccountId"><el-select v-model="refundForm.bankAccountId" :loading="accountsLoading" placeholder="请选择银行账户" class="w-full"><el-option v-for="account in accounts" :key="account.id" :value="account.id" :label="`${account.bankName} - ${account.accountName}（${formatCurrency(account.balance)}）`" /></el-select></el-form-item>
        <el-form-item label="备注"><el-input v-model="refundForm.notes" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="savingRefund" @click="refundVisible = false">取消</el-button><el-button type="primary" :loading="savingRefund" @click="saveRefund">确认退款</el-button></template>
    </AppDialog>
    <AppDialog v-model="redVisible" title="开具红字税票" mode="form" width="600px" :show-close="!savingRed" :close-on-press-escape="!savingRed" :close-on-click-modal="!savingRed">
      <el-alert :title="`红字金额 ${formatSettlementAmount(invoice.totalAmount, invoice)}，税额 ${formatSettlementAmount(invoice.taxAmount, invoice)}`" type="info" :closable="false" class="mb-md" />
      <el-form ref="redRef" :model="redForm" :rules="redRules" :disabled="savingRed" label-width="110px">
        <el-form-item label="原税票" prop="originalTaxInvoiceId"><el-select v-model="redForm.originalTaxInvoiceId" :loading="originalsLoading" placeholder="选择对应的已认证原税票" class="w-full"><el-option v-for="original in originals" :key="original.id" :value="original.id" :label="`${original.invoiceNumber}（${formatCurrency(original.totalAmount)}）`" /></el-select></el-form-item>
        <el-form-item label="红字税票号码" prop="invoiceNumber"><el-input v-model="redForm.invoiceNumber" placeholder="填写红字税票号码" maxlength="100" /></el-form-item>
        <el-form-item label="开票日期" prop="invoiceDate"><el-date-picker v-model="redForm.invoiceDate" type="date" value-format="YYYY-MM-DD" class="w-full" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="redForm.notes" type="textarea" /></el-form-item>
      </el-form>
      <template #footer><el-button :disabled="savingRed" @click="redVisible = false">取消</el-button><el-button type="primary" :loading="savingRed" @click="saveRedLetter">保存红字税票</el-button></template>
    </AppDialog>
  </span>
</template>
<script setup>
import { getApiErrorMessage } from '@/utils/errorHandler'
import { computed, nextTick, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { financeApi } from '@/api/finance';
import { parseListData } from '@/utils/responseParser';
import { formatCurrency, formatLocalDate } from '@/utils/format';
import { formatSettlementAmount, matchingSettlementBanks, settlementCurrency } from './settlementCurrency';
import { loadSettlementBankAccounts } from './loadSettlementBankAccounts';
const props = defineProps({ kind: { type: String, required: true }, invoice: { type: Object, required: true } });
const emit = defineEmits(['changed']);
const isCreditNote = computed(() => Number(props.invoice.totalAmount) < 0 && ['已确认', '部分付款', '已付款', '已逾期'].includes(props.invoice.status));
const supportedCurrency = computed(() => settlementCurrency(props.invoice) === 'CNY');
const refundPermission = computed(() => props.kind === 'ar' ? 'finance:ar:receive' : 'finance:ap:pay');
const refundVisible = ref(false), redVisible = ref(false), refundRef = ref(null), redRef = ref(null);
const accounts = ref([]), originals = ref([]), accountsLoading = ref(false), originalsLoading = ref(false), savingRefund = ref(false), savingRed = ref(false);
const refundForm = reactive({ amount: 0, refundDate: '', bankAccountId: null, notes: '', requestId: '' });
const redForm = reactive({ originalTaxInvoiceId: null, invoiceNumber: '', invoiceDate: '', notes: '' });
const refundRules = {
  refundDate: [{ required: true, message: '请选择退款日期', trigger: 'change' }],
  bankAccountId: [{ required: true, message: '请选择银行账户', trigger: 'change' }],
  amount: [{ validator: (_rule, value, callback) => { const amount = Math.round(Number(value) * 100); callback(Number.isFinite(amount) && amount > 0 && amount <= Math.abs(Math.round(Number(props.invoice.balanceAmount) * 100)) ? undefined : new Error('请输入可退余额以内的正数金额')); }, trigger: 'blur' }],
};
const redRules = Object.fromEntries([['originalTaxInvoiceId', '请选择原税票'], ['invoiceNumber', '请输入红字税票号码'], ['invoiceDate', '请选择开票日期']].map(([key, message]) => [key, [{ required: true, message, trigger: 'change' }]]));
const showError = error => ElMessage.error(getApiErrorMessage(error, '操作失败'));
const openRefund = async () => {
  if (!supportedCurrency.value || savingRefund.value) return;
  Object.assign(refundForm, { amount: Math.abs(Number(props.invoice.balanceAmount)), refundDate: formatLocalDate(new Date()), bankAccountId: null, notes: '', requestId: crypto.randomUUID() });
  refundVisible.value = true; await nextTick(); refundRef.value?.clearValidate();
  accountsLoading.value = true;
  accounts.value = [];
  try { accounts.value = matchingSettlementBanks(await loadSettlementBankAccounts(financeApi), props.invoice); }
  catch (error) { showError(error); }
  finally { accountsLoading.value = false; }
};
const saveRefund = async () => {
  if (!supportedCurrency.value || savingRefund.value) return;
  savingRefund.value = true;
  try {
    if (!(await refundRef.value?.validate().catch(() => false))) return;
    if (!accounts.value.some(account => String(account.id) === String(refundForm.bankAccountId))) { ElMessage.warning('请选择人民币银行账户'); return; }
    await financeApi.createCreditNoteRefund(props.kind, { ...refundForm, invoiceId: props.invoice.id }); ElMessage.success('退款已登记'); refundVisible.value = false; emit('changed'); }
  catch (error) { showError(error); }
  finally { savingRefund.value = false; }
};
const openRedLetter = async () => {
  if (!supportedCurrency.value || savingRed.value) return;
  Object.assign(redForm, { originalTaxInvoiceId: null, invoiceNumber: '', invoiceDate: formatLocalDate(new Date()), notes: '' });
  redVisible.value = true; await nextTick(); redRef.value?.clearValidate();
  originalsLoading.value = true;
  try { originals.value = parseListData(await financeApi.tax.getRedLetterOriginals({ kind: props.kind, invoiceId: props.invoice.id }), { enableLog: false }); if (originals.value.length === 1) redForm.originalTaxInvoiceId = originals.value[0].id; }
  catch (error) { showError(error); }
  finally { originalsLoading.value = false; }
};
const saveRedLetter = async () => {
  if (!supportedCurrency.value || savingRed.value) return;
  savingRed.value = true;
  try {
    if (!(await redRef.value?.validate().catch(() => false))) return;
    await financeApi.tax.createRedLetter({ ...redForm, kind: props.kind, invoiceId: props.invoice.id }); ElMessage.success('红字税票已保存，请到税务发票页完成认证'); redVisible.value = false; emit('changed'); }
  catch (error) { showError(error); }
  finally { savingRed.value = false; }
};
</script>
<style scoped>
.credit-currency-note { display: block; color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.5; }
</style>
