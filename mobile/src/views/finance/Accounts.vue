<!--
/**
 * Accounts.vue
 * @description 会计科目列表 - UniversalListPage 统一风格
 * @date 2026-04-17
 * @version 2.0.0
 */
-->
<template>
  <div class="accounts-page">
  <UniversalListPage
    :config="pageConfig"
    :api-function="loadAccounts"
    @item-click="handleItemClick"
    @add="showCreateDialog = true"
  />

  <!-- 新建/编辑科目弹窗 -->
  <Popup v-model:show="showCreateDialog" position="bottom" :style="{ height: '80%' }">
    <div class="create-dialog">
      <div class="dialog-header">
        <div class="dialog-title">{{ editingAccount ? '编辑科目' : '新建科目' }}</div>
        <VanIcon name="cross" size="18" @click="closeDialog" />
      </div>

      <div class="dialog-content">
        <Form @submit="handleSubmit">
          <Field
            v-model="formData.account_code"
            name="account_code"
            label="科目代码"
            placeholder="请输入科目代码"
            :rules="[{ required: true, message: '请输入科目代码' }]"
          />
          <Field
            v-model="formData.account_name"
            name="account_name"
            label="科目名称"
            placeholder="请输入科目名称"
            :rules="[{ required: true, message: '请输入科目名称' }]"
          />
          <Field
            name="account_type"
            label="科目类型"
            placeholder="请选择科目类型"
            readonly
            :value="getTypeLabel(formData.account_type)"
            @click="showTypePicker = true"
            :rules="[{ required: true, message: '请选择科目类型' }]"
          />
          <Field
            v-model="formData.parent_code"
            name="parent_code"
            label="上级科目"
            placeholder="请输入上级科目代码（可选）"
          />
          <Field
            v-model="formData.description"
            name="description"
            label="科目说明"
            type="textarea"
            placeholder="请输入科目说明（可选）"
            rows="3"
          />
          <div class="form-item">
            <div class="form-label">是否启用</div>
            <Switch v-model="formData.is_active" />
          </div>
          <div class="form-actions">
            <Button type="default" @click="closeDialog">取消</Button>
            <Button type="primary" native-type="submit" :loading="submitting">
              {{ editingAccount ? '更新' : '创建' }}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  </Popup>

  <!-- 科目类型选择器 -->
  <Popup v-model:show="showTypePicker" position="bottom">
    <Picker
      :columns="accountTypeOptions"
      @confirm="onTypeConfirm"
      @cancel="showTypePicker = false"
    />
  </Popup>
  </div>
</template>

<script setup>
  import { ref, reactive, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    Popup, Form, Field, Button, Switch, Picker, Icon as VanIcon,
    showToast
  } from 'vant'
  import UniversalListPage from '@/components/common/UniversalListPage.vue'
  import { financeApi } from '@/services/api'

  const router = useRouter()

  // 弹窗相关数据
  const showCreateDialog = ref(false)
  const showTypePicker = ref(false)
  const editingAccount = ref(null)
  const submitting = ref(false)

  const formData = reactive({
    account_code: '',
    account_name: '',
    account_type: '',
    parent_code: '',
    description: '',
    is_active: true
  })

  // 科目类型配置（value 与后端 account_type 字段一致）
  const accountTypeLabels = [
    { label: '资产', value: '资产' },
    { label: '负债', value: '负债' },
    { label: '所有者权益', value: '所有者权益' },
    { label: '成本', value: '成本' },
    { label: '收入', value: '收入' },
    { label: '费用', value: '费用' }
  ]

  const accountTypeOptions = accountTypeLabels.map(t => ({ text: t.label, value: t.value }))

  const getTypeLabel = (type) => {
    const item = accountTypeLabels.find(t => t.value === type)
    return item ? item.label : type || ''
  }

  // 页面配置
  const pageConfig = computed(() => ({
    title: '会计科目',
    searchPlaceholder: '搜索科目代码或名称',

    // 筛选标签
    filterTabs: [
      { label: '全部', value: 'all' },
      { label: '资产', value: '资产' },
      { label: '负债', value: '负债' },
      { label: '权益', value: '所有者权益' },
      { label: '成本', value: '成本' },
      { label: '收入', value: '收入' },
      { label: '费用', value: '费用' }
    ],

    // 字段映射
    fields: {
      id: 'id',
      title: 'account_name',
      subtitle: 'account_code',
      icon: 'document-text',
      status: 'account_type',

      // 详情字段 — 只保留最关键信息
      details: [
        { label: '余额', field: (item) => '¥' + Number(item.balance || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
        { label: '状态', field: (item) => item.is_active ? '启用' : '停用' }
      ],

      // 标签
      tags: [
        {
          field: 'account_type',
          type: 'status',
          map: {
            '资产': { text: '资产', color: 'primary' },
            '负债': { text: '负债', color: 'danger' },
            '所有者权益': { text: '权益', color: 'success' },
            '成本': { text: '成本', color: 'warning' },
            '收入': { text: '收入', color: 'primary' },
            '费用': { text: '费用', color: 'warning' }
          }
        }
      ]
    },

    // 详情路由
    detailRoute: '/finance/gl/accounts/:id',

    // 右上角按钮
    headerActions: [
      {
        icon: 'plus',
        label: '新建科目',
        action: 'add'
      }
    ]
  }))

  // 加载科目数据
  const loadAccounts = async (params) => {
    const apiParams = { ...params }
    // 通过 account_type 替代 status 进行过滤
    if (params.status && params.status !== 'all') {
      apiParams.account_type = params.status
    }
    delete apiParams.status
    return await financeApi.getAccounts(apiParams)
  }

  // 处理项目点击
  const handleItemClick = (account) => {
    router.push(`/finance/gl/accounts/${account.id}`)
  }

  // 弹窗操作
  const closeDialog = () => {
    showCreateDialog.value = false
    editingAccount.value = null
    Object.assign(formData, {
      account_code: '',
      account_name: '',
      account_type: '',
      parent_code: '',
      description: '',
      is_active: true
    })
  }

  const onTypeConfirm = ({ selectedOptions }) => {
    formData.account_type = selectedOptions[0].value
    showTypePicker.value = false
  }

  const handleSubmit = async () => {
    submitting.value = true
    try {
      if (editingAccount.value) {
        await financeApi.updateAccount(editingAccount.value.id, formData)
        showToast('科目更新成功')
      } else {
        await financeApi.createAccount(formData)
        showToast('科目创建成功')
      }
      closeDialog()
    } catch (error) {
      console.error('保存科目失败:', error)
      showToast('保存失败，请重试')
    } finally {
      submitting.value = false
    }
  }
</script>

<style lang="scss" scoped>
  .create-dialog {
    height: 100%;
    display: flex;
    flex-direction: column;

    .dialog-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid var(--van-border-color);

      .dialog-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
      }
    }

    .dialog-content {
      flex: 1;
      padding: 16px;
      overflow-y: auto;

      .form-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 0;
        border-bottom: 1px solid var(--van-border-color);

        .form-label {
          font-size: 14px;
          color: var(--text-primary);
        }
      }

      .form-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;

        .van-button {
          flex: 1;
        }
      }
    }
  }
</style>
