<template>
  <div class="anomaly-images">
    <div class="image-list">
      <div v-for="(item, index) in items" :key="item.key" class="image-item">
        <button type="button" class="image-thumb" :aria-label="`预览${item.name}`" :disabled="!item.preview" @click="previewIndex = index; previewVisible = true">
          <img v-if="item.preview" :src="item.preview" :alt="item.name" />
          <span v-else>{{ item.failed ? '加载失败' : '加载中' }}</span>
        </button>
        <el-button v-if="!readonly" link type="danger" :disabled="disabled || busy" :aria-label="`移除${item.name}`" @click="removeImage(index)">移除</el-button>
        <span v-if="item.status" class="image-status">{{ item.status }}</span>
      </div>
    </div>
    <template v-if="!readonly">
      <div class="image-actions">
        <el-button :icon="Picture" :disabled="disabled || busy || items.length >= 5" @click="albumInput.click()">选择图片</el-button>
        <el-button :icon="Camera" :disabled="disabled || busy || items.length >= 5" @click="cameraInput.click()">拍照</el-button>
        <span class="image-tip">{{ items.length }}/5 · 每张不超过 5MB</span>
      </div>
      <input ref="albumInput" class="image-input" type="file" :accept="accept" multiple :disabled="disabled || busy" @change="selectImages" />
      <input ref="cameraInput" class="image-input" type="file" :accept="accept" capture="environment" :disabled="disabled || busy" @change="selectImages" />
    </template>
    <el-button v-if="readonly && items.some(item => item.failed)" link type="primary" @click="loadImages">图片加载失败，点击重试</el-button>
    <span v-if="readonly && !items.length" class="image-tip">暂无图片</span>
    <AppDialog v-model="previewVisible" title="现场图片" mode="preview" width="min(900px, 90vw)">
      <img v-if="items[previewIndex]?.preview" class="large-image" :src="items[previewIndex].preview" :alt="items[previewIndex].name" />
      <template #footer>
        <el-button :disabled="previewIndex <= 0" @click="previewIndex--">上一张</el-button>
        <span>{{ previewIndex + 1 }} / {{ items.length }}</span>
        <el-button :disabled="previewIndex >= items.length - 1" @click="previewIndex++">下一张</el-button>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { Camera, Picture } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { anomalyReportApi } from '@/api/productionAssist'
import { commonApi } from '@/api/common'
import { ATTACHMENT_IMAGE_EXTENSIONS, ATTACHMENT_IMAGE_MIME_TYPES } from '@/constants/attachmentUpload'

const props = defineProps({ readonly: Boolean, disabled: Boolean, images: { type: [Array, String], default: () => [] } })
const accept = ATTACHMENT_IMAGE_MIME_TYPES.join(',')
const albumInput = ref(null)
const cameraInput = ref(null)
const items = ref([])
const busy = ref(false)
const previewVisible = ref(false)
const previewIndex = ref(0)
let version = 0
let sequence = 0

function clearImages() {
  version++
  previewVisible.value = false
  items.value.forEach(item => { if (item.preview) URL.revokeObjectURL(item.preview) })
  items.value = []
}
function selectImages(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (props.disabled || busy.value) return
  if (items.value.length + files.length > 5) return ElMessage.warning('最多选择 5 张图片')
  for (const file of files) {
    const extension = `.${file.name.split('.').pop()}`.toLowerCase()
    if (!ATTACHMENT_IMAGE_EXTENSIONS.includes(extension) || (file.type && !ATTACHMENT_IMAGE_MIME_TYPES.includes(file.type))) {
      ElMessage.warning('请选择 JPG、PNG、GIF、WEBP 或 BMP 图片')
      continue
    }
    if (file.size > 5 * 1024 * 1024) {
      ElMessage.warning('每张图片不能超过 5MB')
      continue
    }
    items.value.push({ key: ++sequence, file, name: file.name, preview: URL.createObjectURL(file), url: '', status: '' })
  }
}
function removeImage(index) {
  if (props.disabled || busy.value) return
  URL.revokeObjectURL(items.value[index].preview)
  items.value.splice(index, 1)
  previewVisible.value = false
}
async function uploadPending() {
  if (busy.value) throw new Error('图片正在上传，请稍候')
  busy.value = true
  try {
    for (const item of items.value) {
      if (item.url) continue
      item.status = '上传中'
      try {
        const data = new FormData()
        data.append('file', item.file)
        const response = await anomalyReportApi.uploadImage(data)
        const uploaded = response.data || response
        if (!uploaded.url) throw new Error('上传未返回图片地址')
        item.url = uploaded.url
        item.status = '已上传'
      } catch {
        item.status = '上传失败'
        throw new Error('图片上传失败，请重新提交；已上传的图片会保留')
      }
    }
    return items.value.map(item => item.url)
  } finally { busy.value = false }
}
async function loadImages() {
  clearImages()
  if (!props.readonly) return
  const currentVersion = version
  let sources = props.images
  if (typeof sources === 'string') {
    try { sources = JSON.parse(sources) } catch { sources = [] }
  }
  if (!Array.isArray(sources)) return
  items.value = sources.filter(url => typeof url === 'string').map((url, index) => ({ key: ++sequence, url, name: `现场图片 ${index + 1}`, preview: '', failed: false }))
  await Promise.all(items.value.map(async item => {
    try {
      const response = await commonApi.downloadResource(item.url)
      if (currentVersion !== version) return
      const blob = response.data || response
      if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) throw new Error('图片不可用')
      item.preview = URL.createObjectURL(blob)
    } catch { if (currentVersion === version) item.failed = true }
  }))
}
watch(() => props.images, loadImages, { immediate: true })
onBeforeUnmount(clearImages)
defineExpose({ uploadPending, clearImages })
</script>

<style scoped>
.anomaly-images { width: 100%; }
.image-list, .image-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.image-list:not(:empty) { margin-bottom: 12px; }
.image-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.image-thumb { width: 76px; height: 76px; padding: 0; border: 1px solid var(--el-border-color); border-radius: 6px; overflow: hidden; cursor: pointer; background: var(--el-fill-color-light); color: var(--el-text-color-secondary); }
.image-thumb img { width: 100%; height: 100%; object-fit: cover; }
.image-input { display: none; }
.image-tip, .image-status { font-size: 12px; color: var(--el-text-color-secondary); }
.large-image { display: block; max-width: 100%; height: 65vh; object-fit: contain; margin: auto; }
</style>
