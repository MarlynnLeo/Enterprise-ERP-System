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
          <h2>应付账款账龄分析</h2>
          <p class="subtitle">分析供应商账款账龄</p>
        </div>
        <div class="action-buttons">
          <el-button type="primary" @click="generateReport" :loading="loading" v-permission="'finance:ap:aging'">生成报表</el-button>
          <el-button v-permission="'finance:ar:view'" type="success" @click="exportToExcel" :disabled="!hasData">导出Excel</el-button>
          <el-button v-permission="'finance:ar:view'" type="info" @click="printReport" :disabled="!hasData">打印报表</el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 搜索表单 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" ref="searchFormRef" class="search-form">
        <el-form-item label="报表日期" prop="reportDate" required>
          <el-date-picker
            v-model="searchForm.reportDate"
            type="date"
            placeholder="选择报表截止日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="供应商类型">
          <el-select  v-model="searchForm.supplierType" placeholder="全部类型" clearable>
            <el-option label="生产物料" value="production"></el-option>
            <el-option label="辅助物料" value="auxiliary"></el-option>
            <el-option label="包装物料" value="packaging"></el-option>
            <el-option label="办公用品" value="office"></el-option>
            <el-option label="服务提供商" value="service"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="供应商名称">
          <el-input  v-model="searchForm.supplierName" placeholder="输入供应商名称" clearable ></el-input>
        </el-form-item>
      </el-form>
    </el-card>
    
    <!-- 统计卡片 -->
    <div class="statistics-row" v-if="hasData">
      <el-card class="stat-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>总应付账款</span>
          </div>
        </template>
        <div class="stat-value">{{ formatCurrency(summaryData.totalAmount) }}</div>
      </el-card>
      
      <el-card class="stat-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>30天内</span>
          </div>
        </template>
        <div class="stat-value">{{ formatCurrency(summaryData.within30Days) }}</div>
        <div class="stat-percent">{{ calculatePercent(summaryData.within30Days, summaryData.totalAmount) }}%</div>
      </el-card>
      
      <el-card class="stat-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>31-60天</span>
          </div>
        </template>
        <div class="stat-value">{{ formatCurrency(summaryData.days31to60) }}</div>
        <div class="stat-percent">{{ calculatePercent(summaryData.days31to60, summaryData.totalAmount) }}%</div>
      </el-card>
      
      <el-card class="stat-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>61-90天</span>
          </div>
        </template>
        <div class="stat-value">{{ formatCurrency(summaryData.days61to90) }}</div>
        <div class="stat-percent">{{ calculatePercent(summaryData.days61to90, summaryData.totalAmount) }}%</div>
      </el-card>
      
      <el-card class="stat-card" shadow="hover">
        <template #header>
          <div class="card-header">
            <span>90天以上</span>
          </div>
        </template>
        <div class="stat-value">{{ formatCurrency(summaryData.over90Days) }}</div>
        <div class="stat-percent">{{ calculatePercent(summaryData.over90Days, summaryData.totalAmount) }}%</div>
      </el-card>
    </div>
    
    <!-- 图表展示 -->
    <el-card class="chart-card" v-if="hasData">
      <template #header>
        <div class="card-header">
          <span>账龄分布图</span>
        </div>
      </template>
      <div class="charts-container">
        <div id="pieChart" class="chart"></div>
        <div id="barChart" class="chart"></div>
      </div>
    </el-card>
    
    <!-- 数据表格 -->
    <el-card class="data-card">
      <template #header>
        <div class="card-header">
          <span>应付账款账龄明细</span>
        </div>
      </template>
      
      <div v-if="!hasData" class="empty-container">
        <el-empty description='请选择报表日期并点击"生成报表"按钮'></el-empty>
      </div>
      
      <el-table
        v-else
        :data="safeTableData"
        style="width: 100%"
        border
        stripe
        :summary-method="getSummaries"
        show-summary
      >
        <el-table-column prop="supplierName" label="供应商名称" min-width="180"></el-table-column>
        <el-table-column prop="supplierType" label="供应商类型" width="120">
          <template #default="scope">
            {{ getSupplierTypeText(scope.row.supplierType) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="应付总额" width="150" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="within30Days" label="30天内" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.within30Days) }}
          </template>
        </el-table-column>
        <el-table-column prop="days31to60" label="31-60天" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.days31to60) }}
          </template>
        </el-table-column>
        <el-table-column prop="days61to90" label="61-90天" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.days61to90) }}
          </template>
        </el-table-column>
        <el-table-column prop="over90Days" label="90天以上" width="120" align="right">
          <template #default="scope">
            {{ formatCurrency(scope.row.over90Days) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="120" fixed="right">
          <template #default="scope">
            <el-button type="primary" size="small" @click="showDetails(scope.row)">查看明细</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    
    <!-- 明细对话框 -->
    <el-dialog
      title="应付账款明细"
      v-model="detailsDialogVisible"
      width="800px"
    >
      <el-descriptions title="供应商信息" :column="2" border>
        <el-descriptions-item label="供应商名称">{{ selectedSupplier.supplierName }}</el-descriptions-item>
        <el-descriptions-item label="供应商类型">{{ getSupplierTypeText(selectedSupplier.supplierType) }}</el-descriptions-item>
        <el-descriptions-item label="联系人">{{ selectedSupplier.contactPerson }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ selectedSupplier.contactPhone }}</el-descriptions-item>
      </el-descriptions>
      
      <div style="margin-top: 20px">
        <h4>未付发票列表</h4>
        <el-table :data="detailsList" border style="width: 100%">
          <el-table-column prop="invoiceNumber" label="发票编号" width="150"></el-table-column>
          <el-table-column prop="invoiceDate" label="发票日期" width="120"></el-table-column>
          <el-table-column prop="dueDate" label="到期日期" width="120"></el-table-column>
          <el-table-column prop="amount" label="发票金额" width="120" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.amount) }}
            </template>
          </el-table-column>
          <el-table-column prop="paidAmount" label="已付金额" width="120" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.paidAmount) }}
            </template>
          </el-table-column>
          <el-table-column prop="balance" label="未付金额" width="120" align="right">
            <template #default="scope">
              {{ formatCurrency(scope.row.balance) }}
            </template>
          </el-table-column>
          <el-table-column prop="agingDays" label="账龄(天)" width="100" align="center"></el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>

