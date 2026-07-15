<!--
/**
 * InvoiceFormDialog.vue
 * @description 新增/编辑发票表单对话框
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-dialog
    :title="title"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    width="700px"
  >
    <el-form :model="editableForm" :rules="invoiceRules" ref="invoiceFormRef" label-width="110px">
      <!-- 第一行：发票编号 + 客户（这里客户用下拉，但因为很重要所以放第一行） -->
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="发票编号" prop="invoice_number">
            <el-input v-model="editableForm.invoice_number" placeholder="系统自动生成" disabled></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="客户" prop="customerId">
            <el-select v-model="editableForm.customerId" placeholder="请选择客户" filterable class="w-full">
              <el-option
                v-for="customer in customerOptions"
                :key="customer.id"
                :label="customer.name"
                :value="customer.id"
              ></el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 第二行：开票日期 + 到期日期 -->
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="开票日期" prop="invoiceDate">
            <el-date-picker
              v-model="editableForm.invoiceDate"
              type="date"
              placeholder="选择开票日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              class="w-full"
            ></el-date-picker>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="到期日期" prop="dueDate">
            <el-date-picker
              v-model="editableForm.dueDate"
              type="date"
              placeholder="选择到期日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              class="w-full"
            ></el-date-picker>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 发票明细项 -->
      <div class="invoice-items">
        <h3 class="section-title-sm">发票明细</h3>
        <div class="details-table-container">
          <el-table :data="editableForm.items" border size="small" class="w-full">
            <el-table-column label="商品/服务" width="140">
              <template #default="scope">
                <el-select v-model="scope.row.productId" placeholder="选择" filterable size="small" class="w-full" @change="() => handleProductChange(scope.row)">
                  <el-option
                    v-for="product in productOptions"
                    :key="product.id"
                    :label="product.name"
                    :value="product.id"
                  ></el-option>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="描述" width="120">
              <template #default="scope">
                <el-input v-model="scope.row.description" placeholder="描述" size="small"></el-input>
              </template>
            </el-table-column>
            <el-table-column label="数量" width="80">
              <template #default="scope">
                <el-input v-model="scope.row.quantity" placeholder="数量" size="small" @input="calculateItemAmount(scope.row)"></el-input>
              </template>
            </el-table-column>
            <el-table-column label="单价" width="90">
              <template #default="scope">
                <el-input v-model="scope.row.unitPrice" placeholder="单价" size="small" @input="calculateItemAmount(scope.row)"></el-input>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="100">
              <template #default="scope">
                {{ formatCurrency(scope.row.amount) }}
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="60" :resizable="false" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button
                  type="danger"
                  size="small"
                  link
                  @click="removeInvoiceItem(scope.$index)"
                  v-permission="'finance:ar:update'"
                  class="py-4">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        <div class="add-item mt-10">
          <el-button v-permission="'finance:ar:create'" type="primary" size="small" @click="addInvoiceItem">添加明细项</el-button>
        </div>
      </div>

      <!-- 税率和总计 -->
      <div class="invoice-total invoice-total-box">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="税率" label-width="60px">
              <el-select v-model="editableForm.taxRate" placeholder="税率" size="small" class="w-full">
                <el-option
                  v-for="rate in vatRateOptions"
                  :key="rate"
                  :label="financeStore.formatTaxRate(rate)"
                  :value="rate"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <div class="flex-col pt-4">
              <div class="flex-between text-md">
                <span>小计：</span>
                <span>{{ formatCurrency(calculateSubtotal()) }}</span>
              </div>
              <div class="flex-between text-md">
                <span>税额：</span>
                <span>{{ formatCurrency(calculateTax()) }}</span>
              </div>
              <div class="total-line-primary">
                <span>总计：</span>
                <span>{{ formatCurrency(calculateTotal()) }}</span>
              </div>
            </div>
          </el-col>
        </el-row>
      </div>

      <el-form-item label="备注" label-width="60px" class="mt-md">
        <el-input
          v-model="editableForm.notes"
          type="textarea"
          :rows="2"
          placeholder="请输入备注信息"
        ></el-input>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="$emit('update:modelValue', false)">取消</el-button>
        <el-button v-permission="editableForm.id ? 'finance:ar:update' : 'finance:ar:create'" type="primary" @click="$emit('save')" :loading="saveLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '@/utils/format'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'

const financeStore = useFinanceStore()
const { vatRateOptions } = storeToRefs(financeStore)

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '新增销售发票'
  },
  form: {
    type: Object,
    required: true
  },
  customerOptions: {
    type: Array,
    default: () => []
  },
  productOptions: {
    type: Array,
    default: () => []
  },
  saveLoading: {
    type: Boolean,
    default: false
  }
})

defineEmits(['update:modelValue', 'save'])

const editableForm = computed(() => props.form)

// 表单验证规则
const invoiceRules = {
  invoice_number: [
    { required: true, message: '请输入发票编号', trigger: 'blur' }
  ],
  customerId: [
    { required: true, message: '请选择客户', trigger: 'change' }
  ],
  invoice_date: [
    { required: true, message: '请选择开票日期', trigger: 'change' }
  ],
  due_date: [
    { required: true, message: '请选择到期日期', trigger: 'change' }
  ]
}

// 计算单项金额（整数化精度控制，避免浮点误差）
const calculateItemAmount = (item) => {
  const quantity = parseFloat(item.quantity) || 0
  const unitPrice = parseFloat(item.unitPrice) || 0
  item.amount = Math.round(quantity * unitPrice * 100) / 100
}

// 计算小计（整数化累加，避免多行累计误差放大）
const calculateSubtotal = () => {
  const totalCents = editableForm.value.items.reduce((sum, item) => sum + Math.round((item.amount || 0) * 100), 0)
  return totalCents / 100
}

// 计算税额
const calculateTax = () => {
  return Math.round(calculateSubtotal() * editableForm.value.taxRate * 100) / 100
}

// 计算总计
const calculateTotal = () => {
  return Math.round((calculateSubtotal() + calculateTax()) * 100) / 100
}

// 添加发票明细项
const addInvoiceItem = () => {
  editableForm.value.items.push({
    productId: null,
    description: '',
    quantity: 1,
    unitPrice: 0,
    amount: 0
  })
}

// 监听产品ID变化，自动填充单价
const handleProductChange = (item) => {
  if (item.productId) {
    const selectedProduct = props.productOptions.find(p => p.id === item.productId)
    if (selectedProduct) {
      item.unitPrice = selectedProduct.price || 0
      item.description = selectedProduct.description || ''
      calculateItemAmount(item)
    }
  }
}

// 移除发票明细项
const removeInvoiceItem = (index) => {
  editableForm.value.items.splice(index, 1)
}

// 暴露方法和计算函数供父组件调用
defineExpose({
  calculateTotal,
  calculateSubtotal,
  calculateTax
})
</script>

<style scoped>
.invoice-items {
  margin-bottom: var(--spacing-lg);
}
.invoice-items h3 {
  margin-bottom: 10px;
}
.invoice-items .details-table-container {
  width: 100%;
  overflow-x: auto;
}
.invoice-items .el-table {
  min-width: 650px;
}
.add-item {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}
.invoice-total {
  margin: 20px 0;
}
.invoice-items .details-table-container {
  width: 100%;
  overflow-x: auto;
}
.invoice-items .el-table {
  min-width: 550px;
}
/* 对话框自适应高度 */
/* 移除操作列右侧空白 */
.invoice-items :deep(.el-table__body-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
}
.invoice-items :deep(.el-table__header-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
}
</style>
