<!--
/**
 * OutsourcedReceipts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page outsourced-receipts-container">
    <PageHeader title="委外入库管理" subtitle="管理委外入库单据" />

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input v-model="searchForm.keyword" placeholder="物料名称" clearable></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="供应商">
          <el-input v-model="searchForm.supplierName" placeholder="请输入供应商名称" clearable></el-input>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option
              v-for="item in statusOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"

          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.total || 0 }}</div>
        <div class="stat-label">入库单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.pendingCount || 0 }}</div>
        <div class="stat-label">待确认</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ receiptStats.confirmedCount || 0 }}</div>
        <div class="stat-label">已确认</div>
      </el-card>
    </div>

    <!-- 委外入库单列表 -->
    <el-card class="data-card">
      <el-table
        :data="receiptList"
        border
        class="table-row-click w-full"
        v-loading="loading"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleViewReceipt(row))">
        <el-table-column prop="receiptNo" label="入库单号" min-width="150" />
        <el-table-column prop="processingNo" label="加工单号" min-width="150" />
        <el-table-column prop="receiptDate" label="入库日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.receiptDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="supplierName" label="加工厂" min-width="180" />
        <el-table-column prop="warehouseName" label="入库仓库" min-width="120" />
        <el-table-column prop="operator" label="操作员" min-width="100" />
        <el-table-column prop="status" label="状态" min-width="80">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="primary"
              @click="handleEditReceipt(scope.row)"

              v-permission="'purchase:processing-receipts:edit'">
              编辑
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="success"
              v-permission="'purchase:processing-receipts:edit'"
              @click="updateReceiptStatus(scope.row, 'confirmed')"
            >
              确认入库
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="danger"
              v-permission="'purchase:processing-receipts:edit'"
              @click="updateReceiptStatus(scope.row, 'cancelled')"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
          :hide-on-single-page="false"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        ></el-pagination>
      </div>
    </el-card>

    <!-- 入库单对话框 -->
    <ReceiptDialog
      v-model:visible="receiptDialogVisible"
      :mode="receiptDialogMode"
      :receipt-id="selectedReceiptId"
      @success="fetchReceiptList"
    />
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { formatDate } from '@/utils/helpers/dateUtils'
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus'
import { purchaseApi } from '@/api/purchase';

import ReceiptDialog from './ReceiptDialog.vue';
import {
  OUTSOURCED_STATUS_OPTIONS,
  getOutsourcedStatusText,
  getOutsourcedStatusColor
} from '@/constants/systemConstants';

// 状态选项（使用统一常量）
const statusOptions = OUTSOURCED_STATUS_OPTIONS;

// 获取状态类型（使用统一常量）
const getStatusType = (status) => {
  return getOutsourcedStatusColor(status);
};

// 获取状态标签（使用统一常量）
const getStatusLabel = (status) => {
  return getOutsourcedStatusText(status);
};

// 格式化日期
// formatDate 已统一引用公共实现;

// 搜索表单
const searchForm = reactive({
  keyword: '',
  supplierName: '',
  status: '',
  dateRange: []
});

// 入库单列表数据
const receiptList = ref([]);
const loading = ref(false);

// 分页数据
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
});

// 统计数据
const receiptStats = reactive({
  total: 0,
  pendingCount: 0,
  confirmedCount: 0,
  cancelledCount: 0
});

// 对话框相关状态
const receiptDialogVisible = ref(false);
const receiptDialogMode = ref('view');
const selectedReceiptId = ref(null);

// 获取入库单列表
const fetchReceiptList = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword,
      supplier_name: searchForm.supplierName,
      status: searchForm.status
    };

    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }

    const response = await purchaseApi.outsourcedReceipts.getList(params);

    // 拦截器已解包，response.data 就是业务数据
    receiptList.value = response.data?.list || response.data || [];

    // 确保分页总数正确设置为数字类型
    if (response.data?.total !== undefined) {
      pagination.total = Number(response.data.total) || 0;
    } else if (receiptList.value.length > 0) {
      // 如果API没有返回total，则使用数据长度作为备用
      pagination.total = receiptList.value.length;
    } else {
      // 没有数据时设置为0
      pagination.total = 0;
    }

    // 更新统计数据
    updateStats();
  } catch (error) {
    console.error('获取委外入库单列表失败:', error);
    ElMessage.error('获取委外入库单列表失败');
  } finally {
    loading.value = false;
  }
};

// 更新统计数据
const updateStats = () => {
  // 实际应用中这应该通过API获取或从列表数据计算
  receiptStats.total = pagination.total;
  receiptStats.pendingCount = receiptList.value.filter(item => item.status === 'pending').length;
  receiptStats.confirmedCount = receiptList.value.filter(item => item.status === 'confirmed').length;
  receiptStats.cancelledCount = receiptList.value.filter(item => item.status === 'cancelled').length;
};

// 搜索处理
const handleSearch = () => {
  pagination.page = 1;
  fetchReceiptList();
};

// 重置搜索
const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    if (key === 'dateRange') {
      searchForm[key] = [];
    } else {
      searchForm[key] = '';
    }
  });
  pagination.page = 1;
  fetchReceiptList();
};

// 分页处理
const handleSizeChange = (val) => {
  pagination.pageSize = val;
  fetchReceiptList();
};

const handleCurrentChange = (val) => {
  pagination.page = val;
  fetchReceiptList();
};

// 更新入库单状态
const updateReceiptStatus = async (row, status) => {
  try {
    await purchaseApi.outsourcedReceipts.updateStatus(row.id, status);
    ElMessage.success(`状态更新成功`);
    fetchReceiptList();
  } catch (error) {
    console.error('状态更新失败:', error);
    ElMessage.error('状态更新失败: ' + (error.response?.data?.message || error.message));
  }
};

// 查看入库单
const handleViewReceipt = (row) => {
  selectedReceiptId.value = row.id;
  receiptDialogMode.value = 'view';
  receiptDialogVisible.value = true;
};

// 编辑入库单
const handleEditReceipt = (row) => {
  selectedReceiptId.value = row.id;
  receiptDialogMode.value = 'edit';
  receiptDialogVisible.value = true;
};

// 页面加载时获取数据
onMounted(() => {
  fetchReceiptList();
});
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
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

.search-form {
  display: flex;
  flex-wrap: wrap;
}

/* 统计卡片 */

/* 操作按钮样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}


@media (max-width: 768px) {
  .statistics-row {
    flex-direction: column;
  }

  .stat-card {
    margin-bottom: 10px;
    width: 100%;
  }
}
</style>
