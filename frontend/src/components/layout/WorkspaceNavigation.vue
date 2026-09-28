<template>
  <aside
    ref="navigationRoot"
    tabindex="-1"
    class="workspace-navigation"
    :class="{ 'is-collapsed': collapsed, 'is-mobile': mobile }"
    :aria-label="t('workspaceNavigation.navigation')"
  >
    <div class="workspace-rail">
      <div class="workspace-rail__brand" title="KACON ERP">
        <img src="../../assets/logo.svg" alt="KACON" />
      </div>
      <nav class="workspace-rail__modules" :aria-label="t('workspaceNavigation.modules')">
        <button
          v-for="item in modules"
          :key="item.menu.menuIndex"
          type="button"
          class="workspace-module"
          :class="{ 'is-selected': selectedModule?.menuIndex === item.menu.menuIndex }"
          :aria-pressed="selectedModule?.menuIndex === item.menu.menuIndex"
          :title="item.label"
          @click="selectModule(item.menu)"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </button>
      </nav>
      <span class="workspace-rail__footer" aria-hidden="true">ERP</span>
    </div>

    <div class="workspace-panel">
      <div class="workspace-panel__brand">
        <div><strong>{{ t('workspaceNavigation.title') }}</strong><span>KACON ERP</span></div>
        <button
          v-if="mobile"
          type="button"
          class="workspace-panel__close"
          :aria-label="t('workspaceNavigation.close')"
          @click="$emit('close')"
        ><el-icon><Close /></el-icon></button>
      </div>
      <div class="workspace-panel__section">
        <h2 class="workspace-panel__title">{{ selectedLabel }}</h2>
        <span>{{ t('workspaceNavigation.itemCount', { count: leafCount }) }}</span>
      </div>
      <label class="workspace-filter">
        <el-icon><Search /></el-icon>
        <input v-model="filter" type="search" :placeholder="t('workspaceNavigation.filterPlaceholder')" :aria-label="t('workspaceNavigation.filterLabel')" />
      </label>
      <nav class="workspace-panel__menu" :aria-label="selectedLabel">
        <SidebarMenu
          v-if="visibleMenus.length"
          :menus="visibleMenus"
          :active-path="activePath"
          :open-chain="openChain"
          :multiple="Boolean(filter.trim())"
          @navigate="$emit('navigate', $event)"
        />
        <p v-else class="workspace-panel__empty">{{ filter.trim() ? t('workspaceNavigation.noMatches') : t('workspaceNavigation.noMenus') }}</p>
      </nav>
    </div>
  </aside>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Close, Grid, Search } from '@element-plus/icons-vue'
import { usePermissionStore } from '@/stores/permissionStore'
import { getIconComponent } from '@/utils/menuIcons'
import { getMenuLabel } from '@/utils/menuLabels'
import { resolveMenuNavigationState } from '@/utils/menuTree'
import SidebarMenu from './SidebarMenu.vue'

defineProps({
  collapsed: { type: Boolean, default: false },
  mobile: { type: Boolean, default: false }
})
const emit = defineEmits(['navigate', 'expand', 'close'])
const route = useRoute()
const { t } = useI18n()
const permissionStore = usePermissionStore()
const filter = ref('')
const navigationRoot = ref(null)
const selectedIndex = ref('')
const menus = computed(() => permissionStore.preparedMenuTree)
const modules = computed(() => menus.value.map((menu) => ({
  menu,
  label: getMenuLabel(menu, t),
  icon: menu.icon ? getIconComponent(menu.icon) : Grid
})))
const selectedModule = computed(() => menus.value.find((menu) => menu.menuIndex === selectedIndex.value))
const selectedLabel = computed(() => selectedModule.value ? getMenuLabel(selectedModule.value, t) : t('workspaceNavigation.modules'))
const moduleMenus = computed(() => {
  const menu = selectedModule.value
  return menu ? (menu.hasChildren ? menu.children : [menu]) : []
})
const countLeaves = (nodes) => nodes.reduce((count, node) => count + (node.hasChildren ? countLeaves(node.children) : 1), 0)
const leafCount = computed(() => countLeaves(moduleMenus.value))
const navigation = computed(() => resolveMenuNavigationState(moduleMenus.value, route.fullPath))
const activePath = computed(() => navigation.value.activePath)
const filterNodes = (nodes, keyword) => nodes.flatMap((node) => {
  if (getMenuLabel(node, t)?.toLocaleLowerCase().includes(keyword)) return [node]
  if (!node.hasChildren) return []
  const children = filterNodes(node.children, keyword)
  return children.length ? [{ ...node, children }] : []
})
const visibleMenus = computed(() => {
  const keyword = filter.value.trim().toLocaleLowerCase()
  return keyword ? filterNodes(moduleMenus.value, keyword) : moduleMenus.value
})
const openChain = computed(() => {
  if (!filter.value.trim()) return navigation.value.openeds
  const indexes = []
  const collect = (nodes) => nodes.forEach((node) => {
    if (node.hasChildren) {
      indexes.push(node.menuIndex)
      collect(node.children)
    }
  })
  collect(visibleMenus.value)
  return indexes
})

// Synchronize to successful navigation, including search, tabs and browser history.
watch([menus, () => route.fullPath], () => {
  const focusedElement = document.activeElement
  const ownedFocus = navigationRoot.value?.contains(focusedElement)
  let bestMatch
  let score = -1
  for (const menu of menus.value) {
    const state = resolveMenuNavigationState([menu], route.fullPath)
    if (state.score > score) {
      score = state.score
      bestMatch = menu
    }
  }
  selectedIndex.value = bestMatch?.menuIndex || (
    menus.value.some((menu) => menu.menuIndex === selectedIndex.value)
      ? selectedIndex.value
      : menus.value[0]?.menuIndex || ''
  )
  filter.value = ''
  if (ownedFocus) nextTick(() => {
    const root = navigationRoot.value
    if (!root || root.closest('[inert]') || focusedElement.isConnected || document.activeElement !== document.body) return
    const destination = root.querySelector('.workspace-module.is-selected') || root.querySelector('button') || root
    destination.focus()
  })
}, { immediate: true })

const selectModule = (menu) => {
  selectedIndex.value = menu.menuIndex
  filter.value = ''
  emit('expand')
  if (!menu.hasChildren && menu.path) emit('navigate', menu.path)
}
</script>
