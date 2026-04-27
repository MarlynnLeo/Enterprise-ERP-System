<!--
/**
 * IncomeStatement.vue
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
          <h2>利润表</h2>
          <p class="subtitle">查看收入与利润状况</p>
        </div>
        <div class="header-actions">
          <el-button type="primary" @click="generateReport" v-permission="'finance:reports:income-statement'">生成报表</el-button>
          <el-button v-permission="'finance:reports:view'" @click="printReport" :disabled="!reportData.length">打印报表</el-button>
          <el-button v-permission="'finance:reports:view'" @click="exportExcel" :disabled="!reportData.length">导出Excel</el-button>
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
        <el-form-item label="比较期间">
          <el-checkbox v-model="queryParams.enableCompare">启用比较</el-checkbox>
        </el-form-item>
        <el-form-item v-if="queryParams.enableCompare" label="比较开始日期">
          <el-date-picker
            v-model="queryParams.compareStartDate"
            type="date"
            placeholder="选择比较开始日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"

          ></el-date-picker>
        </el-form-item>
        <el-form-item v-if="queryParams.enableCompare" label="比较结束日期">
          <el-date-picker
            v-model="queryParams.compareEndDate"
            type="date"
            placeholder="选择比较结束日期"
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
      <div class="report-title" v-if="reportData.length">
        <h1>利润表</h1>
        <h3>{{ formatDateRange(queryParams.startDate, queryParams.endDate) }}</h3>
        <h4>单位：{{ unitText }}</h4>
      </div>

      <!-- 报表主体 -->
      <div class="report-body" v-if="reportData.length">
        <el-table
          :data="reportData"
          style="width: 100%"
          :show-header="true"
          border
          row-key="id"
          :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
        >
          <el-table-column prop="name" label="项目" width="280"></el-table-column>
          <el-table-column label="行次" width="60" align="center">
            <template #default="scope">
              {{ scope.row.rowNum }}
            </template>
          </el-table-column>
          <el-table-column prop="amount" :label="formatDateRange(queryParams.startDate, queryParams.endDate)" align="right">
            <template #default="scope">
              {{ formatAmount(scope.row.amount) }}
            </template>
          </el-table-column>
          <el-table-column
            prop="compareAmount"
            :label="formatDateRange(queryParams.compareStartDate, queryParams.compareEndDate)"
            align="right"
            v-if="queryParams.enableCompare"
          >
            <template #default="scope">
              {{ formatAmount(scope.row.compareAmount) }}
            </template>
          </el-table-column>
          <el-table-column
            label="变动"
            align="right"
            v-if="queryParams.enableCompare"
          >
            <template #default="scope">
              <span :class="getChangeClass(scope.row.amount - scope.row.compareAmount)">
                {{ formatAmount(scope.row.amount - scope.row.compareAmount) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column
            label="变动率(%)"
            align="right"
            v-if="queryParams.enableCompare"
          >
            <template #default="scope">
              <span :class="getChangeClass(scope.row.amount - scope.row.compareAmount)">
                {{ calculateChangeRate(scope.row.amount, scope.row.compareAmount) }}
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 无数据提示 -->
      <div class="empty-tip" v-if="!loading && !reportData.length">
        <el-empty description='请选择报表日期并点击"生成报表"按钮'></el-empty>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ReportHelper } from '@/utils/commonHelpers'

import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { api } from '@/services/api';
import ExcelJS from 'exceljs';
// 查询参数
const queryParams = reactive({
  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), // 默认为当月1日
  endDate: new Date().toISOString().slice(0, 10), // 默认为今天
  enableCompare: false,
  compareStartDate: '',
  compareEndDate: '',
  unit: 1 // 默认单位为元
});

// 报表数据
const reportData = ref([]);
const loading = ref(false);

// 计算金额单位显示文本（使用公共工具函数）
const unitText = computed(() => ReportHelper.getUnitText(queryParams.unit));

// 生成报表
const generateReport = async () => {
  if (!queryParams.startDate || !queryParams.endDate) {
    ElMessage.warning('请选择报表开始和结束日期');
    return;
  }
  
  if (queryParams.enableCompare && (!queryParams.compareStartDate || !queryParams.compareEndDate)) {
    ElMessage.warning('已启用比较，请选择比较期间的开始和结束日期');
    return;
  }
  
  loading.value = true;
  try {
    const response = await api.get('/finance/reports/income-statement', {
      params: {
        startDate: queryParams.startDate,
        endDate: queryParams.endDate,
        compareStartDate: queryParams.enableCompare ? queryParams.compareStartDate : '',
        compareEndDate: queryParams.enableCompare ? queryParams.compareEndDate : '',
        unit: queryParams.unit
      }
    });

    // axios拦截器已经解包了ResponseHandler格式
    // response.data 直接就是业务数据（数组）
    reportData.value = Array.isArray(response.data) ? response.data : [];

    if (reportData.value.length > 0) {
      ElMessage.success('利润表生成成功');
    } else {
      ElMessage.warning('未查询到数据，请检查日期范围');
    }
  } catch (error) {
    console.error('获取利润表数据失败:', error);
    ElMessage.error('获取利润表数据失败: ' + (error.response?.data?.message || error.message));
    reportData.value = [];
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
  // 创建工作簿
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('利润表');

  // 准备报表数据
  const rows = prepareExcelData(reportData.value);

  // 添加标题行
  worksheet.addRow(['利润表', '', '', '', '', '']);
  worksheet.addRow([`报表期间: ${formatDateRange(queryParams.startDate, queryParams.endDate)}`, '', '', '', '', '']);
  worksheet.addRow([`单位: ${unitText.value}`, '', '', '', '', '']);
  worksheet.addRow(['', '', '', '', '', '']);

  // 添加数据行
  rows.forEach(row => {
    worksheet.addRow([row.A, row.B, row.C, row.D, row.E, row.F]);
  });

  // 生成Excel文件并下载
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `利润表_${queryParams.startDate}_${queryParams.endDate}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// 准备Excel数据
const prepareExcelData = (data) => {
  let headerRow = { A: '项目', B: '行次', C: formatDateRange(queryParams.startDate, queryParams.endDate) };
  
  if (queryParams.enableCompare) {
    headerRow.D = formatDateRange(queryParams.compareStartDate, queryParams.compareEndDate);
    headerRow.E = '变动';
    headerRow.F = '变动率(%)';
  }
  
  const rows = [headerRow];
  
  data.forEach(item => {
    let row = {
      A: item.name,
      B: item.rowNum,
      C: formatAmount(item.amount)
    };
    
    if (queryParams.enableCompare) {
      const change = item.amount - item.compareAmount;
      row.D = formatAmount(item.compareAmount);
      row.E = formatAmount(change);
      row.F = calculateChangeRate(item.amount, item.compareAmount);
    }
    
    rows.push(row);
    
    // 处理子项
    if (item.children && item.children.length) {
      item.children.forEach(child => {
        let childRow = {
          A: '  ' + child.name,  // 增加缩进
          B: child.rowNum,
          C: formatAmount(child.amount)
        };
        
        if (queryParams.enableCompare) {
          const childChange = child.amount - child.compareAmount;
          childRow.D = formatAmount(child.compareAmount);
          childRow.E = formatAmount(childChange);
          childRow.F = calculateChangeRate(child.amount, child.compareAmount);
        }
        
        rows.push(childRow);
      });
    }
  });
  
  return rows;
};

// 格式化日期范围
const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '';
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return `${start.getFullYear()}年${start.getMonth() + 1}月${start.getDate()}日 - ${end.getFullYear()}年${end.getMonth() + 1}月${end.getDate()}日`;
};

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

// 计算变动率
const calculateChangeRate = (current, compare) => {
  if (compare === 0 || compare === null || compare === undefined) return 'N/A';
  
  const rate = ((current - compare) / Math.abs(compare)) * 100;
  return rate.toFixed(2) + '%';
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
  color: #666;
}

.report-body {
  margin-top: var(--spacing-lg);
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