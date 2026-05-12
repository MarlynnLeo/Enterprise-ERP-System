<!--
/**
 * PaperSizeSelect.vue
 * @description Vue组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <el-select
    :model-value="modelValue"
    :placeholder="placeholder"
    :style="{ width: width }"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-option
      v-for="option in PAPER_SIZE_OPTIONS"
      :key="option.value"
      :label="option.label"
      :value="option.value"
    />
  </el-select>
</template>

<script setup>
import { PAPER_SIZE_OPTIONS } from '../../../constants/printConstants';

defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '选择纸张大小'
  },
  width: {
    type: String,
    default: '100%'
  }
});

defineEmits(['update:modelValue']);
</script>
