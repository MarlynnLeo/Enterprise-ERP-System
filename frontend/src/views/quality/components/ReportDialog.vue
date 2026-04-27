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
  <el-dialog v-model="dialogVisible" :title="`检验报告 - ${inspection?.inspectionNo || inspection?.inspection_no || ''}`" width="800px" destroy-on-close>
    <div ref="reportRef" class="inspection-report">
      <div class="report-header">
        <div class="report-title">来料检验报告</div>
        <div class="report-no">No. {{ inspection?.inspectionNo || inspection?.inspection_no }}</div>
      </div>

      <div class="report-info">
        <div class="report-info-item">
          <span class="report-info-label">物料名称:</span>
          <span>{{ inspection?.materialName || inspection?.material_name || inspection?.product_name || '-' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">产品型号:</span>
          <span>{{ inspection?.product_code || inspection?.specs || inspection?.material_specs || '-' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">供应商:</span>
          <span>{{ inspection?.supplierName || inspection?.supplier_name || '' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">采购单号:</span>
          <span>{{ inspection?.purchaseOrderNo || inspection?.reference_no }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">批次号:</span>
          <span>{{ inspection?.batchNo || inspection?.batch_no || '默认批次号' }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">检验数量:</span>
          <span>{{ Math.floor(inspection?.quantity || inspection?.total_quantity || 0) }} {{ inspection?.unit }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">检验日期:</span>
          <span>{{ formatDate(inspection?.inspectionDate || inspection?.actual_date) }}</span>
        </div>
        <div class="report-info-item">
          <span class="report-info-label">检验员:</span>
          <span>{{ inspection?.inspector || inspection?.inspector_name }}</span>
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
          <el-table-column prop="item_name" label="检验项目" min-width="150" show-overflow-tooltip />
          <el-table-column prop="standard" label="检验标准" min-width="150" show-overflow-tooltip />
          <el-table-column prop="type" label="检验类型" min-width="100" show-overflow-tooltip>
            <template #default="scope">{{ getQualityInspectionTypeText(scope.row.type) }}</template>
          </el-table-column>
          <el-table-column prop="is_critical" label="关键项" width="80" show-overflow-tooltip>
            <template #default="scope">
              <el-tag size="small" :type="scope.row.is_critical ? 'danger' : 'info'">{{ scope.row.is_critical ? '是' : '否' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="actual_value" label="实际值" min-width="120" show-overflow-tooltip />
          <el-table-column prop="result" label="结果" min-width="100" show-overflow-tooltip>
            <template #default="scope">
              <el-tag :type="scope.row.result === 'passed' ? 'success' : 'danger'">{{ scope.row.result === 'passed' ? '合格' : '不合格' }}</el-tag>
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
          <p v-if="inspection?.note">备注: {{ inspection?.note }}</p>
        </div>
      </div>

      <div class="report-signature">
        <div class="signature-item">
          <p>检验员: {{ inspection?.inspector || inspection?.inspector_name }}</p>
          <p>日期: {{ formatDate(inspection?.inspectionDate || inspection?.actual_date) }}</p>
        </div>
        <div class="signature-item">
          <p>审核人: ____________</p>
          <p>日期: ____________</p>
        </div>
      </div>
    </div>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">关闭</el-button>
        <el-button v-permission="'quality:inspections:view'" type="primary" @click="handlePrint">打印报告</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatDate } from '@/utils/helpers/dateUtils'
import { ElMessage } from 'element-plus'
import { qualityApi } from '@/services/api'
import api from '@/services/api'
import { getQualityInspectionTypeText } from '@/constants/systemConstants'
import printService from '@/services/printService'
import dayjs from 'dayjs'

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

// 辅助函数

const getStatusText = (status) => {
  const map = { pending: '待检验', inspecting: '检验中', passed: '合格', failed: '不合格', partial: '部分合格', critical: '关键项不合格', review: '待复检' }
  return map[status] || status || '-'
}

const getStatusType = (status) => {
  const map = { pending: 'info', inspecting: 'warning', passed: 'success', failed: 'danger', partial: 'warning', critical: 'danger', review: 'warning' }
  return map[status] || 'info'
}

// 打印报告
const handlePrint = () => {
  if (!props.inspection) {
    ElMessage.error('报告数据加载失败，请重试')
    return
  }

  const insp = props.inspection
  const printData = {
    inspection_no: insp.inspectionNo || insp.inspection_no || '',
    material_name: insp.materialName || insp.material_name || insp.product_name || '',
    specs: insp.specs || insp.material_specs || '',
    product_code: insp.product_code || '',
    supplier_name: insp.supplierName || insp.supplier_name || '',
    reference_no: insp.purchaseOrderNo || insp.reference_no || '',
    batch_no: insp.batchNo || insp.batch_no || '默认批次号',
    quantity: insp.quantity || insp.total_quantity || 0,
    unit: insp.unit || '',
    inspection_date: formatDate(insp.inspectionDate || insp.actual_date),
    inspector_name: insp.inspector || insp.inspector_name || '',
    status: insp.status || 'pending',
    status_text: getStatusText(insp.status),
    note: insp.note || '',
    items: (insp.items || []).map(item => ({
      ...item,
      type_text: getQualityInspectionTypeText(item.type),
      result_is_passed: item.result === 'passed'
    }))
  }

  // 尝试使用打印模板
  printService.getDefaultTemplate('quality', 'incoming_inspection')
    .then(response => {
      let template = null
      if (response.data?.content) template = response.data
      else if (response?.content) template = response
      else if (response.data?.data?.content) template = response.data.data

      if (template?.content) {
        try {
          const printContent = printService.generatePrintContent(template, printData)
          printService.printDocument(printContent)
        } catch (printError) {
          console.error('生成打印内容失败:', printError)
          ElMessage.warning('生成打印内容失败，使用备用打印方式')
          printWithLegacy()
        }
      } else {
        ElMessage.warning('未找到打印模板，使用备用打印方式')
        printWithLegacy()
      }
    })
    .catch(error => {
      console.error('获取打印模板出错:', error)
      ElMessage.warning('获取打印模板失败，使用备用打印方式')
      printWithLegacy()
    })
}

// Legacy 打印方法
const printWithLegacy = async () => {
  if (!reportRef.value) {
    ElMessage.error('报告内容加载失败，请重试')
    return
  }

  try {
    let templateContent = ''
    try {
      const response = await api.get('/print/templates', {
        params: { template_type: 'incoming_inspection', is_default: 1, status: 1 }
      })
      const templates = response.data?.list || response.data?.data || response.data || []
      const template = Array.isArray(templates) ? templates[0] : null
      if (template?.content) templateContent = template.content
    } catch (templateError) {
      console.error('获取打印模板失败:', templateError)
    }

    if (!templateContent) {
      ElMessage.warning('未找到来料检验打印模板，请在系统管理-打印管理中配置 incoming_inspection 类型模板')
      return
    }

    const printContent = reportRef.value.innerHTML
    templateContent = templateContent.replace(/{{content}}/g, printContent)
    templateContent = templateContent.replace(/{{inspection_no}}/g, props.inspection?.inspectionNo || '-')
    templateContent = templateContent.replace(/{{print_date}}/g, new Date().toLocaleDateString())
    templateContent = templateContent.replace(/{{print_time}}/g, new Date().toLocaleTimeString())

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      ElMessage.error('无法创建打印窗口，请检查是否允许弹出窗口')
      return
    }

    printWindow.document.write(templateContent)
    printWindow.document.close()
    printWindow.onload = () => {
      setTimeout(() => {
        try { printWindow.focus(); printWindow.print() }
        catch (err) { ElMessage.error(`打印失败: ${err.message}`) }
      }, 500)
    }
  } catch (error) {
    console.error('打印失败:', error)
    ElMessage.error('打印失败')
  }
}
</script>

<style scoped>
.inspection-report { padding: 20px; border: 1px solid #eee; border-radius: var(--radius-sm); background-color: #fcfcfc; }
.report-header { text-align: center; margin-bottom: var(--spacing-lg); }
.report-title { font-size: 22px; font-weight: bold; margin-bottom: 10px; }
.report-no { color: var(--color-text-regular); }
.report-info { display: flex; flex-wrap: wrap; margin-bottom: var(--spacing-lg); }
.report-info-item { width: 33.33%; margin-bottom: 10px; }
.report-info-label { font-weight: bold; margin-right: 8px; }
.report-standards { margin-bottom: var(--spacing-lg); }
.report-result { margin-top: var(--spacing-lg); display: flex; justify-content: space-between; }
.report-signature { margin-top: 40px; display: flex; justify-content: space-between; }
</style>
