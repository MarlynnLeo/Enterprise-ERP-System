<template>
  <div class="module-page budget-edit-container">
    <PageHeader :title="isEdit ? '编辑预算' : '新增预算'" subtitle="预算方案基本信息与科目明细">
      <template #actions>
        <el-button @click="handleCancel">取消</el-button>
        <el-button
          v-permission="isEdit ? 'finance:budgets:update' : 'finance:budgets:create'"
          type="primary"
          @click="handleSave"
          :loading="saving"
        >保存</el-button>
      </template>
    </PageHeader>

    <el-card class="data-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>预算表单</span>
        </div>
      </template>

      <el-form :model="formData" :rules="rules" ref="formRef" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="预算名称" prop="budgetName">
              <el-input v-model="formData.budgetName" placeholder="请输入预算名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="预算年度" prop="budgetYear">
              <el-date-picker
                v-model="formData.budgetYear"
                type="year"
                placeholder="选择年度"
                value-format="YYYY"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="预算类型" prop="budgetType">
              <el-select v-model="formData.budgetType" placeholder="请选择" class="w-full">
                <el-option v-for="item in dictStore.getOptions('budget_type')" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="部门" prop="departmentId">
              <el-select v-model="formData.departmentId" placeholder="请选择部门" clearable class="w-full">
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
            <el-form-item label="开始日期" prop="startDate">
              <el-date-picker
                v-model="formData.startDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="结束日期" prop="endDate">
              <el-date-picker
                v-model="formData.endDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
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

        <el-divider content-position="center">预算明细</el-divider>

        <el-button v-permission="isEdit ? 'finance:budgets:update' : 'finance:budgets:create'" type="primary" @click="handleAddDetail" style="margin-bottom: 10px">添加明细</el-button>

        <el-table :data="formData.details" border>
          <el-table-column label="会计科目" width="200">
            <template #default="{ row }">
              <el-select v-model="row.accountId" placeholder="请选择" filterable>
                <el-option
                  v-for="account in accounts"
                  :key="account.id"
                  :label="`${account.accountCode} - ${account.accountName}`"
                  :value="account.id"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="部门" width="150">
            <template #default="{ row }">
              <el-select  v-model="row.departmentId" placeholder="请选择" clearable>
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
                v-model="row.budgetAmount"
                :precision="2"
                :min="0"
                controls-position="right"
                class="w-full"
              />
            </template>
          </el-table-column>
          <el-table-column label="预警阈值(%)" width="120">
            <template #default="{ row }">
              <el-input-number
                v-model="row.warningThreshold"
                :precision="2"
                :min="0"
                :max="100"
                controls-position="right"
                class="w-full"
              />
            </template>
          </el-table-column>
          <el-table-column label="说明" min-width="200">
            <template #default="{ row }">
              <el-input v-model="row.description" placeholder="请输入说明" />
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="80" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="{ $index }">
              <el-button v-permission="isEdit ? 'finance:budgets:update' : 'finance:budgets:create'" link type="danger" size="small" @click="handleDeleteDetail($index)">删除</el-button>
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
import { useDictionaryStore } from '@/stores/dictionary'
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter, useRoute } from 'vue-router';
import { financeApi } from '@/api/finance';
import { formatAmount } from '@/utils/format'
import { loadDepartmentOptions } from '@/utils/optionLoaders';

const dictStore = useDictionaryStore()

const router = useRouter();
const route = useRoute();

const isEdit = computed(() => !!route.params.id);
const formRef = ref(null);
const saving = ref(false);

// 表单数据
const formData = reactive({
  budgetName: '',
  budgetYear: new Date().getFullYear().toString(),
  budgetType: '年度预算',
  departmentId: null,
  startDate: '',
  endDate: '',
  totalAmount: 0,
  status: '草稿',
  description: '',
  details: []
});

// 验证规则
const rules = {
  budgetName: [{ required: true, message: '请输入预算名称', trigger: 'blur' }],
  budgetYear: [{ required: true, message: '请选择预算年度', trigger: 'change' }],
  budgetType: [{ required: true, message: '请选择预算类型', trigger: 'change' }],
  startDate: [{ required: true, message: '请选择开始日期', trigger: 'change' }],
  endDate: [{ required: true, message: '请选择结束日期', trigger: 'change' }]
};

// 部门列表
const departments = ref([]);

// 会计科目列表
const accounts = ref([]);

// 计算总金额
const totalAmount = computed(() => {
  return formData.details.reduce((sum, item) => sum + (parseFloat(item.budgetAmount) || 0), 0);
});

// 获取部门列表
const fetchDepartments = async () => {
  try {
    departments.value = await loadDepartmentOptions();
  } catch (error) {
    console.error('获取部门列表失败:', error);
  }
};

// 获取会计科目列表
const fetchAccounts = async () => {
  try {
    const response = await financeApi.accounts.getList();
    accounts.value = response.data?.accounts || response.data || [];
  } catch (error) {
    console.error('获取会计科目列表失败:', error);
  }
};

// 获取预算详情
const fetchBudgetDetail = async () => {
  try {
    const response = await financeApi.budgets.getDetail(route.params.id);
    const budget = response.data;
    Object.assign(formData, {
      budgetName: budget.budgetName,
      budgetYear: budget.budgetYear?.toString(),
      budgetType: budget.budgetType,
      departmentId: budget.departmentId,
      startDate: budget.startDate,
      endDate: budget.endDate,
      totalAmount: budget.totalAmount,
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
    accountId: null,
    departmentId: null,
    budgetAmount: 0,
    warningThreshold: 80.00,
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
      if (!detail.accountId) {
        ElMessage.warning(`第 ${i + 1} 行明细未选择会计科目`);
        return;
      }
      if (!detail.budgetAmount || detail.budgetAmount <= 0) {
        ElMessage.warning(`第 ${i + 1} 行明细预算金额必须大于0`);
        return;
      }
    }

    saving.value = true;

    // 更新总金额
    formData.totalAmount = totalAmount.value;

    const requestData = {
      budget: {
        budgetName: formData.budgetName,
        budgetYear: parseInt(formData.budgetYear),
        budgetType: formData.budgetType,
        departmentId: formData.departmentId,
        startDate: formData.startDate,
        endDate: formData.endDate,
        totalAmount: formData.totalAmount,
        description: formData.description
      },
      details: formData.details
    };

    let response;
    if (isEdit.value) {
      response = await financeApi.budgets.update(route.params.id, requestData);
    } else {
      response = await financeApi.budgets.create(requestData);
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
