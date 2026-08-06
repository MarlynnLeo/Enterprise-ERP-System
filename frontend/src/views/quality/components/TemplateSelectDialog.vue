<!--
/**
 * TemplateSelectDialog.vue
 * @description 检验模板选择弹窗（多模板时显示）
 * @date 2026-04-03
 * @version 1.0.0
 */
-->
<template>
  <AppDialog
    v-model="dialogVisible"
    title="选择检验模板"
    mode="form"
    width="550px"
  >
    <div class="template-selection">
      <p class="tip">该物料存在多个检验模板，请选择一个应用：</p>
      <el-radio-group v-model="selectedId" class="template-radio-group">
        <div v-for="tmpl in templates" :key="tmpl.id" class="template-option">
          <el-radio :value="tmpl.id">
            <div class="template-info">
              <span class="template-name">{{ tmpl.templateName }}</span>
              <span class="template-desc">{{ tmpl.description || '无描述' }}</span>
              <span class="template-items">
                检验项: {{ (tmpl.items || tmpl.InspectionItems || []).length }} 项
                <el-tag v-if="tmpl.is_general" size="small" type="info" class="ml-4">通用</el-tag>
              </span>
            </div>
          </el-radio>
        </div>
      </el-radio-group>
    </div>
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleConfirm" :disabled="!selectedId">确认</el-button>
    </template>
    </AppDialog>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  visible: Boolean,
  templates: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:visible', 'select', 'cancel'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const selectedId = ref(null)

const handleConfirm = () => {
  if (selectedId.value) {
    emit('select', selectedId.value)
    dialogVisible.value = false
  }
}

const handleCancel = () => {
  dialogVisible.value = false
  emit('cancel')
}
</script>

<style scoped>
.template-selection { padding: 10px 0; }
.tip { margin-bottom: 15px; color: var(--color-text-regular); }

.template-radio-group {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.template-option {
  margin-bottom: 12px;
  padding: 10px;
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-base), border-color var(--transition-base);
}
.template-option:hover { background-color: var(--color-bg-hover); }

.template-info {
  display: flex;
  flex-direction: column;
  margin-left: 8px;
}
.template-name { font-weight: bold; font-size: 15px; margin-bottom: 5px; }
.template-desc { color: var(--color-text-regular); font-size: 13px; margin-bottom: 5px; }
.template-items { color: var(--color-text-secondary); font-size: 12px; }
</style>
