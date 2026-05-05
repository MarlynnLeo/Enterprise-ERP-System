<!--
/**
 * InspectDialog.vue
 * @description 检验操作弹窗（最复杂的组件）
 * @date 2026-04-03
 * @version 1.0.0
 *
 * 职责：
 * - AQL 抽样切换与计算
 * - 检验模板自动加载
 * - 测量值输入矩阵（回车跳转、自动平均值、公差判定）
 * - 检验结果提交 + 后续入库单/不合格品流程引导
 */
-->
<template>
  <el-dialog v-model="dialogVisible" :title="`检验操作 - ${inspectionNo}`" :width="inspectDialogWidth" destroy-on-close>
    <el-form ref="inspectFormRef" :model="inspectForm" :rules="inspectRules" label-width="100px">
      <el-form-item label="检验项目" prop="items">
        <div class="inspection-items">
          <el-table :data="inspectForm.items" border>
            <el-table-column prop="item_name" label="检验项目" width="120" show-overflow-tooltip />
            <el-table-column prop="dimension_info" label="标准±公差" width="130" show-overflow-tooltip>
              <template #default="scope">{{ formatDimensionTolerance(scope.row) }}</template>
            </el-table-column>
            <!-- 动态测量值列：根据抽样数量自动增减 -->
            <el-table-column label="测量值" min-width="280">
              <template #default="scope">
                <div class="measure-grid">
                  <div class="measure-item" v-for="mIdx in currentSampleSize" :key="mIdx - 1">
                    <el-input
                      :ref="el => setMeasureInputRef(el, scope.$index, mIdx - 1)"
                      v-model="scope.row.measurements[mIdx - 1]"
                      size="small"
                      placeholder=""
                      @input="calculateAverageValue(scope.row)"
                      @blur="formatMeasureByIndex(scope.row, mIdx - 1); checkDimensionTolerance(scope.row, true)"
                      @keydown.enter="handleMeasureEnter(scope.$index, mIdx - 1, $event)"
                    />
                  </div>
                </div>
              </template>
            </el-table-column>
            <!-- 平均值/范围显示列 -->
            <el-table-column label="范围/平均" width="100">
              <template #default="scope">
                <div class="average-value-display">
                  <span :class="{'value-passed': scope.row.result === 'passed', 'value-failed': scope.row.result === 'failed'}">
                    {{ scope.row.actual_value || '-' }}
                  </span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="result" label="结果" width="110">
              <template #default="scope">
                <el-select
                  v-model="scope.row.result"
                  placeholder="结果"
                  size="small"
                  :class="{
                    'result-select-passed': scope.row.result === 'passed',
                    'result-select-failed': scope.row.result === 'failed'
                  }"
                >
                  <el-option label="合格" value="passed" style="color: var(--color-success); font-weight: bold;" />
                  <el-option label="不合格" value="failed" style="color: var(--color-danger); font-weight: bold;" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="80" show-overflow-tooltip>
              <template #default="scope">
                <el-input v-model="scope.row.remarks" placeholder="备注" size="small" />
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-form-item>

      <!-- AQL 标准选择区 -->
      <el-row :gutter="20">
        <el-col :span="8">
          <el-form-item label="AQL 抽样">
            <el-switch v-model="inspectForm.is_aql" @change="handleAqlChange" active-text="启用" />
          </el-form-item>
        </el-col>
        <el-col :span="8" v-if="inspectForm.is_aql">
          <el-form-item label="AQL 级别">
            <el-select v-model="inspectForm.aql_level" placeholder="请选择" @change="handleAqlChange" :loading="samplingLoading" style="width: 100px;">
              <el-option v-for="lvl in availableAqlLevels" :key="lvl" :label="lvl" :value="lvl" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="检验数量" prop="quantity">
            <el-input v-model="inspectForm.quantity" placeholder="请输入检验数量" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="合格数量" prop="qualified_quantity">
            <el-input v-model="inspectForm.qualified_quantity" @input="handleQualifiedQuantityChange" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="不合格数量" prop="unqualified_quantity">
            <el-input v-model="inspectForm.unqualified_quantity" placeholder="自动计算" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="检验员" prop="inspector_name">
            <el-input v-model="inspectForm.inspector_name" placeholder="请输入检验员姓名" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="检验日期" prop="inspectionDate">
        <el-date-picker v-model="inspectForm.inspectionDate" type="date" placeholder="选择检验日期" />
      </el-form-item>

      <el-form-item label="备注" prop="note">
        <el-input v-model="inspectForm.note" type="textarea" placeholder="请输入备注信息" :rows="3" />
      </el-form-item>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:inspections:create'" type="primary" @click="submitInspection" :loading="submitting">提交检验</el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 模板选择子弹窗 -->
  <TemplateSelectDialog
    v-model:visible="selectTemplateDialogVisible"
    :templates="inspectionTemplates"
    @select="selectTemplate"
    @cancel="handleCancelTemplateSelect"
  />
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { qualityApi, baseDataApi } from '@/services/api'
import { parseListData } from '@/utils/responseParser'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { calculateInspectionStatus, validateInspectionItems, createReceiptFromInspection } from '@/utils/inspectionHelpers'
import dayjs from 'dayjs'
import TemplateSelectDialog from './TemplateSelectDialog.vue'

