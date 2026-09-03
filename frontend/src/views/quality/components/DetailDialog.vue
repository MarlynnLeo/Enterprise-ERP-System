<!--
/**
 * DetailDialog.vue
 * @description 检验单详情查看弹窗
 * @date 2026-04-03
 * @version 1.0.0
 *
 * 职责：
 * - 检验单基本信息展示
 * - 检验项目表格（只读）
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    :title="`检验详情 - ${inspection?.inspectionNo || inspection?.inspectionNo || ''}`"
    mode="view"
    content-width="wide"
  >
    <div v-loading="loading">
      <template v-if="inspection">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="检验单号">{{ inspection.inspectionNo }}</el-descriptions-item>
          <el-descriptions-item label="采购单号">{{ inspection.purchaseOrderNo || inspection.referenceNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getQualityStatusColor(inspection.status)">{{ getQualityStatusText(inspection.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="物料编码">{{ inspection.itemCode || inspection.materialCode || '-' }}</el-descriptions-item>
          <el-descriptions-item label="物料名称">{{ inspection.productName || inspection.materialName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="产品型号">{{ inspection.productCode || inspection.specs || '-' }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ inspection.supplierName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ inspection.batchNo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ Math.floor(inspection.quantity || 0) }}</el-descriptions-item>
          <el-descriptions-item label="合格数">
            <span v-if="inspection.qualifiedQuantity !== null && inspection.qualifiedQuantity !== undefined" class="text-success font-weight-700">{{ Math.floor(inspection.qualifiedQuantity) }}</span>
            <span v-else class="text-muted">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="不合格数">
            <span v-if="inspection.unqualifiedQuantity > 0" class="text-danger font-weight-700">{{ Math.floor(inspection.unqualifiedQuantity) }}</span>
            <span v-else class="text-muted">{{ inspection.unqualifiedQuantity === 0 ? '0' : '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="检验日期">{{ inspection.inspectionDate || inspection.actualDate || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检验员">{{ inspection.inspector || inspection.inspectorName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ inspection.note || '-' }}</el-descriptions-item>
        </el-descriptions>
        <!-- 检验项目 -->
        <template v-if="inspection.items && inspection.items.length > 0">
          <el-divider content-position="center">检验项目</el-divider>
          <el-table :data="inspection.items" border class="w-full" max-height="300">
            <el-table-column prop="itemName" label="项目" width="100" show-overflow-tooltip />
            <el-table-column prop="standard" label="检验要求/标准" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.standard || row.dimensionInfo || '-' }}</template>
            </el-table-column>
            <el-table-column prop="method" label="检测方法" width="130" show-overflow-tooltip />
            <el-table-column label="测量值">
              <el-table-column v-for="n in MAX_INSPECTION_MEASUREMENT_COLUMNS" :key="n" :label="`${n}#`" min-width="55">
                <template #default="{ row }">
                  <span :class="getMeasurement(row, n) !== '{无}' ? 'text-primary' : 'text-muted'">
                    {{ getMeasurement(row, n) }}
                  </span>
                </template>
              </el-table-column>
            </el-table-column>
            <el-table-column label="范围/平均" width="100">
              <template #default="{ row }">
                <span
                  class="font-weight-700"
                  :class="row.result === 'passed' || row.result === 'pass' ? 'text-success' : row.result === 'failed' || row.result === 'fail' ? 'text-danger' : ''"
                >
                  {{ row.actualValue || '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="结果" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.result === 'pass' || row.result === 'passed' || row.result === '合格'" type="success" size="small">合格</el-tag>
                <el-tag v-else-if="row.result === 'fail' || row.result === 'failed' || row.result === '不合格'" type="danger" size="small">不合格</el-tag>
                <span v-else class="text-muted">{{ row.result || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="100" show-overflow-tooltip />
          </el-table>
        </template>
        <template v-if="inspection.attachments && inspection.attachments.length > 0">
          <el-divider content-position="center">附件</el-divider>
          <AttachmentUpload :model-value="inspection.attachments" readonly />
        </template>
      </template>
      <EmptyState v-else-if="!loading" description="暂无数据" />
    </div>
    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
      <el-button v-permission="'quality:inspections:update'" v-if="inspection?.status === 'pending'" type="primary" @click="handleGoInspect">去检验</el-button>
    </template>
  </AppDialog>
</template>
<script setup>
import { ref, computed, watch } from 'vue'
import { getQualityStatusText, getQualityStatusColor } from '@/constants/systemConstants'
import {
  fetchInspectionDetailWithItems,
  extractMaterialNameSimple,
  extractMaterialSpecsSimple,
  extractSupplierNameSimple,
  MAX_INSPECTION_MEASUREMENT_COLUMNS
} from '@/utils/inspectionHelpers'
import { formatInspectionMeasurement } from '@/utils/inspectionMeasurement'
import AttachmentUpload from '@/components/AttachmentUpload.vue'
const props = defineProps({
  visible: Boolean,
  row: { type: Object, default: null }
})
const emit = defineEmits(['update:visible', 'inspect'])
const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})
const loading = ref(false)
const inspection = ref(null)
const getMeasurement = (row, index) => {
  const dynamic = row?.measurements?.find((measurement, measurementIndex) =>
    Number(measurement?.sample_no ?? measurement?.sampleNo ?? measurementIndex + 1) === index
  )
  const value = dynamic?.measured_value ?? dynamic?.measuredValue ?? dynamic?.value ?? row?.[`measure${index}`] ?? row?.[`measure_${index}`] ?? null
  return formatInspectionMeasurement(row, value)
}
// 监听弹窗打开时加载数据
watch(() => props.visible, async (val) => {
  if (val && props.row) {
    loading.value = true
    try {
      inspection.value = await fetchInspectionDetailWithItems(
        props.row.id,
        props.row,
        extractMaterialNameSimple,
        extractMaterialSpecsSimple,
        extractSupplierNameSimple
      )
    } catch (error) {
      console.error('获取检验单详情失败:', error)
      inspection.value = props.row
    } finally {
      loading.value = false
    }
  }
})
const handleGoInspect = () => {
  dialogVisible.value = false
  emit('inspect', inspection.value)
}
</script>
<style scoped>
:deep(.el-descriptions__content) {
  min-width: 0;
  white-space: normal;
  word-break: break-word;
}
</style>
