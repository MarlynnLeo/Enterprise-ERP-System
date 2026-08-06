<!--
  RelatedOrderDialog — 发票关联业务订单预览
  布局与采购/销售订单详情一致：AppDialog mode=view + descriptions + divider + table
-->
<template>
  <AppDialog
    :title="dialogTitle"
    mode="view"
    content-width="wide"
    :model-value="modelValue"
    :loading="loading"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-if="order">
      <el-descriptions :column="2" border>
        <el-descriptions-item v-if="invoiceNumber" label="来源发票">
          {{ invoiceNumber }}
        </el-descriptions-item>
        <el-descriptions-item label="订单编号">
          {{ order.orderNo || relatedOrderNo || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small">{{ order.status || '-' }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="partnerLabel">
          {{ partnerDisplay }}
        </el-descriptions-item>
        <el-descriptions-item label="订单日期">
          {{ order.orderDate || order.createdAt || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="dateLabel">
          {{ secondaryDate }}
        </el-descriptions-item>
        <el-descriptions-item label="订单金额">
          {{ formatCurrency(order.totalAmount) }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">
          {{ order.remark || order.remarks || order.notes || '无' }}
        </el-descriptions-item>
      </el-descriptions>

      <el-divider content-position="center">订单明细</el-divider>

      <el-table
        v-if="lineItems.length"
        :data="lineItems"
        border
        class="w-full"
      >
        <el-table-column type="index" label="序号" width="60" />
        <el-table-column
          prop="materialCode"
          label="物料编码"
          min-width="120"
          show-overflow-tooltip
        />
        <el-table-column
          prop="materialName"
          label="物料名称"
          min-width="150"
          show-overflow-tooltip
        />
        <el-table-column
          prop="specification"
          label="规格"
          min-width="120"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            {{ row.specification || row.specs || row.spec || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="90">
          <template #default="{ row }">
            {{ formatQty(row.quantity) }}
          </template>
        </el-table-column>
        <el-table-column label="单价" width="110">
          <template #default="{ row }">
            {{ formatCurrency(row.unitPrice ?? row.price) }}
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            {{ formatCurrency(lineAmount(row)) }}
          </template>
        </el-table-column>
      </el-table>
      <EmptyState v-else description="暂无订单明细" ::image-size="72" />
    </template>

    <EmptyState v-else-if="!loading" description="未加载到订单详情" ::image-size="80" />

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
        <el-button type="primary" :disabled="!canJump" @click="$emit('jump')">
          {{ jumpLabel }}
        </el-button>
      </span>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed } from 'vue'
import { formatCurrency } from '@/utils/format'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** sales | purchase */
  kind: {
    type: String,
    default: 'sales',
    validator: (v) => ['sales', 'purchase'].includes(v),
  },
  invoiceNumber: { type: String, default: '' },
  partnerName: { type: String, default: '' },
  relatedOrderId: { type: [Number, String], default: null },
  relatedOrderNo: { type: String, default: '' },
  order: { type: Object, default: null },
})

defineEmits(['update:modelValue', 'jump'])

const dialogTitle = computed(() =>
  props.kind === 'purchase' ? '关联采购订单' : '关联销售订单'
)
const jumpLabel = computed(() =>
  props.kind === 'purchase' ? '跳转到采购订单' : '跳转到销售订单'
)
const partnerLabel = computed(() => (props.kind === 'purchase' ? '供应商' : '客户'))
const dateLabel = computed(() =>
  props.kind === 'purchase' ? '预计到货' : '交货日期'
)
const partnerDisplay = computed(() => {
  if (props.kind === 'purchase') {
    return props.order?.supplierName || props.partnerName || '-'
  }
  return props.order?.customerName || props.partnerName || '-'
})
const secondaryDate = computed(() => {
  if (props.kind === 'purchase') {
    return props.order?.expectedDeliveryDate || '-'
  }
  return props.order?.deliveryDate || '-'
})
const lineItems = computed(() =>
  Array.isArray(props.order?.items) ? props.order.items : []
)
const canJump = computed(
  () => !!(props.relatedOrderId || props.relatedOrderNo || props.order?.id || props.order?.orderNo)
)

function lineAmount(row) {
  if (row.totalPrice != null && row.totalPrice !== '') return row.totalPrice
  if (row.amount != null && row.amount !== '') return row.amount
  return Number(row.quantity || 0) * Number(row.unitPrice ?? row.price ?? 0)
}

function formatQty(val) {
  const n = Number(val)
  if (Number.isNaN(n)) return val ?? '-'
  return n.toFixed(2)
}
</script>
