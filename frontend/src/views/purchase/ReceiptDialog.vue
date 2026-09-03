<!--
/**
 * ReceiptDialog.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    :title="dialogTitle"
    :mode="viewOnly ? 'view' : 'form'"
    width="850px"
    :before-close="handleClose"
  >
    <div v-if="viewOnly" class="receipt-view">
      <el-descriptions border :column="2" class="purchase-view-desc">
        <el-descriptions-item label="入库单号">{{ receiptForm.receiptNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="加工单号">{{ receiptForm.processingNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="入库日期">{{ formatDate(receiptForm.receiptDate) }}</el-descriptions-item>
        <el-descriptions-item label="加工厂">{{ receiptForm.supplierName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="入库仓库">{{ receiptForm.warehouseName || '-' }}</el-descriptions-item>
        <el-descriptions-item label="操作员">{{ receiptForm.operator || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(receiptForm.status)">
            {{ getStatusLabel(receiptForm.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="入库总金额">
          <span class="total-amount-highlight">{{ formatPrice(calculateTotal()) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">{{ receiptForm.remarks || '无' }}</el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="center">入库成品明细</el-divider>
      <el-table :data="receiptForm.items" border class="w-full">
        <el-table-column type="index" width="60" label="序号" />
        <el-table-column prop="productCode" label="成品编码" min-width="120" />
        <el-table-column prop="productName" label="成品名称" min-width="150" />
        <el-table-column prop="specification" label="规格" min-width="120" />
        <el-table-column prop="unit" label="单位" width="70" />
        <el-table-column prop="expectedQuantity" label="应收数量" width="100" />
        <el-table-column prop="actualQuantity" label="实收数量" width="100" />
        <el-table-column prop="unitPrice" label="加工单价" width="100">
          <template #default="{ row }">{{ formatPrice(row.unitPrice) }}</template>
        </el-table-column>
        <el-table-column prop="totalPrice" label="小计金额" width="120">
          <template #default="{ row }">{{ formatPrice(row.totalPrice) }}</template>
        </el-table-column>
      </el-table>

      <div class="view-total-section">
        <span class="total-label">入库总金额：</span>
        <span class="total-value">{{ formatPrice(calculateTotal()) }}</span>
      </div>
    </div>

    <el-form v-else ref="receiptFormRef" :model="receiptForm" :rules="rules" label-width="100px" class="form-container">
      <!-- 基本信息 -->
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>基本信息</span>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="加工单号" prop="processingId">
              <el-select
                v-if="!viewOnly && mode === 'create' && !props.processingId"
                v-model="receiptForm.processingId"
                filterable
                remote
                reserve-keyword
                placeholder="请搜索或选择加工单"
                :remote-method="loadProcessingOrders"
                :loading="processingOrdersLoading"
                class="w-full"
                @change="handleSelectProcessingOrder"
              >
                <el-option
                  v-for="item in processingOrderOptions"
                  :key="item.id"
                  :label="`${item.processingNo} (${item.supplierName})`"
                  :value="item.id"
                />
              </el-select>
              <el-input
                v-else
                v-model="receiptForm.processingNo"
                placeholder="加工单号"
                :disabled="true"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="加工厂" prop="supplierName">
              <el-input
                v-model="receiptForm.supplierName"
                placeholder="加工厂"
                :disabled="true"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="入库日期" prop="receiptDate">
              <el-date-picker
                v-model="receiptForm.receiptDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
                :disabled="viewOnly"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入库仓库">
              <el-input
                model-value="按成品物料默认仓库自动入库"
                disabled
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="操作员" prop="operator">
          <el-input
            v-model="receiptForm.operator"
            placeholder="请输入操作员"
            :disabled="viewOnly"
            class="w-full"
          />
        </el-form-item>
        <el-form-item label="备注" prop="remarks">
          <el-input
            v-model="receiptForm.remarks"
            type="textarea"
            :rows="2"
            placeholder="请输入备注信息"
            :disabled="viewOnly"
            class="w-full"
          />
        </el-form-item>
      </el-card>

      <!-- 成品明细 -->
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>入库明细</span>
          </div>
        </template>

        <el-table :data="receiptForm.items" border class="w-full">
          <el-table-column type="index" width="50" label="序号" />
          <el-table-column prop="productCode" label="成品编码" min-width="120" />
          <el-table-column prop="productName" label="成品名称" min-width="150" />
          <el-table-column prop="specification" label="规格" min-width="120" />
          <el-table-column prop="unit" label="单位" width="80" />
          <el-table-column prop="expectedQuantity" label="应收数量" width="100">
            <template #default="scope">
              <span>{{ scope.row.expectedQuantity }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="actualQuantity" label="实收数量" width="120">
            <template #default="scope">
              <el-input-number
                v-if="!viewOnly"
                v-model="scope.row.actualQuantity"
                :min="0"
                :precision="2"
                controls-position="right"
                size="small"
                class="w-full"
                :disabled="mode === 'create'"
                @change="calculateRowTotal(scope.row)"
              />
              <span v-else>{{ scope.row.actualQuantity }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="unitPrice" label="加工单价" width="100">
            <template #default="scope">
              <span>{{ formatPrice(scope.row.unitPrice) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="totalPrice" label="小计金额" width="120">
            <template #default="scope">
              <span>{{ formatPrice(scope.row.totalPrice) }}</span>
            </template>
          </el-table-column>
        </el-table>

        <div class="total-section">
          <span class="total-label">入库总金额：</span>
          <span class="total-value">{{ formatPrice(calculateTotal()) }}</span>
        </div>
      </el-card>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">{{ viewOnly ? '关闭' : '取消' }}</el-button>
        <el-button v-if="!viewOnly" type="primary" @click="handleSubmit">
          {{ processing ? '保存中...' : '保存' }}
        </el-button>
      </span>
    </template>
    </AppDialog>
</template>

<script setup>
import { formatLocalDate } from '@/utils/format';

import { ref, computed, reactive, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { purchaseApi } from '@/api/purchase';
import { ensureValidId } from '@/utils/helpers/dataUtils'
import {
  loadOutsourcedReceiptProcessingOptions,
  searchOutsourcedReceiptProcessingOptions,
} from '@/utils/optionLoaders';
import { formatDate } from '@/utils/helpers/dateUtils';
import {
  getOutsourcedStatusText,
  getOutsourcedStatusColor
} from '@/constants/systemConstants';


const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'create', // create, edit, view
    validator: (value) => ['create', 'edit', 'view'].includes(value)
  },
  receiptId: {
    type: [Number, String],
    default: null
  },
  processingId: {
    type: [Number, String],
    default: null
  }
});

const emit = defineEmits(['update:visible', 'success']);

// 计算属性：对话框标题
const dialogTitle = computed(() => {
  switch (props.mode) {
    case 'create':
      return '创建委外入库单';
    case 'edit':
      return '编辑委外入库单';
    case 'view':
      return '查看委外入库单';
    default:
      return '委外入库单';
  }
});

// 计算属性：是否为只读模式
const viewOnly = computed(() => props.mode === 'view');
const getStatusLabel = (status) => getOutsourcedStatusText(status);
const getStatusType = (status) => getOutsourcedStatusColor(status);

// 对话框显示状态
const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
});

// 入库单表单
const receiptForm = reactive({
  receiptNo: '',
  processingId: null,
  processingNo: '',
  supplierId: null,
  supplierName: '',
  warehouseName: '',
  receiptDate: formatLocalDate(new Date()), // 当前日期
  operator: '',
  remarks: '',
  status: '',
  items: [] // 入库明细
});

// 表单校验规则
const rules = {
  processingId: [
    { required: true, message: '请选择委外加工单', trigger: 'change' }
  ],
  receiptDate: [
    { required: true, message: '请选择入库日期', trigger: 'blur' }
  ],
  operator: [
    { required: true, message: '请输入操作员', trigger: 'blur' }
  ]
};

// 表单引用
const receiptFormRef = ref(null);
// 处理中状态
const processing = ref(false);

// 加工单选择相关状态
const processingOrderOptions = ref([]);
const processingOrdersLoading = ref(false);

// 加载加工中或已确认的委外加工单
const loadProcessingOrders = async (query = '') => {
  processingOrdersLoading.value = true;
  try {
    const list = query
      ? await searchOutsourcedReceiptProcessingOptions(query)
      : await loadOutsourcedReceiptProcessingOptions();
    processingOrderOptions.value = list
      .map(item => ({
        id: item.id,
        processingNo: item.processingNo,
        supplierName: item.supplierName || '未知厂商'
      }));
  } catch (error) {
    console.error('获取加工单列表失败:', error);
  } finally {
    processingOrdersLoading.value = false;
  }
};

// 选择加工单时联动带出成品明细
const handleSelectProcessingOrder = (processingId) => {
  if (processingId) {
    loadProcessingDetailById(processingId);
  }
};

// 通过加工单ID加载成品明细与供应商信息
const loadProcessingDetailById = async (processingId) => {
  if (!processingId) return;
  try {
    const response = await purchaseApi.outsourcedReceipts.getProcessingDetail(processingId);
    const data = response.data;

    receiptForm.processingId = ensureValidId(data.id);
    receiptForm.processingNo = data.processingNo || '';
    receiptForm.supplierId = data.supplierId;
    receiptForm.supplierName = data.supplierName;

    // 转换成品为入库单明细项
    receiptForm.items = (data.products || [])
      .map(normalizeProcessingProduct)
      .filter(item => item.expectedQuantity > 0);
  } catch (error) {
    console.error('获取加工单详情失败:', error);
    ElMessage.error('获取加工单详情失败');
  }
};

const toFiniteNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const normalizeProcessingProduct = (product) => {
  const expectedQuantity = toFiniteNumber(product.receivableQuantity, toFiniteNumber(product.quantity));
  const unitPrice = toFiniteNumber(product.unitPrice);

  return {
    productId: ensureValidId(product.productId),
    productCode: product.productCode || '',
    productName: product.productName || '',
    specification: product.specification || product.specs || '',
    unit: product.unit || '',
    unitId: ensureValidId(product.unitId),
    expectedQuantity,
    // 新建单只登记应收数量；实际到货通过列表中的“到货”动作登记并触发 IQC。
    actualQuantity: 0,
    unitPrice,
    totalPrice: 0
  };
};

const normalizeReceiptItem = (item) => {
  const actualQuantity = toFiniteNumber(item.actualQuantity);
  const unitPrice = toFiniteNumber(item.unitPrice);

  return {
    productId: ensureValidId(item.productId),
    productCode: item.productCode || '',
    productName: item.productName || '',
    specification: item.specification || item.specs || '',
    unit: item.unit || '',
    unitId: ensureValidId(item.unitId),
    expectedQuantity: toFiniteNumber(item.expectedQuantity),
    actualQuantity,
    unitPrice,
    totalPrice: toFiniteNumber(item.totalPrice, actualQuantity * unitPrice)
  };
};

// 计算行总价
const calculateRowTotal = (row) => {
  row.totalPrice = (parseFloat(row.actualQuantity) || 0) * (parseFloat(row.unitPrice) || 0);
};

// 计算总金额
const calculateTotal = () => {
  return receiptForm.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
};

// 格式化价格
const formatPrice = (price) => {
  return `¥ ${parseFloat(price || 0).toFixed(2)}`;
};

// 加载加工单详情
const loadProcessingDetail = async () => {
  if (!props.processingId) return;

  try {
    const response = await purchaseApi.outsourcedReceipts.getProcessingDetail(props.processingId);
    // 拦截器已解包，response.data 就是业务数据
    const data = response.data;

    // 填充表单数据
    receiptForm.processingId = ensureValidId(data.id);
    receiptForm.processingNo = data.processingNo || '';
    receiptForm.supplierId = data.supplierId;
    receiptForm.supplierName = data.supplierName;

    // 转换成品为入库单明细项
    receiptForm.items = (data.products || [])
      .map(normalizeProcessingProduct)
      .filter(item => item.expectedQuantity > 0);
  } catch (error) {
    console.error('获取加工单详情失败:', error);
    ElMessage.error('获取加工单详情失败');
  }
};

// 加载入库单详情
const loadReceiptDetail = async () => {
  if (!props.receiptId) return;

  try {
    const response = await purchaseApi.outsourcedReceipts.getDetail(props.receiptId);
    // 拦截器已解包，response.data 就是业务数据
    const data = response.data;

    // 填充表单数据，使用工具函数确保数据格式正确
    receiptForm.processingId = ensureValidId(data.processingId);
    receiptForm.receiptNo = data.receiptNo || '';
    receiptForm.processingNo = data.processingNo || '';
    receiptForm.supplierId = ensureValidId(data.supplierId);
    receiptForm.supplierName = data.supplierName || '';
    receiptForm.warehouseName = data.warehouseName || '';
    receiptForm.receiptDate = data.receiptDate || formatLocalDate(new Date());
    receiptForm.operator = data.operator || '';
    receiptForm.remarks = data.remarks || '';
    receiptForm.status = data.status || '';
    receiptForm.items = (data.items || []).map(normalizeReceiptItem);
  } catch {
    ElMessage.error('获取入库单详情失败');
  }
};

// 提交表单
const handleSubmit = async () => {
  if (processing.value) return;

  receiptFormRef.value.validate(async (valid) => {
    if (!valid) {
      ElMessage.error('请填写完整的入库单信息');
      return;
    }

    if (!receiptForm.items || receiptForm.items.length === 0) {
      ElMessage.error('入库单必须包含至少一项物料');
      return;
    }

    processing.value = true;

    try {
      const payload = {
        processingId: receiptForm.processingId,
        processingNo: receiptForm.processingNo,
        supplierId: receiptForm.supplierId,
        supplierName: receiptForm.supplierName,
        receiptDate: receiptForm.receiptDate,
        operator: receiptForm.operator,
        remarks: receiptForm.remarks,
        items: receiptForm.items.map((item) => ({
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          specification: item.specification || '',
          unit: item.unit || '',
          unitId: item.unitId,
          expectedQuantity: Number(item.expectedQuantity || 0),
          actualQuantity: Number(item.actualQuantity || 0),
          unitPrice: Number(item.unitPrice || 0)
        }))
      };

      if (props.mode === 'create') {
        await purchaseApi.outsourcedReceipts.create(payload);
        ElMessage.success('创建委外入库单成功');
      } else if (props.mode === 'edit') {
        await purchaseApi.outsourcedReceipts.update(props.receiptId, payload);
        ElMessage.success('更新委外入库单成功');
      }

      dialogVisible.value = false;
      emit('success');

    } catch (error) {
      console.error('保存委外入库单失败:', error);
      let errorMessage = '保存委外入库单失败';

      // 针对常见错误提供友好的错误信息
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      ElMessage.error(errorMessage);
    } finally {
      processing.value = false;
    }
  });
};

// 关闭对话框
const handleClose = () => {
  dialogVisible.value = false;
};

// 监听对话框显示状态变化
watch(() => props.visible, (newVal) => {
  if (newVal) {
    // 初始化数据
    Object.assign(receiptForm, {
      processingId: null,
      receiptNo: '',
      processingNo: '',
      supplierId: null,
      supplierName: '',
      warehouseName: '',
      receiptDate: formatLocalDate(new Date()),
      operator: '',
      remarks: '',
      status: '',
      items: []
    });

    // 如果是创建模式且有加工单ID，加载加工单详情；否则加载加工单列表供选择
    if (props.mode === 'create') {
      if (props.processingId) {
        loadProcessingDetail();
      } else {
        loadProcessingOrders();
      }
    }

    // 如果是编辑或查看模式，加载入库单详情
    if ((props.mode === 'edit' || props.mode === 'view') && props.receiptId) {
      loadReceiptDetail();
    }
  }
});
</script>

<style scoped>
.form-container {
  margin-top: var(--spacing-lg);
}

.receipt-view {
  margin-top: var(--spacing-lg);
}


.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.total-section {
  text-align: right;
  margin-top: 15px;
  padding-right: 20px;
}

.total-label {
  font-weight: bold;
  margin-right: 10px;
}

.total-value {
  font-size: 18px;
  color: var(--color-danger);
  font-weight: bold;
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

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
