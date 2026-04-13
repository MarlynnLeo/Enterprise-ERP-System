<template>
  <el-dialog
    :title="title"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="750px"
    @open="handleOpen"
    @close="handleClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="95px">
      <!-- 物料大类和物料编码在一行 -->
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="物料大类" prop="product_category_id">
            <el-tree-select
              v-model="form.product_category_id"
              :data="productCategoryOptions"
              :props="{ value: 'id', label: 'displayName', children: 'children' }"
              placeholder="请选择物料大类"
              clearable
              filterable
              check-strictly
              default-expand-all
              :expand-on-click-node="false"
              style="width: 100%"
              :filter-node-method="filterProductCategory"
              @change="handleProductCategoryChange"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="物料编码" prop="code">
            <div style="display: flex; gap: 8px;">
              <el-input
                v-model="form.code"
                placeholder="选择大类自动生成"
                style="flex: 1;"
              ></el-input>
              <el-button
                type="primary"
                :disabled="!form.product_category_id"
                @click="regenerateMaterialCode"
                title="重新生成编码"
              >
                <el-icon><Refresh /></el-icon>
              </el-button>
            </div>
          </el-form-item>
        </el-col>
      </el-row>
      <!-- 物料名称、物料类型、检验方式在一行 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="物料名称" prop="name">
            <el-input v-model="form.name" placeholder="请输入物料名称"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="物料类型" prop="category_id">
            <el-select v-model="form.category_id" placeholder="请选择物料类型" style="width: 100%">
              <el-option
                v-for="item in categoryOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="检验方式" prop="inspection_method_id">
            <el-select v-model="form.inspection_method_id" placeholder="请选择检验方式" clearable style="width: 100%">
              <el-option
                v-for="item in inspectionMethodOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 物料来源、规格型号、供应商在一行 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="物料来源" prop="material_source_id">
            <el-select v-model="form.material_source_id" placeholder="请选择物料来源" style="width: 100%">
              <el-option
                v-for="item in materialSourceOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
                <span style="float: left">{{ item.name }}</span>
                <span style="float: right; color: #8492a6; font-size: 13px">{{ item.type === 'internal' ? '内部' : '外部' }}</span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="规格型号">
            <el-input v-model="form.specs" placeholder="请输入规格型号"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="供应商" prop="supplier_id">
            <el-select
              v-model="form.supplier_id"
              placeholder="请输入供应商名称或编码进行搜索"
              clearable
              filterable
              remote
              reserve-keyword
              :remote-method="searchSuppliers"
              :loading="supplierLoading"
              style="width: 100%">
              <el-option
                v-for="item in filteredSupplierOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
                <span style="float: left">{{ item.name }}</span>
                <span style="float: right; color: #8492a6; font-size: 13px">{{ item.code }}</span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 生产组、图号、色号在一行 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="生产组" prop="production_group_id">
            <el-select
              v-model="form.production_group_id"
              placeholder="请选择生产组"
              clearable
              style="width: 100%">
              <el-option
                v-for="item in productionGroupOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
                <span style="float: left">{{ item.name }}</span>
                <span style="float: right; color: #8492a6; font-size: 13px">{{ item.code }}</span>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="图号">
            <el-input v-model="form.drawing_no" placeholder="请输入图号"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="色号">
            <el-input v-model="form.color_code" placeholder="请输入色号"></el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 材质、单位、仓库在一行 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="材质">
            <el-input v-model="form.material_type" placeholder="如：304不锈钢"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="单位" prop="unit_id">
            <el-select v-model="form.unit_id" placeholder="请选择单位" style="width: 100%">
              <el-option
                v-for="item in unitOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="仓库" prop="location_id">
            <el-select
              v-model="form.location_id"
              placeholder="请选择仓库"
              style="width: 100%">
              <el-option
                v-for="item in locationOptions"
                :key="item.id"
                :label="item.name"
                :value="item.id">
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 物料负责人和物料位置在一行 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="物料负责人">
            <el-select
              v-model="form.manager_id"
              placeholder="请选择物料负责人"
              clearable
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="item in managerOptions"
                :key="item.id"
                :label="item.real_name || item.username"
                :value="item.id"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="16">
          <el-form-item label="物料位置">
            <el-input 
              v-model="form.location_detail"
              placeholder="如：零部件库-3排-4列"
              clearable />
          </el-form-item>
        </el-col>
      </el-row>

      <!-- 价格和库存 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="销售价格">
            <el-input v-model="form.price" placeholder="0.00"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="采购成本">
            <el-input v-model="form.cost_price" placeholder="0.00" disabled>
              <template #suffix>
                <el-tooltip content="采购入库时自动更新">
                  <el-icon><InfoFilled /></el-icon>
                </el-tooltip>
              </template>
            </el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="安全库存">
            <el-input v-model="form.safety_stock" placeholder="0"></el-input>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="最小库存">
            <el-input v-model="form.min_stock" placeholder="0"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="最大库存">
            <el-input v-model="form.max_stock" placeholder="0"></el-input>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="税率">
            <el-select v-model="form.tax_rate" placeholder="请选择税率" style="width: 100%">
              <el-option label="0%" :value="0"></el-option>
              <el-option label="1%" :value="0.01"></el-option>
              <el-option label="3%" :value="0.03"></el-option>
              <el-option label="6%" :value="0.06"></el-option>
              <el-option label="9%" :value="0.09"></el-option>
              <el-option label="13%" :value="0.13"></el-option>
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="3"
          placeholder="请输入备注"
        ></el-input>
      </el-form-item>

      <el-form-item label="附件" v-if="isEdit">
        <!-- 附件逻辑简化，使用一个Slot或者保留原样 -->
        <div class="attachment-tip">（附件功能请保存后在详情页操作，或此处预留接口）</div>
      </el-form-item>
      <el-form-item v-else>
        <div class="attachment-tip">保存物料后可上传附件</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="submitForm">确定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { Refresh, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { materialApi } from '@/api/material'
// 需要引入其他API: productCategory, location, unit, etc.
// 为了简化，这些options可以由父组件传入

const props = defineProps({
  modelValue: Boolean,
  title: String,
  editData: Object,
  // 选项类Props
  productCategoryOptions: { type: Array, default: () => [] },
  categoryOptions: { type: Array, default: () => [] },
  inspectionMethodOptions: { type: Array, default: () => [] },
  materialSourceOptions: { type: Array, default: () => [] },
  unitOptions: { type: Array, default: () => [] },
  locationOptions: { type: Array, default: () => [] },
  productionGroupOptions: { type: Array, default: () => [] },
  managerOptions: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:modelValue', 'success', 'search-suppliers'])

const formRef = ref(null)
const submitting = ref(false)
const supplierLoading = ref(false)
const filteredSupplierOptions = ref([]) // 本地或远程搜索结果

const isEdit = computed(() => !!props.editData)

const form = reactive({
  id: '',
  code: '',
  name: '',
  product_category_id: null,
  category_id: null,
  inspection_method_id: null,
  material_source_id: null,
  unit_id: null,
  location_id: null,
  location_detail: '',
  manager_id: null,
  supplier_id: null,
  production_group_id: null,
  material_type: '', // 材质
  specs: '',
  drawing_no: '',
  color_code: '',
  price: '',
  cost_price: '',
  safety_stock: '',
  min_stock: '',
  max_stock: '',
  tax_rate: 0.13,
  remark: ''
})

const rules = {
  name: [{ required: true, message: '请输入物料名称', trigger: 'blur' }],
  product_category_id: [{ required: true, message: '请选择物料大类', trigger: 'change' }],
  code: [{ required: true, message: '请输入或生成物料编码', trigger: 'blur' }],
  unit_id: [{ required: true, message: '请选择单位', trigger: 'change' }],
  category_id: [{ required: true, message: '请选择物料类型', trigger: 'change' }]
}

// 填充表单数据的方法
const fillFormData = (data) => {
  if (data) {
    Object.keys(form).forEach(key => {
      if (data[key] !== undefined) {
        form[key] = data[key]
      }
    })
    // 特殊字段处理
    form.id = data.id
    // 如果有供应商，需要设置初始option
    if (data.supplier_id && data.supplier_name) {
      filteredSupplierOptions.value = [{
        id: data.supplier_id,
        name: data.supplier_name,
        code: data.supplier_code
      }]
    }
  } else {
    resetForm()
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
  Object.keys(form).forEach(key => {
    form[key] = (key === 'tax_rate' ? 0.13 : (['price','cost_price','min_stock','max_stock','safety_stock'].includes(key) ? '' : (key.endsWith('id') ? null : '')))
  })
}

// 递归检查节点或其任意祖先是否匹配搜索条件
const checkNodeOrAncestorMatch = (nodeId, searchValue, allOptions) => {
  // 递归函数：在树中查找节点并检查其路径上是否有匹配项
  const findAndCheckPath = (nodes, targetId, ancestorMatched = false) => {
    for (const node of nodes) {
      // 检查当前节点是否匹配
      const currentMatch = 
        (node.displayName && node.displayName.toLowerCase().indexOf(searchValue) !== -1) ||
        (node.name && node.name.toLowerCase().indexOf(searchValue) !== -1) ||
        (node.code && node.code.toLowerCase().indexOf(searchValue) !== -1)
      
      // 如果当前节点就是目标
      if (node.id === targetId) {
        // 如果当前节点匹配，或者任何祖先节点匹配，返回true
        return currentMatch || ancestorMatched
      }
      
      // 递归检查子节点
      if (node.children && node.children.length > 0) {
        const result = findAndCheckPath(node.children, targetId, ancestorMatched || currentMatch)
        if (result !== null) return result
      }
    }
    return null
  }
  
  return findAndCheckPath(allOptions, nodeId, false) === true
}

const filterProductCategory = (value, data) => {
  if (!value) return true
  const searchValue = value.toLowerCase()
  
  // 检查当前节点是否直接匹配
  const directMatch = 
    (data.displayName && data.displayName.toLowerCase().indexOf(searchValue) !== -1) ||
    (data.name && data.name.toLowerCase().indexOf(searchValue) !== -1) ||
    (data.code && data.code.toLowerCase().indexOf(searchValue) !== -1)
  
  if (directMatch) return true
  
  // 检查是否有任何祖先节点匹配（如果父节点匹配，显示其子节点）
  return checkNodeOrAncestorMatch(data.id, searchValue, props.productCategoryOptions)
}

const handleProductCategoryChange = () => {
  // 选择大类后自动生成编码（仅新增时）
  if (form.product_category_id && !isEdit.value) {
    regenerateMaterialCode()
  }
}

// 递归查找产品大类路径（找到目标ID及其层级结构）
const findCategoryPath = (targetId, categories, path = []) => {
  for (const category of categories) {
    const currentPath = [...path, category]

    if (category.id === targetId) {
      return {
        level1: currentPath[0] || null,
        level2: currentPath[1] || null,
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
const regenerateMaterialCode = async () => {
  if (!form.product_category_id) {
    ElMessage.warning('请先选择物料大类')
    return
  }

  try {
    const generatedCode = await generateMaterialCode(form.product_category_id)
    if (generatedCode) {
      form.code = generatedCode
      ElMessage.success(`已生成物料编码: ${generatedCode}`)
    }
  } catch (error) {
    console.error('生成物料编码失败:', error)
    ElMessage.error(error.message || '生成编码失败')
  }
}

const searchSuppliers = (query) => {
  emit('search-suppliers', query, (options) => {
    filteredSupplierOptions.value = options
  })
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true
      try {
        if (form.id) {
          await materialApi.updateMaterial(form.id, form)
          ElMessage.success('更新成功')
        } else {
          await materialApi.createMaterial(form)
          ElMessage.success('创建成功')
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
</style>
