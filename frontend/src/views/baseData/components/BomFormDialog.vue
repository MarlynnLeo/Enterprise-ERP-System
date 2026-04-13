<template>
  <el-dialog
    :title="title"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="55%"
    @close="handleClose"
    @open="handleOpen"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="产品" prop="product_id">
            <el-select
              v-model="form.product_id"
              placeholder="请选择产品或输入关键词搜索"
              style="width: 100%"
              filterable
              remote
              reserve-keyword
              :remote-method="searchProducts"
              :loading="loadingProducts"
              no-data-text="没有找到匹配的产品"
              loading-text="搜索中..."
              :disabled="isEditMode">
              <el-option
                v-for="item in productOptions"
                :key="item.id"
                :label="`${item.code} - ${item.name}`"
                :value="item.id">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <span style="font-weight: bold">{{ item.code }}</span>
                  <span style="color: #8492a6; margin-left: 10px">{{ item.name }}</span>
                  <span style="color: #909399; font-size: 12px" v-if="item.specs">{{ item.specs }}</span>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="BOM版本" prop="version">
            <template v-if="isEditMode">
              <el-input
                v-model="form.version"
                disabled
              />
              <div style="font-size: 12px; color: #E6A23C; margin-top: 4px;">
                <el-icon style="vertical-align: middle;"><InfoFilled /></el-icon>
                保存时版本号将自动升级（旧版本会被保留）
              </div>
            </template>
            <template v-else>
              <el-input 
                v-model="form.version"
                placeholder="请输入版本号，如：V1.1"
                clearable />
            </template>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="附件">
        <el-upload
          class="upload-demo"
          action="#"
          :auto-upload="false"
          :on-change="handleAttachmentChange"
          :on-remove="handleAttachmentRemove"
          :on-preview="handlePreview"
          :file-list="fileList"
          multiple
          :limit="5"
          accept=".jpg,.jpeg,.png,.pdf"
        >
          <template #trigger>
            <el-button type="primary">选择文件</el-button>
          </template>
          <template #tip>
            <div class="el-upload__tip">
              支持上传图片(jpg/jpeg/png)或PDF文件，大小不超过10MB
            </div>
          </template>
        </el-upload>
      </el-form-item>
      
      <!-- 图片预览器 -->
      <el-image-viewer 
        v-if="showImageViewer" 
        :url-list="previewList" 
        @close="showImageViewer = false" 
      />

      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="请输入备注"></el-input>
      </el-form-item>

      <!-- BOM明细 -->
      <el-divider content-position="left">BOM明细</el-divider>

      <div class="bom-details">
        <div style="margin-bottom: 15px;">
          <el-button type="primary" @click="addDetail">
            <el-icon><Plus /></el-icon> 添加一级明细
          </el-button>
          <el-text type="info" size="small" style="margin-left: 10px;">
            提示：点击表格中的"添加子级"按钮可为该物料添加下级明细
          </el-text>
        </div>

        <!-- BOM明细表格（树形表格显示层级关系） -->
        <el-table
          :data="bomDetailsTree"
          border
          row-key="id"
          :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
          default-expand-all
        >
          <el-table-column label="结构" prop="wbs" width="90"></el-table-column>
          <el-table-column label="物料编码" min-width="140">
            <template #default="scope">
              <div>
                <el-select
                  v-model="scope.row.material_code"
                  placeholder="请选择物料或输入关键词搜索"
                  style="width: 100%"
                  filterable
                  remote
                  reserve-keyword
                  :remote-method="(query) => searchMaterialsForRow(query, scope.row)"
                  :loading="scope.row.loading || false"
                  @change="handleMaterialCodeChangeByRow($event, scope.row)"
                  no-data-text="没有找到匹配的物料"
                  loading-text="搜索中..."
                >
                  <el-option
                    v-for="item in (scope.row.materialOptions || [])"
                    :key="item.id"
                    :label="item.code"
                    :value="item.code">
                    <div style="display: flex; justify-content: space-between; align-items: center">
                      <span style="font-weight: bold">{{ item.code }}</span>
                      <span style="color: #8492a6; margin-left: 10px">{{ item.name }}</span>
                    </div>
                  </el-option>
                </el-select>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="物料名称" min-width="160" show-overflow-tooltip>
            <template #default="scope">
              <div>{{ scope.row.material_name || '-' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="规格型号" min-width="180" show-overflow-tooltip>
            <template #default="scope">
              <div>{{ scope.row.material_specs || '-' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="用量" width="120">
            <template #default="scope">
              <el-input-number
                v-model="scope.row.quantity"
                :min="0.001"
                :precision="3"
                :step="1"
                :controls="false"
                placeholder="用量"
                style="width: 100%"
              />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="70" align="center">
            <template #default="scope">
              <span>{{ scope.row.unit_name || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <el-input  v-model="scope.row.remark" placeholder="备注" clearable ></el-input>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="scope">
              <el-button
                size="small"
                type="success"
                @click.stop="addSubDetailForRow(scope.row)"
                title="为此物料添加下级明细"
              >
                <el-icon><Plus /></el-icon> 子件
              </el-button>
              <el-button
                size="small"
                type="danger"
                @click.stop="removeDetailByRow(scope.row)"
              >
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'

import { Plus, Delete, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage, ElImageViewer } from 'element-plus'
import { materialApi } from '@/api/material'
import { bomApi } from '@/api/bom'
import { parseListData } from '@/utils/responseParser'
import api from '@/services/axiosInstance'

const props = defineProps({
  modelValue: Boolean,
  editData: {
    type: Object,
    default: null
  },
  title: String
})

const emit = defineEmits(['update:modelValue', 'success'])

const formRef = ref(null)
const submitting = ref(false)
const isEditMode = computed(() => !!props.editData)
const loadingProducts = ref(false)
const productOptions = ref([])
const fileList = ref([])
const showImageViewer = ref(false)
const previewList = ref([])

const form = reactive({
  id: '',
  product_id: '',
  version: '',
  remark: '',
  details: [], // 扁平数组，包含 parent_id
  attachment: null
})

const rules = {
  product_id: [
    { required: true, message: '请选择产品', trigger: 'change' }
  ],
  version: [
    { required: true, message: '请输入版本号', trigger: 'blur' }
  ]
}

// 监听打开，如果是编辑，初始化
const handleOpen = () => {
  if (props.editData) {
    // 复制数据
    initForm(props.editData)
  } else {
    resetForm()
  }
}

watch(() => props.editData, (newVal) => {
  if (newVal) {
    nextTick(() => {
      initForm(newVal)
    })
  }
}, { immediate: true })

const handleClose = () => {
  emit('update:modelValue', false)
  resetForm()
}

const resetForm = () => {
  if (formRef.value) formRef.value.resetFields()
  form.id = ''
  form.product_id = ''
  form.version = 'V1.1'
  form.remark = ''
  form.details = []
  form.attachment = null
  fileList.value = []
}

const initForm = (data) => {
  form.id = data.id || ''
  form.product_id = data.productId || data.product_id || ''
  form.version = data.version || ''
  form.remark = data.remark || ''
  form.attachment = data.attachment || null
  
  if (data.attachment) {
    fileList.value = [{
      name: data.attachment.split('/').pop() || '附件文件',
      url: data.attachment
    }]
  } else {
    fileList.value = []
  }
  
  // 处理明细
  if (data.details && Array.isArray(data.details)) {
    form.details = data.details.map(d => ({
      ...d,
      material_code: d.material_code || '',
      material_name: d.material_name || '',
      material_specs: d.material_specs || '',
      unit_name: d.unit_name || '',
      quantity: d.quantity || 1,
      remark: d.remark || '',
      parent_id: d.parent_id || 0,
      level: d.level || 1,
      children: [],
      materialOptions: []
    }))
  } else {
    form.details = []
  }

  if (data.productId || data.product_id) {
    productOptions.value = [{
      id: data.productId || data.product_id,
      code: data.productCode || data.product_code,
      name: data.productName || data.product_name,
      specs: data.productSpecs || data.product_specs
    }]
  }
}

// 产品搜索
const searchProducts = async (query) => {
  if (query) {
    loadingProducts.value = true
    try {
      const res = await materialApi.getMaterials({ 
        keyword: query, 
        page: 1, 
        pageSize: 20 
      })
      productOptions.value = parseListData(res)
    } catch (error) {
      console.error('搜索产品失败:', error)
      productOptions.value = []
    } finally {
      loadingProducts.value = false
    }
  } else {
    productOptions.value = []
  }
}



// 附件处理
const handleAttachmentChange = (uploadFile, uploadFiles) => {
  form.attachment = uploadFile.raw
  fileList.value = [uploadFile]
}

const handleAttachmentRemove = (file, uploadFiles) => {
  form.attachment = null
  fileList.value = []
}

const isImage = (url) => {
  if (!url) return false
  const lowerUrl = url.toLowerCase()
  return lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg') || lowerUrl.endsWith('.png') || lowerUrl.endsWith('.gif') || lowerUrl.endsWith('.webp')
}

const isPdf = (url) => {
  if (!url) return false
  return url.toLowerCase().endsWith('.pdf')
}

const handlePreview = async (file) => {
  if (!file.url && !file.raw) return
  
  if (file.raw) {
    // 根本解决：不使用 window.open 直接打开 Blob URL 导致下载变为 uid.htm
    // 如果是未上传的本地文件，直接用原生方式读取供预览
    const url = URL.createObjectURL(file.raw)
    if (isImage(file.name) || file.raw.type.startsWith('image/')) {
      previewList.value = [url]
      showImageViewer.value = true
    } else {
      // 提示用户可以自行查看或在上传后预览
      ElMessage.info('本地文件请在提交保存后，在详情页进行完整预览或下载')
    }
    return
  }
  
  // 已有文件
  let url = file.url.startsWith('http') ? file.url : (import.meta.env.VITE_API_URL || '') + (file.url.startsWith('/') ? file.url : '/' + file.url)
  if (!url.startsWith('http')) {
     url = window.location.origin + url
  }

  const fileName = file.name || file.url.split('/').pop() || 'attachment'
  if (isImage(fileName)) {
    previewList.value = [url]
    showImageViewer.value = true
  } else if (isPdf(fileName)) {
    window.open(url, '_blank')
  } else {
    // 根本解决：采用二进制下载文件，防止跨域或强制转 HTML 问题
    try {
      const response = await api.get(url, { responseType: 'blob' })
      const blob = new Blob([response.data])
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (e) {
      ElMessage.error('无法直接下载预览文件，尝试新窗口打开')
      window.open(url, '_blank')
    }
  }
}

// 上传文件到服务器 (根源解决)
const uploadFile = async (fileObj) => {
  const formData = new FormData()
  formData.append('file', fileObj)
  try {
    const res = await api.post('/upload/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    return res?.data?.url || res?.url
  } catch (error) {
    console.error('上传文件失败:', error)
    return null
  }
}

// BOM明细相关逻辑
const bomDetailsTree = computed(() => {
  if (!form.details || form.details.length === 0) return []

  const itemMap = new Map()
  const tree = []

  form.details.forEach(item => {
    item.children = []
    itemMap.set(item.id, item)
  })

  form.details.forEach(item => {
    if (item.parent_id && item.parent_id !== 0 && item.parent_id !== '0') {
      const parent = itemMap.get(item.parent_id)
      if (parent) {
        parent.children.push(item)
      } else {
        tree.push(item)
      }
    } else {
      tree.push(item)
    }
  })

  const assignWBS = (nodes, prefix = '') => {
    nodes.forEach((node, index) => {
      const currentWBS = prefix ? `${prefix}.${index + 1}` : `${index + 1}`
      node.wbs = currentWBS
      if (node.children && node.children.length > 0) {
        assignWBS(node.children, currentWBS)
      }
    })
  }
  assignWBS(tree)

  return tree
})

const addDetail = () => {
  const newId = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  form.details.push({
    id: newId,
    parent_id: 0,
    level: 1,
    material_code: '',
    material_name: '',
    material_specs: '',
    unit_name: '',
    quantity: 1,
    remark: '',
    children: [], // 用于树形展示
    materialOptions: [] // 用于搜索缓存
  })
}

const addSubDetailForRow = (row) => {
  const newId = `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`
  form.details.push({
    id: newId,
    parent_id: row.id,
    level: (row.level || 1) + 1,
    material_code: '',
    material_name: '',
    material_specs: '',
    unit_name: '',
    quantity: 1,
    remark: '',
    children: [],
    materialOptions: []
  })
}

const removeDetailByRow = (row) => {
  const idsToRemove = [row.id]
  const findChildrenIds = (parentId) => {
    const children = form.details.filter(d => d.parent_id === parentId)
    children.forEach(c => {
      idsToRemove.push(c.id)
      findChildrenIds(c.id)
    })
  }
  
  findChildrenIds(row.id)
  
  const newDetails = form.details.filter(d => !idsToRemove.includes(d.id))
  form.details.splice(0, form.details.length, ...newDetails)
}

const searchMaterialsForRow = async (query, row) => {
  if (query) {
    row.loading = true
    try {
      const res = await materialApi.getMaterials({ 
        keyword: query, 
        page: 1, 
        pageSize: 20 
      })
      row.materialOptions = parseListData(res)
    } catch (error) {
      console.error('搜索物料失败:', error)
      row.materialOptions = []
    } finally {
      row.loading = false
    }
  } else {
    row.materialOptions = []
  }
}

const handleMaterialCodeChangeByRow = async (val, row) => {
  const material = row.materialOptions?.find(m => m.code === val)
  if (material) {
    row.material_id = material.id
    row.material_name = material.name
    row.material_specs = material.specs || material.specification || ''
    row.unit_name = material.unit_name || material.unit || ''

    if (form.product_id && material.id) {
      try {
        const res = await bomApi.detectCircularReference(form.product_id, material.id)
        const result = res?.data?.data || res?.data || {}
        if (result.hasCircle) {
          ElMessage.error(`检测到循环引用！路径: ${result.path}，该物料不能添加到此BOM`)
          row.material_code = ''
          row.material_id = null
          row.material_name = ''
          row.material_specs = ''
          row.unit_name = ''
        }
      } catch (e) {
        console.warn('循环引用检测失败:', e)
      }
    }
  }
}

// 提交表单 (根源解决核心: 在提交业务数据之前上传物理文件)
const submitForm = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      if (form.details.length === 0) {
        ElMessage.warning('请至少添加一条BOM明细')
        return
      }
      
      const invalidDetails = form.details.some(d => !d.material_code || !d.quantity)
      if (invalidDetails) {
        ElMessage.warning('请补全物料编码和用量信息')
        return
      }

      submitting.value = true
      try {
        let attachmentPath = form.attachment
        
        // 如果是本地选取的物理 File 对象，则先执行真实上传流程
        if (attachmentPath instanceof File || attachmentPath?.constructor?.name === 'File') {
          const uploadedUrl = await uploadFile(attachmentPath)
          if (!uploadedUrl) {
            ElMessage.error('附件上传失败，请移除或重试')
            submitting.value = false
            return
          }
          attachmentPath = uploadedUrl
        }

        const payload = {
          ...form,
          attachment: attachmentPath, // 仅传回最终的后台资源路径
          details: form.details.map(({ children, materialOptions, loading, ...rest }) => rest)
        }

        if (form.id) {
          await bomApi.updateBom(form.id, payload)
          ElMessage.success('更新成功')
        } else {
          await bomApi.createBom(payload)
          ElMessage.success('创建成功')
        }
        emit('success')
        handleClose()
      } catch (error) {
        console.error('提交失败:', error)
        ElMessage.error(error.message || '操作失败')
      } finally {
        submitting.value = false
      }
    }
  })
}
</script>

<style scoped>
.bom-details {
  margin-top: 15px;
}
</style>
