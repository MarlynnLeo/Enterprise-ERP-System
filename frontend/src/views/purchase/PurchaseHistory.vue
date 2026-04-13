<template>
  <div class="purchase-history tech-container">
    <div class="tech-card">
      <!-- 顶部搜索栏 -->
      <div class="search-bar">
        <el-form :inline="true" :model="searchForm" class="tech-form">
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

          <el-form-item label="入库日期">
            <el-date-picker
              v-model="dateRange"
              type="daterange"
              range-separator="至"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              value-format="YYYY-MM-DD"
              class="tech-datepicker"
              @change="handleSearch"
            ></el-date-picker>
          </el-form-item>

          <el-form-item>
            <el-button type="primary" class="tech-btn-primary" @click="handleSearch">
              <el-icon><Search /></el-icon> 分析查询
            </el-button>
            <el-button class="tech-btn-plain" @click="resetSearch">
              <el-icon><Refresh /></el-icon> 重置
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 数据汇总统计 -->
      <div class="stats-overview" v-if="historyList.length > 0">
        <div class="stat-item">
          <span class="label">本页合计金额：</span>
          <span class="value success-text">¥ {{ currentTotalAmount.toFixed(2) }}</span>
        </div>
        <div class="stat-item">
          <span class="label">本页总收货量：</span>
          <span class="value tech-text">{{ currentTotalQty.toFixed(2) }}</span>
        </div>
      </div>

      <!-- 核心数据表格 -->
      <div class="table-container">
        <el-table 
          v-loading="loading" 
          :data="historyList" 
          class="tech-table glass-table"
          stripe
          border
          height="100%"
        >
          <el-table-column prop="receipt_date" label="入库日期" width="120" sortable>
            <template #default="{ row }">
              <span class="tech-text-info">{{ row.receipt_date }}</span>
            </template>
          </el-table-column>
          
          <el-table-column prop="receipt_no" label="收货凭证" width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <el-tag size="small" type="info" effect="plain">{{ row.receipt_no }}</el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="supplier_name" label="供应商" width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="tech-text-primary">{{ row.supplier_name || '--' }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="material_code" label="物料编码" width="150" show-overflow-tooltip>
             <template #default="{ row }">
              <span class="tech-code">{{ row.material_code }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="material_name" label="零部件名称" min-width="200" show-overflow-tooltip>
             <template #default="{ row }">
              <strong>{{ row.material_name }}</strong>
            </template>
          </el-table-column>

          <el-table-column prop="quantity" label="收货数量" width="120" align="right">
            <template #default="{ row }">
              <el-tag type="success" effect="dark" size="small">{{ row.quantity }} {{ row.unit }}</el-tag>
            </template>
          </el-table-column>

          <el-table-column prop="unit_price" label="实采单价(元)" width="140" align="right">
            <template #default="{ row }">
              <span class="price-highlight">¥ {{ parseFloat(row.unit_price).toFixed(2) }}</span>
            </template>
          </el-table-column>

          <el-table-column prop="total_amount" label="总金额(元)" width="140" align="right">
            <template #default="{ row }">
              <span class="amount-highlight">¥ {{ parseFloat(row.total_amount || 0).toFixed(2) }}</span>
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
          class="tech-pagination"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Refresh, Monitor, Goods } from '@element-plus/icons-vue';
import { purchaseApi } from '@/api/purchase';

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
  return historyList.value.reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);
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

    // axiosInstance 已经自动解包过 responseData.data
    // 如果存在 res.data.rows 则表明这是标准分页数据
    if (res.data && Array.isArray(res.data.rows)) {
      historyList.value = res.data.rows;
      pagination.total = res.data.total || 0;
    } 
    // 若未被正确拦截且返回原始 Axios 结构包含 data 的场景
    else if (res.data && res.data.data && Array.isArray(res.data.data.rows)) {
      historyList.value = res.data.data.rows;
      pagination.total = res.data.data.total || 0;
    } 
    // 直接返回结果的特殊场景
    else if (Array.isArray(res.rows)) {
      historyList.value = res.rows;
      pagination.total = res.total || 0;
    } else {
      historyList.value = [];
      pagination.total = 0;
    }
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

.tech-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-overlay);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
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
  background: rgba(0, 195, 255, 0.05);
  border-radius: 4px;
  border-left: 4px solid var(--tech-primary);
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

.tech-code {
  font-family: 'Consolas', monospace;
  color: var(--tech-secondary);
  background: rgba(30, 136, 229, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 13px;
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
