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
    mode="form"
    width="850px"
    :before-close="handleClose"
  >
    <el-form ref="receiptFormRef" :model="receiptForm" :rules="rules" label-width="100px" class="form-container">
      <!-- 基本信息 -->
      <el-card class="data-card">
        <template #header>
          <div class="card-header">
            <span>基本信息</span>
          </div>
        </template>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="加工单号" prop="processingNo">
              <el-input
                v-model="receiptForm.processing_no"
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
                v-model="receiptForm.receipt_date"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
                :disabled="viewOnly"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="仓库" prop="warehouseId">
              <el-select
                v-model="receiptForm.warehouseId"
                filterable
                placeholder="请选择仓库"
                class="w-full"
                :disabled="viewOnly"
                @change="handleWarehouseChange"
              >
                <el-option
                  v-for="item in warehouseOptions"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
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
        <el-button @click="handleClose">取消</el-button>
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
import { loadLocationOptions } from '@/utils/optionLoaders';


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
      return '创建外委加工入库单';
    case 'edit':
      return '编辑外委加工入库单';
    case 'view':
      return '查看外委加工入库单';
    default:
      return '外委加工入库单';
  }
});

// 计算属性：是否为只读模式
const viewOnly = computed(() => props.mode === 'view');

// 对话框显示状态
const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
});

// 入库单表单
const receiptForm = reactive({
  processing_id: null,
  processing_no: '',
  supplierId: null,
  supplierName: '',
  warehouseId: null,
  warehouse_name: '',
  receipt_date: formatLocalDate(new Date()), // 当前日期
  operator: '',
  remarks: '',
  items: [] // 入库明细
});

// 表单校验规则
const rules = {
  receipt_date: [
    { required: true, message: '请选择入库日期', trigger: 'blur' }
  ],
  warehouseId: [
    { required: true, message: '请选择仓库', trigger: 'change' }
  ],
  operator: [
    { required: true, message: '请输入操作员', trigger: 'blur' }
  ]
};

// 仓库选项
const warehouseOptions = ref([]);
// 表单引用
const receiptFormRef = ref(null);
// 处理中状态
const processing = ref(false);

// 加载仓库数据
const loadWarehouses = async () => {
  try {
    const locations = await loadLocationOptions();
    warehouseOptions.value = locations.filter(item => item.type === 'warehouse');
    if (warehouseOptions.value.length === 0) {
      ElMessage.warning('仓库数据加载异常，请确认数据库中是否已添加仓库信息');
    }
  } catch (error) {
    console.error('获取仓库列表失败:', error);
    ElMessage.error('获取仓库列表失败: ' + (error.response?.data?.message || error.message));
  }
};

// 处理仓库变化
const handleWarehouseChange = (warehouseId) => {
  // 使用工具函数确保warehouseId是单个有效值
  const actualWarehouseId = ensureValidId(warehouseId);

  const selectedWarehouse = warehouseOptions.value.find(item => item.id === actualWarehouseId);
  if (selectedWarehouse) {
    receiptForm.warehouse_name = selectedWarehouse.name;
  }
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
    const response = await purchaseApi.outsourcedProcessing.getDetail(props.processingId);
    // 拦截器已解包，response.data 就是业务数据
    const data = response.data;

    // 填充表单数据
    receiptForm.processing_id = data.id;
    receiptForm.processing_no = data.processingNo;
    receiptForm.supplierId = data.supplierId;
    receiptForm.supplierName = data.supplierName;

    // 转换成品为入库单明细项
    receiptForm.items = (data.products || []).map(product => ({
      product_id: product.productId,
      product_code: product.productCode,
      product_name: product.productName,
      specification: product.specification,
      unit: product.unit,
      unit_id: product.unitId,
      expected_quantity: product.quantity,
      actual_quantity: product.quantity, // 默认实收等于应收
      unit_price: product.unitPrice,
      total_price: product.total_price
    }));
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
    receiptForm.processing_id = ensureValidId(data.processingId);
    receiptForm.processing_no = data.processingNo || '';
    receiptForm.supplierId = ensureValidId(data.supplierId);
    receiptForm.supplierName = data.supplierName || '';
    receiptForm.warehouseId = ensureValidId(data.warehouseId);
    receiptForm.warehouse_name = data.warehouseName || '';
    receiptForm.receipt_date = data.receiptDate || formatLocalDate(new Date());
    receiptForm.operator = data.operator || '';
    receiptForm.remarks = data.remarks || '';
    receiptForm.items = data.items || [];
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

    // 仓库ID是必须的
    if (!receiptForm.warehouseId) {
      ElMessage.error('请选择入库仓库');
      return;
    }

    processing.value = true;

    try {
      if (props.mode === 'create') {
        await purchaseApi.outsourcedReceipts.create(receiptForm);
        ElMessage.success('创建外委加工入库单成功');
      } else if (props.mode === 'edit') {
        await purchaseApi.outsourcedReceipts.update(props.receiptId, receiptForm);
        ElMessage.success('更新外委加工入库单成功');
      }

      dialogVisible.value = false;
      emit('success');

    } catch (error) {
      console.error('保存外委加工入库单失败:', error);
      let errorMessage = '保存外委加工入库单失败';

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
      processing_id: null,
      processing_no: '',
      supplierId: null,
      supplierName: '',
      warehouseId: null,
      warehouse_name: '',
      receipt_date: formatLocalDate(new Date()),
      operator: '',
      remarks: '',
      items: []
    });

    // 加载仓库数据
    loadWarehouses();

    // 如果是创建模式且有加工单ID，加载加工单详情
    if (props.mode === 'create' && props.processingId) {
      loadProcessingDetail();
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

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
