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
      title="搜索菜单"
      mode="form"
      width="600px"
      :show-close="false"
      custom-class="search-dialog"
      @opened="onOpened"
    >
      <div class="search-input-wrapper">
        <el-input
          ref="inputRef"
          v-model="keyword"
          placeholder="搜索菜单..."
          size="large"
          clearable
          container-role="combobox"
          aria-label="搜索菜单"
          aria-autocomplete="list"
          :aria-expanded="filteredOptions.length > 0"
          :aria-controls="resultsId"
          :aria-activedescendant="activeOptionId"
          @keydown="handleInputKeydown"
        >
          <template #prefix>
            <el-icon class="search-icon"><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <div v-if="keyword.trim()" ref="resultsRef" class="search-results" :aria-busy="selecting">
        <div v-if="filteredOptions.length === 0" class="no-results">
          <EmptyState description="未找到相关菜单" :image-size="60" />
        </div>
        <div :id="resultsId" class="results-list" role="listbox" aria-label="菜单搜索结果">
          <div
            v-for="(item, index) in filteredOptions"
            :key="item.path"
            :id="`${resultsId}-${index}`"
            role="option"
            :aria-selected="activeIndex === index"
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
      <p v-if="searchError" class="search-error" role="alert">{{ searchError }}</p>

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
import { ref, computed, watch, useId, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, isNavigationFailure, NavigationFailureType } from 'vue-router'
import { usePermissionStore } from '../../stores/permissionStore'
import { buildMenuSearchOptions } from '../../utils/menuSearch'
import logger from '../../utils/logger'
import {
  Search, Menu, ArrowRight, Right
} from '@element-plus/icons-vue'

const router = useRouter()
const permissionStore = usePermissionStore()

const visible = ref(false)
const keyword = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)
const resultsRef = ref(null)
const resultsId = `menu-search-${useId()}`
const selecting = ref(false)
const searchError = ref('')
let navigationRevision = 0

const menuOptions = computed(() =>
  buildMenuSearchOptions(permissionStore.preparedMenuTree)
)

const filteredOptions = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return []
  return menuOptions.value.filter(item =>
    item.title.toLowerCase().includes(k) ||
    item.path.toLowerCase().includes(k) ||
    item.breadcrumbs.some(b => b.toLowerCase().includes(k))
  ).slice(0, 15)
})

const activeOptionId = computed(() => filteredOptions.value[activeIndex.value]
  ? `${resultsId}-${activeIndex.value}`
  : undefined)

watch(filteredOptions, () => {
  activeIndex.value = 0
  searchError.value = ''
}, { flush: 'sync' })

watch(visible, (open) => {
  navigationRevision++
  selecting.value = false
  searchError.value = ''
  if (!open) keyword.value = ''
}, { flush: 'sync' })

const openSearch = () => {
  if (visible.value) {
    inputRef.value?.focus()
    return
  }
  visible.value = true
  keyword.value = ''
  activeIndex.value = 0
}

const onOpened = () => {
  nextTick(() => {
    if (visible.value) inputRef.value?.focus()
  })
}

const navigateOptions = async (direction) => {
  if (filteredOptions.value.length === 0) return

  if (direction === 'next') {
    activeIndex.value = (activeIndex.value + 1) % filteredOptions.value.length
  } else {
    activeIndex.value = (activeIndex.value - 1 + filteredOptions.value.length) % filteredOptions.value.length
  }

  await nextTick()
  resultsRef.value?.querySelector('.result-item.active')?.scrollIntoView({ block: 'nearest' })
}

const handleInputKeydown = (event) => {
  // IME uses Enter and arrow keys to confirm or select composition candidates.
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    navigateOptions(event.key === 'ArrowDown' ? 'next' : 'prev')
  } else if (event.key === 'Enter') {
    event.preventDefault()
    handleSelect(filteredOptions.value[activeIndex.value])
  }
}

const handleSelect = async (item) => {
  if (!item?.path || selecting.value) return
  const revision = ++navigationRevision
  selecting.value = true
  searchError.value = ''
  try {
    const failure = await router.push(item.path)
    if (revision !== navigationRevision) return
    if (!failure || isNavigationFailure(failure, NavigationFailureType.duplicated)) {
      visible.value = false
    }
  } catch (error) {
    if (revision !== navigationRevision) return
    logger.warn('菜单搜索导航失败:', error)
    searchError.value = '无法打开菜单，请重试'
  } finally {
    if (revision === navigationRevision) selecting.value = false
  }
}

const handleGlobalKeydown = (e) => {
  if (!e.isComposing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    openSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  navigationRevision++
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

:global(.el-dialog.search-dialog) {
  --app-dialog-content-min-height: 0px;
  border-radius: var(--theme-dialog-radius, var(--radius-lg));
  overflow: hidden;
  box-shadow: var(--theme-dialog-shadow, var(--shadow-lg));
}

:global(.search-dialog .el-dialog__header) {
  display: none;
}

:global(.search-dialog .el-dialog__body) {
  display: flex;
  flex-direction: column;
  padding: 0;
  max-height: 80vh;
}

:global(.search-dialog .app-dialog-form-body) {
  display: flex;
  flex-direction: column;
}

.search-input-wrapper {
  flex-shrink: 0;
  padding: 16px;
  border-bottom: 1px solid var(--color-border-lighter);
}

:deep(.el-input) {
  --el-input-bg-color: var(--color-bg-hover);
}

.search-results {
  min-height: 0;
  max-height: min(400px, calc(70dvh - 136px));
  overflow-y: auto;
  padding: 8px;
}

.search-error {
  margin: 8px 16px;
  color: var(--color-danger, var(--el-color-danger));
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
  font-size: var(--font-size-base, 14px);
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 4px;
}

.item-path {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary);
  display: flex;
  flex-wrap: wrap;
  overflow-wrap: anywhere;
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
  flex-shrink: 0;
  padding: 8px 16px;
  background-color: var(--color-bg-hover);
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  border-top: 1px solid var(--color-border-lighter);
}

.key-hint {
  display: flex;
  align-items: center;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary);
  gap: 6px;
}

.key {
  background-color: var(--color-bg-base);
  padding: 2px 6px;
  border-radius: var(--shell-radius-sm, var(--radius-sm));
  box-shadow: var(--shadow-xs, none);
  font-family: var(--font-ui);
  min-width: 16px;
  text-align: center;
}
</style>
