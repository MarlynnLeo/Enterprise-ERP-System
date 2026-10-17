<template>
  <div class="anomaly-images">
    <template v-if="editable">
      <div class="image-controls">
        <Uploader v-model="pending" :accept="accept" multiple preview-size="48" :max-count="5" :max-size="maxSize" :before-read="beforeRead" :disabled="disabled || busy" :deletable="!disabled && !busy" @oversize="onOversize">
          <Button class="upload-icon" icon="photo-o" native-type="button" aria-label="从相册选择图片" title="从相册选择图片" :disabled="disabled || busy" />
        </Uploader>
        <Uploader v-if="pending.length < 5" :accept="accept" capture="environment" :max-count="1" :max-size="maxSize" :before-read="beforeRead" :after-read="afterCameraRead" :disabled="disabled || busy" @oversize="onOversize">
          <Button class="upload-icon" icon="photograph" native-type="button" aria-label="拍照上传" title="拍照上传" :disabled="disabled || busy" />
        </Uploader>
      </div>
      <div class="image-tip">{{ pending.length }}/5 张 · 单张不超过 5MB，支持 JPG、PNG、GIF、WEBP、BMP</div>
    </template>
    <template v-else>
      <Loading v-if="loading" size="18">图片加载中...</Loading>
      <div class="image-controls">
        <button v-for="(url, index) in previewUrls" :key="url" type="button" class="image-button" :aria-label="`预览异常图片 ${index + 1}`" @click="showImagePreview({ images: previewUrls, startPosition: index })">
          <img :src="url" :alt="`异常现场图片 ${index + 1}`" />
        </button>
      </div>
      <Button v-if="loadError" size="small" native-type="button" @click="loadImages">图片加载失败，点击重试</Button>
      <span v-if="!loading && !loadError && !previewUrls.length" class="image-tip">暂无图片</span>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { Button, Loading, Uploader, showImagePreview, showToast } from 'vant'
import { productionApi } from '@/api'
import { extractApiData } from '@/utils/apiHelper'

const props = defineProps({
  images: { type: Array, default: () => [] },
  editable: { type: Boolean, default: true },
  disabled: Boolean
})
const accept = 'image/jpeg,image/png,image/gif,image/webp,image/bmp'
const maxSize = 5 * 1024 * 1024
const pending = ref([])
const busy = ref(false)
const previewUrls = ref([])
const loading = ref(false)
const loadError = ref(false)
let loadVersion = 0

function beforeRead(files) {
  const selected = Array.isArray(files) ? files : [files]
  if (pending.value.length + selected.length > 5) {
    showToast('最多上传 5 张图片')
    return false
  }
  const valid = selected.every(file =>
    (!file.type || accept.split(',').includes(file.type)) && /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name)
  )
  if (!valid) showToast('请选择 JPG、PNG、GIF、WEBP 或 BMP 图片')
  return valid
}
function onOversize() { showToast('每张图片不能超过 5MB') }
function afterCameraRead(files) {
  const selected = Array.isArray(files) ? files : [files]
  if (pending.value.length + selected.length > 5) return showToast('最多上传 5 张图片')
  pending.value.push(...selected)
}
async function uploadPending() {
  if (busy.value) throw new Error('图片正在上传，请稍候')
  busy.value = true
  try {
    for (const item of pending.value) {
      // 已上传路径保留在草稿中，报告提交失败后重试无需再传图片。
      if (item.uploadedUrl) continue
      item.status = 'uploading'
      item.message = '上传中'
      try {
        const data = new FormData()
        data.append('file', item.file)
        const result = extractApiData(await productionApi.uploadAnomalyImage(data))
        if (!result.url) throw new Error('图片上传未返回地址')
        item.uploadedUrl = result.url
        item.status = 'done'
        item.message = ''
      } catch {
        item.status = 'failed'
        item.message = '上传失败'
      }
    }
    if (pending.value.some(item => !item.uploadedUrl)) throw new Error('部分图片上传失败，请重新提交；已填写内容和图片会保留')
    return pending.value.map(item => item.uploadedUrl)
  } finally {
    busy.value = false
  }
}
function releasePreviews() {
  previewUrls.value.forEach(url => URL.revokeObjectURL(url))
  previewUrls.value = []
}
async function loadImages() {
  const version = ++loadVersion
  releasePreviews()
  loadError.value = false
  loading.value = false
  if (props.editable || !props.images.length) return
  loading.value = true
  const results = await Promise.allSettled(props.images.map(path => productionApi.downloadAnomalyImage(path)))
  if (version !== loadVersion) return
  for (const result of results) {
    const blob = result.status === 'fulfilled' ? extractApiData(result.value) : null
    if (blob instanceof Blob && /^image\//.test(blob.type)) previewUrls.value.push(URL.createObjectURL(blob))
    else loadError.value = true
  }
  loading.value = false
}
watch(() => [props.images, props.editable], loadImages, { immediate: true })
onBeforeUnmount(() => { loadVersion++; releasePreviews() })
defineExpose({ uploadPending, reset: () => { pending.value = [] } })
</script>

<style scoped>
.anomaly-images { padding: 8px 0; }
.image-controls { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; }
.upload-icon { width: 44px; height: 44px; padding: 0; border-radius: 6px; color: var(--text-secondary); }
.upload-icon :deep(.van-icon) { font-size: 20px; }
.image-button { padding: 0; border: 0; background: transparent; width: 48px; height: 48px; }
.image-button img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
.image-tip { margin-top: 6px; color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.anomaly-images :deep(.van-uploader__preview) { margin: 0 6px 6px 0; }
</style>
