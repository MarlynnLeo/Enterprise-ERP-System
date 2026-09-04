<template>
  <AppDialog
    title="查看BOM详情"
    mode="view"
    width="1020px"
    :loading="loading || !bomData"
    :model-value="modelValue"
    :detail-navigation="detailNavigation"
    @update:model-value="val => emit('update:modelValue', val)"
  >
    <div v-if="bomData" class="bom-view-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="产品名称">{{ bomData.productName }}</el-descriptions-item>
          <el-descriptions-item label="产品编码">{{ bomData.productCode }}</el-descriptions-item>
          <el-descriptions-item label="规格型号">{{ bomData.productSpecs || '-' }}</el-descriptions-item>
          <el-descriptions-item label="BOM版本">{{ bomData.version }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="isApproved(bomData) ? 'success' : 'warning'">
              {{ isApproved(bomData) ? '已审核' : '未审核' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建人">{{ bomData.createdBy || '-' }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ bomData.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="修改人">{{ bomData.updatedBy || '-' }}</el-descriptions-item>
          <el-descriptions-item label="最后修改时间">{{ bomData.updatedAt }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ bomData.remark || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 显示附件 -->
        <div v-if="bomData.attachment" class="attachment-section">
          <h3>附件</h3>
          <div class="attachment-preview mt-10 flex-row gap-15">
            <el-button v-if="isImage(bomData.attachment) || isPdf(bomData.attachment)" type="primary" @click="previewAttachment(bomData.attachment)">
              <el-icon><View /></el-icon> 预览附件
            </el-button>
            <el-button type="success" plain @click="downloadAttachment(bomData.attachment)">
              <el-icon><Download /></el-icon> 下载附件
            </el-button>
          </div>
        </div>

        <!-- 使用Tabs展示BOM明细 -->
        <el-tabs v-model="activeTab" class="mt-20">
          <el-tab-pane label="BOM明细" name="details">
            <el-table
              :data="displayDetails"
              border
              max-height="400"
              :row-key="getTreeRowKey"
              default-expand-all
              :indent="0"
              :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
            >
              <el-table-column label="结构" prop="wbs" width="80"></el-table-column>
              <el-table-column prop="materialCode" label="物料编码" min-width="140" show-overflow-tooltip></el-table-column>
              <el-table-column label="关键件" width="85" align="center">
                <template #default="scope">
                  <el-tag
                    v-if="scope.row.isCritical || scope.row.is_critical || Number(scope.row.is_critical) === 1"
                    size="small"
                    type="danger"
                    effect="light"
                  >
                    ★
                  </el-tag>
                  <span v-else class="text-muted">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="materialName" label="物料名称" min-width="150" show-overflow-tooltip></el-table-column>
              <el-table-column label="规格型号" min-width="160" show-overflow-tooltip>
                <template #default="scope">
                  <span>{{ scope.row.specification || scope.row.materialSpecs || scope.row.specs || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="用量" width="70">
                <template #default="scope">
                  <span>{{ Number(Number(scope.row.quantity || 0).toFixed(1)) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="基数" width="70">
                <template #default="scope">
                  <span>{{ Number(Number(scope.row.baseQuantity ?? scope.row.base_quantity ?? 1).toFixed(1)) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="unitName" label="单位" width="70" show-overflow-tooltip>
                <template #default="scope">
                  <span>{{ scope.row.unitName || scope.row.unit || scope.row.unit_name || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="position" label="位号" min-width="100" show-overflow-tooltip></el-table-column>
              <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip></el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="版本记录" name="history">
            <el-timeline v-if="bomData.history && bomData.history.length > 0" class="p-20">
              <el-timeline-item
                v-for="(item, index) in bomData.history"
                :key="index"
                :timestamp="item.date"
                placement="top"
              >
                <el-card shadow="never">
                  <h4>{{ item.version }} - {{ item.action }}</h4>
                  <p>操作人: {{ item.operator }}</p>
                  <p v-if="item.remark">说明: {{ item.remark }}</p>
                </el-card>
              </el-timeline-item>
            </el-timeline>
            <EmptyState v-else description="暂无版本记录" />
          </el-tab-pane>
        </el-tabs>
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
  </AppDialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { View, Download } from '@element-plus/icons-vue'
import { ElImageViewer } from 'element-plus/es/components/image-viewer/index'
import { ElMessage } from 'element-plus/es/components/message/index'
import { buildResourceUrl } from '@/config/app'
import { isPreviewableAttachmentImage } from '@/utils/attachmentPreview'
import { commonApi } from '@/api'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  bomData: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  detailNavigation: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])
const activeTab = ref('details')
const showImageViewer = ref(false)
const previewList = ref([])

const getTreeRowKey = (row) => row.treeKey || `${row.bomId || 'bom'}:${row.id}`

// 计算并构建WBS层级（按物料编码升序排序）
const displayDetails = computed(() => {
  if (!props.bomData || !props.bomData.details) return []

  // 深拷贝避免直接修改 prop 警告
  const tree = JSON.parse(JSON.stringify(props.bomData.details))

  // 递归按物料编码升序排序
  const sortTreeNodes = (nodes) => {
    nodes.sort((a, b) => {
      const codeA = String(a.materialCode || '').trim()
      const codeB = String(b.materialCode || '').trim()
      return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' })
    })
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortTreeNodes(node.children)
      }
    })
  }

  sortTreeNodes(tree)

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
  return data.approvedBy !== null && data.approvedBy !== undefined
}

// 附件辅助函数
const isImage = (url) => {
  return isPreviewableAttachmentImage({ url })
}

const isPdf = (url) => {
  if (!url) return false
  return url.toLowerCase().endsWith('.pdf')
}

const buildAttachmentUrl = (url) => {
  if (!url) return ''
  const fullUrl = buildResourceUrl(url)
  if (!fullUrl) return ''
  return /^https?:\/\//i.test(fullUrl) ? fullUrl : `${window.location.origin}${fullUrl}`
}

// 在线预览
const previewAttachment = (url) => {
  if (!url) return

  const fullUrl = buildAttachmentUrl(url)
  if (!fullUrl) {
    ElMessage.warning('附件地址不可用')
    return
  }

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
  if (!fullUrl) {
    ElMessage.warning('附件地址不可用')
    return
  }

  // 根本解决：采用二进制下载文件，防止跨域、路由Fallback或强制变成_uid_xxxx.htm
  try {
    const response = await commonApi.downloadResource(fullUrl)
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

:deep(.el-table .el-table__indent) {
  display: none !important;
  width: 0 !important;
  padding: 0 !important;
}

:deep(.el-table .el-table__placeholder) {
  display: inline-block;
  width: 14px;
}
</style>
