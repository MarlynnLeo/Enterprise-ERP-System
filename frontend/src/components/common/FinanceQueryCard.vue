<template>
  <el-card class="search-card finance-query-card">
    <el-form :inline="true" :model="model" class="search-form finance-query-card__basic">
      <slot name="basic" />
      <el-form-item class="finance-query-card__actions">
        <el-button type="primary" @click="$emit('search')">{{ searchLabel }}</el-button>
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

/* Unified min-width for all form controls inside search cards.
   Prevents input fields from being too narrow on any page. */
.finance-query-card__basic :deep(.el-input),
.finance-query-card__basic :deep(.el-select),
.finance-query-card__basic :deep(.el-cascader),
.finance-query-card__basic :deep(.el-input-number),
.finance-query-card__advanced :deep(.el-input),
.finance-query-card__advanced :deep(.el-select),
.finance-query-card__advanced :deep(.el-cascader),
.finance-query-card__advanced :deep(.el-input-number) {
  min-width: 200px;
}

.finance-query-card__basic :deep(.el-date-editor),
.finance-query-card__advanced :deep(.el-date-editor) {
  min-width: 200px;
}

.finance-query-card__basic :deep(.el-date-editor--daterange),
.finance-query-card__basic :deep(.el-date-editor--datetimerange),
.finance-query-card__advanced :deep(.el-date-editor--daterange),
.finance-query-card__advanced :deep(.el-date-editor--datetimerange) {
  min-width: 280px;
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
</style>
