<!--
/**
 * InventoryStockAdd.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-stock-add">
    <el-dialog
      :model-value="modelValue"
      @update:model-value="$emit('update:modelValue', $event)"
      title="库存调整"
      width="600px"
      @close="handleClose"
    >
      
      <!-- 表单 -->
      <el-form 
        :model="form" 
        :rules="rules" 
        ref="formRef" 
        label-width="120px"
        label-position="right"
        class="stock-form"
      >
        <el-form-item label="物料" prop="materialId">
          <el-select
            v-model="form.materialId"
            placeholder="输入物料编码、名称或规格进行搜索"
            filterable
            remote
            reserve-keyword
            :remote-method="searchMaterials"
            :loading="loadingMaterials"
            style="width: 100%"
            @change="handleMaterialChange"
            @focus="handleSelectFocus"
            clearable
            no-data-text="没有找到匹配的物料"
            loading-text="搜索中..."
            no-match-text="没有匹配的选项"
          >
            <el-option
              v-for="item in materialOptions"
              :key="item.id"
              :label="`${item.code} - ${item.name}`"
              :value="item.id"
            >
              <div class="material-option">
                <div class="material-main">
                  <span class="material-code">{{ item.code }}</span>
                  <span class="material-name">{{ item.name }}</span>
                </div>
                <div class="material-spec" v-if="item.specification">
                  规格: {{ item.specification }}
                </div>
                <div class="material-unit" v-if="item.unit_name">
                  单位: {{ item.unit_name }}
                </div>
              </div>
            </el-option>
          </el-select>
          <el-text class="search-tip" size="small" type="info">
            <el-icon><InfoFilled /></el-icon>
            提示：输入至少2个字符开始搜索，支持物料编码、名称、规格搜索。系统将显示最匹配的前200条结果，如需查找更多，请输入更精确的关键词。
          </el-text>
        </el-form-item>
        
        <el-form-item label="调整类型" prop="type">
          <el-select v-model="form.type" placeholder="选择调整类型" style="width: 100%">
            <el-option label="调整入库" value="in" />
            <el-option label="调整出库" value="out" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="调整数量" prop="quantity">
          <el-input-number 
            v-model="form.quantity" 
            :precision="2" 
            :step="1" 
            :min="form.type === 'out' ? 0.01 : 0.01" 
            style="width: 100%"
          />
          <div class="quantity-note" v-if="form.type === 'out'">
            调整出库时请输入正数，系统会自动减少库存
          </div>
          <div class="quantity-note" v-if="form.type === 'in'">
            调整入库时请输入正数，系统会自动增加库存
          </div>
        </el-form-item>
        
        <el-form-item label="备注" prop="remark">
          <el-input 
            v-model="form.remark" 
            type="textarea" 
            :rows="3" 
            placeholder="请输入备注信息"
          />
        </el-form-item>
        
        <el-form-item>
          <el-button v-permission="'inventory:stock:edit'" type="primary" @click="submitForm" :loading="submitting">提交</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>
<script setup>
import { debounce } from '@/utils/commonHelpers'
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { inventoryApi, baseDataApi } from '@/services/api'
import { SEARCH_CONFIG, searchMaterials as performSearchMaterials, mapMaterialData } from '@/utils/searchConfig'
// ===== 响应式数据 =====
const formRef = ref(null)
const materialOptions = ref([])
const loadingMaterials = ref(false)
const selectedMaterial = ref({})
const submitting = ref(false)
// ===== 组件属性和事件 =====
const _props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['update:modelValue', 'success'])
// ===== 表单数据和验证规则 =====
const form = reactive({
  materialId: '',
  type: 'in',
  quantity: 1,
  remark: ''
})
const rules = {
  materialId: [
    { required: true, message: '请选择物料', trigger: 'change' }
  ],
  type: [
    { required: true, message: '请选择调整类型', trigger: 'change' }
  ],
  quantity: [
    { required: true, message: '请输入数量', trigger: 'blur' },
    { type: 'number', message: '数量必须为数字', trigger: 'blur' }
  ]
}
// ===== 工具函数 =====
// ===== 事件处理函数 =====
// 关闭对话框
const handleClose = () => {
  resetForm()
  emit('update:modelValue', false)
}
// ===== 物料搜索相关函数 =====
let currentSearchId = 0;
// 处理选择框焦点
const handleSelectFocus = () => {
  if (materialOptions.value.length === 0) {
    searchMaterials('')
  }
}
// 搜索物料函数
const doSearchMaterials = async (query) => {
  const searchId = ++currentSearchId;
  loadingMaterials.value = true
  
  try {
    if (!query || query.trim().length === 0) {
      // 首次加载或查询为空加载默认列表
      const defaultResults = await performSearchMaterials(baseDataApi, '', {
        pageSize: 20,
        includeAll: true
      })
      if (searchId === currentSearchId) {
        materialOptions.value = mapMaterialData(defaultResults)
      }
      return
    }
    const searchResults = await performSearchMaterials(baseDataApi, query.trim(), {
      pageSize: SEARCH_CONFIG.REMOTE_SEARCH_PAGE_SIZE,
      includeAll: true
    })
    if (searchId === currentSearchId) {
      materialOptions.value = mapMaterialData(searchResults)
    }
  } catch (error) {
    console.error('搜索物料失败:', error)
    if (searchId === currentSearchId) materialOptions.value = []
  } finally {
    if (searchId === currentSearchId) loadingMaterials.value = false
  }
}
// 带防抖的搜索物料函数
const searchMaterials = debounce(doSearchMaterials, SEARCH_CONFIG.SEARCH_DEBOUNCE_DELAY || 300)
// 物料选择变化处理
const handleMaterialChange = (materialId) => {
  if (materialId) {
    const material = materialOptions.value.find(item =>
      String(item.id) === String(materialId)
    )
    if (material) {
      selectedMaterial.value = material
      ElMessage.success(`已选择物料: ${material.code} - ${material.name}`)
    } else {
      selectedMaterial.value = {}
    }
  } else {
    selectedMaterial.value = {}
  }
}
// ===== 表单操作函数 =====
// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      submitting.value = true
      try {
        // 如果是出库，确保数量是负数
        let quantity = form.quantity
        if (form.type === 'out') {
          quantity = -Math.abs(quantity)
        }
        
        // 验证选中的物料
        if (!selectedMaterial.value || !selectedMaterial.value.id) {
          ElMessage.error('请先选择物料')
          return
        }
        const locationId = Number.parseInt(
          selectedMaterial.value.location_id ||
            selectedMaterial.value.locationId ||
            selectedMaterial.value.default_warehouse_id ||
            selectedMaterial.value.warehouse_id,
          10
        )
        if (!Number.isInteger(locationId) || locationId <= 0) {
          ElMessage.error('所选物料未配置默认库位，请先在物料资料中维护库位')
          return
        }
        const data = {
          materialId: form.materialId,
          locationId,
          quantity: quantity,
          type: form.type,
          remark: form.remark
        }
        await inventoryApi.adjustStock(data)
        
        emit('success')
        emit('update:modelValue', false)
        resetForm()
      } catch (error) {
        ElMessage.error(error.message || '提交失败')
        console.error(error)
      } finally {
        submitting.value = false
      }
    }
  })
}
// 重置表单
const resetForm = () => {
  if (formRef.value) {
    formRef.value.resetFields()
  }
  selectedMaterial.value = {}
  materialOptions.value = []
  form.materialId = ''
  form.type = 'in'
  form.quantity = 1
  form.remark = ''
}
</script>
<style scoped>
.inventory-stock-add {
  :deep(.el-dialog__body) {
    padding: 30px;
  }
  
  :deep(.el-form-item) {
    margin-bottom: 22px;
  }
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stock-form {
  max-width: 800px;
  margin: 0 auto;
}
.material-option {
  padding: 8px 0;
  line-height: 1.4;
}
.material-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.material-code {
  color: var(--color-text-regular);
  font-size: 12px;
  background: #f0f2f5;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  min-width: 90px;
  text-align: center;
  font-family: 'Courier New', monospace;
  font-weight: 500;
}
.material-name {
  font-weight: 500;
  color: var(--color-text-primary);
  font-size: 14px;
}
.material-spec, .material-unit {
  color: var(--color-text-secondary);
  font-size: 12px;
  margin-top: 2px;
}
.search-tip {
  margin-top: 4px;
}
.quantity-note {
  color: var(--color-warning);
  font-size: 12px;
  margin-top: 5px;
}
</style>
