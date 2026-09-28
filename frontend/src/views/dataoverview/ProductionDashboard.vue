<!--
/**
 * ProductionDashboard.vue
 * @description 生产数据概览组件
 * @date 2026-08-31
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page overview-page production-dashboard">
    <PageHeader title="生产数据概览" subtitle="计划、任务与产出关键指标">
      <template #actions>
        <span v-if="lastUpdated" class="last-updated">
          最后更新: {{ new Date(lastUpdated).toLocaleTimeString() }}
        </span>
      </template>
    </PageHeader>
    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card primary-card" shadow="hover">
          <div class="stat-value">{{ statistics.plans?.total || 0 }}</div>
          <div class="stat-label">生产计划</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.plans?.pending || 0 }}</span>
            <span class="stat-secondary-label">待完成</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-value">{{ statistics.tasks?.total || 0 }}</div>
          <div class="stat-label">生产任务</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.tasks?.inProgress || 0 }}</span>
            <span class="stat-secondary-label">进行中</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-value">{{ statistics.processes?.completed || 0 }}</div>
          <div class="stat-label">工序完成</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.processes?.rate || '0%' }}</span>
            <span class="stat-secondary-label">完成率</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-value">{{ statistics.reports?.total || 0 }}</div>
          <div class="stat-label">生产报工</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.reports?.today || 0 }}</span>
            <span class="stat-secondary-label">今日报工</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 图表区域 -->
    <el-row :gutter="16" class="mt-md">
      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
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
            <canvas ref="productionTrend"></canvas>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>工序完成率分布</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="processCompletion"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 生产任务 -->
    <el-row class="mt-20">
      <el-col :span="24">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>生产任务</span>
              <div class="header-actions">
                <el-input
                  v-model="search"
                  placeholder="搜索任务编号 / 产品 / 生产组 / 状态"
                  class="search-input"
                  :prefix-icon="Search"
                  clearable />
              </div>
            </div>
          </template>
          <el-table
            :data="productionTasks"
            class="table-row-click w-full"
            v-loading="taskLoading"
            border
            @row-click="(row, column, event) => handleTableRowView(row, column, event, () => router.push('/production/task'))">
            <el-table-column label="任务编号" prop="code" min-width="130" show-overflow-tooltip />
            <el-table-column label="产品名称" prop="productName" min-width="130" show-overflow-tooltip />
            <el-table-column label="物料编码" prop="productCode" min-width="120" show-overflow-tooltip />
            <el-table-column label="规格型号" prop="specs" min-width="140" show-overflow-tooltip />
            <el-table-column label="开始日期" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.startDate) }}
              </template>
            </el-table-column>
            <el-table-column label="数量" min-width="100">
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
            <el-table-column label="生产组" min-width="100" prop="manager" show-overflow-tooltip />
          </el-table>
          <div class="pagination-container" v-if="taskTotal > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, ...PAGE_SIZE_OPTIONS]"
              layout="total, sizes, prev, pager, next"
              :total="taskTotal"
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
import { getThemeDefaultPageSize } from '@/utils/themePageSize'
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, computed, onMounted, onBeforeUnmount, watch, toRefs } from 'vue';
import { debounce } from 'lodash-es';
import { usePaginatedFetching } from '@/composables/useDataFetching';
import { PAGE_SIZE_OPTIONS } from '@/config/pagination';
import { useRouter } from 'vue-router';
import { getProductionStatusColor, getProductionStatusText, PRODUCTION_STATUS_KEYS } from '@/constants/systemConstants'
import { formatDate as formatDateUtil } from '@/utils/helpers/formatters';
import Chart from '@/utils/chartCore';
import { Search } from '@element-plus/icons-vue';
import { productionApi } from '@/api';
import { useDashboard, useCharts } from '@/composables/useDashboard';
// 权限计算属性
import {
  handleDashboardError,
  generateMonthLabels
} from '@/utils/dashboardUtils';
import {
  createBarChartConfig,
  createLineChartConfig,
  chartColors
} from '@/utils/chartConfig';
const router = useRouter();
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
  statistics,
  lastUpdated,
  loadData
} = useDashboard('production', loadProductionData, {
  autoRefresh: true,
  immediate: false,
  refreshInterval: 5 * 60 * 1000 // 5分钟
});
// 使用图表管理组合式函数
const {
  chartInstances,
  initChart,
  initAllCharts,
} = useCharts(chartRefs);
// Task filtering and pagination share the API query; no fixed first-page snapshot.
const search = ref('');
const {
  loading: taskLoading, data: taskRows, pagination: taskPagination,
  fetchData: fetchTaskPage, handleSizeChange, handlePageChange: handleCurrentChange
} = usePaginatedFetching(query => {
  const keyword = search.value.trim();
  const keywordStatuses = Object.values(PRODUCTION_STATUS_KEYS).filter(status =>
    keyword && getProductionStatusText(status).toLowerCase().includes(keyword.toLowerCase())
  );
  return productionApi.getProductionTasks({ ...query, keyword, keywordStatuses: keywordStatuses.join(',') });
}, { pageSize: getThemeDefaultPageSize(10), errorMessage: '获取生产任务失败' });
const { current: currentPage, pageSize, total: taskTotal } = toRefs(taskPagination);
const productionTasks = computed(() => taskRows.value.map(item => ({
  ...item,
  specs: item.specification || '-',
  startDate: item.startDate || item.plannedStartTime || item.createdAt,
  manager: item.manager || '-'
})));
const fetchProductionTasks = () => fetchTaskPage();
const searchTasks = debounce(() => {
  currentPage.value = 1;
  fetchProductionTasks();
}, 300);
watch(search, searchTasks);

// 格式化日期
function formatDate(date) {
  if (!date) return '-';
  return formatDateUtil(date, 'YYYY-MM-DD');
}
// 获取状态类型
function getStatusType(status) {
  return getProductionStatusColor(status);
}
const getStatusText = getProductionStatusText;
// 加载生产数据
async function loadProductionData() {
  const [dashboardResponse, completionResponse] = await Promise.all([
    productionApi.getDashboardStatistics(),
    productionApi.getProcessCompletionRates(),
    fetchProductionTasks()
  ]);
  const data = dashboardResponse.data || {};
  const completion = completionResponse.data;
  return {
    plans: { total: data.plans?.total || 0, pending: data.plans?.pending || 0 },
    tasks: { total: data.tasks?.total || 0, inProgress: data.tasks?.inProgress || 0 },
    processes: { completed: data.processes?.completed || 0, rate: data.processes?.rate || '0%' },
    reports: { total: data.reports?.total || 0, today: data.reports?.today || 0 },
    processCompletion: Array.isArray(completion) ? completion.map(item => ({
      name: item.processName || `工序${item.taskId || ''}`,
      rate: item.completionRate || '0%'
    })) : []
  };
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
          borderColor: () => chartColors.primary[0],
          backgroundColor: () => chartColors.primary[4],
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
          backgroundColor: () => chartColors.primary[0],
          borderColor: () => chartColors.primary[1],
          borderWidth: 1
        }
      ]
    },
    options: config
  });
}
// 重新创建生产趋势图表
let productionTrendChart = null;
let disposed = false;
let trendRequest = 0;
async function recreateProductionTrendChart() {
  await initChart('productionTrend', initProductionTrendChart);
  if (disposed) return;
  productionTrendChart = chartInstances.productionTrend || null;
  if (productionTrendChart) await loadAndUpdateProductionTrends();
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
watch(() => statistics.processCompletion, updateProcessCompletionChart);
// 生命周期钩子
onBeforeUnmount(() => {
  disposed = true;
  searchTasks.cancel();
  productionTrendChart = null;
});

onMounted(async () => {
  try {
    // 初始化图表
    await initAllCharts({
      productionTrend: initProductionTrendChart,
      processCompletion: initProcessChart
    });
    if (disposed) return;
    // 保存图表实例
    productionTrendChart = chartRefs.productionTrend.value ?
      Chart.getChart(chartRefs.productionTrend.value) : null;
    // 加载数据（统计卡片等）
    await loadData();
    if (disposed) return;
    // 加载并更新月度生产趋势
    await loadAndUpdateProductionTrends();
  } catch (error) {
    handleDashboardError(error, '生产仪表盘初始化失败');
  }
});
// 从后端加载趋势数据并更新图表
async function loadAndUpdateProductionTrends() {
  const request = ++trendRequest;
  const chart = productionTrendChart;
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
    if (!disposed && request === trendRequest && chart && chart === chartInstances.productionTrend) {
      productionTrendChart.data.labels = labels;
      productionTrendChart.data.datasets[0].label = productionTrendType.value === 'quantity' ? '完成数量' : '生产计划';
      productionTrendChart.data.datasets[0].data = data;
      productionTrendChart.update();
    }
  } catch {
    // 加载生产趋势失败
  }
}
</script>
<style scoped>
.text-danger {
  color: var(--el-color-danger);
  font-weight: bold;
}
.text-warning {
  color: var(--el-color-warning);
  font-weight: bold;
}
/* 响应式调整 */

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
