<template>
  <el-card class="search-card finance-query-card">
    <el-form
      :inline="true"
      :model="model"
      class="search-form finance-query-card__basic"
      @submit.prevent
      @keyup.enter.capture="handleEnterSearch"
    >
      <slot name="basic" />
      <el-form-item class="finance-query-card__actions">
        <el-button type="primary" @click="handleSearch">{{ searchLabel }}</el-button>
        <el-button @click="$emit('reset')">{{ resetLabel }}</el-button>
        <el-button
          v-if="hasAdvanced"
          class="advanced-search-btn"
          @click="toggleExpanded"
        >
          <span>{{ isExpanded ? collapseLabel : expandLabel }}</span>
          <el-icon class="finance-query-card__toggle-icon" :class="{ 'is-expanded': isExpanded }">
            <ArrowDown />
          </el-icon>
        </el-button>
        <slot name="actions" />
      </el-form-item>
    </el-form>

    <transition
      name="finance-query-card-expand"
      @before-enter="beforeAdvancedEnter"
      @enter="advancedEnter"
      @after-enter="afterAdvancedEnter"
      @before-leave="beforeAdvancedLeave"
      @leave="advancedLeave"
    >
      <div
        v-if="hasAdvanced && isExpanded"
        class="finance-query-card__advanced-wrap"
      >
        <el-form
          :inline="true"
          :model="model"
          class="search-form finance-query-card__advanced"
          @submit.prevent
          @keyup.enter.capture="handleEnterSearch"
        >
          <slot name="advanced" />
        </el-form>
      </div>
    </transition>
  </el-card>
</template>

<script setup>
import { computed, getCurrentInstance, ref, useSlots } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({})
  },
  expanded: {
    type: Boolean,
    default: false
  },
  // loading prop kept for backward compatibility (65+ pages pass it).
  // It is intentionally NOT bound to any button to prevent spinner flash on page load.
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

const searchInputTypes = new Set(['text', 'search', 'number', 'email', 'tel', 'url']);
const enterManagedControlSelector = [
  '.el-select',
  '.el-cascader',
  '.el-date-editor',
  '.el-time-picker',
  '.el-time-select',
  '.el-autocomplete',
  '.el-tree-select',
  '.el-mention',
  '[role="combobox"]',
  'input[list]'
].join(', ');

const isSearchInput = (target) => {
  if (!(target instanceof HTMLInputElement)) return false;
  if (target.disabled || target.readOnly || !searchInputTypes.has(target.type)) return false;
  return !target.closest(enterManagedControlSelector);
};

const handleSearch = () => {
  emit('search');
};

const handleEnterSearch = (event) => {
  if (!isSearchInput(event.target)) return;

  // Enter may be used to confirm Chinese/Japanese IME composition.
  // Stop legacy input-level Enter listeners without starting a query.
  if (event.isComposing || event.keyCode === 229) {
    event.stopPropagation();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  handleSearch();
};

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

const setAdvancedHeight = (element, height) => {
  element.style.height = height;
};

const beforeAdvancedEnter = (element) => {
  setAdvancedHeight(element, '0');
  element.style.opacity = '0';
  element.style.transform = 'translateY(-4px)';
};

const advancedEnter = (element) => {
  window.requestAnimationFrame(() => {
    setAdvancedHeight(element, `${element.scrollHeight}px`);
    element.style.opacity = '1';
    element.style.transform = 'translateY(0)';
  });
};

const afterAdvancedEnter = (element) => {
  setAdvancedHeight(element, 'auto');
  element.style.opacity = '';
  element.style.transform = '';
};

const beforeAdvancedLeave = (element) => {
  setAdvancedHeight(element, `${element.scrollHeight}px`);
  element.style.opacity = '1';
  element.style.transform = 'translateY(0)';
};

const advancedLeave = (element, done) => {
  let finished = false;
  let fallbackTimer = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (fallbackTimer) window.clearTimeout(fallbackTimer);
    element.removeEventListener('transitionend', onEnd);
    done();
  };
  const onEnd = (event) => {
    if (event.target !== element || event.propertyName !== 'height') return;
    finish();
  };

  element.addEventListener('transitionend', onEnd);
  fallbackTimer = window.setTimeout(finish, 320);
  window.requestAnimationFrame(() => {
    setAdvancedHeight(element, '0');
    element.style.opacity = '0';
    element.style.transform = 'translateY(-4px)';
  });
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

/* 搜索表单项固定宽度策略：
   1. 宽度约束加在 el-form-item__content（包裹 input 的容器）上
   2. input 自然填满容器（Element Plus 默认 width:100%）
   3. clearable 的 × 出现/消失只影响 input 内部文字区域缩放，不改变外层容器宽度
   4. 按钮区域位置完全不受影响 */
.finance-query-card__basic :deep(.el-form-item:not(.finance-query-card__actions) .el-form-item__content),
.finance-query-card__advanced :deep(.el-form-item .el-form-item__content) {
  --finance-query-control-width: 200px;
  width: var(--finance-query-control-width);
  flex: 0 0 var(--finance-query-control-width);
}

.finance-query-card__basic :deep(.el-form-item:not(.finance-query-card__actions) .el-form-item__content:has(.el-date-editor--daterange, .el-date-editor--datetimerange, .el-date-editor--monthrange, .el-date-editor--yearrange)),
.finance-query-card__advanced :deep(.el-form-item .el-form-item__content:has(.el-date-editor--daterange, .el-date-editor--datetimerange, .el-date-editor--monthrange, .el-date-editor--yearrange)) {
  --finance-query-control-width: 280px;
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

.finance-query-card__actions :deep(.el-dropdown) {
  max-width: 100%;
  margin-left: 0 !important;
}

.finance-query-card__actions :deep(.el-dropdown .el-button) {
  max-width: 100%;
}

.finance-query-card__advanced-wrap {
  overflow: hidden;
  will-change: height, opacity, transform;
}

.finance-query-card-expand-enter-active,
.finance-query-card-expand-leave-active {
  transition: height 0.22s cubic-bezier(0.2, 0, 0, 1),
    opacity 0.16s ease,
    transform 0.22s cubic-bezier(0.2, 0, 0, 1);
}

.finance-query-card__advanced {
  margin: 16px 0 0;
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
  transition: transform 0.2s ease;
}

.finance-query-card__toggle-icon.is-expanded {
  transform: rotate(180deg);
}

@media (max-width: 768px) {
  .finance-query-card__basic {
    column-gap: 12px;
    row-gap: 10px;
  }

  .finance-query-card__basic :deep(.el-form-item:not(.finance-query-card__actions) .el-form-item__content),
  .finance-query-card__advanced :deep(.el-form-item .el-form-item__content) {
    --finance-query-control-width: min(100%, 280px);
    flex-basis: var(--finance-query-control-width);
    width: var(--finance-query-control-width);
  }

  .finance-query-card__actions {
    flex: 1 1 100%;
    min-width: 0;
  }

  .finance-query-card__actions :deep(.el-form-item__content) {
    width: 100%;
    min-width: 0;
    justify-content: flex-start;
  }
}
</style>
