/**
 * 仪表盘通用组合式函数
 */

import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { 
  handleDashboardError, 
  getDefaultStatistics, 
  retryApiCall,
  debounce 
} from '@/utils/dashboardUtils';

/**
 * 仪表盘数据管理
 * @param {string} dashboardType - 仪表盘类型
 * @param {Function} dataLoader - 数据加载函数
 * @param {Object} options - 配置选项
 */
export function useDashboard(dashboardType, dataLoader, options = {}) {
  const {
    autoRefresh = true,
    refreshInterval = 5 * 60 * 1000, // 5分钟
    retryCount = 3,
    showErrorMessage = true
  } = options;

  // 响应式数据
  const loading = ref(false);
  const error = ref(null);
  const lastUpdated = ref(null);
  const statistics = reactive(getDefaultStatistics(dashboardType));
  
  // 刷新相关
  const refreshTimer = ref(null);
  const isRefreshing = ref(false);

  /**
   * 加载数据
   */
  const loadData = async (showLoading = true) => {
    if (showLoading) {
      loading.value = true;
    }
    error.value = null;

    try {
      const data = await retryApiCall(dataLoader, retryCount);
      
      // 更新统计数据
      Object.assign(statistics, data);
      lastUpdated.value = new Date();
      
      return data;
    } catch (err) {
      error.value = err;
      const fallbackData = getDefaultStatistics(dashboardType);
      Object.assign(statistics, fallbackData);
      
      handleDashboardError(err, dashboardType, fallbackData, showErrorMessage);
      throw err;
    } finally {
      loading.value = false;
    }
  };

  /**
   * 手动刷新数据
   */
  const refresh = debounce(async () => {
    if (isRefreshing.value) return;
    
    isRefreshing.value = true;
    try {
      await loadData(false);
      ElMessage.success('数据刷新成功');
    } catch {
      // 错误已在loadData中处理
    } finally {
      isRefreshing.value = false;
    }
  }, 1000);

  /**
   * 启动自动刷新
   */
  const startAutoRefresh = () => {
    if (!autoRefresh || refreshTimer.value) return;
    
    refreshTimer.value = setInterval(() => {
      if (!document.hidden) { // 页面可见时才刷新
        loadData(false);
      }
    }, refreshInterval);
  };

  /**
   * 停止自动刷新
   */
  const stopAutoRefresh = () => {
    if (refreshTimer.value) {
      clearInterval(refreshTimer.value);
      refreshTimer.value = null;
    }
  };

  /**
   * 重置数据
   */
  const reset = () => {
    Object.assign(statistics, getDefaultStatistics(dashboardType));
    error.value = null;
    lastUpdated.value = null;
  };

  // 页面可见性变化处理
  const handleVisibilityChange = () => {
    if (document.hidden) {
      stopAutoRefresh();
    } else {
      startAutoRefresh();
      // 页面重新可见时刷新数据
      if (lastUpdated.value && Date.now() - lastUpdated.value.getTime() > refreshInterval) {
        loadData(false);
      }
    }
  };

  // 生命周期管理
  onMounted(async () => {
    try {
      await loadData();
      startAutoRefresh();
      
      // 监听页面可见性变化
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch {
      // 错误已在loadData中处理
    }
  });

  onUnmounted(() => {
    stopAutoRefresh();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  });

  return {
    // 数据
    loading,
    error,
    statistics,
    lastUpdated,
    isRefreshing,
    
    // 方法
    loadData,
    refresh,
    reset,
    startAutoRefresh,
    stopAutoRefresh
  };
}

/**
 * 图表管理
 * @param {Object} chartRefs - 图表引用对象
 */
export function useCharts(chartRefs = {}) {
  // 使用非响应式对象存储Chart实例，避免Vue Proxy与Chart.js循环引用引发的栈溢出
  const chartInstances = {};
  const chartsReady = ref(false);

  /**
   * 销毁图表实例
   * @param {string} chartName - 图表名称
   */
  const destroyChart = (chartName) => {
    if (chartInstances[chartName]) {
      chartInstances[chartName].destroy();
      delete chartInstances[chartName];
    }
  };

  /**
   * 销毁所有图表
   */
  const destroyAllCharts = () => {
    Object.keys(chartInstances).forEach(destroyChart);
    chartsReady.value = false;
  };

  /**
   * 初始化图表
   * @param {string} chartName - 图表名称
   * @param {Function} initFunction - 初始化函数
   */
  const initChart = async (chartName, initFunction) => {
    try {
      // 确保DOM已更新
      await nextTick();
      
      // 销毁现有图表
      destroyChart(chartName);
      
      // 检查图表容器是否存在
      const chartRef = chartRefs[chartName];
      if (!chartRef?.value) {
        return;
      }

      // 初始化新图表
      const chartInstance = await initFunction();
      if (chartInstance) {
        chartInstances[chartName] = chartInstance;
      }
    } catch (error) {
      console.error(`初始化图表 ${chartName} 失败:`, error);
    }
  };

  /**
   * 初始化所有图表
   * @param {Object} chartInitializers - 图表初始化函数映射
   */
  const initAllCharts = async (chartInitializers) => {
    try {
      const initPromises = Object.entries(chartInitializers).map(
        ([chartName, initFunction]) => initChart(chartName, initFunction)
      );
      
      await Promise.allSettled(initPromises);
      chartsReady.value = true;
    } catch (error) {
      console.error('初始化图表失败:', error);
    }
  };

  /**
   * 更新图表数据
   * @param {string} chartName - 图表名称
   * @param {Object} newData - 新数据
   */
  const updateChart = (chartName, newData) => {
    const chart = chartInstances[chartName];
    if (!chart) return;

    try {
      // 深拷贝，防止Vue响应式Proxy传入Chart.js导致递归
      const safeLabels = newData.labels ? JSON.parse(JSON.stringify(newData.labels)) : undefined;
      const safeDatasets = newData.datasets ? JSON.parse(JSON.stringify(newData.datasets)) : undefined;

      if (safeLabels) {
        chart.data.labels = safeLabels;
      }

      if (safeDatasets) {
        chart.data.datasets = safeDatasets;
      }

      // 重新渲染
      chart.update('active');
    } catch (error) {
      console.error(`更新图表 ${chartName} 失败:`, error);
    }
  };

  /**
   * 调整图表大小
   */
  const resizeCharts = debounce(() => {
    Object.values(chartInstances).forEach(chart => {
      if (chart && typeof chart.resize === 'function') {
        chart.resize();
      }
    });
  }, 300);

  // 监听窗口大小变化
  onMounted(() => {
    window.addEventListener('resize', resizeCharts);
  });

  onUnmounted(() => {
    window.removeEventListener('resize', resizeCharts);
    destroyAllCharts();
  });

  return {
    // 数据
    chartInstances,
    chartsReady,
    
    // 方法
    initChart,
    initAllCharts,
    updateChart,
    destroyChart,
    destroyAllCharts,
    resizeCharts
  };
}

/**
 * 数据过滤和搜索
 * @param {Array} dataSource - 数据源
 * @param {Object} options - 配置选项
 */
export function useDataFilter(dataSource, options = {}) {
  const {
    searchFields = ['name'],
    pageSize = 10
  } = options;

  const searchKeyword = ref('');
  const currentPage = ref(1);
  const sortField = ref('');
  const sortOrder = ref('');

  /**
   * 过滤数据
   */
  const filteredData = computed(() => {
    let result = [...dataSource.value];

    // 搜索过滤
    if (searchKeyword.value) {
      const keyword = searchKeyword.value.toLowerCase();
      result = result.filter(item => 
        searchFields.some(field => 
          String(item[field] || '').toLowerCase().includes(keyword)
        )
      );
    }

    // 排序
    if (sortField.value) {
      result.sort((a, b) => {
        const aVal = a[sortField.value];
        const bVal = b[sortField.value];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder.value === 'desc' ? bVal - aVal : aVal - bVal;
        }
        
        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortOrder.value === 'desc' 
          ? bStr.localeCompare(aStr)
          : aStr.localeCompare(bStr);
      });
    }

    return result;
  });

  /**
   * 分页数据
   */
  const paginatedData = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    const end = start + pageSize;
    return filteredData.value.slice(start, end);
  });

  /**
   * 总页数
   */
  const totalPages = computed(() => {
    return Math.ceil(filteredData.value.length / pageSize);
  });

  /**
   * 设置搜索关键词
   */
  const setSearchKeyword = debounce((keyword) => {
    searchKeyword.value = keyword;
    currentPage.value = 1; // 重置到第一页
  }, 300);

  /**
   * 设置排序
   */
  const setSort = (field, order = 'asc') => {
    sortField.value = field;
    sortOrder.value = order;
  };

  /**
   * 重置过滤条件
   */
  const resetFilter = () => {
    searchKeyword.value = '';
    currentPage.value = 1;
    sortField.value = '';
    sortOrder.value = '';
  };

  return {
    // 数据
    searchKeyword,
    currentPage,
    sortField,
    sortOrder,
    filteredData,
    paginatedData,
    totalPages,
    
    // 方法
    setSearchKeyword,
    setSort,
    resetFilter
  };
}
