<!--
/**
 * FirstArticleInspectDialog.vue
 * @description 首检检验弹窗
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    title="首检检验"
    mode="view"
    width="750px"
    @close="handleClose"
  >
    <el-descriptions :column="3" border class="mb-20">
      <el-descriptions-item label="检验单号">{{ inspection?.inspectionNo }}</el-descriptions-item>
      <el-descriptions-item label="生产任务">{{ inspection?.task_code }}</el-descriptions-item>
      <el-descriptions-item label="产品名称">{{ inspection?.productName }}</el-descriptions-item>
      <el-descriptions-item label="批次号">{{ inspection?.batchNo }}</el-descriptions-item>
      <el-descriptions-item label="检验数量">{{ inspection?.quantity }} {{ inspection?.unit }}</el-descriptions-item>
      <el-descriptions-item label="检验类型">
        <el-tag :type="inspection?.isFullInspection ? 'warning' : 'primary'" size="small">
          {{ inspection?.isFullInspection ? '全检' : '抽检' }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="合格数量" prop="qualifiedQuantity">
            <el-input-number v-model="form.qualifiedQuantity" :min="0" :max="Number(inspection?.quantity) || 999" class="w-full" @change="calcUnqualified" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="不合格数量">
            <el-input-number v-model="form.unqualifiedQuantity" :min="0" disabled class="w-full" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="首检结果" prop="firstArticleResult">
        <el-radio-group v-model="form.firstArticleResult">
          <el-radio value="passed"><el-tag type="success">合格</el-tag></el-radio>
          <el-radio value="failed"><el-tag type="danger">不合格</el-tag></el-radio>
          <el-radio value="conditional"><el-tag type="warning">有条件放行</el-tag></el-radio>
        </el-radio-group>
        <div class="mt-sm text-sm text-muted">
          <el-icon><InfoFilled /></el-icon> 首检结果会根据检验项目结果自动判定
        </div>
      </el-form-item>

      <el-form-item v-if="form.firstArticleResult === 'conditional'" label="允许继续生产">
        <el-switch v-model="form.productionCanContinue" />
        <span class="ml-sm text-muted text-sm">开启后生产任务可继续进行</span>
      </el-form-item>
      <el-form-item label="检验员" prop="inspectorName">
        <el-input v-model="form.inspectorName" placeholder="自动获取" disabled />
      </el-form-item>

      <!-- 检验项目明细 -->
      <el-divider content-position="center">检验项目</el-divider>
      <el-table :data="form.items" border size="small" class="mb-md">
        <el-table-column prop="itemName" label="检验项目" min-width="120">
          <template #default="{ row }">
            <el-input v-model="row.itemName" size="small" placeholder="项目名称" />
          </template>
        </el-table-column>
        <el-table-column prop="standardValue" label="标准值" min-width="100">
          <template #default="{ row }">
            <el-input v-model="row.standardValue" size="small" placeholder="标准值" />
          </template>
        </el-table-column>
        <el-table-column prop="actualValue" label="实测值" min-width="100">
          <template #default="{ row }">
            <el-input v-model="row.actualValue" size="small" placeholder="实测值" />
          </template>
        </el-table-column>
        <el-table-column prop="result" label="结果" width="100">
          <template #default="{ row }">
            <el-select v-model="row.result" size="small" @change="autoCalcResult">
              <el-option label="合格" value="passed" />
              <el-option label="不合格" value="failed" />
            </el-select>
          </template>
        </el-table-column>

        <el-table-column width="60">
          <template #header>
            <el-button v-permission="'quality:inspections:update'" type="primary" size="small" circle @click="addItem"><el-icon><Plus /></el-icon></el-button>
          </template>
          <template #default="{ $index }">
            <el-button v-permission="'quality:inspections:update'" type="danger" size="small" circle @click="removeItem($index)"><el-icon><Delete /></el-icon></el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="2" placeholder="请输入备注" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button v-permission="'quality:inspections:update'" type="primary" :loading="submitting" @click="handleSubmit">提交检验结果</el-button>
    </template>
    </AppDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Plus, Delete, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { qualityApi } from '@/api/quality'

import { useAuthStore } from '@/stores/auth'

const props = defineProps({ visible: Boolean, inspection: Object })
const emit = defineEmits(['update:visible', 'success'])

const authStore = useAuthStore()

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const formRef = ref(null)
const submitting = ref(false)

const form = ref({
  qualified_quantity: 0,
  unqualified_quantity: 0,
  first_article_result: '',
  production_can_continue: false,
  inspector_name: '',
  note: '',
  items: []
})

const rules = {
  first_article_result: [{ required: true, message: '请选择首检结果', trigger: 'change' }],
  inspector_name: [{ required: true, message: '请输入检验员姓名', trigger: 'blur' }]
}

watch(() => props.inspection, (val) => {
  if (val) {
    form.value.qualifiedQuantity = val.qualifiedQuantity || 0
    form.value.unqualifiedQuantity = val.unqualifiedQuantity || 0
    form.value.firstArticleResult = val.firstArticleResult || ''
    form.value.items = Array.isArray(val.items) ? val.items.map(item => ({
      ...item,
      actual_value: item.actualValue || '',
      result: item.result || ''
    })) : []
    if (form.value.items.length === 0) {
      ElMessage.warning('当前首检单未配置检验项目，请维护首检模板或手工添加检验项')
    }
    // 自动获取当前登录用户作为检验员
    form.value.inspectorName = val.inspectorName || authStore.user?.realName || authStore.user?.username || ''
  }
}, { immediate: true })

const calcUnqualified = () => {
  const total = props.inspection?.quantity || 0
  form.value.unqualifiedQuantity = Math.max(0, total - form.value.qualifiedQuantity)
}

const addItem = () => form.value.items.push({ item_name: '', standard_value: '', actual_value: '', result: '' })
const removeItem = (index) => { form.value.items.splice(index, 1); autoCalcResult() }

// 根据检验项目结果自动计算首检总结果
const autoCalcResult = () => {
  const items = form.value.items
  if (items.length === 0) return
  if (items.some(item => !item.result)) return

  // 检查是否有不合格项
  const hasFailedItem = items.some(item => item.result === 'failed')

  if (hasFailedItem) {
    form.value.firstArticleResult = 'failed'
    // 同时更新不合格数量
    form.value.unqualifiedQuantity = props.inspection?.quantity || 0
    form.value.qualifiedQuantity = 0
    ElMessage.warning('检测到不合格项目，首检结果自动设为不合格')
  } else {
    // 所有项目都合格
    form.value.firstArticleResult = 'passed'
    form.value.qualifiedQuantity = props.inspection?.quantity || 0
    form.value.unqualifiedQuantity = 0
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!form.value.items.length) {
    ElMessage.warning('请先添加或维护首检检验项目')
    return
  }
  if (form.value.items.some(item => !item.itemName || !item.result)) {
    ElMessage.warning('请完整填写检验项目和判定结果')
    return
  }
  submitting.value = true
  try {
    await qualityApi.updateFirstArticleResult(props.inspection.id, form.value)
    ElMessage.success('检验结果提交成功')
    emit('success')
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

const handleClose = () => formRef.value?.resetFields()
</script>

