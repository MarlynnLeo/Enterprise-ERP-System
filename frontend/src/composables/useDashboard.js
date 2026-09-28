/**
 * 仪表盘通用组合式函数
 */

import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { cloneDeep, debounce } from 'lodash-es';
import {
  handleDashboardError,
  getDefaultStatistics,
  retryApiCall
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
    immediate = true,
    refreshInterval = 5 * 60 * 1000, // 5分钟
    retryCount = 1,
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
  let disposed = false;
  let requestId = 0;

  /**
   * 加载数据
   */
  const loadData = async (showLoading = true) => {
    if (disposed) return null;
    const request = ++requestId;
    const isCurrent = () => !disposed && request === requestId;
    loading.value = showLoading;
    error.value = null;

    try {
      const data = await retryApiCall(() => isCurrent() ? dataLoader({ isCurrent }) : null, retryCount);
      if (!isCurrent()) return null;

      // 更新统计数据
      Object.assign(statistics, data);
      lastUpdated.value = new Date();

      return data;
    } catch (err) {
      if (!isCurrent()) return null;
      error.value = err;
      // A failed refresh must not replace the last successful snapshot with zeros.
      handleDashboardError(err, dashboardType, statistics, showErrorMessage);
      throw err;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  };

  /**
   * 手动刷新数据
   */
  const refresh = debounce(async () => {
    if (disposed || isRefreshing.value) return;

    isRefreshing.value = true;
    try {
      const data = await loadData(false);
      if (!disposed && data != null) ElMessage.success('数据刷新成功');
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
    if (disposed || !autoRefresh || refreshTimer.value || document.hidden) return;

    refreshTimer.value = setInterval(() => {
      if (!document.hidden) { // 页面可见时才刷新
        loadData(false).catch(() => {});
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
    requestId++;
    loading.value = false;
    Object.keys(statistics).forEach(key => delete statistics[key]);
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
      if (autoRefresh && (!lastUpdated.value || Date.now() - lastUpdated.value.getTime() > refreshInterval)) {
        loadData(false).catch(() => {});
      }
    }
  };

  // 生命周期管理
  onMounted(async () => {
    startAutoRefresh();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    try {
      if (immediate) {
        await loadData();
      }
    } catch {
      // 错误已在loadData中处理
    }
  });

  onUnmounted(() => {
    disposed = true;
    requestId++;
    refresh.cancel();
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
  const chartRequests = new Map();
  let generation = 0;
  let disposed = false;

  /**
   * 销毁图表实例
   * @param {string} chartName - 图表名称
   */
  const destroyChart = (chartName) => {
    chartRequests.set(chartName, (chartRequests.get(chartName) || 0) + 1);
    if (chartInstances[chartName]) {
      chartInstances[chartName].destroy();
      delete chartInstances[chartName];
    }
  };

  /**
   * 销毁所有图表
   */
  const destroyAllCharts = () => {
    generation++;
    Object.keys(chartInstances).forEach(destroyChart);
    chartsReady.value = false;
  };

  /**
   * 初始化图表
   * @param {string} chartName - 图表名称
   * @param {Function} initFunction - 初始化函数
   */
  const initChart = async (chartName, initFunction) => {
    if (disposed) return;
    destroyChart(chartName);
    const request = chartRequests.get(chartName);
    const startedGeneration = generation;
    const isCurrent = () => !disposed && generation === startedGeneration && chartRequests.get(chartName) === request;
    try {
      // 确保DOM已更新
      await nextTick();
      if (!isCurrent()) return;

      // 检查图表容器是否存在
      const chartRef = chartRefs[chartName];
      if (!chartRef?.value) {
        return;
      }

      // 初始化新图表
      const container = chartRef.value;
      const chartInstance = await initFunction({ isCurrent });
      if (!isCurrent() || chartRef.value !== container) {
        chartInstance?.destroy();
        return;
      }
      if (chartInstance) {
        chartInstances[chartName] = chartInstance;
      }
    } catch (error) {
      if (isCurrent()) console.error(`初始化图表 ${chartName} 失败:`, error);
    }
  };

  /**
   * 初始化所有图表
   * @param {Object} chartInitializers - 图表初始化函数映射
   */
  const initAllCharts = async (chartInitializers) => {
    const startedGeneration = generation;
    try {
      const initPromises = Object.entries(chartInitializers).map(
        ([chartName, initFunction]) => initChart(chartName, initFunction)
      );

      await Promise.allSettled(initPromises);
      if (!disposed && generation === startedGeneration) chartsReady.value = true;
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
      const safeLabels = newData.labels ? cloneDeep(newData.labels) : undefined;
      const safeDatasets = newData.datasets ? cloneDeep(newData.datasets) : undefined;

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
    if (disposed) return;
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
    disposed = true;
    resizeCharts.cancel();
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
