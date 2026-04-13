<template>
  <div class="cost-ledger-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>成本明细账</h2>
          <p class="subtitle">多维度成本查询与分析</p>
        </div>
      </div>
    </el-card>

    <!-- 筛选条件 -->
    <el-card class="filter-card">
      <el-form :inline="true" class="search-form filter-form" :model="filters">
        <el-form-item label="日期范围">
          <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
                          start-placeholder="开始日期" end-placeholder="结束日期"
                          value-format="YYYY-MM-DD"></el-date-picker>
        </el-form-item>
        <el-form-item label="成本中心">
          <el-select v-model="filters.costCenterId" clearable placeholder="全部">
            <el-option v-for="c in costCenterOptions" :key="c.id" :label="`${c.code} - ${c.name}`" :value="c.id"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select v-model="filters.productId" clearable filterable remote placeholder="搜索产品"
                     :remote-method="searchProducts">
            <el-option v-for="p in productOptions" :key="p.id" :label="`${p.code} - ${p.name}`" :value="p.id"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="success" @click="exportLedger" :loading="exporting">
            <el-icon><Download /></el-icon> 导出Excel
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 标签页 -->
    <el-card class="data-card">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange">
        <!-- 明细列表 -->
        <el-tab-pane label="成本明细" name="detail">
          <el-table :data="ledgerList" border v-loading="loading" @row-click="showDrilldown">
            <el-table-column prop="cost_date" label="日期" width="150"></el-table-column>
            <el-table-column prop="task_code" label="任务编号" width="180">
              <template #default="scope">
                <el-link type="primary">{{ scope.row.task_code }}</el-link>
              </template>
            </el-table-column>
            <el-table-column prop="product_code" label="产品编码" width="130"></el-table-column>
            <el-table-column prop="product_name" label="产品名称" min-width="180"></el-table-column>
            <el-table-column prop="cost_center_name" label="成本中心" width="180">
              <template #default="scope">{{ scope.row.cost_center_name || '-' }}</template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="120" align="right"></el-table-column>
            <el-table-column prop="material_cost" label="材料成本" width="120" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.material_cost) }}</template>
            </el-table-column>
            <el-table-column prop="labor_cost" label="人工成本" width="120" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.labor_cost) }}</template>
            </el-table-column>
            <el-table-column prop="overhead_cost" label="制造费用" width="120" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.overhead_cost) }}</template>
            </el-table-column>
            <el-table-column prop="total_cost" label="总成本" width="160" align="right">
              <template #default="scope">
                <span style="font-weight: bold; color: #409eff;">{{ formatCurrency(scope.row.total_cost) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="unit_cost" label="单位成本" width="130" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.unit_cost) }}</template>
            </el-table-column>
          </el-table>
          <el-pagination 
            v-model:current-page="pagination.page"
            v-model:page-size="pagination.pageSize"
            :total="pagination.total"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            style="margin-top: 15px; justify-content: flex-end;"
            @change="loadLedger"
          ></el-pagination>
        </el-tab-pane>

        <!-- 按产品汇总 -->
        <el-tab-pane label="按产品汇总" name="product">
          <el-table :data="productSummary" border v-loading="summaryLoading" show-summary>
            <el-table-column prop="dimension_code" label="产品编码" width="170"></el-table-column>
            <el-table-column prop="dimension_name" label="产品名称" min-width="300"></el-table-column>
            <el-table-column prop="task_count" label="任务数" width="120" align="center"></el-table-column>
            <el-table-column prop="total_quantity" label="总产量" width="150" align="right"></el-table-column>
            <el-table-column prop="material_cost" label="材料成本" width="180" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.material_cost) }}</template>
            </el-table-column>
            <el-table-column prop="labor_cost" label="人工成本" width="150" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.labor_cost) }}</template>
            </el-table-column>
            <el-table-column prop="overhead_cost" label="制造费用" width="150" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.overhead_cost) }}</template>
            </el-table-column>
            <el-table-column prop="total_cost" label="总成本" width="160" align="right">
              <template #default="scope">
                <span style="font-weight: bold;">{{ formatCurrency(scope.row.total_cost) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="avg_unit_cost" label="平均单位成本" width="160" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.avg_unit_cost) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 按成本中心汇总 -->
        <el-tab-pane label="按成本中心汇总" name="cost_center">
          <el-table :data="costCenterSummary" border v-loading="summaryLoading" show-summary>
            <el-table-column prop="dimension_code" label="成本中心编码" width="200"></el-table-column>
            <el-table-column prop="dimension_name" label="成本中心名称" min-width="300"></el-table-column>
            <el-table-column prop="task_count" label="任务数" width="120" align="center"></el-table-column>
            <el-table-column prop="total_quantity" label="总产量" width="150" align="right"></el-table-column>
            <el-table-column prop="material_cost" label="材料成本" width="180" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.material_cost) }}</template>
            </el-table-column>
            <el-table-column prop="labor_cost" label="人工成本" width="150" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.labor_cost) }}</template>
            </el-table-column>
            <el-table-column prop="overhead_cost" label="制造费用" width="150" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.overhead_cost) }}</template>
            </el-table-column>
            <el-table-column prop="total_cost" label="总成本" width="200" align="right">
              <template #default="scope">
                <span style="font-weight: bold;">{{ formatCurrency(scope.row.total_cost) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 按月份汇总 -->
        <el-tab-pane label="按月份汇总" name="month">
          <el-table :data="monthSummary" border v-loading="summaryLoading" show-summary>
            <el-table-column prop="dimension_name" label="月份" width="200"></el-table-column>
            <el-table-column prop="task_count" label="任务数" width="150" align="center"></el-table-column>
            <el-table-column prop="total_quantity" label="总产量" width="180" align="right"></el-table-column>
            <el-table-column prop="material_cost" label="材料成本" width="200" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.material_cost) }}</template>
            </el-table-column>
            <el-table-column prop="labor_cost" label="人工成本" width="180" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.labor_cost) }}</template>
            </el-table-column>
            <el-table-column prop="overhead_cost" label="制造费用" width="180" align="right">
              <template #default="scope">{{ formatCurrency(scope.row.overhead_cost) }}</template>
            </el-table-column>
            <el-table-column prop="total_cost" label="总成本" min-width="200" align="right">
              <template #default="scope">
                <span style="font-weight: bold;">{{ formatCurrency(scope.row.total_cost) }}</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 钻取详情对话框 -->
    <el-dialog v-model="drilldownVisible" title="成本钻取详情" width="900px">
      <div v-if="drilldownData" v-loading="drilldownLoading">
        <!-- 任务基本信息 -->
        <el-descriptions :column="3" border>
          <el-descriptions-item label="任务编号">{{ drilldownData.task?.code }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ drilldownData.task?.product_name }}</el-descriptions-item>
          <el-descriptions-item label="数量">{{ drilldownData.task?.quantity }}</el-descriptions-item>
          <el-descriptions-item label="成本中心">{{ drilldownData.task?.cost_center_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="总成本">
            <span style="font-weight: bold; color: #409eff;">{{ formatCurrency(drilldownData.task?.actual_cost) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="单位成本">{{ formatCurrency(drilldownData.task?.unit_cost) }}</el-descriptions-item>
        </el-descriptions>

        <!-- 材料消耗明细 -->
        <h4 style="margin: 20px 0 10px;">材料消耗明细</h4>
        <el-table :data="drilldownData.materials" border size="small" max-height="200" style="width: 100%;">
          <el-table-column prop="material_code" label="物料编码" width="150"></el-table-column>
          <el-table-column prop="material_name" label="物料名称" min-width="200"></el-table-column>
          <el-table-column prop="quantity" label="消耗数量" width="120" align="right"></el-table-column>
          <el-table-column prop="unit_cost" label="单价" width="120" align="right">
            <template #default="scope">{{ formatCurrency(scope.row.unit_cost) }}</template>
          </el-table-column>
          <el-table-column prop="total_cost" label="金额" width="130" align="right">
            <template #default="scope">{{ formatCurrency(scope.row.total_cost) }}</template>
          </el-table-column>
        </el-table>

        <!-- 工序工时明细 -->
        <h4 style="margin: 20px 0 10px;">工序工时明细</h4>
        <el-table :data="drilldownData.processes" border size="small" max-height="200" style="width: 100%;">
          <el-table-column prop="process_name" label="工序名称" width="150"></el-table-column>
          <el-table-column label="标准工时" width="120" align="right">
            <template #default="scope">
              {{ formatHours(scope.row.standard_hours) }}
            </template>
          </el-table-column>
          <el-table-column label="实际工时" width="120" align="right">
            <template #default="scope">
              {{ formatHours(scope.row.actual_hours) }}
            </template>
          </el-table-column>
          <el-table-column label="效率率" width="120" align="center">
            <template #default="scope">
              <el-tag v-if="scope.row.efficiency_rate && scope.row.efficiency_rate > 0" 
                      :type="scope.row.efficiency_rate <= 1 ? 'success' : 'danger'" size="small">
                {{ (scope.row.efficiency_rate * 100).toFixed(0) }}%
              </el-tag>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" min-width="100" align="center">
            <template #default="scope">
              <el-tag :type="getStatusType(scope.row.status)" size="small">{{ getStatusText(scope.row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>

        <!-- 关联凭证 -->
        <h4 style="margin: 20px 0 10px;">关联凭证</h4>
        <el-table :data="drilldownData.vouchers" border size="small" max-height="150" style="width: 100%;">
          <el-table-column prop="entry_number" label="凭证号" width="150"></el-table-column>
          <el-table-column prop="description" label="摘要" min-width="200"></el-table-column>
          <el-table-column prop="transaction_type" label="类型" width="120" align="center"></el-table-column>
          <el-table-column prop="entry_date" label="日期" width="120" align="center"></el-table-column>
          <el-table-column prop="total_amount" label="金额" width="130" align="right">
            <template #default="scope">{{ formatCurrency(scope.row.total_amount) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Download } from '@element-plus/icons-vue';
import api from '@/services/api';
import { formatCurrency } from '@/utils/helpers/formatters';

const activeTab = ref('detail');
const loading = ref(false);
const summaryLoading = ref(false);
const drilldownLoading = ref(false);
const drilldownVisible = ref(false);
const exporting = ref(false);

// 筛选条件
const dateRange = ref([]);
const filters = reactive({
  costCenterId: null,
  productId: null
});

// 选项数据
const costCenterOptions = ref([]);
const productOptions = ref([]);

// 明细数据
const ledgerList = ref([]);
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
});

// 汇总数据
const productSummary = ref([]);
const costCenterSummary = ref([]);
const monthSummary = ref([]);

// 钻取数据
const drilldownData = ref(null);

// 加载成本中心选项
const loadCostCenterOptions = async () => {
  try {
    const res = await api.get('/finance/cost-centers/options');
    costCenterOptions.value = res.data?.data || res.data || [];
  } catch (error) {
    console.error('加载成本中心选项失败:', error);
  }
};

// 搜索产品
const searchProducts = async (query) => {
  if (!query || query.length < 2) {
    productOptions.value = [];
    return;
  }
  try {
    const res = await api.get('/baseData/materials', { params: { keyword: query, pageSize: 20 } });
    productOptions.value = res.data?.data?.list || res.data?.list || [];
  } catch (error) {
    console.error('搜索产品失败:', error);
  }
};

// 加载数据
const loadData = () => {
  if (activeTab.value === 'detail') {
    loadLedger();
  } else {
    loadSummary(activeTab.value);
  }
};

// 加载明细
const loadLedger = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      costCenterId: filters.costCenterId,
      productId: filters.productId
    };
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }
    const res = await api.get('/finance/cost-ledger', { params });
    const data = res.data?.data || res.data || {};
    ledgerList.value = data.list || [];
    pagination.total = Number(data.total) || 0;
  } catch (error) {
    console.error('加载成本明细失败:', error);
    ElMessage.error('加载成本明细失败');
  } finally {
    loading.value = false;
  }
};

// 加载汇总
const loadSummary = async (dimension) => {
  summaryLoading.value = true;
  try {
    const params = {
      costCenterId: filters.costCenterId,
      productId: filters.productId
    };
    if (dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0];
      params.endDate = dateRange.value[1];
    }
    const res = await api.get(`/finance/cost-ledger/summary/${dimension}`, { params });
    const data = res.data?.data || res.data || [];

    switch (dimension) {
      case 'product':
        productSummary.value = data;
        break;
      case 'cost_center':
        costCenterSummary.value = data;
        break;
      case 'month':
        monthSummary.value = data;
        break;
    }
  } catch (error) {
    console.error('加载汇总失败:', error);
    ElMessage.error('加载汇总失败');
  } finally {
    summaryLoading.value = false;
  }
};

