<!--
/**
 * FirstArticleInspectDialog.vue
 * @description 首检检验弹窗
 */
-->
<template>
  <el-dialog v-model="dialogVisible" title="首检检验" width="750px" destroy-on-close @close="handleClose">
    <el-descriptions :column="3" border style="margin-bottom: 20px">
      <el-descriptions-item label="检验单号">{{ inspection?.inspection_no }}</el-descriptions-item>
      <el-descriptions-item label="生产任务">{{ inspection?.task_code }}</el-descriptions-item>
      <el-descriptions-item label="产品名称">{{ inspection?.product_name }}</el-descriptions-item>
      <el-descriptions-item label="批次号">{{ inspection?.batch_no }}</el-descriptions-item>
      <el-descriptions-item label="检验数量">{{ inspection?.quantity }} {{ inspection?.unit }}</el-descriptions-item>
      <el-descriptions-item label="检验类型">
        <el-tag :type="inspection?.is_full_inspection ? 'warning' : 'primary'" size="small">
          {{ inspection?.is_full_inspection ? '全检' : '抽检' }}
        </el-tag>
      </el-descriptions-item>
    </el-descriptions>

    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="合格数量" prop="qualified_quantity">
            <el-input-number v-model="form.qualified_quantity" :min="0" :max="Number(inspection?.quantity) || 999" style="width: 100%" @change="calcUnqualified" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="不合格数量">
            <el-input-number v-model="form.unqualified_quantity" :min="0" disabled style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="首检结果" prop="first_article_result">
        <el-radio-group v-model="form.first_article_result">
          <el-radio value="passed"><el-tag type="success">合格</el-tag></el-radio>
          <el-radio value="failed"><el-tag type="danger">不合格</el-tag></el-radio>
          <el-radio value="conditional"><el-tag type="warning">有条件放行</el-tag></el-radio>
        </el-radio-group>
        <div style="margin-top: 8px; font-size: 12px; color: var(--color-text-secondary);">
          <el-icon><InfoFilled /></el-icon> 首检结果会根据检验项目结果自动判定
        </div>
      </el-form-item>

      <el-form-item v-if="form.first_article_result === 'conditional'" label="允许继续生产">
        <el-switch v-model="form.production_can_continue" />
        <span style="margin-left: 10px; color: var(--color-text-secondary); font-size: 12px;">开启后生产任务可继续进行</span>
      </el-form-item>
      <el-form-item label="检验员" prop="inspector_name">
        <el-input v-model="form.inspector_name" placeholder="自动获取" disabled />
      </el-form-item>
      
      <!-- 检验项目明细 -->
      <el-divider content-position="left">检验项目</el-divider>
      <el-table :data="form.items" border size="small" style="margin-bottom: 16px">
        <el-table-column prop="item_name" label="检验项目" min-width="120">
          <template #default="{ row, $index }">
            <el-input v-model="row.item_name" size="small" placeholder="项目名称" />
          </template>
        </el-table-column>
        <el-table-column prop="standard_value" label="标准值" min-width="100">
          <template #default="{ row }">
            <el-input v-model="row.standard_value" size="small" placeholder="标准值" />
          </template>
        </el-table-column>
        <el-table-column prop="actual_value" label="实测值" min-width="100">
          <template #default="{ row }">
            <el-input v-model="row.actual_value" size="small" placeholder="实测值" />
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
            <el-button type="primary" size="small" circle @click="addItem"><el-icon><Plus /></el-icon></el-button>
          </template>
          <template #default="{ $index }">
            <el-button type="danger" size="small" circle @click="removeItem($index)"><el-icon><Delete /></el-icon></el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-form-item label="备注">
        <el-input v-model="form.note" type="textarea" :rows="2" placeholder="请输入备注" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">提交检验结果</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Plus, Delete, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { qualityApi } from '@/api/quality'
import { FIRST_ARTICLE_CONFIG } from '@/constants/systemConstants'

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

// 使用常量定义默认检验项
const { DEFAULT_INSPECTION_ITEMS } = FIRST_ARTICLE_CONFIG
const createDefaultItems = () => DEFAULT_INSPECTION_ITEMS.map(item => ({ ...item, actual_value: '', result: 'passed' }))

const form = ref({
  qualified_quantity: 0,
  unqualified_quantity: 0,
  first_article_result: 'passed',
  production_can_continue: false,
  inspector_name: '',
  note: '',
  items: createDefaultItems()
})

const rules = {
  first_article_result: [{ required: true, message: '请选择首检结果', trigger: 'change' }],
  inspector_name: [{ required: true, message: '请输入检验员姓名', trigger: 'blur' }]
}

watch(() => props.inspection, (val) => {
  if (val) {
    form.value.qualified_quantity = val.quantity || 0
    form.value.unqualified_quantity = 0
    // 自动获取当前登录用户作为检验员
    form.value.inspector_name = val.inspector_name || authStore.user?.real_name || authStore.user?.username || ''
  }
}, { immediate: true })

const calcUnqualified = () => {
  const total = props.inspection?.quantity || 0
  form.value.unqualified_quantity = Math.max(0, total - form.value.qualified_quantity)
}

const addItem = () => form.value.items.push({ item_name: '', standard_value: '', actual_value: '', result: 'passed' })
const removeItem = (index) => { form.value.items.splice(index, 1); autoCalcResult() }

// 根据检验项目结果自动计算首检总结果
const autoCalcResult = () => {
  const items = form.value.items
  if (items.length === 0) return
  
  // 检查是否有不合格项
  const hasFailedItem = items.some(item => item.result === 'failed')
  
  if (hasFailedItem) {
    form.value.first_article_result = 'failed'
    // 同时更新不合格数量
    form.value.unqualified_quantity = props.inspection?.quantity || 0
    form.value.qualified_quantity = 0
    ElMessage.warning('检测到不合格项目，首检结果自动设为不合格')
  } else {
    // 所有项目都合格
    form.value.first_article_result = 'passed'
    form.value.qualified_quantity = props.inspection?.quantity || 0
    form.value.unqualified_quantity = 0
  }
}

const handleSubmit = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
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

