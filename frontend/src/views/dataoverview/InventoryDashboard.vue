<!--
/**
 * InventoryDashboard.vue
 * @description 鍓嶇鐣岄潰缁勪欢鏂囦欢
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-dashboard">
    <el-card class="header-card">
      <div class="flex justify-between align-center">
        <h2>搴撳瓨鏁版嵁姒傝</h2>
        <div>
          <span v-if="lastUpdated" class="last-updated">
            鏈€鍚庢洿鏂? {{ new Date(lastUpdated).toLocaleTimeString() }}
<!--
/**
 * InventoryDashboard.vue
 * @description 鍓嶇鐣岄潰缁勪欢鏂囦欢
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-dashboard">
    <el-card class="header-card">
      <div class="flex justify-between align-center">
        <h2>搴撳瓨鏁版嵁姒傝</h2>
        <div>
          <span v-if="lastUpdated" class="last-updated">
            鏈€鍚庢洿鏂? {{ new Date(lastUpdated).toLocaleTimeString() }}
          </span>
        </div>
      </div>
    </el-card>
    <!-- 缁熻鍗＄墖 -->
    <el-row :gutter="20" class="mt-lg">
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-lg">
        <el-card class="stat-card primary-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">鎬诲簱瀛橀噺</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.totalStock || 0 }}</div>
                <div class="stat-label">SKU</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value total-value-highlight">{{ formatCurrency(statistics.totalValue) }}</div>
                <div class="stat-secondary-label">鎬讳环鍊?/div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="primary" link @click="$router.push('/inventory/stock')">
              鏌ョ湅璇︽儏 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-lg">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">鏈湀鍏ュ簱</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.inbound?.count || 0 }}</div>
                <div class="stat-label">鍗曟嵁鏁?/div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.inbound?.items || 0 }}</div>
                <div class="stat-secondary-label">鐗╂枡鏁?/div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="success" link @click="$router.push('/inventory/inbound')">
              鏌ョ湅璇︽儏 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-lg">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">鏈湀鍑哄簱</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.outbound?.count || 0 }}</div>
                <div class="stat-label">鍗曟嵁鏁?/div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.outbound?.items || 0 }}</div>
                <div class="stat-secondary-label">鐗╂枡鏁?/div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="info" link @click="$router.push('/inventory/outbound')">
              鏌ョ湅璇︽儏 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-lg">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">搴撳瓨棰勮</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.alerts?.low || 0 }}</div>
                <div class="stat-label">浣庡簱瀛橀璀?/div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.alerts?.overstock || 0 }}</div>
                <div class="stat-secondary-label">瓒呴搴撳瓨</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="warning" link @click="$router.push('/inventory/stock')">
              鏌ョ湅璇︽儏 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 鍥捐〃鍖哄煙 -->
    <el-row :gutter="20" class="mt-lg">
      <el-col :xs="24" :md="12" class="mb-lg">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>鏈堝害搴撳瓨鍙樺寲瓒嬪娍</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="stockTrend" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12" class="mb-lg">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>搴撳瓨鍒嗙被鍗犳瘮</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="categoryDistribution" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="24" class="mb-lg">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>浠撳簱閲戦鍒嗗竷</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="warehouseValueChart" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 浣庡簱瀛橀璀?-->
    <el-row class="mt-lg">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>搴撳瓨棰勮娓呭崟</span>
              <el-input
                v-model="search"
                placeholder="鎼滅储"
                class="search-input"
                :prefix-icon="Search" />
            </div>
          </template>
          <el-table
            :data="filteredAlertItems"
            class="w-full"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="alertItems.length === 0 ? '鏆傛棤棰勮鐗╂枡' : '娌℃湁鍖归厤鐨勬暟鎹?"
          >
            <el-table-column label="鐗╂枡浠ｇ爜" prop="code" min-width="120" />
            <el-table-column label="鐗╂枡鍚嶇О" prop="name" min-width="180" />
            <el-table-column label="瑙勬牸鍨嬪彿" prop="specification" min-width="120" />
            <el-table-column label="搴撳瓨鏁伴噺" min-width="100">
              <template #default="scope">
                <span :class="{ 'text-danger font-bold': scope.row.type === 'low', 'text-warning font-bold': scope.row.type === 'overstock' }">
                  {{ scope.row.quantity }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="鍗曚綅" prop="unit" min-width="80" />
            <el-table-column label="瀹夊叏搴撳瓨" prop="safetyStock" min-width="100" />
            <el-table-column label="鏈€澶у簱瀛? prop="maxStock" min-width="100" />
            <el-table-column label="搴撳瓨鐘舵€? min-width="100">
              <template #default="scope">
                <el-tag :type="getStatusTagType(scope.row)">
                  {{ getStatusText(scope.row) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="鎵€鍦ㄥ簱浣? prop="location" min-width="120" />
            <el-table-column label="鎿嶄綔" min-width="120" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button
                  type="primary"
                  text
                  size="small"
                  @click="viewMaterial(scope.row)"
                >鏌ョ湅</el-button>
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
import Chart from '@/utils/chartCore';
import { ElMessage } from 'element-plus';
import { Search, ArrowRight } from '@element-plus/icons-vue';
import { inventoryApi } from '@/api'
import { useDashboard, useCharts } from '@/composables/useDashboard';
import { formatCurrency, formatQuantity, getDefaultStatistics, generateMonthLabels } from '@/utils/dashboardUtils'
import { createLineChartConfig, createPieChartConfig, createBarChartConfig, chartColors } from '@/utils/chartConfig'
const router = useRouter();
// 鍥捐〃寮曠敤
const stockTrend = ref(null);
const categoryDistribution = ref(null);
const warehouseValueChart = ref(null);
const chartRefs = {
  stockTrend,
  categoryDistribution,
  warehouseValueChart
};
// 浣跨敤浠〃鐩樼粍鍚堝紡鍑芥暟
const {
  loading,
  statistics,
  lastUpdated,
  loadData
} = useDashboard('inventory', loadInventoryData, {
  autoRefresh: true,
  immediate: false,
  refreshInterval: 5 * 60 * 1000 // 5鍒嗛挓
});
// 浣跨敤鍥捐〃绠＄悊缁勫悎寮忓嚱鏁?const {
  initAllCharts,
} = useCharts(chartRefs);
// 棰勮鐗╂枡鏁版嵁
const alertItems = ref([]);
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);
// 瀛樺偍鍚庣鍏ㄩ噺鎶ヨ〃鏁版嵁
const dashboardData = ref(null);
// 鍔犺浇搴撳瓨鏁版嵁
async function loadInventoryData() {
  try {
    const response = await inventoryApi.getDashboardSummary();
    const data = response.data || response;

    dashboardData.value = data;
    alertItems.value = data.alertItems || [];

    // 杩斿洖鏍囧噯缁熻瀵硅薄鏍煎紡渚?useDashboard 浣跨敤
    return {
      totalStock: data.statistics?.totalStock || 0,
      totalValue: data.statistics?.totalValue || 0,
      inbound: data.statistics?.inbound || { count: 0, items: 0 },
      outbound: data.statistics?.outbound || { count: 0, items: 0 },
      alerts: data.statistics?.alerts || { low: 0, overstock: 0 }
    };
  } catch (error) {
    console.error('鑾峰彇鐪嬫澘鍏ㄩ噺鑱氬悎鏁版嵁澶辫触:', error);
    throw error;
  }
}
// 绛涢€夊悗鐨勯璀︾墿鏂?const filteredAlertItems = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;
  // 纭繚alertItems鏄暟缁?  let items = Array.isArray(alertItems.value) ? alertItems.value : [];
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
// 鍒嗛〉澶勭悊
function handleSizeChange(size) {
  pageSize.value = size;
  currentPage.value = 1;
}
function handleCurrentChange(page) {
  currentPage.value = page;
}
// 鏌ョ湅鐗╂枡璇︽儏
function viewMaterial(item) {
  router.push(`/basedata/materials?search=${item.code}`);
}
// 鑾峰彇鐘舵€佹爣绛剧被鍨?function getStatusTagType(item) {
  if (item.status === '闆跺簱瀛? || item.type === 'critical' || item.quantity === 0) {
    return 'danger';
  } else if (item.status === '浣庡簱瀛? || item.type === 'low') {
    return 'warning';
  } else if (item.type === 'overstock') {
    return 'info';
  }
  return 'info';
}
// 鑾峰彇鐘舵€佹枃鏈?function getStatusText(item) {
  if (item.status) {
    return item.status;
  } else if (item.quantity === 0) {
    return '闆跺簱瀛?;
  } else if (item.type === 'critical') {
    return '闆跺簱瀛?;
  } else if (item.type === 'low') {
    return '浣庡簱瀛?;
  } else if (item.type === 'overstock') {
    return '瓒呴搴撳瓨';
  }
  return '姝ｅ父';
}
// 鑾峰彇鏈堝害瓒嬪娍鏁版嵁 (浠?dashboardData 涓彇)
async function getMonthlyTrendData() {
  const monthlyData = {
    inbound: [],
    outbound: []
  };

  try {
    const trend = dashboardData.value?.monthlyTrend || [];
    const today = new Date();

    // 鑾峰彇杩囧幓12涓湀鐨勬暟鎹?    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const yyyyMm = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`;

      const item = trend.find(t => t.month === yyyyMm);
      monthlyData.inbound.push(item ? parseFloat(item.inbound_qty || 0) : 0);
      monthlyData.outbound.push(item ? parseFloat(item.outbound_qty || 0) : 0);
    }
  } catch (error) {
    console.error('澶勭悊鏈堝害瓒嬪娍鏁版嵁澶辫触:', error);
    return { inbound: Array(12).fill(0), outbound: Array(12).fill(0) };
  }
  return monthlyData;
}
// 鑾峰彇鐗╂枡鍒嗙被鍒嗗竷鏁版嵁 (浠?dashboardData 涓彇)
async function getCategoryDistribution() {
  try {
    const distribution = dashboardData.value?.categoryDistribution;
    if (distribution && distribution.labels && distribution.labels.length > 0) {
      return distribution;
    }
  } catch (error) {
    console.error('澶勭悊鍒嗙被鍒嗗竷鏁版嵁澶辫触:', error);
  }
  return {
    labels: [],
    values: []
  };
}
// 鐢熷懡鍛ㄦ湡閽╁瓙
onMounted(async () => {
  try {
    // 棣栧厛鍔犺浇鏁版嵁
    await loadData();

    // 鐒跺悗鍒濆鍖栧浘琛?    await initAllCharts({
      stockTrend: initStockTrendChart,
      categoryDistribution: initCategoryChart,
      warehouseValueChart: initWarehouseValueChart
    });

  } catch (error) {
    console.error('鍒濆鍖栧簱瀛樹华琛ㄧ洏澶辫触:', error);
    ElMessage.error('鑾峰彇搴撳瓨鏁版嵁澶辫触锛岃妫€鏌ョ綉缁滆繛鎺?);

    // 鍑洪敊鏃舵竻绌哄睍绀烘暟鎹紝閬垮厤灞曠ず浼€犲簱瀛?    statistics.value = getDefaultStatistics('inventory');
    alertItems.value = [];
  }
});
// 鍒濆鍖栧簱瀛樿秼鍔垮浘琛?async function initStockTrendChart() {
  if (!chartRefs.stockTrend?.value) return null;
  const ctx = chartRefs.stockTrend.value.getContext('2d');
  try {
    // 鑾峰彇杩囧幓12涓湀鐨勬湀浠芥爣绛?    const labels = generateMonthLabels(12);

    // 鑾峰彇杩囧幓12涓湀鐨勫簱瀛樻祦姘存暟鎹?    const monthlyData = await getMonthlyTrendData();

    const config = createLineChartConfig({
      tooltipFormatter: (context) => {
        const label = context.dataset.label || '';
        const value = formatQuantity(context.raw, '浠?);
        return `${label}: ${value}`;
      }
    });
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '鍏ュ簱鏁伴噺',
            data: monthlyData.inbound,
            borderColor: chartColors.success[0],
            backgroundColor: chartColors.success[4],
            tension: 0.4,
            fill: false
          },
          {
            label: '鍑哄簱鏁伴噺',
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
  } catch {

    const labels = generateMonthLabels(12);
    const inboundData = Array(12).fill(0);
    const outboundData = Array(12).fill(0);

    const config = createLineChartConfig({
      tooltipFormatter: (context) => {
        const label = context.dataset.label || '';
        const value = formatQuantity(context.raw, '浠?);
        return `${label}: ${value}`;
      }
    });
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: '鍏ュ簱鏁伴噺',
            data: inboundData,
            borderColor: chartColors.success[0],
            backgroundColor: chartColors.success[4],
            tension: 0.4,
            fill: false
          },
          {
            label: '鍑哄簱鏁伴噺',
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
// 鍒濆鍖栧垎绫诲垎甯冨浘琛?async function initCategoryChart() {
  if (!chartRefs.categoryDistribution?.value) return null;
  const ctx = chartRefs.categoryDistribution.value.getContext('2d');
  try {
    // 鑾峰彇鐗╂枡鍒嗙被缁熻鏁版嵁
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
            label: '搴撳瓨鍒嗗竷',
            data: categoryData.values,
            backgroundColor: chartColors.primary,
            borderWidth: 0
          }
        ]
      },
      options: config
    });
  } catch {

    const labels = [];
    const inventoryData = [];

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
            label: '搴撳瓨鍒嗗竷',
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

// 鍒濆鍖栦粨搴撻噾棰濇帓琛屽浘琛?async function initWarehouseValueChart() {
  if (!chartRefs.warehouseValueChart?.value) return null;
  const ctx = chartRefs.warehouseValueChart.value.getContext('2d');
  try {
    // 浠庡悗绔幏鍙栧簱瀛樼粺璁℃暟鎹紙鍖呭惈浠撳簱閲戦锛?    let locationData = [];
    try {
      const statsResponse = await inventoryApi.getStockStatistics();
      const statsData = statsResponse.data || statsResponse;
      locationData = statsData.totalValueByLocation || [];
    } catch (e) {
      console.error('鑾峰彇浠撳簱閲戦鏁版嵁澶辫触:', e);
    }

    if (locationData.length === 0) {
      // 鏃犳暟鎹椂鏄剧ず绌哄浘琛?      const config = createBarChartConfig({
        tooltipFormatter: (context) => {
          return `${context.label}: ${formatCurrency(context.raw)}`;
        }
      });
      return new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['鏆傛棤鏁版嵁'],
          datasets: [{
            label: '搴撳瓨閲戦',
            data: [0],
            backgroundColor: chartColors.primary[0],
            borderRadius: 6
          }]
        },
        options: { ...config, indexAxis: 'y' }
      });
    }

    const labels = locationData.map(item => item.name);
    const values = locationData.map(item => item.value);
    const colors = locationData.map((_, i) => chartColors.primary[i % chartColors.primary.length]);

    const config = createBarChartConfig({
      tooltipFormatter: (context) => {
        const label = context.label || '';
        const value = formatCurrency(context.raw);
        const item = locationData[context.dataIndex];
        return `${label}: ${value} (${item?.itemCount || 0}绉峉KU)`;
      }
    });

    return new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '搴撳瓨閲戦',
          data: values,
          backgroundColor: colors,
          borderRadius: 6,
          barThickness: 24
        }]
      },
      options: {
        ...config,
        indexAxis: 'y',
        scales: {
          x: {
            ...config.scales?.x,
            ticks: {
              ...config.scales?.x?.ticks,
              callback: function(value) {
                if (value >= 10000) {
                  return (value / 10000).toFixed(1) + '涓?;
                }
                return value;
              }
            }
          },
          y: {
            ...config.scales?.y,
            ticks: {
              ...config.scales?.y?.ticks,
              font: { size: 12 }
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('鍒濆鍖栦粨搴撻噾棰濇帓琛屽浘琛ㄥけ璐?', error);
    return null;
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
  color: var(--color-text-primary);
}
.last-updated {
  margin-left: 10px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.primary-card {
  border-top: 4px solid var(--color-primary);
}
.success-card {
  border-top: 4px solid var(--color-success);
}
.info-card {
  border-top: 4px solid var(--color-info);
}
.warning-card {
  border-top: 4px solid var(--color-warning);
}
.danger-card {
  border-top: 4px solid var(--color-danger);
}
.stat-content {
  flex-grow: 1;
  padding: 10px 0;
}
.stat-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  color: var(--color-text-primary);
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
  color: var(--color-text-primary);
}
.stat-secondary-value.total-value-highlight {
  font-size: 22px;
  font-weight: 700;
  color: #c68a17;
}
.stat-secondary-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}
.card-footer {
  padding-top: 10px;
  border-top: 1px solid var(--color-border-lighter);
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
/* 鍝嶅簲寮忚皟鏁?*/
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
/* 璇︽儏瀵硅瘽妗嗛暱鏂囨湰澶勭悊 - 鑷姩娣诲姞 */
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