import { formatCurrency } from '@/utils/format'

// 版本标识 - 应付账款账龄分析修复版 v1.0
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/services/api';
import * as echarts from 'echarts';
// 权限计算属性
const loading = ref(false);
const tableData = ref([]);

// 安全的数据访问器
const safeTableData = computed(() => {
  const data = tableData.value;
  if (!data || !Array.isArray(data)) {
    return [];
  }
  return data;
});

// 安全的hasData计算属性
const hasData = computed(() => {
  try {
    const data = safeTableData.value;
    return Array.isArray(data) && data.length > 0;
  } catch (error) {
    console.error('[hasData计算属性错误]:', error);
    return false;
  }
});

// 搜索表单
const searchForm = reactive({
  reportDate: new Date().toISOString().slice(0, 10),
  supplierType: '',
  supplierName: ''
});

// 摘要数据
const summaryData = reactive({
  totalAmount: 0,
  within30Days: 0,
  days31to60: 0,
  days61to90: 0,
  over90Days: 0
});

// 明细对话框
const detailsDialogVisible = ref(false);
const selectedSupplier = ref({});
const detailsList = ref([]);

// ECharts 图表实例引用（用于清理）
let pieChartInstance = null;
let barChartInstance = null;

// 统一的 resize 处理函数（具名引用，确保可移除）
const handleChartResize = () => {
  if (pieChartInstance && !pieChartInstance.isDisposed()) pieChartInstance.resize();
  if (barChartInstance && !barChartInstance.isDisposed()) barChartInstance.resize();
};

// 计算百分比
const calculatePercent = (value, total) => {
  if (!total) return 0;
  return ((value / total) * 100).toFixed(2);
};