const props = defineProps({
  visible: Boolean,
  row: { type: Object, default: null }
})

const emit = defineEmits(['update:visible', 'success'])
const router = useRouter()
const authStore = useAuthStore()

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const inspectionNo = computed(() => props.row?.inspectionNo || props.row?.inspection_no || '')

// 表单引用和状态
const inspectFormRef = ref(null)
const submitting = ref(false)
const samplingLoading = ref(false)
const currentSampleSize = ref(1)
const currentInspectionData = ref(null) // 保存完整检验数据用于后续操作

// 对话框宽度根据测量值数量动态计算
const inspectDialogWidth = computed(() => {
  if (currentSampleSize.value <= 3) return '850px'
  if (currentSampleSize.value <= 6) return '900px'
  if (currentSampleSize.value <= 10) return '1000px'
  return '1100px'
})

// 检验表单
const inspectForm = reactive({
  id: '',
  inspection_no: '',
  quantity: '',
  qualified_quantity: '',
  unqualified_quantity: '',
  inspector_name: '',
  inspectionDate: new Date(),
  items: [],
  note: '',
  is_aql: false,
  aql_standard_id: null,
  aql_level: null,
  accept_limit: 0,
  reject_limit: 1
})

// 检验表单验证规则
const inspectRules = {
  quantity: [{ required: true, message: '请输入检验数量', trigger: 'blur' }],
  qualified_quantity: [
    { required: true, message: '请输入合格数量', trigger: 'change' },
    {
      validator: (rule, value, callback) => {
        if (value === '' || value === null || value === undefined) callback(new Error('合格数量不能为空'))
        else {
          const qty = parseFloat(value)
          const totalQty = parseFloat(inspectForm.quantity)
          if (isNaN(qty)) callback(new Error('请输入有效的数字'))
          else if (qty < 0) callback(new Error('合格数量不能为负数'))
          else if (qty > totalQty) callback(new Error('合格数量不能大于检验数量'))
          else callback()
        }
      },
      trigger: 'change'
    }
  ],
  inspector_name: [{ required: true, message: '请输入检验员姓名', trigger: 'blur' }],
  inspectionDate: [{ required: true, message: '请选择检验日期', trigger: 'change' }]
}

// AQL 相关
const aqlStandardsList = ref([])
const availableAqlLevels = ref([])

// 模板相关
const inspectionTemplateId = ref(null)
const inspectionTemplates = ref([])
const currentTemplateItems = ref([])
const selectTemplateDialogVisible = ref(false)

// 测量值输入框引用
const measureInputRefs = ref([])

// AQL 标准加载
const fetchAqlStandards = async () => {
  try {
    const res = await qualityApi.getAqlStandards({ status: 'active', limit: 100 })
    const items = res.data?.items || res.items || res.data || []
    aqlStandardsList.value = items
    const levels = new Set()
    items.forEach(std => levels.add(std.aql_level))
    availableAqlLevels.value = Array.from(levels).sort((a, b) => a - b)
  } catch (err) {
    console.error('获取AQL标准失败:', err)
  }
}

