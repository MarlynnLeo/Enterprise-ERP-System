<!--
/**
 * AttachmentUpload.vue
 * @description 附件上传组件
 * @date 2025-11-04
 */
-->
<template>
  <div class="attachment-upload">
    <el-upload
      v-if="!readonly && attachments.length < maxFiles"
      v-model:file-list="fileList"
      :accept="accept"
      :http-request="uploadAttachment"
      :on-success="handleSuccess"
      :on-error="handleError"
      :before-upload="beforeUpload"
      :on-exceed="handleExceed"
      multiple
      :limit="maxFiles"
      :show-file-list="false"
    >
      <el-button type="primary" :icon="Upload" aria-label="上传附件">
        上传附件
      </el-button>
      <template #tip>
        <div class="el-upload__tip">
          支持上传 PDF、Word、Excel、图片等文件，单个文件不超过 {{ maxSizeMB }}MB，最多 {{ maxFiles }} 个文件
        </div>
      </template>
    </el-upload>

    <div v-if="attachments.length > 0" class="attachment-list">
      <div class="list-header">
        <span>已上传附件 ({{ attachments.length }})</span>
      </div>
      <div v-for="(file, index) in attachments" :key="file.id || file.url || index" class="attachment-item">
        <el-image
          v-if="isImage(file)"
          class="image-thumb"
          :src="resourceUrl(file.url)"
          :alt="file.name"
          :preview-src-list="imagePreviewUrls"
          :initial-index="imagePreviewIndex(file)"
          fit="cover"
          preview-teleported
        />
        <el-icon v-else class="file-icon"><Document /></el-icon>
        <div class="file-info">
          <span class="filename" :title="file.name">{{ file.name }}</span>
          <span class="filesize">{{ formatFileSize(file.size) }}</span>
        </div>
        <div class="file-actions">
          <el-button link type="primary" :aria-label="`下载${file.name}`" @click="downloadFile(file)">
            <el-icon><Download /></el-icon>
            下载
          </el-button>
          <el-button v-if="!readonly" link type="danger" :aria-label="`移除${file.name}`" @click="removeFile(index)">
            <el-icon><Delete /></el-icon>
            删除
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, nextTick } from 'vue';
import { ElMessage } from 'element-plus/es/components/message/index';
import { Upload, Document, Delete, Download } from '@element-plus/icons-vue';
import { commonApi } from '@/api';
import { buildResourceUrl } from '@/config/app';
import { isPreviewableAttachmentImage } from '@/utils/attachmentPreview';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_EXTENSIONS,
  ATTACHMENT_MAX_SIZE_MB,
  ATTACHMENT_MIME_TYPES
} from '@/constants/attachmentUpload';

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  maxFiles: {
    type: Number,
    default: 5
  },
  maxSizeMB: {
    type: Number,
    default: ATTACHMENT_MAX_SIZE_MB
  },
  readonly: {
    type: Boolean,
    default: false
  },
  businessType: {
    type: String,
    default: ''
  },
  businessId: {
    type: [String, Number],
    default: null
  },
  isPublic: {
    type: Boolean,
    default: true
  }
});

const emit = defineEmits(['update:modelValue']);

const normalizeAttachment = (file) => {
  if (typeof file === 'string') return { url: file, name: file.split('/').pop() || '附件' };
  const url = file?.url || file?.fileUrl || file?.file_url || file?.path || file?.filePath || '';
  const name = file?.name || file?.filename || file?.originalName || file?.originalname || '附件';
  const type = file?.type || file?.mimetype || file?.mimeType || file?.fileType || file?.file_type || '';
  const size = file?.size ?? file?.fileSize ?? file?.file_size ?? null;
  return {
    ...file,
    url,
    name,
    type,
    size
  };
};
const fileList = ref([]);
const pendingUploadKeys = new Set();
const attachments = ref((props.modelValue || []).map(normalizeAttachment));
const accept = ATTACHMENT_ACCEPT;
const resourceUrl = (url) => buildResourceUrl(url);
const isImage = isPreviewableAttachmentImage;
const imagePreviewUrls = computed(() => attachments.value.filter(isImage).map(file => resourceUrl(file.url)).filter(Boolean));
const imagePreviewIndex = (file) => Math.max(0, imagePreviewUrls.value.indexOf(resourceUrl(file.url)));

const fallbackUploadKey = (file) => `${file?.name || ''}:${file?.size || 0}:${file?.lastModified || 0}`;
const uploadKey = (file) => {
  if (file?.uid !== undefined && file?.uid !== null) return String(file.uid);
  return fallbackUploadKey(file);
};

const uploadKeyCandidates = (file) => {
  const keys = [uploadKey(file), fallbackUploadKey(file)];
  return keys;
};

const releaseUploadSlot = (file) => {
  uploadKeyCandidates(file).forEach(key => pendingUploadKeys.delete(key));
  fileList.value = fileList.value.filter(item => pendingUploadKeys.has(uploadKey(item)));
  nextTick(() => {
    fileList.value = fileList.value.filter(item => pendingUploadKeys.has(uploadKey(item)));
  });
};

