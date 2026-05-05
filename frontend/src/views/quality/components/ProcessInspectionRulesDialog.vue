<!--
/**
 * ProcessInspectionRulesDialog.vue
 * @description 过程检验规则配置弹窗
 */
-->
<template>
  <el-dialog v-model="dialogVisible" title="过程检验规则配置" width="900px" destroy-on-close>
    <div style="margin-bottom: 16px;">
      <el-button type="primary" @click="showAddRule = true"><el-icon><Plus /></el-icon>添加规则</el-button>
      <el-alert type="info" :closable="false" style="margin-top: 10px;">
        <template #title>
          <span>默认规则：每 <b>{{ DEFAULT_INTERVAL }}分钟</b> 检验一次，抽检比例 <b>{{ DEFAULT_SAMPLE_RATE }}%</b>，巡检打卡间隔 <b>{{ DEFAULT_PUNCH_INTERVAL }}分钟</b>。可针对特定工序/产品配置个性化规则。</span>
        </template>
      </el-alert>
    </div>

    <el-table :data="rulesList" border v-loading="loading">
      <el-table-column prop="process_name" label="工序名称" min-width="120">
        <template #default="{ row }">{{ row.process_name || '全部工序' }}</template>
      </el-table-column>
      <el-table-column prop="product_name" label="产品名称" min-width="150">
        <template #default="{ row }">{{ row.product_name || '全部产品' }}</template>
      </el-table-column>
      <el-table-column prop="inspection_interval" label="检验间隔(分钟)" width="130" />
      <el-table-column prop="punch_interval" label="打卡间隔(分钟)" width="130">
        <template #default="{ row }">{{ row.punch_interval || DEFAULT_PUNCH_INTERVAL }}</template>
      </el-table-column>
      <el-table-column prop="sample_rate" label="抽检比例(%)" width="110" />
      <el-table-column prop="template_name" label="检验模板" min-width="120">
        <template #default="{ row }">{{ row.template_name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="is_enabled" label="启用状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.is_enabled ? 'success' : 'info'" size="small">{{ row.is_enabled ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)"
            v-permission="'quality:process'">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)"
            v-permission="'quality:process'">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑规则弹窗 -->
    <el-dialog v-model="showAddRule" :title="editingRule ? '编辑规则' : '添加规则'" width="500px" append-to-body>
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleFormRules" label-width="100px">
        <el-form-item label="工序">
          <el-select v-model="ruleForm.process_id" placeholder="全部工序" filterable clearable style="width: 100%">
            <el-option v-for="p in processOptions" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select 
            v-model="ruleForm.product_id" 
            placeholder="搜索/选择产品" 
            filterable 
            remote
            :remote-method="debouncedSearchProducts"
            :loading="loadingProducts"
            clearable 
            style="width: 100%"
          >
            <el-option v-for="p in productOptions" :key="p.id" :label="`${p.code || '无编码'} - ${p.name || '未命名'}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="检验间隔" prop="inspection_interval">
          <el-input-number v-model="ruleForm.inspection_interval" :min="5" :max="480" />
          <span style="margin-left: 10px; color: var(--color-text-secondary);">分钟</span>
        </el-form-item>
        <el-form-item label="抽检比例" prop="sample_rate">
          <el-input-number v-model="ruleForm.sample_rate" :min="1" :max="100" />
          <span style="margin-left: 10px; color: var(--color-text-secondary);">%</span>
        </el-form-item>
        <el-form-item label="打卡间隔" prop="punch_interval">
          <el-input-number v-model="ruleForm.punch_interval" :min="1" :max="60" />
          <span style="margin-left: 10px; color: var(--color-text-secondary);">分钟 (防止重复打卡)</span>
        </el-form-item>
        <el-form-item label="检验模板">
          <el-select v-model="ruleForm.template_id" placeholder="选择检验模板" clearable style="width: 100%">
            <el-option v-for="t in templateOptions" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch v-model="ruleForm.is_enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ruleForm.note" type="textarea" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddRule = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSaveRule">保存</el-button>
      </template>
    </el-dialog>

    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { qualityApi } from '@/api/quality'
