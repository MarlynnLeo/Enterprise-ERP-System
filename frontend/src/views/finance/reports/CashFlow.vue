<!--
/**
 * CashFlow.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="report-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>出纳报表</h2>
          <p class="subtitle">查看现金流动情况</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="generateReport" v-permission="'finance:reports:cash-flow'">生成报表</el-button>
          <el-button v-permission="'finance:reports:view'" @click="printReport" :disabled="!reportData.length">打印报表</el-button>
          <el-button v-permission="'finance:reports:view'" @click="exportExcel" :disabled="!reportData.length">导出Excel</el-button>
        </div>
      </div>
    </el-card>

    <!-- 查询条件区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="queryParams" class="search-form">
        <el-form-item label="报表年月" required>
          <el-date-picker
            v-model="queryParams.reportMonth"
            type="month"
            placeholder="选择报表月份"
            format="YYYY年MM月"
            value-format="YYYY-MM"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="单位">
          <el-select v-model="queryParams.unit" placeholder="选择金额单位">
            <el-option label="元" :value="1"></el-option>
            <el-option label="千元" :value="1000"></el-option>
            <el-option label="万元" :value="10000"></el-option>
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 报表统计信息 -->
    <div class="statistics-row" v-if="reportData.length">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(reportStats.totalIncome) }}</div>
        <div class="stat-label">本月总收入</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(reportStats.totalExpense) }}</div>
        <div class="stat-label">本月总支出</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(reportStats.netAmount) }}</div>
        <div class="stat-label">本月净额</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(reportStats.totalBalance) }}</div>
        <div class="stat-label">期末余额</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ reportStats.accountCount }}</div>
        <div class="stat-label">账户数量</div>
      </el-card>
    </div>

    <!-- 报表区域 -->
    <el-card class="data-card" v-loading="loading">
      <!-- 报表标题 -->
      <div class="report-header" v-if="reportData.length">
        <div class="company-name">浙江开控电气有限公司</div>
        <div class="report-title">出纳月报表</div>
        <div class="report-period">{{ formatReportPeriod(queryParams.reportMonth) }}</div>
      </div>

      <!-- 报表主体 -->
      <div class="report-body" v-if="reportData.length">
        <table class="cashier-table">
          <thead>
            <tr>
              <th class="item-column">项目</th>
              <th class="amount-column">上月结存</th>
              <th class="amount-column">本月共收</th>
              <th class="amount-column">本月共付</th>
              <th class="amount-column">本月结存</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in reportData" :key="item.id" :class="item.type">
              <td class="item-name">{{ item.name }}</td>
              <td class="amount-cell">{{ formatAmount(item.lastMonthBalance) }}</td>
              <td class="amount-cell">{{ formatAmount(item.currentMonthIncome) }}</td>
              <td class="amount-cell">{{ formatAmount(item.currentMonthExpense) }}</td>
              <td class="amount-cell">{{ formatAmount(item.currentMonthBalance) }}</td>
            </tr>
          </tbody>
        </table>

        <!-- 签名区域 -->
        <div class="signature-area">
          <div class="signature-item">
            <span class="signature-label">主管：</span>
            <span class="signature-line"></span>
          </div>
          <div class="signature-item">
            <span class="signature-label">会计：</span>
            <span class="signature-line"></span>
          </div>
          <div class="signature-item">
            <span class="signature-label">复核：</span>
            <span class="signature-line"></span>
          </div>
          <div class="signature-item">
            <span class="signature-label">出纳：</span>
            <span class="signature-line"></span>
          </div>
        </div>
      </div>

      <!-- 无数据提示 -->
      <div class="empty-tip" v-if="!loading && !reportData.length">
        <el-empty description='请选择报表月份并点击"生成报表"按钮'></el-empty>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus';
import { api } from '@/services/api';
import { formatCurrency } from '@/utils/format';
import ExcelJS from 'exceljs';

// 查询参数
const queryParams = reactive({
  reportMonth: new Date().toISOString().slice(0, 7), // 默认为当前月份 YYYY-MM
  unit: 1 // 默认单位为元
});

// 报表数据
const reportData = ref([]);
const loading = ref(false);

// 报表统计数据
const reportStats = reactive({
  totalIncome: 0,
  totalExpense: 0,
  netAmount: 0,
  totalBalance: 0,
  accountCount: 0
});

// 计算金额单位显示文本
const unitText = computed(() => {
  switch (queryParams.unit) {
    case 1: return '元';
    case 1000: return '千元';
    case 10000: return '万元';
    default: return '元';
  }
});

// 生成报表
const generateReport = async () => {
  if (!queryParams.reportMonth) {
    ElMessage.warning('请选择报表月份');
    return;
  }

  loading.value = true;
  try {
    // 将 reportMonth (YYYY-MM) 转换为 startDate 和 endDate
    const [year, month] = queryParams.reportMonth.split('-');
    const startDate = `${year}-${month}-01`;
    // 计算月末日期
    const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

    // 调用后端API获取出纳报表数据
    const response = await api.get('/finance/reports/cash-flow', {
      params: {
        startDate,
        endDate,
        unit: queryParams.unit
      }
    });

    // axios 拦截器已自动解包，response.data 直接是数据数组
    if (response.data && Array.isArray(response.data)) {
      reportData.value = response.data;

      // 计算统计数据
      calculateReportStats();

      ElMessage.success('出纳报表生成成功');
    } else {
      throw new Error('获取数据失败');
    }
  } catch (error) {
    ElMessage.error(error.response?.data?.message || error.message || '获取出纳报表数据失败');
  } finally {
    loading.value = false;
  }
};



// 格式化报表期间
const formatReportPeriod = (reportMonth) => {
  if (!reportMonth) return '';
  const [year, month] = reportMonth.split('-');
  return `${year}年${month}月`;
};

// 打印报表
const printReport = () => {
  window.print();
};

// 导出Excel
const exportExcel = async () => {
  // 创建工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('出纳月报表');

  // 准备报表数据
  const rows = prepareCashierExcelData(reportData.value);

  // 添加标题行
  worksheet.addRow(['浙江开控电气有限公司', '', '', '', '']);
  worksheet.addRow(['出纳月报表', '', '', '', '']);
  worksheet.addRow([formatReportPeriod(queryParams.reportMonth), '', '', '', '']);
  worksheet.addRow(['', '', '', '', '']);

  // 添加数据行
  rows.forEach(row => {
    worksheet.addRow([row.A, row.B, row.C, row.D, row.E]);
  });

  // 生成Excel文件并下载
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `出纳月报表_${formatReportPeriod(queryParams.reportMonth)}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// 准备出纳报表Excel数据
const prepareCashierExcelData = (data) => {
  const headerRow = {
    A: '项目',
    B: '上月结存',
    C: '本月共收',
    D: '本月共付',
    E: '本月结存'
  };

  const rows = [headerRow];

  data.forEach(item => {
    const row = {
      A: item.name,
      B: formatAmount(item.lastMonthBalance),
      C: formatAmount(item.currentMonthIncome),
      D: formatAmount(item.currentMonthExpense),
      E: formatAmount(item.currentMonthBalance)
    };

    rows.push(row);
  });

  return rows;
};

// 计算报表统计数据
const calculateReportStats = () => {
  if (!reportData.value || reportData.value.length === 0) {
    // 重置统计数据
    Object.assign(reportStats, {
      totalIncome: 0,
      totalExpense: 0,
      netAmount: 0,
      totalBalance: 0,
      accountCount: 0
    });
    return;
  }

  let totalIncome = 0;
  let totalExpense = 0;
  let totalBalance = 0;

  reportData.value.forEach(item => {
    // 排除合计行，避免重复计算
    if (item.type === 'total') return;

    totalIncome += item.currentMonthIncome || 0;
    totalExpense += item.currentMonthExpense || 0;
    totalBalance += item.currentMonthBalance || 0;
  });

  reportStats.totalIncome = totalIncome;
  reportStats.totalExpense = totalExpense;
  reportStats.netAmount = totalIncome - totalExpense;
  reportStats.totalBalance = totalBalance;
  reportStats.accountCount = reportData.value.length;
};

// 格式化金额
const formatAmount = (amount) => {
  if (amount === undefined || amount === null || amount === 0) return '-';

  // 换算单位
  const convertedAmount = amount / queryParams.unit;

  // 格式化为千分位
  return convertedAmount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// 页面加载时执行
onMounted(() => {
  // 可以选择自动加载报表，也可以等用户点击按钮
  // generateReport();
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

/* 报表标题样式 */
.report-header {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px 0;
}

