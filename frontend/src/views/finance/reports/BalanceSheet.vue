<!--
/**
 * BalanceSheet.vue
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
          <h2>资产负债表</h2>
          <p class="subtitle">查看资产负债状况</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="generateReport" v-permission="'finance:reports:balance-sheet'">生成报表</el-button>
          <el-button v-permission="'finance:reports:view'" @click="printReport" :disabled="!reportData.summary">打印报表</el-button>
          <el-button v-permission="'finance:reports:view'" @click="exportExcel" :disabled="!reportData.summary">导出Excel</el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 查询条件区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="queryParams" class="search-form">
        <el-form-item label="报表日期" required>
          <el-date-picker
            v-model="queryParams.reportDate"
            type="date"
            placeholder="选择报表日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"

          ></el-date-picker>
        </el-form-item>
        <el-form-item label="比较日期">
          <el-date-picker
            v-model="queryParams.compareDate"
            type="date"
            placeholder="选择比较日期"
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
    
    <!-- 报表区域 -->
    <el-card class="data-card" v-loading="loading">
      <div class="report-title" v-if="reportData.summary">
        <h1>资产负债表</h1>
        <h3>{{ formatDate(queryParams.reportDate) }}</h3>
        <h4>单位：{{ unitText }}</h4>
      </div>
      
      <!-- 报表主体 -->
      <div class="report-body" v-if="reportData.summary">
        <el-row>
          <el-col :span="12">
            <div class="report-section">
              <h3>资产</h3>
              <el-table
                :data="assetData"
                style="width: 100%"
                :show-header="true"
                border
                row-key="id"
                :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
              >
                <el-table-column prop="name" label="资产" width="280"></el-table-column>
                <el-table-column label="行次" width="60" align="center">
                  <template #default="scope">
                    {{ scope.row.rowNum }}
                  </template>
                </el-table-column>
                <el-table-column prop="amount" label="期末余额" align="right">
                  <template #default="scope">
                    {{ formatAmount(scope.row.amount) }}
                  </template>
                </el-table-column>
                <el-table-column prop="compareAmount" label="期初余额" align="right" v-if="queryParams.compareDate">
                  <template #default="scope">
                    {{ formatAmount(scope.row.compareAmount) }}
                  </template>
                </el-table-column>
                <el-table-column label="变动" align="right" v-if="queryParams.compareDate">
                  <template #default="scope">
                    <span :class="getChangeClass(scope.row.change)">
                      {{ formatAmount(scope.row.change) }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
          
          <el-col :span="12">
            <div class="report-section">
              <h3>负债和所有者权益</h3>
              <el-table
                :data="liabilityEquityData"
                style="width: 100%"
                :show-header="true"
                border
                row-key="id"
                :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
              >
                <el-table-column prop="name" label="负债和所有者权益" width="280"></el-table-column>
                <el-table-column label="行次" width="60" align="center">
                  <template #default="scope">
                    {{ scope.row.rowNum }}
                  </template>
                </el-table-column>
                <el-table-column prop="amount" label="期末余额" align="right">
                  <template #default="scope">
                    {{ formatAmount(scope.row.amount) }}
                  </template>
                </el-table-column>
                <el-table-column prop="compareAmount" label="期初余额" align="right" v-if="queryParams.compareDate">
                  <template #default="scope">
                    {{ formatAmount(scope.row.compareAmount) }}
                  </template>
                </el-table-column>
                <el-table-column label="变动" align="right" v-if="queryParams.compareDate">
                  <template #default="scope">
                    <span :class="getChangeClass(scope.row.change)">
                      {{ formatAmount(scope.row.change) }}
                    </span>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
        </el-row>
      </div>
      
      <!-- 无数据提示 -->
      <div class="empty-tip" v-if="!loading && !reportData.summary">
        <el-empty description='请选择报表日期并点击"生成报表"按钮'></el-empty>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ReportHelper } from '@/utils/commonHelpers'
import { formatDate } from '@/utils/helpers/dateUtils'

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/services/api';
import ExcelJS from 'exceljs';
// 查询参数
const queryParams = reactive({
  reportDate: new Date().toISOString().slice(0, 10), // 默认为今天
  compareDate: '',
  unit: 1 // 默认单位为元
});

// 报表数据
const reportData = ref({});
const loading = ref(false);

// 计算资产数据和负债权益数据
// 计算资产数据和负债权益数据
const assetData = computed(() => {
  return reportData.value.assets?.items || [];
});

const liabilityEquityData = computed(() => {
  const liabilities = reportData.value.liabilities?.items || [];
  const equity = reportData.value.equity?.items || [];
  return [...liabilities, ...equity];
});

// 计算金额单位显示文本（使用公共工具函数）
const unitText = computed(() => ReportHelper.getUnitText(queryParams.unit));

// 生成报表
const generateReport = async () => {
  if (!queryParams.reportDate) {
    ElMessage.warning('请选择报表日期');
    return;
  }
  
  loading.value = true;
  try {
    const response = await api.get('/finance/reports/balance-sheet', {
      params: {
        reportDate: queryParams.reportDate,
        compareDate: queryParams.compareDate,
        unit: queryParams.unit
      }
    });

    // 确保 reportData 是对象
    reportData.value = response.data || {};
  } catch (error) {
    console.error('获取资产负债表数据失败:', error);
    ElMessage.error('获取资产负债表数据失败');
    // 出错时也确保 reportData 是对象
    reportData.value = {};
  } finally {
    loading.value = false;
  }
};

// 打印报表
const printReport = () => {
  window.print();
};

// 导出Excel
const exportExcel = async () => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('资产负债表');

    // 添加标题
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = '资产负债表';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // 添加报表日期
    worksheet.mergeCells('A2:F2');
    worksheet.getCell('A2').value = `报表日期: ${formatDate(queryParams.reportDate)}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // 添加单位
    worksheet.mergeCells('A3:F3');
    worksheet.getCell('A3').value = `单位: ${unitText.value}`;
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    // 空行
    worksheet.addRow([]);

    // 添加资产数据
    const assetRows = prepareExcelData(assetData.value, '资产');
    assetRows.forEach(row => {
      worksheet.addRow([row.A, row.B, row.C, row.D, row.E, row.F]);
    });

    // 空行
    worksheet.addRow([]);

    // 添加负债和所有者权益数据
    const liabilityEquityRows = prepareExcelData(liabilityEquityData.value, '负债和所有者权益');
    liabilityEquityRows.forEach(row => {
      worksheet.addRow([row.A, row.B, row.C, row.D, row.E, row.F]);
    });

    // 设置列宽
    worksheet.columns = [
      { width: 25 },
      { width: 10 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 }
    ];

    // 生成并下载文件
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `资产负债表_${queryParams.reportDate}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('导出Excel失败:', error);
    ElMessage.error('导出Excel失败');
  }
};

// 准备Excel数据
const prepareExcelData = (data, sectionTitle) => {
  const rows = [
    { A: sectionTitle, B: '行次', C: '期末余额', D: '期初余额', E: '变动', F: '变动率(%)' }
  ];
  
  data.forEach(item => {
    const change = item.change || (item.amount - (item.compareAmount || 0));
    const changeRate = item.changePercent || (item.compareAmount ? (change / Math.abs(item.compareAmount) * 100).toFixed(2) : 'N/A');
    
    rows.push({
      A: item.name,
      B: item.rowNum,
      C: formatAmount(item.amount),
      D: formatAmount(item.compareAmount),
      E: formatAmount(change),
      F: changeRate
    });
    
    // 处理子项
    if (item.children && item.children.length) {
      item.children.forEach(child => {
        const childChange = child.change || (child.amount - (child.compareAmount || 0));
        const childChangeRate = child.changePercent || (child.compareAmount ? (childChange / Math.abs(child.compareAmount) * 100).toFixed(2) : 'N/A');
        
        rows.push({
          A: '  ' + child.name, // 增加缩进
          B: child.rowNum,
          C: formatAmount(child.amount),
          D: formatAmount(child.compareAmount),
          E: formatAmount(childChange),
          F: childChangeRate
        });
      });
    }
  });
  
  return rows;
};

// 格式化日期
// formatDate 已统一引用公共实现;

// 格式化金额
const formatAmount = (amount) => {
  if (amount === undefined || amount === null) return '-';
  
  // 换算单位
  const convertedAmount = amount / queryParams.unit;
  
  // 格式化为千分位
  return convertedAmount.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// 获取变动金额的样式
const getChangeClass = (change) => {
  if (change > 0) return 'positive-change';
  if (change < 0) return 'negative-change';
  return '';
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

/* 使用全局common-styles.css中的样式，无需重复定义 */
/* .filter-card 和 .report-card 已在全局定义 */

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

.report-section {
  margin-bottom: var(--spacing-lg);
}

.report-section h3 {
  margin-bottom: 10px;
  font-size: 16px;
}

.positive-change {
  color: var(--color-success);
}

.negative-change {
  color: var(--color-danger);
}

.empty-tip {
  padding: 40px 0;
}

/* 打印样式 */
@media print {
  .filter-card,
  .header-actions {
    display: none;
  }
  
  .report-container {
    padding: 0;
  }
  
  .report-card {
    box-shadow: none;
    border: none;
  }
}
</style> 