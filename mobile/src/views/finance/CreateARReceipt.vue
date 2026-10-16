<template>
  <div class="create-page" :inert="submitting" :aria-busy="submitting">
    <NavBar title="新建收款" left-arrow @click-left="router.back()" />

    <VanForm class="form-body" @submit="submitForm" :disabled="submitting || submitted" :inert="submitting || submitted">
      <CellGroup inset title="关联发票">
        <Field
          :model-value="selectedInvoiceText"
          label="应收发票"
          placeholder="请选择待收款发票"
          readonly
          is-link
          :rules="[{ required: true, message: '请选择应收发票' }]"
          @click="openInvoiceSheet"
        />
      </CellGroup>

      <CellGroup inset title="收款信息">
        <Field v-model="form.receiptDate" label="收款日期" type="date" :rules="[{ required: true, message: '请选择收款日期' }]" />
        <Field v-model="form.amount" label="收款金额" type="number" placeholder="请输入收款金额" :rules="[{ required: true, message: '请输入收款金额' }]" />
        <Field :model-value="paymentMethodText" label="支付方式" readonly is-link @click="showMethodSheet = true" />
        <Field v-if="form.paymentMethod !== 'cash'" :model-value="selectedAccountText" label="收款账户"
          placeholder="请选择收款账户" readonly is-link @click="openAccountSheet"
          :rules="[{ required: true, message: '请选择收款账户' }]" />
        <Field v-model="form.referenceNumber" label="参考号" placeholder="选填" />
        <Field v-model="form.notes" label="备注" type="textarea" rows="3" autosize placeholder="选填" />
      </CellGroup>

      <div class="submit-bar">
        <VanButton round block type="primary" native-type="submit" :loading="submitting" :disabled="submitted">保存收款</VanButton>
      </div>
    </VanForm>

    <Popup v-model:show="showInvoiceSheet" position="bottom" round class="selection-picker">
      <NavBar title="选择待收款发票" right-text="关闭" @click-right="showInvoiceSheet = false" />
      <Search v-model="invoiceKeyword" placeholder="搜索发票号、客户" @search="searchInvoices" @clear="searchInvoices" />
      <div class="selection-options">
        <Cell v-for="invoice in invoices" :key="invoice.id" :title="invoice.invoiceNumber"
          :label="invoice.customerName" :value="formatMoney(invoice.balanceAmount)" is-link @click="selectInvoice(invoice)" />
        <Empty v-if="invoicesInitialized && !invoicesLoading && !invoices.length && !invoicesError" description="暂无匹配的待收款发票" />
        <VanButton v-if="invoicesError" block plain @click="loadMoreInvoices()">加载失败，点击重试</VanButton>
        <VanButton v-else-if="!invoicesFinished" block plain :loading="invoicesLoading" @click="loadMoreInvoices()">加载更多</VanButton>
      </div>
    </Popup>
    <Popup v-model:show="showAccountSheet" position="bottom" round class="selection-picker">
      <NavBar title="选择收款账户" right-text="关闭" @click-right="showAccountSheet = false" />
      <Search v-model="accountKeyword" placeholder="搜索账户名称" @search="searchAccounts" @clear="searchAccounts" />
      <div class="selection-options">
        <Cell v-for="account in accounts" :key="account.id" :title="account.accountName"
          :label="`${account.bankName || ''} · ${account.accountNumber || ''}`" is-link @click="selectAccount(account)" />
        <Empty v-if="accountsInitialized && !accountsLoading && !accounts.length && !accountsError" description="暂无可用收款账户" />
        <VanButton v-if="accountsError" block plain @click="loadMoreAccounts()">加载失败，点击重试</VanButton>
        <VanButton v-else-if="!accountsFinished" block plain :loading="accountsLoading" @click="loadMoreAccounts()">加载更多</VanButton>
      </div>
    </Popup>
    <ActionSheet v-model:show="showMethodSheet" :actions="paymentMethodActions" cancel-text="取消" close-on-click-action @select="selectMethod" />
  </div>
</template>

