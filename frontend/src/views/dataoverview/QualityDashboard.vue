<!--
/**
 * QualityDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page overview-page quality-dashboard">
    <PageHeader title="质量数据概览" subtitle="检验批次、合格率与不良分析" />

    <!-- 统计卡片 -->
    <el-row :gutter="16" class="stats-row" v-loading="statisticsLoading">
      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card primary-card" shadow="hover">
          <div class="stat-value">{{ statistics.incoming?.total || 0 }}</div>
          <div class="stat-label">来料检验</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.incoming?.passRate || '0%' }}</span>
            <span class="stat-secondary-label">合格率</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-value">{{ statistics.process?.total || 0 }}</div>
          <div class="stat-label">过程检验</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.process?.passRate || '0%' }}</span>
            <span class="stat-secondary-label">合格率</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-value">{{ statistics.final?.total || 0 }}</div>
          <div class="stat-label">成品检验</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.final?.passRate || '0%' }}</span>
            <span class="stat-secondary-label">合格率</span>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-value">{{ statistics.defects?.total || 0 }}</div>
          <div class="stat-label">不良品分析</div>
          <div class="stat-secondary">
            <span class="stat-secondary-value">{{ statistics.defects?.types || 0 }}</span>
            <span class="stat-secondary-label">不良类型</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="16" class="mt-md">
      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>各阶段检验合格率趋势</span>
              <el-radio-group v-model="timeRange" size="small">
                <el-radio-button value="6">近6月</el-radio-button>
                <el-radio-button value="12">近12月</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container" v-loading="passRateLoading">
            <EmptyState v-if="passRateMessage" :description="passRateMessage" />
            <canvas v-else ref="passRateChart"></canvas>
          </div>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span>不良原因分类</span>
            </div>
          </template>
          <div class="chart-container" v-loading="defectTypeLoading">
            <EmptyState v-if="defectTypeMessage" :description="defectTypeMessage" />
            <canvas v-else ref="defectTypeChart"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近不合格项目 -->
    <el-row class="mt-lg">
      <el-col :span="24">
        <el-card class="dashboard-card" shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>最近不合格项目</span>
              <el-input
                v-model="search"
                placeholder="搜索"
                class="search-input"
                :prefix-icon="Search"
              />
            </div>
          </template>
          <el-table
            :data="defectItems"
            class="table-row-click w-full"
            v-loading="loading"
            border
            :empty-text="
              defectError
                ? '不合格项目加载失败，请稍后重试'
                : search.trim()
                  ? '没有匹配的数据'
                  : '暂无不合格项目'
            "
            @row-click="
              (row, column, event) =>
                handleTableRowView(row, column, event, () => viewInspection(row))
            "
          >
            <el-table-column label="检验单号" prop="inspectionNo" min-width="120" />
            <el-table-column label="检验类型" min-width="100">
              <template #default="scope">
                <el-tag :type="getInspectionTypeColor(scope.row.inspectionType)">
                  {{ getInspectionTypeText(scope.row.inspectionType) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="产品名称" prop="materialName" min-width="120" />
            <el-table-column label="物料编码" prop="materialCode" min-width="120" />
            <el-table-column label="检验日期" min-width="120">
              <template #default="scope">
                {{ formatDate(scope.row.inspectionDate) }}
              </template>
            </el-table-column>
            <el-table-column label="不良数量" prop="defectQty" min-width="100" />
            <el-table-column label="不良原因" prop="defectReason" min-width="150" />
            <el-table-column label="处理结果" min-width="100">
              <template #default="scope">
                <el-tag :type="getProcessResultColor(scope.row.processResult)">
                  {{ scope.row.processResult }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-container" v-if="pagination.total > 0">
            <el-pagination
              v-model:current-page="pagination.current"
              v-model:page-size="pagination.pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="pagination.total"
              @size-change="handleSizeChange"
              @current-change="handleCurrentChange"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { getQualityInspectionTypeText } from '@/constants/systemConstants';
import { handleTableRowView } from '@/utils/tableRowView';
import { formatDate } from '@/utils/helpers/dateUtils';

import { ref, nextTick, onMounted, onBeforeUnmount, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import Chart from '@/utils/chartCore';
import { ElMessage } from 'element-plus/es/components/message/index';
import { Search } from '@element-plus/icons-vue';
import { qualityApi } from '@/api';
import { usePaginatedFetching } from '@/composables/useDataFetching';
import { createLineChartConfig, createPieChartConfig, chartColors } from '@/utils/chartConfig';
import { alphaColor, getCssTokenValue } from '@/utils/designTokens';

// 权限计算属性
const router = useRouter();

// 图表实例引用
const passRateChart = ref(null);
const defectTypeChart = ref(null);
let passRateChartInstance = null;
let defectTypeChartInstance = null;
let passRateRequest = 0;
let disposed = false;

// 图表配置
const timeRange = ref('6');
const passRateLoading = ref(false);
const defectTypeLoading = ref(false);
const passRateMessage = ref('');
const defectTypeMessage = ref('');

// 统计数据
const statisticsLoading = ref(false);
const statistics = reactive({
  incoming: { total: 0, passRate: '0%' },
  process: { total: 0, passRate: '0%' },
  final: { total: 0, passRate: '0%' },
  defects: { total: 0, types: 0 },
});

// 不良项目数据
const search = ref('');
const {
  data: defectItems,
  loading,
  error: defectError,
  pagination,
  fetchData: loadDefectItems,
  updateParams,
  handleSizeChange,
  handlePageChange: handleCurrentChange,
} = usePaginatedFetching((params) => qualityApi.getDefectItems(params), {
  errorMessage: '获取不合格项目失败',
});

watch(search, (value, _previous, onCleanup) => {
  const timer = setTimeout(() => {
    updateParams({ keyword: value.trim() || undefined, page: 1 });
    loadDefectItems();
  }, 300);
  onCleanup(() => clearTimeout(timer));
});

// 获取检验类型文本
function getInspectionTypeText(type) {
  return getQualityInspectionTypeText(type) || type;
}

// 获取检验类型颜色
function getInspectionTypeColor(type) {
  const colorMap = {
    incoming: 'primary',
    process: 'success',
    final: 'info',
    first_article: 'warning',
  };
  return colorMap[type] || 'info';
}

// 获取处理结果颜色
function getProcessResultColor(result) {
  const colorMap = {
    返工: 'warning',
    报废: 'danger',
    让步接收: 'info',
    特采: 'success',
  };
  return colorMap[result] || 'info';
}

// 查看检验详情
function viewInspection(item) {
  const routeMap = {
    incoming: '/quality/incoming',
    process: '/quality/process',
    final: '/quality/final',
    first_article: '/quality/first-article',
  };

  const route = routeMap[item.inspectionType] || '/quality';
  router.push(`${route}?id=${item.id}`);
}

// 生命周期钩子
onBeforeUnmount(() => {
  disposed = true;
  if (passRateChartInstance) {
    passRateChartInstance.destroy();
    passRateChartInstance = null;
  }
  if (defectTypeChartInstance) {
    defectTypeChartInstance.destroy();
    defectTypeChartInstance = null;
  }
});

onMounted(() => {
  loadStatistics();
  loadDefectItems();
  initPassRateChart();
  initDefectTypeChart();
});

// 各区域独立加载，避免一个请求失败清空其他区域的数据。
async function loadStatistics() {
  statisticsLoading.value = true;
  try {
    // 拦截器解包业务响应后仍保留 AxiosResponse，业务数据在 response.data。
    const { data } = await qualityApi.getQualityStatistics();
    if (disposed) return;

    if (data) {
      // 更新统计数据
      statistics.incoming = {
        total: data.incoming?.total || 0,
        passRate: data.incoming?.passRate || '0%',
      };
      statistics.process = {
        total: data.process?.total || 0,
        passRate: data.process?.passRate || '0%',
      };
      statistics.final = {
        total: data.final?.total || 0,
        passRate: data.final?.passRate || '0%',
      };
      statistics.defects = {
        total: data.defects?.total || 0,
        types: data.defects?.types || 0,
      };
    }
  } catch (error) {
    if (disposed) return;
    console.error('获取质量统计数据失败:', error);
    ElMessage.error('获取质量统计数据失败，请稍后重试');
  } finally {
    if (!disposed) statisticsLoading.value = false;
  }
}

// 初始化合格率趋势图表
async function initPassRateChart() {
  const request = ++passRateRequest;
  const isCurrent = () => !disposed && request === passRateRequest;
  passRateLoading.value = true;
  passRateMessage.value = '';
  try {
    const monthCount = Number(timeRange.value) || 6;
    const { data } = await qualityApi.getQualityTrends({ months: monthCount });
    if (!isCurrent()) return;

    const now = new Date();
    const monthKeys = Array.from({ length: monthCount }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - monthCount + index + 1, 1);
      return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
    });
    const trendMap = new Map();
    for (const trend of data?.trends || []) {
      trendMap.set(
        `${trend.month}:${trend.inspectionType}`,
        trend.total > 0 ? (trend.passed / trend.total) * 100 : null
      );
    }
    const seriesFor = (type) => monthKeys.map((month) => trendMap.get(`${month}:${type}`) ?? null);
    const incomingData = seriesFor('incoming');
    const processData = seriesFor('process');
    const finalData = seriesFor('final');

    passRateChartInstance?.destroy();
    passRateChartInstance = null;
    if (![...incomingData, ...processData, ...finalData].some((value) => value !== null)) {
      passRateMessage.value = '所选时段暂无检验数据';
      return;
    }
    await nextTick();
    if (!isCurrent() || !passRateChart.value) return;

    const config = createLineChartConfig({
      yAxisFormatter: function (value) {
        return value + '%';
      },
      tooltipFormatter: function (context) {
        let label = context.dataset.label || '';
        if (label) {
          label += ': ';
        }
        label += context.raw == null ? '-' : `${Number(context.raw).toFixed(2)}%`;
        return label;
      },
    });
    config.scales.y.min = 0;
    config.scales.y.max = 100;
    // 单个月份有记录时也显示数据点，缺失月份仍保持断线。
    config.elements.point.radius = 3;

    passRateChartInstance = new Chart(passRateChart.value.getContext('2d'), {
      type: 'line',
      data: {
        labels: monthKeys,
        datasets: [
          {
            label: '来料检验',
            data: incomingData,
            borderColor: chartColors.primary[0],
            backgroundColor: alphaColor('primary', 0.1),
            borderWidth: 2,
            ...config.elements.line,
            fill: false,
          },
          {
            label: '过程检验',
            data: processData,
            borderColor: chartColors.success[0],
            backgroundColor: alphaColor('success', 0.1),
            borderWidth: 2,
            ...config.elements.line,
            fill: false,
          },
          {
            label: '成品检验',
            data: finalData,
            borderColor: chartColors.warning[0],
            backgroundColor: alphaColor('warning', 0.1),
            borderWidth: 2,
            ...config.elements.line,
            fill: false,
          },
        ],
      },
      options: config,
    });
  } catch (error) {
    if (!isCurrent()) return;
    passRateChartInstance?.destroy();
    passRateChartInstance = null;
    console.error('初始化合格率趋势图表失败:', error);
    passRateMessage.value = '合格率趋势加载失败，请稍后重试';
    ElMessage.error(passRateMessage.value);
  } finally {
    if (isCurrent()) passRateLoading.value = false;
  }
}

// 初始化不良原因分类图表
async function initDefectTypeChart() {
  defectTypeLoading.value = true;
  defectTypeMessage.value = '';
  try {
    const { data } = await qualityApi.getQualityTrends({ months: 6 });
    if (disposed) return;
    const defectTypes = data?.defectTypes || [];
    defectTypeChartInstance?.destroy();
    defectTypeChartInstance = null;
    if (defectTypes.length === 0) {
      defectTypeMessage.value = '近6个月暂无不良原因记录';
      return;
    }
    await nextTick();
    if (disposed || !defectTypeChart.value) return;

    // 颜色配置重置为新版科幻组合
    const backgroundColors = [
      chartColors.primary[0],
      chartColors.success[0],
      chartColors.warning[0],
      chartColors.primary[2],
      chartColors.danger[0],
      chartColors.info[0],
    ];

    const config = createPieChartConfig({
      tooltipFormatter: function (context) {
        const label = context.label || '';
        const value = context.raw || 0;
        const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
        const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
        return `${label}: ${value}个 (${percentage}%)`;
      },
    });

    defectTypeChartInstance = new Chart(defectTypeChart.value.getContext('2d'), {
      type: 'pie',
      data: {
        labels: defectTypes.map((item) => item.defectType || '未知'),
        datasets: [
          {
            data: defectTypes.map((item) => Number(item.count) || 0),
            backgroundColor: backgroundColors,
            borderWidth: config.elements?.arc?.borderWidth || 2,
            borderColor: config.elements?.arc?.borderColor || getCssTokenValue('surface'),
          },
        ],
      },
      options: config,
    });
  } catch (error) {
    if (disposed) return;
    defectTypeChartInstance?.destroy();
    defectTypeChartInstance = null;
    console.error('初始化不良原因分类图表失败:', error);
    defectTypeMessage.value = '不良原因分类加载失败，请稍后重试';
    ElMessage.error(defectTypeMessage.value);
  } finally {
    if (!disposed) defectTypeLoading.value = false;
  }
}

// 监听时间范围变化，更新图表
watch(timeRange, () => {
  initPassRateChart();
});
</script>

<style scoped>
.text-muted {
  color: var(--color-text-secondary);
  font-size: 12px;
}

/* 响应式调整 */

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
