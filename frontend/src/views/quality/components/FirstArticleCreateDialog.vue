<!--
/**
 * FirstArticleCreateDialog.vue
 * @description 新建首检单弹窗
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    title="新建首检单"
    mode="form"
    width="600px"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="生产任务" prop="taskId">
        <el-select v-model="form.taskId" placeholder="选择生产任务" filterable class="w-full" @change="handleTaskChange">
          <el-option v-for="task in taskOptions" :key="task.id" :label="`${task.code} - ${task.productName}`" :value="task.id">
            <div class="flex-between">
              <span>{{ task.code }}</span>
              <span class="text-muted text-sm">{{ task.productName }} ({{ task.quantity }}件)</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="产品信息">
        <el-input :value="selectedTask ? `${selectedTask.productCode} - ${selectedTask.productName}` : ''" disabled />
      </el-form-item>
      <el-form-item label="生产数量">
        <el-input :value="selectedTask ? `${selectedTask.quantity} 件` : ''" disabled />
      </el-form-item>
      <el-form-item label="首检数量">
        <el-input-number v-model="form.firstArticleQty" :min="1" :max="selectedTask?.quantity || 999" />
        <span class="ml-sm text-muted">
          <el-tag v-if="isFullInspection" type="warning" size="small">全检</el-tag>
          <el-tag v-else type="primary" size="small">抽检</el-tag>
        </span>
      </el-form-item>
      <el-form-item label="批次号" prop="batchNo">
        <el-input v-model="form.batchNo" placeholder="留空时由后端按生产任务生成" />
      </el-form-item>
      <el-form-item label="计划日期" prop="plannedDate">
        <el-date-picker v-model="form.plannedDate" type="date" placeholder="选择日期" class="w-full" />
      </el-form-item>
      <el-form-item label="检验员">
        <el-input v-model="form.inspectorName" placeholder="自动获取" disabled />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="2" placeholder="请输入备注" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button v-permission="'quality:inspections:create'" type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
    </AppDialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { qualityApi } from '@/api/quality'
import { productionApi } from '@/api/production'
import { FIRST_ARTICLE_CONFIG } from '@/constants/systemConstants'

import { useAuthStore } from '@/stores/auth'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible', 'success'])

const authStore = useAuthStore()

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const formRef = ref(null)
const submitting = ref(false)
const taskOptions = ref([])
const selectedTask = ref(null)

// 使用常量定义默认值
const { DEFAULT_QTY, DEFAULT_FULL_INSPECTION_THRESHOLD } = FIRST_ARTICLE_CONFIG

const form = ref({
  task_id: null,
  batch_no: '',
  first_article_qty: DEFAULT_QTY,
  planned_date: new Date(),
  inspector_name: authStore.user?.realName || authStore.user?.username || '',
  note: ''
})

const rules = {
  task_id: [{ required: true, message: '请选择生产任务', trigger: 'change' }],
  planned_date: [{ required: true, message: '请选择计划日期', trigger: 'change' }]
}

const isFullInspection = computed(() => {
  if (!selectedTask.value) return false
  return selectedTask.value.quantity < DEFAULT_FULL_INSPECTION_THRESHOLD
})

// 获取可用的生产任务（必须有工序已开始生产的任务）
const fetchTasks = async () => {
  try {
    const res = await productionApi.getProductionTasks({
      status: 'in_progress',
      has_started_process: true,
      pageSize: 50,
    })
    const data = res.data || res
    taskOptions.value = data.list || data.items || data || []
  } catch (error) {
    console.error('获取生产任务失败:', error)
  }
}

// 任务选择变化
const handleTaskChange = async (taskId) => {
  const task = taskOptions.value.find(t => t.id === taskId)
  selectedTask.value = task
  if (task) {
    // 检查首检规则
    try {
      const res = await qualityApi.getFirstArticleRuleByProduct(task.productId)
      const rule = res.data || res
      const threshold = rule.fullInspectionThreshold || DEFAULT_FULL_INSPECTION_THRESHOLD
      const defaultQty = rule.firstArticleQty || DEFAULT_QTY
      form.value.firstArticleQty = task.quantity < threshold ? task.quantity : defaultQty
    } catch {
      form.value.firstArticleQty = task.quantity < DEFAULT_FULL_INSPECTION_THRESHOLD ? task.quantity : DEFAULT_QTY
    }
    form.value.batchNo = ''
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await qualityApi.createFirstArticleInspection({
      task_id: form.value.taskId,
      product_id: selectedTask.value.productId,
      product_code: selectedTask.value.productCode,
      product_name: selectedTask.value.productName,
      production_quantity: selectedTask.value.quantity,
      first_article_qty: form.value.firstArticleQty,
      batch_no: form.value.batchNo || undefined,
      planned_date: form.value.plannedDate,
      inspector_name: form.value.inspectorName,
      note: form.value.note
    })
    ElMessage.success('首检单创建成功')
    emit('success')
  } catch (error) {
    console.error('创建首检单失败:', error)
    ElMessage.error(error.response?.data?.message || '创建首检单失败')
  } finally {
    submitting.value = false
  }
}

const handleClose = () => {
  formRef.value?.resetFields()
  selectedTask.value = null
}

onMounted(fetchTasks)
</script>

