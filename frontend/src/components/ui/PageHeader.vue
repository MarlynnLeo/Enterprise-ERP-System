<!--
  标准业务页头：标题 + 副标题 + 右侧操作区
-->
<template>
  <el-card class="header-card page-header-card" shadow="never">
    <div class="header-content">
      <div class="title-section">
        <h2 class="page-header-title">{{ title }}</h2>
        <p v-if="subtitle" class="subtitle page-header-subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions || $slots.default" class="action-section page-header-actions">
        <slot name="actions">
          <slot />
        </slot>
      </div>
    </div>
  </el-card>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
});
</script>
