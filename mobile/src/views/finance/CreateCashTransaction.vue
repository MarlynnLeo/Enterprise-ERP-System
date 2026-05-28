<template>
  <div class="create-page">
    <NavBar title="新建现金交易" left-arrow @click-left="router.back()" />

    <VanForm class="form-body" @submit="submitForm">
      <CellGroup inset title="交易信息">
        <Field v-model="typeText" label="交易类型" readonly is-link @click="showTypeSheet = true" />
        <Field v-model="categoryText" label="交易分类" readonly is-link @click="showCategorySheet = true" />
        <Field v-model="form.transactionDate" label="交易日期" type="date" :rules="[{ required: true, message: '请选择交易日期' }]" />
        <Field v-model="form.amount" label="金额" type="number" placeholder="请输入金额" :rules="[{ required: true, message: '请输入金额' }]" />
        <Field v-model="form.counterparty" label="交易对方" placeholder="选填" />
        <Field v-model="form.referenceNumber" label="凭证号" placeholder="选填" />
        <Field v-model="form.description" label="交易说明" type="textarea" rows="3" autosize placeholder="请输入交易说明" :rules="[{ required: true, message: '请输入交易说明' }]" />
      </CellGroup>

      <div class="submit-bar">
        <VanButton round block type="primary" native-type="submit" :loading="submitting">保存交易</VanButton>
      </div>
    </VanForm>

    <ActionSheet v-model:show="showTypeSheet" :actions="typeActions" cancel-text="取消" close-on-click-action @select="selectType" />
    <ActionSheet v-model:show="showCategorySheet" :actions="categoryActions" cancel-text="取消" close-on-click-action @select="selectCategory" />
  </div>
</template>

<script setup>
  import { extractApiData } from '@/utils/apiHelper'
  import { computed, reactive, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { ActionSheet, Button as VanButton, CellGroup, Field, Form as VanForm, NavBar, showToast } from 'vant'
  import { financeApi } from '@/services/api'

  const router = useRouter()
  const submitting = ref(false)
  const showTypeSheet = ref(false)
  const showCategorySheet = ref(false)

  const form = reactive({
    type: 'income',
    category: 'sales',
    transactionDate: new Date().toISOString().slice(0, 10),
    amount: '',
    counterparty: '',
    description: '',
    referenceNumber: ''
  })

  const typeActions = [
    { name: '收入', value: 'income' },
    { name: '支出', value: 'expense' }
  ]

  const categoryOptions = {
    income: [
      { name: '销售收入', value: 'sales' },
      { name: '其他收入', value: 'other_income' }
    ],
    expense: [
      { name: '办公支出', value: 'office' },
      { name: '差旅支出', value: 'travel' },
      { name: '餐饮支出', value: 'meal' },
      { name: '其他支出', value: 'other_expense' }
    ]
  }

  const categoryActions = computed(() => categoryOptions[form.type])
  const typeText = computed(() => typeActions.find((item) => item.value === form.type)?.name)
  const categoryText = computed(() => categoryActions.value.find((item) => item.value === form.category)?.name)

  watch(
    () => form.type,
    () => {
      if (!categoryActions.value.some((item) => item.value === form.category)) {
        form.category = categoryActions.value[0].value
      }
    }
  )

  const selectType = (action) => {
    form.type = action.value
  }

  const selectCategory = (action) => {
    form.category = action.value
  }

  const submitForm = async () => {
    if (Number(form.amount) <= 0) return showToast('金额必须大于0')
    if (!form.description.trim()) return showToast('请输入交易说明')

    submitting.value = true
    try {
      const response = await financeApi.createCashTransaction({
        type: form.type,
        transactionDate: form.transactionDate,
        amount: Number(form.amount),
        category: form.category,
        counterparty: form.counterparty || undefined,
        description: form.description.trim(),
        referenceNumber: form.referenceNumber || undefined
      })
      const id = extractApiData(response, {})?.id
      showToast({ type: 'success', message: '现金交易已创建' })
      router.replace(id ? `/finance/cash/cash-transactions/${id}` : '/finance/cash/cash-transactions')
    } catch (error) {
      showToast(error.response?.data?.message || '创建现金交易失败')
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
