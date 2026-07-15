<template>
  <div class="module-page cost-variance-container">
    <!-- 页面标题 -->
    <PageHeader title="成本差异" subtitle="标准成本与实际成本差异对比 / 效率差异分析" />

    <!-- 主要内容区 -->
    <el-card class="data-card">
      <el-tabs v-model="activeTab">
        <!-- 成本差异 -->
        <el-tab-pane label="成本差异" name="cost">
          <!-- 搜索表单 -->
          <div class="search-form-inline">
            <el-input v-model="searchForm.orderNumber" placeholder="生产订单号" clearable class="form-control-180"></el-input>
            <el-input v-model="searchForm.productName" placeholder="产品名称" clearable class="form-control-180"></el-input>
            <el-select v-model="searchForm.varianceType" placeholder="差异类型" clearable class="form-control-130">
              <el-option label="全部" value=""></el-option>
              <el-option label="有利差异" value="favorable"></el-option>
              <el-option label="不利差异" value="unfavorable"></el-option>
            </el-select>
            <el-button type="primary" @click="loadVarianceData">查询</el-button>
            <el-button @click="resetSearch">重置</el-button>
            <el-button v-permission="'finance:cost:export'" type="success" @click="exportVariance" :loading="exporting">
              <el-icon><Download /></el-icon> 导出
            </el-button>
          </div>

          <!-- 数据表格 -->
          <el-table :data="varianceList" border v-loading="loading" class="w-full mt-15">
            <el-table-column prop="order_number" label="生产订单号" width="160"></el-table-column>
            <el-table-column prop="product_name" label="产品名称" min-width="200"></el-table-column>
            <el-table-column prop="quantity" label="数量" width="80"></el-table-column>
            <el-table-column label="标准成本" width="130">
              <template #default="scope">{{ formatCurrency(scope.row.standard_cost) }}</template>
            </el-table-column>
            <el-table-column label="实际成本" width="130">
              <template #default="scope">{{ formatCurrency(scope.row.actual_cost) }}</template>
            </el-table-column>
            <el-table-column label="总差异" width="120">
              <template #default="scope">
                <span :class="(scope.row.total_variance ) >= 0 ? 'text-stock-ok font-weight-700' : 'text-stock-low font-weight-700'">
                  {{ formatCurrency(scope.row.total_variance) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="材料差异" width="120">
              <template #default="scope">
                <span :class="(scope.row.material_variance ) >= 0 ? 'text-stock-ok' : 'text-stock-low'">
                  {{ formatCurrency(scope.row.material_variance) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="人工差异" width="120">
              <template #default="scope">
                <span :class="(scope.row.labor_variance ) >= 0 ? 'text-stock-ok' : 'text-stock-low'">
                  {{ formatCurrency(scope.row.labor_variance) }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="差异率" width="100">
              <template #default="scope">
                <el-tag :type="getVarianceType(scope.row.variance_rate)" size="small">
                  {{ scope.row.variance_rate || 0 }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="90" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button class="btn-op-view" type="primary" size="small" @click="viewDetail(scope.row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-pagination
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :page-sizes="[10, 20, 50]"
            :total="pagination.total"
            layout="total, sizes, prev, pager, next"
            class="pagination-end"
            @change="loadVarianceData"
          />
        </el-tab-pane>

        <!-- 效率差异 -->
        <el-tab-pane label="效率差异" name="efficiency">
          <div class="search-form-inline">
            <el-date-picker v-model="effDateRange" type="daterange" range-separator="至"
                            start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD"
                            class="form-control-280-mr"></el-date-picker>
            <el-select v-model="effCostCenter" placeholder="成本中心" clearable class="form-control-150-mr">
              <el-option v-for="cc in costCenterOptions" :key="cc.id" :label="cc.name" :value="cc.id"></el-option>
            </el-select>
            <el-button type="primary" @click="loadEfficiencyData">查询</el-button>
          </div>

          <!-- 效率差异汇总 -->
          <el-row :gutter="20" class="row-mt-20">
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">标准工时(小时)</div>
                  <div class="stat-value">{{ effSummary.standard_hours.toFixed(2) }}</div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">实际工时(小时)</div>
                  <div class="stat-value">{{ effSummary.actual_hours.toFixed(2) }}</div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">效率差异(小时)</div>
                  <div class="stat-value" :class="(effSummary.efficiency_variance ) >= 0 ? 'text-stock-ok' : 'text-stock-low'">
                    {{ effSummary.efficiency_variance.toFixed(2) }}
                  </div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">效率率</div>
                  <div class="stat-value" :class="(effSummary.efficiency_rate ) >= 100 ? 'text-stock-ok' : 'text-stock-low'">
                    {{ effSummary.efficiency_rate.toFixed(1) }}%
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <!-- 效率差异明细 -->
          <el-table :data="efficiencyList" border v-loading="effLoading" class="w-full mt-md">
            <el-table-column prop="task_code" label="任务编号" width="160"></el-table-column>
            <el-table-column prop="product_name" label="产品" min-width="180"></el-table-column>
            <el-table-column prop="cost_center_name" label="成本中心" width="120"></el-table-column>
            <el-table-column prop="quantity" label="数量" width="80"></el-table-column>
            <el-table-column label="标准工时" width="110">
              <template #default="scope">{{ (scope.row.standard_hours || 0).toFixed(2) }} h</template>
            </el-table-column>
            <el-table-column label="实际工时" width="110">
              <template #default="scope">{{ (scope.row.actual_hours || 0).toFixed(2) }} h</template>
            </el-table-column>
            <el-table-column label="效率差异" width="110">
              <template #default="scope">
                <span :class="(scope.row.efficiency_variance ) >= 0 ? 'text-stock-ok font-weight-700' : 'text-stock-low font-weight-700'">
                  {{ (scope.row.efficiency_variance || 0).toFixed(2) }} h
                </span>
              </template>
            </el-table-column>
            <el-table-column label="效率率" width="100">
              <template #default="scope">
                <el-tag :type="scope.row.efficiency_rate >= 100 ? 'success' : 'danger'" size="small">
                  {{ (scope.row.efficiency_rate || 0).toFixed(0) }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="成本影响" width="120">
              <template #default="scope">
                <span :class="(scope.row.cost_impact ) >= 0 ? 'text-stock-ok' : 'text-stock-low'">
                  {{ formatCurrency(scope.row.cost_impact) }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 产能利用 -->
        <el-tab-pane label="产能利用" name="capacity">
          <div class="search-form-inline">
            <el-date-picker v-model="capDateRange" type="month" placeholder="选择月份" value-format="YYYY-MM"
                            class="form-control-150-mr"></el-date-picker>
            <el-button type="primary" @click="loadCapacityData">查询</el-button>
          </div>

          <!-- 产能利用汇总 -->
          <el-row :gutter="20" class="row-mt-20">
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">标准产能(工时)</div>
                  <div class="stat-value">{{ capacitySummary.standard_capacity.toFixed(0) }}</div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">实际利用(工时)</div>
                  <div class="stat-value">{{ capacitySummary.actual_used.toFixed(0) }}</div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">闲置产能(工时)</div>
                  <div class="stat-value text-muted">{{ capacitySummary.idle_capacity.toFixed(0) }}</div>
                </div>
              </el-card>
            </el-col>
            <el-col :span="6">
              <el-card shadow="hover">
                <div class="stat-card">
                  <div class="stat-title">利用率</div>
                  <div class="stat-value" :class="(capacitySummary.utilization_rate ) >= 80 ? 'text-stock-ok' : 'text-stock-low'">
                    {{ capacitySummary.utilization_rate.toFixed(1) }}%
                  </div>
                </div>
              </el-card>
            </el-col>
          </el-row>

          <!-- 按成本中心的产能利用明细 -->
          <el-table :data="capacityList" border v-loading="capLoading" class="w-full mt-md">
            <el-table-column prop="cost_center_name" label="成本中心" width="150"></el-table-column>
            <el-table-column prop="standard_capacity" label="标准产能(h)" width="130"></el-table-column>
            <el-table-column prop="actual_used" label="实际利用(h)" width="130"></el-table-column>
            <el-table-column prop="idle_capacity" label="闲置产能(h)" width="130"></el-table-column>
            <el-table-column label="利用率" width="140">
              <template #default="scope">
                <el-progress :percentage="Math.min(scope.row.utilization_rate, 100)"
                             :color="scope.row.utilization_rate >= 80 ? 'var(--color-success)' : 'var(--color-danger)'" />
              </template>
            </el-table-column>
            <el-table-column label="闲置成本" width="130">
              <template #default="scope">
                <span class="text-muted">{{ formatCurrency(scope.row.idle_cost) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 差异详情对话框 -->
    <AppDialog
      v-model="detailDialogVisible"
      title="成本差异详情"
      mode="view"
      content-width="wide"
    >
      <div v-if="currentDetail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="生产订单号">{{ currentDetail.order_number }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ currentDetail.product_name }}</el-descriptions-item>
          <el-descriptions-item label="生产数量">{{ currentDetail.quantity }}</el-descriptions-item>
          <el-descriptions-item label="完工日期">{{ currentDetail.completion_date }}</el-descriptions-item>
        </el-descriptions>

        <el-divider>成本对比</el-divider>

        <el-table :data="currentDetail.comparison" border size="small">
          <el-table-column prop="item" label="成本项目" width="150"></el-table-column>
          <el-table-column label="标准成本" width="150">
            <template #default="scope">{{ formatCurrency(scope.row.standard) }}</template>
          </el-table-column>
          <el-table-column label="实际成本" width="150">
            <template #default="scope">{{ formatCurrency(scope.row.actual) }}</template>
          </el-table-column>
          <el-table-column label="差异金额" width="150">
            <template #default="scope">
              <span :class="(scope.row.variance ) >= 0 ? 'text-stock-ok font-weight-700' : 'text-stock-low font-weight-700'">
                {{ formatCurrency(scope.row.variance) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="差异率" width="120">
            <template #default="scope">
              <el-tag :type="getVarianceType(scope.row.variance_rate)">{{ scope.row.variance_rate }}%</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="差异性质" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.variance >= 0 ? 'success' : 'danger'">
                {{ scope.row.variance >= 0 ? '有利' : '不利' }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import { financeApi } from '@/api';
import { buildApiUrl } from '@/config/app';
import { formatLocalMonth } from '@/utils/format';
import { formatCurrency } from '@/utils/helpers/formatters';
import { parsePaginatedData, parseResponseData } from '@/utils/responseParser'

const activeTab = ref('cost');
const loading = ref(false);
const effLoading = ref(false);
const capLoading = ref(false);
const detailDialogVisible = ref(false);
const exporting = ref(false);

// 搜索表单
const searchForm = reactive({
  orderNumber: '',
  productName: '',
  varianceType: ''
});

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

// 数据列表
const varianceList = ref([]);
const currentDetail = ref(null);

// 效率差异数据
const effDateRange = ref([]);
const effCostCenter = ref(null);
const costCenterOptions = ref([]);
const efficiencyList = ref([]);
const effSummary = reactive({
  standard_hours: 0,
  actual_hours: 0,
  efficiency_variance: 0,
  efficiency_rate: 100
});

// 产能利用数据
const capDateRange = ref(formatLocalMonth(new Date()));
const capacityList = ref([]);
const capacitySummary = reactive({
  standard_capacity: 0,
  actual_used: 0,
  idle_capacity: 0,
  utilization_rate: 0
});

// 获取差异类型
const getVarianceType = (rate) => {
  const absRate = Math.abs(rate || 0);
  if (absRate <= 5) return 'success';
  if (absRate <= 10) return 'warning';
  return 'danger';
};

// 加载成本中心选项
const loadCostCenterOptions = async () => {
  try {
    const res = await financeApi.cost.getCostCenterOptions();
    costCenterOptions.value = parseResponseData(res, []);
  } catch {
    costCenterOptions.value = [];
  }
};

// 加载差异数据
const loadVarianceData = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize
    };
    if (searchForm.orderNumber) params.orderNumber = searchForm.orderNumber;
    if (searchForm.productName) params.productName = searchForm.productName;
    if (searchForm.varianceType) params.varianceType = searchForm.varianceType;

    const res = await financeApi.cost.getVariance(params);
    const { list, total } = parsePaginatedData(res, { enableLog: false });
    varianceList.value = list;
    pagination.total = Number(total) || 0;
  } catch (error) {
    console.error('加载差异数据失败:', error);
    ElMessage.error('加载差异数据失败');
    varianceList.value = [];
  } finally {
    loading.value = false;
  }
};

// 加载效率差异数据
const loadEfficiencyData = async () => {
  effLoading.value = true;
  try {
    const params = {};
    if (effDateRange.value && effDateRange.value.length === 2) {
      params.startDate = effDateRange.value[0];
      params.endDate = effDateRange.value[1];
    }
    if (effCostCenter.value) params.costCenterId = effCostCenter.value;

    const res = await financeApi.cost.getEfficiencyVariance(params);
    const data = parseResponseData(res, {});
    efficiencyList.value = data.list || [];

    // 计算汇总
    let stdTotal = 0, actTotal = 0;
    efficiencyList.value.forEach(r => {
      stdTotal += r.standard_hours || 0;
      actTotal += r.actual_hours || 0;
    });
    effSummary.standard_hours = stdTotal;
    effSummary.actual_hours = actTotal;
    effSummary.efficiency_variance = stdTotal - actTotal;
    effSummary.efficiency_rate = actTotal > 0 ? (stdTotal / actTotal * 100) : 100;
  } catch (error) {
    console.error('加载效率差异失败:', error);
    // 接口失败时保持空数据，避免展示虚构业务指标
    efficiencyList.value = [];
    Object.assign(effSummary, { standard_hours: 0, actual_hours: 0, efficiency_variance: 0, efficiency_rate: 100 });
  } finally {
    effLoading.value = false;
  }
};

// 加载产能利用数据
const loadCapacityData = async () => {
  capLoading.value = true;
  try {
    const params = { month: capDateRange.value };
    const res = await financeApi.cost.getCapacityUtilization(params);
    const data = parseResponseData(res, {});
    capacityList.value = data.list || [];

    // 计算汇总
    let stdCap = 0, actUsed = 0;
    capacityList.value.forEach(r => {
      stdCap += r.standard_capacity || 0;
      actUsed += r.actual_used || 0;
    });
    capacitySummary.standard_capacity = stdCap;
    capacitySummary.actual_used = actUsed;
    capacitySummary.idle_capacity = stdCap - actUsed;
    capacitySummary.utilization_rate = stdCap > 0 ? (actUsed / stdCap * 100) : 0;
  } catch (error) {
    console.error('加载产能利用失败:', error);
    capacityList.value = [];
    Object.assign(capacitySummary, { standard_capacity: 0, actual_used: 0, idle_capacity: 0, utilization_rate: 0 });
  } finally {
    capLoading.value = false;
  }
};

// 查看详情
const viewDetail = async (row) => {
  try {
    const taskId = row.id;
    const res = await financeApi.cost.getVarianceDetail(taskId);
    if (res.data) {
      currentDetail.value = parseResponseData(res);
    } else {
      currentDetail.value = row;
    }
  } catch (error) {
    console.error('获取详情失败:', error);
    currentDetail.value = {
      ...row,
      comparison: [
        { item: '材料成本', standard: 0, actual: 0, variance: row.material_variance, variance_rate: 0 },
        { item: '人工成本', standard: 0, actual: 0, variance: row.labor_variance, variance_rate: 0 },
        { item: '制造费用', standard: 0, actual: 0, variance: row.overhead_variance, variance_rate: 0 },
        { item: '总成本', standard: row.standard_cost, actual: row.actual_cost, variance: row.total_variance, variance_rate: row.variance_rate }
      ]
    };
  }
  detailDialogVisible.value = true;
};

// 重置搜索
const resetSearch = () => {
  searchForm.orderNumber = '';
  searchForm.productName = '';
  searchForm.varianceType = '';
  loadVarianceData();
};

// 导出成本差异
const exportVariance = async () => {
  exporting.value = true;
  try {
    const params = new URLSearchParams();
    if (searchForm.varianceType) params.append('varianceType', searchForm.varianceType);

    // 直接下载文件
    const query = params.toString();
    const url = buildApiUrl(`/finance/cost/export/variance${query ? `?${query}` : ''}`);
    window.open(url, '_blank');
    ElMessage.success('导出已开始，请查看下载文件');
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error('导出失败');
  } finally {
    exporting.value = false;
  }
};

// 页面加载时初始化
onMounted(() => {
  loadVarianceData();
  loadCostCenterOptions();
});
</script>

<style scoped>
.cost-variance-container { padding: 20px; }
.header-card { margin-bottom: 20px; }
.title-section h2 { margin: 0; font-size: 24px; color: var(--color-text-primary); }
.subtitle { margin: 5px 0 0 0; color: var(--color-text-secondary); font-size: 14px; }
.data-card { margin-bottom: 20px; }
.search-form-inline { display: flex; align-items: center; flex-wrap: wrap; }
.stat-card { text-align: center; padding: 10px; }
.stat-title { font-size: 14px; color: var(--color-text-secondary); margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: bold; color: var(--color-text-primary); }
</style>