// 监听弹窗打开
watch(() => props.visible, async (val) => {
  if (val && props.row) {
    await fetchAqlStandards()
    await loadInspectionData()
  }
})

// 加载检验数据
const loadInspectionData = async () => {
  try {
    const response = await qualityApi.getIncomingInspection(props.row.id)
    const respData = response?.data
    const inspectionData = respData?.data || (respData?.id ? respData : null)

    if (!inspectionData) {
      ElMessage.error('获取检验单详情失败')
      dialogVisible.value = false
      return
    }

    currentInspectionData.value = inspectionData

    // 获取物料型号
    if (!inspectionData.specs && inspectionData.material_id) {
      try {
        const materialInfo = await baseDataApi.getMaterial(inspectionData.material_id)
        if (materialInfo?.data?.specs) inspectionData.specs = materialInfo.data.specs
      } catch { /* 忽略 */ }
    }

    // 填充表单
    inspectForm.id = inspectionData.id
    inspectForm.inspection_no = inspectionData.inspection_no
    inspectForm.quantity = inspectionData.quantity || ''
    inspectForm.qualified_quantity = inspectionData.qualified_quantity || ''
    inspectForm.unqualified_quantity = inspectionData.unqualified_quantity || ''
    inspectForm.inspector_name = authStore.user?.real_name || ''
    inspectForm.inspectionDate = new Date()
    inspectForm.note = inspectionData.note || ''
    inspectForm.is_aql = !!inspectionData.is_aql
    inspectForm.aql_level = inspectionData.aql_level || null
    inspectForm.aql_standard_id = inspectionData.aql_standard_id || null
    inspectForm.accept_limit = inspectionData.accept_limit || 0
    inspectForm.reject_limit = inspectionData.reject_limit || 1

    // 设置检验项
    const hasExistingItems = inspectionData.items && inspectionData.items.length > 0
    if (hasExistingItems) {
      inspectForm.items = mapInspectionItems(inspectionData.items)
    } else {
      await fetchInspectionTemplates(inspectionData.material_id)
      if (!currentTemplateItems.value || currentTemplateItems.value.length === 0) {
        inspectForm.items = []
        ElMessage.warning('当前物料未匹配检验模板，请先维护检验模板')
      } else {
        inspectForm.items = mapInspectionItems(currentTemplateItems.value)
      }
    }

    // 如果 AQL 已启用，自动触发计算
    if (inspectForm.is_aql && inspectForm.aql_level && inspectForm.quantity > 0) {
      await handleAqlChange()
    }

    measureInputRefs.value = []
  } catch (error) {
    console.error('获取检验单详情失败:', error)
    ElMessage.error(`获取检验单详情失败: ${error.message}`)
    dialogVisible.value = false
  }
}

// ===== 模板相关 =====
const fetchInspectionTemplates = async (materialId) => {
  if (!materialId) return
  try {
    const response = await qualityApi.getTemplates({ material_type: materialId, inspection_type: 'incoming', status: 'active', include_general: true, pageSize: 100, page: 1 })
    const allTemplates = parseListData(response, { enableLog: false })

    const specificTemplates = allTemplates.filter(t => {
      if (String(t.material_type) === String(materialId)) return true
      if (t.material_types) {
        try {
          const types = typeof t.material_types === 'string' ? JSON.parse(t.material_types) : t.material_types
          if (Array.isArray(types) && types.map(String).includes(String(materialId))) return true
        } catch { /* 忽略 */ }
      }
      return false
    })
    const generalTemplates = allTemplates.filter(t => t.is_general)
    const effectiveTemplates = specificTemplates.length > 0 ? specificTemplates : generalTemplates
    inspectionTemplates.value = effectiveTemplates

    if (effectiveTemplates.length === 1) {
      const tmpl = effectiveTemplates[0]
      inspectionTemplateId.value = tmpl.id
      currentTemplateItems.value = tmpl.items || tmpl.InspectionItems || []
      applyTemplateAql(tmpl)
      if (tmpl.is_general) ElMessage.info(`已自动使用来料通用模板: ${tmpl.template_name}`)
    } else if (effectiveTemplates.length > 1) {
      selectTemplateDialogVisible.value = true
    }
  } catch (error) {
    console.error('获取检验模板失败:', error)
  }
}