// 获取供应商类型文本
const getSupplierTypeText = (type) => {
  const typeMap = {
    production: '生产物料',
    auxiliary: '辅助物料',
    packaging: '包装物料',
    office: '办公用品',
    service: '服务提供商'
  };
  return typeMap[type] || type;
};

// 生成报表
const generateReport = async () => {
  if (!searchForm.reportDate) {
    ElMessage.warning('请选择报表日期');
    return;
  }
  
  loading.value = true;
  // 重置数据，避免竞态条件
  tableData.value = [];

  try {
    const params = {
      reportDate: searchForm.reportDate,
      supplierType: searchForm.supplierType,
      supplierName: searchForm.supplierName
    };
    
    const response = await api.get('/finance/ap/aging', { params });

    // 安全设置数据
    if (response.data && Array.isArray(response.data.details)) {
      tableData.value = response.data.details;
    } else {
      console.warn('[应付账款账龄分析] API返回数据格式异常:', response.data);
      tableData.value = [];
    }

    // 计算汇总数据
    calculateSummary();

    // 渲染图表
    nextTick(() => {
      renderCharts();
    });
  } catch (error) {
    console.error('获取账龄分析数据失败:', error);
    ElMessage.error('获取账龄分析数据失败');
    // 确保在错误情况下数据是安全的
    tableData.value = [];
  } finally {
    loading.value = false;
  }
};

// 计算汇总数据
const calculateSummary = () => {
  summaryData.totalAmount = 0;
  summaryData.within30Days = 0;
  summaryData.days31to60 = 0;
  summaryData.days61to90 = 0;
  summaryData.over90Days = 0;

  const data = safeTableData.value;
  if (Array.isArray(data)) {
    data.forEach(item => {
      summaryData.totalAmount += item.totalAmount || 0;
      summaryData.within30Days += item.within30Days || 0;
      summaryData.days31to60 += item.days31to60 || 0;
      summaryData.days61to90 += item.days61to90 || 0;
      summaryData.over90Days += item.over90Days || 0;
    });
  }
};

// 表格合计行
const getSummaries = (param) => {
  try {
    const { columns } = param;
    const sums = [];
    const data = safeTableData.value;

    if (!Array.isArray(data) || data.length === 0) {
      return columns.map((_, index) => index === 0 ? '合计' : '');
    }

    columns.forEach((column, index) => {
      if (index === 0) {
        sums[index] = '合计';
        return;
      }

      if (index === 1) {
        sums[index] = '';
        return;
      }

      const values = data.map(item => {
        if (column.property === 'totalAmount') return item.totalAmount || 0;
        if (column.property === 'within30Days') return item.within30Days || 0;
        if (column.property === 'days31to60') return item.days31to60 || 0;
        if (column.property === 'days61to90') return item.days61to90 || 0;
        if (column.property === 'over90Days') return item.over90Days || 0;
        return 0;
      });
    
    if (['totalAmount', 'within30Days', 'days31to60', 'days61to90', 'over90Days'].includes(column.property)) {
      const sum = values.reduce((prev, curr) => {
        const value = Number(curr);
        if (!isNaN(value)) {
          return prev + value;
        } else {
          return prev;
        }
      }, 0);
      
      sums[index] = formatCurrency(sum);
    } else {
      sums[index] = '';
    }
  });

  return sums;
  } catch (error) {
    console.error('[getSummaries错误]:', error);
    return param?.columns ? param.columns.map((_, index) => index === 0 ? '合计' : '') : [];
  }
};

