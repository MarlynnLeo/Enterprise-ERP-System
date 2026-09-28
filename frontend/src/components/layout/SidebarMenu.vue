<template>
  <!--
    A single flat list is intentional. The previous recursive v-if tree
    destroyed and recreated every descendant on each click. We keep branches
    that have been opened in the DOM and only toggle their `hidden` state;
    repeat expand/collapse operations therefore reuse the same VNodes.
  -->
  <ul class="app-menu-list" role="menu" data-sidebar-performance="2" @keydown="handleKeydown">
    <li
      v-for="item in renderedItems"
      :key="item.key"
      v-memo="[item.menu, item.open, item.active, item.activePath, item.visible, item.label, item.icon, mini]"
      class="app-menu-node"
      :class="{
        'is-branch': item.menu.hasChildren,
        'is-opened': item.menu.hasChildren && item.open,
        'is-active': item.active
      }"
      :data-depth="item.depth"
      :data-menu-index="item.menu.menuIndex"
      :hidden="!item.visible"
      :aria-hidden="item.visible ? undefined : 'true'"
      role="none"
    >
      <button
        v-if="item.menu.hasChildren"
        type="button"
        class="app-menu-item app-menu-title"
        :class="{ 'is-opened': item.open, 'is-active-path': item.activePath }"
        role="menuitem"
        :aria-level="item.depth + 1"
        :aria-expanded="item.open ? 'true' : 'false'"
        :tabindex="item.visible ? 0 : -1"
        :title="mini ? item.label : undefined"
        @click.stop="toggleMenu(item)"
      >
        <el-icon v-if="item.icon" class="app-menu-icon"><component :is="item.icon" /></el-icon>
        <span class="app-menu-label">{{ item.label }}</span>
        <el-icon class="app-menu-arrow"><component :is="arrowIcon" /></el-icon>
      </button>

      <button
        v-else-if="item.menu.path"
        type="button"
        class="app-menu-item app-menu-link"
        :class="{ 'is-active': item.active }"
        role="menuitem"
        :aria-level="item.depth + 1"
        :aria-current="item.active ? 'page' : undefined"
        :tabindex="item.visible ? 0 : -1"
        :title="mini ? item.label : undefined"
        @click.stop="navigate(item.menu.path)"
      >
        <el-icon v-if="item.icon" class="app-menu-icon"><component :is="item.icon" /></el-icon>
        <span class="app-menu-label">{{ item.label }}</span>
      </button>
    </li>
  </ul>
</template>