const selectTemplate = (templateId) => {
  inspectionTemplateId.value = templateId
  const selectedTemplate = inspectionTemplates.value.find(t => t.id === templateId)
  if (selectedTemplate) {
    const templateItems = selectedTemplate.items || selectedTemplate.InspectionItems || []
    currentTemplateItems.value = templateItems
    inspectForm.items = mapInspectionItems(templateItems)
    applyTemplateAql(selectedTemplate)
  }
  selectTemplateDialogVisible.value = false
  ElMessage.success('检验模板应用成功')
}

const handleCancelTemplateSelect = () => {
  if (!inspectForm.items || inspectForm.items.length === 0) {
    inspectForm.items = []
    ElMessage.warning('未选择检验模板，不能自动生成检验项')
  }
}

const applyTemplateAql = async (tmpl) => {
  if (!tmpl) return
  const isAql = tmpl.is_aql === true || tmpl.is_aql === 1
  inspectForm.is_aql = isAql
  if (isAql && tmpl.aql_level) {
    inspectForm.aql_level = String(tmpl.aql_level)
    await handleAqlChange()
  } else {
    inspectForm.aql_level = null
    inspectForm.aql_standard_id = null
  }
}

// ===== AQL 相关 =====
const handleAqlChange = async () => {
  if (inspectForm.is_aql && inspectForm.quantity > 0 && inspectForm.aql_level) {
    samplingLoading.value = true
    try {
      const res = await qualityApi.calculateAqlSampling({ batchSize: inspectForm.quantity, aqlLevel: inspectForm.aql_level })
      const unwrappedData = res.data || res
      const data = unwrappedData.data || unwrappedData

      if (data && data.sample_size) {
        inspectForm.aql_standard_id = data.aql_standard_id || data.id || data.aqlStandard?.id
        inspectForm.accept_limit = data.accept_limit
        inspectForm.reject_limit = data.reject_limit
        currentSampleSize.value = data.sample_size
        resizeAllMeasurements(data.sample_size)
        ElMessage.success(`匹配到 AQL 抽样: n=${data.sample_size}, Ac=${data.accept_limit}, Re=${data.reject_limit}`)
      }
    } catch (err) {
      console.error('AQL计算失败:', err)
      ElMessage.warning('未能匹配到适用的 AQL 标准，请检查批量大小和级别。')
      inspectForm.aql_standard_id = null
      inspectForm.accept_limit = 0
      inspectForm.reject_limit = 1
    } finally {
      samplingLoading.value = false
    }
  } else {
    inspectForm.aql_standard_id = null
    inspectForm.accept_limit = 0
    inspectForm.reject_limit = 1
    currentSampleSize.value = 1
    resizeAllMeasurements(1)
  }
}

const resizeAllMeasurements = (newSize) => {
  if (!inspectForm.items) return
  inspectForm.items.forEach(item => {
    if (!item.measurements || !Array.isArray(item.measurements)) {
      item.measurements = Array(newSize).fill('')
    } else {
      const old = item.measurements
      const newArr = Array(newSize).fill('')
      for (let i = 0; i < Math.min(old.length, newSize); i++) newArr[i] = old[i]
      item.measurements = newArr
    }
  })
}

// ===== 测量值相关 =====
const mapInspectionItems = (items) => {
  const size = currentSampleSize.value
  return items.map(item => {
    let measurements = []
    if (item.measurements && Array.isArray(item.measurements)) {
      measurements = [...item.measurements]
    } else {
      for (let i = 1; i <= Math.max(size, 1); i++) measurements.push(item[`measure_${i}`] || '')
    }
    while (measurements.length < size) measurements.push('')
    if (measurements.length > size) measurements.length = size

    return {
      ...item,
      measurements,
      dimension_value: item.dimension_value || null,
      tolerance_upper: item.tolerance_upper || null,
      tolerance_lower: item.tolerance_lower || null,
      actual_value: item.actual_value || '',
      result: item.result || '',
      remarks: item.remarks || ''
    }
  })
}