<script setup>
  import { computed, onBeforeUnmount, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ActionSheet, Button as VanButton, Cell, CellGroup, Empty, Field, Form as VanForm, NavBar, Popup, Search, showToast } from 'vant'
  import { financeApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'
  import { getApiErrorMessage } from '@/utils/errorHandler'
  import { usePagination } from '@/composables/usePagination'
  import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
  import dayjs from 'dayjs'

  const router = useRouter()
  const submitting = ref(false)
  const submitted = ref(false)
  let disposed = false
  onBeforeUnmount(() => { disposed = true })
  const showInvoiceSheet = ref(false)
  const showMethodSheet = ref(false)
  const showAccountSheet = ref(false)
  const selectedInvoice = ref(null)
  const selectedAccount = ref(null)
  const invoiceKeyword = ref('')
  const accountKeyword = ref('')
  const {
    list: invoices, loading: invoicesLoading, finished: invoicesFinished,
    error: invoicesError, initialized: invoicesInitialized,
    onLoad: loadMoreInvoices, onRefresh: refreshInvoices
  } = usePagination(params => financeApi.getARUnpaidInvoices(params), { immediate: false })
  const {
    list: accounts, loading: accountsLoading, finished: accountsFinished,
    error: accountsError, initialized: accountsInitialized,
    onLoad: loadMoreAccounts, onRefresh: refreshAccounts
  } = usePagination(params => financeApi.getARReceiptAccounts(params), { immediate: false })

  const form = reactive({
    invoiceId: '',
    receiptDate: dayjs().format('YYYY-MM-DD'),
    amount: '',
    paymentMethod: 'cash',
    bankAccountId: '',
    referenceNumber: '',
    notes: ''
  })
  const { markSaved } = useUnsavedChanges(form, { busy: submitting })

  const paymentMethodActions = [
    { name: '现金', value: 'cash' },
    { name: '银行转账', value: 'bank_transfer' },
    { name: '支票', value: 'check' },
    { name: '电子支付', value: 'electronic' },
  ]

  const paymentMethodText = computed(() => paymentMethodActions.find((item) => item.value === form.paymentMethod)?.name || '现金')

  const selectedInvoiceText = computed(() => {
    const invoice = selectedInvoice.value
    if (!invoice) return ''
    return `${invoice.invoiceNumber || invoice.code || '未命名发票'} · ${invoice.customerName || '客户'}`
  })

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '--'
    const amount = Number(value)
    return Number.isNaN(amount) ? '--' : `¥${amount.toFixed(2)}`
  }

  const selectedAccountText = computed(() => selectedAccount.value
    ? `${selectedAccount.value.accountName} · ${selectedAccount.value.accountNumber || ''}` : '')
  const searchInvoices = () => refreshInvoices({ keyword: invoiceKeyword.value.trim() || undefined })
  const searchAccounts = () => refreshAccounts({ keyword: accountKeyword.value.trim() || undefined })

  const openInvoiceSheet = () => {
    if (submitting.value || submitted.value || disposed) return
    showInvoiceSheet.value = true
    searchInvoices()
  }

  const selectInvoice = (invoice) => {
    if (submitting.value || submitted.value || disposed) return
    selectedInvoice.value = invoice
    form.invoiceId = invoice.id
    form.amount = String(invoice.balanceAmount ?? '')
    showInvoiceSheet.value = false
  }
  const openAccountSheet = () => {
    if (submitting.value || submitted.value || disposed) return
    showAccountSheet.value = true
    searchAccounts()
  }
  const selectAccount = (account) => {
    if (submitting.value || submitted.value || disposed) return
    selectedAccount.value = account
    form.bankAccountId = account.id
    showAccountSheet.value = false
  }

  const selectMethod = (action) => {
    if (submitting.value || submitted.value || disposed) return
    form.paymentMethod = action.value
    if (action.value === 'cash') {
      form.bankAccountId = ''
      selectedAccount.value = null
    }
  }

  const submitForm = async () => {
    if (submitting.value || submitted.value || disposed) return
    if (!form.invoiceId) return showToast('请选择或填写应收发票')
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return showToast('收款金额必须为有效正数')
    const balance = Number(selectedInvoice.value?.balanceAmount)
    if (!Number.isFinite(balance) || balance <= 0) return showToast('发票余额无效，请重新选择发票')
    if (Number(form.amount) > balance) return showToast('收款金额不能超过发票未收余额')
    if (form.paymentMethod !== 'cash' && !form.bankAccountId) return showToast('请选择收款账户')

    submitting.value = true
    showInvoiceSheet.value = false
    showAccountSheet.value = false
    showMethodSheet.value = false
    const submittedForm = JSON.parse(JSON.stringify(form))
    try {
      const response = await financeApi.createARReceipt({
        invoiceId: Number(submittedForm.invoiceId),
        receiptDate: submittedForm.receiptDate,
        amount: Number(submittedForm.amount),
        paymentMethod: submittedForm.paymentMethod,
        bankAccountId: submittedForm.paymentMethod === 'cash' ? undefined : Number(submittedForm.bankAccountId),
        referenceNumber: submittedForm.referenceNumber || undefined,
        notes: submittedForm.notes || undefined
      })
      if (disposed) return
      const id = extractApiData(response, {})?.id
      submitted.value = true
      showToast({ type: 'success', message: '收款已创建' })
      markSaved(submittedForm)
      submitting.value = false
      await router.replace(id ? `/finance/ar/receipts/${id}` : '/finance/ar/receipts')
    } catch (error) {
      if (!disposed) showToast(submitted.value
        ? '收款已创建，页面跳转失败，请从收款列表查看'
        : getApiErrorMessage(error, '创建收款失败'))
    } finally {
      submitting.value = false
    }
  }

</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background: var(--bg-primary);
    padding-bottom: var(--app-fixed-control-space);
  }

  .form-body {
    padding: 12px 0;
  }
  .selection-picker { height: 70vh; display: flex; flex-direction: column; }
  .selection-options { overflow-y: auto; flex: 1; padding-bottom: var(--app-fixed-control-padding-bottom); }

  .submit-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 10px 16px var(--app-fixed-control-padding-bottom);
    background: var(--bg-primary);
    border-top: 1px solid var(--surface-border);
  }
</style>
