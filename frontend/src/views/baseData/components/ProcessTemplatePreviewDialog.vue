<!--
/**
 * ProcessTemplatePreviewDialog.vue
 * @description 文件预览对话框 - 基于 AppDialog mode="preview"
 */
-->
<template>
  <AppDialog
    v-model="visible"
    mode="preview"
    :title="fileName"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <!-- Word文档预览 -->
    <VueOfficeDocx
      v-if="fileType === '.docx' || fileType === '.doc'"
      :src="fileUrl"
      class="preview-fill"
      @rendered="handleDocRendered"
      @error="handleDocError"
    />

    <!-- Excel文档预览 -->
    <VueOfficeExcel
      v-else-if="fileType === '.xlsx' || fileType === '.xls'"
      :src="fileUrl"
      class="preview-fill"
      @rendered="handleDocRendered"
      @error="handleDocError"
    />

    <!-- 其他文件类型使用iframe -->
    <iframe
      v-else
      :src="fileUrl"
      class="preview-iframe"
      frameborder="0"
    ></iframe>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="handleDownload">下载文件</el-button>
    </template>
  </AppDialog>
</template>

<script setup>
import { defineAsyncComponent, ref, watch } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { commonApi } from '@/api'
import '@vue-office/docx/lib/v3/index.css'
import '@vue-office/excel/lib/v3/index.css'

const VueOfficeDocx = defineAsyncComponent(() => import('@vue-office/docx/lib/v3/index.js'))
const VueOfficeExcel = defineAsyncComponent(() => import('@vue-office/excel/lib/v3/index.js'))

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  doc: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const fileUrl = ref('')
const fileName = ref('')
const fileType = ref('')

watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:modelValue', val) })

watch(() => props.doc, (doc) => {
  if (doc && doc.url) {
    fileUrl.value = doc.url
    fileName.value = doc.name || doc.url
    fileType.value = fileName.value.substring(fileName.value.lastIndexOf('.')).toLowerCase()
  }
}, { immediate: true })

const handleClose = () => {
  visible.value = false
}

const handleDocRendered = () => {}

const handleDocError = (error) => {
  console.error('文档渲染失败:', error)
  ElMessage.error('文档加载失败，请尝试下载到本地查看')
}

const handleDownload = async () => {
  try {
    if (!fileUrl.value.startsWith('/api/base-data/download-file?filePath=')) {
      throw new Error('拒绝下载非受控附件地址')
    }
    const response = await commonApi.downloadResource(fileUrl.value)
    const blob = new Blob([response.data])
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName.value
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    ElMessage.success('文件下载成功')
  } catch (error) {
    console.error('文件下载失败:', error)
    ElMessage.error('文件下载失败: ' + (error.response?.data?.message || error.message))
  }
}
</script>

<style scoped>
.preview-fill {
  height: 100%;
}
.preview-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
