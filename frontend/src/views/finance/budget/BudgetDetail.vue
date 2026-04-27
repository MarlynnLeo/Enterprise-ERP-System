<template>
  <div class="budget-detail-container">
    <el-card v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>预算详情</span>
          <el-button @click="handleBack">返回</el-button>
        </div>
      </template>

      <el-descriptions :column="3" border>
        <el-descriptions-item label="预算编号">{{ budget.budget_no }}</el-descriptions-item>
        <el-descriptions-item label="预算名称">{{ budget.budget_name }}</el-descriptions-item>
        <el-descriptions-item label="预算年度">{{ budget.budget_year }}</el-descriptions-item>
        <el-descriptions-item label="预算类型">{{ budget.budget_type }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ budget.department_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(budget.status)">{{ budget.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="开始日期">{{ budget.start_date }}</el-descriptions-item>
        <el-descriptions-item label="结束日期">{{ budget.end_date }}</el-descriptions-item>
        <el-descriptions-item label="预算总额">{{ formatAmount(budget.total_amount) }}</el-descriptions-item>
        <el-descriptions-item label="已使用金额">{{ formatAmount(budget.used_amount) }}</el-descriptions-item>
        <el-descriptions-item label="剩余金额">{{ formatAmount(budget.remaining_amount) }}</el-descriptions-item>
        <el-descriptions-item label="执行率">
          <el-progress
            :percentage="calculateExecutionRate()"
            :color="getProgressColor(calculateExecutionRate())"
            :stroke-width="12"
          />
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ budget.creator_name }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ budget.created_at }}</el-descriptions-item>
        <el-descriptions-item label="审批人">{{ budget.approver_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="预算说明" :span="3">{{ budget.description || '-' }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="left">预算明细</el-divider>

      <el-table :data="budget.details" border stripe>
        <el-table-column prop="account_code" label="科目代码" width="120" />
        <el-table-column prop="account_name" label="科目名称" width="180" />
        <el-table-column prop="department_name" label="部门" width="120" />
        <el-table-column prop="budget_amount" label="预算金额" width="120" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.budget_amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="used_amount" label="已使用" width="120" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.used_amount) }}
          </template>
        </el-table-column>
        <el-table-column prop="remaining_amount" label="剩余金额" width="120" align="right">
          <template #default="{ row }">
            {{ formatAmount(row.remaining_amount) }}
          </template>
        </el-table-column>
        <el-table-column label="执行率" width="120" align="center">
          <template #default="{ row }">
            <el-progress
              :percentage="calculateDetailExecutionRate(row)"
              :color="getProgressColor(calculateDetailExecutionRate(row))"
              :stroke-width="12"
            />
          </template>
        </el-table-column>
        <el-table-column prop="warning_threshold" label="预警阈值" width="100" align="center">
          <template #default="{ row }">
            {{ row.warning_threshold }}%
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="150" />
      </el-table>

      <el-divider content-position="left">执行分析</el-divider>

      <el-button type="primary" @click="handleViewAnalysis"
        v-permission="'finance:budget:view'">查看执行分析</el-button>
      <el-button type="success" @click="handleViewExecutions"
        v-permission="'finance:budget:view'">查看执行记录</el-button>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter, useRoute } from 'vue-router';
import { api } from '@/services/axiosInstance';
import { formatAmount } from '@/utils/format'

const router = useRouter();
const route = useRoute();

const loading = ref(false);
const budget = reactive({
  details: []
});

// 获取预算详情
const fetchBudgetDetail = async () => {
  loading.value = true;
  try {
    const response = await api.get(`/finance/budgets/${route.params.id}`);
    Object.assign(budget, response.data);
  } catch (error) {
    console.error('获取预算详情失败:', error);
    ElMessage.error('获取预算详情失败');
  } finally {
    loading.value = false;
  }
};

// 返回
const handleBack = () => {
  router.back();
};

// 查看执行分析
const handleViewAnalysis = () => {
  router.push(`/finance/budget/analysis/${route.params.id}`);
};

// 查看执行记录
const handleViewExecutions = () => {
  router.push(`/finance/budget/executions/${route.params.id}`);
};

// 格式化金额 - 已统一使用 @/utils/format 导入

// 计算执行率
const calculateExecutionRate = () => {
  if (!budget.total_amount || budget.total_amount === 0) return 0;
  return Math.round((budget.used_amount / budget.total_amount) * 100);
};

// 计算明细执行率
const calculateDetailExecutionRate = (row) => {
  if (!row.budget_amount || row.budget_amount === 0) return 0;
  return Math.round((row.used_amount / row.budget_amount) * 100);
};

// 获取进度条颜色
const getProgressColor = (percentage) => {
  if (percentage >= 100) return '#f56c6c';
  if (percentage >= 80) return '#e6a23c';
  return '#67c23a';
};

// 获取状态类型
const getStatusType = (status) => {
  const typeMap = {
    '草稿': 'info',
    '待审批': 'warning',
    '已审批': 'success',
    '执行中': 'primary',
    '已完成': 'success',
    '已关闭': 'info'
  };
  return typeMap[status] || 'info';
};

onMounted(() => {
  fetchBudgetDetail();
});
</script>

<style scoped>
.budget-detail-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
