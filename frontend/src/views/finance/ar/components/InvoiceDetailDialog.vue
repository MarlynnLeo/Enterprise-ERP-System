<!--
/**
 * InvoiceDetailDialog.vue
 * @description 发票详情查看对话框（AppDialog mode=view，与采购/销售详情同构）
 * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <AppDialog
    title="发票详情"
    mode="view"
    content-width="wide"
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-descriptions :column="2" border>
      <el-descriptions-item label="系统编号">{{ invoice.invoiceNumber }}</el-descriptions-item>
      <el-descriptions-item label="客户名称">{{ invoice.customerName }}</el-descriptions-item>
      <el-descriptions-item label="开票日期">{{ invoice.invoiceDate }}</el-descriptions-item>
      <el-descriptions-item label="到期日期">{{ invoice.dueDate }}</el-descriptions-item>
      <el-descriptions-item label="未税金额">{{ formatCurrency(invoice.amountExcludingTax) }}</el-descriptions-item>
      <el-descriptions-item label="税额">{{ formatCurrency(invoice.taxAmount) }}</el-descriptions-item>
      <el-descriptions-item label="价税合计">{{ formatCurrency(invoice.totalAmount) }}</el-descriptions-item>
      <el-descriptions-item label="已收金额">{{ formatCurrency(invoice.paidAmount) }}</el-descriptions-item>
      <el-descriptions-item label="剩余金额">{{ formatCurrency(invoice.balanceAmount) }}</el-descriptions-item>
      <el-descriptions-item label="状态">
        <el-tag :type="getStatusType(invoice)">{{ getStatusText(invoice) }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="创建时间">{{ invoice.createdAt || '-' }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ invoice.notes || '无' }}</el-descriptions-item>
    </el-descriptions>

    <el-divider content-position="center">发票明细项</el-divider>

    <el-table
      v-if="(invoice.items || []).length"
      :data="invoice.items || []"
      border
      class="w-full"
    >
      <el-table-column prop="productName" label="商品/服务名称" min-width="150" show-overflow-tooltip>
        <template #default="scope">
          {{ scope.row.productName || scope.row.name || '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
      <el-table-column prop="quantity" label="数量" width="100" />
      <el-table-column prop="unitPrice" label="单价" width="110">
        <template #default="scope">
          {{ formatCurrency(scope.row.unitPrice) }}
        </template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="110">
        <template #default="scope">
          {{ formatCurrency(scope.row.amount) }}
        </template>
      </el-table-column>
    </el-table>
    <EmptyState v-else description="暂无明细项" ::image-size="72" />

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
        <el-button v-permission="'finance:ar:view'" type="success" @click="$emit('print')">打印</el-button>
      </span>
    </template>
  </AppDialog>
</template>

<script setup>
import { formatCurrency } from '@/utils/format'

defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  invoice: {
    type: Object,
    default: () => ({})
  },
  getStatusType: {
    type: Function,
    required: true
  },
  getStatusText: {
    type: Function,
    required: true
  }
})

defineEmits(['update:modelValue', 'print'])
</script>
