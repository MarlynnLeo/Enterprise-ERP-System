<template>
  <div class="module-page tax-account-config-container">
    <PageHeader title="税务科目配置" subtitle="进销项税与税务相关会计科目映射">
      <template #actions>
        <el-button v-permission="'finance:tax:create'" type="primary" @click="handleAdd">
          新增配置
        </el-button>
      </template>
    </PageHeader>

    <el-card class="data-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>配置列表</span>
        </div>
      </template>

      <el-table :data="configs" v-loading="loading" border stripe>
        <el-table-column prop="config_key" label="配置键" width="200" />
        <el-table-column prop="config_name" label="配置名称" width="200" />
        <el-table-column prop="account_code" label="科目代码" width="150" />
        <el-table-column prop="account_name" label="科目名称" width="200" />
        <el-table-column prop="description" label="说明" show-overflow-tooltip />
        <el-table-column
          label="操作"
          width="150"
          fixed="right"
          align="left"
          header-align="left"
          class-name="operation-column"
          header-class-name="operation-column-header"
        >
          <template #default="{ row }">
            <el-button v-permission="'finance:tax:update'" link type="primary" @click="handleEdit(row)">
              编辑
            </el-button>
            <el-button v-permission="'finance:tax:delete'" link type="danger" @click="handleDelete(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      @close="handleDialogClose"
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
      >
        <el-form-item label="配置键" prop="config_key">
          <el-input v-model="formData.config_key" :disabled="isEdit" placeholder="例如：VAT_INPUT_TAX" />
        </el-form-item>
        <el-form-item label="配置名称" prop="config_name">
          <el-input v-model="formData.config_name" placeholder="例如：进项税额" />
        </el-form-item>
        <el-form-item label="会计科目" prop="account_id">
          <el-select
            v-model="formData.account_id"
            filterable
            placeholder="请选择会计科目"
            class="w-full"
          >
            <el-option
              v-for="account in accounts"
              :key="account.id"
              :label="`${account.code} - ${account.name}`"
              :value="account.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="说明" prop="description">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入说明"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button
          v-permission="formData.id ? 'finance:tax:update' : 'finance:tax:create'"
          type="primary"
          @click="handleSubmit"
          :loading="submitLoading"
        >
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { financeApi } from '@/api'

const loading = ref(false)
const configs = ref([])
const accounts = ref([])

const dialogVisible = ref(false)
const dialogTitle = ref('新增配置')
const isEdit = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)

const formData = reactive({
  id: null,
  config_key: '',
  config_name: '',
  account_id: null,
  description: ''
})

const formRules = {
  config_key: [{ required: true, message: '请输入配置键', trigger: 'blur' }],
  config_name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  account_id: [{ required: true, message: '请选择会计科目', trigger: 'change' }]
}

const resetFormData = () => {
  Object.assign(formData, {
    id: null,
    config_key: '',
    config_name: '',
    account_id: null,
    description: ''
  })
}

const loadData = async () => {
  loading.value = true
  try {
    const response = await financeApi.tax.getAccountConfig()
    const data = response.data || response
    configs.value = Array.isArray(data) ? data : (data.items || [])
  } catch (error) {
    console.error('加载税务科目配置失败:', error)
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadAccounts = async () => {
  try {
    const response = await financeApi.accounts.getList()
    const data = response.data || response
    accounts.value = data.accounts || data.items || (Array.isArray(data) ? data : [])
  } catch (error) {
    console.error('加载会计科目失败:', error)
    ElMessage.error(error.message || '加载会计科目失败')
  }
}

const handleAdd = () => {
  isEdit.value = false
  dialogTitle.value = '新增配置'
  resetFormData()
  dialogVisible.value = true
}

const handleEdit = (row) => {
  isEdit.value = true
  dialogTitle.value = '编辑配置'
  Object.assign(formData, {
    id: row.id,
    config_key: row.config_key || '',
    config_name: row.config_name || '',
    account_id: row.account_id || null,
    description: row.description || ''
  })
  dialogVisible.value = true
}

const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认删除配置 "${row.config_name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await financeApi.tax.deleteAccountConfig(row.id)
    ElMessage.success('删除成功')
    await loadData()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除配置失败:', error)
      ElMessage.error(error.message || '删除失败')
    }
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    submitLoading.value = true

    const payload = {
      config_key: formData.config_key,
      config_name: formData.config_name,
      account_id: formData.account_id,
      description: formData.description
    }

    if (isEdit.value) {
      await financeApi.tax.updateAccountConfig(formData.id, payload)
    } else {
      await financeApi.tax.createAccountConfig(payload)
    }

    ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
    dialogVisible.value = false
    await loadData()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('提交失败:', error)
      ElMessage.error(error.message || '操作失败')
    }
  } finally {
    submitLoading.value = false
  }
}

const handleDialogClose = () => {
  formRef.value?.resetFields()
  resetFormData()
}

onMounted(() => {
  loadData()
  loadAccounts()
})
</script>

<style scoped>
.tax-account-config-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
