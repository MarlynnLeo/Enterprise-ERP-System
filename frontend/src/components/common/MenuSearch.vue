<template>
  <div class="menu-search">
    <el-tooltip content="搜索菜单 (Ctrl+K)" placement="bottom" :show-after="500">
      <div class="search-trigger" @click="openSearch">
        <el-icon><Search /></el-icon>
      </div>
    </el-tooltip>

    <el-dialog
      v-model="visible"
      :show-close="false"
      class="search-dialog"
      width="600px"
      append-to-body
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

      <div class="search-results" v-if="keyword">
        <div v-if="filteredOptions.length === 0" class="no-results">
          <el-empty description="未找到相关菜单" :image-size="60" />
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
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePermissionStore } from '../../stores/permissionStore'
import { 
  Search, Menu, ArrowRight, Right
} from '@element-plus/icons-vue'

const router = useRouter()
const permissionStore = usePermissionStore()

const visible = ref(false)
const keyword = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)

// 从后端动态菜单树（permissionStore.menuTree）自动生成扁平化搜索列表
// 不再需要手动维护硬编码菜单，新增菜单后搜索自动生效
const menuOptions = computed(() => {
  const options = []
  
  const flattenMenuTree = (items, parentBreadcrumbs = []) => {
    if (!Array.isArray(items)) return
    
    items.forEach(item => {
      // 跳过按钮权限（type=2）和无名称的项
      if (item.type === 2 || !item.name) return
      
      const currentBreadcrumbs = [...parentBreadcrumbs, item.name]
      
      // 有 path 且是叶子菜单（无子菜单或子菜单都是按钮）才加入搜索
      const visibleChildren = (item.children || []).filter(c => c.type !== 2 && c.name)
      
      if (item.path && visibleChildren.length === 0) {
        options.push({
          path: item.path,
          title: item.name,
          breadcrumbs: currentBreadcrumbs,
          icon: item.icon ? mapIconName(item.icon) : null
        })
      }
      
      // 递归处理子菜单
      if (visibleChildren.length > 0) {
        flattenMenuTree(visibleChildren, currentBreadcrumbs)
      }
    })
  }
  
  flattenMenuTree(permissionStore.menuTree)
  return options
})

// 图标名称转换（后端 icon-xxx 格式 → Element Plus 组件名）
const mapIconName = (iconStr) => {
  if (!iconStr) return null
  // 'icon-data-analysis' → 'DataAnalysis'
  return iconStr.replace(/^icon-/, '').split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

// 过滤选项 — 支持菜单名称、路径、面包屑多维匹配
const filteredOptions = computed(() => {
  if (!keyword.value) return []
  const k = keyword.value.toLowerCase()
  return menuOptions.value.filter(item => 
    item.title.toLowerCase().includes(k) ||
    item.path.toLowerCase().includes(k) ||
    item.breadcrumbs.some(b => b.toLowerCase().includes(k))
  ).slice(0, 15) // 最多显示15条
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
  
  // 滚动到可见区域
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

// 快捷键支持
onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

const handleGlobalKeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    openSearch()
  }
}
</script>

<style scoped>
.search-trigger {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 8px;
  color: var(--el-text-color-regular);
  transition: all 0.3s;
  margin-right: 12px;
}

.search-trigger:hover {
  background-color: var(--el-fill-color-light);
  color: var(--tech-primary);
}

.search-icon {
  font-size: 20px;
}

:deep(.search-dialog) {
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  
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
  border-bottom: 1px solid var(--el-border-color-lighter);
}

:deep(.el-input__wrapper) {
  background-color: var(--el-fill-color-light);
  box-shadow: none !important;
  border-radius: 8px;
  
  &.is-focus {
    background-color: var(--el-bg-color);
    box-shadow: 0 0 0 2px var(--tech-primary) !important;
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
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover, &.active {
    background-color: var(--el-fill-color);
  }
  
  &.active {
    .item-title {
      color: var(--tech-primary);
    }
    .item-action {
      opacity: 1;
    }
  }
}

.item-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 12px;
  color: var(--el-text-color-regular);
  font-size: 16px;
}

.item-content {
  flex: 1;
  overflow: hidden;
}

.item-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.item-path {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
}

.separator {
  margin: 0 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}

.item-action {
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--el-text-color-secondary);
}

.search-footer {
  padding: 8px 16px;
  background-color: var(--el-fill-color-light);
  display: flex;
  gap: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.key-hint {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  gap: 6px;
}

.key {
  background-color: var(--el-bg-color);
  padding: 2px 6px;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  font-family: monospace;
  min-width: 16px;
  text-align: center;
}
</style>
