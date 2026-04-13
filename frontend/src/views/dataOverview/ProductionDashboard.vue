<!--
/**
 * ProductionDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="production-dashboard">
    <el-card class="header-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>生产数据概览</h2>
        <div>
          <span v-if="lastUpdated" class="last-updated">
            最后更新: {{ new Date(lastUpdated).toLocaleTimeString() }}
          </span>
        </div>
      </div>
    </el-card>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card primary-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">生产计划</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.plans?.total || 0 }}</div>
                <div class="stat-label">总数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.plans?.pending || 0 }}</div>
                <div class="stat-secondary-label">待完成</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="primary" link @click="$router.push('/production/plan')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">生产任务</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.tasks?.total || 0 }}</div>
                <div class="stat-label">总数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.tasks?.inProgress || 0 }}</div>
                <div class="stat-secondary-label">进行中</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="success" link @click="$router.push('/production/task')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">工序完成</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.processes?.completed || 0 }}</div>
                <div class="stat-label">本月完成</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.processes?.rate || '0%' }}</div>
                <div class="stat-secondary-label">完成率</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="info" link @click="$router.push('/production/process')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">生产报工</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.reports?.total || 0 }}</div>
                <div class="stat-label">总数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.reports?.today || 0 }}</div>
                <div class="stat-secondary-label">今日报工</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="warning" link @click="$router.push('/production/report')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>生产趋势</span>
              <div style="display: flex; gap: 10px;">
                <el-radio-group v-model="productionTrendType" size="small">
                  <el-radio-button value="quantity">生产数量</el-radio-button>
                  <el-radio-button value="plan">计划数量</el-radio-button>
                </el-radio-group>
                <el-radio-group v-model="productionTimeRange" size="small">
                  <el-radio-button value="year">年度</el-radio-button>
                  <el-radio-button value="month">月度</el-radio-button>
                </el-radio-group>
              </div>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="productionTrend" height="300"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>工序完成率分布</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="processCompletion" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 待处理生产任务 -->
    <el-row class="mt-20">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>待处理生产任务</span>
              <div class="header-actions">
                <el-button type="primary" size="small" icon="Refresh" @click="fetchPendingPlans" :loading="loading">
                  刷新
                </el-button>
                <el-input 
                  v-model="search"
                  placeholder="搜索"
                  class="search-input"
                  :prefix-icon="Search" />
              </div>
            </div>
          </template>
          <div v-if="pendingPlans.length === 0 && !loading" class="empty-data-tip">
            暂无待处理任务数据
          </div>
          <el-table
            :data="filteredPendingTasks"
            style="width: 100%"
            v-loading="loading"
            border
            :max-height="400"
          >
            <el-table-column label="计划编号" prop="code" min-width="120" />
            <el-table-column label="产品名称" prop="productName" min-width="120" />
            <el-table-column label="产品编码" prop="productCode" min-width="120" />
            <el-table-column label="计划日期" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.startDate) }}
              </template>
            </el-table-column>
            <el-table-column label="计划数量" min-width="100">
              <template #default="scope">
                {{ scope.row.quantity !== undefined && scope.row.quantity !== null ? scope.row.quantity : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getStatusType(scope.row.status)">
                  {{ getStatusText(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="负责人" min-width="100">
              <template #default="scope">
                {{ scope.row.manager || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="120" fixed="right">
              <template #default="scope">
                <el-button
                  type="primary"
                  text
                  size="small"
                  @click="$router.push(`/production/plan?id=${scope.row.id}`)"
                >查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-container" v-if="pendingPlans.length > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="pendingPlans.length"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>

import apiAdapter from '@/utils/apiAdapter';

import { ref, computed, onMounted, watch } from 'vue';
import { formatDate as formatDateUtil } from '@/utils/helpers/formatters';
import Chart from 'chart.js/auto';
import { ElMessage } from 'element-plus';
import { Search, ArrowRight } from '@element-plus/icons-vue';
import { productionApi } from '@/services/api';
import { useDashboard, useCharts } from '@/composables/useDashboard';
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性
import {
  handleDashboardError,
  getDefaultStatistics,
  generateMonthLabels
} from '@/utils/dashboardUtils';
import {
  createBarChartConfig,
  createLineChartConfig,
  chartColors
} from '@/utils/chartConfig';

// 图表引用
const productionTrend = ref(null);
const processCompletion = ref(null);

const chartRefs = {
  productionTrend,
  processCompletion
};

// 生产趋势类型（数量/计划）选择
const productionTrendType = ref('quantity');
// 生产时间范围（年度/月度）选择
const productionTimeRange = ref('year');

// 使用仪表盘组合式函数
const {
  loading,
  statistics,
  lastUpdated,
  loadData
} = useDashboard('production', loadProductionData, {
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000 // 5分钟
});

// 使用图表管理组合式函数
const {
  initAllCharts,
  updateChart
} = useCharts(chartRefs);

// 待处理生产任务数据
const pendingPlans = ref([]);
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

// 筛选后的待处理任务
const filteredPendingTasks = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;

  // 确保pendingPlans是数组
  let tasks = Array.isArray(pendingPlans.value) ? pendingPlans.value : [];

  if (search.value) {
    const searchValue = search.value.toLowerCase();
    tasks = tasks.filter(task =>
      (task.code && task.code.toLowerCase().includes(searchValue)) ||
      (task.productName && task.productName.toLowerCase().includes(searchValue)) ||
      (task.productCode && task.productCode.toLowerCase().includes(searchValue)) ||
      (task.status && task.status.toLowerCase().includes(searchValue))
    );
  }

  return tasks.slice(startIndex, endIndex);
});

// 分页处理
function handleSizeChange(size) {
  pageSize.value = size;
  currentPage.value = 1;
}

function handleCurrentChange(page) {
  currentPage.value = page;
}

// 格式化日期
function formatDate(date) {
  if (!date) return '-';
  return formatDateUtil(date, 'YYYY-MM-DD');
}

// 获取状态类型
function getStatusType(status) {
  const statusMap = {
    pending: 'warning',
    preparing: 'primary',
    material_issued: 'primary',
    inProgress: 'success',
    in_progress: 'success',
    completed: 'success',
    cancelled: 'danger'
  };
  return statusMap[status] || 'info';
}

// 获取状态文本
function getStatusText(status) {
  const statusTextMap = {
    pending: '待处理',
    allocated: '分配中',
    preparing: '配料中',
    material_issuing: '发料中',
    material_issued: '已发料',
    inProgress: '进行中',
    in_progress: '进行中',
    inspection: '待检验',
    warehousing: '入库中',
    completed: '已完成',
    cancelled: '已取消'
  };
  return statusTextMap[status] || '未知状态';
}

// 加载生产数据
async function loadProductionData() {
  try {
    // 并行获取多个数据源
    const [dashboardStats, completionStats] = await Promise.allSettled([
      productionApi.getDashboardStatistics(),
      productionApi.getProcessCompletionRates(),
      fetchPendingPlans()
    ]);

    // 处理统计数据 - axios拦截器已解包
    let stats = getDefaultStatistics('production');
    if (dashboardStats.status === 'fulfilled' && dashboardStats.value) {
      const data = dashboardStats.value.data || dashboardStats.value;
      stats = {
        plans: {
          total: data.plans?.total || 0,
          pending: data.plans?.pending || 0
        },
        tasks: {
          total: data.tasks?.total || 0,
          inProgress: data.tasks?.inProgress || data.tasks?.in_progress || 0
        },
        processes: {
          completed: data.processes?.completed || 0,
          rate: data.processes?.rate || '0%'
        },
        reports: {
          total: data.reports?.total || 0,
          today: data.reports?.today || 0
        }
      };
    }

    if (completionStats.status === 'fulfilled' && completionStats.value) {
      const completionDataList = completionStats.value.data || completionStats.value || [];
      stats.processCompletion = Array.isArray(completionDataList) ? completionDataList.map(item => ({
        name: item.processName || item.process_name || `工序${item.task_id || ''}`,
        rate: item.completionRate || item.completion_rate || '0%'
      })) : [];
    }

    return stats;
  } catch (error) {
    console.error('获取生产数据失败:', error);
    throw error;
  }
}

// 初始化生产趋势图表
function initProductionTrendChart() {
  if (!chartRefs.productionTrend?.value) return null;

  const ctx = chartRefs.productionTrend.value.getContext('2d');

  // 根据时间范围生成标签
  const labels = productionTimeRange.value === 'year'
    ? generateMonthLabels(12)
    : generateDayLabels();

  const planData = new Array(labels.length).fill(null);
  const completedData = new Array(labels.length).fill(null);

  const config = createLineChartConfig({
    yAxisTitle: '数量'
  });

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: productionTrendType.value === 'quantity' ? '完成数量' : '生产计划',
          data: productionTrendType.value === 'quantity' ? completedData : planData,
          borderColor: chartColors.primary[0],
          backgroundColor: chartColors.primary[4],
          tension: 0.4,
          fill: true
        }
      ]
    },
    options: config
  });
}

// 生成当月日期标签
function generateDayLabels() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const labels = [];
  for (let i = 1; i <= daysInMonth; i++) {
    labels.push(`${i}日`);
  }
  return labels;
}

// 初始化工序完成率图表
function initProcessChart() {
  if (!chartRefs.processCompletion?.value) return null;

  const ctx = chartRefs.processCompletion.value.getContext('2d');

  const labels = ['下料', '加工', '装配', '检验', '包装'];
  const completionData = new Array(5).fill(null);

  // 如果有统计数据，使用真实数据
  if (statistics?.processCompletion && Array.isArray(statistics.processCompletion) && statistics.processCompletion.length > 0) {
    labels.length = 0;
    completionData.length = 0;
    statistics.processCompletion.forEach(item => {
      labels.push(item.name || item.processName || '未知工序');
      const rateStr = item.rate || item.completionRate || '0%';
      // 提取百分比数字
      const rateNum = parseFloat(String(rateStr).replace('%', '')) || 0;
      completionData.push(rateNum);
    });
  }

  const config = createBarChartConfig({
    yAxisTitle: '完成率(%)',
    yAxisMax: 100
  });

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '完成率',
          data: completionData,
          backgroundColor: chartColors.primary[0],
          borderColor: chartColors.primary[1],
          borderWidth: 1
        }
      ]
    },
    options: config
  });
}



// 重新创建生产趋势图表
let productionTrendChart = null;
function recreateProductionTrendChart() {
  try {
    // 销毁现有图表
    if (productionTrendChart) {
      productionTrendChart.destroy();
      productionTrendChart = null;
    }

    if (!chartRefs.productionTrend?.value) return;

    const ctx = chartRefs.productionTrend.value.getContext('2d');

    // 根据时间范围生成标签和数据
    let labels, data;
    if (productionTimeRange.value === 'year') {
      // 年度：按月显示
      labels = generateMonthLabels(12);
      data = new Array(12).fill(null);
    } else {
      // 月度：按日显示
      labels = generateDayLabels();
      data = new Array(labels.length).fill(null);
    }

    const config = createLineChartConfig({
      yAxisTitle: '数量'
    });

    productionTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: productionTrendType.value === 'quantity' ? '完成数量' : '生产计划',
            data: data,
            borderColor: chartColors.primary[0],
            backgroundColor: chartColors.primary[4],
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: config
    });

    // 重新加载数据
    loadAndUpdateProductionTrends();
  } catch (error) {
    console.error('[生产趋势图表] 重新创建失败:', error);
  }
}

// 监听生产趋势类型变化
watch(productionTrendType, () => {
  recreateProductionTrendChart();
});

// 监听生产时间范围变化
watch(productionTimeRange, () => {
  recreateProductionTrendChart();
});

// 根据加载完成的统计数据，更新工序完成率图表
function updateProcessCompletionChart() {
  try {
    const chartCanvas = chartRefs.processCompletion?.value;
    if (!chartCanvas) return;

    const chartInstance = Chart.getChart(chartCanvas);
    if (!chartInstance) return;

    const completionData = statistics.processCompletion;
    if (!Array.isArray(completionData) || completionData.length === 0) return;

    const labels = completionData.map(item => item.name || item.processName || '未知工序');
    const data = completionData.map(item => {
      const rateStr = item.rate || item.completionRate || '0%';
      return parseFloat(String(rateStr).replace('%', '')) || 0;
    });

    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = data;
    chartInstance.update();
  } catch (error) {
    console.error('[工序完成率图表] 更新失败:', error);
  }
}

// 生命周期钩子
onMounted(async () => {
  try {
    // 初始化图表
    await initAllCharts({
      productionTrend: initProductionTrendChart,
      processCompletion: initProcessChart
    });

    // 保存图表实例
    productionTrendChart = chartRefs.productionTrend.value ?
      Chart.getChart(chartRefs.productionTrend.value) : null;

    // 加载数据（统计卡片等）
    await loadData();

    // 数据加载完成后，更新工序完成率图表（因为 initProcessChart 在数据到达前就已创建空图表）
    updateProcessCompletionChart();

    // 加载并更新月度生产趋势
    await loadAndUpdateProductionTrends();
  } catch (error) {
    handleDashboardError(error, '生产仪表盘初始化失败');
  }
});



// 获取待处理生产任务
async function fetchPendingPlans() {
  try {
    loading.value = true;
    // 获取状态为待处理的生产任务
    const params = {
      status: ['pending'],
      pageSize: 100
    };
    const response = await productionApi.getProductionTasks(params);

    // 拦截器已解包，response.data 就是业务数据
    const responseData = response.data;
    const plansList = responseData?.items || responseData?.list || (Array.isArray(responseData) ? responseData : []);
    
    pendingPlans.value = plansList.map(item => ({
      id: item.id,
      code: item.code,
      productId: item.product_id,
      productName: item.productName || item.product_name || '未知产品',
      productCode: item.productCode || item.product_code || '-',
      quantity: item.quantity,
      startDate: item.start_date || item.startDate || item.created_at,
      endDate: item.end_date || item.endDate || item.deadline,
      manager: item.operator || item.manager || '-',
      status: item.status
    }));

  } catch (error) {
    console.error('获取待处理生产任务失败:', error);
    console.error('错误详情:', error.response || error.message);
    ElMessage.error('获取待处理生产任务失败');
    pendingPlans.value = [];
  } finally {
    loading.value = false;
  }
}

// 从后端加载趋势数据并更新图表
async function loadAndUpdateProductionTrends() {
  try {
    let labels, data;

    if (productionTimeRange.value === 'year') {
      // 年度：获取12个月的数据
      const resp = await productionApi.getDashboardTrends();
      const responseData = resp?.data || {};

      labels = Array.isArray(responseData.months) && responseData.months.length
        ? responseData.months
        : generateMonthLabels(12);

      const planned = Array.isArray(responseData.plannedData) ? responseData.plannedData : new Array(labels.length).fill(null);
      const completed = Array.isArray(responseData.completedData) ? responseData.completedData : new Array(labels.length).fill(null);

      // 根据选择的类型显示数据
      data = productionTrendType.value === 'quantity' ? completed : planned;
    } else {
      // 月度：获取当月每天的数据
      const resp = await productionApi.getDashboardTrends({ granularity: 'day' });
      const responseData = resp?.data || {};

      // 后端返回的是完整日期格式，需要转换为日期标签
      if (Array.isArray(responseData.days) && responseData.days.length) {
        labels = responseData.days.map(dateStr => {
          const day = new Date(dateStr).getDate();
          return `${day}日`;
        });
      } else {
        labels = generateDayLabels();
      }

      const planned = Array.isArray(responseData.plannedData) ? responseData.plannedData : new Array(labels.length).fill(null);
      const completed = Array.isArray(responseData.completedData) ? responseData.completedData : new Array(labels.length).fill(null);

      data = productionTrendType.value === 'quantity' ? completed : planned;
    }

    // 更新图表
    if (productionTrendChart) {
      productionTrendChart.data.labels = labels;
      productionTrendChart.data.datasets[0].label = productionTrendType.value === 'quantity' ? '完成数量' : '生产计划';
      productionTrendChart.data.datasets[0].data = data;
      productionTrendChart.update();
    }
  } catch (error) {
    // 加载生产趋势失败
  }
}

</script>

<style scoped>
.production-dashboard {
  padding: 10px;
}

.header-card {
  margin-bottom: var(--spacing-lg);
}

.header-card h2 {
  margin: 0;
  font-size: 22px;
  color: var(--el-text-color-primary);
}

.last-updated {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.mt-20 {
  margin-top: var(--spacing-lg);
}

.mb-20 {
  margin-bottom: var(--spacing-lg);
}


.primary-card {
  border-top: 4px solid var(--el-color-primary);
}

.success-card {
  border-top: 4px solid var(--el-color-success);
}

.info-card {
  border-top: 4px solid var(--el-color-info);
}

.warning-card {
  border-top: 4px solid var(--el-color-warning);
}

.danger-card {
  border-top: 4px solid var(--el-color-danger);
}

.stat-content {
  flex-grow: 1;
  padding: 10px 0;
}

.stat-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  color: var(--el-text-color-primary);
}

.stat-info {
  display: flex;
  justify-content: space-between;
}

.stat-main {
  text-align: left;
}


.stat-secondary {
  text-align: right;
}

.stat-secondary-value {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--el-text-color-primary);
}

.stat-secondary-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.card-footer {
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.chart-container {
  width: 100%;
  height: 300px;
  position: relative;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-size: 16px;
  font-weight: bold;
}

.card-header-with-search {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header-with-search span {
  font-size: 16px;
  font-weight: bold;
}

.search-input {
  max-width: 200px;
}



.text-danger {
  color: var(--el-color-danger);
  font-weight: bold;
}

.text-warning {
  color: var(--el-color-warning);
  font-weight: bold;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .search-input {
    max-width: 120px;
  }

  .stat-value {
    font-size: 22px;
  }

  .stat-secondary-value {
    font-size: 18px;
  }
}


/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>