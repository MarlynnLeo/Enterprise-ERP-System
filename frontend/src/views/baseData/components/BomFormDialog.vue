<template>
  <AppDialog
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    :title="title"
    mode="form"
    width="1020px"
    @close="handleClose"
    @open="handleOpen"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="产品" prop="productId">
            <el-select
              v-model="form.productId"
              placeholder="请选择产品或输入关键词搜索"
              class="w-full"
              filterable
              remote
              reserve-keyword
              :remote-method="searchProducts"
              :loading="loadingProducts"
              no-data-text="没有找到匹配的产品"
              loading-text="搜索中..."
              :disabled="isEditMode"
              @change="handleProductChange"
            >
              <el-option
                v-for="item in productOptions"
                :key="item.id"
                :label="`${item.code} - ${item.name}${item.specs || item.specification ? ' (' + (item.specs || item.specification) + ')' : ''}`"
                :value="item.id">
                <div class="flex items-center justify-between gap-8">
                  <span class="font-weight-700">{{ item.code }}</span>
                  <span class="text-muted text-sm">{{ item.name }}</span>
                  <span class="text-muted text-xs" v-if="item.specs || item.specification">{{ item.specs || item.specification }}</span>
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
              <div class="text-sm text-warning mt-4">
                <el-icon class="icon-inline"><InfoFilled /></el-icon>
                保存时版本号将自动升级
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
          class="attachment-upload"
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
      <el-divider content-position="center">BOM明细</el-divider>
      <div class="bom-details">
        <div class="mb-xs flex-between align-center">
          <el-text type="info" size="small">
            提示：勾选明细后，可使用下方的“删除”或“子件”按钮
          </el-text>
        </div>
        <!-- BOM明细表格（树形表格显示层级关系） -->
        <el-table
          ref="bomTableRef"
          :data="bomDetailsTree"
          border
          row-key="id"
          :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
          default-expand-all
          :indent="0"
          @selection-change="handleDetailSelectionChange"
        >
          <el-table-column type="selection" width="48" align="center" />
          <el-table-column label="结构" prop="wbs" width="64"></el-table-column>
          <el-table-column label="物料编码" min-width="152">
            <template #default="scope">
              <div @dblclick.stop="openMaterialPicker(scope.row)">
                <el-select
                  v-model="scope.row.materialCode"
                  placeholder="双击弹窗选择或输入搜索"
                  class="w-full"
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
                    <div class="flex items-center justify-between gap-8">
                      <span class="font-weight-700">{{ item.code }}</span>
                      <span class="text-muted text-sm">{{ item.name }}</span>
                      <span class="text-muted text-xs" v-if="item.specs || item.specification">{{ item.specs || item.specification }}</span>
                    </div>
                  </el-option>
                </el-select>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="关键件" width="70" align="center">
            <template #header>
              <div class="flex items-center justify-center gap-4">
                <span>关键件</span>
                <el-tooltip content="标记为核心/重点追溯物料，将在详情与追溯中重点高亮展示" placement="top">
                  <el-icon class="cursor-pointer text-muted"><InfoFilled /></el-icon>
                </el-tooltip>
              </div>
            </template>
            <template #default="scope">
              <el-checkbox v-model="scope.row.isCritical" />
            </template>
          </el-table-column>
          <el-table-column label="物料名称" min-width="140" show-overflow-tooltip>
            <template #default="scope">
              <div>{{ scope.row.materialName || '-' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="规格型号" min-width="160" show-overflow-tooltip>
            <template #default="scope">
              <div>{{ scope.row.materialSpecs || '-' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="位号" width="100" show-overflow-tooltip>
            <template #default="scope">
              <el-input v-model="scope.row.position" placeholder="如 E2-02-02" clearable />
            </template>
          </el-table-column>
          <el-table-column label="用量" width="70">
            <template #default="scope">
              <el-input-number
                v-model="scope.row.quantity"
                :min="0.1"
                :precision="1"
                :step="1"
                :controls="false"
                placeholder="用量"
                class="w-full"
              />
            </template>
          </el-table-column>
          <el-table-column label="基数" width="70">
            <template #header>
              <div class="flex items-center gap-4">
                <span>基数</span>
                <el-tooltip content="每多少个成品消耗该用量。如普通物料填1；40个装一箱的外箱填40" placement="top">
                  <el-icon class="cursor-pointer text-muted"><InfoFilled /></el-icon>
                </el-tooltip>
              </div>
            </template>
            <template #default="scope">
              <el-input-number
                v-model="scope.row.baseQuantity"
                :min="0.1"
                :precision="1"
                :step="1"
                :controls="false"
                placeholder="基数"
                class="w-full"
              />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="70">
            <template #default="scope">
              <span>{{ scope.row.unitName || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <el-input  v-model="scope.row.remark" placeholder="备注" clearable ></el-input>
            </template>
          </el-table-column>
        </el-table>

      </div>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button type="primary" plain @click="addDetail">
          <el-icon><Plus /></el-icon> 添加
        </el-button>
        <el-button
          type="danger"
          :disabled="selectedDetailRows.length === 0"
          @click="removeSelectedDetails"
        >
          <el-icon><Delete /></el-icon> 删除
        </el-button>
        <el-button
          type="success"
          :disabled="selectedDetailRows.length !== 1"
          @click="addSubDetailForRow(selectedDetailRows[0])"
        >
          <el-icon><Plus /></el-icon> 子件
        </el-button>
        <el-button @click="handleClose">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </span>
    </template>
  </AppDialog>

  <!-- 选择物料对话框（支持模糊搜索与上下相邻编码定位浏览） -->
  <AppDialog
    v-model="materialPickerVisible"
    title="选择物料"
    mode="form"
    width="880px"
    @opened="onMaterialPickerOpened"
  >
    <div class="material-picker-content">
      <!-- 搜索与定位栏 -->
      <div class="flex items-center justify-between gap-12 mb-12">
        <div class="flex items-center gap-8 flex-1">
          <el-input
            ref="pickerInputRef"
            v-model="pickerSearchKeyword"
            placeholder="请输入物料编码或品名定位相关物料"
            clearable
            style="max-width: 320px;"
            @keyup.enter="handlePickerSearch"
            @clear="handlePickerSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <el-button type="primary" :icon="Search" @click="handlePickerSearch" :loading="pickerLoading">
            定位 / 查询
          </el-button>
          <el-button @click="handlePickerReset">重置</el-button>
        </div>
        <div class="text-xs text-danger flex items-center gap-4">
          <span>注：双击行或选中后按“确认”即可自动回填</span>
        </div>
      </div>

      <!-- 物料表格 -->
      <el-table
        ref="pickerTableRef"
        :data="pickerTableData"
        border
        stripe
        height="380"
        highlight-current-row
        v-loading="pickerLoading"
        empty-text="暂无匹配物料"
        @current-change="handlePickerCurrentRowChange"
        @row-dblclick="handlePickerConfirmRow"
      >
        <el-table-column prop="code" label="编码" width="170" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="font-weight-700 text-primary">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="品名" min-width="180" show-overflow-tooltip />
        <el-table-column prop="specs" label="规格" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.specs || row.specification || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="unitName" label="单位" width="70" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.unitName || '-' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页栏 -->
      <div class="flex items-center justify-between mt-12">
        <div class="text-xs text-muted">
          共 {{ pickerTotal }} 条相关物料（按编码顺序排列）
        </div>
        <el-pagination
          v-model:current-page="pickerPage"
          v-model:page-size="pickerPageSize"
          :page-sizes="[20, 50, 100, 200]"
          :total="pickerTotal"
          size="small"
          background
          layout="total, sizes, prev, pager, next"
          @size-change="fetchPickerMaterials"
          @current-change="fetchPickerMaterials"
        />
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-10">
        <el-button @click="materialPickerVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!pickerSelectedRow" @click="handlePickerConfirmSelected">
          确认选择
        </el-button>
      </div>
    </template>
  </AppDialog>
</template>
<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { Plus, Delete, InfoFilled, Search } from '@element-plus/icons-vue'
import { ElMessage, ElImageViewer } from 'element-plus'
import { materialApi } from '@/api/material'
import { bomApi } from '@/api/bom'
import { commonApi } from '@/api/common'
import { parseListData, parsePaginatedData, parseResponseData } from '@/utils/responseParser'
import { buildResourceUrl } from '@/config/app'
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
const bomTableRef = ref(null)
const submitting = ref(false)
const isEditMode = computed(() => !!props.editData)
const selectedDetailRows = ref([])
const loadingProducts = ref(false)
const productOptions = ref([])
const fileList = ref([])
const showImageViewer = ref(false)
const previewList = ref([])

// 选择物料对话框状态
const materialPickerVisible = ref(false)
const pickerTargetRow = ref(null)
const pickerSearchKeyword = ref('')
const pickerTableData = ref([])
const pickerLoading = ref(false)
const pickerTotal = ref(0)
const pickerPage = ref(1)
const pickerPageSize = ref(50)
const pickerSelectedRow = ref(null)
const pickerInputRef = ref(null)
const pickerTableRef = ref(null)

const form = reactive({
  id: '',
  productId: '',
  version: '',
  remark: '',
  details: [], // 扁平数组，包含 parent_id
  attachment: null
})
const rules = {
  productId: [
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
const clearDetailSelection = () => {
  selectedDetailRows.value = []
  nextTick(() => bomTableRef.value?.clearSelection?.())
}
const resetForm = () => {
  if (formRef.value) formRef.value.resetFields()
  form.id = ''
  form.productId = ''
  form.version = 'V1.1'
  form.remark = ''
  form.details = []
  form.attachment = null
  fileList.value = []
  clearDetailSelection()
}
const initForm = (data) => {
  form.id = data.id || ''
  form.productId = data.productId || ''
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
      materialId: d.materialId ?? d.material_id ?? null,
      materialCode: d.materialCode ?? d.material_code ?? '',
      materialName: d.materialName ?? d.material_name ?? '',
      materialSpecs: d.materialSpecs ?? d.material_specs ?? d.specs ?? d.specification ?? '',
      position: d.position ?? '',
      unitId: d.unitId ?? d.unit_id ?? null,
      unitName: d.unitName ?? d.unit_name ?? '',
      quantity: d.quantity != null ? d.quantity : 1,
      baseQuantity: Number(d.baseQuantity ?? d.base_quantity) > 0 ? Number(d.baseQuantity ?? d.base_quantity) : 1,
      isCritical: Boolean(d.isCritical || Number(d.isCritical) === 1),
      remark: d.remark || '',
      parentId: d.parentId ?? d.parent_id ?? 0,
      level: d.level || 1,
      children: [],
      materialOptions: []
    }))
  } else {
    form.details = []
  }
  clearDetailSelection()
  if (data.productId) {
    productOptions.value = [{
      id: data.productId,
      code: data.productCode,
      name: data.productName,
      specs: data.productSpecs
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
  } else if (form.productId) {
    const current = productOptions.value.find((item) => Number(item.id) === Number(form.productId))
    productOptions.value = current ? [current] : productOptions.value
  }
}

/** 根据已有 BOM 计算下一版本号 V1.1 → V1.2 */
const calcNextVersion = (versions = []) => {
  let maxMajor = 1
  let maxMinor = 0
  let found = false
  for (const v of versions) {
    const match = String(v || '').match(/V(\d+)\.(\d+)/i)
    if (match) {
      found = true
      const major = parseInt(match[1], 10)
      const minor = parseInt(match[2], 10)
      if (major > maxMajor || (major === maxMajor && minor > maxMinor)) {
        maxMajor = major
        maxMinor = minor
      }
    }
  }
  if (!found) return 'V1.1'
  return `V${maxMajor}.${maxMinor + 1}`
}

/** 选择产品后自动建议未占用的版本号，避免 uk_product_version 冲突 */
const handleProductChange = async (productId) => {
  if (!productId || isEditMode.value) return
  try {
    const res = await bomApi.getBoms({ product_id: productId, page: 1, pageSize: 100 })
    const list = parseListData(res)
    const versions = list.map((b) => b.version).filter(Boolean)
    form.version = calcNextVersion(versions)
  } catch (e) {
    console.error('获取产品已有BOM版本失败:', e)
    // 失败时保留当前版本，提交时由后端校验
  }
}
// 附件处理
const handleAttachmentChange = (uploadFile, _uploadFiles) => {
  form.attachment = uploadFile.raw
  fileList.value = [uploadFile]
}
const handleAttachmentRemove = (_file, _uploadFiles) => {
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

const buildAttachmentUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  const fullUrl = buildResourceUrl(url)
  return /^https?:\/\//i.test(fullUrl) ? fullUrl : `${window.location.origin}${fullUrl}`
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
  const url = buildAttachmentUrl(file.url)
  const fileName = file.name || file.url.split('/').pop() || 'attachment'
  if (isImage(fileName)) {
    previewList.value = [url]
    showImageViewer.value = true
  } else if (isPdf(fileName)) {
    window.open(url, '_blank')
  } else {
    // 根本解决：采用二进制下载文件，防止跨域或强制转 HTML 问题
    try {
      const response = await commonApi.downloadResource(url)
      const blob = new Blob([response.data])
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch {
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
    const res = await commonApi.uploadFile(formData)
    return res?.data?.url || res?.url
  } catch (error) {
    console.error('上传文件失败:', error)
    return null
  }
}
// BOM明细相关逻辑
const getParentId = (item) => item?.parentId ?? item?.parent_id ?? 0
const bomDetailsTree = computed(() => {
  if (!form.details || form.details.length === 0) return []
  const itemMap = new Map()
  const tree = []
  form.details.forEach(item => {
    item.children = []
    itemMap.set(String(item.id), item)
  })
  form.details.forEach(item => {
    const parentId = getParentId(item)
    if (parentId && parentId !== 0 && parentId !== '0') {
      const parent = itemMap.get(String(parentId))
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
  const newId = `temp_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${performance.now()}`}`
  form.details.push({
    id: newId,
    parentId: 0,
    parent_id: 0,
    level: 1,
    materialCode: '',
    materialName: '',
    materialSpecs: '',
    position: '',
    unitId: null,
    unitName: '',
    quantity: 1,
    baseQuantity: 1,
    isCritical: false,
    remark: '',
    children: [], // 用于树形展示
    materialOptions: [] // 用于搜索缓存
  })
  nextTick(() => {
    const tableEl = bomTableRef.value?.$el
    if (tableEl) {
      const scrollWrap = tableEl.querySelector('.el-scrollbar__wrap') || tableEl.closest('.el-dialog__body') || tableEl.closest('.app-dialog__body')
      if (scrollWrap) {
        scrollWrap.scrollTo({ top: scrollWrap.scrollHeight, behavior: 'smooth' })
      }
    }
  })
  clearDetailSelection()
}
const addSubDetailForRow = (row) => {
  if (!row) return
  const newId = `temp_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${performance.now()}`}`
  form.details.push({
    id: newId,
    parentId: row.id,
    parent_id: row.id,
    level: (row.level || 1) + 1,
    materialCode: '',
    materialName: '',
    materialSpecs: '',
    position: '',
    unitId: null,
    unitName: '',
    quantity: 1,
    baseQuantity: 1,
    isCritical: false,
    remark: '',
    children: [],
    materialOptions: []
  })
  clearDetailSelection()
}
const handleDetailSelectionChange = (selection) => {
  selectedDetailRows.value = selection
}
const removeSelectedDetails = () => {
  if (selectedDetailRows.value.length === 0) return

  const idsToRemove = new Set(selectedDetailRows.value.map(row => String(row.id)))
  let changed = true
  while (changed) {
    changed = false
    form.details.forEach(detail => {
      if (idsToRemove.has(String(getParentId(detail))) && !idsToRemove.has(String(detail.id))) {
        idsToRemove.add(String(detail.id))
        changed = true
      }
    })
  }

  const newDetails = form.details.filter(d => !idsToRemove.has(String(d.id)))
  form.details.splice(0, form.details.length, ...newDetails)
  clearDetailSelection()
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
const clearMaterialRow = (row) => {
  row.materialCode = ''
  row.materialId = null
  row.materialName = ''
  row.materialSpecs = ''
  row.unitId = null
  row.unitName = ''
}

const handleMaterialCodeChangeByRow = async (val, row) => {
  const material = row.materialOptions?.find(m => m.code === val)
  if (material) {
    row.materialId = material.id
    row.materialName = material.name
    row.materialSpecs = material.specs || material.specification || ''
    // 列表接口可能缺 unit_id：用 unit_id / unitId，没有则稍后按物料详情补
    row.unitId = material.unitId ?? material.unitId ?? null
    row.unitName = material.unitName || material.unit || ''

    // 若单位缺失，拉一次物料详情补齐（避免提交 500）
    if (!row.unitId && material.id) {
      try {
        const detailRes = await materialApi.getMaterial(material.id)
        const detail = parseResponseData(detailRes, material) || material
        row.unitId = detail.unitId ?? detail.unitId ?? null
        row.unitName = detail.unitName || detail.unit || row.unitName || ''
      } catch (e) {
        console.error('补齐物料单位失败:', e)
      }
    }

    if (form.productId && material.id) {
      try {
        const res = await bomApi.detectCircularReference(form.productId, material.id)
        const result = parseResponseData(res, {})
        if (result.hasCircle) {
          ElMessage.error(`检测到循环引用！路径: ${result.path}，该物料不能添加到此BOM`)
          clearMaterialRow(row)
        }
      } catch (error) {
        console.error('检测BOM循环引用失败:', error)
      }
    }
  }
}

// 打开选择物料对话框（支持根据当前输入模糊定位或查看上下相邻编码）
const openMaterialPicker = (row) => {
  pickerTargetRow.value = row
  pickerSearchKeyword.value = row?.materialCode || ''
  pickerPage.value = 1
  pickerSelectedRow.value = null
  materialPickerVisible.value = true
  fetchPickerMaterials()
}

const onMaterialPickerOpened = () => {
  nextTick(() => {
    pickerInputRef.value?.focus?.()
  })
}

const fetchPickerMaterials = async () => {
  pickerLoading.value = true
  try {
    const res = await materialApi.getMaterials({
      keyword: pickerSearchKeyword.value?.trim() || undefined,
      page: pickerPage.value,
      pageSize: pickerPageSize.value,
      status: 1
    })
    const { list, total } = parsePaginatedData(res)
    pickerTableData.value = Array.isArray(list) ? list : []
    pickerTotal.value = Number(total) || 0

    // 默认高亮第一条或精确匹配的那一条
    if (pickerTableData.value.length > 0) {
      const keyword = pickerSearchKeyword.value?.trim()
      const match = keyword ? pickerTableData.value.find(m => m.code === keyword) : null
      const target = match || pickerTableData.value[0]
      pickerSelectedRow.value = target
      nextTick(() => {
        pickerTableRef.value?.setCurrentRow?.(target)
      })
    } else {
      pickerSelectedRow.value = null
    }
  } catch (error) {
    console.error('获取物料列表失败:', error)
    pickerTableData.value = []
    pickerTotal.value = 0
    pickerSelectedRow.value = null
  } finally {
    pickerLoading.value = false
  }
}

const handlePickerSearch = () => {
  pickerPage.value = 1
  fetchPickerMaterials()
}

const handlePickerReset = () => {
  pickerSearchKeyword.value = ''
  pickerPage.value = 1
  fetchPickerMaterials()
}

const handlePickerCurrentRowChange = (row) => {
  if (row) {
    pickerSelectedRow.value = row
  }
}

const handlePickerConfirmRow = async (row) => {
  if (!row || !pickerTargetRow.value) return
  const target = pickerTargetRow.value
  target.materialId = row.id
  target.materialCode = row.code
  target.materialName = row.name
  target.materialSpecs = row.specs || row.specification || ''
  target.unitId = row.unitId ?? null
  target.unitName = row.unitName || ''

  // 将选择的物料放到该行的备选列表中，保证 el-select 正常回显
  if (!target.materialOptions) target.materialOptions = []
  if (!target.materialOptions.some(m => m.id === row.id || m.code === row.code)) {
    target.materialOptions.unshift(row)
  }

  // 若单位缺失，拉一次物料详情补齐
  if (!target.unitId && row.id) {
    try {
      const detailRes = await materialApi.getMaterial(row.id)
      const detail = parseResponseData(detailRes, row) || row
      target.unitId = detail.unitId ?? detail.unit_id ?? null
      target.unitName = detail.unitName || detail.unit || target.unitName || ''
    } catch (e) {
      console.error('补齐物料单位失败:', e)
    }
  }

  if (form.productId && row.id) {
    try {
      const res = await bomApi.detectCircularReference(form.productId, row.id)
      const result = parseResponseData(res, {})
      if (result.hasCircle) {
        ElMessage.error(`检测到循环引用！路径: ${result.path}，该物料不能添加到此BOM`)
        clearMaterialRow(target)
        return
      }
    } catch (error) {
      console.error('检测BOM循环引用失败:', error)
    }
  }

  materialPickerVisible.value = false
  ElMessage.success(`已选择物料: ${row.code} (${row.name})`)
}

const handlePickerConfirmSelected = () => {
  if (pickerSelectedRow.value) {
    handlePickerConfirmRow(pickerSelectedRow.value)
  } else {
    ElMessage.warning('请先选择一个物料')
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

      const missingMaterial = form.details.some(d => !d.materialId || !d.materialCode || !d.quantity)
      if (missingMaterial) {
        ElMessage.warning('请补全物料编码和用量信息')
        return
      }

      // 提交前补齐 unit_id；物料档案未维护单位时由后端用默认单位「个」兜底
      for (const d of form.details) {
        if (d.materialId && (!d.unitId || Number(d.unitId) <= 0)) {
          try {
            const detailRes = await materialApi.getMaterial(d.materialId)
            const detail = parseResponseData(detailRes, {}) || {}
            d.unitId = detail.unitId ?? detail.unitId ?? null
            d.unitName = detail.unitName || d.unitName || ''
          } catch {
            /* 后端会按物料主数据/默认单位补全 */
          }
        }
        // 规范化为数字，避免传字符串/空串
        if (d.unitId != null && d.unitId !== '') {
          d.unitId = Number(d.unitId) || null
        }
        d.materialId = Number(d.materialId)
        d.quantity = Number(d.quantity)
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

        // 新建：提交前按产品已有版本自动对齐下一版本，避免 uk_product_version 冲突
        if (!form.id && form.productId) {
          await handleProductChange(form.productId)
        }

        const buildPayload = () => ({
          productId: Number(form.productId),
          version: String(form.version || 'V1.1').trim(),
          remark: form.remark || null,
          status: form.status !== undefined && form.status !== '' ? Number(form.status) : 1,
          attachment: attachmentPath,
          details: form.details.map((d) => ({
            id: d.id,
            parent_id: d.parentId ?? 0,
            level: d.level || 1,
            material_id: Number(d.materialId),
            material_code: d.materialCode,
            position: d.position || null,
            quantity: Number(d.quantity) || 0,
            base_quantity: Number(d.baseQuantity) > 0 ? Number(d.baseQuantity) : 1,
            baseQuantity: Number(d.baseQuantity) > 0 ? Number(d.baseQuantity) : 1,
            is_critical: d.isCritical ? 1 : 0,
            isCritical: d.isCritical ? 1 : 0,
            unit_id: d.unitId != null && Number(d.unitId) > 0 ? Number(d.unitId) : null,
            remark: d.remark || null,
          })),
        })

        if (form.id) {
          await bomApi.updateBom(form.id, buildPayload())
          ElMessage.success('更新成功')
        } else {
          try {
            await bomApi.createBom(buildPayload())
          } catch (createErr) {
            // 版本冲突时再拉一次下一版本并重试一次
            const m =
              createErr?.response?.data?.message ||
              createErr?.message ||
              ''
            if (/已存在版本|Duplicate entry|不能重复|uk_product_version/i.test(m)) {
              await handleProductChange(form.productId)
              ElMessage.warning(`版本号冲突，已自动改为 ${form.version} 并重试`)
              await bomApi.createBom(buildPayload())
            } else {
              throw createErr
            }
          }
          ElMessage.success(`创建成功（版本 ${form.version}）`)
        }
        emit('success')
        handleClose()
      } catch (error) {
        console.error('提交失败:', error)
        const msg =
          error?.response?.data?.message ||
          error?.response?.data?.error?.message ||
          error?.message ||
          '操作失败'
        ElMessage.error(String(msg).replace(/^创建BOM失败:\s*/, ''))
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
  min-width: 0;
}

.bom-details :deep(.el-table) {
  width: 100%;
}

.bom-details :deep(.el-table .el-table__indent) {
  display: none !important;
  width: 0 !important;
  padding: 0 !important;
}

.bom-details :deep(.el-table .el-table__placeholder) {
  display: inline-block;
  width: 14px;
}
</style>
