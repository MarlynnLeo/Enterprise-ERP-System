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
    <PageHeader title="委外入库管理" subtitle="管理委外入库单据">
      <template #actions>
        <el-button
          type="primary"
          :icon="Plus"
          @click="handleCreateReceipt"
          v-permission="'purchase:processing-receipts:create'"
        >
          新建委外入库单
        </el-button>
      </template>
    </PageHeader>

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
        <div class="stat-value">{{ receiptStats.arrivedCount || 0 }}</div>
        <div class="stat-label">待检验</div>
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
        @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleViewReceipt(row))"
      >
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
        <el-table-column prop="status" label="状态" min-width="90">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="220" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 'pending' && !scope.row.arrivalRequired"
              size="small"
              type="primary"
              @click.stop="handleEditReceipt(scope.row)"
              v-permission="'purchase:processing-receipts:edit'"
            >
              编辑
            </el-button>
            <el-button
              v-if="
                ['pending', 'arrived'].includes(scope.row.status) &&
                scope.row.arrivalRequired
              "
              size="small"
              type="success"
              v-permission="'purchase:processing-receipts:edit'"
              @click.stop="handleArrive(scope.row)"
            >
              {{ scope.row.status === 'arrived' ? '继续到货' : '到货' }}
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending' && !scope.row.arrivalRequired"
              size="small"
              type="success"
              v-permission="'purchase:processing-receipts:edit'"
              @click.stop="updateReceiptStatus(scope.row, 'confirmed')"
            >
              直接入库
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="danger"
              v-permission="'purchase:processing-receipts:edit'"
              @click.stop="updateReceiptStatus(scope.row, 'cancelled')"
            >
              取消
            </el-button>
            <el-button
              v-if="scope.row.status === 'arrived'"
              size="small"
              type="success"
              v-permission="'purchase:processing-receipts:edit'"
              @click.stop="updateReceiptStatus(scope.row, 'confirmed')"
            >
              确认入库
            </el-button>
            <el-button
              v-if="scope.row.status === 'confirmed'"
              size="small"
              type="success"
              v-permission="'purchase:processing-receipts:edit'"
              @click.stop="updateReceiptStatus(scope.row, 'completed')"
            >
              完成入库
            </el-button>
            <el-button
              v-if="['arrived', 'confirmed', 'completed', 'cancelled'].includes(scope.row.status)"
              size="small"
              type="info"
              @click.stop="handleViewReceipt(scope.row)"
            >
              查看
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
      :processing-id="selectedProcessingId"
      :receipt-id="selectedReceiptId"
      @success="fetchReceiptList"
    />

    <!-- 到货并自动生成来料检验单 -->
    <AppDialog
      v-model="arrivalDialogVisible"
      title="确认到货"
      mode="form"
      width="1200px"
      :close-on-click-modal="false"
    >
      <div v-loading="arrivalDialogLoading">
        <el-alert
          title="提示"
          type="info"
          :closable="false"
          class="mb-20"
        >系统会按本次到货数量自动生成来料检验单；检验完成并合格后，才可以确认入库。</el-alert>
        <el-descriptions :column="3" border class="mb-20">
          <el-descriptions-item label="入库单号">{{ arrivalForm.receiptNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="加工单号">{{ arrivalForm.processingNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="加工厂">{{ arrivalForm.supplierName || '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="arrivalForm.items" border class="w-full" max-height="420px">
          <el-table-column type="index" label="序号" width="55" align="center" />
          <el-table-column prop="productCode" label="成品编码" width="130" show-overflow-tooltip />
          <el-table-column prop="productName" label="成品名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="specification" label="规格" min-width="130" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" width="60" align="center" />
          <el-table-column label="应到货" width="85" align="right">
            <template #default="{ row }">{{ formatQuantity(row.expectedQuantity) }}</template>
          </el-table-column>
          <el-table-column label="已到货" width="85" align="right">
            <template #default="{ row }">{{ formatQuantity(row.arrivedQuantity) }}</template>
          </el-table-column>
          <el-table-column label="待到货" width="85" align="right">
            <template #default="{ row }">{{ formatQuantity(row.pendingQuantity) }}</template>
          </el-table-column>
          <el-table-column label="本次到货" width="125" align="center">
            <template #default="{ row }">
              <el-input-number
                v-model="row.receiveQuantity"
                :min="0"
                :max="row.pendingQuantity"
                :precision="2"
                :step="1"
                controls-position="right"
                size="small"
                class="w-full"
                :disabled="row.pendingQuantity <= 0"
                @change="handleArrivalQuantityChange(row)"
              />
            </template>
          </el-table-column>
        </el-table>
        <div class="mt-20 text-right">
          <el-text type="primary" size="large">
            本次到货总数量：{{ formatQuantity(totalArrivalQuantity()) }}
          </el-text>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="arrivalDialogVisible = false">取消</el-button>
          <el-button
            type="primary"
            :loading="arrivalDialogLoading"
            v-permission="'purchase:processing-receipts:edit'"
            @click="confirmArrival"
          >确认到货</el-button>
        </span>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router';
import { handleTableRowView } from '@/utils/tableRowView'
import { formatDate } from '@/utils/helpers/dateUtils'
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index'
import { Plus } from '@element-plus/icons-vue'
import { purchaseApi } from '@/api/purchase';

import ReceiptDialog from './ReceiptDialog.vue';
import {
  OUTSOURCED_STATUS_OPTIONS,
  getOutsourcedStatusText,
  getOutsourcedStatusColor
} from '@/constants/systemConstants';

const route = useRoute();

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
  arrivedCount: 0,
  confirmedCount: 0,
  cancelledCount: 0
});

// 对话框相关状态
const receiptDialogVisible = ref(false);
const receiptDialogMode = ref('view');
const selectedReceiptId = ref(null);
const selectedProcessingId = ref(null);

// 到货对话框
const arrivalDialogVisible = ref(false);
const arrivalDialogLoading = ref(false);
const arrivalForm = reactive({
  receiptId: null,
  receiptNo: '',
  processingNo: '',
  supplierName: '',
  items: []
});

// 新建入库单
const handleCreateReceipt = () => {
  selectedReceiptId.value = null;
  selectedProcessingId.value = null;
  receiptDialogMode.value = 'create';
  receiptDialogVisible.value = true;
};

// 获取入库单列表
const fetchReceiptList = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword,
      supplierName: searchForm.supplierName,
      status: searchForm.status
    };

    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }

    const response = await purchaseApi.outsourcedReceipts.getList(params);

    // 拦截器已解包，response.data 就是业务数据
    const rawList = response.data?.list || response.data || [];
    receiptList.value = (Array.isArray(rawList) ? rawList : []).map((item) => ({
      ...item,
      // 后端 CASE 字段在不同驱动/旧接口中可能是 0/1、字符串或布尔值；
      // 不能直接 Boolean('0')，否则待到货按钮会被错误显示。
      arrivalRequired: ['1', 1, true].includes(item.arrivalRequired ?? item.arrival_required)
    }));

    // 确保分页总数正确设置为数字类型
    if (response.data?.total !== undefined) {
      pagination.total = Number(response.data.total) || 0;
    } else if (receiptList.value.length > 0) {
      pagination.total = receiptList.value.length;
    } else {
      pagination.total = 0;
    }

    // 更新统计数据
    updateStats();
  } catch (error) {
    console.error('获取委外入库列表失败:', error);
    ElMessage.error('获取委外入库列表失败');
  } finally {
    loading.value = false;
  }
};

