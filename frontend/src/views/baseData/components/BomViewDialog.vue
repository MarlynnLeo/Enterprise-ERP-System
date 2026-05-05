<template>
  <el-dialog
    title="查看BOM详情"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="800px"
    append-to-body
    class="bom-view-dialog"
  >
    <div class="dialog-content-wrapper">
      <div v-if="bomData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="产品名称">{{ bomData.product_name || bomData.productName }}</el-descriptions-item>
          <el-descriptions-item label="产品编码">{{ bomData.product_code || bomData.productCode }}</el-descriptions-item>
          <el-descriptions-item label="规格型号">{{ bomData.product_specs || bomData.productSpecs || '-' }}</el-descriptions-item>
          <el-descriptions-item label="BOM版本">{{ bomData.version }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="isApproved(bomData) ? 'success' : 'warning'">
              {{ isApproved(bomData) ? '已审核' : '未审核' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建人">{{ bomData.created_by }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ bomData.created_at }}</el-descriptions-item>
          <el-descriptions-item label="修改人">{{ bomData.updated_by }}</el-descriptions-item>
          <el-descriptions-item label="最后修改时间">{{ bomData.updated_at }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ bomData.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 显示附件 -->
        <div v-if="bomData.attachment" class="attachment-section">
          <h3>附件</h3>
          <div class="attachment-preview" style="margin-top: 10px; display: flex; gap: 15px;">
            <el-button v-if="isImage(bomData.attachment) || isPdf(bomData.attachment)" type="primary" @click="previewAttachment(bomData.attachment)">
              <el-icon><View /></el-icon> 预览附件
            </el-button>
            <el-button type="success" plain @click="downloadAttachment(bomData.attachment)">
              <el-icon><Download /></el-icon> 下载附件
            </el-button>
          </div>
        </div>

        <!-- 使用Tabs展示BOM明细 -->
        <el-tabs v-model="activeTab" style="margin-top: 20px;">
          <el-tab-pane label="BOM明细" name="details">
            <el-table :data="displayDetails" border max-height="400" row-key="id" default-expand-all :tree-props="{ children: 'children', hasChildren: 'hasChildren' }">
              <el-table-column label="结构" prop="wbs" width="90"></el-table-column>
              <el-table-column prop="material_code" label="物料编码" width="130" show-overflow-tooltip></el-table-column>
              <el-table-column prop="material_name" label="物料名称" width="150" show-overflow-tooltip></el-table-column>
              <el-table-column label="规格型号" width="220" show-overflow-tooltip>
                <template #default="scope">
                  <span>{{ scope.row.specification || scope.row.material_specs || scope.row.specs || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="quantity" label="用量" width="70" align="right"></el-table-column>
              <el-table-column prop="unit_name" label="单位" width="60" align="center"></el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- 图片预览器 -->
    <el-image-viewer 
      v-if="showImageViewer" 
      :url-list="previewList" 
      @close="showImageViewer = false" 
    />

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { View, Download } from '@element-plus/icons-vue'
import { ElImageViewer, ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: Boolean,
  bomData: Object
})

const emit = defineEmits(['update:modelValue'])
const activeTab = ref('details')
const showImageViewer = ref(false)
const previewList = ref([])

// 计算并构建WBS层级
const displayDetails = computed(() => {
  if (!props.bomData || !props.bomData.details) return []
  
  // 深拷贝避免直接修改 prop 警告
  const tree = JSON.parse(JSON.stringify(props.bomData.details))
  
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

// 统一审核状态判断（兼容字符串"0"/"1"和数字0/1）
const isApproved = (data) => {
  if (!data) return false
  if (data.approved !== undefined) {
    return Number(data.approved) === 1
  }
  return data.approved_by !== null && data.approved_by !== undefined
}

// 附件辅助函数
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
  const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')
  const path = url.startsWith('/') ? url : `/${url}`
  const fullUrl = `${baseUrl}${path}`
  return /^https?:\/\//i.test(fullUrl) ? fullUrl : `${window.location.origin}${fullUrl}`
}

// 在线预览
const previewAttachment = (url) => {
  if (!url) return
  
  const fullUrl = buildAttachmentUrl(url)

  if (isImage(url)) {
    previewList.value = [fullUrl]
    showImageViewer.value = true
  } else if (isPdf(url)) {
    window.open(fullUrl, '_blank')
  } else {
    window.open(fullUrl, '_blank')
  }
}

// 下载附件
const downloadAttachment = async (url) => {
  if (!url) return
  
  const fullUrl = buildAttachmentUrl(url)

  // 根本解决：采用二进制下载文件，防止跨域、路由Fallback或强制变成_uid_xxxx.htm
  try {
    const { default: axios } = await import('axios')
    const response = await axios.get(fullUrl, { responseType: 'blob' })
    const blob = new Blob([response.data])
    const downloadUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = url.split('/').pop() || 'attachment'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(downloadUrl)
  } catch {
    ElMessage.error('无法直接下载预览文件，尝试新窗口打开')
    window.open(fullUrl, '_blank')
  }
}
</script>

<style scoped>
.attachment-section {
  margin-top: 20px;
  padding: 10px;
  background-color: var(--color-bg-hover);
  border-radius: 4px;
}
</style>

<style>
.bom-view-dialog {
  display: flex;
  flex-direction: column;
  margin-top: 5vh !important;
  max-height: 90vh;
  overflow: hidden;
}

.bom-view-dialog .el-dialog__body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding-top: 10px;
  padding-bottom: 20px;
}
</style>
