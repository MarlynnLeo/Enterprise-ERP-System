<template>
  <div class="create-page">
    <NavBar title="新建凭证" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" :loading="submitting" @click="handleSubmit">保存</Button>
      </template>
    </NavBar>

    <div class="content">
      <CellGroup inset title="凭证信息">
        <Field v-model="form.entry_date" label="记账日期" type="date" />
        <Field v-model="form.document_number" label="单据号" placeholder="可选" />
        <Field v-model="form.description" label="摘要" type="textarea" rows="2" autosize placeholder="请输入凭证摘要" />
      </CellGroup>

      <CellGroup inset title="分录明细">
        <div class="lines">
          <div v-for="(line, index) in lines" :key="index" class="line-card">
            <div class="line-header">
              <span>分录 {{ index + 1 }}</span>
              <Button v-if="lines.length > 2" size="mini" type="danger" plain @click="removeLine(index)">删除</Button>
            </div>
            <Cell title="会计科目" is-link :value="line.account_name || '请选择科目'" @click="openAccountPicker(index)" />
            <Field v-model="line.description" label="摘要" placeholder="默认使用凭证摘要" />
            <Field v-model="line.debit_amount" label="借方金额" type="number" input-align="right" />
            <Field v-model="line.credit_amount" label="贷方金额" type="number" input-align="right" />
          </div>
        </div>

        <div class="summary">
          <span>借方：{{ money(totalDebit) }}</span>
          <span>贷方：{{ money(totalCredit) }}</span>
        </div>

        <div class="add-line">
          <Button type="primary" plain block icon="plus" @click="addLine">添加分录</Button>
        </div>
      </CellGroup>

      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">保存凭证</Button>
      </div>
    </div>

    <Popup v-model:show="showAccountPicker" round position="bottom" :style="{ height: '75%' }">
      <div class="picker-panel">
        <Search v-model="accountKeyword" placeholder="搜索科目编码或名称" />
        <div class="picker-list">
          <Cell
            v-for="account in filteredAccounts"
            :key="account.id"
            :title="account.account_name"
            :label="account.account_code"
            clickable
            @click="pickAccount(account)"
          />
          <Empty v-if="filteredAccounts.length === 0" description="暂无会计科目" />
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Empty, Field, NavBar, Popup, Search, showToast } from 'vant'
  import { financeApi } from '@/api'
  import { extractApiData, extractApiList } from '@/utils/apiHelper'

  const router = useRouter()
  const submitting = ref(false)
  const showAccountPicker = ref(false)
  const accountKeyword = ref('')
  const editingLineIndex = ref(-1)
  const accounts = ref([])

  const form = reactive({
    entry_date: new Date().toISOString().slice(0, 10),
    document_number: '',
    description: ''
  })

  const createLine = () => ({
    account_id: '',
    account_code: '',
    account_name: '',
    description: '',
    debit_amount: '',
    credit_amount: ''
  })

  const lines = ref([createLine(), createLine()])
  const totalDebit = computed(() => lines.value.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0))
  const totalCredit = computed(() => lines.value.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0))

  const filteredAccounts = computed(() => {
    const keyword = accountKeyword.value.trim().toLowerCase()
    if (!keyword) return accounts.value
    return accounts.value.filter((item) =>
      [item.account_code, item.account_name].some((value) => String(value || '').toLowerCase().includes(keyword))
    )
  })

  const money = (value) => {
    if (value === null || value === undefined || value === '') return '--'
    const amount = Number(value)
    return Number.isNaN(amount) ? '--' : `¥${amount.toFixed(2)}`
  }

  const fetchAccounts = async () => {
    const response = await financeApi.getAccounts({ pageSize: 100 })
    accounts.value = extractApiList(response).filter((item) => item.is_active !== 0 && item.is_active !== false)
  }

  const addLine = () => {
    lines.value.push(createLine())
  }

  const removeLine = (index) => {
    lines.value.splice(index, 1)
  }

  const openAccountPicker = (index) => {
    editingLineIndex.value = index
    showAccountPicker.value = true
  }

  const pickAccount = (account) => {
    const line = lines.value[editingLineIndex.value]
    if (line) {
      line.account_id = account.id
      line.account_code = account.account_code
      line.account_name = `${account.account_code} ${account.account_name}`
    }
    showAccountPicker.value = false
  }

  const validateLines = () => {
    const validLines = lines.value.filter((line) => line.account_id && (Number(line.debit_amount) > 0 || Number(line.credit_amount) > 0))
    if (validLines.length < 2) {
      showToast('至少需要两条有效分录')
      return null
    }
    if (Math.round(totalDebit.value * 100) !== Math.round(totalCredit.value * 100)) {
      showToast('借贷金额不平衡')
      return null
    }
    if (totalDebit.value <= 0) {
      showToast('凭证金额必须大于 0')
      return null
    }
    return validLines
  }

  const handleSubmit = async () => {
    if (!form.entry_date) return showToast('请选择记账日期')
    if (!form.description.trim()) return showToast('请输入凭证摘要')
    const validLines = validateLines()
    if (!validLines) return

    submitting.value = true
    try {
      const response = await financeApi.createEntry({
        entry_date: form.entry_date,
        posting_date: form.entry_date,
        document_type: '记账凭证',
        document_number: form.document_number || undefined,
        description: form.description.trim(),
        voucher_word: '记',
        items: validLines.map((line) => ({
          account_id: line.account_id,
          description: line.description || form.description,
          debit_amount: Number(line.debit_amount) || 0,
          credit_amount: Number(line.credit_amount) || 0
        }))
      })
      const data = extractApiData(response, {})
      showToast({ type: 'success', message: '凭证已创建' })
      router.replace(data.entry_id ? `/finance/gl/entries/${data.entry_id}` : '/finance/gl/entries')
    } catch (error) {
      console.error('创建凭证失败:', error)
    } finally {
      submitting.value = false
    }
  }

  onMounted(fetchAccounts)
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .lines {
    padding: 0 12px;
  }

  .line-card {
    padding: 12px 0;
    border-bottom: 1px solid var(--surface-border);
  }

  .line-header,
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 4px 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .add-line,
  .submit-area {
    padding: 16px;
  }

  .picker-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
  }
</style>
