/**
 * useAgingReport.js
 * @description 账龄分析报表通用逻辑 Composable
 * @author ERP开发团队
 * @date 2025-01-27
 * @version 1.0.0
 */

import { ref, reactive, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { DateFormatter, NumberFormatter } from '@/utils/commonHelpers';

/**
 * 账龄分析报表通用逻辑
 * @param {Object} options - 配置选项
 * @param {String} options.reportType - 报表类型 ('ap' | 'ar')
 * @param {Function} options.fetchDataApi - 获取数据的API函数
 * @param {Function} options.fetchDetailsApi - 获取明细的API函数
 * @returns {Object} 报表相关的状态和方法
 */
export function useAgingReport(options = {}) {
  const {
    reportType = 'ap', // 'ap' = 应付账款, 'ar' = 应收账款
    fetchDataApi,
    fetchDetailsApi
  } = options;

  // ==================== 状态管理 ====================
  const loading = ref(false);
  const tableData = ref([]);
  const detailsDialogVisible = ref(false);
  const selectedEntity = ref({}); // 选中的供应商或客户
  const detailsList = ref([]);

  // 搜索表单
  const searchForm = reactive({
    reportDate: new Date().toISOString().slice(0, 10),
    entityType: '', // 供应商类型或客户类型
    entityName: ''  // 供应商名称或客户名称
  });

  // 摘要数据
  const summaryData = reactive({
    totalAmount: 0,
    within30Days: 0,
    days31to60: 0,
    days61to90: 0,
    over90Days: 0,
    currentAmount: 0 // 未逾期金额(仅应收)
  });

  // ==================== 计算属性 ====================
  
  // 安全的数据访问器
  const safeTableData = computed(() => {
    const data = tableData.value;
    if (!data || !Array.isArray(data)) {
      return [];
    }
    return data;
  });

  // 是否有数据
  const hasData = computed(() => {
    try {
      const data = safeTableData.value;
      return Array.isArray(data) && data.length > 0;
    } catch (error) {
      console.error('[hasData计算属性错误]:', error);
      return false;
    }
  });

  // 报表标题
  const reportTitle = computed(() => {
    return reportType === 'ap' ? '应付账款账龄分析' : '应收账款账龄分析';
  });

  // 实体名称字段
  const entityNameField = computed(() => {
    return reportType === 'ap' ? 'supplier_name' : 'customer_name';
  });

  // 实体类型字段
  const entityTypeField = computed(() => {
    return reportType === 'ap' ? 'supplier_type' : 'customer_type';
  });

  // ==================== 格式化函数 ====================
  
  /**
   * 格式化货币
   */
  const formatCurrency = (amount) => {
    return NumberFormatter.toCurrency(amount, '¥', 2);
  };

  /**
   * 格式化金额(不带货币符号)
   */
  const formatAmount = (amount) => {
    if (amount === undefined || amount === null) return '0.00';
    return amount.toLocaleString('zh-CN', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  /**
   * 计算百分比
   */
  const calculatePercent = (value, total) => {
    if (!total || total === 0) return '0.00';
    return ((value / total) * 100).toFixed(2);
  };

  /**
   * 格式化日期
   */
  const formatDate = (date) => {
    return DateFormatter.toDate(date);
  };

  // ==================== 业务逻辑 ====================
  
  /**
   * 生成报表
   */
  const generateReport = async () => {
    if (!searchForm.reportDate) {
      ElMessage.warning('请选择报表日期');
      return;
    }

    if (!fetchDataApi || typeof fetchDataApi !== 'function') {
      ElMessage.error('未配置数据获取API');
      return;
    }

    loading.value = true;
    tableData.value = [];
    
    // 重置摘要数据
    Object.keys(summaryData).forEach(key => {
      summaryData[key] = 0;
    });

    try {
      const params = {
        reportDate: searchForm.reportDate,
        [entityTypeField.value]: searchForm.entityType,
        [entityNameField.value]: searchForm.entityName
      };

      const response = await fetchDataApi(params);
      
      if (response && response.data) {
        const data = response.data;
        
        // 设置表格数据
        tableData.value = Array.isArray(data.details) ? data.details : [];
        
        // 设置摘要数据
        if (data.summary) {
          Object.assign(summaryData, data.summary);
        }
        
        ElMessage.success('报表生成成功');
      } else {
        ElMessage.warning('未获取到数据');
      }
    } catch (error) {
      console.error('[生成报表错误]:', error);
      ElMessage.error(error.message || '生成报表失败');
    } finally {
      loading.value = false;
    }
  };

  /**
   * 查看明细
   */
  const viewDetails = async (row) => {
    if (!fetchDetailsApi || typeof fetchDetailsApi !== 'function') {
      ElMessage.warning('未配置明细获取API');
      return;
    }

    selectedEntity.value = row;
    detailsDialogVisible.value = true;
    
    try {
      const entityId = reportType === 'ap' ? row.supplier_id : row.customer_id;
      const response = await fetchDetailsApi({
        entityId,
        reportDate: searchForm.reportDate
      });
      
      if (response && response.data) {
        detailsList.value = Array.isArray(response.data) ? response.data : [];
      }
    } catch (error) {
      console.error('[获取明细错误]:', error);
      ElMessage.error('获取明细失败');
      detailsList.value = [];
    }
  };

  /**
   * 导出Excel
   */
  const exportToExcel = () => {
    if (!hasData.value) {
      ElMessage.warning('没有可导出的数据');
      return;
    }

    const headers = [
      reportType === 'ap' ? '供应商' : '客户',
      '实体类型',
      '总金额',
      '30天以内',
      '31-60天',
      '61-90天',
      '90天以上',
      '未逾期金额'
    ];
    const rows = safeTableData.value.map((row) => [
      row[entityNameField.value] || '',
      row[entityTypeField.value] || '',
      row.totalAmount ?? row.total_amount ?? 0,
      row.within30Days ?? row.within_30_days ?? 0,
      row.days31to60 ?? row.days_31_to_60 ?? 0,
      row.days61to90 ?? row.days_61_to_90 ?? 0,
      row.over90Days ?? row.over_90_days ?? 0,
      row.currentAmount ?? row.current_amount ?? 0
    ]);

    const escapeCsvValue = (value) => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csvContent = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(','))
      .join('\n');
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${reportTitle.value}-${searchForm.reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    ElMessage.success('导出成功');
  };

  /**
   * 打印报表
   */
  const printReport = () => {
    if (!hasData.value) {
      ElMessage.warning('没有可打印的数据');
      return;
    }
    
    window.print();
  };

  /**
   * 重置搜索
   */
  const resetSearch = () => {
    searchForm.reportDate = new Date().toISOString().slice(0, 10);
    searchForm.entityType = '';
    searchForm.entityName = '';
    tableData.value = [];
    Object.keys(summaryData).forEach(key => {
      summaryData[key] = 0;
    });
  };

  // ==================== 返回 ====================
  return {
    // 状态
    loading,
    tableData,
    safeTableData,
    hasData,
    searchForm,
    summaryData,
    detailsDialogVisible,
    selectedEntity,
    detailsList,
    
    // 计算属性
    reportTitle,
    entityNameField,
    entityTypeField,
    
    // 格式化函数
    formatCurrency,
    formatAmount,
    calculatePercent,
    formatDate,
    
    // 业务方法
    generateReport,
    viewDetails,
    exportToExcel,
    printReport,
    resetSearch
  };
}