import { materialApi } from '@/api/material'
import { productionApi } from '@/api/production'
import { searchMaterials, mapMaterialData, SEARCH_CONFIG } from '@/utils/searchConfig'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 默认配置
const DEFAULT_INTERVAL = 30
const DEFAULT_SAMPLE_RATE = 10
const DEFAULT_PUNCH_INTERVAL = 10

const loading = ref(false)
const submitting = ref(false)
const loadingProducts = ref(false)
let searchTimeout = null
let currentSearchId = 0
const rulesList = ref([])
const processOptions = ref([])
const productOptions = ref([])
const templateOptions = ref([])
const showAddRule = ref(false)
const editingRule = ref(null)
const ruleFormRef = ref(null)

// 默认表单值
const getDefaultRuleForm = () => ({
  process_id: null,
  product_id: null,
  inspection_interval: DEFAULT_INTERVAL,
  sample_rate: DEFAULT_SAMPLE_RATE,
  punch_interval: DEFAULT_PUNCH_INTERVAL,
  template_id: null,
  is_enabled: true,
  note: ''
})

const ruleForm = ref(getDefaultRuleForm())
const ruleFormRules = {
  inspection_interval: [{ required: true, message: '请输入检验间隔', trigger: 'blur' }],
  sample_rate: [{ required: true, message: '请输入抽检比例', trigger: 'blur' }]
}

const fetchRules = async () => {
  loading.value = true
  try {
    const res = await qualityApi.getProcessInspectionRules()
    rulesList.value = res.data || res || []
  } catch (error) {
    console.error('获取过程检验规则失败:', error)
  } finally {
    loading.value = false
  }
}

const fetchProcesses = async () => {
  try {
    const res = await productionApi.getProductionProcesses({ pageSize: 500 })
    const data = res.data?.data || res.data || res
    processOptions.value = data.list || data || []
  } catch (error) {
    console.error('获取工序列表失败:', error)
  }
}

const fetchProducts = async () => {
  debouncedSearchProducts('')
}

const debouncedSearchProducts = (query) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  
  const searchId = ++currentSearchId
  
  searchTimeout = setTimeout(async () => {
    loadingProducts.value = true
    try {
      const res = await searchMaterials(materialApi, query, { 
        type: 'product', 
        pageSize: 50 
      })
      if (searchId === currentSearchId) {
        productOptions.value = mapMaterialData(res)
      }
    } catch (error) {
      console.error('获取产品列表失败:', error)
      if (searchId === currentSearchId) {
        productOptions.value = []
      }
    } finally {
      if (searchId === currentSearchId) {
        loadingProducts.value = false
      }
    }
  }, SEARCH_CONFIG.debounceTime)
}

const fetchTemplates = async () => {
  try {
    const res = await qualityApi.getTemplates({ type: 'process', pageSize: 100 })
    templateOptions.value = (res.data || res)?.list || res.data || res || []
  } catch (error) {
    console.error('获取模板列表失败:', error)
  }
}

const handleEdit = (row) => {
  editingRule.value = row
  ruleForm.value = { ...row }
  showAddRule.value = true
}

const handleDelete = async (row) => {
  await ElMessageBox.confirm('确定删除该过程检验规则？', '提示', { type: 'warning' })
  try {
    await qualityApi.deleteProcessInspectionRule(row.id)
    ElMessage.success('删除成功')
    fetchRules()
  } catch {
    ElMessage.error('删除失败')
  }
}

const handleSaveRule = async () => {
  const valid = await ruleFormRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (editingRule.value) {
      await qualityApi.updateProcessInspectionRule(editingRule.value.id, ruleForm.value)
    } else {
      await qualityApi.createProcessInspectionRule(ruleForm.value)
    }
    ElMessage.success('保存成功')
    showAddRule.value = false
    editingRule.value = null
    ruleForm.value = getDefaultRuleForm()
    fetchRules()
  } catch (error) {
    ElMessage.error(error.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    fetchRules()
    fetchProcesses()
    fetchProducts()
    fetchTemplates()
  }
})
</script>
