<!--
/**
 * OutsourcedReceipts.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="outsourced-receipts-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>外委加工入库管理</h2>
          <p class="subtitle">管理外委加工入库单据</p>
        </div>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" :model="searchForm" class="search-form">
        <el-form-item label="单号搜索">
          <el-input v-model="searchForm.keyword" placeholder="请输入入库单号或加工单号" clearable></el-input>
        </el-form-item>
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
        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch">
            <el-icon><Refresh /></el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

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

    <!-- 外委加工入库单列表 -->
    <el-card class="data-card">
      <el-table
        :data="receiptList"
        border
        style="width: 100%"
        v-loading="loading"
      >
        <el-table-column prop="receipt_no" label="入库单号" min-width="150" />
        <el-table-column prop="processing_no" label="加工单号" min-width="150" />
        <el-table-column prop="receipt_date" label="入库日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.receipt_date) }}
          </template>
        </el-table-column>
        <el-table-column prop="supplier_name" label="加工厂" min-width="180" />
        <el-table-column prop="warehouse_name" label="入库仓库" min-width="120" />
        <el-table-column prop="operator" label="操作员" min-width="100" />
        <el-table-column prop="status" label="状态" min-width="80">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="scope">
            <el-button
              size="small"
              @click="handleViewReceipt(scope.row)"
            >
              查看
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="primary"
              @click="handleEditReceipt(scope.row)"
            >
              编辑
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="success"
              @click="updateReceiptStatus(scope.row, 'confirmed')"
            >
              确认入库
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="danger"
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
import apiAdapter from '@/utils/apiAdapter';
import { formatDate } from '@/utils/helpers/dateUtils'

import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage } from 'element-plus'
import { api } from '@/services/api';
import { Search, Refresh } from '@element-plus/icons-vue'
import ReceiptDialog from './ReceiptDialog.vue';
import { useAuthStore } from '@/stores/auth';
import {
  OUTSOURCED_STATUS_OPTIONS,
  getOutsourcedStatusText,
  getOutsourcedStatusColor
} from '@/constants/systemConstants';

// 权限store
const authStore = useAuthStore();

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
      params.start_date = searchForm.dateRange[0];
      params.end_date = searchForm.dateRange[1];
    }

    const response = await api.get('/purchase/outsourced-receipts', { params });

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
    console.error('获取外委加工入库单列表失败:', error);
    ElMessage.error('获取外委加工入库单列表失败');
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
    await api.put(`/purchase/outsourced-receipts/${row.id}/status`, { status });
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

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
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