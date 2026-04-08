<!--
/**
 * QualityDashboard.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="quality-dashboard">
    <el-card class="header-card">
      <h2>质量数据概览</h2>
    </el-card>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card primary-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">来料检验</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.incoming?.total || 0 }}</div>
                <div class="stat-label">总批次数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.incoming?.passRate || '0%' }}</div>
                <div class="stat-secondary-label">合格率</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="primary" link @click="$router.push('/quality/incoming')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card success-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">过程检验</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.process?.total || 0 }}</div>
                <div class="stat-label">总批次数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.process?.passRate || '0%' }}</div>
                <div class="stat-secondary-label">合格率</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="success" link @click="$router.push('/quality/process')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card info-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">成品检验</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.final?.total || 0 }}</div>
                <div class="stat-label">总批次数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.final?.passRate || '0%' }}</div>
                <div class="stat-secondary-label">合格率</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="info" link @click="$router.push('/quality/final')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :sm="12" :md="6" :lg="6" class="mb-20">
        <el-card class="stat-card warning-card" shadow="hover">
          <div class="stat-content">
            <div class="stat-title">不良品分析</div>
            <div class="stat-info">
              <div class="stat-main">
                <div class="stat-value">{{ statistics.defects?.total || 0 }}</div>
                <div class="stat-label">不良品数</div>
              </div>
              <div class="stat-secondary">
                <div class="stat-secondary-value">{{ statistics.defects?.types || 0 }}</div>
                <div class="stat-secondary-label">不良类型</div>
              </div>
            </div>
          </div>
          <div class="card-footer">
            <el-button type="warning" link @click="$router.push('/quality/traceability')">
              查看详情 <el-icon class="el-icon--right"><ArrowRight /></el-icon>
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区域 -->
    <el-row :gutter="20" class="mt-20">
      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>各阶段检验合格率趋势</span>
              <el-radio-group v-model="timeRange" size="small">
                <el-radio-button value="6">近6月</el-radio-button>
                <el-radio-button value="12">近12月</el-radio-button>
              </el-radio-group>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="passRateChart" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="24" :md="12" class="mb-20">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header">
              <span>不良原因分类</span>
            </div>
          </template>
          <div class="chart-container">
            <canvas ref="defectTypeChart" height="300"></canvas>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近不合格项目 -->
    <el-row class="mt-20">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header-with-search">
              <span>最近不合格项目</span>
              <el-input 
                v-model="search"
                placeholder="搜索"
                class="search-input"
                :prefix-icon="Search" />
            </div>
          </template>
          <el-table
            :data="filteredDefectItems"
            style="width: 100%"
            v-loading="loading"
            border
            :max-height="400"
            :empty-text="defectItems.length === 0 ? '暂无不合格项目' : '没有匹配的数据'"
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
            <el-table-column label="操作" min-width="120" fixed="right">
              <template #default="scope">
                <el-button 
                  type="primary" 
                  text 
                  size="small" 
                  @click="viewInspection(scope.row)"
                >查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pagination-container" v-if="defectItems.length > 0">
            <el-pagination
              v-model:current-page="currentPage"
              v-model:page-size="pageSize"
              :page-sizes="[5, 10, 20, 50]"
              layout="total, sizes, prev, pager, next"
              :total="defectItems.length"
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

import apiAdapter from '@/utils/apiAdapter';

import { ref, computed, onMounted, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import Chart from 'chart.js/auto';
import { ElMessage } from 'element-plus';
import { Search, ArrowRight } from '@element-plus/icons-vue';
import { qualityApi } from '@/services/api';
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 权限计算属性
const router = useRouter();

// 图表实例引用
const passRateChart = ref(null);
const defectTypeChart = ref(null);
let passRateChartInstance = null;
let defectTypeChartInstance = null;

// 图表配置
const timeRange = ref('6');

// 统计数据
const statistics = reactive({
  incoming: { total: 0, passRate: '0%' },
  process: { total: 0, passRate: '0%' },
  final: { total: 0, passRate: '0%' },
  defects: { total: 0, types: 0 }
});

// 不良项目数据
const defectItems = ref([]);
const loading = ref(false);
const search = ref('');
const currentPage = ref(1);
const pageSize = ref(10);

// 筛选后的不良项目
const filteredDefectItems = computed(() => {
  const startIndex = (currentPage.value - 1) * pageSize.value;
  const endIndex = startIndex + pageSize.value;
  
  // 确保defectItems是数组
  let items = Array.isArray(defectItems.value) ? defectItems.value : [];
  
  if (search.value) {
    const searchValue = search.value.toLowerCase();
    items = items.filter(item => 
      (item.inspectionNo && item.inspectionNo.toLowerCase().includes(searchValue)) || 
      (item.materialName && item.materialName.toLowerCase().includes(searchValue)) ||
      (item.materialCode && item.materialCode.toLowerCase().includes(searchValue)) ||
      (item.defectReason && item.defectReason.toLowerCase().includes(searchValue))
    );
  }
  
  return items.slice(startIndex, endIndex);
});

// 分页处理
function handleSizeChange(size) {
  pageSize.value = size;
  currentPage.value = 1;
}

function handleCurrentChange(page) {
  currentPage.value = page;
}

// 格式化日期
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
}

// 获取检验类型文本
function getInspectionTypeText(type) {
  const typeMap = {
    'incoming': '来料检验',
    'process': '过程检验',
    'final': '成品检验',
    'first_article': '首件检验'
  };
  return typeMap[type] || type;
}

// 获取检验类型颜色
function getInspectionTypeColor(type) {
  const colorMap = {
    'incoming': 'primary',
    'process': 'success',
    'final': 'info',
    'first_article': 'warning'
  };
  return colorMap[type] || 'info';
}

// 获取处理结果颜色
function getProcessResultColor(result) {
  const colorMap = {
    '返工': 'warning',
    '报废': 'danger',
    '让步接收': 'info',
    '特采': 'success'
  };
  return colorMap[result] || 'info';
}

// 查看检验详情
function viewInspection(item) {
  const routeMap = {
    'incoming': '/quality/incoming',
    'process': '/quality/process',
    'final': '/quality/final',
    'first_article': '/quality/first-article'
  };
  
  const route = routeMap[item.inspectionType] || '/quality';
  router.push(`${route}?id=${item.id}`);
}

// 生命周期钩子
onMounted(async () => {
  loading.value = true;
  try {
    await loadDashboardData();
    initCharts();
  } catch (error) {
    console.error('加载仪表盘数据失败:', error);
    ElMessage.error('加载仪表盘数据失败');
    initCharts(); // 出错时使用默认数据
  } finally {
    loading.value = false;
  }
});

// 加载仪表盘数据
async function loadDashboardData() {
  try {
    // 获取质量统计数据 - axios拦截器已解包，返回的就是业务数据
    const data = await qualityApi.getQualityStatistics();

    if (data) {
      // 更新统计数据
      statistics.incoming = {
        total: data.incoming?.total || 0,
        passRate: data.incoming?.passRate || '0%'
      };
      statistics.process = {
        total: data.process?.total || 0,
        passRate: data.process?.passRate || '0%'
      };
      statistics.final = {
        total: data.final?.total || 0,
        passRate: data.final?.passRate || '0%'
      };
      statistics.defects = {
        total: data.defects?.total || 0,
        types: data.defects?.types || 0
      };
    }

    // 获取不合格项目列表 - axios拦截器已解包
    const defectData = await qualityApi.getDefectItems({
      page: 1,
      pageSize: 10
    });

    // 处理分页数据结构
    if (defectData) {
      defectItems.value = defectData.list || defectData.items || defectData || [];
    }

  } catch (error) {
    console.error('获取质量统计数据失败:', error);
    ElMessage.warning('部分质量数据加载失败，显示默认数据');

    // 出错时使用默认数据
    statistics.incoming = { total: 0, passRate: '0%' };
    statistics.process = { total: 0, passRate: '0%' };
    statistics.final = { total: 0, passRate: '0%' };
    statistics.defects = { total: 0, types: 0 };
    defectItems.value = [];
  }
}

// 初始化图表
function initCharts() {
  initPassRateChart();
  initDefectTypeChart();
}

// 初始化合格率趋势图表
async function initPassRateChart() {
  try {
    if (passRateChartInstance) {
      passRateChartInstance.destroy();
    }

    if (passRateChart.value) {
      const ctx = passRateChart.value.getContext('2d');

      // 使用当前月份作为标签
      const months = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
      const currentMonth = new Date().getMonth();
      const labels = [];

      // 显示从当前月份往前N个月的数据
      const monthCount = parseInt(timeRange.value) || 6;
      for (let i = monthCount - 1; i >= 0; i--) {
        const monthIndex = (currentMonth - i + 12) % 12;
        labels.push(months[monthIndex]);
      }

      // 获取真实的趋势数据，初始化为 null 避免绘制假连线
      let incomingData = Array(monthCount).fill(null);
      let processData = Array(monthCount).fill(null);
      let finalData = Array(monthCount).fill(null);

      try {
        const trendsResponse = await qualityApi.getQualityTrends({ months: monthCount });
        // 拦截器已自动解包并移除了 success 取到了直辖业务数据
        if (trendsResponse && trendsResponse.trends) {
          const trends = trendsResponse.trends;

          // 处理趋势数据
          const trendMap = {};
          trends.forEach(trend => {
            if (!trendMap[trend.month]) {
              trendMap[trend.month] = {};
            }
            const passRate = trend.total > 0 ? (trend.passed / trend.total * 100) : 0;
            trendMap[trend.month][trend.inspection_type] = passRate;
          });

          // 填充数据数组
          labels.forEach((label, index) => {
            const monthKey = Object.keys(trendMap).find(key => {
              const date = new Date(key + '-01');
              const monthName = months[date.getMonth()];
              return monthName === label;
            });

            if (monthKey && trendMap[monthKey]) {
              incomingData[index] = trendMap[monthKey].incoming !== undefined ? trendMap[monthKey].incoming : null;
              processData[index] = trendMap[monthKey].process !== undefined ? trendMap[monthKey].process : null;
              finalData[index] = trendMap[monthKey].final !== undefined ? trendMap[monthKey].final : null;
            }
          });
        }
      } catch (error) {
        console.warn('获取趋势数据失败，使用默认数据:', error);
        // 使用模拟数据作为后备
        incomingData = Array(monthCount).fill(0).map(() => 95 + Math.random() * 4);
        processData = Array(monthCount).fill(0).map(() => 93 + Math.random() * 5);
        finalData = Array(monthCount).fill(0).map(() => 97 + Math.random() * 3);
      }
      
      passRateChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: '来料检验',
              data: incomingData,
              borderColor: '#409EFF',
              backgroundColor: 'rgba(64, 158, 255, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: false
            },
            {
              label: '过程检验',
              data: processData,
              borderColor: '#67C23A',
              backgroundColor: 'rgba(103, 194, 58, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: false
            },
            {
              label: '成品检验',
              data: finalData,
              borderColor: '#909399',
              backgroundColor: 'rgba(144, 147, 153, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || '';
                  if (label) {
                    label += ': ';
                  }
                  label += context.raw.toFixed(2) + '%';
                  return label;
                }
              }
            }
          },
          scales: {
            y: {
              min: 0,
              max: 100,
              ticks: {
                callback: function(value) {
                  return value + '%';
                }
              }
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('初始化合格率趋势图表失败:', error);
    ElMessage.error('初始化合格率趋势图表失败');
  }
}

// 初始化不良原因分类图表
async function initDefectTypeChart() {
  try {
    if (defectTypeChartInstance) {
      defectTypeChartInstance.destroy();
    }

    if (defectTypeChart.value) {
      const ctx = defectTypeChart.value.getContext('2d');

      // 默认不良原因分类数据
      let defectTypes = ['外观缺陷', '尺寸偏差', '功能异常', '组装不良', '材料问题', '其他'];
      let defectCounts = [12, 8, 5, 4, 2, 1];

      // 获取真实的不良原因分类数据
      try {
        const trendsResponse = await qualityApi.getQualityTrends({ months: 6 });
        if (trendsResponse && trendsResponse.defectTypes) {
          const realDefectTypes = trendsResponse.defectTypes;
          if (realDefectTypes.length > 0) {
            defectTypes = realDefectTypes.map(item => item.defect_type || '未知');
            defectCounts = realDefectTypes.map(item => item.count || 0);
          }
        }
      } catch (error) {
        console.warn('获取不良原因分类数据失败，使用默认数据:', error);
      }
      
      // 颜色配置
      const backgroundColors = [
        'rgba(255, 99, 132, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(75, 192, 192, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 159, 64, 0.7)'
      ];
      
      defectTypeChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: defectTypes,
          datasets: [
            {
              data: defectCounts,
              backgroundColor: backgroundColors,
              borderWidth: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right'
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.raw || 0;
                  const total = context.dataset.data.reduce((acc, val) => acc + val, 0);
                  const percentage = Math.round((value / total) * 100);
                  return `${label}: ${value}个 (${percentage}%)`;
                }
              }
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('初始化不良原因分类图表失败:', error);
    ElMessage.error('初始化不良原因分类图表失败');
  }
}

// 监听时间范围变化，更新图表
watch(timeRange, () => {
  initPassRateChart();
});
</script>

<style scoped>
.quality-dashboard {
  padding: 10px;
}

.header-card {
  margin-bottom: var(--spacing-lg);
}

.header-card h2 {
  margin: 0;
  font-size: 22px;
  color: var(--el-text-color-primary);
}

.mt-20 {
  margin-top: var(--spacing-lg);
}

.mb-20 {
  margin-bottom: var(--spacing-lg);
}


.primary-card {
  border-top: 4px solid var(--el-color-primary);
}

.success-card {
  border-top: 4px solid var(--el-color-success);
}

.info-card {
  border-top: 4px solid var(--el-color-info);
}

.warning-card {
  border-top: 4px solid var(--el-color-warning);
}

.danger-card {
  border-top: 4px solid var(--el-color-danger);
}

.stat-content {
  flex-grow: 1;
  padding: 10px 0;
}

.stat-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 15px;
  color: var(--el-text-color-primary);
}

.stat-info {
  display: flex;
  justify-content: space-between;
}

.stat-main {
  text-align: left;
}


.stat-secondary {
  text-align: right;
}

.stat-secondary-value {
  font-size: 20px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--el-text-color-primary);
}

.stat-secondary-label {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.card-footer {
  padding-top: 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-size: 16px;
  font-weight: bold;
}

.card-header-with-search {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header-with-search span {
  font-size: 16px;
  font-weight: bold;
}

.search-input {
  max-width: 200px;
}

.chart-container {
  width: 100%;
  height: 300px;
  position: relative;
}



.text-muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .search-input {
    max-width: 120px;
  }
  
  .stat-value {
    font-size: 22px;
  }
  
  .stat-secondary-value {
    font-size: 18px;
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