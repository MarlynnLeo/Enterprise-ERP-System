<!--
  统一空状态
-->
<template>
  <div class="erp-empty-state" role="status" :aria-label="title || '暂无数据'">
    <el-empty :description="title || description" :image-size="imageSize">
      <template v-if="$slots.default" #default>
        <slot />
      </template>
    </el-empty>
    <p v-if="description && title" class="erp-empty-desc">{{ description }}</p>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '暂无数据',
  },
  imageSize: {
    type: Number,
    default: 120,
  },
});
</script>

<style scoped>
.erp-empty-state {
  padding: 24px 12px;
  text-align: center;
}
.erp-empty-desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}
</style>
