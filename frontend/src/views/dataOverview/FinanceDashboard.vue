<!--
/**
 * FinanceDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="finance-dashboard">
    <el-card class="header-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2>财务数据概览</h2>
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
            <div class="stat-title">本月收入</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ formatCurrency(statistics.currentMonth?.income) }}</div>
                <div class="stat-label">收入总额</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.currentMonth?.count || 0 }}</div>
                <div class="stat-secondary-label">收入笔数</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="primary" link @click="$router.push('/finance/gl/entries')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">本月支出</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ formatCurrency(statistics.currentMonth?.expense) }}</div>
                <div class="stat-label">支出总额</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.currentMonth?.expenseCount || 0 }}</div>
                <div class="stat-secondary-label">支出笔数</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="success" link @click="$router.push('/finance/gl/entries')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">应收账款</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ formatCurrency(statistics.receivables?.total) }}</div>
                <div class="stat-label">应收总额</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.receivables?.overdue || 0 }}</div>
                <div class="stat-secondary-label">逾期数量</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="info" link @click="$router.push('/finance/ar/invoices')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">应付账款</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ formatCurrency(statistics.payables?.total) }}</div>
                <div class="stat-label">应付总额</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.payables?.due || 0 }}</div>
                <div class="stat-secondary-label">待付数量</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="warning" link @click="$router.push('/finance/ap/invoices')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 图表区域 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :md="12" class="mb-20">
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
            <canvas ref="incomeExpense" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="12" class="mb-20">
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
            <canvas ref="incomeCategory" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 现金流及财务指标 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>银行账户余额</span>
            </div>
          </template>
          <el-table
            :data="bankAccounts"
            style="width: 100%"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="bankAccounts.length === 0 ? '暂无银行账户数据' : '没有匹配的数据'"
          >
            <el-table-column label="账户名称" prop="name" min-width="150" />
            <el-table-column label="账号" prop="accountNumber" min-width="180" />
            <el-table-column label="银行" prop="bank" min-width="120" />
            <el-table-column label="余额" min-width="120">
              <template #default="scope">
                <span :class="{ 'text-success': scope.row.balance > 0, 'text-danger': scope.row.balance < 0 }">
                  {{ formatCurrency(scope.row.balance) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="120" fixed="right">
              <template #default="scope">
                <el-button
                  type="primary"
                  link
                  size="small"
                  @click="$router.push('/finance/cash/transactions?account=' + scope.row.id)"
                >查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
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
                  <el-icon class="info-icon"><info-filled /></el-icon>
                </el-tooltip>
              </div>
              <div class="metric-trend" v-if="metric.trend">
                <el-icon :class="[metric.trendDirection === 'up' ? 'text-success' : 'text-danger']">
                  <component :is="metric.trendDirection === 'up' ? 'arrow-up' : 'arrow-down'" />
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
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router';
import Chart from 'chart.js/auto';
import { ElMessage } from 'element-plus';
import { financeApi } from '@/services/api';
// 权限计算属性
import { ArrowRight } from '@element-plus/icons-vue'
import { useDashboard, useCharts } from '@/composables/useDashboard';
import {
  handleDashboardError,
  formatCurrency,
  getDefaultStatistics,
  generateMonthLabels
} from '@/utils/dashboardUtils';
import { createBarChartConfig, chartColors } from '@/utils/chartConfig'
const _router = useRouter();
// 图表引用
const incomeExpense = ref(null);
const incomeCategory = ref(null);
const chartRefs = {
  incomeExpense,
  incomeCategory
};
// 图表配置
const timeRange = ref('12');
const chartType = ref('pie');
// 使用仪表盘组合式函数
const {
  loading,
  statistics,
  lastUpdated,
  loadData
} = useDashboard('finance', loadFinanceData, {
  autoRefresh: true,
  refreshInterval: 5 * 60 * 1000 // 5分钟
});
// 使用图表管理组合式函数
const {
  chartInstances,
  initAllCharts,
} = useCharts(chartRefs);
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
// 加载财务数据
async function loadFinanceData() {
  try {
    // 并行获取多个数据源
    const [financialStats] = await Promise.allSettled([
      financeApi.getCashFlowStatistics({
        startDate: getMonthStart(),
        endDate: getMonthEnd()
      })
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
      byType.forEach(item => {
        const type = item.transaction_type;
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
          expenseCount: expenseCount
        },
        receivables: {
          total: response.receivables?.total || 0,
          overdue: response.receivables?.overdue || 0
        },
        payables: {
          total: response.payables?.total || 0,
          due: response.payables?.due || 0
        }
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
// 获取月度收支趋势数据
async function getMonthlyTrendData(months = 12) {
  try {
    // 计算起始日期（往前推N个月）
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const response = await financeApi.getCashFlowStatistics({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
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
    timeSeries.forEach(item => {
      // 从日期提取年-月键（如 2026-01-14 -> 2026-01）
      const dateStr = String(item.date);
      const key = dateStr.substring(0, 7);
      
      const index = monthKeyToIndex[key];
      if (index !== undefined) {
        const amount = parseFloat(item.total_amount || 0);
        const type = item.transaction_type;
        
        // 判断收入还是支出
        if (['存款', '转入', '利息', 'income', '收入', 'deposit', 'transfer_in', 'interest'].includes(type)) {
          incomeData[index] = (incomeData[index] || 0) + amount;
        } else if (['取款', '转出', '费用', 'expense', '支出', 'withdrawal', 'transfer_out', 'fee'].includes(type)) {
          expenseData[index] = (expenseData[index] || 0) + amount;
        }
      }
    });
    // 四舍五入，并保持 null 依然为 null
    const roundedIncome = incomeData.map(v => v !== null ? Math.round(v) : null);
    const roundedExpense = expenseData.map(v => v !== null ? Math.round(v) : null);
    return { labels, incomeData: roundedIncome, expenseData: roundedExpense };
  } catch (error) {
    console.error('获取月度收支趋势失败:', error);
    // 返回空数据而不是抛出错误
    const labels = generateMonthLabels(months);
    return { 
      labels, 
      incomeData: labels.map(() => null), 
      expenseData: labels.map(() => null) 
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
  const months = timeRange.value === 'year' ? (new Date().getMonth() + 1) : parseInt(timeRange.value) || 12;
  const { labels, incomeData, expenseData } = await getMonthlyTrendData(months);
  const config = createBarChartConfig({
    yAxisTitle: '金额(元)'
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
          borderWidth: 1
        },
        {
          label: '支出',
          data: expenseData,
          backgroundColor: chartColors.danger[0],
          borderColor: chartColors.danger[1],
          borderWidth: 1
        }
      ]
    },
    options: config
  });
  // 保存实例引用
  chartInstances.incomeExpense = instance;
  return instance;
}
// 初始化收入分类图表（按交易类型分类）
async function initIncomeCategoryChart() {
  if (!chartRefs.incomeCategory?.value) return null;
  const ctx = chartRefs.incomeCategory.value.getContext('2d');
  // 从API获取交易类型分类数据
  let labels = [];
  let categoryData = [];
  
  try {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const response = await financeApi.getCashFlowStatistics({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    });
    
    const data = response.data || response;
    const byType = data.byType || [];
    
    // 处理交易类型数据
    if (byType.length > 0) {
      byType.forEach(item => {
        const typeName = item.transaction_type || '未分类';
        const amount = parseFloat(item.total_amount || 0);
        labels.push(typeName);
        categoryData.push(Math.abs(Math.round(amount)));
      });
    }
  } catch (error) {
    console.error('获取交易分类数据失败:', error);
  }
  
  // 如果没有数据，显示提示
  if (labels.length === 0) {
    labels = ['暂无数据'];
    categoryData = [];
  }
  
  // 动态生成颜色
  const colors = [
    chartColors.primary[0],
    chartColors.success[0],
    chartColors.warning[0],
    chartColors.info[0],
    chartColors.danger[0],
    'rgba(156, 39, 176, 0.7)',
    'rgba(0, 150, 136, 0.7)',
    'rgba(255, 152, 0, 0.7)'
  ];
  return new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels,
      datasets: [
        {
          data: categoryData,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const value = context.raw;
              return `${context.label}: ¥${value.toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}
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
      const incomeExpenseCanvas = chartRefs.incomeExpense?.value;
      const incomeCategoryCanvas = chartRefs.incomeCategory?.value;
      if (incomeExpenseCanvas && incomeCategoryCanvas &&
          incomeExpenseCanvas.offsetWidth > 0 && incomeExpenseCanvas.offsetHeight > 0 &&
          incomeCategoryCanvas.offsetWidth > 0 && incomeCategoryCanvas.offsetHeight > 0) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      retryCount++;
    }
    // 初始化图表
    await initAllCharts({
      incomeExpense: initIncomeExpenseChart,
      incomeCategory: initIncomeCategoryChart
    });
    // 加载数据
    await loadData();
  } catch (error) {
    handleDashboardError(error, '财务仪表盘初始化失败');
  }
});
// 加载仪表盘数据
async function _loadDashboardData() {
  try {
    // 获取真实的财务统计数据 - axios拦截器已解包
    const response = await financeApi.getFinancialStatistics({
      startDate: getMonthStart(),
      endDate: getMonthEnd()
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
      expenseCount: summary.expenseCount || 0
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
        receivablesData.forEach(item => {
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
          totalReceivables = receivablesData.summary.total || receivablesData.summary.totalAmount || totalReceivables;
          overdueReceivables = receivablesData.summary.overdue || receivablesData.summary.overdueCount || overdueReceivables;
        }
        // 如果有details数组，尝试计算
        if (Array.isArray(receivablesData.details)) {
          totalReceivables = receivablesData.details.reduce((sum, item) =>
            sum + parseFloat(item.totalAmount || 0), 0);
          overdueReceivables = receivablesData.details.filter(item =>
            item.over90Days && parseFloat(item.over90Days) > 0).length;
        }
      }
      statistics.receivables = {
        total: totalReceivables,
        overdue: overdueReceivables
      };
    } catch {
      // 使用空数据
      statistics.receivables = {
        total: 0,
        overdue: 0
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
        payablesData.forEach(item => {
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
          totalPayables = payablesData.summary.total || payablesData.summary.totalAmount || totalPayables;
          duePayables = payablesData.summary.due || payablesData.summary.dueCount || duePayables;
        }
        // 如果有details数组，尝试计算
        if (Array.isArray(payablesData.details)) {
          // 遍历每个应付账款项目并累加金额
          payablesData.details.forEach(item => {
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
        due: duePayables
      };
    } catch {
      // 使用空数据
      statistics.payables = {
        total: 0,
        due: 0
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
        tooltip: '财务数据加载失败，请刷新页面重试'
      }
    ];
  }
}
// 获取本月开始日期
function getMonthStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}
// 获取本月结束日期
function getMonthEnd() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
}
// 加载银行账户数据
async function loadBankAccounts() {
  try {
    const response = await financeApi.getBankAccounts({ limit: 10 });
    // API返回格式: { data: { list: [...], total, page, pageSize } }
    const accounts = response.data?.list || response.data?.data?.list || response.data?.data || [];
    if (accounts && accounts.length > 0) {
      bankAccounts.value = accounts.map(account => ({
        id: account.id || 0,
        name: account.accountName || account.account_name || '未命名账户',
        accountNumber: account.accountNumber || account.account_number || '无账号',
        bank: account.bankName || account.bank_name || '未知银行',
        balance: parseFloat(account.balance || account.current_balance || 0)
      }));
    } else {
      bankAccounts.value = [
        {
          id: 0,
          name: '暂无银行账户数据',
          accountNumber: '请添加银行账户',
          bank: '未知',
          balance: 0
        }
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
        balance: 0
      }
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
        tooltip: '本月收入与支出的差额占收入的百分比'
      },
      {
        label: '净利润率',
        value: `${netMargin}%`,
        trend: '基于本月数据',
        trendDirection: profit > 0 ? 'up' : 'down',
        type: 'percentage',
        good: 'high',
        tooltip: '净利润占销售收入的百分比'
      },
      {
        label: '应收账款总额',
        value: formatCurrency(receivablesTotal),
        trend: `${receivablesOverdue}笔逾期`,
        trendDirection: receivablesOverdue > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'low',
        tooltip: '当前应收账款总金额'
      },
      {
        label: '应付账款总额',
        value: formatCurrency(payablesTotal),
        trend: `${payablesDue}笔待付`,
        trendDirection: payablesDue > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'balanced',
        tooltip: '当前应付账款总金额'
      },
      {
        label: '应收账款周转天数',
        value: `${receivablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(receivablesDays) < 45 ? 'up' : 'down',
        type: 'days',
        good: 'low',
        tooltip: '应收账款回收所需的平均时间'
      },
      {
        label: '应付账款周转天数',
        value: `${payablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(payablesDays) > 30 ? 'up' : 'down',
        type: 'days',
        good: 'high',
        tooltip: '应付账款支付的平均时间'
      }
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
        tooltip: '本月收入与支出的差额占收入的百分比'
      },
      {
        label: '净利润率',
        value: `${netMargin}%`,
        trend: '基于本月数据',
        trendDirection: profit > 0 ? 'up' : 'down',
        type: 'percentage',
        good: 'high',
        tooltip: '净利润占销售收入的百分比'
      },
      {
        label: '应收账款总额',
        value: formatCurrency(receivablesTotal),
        trend: `${statistics.receivables?.overdue || 0}笔逾期`,
        trendDirection: (statistics.receivables?.overdue || 0) > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'low',
        tooltip: '当前应收账款总金额'
      },
      {
        label: '应付账款总额',
        value: formatCurrency(payablesTotal),
        trend: `${statistics.payables?.due || 0}笔待付`,
        trendDirection: (statistics.payables?.due || 0) > 0 ? 'down' : 'up',
        type: 'amount',
        good: 'balanced',
        tooltip: '当前应付账款总金额'
      },
      {
        label: '应收账款周转天数',
        value: `${receivablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(receivablesDays) < 45 ? 'up' : 'down',
        type: 'days',
        good: 'low',
        tooltip: '应收账款回收所需的平均时间'
      },
      {
        label: '应付账款周转天数',
        value: `${payablesDays}天`,
        trend: '基于本月数据',
        trendDirection: parseFloat(payablesDays) > 30 ? 'up' : 'down',
        type: 'days',
        good: 'high',
        tooltip: '应付账款支付的平均时间'
      }
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
      tooltip: '正在加载财务指标数据'
    }
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
      const startDate = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
      try {
        const response = await financeApi.getCashFlowStatistics({
          startDate,
          endDate
        });
        const summary = response.data?.data?.summary || {};
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
      profitData: emptyData
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
.finance-dashboard {
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
.chart-container {
  width: 100%;
  height: 300px;
  position: relative;
}
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
  background-color: var(--el-bg-color-page);
  transition: all var(--transition-base);
}
.metric-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}
.metric-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.metric-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
}
.info-icon {
  margin-left: 5px;
  color: var(--el-text-color-secondary);
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
.text-success {
  color: var(--el-color-success);
}
.text-danger {
  color: var(--el-color-danger);
}
.text-warning {
  color: var(--el-color-warning);
}
/* 响应式调整 */
@media (max-width: 768px) {
  .stat-value {
    font-size: 22px;
  }
  
  .stat-secondary-value {
    font-size: 18px;
  }
  
  .financial-metrics {
    grid-template-columns: 1fr;
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
