<!--
/**
 * FirstArticleRulesDialog.vue
 * @description 首检规则配置弹窗
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    title="首检规则配置"
    mode="form"
    wide
  >
    <div class="mb-md">
      <el-button v-permission="'quality:settings:create'" type="primary" @click="showAddRule = true"><el-icon><Plus /></el-icon>添加规则</el-button>
      <el-alert type="info" :closable="false" class="mt-10">
        <template #title>
          <span>默认规则：首检数量 <b>{{ DEFAULT_QTY }}只</b>，生产数量小于 <b>{{ DEFAULT_FULL_INSPECTION_THRESHOLD }}只</b> 时全检。可针对特定产品配置个性化规则。</span>
        </template>
      </el-alert>
    </div>

    <el-table :data="rulesList" border v-loading="loading">
      <el-table-column prop="productCode" label="产品编码" min-width="120" />
      <el-table-column prop="productName" label="产品名称" min-width="150" />
      <el-table-column prop="firstArticleQty" label="首检数量" width="100" />
      <el-table-column prop="fullInspectionThreshold" label="全检阈值" width="100">
        <template #default="{ row }">
          &lt; {{ row.fullInspectionThreshold }} 件
        </template>
      </el-table-column>
      <el-table-column prop="templateName" label="检验模板" min-width="120">
        <template #default="{ row }">{{ row.templateName || '-' }}</template>
      </el-table-column>
      <el-table-column prop="isMandatory" label="强制首检" width="90">
        <template #default="{ row }">
          <el-tag :type="row.isMandatory ? 'success' : 'info'" size="small">{{ row.isMandatory ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="150" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
        <template #default="{ row }">
          <el-button size="small" @click="handleEdit(row)"
            v-permission="'quality:settings:update'">编辑</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row)"
            v-permission="'quality:settings:delete'">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
    </template>
  </AppDialog>

  <!-- 添加/编辑规则（并列 AppDialog） -->
  <AppDialog
    v-model="showAddRule"
    :title="editingRule ? '编辑规则' : '添加规则'"
    mode="form"
    width="500px"
  >
    <el-form ref="ruleFormRef" :model="ruleForm" :rules="ruleFormRules" label-width="100px">
      <el-form-item label="产品" prop="productId">
        <el-select
          v-model="ruleForm.productId"
          placeholder="搜索/选择产品"
          filterable
          remote
          :remote-method="debouncedSearchProducts"
          :loading="loadingProducts"
          class="w-full"
          :disabled="!!editingRule"
        >
          <el-option v-for="p in productOptions" :key="p.id" :label="`${p.code || '无编码'} - ${p.name || '未命名'}`" :value="p.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="首检数量" prop="firstArticleQty">
        <el-input-number v-model="ruleForm.firstArticleQty" :min="1" :max="100" />
        <span class="ml-sm text-muted">只</span>
      </el-form-item>
      <el-form-item label="全检阈值" prop="fullInspectionThreshold">
        <el-input-number v-model="ruleForm.fullInspectionThreshold" :min="1" :max="100" />
        <span class="ml-sm text-muted">生产数量小于此值时全检</span>
      </el-form-item>
      <el-form-item label="检验模板">
        <el-select v-model="ruleForm.templateId" placeholder="选择检验模板" clearable class="w-full">
          <el-option v-for="t in templateOptions" :key="t.id" :label="t.templateName || t.name" :value="t.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="强制首检">
        <el-switch v-model="ruleForm.isMandatory" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="ruleForm.note" type="textarea" placeholder="请输入备注" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showAddRule = false">取消</el-button>
      <el-button v-permission="editingRule ? 'quality:settings:update' : 'quality:settings:create'" type="primary" :loading="submitting" @click="handleSaveRule">保存</el-button>
    </template>
  </AppDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { qualityApi } from '@/api/quality'
import { materialApi } from '@/api/material'
import { searchMaterials, loadMaterials, mapMaterialData, SEARCH_CONFIG } from '@/utils/searchConfig'
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

// 初始加载产品列表（无搜索条件）
const fetchProducts = async () => {
  loadingProducts.value = true
  try {
    const res = await loadMaterials(materialApi, { type: 'product', pageSize: 50 })
    productOptions.value = mapMaterialData(res)
  } catch (error) {
    console.error('获取产品列表失败:', error)
    productOptions.value = []
  } finally {
    loadingProducts.value = false
  }
}

// 远程搜索产品
const debouncedSearchProducts = (query) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  const searchId = ++currentSearchId
  searchTimeout = setTimeout(async () => {
    if (!query || !query.trim()) {
      // 空搜索时重新加载全量产品列表
      await fetchProducts()
      return
    }
    loadingProducts.value = true
    try {
      const res = await searchMaterials(materialApi, query, { type: 'product', pageSize: 50 })
      if (searchId === currentSearchId) {
        productOptions.value = mapMaterialData(res)
      }
    } catch (error) {
      console.error('搜索产品失败:', error)
      if (searchId === currentSearchId) productOptions.value = []
    } finally {
      if (searchId === currentSearchId) loadingProducts.value = false
    }
  }, SEARCH_CONFIG.debounceTime)
}

const fetchTemplates = async () => {
  try {
    const res = await qualityApi.getTemplates({
      inspection_type: 'first_article',
      status: 'active',
      pageSize: 50
    })
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