const setMeasureInputRef = (el, rowIndex, colIndex) => {
  if (!el) return
  if (!measureInputRefs.value[rowIndex]) measureInputRefs.value[rowIndex] = []
  measureInputRefs.value[rowIndex][colIndex] = el
}

const handleMeasureEnter = (rowIndex, colIndex, event) => {
  event.preventDefault()
  if (!measureInputRefs.value[rowIndex]) return

  let nextRowIndex = rowIndex
  let nextColIndex = colIndex + 1
  if (nextColIndex >= currentSampleSize.value) {
    nextColIndex = 0
    nextRowIndex = rowIndex + 1
    if (nextRowIndex >= measureInputRefs.value.length) nextRowIndex = 0
  }

  const nextInput = measureInputRefs.value[nextRowIndex]?.[nextColIndex]
  if (nextInput) {
    nextTick(() => {
      if (nextInput.$el) {
        const inputElement = nextInput.$el.querySelector('input')
        if (inputElement) { inputElement.focus(); inputElement.select() }
      }
    })
  }
}

const formatMeasureByIndex = (item, index) => {
  const value = item.measurements[index]
  if (value === null || value === undefined || value === '') return
  const num = parseFloat(value)
  if (!isNaN(num)) item.measurements[index] = num.toFixed(2)
}

const calculateAverageValue = (item) => {
  if (!item.measurements) return
  const measures = item.measurements.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v))).map(v => parseFloat(v))
  if (measures.length === 0) { item.actual_value = ''; return }

  const sum = measures.reduce((acc, val) => acc + val, 0)
  const avg = sum / measures.length
  if (measures.length >= 2) {
    item.actual_value = `${Math.min(...measures).toFixed(2)}-${Math.max(...measures).toFixed(2)}`
  } else {
    item.actual_value = avg.toFixed(2)
  }
  item._averageValue = avg
  checkDimensionTolerance(item, false)
}

const formatDimensionTolerance = (item) => {
  if (!item.dimension_value) return '-'
  const dimensionValue = parseFloat(item.dimension_value)
  const upper = parseFloat(item.tolerance_upper) || 0
  const lower = Math.abs(parseFloat(item.tolerance_lower)) || 0
  if (upper === 0 && lower === 0) return dimensionValue.toFixed(2)
  return `${dimensionValue.toFixed(2)} (+${upper.toFixed(2)}/-${lower.toFixed(2)})`
}

const checkDimensionTolerance = (item) => {
  if (!item.dimension_value) return
  const dimensionValue = parseFloat(item.dimension_value)
  const toleranceUpper = parseFloat(item.tolerance_upper) || 0
  const toleranceLower = parseFloat(item.tolerance_lower) || 0
  if (isNaN(dimensionValue)) return

  const maxAllowed = dimensionValue + toleranceUpper
  const minAllowed = dimensionValue - Math.abs(toleranceLower)
  const measurements = item.measurements || []
  const measures = measurements.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v))).map(v => parseFloat(v))
  if (measures.length === 0) return

  const outOfRangeMeasures = measures.filter(m => m < minAllowed || m > maxAllowed)
  const defectCount = outOfRangeMeasures.length

  if (inspectForm.is_aql && inspectForm.aql_standard_id) {
    const ac = parseInt(inspectForm.accept_limit) || 0
    const re = parseInt(inspectForm.reject_limit) || 1
    if (defectCount >= re) item.result = 'failed'
    else if (defectCount <= ac) item.result = 'passed'
  } else {
    item.result = defectCount > 0 ? 'failed' : 'passed'
  }
}

