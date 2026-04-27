<template>
  <div class="tax-account-config-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>税务科目配置</span>
          <el-button v-permission="'finance:tax:create'" type="primary" @click="handleAdd">新增配置</el-button>
        </div>
      </template>

      <!-- 数据表格 -->
      <el-table :data="configs" v-loading="loading" border stripe>
        <el-table-column prop="config_key" label="配置键" width="200" />
        <el-table-column prop="config_name" label="配置名称" width="200" />
        <el-table-column prop="account_code" label="科目代码" width="150" />
        <el-table-column prop="account_name" label="科目名称" width="200" />
        <el-table-column prop="description" label="说明" show-overflow-tooltip />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)"
              v-permission="'finance:tax:config'">编辑</el-button>
            <el-button v-permission="'finance:tax:delete'" link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 编辑对话框 -->
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
            style="width: 100%"
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
        <el-button type="primary" @click="handleSubmit" :loading="submitLoading">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { api } from '@/services/axiosInstance';

// 数据
const loading = ref(false);
const configs = ref([]);
const accounts = ref([]);

// 对话框
const dialogVisible = ref(false);
const dialogTitle = ref('新增配置');
const isEdit = ref(false);
const submitLoading = ref(false);
const formRef = ref(null);

// 表单数据
const formData = reactive({
  id: null,
  config_key: '',
  config_name: '',
  account_id: null,
  description: ''
});

// 表单验证规则
const formRules = {
  config_key: [{ required: true, message: '请输入配置键', trigger: 'blur' }],
  config_name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  account_id: [{ required: true, message: '请选择会计科目', trigger: 'change' }]
};

// 加载数据
const loadData = async () => {
  loading.value = true;
  try {
    const response = await api.get('/finance/tax/account-config');
    // axiosInstance 已经解包了 ResponseHandler 响应
    // response.data 直接就是业务数据
    configs.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    console.error('加载税务科目配置失败:', error);
    ElMessage.error(error.message || '加载失败');
  } finally {
    loading.value = false;
  }
};

// 加载会计科目列表
const loadAccounts = async () => {
  try {
    const response = await api.get('/finance/accounts');
    // axiosInstance 已经解包了 ResponseHandler 响应
    const data = response.data;
    if (data && data.accounts) {
      accounts.value = data.accounts;
    } else if (Array.isArray(data)) {
      accounts.value = data;
    } else {
      accounts.value = [];
    }
  } catch (error) {
    console.error('加载会计科目失败:', error);
  }
};

// 新增
const handleAdd = () => {
  isEdit.value = false;
  dialogTitle.value = '新增配置';
  Object.assign(formData, {
    id: null,
    config_key: '',
    config_name: '',
    account_id: null,
    description: ''
  });
  dialogVisible.value = true;
};

// 编辑
const handleEdit = (row) => {
  isEdit.value = true;
  dialogTitle.value = '编辑配置';
  Object.assign(formData, row);
  dialogVisible.value = true;
};

// 删除
const handleDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认删除配置 "${row.config_name}" 吗？`,
      '确认删除',
      {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    await api.delete(`/finance/tax/account-config/${row.id}`);
    // 如果没有抛出异常，说明删除成功
    ElMessage.success('删除成功');
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除配置失败:', error);
      ElMessage.error(error.message || '删除失败');
    }
  }
};

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return;

  try {
    await formRef.value.validate();

    submitLoading.value = true;

    const url = isEdit.value
      ? `/finance/tax/account-config/${formData.id}`
      : '/finance/tax/account-config';

    const method = isEdit.value ? 'put' : 'post';

    await api[method](url, formData);
    // 如果没有抛出异常，说明操作成功
    ElMessage.success(isEdit.value ? '更新成功' : '创建成功');
    dialogVisible.value = false;
    loadData();
  } catch (error) {
    if (error !== 'cancel') {
      console.error('提交失败:', error);
      ElMessage.error(error.message || '操作失败');
    }
  } finally {
    submitLoading.value = false;
  }
};

// 对话框关闭
const handleDialogClose = () => {
  formRef.value?.resetFields();
};

// 初始化
onMounted(() => {
  loadData();
  loadAccounts();
});
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