.company-name {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 10px;
  color: #333;
}

.report-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 8px;
  color: #333;
}

.report-period {
  font-size: 14px;
  color: #666;
}

/* 出纳报表表格样式 */
.cashier-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 30px;
  font-size: 12px;
}

.cashier-table th,
.cashier-table td {
  border: 1px solid #000;
  padding: 8px;
  text-align: center;
  vertical-align: middle;
}

.cashier-table th {
  background-color: var(--color-bg-light);
  font-weight: var(--font-weight-bold);
  font-size: 13px;
}

.item-column {
  width: 200px;
}

.amount-column {
  width: 120px;
}

.item-name {
  text-align: left;
  padding-left: 12px;
}

.amount-cell {
  text-align: right;
  padding-right: 12px;
  font-family: 'Courier New', monospace;
}

.cash {
  background-color: var(--color-primary-light-9);
}

.bank {
  background-color: var(--color-bg-light);
}

/* 签名区域样式 */
.signature-area {
  display: flex;
  justify-content: space-around;
  margin-top: 40px;
  padding: 20px 0;
}

.signature-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.signature-label {
  font-size: 14px;
  color: #333;
}

.signature-line {
  width: 80px;
  height: 1px;
  border-bottom: 1px solid #333;
}

.empty-tip {
  padding: 40px 0;
}

/* 打印样式 */
@media print {
  .filter-card,
  .header-actions,
  .page-header {
    display: none;
  }

  .report-container {
    padding: 0;
    margin: 0;
  }

  .report-card {
    box-shadow: none;
    border: none;
    margin: 0;
    padding: 0;
  }

  .cashier-table {
    font-size: 11px;
    page-break-inside: avoid;
  }

  .cashier-table th,
  .cashier-table td {
    padding: 6px;
  }

  .report-header {
    margin-bottom: var(--spacing-lg);
    padding: 10px 0;
  }

  .signature-area {
    margin-top: 30px;
    page-break-inside: avoid;
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