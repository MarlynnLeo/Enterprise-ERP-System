<!--
/**
 * StandardCashFlow.vue
 * @description 标准现金流量表（间接法）
 * @date 2026-01-31
 * @version 1.0.0
 */
-->
<template>
  <div class="report-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>现金流量表</h2>
          <p class="subtitle">间接法 · 符合企业会计准则</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="generateReport">生成报表</el-button>
          <el-button v-permission="'finance:standardcashflow:print'" @click="printReport" :disabled="!reportData.items?.length">打印报表</el-button>
          <el-button v-permission="'finance:standardcashflow:export'" @click="exportExcel" :disabled="!reportData.items?.length">导出Excel</el-button>
        </div>
      </div>
    </el-card>

    <!-- 查询条件区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="queryParams" class="search-form">
        <el-form-item label="开始日期" required>
          <el-date-picker
            v-model="queryParams.startDate"
            type="date"
            placeholder="选择开始日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"

          ></el-date-picker>
        </el-form-item>
        <el-form-item label="结束日期" required>
          <el-date-picker
            v-model="queryParams.endDate"
            type="date"
            placeholder="选择结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"

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

    <!-- 报表统计摘要 -->
    <div class="statistics-row" v-if="reportData.summary">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" :class="{'positive': reportData.summary.operatingCashFlow > 0, 'negative': reportData.summary.operatingCashFlow < 0}">
          {{ formatCurrency(reportData.summary.operatingCashFlow) }}
        </div>
        <div class="stat-label">经营活动现金流</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" :class="{'positive': reportData.summary.investingCashFlow > 0, 'negative': reportData.summary.investingCashFlow < 0}">
          {{ formatCurrency(reportData.summary.investingCashFlow) }}
        </div>
        <div class="stat-label">投资活动现金流</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" :class="{'positive': reportData.summary.financingCashFlow > 0, 'negative': reportData.summary.financingCashFlow < 0}">
          {{ formatCurrency(reportData.summary.financingCashFlow) }}
        </div>
        <div class="stat-label">筹资活动现金流</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value" :class="{'positive': reportData.summary.netCashIncrease > 0, 'negative': reportData.summary.netCashIncrease < 0}">
          {{ formatCurrency(reportData.summary.netCashIncrease) }}
        </div>
        <div class="stat-label">现金净增加额</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(reportData.summary.endingCash) }}</div>
        <div class="stat-label">期末现金余额</div>
      </el-card>
    </div>

    <!-- 报表区域 -->
    <el-card class="data-card" v-loading="loading">
      <!-- 报表标题 -->
      <div class="report-header" v-if="reportData.items?.length">
        <div class="company-name">浙江开控电气有限公司</div>
        <div class="report-title">现金流量表</div>
        <div class="report-period">{{ formatReportPeriod() }}</div>
        <div class="report-unit">单位：{{ unitText }}</div>
      </div>

      <!-- 报表主体 -->
      <div class="report-body" v-if="reportData.items?.length">
        <table class="cash-flow-table">
          <thead>
            <tr>
              <th class="row-num-column">行次</th>
              <th class="item-column">项目</th>
              <th class="amount-column">本期金额</th>
              <th class="amount-column" v-if="hasCompareData">上期金额</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="item in reportData.items" 
              :key="item.id" 
              :class="{
                'header-row': item.isHeader,
                'total-row': item.isTotal,
                'detail-row': item.level === 1
              }"
            >
              <td class="row-num">{{ item.rowNum }}</td>
              <td class="item-name" :class="{'indent': item.level === 1}">{{ item.name }}</td>
              <td class="amount-cell" :class="{'negative': item.amount < 0}">
                {{ formatAmount(item.amount) }}
              </td>
              <td class="amount-cell" v-if="hasCompareData" :class="{'negative': item.compareAmount < 0}">
                {{ formatAmount(item.compareAmount) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 空状态 -->
      <el-empty v-if="!loading && !reportData.items?.length" description="暂无数据，请选择日期范围后生成报表"></el-empty>
    </el-card>
  </div>
</template>

<script setup>
import { ReportHelper } from '@/utils/commonHelpers';
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/services/api';
import ExcelJS from 'exceljs';

// 查询参数
const queryParams = reactive({
  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  endDate: new Date().toISOString().slice(0, 10),
  unit: 1
});

// 报表数据
const reportData = ref({});
const loading = ref(false);

// 计算金额单位显示文本
const unitText = computed(() => ReportHelper.getUnitText(queryParams.unit));

// 是否有对比数据
const hasCompareData = computed(() => {
  return reportData.value.items?.some(item => item.compareAmount !== null);
});

// 生成报表
const generateReport = async () => {
  if (!queryParams.startDate || !queryParams.endDate) {
    ElMessage.warning('请选择报表开始和结束日期');
    return;
  }
  
  loading.value = true;
  try {
    const response = await api.get('/api/finance/reports/standard-cash-flow', {
      params: {
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
        unit: queryParams.unit
      }
    });
    
    if (response.data.success) {
      reportData.value = response.data.data;
      ElMessage.success('现金流量表生成成功');
    } else {
      ElMessage.error(response.data.message || '生成报表失败');
    }
  } catch (error) {
    console.error('生成报表失败:', error);
    ElMessage.error('生成报表失败');
  } finally {
    loading.value = false;
  }
};

// 格式化金额
const formatAmount = (amount) => {
  if (amount === null || amount === undefined) return '';
  const num = parseFloat(amount);
  if (isNaN(num)) return '';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 格式化货币
// formatCurrency 已统一引用公共实现;

// 金额格式化
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '¥0.00';
  const num = parseFloat(value);
  if (isNaN(num)) return '¥0.00';
  return num.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' });
};

// 格式化报表期间
const formatReportPeriod = () => {
  if (!queryParams.startDate || !queryParams.endDate) return '';
  return `${queryParams.startDate} 至 ${queryParams.endDate}`;
};

// 打印报表
const printReport = () => {
  window.print();
};

// 导出Excel
const exportExcel = async () => {
  if (!reportData.value.items?.length) {
    ElMessage.warning('暂无数据可导出');
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('现金流量表');

    // 设置列宽
    worksheet.columns = [
      { header: '行次', key: 'rowNum', width: 8 },
      { header: '项目', key: 'name', width: 50 },
      { header: '本期金额', key: 'amount', width: 18 }
    ];

    // 添加标题
    worksheet.insertRow(1, ['浙江开控电气有限公司']);
    worksheet.insertRow(2, ['现金流量表']);
    worksheet.insertRow(3, [`报表期间：${formatReportPeriod()}`]);
    worksheet.insertRow(4, [`单位：${unitText.value}`]);
    worksheet.insertRow(5, []);

    // 合并标题单元格
    worksheet.mergeCells('A1:C1');
    worksheet.mergeCells('A2:C2');
    worksheet.mergeCells('A3:C3');
    worksheet.mergeCells('A4:C4');

    // 样式设置
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(2).font = { bold: true, size: 14 };
    worksheet.getRow(1).alignment = { horizontal: 'center' };
    worksheet.getRow(2).alignment = { horizontal: 'center' };
    worksheet.getRow(3).alignment = { horizontal: 'center' };
    worksheet.getRow(4).alignment = { horizontal: 'center' };

    // 添加数据
    reportData.value.items.forEach(item => {
      const row = worksheet.addRow({
        rowNum: item.rowNum,
        name: item.name,
        amount: item.amount
      });
      
      if (item.isHeader || item.isTotal) {
        row.font = { bold: true };
      }
      if (item.level === 1) {
        row.getCell('name').alignment = { indent: 2 };
      }
    });

    // 导出文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `现金流量表_${queryParams.startDate}_${queryParams.endDate}.xlsx`;
    link.click();
    
    ElMessage.success('导出成功');
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error('导出失败');
  }
};

// 组件挂载时自动生成报表
onMounted(() => {
  generateReport();
});
</script>

<style scoped>
.report-container {
  padding: 20px;
  background: var(--color-bg-hover);
  min-height: 100vh;
}

.header-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0 0 4px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.search-card {
  margin-bottom: 16px;
  border-radius: 8px;
}

.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.statistics-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
  padding: 16px;
  border-radius: 8px;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.stat-value.positive {
  color: var(--color-success);
}

.stat-value.negative {
  color: var(--color-danger);
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.data-card {
  border-radius: 8px;
}

.report-header {
  text-align: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border-lighter);
}

.company-name {
  font-size: 18px;
  font-weight: bold;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.report-title {
  font-size: 16px;
  font-weight: bold;
  color: var(--color-text-regular);
  margin-bottom: 4px;
}

.report-period {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.report-unit {
  font-size: 12px;
  color: var(--color-text-placeholder);
  margin-top: 4px;
}

.cash-flow-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.cash-flow-table th,
.cash-flow-table td {
  border: 1px solid var(--color-border-lighter);
  padding: 12px;
}

.cash-flow-table th {
  background: var(--color-bg-hover);
  font-weight: bold;
  text-align: center;
  color: var(--color-text-primary);
}

.row-num-column {
  width: 60px;
}

.item-column {
  text-align: left;
}

.amount-column {
  width: 150px;
  text-align: right;
}

.row-num {
  text-align: center;
  color: var(--color-text-secondary);
}

.item-name {
  text-align: left;
  color: var(--color-text-primary);
}

.item-name.indent {
  padding-left: 24px;
}

.amount-cell {
  text-align: right;
  font-family: 'Courier New', monospace;
  color: var(--color-text-primary);
}

.amount-cell.negative {
  color: var(--color-danger);
}

.header-row {
  background: #f0f9eb;
}

.header-row .item-name {
  font-weight: bold;
  color: var(--color-success);
}

.total-row {
  background: #ecf5ff;
}

.total-row .item-name,
.total-row .amount-cell {
  font-weight: bold;
  color: var(--color-primary);
}

.detail-row:hover {
  background: var(--color-bg-light);
}

@media print {
  .header-card,
  .search-card,
  .header-actions {
    display: none;
  }
  
  .statistics-row {
    break-inside: avoid;
  }
  
  .report-container {
    background: white;
    padding: 0;
  }
}
</style>