<script setup>
import { computed, nextTick, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { getIconComponent } from '../../utils/menuIcons'
import { isRouteMatch } from '../../utils/menuTree'
import { getMenuLabel } from '../../utils/menuLabels'

defineOptions({ name: 'SidebarMenu' })

const props = defineProps({
  menus: { type: Array, default: () => [] },
  openChain: { type: Array, default: () => [] },
  activePath: { type: String, default: '' },
  mini: { type: Boolean, default: false },
  multiple: { type: Boolean, default: false }
})

const emit = defineEmits(['expand', 'navigate'])
const { t } = useI18n()

const arrowIcon = getIconComponent('icon-arrow-right')
const mountedBranches = shallowRef(new Set())
// Branch clicks belong to this component. Updating Layout's state here used
// to invalidate its Element Plus slots and update the current business page.
const localOpenChain = shallowRef([])

const openSet = computed(() => new Set(localOpenChain.value))

const branchIndexes = computed(() => {
  const indexes = new Set()
  const walk = (nodes) => {
    for (const menu of nodes || []) {
      if (!menu.hasChildren) continue
      walk(menu.children)
      if (
        (menu.path && isRouteMatch(menu.path, props.activePath)) ||
        menu.children.some((child) => {
          if (child.path && isRouteMatch(child.path, props.activePath)) return true
          return child.hasChildren && indexes.has(child.menuIndex)
        })
      ) {
        indexes.add(menu.menuIndex)
      }
    }
  }
  walk(props.menus)
  return indexes
})

const allBranchIndexes = computed(() => {
  const indexes = new Set()
  const walk = (nodes) => {
    for (const menu of nodes || []) {
      if (!menu.hasChildren) continue
      indexes.add(menu.menuIndex)
      walk(menu.children)
    }
  }
  walk(props.menus)
  return indexes
})

const syncMountedBranches = (chain = localOpenChain.value) => {
  const validIndexes = allBranchIndexes.value
  const next = new Set(
    [...mountedBranches.value].filter((index) => validIndexes.has(index))
  )
  for (const index of chain || []) {
    if (validIndexes.has(index)) next.add(index)
  }
  if (next.size !== mountedBranches.value.size || [...next].some((index) => !mountedBranches.value.has(index))) {
    mountedBranches.value = next
  }
}

watch(
  () => [props.menus, props.openChain],
  () => {
    localOpenChain.value = props.openChain.filter((index) => allBranchIndexes.value.has(index))
    syncMountedBranches()
  },
  { immediate: true }
)

// Translate labels and resolve icons only when menu data or locale changes,
// not on every expand/collapse or sidebar-width change.
const indexedItems = computed(() => {
  const items = []
  const walk = (nodes, depth, parentChain) => {
    for (const menu of nodes || []) {
      items.push({
        key: `${menu.menuIndex}:${menu.id ?? depth}`,
        menu,
        depth,
        parentChain,
        label: getMenuLabel(menu, t),
        icon: menu.icon ? getIconComponent(menu.icon) : null
      })
      if (menu.hasChildren) {
        walk(menu.children, depth + 1, parentChain.concat(menu.menuIndex))
      }
    }
  }
  walk(props.menus, 0, [])
  return items
})

const renderedItems = computed(() => {
  const opened = openSet.value
  const mounted = mountedBranches.value
  const activeBranches = branchIndexes.value
  return indexedItems.value
    .filter((item) => item.parentChain.every((index) => mounted.has(index)))
    .map((item) => ({
      ...item,
      open: item.menu.hasChildren && opened.has(item.menu.menuIndex),
      active: Boolean(item.menu.path && item.menu.path === props.activePath),
      activePath: item.menu.hasChildren && activeBranches.has(item.menu.menuIndex),
      visible: (!props.mini || item.depth === 0) && item.parentChain.every((index) => opened.has(index))
    }))
})

const toggleMenu = (item) => {
  const position = localOpenChain.value.indexOf(item.menu.menuIndex)
  if (props.multiple) {
    const descendants = new Set(indexedItems.value
      .filter((child) => child.parentChain.includes(item.menu.menuIndex))
      .map((child) => child.menu.menuIndex))
    localOpenChain.value = position >= 0 && !props.mini
      ? localOpenChain.value.filter((index) => index !== item.menu.menuIndex && !descendants.has(index))
      : [...new Set([...localOpenChain.value, ...item.parentChain, item.menu.menuIndex])]
  } else {
    localOpenChain.value = position >= 0 && !props.mini
      ? localOpenChain.value.slice(0, position)
      : [...item.parentChain, item.menu.menuIndex]
  }
  syncMountedBranches()
  if (props.mini) emit('expand')
}

const navigate = (path) => {
  if (path) emit('navigate', path)
}

const handleKeydown = async (event) => {
  const button = event.target.closest('[role="menuitem"]')
  if (!button) return
  const container = event.currentTarget
  const visibleButtons = () => [...container.querySelectorAll('[role="menuitem"]')]
    .filter((item) => !item.closest('.app-menu-node').hidden)
  const buttons = visibleButtons()
  const position = buttons.indexOf(button)
  if (position < 0) return
  const menuIndex = button.closest('.app-menu-node').dataset.menuIndex
  const item = renderedItems.value.find((entry) => entry.menu.menuIndex === menuIndex)
  let destination
  if (event.key === 'ArrowDown') destination = buttons[(position + 1) % buttons.length]
  else if (event.key === 'ArrowUp') destination = buttons[(position - 1 + buttons.length) % buttons.length]
  else if (event.key === 'Home') destination = buttons[0]
  else if (event.key === 'End') destination = buttons.at(-1)
  else if (event.key === 'ArrowRight' && item?.menu.hasChildren) {
    event.preventDefault()
    if (!item.open || props.mini) toggleMenu(item)
    await nextTick()
    destination = visibleButtons()[position + 1]
  } else if (event.key === 'ArrowLeft' && item) {
    event.preventDefault()
    if (item.menu.hasChildren && item.open && !props.mini) toggleMenu(item)
    else {
      destination = buttons.find((entry) => entry.closest('.app-menu-node').dataset.menuIndex === item.parentChain.at(-1))
    }
  }
  if (destination) {
    event.preventDefault()
    destination.focus()
  }
}
</script>
