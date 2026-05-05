<!--
/**
 * FirstArticleRulesDialog.vue
 * @description 首检规则配置弹窗
 */
-->
<template>
  <el-dialog v-model="dialogVisible" title="首检规则配置" width="900px" destroy-on-close>
    <div style="margin-bottom: 16px;">
      <el-button type="primary" @click="showAddRule = true"><el-icon><Plus /></el-icon>添加规则</el-button>
      <el-alert type="info" :closable="false" style="margin-top: 10px;">
        <template #title>
          <span>默认规则：首检数量 <b>{{ DEFAULT_QTY }}只</b>，生产数量小于 <b>{{ DEFAULT_FULL_INSPECTION_THRESHOLD }}只</b> 时全检。可针对特定产品配置个性化规则。</span>
        </template>
      </el-alert>
    </div>

    <el-table :data="rulesList" border v-loading="loading">
      <el-table-column prop="product_code" label="产品编码" min-width="120" />
      <el-table-column prop="product_name" label="产品名称" min-width="150" />
      <el-table-column prop="first_article_qty" label="首检数量" width="100" />
      <el-table-column prop="full_inspection_threshold" label="全检阈值" width="100">
        <template #default="{ row }">
          &lt; {{ row.full_inspection_threshold }} 件
        </template>
      </el-table-column>
      <el-table-column prop="template_name" label="检验模板" min-width="120">
        <template #default="{ row }">{{ row.template_name || '-' }}</template>
      </el-table-column>
      <el-table-column prop="is_mandatory" label="强制首检" width="90">
        <template #default="{ row }">
          <el-tag :type="row.is_mandatory ? 'success' : 'info'" size="small">{{ row.is_mandatory ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)"
            v-permission="'quality:first-article'">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)"
            v-permission="'quality:first-article'">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑规则弹窗 -->
    <el-dialog v-model="showAddRule" :title="editingRule ? '编辑规则' : '添加规则'" width="500px" append-to-body>
      <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleFormRules" label-width="100px">
        <el-form-item label="产品" prop="product_id">
          <el-select 
            v-model="ruleForm.product_id" 
            placeholder="搜索/选择产品" 
            filterable 
            remote
            :remote-method="debouncedSearchProducts"
            :loading="loadingProducts"
            style="width: 100%" 
            :disabled="!!editingRule"
          >
            <el-option v-for="p in productOptions" :key="p.id" :label="`${p.code || '无编码'} - ${p.name || '未命名'}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="首检数量" prop="first_article_qty">
          <el-input-number v-model="ruleForm.first_article_qty" :min="1" :max="100" />
          <span style="margin-left: 10px; color: var(--color-text-secondary);">只</span>
        </el-form-item>
        <el-form-item label="全检阈值" prop="full_inspection_threshold">
          <el-input-number v-model="ruleForm.full_inspection_threshold" :min="1" :max="100" />
          <span style="margin-left: 10px; color: var(--color-text-secondary);">生产数量小于此值时全检</span>
        </el-form-item>
        <el-form-item label="检验模板">
          <el-select v-model="ruleForm.template_id" placeholder="选择检验模板" clearable style="width: 100%">
            <el-option v-for="t in templateOptions" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="强制首检">
          <el-switch v-model="ruleForm.is_mandatory" />
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
import { searchMaterials, mapMaterialData, SEARCH_CONFIG } from '@/utils/searchConfig'
import { FIRST_ARTICLE_CONFIG } from '@/constants/systemConstants'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

// 使用常量定义默认值
const { DEFAULT_QTY, DEFAULT_FULL_INSPECTION_THRESHOLD } = FIRST_ARTICLE_CONFIG

const loading = ref(false)
const submitting = ref(false)
const loadingProducts = ref(false)
let searchTimeout = null
let currentSearchId = 0
const rulesList = ref([])
const productOptions = ref([])
const templateOptions = ref([])
const showAddRule = ref(false)
const editingRule = ref(null)
const ruleFormRef = ref(null)

// 默认表单值
const getDefaultRuleForm = () => ({
  product_id: null,
  first_article_qty: DEFAULT_QTY,
  full_inspection_threshold: DEFAULT_FULL_INSPECTION_THRESHOLD,
  template_id: null,
  is_mandatory: true,
  note: ''
})

const ruleForm = ref(getDefaultRuleForm())
const ruleFormRules = { product_id: [{ required: true, message: '请选择产品', trigger: 'change' }] }

const fetchRules = async () => {
  loading.value = true
  try {
    const res = await qualityApi.getFirstArticleRules()
    rulesList.value = res.data || res || []
  } catch (error) {
    console.error('获取首检规则失败:', error)
  } finally {
    loading.value = false
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
    const res = await qualityApi.getTemplates({ type: 'first_article', pageSize: 100 })
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
  await ElMessageBox.confirm('确定删除该首检规则？', '提示', { type: 'warning' })
  try {
    await qualityApi.deleteFirstArticleRule(row.id)
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
      await qualityApi.updateFirstArticleRule(editingRule.value.id, ruleForm.value)
    } else {
      await qualityApi.createFirstArticleRule(ruleForm.value)
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

watch(() => props.visible, (val) => { if (val) { fetchRules(); fetchProducts(); fetchTemplates() } })
</script>

