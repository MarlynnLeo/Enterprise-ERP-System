<!--
/**
 * ReviewDialog.vue
 * @description 复检操作弹窗
 * @date 2026-04-03
 * @version 1.0.0
 *
 * 职责：
 * - 显示原检验结果对比
 * - 复检原因选择
 * - 复检提交 + 后续流程引导
 */
-->
<template>
  <el-dialog v-model="dialogVisible" :title="`复检操作 - ${inspectionNo}`" width="1200px" destroy-on-close>
    <el-alert type="warning" :closable="false" show-icon>
      <p>您正在对不合格检验单进行复检操作，复检后的结果将覆盖原检验结果。</p>
    </el-alert>

    <el-form ref="reviewFormRef" :model="reviewForm" :rules="reviewRules" label-width="100px" style="margin-top: 20px;">
      <el-form-item label="检验项目" prop="items">
        <div class="inspection-items">
          <el-table :data="reviewForm.items" border>
            <el-table-column prop="item_name" label="检验项目" width="130" show-overflow-tooltip />
            <el-table-column prop="standard" label="检验标准" width="150" show-overflow-tooltip />
            <el-table-column prop="dimension_info" label="标准尺寸±公差" width="150" show-overflow-tooltip>
              <template #default="scope">{{ formatDimensionTolerance(scope.row) }}</template>
            </el-table-column>
            <el-table-column prop="result" label="原结果" width="100" show-overflow-tooltip>
              <template #default="scope">
                <el-tag size="small" :type="scope.row.original_result === 'passed' ? 'success' : 'danger'">
                  {{ scope.row.original_result === 'passed' ? '合格' : '不合格' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="actual_value" label="实际值" width="120">
              <template #default="scope">
                <el-input
                  :ref="el => setReviewActualValueRef(el, scope.$index)"
                  v-model="scope.row.actual_value"
                  placeholder="请输入实际值"
                  @input="checkDimensionTolerance(scope.row, false)"
                  @blur="checkDimensionTolerance(scope.row, true)"
                  @keyup.enter="focusNextReviewActualValue(scope.$index)"
                />
              </template>
            </el-table-column>
            <el-table-column prop="result" label="复检结果" width="110">
              <template #default="scope">
                <el-select
                  v-model="scope.row.result"
                  placeholder="选择结果"
                  style="width: 100%"
                  :class="{
                    'result-select-passed': scope.row.result === 'passed',
                    'result-select-failed': scope.row.result === 'failed'
                  }"
                >
                  <el-option label="✓ 合格" value="passed" style="color: #67C23A; font-weight: bold;" />
                  <el-option label="✗ 不合格" value="failed" style="color: #F56C6C; font-weight: bold;" />
                </el-select>
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="150" show-overflow-tooltip>
              <template #default="scope">
                <el-input v-model="scope.row.remarks" placeholder="请输入备注" />
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-form-item>

      <el-row :gutter="20">
        <el-col :span="6">
          <el-form-item label="复检数量" prop="quantity">
            <el-input v-model="reviewForm.quantity" placeholder="请输入复检数量" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="合格数量" prop="qualified_quantity">
            <el-input v-model="reviewForm.qualified_quantity" placeholder="请输入合格数量" type="number" @input="handleReviewQualifiedQuantityChange" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="不合格数量" prop="unqualified_quantity">
            <el-input v-model="reviewForm.unqualified_quantity" placeholder="自动计算" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="复检人员" prop="inspector_name">
            <el-input v-model="reviewForm.inspector_name" placeholder="请输入复检人员姓名" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="复检日期" prop="inspectionDate">
        <el-date-picker v-model="reviewForm.inspectionDate" type="date" placeholder="选择复检日期" />
      </el-form-item>

      <el-form-item label="复检原因" prop="reviewReason">
        <el-select v-model="reviewForm.reviewReason" placeholder="选择复检原因" style="width: 100%">
          <el-option label="初检仪器校准有误" value="instrument_error" />
          <el-option label="初检方法不当" value="method_error" />
          <el-option label="供应商申请复检" value="supplier_request" />
          <el-option label="新批次替代" value="new_batch" />
          <el-option label="其他原因" value="other" />
        </el-select>
      </el-form-item>

      <el-form-item label="备注" prop="note">
        <el-input v-model="reviewForm.note" type="textarea" placeholder="请输入备注信息" :rows="3" />
      </el-form-item>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-permission="'quality:incominginspection:submit'" type="primary" @click="handleSubmit" :loading="submitting">提交复检</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { qualityApi } from '@/services/api'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { calculateInspectionStatus, validateInspectionItems, createReceiptFromInspection } from '@/utils/inspectionHelpers'
import dayjs from 'dayjs'

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

const reviewFormRef = ref(null)
const submitting = ref(false)
const reviewActualValueRefs = ref([])

const reviewForm = reactive({
  items: [],
  quantity: '',
  qualified_quantity: '',
  unqualified_quantity: '',
  inspector_name: '',
  inspectionDate: new Date(),
  reviewReason: '',
  note: ''
})

// 表单验证规则
const reviewRules = {
  quantity: [{ required: true, message: '请输入复检数量', trigger: 'blur' }],
  qualified_quantity: [
    { required: true, message: '请输入合格数量', trigger: 'change' },
    {
      validator: (rule, value, callback) => {
        if (value === '' || value === null || value === undefined) {
          callback(new Error('合格数量不能为空'))
        } else {
          const qty = parseFloat(value)
          const totalQty = parseFloat(reviewForm.quantity)
          if (isNaN(qty)) callback(new Error('请输入有效的数字'))
          else if (qty < 0) callback(new Error('合格数量不能为负数'))
          else if (qty > totalQty) callback(new Error('合格数量不能大于复检数量'))
          else callback()
        }
      },
      trigger: 'change'
    }
  ],
  inspector_name: [{ required: true, message: '请输入复检人员姓名', trigger: 'blur' }],
  inspectionDate: [{ required: true, message: '请选择复检日期', trigger: 'change' }],
  reviewReason: [{ required: true, message: '请选择复检原因', trigger: 'change' }]
}

// 监听弹窗打开时加载数据
watch(() => props.visible, async (val) => {
  if (val && props.row) {
    try {
      const response = await qualityApi.getIncomingInspection(props.row.id)
      const respData = response?.data
      const inspectionData = respData?.data || (respData?.id ? respData : null)

      if (inspectionData) {
        reviewForm.quantity = inspectionData.quantity || ''
        reviewForm.qualified_quantity = inspectionData.qualified_quantity || ''
        reviewForm.unqualified_quantity = inspectionData.unqualified_quantity || ''
        reviewForm.inspector_name = authStore.user?.real_name || ''
        reviewForm.inspectionDate = new Date()
        reviewForm.reviewReason = ''
        reviewForm.note = inspectionData.note || ''

        if (inspectionData.items && inspectionData.items.length > 0) {
          reviewForm.items = inspectionData.items.map(item => ({
            ...item,
            original_result: item.result,
            actual_value: '',
            result: '',
            remarks: item.remarks || ''
          }))
        } else {
          ElMessage.warning('没有找到检验项记录，无法进行复检')
          dialogVisible.value = false
          return
        }

        reviewActualValueRefs.value = []
      } else {
        ElMessage.error('获取检验单详情失败')
        dialogVisible.value = false
      }
    } catch (error) {
      console.error('获取检验单详情失败:', error)
      ElMessage.error(`获取检验单详情失败: ${error.message}`)
      dialogVisible.value = false
    }
  }
})

// 辅助函数
const formatDimensionTolerance = (item) => {
  if (!item.dimension_value) return '-'
  const dimensionValue = parseFloat(item.dimension_value)
  const upper = parseFloat(item.tolerance_upper) || 0
  const lower = Math.abs(parseFloat(item.tolerance_lower)) || 0
  if (upper === 0 && lower === 0) return dimensionValue.toFixed(2)
  return `${dimensionValue.toFixed(2)} (+${upper.toFixed(2)}/-${lower.toFixed(2)})`
}

const checkDimensionTolerance = (item, showMessage = false) => {
  if (!item.dimension_value) return
  const dimensionValue = parseFloat(item.dimension_value)
  const toleranceUpper = parseFloat(item.tolerance_upper) || 0
  const toleranceLower = parseFloat(item.tolerance_lower) || 0
  if (isNaN(dimensionValue)) return

  const maxAllowed = dimensionValue + toleranceUpper
  const minAllowed = dimensionValue - Math.abs(toleranceLower)
  const actualValue = parseFloat(item.actual_value)
  if (isNaN(actualValue)) return

  if (actualValue < minAllowed || actualValue > maxAllowed) {
    item.result = 'failed'
  } else {
    item.result = 'passed'
  }
}

const setReviewActualValueRef = (el, index) => {
  if (el) reviewActualValueRefs.value[index] = el
}

const focusNextReviewActualValue = (currentIndex) => {
  const nextIndex = currentIndex + 1
  if (nextIndex < reviewForm.items.length && reviewActualValueRefs.value[nextIndex]) {
    nextTick(() => { reviewActualValueRefs.value[nextIndex]?.focus() })
  } else {
    ElMessage.success('已完成所有复检项输入')
  }
}

const handleReviewQualifiedQuantityChange = () => {
  const totalQuantity = parseFloat(reviewForm.quantity) || 0
  const qualifiedQuantity = parseFloat(reviewForm.qualified_quantity) || 0
  if (qualifiedQuantity > totalQuantity) {
    ElMessage.warning('合格数量不能超过复检数量')
    reviewForm.qualified_quantity = totalQuantity
    reviewForm.unqualified_quantity = 0
    return
  }
  reviewForm.unqualified_quantity = (totalQuantity - qualifiedQuantity).toFixed(2)
}

// 提交复检
const handleSubmit = async () => {
  if (!reviewFormRef.value) return
  if (submitting.value) {
    ElMessage.warning('正在提交中，请勿重复操作')
    return
  }
  submitting.value = true

  try {
    await reviewFormRef.value.validate()

    const validation = validateInspectionItems(reviewForm.items)
    if (!validation.valid) {
      ElMessage.warning(validation.message)
      submitting.value = false
      return
    }

    const status = calculateInspectionStatus(reviewForm.items)

    const submitData = {
      id: props.row.id,
      inspection_no: inspectionNo.value,
      items: reviewForm.items,
      quantity: reviewForm.quantity,
      qualified_quantity: parseFloat(reviewForm.qualified_quantity) || 0,
      unqualified_quantity: parseFloat(reviewForm.unqualified_quantity) || 0,
      inspector_name: reviewForm.inspector_name,
      actual_date: dayjs(reviewForm.inspectionDate).format('YYYY-MM-DD'),
      note: reviewForm.note,
      status: status,
      is_review: true,
      review_date: dayjs(reviewForm.inspectionDate).format('YYYY-MM-DD'),
      review_reason: reviewForm.reviewReason
    }

    const response = await qualityApi.updateIncomingInspection(submitData.id, submitData)
    const respData = response?.data
    const isSuccess = respData?.success === true || respData?.id || (respData && !respData.error && !respData.message?.includes('失败'))

    if (isSuccess) {
      ElMessage.success('复检提交成功')

      // 根据结果处理后续流程
      if (status === 'passed') {
        await promptCreateReceipt(submitData.id, true)
      } else if (status === 'partial') {
        await handlePartialReviewResult(submitData.id, submitData.qualified_quantity, submitData.unqualified_quantity)
      } else if (status === 'failed') {
        await handleFailedReviewResult(submitData.id, submitData.unqualified_quantity)
      }

      dialogVisible.value = false
      emit('success')
    } else {
      ElMessage.error(respData?.message || '复检提交失败')
    }
  } catch (error) {
    console.error('复检提交失败:', error)
    ElMessage.error(`复检提交失败: ${error.message}`)
  } finally {
    submitting.value = false
  }
}

// 入库单创建提示
const promptCreateReceipt = async (inspectionId, isReview) => {
  try {
    await ElMessageBox.confirm(`复检已完成，是否自动创建采购入库单？`, '提示', {
      confirmButtonText: '创建入库单', cancelButtonText: '暂不创建', type: 'success'
    })
    const inspectionDetail = await qualityApi.getIncomingInspection(inspectionId)
    const inspection = inspectionDetail.data
    await createReceiptFromInspection(inspection, authStore, isReview)
    ElMessage.success('采购入库单创建成功')
  } catch (error) {
    if (error !== 'cancel') {
      console.error('创建入库单失败:', error)
      ElMessage.error(`创建入库单失败: ${error.message}`)
    } else {
      ElMessage.info('已取消创建入库单')
    }
  }
}

// 部分合格处理
const handlePartialReviewResult = async (inspectionId, qualifiedQty, unqualifiedQty) => {
  try {
    const result = await ElMessageBox.confirm(
      `复检完成！合格数量: ${qualifiedQty}, 不合格数量: ${unqualifiedQty}\n\n• 合格部分可以创建入库单进行入库\n• 不合格部分需要重新选择处理方式\n\n是否现在创建入库单(仅入库合格部分)?`,
      '复检部分合格 - 需要处理', { confirmButtonText: '创建入库单', cancelButtonText: '稍后处理', type: 'warning', distinguishCancelAndClose: true }
    )
    if (result === 'confirm') {
      const inspectionDetail = await qualityApi.getIncomingInspection(inspectionId)
      await createReceiptFromInspection(inspectionDetail.data, authStore, true)
      ElMessage.success('入库单创建成功(仅入库合格部分)')
      setTimeout(() => {
        ElMessageBox.confirm(`入库单已创建。\n\n复检后仍不合格的部分(${unqualifiedQty})需要重新处理,是否前往不合格品管理页面?`, '提示',
          { confirmButtonText: '前往处理', cancelButtonText: '稍后处理', type: 'info' }
        ).then(() => { router.push({ path: '/quality/nonconforming', query: { inspection_id: inspectionId } }) })
          .catch(() => { ElMessage.info('请记得及时处理不合格品') })
      }, 500)
    }
  } catch (error) {
    if (error === 'cancel' || error === 'close') {
      ElMessageBox.alert(`复检已完成,但未创建入库单。\n\n• 合格部分(${qualifiedQty})可稍后创建入库单\n• 不合格部分(${unqualifiedQty})请前往"质量管理 > 不合格品管理"重新处理`, '温馨提示',
        { confirmButtonText: '我知道了', type: 'info' })
    } else {
      ElMessage.error(`处理失败: ${error.message}`)
    }
  }
}

// 全部不合格处理
const handleFailedReviewResult = async (inspectionId, unqualifiedQty) => {
  try {
    await ElMessageBox.alert(
      `复检完成,仍全部不合格(${unqualifiedQty})！\n\n请重新选择处理方式：\n• 退货 - 退回供应商\n• 换货 - 要求供应商更换合格品\n• 报废 - 直接报废处理\n\n是否前往不合格品管理页面进行处理?`,
      '复检仍不合格 - 需要处理', { confirmButtonText: '前往处理', cancelButtonText: '稍后处理', type: 'error', showCancelButton: true }
    ).then(() => { router.push({ path: '/quality/nonconforming', query: { inspection_id: inspectionId } }) })
  } catch (error) {
    if (error === 'cancel') ElMessage.warning('请尽快处理不合格品')
  }
}
</script>

<style scoped>
.inspection-items { width: 100%; max-width: 100%; overflow: hidden; }

/* 结果选择器样式 - 合格显示绿色 */
:deep(.result-select-passed .el-input__wrapper) { background-color: #f0f9ff !important; border-color: var(--color-success) !important; box-shadow: 0 0 0 1px #67C23A inset !important; }
:deep(.result-select-passed .el-input__inner) { color: var(--color-success) !important; font-weight: var(--font-weight-bold) !important; }
:deep(.result-select-passed.el-select .el-input.is-focus .el-input__wrapper) { box-shadow: 0 0 0 1px #67C23A inset !important; }

/* 结果选择器样式 - 不合格显示红色 */
:deep(.result-select-failed .el-input__wrapper) { background-color: #fef0f0 !important; border-color: var(--color-danger) !important; box-shadow: 0 0 0 1px #F56C6C inset !important; }
:deep(.result-select-failed .el-input__inner) { color: var(--color-danger) !important; font-weight: var(--font-weight-bold) !important; }
:deep(.result-select-failed.el-select .el-input.is-focus .el-input__wrapper) { box-shadow: 0 0 0 1px #F56C6C inset !important; }
</style>
