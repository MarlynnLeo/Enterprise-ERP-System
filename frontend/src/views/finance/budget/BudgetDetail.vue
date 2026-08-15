<template>
  <div class="module-page budget-detail-container">
    <PageHeader title="预算详情" subtitle="查看预算方案与执行概况">
      <template #actions>
        <el-button @click="handleBack">返回</el-button>
      </template>
    </PageHeader>

    <el-card class="data-card" shadow="never" v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>基本信息</span>
        </div>
      </template>

      <el-descriptions :column="3" border>
        <el-descriptions-item label="预算编号">{{ budget.budgetNo }}</el-descriptions-item>
        <el-descriptions-item label="预算名称">{{ budget.budgetName }}</el-descriptions-item>
        <el-descriptions-item label="预算年度">{{ budget.budgetYear }}</el-descriptions-item>
        <el-descriptions-item label="预算类型">{{ budget.budgetType }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ budget.departmentName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(budget.status)">{{ budget.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="开始日期">{{ budget.startDate }}</el-descriptions-item>
        <el-descriptions-item label="结束日期">{{ budget.endDate }}</el-descriptions-item>
        <el-descriptions-item label="预算总额">{{ formatAmount(budget.totalAmount) }}</el-descriptions-item>
        <el-descriptions-item label="已使用金额">{{ formatAmount(budget.usedAmount) }}</el-descriptions-item>
        <el-descriptions-item label="剩余金额">{{ formatAmount(budget.remainingAmount) }}</el-descriptions-item>
        <el-descriptions-item label="执行率">
          <el-progress
            :percentage="calculateExecutionRate()"
            :color="getProgressColor(calculateExecutionRate())"
            :stroke-width="12"
          />
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ budget.creatorName }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ budget.createdAt }}</el-descriptions-item>
        <el-descriptions-item label="审批人">{{ budget.approverName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="预算说明" :span="3">{{ budget.description || '-' }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="center">预算明细</el-divider>

      <el-table :data="budget.details" border stripe>
        <el-table-column prop="accountCode" label="科目代码" width="120" />
        <el-table-column prop="accountName" label="科目名称" width="180" />
        <el-table-column prop="departmentName" label="部门" width="120" />
        <el-table-column prop="budgetAmount" label="预算金额" width="120">
          <template #default="{ row }">
            {{ formatAmount(row.budgetAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="usedAmount" label="已使用" width="120">
          <template #default="{ row }">
            {{ formatAmount(row.usedAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="remainingAmount" label="剩余金额" width="120">
          <template #default="{ row }">
            {{ formatAmount(row.remainingAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="执行率" width="120">
          <template #default="{ row }">
            <el-progress
              :percentage="calculateDetailExecutionRate(row)"
              :color="getProgressColor(calculateDetailExecutionRate(row))"
              :stroke-width="12"
            />
          </template>
        </el-table-column>
        <el-table-column prop="warningThreshold" label="预警阈值" width="100">
          <template #default="{ row }">
            {{ row.warningThreshold }}%
          </template>
        </el-table-column>
        <el-table-column prop="description" label="说明" min-width="150" />
      </el-table>

      <el-divider content-position="left">执行分析</el-divider>

      <el-button type="primary" @click="handleViewAnalysis"
        v-permission="'finance:budgets:view'">查看执行分析</el-button>
      <el-button type="success" @click="handleViewExecutions"
        v-permission="'finance:budgets:view'">查看执行记录</el-button>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { useRouter, useRoute } from 'vue-router';
import { financeApi } from '@/api/finance';
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
    const response = await financeApi.budgets.getDetail(route.params.id);
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
  if (!budget.totalAmount || budget.totalAmount === 0) return 0;
  return Math.round((budget.usedAmount / budget.totalAmount) * 100);
};

// 计算明细执行率
const calculateDetailExecutionRate = (row) => {
  if (!row.budgetAmount || row.budgetAmount === 0) return 0;
  return Math.round((row.usedAmount / row.budgetAmount) * 100);
};

// 获取进度条颜色
const getProgressColor = (percentage) => {
  if (percentage >= 100) return 'var(--color-danger)';
  if (percentage >= 80) return 'var(--color-warning)';
  return 'var(--color-success)';
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
