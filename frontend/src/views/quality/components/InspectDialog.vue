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
  <AppDialog
    v-model="dialogVisible"
    :title="`检验操作 - ${inspectionNo}`"
    mode="form"
    :width="inspectDialogWidth"
  >
    <el-form ref="inspectFormRef" :model="inspectForm" :rules="inspectRules" label-width="100px">
      <el-alert
        v-if="inspectionTemplateSource"
        :title="inspectionTemplateSource"
        type="info"
        show-icon
        :closable="false"
        class="mb-md"
      />
      <el-form-item label="检验项目" prop="items">
        <div class="inspection-items">
          <el-table :data="inspectForm.items" border>
            <el-table-column prop="itemName" label="检验项目" width="120" show-overflow-tooltip />
            <el-table-column prop="dimensionInfo" label="标准±公差" width="130" show-overflow-tooltip>
              <template #default="scope">{{ formatDimensionTolerance(scope.row) }}</template>
            </el-table-column>
            <!-- 动态测量值列：根据抽样数量自动增减 -->
            <el-table-column label="测量值" min-width="320">
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
                    {{ scope.row.actualValue || '-' }}
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
                  <el-option label="合格" value="passed" class="text-success font-weight-700" />
                  <el-option label="不合格" value="failed" class="text-danger font-weight-700" />
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
            <el-select v-model="inspectForm.aqlLevel" placeholder="请选择" @change="handleAqlChange" :loading="samplingLoading" class="form-control-100">
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
          <el-form-item label="合格数量" prop="qualifiedQuantity">
            <el-input v-model="inspectForm.qualifiedQuantity" @input="handleQualifiedQuantityChange" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="不合格数量" prop="unqualifiedQuantity">
            <el-input v-model="inspectForm.unqualifiedQuantity" placeholder="自动计算" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="检验员" prop="inspectorName">
            <el-input v-model="inspectForm.inspectorName" placeholder="请输入检验员姓名" />
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
        <el-button v-permission="'quality:inspections:update'" type="primary" @click="submitInspection" :loading="submitting">提交检验</el-button>
      </span>
    </template>
    </AppDialog>

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
import { qualityApi, baseDataApi } from '@/api'
import { parseListData } from '@/utils/responseParser'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  calculateInspectionStatus,
  validateInspectionItems,
  normalizeInspectionMeasurements,
  getInspectionMeasurementColumnCount,
  MAX_INSPECTION_MEASUREMENT_COLUMNS
} from '@/utils/inspectionHelpers'
import dayjs from 'dayjs'
import TemplateSelectDialog from './TemplateSelectDialog.vue'
import {
  getTemplateItems,
  getTemplateSourceText,
  isGeneralInspectionTemplate,
  resolveEffectiveInspectionTemplates
} from '@/utils/inspectionTemplateResolver'

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

const inspectionNo = computed(() => props.row?.inspectionNo || props.row?.inspectionNo || '')

// 表单引用和状态
const inspectFormRef = ref(null)
const submitting = ref(false)
const samplingLoading = ref(false)
const currentSampleSize = ref(MAX_INSPECTION_MEASUREMENT_COLUMNS)
const currentInspectionData = ref(null) // 保存完整检验数据用于后续操作

// 对话框宽度根据测量值数量动态计算
const inspectDialogWidth = computed(() => {
  if (currentSampleSize.value <= 3) return '900px'
  if (currentSampleSize.value <= MAX_INSPECTION_MEASUREMENT_COLUMNS) return '1100px'
  if (currentSampleSize.value <= 10) return '1000px'
  return '1100px'
})

// 检验表单
const inspectForm = reactive({
  id: '',
  inspection_no: '',
  quantity: '',
  qualifiedQuantity: '',
  unqualifiedQuantity: '',
  inspectorName: '',
  inspectionDate: new Date(),
  items: [],
  note: '',
  is_aql: false,
  aql_standard_id: null,
  aqlLevel: null,
  acceptLimit: 0,
  rejectLimit: 1,
  accept_limit: 0,
  reject_limit: 1
})

