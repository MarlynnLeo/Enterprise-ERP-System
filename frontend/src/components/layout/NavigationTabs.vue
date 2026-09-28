<template>
  <nav v-if="tabs.length" class="navigation-tabs" :aria-label="t('navigationTabs.openPages')">
    <button v-show="hasOverflow" class="navigation-tabs__scroll" type="button" :aria-label="t('navigationTabs.scrollLeft')" :disabled="!canScrollLeft" @click="scrollTabs(-1)">
      <el-icon><ArrowLeft /></el-icon>
    </button>
    <div ref="viewport" class="navigation-tabs__viewport" @wheel="handleWheel" @scroll.passive="updateScrollState">
      <div ref="tabList" class="navigation-tabs__list" role="tablist" :aria-label="t('navigationTabs.pageTabs')" @keydown="handleKeydown">
        <div
          v-for="tab in displayTabs"
          :key="tab.path"
          class="navigation-tabs__item"
          :class="{ 'is-active': tab.path === activePath, 'is-pinned': tab.pinned }"
          role="presentation"
        >
          <button
            :id="tabId(tab.path)"
            class="navigation-tabs__tab"
            type="button"
            role="tab"
            :data-path="tab.path"
            :aria-selected="tab.path === activePath"
            :aria-controls="tab.path === activePath ? 'workspace-page' : undefined"
            :aria-keyshortcuts="canClose(tab) ? 'Delete' : undefined"
            :tabindex="tab.path === activePath ? 0 : -1"
            :title="tab.title"
            @click="navigate(tab)"
          >
            <el-icon v-if="tab.pinned" class="navigation-tabs__home"><House /></el-icon>
            <span class="navigation-tabs__label">{{ tab.title }}</span>
          </button>
          <button
            v-if="canClose(tab)"
            class="navigation-tabs__close"
            type="button"
            tabindex="-1"
            :disabled="pendingClose"
            :aria-label="t('navigationTabs.closeTab', { title: tab.title })"
            :title="t('navigationTabs.closeTab', { title: tab.title })"
            @click="closePage(tab.path)"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>
      </div>
    </div>
    <button v-show="hasOverflow" class="navigation-tabs__scroll" type="button" :aria-label="t('navigationTabs.scrollRight')" :disabled="!canScrollRight" @click="scrollTabs(1)">
      <el-icon><ArrowRight /></el-icon>
    </button>
    <button
      class="navigation-tabs__others"
      type="button"
      :disabled="pendingClose || !hasOtherTabs"
      :aria-label="t('navigationTabs.closeOthers')"
      :title="t('navigationTabs.keepCurrentAndHome')"
      @click="closeOtherPages"
    ><el-icon><FolderDelete /></el-icon></button>
  </nav>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, ArrowRight, Close, FolderDelete, House } from '@element-plus/icons-vue'
import { useAuthStore } from '../../stores/auth'
import { usePermissionStore } from '../../stores/permissionStore'
import { useNavigationTabs } from '../../composables/useNavigationTabs'
import { getNavigationTabTitle } from '../../utils/navigationTabLabels'

const router = useRouter()
const auth = useAuthStore()
const permissions = usePermissionStore()
const { t } = useI18n()
const viewport = ref(null)
const tabList = ref(null)
const hasOverflow = ref(false)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let resizeObserver
const { tabs, activePath, pendingClose, canClose, navigate, closeTab, closeOtherTabs } = useNavigationTabs({ router, auth })
const tabId = (path) => `workspace-tab-${encodeURIComponent(path)}`
const menuByPath = computed(() => {
  const index = new Map()
  const visit = (items) => {
    for (const item of items || []) {
      if (item.path) index.set(item.path, item)
      visit(item.children)
    }
  }
  visit(permissions.preparedMenuTree)
  return index
})
const queryMenus = computed(() => [...menuByPath.value.keys()]
  .filter((path) => path.includes('?'))
  .map((path) => ({ path })))
const titleForTab = (tab) => getNavigationTabTitle(tab, {
  router, menuByPath: menuByPath.value, queryMenus: queryMenus.value, t
})
const displayTabs = computed(() => tabs.value.map((tab) => ({ ...tab, title: titleForTab(tab) })))
const hasOtherTabs = computed(() => tabs.value.some((tab) => !tab.pinned && tab.path !== activePath.value))

const updateScrollState = () => {
  const container = viewport.value
  if (!container) return
  const remaining = container.scrollWidth - container.clientWidth
  hasOverflow.value = remaining > 1
  canScrollLeft.value = container.scrollLeft > 1
  canScrollRight.value = container.scrollLeft < remaining - 1
}
const revealActiveTab = async () => {
  await nextTick()
  const container = viewport.value
  const active = container?.querySelector('.navigation-tabs__item.is-active')
  if (!container || !active) return
  const containerRect = container.getBoundingClientRect()
  const activeRect = active.getBoundingClientRect()
  if (activeRect.left < containerRect.left) container.scrollLeft -= containerRect.left - activeRect.left
  else if (activeRect.right > containerRect.right) container.scrollLeft += activeRect.right - containerRect.right
  updateScrollState()
}
watch(() => [activePath.value, displayTabs.value.map((tab) => tab.title)], revealActiveTab, { immediate: true })
const observeLayout = () => {
  resizeObserver?.disconnect()
  if (viewport.value) resizeObserver?.observe(viewport.value)
  if (tabList.value) resizeObserver?.observe(tabList.value)
  revealActiveTab()
}
watch([viewport, tabList], observeLayout, { flush: 'post' })
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(revealActiveTab)
  observeLayout()
  window.addEventListener('resize', revealActiveTab, { passive: true })
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', revealActiveTab)
})

