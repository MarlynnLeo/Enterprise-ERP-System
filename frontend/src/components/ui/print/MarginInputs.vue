<!--
/**
 * MarginInputs.vue
 * @description Vue组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="margin-inputs">
    <el-input-number
      :model-value="modelValue.top"
      :min="0"
      :max="100"
      placeholder="上"
      @update:model-value="updateValue('top', $event)"
    />
    <el-input-number
      :model-value="modelValue.right"
      :min="0"
      :max="100"
      placeholder="右"
      @update:model-value="updateValue('right', $event)"
    />
    <el-input-number
      :model-value="modelValue.bottom"
      :min="0"
      :max="100"
      placeholder="下"
      @update:model-value="updateValue('bottom', $event)"
    />
    <el-input-number
      :model-value="modelValue.left"
      :min="0"
      :max="100"
      placeholder="左"
      @update:model-value="updateValue('left', $event)"
    />
  </div>
</template>

<script setup>

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
    default: () => ({
      top: 10,
      right: 10,
      bottom: 10,
      left: 10
    })
  }
});

const emit = defineEmits(['update:modelValue']);

const updateValue = (key, value) => {
  const newValue = { ...props.modelValue };
  newValue[key] = value;
  emit('update:modelValue', newValue);
};
</script>

<style scoped>
.margin-inputs {
  display: flex;
  gap: 10px;
}

.margin-inputs .el-input-number {
  flex: 1;
}
</style>
