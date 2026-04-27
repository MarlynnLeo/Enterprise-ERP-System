<!--
/**
 * InventoryDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-dashboard">
    <el-card class="header-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>库存数据概览</h2>
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
            <div class="stat-title">总库存量</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.totalStock || 0 }}</div>
                <div class="stat-label">SKU</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ formatCurrency(statistics.totalValue) }}</div>
                <div class="stat-secondary-label">总价值</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="primary" link @click="$router.push('/inventory/stock')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">本月入库</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.inbound?.count || 0 }}</div>
                <div class="stat-label">单据数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.inbound?.items || 0 }}</div>
                <div class="stat-secondary-label">物料数</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="success" link @click="$router.push('/inventory/inbound')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">本月出库</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.outbound?.count || 0 }}</div>
                <div class="stat-label">单据数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.outbound?.items || 0 }}</div>
                <div class="stat-secondary-label">物料数</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="info" link @click="$router.push('/inventory/outbound')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">库存预警</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.alerts?.low || 0 }}</div>
                <div class="stat-label">低库存预警</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.alerts?.overstock || 0 }}</div>
                <div class="stat-secondary-label">超额库存</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="warning" link @click="$router.push('/inventory/stock')">
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
              <span>月度库存变化趋势</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="stockTrend" height="300"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>库存分类占比</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="categoryDistribution" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 低库存预警 -->
    <el-row class="mt-20">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>库存预警清单</span>
              <el-input 
                v-model="search"
                placeholder="搜索"
                class="search-input"
                :prefix-icon="Search" />
            </div>
          </template>
          <el-table
            :data="filteredAlertItems"
            style="width: 100%"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="alertItems.length === 0 ? '暂无预警物料' : '没有匹配的数据'"
          >
            <el-table-column label="物料代码" prop="code" min-width="120" />
            <el-table-column label="物料名称" prop="name" min-width="180" />
            <el-table-column label="规格型号" prop="specification" min-width="120" />
            <el-table-column label="库存数量" min-width="100">
              <template #default="scope">
                <span :class="{ 'text-danger': scope.row.type === 'low', 'text-warning': scope.row.type === 'overstock' }">
                  {{ scope.row.quantity }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="单位" prop="unit" min-width="80" />
            <el-table-column label="安全库存" prop="safetyStock" min-width="100" />
            <el-table-column label="最大库存" prop="maxStock" min-width="100" />
            <el-table-column label="库存状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getStatusTagType(scope.row)">
                  {{ getStatusText(scope.row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="所在库位" prop="location" min-width="120" />
            <el-table-column label="操作" min-width="120" fixed="right">
              <template #default="scope">
                <el-button 
                  type="primary" 
                  text 
                  size="small" 
                  @click="viewMaterial(scope.row)"
                >查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-container" v-if="alertItems.length > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="alertItems.length"
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

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router';
import Chart from 'chart.js/auto';
import { ElMessage } from 'element-plus';
import { Search, ArrowRight } from '@element-plus/icons-vue';
import { inventoryApi } from '@/services/api'
import { useDashboard, useCharts } from '@/composables/useDashboard';
import { formatCurrency, formatQuantity, getDefaultStatistics, generateMonthLabels } from '@/utils/dashboardUtils'
import { createLineChartConfig, createPieChartConfig, chartColors } from '@/utils/chartConfig'

const router = useRouter();

// 图表引用
const stockTrend = ref(null);
const categoryDistribution = ref(null);

const chartRefs = {
  stockTrend,
  categoryDistribution
};

// 使用仪表盘组合式函数
const {
  loading,
  statistics,
  lastUpdated,
  loadData
} = useDashboard('inventory', loadInventoryData, {
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000 // 5分钟
});

// 使用图表管理组合式函数
const {
  chartInstances,
  chartsReady,
  initAllCharts,
  updateChart,
  destroyAllCharts
} = useCharts(chartRefs);

// 预警物料数据
const alertItems = ref([]);
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

// 存储后端全量报表数据
const dashboardData = ref(null);

// 加载库存数据
async function loadInventoryData() {
  try {
    const response = await inventoryApi.getDashboardSummary();
    const data = response.data || response;
    
    dashboardData.value = data;
    alertItems.value = data.alertItems || [];
    
    // 返回标准统计对象格式供 useDashboard 使用
    return {
      totalStock: data.statistics?.totalStock || 0,
      totalValue: data.statistics?.totalValue || 0,
      inbound: data.statistics?.inbound || { count: 0, items: 0 },
      outbound: data.statistics?.outbound || { count: 0, items: 0 },
      alerts: data.statistics?.alerts || { low: 0, overstock: 0 }
    };
  } catch (error) {
    console.error('获取看板全量聚合数据失败:', error);
    throw error;
  }
}

// 筛选后的预警物料
const filteredAlertItems = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;

  // 确保alertItems是数组
  let items = Array.isArray(alertItems.value) ? alertItems.value : [];

  if (search.value) {
    const searchValue = search.value.toLowerCase();
    items = items.filter(item =>
      (item.code && item.code.toLowerCase().includes(searchValue)) ||
      (item.name && item.name.toLowerCase().includes(searchValue)) ||
      (item.specification && item.specification.toLowerCase().includes(searchValue)) ||
      (item.location && item.location.toLowerCase().includes(searchValue))
    );
  }

  return items.slice(startIndex, endIndex);
});

// 分页处理
function handleSizeChange(size) {
  pageSize.value = size;
  currentPage.value = 1;
}

function handleCurrentChange(page) {
  currentPage.value = page;
}

// 查看物料详情
function viewMaterial(item) {
  router.push(`/basedata/materials?search=${item.code}`);
}

// 获取状态标签类型
function getStatusTagType(item) {
  if (item.status === '零库存' || item.type === 'critical' || item.quantity === 0) {
    return 'danger';
  } else if (item.status === '低库存' || item.type === 'low') {
    return 'warning';
  } else if (item.type === 'overstock') {
    return 'info';
  }
  return 'info';
}

// 获取状态文本
function getStatusText(item) {
  if (item.status) {
    return item.status;
  } else if (item.quantity === 0) {
    return '零库存';
  } else if (item.type === 'critical') {
    return '零库存';
  } else if (item.type === 'low') {
    return '低库存';
  } else if (item.type === 'overstock') {
    return '超额库存';
  }
  return '正常';
}

// 获取月度趋势数据 (从 dashboardData 中取)
async function getMonthlyTrendData() {
  const monthlyData = {
    inbound: [],
    outbound: []
  };
  
  try {
    const trend = dashboardData.value?.monthlyTrend || [];
    const today = new Date();
    
    // 获取过去12个月的数据
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const yyyyMm = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;
      
      const item = trend.find(t => t.month === yyyyMm);
      monthlyData.inbound.push(item ? parseFloat(item.inbound_qty || 0) : 0);
      monthlyData.outbound.push(item ? parseFloat(item.outbound_qty || 0) : 0);
    }
  } catch (error) {
    console.error('处理月度趋势数据失败:', error);
    return { inbound: Array(12).fill(0), outbound: Array(12).fill(0) };
  }
  return monthlyData;
}

// 获取物料分类分布数据 (从 dashboardData 中取)
async function getCategoryDistribution() {
  try {
    const distribution = dashboardData.value?.categoryDistribution;
    if (distribution && distribution.labels && distribution.labels.length > 0) {
      return distribution;
    }
  } catch (error) {
    console.error('处理分类分布数据失败:', error);
  }
  // 返回默认数据
  return {
    labels: ['未分类'],
    values: [1]
  };
}

// 生命周期钩子
onMounted(async () => {
  try {
    // 首先加载数据
    await loadData();
    
    // 然后初始化图表
    await initAllCharts({
      stockTrend: initStockTrendChart,
      categoryDistribution: initCategoryChart
    });
    
  } catch (error) {
    console.error('初始化库存仪表盘失败:', error);
    ElMessage.error('获取库存数据失败，请检查网络连接');
    
    // 出错时使用默认数据
    statistics.value = getDefaultStatistics('inventory');
    alertItems.value = [];
  }
});

// 初始化库存趋势图表
async function initStockTrendChart() {
  if (!chartRefs.stockTrend?.value) return null;

  const ctx = chartRefs.stockTrend.value.getContext('2d');

  try {
    // 获取过去12个月的月份标签
    const labels = generateMonthLabels(12);
    
    // 获取过去12个月的库存流水数据
    const monthlyData = await getMonthlyTrendData();
    
    const config = createLineChartConfig({
      tooltipFormatter: (context) => {
        const label = context.dataset.label || '';
        const value = formatQuantity(context.raw, '件');
        return `${label}: ${value}`;
      }
    });

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '入库数量',
            data: monthlyData.inbound,
            borderColor: chartColors.success[0],
            backgroundColor: chartColors.success[4],
            tension: 0.4,
            fill: false
          },
          {
            label: '出库数量',
            data: monthlyData.outbound,
            borderColor: chartColors.warning[0],
            backgroundColor: chartColors.warning[4],
            tension: 0.4,
            fill: false
          }
        ]
      },
      options: config
    });
  } catch (error) {
    console.warn('获取库存趋势数据失败，使用默认数据:', error);
    
    // 如果获取失败，使用默认数据
    const labels = generateMonthLabels(12);
    const inboundData = Array(12).fill(0);
    const outboundData = Array(12).fill(0);
    
    const config = createLineChartConfig({
      tooltipFormatter: (context) => {
        const label = context.dataset.label || '';
        const value = formatQuantity(context.raw, '件');
        return `${label}: ${value}`;
      }
    });

    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '入库数量',
            data: inboundData,
            borderColor: chartColors.success[0],
            backgroundColor: chartColors.success[4],
            tension: 0.4,
            fill: false
          },
          {
            label: '出库数量',
            data: outboundData,
            borderColor: chartColors.warning[0],
            backgroundColor: chartColors.warning[4],
            tension: 0.4,
            fill: false
          }
        ]
      },
      options: config
    });
  }
}
// 初始化分类分布图表
async function initCategoryChart() {
  if (!chartRefs.categoryDistribution?.value) return null;

  const ctx = chartRefs.categoryDistribution.value.getContext('2d');

  try {
    // 获取物料分类统计数据
    const categoryData = await getCategoryDistribution();
    
    const config = createPieChartConfig({
      tooltipFormatter: (context) => {
        const label = context.label || '';
        const value = context.raw || 0;
        const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
        const percentage = Math.round((value / total) * 100);
        return `${label}: ${percentage}%`;
      }
    });

    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categoryData.labels,
        datasets: [
          {
            label: '库存分布',
            data: categoryData.values,
            backgroundColor: chartColors.primary,
            borderWidth: 0
          }
        ]
      },
      options: config
    });
  } catch (error) {
    console.warn('获取分类分布数据失败，使用默认数据:', error);
    
    // 如果获取失败，使用默认数据
    const labels = ['原材料', '半成品', '成品', '辅料', '包装材料', '备品备件'];
    const inventoryData = [0, 0, 0, 0, 0, 0];
    
    const config = createPieChartConfig({
      tooltipFormatter: (context) => {
        const label = context.label || '';
        const value = context.raw || 0;
        const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
        const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
        return `${label}: ${percentage}%`;
      }
    });

    return new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [
          {
            label: '库存分布',
            data: inventoryData,
            backgroundColor: chartColors.primary,
            borderWidth: 0
          }
        ]
      },
      options: config
    });
  }
}

</script>

<style scoped>
.inventory-dashboard {
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

.chart-container {
  width: 100%;
  height: 300px;
  position: relative;
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