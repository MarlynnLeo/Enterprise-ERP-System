<template>
  <div class="module-page purchase-history">
    <PageHeader title="采购历史" subtitle="按物料查询历史入库与采购记录" />

    <div class="history-panel">
      <!-- 顶部搜索栏 -->
      <div class="search-bar">
        <FinanceQueryCard
          :model="searchForm"
          :loading="loading"
          @search="handleSearch"
          @reset="resetSearch"
        >
          <template #basic>
          <el-form-item label="零部件名称">
            <el-input
              v-model="searchForm.materialName"
              placeholder="模糊搜索名称"
              clearable
              @keyup.enter="handleSearch"
            >
              <template #prefix><el-icon><Goods /></el-icon></template>
            </el-input>
          </el-form-item>
          </template>
          <template #advanced>
          <el-form-item label="部件编码">
            <el-input
              v-model="searchForm.materialCode"
              placeholder="请输入部件编码"
              clearable
              @keyup.enter="handleSearch"
            >
              <template #prefix><el-icon><Monitor /></el-icon></template>
            </el-input>
          </el-form-item>
          <el-form-item label="入库日期">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              class="history-datepicker"
              @change="handleSearch"
            ></el-date-picker>
          </el-form-item>
          </template>
        </FinanceQueryCard>
      </div>

      <!-- 数据汇总统计 -->
      <div class="stats-overview" v-if="historyList.length > 0">
        <div class="stat-item">
          <span class="label">本页合计金额：</span>
          <span class="value success-text">{{ formatCurrency(currentTotalAmount) }}</span>
        </div>
        <div class="stat-item">
          <span class="label">本页总收货量：</span>
          <span class="value">{{ currentTotalQty.toFixed(2) }}</span>
        </div>
      </div>

      <!-- 核心数据表格 -->
      <div class="table-container">
        <el-table
          v-loading="loading"
          :data="historyList"
          class="history-table"
          stripe
          border
          height="100%"
        >
          <el-table-column prop="receiptDate" label="入库日期" width="120" sortable>
            <template #default="{ row }">
              <span class="muted-text">{{ row.receiptDate }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="receiptNo" label="收货凭证" width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <el-tag size="small" type="info" effect="plain">{{ row.receiptNo }}</el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="supplierName" label="供应商" width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="supplier-text">{{ row.supplierName || '--' }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="materialCode" label="物料编码" width="150" show-overflow-tooltip>
             <template #default="{ row }">
              <span class="material-code">{{ row.materialCode }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="materialName" label="零部件名称" min-width="200" show-overflow-tooltip>
             <template #default="{ row }">
              <strong>{{ row.materialName }}</strong>
            </template>
          </el-table-column>

          <el-table-column prop="quantity" label="收货数量" width="120">
            <template #default="{ row }">
              <el-tag type="success" effect="dark" size="small">{{ row.quantity }} {{ row.unit }}</el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="unitPrice" label="实采单价(元)" width="140">
            <template #default="{ row }">
              <span class="price-highlight">{{ formatCurrency(row.unitPrice) }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="totalAmount" label="总金额(元)" width="140">
            <template #default="{ row }">
              <span class="amount-highlight">{{ formatCurrency(row.totalAmount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页区域 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100, 500]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          class="history-pagination"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Monitor, Goods } from '@element-plus/icons-vue';
import { purchaseApi } from '@/api/purchase';
import { formatCurrency } from '@/utils/format';
import { parsePaginatedData } from '@/utils/responseParser';
const loading = ref(false);
const historyList = ref([]);
const dateRange = ref([]);

const searchForm = reactive({
  materialCode: '',
  materialName: '',
  supplierId: null,
  startDate: '',
  endDate: ''
});

const pagination = reactive({
  page: 1,
  pageSize: 50, // 历史数据通常希望一屏看多条便于分析
  total: 0
});

// 计算当前页面的合计
const currentTotalAmount = computed(() => {
  if (historyList.value.some(item => item.totalAmount === null || item.totalAmount === undefined || item.totalAmount === '')) return null;
  return historyList.value.reduce((sum, item) => sum + parseFloat(item.totalAmount), 0);
});

const currentTotalQty = computed(() => {
  return historyList.value.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
});

// 获取采购历史数据
const fetchHistory = async () => {
  loading.value = true;
  try {
    if (dateRange.value && dateRange.value.length === 2) {
      searchForm.startDate = dateRange.value[0];
      searchForm.endDate = dateRange.value[1];
    } else {
      searchForm.startDate = '';
      searchForm.endDate = '';
    }

    const res = await purchaseApi.getPurchaseHistoryItems({
      page: pagination.page,
      pageSize: pagination.pageSize,
      materialCode: searchForm.materialCode,
      materialName: searchForm.materialName,
      startDate: searchForm.startDate,
      endDate: searchForm.endDate
    });

    const { list, total } = parsePaginatedData(res, { enableLog: false });
    historyList.value = list;
    pagination.total = total || 0;
  } catch (error) {
    console.error('获取采购历史失败:', error);
    ElMessage.error('获取历史记录失败: ' + (error.message || '未知网络错误'));
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  pagination.page = 1;
  fetchHistory();
};

const resetSearch = () => {
  searchForm.materialCode = '';
  searchForm.materialName = '';
  dateRange.value = [];
  handleSearch();
};

const handleSizeChange = (val) => {
  pagination.pageSize = val;
  handleSearch();
};

const handleCurrentChange = (val) => {
  pagination.page = val;
  fetchHistory();
};

onMounted(() => {
  fetchHistory();
});
</script>

<style scoped>
.purchase-history {
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
}

.history-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border-radius: 8px;
  box-shadow: 0 4px 16px color-mix(in srgb, var(--ds-black) 5%, transparent);
  padding: 20px;
  box-sizing: border-box;
}

.search-bar {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.stats-overview {
  display: flex;
  gap: 24px;
  margin-bottom: 12px;
  padding: 10px 16px;
  background: color-mix(in srgb, var(--ds-cyan) 5%, transparent);
  border-radius: 4px;
  border-left: 4px solid var(--shell-accent);
}

.stats-overview .label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.stats-overview .value {
  font-size: 16px;
  font-weight: bold;
}

.success-text {
  color: var(--color-success);
}

.price-highlight {
  font-family: 'Consolas', monospace;
  color: var(--color-warning);
  font-weight: bold;
  font-size: 14px;
}

.amount-highlight {
  font-family: 'Consolas', monospace;
  color: var(--color-danger);
  font-weight: bold;
  font-size: 14px;
}

.material-code {
  font-family: 'Consolas', monospace;
  color: var(--shell-accent-strong);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
}

.muted-text {
  color: var(--el-text-color-secondary);
}

.supplier-text {
  color: var(--shell-accent);
  font-weight: 500;
}

.table-container {
  flex: 1;
  overflow: hidden;
}

.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
