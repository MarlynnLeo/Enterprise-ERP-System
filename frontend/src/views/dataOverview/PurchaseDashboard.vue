<!--
/**
 * PurchaseDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-dashboard">
    <el-card class="header-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>采购数据概览</h2>
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
            <div class="stat-title">采购申请</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.requisitions?.completed || 0 }}</div>
                <div class="stat-label">本月已完成</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.requisitions?.pending || 0 }}</div>
                <div class="stat-secondary-label">待审批</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="primary" link @click="$router.push('/purchase/requisitions')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">采购订单</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.orders?.total || 0 }}</div>
                <div class="stat-label">总数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.orders?.pending || 0 }}</div>
                <div class="stat-secondary-label">待处理</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="success" link @click="$router.push('/purchase/orders')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">采购收货</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.receipts?.total || 0 }}</div>
                <div class="stat-label">总数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.receipts?.pending || 0 }}</div>
                <div class="stat-secondary-label">待处理</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="info" link @click="$router.push('/purchase/receipts')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">采购退货</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.returns?.total || 0 }}</div>
                <div class="stat-label">总数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.returns?.pending || 0 }}</div>
                <div class="stat-secondary-label">待处理</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="warning" link @click="$router.push('/purchase/returns')">
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
              <span>月度采购趋势</span>
              <el-radio-group v-model="timeRange" size="small">
                <el-radio-button value="6">近6月</el-radio-button>
                <el-radio-button value="12">近12月</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="purchaseTrend" height="300"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>采购类别分布</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="categoryDistribution" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 待处理采购事项 -->
    <el-row class="mt-20">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>待处理采购事项</span>
              <el-input 
                v-model="search"
                placeholder="搜索"
                class="search-input"
                :prefix-icon="Search"
                />
            </div>
          </template>
          <el-table
            :data="filteredPendingItems"
            style="width: 100%"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="pendingItems.length === 0 ? '暂无待处理事项' : '没有匹配的数据'"
          >
            <el-table-column label="类型" min-width="100">
              <template #default="scope">
                <el-tag :type="getTypeColor(scope.row.type)">{{ getTypeText(scope.row.type) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="number" label="单号" min-width="150" />
            <el-table-column label="日期" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.date) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getPurchaseStatusColor(scope.row.status)">
                  {{ getStatusText(scope.row.status, scope.row.type) || '未知状态' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="supplier" label="供应商" min-width="230">
              <template #default="scope">
                <div>{{ scope.row.supplier || '无' }}</div>
                <div class="text-muted" v-if="scope.row.supplierCode">{{ scope.row.supplierCode }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="amount" label="金额" min-width="120">
              <template #default="scope">
                {{ scope.row.amount ? `¥${scope.row.amount.toLocaleString()}` : '-' }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="120" fixed="right">
              <template #default="scope">
                <el-button 
                  type="primary" 
                  text 
                  size="small" 
                  @click="viewPurchaseItem(scope.row)"
                >查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-container" v-if="pendingItems.length > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="pendingItems.length"
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
import { parseListData } from '@/utils/responseParser';

import { ref, computed, onMounted, watch } from 'vue'

import { useRouter } from 'vue-router';
import Chart from 'chart.js/auto';

import { Search, ArrowRight } from '@element-plus/icons-vue';
import { purchaseApi } from '@/services/api';
import { useDashboard, useCharts } from '@/composables/useDashboard';
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性
import { handleDashboardError, getDefaultStatistics, generateMonthLabels } from '@/utils/dashboardUtils'

import { createLineChartConfig, createPieChartConfig, chartColors } from '@/utils/chartConfig'


const router = useRouter();

// 图表引用
const purchaseTrend = ref(null);
const categoryDistribution = ref(null);

const chartRefs = {
  purchaseTrend,
  categoryDistribution
};

// 图表配置
const timeRange = ref('6');

// 使用仪表盘组合式函数
const {
  loading,
  statistics,
  lastUpdated,
  loadData
} = useDashboard('purchase', loadPurchaseData, {
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

// 待处理采购事项数据
const pendingItems = ref([]);
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

// 加载采购数据
async function loadPurchaseData() {
  try {
    // 获取当前月份的开始和结束日期
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const queryParams = {
      startDate: currentMonthStart.toISOString().split('T')[0],
      endDate: currentMonthEnd.toISOString().split('T')[0],
      status: 'completed'
    };

    // 并行获取多个数据源
    const [dashboardStats, completedRequisitions, pendingRequisitions, orders, receipts, returns] = await Promise.allSettled([
      purchaseApi.getDashboardStatistics ? purchaseApi.getDashboardStatistics() : purchaseApi.getStatistics(),
      // 获取当月已完成的采购申请
      purchaseApi.getRequisitions({
        ...queryParams,
        pageSize: 100
      }),
      // 获取待处理的采购申请
      purchaseApi.getRequisitions({ status: 'pending', pageSize: 20 }),
      purchaseApi.getOrders({ status: 'pending', pageSize: 20 }),
      purchaseApi.getReceipts ? purchaseApi.getReceipts({ status: 'pending', limit: 20 }) : Promise.resolve({ data: [] }),
      purchaseApi.getReturns ? purchaseApi.getReturns({ status: 'pending', limit: 20 }) : Promise.resolve({ data: [] })
    ]);

    // 处理统计数据
    let stats = getDefaultStatistics('purchase');

    // 计算当月已完成的采购申请数量 - axios拦截器已解包
    let completedThisMonth = 0;

    if (completedRequisitions.status === 'fulfilled' && completedRequisitions.value) {
      const responseData = completedRequisitions.value.data || completedRequisitions.value;

      // 处理不同的响应数据结构
      let reqData = [];
      if (Array.isArray(responseData)) {
        reqData = responseData;
      } else if (responseData.items && Array.isArray(responseData.items)) {
        reqData = responseData.items;
      } else if (responseData.list && Array.isArray(responseData.list)) {
        reqData = responseData.list;
      } else if (responseData.data && Array.isArray(responseData.data)) {
        reqData = responseData.data;
      }

      completedThisMonth = reqData.length;
    } else {
      completedThisMonth = 0;
    }

    // 处理仪表盘统计数据 - axios拦截器已解包
    if (dashboardStats.status === 'fulfilled' && dashboardStats.value) {
      const data = dashboardStats.value.data || dashboardStats.value;
      // 提取统计数据（处理嵌套结构）
      const statsData = data.statistics || data;
      stats = {
        requisitions: {
          total: completedThisMonth,
          pending: statsData.requisitions?.pending || 0,
          completed: completedThisMonth
        },
        orders: {
          total: statsData.orders?.total || 0,
          pending: statsData.orders?.pending || 0
        },
        receipts: {
          total: statsData.receipts?.total || 0,
          pending: statsData.receipts?.pending || 0
        },
        returns: {
          total: statsData.returns?.total || 0,
          pending: statsData.returns?.pending || 0
        },
        // 保存趋势和分类数据供图表使用
        trendData: data.trendData || [],
        categoryDistribution: data.categoryDistribution || []
      };
    } else {
      stats.requisitions = {
        total: completedThisMonth,
        pending: 0,
        completed: completedThisMonth
      };
    }

    // 处理待处理事项数据
    const pendingItemsList = [];

    // 添加待处理申请单
    if (pendingRequisitions.status === 'fulfilled' && pendingRequisitions.value) {
      // 使用统一解析器处理响应数据
      const reqData = parseListData(pendingRequisitions.value, { enableLog: false });

      reqData.forEach(item => {
        pendingItemsList.push({
          id: item.id,
          type: 'requisition',
          number: item.requisition_number || item.number,
          supplier: item.supplier_name || '-',
          amount: item.total_amount || 0,
          date: item.request_date || item.created_at,
          status: item.status
        });
      });
    }

    // 添加待处理订单
    if (orders.status === 'fulfilled' && orders.value) {
      // 使用统一解析器处理响应数据
      const orderData = parseListData(orders.value, { enableLog: false });

      orderData.forEach(item => {
        pendingItemsList.push({
          id: item.id,
          type: 'order',
          number: item.order_no || item.number,
          supplier: item.supplier_name || '-',
          amount: item.total_amount || 0,
          date: item.order_date || item.created_at,
          status: item.status
        });
      });
    }

    pendingItems.value = pendingItemsList;

    return stats;
  } catch (error) {
    console.error('获取采购数据失败:', error);
    throw error;
  }
}

// 筛选后的待处理事项
const filteredPendingItems = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;

  // 确保pendingItems是数组
  let items = Array.isArray(pendingItems.value) ? pendingItems.value : [];

  if (search.value) {
    const searchValue = search.value.toLowerCase();
    items = items.filter(item =>
      (item.number && item.number.toLowerCase().includes(searchValue)) ||
      (item.supplier && item.supplier.toLowerCase().includes(searchValue)) ||
      (item.status && item.status.toLowerCase().includes(searchValue)) ||
      (getTypeText(item.type) && getTypeText(item.type).toLowerCase().includes(searchValue))
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

// 格式化日期
// formatDate 已统一引用公共实现

// 日期格式化
const formatDate = (dateStr) => {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
};

// 获取类型文本
function getTypeText(type) {
  const typeMap = {
    'requisition': '采购申请',
    'order': '采购订单',
    'receipt': '采购收货',
    'return': '采购退货'
  };
  return typeMap[type] || type;
}

// 获取类型颜色
function getTypeColor(type) {
  const colorMap = {
    'requisition': 'primary',
    'order': 'success',
    'receipt': 'info',
    'return': 'warning'
  };
  return colorMap[type] || 'info';
}

// 获取状态颜色
function getStatusColor(status) {
  const statusMap = {
    '草稿': 'info',
    '待审批': 'warning',
    '待确认': 'warning',
    '待收货': 'warning',
    '待入库': 'warning',
    '待开票': 'warning',
    '已审批': 'success',
    '已确认': 'success',
    '已完成': 'success',
    '已取消': 'danger',
    '已拒绝': 'danger'
  };
  return statusMap[status] || 'info';
}

import { getPurchaseStatusText, getPurchaseStatusColor } from '@/constants/systemConstants'

// 根据类型和状态获取状态文本
function getStatusText(status, type) {
  // 统一使用采购状态映射
  return getPurchaseStatusText(status)
}
// 删除多余的旧代码，现在统一使用systemConstants

// 查看采购事项详情
function viewPurchaseItem(item) {
  const routeMap = {
    'requisition': '/purchase/requisitions',
    'order': '/purchase/orders',
    'receipt': '/purchase/receipts',
    'return': '/purchase/returns'
  };
  
  const route = routeMap[item.type] || '/purchase';
  router.push({
    path: route,
    query: { id: item.id }
  });
}

// 初始化采购趋势图表 - 使用真实数据
function initPurchaseTrendChart() {
  if (!chartRefs.purchaseTrend?.value) return null;

  const ctx = chartRefs.purchaseTrend.value.getContext('2d');

  // 从统计数据获取趋势数据，如果没有则使用默认月份标签
  const trendData = statistics.trendData || [];
  let labels, requisitionData, orderData;

  if (trendData.length > 0) {
    labels = trendData.map(item => {
      const date = new Date(item.month + '-01');
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' });
    });
    // 采购数量也可能为0，不再用 || 0，以防真值为0时错误 fallback（虽然0也是0，但严谨起见）
    requisitionData = trendData.map(item => {
      const val = item.requisitionCount ?? item.requisition_count;
      return val !== undefined ? val : null;
    });
    orderData = trendData.map(item => {
      const val = item.orderCount ?? item.order_count;
      return val !== undefined ? val : null;
    });
  } else {
    labels = generateMonthLabels(parseInt(timeRange.value));
    requisitionData = new Array(labels.length).fill(null);
    orderData = new Array(labels.length).fill(null);
  }

  const config = createLineChartConfig({
    yAxisTitle: '数量'
  });

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '采购申请',
          data: requisitionData,
          borderColor: chartColors.primary[0],
          backgroundColor: chartColors.primary[4],
          tension: 0.4,
          fill: false
        },
        {
          label: '采购订单',
          data: orderData,
          borderColor: chartColors.success[0],
          backgroundColor: chartColors.success[4],
          tension: 0.4,
          fill: false
        }
      ]
    },
    options: config
  });
}

// 初始化分类分布图表 - 使用真实数据
function initCategoryChart() {
  if (!chartRefs.categoryDistribution?.value) return null;

  const ctx = chartRefs.categoryDistribution.value.getContext('2d');

  // 从统计数据获取分类分布
  const categoryData = statistics.categoryDistribution || [];
  let labels, purchaseData;

  if (categoryData.length > 0) {
    labels = categoryData.map(item => item.categoryName || item.category_name || '未分类');
    purchaseData = categoryData.map(item => {
      const val = item.totalAmount ?? item.total_amount;
      return val !== undefined ? parseFloat(val) : 0;
    });
  } else {
    labels = ['暂无数据'];
    purchaseData = [];
  }

  const config = createPieChartConfig();

  return new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [
        {
          label: '采购金额分布',
          data: purchaseData,
          backgroundColor: chartColors.primary,
          borderWidth: 0
        }
      ]
    },
    options: config
  });
}





// 生命周期钩子
onMounted(async () => {
  try {
    // 先加载数据，获取真实数据后再初始化图表
    await loadData();

    // 初始化图表，使用已加载的真实数据
    await initAllCharts({
      purchaseTrend: initPurchaseTrendChart,
      categoryDistribution: initCategoryChart
    });
  } catch (error) {
    handleDashboardError(error, '采购仪表盘初始化失败');
  }
});






// 监听时间范围变化，更新图表
watch(timeRange, () => {
  if (chartInstances.purchaseTrend) {
    updateChart('purchaseTrend', initPurchaseTrendChart);
  }
});
</script>

<style scoped>
.purchase-dashboard {
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



.text-muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
