<template>
  <div class="create-page">
    <NavBar title="新建收款" left-arrow @click-left="router.back()" />

    <VanForm class="form-body" @submit="submitForm">
      <CellGroup inset title="关联发票">
        <Field
          v-model="selectedInvoiceText"
          label="应收发票"
          placeholder="请选择待收款发票"
          readonly
          is-link
          :rules="[{ required: true, message: '请选择应收发票' }]"
          @click="openInvoiceSheet"
        />
        <Field v-model="form.invoiceId" label="发票ID" placeholder="也可手动输入" type="digit" />
      </CellGroup>

      <CellGroup inset title="收款信息">
        <Field v-model="form.receiptDate" label="收款日期" type="date" :rules="[{ required: true, message: '请选择收款日期' }]" />
        <Field v-model="form.amount" label="收款金额" type="number" placeholder="请输入收款金额" :rules="[{ required: true, message: '请输入收款金额' }]" />
        <Field v-model="paymentMethodText" label="支付方式" readonly is-link @click="showMethodSheet = true" />
        <Field v-model="form.referenceNumber" label="参考号" placeholder="选填" />
        <Field v-model="form.notes" label="备注" type="textarea" rows="3" autosize placeholder="选填" />
      </CellGroup>

      <div class="submit-bar">
        <VanButton round block type="primary" native-type="submit" :loading="submitting">保存收款</VanButton>
      </div>
    </VanForm>

    <ActionSheet v-model:show="showInvoiceSheet" :actions="invoiceActions" cancel-text="取消" close-on-click-action @select="selectInvoice" />
    <ActionSheet v-model:show="showMethodSheet" :actions="paymentMethodActions" cancel-text="取消" close-on-click-action @select="selectMethod" />
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { ActionSheet, Button as VanButton, CellGroup, Field, Form as VanForm, NavBar, showToast } from 'vant'
  import { financeApi } from '@/api'
  import { extractApiList, extractApiData } from '@/utils/apiHelper'

  const router = useRouter()
  const submitting = ref(false)
  const showInvoiceSheet = ref(false)
  const showMethodSheet = ref(false)
  const invoices = ref([])

  const form = reactive({
    invoiceId: '',
    receiptDate: new Date().toISOString().slice(0, 10),
    amount: '',
    paymentMethod: 'cash',
    referenceNumber: '',
    notes: ''
  })

  const paymentMethodActions = [
    { name: '现金', value: 'cash' },
    { name: '电子支付', value: 'electronic' },
    { name: '其他', value: 'other' }
  ]

  const paymentMethodText = computed(() => paymentMethodActions.find((item) => item.value === form.paymentMethod)?.name || '现金')

  const selectedInvoiceText = computed(() => {
    const invoice = invoices.value.find((item) => String(item.id) === String(form.invoiceId))
    if (!invoice) return form.invoiceId ? `发票ID ${form.invoiceId}` : ''
    return `${invoice.invoiceNumber || invoice.code || invoice.id} · ${invoice.customerName || '客户'}`
  })

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '--'
    const amount = Number(value)
    return Number.isNaN(amount) ? '--' : `¥${amount.toFixed(2)}`
  }

  const invoiceActions = computed(() =>
    invoices.value.map((invoice) => ({
      name: `${invoice.invoiceNumber || invoice.id} · ${invoice.customerName || '客户'} · ${formatMoney(invoice.balanceAmount ?? invoice.totalAmount)}`,
      value: invoice.id,
      invoice
    }))
  )

  const openInvoiceSheet = () => {
    if (!invoiceActions.value.length) {
      showToast('暂无可选发票，可手动填写发票ID')
      return
    }
    showInvoiceSheet.value = true
  }

  const selectInvoice = (action) => {
    form.invoiceId = action.value
    form.amount = String(action.invoice.balanceAmount ?? action.invoice.totalAmount ?? form.amount ?? '')
  }

  const selectMethod = (action) => {
    form.paymentMethod = action.value
  }

  const loadInvoices = async () => {
    try {
      const response = await financeApi.getARUnpaidInvoices({ page: 1, pageSize: 50 })
      invoices.value = extractApiList(response)
    } catch {
      try {
        const response = await financeApi.getARInvoices({ page: 1, pageSize: 50 })
        invoices.value = extractApiList(response)
      } catch {
        invoices.value = []
      }
    }
  }

  const submitForm = async () => {
    if (!form.invoiceId) return showToast('请选择或填写应收发票')
    if (Number(form.amount) <= 0) return showToast('收款金额必须大于0')

    submitting.value = true
    try {
      const response = await financeApi.createARReceipt({
        invoiceId: Number(form.invoiceId),
        receiptDate: form.receiptDate,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        referenceNumber: form.referenceNumber || undefined,
        notes: form.notes || undefined
      })
      const id = extractApiData(response, {})?.id
      showToast({ type: 'success', message: '收款已创建' })
      router.replace(id ? `/finance/ar/receipts/${id}` : '/finance/ar/receipts')
    } catch (error) {
      showToast(error.response?.data?.message || '创建收款失败')
    } finally {
      submitting.value = false
    }
  }

  onMounted(loadInvoices)
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
