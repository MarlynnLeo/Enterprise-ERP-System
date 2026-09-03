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
      v-if="!readonly"
      v-model:file-list="fileList"
      :http-request="uploadAttachment"
      :on-success="handleSuccess"
      :on-error="handleError"
      :before-upload="beforeUpload"
      :on-remove="handleRemove"
      multiple
      :limit="maxFiles"
      :show-file-list="true"
    >
      <el-button type="primary" :icon="Upload">
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
          <el-button link type="primary" @click="downloadFile(file)">
            <el-icon><Download /></el-icon>
            下载
          </el-button>
          <el-button v-if="!readonly" link type="danger" @click="removeFile(index)">
            <el-icon><Delete /></el-icon>
            删除
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Document, Delete, Download } from '@element-plus/icons-vue';
import { commonApi } from '@/api';
import { buildResourceUrl } from '@/config/app';

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
    default: 10
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
  return {
    ...file,
    url: file?.url || file?.fileUrl || file?.file_url || file?.path || file?.filePath || '',
    name: file?.name || file?.filename || file?.originalName || '附件'
  };
};
const fileList = ref([]);
const attachments = ref((props.modelValue || []).map(normalizeAttachment));
const resourceUrl = (url) => buildResourceUrl(url);
const isImage = (file) => /^image\//i.test(file?.type || '') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(file?.url || file?.name || '');
const imagePreviewUrls = computed(() => attachments.value.filter(isImage).map(file => resourceUrl(file.url)).filter(Boolean));
const imagePreviewIndex = (file) => Math.max(0, imagePreviewUrls.value.indexOf(resourceUrl(file.url)));

const beforeUpload = (file) => {
  const isLtMaxSize = file.size / 1024 / 1024 < props.maxSizeMB;
  if (!isLtMaxSize) {
    ElMessage.error(`文件大小不能超过 ${props.maxSizeMB}MB`);
    return false;
  }

  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'text/plain',
    'application/zip',
    'application/x-rar-compressed'
  ];

  if (!allowedTypes.includes(file.type)) {
    ElMessage.error('不支持的文件类型');
    return false;
  }

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
  const uploadedFile = response?.success ? response.data : response?.data || response;
  const fileUrl = uploadedFile?.url || uploadedFile?.filePath || uploadedFile?.path;

  if (fileUrl) {
    attachments.value.push({
      name: file.name,
      size: file.size,
      url: fileUrl,
      type: file.type
    });
    emit('update:modelValue', attachments.value);
    ElMessage.success('上传成功');
  } else {
    ElMessage.error(response.message || '上传失败');
  }
};

const handleError = (error) => {
  console.error('Upload error:', error);
  ElMessage.error('上传失败，请重试');
};

const handleRemove = (file) => {
  const index = attachments.value.findIndex(item => item.name === file.name && item.url === (file.url || file.response?.url));
  if (index > -1) {
    attachments.value.splice(index, 1);
    emit('update:modelValue', attachments.value);
  }
};

const removeFile = (index) => {
  attachments.value.splice(index, 1);
  emit('update:modelValue', attachments.value);
  ElMessage.success('已删除');
};

const downloadFile = (file) => {
  const link = document.createElement('a');
  link.href = resourceUrl(file.url);
  link.download = file.name;
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
  const i = Math.floor(Math.log(bytes) / Math.log(k));
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
