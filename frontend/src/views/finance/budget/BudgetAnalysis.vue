<template>
  <div class="module-page budget-analysis-container">
    <PageHeader title="预算执行分析" subtitle="预算使用进度与科目执行明细">
      <template #actions>
        <el-button @click="handleBack">返回</el-button>
      </template>
    </PageHeader>

    <el-card class="data-card" shadow="never" v-loading="loading">
      <template #header>
        <div class="card-header">
          <span>分析报告</span>
        </div>
      </template>

      <!-- 总体执行情况 -->
      <el-row :gutter="20" class="mb-20">
        <el-col :span="6">
          <el-statistic title="预算总额" :value="analysis.totalBudgetAmount" :precision="2" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="已使用金额" :value="analysis.totalUsedAmount" :precision="2" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="剩余金额" :value="analysis.totalRemainingAmount" :precision="2" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="总体执行率" :value="analysis.overallExecutionRate" suffix="%" />
        </el-col>
      </el-row>

      <!-- 统计信息 -->
      <el-row :gutter="20" class="mb-20">
        <el-col :span="8">
          <el-card shadow="hover">
            <el-statistic title="超预算项目" :value="analysis.statistics?.overBudget || 0">
              <template #suffix>
                <span class="text-danger">项</span>
              </template>
            </el-statistic>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover">
            <el-statistic title="接近预算项目" :value="analysis.statistics?.nearBudget || 0">
              <template #suffix>
                <span class="text-warning">项</span>
              </template>
            </el-statistic>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover">
            <el-statistic title="正常项目" :value="analysis.statistics?.normalBudget || 0">
              <template #suffix>
                <span class="text-success">项</span>
              </template>
            </el-statistic>
          </el-card>
        </el-col>
      </el-row>

      <el-divider content-position="left">明细执行情况</el-divider>

      <!-- 明细表格 -->
      <el-table :data="analysis.details" border stripe>
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
        <el-table-column prop="executionRate" label="执行率" width="120">
          <template #default="{ row }">
            <el-progress
              :percentage="parseFloat(row.executionRate)"
              :color="getProgressColor(parseFloat(row.executionRate))"
              :stroke-width="12"
            />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.executionRate)">
              {{ getStatusText(row.executionRate) }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { useRouter, useRoute } from 'vue-router';
import { financeApi } from '@/api/finance';
import { formatAmount } from '@/utils/format'

const router = useRouter();
const route = useRoute();

const loading = ref(false);
const analysis = reactive({
  budget: {},
  overallExecutionRate: 0,
  totalBudgetAmount: 0,
  totalUsedAmount: 0,
  totalRemainingAmount: 0,
  details: [],
  statistics: {
    overBudget: 0,
    nearBudget: 0,
    normalBudget: 0
  }
});

// 获取执行分析
const fetchAnalysis = async () => {
  loading.value = true;
  try {
    const response = await financeApi.budgets.getExecutionAnalysis(route.params.id);
    Object.assign(analysis, response.data);
  } catch (error) {
    console.error('获取执行分析失败:', error);
    ElMessage.error('获取执行分析失败');
  } finally {
    loading.value = false;
  }
};

// 返回
const handleBack = () => {
  router.back();
};

// 格式化金额 - 已统一使用 @/utils/format 导入

// 获取进度条颜色
const getProgressColor = (percentage) => {
  if (percentage >= 100) return 'var(--color-danger)';
  if (percentage >= 80) return 'var(--color-warning)';
  return 'var(--color-success)';
};

// 获取状态类型
const getStatusType = (executionRate) => {
  const rate = parseFloat(executionRate);
  if (rate >= 100) return 'danger';
  if (rate >= 80) return 'warning';
  return 'success';
};

// 获取状态文本
const getStatusText = (executionRate) => {
  const rate = parseFloat(executionRate);
  if (rate >= 100) return '超支';
  if (rate >= 80) return '接近';
  return '正常';
};

onMounted(() => {
  fetchAnalysis();
});
</script>

<style scoped>
.budget-analysis-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