const scrollTabs = (direction) => {
  const container = viewport.value
  if (container) container.scrollLeft += direction * Math.max(container.clientWidth * 0.65, 160)
}
const handleWheel = (event) => {
  const container = viewport.value
  if (!container || container.scrollWidth <= container.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  const before = container.scrollLeft
  container.scrollLeft += event.deltaY
  if (container.scrollLeft !== before) event.preventDefault()
}
const closePage = async (path) => {
  const focusedElement = document.activeElement
  const focusedTab = focusedElement?.closest('.navigation-tabs__item')?.querySelector('[role="tab"]')
  const restoreFocus = focusedTab?.dataset.path === path
  const closed = await closeTab(path)
  await nextTick()
  if (restoreFocus && (document.activeElement === focusedElement || document.activeElement === document.body)) {
    const destination = closed ? viewport.value?.querySelector('[aria-selected="true"]') : focusedTab
    destination?.focus()
  }
}
const closeOtherPages = async (event) => {
  const button = event.currentTarget
  const restoreFocus = document.activeElement === button
  closeOtherTabs()
  await nextTick()
  if (restoreFocus && (document.activeElement === button || document.activeElement === document.body)) {
    viewport.value?.querySelector('[aria-selected="true"]')?.focus()
  }
}
const handleKeydown = async (event) => {
  if (event.target.getAttribute('role') !== 'tab') return
  const buttons = [...event.currentTarget.querySelectorAll('[role="tab"]')]
  const index = buttons.indexOf(event.target)
  let destination
  if (event.key === 'ArrowRight') destination = buttons[(index + 1) % buttons.length]
  else if (event.key === 'ArrowLeft') destination = buttons[(index - 1 + buttons.length) % buttons.length]
  else if (event.key === 'Home') destination = buttons[0]
  else if (event.key === 'End') destination = buttons.at(-1)
  else if (event.key === 'Delete') {
    event.preventDefault()
    await closePage(event.target.dataset.path)
  }
  if (destination) {
    event.preventDefault()
    destination.focus()
  }
}
</script>

<style scoped>
.navigation-tabs {
  display: flex;
  flex: 1 1 0;
  align-items: center;
  min-width: 0;
  height: 36px;
  gap: 4px;
  color: var(--color-text-regular);
}
.navigation-tabs button {
  appearance: none;
  border: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: transparent;
}
.navigation-tabs button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.navigation-tabs__viewport { flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; container-type: inline-size; }
.navigation-tabs__viewport::-webkit-scrollbar { display: none; }
.navigation-tabs__list { display: flex; width: max-content; gap: 4px; }
.navigation-tabs__item {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100cqi;
  border-radius: var(--shell-radius-sm, 6px);
  background: var(--shell-control-bg, var(--color-bg-base));
  border: 1px solid var(--shell-control-border, var(--color-border-base));
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}
.navigation-tabs__item:hover {
  background: var(--shell-control-hover-bg, var(--color-bg-hover));
  border-color: var(--color-border-dark, var(--shell-control-border));
}
.navigation-tabs__item.is-active {
  color: var(--shell-accent, var(--color-primary));
  background: var(--color-bg-base);
  border-color: color-mix(in srgb, var(--shell-accent, var(--color-primary)) 40%, var(--color-border-base));
  box-shadow: inset 0 -2px var(--shell-accent, var(--color-primary));
}
.navigation-tabs__tab { display: flex; align-items: center; min-width: 0; gap: 6px; padding: 0 10px; height: 34px; border-radius: inherit; }
.navigation-tabs__label { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-sm); line-height: 1.5; }
.is-active .navigation-tabs__label { font-weight: 600; }
.navigation-tabs__home { flex: 0 0 auto; font-size: 14px; }
.navigation-tabs .navigation-tabs__close { display: grid; place-items: center; flex: none; width: 22px; height: 22px; margin-right: 5px; border-radius: 5px; font-size: 12px; }
.navigation-tabs .navigation-tabs__close:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
.navigation-tabs .navigation-tabs__scroll { display: grid; place-items: center; flex: 0 0 24px; width: 24px; height: 29px; border-radius: 5px; font-size: 12px; }
.navigation-tabs .navigation-tabs__scroll:hover, .navigation-tabs .navigation-tabs__others:hover:not(:disabled) { background: var(--color-bg-hover); }
.navigation-tabs .navigation-tabs__others { display: flex; align-items: center; justify-content: center; gap: 5px; flex: 0 0 auto; padding: 6px; border-radius: 5px; font-size: 12px; white-space: nowrap; }
.navigation-tabs__others > .el-icon { font-size: 16px; }
.navigation-tabs .el-icon { color: inherit !important; }
.navigation-tabs button:disabled { opacity: 0.45; cursor: default; }
@media (max-width: 768px) {
  .navigation-tabs { gap: 2px; }
  .navigation-tabs .navigation-tabs__scroll { display: none; }
  .navigation-tabs .navigation-tabs__others { padding-inline: 4px; }
  .navigation-tabs__label { max-width: 110px; font-size: var(--font-size-xs); }
  .navigation-tabs__tab { padding-inline: 7px; }
}
</style>