// 切换标签页
const handleTabChange = (tab) => {
  if (tab === 'detail') {
    loadLedger();
  } else {
    loadSummary(tab);
  }
};

// 显示钻取详情
const showDrilldown = async (row) => {
  drilldownVisible.value = true;
  drilldownLoading.value = true;
  try {
    const res = await api.get(`/finance/cost-ledger/task/${row.task_id}`);
    drilldownData.value = res.data?.data || res.data || null;
  } catch (error) {
    console.error('加载钻取详情失败:', error);
    ElMessage.error('加载钻取详情失败');
  } finally {
    drilldownLoading.value = false;
  }
};

// 重置筛选
const resetFilters = () => {
  dateRange.value = [];
  filters.costCenterId = null;
  filters.productId = null;
  pagination.page = 1;
  loadData();
};

// 导出成本明细
const exportLedger = async () => {
  exporting.value = true;
  try {
    const params = new URLSearchParams();
    if (dateRange.value && dateRange.value.length === 2) {
      params.append('startDate', dateRange.value[0]);
      params.append('endDate', dateRange.value[1]);
    }
    if (filters.costCenterId) params.append('costCenterId', filters.costCenterId);
    if (filters.productId) params.append('productId', filters.productId);

    // 直接下载文件
    const url = `/api/finance-enhancement/cost/export/ledger?${params.toString()}`;
    window.open(url, '_blank');
    ElMessage.success('导出已开始，请查看下载文件');
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error('导出失败');
  } finally {
    exporting.value = false;
  }
};

