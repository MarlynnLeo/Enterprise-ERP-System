<template>
  <div class="menu-search">
    <button
      class="search-trigger"
      type="button"
      title="搜索菜单 (Ctrl+K)"
      aria-label="搜索菜单"
      @click="openSearch"
    >
      <el-icon><Search /></el-icon>
    </button>

    <AppDialog
      v-model="visible"
      mode="form"
      width="600px"
      :show-close="false"
      custom-class="search-dialog"
      @opened="onOpened"
      @closed="onClosed"
    >
      <div class="search-input-wrapper">
        <el-input
          ref="inputRef"
          v-model="keyword"
          placeholder="搜索菜单..."
          size="large"
          clearable
          @input="handleSearch"
          @keydown.down.prevent="navigateOptions('next')"
          @keydown.up.prevent="navigateOptions('prev')"
          @keydown.enter.prevent="selectActive"
        >
          <template #prefix>
            <el-icon class="search-icon"><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <div v-if="keyword" class="search-results">
        <div v-if="filteredOptions.length === 0" class="no-results">
          <EmptyState description="未找到相关菜单" :image-size="60" />
        </div>
        <div v-else class="results-list">
          <div
            v-for="(item, index) in filteredOptions"
            :key="item.path"
            class="result-item"
            :class="{ active: activeIndex === index }"
            @click="handleSelect(item)"
            @mouseenter="activeIndex = index"
          >
            <div class="item-icon">
              <el-icon v-if="item.icon"><component :is="item.icon" /></el-icon>
              <el-icon v-else><Menu /></el-icon>
            </div>
            <div class="item-content">
              <div class="item-title">{{ item.title }}</div>
              <div class="item-path">
                <span v-for="(crumb, idx) in item.breadcrumbs" :key="idx">
                  {{ crumb }}
                  <el-icon v-if="idx < item.breadcrumbs.length - 1" class="separator"><ArrowRight /></el-icon>
                </span>
              </div>
            </div>
            <div class="item-action">
              <el-icon><Right /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <div class="search-footer">
        <div class="key-hint">
          <span class="key">↑</span>
          <span class="key">↓</span>
          <span>选择</span>
        </div>
        <div class="key-hint">
          <span class="key">Enter</span>
          <span>确认</span>
        </div>
        <div class="key-hint">
          <span class="key">Esc</span>
          <span>关闭</span>
        </div>
      </div>
    </AppDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePermissionStore } from '../../stores/permissionStore'
import { buildMenuSearchOptions } from '../../utils/menuSearch'
import {
  Search, Menu, ArrowRight, Right
} from '@element-plus/icons-vue'

const router = useRouter()
const permissionStore = usePermissionStore()

const visible = ref(false)
const keyword = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)

const menuOptions = computed(() =>
  buildMenuSearchOptions(permissionStore.preparedMenuTree)
)

const filteredOptions = computed(() => {
  if (!keyword.value) return []
  const k = keyword.value.toLowerCase()
  return menuOptions.value.filter(item =>
    item.title.toLowerCase().includes(k) ||
    item.path.toLowerCase().includes(k) ||
    item.breadcrumbs.some(b => b.toLowerCase().includes(k))
  ).slice(0, 15)
})

const openSearch = () => {
  visible.value = true
  keyword.value = ''
  activeIndex.value = 0
}

const onOpened = () => {
  nextTick(() => {
    inputRef.value?.focus()
  })
}

const onClosed = () => {
  keyword.value = ''
}

const handleSearch = () => {
  activeIndex.value = 0
}

const navigateOptions = (direction) => {
  if (filteredOptions.value.length === 0) return

  if (direction === 'next') {
    activeIndex.value = (activeIndex.value + 1) % filteredOptions.value.length
  } else {
    activeIndex.value = (activeIndex.value - 1 + filteredOptions.value.length) % filteredOptions.value.length
  }

  const el = document.querySelector('.result-item.active')
  if (el) {
    el.scrollIntoView({ block: 'nearest' })
  }
}

const selectActive = () => {
  if (filteredOptions.value.length > 0) {
    handleSelect(filteredOptions.value[activeIndex.value])
  }
}

const handleSelect = (item) => {
  visible.value = false
  router.push(item.path)
}

const handleGlobalKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    openSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
.search-trigger {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 1px solid transparent;
  border-radius: var(--shell-radius-md, var(--radius-md));
  color: var(--color-text-regular);
  background: transparent;
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base);
  margin-right: 12px;
}

.search-trigger:hover,
.search-trigger:focus-visible {
  background-color: var(--shell-control-hover-bg, var(--color-bg-hover));
  border-color: var(--shell-control-border, var(--color-border-light));
  color: var(--shell-accent, var(--color-primary));
  outline: none;
}

.search-icon {
  font-size: 20px;
}

:deep(.search-dialog) {
  border-radius: var(--theme-dialog-radius, var(--radius-lg));
  overflow: hidden;
  box-shadow: var(--theme-dialog-shadow, var(--shadow-lg));

  .el-dialog__header {
    display: none;
  }

  .el-dialog__body {
    padding: 0;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
  }
}

.search-input-wrapper {
  padding: 16px;
  border-bottom: 1px solid var(--color-border-lighter);
}

:deep(.el-input__wrapper) {
  background-color: var(--color-bg-hover);
  box-shadow: none !important;
  border-radius: var(--shell-radius-md, var(--radius-md));

  &.is-focus {
    background-color: var(--color-bg-base);
    box-shadow: var(--shell-focus-ring, 0 0 0 2px var(--shell-accent, var(--color-primary))) !important;
  }
}

.search-results {
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: var(--shell-radius-md, var(--radius-md));
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);

  &:hover,
  &.active {
    background-color: var(--color-bg-hover);
  }

  &.active {
    .item-title {
      color: var(--shell-accent, var(--color-primary));
    }

    .item-action {
      opacity: 1;
    }
  }
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--shell-radius-sm, var(--radius-sm));
  background-color: var(--color-bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: var(--color-text-regular);
  font-size: 16px;
}

.item-content {
  flex: 1;
  overflow: hidden;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.item-path {
  font-size: 12px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
}

.separator {
  margin: 0 4px;
  font-size: 12px;
  color: var(--color-text-placeholder);
}

.item-action {
  opacity: 0;
  transition: opacity var(--transition-fast);
  color: var(--color-text-secondary);
}

.search-footer {
  padding: 8px 16px;
  background-color: var(--color-bg-hover);
  display: flex;
  gap: 16px;
  border-top: 1px solid var(--color-border-lighter);
}

.key-hint {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  gap: 6px;
}

.key {
  background-color: var(--color-bg-base);
  padding: 2px 6px;
  border-radius: var(--shell-radius-sm, var(--radius-sm));
  box-shadow: var(--shadow-xs, none);
  font-family: monospace;
  min-width: 16px;
  text-align: center;
}
</style>
