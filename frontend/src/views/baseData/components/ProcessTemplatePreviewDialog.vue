<!--
/**
 * ProcessTemplatePreviewDialog.vue
 * @description 文件预览对话框组件 - 支持Word/Excel/PDF等文件预览
 * @date 2026-03-03
 */
-->
<template>
  <el-dialog
    v-model="visible"
    :title="fileName"
    :width="isFullScreen ? '100%' : '90%'"
    :top="isFullScreen ? '0' : '5vh'"
    :close-on-click-modal="false"
    :fullscreen="isFullScreen"
    destroy-on-close
    class="preview-dialog"
    @close="handleClose"
  >
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <span>{{ fileName }}</span>
        <el-button
          :icon="isFullScreen ? 'Close' : 'FullScreen'"
          circle
          @click="isFullScreen = !isFullScreen"
          :title="isFullScreen ? '退出全屏' : '全屏显示'"
        />
      </div>
    </template>

    <div :style="{ height: isFullScreen ? 'calc(100vh - 120px)' : '80vh', width: '100%', position: 'relative' }">
      <!-- Word文档预览 -->
      <VueOfficeDocx
        v-if="fileType === '.docx' || fileType === '.doc'"
        :src="fileUrl"
        style="height: 100%;"
        @rendered="handleDocRendered"
        @error="handleDocError"
      />

      <!-- Excel文档预览 -->
      <VueOfficeExcel
        v-else-if="fileType === '.xlsx' || fileType === '.xls'"
        :src="fileUrl"
        style="height: 100%;"
        @rendered="handleDocRendered"
        @error="handleDocError"
      />

      <!-- 其他文件类型使用iframe -->
      <iframe
        v-else
        :src="fileUrl"
        style="width: 100%; height: 100%; border: none;"
        frameborder="0"
      ></iframe>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="handleDownload">下载文件</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { defineAsyncComponent, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { api } from '@/services/axiosInstance'
import '@vue-office/docx/lib/index.css'
import '@vue-office/excel/lib/index.css'

const VueOfficeDocx = defineAsyncComponent(() => import('@vue-office/docx'))
const VueOfficeExcel = defineAsyncComponent(() => import('@vue-office/excel'))

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  doc: { type: Object, default: null }
})

const emit = defineEmits(['update:modelValue'])

const visible = ref(false)
const fileUrl = ref('')
const fileName = ref('')
const fileType = ref('')
const isFullScreen = ref(false)

// 同步v-model
watch(() => props.modelValue, (val) => { visible.value = val })
watch(visible, (val) => { emit('update:modelValue', val) })

// 监听doc变化，解析文件信息
watch(() => props.doc, (doc) => {
  if (doc && doc.url) {
    fileUrl.value = doc.url
    fileName.value = doc.name || doc.url
    fileType.value = fileName.value.substring(fileName.value.lastIndexOf('.')).toLowerCase()
    isFullScreen.value = false
  }
}, { immediate: true })

const handleClose = () => {
  visible.value = false
}

const handleDocRendered = () => {
  // 文档渲染成功
}

const handleDocError = (error) => {
  console.error('文档渲染失败:', error)
  ElMessage.error('文档加载失败，请尝试下载到本地查看')
}

// 下载文件
const handleDownload = async () => {
  try {
    const response = await api.get(fileUrl.value, { responseType: 'blob' })
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
