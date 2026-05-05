<!--
/**
 * Aging.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="aging-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>应收账款账龄分析</h2>
          <p class="subtitle">分析客户账款账龄</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="generateReport" v-permission="'finance:ar:aging'">生成报表</el-button>
          <el-button v-permission="'finance:ar:view'" @click="exportExcel" :disabled="!hasData">导出Excel</el-button>
          <el-button v-permission="'finance:ar:view'" @click="printReport" :disabled="!hasData">打印报表</el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 搜索条件区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="queryParams" class="search-form">
        <el-form-item label="截止日期" required>
          <el-date-picker
            v-model="queryParams.reportDate"
            type="date"
            placeholder="选择截止日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="客户分类">
          <el-select v-model="queryParams.customerType" placeholder="选择客户分类" clearable>
            <el-option label="全部" value=""></el-option>
            <el-option label="直销客户" value="direct"></el-option>
            <el-option label="经销商" value="distributor"></el-option>
            <el-option label="零售客户" value="retail"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="客户名称">
          <el-input v-model="queryParams.customerName" placeholder="输入客户名称" clearable></el-input>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 报表区域 -->
    <el-card class="data-card" v-loading="loading">
      <div class="report-title" v-if="hasData">
        <h1>应收账款账龄分析表</h1>
        <h3>截至：{{ formatDate(queryParams.reportDate) }}</h3>
        <h4>单位：元</h4>
      </div>
      <!-- 报表主体 -->
      <div class="report-body" v-if="hasData">
        <el-table
          :data="safeReportData"
          style="width: 100%"
          :summary-method="getSummaries"
          show-summary
          border
        >
          <el-table-column prop="customerName" label="客户名称" width="200" fixed="left"></el-table-column>
          <el-table-column prop="customerType" label="客户类型" width="100">
            <template #default="scope">
              {{ getCustomerTypeText(scope.row.customerType) }}
            </template>
          </el-table-column>
          <el-table-column prop="totalAmount" label="应收金额" width="120" align="right">
            <template #default="scope">
              {{ formatAmount(scope.row.totalAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="currentAmount" label="未逾期" width="120" align="right">
            <template #default="scope">
              {{ formatAmount(scope.row.currentAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="within30Days" label="1-30天" width="120" align="right">
            <template #default="scope">
              {{ formatAmount(scope.row.within30Days) }}
            </template>
          </el-table-column>
          <el-table-column prop="within60Days" label="31-60天" width="120" align="right">
            <template #default="scope">
              {{ formatAmount(scope.row.within60Days) }}
            </template>
          </el-table-column>
          <el-table-column prop="within90Days" label="61-90天" width="120" align="right">
            <template #default="scope">
              {{ formatAmount(scope.row.within90Days) }}
            </template>
          </el-table-column>
          <el-table-column prop="over90Days" label="90天以上" width="120" align="right">
            <template #default="scope">
              {{ formatAmount(scope.row.over90Days) }}
            </template>
          </el-table-column>
          <el-table-column label="逾期比例" width="120" align="right">
            <template #default="scope">
              {{ calculateOverduePercentage(scope.row) }}
            </template>
          </el-table-column>
          <el-table-column prop="lastPaymentDate" label="最近收款" width="120"></el-table-column>
          <el-table-column prop="contactPerson" label="联系人" width="120"></el-table-column>
          <el-table-column prop="contactPhone" label="联系电话" width="150"></el-table-column>
        </el-table>
      </div>
      
      <!-- 图表展示 -->
      <div class="chart-container" v-if="hasData">
        <div class="chart-title">账龄分析图表</div>
        <div class="charts">
          <div class="chart-item">
            <div ref="pieChart" style="width: 100%; height: 300px;"></div>
          </div>
          <div class="chart-item">
            <div ref="barChart" style="width: 100%; height: 300px;"></div>
          </div>
        </div>
      </div>
      <!-- 无数据提示 -->
      <div class="empty-tip" v-if="!loading && !hasData">
        <el-empty description='请选择截止日期并点击"生成报表"按钮'></el-empty>
      </div>
    </el-card>
  </div>
</template>
<script setup>
import { formatAmount } from '@/utils/format';
import { formatDate } from '@/utils/helpers/dateUtils'
// 版本标识 - 强制刷新缓存 v3.0 - 使用安全数据访问器
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/services/api';
import * as echarts from 'echarts';
// 权限计算属性
import ExcelJS from 'exceljs';
// 查询参数
const queryParams = reactive({
  reportDate: new Date().toISOString().slice(0, 10), // 默认为今天
  customerType: '',
  customerName: ''
});
// 报表数据 - 使用响应式数据，确保始终是数组
const reportData = ref([]);
const loading = ref(false);
// 创建一个安全的数据访问器
const safeReportData = computed(() => {
  const data = reportData.value;
  if (!data || !Array.isArray(data)) {
    return [];
  }
  return data;
});
// 确保reportData始终是数组的辅助函数
const ensureReportDataIsArray = () => {
  if (!reportData.value || !Array.isArray(reportData.value)) {
    console.warn('[安全检查] reportData 不是数组，重置为空数组:', reportData.value);
    reportData.value = [];
  }
};
// 计算属性：是否有数据 - 使用安全的数据访问器
const hasData = computed(() => {
  try {
    const data = safeReportData.value;
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('[hasData计算属性错误]:', error);
    return false;
  }
});
// 图表实例
let pieChartInstance = null;
let barChartInstance = null;
const pieChart = ref(null);
const barChart = ref(null);
// 统一的 resize 处理函数（具名引用，确保可移除）
const handleChartResize = () => {
  if (pieChartInstance && !pieChartInstance.isDisposed()) pieChartInstance.resize();
  if (barChartInstance && !barChartInstance.isDisposed()) barChartInstance.resize();
};
// 计算逾期比例
const calculateOverduePercentage = (row) => {
  if (!row.totalAmount || row.totalAmount === 0) return '0.00%';
  
  const overdueAmount = row.within30Days + row.within60Days + row.within90Days + row.over90Days;
  const percentage = (overdueAmount / row.totalAmount) * 100;
  
  return percentage.toFixed(2) + '%';
};
// 获取客户类型文本
const getCustomerTypeText = (type) => {
  const typeMap = {
    direct: '直销客户',
    distributor: '经销商',
    retail: '零售客户'
  };
  return typeMap[type] || type;
};
// 获取表格合计 - 增强错误处理
const getSummaries = (param) => {
  try {
    // 确保参数安全
    if (!param || typeof param !== 'object') {
      console.warn('[getSummaries] 参数无效:', param);
      return [];
    }
    const { columns, data } = param;
    // 确保reportData安全
    ensureReportDataIsArray();
    // 安全检查
    if (!data || !Array.isArray(data) || data.length === 0) {
      return Array.isArray(columns) ? columns.map((_, index) => index === 0 ? '总计' : '') : [];
    }
    if (!Array.isArray(columns)) {
      console.warn('[getSummaries] columns不是数组:', columns);
      return [];
    }
    const sums = [];
    columns.forEach((column, index) => {
    if (index === 0) {
      sums[index] = '总计';
      return;
    }
    
    if (index === 1) {
      sums[index] = '';
      return;
    }
    
    const values = data.map(item => Number(item[column.property]) || 0);
    
    if (values.every(value => Number.isNaN(value))) {
      sums[index] = 'N/A';
    } else {
      const sum = values.reduce((prev, curr) => {
        const value = Number(curr);
        if (!Number.isNaN(value)) {
          return prev + value;
        } else {
          return prev;
        }
      }, 0);
      
      if (index === 8) { // 逾期比例列
        const totalAmount = data.reduce((prev, curr) => prev + (curr.totalAmount || 0), 0);
        const overdueAmount = data.reduce((prev, curr) => {
          return prev + (curr.within30Days || 0) + (curr.within60Days || 0) + 
                 (curr.within90Days || 0) + (curr.over90Days || 0);
        }, 0);
        
        const percentage = totalAmount ? (overdueAmount / totalAmount) * 100 : 0;
        sums[index] = percentage.toFixed(2) + '%';
      } else if (index >= 2 && index <= 7) { // 金额列
        sums[index] = formatAmount(sum);
      } else {
        sums[index] = '';
      }
    }
  });
  return sums;
  } catch (error) {
    console.error('[getSummaries错误]:', error);
    // 返回安全的默认值
    return Array.isArray(param?.columns) ? param.columns.map((_, index) => index === 0 ? '总计' : '') : [];
  }
};
// 生成报表
const generateReport = async () => {
  if (!queryParams.reportDate) {
    ElMessage.warning('请选择截止日期');
    return;
  }
  loading.value = true;
  // 重置数据，避免竞态条件
  reportData.value = [];
  try {
    const response = await api.get('/finance/ar/aging', {
      params: {
        reportDate: queryParams.reportDate,
        customerType: queryParams.customerType,
        customerName: queryParams.customerName
      }
    });
    // 拦截器已解包，response.data 就是业务数据
    // 后端返回格式：{ data: [...], reportDate: '...' }
    if (Array.isArray(response.data)) {
      reportData.value = response.data;
    } else if (response.data?.data && Array.isArray(response.data.data)) {
      // 处理嵌套的 data 结构
      reportData.value = response.data.data;
    } else {
      ElMessage.error('获取数据格式异常');
      reportData.value = [];
    }
    
    // 更新图表
    nextTick(() => {
      const data = safeReportData.value;
      if (Array.isArray(data) && data.length > 0) {
        initCharts();
      }
    });
  } catch (error) {
    console.error('获取账龄分析数据失败:', error);
    ElMessage.error('获取账龄分析数据失败');
    reportData.value = []; // 确保在错误情况下也设置为空数组
  } finally {
    loading.value = false;
  }
};
// 初始化图表
const initCharts = () => {
  // 初始化饼图
  initPieChart();
  
  // 初始化柱状图
  initBarChart();
};
// 初始化饼图
const initPieChart = () => {
  if (!pieChart.value) return;
  const data = safeReportData.value;
  if (!Array.isArray(data) || data.length === 0) return;
  // 计算各账龄段合计金额
  const _totalAmount = data.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  const currentAmount = data.reduce((sum, item) => sum + (item.currentAmount || 0), 0);
  const within30Days = data.reduce((sum, item) => sum + (item.within30Days || 0), 0);
  const within60Days = data.reduce((sum, item) => sum + (item.within60Days || 0), 0);
  const within90Days = data.reduce((sum, item) => sum + (item.within90Days || 0), 0);
  const over90Days = data.reduce((sum, item) => sum + (item.over90Days || 0), 0);
  
  // 销毁旧图表
  if (pieChartInstance) {
    pieChartInstance.dispose();
  }
  
  // 创建新图表
  pieChartInstance = echarts.init(pieChart.value);
  
  const pieOption = {
    title: {
      text: '应收账款账龄比例',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      data: ['未逾期', '1-30天', '31-60天', '61-90天', '90天以上']
    },
    series: [
      {
        name: '账龄分析',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: '18',
            fontWeight: 'bold'
          }
        },
        labelLine: {
          show: false
        },
        data: [
          { value: currentAmount, name: '未逾期' },
          { value: within30Days, name: '1-30天' },
          { value: within60Days, name: '31-60天' },
          { value: within90Days, name: '61-90天' },
          { value: over90Days, name: '90天以上' }
        ]
      }
    ]
  };
  
  pieChartInstance.setOption(pieOption);
};
// 初始化柱状图
const initBarChart = () => {
  if (!barChart.value) return;
  const data = safeReportData.value;
  if (!Array.isArray(data) || data.length === 0) return;
  // 筛选出有逾期金额的前10名客户
  const top10Customers = [...data]
    .sort((a, b) => {
      const aOverdue = (a.within30Days || 0) + (a.within60Days || 0) + (a.within90Days || 0) + (a.over90Days || 0);
      const bOverdue = (b.within30Days || 0) + (b.within60Days || 0) + (b.within90Days || 0) + (b.over90Days || 0);
      return bOverdue - aOverdue;
    })
    .slice(0, 10);
  
  // 准备数据
  const customerNames = top10Customers.map(item => item.customerName);
  const within30DaysData = top10Customers.map(item => item.within30Days || 0);
  const within60DaysData = top10Customers.map(item => item.within60Days || 0);
  const within90DaysData = top10Customers.map(item => item.within90Days || 0);
  const over90DaysData = top10Customers.map(item => item.over90Days || 0);
  
  // 销毁旧图表
  if (barChartInstance) {
    barChartInstance.dispose();
  }
  
  // 创建新图表
  barChartInstance = echarts.init(barChart.value);
  
  const barOption = {
    title: {
      text: '逾期TOP10客户账龄分布',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    legend: {
      data: ['1-30天', '31-60天', '61-90天', '90天以上'],
      top: 'bottom'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'value'
    },
    yAxis: {
      type: 'category',
      data: customerNames,
      axisLabel: {
        formatter: function(value) {
          if (value.length > 8) {
            return value.substring(0, 8) + '...';
          }
          return value;
        }
      }
    },
    series: [
      {
        name: '1-30天',
        type: 'bar',
        stack: 'total',
        label: {
          show: false
        },
        emphasis: {
          focus: 'series'
        },
        data: within30DaysData
      },
      {
        name: '31-60天',
        type: 'bar',
        stack: 'total',
        label: {
          show: false
        },
        emphasis: {
          focus: 'series'
        },
        data: within60DaysData
      },
      {
        name: '61-90天',
        type: 'bar',
        stack: 'total',
        label: {
          show: false
        },
        emphasis: {
          focus: 'series'
        },
        data: within90DaysData
      },
      {
        name: '90天以上',
        type: 'bar',
        stack: 'total',
        label: {
          show: false
        },
        emphasis: {
          focus: 'series'
        },
        data: over90DaysData
      }
    ]
  };
  
  barChartInstance.setOption(barOption);
};
// 导出Excel
const exportExcel = async () => {
  const data = safeReportData.value;
  // 安全检查
  if (!Array.isArray(data) || data.length === 0) {
    ElMessage.warning('没有数据可以导出');
    return;
  }
  // 创建工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('应收账款账龄分析');
  // 设置列
  worksheet.columns = [
    { header: '客户名称', key: 'customerName', width: 20 },
    { header: '客户类型', key: 'customerType', width: 12 },
    { header: '应收金额', key: 'totalAmount', width: 15 },
    { header: '未逾期', key: 'currentAmount', width: 15 },
    { header: '1-30天', key: 'within30Days', width: 12 },
    { header: '31-60天', key: 'within60Days', width: 12 },
    { header: '61-90天', key: 'within90Days', width: 12 },
    { header: '90天以上', key: 'over90Days', width: 12 },
    { header: '逾期比例', key: 'overduePercentage', width: 12 },
    { header: '最近收款', key: 'lastPaymentDate', width: 15 },
    { header: '联系人', key: 'contactPerson', width: 12 },
    { header: '联系电话', key: 'contactPhone', width: 15 }
  ];
  // 添加数据
  data.forEach(item => {
    worksheet.addRow({
      customerName: item.customerName,
      customerType: getCustomerTypeText(item.customerType),
      totalAmount: item.totalAmount,
      currentAmount: item.currentAmount,
      within30Days: item.within30Days,
      within60Days: item.within60Days,
      within90Days: item.within90Days,
      over90Days: item.over90Days,
      overduePercentage: calculateOverduePercentage(item),
      lastPaymentDate: item.lastPaymentDate,
      contactPerson: item.contactPerson,
      contactPhone: item.contactPhone
    });
  });
  // 生成Excel文件并下载
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `应收账款账龄分析_${queryParams.reportDate}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};
// 打印报表
const printReport = () => {
  window.print();
};
// 页面加载时执行
onMounted(() => {
  // 确保初始数据安全
  ensureReportDataIsArray();
  // 注册统一的 resize 监听
  window.addEventListener('resize', handleChartResize);
});
onUnmounted(() => {
  // 移除 resize 监听
  window.removeEventListener('resize', handleChartResize);
  
  // 销毁 ECharts 实例
  if (pieChartInstance) { pieChartInstance.dispose(); pieChartInstance = null; }
  if (barChartInstance) { barChartInstance.dispose(); barChartInstance = null; }
});
</script>
<style scoped>
.header-card {
  margin-bottom: 20px;
}
.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}
.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}
.header-actions {
  display: flex;
  gap: 10px;
}
.search-form {
  display: flex;
  flex-wrap: wrap;
}
.report-title {
  text-align: center;
  margin-bottom: var(--spacing-lg);
}
.report-title h1 {
  font-size: 24px;
  margin-bottom: 10px;
}
.report-title h3 {
  font-size: 16px;
  font-weight: normal;
  margin-bottom: 8px;
}
.report-title h4 {
  font-size: 14px;
  font-weight: normal;
  color: var(--color-text-regular);
}
.report-body {
  margin-top: var(--spacing-lg);
}
.chart-container {
  margin-top: 40px;
}
.chart-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: var(--spacing-lg);
  text-align: center;
}
.charts {
  display: flex;
  flex-wrap: wrap;
}
.chart-item {
  flex: 1;
  min-width: 500px;
  margin-bottom: var(--spacing-lg);
}
.empty-tip {
  padding: 40px 0;
}
/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
}
/* 打印样式 */
@media print {
  .filter-card,
  .header-actions {
    display: none;
  }
  
  .aging-container {
    padding: 0;
  }
  
  .report-card {
    box-shadow: none;
    border: none;
  }
  
  .chart-container {
    page-break-before: always;
  }
}
</style> 
