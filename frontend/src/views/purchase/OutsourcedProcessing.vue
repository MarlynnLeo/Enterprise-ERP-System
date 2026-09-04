<!--
/**
 * OutsourcedProcessing.vue
 * @description 委外加工管理前端组件
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page outsourced-processing-container">
    <PageHeader title="委外加工管理" subtitle="管理委外加工单据">
      <template #actions>
        <el-button
          type="primary"
          :icon="Plus"
          @click="handleAddProcessing"
          v-permission="'purchase:processing:create'"
        >
          新建委外加工单
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
        <el-form-item label="关键字">
          <el-input v-model="searchForm.keyword" placeholder="加工单号/物料名称" clearable />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="加工厂">
          <el-input v-model="searchForm.supplierName" placeholder="请输入加工厂名称" clearable />
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

    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ processingStats.total || 0 }}</div>
        <div class="stat-label">加工单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ processingStats.pendingCount || 0 }}</div>
        <div class="stat-label">待出库</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ processingStats.inProgressCount || 0 }}</div>
        <div class="stat-label">加工中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ processingStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ processingStats.cancelledCount || 0 }}</div>
        <div class="stat-label">已取消</div>
      </el-card>
    </div>

    <!-- 委外加工单列表 -->
    <el-card class="data-card">
      <el-table
        :data="processingList"
        border
        class="table-row-click w-full"
        v-loading="loading"
        @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleViewProcessing(row))"
      >
        <el-table-column prop="processingNo" label="加工单号" min-width="150" />
        <el-table-column prop="processingDate" label="创建日期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.processingDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="supplierName" label="加工厂" min-width="180" />
        <el-table-column prop="expectedDeliveryDate" label="预计交期" min-width="120">
          <template #default="{ row }">
            {{ formatDate(row.expectedDeliveryDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="加工费" min-width="120">
          <template #default="scope">
            {{ formatPrice(scope.row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="180" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="primary"
              @click.stop="handleEditProcessing(scope.row)"
              v-permission="'purchase:processing:update'"
            >
              编辑
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="success"
              v-permission="'purchase:processing:update'"
              @click.stop="handleOutboundIssue(scope.row)"
            >
              发料出库
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="danger"
              @click.stop="handleDeleteProcessing(scope.row)"
              v-permission="'purchase:processing:delete'"
            >
              删除
            </el-button>
            <el-button
              v-if="['in_progress', 'confirmed', 'completed', 'cancelled'].includes(scope.row.status)"
              size="small"
              type="info"
              @click.stop="handleViewProcessing(scope.row)"
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
        />
      </div>
    </el-card>

    <!-- 委外加工单详情查看对话框（纯展示，无输入控件） -->
    <AppDialog
      v-model="viewDialogVisible"
      title="委外加工单详情"
      mode="view"
      width="850px"
    >
      <div v-loading="viewDialogLoading" class="processing-view">
        <el-descriptions border :column="2" class="purchase-view-desc">
          <el-descriptions-item label="加工单号">{{ viewData.processingNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建日期">{{ formatDate(viewData.processingDate) }}</el-descriptions-item>
          <el-descriptions-item label="加工厂">{{ viewData.supplierName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="预计交期">{{ formatDate(viewData.expectedDeliveryDate) }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ viewData.contactPerson || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ viewData.contactPhone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(viewData.status)">{{ getStatusLabel(viewData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="加工总金额">
            <span class="total-amount-highlight">{{ formatPrice(viewData.totalAmount) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ viewData.remarks || '无' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="center">发料物料明细</el-divider>
        <el-table :data="viewData.materials || []" border class="w-full">
          <el-table-column type="index" width="60" label="序号" />
          <el-table-column prop="materialCode" label="物料编码" min-width="120" />
          <el-table-column prop="materialName" label="物料名称" min-width="140" />
          <el-table-column prop="specification" label="规格" min-width="150" />
          <el-table-column prop="unit" label="单位" width="70" />
          <el-table-column prop="quantity" label="数量" width="70">
            <template #default="{ row }">
              {{ row.quantity }}
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="150" />
        </el-table>

        <el-divider content-position="center">加工成品明细</el-divider>
        <el-table :data="viewData.products || []" border class="w-full">
          <el-table-column type="index" width="60" label="序号" />
          <el-table-column prop="productCode" label="成品编码" min-width="120" />
          <el-table-column prop="productName" label="成品名称" min-width="150" />
          <el-table-column prop="specification" label="规格" min-width="120" />
          <el-table-column prop="unit" label="单位" width="60" />
          <el-table-column prop="quantity" label="数量" width="60">
            <template #default="{ row }">
              {{ row.quantity }}
            </template>
          </el-table-column>
          <el-table-column prop="unitPrice" label="单价" width="70">
            <template #default="{ row }">
              {{ formatPrice(row.unitPrice) }}
            </template>
          </el-table-column>
          <el-table-column prop="totalPrice" label="金额" width="70">
            <template #default="{ row }">
              {{ formatPrice(row.totalPrice) }}
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="150" />
        </el-table>

        <div class="view-total-section">
          <span class="total-label">加工总金额：</span>
          <span class="total-value">{{ formatPrice(viewData.totalAmount) }}</span>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </AppDialog>

    <!-- 委外加工单新建/编辑对话框 -->
    <AppDialog
      v-model="processingDialogVisible"
      :title="processingDialogMode === 'create' ? '新建委外加工单' : '编辑委外加工单'"
      mode="form"
      width="850px"
      :before-close="handleCloseProcessingDialog"
    >
      <div v-loading="processingDialogLoading">
        <el-form ref="processingFormRef" :model="processingForm" :rules="processingRules" label-width="100px" class="form-container">
          <!-- 基本信息 -->
          <el-card class="data-card">
            <template #header>
              <div class="card-header">
                <span>基本信息</span>
              </div>
            </template>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="加工日期" prop="processingDate">
                  <el-date-picker
                    v-model="processingForm.processingDate"
                    type="date"
                    placeholder="选择日期"
                    value-format="YYYY-MM-DD"
                    class="w-full"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="预计交期" prop="expectedDeliveryDate">
                  <el-date-picker
                    v-model="processingForm.expectedDeliveryDate"
                    type="date"
                    placeholder="选择日期"
                    value-format="YYYY-MM-DD"
                    class="w-full"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="加工厂" prop="supplierId">
                  <el-select
                    v-model="processingForm.supplierId"
                    filterable
                    remote
                    clearable
                    placeholder="搜索并选择加工厂"
                    class="w-full"
                    :remote-method="loadSuppliers"
                    :loading="supplierLoading"
                    @focus="() => { if (supplierOptions.length === 0) loadSuppliers(''); }"
                    @change="handleSupplierChange"
                  >
                    <el-option
                      v-for="item in supplierOptions"
                      :key="item.id"
                      :label="item.name"
                      :value="item.id"
                    >
                      <span>{{ item.name }}</span>
                      <span class="text-sm text-muted" style="float: right; margin-left: 10px">{{ item.code || '' }}</span>
                    </el-option>
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="联系人" prop="contactPerson">
                  <el-input
                    v-model="processingForm.contactPerson"
                    placeholder="请输入联系人"
                    class="w-full"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="联系电话" prop="contactPhone">
              <el-input
                v-model="processingForm.contactPhone"
                placeholder="请输入联系电话"
                class="w-full"
              />
            </el-form-item>
            <el-form-item label="备注" prop="remarks">
              <el-input
                v-model="processingForm.remarks"
                type="textarea"
                :rows="2"
                placeholder="请输入备注信息"
                class="w-full"
              />
            </el-form-item>
          </el-card>

          <!-- 发料物料 -->
          <el-card class="data-card">
            <template #header>
              <div class="card-header">
                <span>发料物料</span>
                <el-button
                  type="primary"
                  size="small"
                  @click="handleAddMaterial"
                >
                  添加物料
                </el-button>
              </div>
            </template>

            <el-table :data="processingForm.materials" border class="w-full">
              <el-table-column type="index" width="50" label="序号" />
              <el-table-column prop="materialCode" label="物料编码" min-width="120" />
              <el-table-column prop="materialName" label="物料名称" min-width="150" />
              <el-table-column prop="specification" label="规格" min-width="120" />
              <el-table-column prop="unit" label="单位" width="70" />
              <el-table-column prop="quantity" label="数量" width="80">
                <template #default="scope">
                  <el-input-number
                    v-model="scope.row.quantity"
                    :min="0.01"
                    :precision="2"
                    controls-position="right"
                    size="small"
                    class="w-full"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="100">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.remark"
                    size="small"
                  />
                </template>
              </el-table-column>
              <el-table-column label="操作" min-width="80" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    @click="handleRemoveMaterial(scope.$index)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <!-- 加工成品 -->
          <el-card class="data-card">
            <template #header>
              <div class="card-header">
                <span>加工成品</span>
                <el-button
                  type="primary"
                  size="small"
                  @click="handleAddProduct"
                >
                  添加成品
                </el-button>
              </div>
            </template>

            <el-table :data="processingForm.products" border class="w-full">
              <el-table-column type="index" width="50" label="序号" />
              <el-table-column prop="productCode" label="成品编码" min-width="120" />
              <el-table-column prop="productName" label="成品名称" min-width="150" />
              <el-table-column prop="specification" label="规格" min-width="120" />
              <el-table-column prop="unit" label="单位" width="70" />
              <el-table-column prop="quantity" label="数量" width="80">
                <template #default="scope">
                  <el-input-number
                    v-model="scope.row.quantity"
                    :min="0.01"
                    :precision="2"
                    controls-position="right"
                    size="small"
                    class="w-full"
                    @change="calculateRowTotal(scope.row)"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="unitPrice" label="单价" width="80">
                <template #default="scope">
                  <el-input-number
                    v-model="scope.row.unitPrice"
                    :min="0"
                    :precision="2"
                    controls-position="right"
                    size="small"
                    class="w-full"
                    @change="calculateRowTotal(scope.row)"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="totalPrice" label="金额" width="80">
                <template #default="scope">
                  <span>{{ formatPrice(scope.row.totalPrice) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="150">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.remark"
                    size="small"
                  />
                </template>
              </el-table-column>
              <el-table-column label="操作" min-width="80" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    @click="handleRemoveProduct(scope.$index)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="total-section">
              <span class="total-label">加工总金额：</span>
              <span class="total-value">{{ formatPrice(calculateTotal()) }}</span>
            </div>
          </el-card>
        </el-form>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleCloseProcessingDialog">取消</el-button>
          <el-button type="primary" :loading="processing" @click="handleProcessingSubmit">
            {{ processing ? '保存中...' : '保存' }}
          </el-button>
        </span>
      </template>
    </AppDialog>

    <!-- 物料选择对话框 -->
    <AppDialog
      v-model="materialDialogVisible"
      title="选择物料"
      mode="form"
      width="850px"
    >
      <div class="dialog-search">
        <el-input
          v-model="materialSearchKeyword"
          placeholder="输入关键字搜索物料"
          clearable
          @input="scheduleMaterialSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
      <el-table
        :data="filteredMaterials"
        border
        class="w-full"
        height="400px"
        @row-click="handleSelectMaterial"
      >
        <el-table-column prop="code" label="物料编码" min-width="120" />
        <el-table-column prop="name" label="物料名称" min-width="150" />
        <el-table-column prop="specification" label="规格" min-width="120" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column label="操作" min-width="80" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button
              type="primary"
              size="small"
              @click.stop="handleSelectMaterial(scope.row)"
            >
              选择
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </AppDialog>

    <!-- 成品选择对话框 -->
    <AppDialog
      v-model="productDialogVisible"
      title="选择成品"
      mode="form"
      width="850px"
    >
      <div class="dialog-search">
        <el-input
          v-model="productSearchKeyword"
          placeholder="输入关键字搜索成品"
          clearable
          @input="scheduleProductSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
      <el-table
        :data="filteredProducts"
        border
        class="w-full"
        height="400px"
        @row-click="handleSelectProduct"
      >
        <el-table-column prop="code" label="成品编码" min-width="120" />
        <el-table-column prop="name" label="成品名称" min-width="150" />
        <el-table-column prop="specification" label="规格" min-width="120" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column label="操作" min-width="80" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button
              type="primary"
              size="small"
              @click.stop="handleSelectProduct(scope.row)"
            >
              选择
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </AppDialog>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView';
import { formatLocalDate } from '@/utils/format';
import { formatDate } from '@/utils/helpers/dateUtils';
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { purchaseApi } from '@/api';
import {
  loadOutsourcedMaterialOptions,
  loadOutsourcedSupplierOptions,
  searchOutsourcedMaterialOptions,
  searchOutsourcedSupplierOptions,
} from '@/utils/optionLoaders';
import { Plus, Search } from '@element-plus/icons-vue';
import {
  OUTSOURCED_STATUS_OPTIONS,
  getOutsourcedStatusText,
  getOutsourcedStatusColor
} from '@/constants/systemConstants';

// 状态选项
const statusOptions = OUTSOURCED_STATUS_OPTIONS;
const getStatusType = (status) => getOutsourcedStatusColor(status);
const getStatusLabel = (status) => getOutsourcedStatusText(status);

// 搜索表单
const searchForm = reactive({
  keyword: '',
  supplierName: '',
  status: '',
  dateRange: []
});

// 委外加工列表数据
const processingList = ref([]);
const loading = ref(false);

// 分页数据
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0
});

// 统计数据
const processingStats = reactive({
  total: 0,
  pendingCount: 0,
  confirmedCount: 0,
  inProgressCount: 0,
  completedCount: 0,
  cancelledCount: 0
});

// 查看详情弹窗状态
const viewDialogVisible = ref(false);
const viewDialogLoading = ref(false);
const viewData = reactive({
  id: null,
  processingNo: '',
  processingDate: '',
  supplierId: null,
  supplierName: '',
  expectedDeliveryDate: '',
  contactPerson: '',
  contactPhone: '',
  totalAmount: 0,
  remarks: '',
  status: '',
  materials: [],
  products: []
});

// 编辑/新建对话框状态
const processingDialogVisible = ref(false);
const processingDialogLoading = ref(false);
const processingDialogMode = ref('create');
const selectedProcessingId = ref(null);
const processing = ref(false);
const processingFormRef = ref(null);

// 表单数据
const processingForm = reactive({
  processingDate: formatLocalDate(new Date()),
  supplierId: '',
  supplierName: '',
  expectedDeliveryDate: '',
  contactPerson: '',
  contactPhone: '',
  remarks: '',
  materials: [],
  products: []
});

// 表单验证规则
const processingRules = {
  processingDate: [{ required: true, message: '请选择加工日期', trigger: 'change' }],
  supplierId: [{ required: true, message: '请选择加工厂', trigger: 'change' }],
  expectedDeliveryDate: [{ required: true, message: '请选择预计交期', trigger: 'change' }]
};

// 供应商选项
const supplierOptions = ref([]);
const supplierLoading = ref(false);
let supplierRequestId = 0;

// 物料选择相关状态
const materialDialogVisible = ref(false);
const materialSearchKeyword = ref('');
const materialList = ref([]);
let materialSearchTimer = null;
let materialRequestId = 0;

// 成品选择相关状态
const productDialogVisible = ref(false);
const productSearchKeyword = ref('');
const productList = ref([]);
let productSearchTimer = null;
let productRequestId = 0;

// 价格格式化
const formatPrice = (price) => {
  if (price === null || price === undefined || price === '') return '¥ 0.00';
  const value = Number(price);
  return Number.isNaN(value) ? '¥ 0.00' : `¥ ${value.toFixed(2)}`;
};

// 获取供应商列表 (加工厂)
const loadSuppliers = async (query = '') => {
  const currentRequestId = ++supplierRequestId;
  supplierLoading.value = true;
  try {
    const keyword = typeof query === 'string' ? query.trim() : '';
    const list = keyword
      ? await searchOutsourcedSupplierOptions(keyword)
      : await loadOutsourcedSupplierOptions();
    if (currentRequestId !== supplierRequestId) return;

    const options = list.map(item => ({
      id: item.id,
      code: item.code || '',
      name: item.name || '',
      contact: item.contactPerson || item.contact || '',
      phone: item.contactPhone || item.phone || ''
    }));

    // 编辑时即使当前加工厂不在本次远程搜索结果中，也要保留已选项，避免只显示 ID 或空白。
    const selectedSupplierId = Number(processingForm.supplierId);
    if (
      selectedSupplierId > 0 &&
      !options.some(item => Number(item.id) === selectedSupplierId) &&
      processingForm.supplierName
    ) {
      options.unshift({
        id: selectedSupplierId,
        code: '',
        name: processingForm.supplierName,
        contact: processingForm.contactPerson || '',
        phone: processingForm.contactPhone || ''
      });
    }

    supplierOptions.value = options;
  } catch (error) {
    console.error('加载供应商列表失败:', error);
  } finally {
    if (currentRequestId === supplierRequestId) {
      supplierLoading.value = false;
    }
  }
};

// 供应商选择联动
const handleSupplierChange = (supplierId) => {
  const supplier = supplierOptions.value.find(s => s.id === supplierId);
  if (supplier) {
    processingForm.supplierName = supplier.name;
    processingForm.contactPerson = supplier.contact;
    processingForm.contactPhone = supplier.phone;
  }
};

// 加载物料列表
const loadMaterials = async () => {
  const currentRequestId = ++materialRequestId;
  try {
    const keyword = materialSearchKeyword.value.trim();
    const options = keyword
      ? await searchOutsourcedMaterialOptions(keyword)
      : await loadOutsourcedMaterialOptions();
    if (currentRequestId !== materialRequestId) return;
    materialList.value = options;
  } catch (error) {
    console.error('加载物料列表失败:', error);
  }
};

const scheduleMaterialSearch = () => {
  if (materialSearchTimer) clearTimeout(materialSearchTimer);
  materialSearchTimer = setTimeout(() => {
    loadMaterials();
  }, 300);
};

const filteredMaterials = computed(() => {
  return materialList.value;
});

// 加载成品列表
const loadProducts = async () => {
  const currentRequestId = ++productRequestId;
  try {
    const keyword = productSearchKeyword.value.trim();
    const options = keyword
      ? await searchOutsourcedMaterialOptions(keyword)
      : await loadOutsourcedMaterialOptions();
    if (currentRequestId !== productRequestId) return;
    productList.value = options;
  } catch (error) {
    console.error('加载成品列表失败:', error);
  }
};

const scheduleProductSearch = () => {
  if (productSearchTimer) clearTimeout(productSearchTimer);
  productSearchTimer = setTimeout(() => {
    loadProducts();
  }, 300);
};

const filteredProducts = computed(() => {
  return productList.value;
});

// 查看委外加工单详情（纯展示）
const handleViewProcessing = async (row) => {
  viewDialogVisible.value = true;
  viewDialogLoading.value = true;
  try {
    const response = await purchaseApi.outsourcedProcessing.getDetail(row.id);
    const data = response.data || {};
    Object.assign(viewData, {
      id: data.id,
      processingNo: data.processingNo || '',
      processingDate: data.processingDate || '',
      supplierId: data.supplierId,
      supplierName: data.supplierName || '',
      expectedDeliveryDate: data.expectedDeliveryDate || '',
      contactPerson: data.contactPerson || '',
      contactPhone: data.contactPhone || '',
      totalAmount: data.totalAmount || 0,
      remarks: data.remarks || '',
      status: data.status || '',
      materials: data.materials || [],
      products: data.products || []
    });
  } catch (error) {
    console.error('获取加工单详情失败:', error);
    ElMessage.error('获取加工单详情失败');
  } finally {
    viewDialogLoading.value = false;
  }
};

// 新建委外加工单
const handleAddProcessing = () => {
  processingDialogMode.value = 'create';
  selectedProcessingId.value = null;
  resetProcessingForm();
  processingDialogVisible.value = true;
  loadSuppliers();
  loadMaterials();
  loadProducts();
};

// 编辑委外加工单
const handleEditProcessing = async (row) => {
  processingDialogMode.value = 'edit';
  selectedProcessingId.value = row.id;
  processingDialogVisible.value = true;
  processingDialogLoading.value = true;
  try {
    const response = await purchaseApi.outsourcedProcessing.getDetail(row.id);
    const data = response.data || {};
    Object.assign(processingForm, {
      processingDate: data.processingDate || formatLocalDate(new Date()),
      supplierId: data.supplierId || '',
      supplierName: data.supplierName || '',
      expectedDeliveryDate: data.expectedDeliveryDate || '',
      contactPerson: data.contactPerson || '',
      contactPhone: data.contactPhone || '',
      remarks: data.remarks || '',
      materials: data.materials || [],
      products: data.products || []
    });
    await loadSuppliers(data.supplierName || '');
    loadMaterials();
    loadProducts();
  } catch (error) {
    console.error('加载加工单详情失败:', error);
    ElMessage.error('加载加工单详情失败');
  } finally {
    processingDialogLoading.value = false;
  }
};

// 重置表单
const resetProcessingForm = () => {
  Object.assign(processingForm, {
    processingDate: formatLocalDate(new Date()),
    supplierId: '',
    supplierName: '',
    expectedDeliveryDate: '',
    contactPerson: '',
    contactPhone: '',
    remarks: '',
    materials: [],
    products: []
  });
  if (processingFormRef.value) {
    processingFormRef.value.resetFields();
  }
};

// 关闭表单弹窗
const handleCloseProcessingDialog = () => {
  processingDialogVisible.value = false;
};

// 添加物料
const handleAddMaterial = () => {
  materialDialogVisible.value = true;
  materialSearchKeyword.value = '';
  loadMaterials();
};

const handleSelectMaterial = (row) => {
  const exists = processingForm.materials.some(item => item.materialId === row.id);
  if (exists) {
    ElMessage.warning('该物料已在发料列表中');
    materialDialogVisible.value = false;
    return;
  }
  processingForm.materials.push({
    materialId: row.id,
    materialCode: row.code,
    materialName: row.name,
    specification: row.specification,
    unit: row.unitName,
    unitId: row.unitId,
    quantity: 1,
    remark: ''
  });
  materialDialogVisible.value = false;
};

const handleRemoveMaterial = (index) => {
  processingForm.materials.splice(index, 1);
};

// 添加成品
const handleAddProduct = () => {
  productDialogVisible.value = true;
  productSearchKeyword.value = '';
  loadProducts();
};

const handleSelectProduct = (row) => {
  const exists = processingForm.products.some(item => item.productId === row.id);
  if (exists) {
    ElMessage.warning('该成品已在加工清单中');
    productDialogVisible.value = false;
    return;
  }
  processingForm.products.push({
    productId: row.id,
    productCode: row.code,
    productName: row.name,
    specification: row.specification,
    unit: row.unitName,
    unitId: row.unitId,
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    remark: ''
  });
  productDialogVisible.value = false;
};

const handleRemoveProduct = (index) => {
  processingForm.products.splice(index, 1);
};

// 计算小计
const calculateRowTotal = (row) => {
  const qty = Number(row.quantity || 0);
  const price = Number(row.unitPrice || 0);
  row.totalPrice = qty * price;
};

// 计算总金额
const calculateTotal = () => {
  return processingForm.products.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);
};

// 提交加工单
const handleProcessingSubmit = async () => {
  if (processing.value) return;

  processingFormRef.value.validate(async (valid) => {
    if (!valid) {
      ElMessage.error('请填写完整的加工单信息');
      return;
    }

    if (processingForm.materials.length === 0) {
      ElMessage.error('请至少添加一种发料物料');
      return;
    }

    if (processingForm.products.length === 0) {
      ElMessage.error('请至少添加一种加工成品');
      return;
    }

    const submitData = {
      processingDate: processingForm.processingDate,
      supplierId: processingForm.supplierId,
      supplierName: processingForm.supplierName,
      expectedDeliveryDate: processingForm.expectedDeliveryDate,
      contactPerson: processingForm.contactPerson,
      contactPhone: processingForm.contactPhone,
      remarks: processingForm.remarks,
      materials: processingForm.materials.map(m => ({
        materialId: m.materialId,
        materialCode: m.materialCode,
        materialName: m.materialName,
        specification: m.specification || '',
        unit: m.unit || '',
        unitId: m.unitId,
        quantity: Number(m.quantity || 0),
        remark: m.remark || ''
      })),
      products: processingForm.products.map(p => ({
        productId: p.productId,
        productCode: p.productCode,
        productName: p.productName,
        specification: p.specification || '',
        unit: p.unit || '',
        unitId: p.unitId,
        quantity: Number(p.quantity || 0),
        unitPrice: Number(p.unitPrice || 0),
        totalPrice: Number(p.totalPrice || 0),
        remark: p.remark || ''
      }))
    };

    processing.value = true;
    try {
      if (processingDialogMode.value === 'create') {
        await purchaseApi.outsourcedProcessing.create(submitData);
        ElMessage.success('创建委外加工单成功');
      } else {
        await purchaseApi.outsourcedProcessing.update(selectedProcessingId.value, submitData);
        ElMessage.success('更新委外加工单成功');
      }
      processingDialogVisible.value = false;
      fetchProcessingList();
    } catch (error) {
      console.error('保存委外加工单失败:', error);
      ElMessage.error('保存委外加工单失败: ' + (error.response?.data?.message || error.message));
    } finally {
      processing.value = false;
    }
  });
};

// 获取加工单列表
const fetchProcessingList = async () => {
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
    const response = await purchaseApi.outsourcedProcessing.getList(params);
    processingList.value = response.data?.list || response.data || [];
    pagination.total = Number(response.data?.total) || processingList.value.length;
    updateStats();
  } catch (error) {
    console.error('获取委外加工列表失败:', error);
    ElMessage.error('获取委外加工列表失败');
  } finally {
    loading.value = false;
  }
};

// 更新统计数据
const updateStats = () => {
  processingStats.total = pagination.total;
  processingStats.pendingCount = processingList.value.filter(item => item.status === 'pending').length;
  processingStats.confirmedCount = processingList.value.filter(item => item.status === 'confirmed').length;
  processingStats.inProgressCount = processingList.value.filter(item => item.status === 'in_progress').length;
  processingStats.completedCount = processingList.value.filter(item => item.status === 'completed').length;
  processingStats.cancelledCount = processingList.value.filter(item => item.status === 'cancelled').length;
};

// 搜索处理
const handleSearch = () => {
  pagination.page = 1;
  fetchProcessingList();
};

const resetSearch = () => {
  Object.keys(searchForm).forEach(key => {
    if (key === 'dateRange') {
      searchForm[key] = [];
    } else {
      searchForm[key] = '';
    }
  });
  pagination.page = 1;
  fetchProcessingList();
};

// 分页处理
const handleSizeChange = (val) => {
  pagination.pageSize = val;
  fetchProcessingList();
};

const handleCurrentChange = (val) => {
  pagination.page = val;
  fetchProcessingList();
};

// 更新加工单状态
const updateProcessingStatus = async (row, status) => {
  try {
    const response = await purchaseApi.outsourcedProcessing.updateStatus(row.id, status);
    const warnings = Array.isArray(response?.data?.warnings) ? response.data.warnings : [];
    if (warnings.length > 0) {
      ElMessage({
        message: `状态已更新，且${warnings.join('；')}`,
        type: 'success',
        duration: 6000,
        showClose: true
      });
    } else {
      ElMessage.success('状态更新成功');
    }
    await fetchProcessingList();
  } catch (error) {
    console.error('状态更新失败:', error);
    ElMessage.error('状态更新失败: ' + (error.response?.data?.message || error.message));
  }
};

// 发料出库操作
const handleOutboundIssue = (row) => {
  ElMessageBox.confirm(
    `确定对委外加工单【${row.processingNo}】执行发料出库吗？\n系统将自动从仓库扣减对应的原材料库存，在委外入库管理中生成入库单据，并将加工单状态置为加工中。`,
    '发料出库确认',
    {
      confirmButtonText: '确认出库',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(() => {
    updateProcessingStatus(row, 'in_progress');
  }).catch(() => {});
};

// 删除委外加工单
const handleDeleteProcessing = (row) => {
  ElMessageBox.confirm(
    `确定要删除加工单 ${row.processingNo} 吗？此操作不可恢复。`,
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  ).then(async () => {
    try {
      await purchaseApi.outsourcedProcessing.delete(row.id);
      ElMessage.success('删除成功');
      fetchProcessingList();
    } catch (error) {
      console.error('删除失败:', error);
      ElMessage.error('删除失败: ' + (error.response?.data?.message || error.message));
    }
  }).catch(() => {});
};

onMounted(() => {
  fetchProcessingList();
});

onUnmounted(() => {
  if (materialSearchTimer) clearTimeout(materialSearchTimer);
  if (productSearchTimer) clearTimeout(productSearchTimer);
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

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-search {
  margin-bottom: 15px;
}

.total-section {
  margin-top: 15px;
  text-align: right;
  padding-right: 20px;
}

.total-label {
  font-size: 14px;
  font-weight: bold;
}

.total-value {
  font-size: 18px;
  color: var(--color-danger);
  font-weight: bold;
}

.total-amount-highlight {
  font-size: 16px;
  font-weight: bold;
  color: var(--color-danger);
}

.view-total-section {
  margin-top: 20px;
  text-align: right;
  padding-right: 15px;
}

.purchase-view-desc,
.purchase-view-desc :deep(.el-descriptions__body),
.purchase-view-desc :deep(.el-descriptions__table) {
  width: 100%;
}

.purchase-view-desc :deep(.el-descriptions__label) {
  width: 112px;
  min-width: 112px;
  white-space: nowrap;
}

.purchase-view-desc :deep(.el-descriptions__content) {
  min-width: 0;
  white-space: normal;
  word-break: break-word;
}
</style>