// 渲染图表
const renderCharts = () => {
  // 饼图
  const pieChart = echarts.init(document.getElementById('pieChart'));
  const pieOption = {
    title: {
      text: '应付账款账龄分布',
      left: 'center'
    },
    tooltip: {
      trigger: 'item',
      formatter: '{a} <br/>{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      data: ['30天内', '31-60天', '61-90天', '90天以上']
    },
    series: [
      {
        name: '账龄分布',
        type: 'pie',
        radius: '60%',
        center: ['50%', '60%'],
        data: [
          { value: summaryData.within30Days, name: '30天内' },
          { value: summaryData.days31to60, name: '31-60天' },
          { value: summaryData.days61to90, name: '61-90天' },
          { value: summaryData.over90Days, name: '90天以上' }
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        itemStyle: {
          color: function(params) {
            const colorList = ['#91cc75', '#fac858', '#ee6666', '#73c0de'];
            return colorList[params.dataIndex];
          }
        }
      }
    ]
  };
  pieChart.setOption(pieOption);
  
  // 柱状图
  const barChart = echarts.init(document.getElementById('barChart'));
  
  // 获取金额最高的5个供应商
  const data = safeTableData.value;
  const top5Suppliers = Array.isArray(data) ? [...data]
    .sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0))
    .slice(0, 5) : [];
  
  const barOption = {
    title: {
      text: '前5大供应商应付账款',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    legend: {
      data: ['30天内', '31-60天', '61-90天', '90天以上'],
      top: 30
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: (value) => {
          return value >= 10000 
            ? (value / 10000).toFixed(1) + '万' 
            : value;
        }
      }
    },
    yAxis: {
      type: 'category',
      data: top5Suppliers.map(item => item.supplierName)
    },
    series: [
      {
        name: '30天内',
        type: 'bar',
        stack: 'total',
        label: {
          show: false
        },
        emphasis: {
          focus: 'series'
        },
        data: top5Suppliers.map(item => item.within30Days),
        itemStyle: {
          color: '#91cc75'
        }
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
        data: top5Suppliers.map(item => item.days31to60),
        itemStyle: {
          color: '#fac858'
        }
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
        data: top5Suppliers.map(item => item.days61to90),
        itemStyle: {
          color: '#ee6666'
        }
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
        data: top5Suppliers.map(item => item.over90Days),
        itemStyle: {
          color: '#73c0de'
        }
      }
    ]
  };
  barChart.setOption(barOption);
  
  pieChartInstance = pieChart;
  barChartInstance = barChart;
  
  // 注册统一的 resize 监听
  window.addEventListener('resize', handleChartResize);
};

// 查看明细
const showDetails = async (supplier) => {
  selectedSupplier.value = supplier;

  try {
    // 使用正确的API路由: /finance/ap/aging/:id
    const response = await api.get(`/finance/ap/aging/${supplier.supplierId || supplier.id}`, {
      params: {
        reportDate: searchForm.reportDate
      }
    });

    // 后端返回的是完整的账龄数据，包含 invoices 明细
    if (response.data?.invoices) {
      detailsList.value = response.data.invoices;
    } else if (Array.isArray(response.data)) {
      detailsList.value = response.data;
    } else {
      detailsList.value = [];
    }
    detailsDialogVisible.value = true;
  } catch (error) {
    console.error('获取应付账款明细失败:', error);
    ElMessage.error('获取应付账款明细失败');
  }
};

// 导出到Excel
const exportToExcel = () => {
  // 使用环境变量配置的API基础URL，默认为相对路径
  const baseURL = import.meta.env.VITE_API_URL || '';
  window.open(`${baseURL}/api/finance/ap/aging/export?reportDate=${searchForm.reportDate}&supplierType=${searchForm.supplierType}&supplierName=${searchForm.supplierName}`);
};

// 打印报表
const printReport = () => {
  if (!tableData.value.length) {
    ElMessage.warning('没有可打印的数据');
    return;
  }
  window.print();
};

// 初始化
onMounted(() => {
  // 确保初始数据安全
  if (!Array.isArray(tableData.value)) {
    tableData.value = [];
  }
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

.action-buttons {
  display: flex;
  gap: 10px;
}

.stat-percent {
  font-size: 16px;
  color: var(--color-text-regular);
  margin-top: 5px;
}

.chart-card {
  margin-bottom: var(--spacing-base);
}

.charts-container {
  display: flex;
  flex-wrap: wrap;
}

.chart {
  height: 400px;
  width: 50%;
}

@media (max-width: 1200px) {
  .chart {
    width: 100%;
  }
}



.empty-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
