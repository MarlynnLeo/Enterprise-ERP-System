<template>
  <div class="budget-edit-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>{{ isEdit ? '编辑预算' : '新增预算' }}</span>
          <div>
            <el-button @click="handleCancel">取消</el-button>
            <el-button v-permission="'finance:budgets:update'" type="primary" @click="handleSave" :loading="saving">保存</el-button>
          </div>
        </div>
      </template>

      <el-form :model="formData" :rules="rules" ref="formRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="预算名称" prop="budget_name">
              <el-input v-model="formData.budget_name" placeholder="请输入预算名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预算年度" prop="budget_year">
              <el-date-picker
                v-model="formData.budget_year"
                type="year"
                placeholder="选择年度"
                value-format="YYYY"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="预算类型" prop="budget_type">
              <el-select v-model="formData.budget_type" placeholder="请选择" style="width: 100%">
                <el-option v-for="item in $dict.getOptions('budget_type')" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部门" prop="department_id">
              <el-select v-model="formData.department_id" placeholder="请选择部门" clearable style="width: 100%">
                <el-option
                  v-for="dept in departments"
                  :key="dept.id"
                  :label="dept.name"
                  :value="dept.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开始日期" prop="start_date">
              <el-date-picker
                v-model="formData.start_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束日期" prop="end_date">
              <el-date-picker
                v-model="formData.end_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="预算说明">
          <el-input
            v-model="formData.description"
            type="textarea"
            :rows="3"
            placeholder="请输入预算说明"
          />
        </el-form-item>

        <el-divider content-position="left">预算明细</el-divider>

        <el-button v-permission="'finance:budgets:create'" type="primary" @click="handleAddDetail" style="margin-bottom: 10px">添加明细</el-button>

        <el-table :data="formData.details" border>
          <el-table-column label="会计科目" width="200">
            <template #default="{ row, $index }">
              <el-select v-model="row.account_id" placeholder="请选择" filterable>
                <el-option
                  v-for="account in accounts"
                  :key="account.id"
                  :label="`${account.account_code} - ${account.account_name}`"
                  :value="account.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="部门" width="150">
            <template #default="{ row }">
              <el-select  v-model="row.department_id" placeholder="请选择" clearable>
                <el-option
                  v-for="dept in departments"
                  :key="dept.id"
                  :label="dept.name"
                  :value="dept.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="预算金额" width="150">
            <template #default="{ row }">
              <el-input-number
                v-model="row.budget_amount"
                :precision="2"
                :min="0"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="预警阈值(%)" width="120">
            <template #default="{ row }">
              <el-input-number
                v-model="row.warning_threshold"
                :precision="2"
                :min="0"
                :max="100"
                controls-position="right"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="200">
            <template #default="{ row }">
              <el-input v-model="row.description" placeholder="请输入说明" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" fixed="right">
            <template #default="{ $index }">
              <el-button v-permission="'finance:budgets:delete'" link type="danger" size="small" @click="handleDeleteDetail($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div style="margin-top: 20px; text-align: right">
          <span style="font-size: 16px; font-weight: bold">
            预算总额: {{ formatAmount(totalAmount) }}
          </span>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter, useRoute } from 'vue-router';
import api from '@/services/axiosInstance';
import { formatAmount } from '@/utils/format'

const router = useRouter();
const route = useRoute();

const isEdit = computed(() => !!route.params.id);
const formRef = ref(null);
const saving = ref(false);

// 表单数据
const formData = reactive({
  budget_name: '',
  budget_year: new Date().getFullYear().toString(),
  budget_type: '年度预算',
  department_id: null,
  start_date: '',
  end_date: '',
  total_amount: 0,
  status: '草稿',
  description: '',
  details: []
});

// 验证规则
const rules = {
  budget_name: [{ required: true, message: '请输入预算名称', trigger: 'blur' }],
  budget_year: [{ required: true, message: '请选择预算年度', trigger: 'change' }],
  budget_type: [{ required: true, message: '请选择预算类型', trigger: 'change' }],
  start_date: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  end_date: [{ required: true, message: '请选择结束日期', trigger: 'change' }]
};

