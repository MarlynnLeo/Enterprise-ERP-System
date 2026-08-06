<template>
  <AppDialog
    v-model="visible"
    :title="title || '打印预览'"
    mode="preview"
    width="920px"
    :close-on-click-modal="false"
    :loading="loading"
    @opened="onOpened"
  >
    <div class="print-preview-container">
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
  </AppDialog>
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

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const loading = ref(false);
const error = ref('');
const previewHtml = ref('');
const previewIframe = ref(null);

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

const handlePrint = () => {
  if (previewIframe.value && previewIframe.value.contentWindow) {
    previewIframe.value.contentWindow.print();
  }
};

const onOpened = () => {
  generatePreview();
};

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
  border: 1px solid var(--color-border-base);
  background-color: var(--color-bg-hover);
  padding: 20px;
  display: flex;
  justify-content: center;
}

.preview-iframe {
  width: 100%;
  height: 600px;
  background-color: var(--color-bg-base);
  border: none;
  box-shadow: var(--shadow-sm);
}

.error-message {
  padding: 20px;
}
</style>
