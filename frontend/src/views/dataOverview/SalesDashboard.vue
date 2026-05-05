<!--
/**
 * SalesDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="sales-dashboard">
    <el-card class="header-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>销售数据概览</h2>
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
            <div class="stat-title">销售订单</div>
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
            <el-button type="primary" link @click="$router.push('/sales/orders')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">本月销售额</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ formatCurrency(statistics.currentMonth?.amount) }}</div>
                <div class="stat-label">销售总额</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.currentMonth?.count || 0 }}</div>
                <div class="stat-secondary-label">订单数</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="success" link @click="$router.push('/sales/orders')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">销售退货</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.returns?.total || 0 }}</div>
                <div class="stat-label">总数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ formatCurrency(statistics.returns?.amount) }}</div>
                <div class="stat-secondary-label">退货金额</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="info" link @click="$router.push('/sales/returns')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">销售回款</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ formatCurrency(statistics.receivables?.collected) }}</div>
                <div class="stat-label">已回款</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ formatCurrency(statistics.receivables?.pending) }}</div>
                <div class="stat-secondary-label">待回款</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="warning" link @click="$router.push('/finance/ar/invoices')">
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
              <span>销售趋势</span>
              <el-radio-group v-model="salesTrendType" size="small">
                <el-radio-button value="amount">销售额</el-radio-button>
                <el-radio-button value="count">订单量</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="salesTrend" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>客户销售排名</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="customerRank" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 最近销售订单 -->
    <el-row class="mt-20">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>最近销售订单</span>
              <el-input 
                v-model="search"
                placeholder="搜索"
                class="search-input"
                :prefix-icon="Search" />
            </div>
          </template>
          <el-table
            :data="filteredRecentOrders"
            style="width: 100%"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="recentOrders.length === 0 ? '暂无销售订单' : '没有匹配的数据'"
          >
            <el-table-column label="订单编号" prop="orderNo" min-width="120" />
            <el-table-column label="客户名称" prop="customerName" min-width="180" />
            <el-table-column label="订单日期" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.orderDate) }}
              </template>
            </el-table-column>
            <el-table-column label="订单金额" min-width="120">
              <template #default="scope">
                {{ formatCurrency(scope.row.amount) }}
              </template>
            </el-table-column>
            <el-table-column label="状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getStatusColor(scope.row.status)">
                  {{ getStatusText(scope.row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="付款状态" min-width="100">
              <template #default="scope">
                <el-tag :type="getPaymentStatusColor(scope.row.paymentStatus)">
                  {{ getPaymentStatusText(scope.row.paymentStatus) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="120" fixed="right">
              <template #default="scope">
                <el-button 
                  type="primary" 
                  text 
                  size="small" 
                  @click="$router.push(`/sales/orders?id=${scope.row.id}`)"
                >查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-container" v-if="recentOrders.length > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="recentOrders.length"
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
import { parseListData } from '@/utils/responseParser';
import { formatDate } from '@/utils/helpers/dateUtils'
import { ref, computed, onMounted, watch, toRaw, nextTick } from 'vue'
import Chart from 'chart.js/auto';
// 安全的Chart.js创建函数
function createSafeChart(ctx, config) {
  try {
    // 验证上下文
    if (!ctx || typeof ctx.save !== 'function') {
      console.error('无效的canvas上下文');
      return null;
    }
    
    // 验证上下文是否可用
    ctx.save();
    ctx.restore();
    
    // 创建图表
    return new Chart(ctx, config);
  } catch (error) {
    console.error('创建Chart.js实例失败:', error);
    return null;
  }
}
import { Search, ArrowRight } from '@element-plus/icons-vue';
import { salesApi } from '@/services/api';
import { useDashboard, useCharts } from '@/composables/useDashboard';
import {
  handleDashboardError,
  formatCurrency,
  getDefaultStatistics,
  generateMonthLabels
} from '@/utils/dashboardUtils';
import {
  createBarChartConfig,
  createLineChartConfig,
  chartColors
} from '@/utils/chartConfig';
;
// 图表引用
const salesTrend = ref(null);
const customerRank = ref(null);
const chartRefs = {
  salesTrend,
  customerRank
};
// 销售趋势类型（金额/数量）选择
const salesTrendType = ref('amount');
// 使用仪表盘组合式函数
const {
  loading,
  statistics,
  lastUpdated,
  loadData
} = useDashboard('sales', loadSalesData, {
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000 // 5分钟
});
// 使用图表管理组合式函数
const {
  chartInstances,
  initAllCharts,
} = useCharts(chartRefs);
// 销售订单数据
const recentOrders = ref([]);
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);
// 筛选后的订单
const filteredRecentOrders = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;
  
  // 确保recentOrders是数组
  let orders = Array.isArray(recentOrders.value) ? recentOrders.value : [];
  
  if (search.value) {
    const searchValue = search.value.toLowerCase();
    orders = orders.filter(order => 
      (order.orderNo && order.orderNo.toLowerCase().includes(searchValue)) || 
      (order.customerName && order.customerName.toLowerCase().includes(searchValue)) ||
      (order.status && order.status.toLowerCase().includes(searchValue))
    );
  }
  
  return orders.slice(startIndex, endIndex);
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
// formatDate: 使用公共实现
// 获取订单状态颜色
function getStatusColor(status) {
  if (!status) return 'info';
  const statusMap = {
    'pending': 'warning',
    'confirmed': 'primary',
    'processing': 'primary',
    'in_production': 'info',
    'ready_to_ship': 'success',
    'shipped': 'success',
    'delivered': 'success',
    'completed': 'success',
    'cancelled': 'danger',
    '待处理': 'warning',
    '已确认': 'primary',
    '处理中': 'primary',
    '生产中': 'info',
    '可发货': 'success',
    '已发货': 'success',
    '已交付': 'success',
    '已完成': 'success',
    '已取消': 'danger'
  };
  return statusMap[status] || 'info';
}
// 获取付款状态颜色
function getPaymentStatusColor(status) {
  if (!status) return 'info';
  const statusMap = {
    'unpaid': 'danger',
    'partial': 'warning',
    'paid': 'success',
    'refunded': 'info',
    '未付款': 'danger',
    '部分付款': 'warning',
    '已付款': 'success',
    '已退款': 'info'
  };
  return statusMap[status] || 'info';
}
// 获取状态文本
function getStatusText(status) {
  if (!status) return '-';
  
  const statusTextMap = {
    'pending': '待处理',
    'confirmed': '已确认',
    'processing': '处理中',
    'in_production': '生产中',
    'ready_to_ship': '可发货',
    'shipped': '已发货',
    'delivered': '已交付',
    'completed': '已完成',
    'cancelled': '已取消'
  };
  
  return statusTextMap[status] || status;
}
// 获取付款状态文本
function getPaymentStatusText(status) {
  if (!status) return '-';
  const paymentStatusTextMap = {
    'unpaid': '未付款',
    'partial': '部分付款',
    'paid': '已付款',
    'refunded': '已退款'
  };
  return paymentStatusTextMap[status] || status;
}
// 根据订单状态推断付款状态
function getPaymentStatusFromOrderStatus(orderStatus) {
  const statusMap = {
    'draft': 'unpaid',
    'pending': 'unpaid',
    'confirmed': 'unpaid',
    'processing': 'unpaid',
    'in_production': 'unpaid',
    'ready_to_ship': 'partial',
    'shipped': 'partial',
    'delivered': 'paid',
    'completed': 'paid',
    'cancelled': 'unpaid'
  };
  return statusMap[orderStatus] || 'unpaid';
}
// 加载销售数据
async function loadSalesData() {
  try {
    // 并行获取多个数据源
    const [statsResponse, ordersResponse, trendResponse] = await Promise.allSettled([
      salesApi.getSalesStatistics(),
      salesApi.getOrders({
        page: 1,
        pageSize: 20,
        sort: 'created_at',
        order: 'desc'
      }),
      salesApi.getSalesTrend()
    ]);
    // 处理统计数据
    let stats = getDefaultStatistics('sales');
    if (statsResponse.status === 'fulfilled' && statsResponse.value?.data) {
      const data = statsResponse.value.data;
      stats = {
        orders: {
          total: parseInt(data.completed_orders || 0) + parseInt(data.pending_orders || 0),
          pending: parseInt(data.pending_orders || 0)
        },
        currentMonth: {
          amount: parseFloat(data.monthly_sales || 0),
          count: parseInt(data.monthly_orders || 0)
        },
        returns: {
          total: parseInt(data.returns_count || 0),
          amount: parseFloat(data.returns_amount || 0)
        },
        receivables: {
          collected: parseFloat(data.collected_amount || 0),
          pending: parseFloat(data.pending_amount || 0)
        }
      };
      // 保存Top客户和产品数据用于图表
      stats.top_customers = data.top_customers || [];
      stats.top_products = data.top_products || [];
    }
    // 处理趋势数据
    if (trendResponse.status === 'fulfilled' && trendResponse.value?.data) {
      stats.trend_data = trendResponse.value.data.trend_data || [];
    }
    // 处理订单数据
    if (ordersResponse.status === 'fulfilled' && ordersResponse.value) {
      // 使用统一解析器处理响应数据
      const ordersItems = parseListData(ordersResponse.value, { enableLog: false });
      recentOrders.value = ordersItems.slice(0, 10).map(order => ({
        id: order.id,
        orderNo: order.order_no || order.orderNumber || `SO${order.id}`,
        customerName: order.customer_name || order.customerName || '未知客户',
        amount: parseFloat(order.total_amount || order.totalAmount || 0),
        status: order.status || 'pending',
        orderDate: order.created_at || order.createdAt || order.order_date || new Date().toISOString(),
        paymentStatus: order.payment_status || getPaymentStatusFromOrderStatus(order.status)
      }));
    }
    return stats;
  } catch (error) {
    console.error('获取销售数据失败:', error);
    throw error;
  }
}
// 初始化销售趋势图表
function initSalesTrendChart() {
  if (!chartRefs.salesTrend?.value) {
    console.warn('salesTrend canvas元素不存在');
    return null;
  }
  const canvas = chartRefs.salesTrend.value;
  if (!canvas) {
    console.warn('salesTrend canvas元素为null');
    return null;
  }
  
  // 确保canvas已经渲染
  if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
    console.warn('salesTrend canvas尺寸为0，等待渲染完成');
    return null;
  }
  
  // 设置canvas尺寸
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('无法获取salesTrend canvas 2D上下文');
    return null;
  }
  
  // 验证上下文是否可用
  try {
    ctx.save();
    ctx.restore();
  } catch (error) {
    console.error('salesTrend canvas上下文不可用:', error);
    return null;
  }
  // 初始化时使用空数据，等待数据加载完成后更新
  const labels = generateMonthLabels(12);
  const salesData = new Array(12).fill(0);
  const config = createLineChartConfig({
    yAxisTitle: '销售金额(元)' // 使用静态值，后续通过update更新
  });
  return createSafeChart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '销售金额', // 使用静态值，后续通过update更新
          data: salesData,
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
// 初始化客户排名图表
function initCustomerRankChart() {
  if (!chartRefs.customerRank?.value) {
    console.warn('customerRank canvas元素不存在');
    return null;
  }
  const canvas = chartRefs.customerRank.value;
  if (!canvas) {
    console.warn('customerRank canvas元素为null');
    return null;
  }
  
  // 确保canvas已经渲染
  if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
    console.warn('customerRank canvas尺寸为0，等待渲染完成');
    return null;
  }
  
  // 设置canvas尺寸
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('无法获取customerRank canvas 2D上下文');
    return null;
  }
  
  // 验证上下文是否可用
  try {
    ctx.save();
    ctx.restore();
  } catch (error) {
    console.error('customerRank canvas上下文不可用:', error);
    return null;
  }
  // 初始化时使用空数据，等待数据加载完成后更新
  const labels = ['加载中...'];
  const salesData = [0];
  const config = createBarChartConfig({
    yAxisTitle: '销售金额(元)'
  });
  return createSafeChart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '销售金额',
          data: salesData,
          backgroundColor: chartColors.primary[0],
          borderColor: chartColors.primary[1],
          borderWidth: 1
        }
      ]
    },
    options: config
  });
}
// 重新创建销售趋势图表
function recreateSalesTrendChart() {
  try {
    // 销毁现有图表
    if (chartInstances.salesTrend) {
      chartInstances.salesTrend.destroy();
      chartInstances.salesTrend = null;
    }
    // 重新创建图表
    if (chartRefs.salesTrend?.value) {
      const canvas = chartRefs.salesTrend.value;
      if (!canvas) return;
      
      // 设置canvas尺寸
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('无法获取salesTrend canvas 2D上下文');
        return;
      }
      
      // 验证上下文是否可用
      try {
        ctx.save();
        ctx.restore();
      } catch (error) {
        console.error('salesTrend canvas上下文不可用:', error);
        return;
      }
      const trendData = toRaw(statistics.trend_data) || [];
      let labels, salesData;
      if (trendData.length > 0) {
        labels = trendData.map(item => {
          const date = new Date(item.month + '-01');
          return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short' });
        });
        salesData = trendData.map(item => {
          const val = salesTrendType.value === 'amount' ? item.sales_amount : item.order_count;
          return val !== undefined ? val : null;
        });
      } else {
        labels = generateMonthLabels(12);
        salesData = new Array(12).fill(null);
      }
      const config = createLineChartConfig({
        yAxisTitle: salesTrendType.value === 'amount' ? '销售金额(元)' : '订单数量'
      });
      chartInstances.salesTrend = createSafeChart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: salesTrendType.value === 'amount' ? '销售金额' : '订单数量',
              data: salesData,
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
  } catch (error) {
    console.error('[销售趋势图表] 重新创建失败:', error);
  }
}
// 重新创建客户排名图表
function recreateCustomerRankChart() {
  try {
    // 销毁现有图表
    if (chartInstances.customerRank) {
      chartInstances.customerRank.destroy();
      chartInstances.customerRank = null;
    }
    // 重新创建图表
    if (chartRefs.customerRank?.value) {
      const canvas = chartRefs.customerRank.value;
      if (!canvas) return;
      
      // 设置canvas尺寸
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('无法获取customerRank canvas 2D上下文');
        return;
      }
      
      // 验证上下文是否可用
      try {
        ctx.save();
        ctx.restore();
      } catch (error) {
        console.error('customerRank canvas上下文不可用:', error);
        return;
      }
      const topCustomers = toRaw(statistics.top_customers) || [];
      const labels = topCustomers.length > 0
        ? topCustomers.map(customer => customer.name || '未知客户')
        : ['暂无数据'];
      const salesData = topCustomers.length > 0
        ? topCustomers.map(customer => customer.sales !== undefined ? customer.sales : null)
        : [];
      const config = createBarChartConfig({
        yAxisTitle: '销售金额(元)'
      });
      chartInstances.customerRank = createSafeChart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '销售金额',
              data: salesData,
              backgroundColor: chartColors.primary[0],
              borderColor: chartColors.primary[1],
              borderWidth: 1
            }
          ]
        },
        options: config
      });
    }
  } catch (error) {
    console.error('[客户排名图表] 重新创建失败:', error);
  }
}
// 监听销售趋势类型变化
watch(salesTrendType, () => {
  recreateSalesTrendChart();
});
// 监听statistics变化，当数据更新时更新图表
let customerUpdateTimer = null;
let trendUpdateTimer = null;
watch(() => statistics.top_customers, (newCustomers, oldCustomers) => {
  if (newCustomers && newCustomers.length > 0 && newCustomers !== oldCustomers) {
    // 清除之前的定时器，避免重复更新
    if (customerUpdateTimer) {
      clearTimeout(customerUpdateTimer);
    }
    customerUpdateTimer = setTimeout(() => {
      recreateCustomerRankChart();
      customerUpdateTimer = null;
    }, 200);
  }
}, { deep: false }); // 改为浅监听，避免深度监听导致的性能问题
watch(() => statistics.trend_data, (newTrendData, oldTrendData) => {
  if (newTrendData && newTrendData.length > 0 && newTrendData !== oldTrendData) {
    // 清除之前的定时器，避免重复更新
    if (trendUpdateTimer) {
      clearTimeout(trendUpdateTimer);
    }
    trendUpdateTimer = setTimeout(() => {
      recreateSalesTrendChart();
      trendUpdateTimer = null;
    }, 200);
  }
}, { deep: false }); // 改为浅监听，避免深度监听导致的性能问题
// 生命周期钩子
onMounted(async () => {
  try {
    // 等待DOM完全渲染
    await nextTick();
    
    // 等待canvas元素完全渲染
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 确保canvas元素存在且已渲染
    let retryCount = 0;
    const maxRetries = 5;
    
    while (retryCount < maxRetries) {
      const salesTrendCanvas = chartRefs.salesTrend?.value;
      const customerRankCanvas = chartRefs.customerRank?.value;
      
      if (salesTrendCanvas && customerRankCanvas && 
          salesTrendCanvas.offsetWidth > 0 && salesTrendCanvas.offsetHeight > 0 &&
          customerRankCanvas.offsetWidth > 0 && customerRankCanvas.offsetHeight > 0) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      retryCount++;
    }
    
    // 初始化图表
    await initAllCharts({
      salesTrend: initSalesTrendChart,
      customerRank: initCustomerRankChart
    });
    // 加载数据 - 数据加载完成后会通过watch自动更新图表
    await loadData();
  } catch (error) {
    handleDashboardError(error, '销售仪表盘初始化失败');
  }
});
// 加载仪表盘数据}
// 初始化图表}
// 获取销售趋势数据}
// 监听销售趋势类型变化，更新图表
watch(salesTrendType, () => {
  initSalesTrendChart();
});
</script>
<style scoped>
.sales-dashboard {
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