// ===== 数量计算 =====
const handleQualifiedQuantityChange = () => {
  const totalQuantity = parseFloat(inspectForm.quantity) || 0
  const qualifiedQuantity = parseFloat(inspectForm.qualified_quantity) || 0
  if (qualifiedQuantity > totalQuantity) {
    ElMessage.warning('合格数量不能超过检验数量')
    inspectForm.qualified_quantity = totalQuantity
    inspectForm.unqualified_quantity = 0
    return
  }
  inspectForm.unqualified_quantity = (totalQuantity - qualifiedQuantity).toFixed(2)
}

// ===== 提交检验 =====
const submitInspection = async () => {
  if (!inspectFormRef.value) return
  if (submitting.value) { ElMessage.warning('正在提交中，请勿重复操作'); return }
  submitting.value = true

  try {
    await inspectFormRef.value.validate()

    const validation = validateInspectionItems(inspectForm.items)
    if (!validation.valid) { ElMessage.warning(validation.message); submitting.value = false; return }

    const status = calculateInspectionStatus(inspectForm.items)

    const submitData = {
      id: inspectForm.id,
      inspection_no: inspectForm.inspection_no,
      items: inspectForm.items.map(item => {
        const mapped = { ...item }
        if (item.measurements && Array.isArray(item.measurements)) {
          item.measurements.forEach((val, idx) => { mapped[`measure_${idx + 1}`] = val || '' })
        }
        delete mapped.measurements
        delete mapped._averageValue
        return mapped
      }),
      quantity: inspectForm.quantity,
      qualified_quantity: parseFloat(inspectForm.qualified_quantity) || 0,
      unqualified_quantity: parseFloat(inspectForm.unqualified_quantity) || 0,
      inspector_name: inspectForm.inspector_name,
      actual_date: dayjs(inspectForm.inspectionDate).format('YYYY-MM-DD'),
      note: inspectForm.note,
      status,
      is_aql: inspectForm.is_aql,
      aql_standard_id: inspectForm.aql_standard_id,
      aql_level: inspectForm.aql_level,
      accept_limit: inspectForm.accept_limit,
      reject_limit: inspectForm.reject_limit
    }

    const response = await qualityApi.updateIncomingInspection(submitData.id, submitData)
    const respData = response?.data
    const isSuccess = respData?.success === true || respData?.id || (respData && !respData.error && !respData.message?.includes('失败'))

    if (isSuccess) {
      ElMessage.success('检验提交成功')

      // 根据结果处理
      if (status === 'passed') await promptCreateReceipt(submitData.id, false)
      else if (status === 'partial') await handlePartialInspectionResult(submitData.id, submitData.qualified_quantity, submitData.unqualified_quantity)
      else if (status === 'failed') await handleFailedInspectionResult(submitData.id, submitData.unqualified_quantity)

      dialogVisible.value = false
      emit('success')
    } else {
      ElMessage.error(respData?.message || '检验提交失败')
    }
  } catch (error) {
    console.error('检验提交失败:', error)
    ElMessage.error(`检验提交失败: ${error.message}`)
  } finally {
    submitting.value = false
  }
}

// ===== 后续流程引导 =====
const promptCreateReceipt = async (inspectionId, isReview) => {
  try {
    await ElMessageBox.confirm(`检验已完成，是否自动创建采购入库单？`, '提示', { confirmButtonText: '创建入库单', cancelButtonText: '暂不创建', type: 'success' })
    const inspectionDetail = await qualityApi.getIncomingInspection(inspectionId)
    await createReceiptFromInspection(inspectionDetail.data, authStore, isReview)
    ElMessage.success('采购入库单创建成功')
  } catch (error) {
    if (error !== 'cancel') { console.error('创建入库单失败:', error); ElMessage.error(`创建入库单失败: ${error.message}`) }
    else ElMessage.info('已取消创建入库单')
  }
}