// 检验表单验证规则
const inspectRules = {
  quantity: [{ required: true, message: '请输入检验数量', trigger: 'blur' }],
  qualifiedQuantity: [
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
  inspectorName: [{ required: true, message: '请输入检验员姓名', trigger: 'blur' }],
  inspectionDate: [{ required: true, message: '请选择检验日期', trigger: 'change' }]
}

// AQL 相关
const aqlStandardsList = ref([])
const availableAqlLevels = ref([])

// 模板相关
const inspectionTemplateId = ref(null)
const inspectionTemplateName = ref('')
const inspectionTemplateSource = ref('')
const inspectionTemplates = ref([])
const currentTemplateItems = ref([])
const selectTemplateDialogVisible = ref(false)

// 测量值输入框引用
const measureInputRefs = ref([])

// AQL 标准加载
const fetchAqlStandards = async () => {
  try {
    const res = await qualityApi.getAqlStandards({ status: 'active', limit: 50 })
    const items = res.data?.items || res.items || res.data || []
    aqlStandardsList.value = items
    const levels = new Set()
    items.forEach(std => levels.add(std.aqlLevel))
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
    // 每次打开检验单时先恢复默认的五个测量输入位；已有值再按实际数量收缩。
    currentSampleSize.value = MAX_INSPECTION_MEASUREMENT_COLUMNS
    measureInputRefs.value = []
    const response = await qualityApi.getIncomingInspection(props.row.id)
    const respData = response?.data
    const inspectionData = respData?.data || (respData?.id ? respData : null)

    if (!inspectionData) {
      ElMessage.error('获取检验单详情失败')
      dialogVisible.value = false
      return
    }

    currentInspectionData.value = inspectionData
    inspectionTemplateId.value = inspectionData.templateId || null
    inspectionTemplateName.value = inspectionData.templateName || ''
    inspectionTemplateSource.value = inspectionData.templateName ? `已引用模板：${inspectionData.templateName}` : ''

    // 获取物料型号
    if (!inspectionData.specs && inspectionData.materialId) {
      try {
        const materialInfo = await baseDataApi.getMaterial(inspectionData.materialId)
        if (materialInfo?.data?.specs) inspectionData.specs = materialInfo.data.specs
      } catch (error) {
        console.warn('获取物料型号失败:', error)
      }
    }

    // 填充表单
    inspectForm.id = inspectionData.id
    inspectForm.inspectionNo = inspectionData.inspectionNo
    inspectForm.quantity = inspectionData.quantity || ''
    inspectForm.qualifiedQuantity = inspectionData.qualifiedQuantity || ''
    inspectForm.unqualifiedQuantity = inspectionData.unqualifiedQuantity || ''
    inspectForm.inspectorName = authStore.user?.realName || ''
    inspectForm.inspectionDate = new Date()
    inspectForm.note = inspectionData.note || ''
    inspectForm.is_aql = inspectionData.isAql ?? !!inspectionData.is_aql
    inspectForm.aqlLevel = inspectionData.aqlLevel ?? inspectionData.aql_level ?? null
    inspectForm.aql_standard_id = inspectionData.aqlStandardId ?? inspectionData.aql_standard_id ?? null
    inspectForm.acceptLimit = inspectionData.acceptLimit ?? inspectionData.accept_limit ?? 0
    inspectForm.rejectLimit = inspectionData.rejectLimit ?? inspectionData.reject_limit ?? 1

    // 设置检验项
    const hasExistingItems = inspectionData.items && inspectionData.items.length > 0
    if (hasExistingItems) {
      // 已保存的测量值决定当前输入矩阵的列数，避免打开已有记录时退回到 1 列。
      const existingCount = getExistingMeasurementCount(inspectionData.items)
      currentSampleSize.value = existingCount > 0 ? existingCount : MAX_INSPECTION_MEASUREMENT_COLUMNS
      inspectForm.items = mapInspectionItems(inspectionData.items)
    } else {
      await fetchInspectionTemplates(inspectionData.materialId)
      if (!currentTemplateItems.value || currentTemplateItems.value.length === 0) {
        inspectForm.items = []
        ElMessage.warning('当前物料未匹配检验模板，请先维护检验模板')
      } else {
        inspectForm.items = mapInspectionItems(currentTemplateItems.value)
      }
    }

    // 如果 AQL 已启用，自动触发计算
    if (inspectForm.is_aql && inspectForm.aqlLevel && inspectForm.quantity > 0 && !hasExistingMeasurements(inspectionData.items)) {
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
    const response = await qualityApi.getTemplates({ material_type: materialId, inspection_type: 'incoming', status: 'active', include_general: true, pageSize: 50, page: 1 })
    const allTemplates = parseListData(response, { enableLog: false })

    // 后端已按当前物料过滤：专属模板优先，通用模板作为兜底。
    const specificTemplates = allTemplates.filter(t => !isGeneralInspectionTemplate(t))
    const generalTemplates = allTemplates.filter(isGeneralInspectionTemplate)
    const effectiveTemplates = resolveEffectiveInspectionTemplates([...specificTemplates, ...generalTemplates])
    inspectionTemplates.value = effectiveTemplates

    if (
      effectiveTemplates.length === 1 ||
      effectiveTemplates.every(isGeneralInspectionTemplate)
    ) {
      const tmpl = effectiveTemplates[0]
      inspectionTemplateId.value = tmpl.id
      inspectionTemplateName.value = tmpl.templateName || ''
      inspectionTemplateSource.value = getTemplateSourceText(tmpl)
      currentTemplateItems.value = getTemplateItems(tmpl)
      applyTemplateAql(tmpl)
      if (isGeneralInspectionTemplate(tmpl)) ElMessage.info(`已自动使用来料通用模板: ${tmpl.templateName}`)
    } else if (effectiveTemplates.length > 1) {
      selectTemplateDialogVisible.value = true
    } else {
      inspectionTemplateId.value = null
      inspectionTemplateName.value = ''
      inspectionTemplateSource.value = ''
      currentTemplateItems.value = []
    }
  } catch (error) {
    console.error('获取检验模板失败:', error)
  }
}

const selectTemplate = (templateId) => {
  inspectionTemplateId.value = templateId
  const selectedTemplate = inspectionTemplates.value.find(t => t.id === templateId)
  if (selectedTemplate) {
    const templateItems = getTemplateItems(selectedTemplate)
    inspectionTemplateName.value = selectedTemplate.templateName || ''
    inspectionTemplateSource.value = getTemplateSourceText(selectedTemplate)
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
  if (isAql && tmpl.aqlLevel) {
    inspectForm.aqlLevel = String(tmpl.aqlLevel)
    await handleAqlChange()
  } else {
    inspectForm.aqlLevel = null
    inspectForm.aql_standard_id = null
  }
}

// ===== AQL 相关 =====
const handleAqlChange = async () => {
  if (inspectForm.is_aql && inspectForm.quantity > 0 && inspectForm.aqlLevel) {
    samplingLoading.value = true
    try {
      const res = await qualityApi.calculateAqlSampling({ batchSize: inspectForm.quantity, aqlLevel: inspectForm.aqlLevel })
      const unwrappedData = res.data || res
      const data = unwrappedData.data || unwrappedData

      const rawSampleSize = Number(data?.sampleSize ?? data?.sample_size)
      const sampleSize = Math.min(MAX_INSPECTION_MEASUREMENT_COLUMNS, rawSampleSize)
      if (data && Number.isFinite(sampleSize) && sampleSize > 0) {
        const aqlStandardId = data.aqlStandardId ?? data.aql_standard_id ?? data.id ?? data.aqlStandard?.id
        const acceptLimit = data.acceptLimit ?? data.accept_limit ?? 0
        const rejectLimit = data.rejectLimit ?? data.reject_limit ?? 1
        inspectForm.aql_standard_id = aqlStandardId
        inspectForm.acceptLimit = acceptLimit
        inspectForm.rejectLimit = rejectLimit
        currentSampleSize.value = sampleSize
        resizeAllMeasurements(sampleSize)
        ElMessage.success(`匹配到 AQL 抽样: n=${rawSampleSize}，录入前${sampleSize}个样本，Ac=${acceptLimit}, Re=${rejectLimit}`)
      }
    } catch (err) {
      console.error('AQL计算失败:', err)
      ElMessage.warning('未能匹配到适用的 AQL 标准，请检查批量大小和级别。')
      inspectForm.aql_standard_id = null
      inspectForm.acceptLimit = 0
      inspectForm.rejectLimit = 1
    } finally {
      samplingLoading.value = false
    }
  } else {
    inspectForm.aql_standard_id = null
    inspectForm.acceptLimit = 0
    inspectForm.rejectLimit = 1
    currentSampleSize.value = MAX_INSPECTION_MEASUREMENT_COLUMNS
    resizeAllMeasurements(MAX_INSPECTION_MEASUREMENT_COLUMNS)
  }
}

const resizeAllMeasurements = (newSize) => {
  newSize = Math.min(MAX_INSPECTION_MEASUREMENT_COLUMNS, Math.max(1, Number(newSize) || 1))
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
  const size = Math.min(
    MAX_INSPECTION_MEASUREMENT_COLUMNS,
    Math.max(currentSampleSize.value, getInspectionMeasurementColumnCount(items, MAX_INSPECTION_MEASUREMENT_COLUMNS))
  )
  currentSampleSize.value = size
  return items.map(item => {
    const measurements = normalizeInspectionMeasurements(item)
    while (measurements.length < size) measurements.push('')
    if (measurements.length > size) measurements.length = size

    return {
      ...item,
      measurements,
      dimension_value: item.dimensionValue || null,
      tolerance_upper: item.toleranceUpper || null,
      tolerance_lower: item.toleranceLower || null,
      actual_value: item.actualValue || '',
      result: item.result || '',
      remarks: item.remarks || ''
    }
  })
}

const getExistingMeasurementCount = (items) => {
  return getInspectionMeasurementColumnCount(items, 0)
}

const hasExistingMeasurements = (items) => getExistingMeasurementCount(items) > 1 || (items || []).some((item) => {
  return normalizeInspectionMeasurements(item).some((value) => value !== null && value !== undefined && value !== '')
})

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
  if (measures.length === 0) { item.actualValue = ''; item.actual_value = ''; return }

  const sum = measures.reduce((acc, val) => acc + val, 0)
  const avg = sum / measures.length
  if (measures.length >= 2) {
    item.actualValue = `${Math.min(...measures).toFixed(2)}-${Math.max(...measures).toFixed(2)}`
  } else {
    item.actualValue = avg.toFixed(2)
  }
  // 同步 snake_case 字段，validateInspectionItems 读取 actual_value
  item.actual_value = item.actualValue
  item._averageValue = avg
  checkDimensionTolerance(item, false)
}

const formatDimensionTolerance = (item) => {
  const hasDimensionValue = item.dimensionValue !== null &&
    item.dimensionValue !== undefined && item.dimensionValue !== ''
  if (!hasDimensionValue) return item.standard || item.dimensionInfo || '-'
  const dimensionValue = parseFloat(item.dimensionValue)
  if (Number.isNaN(dimensionValue)) return item.standard || item.dimensionInfo || '-'
  const upper = parseFloat(item.toleranceUpper) || 0
  const lower = Math.abs(parseFloat(item.toleranceLower)) || 0
  if (upper === 0 && lower === 0) return dimensionValue.toFixed(2)
  return `${dimensionValue.toFixed(2)} (+${upper.toFixed(2)}/-${lower.toFixed(2)})`
}

const checkDimensionTolerance = (item) => {
  if (!item.dimensionValue) return
  const dimensionValue = parseFloat(item.dimensionValue)
  const toleranceUpper = parseFloat(item.toleranceUpper) || 0
  const toleranceLower = parseFloat(item.toleranceLower) || 0
  if (isNaN(dimensionValue)) return

  const maxAllowed = dimensionValue + toleranceUpper
  const minAllowed = dimensionValue - Math.abs(toleranceLower)
  const measurements = item.measurements || []
  const measures = measurements.filter(v => v !== null && v !== undefined && v !== '' && !isNaN(parseFloat(v))).map(v => parseFloat(v))
  if (measures.length === 0) return

  const outOfRangeMeasures = measures.filter(m => m < minAllowed || m > maxAllowed)
  const defectCount = outOfRangeMeasures.length

  if (inspectForm.is_aql && inspectForm.aql_standard_id) {
    const ac = parseInt(inspectForm.acceptLimit) || 0
    const re = parseInt(inspectForm.rejectLimit) || 1
    if (defectCount >= re) item.result = 'failed'
    else if (defectCount <= ac) item.result = 'passed'
  } else {
    item.result = defectCount > 0 ? 'failed' : 'passed'
  }
}

// ===== 数量计算 =====
const handleQualifiedQuantityChange = () => {
  const totalQuantity = parseFloat(inspectForm.quantity) || 0
  const qualifiedQuantity = parseFloat(inspectForm.qualifiedQuantity) || 0
  if (qualifiedQuantity > totalQuantity) {
    ElMessage.warning('合格数量不能超过检验数量')
    inspectForm.qualifiedQuantity = totalQuantity
    inspectForm.unqualifiedQuantity = 0
    return
  }
  inspectForm.unqualifiedQuantity = (totalQuantity - qualifiedQuantity).toFixed(2)
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
      inspection_no: inspectForm.inspectionNo,
      items: inspectForm.items.map(item => {
        const mapped = { ...item }
        if (item.measurements && Array.isArray(item.measurements)) {
          item.measurements.forEach((val, idx) => { mapped[`measure_${idx + 1}`] = val || '' })
          mapped.measurements = item.measurements.map((value, index) => ({
            sample_no: index + 1,
            measured_value: value === '' || value === null || value === undefined ? null : value
          }))
        }
        delete mapped._averageValue
        return mapped
      }),
      quantity: inspectForm.quantity,
      qualifiedQuantity: parseFloat(inspectForm.qualifiedQuantity) || 0,
      unqualifiedQuantity: parseFloat(inspectForm.unqualifiedQuantity) || 0,
      inspectorName: inspectForm.inspectorName,
      template_id: inspectionTemplateId.value || currentInspectionData.value?.templateId || null,
      actual_date: dayjs(inspectForm.inspectionDate).format('YYYY-MM-DD'),
      note: inspectForm.note,
      status,
      is_aql: inspectForm.is_aql,
      aql_standard_id: inspectForm.aql_standard_id,
      aqlLevel: inspectForm.aqlLevel,
      accept_limit: inspectForm.acceptLimit,
      reject_limit: inspectForm.rejectLimit
    }

    const response = await qualityApi.updateIncomingInspection(submitData.id, submitData)
    const resultData = response?.data || {}

    ElMessage.success('检验提交成功')

    // 根据结果处理
    const receiptAutoCreated = resultData.receipt_auto_created === true
    if (status === 'passed') {
      if (receiptAutoCreated) ElMessage.success('系统已自动创建采购入库单')
      else ElMessage.warning('检验已提交，但后端未返回入库单创建结果，请刷新后确认')
    } else if (status === 'partial') {
      if (receiptAutoCreated) {
        ElMessage.success('系统已自动创建采购入库单（仅合格部分）')
      } else {
        ElMessage.warning('检验已提交，但后端未返回入库单创建结果，请刷新后确认')
      }
      await handlePartialNonconformingOnly(submitData.id, submitData.unqualifiedQuantity)
    } else if (status === 'failed') {
      await handleFailedInspectionResult(submitData.id, submitData.unqualifiedQuantity)
    }

    dialogVisible.value = false
    emit('success')
  } catch (error) {
    console.error('检验提交失败:', error)
    ElMessage.error(`检验提交失败: ${error.message}`)
  } finally {
    submitting.value = false
  }
}

