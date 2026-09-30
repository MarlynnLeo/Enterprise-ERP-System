<template>
  <div class="material-images">
    <Loading v-if="loading" size="20">附件加载中...</Loading>
    <Button v-if="loadError" size="small" native-type="button" @click="loadAttachments">附件加载失败，点击重试</Button>
    <div v-if="attachments.length" class="saved-images">
      <template v-for="file in attachments" :key="file.id || file.url">
        <button v-if="file.isImage && file.url" type="button" class="image-button" @click="showImagePreview([file.url])">
          <img :src="file.url" :alt="file.name" loading="lazy" />
        </button>
        <a v-else-if="file.url" :href="file.url" target="_blank" rel="noopener noreferrer">{{ file.name }}</a>
      </template>
    </div>
    <template v-if="editable">
      <Uploader v-model="pending" :accept="accept" multiple preview-size="48" :max-size="maxSize" :before-read="beforeRead" :after-read="afterRead" :disabled="disabled || busy" :deletable="!disabled && !busy" @oversize="onOversize">
        <Button class="upload-icon" icon="photo-o" native-type="button" aria-label="从相册选择图片" title="从相册选择图片" :disabled="disabled || busy" />
      </Uploader>
      <Uploader :accept="accept" capture="environment" :max-size="maxSize" :before-read="beforeRead" :after-read="afterCameraRead" :disabled="disabled || busy" @oversize="onOversize">
        <Button class="upload-icon" icon="photograph" native-type="button" aria-label="拍照上传" title="拍照上传" :disabled="disabled || busy" />
      </Uploader>
      <Button v-if="immediate && pending.length" class="upload-icon" icon="replay" native-type="button" aria-label="重试上传" title="重试上传" :loading="busy" :disabled="disabled" @click="uploadPending(materialId)" />
    </template>
    <span v-if="!editable && !loading && !loadError && !attachments.length" class="image-tip">暂无图片</span>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Button, Loading, Uploader, showImagePreview, showToast } from 'vant'
import { baseDataApi } from '@/api'
import { extractApiData, extractApiList } from '@/utils/apiHelper'
import { buildResourceUrl } from '@/config/app'

const props = defineProps({
  materialId: { type: [String, Number], default: '' },
  disabled: Boolean,
  editable: { type: Boolean, default: true },
  immediate: Boolean
})
const emit = defineEmits(['busy-change'])
const accept = 'image/jpeg,image/png,image/gif,image/webp,image/bmp'
const maxSize = 50 * 1024 * 1024
const attachments = ref([])
const pending = ref([])
const busy = ref(false)
const loading = ref(false)
const loadError = ref(false)
const normalize = file => ({
  id: file.id,
  name: file.fileName || file.file_name || file.name || '附件',
  url: buildResourceUrl(file.filePath || file.file_path || file.url || ''),
  isImage: /^image\//.test(file.fileType || file.file_type || '') || /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.fileName || file.file_name || '')
})
let loadVersion = 0
async function loadAttachments() {
  const version = ++loadVersion
  attachments.value = []
  loadError.value = false
  loading.value = false
  if (!props.materialId) return
  loading.value = true
  try {
    const response = await baseDataApi.getMaterialAttachments(props.materialId)
    if (version === loadVersion) {
      const files = [...extractApiList(response).map(normalize), ...attachments.value]
      attachments.value = [...new Map(files.map(file => [file.id || file.url, file])).values()]
    }
  } catch {
    if (version === loadVersion) loadError.value = true
  } finally {
    if (version === loadVersion) loading.value = false
  }
}
watch(() => props.materialId, loadAttachments, { immediate: true })
function beforeRead(files) {
  const valid = (Array.isArray(files) ? files : [files]).every(file =>
    (!file.type || accept.split(',').includes(file.type)) && /\.(jpe?g|png|gif|webp|bmp)$/i.test(file.name)
  )
  if (!valid) showToast('请选择 JPG、PNG、GIF、WEBP 或 BMP 图片')
  return valid
}
function onOversize() { showToast('每张图片不能超过 50MB') }
function afterRead() {
  if (props.immediate) return uploadPending(props.materialId)
}
function afterCameraRead(files) {
  pending.value.push(...(Array.isArray(files) ? files : [files]))
  return afterRead()
}
async function uploadPending(id) {
  if (busy.value) return false
  if (!pending.value.length) return true
  if (!id || !props.editable) return false
  busy.value = true
  emit('busy-change', true)
  try {
    for (const item of [...pending.value]) {
      item.status = 'uploading'
      item.message = '上传中'
      try {
        const data = new FormData()
        data.append('file', item.file)
        const result = extractApiData(await baseDataApi.uploadMaterialAttachment(id, data))
        const uploaded = normalize(result)
        attachments.value = attachments.value.filter(file => file.id !== uploaded.id)
        attachments.value.push(uploaded)
        pending.value = pending.value.filter(file => file !== item)
      } catch {
        item.status = 'failed'
        item.message = '上传失败'
      }
    }
    if (pending.value.length) showToast('部分图片上传失败，请重试')
    else if (props.immediate) showToast('图片上传成功')
    return pending.value.length === 0
  } finally {
    busy.value = false
    emit('busy-change', false)
  }
}
defineExpose({ uploadPending, hasPending: () => pending.value.length > 0 })
</script>

<style scoped>
.material-images { padding: 8px 12px; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 6px; }
.saved-images { display: contents; }
.saved-images a { overflow-wrap: anywhere; color: var(--color-primary); }
.image-button { padding: 0; border: 0; background: transparent; width: 48px; height: 48px; }
.image-button img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
.image-tip { color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.upload-icon { width: 44px; height: 44px; padding: 0; border-radius: 6px; color: var(--text-secondary); }
.upload-icon :deep(.van-icon) { font-size: 20px; }
.material-images :deep(.van-uploader__preview) { margin: 0 6px 6px 0; }
</style>
