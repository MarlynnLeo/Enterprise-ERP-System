<template>
  <div class="dashboard-container module-page cost-dashboard-page">
    <PageHeader title="成本总览" subtitle="生产成本分析与监控中心">
      <template #actions>
<el-button type="primary" @click="refreshData">刷新数据</el-button>
          <el-button v-permission="'finance:cost:view'" type="success" @click="goCostClosing">
            <el-icon><CircleCheck /></el-icon> 成本关账
          </el-button>
          <el-button v-permission="'finance:cost:execute'" type="warning" @click="showWIPDialog = true">
            <el-icon><Setting /></el-icon> 月末成本结转
          </el-button>
      </template>
    </PageHeader>
    <!-- 核心指标卡片 -->
    <el-row :gutter="20" class="stat-row statistics-row">
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
                  <span class="yearly-last">去年: {{ formatMoney(item.last) }}</span>
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
            <el-table-column label="标准成本" width="120">
              <template #default="scope">{{ formatMoney(scope.row.standard_total_cost) }}</template>
            </el-table-column>
            <el-table-column label="实际成本" width="120">
              <template #default="scope">{{ formatMoney(scope.row.actual_total_cost) }}</template>
            </el-table-column>
            <el-table-column label="差异" width="120">
              <template #default="scope">
                <span :class="scope.row.is_favorable ? 'text-success' : 'text-danger'">
                  {{ formatSignedMoney(scope.row.total_variance, scope.row.is_favorable) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="差异率" width="100">
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
          <span class="ml-sm">%</span>
        </el-form-item>
        <el-form-item label="材料成本差异阈值">
          <el-input-number v-model="alertSettings.material_threshold" :min="1" :max="100" :precision="1" />
          <span class="ml-sm">%</span>
        </el-form-item>
        <el-form-item label="人工成本差异阈值">
          <el-input-number v-model="alertSettings.labor_threshold" :min="1" :max="100" :precision="1" />
          <span class="ml-sm">%</span>
        </el-form-item>
        <el-form-item label="制造费用差异阈值">
          <el-input-number v-model="alertSettings.overhead_threshold" :min="1" :max="100" :precision="1" />
          <span class="ml-sm">%</span>
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
          <el-select v-model="selectedPeriodId" placeholder="请选择期间" class="w-full" :loading="periodsLoading">
            <el-option
              v-for="period in periods"
              :key="period.id"
              :label="`${period.period_name}${period.is_closed ? '（已关闭）' : ''}`"
              :value="period.id"
              :disabled="period.is_closed"
            />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="selectedPeriod?.is_closed"
          title="该期间已关闭，不能执行成本结转"
          type="warning"
          show-icon
          :closable="false"
          class="closing-alert"
        />
        <el-divider content-position="left">操作选项</el-divider>
        <div class="closing-actions">
          <el-card shadow="hover" class="action-card">
            <div class="action-content">
              <div class="action-info">
                <h4>计算在制品成本</h4>
                <p>遍历所有未完工任务，计算约当产量和WIP成本</p>
              </div>
              <el-button type="info" @click="calculateWIP" :loading="wipLoading" :disabled="!selectedPeriodId || selectedPeriod?.is_closed" v-permission="'finance:cost:execute'">
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
              <el-button
                type="primary"
                @click="executeCostClosing"
                :loading="closingLoading"
                :disabled="!selectedPeriodId || selectedPeriod?.is_closed"
                v-permission="'finance:cost:execute'"
              >
                执行结转
              </el-button>
            </div>
          </el-card>
          <el-card shadow="hover" class="action-card">
            <div class="action-content">
              <div class="action-info">
                <h4>生成WIP凭证</h4>
                <p>按已计算的WIP快照生成或修复月末结转凭证</p>
              </div>
              <el-button
                type="warning"
                @click="generateWIPVoucher"
                :loading="voucherLoading"
                :disabled="!selectedPeriodId || selectedPeriod?.is_closed"
                v-permission="'finance:cost:execute'"
              >
                生成凭证
              </el-button>
            </div>
          </el-card>
        </div>
        <!-- 结果展示 -->
        <el-divider content-position="left" v-if="closingResult">执行结果</el-divider>
        <div v-if="closingResult" class="closing-result">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="WIP任务数">{{ closingResult.wip?.taskCount || 0 }}</el-descriptions-item>
            <el-descriptions-item label="WIP总成本">{{ formatMoney(closingResult.wip?.summary?.totalWIPCost) }}</el-descriptions-item>
            <el-descriptions-item label="WIP凭证ID">{{ closingResult.wipVoucher?.entryId || '未生成' }}</el-descriptions-item>
            <el-descriptions-item label="差异分摊产品数">{{ closingResult.variance?.productCount || 0 }}</el-descriptions-item>
          </el-descriptions>
        </div>
        <el-divider content-position="left" v-if="costClosingHistory.length">执行记录</el-divider>
        <el-table v-if="costClosingHistory.length" :data="costClosingHistory" size="small" border max-height="180">
          <el-table-column prop="periodName" label="期间" min-width="140" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small">
                {{ row.status === 'success' ? '成功' : '失败' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="message" label="结果" min-width="180" />
          <el-table-column prop="time" label="时间" width="160" />
        </el-table>
      </el-form>
      <template #footer>
        <el-button @click="showWIPDialog = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { echarts } from '@/utils/echartsCore';
import { financeApi } from '@/api/finance';
import { parseListData } from '@/utils/responseParser';
import { CircleCheck, Setting } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatCurrency } from '@/utils/helpers/formatters';
import { alphaColor } from '@/utils/designTokens';
// 状态定义
const router = useRouter();
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
const voucherLoading = ref(false);
const closingLoading = ref(false);
const closingResult = ref(null);
const costClosingHistory = ref([]);
const selectedPeriod = computed(() =>
  periods.value.find(period => Number(period.id) === Number(selectedPeriodId.value))
);

const goCostClosing = () => {
  router.push('/finance/cost/closing');
};
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
  if (value === null || value === undefined || value === '') return '-';
  const num = parseFloat(value);
  if (isNaN(num)) return '-';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const formatMoney = (value) => {
  const formatted = formatNumber(value);
  return formatted === '-' ? '-' : `¥${formatted}`;
};
const formatSignedMoney = (value, isFavorable) => {
  const formatted = formatMoney(value);
  if (formatted === '-') return '-';
  return `${isFavorable ? '+' : ''}${formatted}`;
};
// 加载会计期间
const loadPeriods = async () => {
  periodsLoading.value = true;
  try {
    const res = await financeApi.cost.getPeriods();
    // API拦截器已解包，res.data 就是业务数据
    if (res.data?.periods) {
      periods.value = res.data.periods;
      // 默认选择当前未关闭的期间
      const current = periods.value.find(p => !p.is_closed);
      if (current) selectedPeriodId.value = current.id;
    } else {
      periods.value = [];
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
  if (selectedPeriod.value?.is_closed) {
    ElMessage.warning('该期间已关闭，不能计算WIP');
    return;
  }
  wipLoading.value = true;
  try {
    const res = await financeApi.cost.calculateWIP({ periodId: selectedPeriodId.value });
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

const generateWIPVoucher = async () => {
  if (!selectedPeriodId.value) {
    ElMessage.warning('请先选择会计期间');
    return;
  }
  if (selectedPeriod.value?.is_closed) {
    ElMessage.warning('该期间已关闭，不能生成WIP凭证');
    return;
  }

  voucherLoading.value = true;
  try {
    const res = await financeApi.cost.generateWIPVoucher(selectedPeriodId.value);
    const result = res.data || {};
    closingResult.value = {
      ...(closingResult.value || {}),
      wipVoucher: result
    };

    if (result.reused) {
      ElMessage.success(`WIP凭证已存在并通过校验：${result.entryNumber || result.entryId}`);
    } else if (result.skipped) {
      ElMessage.info(result.reason || '无在制品成本，未生成凭证');
    } else {
      ElMessage.success(`WIP凭证生成完成：${result.entryId || '-'}`);
    }
  } catch (error) {
    console.error('WIP凭证生成失败:', error);
    ElMessage.error('WIP凭证生成失败: ' + (error.response?.data?.message || error.message));
  } finally {
    voucherLoading.value = false;
  }
};

// 执行月末成本结转
const executeCostClosing = async () => {
  if (!selectedPeriodId.value) {
    ElMessage.warning('请先选择会计期间');
    return;
  }
  if (selectedPeriod.value?.is_closed) {
    ElMessage.warning('该期间已关闭，不能执行成本结转');
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
    const res = await financeApi.cost.executeCostClosing(selectedPeriodId.value);
    // API拦截器已解包，res.data 直接是业务数据
    if (res.data) {
      closingResult.value = res.data;
      ElMessage.success('月末成本结转完成！');
      costClosingHistory.value.unshift({
        periodName: selectedPeriod.value?.period_name || selectedPeriodId.value,
        status: 'success',
        message: '月末成本结转完成',
        time: new Date().toLocaleString()
      });
      refreshData(); // 刷新驾驶舱数据
    } else {
      ElMessage.error('结转失败：未返回数据');
    }
  } catch (error) {
    console.error('月末结转失败:', error);
    const message = error.response?.data?.message || error.message;
    costClosingHistory.value.unshift({
      periodName: selectedPeriod.value?.period_name || selectedPeriodId.value,
      status: 'failed',
      message,
      time: new Date().toLocaleString()
    });
    ElMessage.error('月末结转失败: ' + message);
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
    const res = await financeApi.cost.getStatistics();
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
    const res = await financeApi.cost.getTrend({ period: trendPeriod.value });
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
    const res = await financeApi.cost.getComposition();
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
                shadowColor: alphaColor('textPrimary', 0.5)
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
    const res = await financeApi.cost.getVariance({ pageSize: 20 });
    const listData = parseListData(res, { enableLog: false });

    if (listData.length > 0 && varianceChart) {
      // 按产品名称分组汇总
      const productMap = new Map();
      listData.forEach(item => {
        const name = item.product_name || '未知产品';
        if (!productMap.has(name)) {
          productMap.set(name, { standard: 0, actual: 0 });
        }
        const data = productMap.get(name);
        data.standard += parseFloat(item.standard_total ?? item.standard_cost) || 0;
        data.actual += parseFloat(item.actual_total ?? item.actual_cost) || 0;
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
    const res = await financeApi.cost.getAlerts();
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
    const res = await financeApi.cost.getAlertSettings();
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
    await financeApi.cost.saveAlertSettings(alertSettings.value);
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
    const res = await financeApi.cost.getYearlyComparison({ year: selectedYear.value });
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
const refreshData = async () => {
  const results = await Promise.allSettled([
    loadStatistics(),
    loadTrendData(),
    loadCompositionData(),
    loadVarianceData(),
    loadCostAlerts(),
    loadYearlyComparison()
  ]);
  const failedCount = results.filter(r => r.status === 'rejected').length;
  if (failedCount > 0) {
    ElMessage.warning(`数据刷新完成，${failedCount}项加载失败`);
  } else {
    ElMessage.success('数据已刷新');
  }
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
  padding: 0;
}
.header-card {
  margin-bottom: 20px;
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
.stat-icon {
  flex: 0 0 auto;
}
.stat-icon.primary { background-color: var(--color-primary); color: var(--color-on-primary); }
.stat-icon.success { background-color: var(--color-success); color: var(--color-on-primary); }
.stat-icon.warning { background-color: var(--color-warning); color: var(--color-on-primary); }
.stat-info {
  flex: 1;
  min-width: 0;
}
.stat-trend {
  font-size: 13px;
  margin-top: 8px;
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
.closing-alert {
  margin-bottom: 12px;
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
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-sm);
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
.text-danger { color: var(--color-danger); }
</style>
