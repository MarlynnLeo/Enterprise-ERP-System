<template>
  <AppDialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    :title="title"
    mode="form"
    wide
    @open="handleOpen"
    @close="handleClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="95px">
      <!-- 物料大类和物料编码 -->
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="物料大类" prop="productCategoryId">
            <el-cascader
              v-model="productCategoryCascaderValue"
              :options="productCategoryOptions"
              :props="{
                value: 'id',
                label: 'displayName',
                children: 'children',
                checkStrictly: true,
                emitPath: false
              }"
              placeholder="请选择物料大类（支持搜索）"
              clearable
              filterable
              :filter-method="cascaderFilterMethod"
              :debounce="300"
              class="w-full"
              @change="handleCascaderChange"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="物料编码" prop="code">
            <div class="material-code-field">
              <el-input
                v-model="form.code"
                placeholder="选择大类自动生成"
                class="material-code-input"
              />
              <el-button
                type="primary"
                class="material-code-btn"
                :disabled="!form.categoryId"
                @click="regenerateMaterialCode"
                title="重新生成编码"
              >
                <el-icon><Refresh /></el-icon>
              </el-button>
            </div>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 物料名称、物料类型、单位 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="物料名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入物料名称"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="物料类型" prop="materialType">
            <el-select v-model="form.materialType" placeholder="请选择物料类型" class="w-full">
              <el-option
                v-for="item in materialTypeOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="单位" prop="unitId">
            <el-select v-model="form.unitId" placeholder="请选择单位" class="w-full">
              <el-option
                v-for="item in unitOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 检验方式、物料来源、物料号（A3图号） -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="检验方式" prop="inspectionMethodId">
            <el-select v-model="form.inspectionMethodId" placeholder="请选择检验方式" clearable class="w-full">
              <el-option
                v-for="item in inspectionMethodOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="物料来源" prop="materialSourceId">
            <el-select v-model="form.materialSourceId" placeholder="请选择物料来源" class="w-full">
              <el-option
                v-for="item in materialSourceOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
                <span class="option-row--split">
                  <span class="option-code">{{ item.name }}</span>
                  <span class="option-name">{{ getSourceTypeLabel(item.type) }}</span>
                </span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="物料号">
            <el-input
              v-model="form.drawingNo"
              placeholder="来自A3物料图号"
              clearable />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 规格型号、材料、供应商 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="规格型号">
            <el-input v-model="form.specs" placeholder="请输入规格型号"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="材料" prop="material">
            <el-input v-model="form.material" placeholder="请输入材料/材质" clearable></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="供应商" prop="supplierId">
            <el-select
              v-model="form.supplierId"
              placeholder="请输入供应商名称或编码搜索"
              clearable
              filterable
              remote
              reserve-keyword
              :remote-method="searchSuppliers"
              :loading="supplierLoading"
              class="w-full">
              <el-option
                v-for="item in filteredSupplierOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
                <span class="option-row--split">
                  <span class="option-code">{{ item.name }}</span>
                  <span class="option-name">{{ item.code }}</span>
                </span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 生产组、色号 -->
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="生产组" prop="productionGroupId">
            <el-select
              v-model="form.productionGroupId"
              placeholder="请选择生产组"
              clearable
              class="w-full">
              <el-option
                v-for="item in productionGroupOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
                <span class="option-row--split">
                  <span class="option-code">{{ item.name }}</span>
                  <span class="option-name">{{ item.code }}</span>
                </span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="色号">
            <el-input v-model="form.colorCode" placeholder="请输入色号"></el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 仓库、物料负责人 -->
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="仓库" prop="locationId">
            <el-select
              v-model="form.locationId"
              placeholder="请选择仓库"
              class="w-full">
              <el-option
                v-for="item in locationOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="物料负责人">
            <el-select
              v-model="form.managerId"
              placeholder="请选择负责人"
              clearable
              filterable
              class="w-full"
            >
              <el-option
                v-for="item in managerOptions"
                :key="item.id"
                :label="item.realName || item.username"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>


      <!-- 销售价格、采购成本、安全库存 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="销售价格">
            <el-input
              v-if="canMaintainPrice"
              v-model="form.price"
              placeholder="0.00"
            />
            <el-input v-else :model-value="canViewPrice ? form.price : '***'" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="采购成本">
            <el-input
              v-if="canViewPrice || canMaintainPrice"
              v-model="form.costPrice"
              placeholder="0.00"
              disabled
            >
              <template #suffix>
                <el-tooltip content="采购入库时自动更新">
                  <el-icon><InfoFilled /></el-icon>
                </el-tooltip>
              </template>
            </el-input>
            <el-input v-else model-value="***" disabled />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="安全库存">
            <el-input v-model="form.safetyStock" placeholder="0"></el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 最小库存、最大库存、税率 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="最小库存">
            <el-input v-model="form.minStock" placeholder="0"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="最大库存">
            <el-input v-model="form.maxStock" placeholder="0"></el-input>
          </el-form-item>
        </el-col>
        <el-col v-if="canMaintainPrice" :span="8">
          <el-form-item label="税率">
            <el-select v-model="form.taxRate" placeholder="请选择税率" class="w-full">
              <el-option
                v-for="rate in financeStore.vatRateOptions"
                :key="rate"
                :label="financeStore.formatTaxRate(rate)"
                :value="rate">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="备注">
        <el-input v-model="form.remark" placeholder="请输入备注" clearable></el-input>
      </el-form-item>

      <el-form-item label="上传附件">
        <el-upload
          action="#"
          :auto-upload="false"
          :on-change="handleAttachmentChange"
          :on-remove="handleAttachmentRemove"
          :file-list="attachmentFileList"
          multiple
          :limit="5"
          accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,.xls,.xlsx"
        >
          <el-button type="primary" size="small">
            <el-icon><Upload /></el-icon> 选择文件
          </el-button>
        </el-upload>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="submitForm">确定</el-button>
      </span>
    </template>
    </AppDialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { Refresh, InfoFilled, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { materialApi } from '@/api/material'
import { useFinanceStore } from '@/stores/finance'
import { MATERIAL_TYPE_OPTIONS, normalizeMaterialType } from '@/utils/materialTypes'
import { parseDataObject } from '@/utils/responseParser'

const financeStore = useFinanceStore()
financeStore.loadSettings()

const props = defineProps({
  modelValue: Boolean,
  title: String,
  editData: Object,
  productCategoryOptions: { type: Array, default: () => [] },
  inspectionMethodOptions: { type: Array, default: () => [] },
  materialSourceOptions: { type: Array, default: () => [] },
  unitOptions: { type: Array, default: () => [] },
  locationOptions: { type: Array, default: () => [] },
  productionGroupOptions: { type: Array, default: () => [] },
  managerOptions: { type: Array, default: () => [] },
  canMaintainPrice: { type: Boolean, default: false },
  canViewPrice: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'success', 'search-suppliers'])

const formRef = ref(null)
const submitting = ref(false)
const supplierLoading = ref(false)
const filteredSupplierOptions = ref([])
const productCategoryCascaderValue = ref(null)
const materialTypeOptions = MATERIAL_TYPE_OPTIONS

const isEdit = computed(() => !!props.editData?.id)
const isCopyMode = computed(() => !!props.editData && !props.editData.id)

const COPYABLE_FIELDS = [
  'name',
  'materialType',
  'material',
  'specs',
  'drawingNo',
  'colorCode',
  'unitId',
  'inspectionMethodId',
  'materialSourceId',
  'locationId',
  'managerId',
  'supplierId',
  'productionGroupId',
  'price',
  'costPrice',
  'safetyStock',
  'minStock',
  'maxStock',
  'taxRate',
  'remark'
]

const ID_FIELDS = [
  'productCategoryId',
  'categoryId',
  'inspectionMethodId',
  'materialSourceId',
  'unitId',
  'locationId',
  'managerId',
  'supplierId',
  'productionGroupId'
]

const toId = (value) => {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : value
}

const pickValue = (data, camelKey, snakeKey) => {
  if (!data) return undefined
  if (data[camelKey] !== undefined) return data[camelKey]
  if (snakeKey && data[snakeKey] !== undefined) return data[snakeKey]
  return undefined
}

const getSourceTypeLabel = (type) => {
  const labels = {
    internal: '内部',
    external: '外部',
    outsourced: '外协'
  }
  return labels[type] || type || '-'
}

const createEmptyForm = () => ({
  id: '',
  code: '',
  name: '',
  productCategoryId: null,
  categoryId: null,
  inspectionMethodId: null,
  materialSourceId: null,
  unitId: null,
  locationId: null,
  managerId: null,
  supplierId: null,
  productionGroupId: null,
  materialType: '',
  material: '',
  specs: '',
  drawingNo: '',
  colorCode: '',
  price: '',
  costPrice: '',
  safetyStock: '',
  minStock: '',
  maxStock: '',
  taxRate: financeStore.defaultVATRate,
  remark: ''
})

const form = reactive(createEmptyForm())

// 附件相关状态
const attachmentFileList = ref([])

// 附件选择
const handleAttachmentChange = (file, fileList) => {
  attachmentFileList.value = fileList
}

// 附件移除
const handleAttachmentRemove = (file, fileList) => {
  attachmentFileList.value = fileList
}

const rules = {
  name: [{ required: true, message: '请输入物料名称', trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择物料大类', trigger: 'change' }],
  code: [{ required: true, message: '请输入或生成物料编码', trigger: 'blur' }],
  unitId: [{ required: true, message: '请选择单位', trigger: 'change' }],
  materialType: [{ required: true, message: '请选择物料类型', trigger: 'change' }]
}

const seedSupplierOption = (data) => {
  const supplierId = toId(pickValue(data, 'supplierId', 'supplier_id'))
  const supplierName = pickValue(data, 'supplierName', 'supplier_name')
  const supplierCode = pickValue(data, 'supplierCode', 'supplier_code') || ''
  if (!supplierId) {
    return
  }
  const exists = filteredSupplierOptions.value.some((item) => Number(item.id) === Number(supplierId))
  if (exists) return
  filteredSupplierOptions.value = [
    {
      id: supplierId,
      name: supplierName || `供应商#${supplierId}`,
      code: supplierCode
    },
    ...filteredSupplierOptions.value
  ]
}

const syncProductCategoryFromLeaf = (leafId) => {
  const categoryInfo = findCategoryPath(leafId, props.productCategoryOptions)
  if (!categoryInfo) {
    if (leafId) form.productCategoryId = leafId
    return
  }
  form.productCategoryId = categoryInfo.level3?.id || categoryInfo.level2?.id || categoryInfo.current?.id || leafId
}

const fillFormData = (data) => {
  if (!data) {
    resetForm()
    return
  }

  Object.assign(form, createEmptyForm())
  Object.keys(form).forEach((key) => {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    const value = pickValue(data, key, snakeKey)
    if (value === undefined) return
    if (ID_FIELDS.includes(key)) {
      form[key] = toId(value)
    } else if (key === 'materialType') {
      form[key] = normalizeMaterialType(value)
    } else {
      form[key] = value
    }
  })
  form.id = data.id || ''

  if (!form.categoryId && form.productCategoryId) {
    form.categoryId = form.productCategoryId
  }
  if (form.categoryId) {
    syncProductCategoryFromLeaf(form.categoryId)
  }

  seedSupplierOption(data)
  productCategoryCascaderValue.value = form.categoryId

  if (!data.id && form.categoryId) {
    nextTick(() => {
      regenerateMaterialCode()
    })
  }
  if (data.id) {
    loadExistingAttachments(data.id)
  } else {
    attachmentFileList.value = []
  }
}

// 加载已有附件（编辑模式）
const loadExistingAttachments = async (materialId) => {
  try {
    const res = await materialApi.getMaterialAttachments(materialId)
    const list = res?.data || res
    const items = Array.isArray(list) ? list : (list?.data || [])
    attachmentFileList.value = items.map(a => ({
      name: a.fileName || a.name || '附件',
      url: a.url || a.filePath,
      // 没有raw属性表示是已存在的附件，submitForm中会跳过
    }))
  } catch {
    attachmentFileList.value = []
  }
}

// 使用 watch 监听 editData 变化，确保数据正确填充
// immediate: true 确保组件首次渲染时就执行
watch(() => props.editData, (newData) => {
  if (props.modelValue && newData) {
    nextTick(() => {
      fillFormData(newData)
    })
  }
}, { immediate: true, deep: true })

// 监听对话框打开状态
watch(() => props.modelValue, (visible) => {
  if (visible && props.editData) {
    nextTick(() => {
      fillFormData(props.editData)
    })
  } else if (!visible) {
    resetForm()
  }
})

const handleOpen = () => {
  // 保留此方法作为备用，主要数据填充已由 watch 处理
  if (props.editData) {
    fillFormData(props.editData)
  }
}

const handleClose = () => {
  emit('update:modelValue', false)
  resetForm()
}

const resetForm = () => {
  if (formRef.value) formRef.value.resetFields()
  Object.assign(form, createEmptyForm())
  filteredSupplierOptions.value = []
  productCategoryCascaderValue.value = null
  attachmentFileList.value = []
}

const buildSubmitPayload = () => {
  const payload = { ...form }
  delete payload.id
  if (form.categoryId) {
    syncProductCategoryFromLeaf(form.categoryId)
    payload.categoryId = form.categoryId
    payload.productCategoryId = form.productCategoryId
  }
  if (!props.canMaintainPrice) {
    delete payload.price
    delete payload.costPrice
    delete payload.taxRate
  }
  return payload
}

// === Cascader 级联选择器逻辑 ===
// 搜索过滤方法：支持按编码和名称搜索
const cascaderFilterMethod = (node, keyword) => {
  const data = node.data
  const kw = keyword.toLowerCase()
  return (
    (data.displayName && data.displayName.toLowerCase().includes(kw)) ||
    (data.name && data.name.toLowerCase().includes(kw)) ||
    (data.code && data.code.toLowerCase().includes(kw))
  )
}

const applyPreviousMaterial = (data) => {
  const keptCode = form.code
  const keptCategoryId = form.categoryId
  const keptProductCategoryId = form.productCategoryId

  COPYABLE_FIELDS.forEach((key) => {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    const value = pickValue(data, key, snakeKey)
    if (value === undefined) return
    if (ID_FIELDS.includes(key)) {
      form[key] = toId(value)
    } else if (key === 'materialType') {
      form[key] = normalizeMaterialType(value)
    } else {
      form[key] = value
    }
  })

  form.id = ''
  form.code = keptCode
  form.categoryId = keptCategoryId
  form.productCategoryId = keptProductCategoryId
  seedSupplierOption(data)
}

const promptCopyPreviousMaterial = async (categoryId) => {
  try {
    const res = await materialApi.getLatestMaterialByCategory({ categoryId })
    const previous = parseDataObject(res)
    if (!previous || !previous.id) return

    const label = [previous.code, previous.name].filter(Boolean).join(' ')
    await ElMessageBox.confirm(
      `该大类下上一个物料是「${label}」。是否复制它的信息？`,
      '复制上一物料',
      {
        confirmButtonText: '是',
        cancelButtonText: '否',
        type: 'info',
        distinguishCancelAndClose: true
      }
    )
    applyPreviousMaterial(previous)
    ElMessage.success(`已复制物料 ${label} 的信息，请核对后保存`)
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.error('获取上一物料失败:', error)
  }
}

const handleCascaderChange = async (value) => {
  form.categoryId = value || null
  if (value) {
    syncProductCategoryFromLeaf(value)
  } else {
    form.productCategoryId = null
  }
  if (value && !isEdit.value) {
    const generated = await regenerateMaterialCode({ silent: true })
    if (generated && !isCopyMode.value) {
      await promptCopyPreviousMaterial(value)
    }
  }
}

watch(() => form.categoryId, (val) => {
  if (val !== productCategoryCascaderValue.value) {
    productCategoryCascaderValue.value = val
  }
}, { immediate: true })

watch(() => props.productCategoryOptions, () => {
  if (props.modelValue && form.categoryId) {
    syncProductCategoryFromLeaf(form.categoryId)
    productCategoryCascaderValue.value = form.categoryId
  }
})

const findCategoryPath = (targetId, categories, path = []) => {
  if (targetId === null || targetId === undefined || targetId === '') return null
  for (const category of categories) {
    const currentPath = [...path, category]

    if (Number(category.id) === Number(targetId)) {
      return {
        level1: currentPath[0] || null,
        level2: currentPath[1] || null,
        level3: currentPath[2] || null,
        current: category
      }
    }

    if (category.children && category.children.length > 0) {
      const found = findCategoryPath(targetId, category.children, currentPath)
      if (found) return found
    }
  }
  return null
}

// 获取下一个物料序号
const getNextMaterialSequence = async (codePrefix) => {
  try {
    const response = await materialApi.getNextMaterialCode({ prefix: codePrefix })
    const responseData = response?.data || response
    if (responseData?.nextSequence) {
      return responseData.nextSequence
    }
    return 1
  } catch (error) {
    console.error('获取下一个物料序号失败:', error)
    return 1
  }
}

// 生成物料编码
const generateMaterialCode = async (selectedCategoryId) => {
  // 1. 找到选中的产品大类及其层级结构
  const categoryInfo = findCategoryPath(selectedCategoryId, props.productCategoryOptions)
  if (!categoryInfo) {
    throw new Error('未找到选中的产品大类信息')
  }

  // 2. 检查是否选择了至少2级目录
  if (!categoryInfo.level2) {
    throw new Error('请选择具体的2级产品大类，不能只选择1级大类')
  }

  // 3. 编码前缀：直接使用选中分类节点的数字编码（如 1052、100104）
  const codePrefix = categoryInfo.current.code || ''

  if (!codePrefix) {
    throw new Error('产品大类编码信息不完整')
  }

  // 4. 查询现有物料编码，找到下一个可用序号
  const nextSequence = await getNextMaterialSequence(codePrefix)

  // 5. 生成完整编码（分类编码 + 3位序号，如 1052001）
  const fullCode = codePrefix + nextSequence.toString().padStart(3, '0')

  return fullCode
}

// 手动重新生成物料编码
const regenerateMaterialCode = async (options = {}) => {
  if (!form.categoryId) {
    if (!options.silent) ElMessage.warning('请先选择物料大类')
    return false
  }

  try {
    const generatedCode = await generateMaterialCode(form.categoryId)
    if (generatedCode) {
      form.code = generatedCode
      if (!options.silent) {
        ElMessage.success(`已生成物料编码: ${generatedCode}`)
      }
      return true
    }
  } catch (error) {
    console.error('生成物料编码失败:', error)
    ElMessage.error(error.message || '生成编码失败')
  }
  return false
}

const searchSuppliers = (query) => {
  supplierLoading.value = true
  emit('search-suppliers', query, (options) => {
    const list = Array.isArray(options) ? options : []
    const currentId = toId(form.supplierId)
    if (currentId && !list.some((item) => Number(item.id) === Number(currentId))) {
      const current = filteredSupplierOptions.value.find((item) => Number(item.id) === Number(currentId))
      filteredSupplierOptions.value = current ? [current, ...list] : list
    } else {
      filteredSupplierOptions.value = list
    }
    supplierLoading.value = false
  })
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true
      try {
        let materialId = form.id
        const payload = buildSubmitPayload()
        if (materialId) {
          await materialApi.updateMaterial(materialId, payload)
          ElMessage.success('更新成功')
        } else {
          const res = await materialApi.createMaterial(payload)
          // 获取新创建物料的ID，用于上传附件
          const resData = res?.data || res
          materialId = resData?.id || resData?.data?.id
          ElMessage.success('创建成功')
        }

        // 上传待处理的附件文件
        if (materialId && attachmentFileList.value.length > 0) {
          const pendingFiles = attachmentFileList.value.filter(f => f.raw) // 只上传新选择的文件
          if (pendingFiles.length > 0) {
            let uploadedCount = 0
            for (const fileItem of pendingFiles) {
              try {
                const formData = new FormData()
                formData.append('file', fileItem.raw)
                await materialApi.uploadMaterialAttachment(materialId, formData)
                uploadedCount++
              } catch (uploadErr) {
                console.error('附件上传失败:', fileItem.name, uploadErr)
              }
            }
            if (uploadedCount > 0) {
              ElMessage.success(`已上传 ${uploadedCount} 个附件`)
            }
            if (uploadedCount < pendingFiles.length) {
              ElMessage.warning(`${pendingFiles.length - uploadedCount} 个附件上传失败`)
            }
          }
        }

        emit('success')
        handleClose()
      } catch (error) {
        ElMessage.error(error.message || '操作失败')
      } finally {
        submitting.value = false
      }
    }
  })
}
</script>

<style scoped>
.attachment-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
}

/* 物料编码：输入框 + 刷新按钮，限制在表单项内容宽度内 */
.material-code-field {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
.material-code-field :deep(.material-code-input) {
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
}
.material-code-field :deep(.material-code-input .el-input__wrapper) {
  width: 100%;
}
.material-code-btn {
  flex: 0 0 auto;
}

/* 表单项内容区防止 flex 子项把对话框撑宽 */
:deep(.el-form-item__content) {
  max-width: 100%;
  min-width: 0;
}
:deep(.app-dialog-form-body) {
  overflow-x: hidden;
}
:deep(.w-full) {
  width: 100%;
  max-width: 100%;
}

/* 附件列表显示在按钮前面（左侧），而不是下方 */
:deep(.el-upload-list) {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-right: 8px;
  vertical-align: middle;
}
:deep(.el-form-item__content > .el-upload) {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
}
:deep(.el-upload-list__item) {
  margin-top: 0;
}
</style>