const handlePartialInspectionResult = async (inspectionId, qualifiedQty, unqualifiedQty) => {
  try {
    const result = await ElMessageBox.confirm(
      `检验完成！合格数量: ${qualifiedQty}, 不合格数量: ${unqualifiedQty}\n\n• 合格部分可以创建入库单进行入库\n• 不合格部分已自动创建不合格品记录,需要选择处理方式(退货/换货/让步接收等)\n\n是否现在创建入库单(仅入库合格部分)?`,
      '部分合格 - 需要处理', { confirmButtonText: '创建入库单', cancelButtonText: '稍后处理', type: 'warning', distinguishCancelAndClose: true, showClose: true }
    )
    if (result === 'confirm') {
      const inspectionDetail = await qualityApi.getIncomingInspection(inspectionId)
      await createReceiptFromInspection(inspectionDetail.data, authStore, false)
      ElMessage.success('入库单创建成功(仅入库合格部分)')
      setTimeout(() => {
        ElMessageBox.confirm(`入库单已创建。\n\n不合格品(${unqualifiedQty})需要处理,是否前往不合格品管理页面?`, '提示',
          { confirmButtonText: '前往处理', cancelButtonText: '稍后处理', type: 'info' }
        ).then(() => { router.push({ path: '/quality/nonconforming', query: { inspection_id: inspectionId } }) })
          .catch(() => { ElMessage.info('请记得及时处理不合格品') })
      }, 500)
    }
  } catch (error) {
    if (error === 'cancel' || error === 'close') {
      ElMessageBox.alert(`检验已完成,但未创建入库单。\n\n• 合格部分(${qualifiedQty})可稍后在检验单列表中创建入库单\n• 不合格部分(${unqualifiedQty})已创建不合格品记录,请前往"质量管理 > 不合格品管理"进行处理`, '温馨提示',
        { confirmButtonText: '我知道了', type: 'info' })
    } else {
      ElMessage.error(`处理失败: ${error.message}`)
    }
  }
}

const handleFailedInspectionResult = async (inspectionId, unqualifiedQty) => {
  try {
    await ElMessageBox.alert(
      `检验完成,全部不合格(${unqualifiedQty})！\n\n系统已自动创建不合格品记录,请选择处理方式：\n• 退货 - 退回供应商\n• 换货 - 要求供应商更换合格品\n• 让步接收 - 降级使用或特殊处理\n• 报废 - 直接报废处理\n\n是否前往不合格品管理页面进行处理?`,
      '全部不合格 - 需要处理', { confirmButtonText: '前往处理', cancelButtonText: '稍后处理', type: 'error', showCancelButton: true }
    ).then(() => { router.push({ path: '/quality/nonconforming', query: { inspection_id: inspectionId } }) })
  } catch (error) {
    if (error === 'cancel') ElMessage.warning('请记得及时处理不合格品,避免影响生产')
  }
}
</script>

<style scoped>
.inspection-items { width: 100%; max-width: 100%; overflow: hidden; }

.measure-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.measure-item { display: flex; align-items: center; gap: 2px; }
.measure-grid .el-input { width: 55px; flex: 0 0 auto; }

.average-value-display { text-align: center; font-weight: bold; font-size: 13px; }
.average-value-display .value-passed { color: var(--color-success); }
.average-value-display .value-failed { color: var(--color-danger); }

/* 结果选择器样式 */
:deep(.result-select-passed .el-input__wrapper) { background-color: #f0f9ff !important; border-color: var(--color-success) !important; box-shadow: 0 0 0 1px #67C23A inset !important; }
:deep(.result-select-passed .el-input__inner) { color: var(--color-success) !important; font-weight: var(--font-weight-bold) !important; }
:deep(.result-select-passed.el-select .el-input.is-focus .el-input__wrapper) { box-shadow: 0 0 0 1px #67C23A inset !important; }
:deep(.result-select-failed .el-input__wrapper) { background-color: #fef0f0 !important; border-color: var(--color-danger) !important; box-shadow: 0 0 0 1px #F56C6C inset !important; }
:deep(.result-select-failed .el-input__inner) { color: var(--color-danger) !important; font-weight: var(--font-weight-bold) !important; }
:deep(.result-select-failed.el-select .el-input.is-focus .el-input__wrapper) { box-shadow: 0 0 0 1px #F56C6C inset !important; }
</style>