const emitAttachments = () => emit('update:modelValue', attachments.value.slice());

const beforeUpload = (file) => {
  const maxSizeBytes = Number(props.maxSizeMB) * 1024 * 1024;
  if (!Number.isFinite(maxSizeBytes) || file.size > maxSizeBytes) {
    ElMessage.error(`文件大小不能超过 ${props.maxSizeMB}MB`);
    return false;
  }

  const extension = `.${String(file.name || '').split('.').pop()}`.toLowerCase();
  const mimeType = String(file.type || '').split(';', 1)[0].trim().toLowerCase();
  const hasSupportedExtension = ATTACHMENT_EXTENSIONS.includes(extension);
  const hasSupportedMime = !mimeType || ATTACHMENT_MIME_TYPES.includes(mimeType);
  const isOctetStreamExcel = mimeType === 'application/octet-stream' &&
    ['.xls', '.xlsx', '.csv'].includes(extension);
  const hasSupportedType = hasSupportedExtension && hasSupportedMime &&
    (mimeType !== 'application/octet-stream' || isOctetStreamExcel);
  if (!hasSupportedType) {
    ElMessage.error('不支持的文件类型');
    return false;
  }

  if (attachments.value.length + pendingUploadKeys.size >= props.maxFiles) {
    ElMessage.warning(`最多只能上传 ${props.maxFiles} 个文件`);
    return false;
  }

  pendingUploadKeys.add(uploadKey(file));
  return true;
};

const uploadAttachment = async ({ file, onSuccess, onError }) => {
  const formData = new FormData();
  formData.append('file', file);
  if (props.businessType && props.businessId !== null && props.businessId !== undefined) {
    formData.append('businessType', props.businessType);
    formData.append('businessId', String(props.businessId));
    formData.append('isPublic', String(props.isPublic));
  }

  try {
    const response = await commonApi.uploadFile(formData);
    onSuccess(response.data);
  } catch (error) {
    onError(error);
  }
};

const handleSuccess = (response, file) => {
  const uploadedFile = response?.data?.data || response?.data || response;
  const fileUrl = uploadedFile?.url || uploadedFile?.fileUrl || uploadedFile?.filePath || uploadedFile?.path;

  if (fileUrl) {
    const normalizedUrl = String(fileUrl);
    if (!attachments.value.some(item => String(item.url) === normalizedUrl)) {
      attachments.value.push({
        id: uploadedFile?.id,
        name: uploadedFile?.filename || uploadedFile?.originalName || file.name,
        size: uploadedFile?.size ?? file.size,
        url: normalizedUrl,
        type: uploadedFile?.mimetype || uploadedFile?.mimeType || file.type
      });
      emitAttachments();
    }
    releaseUploadSlot(file);
    ElMessage.success('上传成功');
  } else {
    releaseUploadSlot(file);
    ElMessage.error(response?.message || '上传失败');
  }
};

const handleError = (error, file) => {
  releaseUploadSlot(file);
  console.error('Upload error:', error);
  ElMessage.error('上传失败，请重试');
};

const handleExceed = () => {
  ElMessage.warning(`最多只能上传 ${props.maxFiles} 个文件`);
};

const removeFile = (index) => {
  attachments.value.splice(index, 1);
  emitAttachments();
  ElMessage.success('已删除');
};

const downloadFile = (file) => {
  const href = resourceUrl(file?.url);
  if (!href) {
    ElMessage.warning('附件地址不可用');
    return;
  }
  const link = document.createElement('a');
  link.href = href;
  link.download = file?.name || '附件';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const formatFileSize = (bytes) => {
  if (!Number.isFinite(Number(bytes)) || Number(bytes) < 0) return '-';
  bytes = Number(bytes);
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

watch(() => props.modelValue, (newVal) => {
  attachments.value = (newVal || []).map(normalizeAttachment);
}, { deep: true });
</script>

<style scoped>
.attachment-upload {
  width: 100%;
}

.attachment-list {
  margin-top: 20px;
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.list-header {
  background-color: var(--color-bg-hover);
  padding: 10px 15px;
  font-weight: bold;
  color: var(--color-text-regular);
  border-bottom: 1px solid var(--color-border-base);
}

.attachment-item {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid var(--color-border-lighter);
  transition: background-color var(--transition-base);
}

.attachment-item:last-child {
  border-bottom: none;
}

.attachment-item:hover {
  background-color: var(--color-bg-hover);
}

.file-icon {
  font-size: 24px;
  color: var(--color-primary);
  margin-right: 12px;
  flex-shrink: 0;
}

.image-thumb {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  margin-right: 12px;
  flex-shrink: 0;
  cursor: zoom-in;
  border: 1px solid var(--color-border-lighter);
}

.file-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filename {
  font-size: 14px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filesize {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.el-upload__tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 8px;
}
</style>
