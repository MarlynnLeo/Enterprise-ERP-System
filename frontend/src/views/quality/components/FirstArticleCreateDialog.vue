<!--
/**
 * FirstArticleCreateDialog.vue
 * @description 新建首检单弹窗
 */
-->
<template>
  <el-dialog v-model="dialogVisible" title="新建首检单" width="600px" destroy-on-close @close="handleClose">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="生产任务" prop="task_id">
        <el-select v-model="form.task_id" placeholder="选择生产任务" filterable style="width: 100%" @change="handleTaskChange">
          <el-option v-for="task in taskOptions" :key="task.id" :label="`${task.code} - ${task.product_name}`" :value="task.id">
            <div style="display: flex; justify-content: space-between;">
              <span>{{ task.code }}</span>
              <span style="color: var(--color-text-secondary); font-size: 12px;">{{ task.product_name }} ({{ task.quantity }}件)</span>
            </div>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="产品信息">
        <el-input :value="selectedTask ? `${selectedTask.product_code} - ${selectedTask.product_name}` : ''" disabled />
      </el-form-item>
      <el-form-item label="生产数量">
        <el-input :value="selectedTask ? `${selectedTask.quantity} 件` : ''" disabled />
      </el-form-item>
      <el-form-item label="首检数量">
        <el-input-number v-model="form.first_article_qty" :min="1" :max="selectedTask?.quantity || 999" />
        <span style="margin-left: 10px; color: var(--color-text-secondary);">
          <el-tag v-if="isFullInspection" type="warning" size="small">全检</el-tag>
          <el-tag v-else type="primary" size="small">抽检</el-tag>
        </span>
      </el-form-item>
      <el-form-item label="批次号" prop="batch_no">
        <el-input v-model="form.batch_no" placeholder="自动生成或手动输入" />
      </el-form-item>
      <el-form-item label="计划日期" prop="planned_date">
        <el-date-picker v-model="form.planned_date" type="date" placeholder="选择日期" style="width: 100%" />
      </el-form-item>
      <el-form-item label="检验员">
        <el-input v-model="form.inspector_name" placeholder="自动获取" disabled />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="2" placeholder="请输入备注" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
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
  inspector_name: authStore.user?.real_name || authStore.user?.username || '',
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

// 获取可用的生产任务（进行中的任务）
const fetchTasks = async () => {
  try {
    const res = await productionApi.getProductionTasks({ status: 'in_progress', pageSize: 100 })
    const data = res.data || res
    taskOptions.value = data.list || data || []
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
      const res = await qualityApi.getFirstArticleRuleByProduct(task.product_id)
      const rule = res.data || res
      const threshold = rule.full_inspection_threshold || DEFAULT_FULL_INSPECTION_THRESHOLD
      const defaultQty = rule.first_article_qty || DEFAULT_QTY
      form.value.first_article_qty = task.quantity < threshold ? task.quantity : defaultQty
    } catch {
      form.value.first_article_qty = task.quantity < DEFAULT_FULL_INSPECTION_THRESHOLD ? task.quantity : DEFAULT_QTY
    }
    form.value.batch_no = `BATCH${Date.now()}`
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await qualityApi.createFirstArticleInspection({
      task_id: form.value.task_id,
      product_id: selectedTask.value.product_id,
      product_code: selectedTask.value.product_code,
      product_name: selectedTask.value.product_name,
      production_quantity: selectedTask.value.quantity,
      batch_no: form.value.batch_no,
      planned_date: form.value.planned_date,
      inspector_name: form.value.inspector_name,
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

