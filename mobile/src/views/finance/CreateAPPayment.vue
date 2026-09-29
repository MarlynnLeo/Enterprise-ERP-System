<template>
  <div class="create-page">
    <NavBar title="新建付款" left-arrow @click-left="router.back()" />

    <VanForm class="form-body" @submit="submitForm">
      <CellGroup inset title="关联发票">
        <Field
          :model-value="selectedInvoiceText"
          label="应付发票"
          placeholder="请选择待付款发票"
          readonly
          is-link
          :rules="[{ required: true, message: '请选择应付发票' }]"
          @click="openInvoiceSheet"
        />
      </CellGroup>

      <CellGroup inset title="付款信息">
        <Field v-model="form.paymentDate" label="付款日期" type="date" :rules="[{ required: true, message: '请选择付款日期' }]" />
        <Field v-model="form.amount" label="付款金额" type="number" placeholder="请输入付款金额" :rules="[{ required: true, message: '请输入付款金额' }]" />
        <Field model-value="现金" label="支付方式" readonly />
        <Field v-model="form.referenceNumber" label="参考号" placeholder="选填" />
        <Field v-model="form.notes" label="备注" type="textarea" rows="3" autosize placeholder="选填" />
      </CellGroup>

      <div class="submit-bar">
        <VanButton round block type="primary" native-type="submit" :loading="submitting">保存付款</VanButton>
      </div>
    </VanForm>

    <Popup v-model:show="showInvoiceSheet" position="bottom" round class="invoice-picker">
      <NavBar title="选择待付款发票" right-text="关闭" @click-right="showInvoiceSheet = false" />
      <Search v-model="invoiceKeyword" placeholder="搜索发票号、供应商" @search="searchInvoices" @clear="searchInvoices" />
      <div class="invoice-options">
        <Cell v-for="invoice in invoices" :key="invoice.id" :title="invoice.invoiceNumber"
          :label="invoice.supplierName" :value="formatMoney(invoice.balanceAmount)" is-link @click="selectInvoice(invoice)" />
        <Empty v-if="invoicesInitialized && !invoicesLoading && !invoices.length && !invoicesError" description="暂无匹配的待付款发票" />
        <VanButton v-if="invoicesError" block plain @click="loadMoreInvoices()">加载失败，点击重试</VanButton>
        <VanButton v-else-if="!invoicesFinished" block plain :loading="invoicesLoading" @click="loadMoreInvoices()">加载更多</VanButton>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { computed, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Button as VanButton, Cell, CellGroup, Empty, Field, Form as VanForm, NavBar, Popup, Search, showToast } from 'vant'
  import { financeApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'
  import { getApiErrorMessage } from '@/utils/errorHandler'
  import { usePagination } from '@/composables/usePagination'

  const router = useRouter()
  const submitting = ref(false)
  const showInvoiceSheet = ref(false)
  const invoiceKeyword = ref('')
  const selectedInvoice = ref(null)
  const {
    list: invoices, loading: invoicesLoading, finished: invoicesFinished,
    error: invoicesError, initialized: invoicesInitialized,
    onLoad: loadMoreInvoices, onRefresh: refreshInvoices
  } = usePagination(params => financeApi.getAPInvoices(params), { immediate: false })

  const form = reactive({
    invoiceId: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: '',
    referenceNumber: '',
    notes: ''
  })

  const selectedInvoiceText = computed(() => {
    const invoice = selectedInvoice.value
    if (!invoice) return ''
    return `${invoice.invoiceNumber || invoice.code || '未命名发票'} · ${invoice.supplierName || '供应商'}`
  })

  const formatMoney = (value) => {
    if (value === null || value === undefined || value === '') return '--'
    const amount = Number(value)
    return Number.isNaN(amount) ? '--' : `¥${amount.toFixed(2)}`
  }

  const searchInvoices = () => refreshInvoices({
    payableOnly: true,
    keyword: invoiceKeyword.value.trim() || undefined
  })

  const openInvoiceSheet = () => {
    showInvoiceSheet.value = true
    searchInvoices()
  }

  const selectInvoice = (invoice) => {
    selectedInvoice.value = invoice
    form.invoiceId = invoice.id
    form.amount = String(invoice.balanceAmount)
    showInvoiceSheet.value = false
  }

  const submitForm = async () => {
    if (submitting.value) return
    if (!form.invoiceId) return showToast('请选择或填写应付发票')
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return showToast('付款金额必须大于0')
    if (Number(form.amount) > Number(selectedInvoice.value?.balanceAmount)) return showToast('付款金额不能超过发票未付余额')

    submitting.value = true
    try {
      const response = await financeApi.createAPPayment({
        invoiceId: Number(form.invoiceId),
        paymentDate: form.paymentDate,
        amount: Number(form.amount),
        paymentMethod: 'cash',
        referenceNumber: form.referenceNumber || undefined,
        notes: form.notes || undefined
      })
      const id = extractApiData(response, {})?.id
      showToast({ type: 'success', message: '付款已创建' })
      router.replace(id ? `/finance/ap/payments/${id}` : '/finance/ap/payments')
    } catch (error) {
      showToast(getApiErrorMessage(error, '创建付款失败'))
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

  .invoice-picker { height: 70vh; display: flex; flex-direction: column; }
  .invoice-options { overflow-y: auto; flex: 1; padding-bottom: var(--app-fixed-control-padding-bottom); }

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