// ===== 后续流程引导 =====
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

const handlePartialNonconformingOnly = async (inspectionId, unqualifiedQty) => {
  try {
    await ElMessageBox.confirm(
      `不合格品(${unqualifiedQty})需要处理，是否前往不合格品管理页面?`,
      '提示', { confirmButtonText: '前往处理', cancelButtonText: '稍后处理', type: 'info' }
    )
    router.push({ path: '/quality/nonconforming', query: { inspection_id: inspectionId } })
  } catch {
    ElMessage.info('请记得及时处理不合格品')
  }
}
</script>

<style scoped>
.inspection-items { width: 100%; max-width: 100%; overflow: hidden; }

.measure-grid { display: flex; flex-wrap: nowrap; gap: 6px; }
.measure-item { display: flex; align-items: center; gap: 2px; }
.measure-grid .el-input { width: 55px; flex: 0 0 auto; }

.average-value-display { text-align: center; font-weight: bold; font-size: 13px; }
.average-value-display .value-passed { color: var(--color-success); }
.average-value-display .value-failed { color: var(--color-danger); }

/* 结果选择器样式 */
:deep(.result-select-passed .el-input__wrapper) { background-color: var(--ds-blue-bg) !important; border-color: var(--color-success) !important; box-shadow: 0 0 0 1px var(--color-success) inset !important; }
:deep(.result-select-passed .el-input__inner) { color: var(--color-success) !important; font-weight: var(--font-weight-bold) !important; }
:deep(.result-select-passed.el-select .el-input.is-focus .el-input__wrapper) { box-shadow: 0 0 0 1px var(--color-success) inset !important; }
:deep(.result-select-failed .el-input__wrapper) { background-color: var(--ds-red-bg) !important; border-color: var(--color-danger) !important; box-shadow: 0 0 0 1px var(--color-danger) inset !important; }
:deep(.result-select-failed .el-input__inner) { color: var(--color-danger) !important; font-weight: var(--font-weight-bold) !important; }
:deep(.result-select-failed.el-select .el-input.is-focus .el-input__wrapper) { box-shadow: 0 0 0 1px var(--color-danger) inset !important; }
</style>
