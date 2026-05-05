<template>
  <div class="dashboard-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>成本驾驶舱</h2>
          <p class="subtitle">生产成本分析与监控中心</p>
        </div>
        <div class="action-buttons">
          <el-button type="primary" @click="refreshData">刷新数据</el-button>
          <el-button type="warning" @click="showWIPDialog = true">
            <el-icon><Setting /></el-icon> 月末成本结转
          </el-button>
        </div>
      </div>
    </el-card>
    <!-- 核心指标卡片 -->
    <el-row :gutter="20" class="stat-row">
      <el-col :xs="24" :sm="8" v-for="(stat, index) in statistics" :key="index">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" :class="stat.type">
            <el-icon><component :is="stat.icon" /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-label">{{ stat.label }}</div>
            <div class="stat-value">{{ formatCurrency(stat.value) }}</div>
            <div class="stat-trend" :class="stat.change >= 0 ? 'up' : 'down'">
              <span>{{ stat.change >= 0 ? '+' : '' }}{{ stat.change }}%</span>
              <span class="trend-label">较上月</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 图表区域 -->
    <el-row :gutter="20" class="chart-row">
      <!-- 成本趋势图 -->
      <el-col :span="24">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>成本趋势分析</span>
              <el-radio-group v-model="trendPeriod" size="small" @change="loadTrendData">
                <el-radio-button value="month">月度</el-radio-button>
                <el-radio-button value="quarter">季度</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div ref="trendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
    <el-row :gutter="20" class="chart-row">
      <!-- 成本构成饼图 -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>成本构成分析</span>
            </div>
          </template>
          <div ref="compositionChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <!-- 成本差异分析柱状图 -->
      <el-col :xs="24" :lg="12">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>成本差异分析 (标准 vs 实际)</span>
            </div>
          </template>
          <div ref="varianceChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 年度成本对比 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="24">
        <el-card class="yearly-comparison-card">
          <template #header>
            <div class="card-header">
              <span>年度成本累计对比</span>
              <el-select v-model="selectedYear" size="small" @change="loadYearlyComparison">
                <el-option v-for="y in yearOptions" :key="y" :label="`${y}年`" :value="y" />
              </el-select>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="6" v-for="(item, key) in yearlyComparison" :key="key">
              <div class="yearly-stat">
                <div class="yearly-label">{{ item.label }}</div>
                <div class="yearly-current">¥ {{ formatNumber(item.current) }}</div>
                <div class="yearly-growth" :class="item.growth >= 0 ? 'up' : 'down'">
                  <span>{{ item.growth >= 0 ? '↑' : '↓' }} {{ Math.abs(item.growth) }}%</span>
                  <span class="yearly-last">去年: ¥{{ formatNumber(item.last) }}</span>
                </div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>
    <!-- 成本预警列表 -->
    <el-row :gutter="20" class="chart-row">
      <el-col :span="24">
        <el-card class="alert-card">
          <template #header>
            <div class="card-header">
              <span>
                <el-badge :value="alerts.length" :max="99" class="alert-badge" type="danger">
                  成本预警
                </el-badge>
              </span>
              <el-button size="small" text @click="showAlertSettings = true">
                <el-icon><Setting /></el-icon> 预警设置
              </el-button>
            </div>
          </template>
          <el-table :data="alerts" size="small" max-height="280" v-loading="alertsLoading">
            <el-table-column prop="task_code" label="任务编号" width="150">
              <template #default="scope">
                <el-link type="primary">{{ scope.row.task_code }}</el-link>
              </template>
            </el-table-column>
            <el-table-column prop="product_name" label="产品名称" min-width="150" />
            <el-table-column label="标准成本" width="120" align="right">
              <template #default="scope">¥{{ formatNumber(scope.row.standard_total_cost) }}</template>
            </el-table-column>
            <el-table-column label="实际成本" width="120" align="right">
              <template #default="scope">¥{{ formatNumber(scope.row.actual_total_cost) }}</template>
            </el-table-column>
            <el-table-column label="差异" width="120" align="right">
              <template #default="scope">
                <span :class="scope.row.is_favorable ? 'text-success' : 'text-danger'">
                  {{ scope.row.is_favorable ? '+' : '' }}¥{{ formatNumber(scope.row.total_variance) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="差异率" width="100" align="center">
              <template #default="scope">
                <el-tag :type="scope.row.alert_level === 'critical' ? 'danger' : 'warning'" size="small">
                  {{ scope.row.variance_rate }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="时间" width="140" />
          </el-table>
          <div v-if="alerts.length === 0 && !alertsLoading" class="no-alerts">
            <el-empty description="暂无成本预警" :image-size="60" />
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 预警设置对话框 -->
    <el-dialog v-model="showAlertSettings" title="成本预警设置" width="500px">
      <el-form :model="alertSettings" label-width="150px">
        <el-form-item label="总成本差异阈值">
          <el-input-number v-model="alertSettings.variance_threshold" :min="1" :max="100" :precision="1" />
          <span style="margin-left: 10px;">%</span>
        </el-form-item>
        <el-form-item label="材料成本差异阈值">
          <el-input-number v-model="alertSettings.material_threshold" :min="1" :max="100" :precision="1" />
          <span style="margin-left: 10px;">%</span>
        </el-form-item>
        <el-form-item label="人工成本差异阈值">
          <el-input-number v-model="alertSettings.labor_threshold" :min="1" :max="100" :precision="1" />
          <span style="margin-left: 10px;">%</span>
        </el-form-item>
        <el-form-item label="制造费用差异阈值">
          <el-input-number v-model="alertSettings.overhead_threshold" :min="1" :max="100" :precision="1" />
          <span style="margin-left: 10px;">%</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAlertSettings = false">取消</el-button>
        <el-button v-permission="'finance:cost:update'" type="primary" @click="saveAlertSettings" :loading="savingAlertSettings">保存</el-button>
      </template>
    </el-dialog>
    <!-- 月末成本结转对话框 -->
    <el-dialog v-model="showWIPDialog" title="月末成本结转" width="600px">
      <el-form label-width="120px">
        <el-form-item label="选择会计期间">
          <el-select v-model="selectedPeriodId" placeholder="请选择期间" style="width: 100%;" :loading="periodsLoading">
            <el-option
              v-for="period in periods"
              :key="period.id"
              :label="period.period_name"
              :value="period.id"
            />
          </el-select>
        </el-form-item>
        <el-divider content-position="left">操作选项</el-divider>
        <div class="closing-actions">
          <el-card shadow="hover" class="action-card">
            <div class="action-content">
              <div class="action-info">
                <h4>计算在制品成本</h4>
                <p>遍历所有未完工任务，计算约当产量和WIP成本</p>
              </div>
              <el-button type="info" @click="calculateWIP" :loading="wipLoading">
                计算 WIP
              </el-button>
            </div>
          </el-card>
          <el-card shadow="hover" class="action-card">
            <div class="action-content">
              <div class="action-info">
                <h4>一键月末结转</h4>
                <p>自动执行：WIP计算 → WIP凭证 → 差异分摊</p>
              </div>
              <el-button type="primary" @click="executeCostClosing" :loading="closingLoading" v-permission="'finance:cost:settings'">
                执行结转
              </el-button>
            </div>
          </el-card>
        </div>
        <!-- 结果展示 -->
        <el-divider content-position="left" v-if="closingResult">执行结果</el-divider>
        <div v-if="closingResult" class="closing-result">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="WIP任务数">{{ closingResult.wip?.taskCount || 0 }}</el-descriptions-item>
            <el-descriptions-item label="WIP总成本">¥{{ formatNumber(closingResult.wip?.summary?.totalWIPCost) }}</el-descriptions-item>
            <el-descriptions-item label="WIP凭证ID">{{ closingResult.wipVoucher?.entryId || '未生成' }}</el-descriptions-item>
            <el-descriptions-item label="差异分摊产品数">{{ closingResult.variance?.productCount || 0 }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showWIPDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import * as echarts from 'echarts';
import { api } from '@/services/api';
import { Setting } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatCurrency } from '@/utils/helpers/formatters';
// 状态定义
const _loading = ref(false);
const trendPeriod = ref('month');
const trendChartRef = ref(null);
const compositionChartRef = ref(null);
const varianceChartRef = ref(null);
let trendChart = null;
let compositionChart = null;
let varianceChart = null;
const statistics = ref([
  { label: '本月总生产成本', value: 0, change: 0, icon: 'Money', type: 'primary' },
  { label: '本月材料成本', value: 0, change: 0, icon: 'TrendCharts', type: 'success' },
  { label: '本月制造费用', value: 0, change: 0, icon: 'DataLine', type: 'warning' }
]);
// 月末成本结转相关
const showWIPDialog = ref(false);
const selectedPeriodId = ref(null);
const periods = ref([]);
const periodsLoading = ref(false);
const wipLoading = ref(false);
const closingLoading = ref(false);
const closingResult = ref(null);
// 成本预警相关
const alerts = ref([]);
const alertsLoading = ref(false);
const showAlertSettings = ref(false);
const savingAlertSettings = ref(false);
const alertSettings = ref({
  variance_threshold: 10,
  material_threshold: 15,
  labor_threshold: 20,
  overhead_threshold: 25
});
// 年度成本对比相关
const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);
const yearOptions = [currentYear, currentYear - 1, currentYear - 2];
const yearlyComparison = ref({
  total: { label: '总成本累计', current: 0, last: 0, growth: 0 },
  material: { label: '材料成本', current: 0, last: 0, growth: 0 },
  labor: { label: '人工成本', current: 0, last: 0, growth: 0 },
  overhead: { label: '制造费用', current: 0, last: 0, growth: 0 }
});
// 格式化数字
// formatNumber 已统一引用公共实现;
// 数字格式化
const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined) return '0';
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
// 加载会计期间
const loadPeriods = async () => {
  periodsLoading.value = true;
  try {
    const res = await api.get('/finance/periods');
    // API拦截器已解包，res.data 就是业务数据
    if (res.data?.periods) {
      periods.value = res.data.periods;
      // 默认选择当前未关闭的期间
      const current = periods.value.find(p => !p.is_closed);
      if (current) selectedPeriodId.value = current.id;
    } else {
      periods.value = [];
      console.warn('未找到会计期间数据:', res.data);
    }
  } catch (error) {
    console.error('加载期间失败:', error);
  } finally {
    periodsLoading.value = false;
  }
};
// 计算在制品成本
const calculateWIP = async () => {
  if (!selectedPeriodId.value) {
    ElMessage.warning('请先选择会计期间');
    return;
  }
  wipLoading.value = true;
  try {
    const res = await api.get('/finance/automation/wip/calculate', {
      params: { periodId: selectedPeriodId.value }
    });
    // API拦截器已解包，res.data 直接是业务数据
    if (res.data?.taskCount !== undefined) {
      closingResult.value = { wip: res.data };
      const totalCost = res.data.summary?.totalWIPCost || 0;
      ElMessage.success(`WIP计算完成：${res.data.taskCount}个任务，总成本 ¥${formatNumber(totalCost)}`);
    } else {
      ElMessage.error(res.data?.message || 'WIP计算失败');
    }
  } catch (error) {
    console.error('WIP计算失败:', error);
    ElMessage.error('WIP计算失败: ' + (error.response?.data?.message || error.message));
  } finally {
    wipLoading.value = false;
  }
};
// 执行月末成本结转
const executeCostClosing = async () => {
  if (!selectedPeriodId.value) {
    ElMessage.warning('请先选择会计期间');
    return;
  }
  
  try {
    await ElMessageBox.confirm(
      '将执行以下操作：\n1. 计算在制品成本\n2. 生成WIP凭证\n3. 差异分摊\n\n确定要执行月末成本结转吗？',
      '月末成本结转确认',
      { type: 'warning', confirmButtonText: '确定执行', cancelButtonText: '取消' }
    );
  } catch {
    return; // 用户取消
  }
  closingLoading.value = true;
  try {
    const res = await api.post(`/finance/automation/cost-closing/${selectedPeriodId.value}`);
    // API拦截器已解包，res.data 直接是业务数据
    if (res.data) {
      closingResult.value = res.data;
      ElMessage.success('月末成本结转完成！');
      refreshData(); // 刷新驾驶舱数据
    } else {
      ElMessage.error('结转失败：未返回数据');
    }
  } catch (error) {
    console.error('月末结转失败:', error);
    ElMessage.error('月末结转失败: ' + (error.response?.data?.message || error.message));
  } finally {
    closingLoading.value = false;
  }
};
// 初始化图表
const initCharts = () => {
  if (trendChartRef.value) {
    trendChart = echarts.init(trendChartRef.value);
  }
  if (compositionChartRef.value) {
    compositionChart = echarts.init(compositionChartRef.value);
  }
  if (varianceChartRef.value) {
    varianceChart = echarts.init(varianceChartRef.value);
  }
  
  window.addEventListener('resize', handleResize);
};
const handleResize = () => {
  trendChart?.resize();
  compositionChart?.resize();
  varianceChart?.resize();
};
// 加载统计数据
const loadStatistics = async () => {
  try {
    const res = await api.get('/finance-enhancement/cost/statistics');
    // API拦截器已解包，res.data 就是业务数据
    const data = res.data;
    if (data) {
      statistics.value[0].value = data.totalCost || 0;
      statistics.value[0].change = data.totalCostGrowth || 0;
      statistics.value[1].value = data.materialCost || 0;
      statistics.value[1].change = data.materialCostGrowth || 0;
      statistics.value[2].value = data.overheadCost || 0;
      statistics.value[2].change = data.overheadCostGrowth || 0;
    }
  } catch (error) {
    console.error('Failed to load statistics', error);
  }
};
// 加载趋势数据
const loadTrendData = async () => {
  try {
    const res = await api.get('/finance-enhancement/cost/trend', { params: { period: trendPeriod.value } });
    // API拦截器已解包
    const data = res.data;
    if (data && data.trend && trendChart) {
      // 转换后端数据格式为图表需要的格式
      const dates = data.trend.map(item => item.month);
      const totalCost = data.trend.map(item => parseFloat(item.totalCost) || 0);
      const materialCost = data.trend.map(item => parseFloat(item.materialCost) || 0);
      const laborCost = data.trend.map(item => parseFloat(item.laborCost) || 0);
      const overheadCost = data.trend.map(item => parseFloat(item.overheadCost) || 0);
      
      const option = {
        tooltip: { trigger: 'axis' },
        legend: { data: ['生产总成本', '材料成本', '人工成本', '制造费用'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: dates },
        yAxis: { type: 'value' },
        series: [
          { name: '生产总成本', type: 'line', data: totalCost, smooth: true },
          { name: '材料成本', type: 'line', data: materialCost, smooth: true },
          { name: '人工成本', type: 'line', data: laborCost, smooth: true },
          { name: '制造费用', type: 'line', data: overheadCost, smooth: true }
        ]
      };
      trendChart.setOption(option);
    }
  } catch (error) {
    console.error('Failed to load trend data', error);
  }
};
// 加载构成数据
const loadCompositionData = async () => {
  try {
    const res = await api.get('/finance-enhancement/cost/composition');
    // API拦截器已解包
    const data = res.data;
    // 后端返回 {composition: [{name, value}]}
    if (data && data.composition && compositionChart) {
      const option = {
        tooltip: { trigger: 'item' },
        legend: { orient: 'vertical', left: 'left' },
        series: [
          {
            name: '成本构成',
            type: 'pie',
            radius: '50%',
            data: data.composition.map(item => ({ value: item.value || 0, name: item.name })),
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }
        ]
      };
      compositionChart.setOption(option);
    }
  } catch (error) {
    console.error('Failed to load composition data', error);
  }
};
// 加载差异数据（从真实API获取）
const loadVarianceData = async () => {
  try {
    const res = await api.get('/finance-enhancement/cost/variance', { params: { pageSize: 20 } });
    // API拦截器已解包，res.data 即为 { list, total }
    const listData = res.data?.list || res.data?.data?.list || [];
    
    if (listData.length > 0 && varianceChart) {
      // 按产品名称分组汇总
      const productMap = new Map();
      listData.forEach(item => {
        const name = item.product_name || '未知产品';
        if (!productMap.has(name)) {
          productMap.set(name, { standard: 0, actual: 0 });
        }
        const data = productMap.get(name);
        data.standard += parseFloat(item.standard_total) || 0;
        data.actual += parseFloat(item.actual_total) || 0;
      });
      
      // 转换为图表数据格式（取前8个产品）
      const entries = Array.from(productMap.entries()).slice(0, 8);
      const categories = entries.map(([name]) => name);
      const standard = entries.map(([, data]) => Math.round(data.standard * 100) / 100);
      const actual = entries.map(([, data]) => Math.round(data.actual * 100) / 100);
      
      const option = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { data: ['标准成本', '实际成本'] },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: categories },
        series: [
          { name: '标准成本', type: 'bar', label: { show: true, position: 'insideRight' }, data: standard },
          { name: '实际成本', type: 'bar', label: { show: true, position: 'insideRight' }, data: actual }
        ]
      };
      varianceChart.setOption(option);
    }
  } catch (error) {
    console.error('加载差异数据失败:', error);
  }
};
// 加载成本预警
const loadCostAlerts = async () => {
  alertsLoading.value = true;
  try {
    const res = await api.get('/finance-enhancement/cost/alerts');
    alerts.value = res.data?.list || [];
  } catch (error) {
    console.error('加载成本预警失败:', error);
    alerts.value = [];
  } finally {
    alertsLoading.value = false;
  }
};
// 加载预警配置
const loadAlertSettings = async () => {
  try {
    const res = await api.get('/finance-enhancement/cost/alert-settings');
    if (res.data) {
      alertSettings.value = {
        ...alertSettings.value,
        variance_threshold: parseFloat(res.data.variance_threshold) || 10,
        material_threshold: parseFloat(res.data.material_threshold) || 15,
        labor_threshold: parseFloat(res.data.labor_threshold) || 20,
        overhead_threshold: parseFloat(res.data.overhead_threshold) || 25,
        is_active: res.data.is_active
      };
    }
  } catch (error) {
    console.error('加载预警配置失败:', error);
  }
};
// 保存预警配置
const saveAlertSettings = async () => {
  savingAlertSettings.value = true;
  try {
    await api.post('/finance-enhancement/cost/alert-settings', alertSettings.value);
    ElMessage.success('预警配置保存成功');
    showAlertSettings.value = false;
    loadCostAlerts(); // 重新加载预警
  } catch (error) {
    console.error('保存预警配置失败:', error);
    ElMessage.error('保存预警配置失败');
  } finally {
    savingAlertSettings.value = false;
  }
};
// 加载年度成本对比
const loadYearlyComparison = async () => {
  try {
    const res = await api.get('/finance-enhancement/cost/yearly-comparison', {
      params: { year: selectedYear.value }
    });
    const data = res.data;
    if (data) {
      yearlyComparison.value = {
        total: {
          label: '总成本累计',
          current: data.currentYearTotal?.total_cost || 0,
          last: data.lastYearTotal?.total_cost || 0,
          growth: data.growthRate?.total_cost || 0
        },
        material: {
          label: '材料成本',
          current: data.currentYearTotal?.material_cost || 0,
          last: data.lastYearTotal?.material_cost || 0,
          growth: data.growthRate?.material_cost || 0
        },
        labor: {
          label: '人工成本',
          current: data.currentYearTotal?.labor_cost || 0,
          last: data.lastYearTotal?.labor_cost || 0,
          growth: data.growthRate?.labor_cost || 0
        },
        overhead: {
          label: '制造费用',
          current: data.currentYearTotal?.overhead_cost || 0,
          last: data.lastYearTotal?.overhead_cost || 0,
          growth: data.growthRate?.overhead_cost || 0
        }
      };
    }
  } catch (error) {
    console.error('加载年度成本对比失败:', error);
  }
};
const refreshData = () => {
  loadStatistics();
  loadTrendData();
  loadCompositionData();
  loadVarianceData();
  loadCostAlerts();
  loadYearlyComparison();
  ElMessage.success('数据已刷新');
};
onMounted(async () => {
  await nextTick();
  initCharts();
  refreshData();
  loadPeriods(); // 加载会计期间
  loadAlertSettings(); // 加载预警配置
});
onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  trendChart?.dispose();
  compositionChart?.dispose();
  varianceChart?.dispose();
});
</script>
<style scoped>
.dashboard-container {
  padding: 20px;
}
.header-card {
  margin-bottom: 20px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title-section h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-text-primary);
}
.subtitle {
  margin: 5px 0 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.stat-row {
  margin-bottom: 20px;
}
.stat-card {
  display: flex;
  align-items: center;
  padding: 10px;
}
.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 30px;
  margin-right: 15px;
}
.stat-icon.primary { background-color: var(--color-primary-light-9); color: var(--color-primary); }
.stat-icon.success { background-color: var(--color-success-light); color: var(--color-success); }
.stat-icon.warning { background-color: var(--color-warning-light); color: var(--color-warning); }
.stat-info {
  flex: 1;
}
.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
  margin: 5px 0;
  color: var(--color-text-primary);
}
.stat-trend {
  font-size: 13px;
}
.stat-trend.up { color: var(--color-danger); } /* Cost up is usually bad? Or just red. Let's stick to standard colors. usually Green is good. Cost Up = Red? */
.stat-trend.down { color: var(--color-success); }
.trend-label {
  color: var(--color-text-secondary);
  margin-left: 5px;
}
.chart-row {
  margin-bottom: 20px;
}
.chart-card {
  height: 100%;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.chart-container {
  height: 350px;
  width: 100%;
}
.action-buttons {
  display: flex;
  gap: 10px;
}
.closing-actions {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.action-card {
  cursor: default;
}
.action-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.action-info h4 {
  margin: 0 0 5px 0;
  font-size: 15px;
  color: var(--color-text-primary);
}
.action-info p {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.closing-result {
  margin-top: 10px;
}
/* 年度成本对比样式 */
.yearly-comparison-card {
  margin-bottom: 20px;
}
.yearly-stat {
  text-align: center;
  padding: 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf0 100%);
  border-radius: 8px;
}
.yearly-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 10px;
}
.yearly-current {
  font-size: 22px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}
.yearly-growth {
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.yearly-growth.up { color: var(--color-danger); }
.yearly-growth.down { color: var(--color-success); }
.yearly-last {
  color: var(--color-text-secondary);
  font-size: 12px;
}
/* 成本预警样式 */
.alert-card {
  margin-bottom: 20px;
}
.alert-badge {
  margin-right: 8px;
}
.no-alerts {
  padding: 20px;
  text-align: center;
}
.text-success { color: var(--color-success); }
.text-danger { color: var(--color-danger); }
</style>