// 更新统计数据
const updateStats = () => {
  receiptStats.total = pagination.total;
  receiptStats.pendingCount = receiptList.value.filter(item => item.status === 'pending').length;
  receiptStats.arrivedCount = receiptList.value.filter(item => item.status === 'arrived').length;
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

// 查看委外入库单
const handleViewReceipt = (row) => {
  selectedReceiptId.value = row.id;
  selectedProcessingId.value = row.processingId;
  receiptDialogMode.value = 'view';
  receiptDialogVisible.value = true;
};

// 编辑委外入库单
const handleEditReceipt = (row) => {
  selectedReceiptId.value = row.id;
  selectedProcessingId.value = row.processingId;
  receiptDialogMode.value = 'edit';
  receiptDialogVisible.value = true;
};

const formatQuantity = (value) => Number(value || 0).toFixed(2);

const totalArrivalQuantity = () => arrivalForm.items.reduce(
  (sum, item) => sum + Number(item.receiveQuantity || 0),
  0
);

const handleArrivalQuantityChange = (row) => {
  let quantity = Number(row.receiveQuantity || 0);
  if (!Number.isFinite(quantity) || quantity < 0) quantity = 0;
  if (quantity > Number(row.pendingQuantity || 0)) {
    quantity = Number(row.pendingQuantity || 0);
    ElMessage.warning(`到货数量不能超过待到货数量 ${formatQuantity(row.pendingQuantity)}`);
  }
  row.receiveQuantity = Number(quantity.toFixed(4));
};

const handleArrive = async (row) => {
  arrivalDialogVisible.value = true;
  arrivalDialogLoading.value = true;
  try {
    const response = await purchaseApi.outsourcedReceipts.getDetail(row.id);
    const data = response.data || response;
    arrivalForm.receiptId = data.id || row.id;
    arrivalForm.receiptNo = data.receiptNo || row.receiptNo || '';
    arrivalForm.processingNo = data.processingNo || row.processingNo || '';
    arrivalForm.supplierName = data.supplierName || row.supplierName || '';
    arrivalForm.items = (data.items || []).map((item) => {
      const expectedQuantity = Number(item.expectedQuantity || 0);
      const arrivedQuantity = Number(item.actualQuantity || 0);
      const pendingQuantity = Math.max(expectedQuantity - arrivedQuantity, 0);
      return {
        ...item,
        expectedQuantity,
        arrivedQuantity,
        pendingQuantity,
        receiveQuantity: Number(pendingQuantity.toFixed(4))
      };
    });
    if (!arrivalForm.items.some((item) => item.pendingQuantity > 0)) {
      ElMessage.info('该入库单所有成品已全部到货');
      arrivalDialogVisible.value = false;
    }
  } catch (error) {
    console.error('打开到货对话框失败:', error);
    ElMessage.error(`打开到货对话框失败: ${error.response?.data?.message || error.message || '未知错误'}`);
    arrivalDialogVisible.value = false;
  } finally {
    arrivalDialogLoading.value = false;
  }
};

const confirmArrival = async () => {
  const items = arrivalForm.items
    .filter((item) => Number(item.receiveQuantity || 0) > 0)
    .map((item) => ({
      productId: item.productId,
      receiveQuantity: Number(item.receiveQuantity || 0)
    }));
  if (items.length === 0) {
    ElMessage.warning('请至少填写一个成品的到货数量');
    return;
  }

  arrivalDialogLoading.value = true;
  try {
    const response = await purchaseApi.outsourcedReceipts.receiveWithInspection(
      arrivalForm.receiptId,
      items
    );
    const result = response.data || response || {};
    ElMessage.success(`到货成功，已生成 ${result.successCount || 0} 张来料检验单`);
    arrivalDialogVisible.value = false;
    await fetchReceiptList();
  } catch (error) {
    console.error('确认到货失败:', error);
    ElMessage.error(`到货失败: ${error.response?.data?.message || error.message || '未知错误'}`);
  } finally {
    arrivalDialogLoading.value = false;
  }
};

// 更新入库单状态
const updateReceiptStatus = async (row, status) => {
  try {
    await purchaseApi.outsourcedReceipts.updateStatus(row.id, status);
    ElMessage.success('入库单状态更新成功');
    fetchReceiptList();
  } catch (error) {
    console.error('更新入库单状态失败:', error);
    ElMessage.error('更新入库单状态失败: ' + (error.response?.data?.message || error.message));
  }
};

// 页面加载时获取数据
onMounted(() => {
  fetchReceiptList();
  if (route.query.processingId) {
    selectedProcessingId.value = Number(route.query.processingId);
    receiptDialogMode.value = 'create';
    receiptDialogVisible.value = true;
  }
});
</script>

<style scoped>
.statistics-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  flex: 1;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-primary);
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.pagination-container {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
