<!--
/**
 * FinanceDashboard.vue
 * @description 财务数据概览组件
 * @date 2026-08-31
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page overview-page finance-dashboard">
    <PageHeader title="财务数据概览" subtitle="收支、应收应付与资金概况">
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
          <div class="stat-value">{{ formatCurrency(statistics.currentMonth?.income) }}</div>
          <div class="stat-label">本月收入</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.currentMonth?.count || 0 }}</span>
            <span class="stat-secondary-label">收入笔数</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.currentMonth?.expense) }}</div>
          <div class="stat-label">本月支出</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{
              statistics.currentMonth?.expenseCount || 0
            }}</span>
            <span class="stat-secondary-label">支出笔数</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.receivables?.total) }}</div>
          <div class="stat-label">应收账款</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.receivables?.overdue || 0 }}</span>
            <span class="stat-secondary-label">逾期数量</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-value">{{ formatCurrency(statistics.payables?.total) }}</div>
          <div class="stat-label">应付账款</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.payables?.due || 0 }}</span>
            <span class="stat-secondary-label">待付数量</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 图表区域 -->
    <el-row :gutter="16" class="mt-md">
      <el-col :xs="24" :md="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>收支趋势</span>
              <el-radio-group v-model="timeRange" size="small">
                <el-radio-button value="6">近6月</el-radio-button>
                <el-radio-button value="12">近12月</el-radio-button>
                <el-radio-button value="year">本年度</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="incomeExpense"></canvas>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12">
        <el-card shadow="hover" class="chart-card">
          <template #header>
            <div class="card-header">
              <span>收入分类</span>
              <el-radio-group v-model="chartType" size="small">
                <el-radio-button value="pie">饼图</el-radio-button>
                <el-radio-button value="bar">柱状图</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="incomeCategory"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 现金流及财务指标 -->
    <el-row :gutter="16" class="mt-md">
      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>银行账户余额</span>
            </div>
          </template>
          <el-table
            :data="bankAccounts"
            class="table-row-click w-full"
            v-loading="loading"
            border
            :empty-text="bankAccounts.length === 0 ? '暂无银行账户数据' : '没有匹配的数据'"
            @row-click="
              (row, column, event) =>
                handleTableRowView(row, column, event, () =>
                  router.push('/finance/cash/bank-transactions?account=' + row.id)
                )
            "
          >
            <el-table-column label="账户名称" prop="name" min-width="150" />
            <el-table-column label="账号" prop="accountNumber" min-width="180" />
            <el-table-column label="银行" prop="bank" min-width="120" />
            <el-table-column label="余额" min-width="120">
              <template #default="scope">
                <span
                  :class="{
                    'text-success': scope.row.balance > 0,
                    'text-danger': scope.row.balance < 0,
                  }"
                >
                  {{ formatCurrency(scope.row.balance) }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>重要财务指标</span>
            </div>
          </template>
          <div class="financial-metrics">
            <div v-for="(metric, index) in financialMetrics" :key="index" class="metric-item">
              <div class="metric-label">{{ metric.label }}</div>
              <div class="metric-value">
                <span :class="getMetricColorClass(metric)">{{ metric.value }}</span>
                <el-tooltip v-if="metric.tooltip" :content="metric.tooltip" placement="top">
                  <el-icon class="info-icon"><InfoFilled /></el-icon>
                </el-tooltip>
              </div>
              <div class="metric-trend" v-if="metric.trend">
                <el-icon :class="[metric.trendDirection === 'up' ? 'text-success' : 'text-danger']">
                  <component :is="getTrendIcon(metric.trendDirection)" />
                </el-icon>
                <span>{{ metric.trend }}</span>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView';
import { formatLocalDate } from '@/utils/format';
import { ref, onMounted, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import Chart from '@/utils/chartCore';
import { ElMessage } from 'element-plus/es/components/message/index';
import { financeApi } from '@/api';
// 权限计算属性
import { ArrowDown, ArrowUp, InfoFilled } from '@element-plus/icons-vue';
import { useDashboard, useCharts } from '@/composables/useDashboard';
import {
  handleDashboardError,
  formatCurrency,
  getDefaultStatistics,
  generateMonthLabels,
} from '@/utils/dashboardUtils';
import { createBarChartConfig, chartColors } from '@/utils/chartConfig';
import { alphaColor, getCssTokenValue } from '@/utils/designTokens';
import { parseListData, parseResponseData } from '@/utils/responseParser';
const router = useRouter();
// 图表引用
const incomeExpense = ref(null);
const incomeCategory = ref(null);
const chartRefs = {
  incomeExpense,
  incomeCategory,
};
// 图表配置
const timeRange = ref('12');
const chartType = ref('pie');
// 使用仪表盘组合式函数
const { loading, statistics, lastUpdated, loadData } = useDashboard('finance', loadFinanceData, {
  autoRefresh: true,
  immediate: false,
  refreshInterval: 5 * 60 * 1000, // 5分钟
});
// 使用图表管理组合式函数
const { chartInstances, initAllCharts } = useCharts(chartRefs);
// 银行账户数据
const bankAccounts = ref([]);
const financialMetrics = ref([]);
// 获取指标颜色类名
function getMetricColorClass(metric) {
  if (metric.type === 'percentage') {
    const value = parseFloat(metric.value);
    if (metric.good === 'high') {
      return value >= 0 ? 'text-success' : 'text-danger';
    } else {
      return value <= 0 ? 'text-success' : 'text-danger';
    }
  }
  return '';
}

function getTrendIcon(direction) {
  return direction === 'up' ? ArrowUp : ArrowDown;
}
// 加载财务数据
async function loadFinanceData() {
  try {
    // 并行获取多个数据源
    const [financialStats, receivablesAging, payablesAging] = await Promise.allSettled([
      financeApi.getCashFlowStatistics({
        startDate: getMonthStart(),
        endDate: getMonthEnd(),
      }),
      financeApi.getReceivablesAging(),
      financeApi.getPayablesAging(),
    ]);
    // 同时加载银行账户
    await loadBankAccounts();
    // 处理统计数据 - API返回格式: { success, data: { summary, byType, timeSeries } }
    let stats = getDefaultStatistics('finance');
    if (financialStats.status === 'fulfilled' && financialStats.value) {
      const response = financialStats.value.data || financialStats.value;
      // 正确的数据路径：直接从response中获取summary
      const summary = response.summary || {};
      const byType = response.byType || [];
      // 计算收入和支出笔数
      let incomeCount = 0;
      let expenseCount = 0;
      byType.forEach((item) => {
        const type = item.transactionType;
        const count = parseInt(item.transaction_count || 0);
        if (['存款', '转入', '利息', 'income', '收入'].includes(type)) {
          incomeCount += count;
        } else if (['取款', '转出', '费用', 'expense', '支出'].includes(type)) {
          expenseCount += count;
        }
      });
      stats = {
        currentMonth: {
          income: parseFloat(summary.totalIncome || 0),
          expense: Math.abs(parseFloat(summary.totalExpense || 0)),
          count: incomeCount,
          expenseCount: expenseCount,
        },
        receivables: summarizeReceivablesAging(receivablesAging),
        payables: summarizePayablesAging(payablesAging),
      };
    }
    // 计算财务指标 - 使用stats对象
    calculateFinancialMetricsFromStats(stats);
    return stats;
  } catch (error) {
    console.error('获取财务数据失败:', error);
    throw error;
  }
}

function unwrapSettledData(result) {
  if (result?.status !== 'fulfilled') return null;
  return result.value?.data || result.value || null;
}

function normalizeAgingList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.details)) return data.details;
  return [];
}

function summarizeReceivablesAging(result) {
  const list = normalizeAgingList(unwrapSettledData(result));
  return {
    total: list.reduce((sum, item) => sum + parseFloat(item.totalAmount || 0), 0),
    overdue: list.filter(
      (item) =>
        parseFloat(item.within30Days || 0) > 0 ||
        parseFloat(item.within60Days || 0) > 0 ||
        parseFloat(item.within90Days || 0) > 0 ||
        parseFloat(item.over90Days || 0) > 0
    ).length,
  };
}

function summarizePayablesAging(result) {
  const list = normalizeAgingList(unwrapSettledData(result));
  return {
    total: list.reduce((sum, item) => sum + parseFloat(item.totalAmount || 0), 0),
    due: list.filter(
      (item) =>
        parseFloat(item.within30Days || 0) > 0 ||
        parseFloat(item.days31to60 || 0) > 0 ||
        parseFloat(item.days61to90 || 0) > 0 ||
        parseFloat(item.over90Days || 0) > 0
    ).length,
  };
}
// 获取月度收支趋势数据
async function getMonthlyTrendData(months = 12) {
  try {
    // 计算起始日期（往前推N个月）
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const response = await financeApi.getCashFlowStatistics({
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate),
    });
    // 处理返回数据
    const data = response.data || response;
    const timeSeries = data.timeSeries || [];
    // 生成月份映射：年-月 -> 标签索引
    const monthKeyToIndex = {};
    const labels = generateMonthLabels(months);

    // 为每个标签创建对应的年-月键
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeyToIndex[key] = i;
    }

    // 初始化收支数据数组
    const incomeData = new Array(months).fill(null);
    const expenseData = new Array(months).fill(null);
    // 聚合时间序列数据到月份
    timeSeries.forEach((item) => {
      // 从日期提取年-月键（如 2026-01-14 -> 2026-01）
      const dateStr = String(item.date);
      const key = dateStr.substring(0, 7);

      const index = monthKeyToIndex[key];
      if (index !== undefined) {
        const amount = parseFloat(item.totalAmount || 0);
        const type = item.transactionType;

        // 判断收入还是支出
        if (
          ['存款', '转入', '利息', 'income', '收入', 'deposit', 'transfer_in', 'interest'].includes(
            type
          )
        ) {
          incomeData[index] = (incomeData[index] || 0) + amount;
        } else if (
          ['取款', '转出', '费用', 'expense', '支出', 'withdrawal', 'transfer_out', 'fee'].includes(
            type
          )
        ) {
          expenseData[index] = (expenseData[index] || 0) + amount;
        }
      }
    });
    // 四舍五入，并保持 null 依然为 null
    const roundedIncome = incomeData.map((v) => (v !== null ? Math.round(v) : null));
    const roundedExpense = expenseData.map((v) => (v !== null ? Math.round(v) : null));
    return { labels, incomeData: roundedIncome, expenseData: roundedExpense };
  } catch (error) {
    console.error('获取月度收支趋势失败:', error);
    // 返回空数据而不是抛出错误
    const labels = generateMonthLabels(months);
    return {
      labels,
      incomeData: labels.map(() => null),
      expenseData: labels.map(() => null),
    };
  }
}
// 初始化收支图表
async function initIncomeExpenseChart() {
  if (!chartRefs.incomeExpense?.value) return null;
  // 销毁旧图表实例（切换时间范围时必须先销毁）
  if (chartInstances.incomeExpense) {
    chartInstances.incomeExpense.destroy();
    chartInstances.incomeExpense = null;
  }
  const ctx = chartRefs.incomeExpense.value.getContext('2d');
  // 从API获取真实的月度收支数据（根据时间范围动态获取）
  const months =
    timeRange.value === 'year' ? new Date().getMonth() + 1 : parseInt(timeRange.value) || 12;
  const { labels, incomeData, expenseData } = await getMonthlyTrendData(months);
  const config = createBarChartConfig({
    yAxisTitle: '金额(元)',
  });
  const instance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: '收入',
          data: incomeData,
          backgroundColor: chartColors.success[0],
          borderColor: chartColors.success[1],
          borderWidth: 1,
        },
        {
          label: '支出',
          data: expenseData,
          backgroundColor: chartColors.danger[0],
          borderColor: chartColors.danger[1],
          borderWidth: 1,
        },
      ],
    },
    options: config,
  });
  // 保存实例引用
  chartInstances.incomeExpense = instance;
  return instance;
}
// 初始化收入分类图表（按交易类型分类）
async function initIncomeCategoryChart() {
  if (!chartRefs.incomeCategory?.value) return null;
  if (chartInstances.incomeCategory) {
    chartInstances.incomeCategory.destroy();
    chartInstances.incomeCategory = null;
  }
  const ctx = chartRefs.incomeCategory.value.getContext('2d');
  let labels = [];
  let categoryData = [];

  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const response = await financeApi.getCashFlowStatistics({
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate),
    });

    const data = response.data || response;
    const byType = data.byType || [];

    if (byType.length > 0) {
      byType.forEach((item) => {
        const typeName = item.transactionType || '未分类';
        const amount = parseFloat(item.totalAmount || 0);
        labels.push(typeName);
        categoryData.push(Math.abs(Math.round(amount)));
      });
    }
  } catch (error) {
    console.error('获取交易分类数据失败:', error);
  }

  if (labels.length === 0) {
    labels = ['暂无数据'];
    categoryData = [];
  }

  const colors = [
    chartColors.primary[0],
    chartColors.success[0],
    chartColors.warning[0],
    chartColors.info[0],
    chartColors.danger[0],
    alphaColor('purple', 0.7),
    alphaColor('success', 0.7),
    alphaColor('warning', 0.7),
  ];
  const chartConfig =
    chartType.value === 'bar'
      ? createBarChartConfig({ yAxisTitle: '金额(元)' })
      : {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return `${context.label}: ${formatCurrency(context.raw)}`;
                },
              },
            },
          },
        };
  const instance = new Chart(ctx, {
    type: chartType.value,
    data: {
      labels: labels,
      datasets: [
        {
          data: categoryData,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: getCssTokenValue('surface'),
        },
      ],
    },
    options: chartConfig,
  });
  chartInstances.incomeCategory = instance;
  return instance;
}

// 生命周期钩子
onMounted(async () => {
  try {
    await loadData();
  } catch (error) {
    console.error('加载财务统计数据失败:', error);
  }

  try {
    await nextTick();
    await initAllCharts({
      incomeExpense: initIncomeExpenseChart,
      incomeCategory: initIncomeCategoryChart,
    });
  } catch (error) {
    handleDashboardError(error, '财务仪表盘图表初始化失败');
  }
});
// 加载仪表盘数据
async function _loadDashboardData() {
  try {
    // 获取真实的财务统计数据 - axios拦截器已解包
    const response = await financeApi.getCashFlowStatistics({
      startDate: getMonthStart(),
      endDate: getMonthEnd(),
    });
    // 处理解包后的数据
    const data = response.data || response;
    // 处理现金流数据
    const cashFlowData = data.cashFlow?.data || data.cashFlow || {};
    const summary = cashFlowData.summary || {};
    // 更新统计数据
    statistics.currentMonth = {
      income: summary.totalIncome || 0,
      expense: Math.abs(summary.totalExpense || 0),
      count: summary.incomeCount || 0,
      expenseCount: summary.expenseCount || 0,
    };
    // 单独获取应收账款数据 - axios拦截器已解包
    try {
      const receivablesResponse = await financeApi.getReceivablesAging();
      const receivablesData = receivablesResponse.data || receivablesResponse || [];
      // 检查数据格式并处理
      let totalReceivables = 0;
      let overdueReceivables = 0;
      if (Array.isArray(receivablesData)) {
        // 如果是数组格式，计算总额和逾期数量
        // 遍历每个应收账款项目并累加金额
        receivablesData.forEach((item) => {
          // 从日志可以看出，正确的字段名是totalAmount
          const amount = parseFloat(item.totalAmount || 0);
          totalReceivables += amount;
          // 检查是否有逾期金额（超过90天的金额）
          if (item.over90Days && parseFloat(item.over90Days) > 0) {
            overdueReceivables++;
          }
        });
      } else if (typeof receivablesData === 'object') {
        // 如果是对象格式，尝试从summary或其他字段获取
        totalReceivables = receivablesData.total || receivablesData.totalAmount || 0;
        overdueReceivables = receivablesData.overdue || receivablesData.overdueCount || 0;
        // 如果有summary字段，尝试从中获取
        if (receivablesData.summary) {
          totalReceivables =
            receivablesData.summary.total ||
            receivablesData.summary.totalAmount ||
            totalReceivables;
          overdueReceivables =
            receivablesData.summary.overdue ||
            receivablesData.summary.overdueCount ||
            overdueReceivables;
        }
        // 如果有details数组，尝试计算
        if (Array.isArray(receivablesData.details)) {
          totalReceivables = receivablesData.details.reduce(
            (sum, item) => sum + parseFloat(item.totalAmount || 0),
            0
          );
          overdueReceivables = receivablesData.details.filter(
            (item) => item.over90Days && parseFloat(item.over90Days) > 0
          ).length;
        }
      }
      statistics.receivables = {
        total: totalReceivables,
        overdue: overdueReceivables,
      };
    } catch {
      // 使用空数据
      statistics.receivables = {
        total: 0,
        overdue: 0,
      };
    }
    // 单独获取应付账款数据 - axios拦截器已解包
    try {
      const payablesResponse = await financeApi.getPayablesAging();
      const payablesData = payablesResponse.data || payablesResponse || [];
      // 检查数据格式并处理
      let totalPayables = 0;
      let duePayables = 0;
      if (Array.isArray(payablesData)) {
        // 如果是数组格式，按原来的方式处理
        // 遍历每个应付账款项目并累加金额
        payablesData.forEach((item) => {
          // 从日志可以看出，正确的字段名是totalAmount
          const amount = parseFloat(item.totalAmount || 0);
          totalPayables += amount;
          // 检查是否即将到期(30天内)
          if (item.within30Days && parseFloat(item.within30Days) > 0) {
            duePayables++;
          }
        });
      } else if (typeof payablesData === 'object') {
        // 如果是对象格式，尝试从summary或其他字段获取
        totalPayables = payablesData.total || payablesData.totalAmount || 0;
        duePayables = payablesData.due || payablesData.dueCount || 0;
        // 如果有summary字段，尝试从中获取
        if (payablesData.summary) {
          totalPayables =
            payablesData.summary.total || payablesData.summary.totalAmount || totalPayables;
          duePayables = payablesData.summary.due || payablesData.summary.dueCount || duePayables;
        }
        // 如果有details数组，尝试计算
        if (Array.isArray(payablesData.details)) {
          // 遍历每个应付账款项目并累加金额
          payablesData.details.forEach((item) => {
            // 从日志可以看出，正确的字段名是totalAmount
            const amount = parseFloat(item.totalAmount || 0);
            totalPayables += amount;
            // 检查是否即将到期(30天内)
            if (item.within30Days && parseFloat(item.within30Days) > 0) {
              duePayables++;
            }
          });
        }
      }
      statistics.payables = {
        total: totalPayables,
        due: duePayables,
      };
    } catch {
      // 使用空数据
      statistics.payables = {
        total: 0,
        due: 0,
      };
    }
    // 获取银行账户数据
    await loadBankAccounts();
    // 计算财务指标
    await calculateFinancialMetrics(data);
  } catch (error) {
    console.error('获取财务统计数据失败:', error);
    ElMessage.warning('部分财务数据加载失败');
    // 出错时使用空数据
    statistics.currentMonth = { income: 0, expense: 0, count: 0, expenseCount: 0 };
    statistics.receivables = { total: 0, overdue: 0 };
    statistics.payables = { total: 0, due: 0 };
    bankAccounts.value = [];
    // 设置默认财务指标
    financialMetrics.value = [
      {
        label: '数据加载失败',
        value: '--',
        trend: '请检查网络连接',
        trendDirection: 'up',
        type: 'error',
        good: 'neutral',
        tooltip: '财务数据加载失败，请刷新页面重试',
      },
    ];
  }
}
// 获取本月开始日期
function getMonthStart() {
  const now = new Date();
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
}
// 获取本月结束日期
function getMonthEnd() {
  const now = new Date();
  return formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}
// 加载银行账户数据
async function loadBankAccounts() {
  try {
    const response = await financeApi.getBankAccounts({ limit: 10 });
    const accounts = parseListData(response, { enableLog: false });
    if (accounts && accounts.length > 0) {
      bankAccounts.value = accounts.map((account) => ({
        id: account.id || 0,
        name: account.accountName || '未命名账户',
        accountNumber: account.accountNumber || '无账号',
        bank: account.bankName || '未知银行',
        balance: parseFloat(account.currentBalance || 0),
      }));
    } else {
      bankAccounts.value = [
        {
          id: 0,
          name: '暂无银行账户数据',
          accountNumber: '请添加银行账户',
          bank: '未知',
          balance: 0,
        },
      ];
    }
  } catch (error) {
    console.error('获取银行账户数据失败:', error);
    bankAccounts.value = [
      {
        id: 0,
        name: '获取数据失败',
        accountNumber: '请刷新重试',
        bank: '--',
        balance: 0,
      },
    ];
  }
}
// 从stats对象计算财务指标（用于loadFinanceData）
function calculateFinancialMetricsFromStats(stats) {
  try {
    const income = stats.currentMonth?.income || 0;
    const expense = stats.currentMonth?.expense || 0;
    const profit = income - expense;
    const receivablesTotal = stats.receivables?.total || 0;
    const payablesTotal = stats.payables?.total || 0;
    const receivablesOverdue = stats.receivables?.overdue || 0;
    const payablesDue = stats.payables?.due || 0;
    // 计算各种财务比率
    const grossMargin = income > 0 ? ((profit / income) * 100).toFixed(1) : '0.0';
    const netMargin = income > 0 ? ((profit / income) * 100).toFixed(1) : '0.0';
    const receivablesDays = income > 0 ? ((receivablesTotal / income) * 30).toFixed(1) : '0.0';
    const payablesDays = expense > 0 ? ((payablesTotal / expense) * 30).toFixed(1) : '0.0';
    financialMetrics.value = [
      {
        label: '毛利率',
        value: `${grossMargin}%`,
        trend: '基于本月数据',
        trendDirection: profit > 0 ? 'up' : 'down',
        type: 'percentage',
        good: 'high',
        tooltip: '本月收入与支出的差额占收入的百分比',
      },
      {
        label: '净利润率',
        value: `${netMargin}%`,
        trend: '基于本月数据',
        trendDirection: profit > 0 ? 'up' : 'down',
        type: 'percentage',
        good: 'high',
        tooltip: '净利润占销售收入的百分比',
      },
      {
        label: '应收账款总额',
        value: formatCurrency(receivablesTotal),
        trend: `${receivablesOverdue}笔逾期`,
        trendDirection: receivablesOverdue > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'low',
        tooltip: '当前应收账款总金额',
      },
      {
        label: '应付账款总额',
        value: formatCurrency(payablesTotal),
        trend: `${payablesDue}笔待付`,
        trendDirection: payablesDue > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'balanced',
        tooltip: '当前应付账款总金额',
      },
      {
        label: '应收账款周转天数',
        value: `${receivablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(receivablesDays) < 45 ? 'up' : 'down',
        type: 'days',
        good: 'low',
        tooltip: '应收账款回收所需的平均时间',
      },
      {
        label: '应付账款周转天数',
        value: `${payablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(payablesDays) > 30 ? 'up' : 'down',
        type: 'days',
        good: 'high',
        tooltip: '应付账款支付的平均时间',
      },
    ];
  } catch (error) {
    console.error('计算财务指标失败:', error);
    setDefaultMetrics();
  }
}
// 计算财务指标（使用全局statistics）
async function calculateFinancialMetrics(_data) {
  try {
    const income = statistics.currentMonth?.income || 0;
    const expense = statistics.currentMonth?.expense || 0;
    const profit = income - expense;
    const receivablesTotal = statistics.receivables?.total || 0;
    const payablesTotal = statistics.payables?.total || 0;
    // 计算各种财务比率
    const grossMargin = income > 0 ? ((profit / income) * 100).toFixed(1) : '0.0';
    const netMargin = income > 0 ? ((profit / income) * 100).toFixed(1) : '0.0';
    const receivablesDays = income > 0 ? ((receivablesTotal / income) * 30).toFixed(1) : '0.0';
    const payablesDays = expense > 0 ? ((payablesTotal / expense) * 30).toFixed(1) : '0.0';
    financialMetrics.value = [
      {
        label: '毛利率',
        value: `${grossMargin}%`,
        trend: '基于本月数据',
        trendDirection: profit > 0 ? 'up' : 'down',
        type: 'percentage',
        good: 'high',
        tooltip: '本月收入与支出的差额占收入的百分比',
      },
      {
        label: '净利润率',
        value: `${netMargin}%`,
        trend: '基于本月数据',
        trendDirection: profit > 0 ? 'up' : 'down',
        type: 'percentage',
        good: 'high',
        tooltip: '净利润占销售收入的百分比',
      },
      {
        label: '应收账款总额',
        value: formatCurrency(receivablesTotal),
        trend: `${statistics.receivables?.overdue || 0}笔逾期`,
        trendDirection: (statistics.receivables?.overdue || 0) > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'low',
        tooltip: '当前应收账款总金额',
      },
      {
        label: '应付账款总额',
        value: formatCurrency(payablesTotal),
        trend: `${statistics.payables?.due || 0}笔待付`,
        trendDirection: (statistics.payables?.due || 0) > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'balanced',
        tooltip: '当前应付账款总金额',
      },
      {
        label: '应收账款周转天数',
        value: `${receivablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(receivablesDays) < 45 ? 'up' : 'down',
        type: 'days',
        good: 'low',
        tooltip: '应收账款回收所需的平均时间',
      },
      {
        label: '应付账款周转天数',
        value: `${payablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(payablesDays) > 30 ? 'up' : 'down',
        type: 'days',
        good: 'high',
        tooltip: '应付账款支付的平均时间',
      },
    ];
  } catch (error) {
    console.error('计算财务指标失败:', error);
    setDefaultMetrics();
  }
}
// 设置默认指标
function setDefaultMetrics() {
  financialMetrics.value = [
    {
      label: '数据加载中',
      value: '--',
      trend: '请稍候',
      trendDirection: 'up',
      type: 'loading',
      good: 'neutral',
      tooltip: '正在加载财务指标数据',
    },
  ];
}
// 获取历史财务数据
async function _getHistoricalFinanceData(monthCount) {
  try {
    const incomeData = [];
    const expenseData = [];
    const profitData = [];
    // 获取过去几个月的数据
    for (let i = monthCount - 1; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startDate = formatLocalDate(new Date(date.getFullYear(), date.getMonth(), 1));
      const endDate = formatLocalDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
      try {
        const response = await financeApi.getCashFlowStatistics({
          startDate,
          endDate,
        });
        const summary = parseResponseData(response, {})?.summary || {};
        const income = summary.totalIncome || 0;
        const expense = Math.abs(summary.totalExpense || 0);
        const profit = income - expense;
        incomeData.push(income);
        expenseData.push(expense);
        profitData.push(profit);
      } catch {
        // 如果获取失败，添加0值保持数组长度一致
        incomeData.push(0);
        expenseData.push(0);
        profitData.push(0);
      }
    }
    return { incomeData, expenseData, profitData };
  } catch {
    // 返回空数组
    const emptyData = Array(monthCount).fill(0);
    return {
      incomeData: emptyData,
      expenseData: emptyData,
      profitData: emptyData,
    };
  }
}
// 监听时间范围和图表类型变化，更新图表
watch([timeRange, chartType], ([newTimeRange, newChartType], [oldTimeRange, oldChartType]) => {
  if (newTimeRange !== oldTimeRange) {
    initIncomeExpenseChart();
  }
  if (newChartType !== oldChartType) {
    initIncomeCategoryChart();
  }
});
</script>
<style scoped>
.chart-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chart-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.financial-metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-lg);
  padding: 10px 0;
}
.metric-item {
  display: flex;
  flex-direction: column;
  padding: 10px;
  border-radius: var(--radius-md);
  background-color: var(--color-bg-page);
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base),
    box-shadow var(--transition-base),
    opacity var(--transition-base),
    transform var(--transition-base);
}
.metric-item:hover {
  box-shadow: none;
}
.metric-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}
.metric-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
}
.info-icon {
  margin-left: 5px;
  color: var(--color-text-secondary);
  font-size: 16px;
}
.metric-trend {
  font-size: 14px;
  margin-top: 5px;
  display: flex;
  align-items: center;
}
.metric-trend .el-icon {
  margin-right: 5px;
}
/* 响应式调整 */
@media (max-width: 768px) {
  .financial-metrics {
    grid-template-columns: 1fr;
  }
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
