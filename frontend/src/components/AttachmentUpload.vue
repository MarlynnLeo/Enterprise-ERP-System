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
      :action="uploadUrl"
      :headers="uploadHeaders"
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
          支持上传PDF、Word、Excel、图片等文件，单个文件不超过{{ maxSizeMB }}MB，最多{{ maxFiles }}个文件
        </div>
      </template>
    </el-upload>

    <!-- 已上传附件列表 -->
    <div v-if="attachments.length > 0" class="attachment-list">
      <div class="list-header">
        <span>已上传附件 ({{ attachments.length }})</span>
      </div>
      <div v-for="(file, index) in attachments" :key="index" class="attachment-item">
        <el-icon class="file-icon"><Document /></el-icon>
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
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Upload, Document, Delete, Download } from '@element-plus/icons-vue';
import { tokenManager } from '@/utils/unifiedStorage';

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
  }
});

const emit = defineEmits(['update:modelValue']);

const fileList = ref([]);
const attachments = ref([...props.modelValue]);

const uploadUrl = computed(() => {
  const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  return `${baseUrl}/api/upload/file`;
});

const uploadHeaders = computed(() => {
  return {
    'Authorization': `Bearer ${tokenManager.getToken()}`
  };
});

const beforeUpload = (file) => {
  const isLtMaxSize = file.size / 1024 / 1024 < props.maxSizeMB;
  if (!isLtMaxSize) {
    ElMessage.error(`文件大小不能超过${props.maxSizeMB}MB`);
    return false;
  }

  // 检查文件类型
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

const handleSuccess = (response, file) => {
  if (response.success) {
    attachments.value.push({
      name: file.name,
      size: file.size,
      url: response.data.url,
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
  // 从附件列表中移除
  const index = attachments.value.findIndex(item => item.name === file.name);
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
  // 创建隐藏的a标签进行下载
  const link = document.createElement('a');
  link.href = file.url;
  link.download = file.name;
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// 监听外部值变化
watch(() => props.modelValue, (newVal) => {
  attachments.value = [...newVal];
}, { deep: true });
</script>

<style scoped>
.attachment-upload {
  width: 100%;
}

.attachment-list {
  margin-top: 20px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
}

.list-header {
  background-color: #f5f7fa;
  padding: 10px 15px;
  font-weight: bold;
  color: #606266;
  border-bottom: 1px solid #dcdfe6;
}

.attachment-item {
  display: flex;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid #ebeef5;
  transition: background-color 0.3s;
}

.attachment-item:last-child {
  border-bottom: none;
}

.attachment-item:hover {
  background-color: #f5f7fa;
}

.file-icon {
  font-size: 24px;
  color: #409eff;
  margin-right: 12px;
  flex-shrink: 0;
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
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filesize {
  font-size: 12px;
  color: #909399;
}

.file-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.el-upload__tip {
  font-size: 12px;
  color: #909399;
  margin-top: 8px;
}
</style>
