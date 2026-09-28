<!--
/**
 * ReportDialog.vue
 * @description 检验报告弹窗 + 打印功能
 * @date 2026-04-03
 * @version 1.0.0
 *
 * 职责：
 * - 报告排版展示
 * - 打印模板系统集成
 * - Legacy 打印回退
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    :title="`检验报告 - ${inspection?.inspectionNo || inspection?.inspectionNo || ''}`"
    mode="form"
    width="min(1380px, 96vw)"
  >
    <div ref="reportRef" class="inspection-report">
      <div class="report-header">
        <div class="report-title">来料检验报告</div>
        <div class="report-no">No. {{ inspection?.inspectionNo || inspection?.inspectionNo }}</div>
      </div>
      <div class="report-info">
        <div class="report-info-item">
          <span class="report-info-label">物料名称:</span>
          <span>{{ inspection?.itemName || inspection?.materialName || inspection?.productName || '-' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">产品型号:</span>
          <span>{{ inspection?.productCode || inspection?.itemSpecs || inspection?.specs || inspection?.material_specs || '-' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">供应商:</span>
          <span>{{ inspection?.supplierName || inspection?.supplierName || '' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">采购单号:</span>
          <span>{{ inspection?.purchaseOrderNo || inspection?.referenceNo }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">批次号:</span>
          <span>{{ inspection?.batchNo || '-' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">到货数量:</span>
          <span>{{ Math.floor(inspection?.quantity || 0) }} {{ inspection?.unit }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">抽样数量:</span>
          <span>{{ getInspectionSampleQuantity(inspection) ?? '-' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">抽样方案:</span>
          <span>{{ getInspectionSamplingPlan(inspection) }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">检验日期:</span>
          <span>{{ formatDate(inspection?.inspectionDate || inspection?.actualDate) }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">检验员:</span>
          <span>{{ inspection?.inspector || inspection?.inspectorName }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">检验结果:</span>
          <span>
            <el-tag :type="getStatusType(inspection?.status)">{{ getStatusText(inspection?.status) }}</el-tag>
          </span>
        </div>
      </div>
      <div class="report-standards">
        <h3>检验项目</h3>
        <el-table :data="inspection?.items" border>
          <el-table-column prop="itemName" label="项目" min-width="130" show-overflow-tooltip />
          <el-table-column prop="standard" label="检验要求/标准" min-width="180" show-overflow-tooltip />
          <el-table-column prop="method" label="检测方法" min-width="130" show-overflow-tooltip>
            <template #default="{ row }">{{ row.method || '-' }}</template>
          </el-table-column>
          <el-table-column label="测量值">
            <el-table-column v-for="n in MAX_INSPECTION_MEASUREMENT_COLUMNS" :key="n" :label="`${n}#`" min-width="55">
              <template #default="scope">
                <span :class="getMeasurement(scope.row, n) !== '{无}' ? 'text-primary' : 'text-muted'">{{ getMeasurement(scope.row, n) }}</span>
              </template>
            </el-table-column>
          </el-table-column>
          <el-table-column prop="actualValue" label="实际值" min-width="120" show-overflow-tooltip />
          <el-table-column prop="result" label="结果" min-width="100" show-overflow-tooltip>
            <template #default="scope">
              <el-tag v-if="getItemResultPresentation(scope.row.result)" :type="getItemResultPresentation(scope.row.result).type">
                {{ getItemResultPresentation(scope.row.result).text }}
              </el-tag>
              <span v-else class="text-muted">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="remarks" label="备注" min-width="150" show-overflow-tooltip />
        </el-table>
      </div>
      <div class="report-result">
        <div class="report-conclusion">
          <h3>检验结论</h3>
          <p>根据检验结果，本批次物料
            <el-tag :type="getStatusType(inspection?.status)">{{ getStatusText(inspection?.status) }}</el-tag>
          </p>
          <p v-if="inspection?.majorDefect">主要不良: {{ inspection.majorDefect }}</p>
          <p v-if="inspection?.note">备注: {{ inspection?.note }}</p>
        </div>
      </div>
      <div class="report-signature">
        <div v-for="signature in reportSignatures" :key="signature.role" class="signature-item">
          <span class="report-signature-label">{{ signature.label }}:</span>
          <span v-if="signature.code || signature.name" class="report-signature-val" :class="{ 'signature-font': signature.code }">
            {{ signature.code || signature.name }}
          </span>
          <span v-else class="report-signature-empty-line"></span>
          <span v-if="signature.role === 'inspector'" class="report-signature-date">日期: {{ formatDate(inspection?.inspectionDate || inspection?.actualDate) }}</span>
        </div>
      </div>
    </div>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">关闭</el-button>
        <el-button v-permission="'quality:inspections:view'" type="primary" :loading="printing" @click="handlePrint">打印报告</el-button>
      </span>
    </template>
    </AppDialog>
</template>
<script setup>
import { ref, computed } from 'vue'
import { formatDate } from '@/utils/helpers/dateUtils'
import { ElMessage } from 'element-plus/es/components/message/index'
import { getQualityInspectionTypeText } from '@/constants/systemConstants'
import printService from '@/services/printService'
import { normalizeInspectionMeasurements, MAX_INSPECTION_MEASUREMENT_COLUMNS } from '@/utils/inspectionHelpers'
import { formatInspectionMeasurement } from '@/utils/inspectionMeasurement'
import { getInspectionSampleQuantity, getInspectionSamplingPlan } from '@/utils/inspectionSampling'
import { getSignatureDetails } from '@/constants/signatureConstants'
const props = defineProps({
  visible: Boolean,
  inspection: { type: Object, default: null }
})
const emit = defineEmits(['update:visible'])
const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})
const reportRef = ref(null)
const printing = ref(false)
const reportSignatures = computed(() => [
  { role: 'inspector', label: '检验员' },
  { role: 'reviewer', label: '审核' },
  { role: 'technical', label: '技术(让步时)' },
  { role: 'approver', label: '批准' },
].map(signature => ({ ...signature, ...getSignatureDetails(props.inspection, signature.role) })))
const getMeasurement = (row, index) => {
  const value = normalizeInspectionMeasurements(row)[index - 1]
  return formatInspectionMeasurement(row, value)
}
// 辅助函数
const getStatusText = (status) => {
  const map = { pending: '待检验', inspecting: '检验中', passed: '合格', failed: '不合格', partial: '部分合格', critical: '关键项不合格', review: '待复检' }
  return map[status] || status || '-'
}
const getStatusType = (status) => {
  const map = { pending: 'info', inspecting: 'warning', passed: 'success', failed: 'danger', partial: 'warning', critical: 'danger', review: 'warning' }
  return map[status] || 'info'
}
const getItemResultPresentation = (result) => {
  const normalized = String(result || '').trim().toLowerCase()
  if (['passed', 'pass', '合格'].includes(normalized)) return { text: '合格', type: 'success' }
  if (['failed', 'fail', '不合格'].includes(normalized)) return { text: '不合格', type: 'danger' }
  return null
}

const getInspectionPrintTemplateType = (inspection) => {
  if (inspection?.printTemplateType || inspection?.templateType) {
    return inspection.printTemplateType || inspection.templateType
  }
  const templateCode = String(inspection?.templateCode || '').toUpperCase()
  const templateName = String(inspection?.templateName || '')
  const materialName = String(inspection?.itemName || inspection?.materialName || inspection?.productName || '')
  const source = `${templateCode} ${templateName} ${materialName}`
  if (source.includes('QRZ-SPRING') || source.includes('弹簧')) return 'spring_inspection'
  if (
    source.includes('QRZ-SCREW') ||
    source.includes('螺钉') ||
    source.includes('螺母') ||
    source.includes('螺栓') ||
    source.includes('紧固件') ||
    source.toLowerCase().includes('screw') ||
    source.toLowerCase().includes('bolt')
  ) return 'screw_inspection'
  return 'incoming_inspection'
}

const formatUnqualifiedQuantity = (qty) => {
  if (qty === null || qty === undefined || qty === '') return ''
  const numeric = Number(qty)
  if (!Number.isFinite(numeric)) return String(qty)
  return numeric % 1 === 0 ? String(Math.floor(numeric)) : String(numeric)
}

const calculateUnqualifiedRate = (quantity, unqualifiedQty, explicitRate) => {
  if (explicitRate !== undefined && explicitRate !== null && explicitRate !== '') {
    return String(explicitRate)
  }
  if (unqualifiedQty === undefined || unqualifiedQty === null || unqualifiedQty === '') return ''
  const total = Number(quantity)
  const unq = Number(unqualifiedQty)
  if (Number.isFinite(total) && total > 0 && Number.isFinite(unq) && unq >= 0) {
    return ((unq / total) * 100).toFixed(1).replace(/\.0$/, '')
  }
  return ''
}

const resolveMajorDefect = (insp) => {
  if (insp.majorDefect) {
    return insp.majorDefect
  }
  const isFailed = insp.status === 'failed' || (insp.unqualifiedQuantity && Number(insp.unqualifiedQuantity) > 0)
  if (isFailed && Array.isArray(insp.items)) {
    const failedNames = insp.items
      .filter(it => getItemResultPresentation(it.result)?.type === 'danger')
      .map(it => it.itemName || it.name || it.item_name)
      .filter(Boolean)
    if (failedNames.length > 0) {
      return failedNames.join('、')
    }
  }
  return ''
}

// 打印报告
const handlePrint = async () => {
  if (printing.value) return
  if (!props.inspection) {
    ElMessage.error('报告数据加载失败，请重试')
    return
  }
  const insp = props.inspection
  const materialName = insp.itemName || insp.materialName || insp.productName || ''
  const printItems = (insp.items || []).map((item, itemIndex) => {
    const presentation = getItemResultPresentation(item.result)
    const result = presentation?.text || getStatusText(item.result)
    return {
      ...item,
      index: item.index ?? itemIndex + 1,
      item_code: item.itemCode || item.code || '',
      item_name: item.itemName || item.name || '-',
      standard: item.standard || item.specification || '',
      specification: item.standard || item.specification || '',
      method: item.method || '',
      inspection_method: item.method || '',
      quantity: item.actualValue ?? item.quantity ?? '',
      unit_name: item.unit || '',
      result,
      judgment: result,
      remark: item.remark || item.remarks || '',
      type_text: getQualityInspectionTypeText(item.type),
      result_is_passed: presentation?.type === 'success',
      result_is_failed: presentation?.type === 'danger',
      ...Object.fromEntries(Array.from({ length: MAX_INSPECTION_MEASUREMENT_COLUMNS }, (_, index) => [
        `measure_${index + 1}`, getMeasurement(item, index + 1)
      ])),
    }
  })
  const printData = {
    ...Object.fromEntries(reportSignatures.value.flatMap(({ role, name, code }) => [
      [`${role}_name`, name], [`${role}_signature`, code], [`${role}_signature_code`, code],
    ])),
    inspection_no: insp.inspectionNo || '',
    material_name: materialName,
    specs: insp.materialSpecs || insp.itemSpecs || insp.specs || '',
    product_code: insp.productCode || insp.materialCode || insp.itemCode || '',
    supplier_name: insp.supplierName || '',
    reference_no: insp.purchaseOrderNo || insp.referenceNo || '',
    batch_no: insp.batchNo || '',
    quantity: insp.quantity ?? insp.totalQuantity ?? 0,
    arrival_quantity: insp.arrivalQuantity ?? insp.receivedQuantity ?? insp.quantity ?? insp.totalQuantity ?? 0,
    sample_quantity: getInspectionSampleQuantity(insp) ?? '',
    unit: insp.unit || '',
    inspection_date: formatDate(insp.inspectionDate || insp.actualDate),
    status: insp.status || 'pending',
    status_text: getStatusText(insp.status),
    note: insp.note || '',
    material: insp.material || insp.materialType || '',
    inspection_basis: insp.inspectionBasis || insp.standardNo || insp.standardType || '',
    sampling_plan: getInspectionSamplingPlan(insp),
    unqualified_quantity: formatUnqualifiedQuantity(insp.unqualifiedQuantity),
    unqualified_rate: calculateUnqualifiedRate(
      insp.quantity ?? insp.totalQuantity,
      insp.unqualifiedQuantity,
      insp.unqualifiedRate
    ),
    major_defect: resolveMajorDefect(insp),
    disposition: insp.disposition || '',
    items: printItems,
    inspection_items: printItems,
    material_code: insp.materialCode || insp.itemCode || insp.productCode || '',
  }

  try {
    printing.value = true
    const templateType = getInspectionPrintTemplateType(insp)
    const html = await printService.generateByDefaultTemplate('quality', templateType, printData)
    await printService.previewDocument(html)
  } catch (error) {
    console.error('打印失败:', error)
    ElMessage.error(error.message || '打印失败')
  } finally {
    printing.value = false
  }
}
</script>
<style scoped>
.inspection-report { padding: 20px; border: 1px solid var(--color-border-lighter); border-radius: var(--radius-sm); background-color: var(--color-bg-section); }
.report-header { text-align: center; margin-bottom: var(--spacing-lg); }
.report-title { font-size: 22px; font-weight: bold; margin-bottom: 10px; }
.report-no { color: var(--color-text-regular); }
.report-info { display: flex; flex-wrap: wrap; margin-bottom: var(--spacing-lg); }
.report-info-item { width: 33.33%; margin-bottom: 10px; }
.report-info-label { font-weight: bold; margin-right: 8px; }
.report-standards { margin-bottom: var(--spacing-lg); }
.report-result { margin-top: var(--spacing-lg); display: flex; justify-content: space-between; }
.report-signature { margin-top: 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; padding: 10px 14px; background: var(--color-bg-base); border-radius: var(--radius-sm); border: 1px dashed var(--color-border-light); }
.signature-item { display: flex; align-items: center; gap: 8px; min-height: 32px; }
.report-signature-label { font-weight: bold; font-size: 13px; color: var(--color-text-primary); white-space: nowrap; }
.report-signature-val.signature-font { font-family: 'SPPLMFONT', sans-serif; font-size: 28px; line-height: 1; color: var(--color-text-primary); }
.report-signature-empty-line { display: inline-block; width: 45px; border-bottom: 1px solid var(--color-border-darker, #999); height: 12px; }
.report-signature-date { margin-left: 6px; color: var(--color-text-secondary); font-size: 12px; white-space: nowrap; }
</style>
