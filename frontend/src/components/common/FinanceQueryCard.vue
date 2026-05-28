<template>
  <el-card class="search-card finance-query-card">
    <el-form :inline="true" :model="model" class="search-form finance-query-card__basic">
      <slot name="basic" />
      <el-form-item class="finance-query-card__actions">
        <el-button type="primary" :loading="loading" @click="$emit('search')">{{ searchLabel }}</el-button>
        <el-button :loading="loading" @click="$emit('reset')">{{ resetLabel }}</el-button>
        <el-button
          v-if="hasAdvanced"
          class="advanced-search-btn"
          @click="toggleExpanded"
        >
          {{ isExpanded ? collapseLabel : expandLabel }}
          <el-icon class="finance-query-card__toggle-icon">
            <ArrowUp v-if="isExpanded" />
            <ArrowDown v-else />
          </el-icon>
        </el-button>
        <slot name="actions" />
      </el-form-item>
    </el-form>

    <el-collapse-transition>
      <el-form
        v-if="hasAdvanced && isExpanded"
        :inline="true"
        :model="model"
        class="search-form finance-query-card__advanced"
      >
        <slot name="advanced" />
      </el-form>
    </el-collapse-transition>
  </el-card>
</template>

<script setup>
import { computed, getCurrentInstance, ref, useSlots } from 'vue';
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({})
  },
  expanded: {
    type: Boolean,
    default: false
  },
  loading: {
    type: Boolean,
    default: false
  },
  searchLabel: {
    type: String,
    default: '查询'
  },
  resetLabel: {
    type: String,
    default: '重置'
  },
  expandLabel: {
    type: String,
    default: '高级筛选'
  },
  collapseLabel: {
    type: String,
    default: '收起筛选'
  }
});

const emit = defineEmits(['search', 'reset', 'update:expanded']);

const slots = useSlots();
const hasAdvanced = computed(() => Boolean(slots.advanced));
const instance = getCurrentInstance();
const isControlled = computed(() => {
  const vnodeProps = instance?.vnode?.props || {};
  return Object.prototype.hasOwnProperty.call(vnodeProps, 'expanded');
});
const internalExpanded = ref(false);
const isExpanded = computed(() => (isControlled.value ? props.expanded : internalExpanded.value));

const toggleExpanded = () => {
  const nextExpanded = !isExpanded.value;
  internalExpanded.value = nextExpanded;
  emit('update:expanded', nextExpanded);
};
</script>

<style scoped>
.finance-query-card__basic,
.finance-query-card__advanced {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  column-gap: 24px;
  row-gap: 12px;
  margin: 0;
}

.finance-query-card__basic :deep(.el-form-item),
.finance-query-card__advanced :deep(.el-form-item) {
  margin-right: 0;
  margin-bottom: 0;
}

.finance-query-card__actions {
  flex: 0 0 auto;
}

.finance-query-card__actions :deep(.el-form-item__content) {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.finance-query-card__actions :deep(.el-button),
.finance-query-card__actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}

.finance-query-card__advanced {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-lighter);
}

.advanced-search-btn {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border-base));
  background-color: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-base));
}

.advanced-search-btn:hover,
.advanced-search-btn:focus {
  color: var(--color-primary-dark-2, var(--color-primary));
  border-color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 12%, var(--color-bg-base));
}

.finance-query-card__toggle-icon {
  margin-left: 4px;
}
</style>