// 部门列表
const departments = ref([]);

// 会计科目列表
const accounts = ref([]);

// 计算总金额
const totalAmount = computed(() => {
  return formData.details.reduce((sum, item) => sum + (parseFloat(item.budget_amount) || 0), 0);
});

// 获取部门列表
const fetchDepartments = async () => {
  try {
    const response = await api.get('/system/departments');
    departments.value = response.data || [];
  } catch (error) {
    console.error('获取部门列表失败:', error);
  }
};

// 获取会计科目列表
const fetchAccounts = async () => {
  try {
    const response = await api.get('/finance/accounts');
    accounts.value = response.data?.accounts || response.data || [];
  } catch (error) {
    console.error('获取会计科目列表失败:', error);
  }
};

// 获取预算详情
const fetchBudgetDetail = async () => {
  try {
    const response = await api.get(`/finance/budgets/${route.params.id}`);
    const budget = response.data;
    Object.assign(formData, {
      budget_name: budget.budget_name,
      budget_year: budget.budget_year?.toString(),
      budget_type: budget.budget_type,
      department_id: budget.department_id,
      start_date: budget.start_date,
      end_date: budget.end_date,
      total_amount: budget.total_amount,
      status: budget.status,
      description: budget.description,
      details: budget.details || []
    });
  } catch (error) {
    console.error('获取预算详情失败:', error);
    ElMessage.error('获取预算详情失败');
  }
};

// 添加明细
const handleAddDetail = () => {
  formData.details.push({
    account_id: null,
    department_id: null,
    budget_amount: 0,
    warning_threshold: 80.00,
    description: ''
  });
};

// 删除明细
const handleDeleteDetail = (index) => {
  formData.details.splice(index, 1);
};

// 保存
const handleSave = async () => {
  if (saving.value) return;

  try {
    await formRef.value.validate();

    if (formData.details.length === 0) {
      ElMessage.warning('请至少添加一条预算明细');
      return;
    }

    // 验证明细
    for (let i = 0; i < formData.details.length; i++) {
      const detail = formData.details[i];
      if (!detail.account_id) {
        ElMessage.warning(`第 ${i + 1} 行明细未选择会计科目`);
        return;
      }
      if (!detail.budget_amount || detail.budget_amount <= 0) {
        ElMessage.warning(`第 ${i + 1} 行明细预算金额必须大于0`);
        return;
      }
    }

    saving.value = true;

    // 更新总金额
    formData.total_amount = totalAmount.value;

    const requestData = {
      budget: {
        budget_name: formData.budget_name,
        budget_year: parseInt(formData.budget_year),
        budget_type: formData.budget_type,
        department_id: formData.department_id,
        start_date: formData.start_date,
        end_date: formData.end_date,
        total_amount: formData.total_amount,
        status: formData.status,
        description: formData.description
      },
      details: formData.details
    };

    let response;
    if (isEdit.value) {
      response = await api.put(`/finance/budgets/${route.params.id}`, requestData);
    } else {
      response = await api.post('/finance/budgets', requestData);
    }

    if (response) {
      ElMessage.success(isEdit.value ? '更新成功' : '创建成功');
      router.push('/finance/budget/list');
    }
  } catch (error) {
    if (error.name !== 'ValidationError') {
      console.error('保存失败:', error);
      ElMessage.error(error.response?.data?.error || '保存失败');
    }
  } finally {
    saving.value = false;
  }
};

// 取消
const handleCancel = () => {
  router.back();
};

// 格式化金额 - 已统一使用 @/utils/format 导入

onMounted(async () => {
  await Promise.all([fetchDepartments(), fetchAccounts()]);

  if (isEdit.value) {
    await fetchBudgetDetail();
  }
});
</script>

<style scoped>
.budget-edit-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