// 格式化工时
const formatHours = (value) => {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return '-';
  return num.toFixed(2) + ' 小时';
};

// 工序状态类型
const getStatusType = (status) => {
  const map = {
    'pending': 'info',
    'in_progress': 'warning',
    'completed': 'success',
    'warehousing': 'success',
    'paused': 'warning'
  };
  return map[status] || 'info';
};

// 工序状态文本
const getStatusText = (status) => {
  const map = {
    'pending': '待开始',
    'in_progress': '进行中',
    'completed': '已完成',
    'warehousing': '已入库',
    'paused': '暂停'
  };
  return map[status] || status;
};

// 初始化
onMounted(() => {
  loadCostCenterOptions();
  loadLedger();
});
</script>

<style scoped>
.cost-ledger-container { padding: 20px; }
.header-card { margin-bottom: 20px; }
.header-content { display: flex; justify-content: space-between; align-items: center; }
.title-section h2 { margin: 0; font-size: 24px; color: var(--color-text-primary); }
.subtitle { margin: 5px 0 0 0; color: var(--color-text-secondary); font-size: 14px; }
.filter-card { margin-bottom: 20px; }
.filter-form { display: flex; flex-wrap: wrap; gap: 10px; }
.data-card { margin-bottom: 20px; }
</style>
