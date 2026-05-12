<!--
/**
 * PrintDialog.vue
 * @description 通用打印预览对话框
 * @date 2026-01-17
 */
-->
<template>
  <el-dialog
    v-model="visible"
    :title="title || '打印预览'"
    width="920px"
    :close-on-click-modal="false"
    destroy-on-close
    @opened="onOpened"
  >
    <div class="print-preview-container" v-loading="loading">
      <div v-if="error" class="error-message">
        <el-alert :title="error" type="error" show-icon :closable="false" />
      </div>

      <div v-else class="preview-content">
        <iframe
          ref="previewIframe"
          class="preview-iframe"
          :srcdoc="previewHtml"
        ></iframe>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handlePrint" :disabled="loading || error || !previewHtml">
          打印
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

import printService from '@/services/printService';

const props = defineProps({
  modelValue: Boolean,
  title: String,
  templateType: {
    type: String,
    required: true
  },
  module: {
    type: String,
    default: 'finance'
  },
  data: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:modelValue']);

// 对话框可见性
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const loading = ref(false);
const error = ref('');
const previewHtml = ref('');
const previewIframe = ref(null);

// 通过统一打印服务生成预览，自动合并系统公司信息。
const generatePreview = async () => {
  loading.value = true;
  error.value = '';
  previewHtml.value = '';

  try {
    previewHtml.value = await printService.generateByDefaultTemplate(props.module, props.templateType, props.data);
  } catch (err) {
    console.error('生成打印预览失败:', err);
    error.value = '生成打印预览失败，请检查模板配置或联系管理员';
  } finally {
    loading.value = false;
  }
};

// 打印
const handlePrint = () => {
  if (previewIframe.value && previewIframe.value.contentWindow) {
    previewIframe.value.contentWindow.print();
  }
};

// 监听打开事件
const onOpened = () => {
  generatePreview();
};

// 监听数据变化，重新生成预览（如果对话框已打开）
watch(() => props.data, () => {
  if (visible.value) {
    generatePreview();
  }
}, { deep: true });

</script>

<style scoped>
.print-preview-container {
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

.preview-content {
  flex: 1;
  border: 1px solid #dcdfe6;
  background-color: #f5f7fa;
  padding: 20px;
  display: flex;
  justify-content: center;
}

.preview-iframe {
  width: 100%;
  height: 600px; /* 或者根据内容自适应 */
  background-color: white;
  border: none;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.error-message {
  padding: 20px;
}
</style>
