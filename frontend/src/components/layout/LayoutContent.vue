<template>
  <el-main id="workspace-page" class="main-content" :role="tabbed ? 'tabpanel' : undefined" :aria-labelledby="tabbed ? activeTabId : undefined" :aria-label="t('workspaceNavigation.pageContent')" tabindex="-1">
    <router-view />
  </el-main>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { normalizeRoutePath } from '@/utils/menuTree'

defineProps({ tabbed: { type: Boolean, default: false } })
const { t } = useI18n()
const route = useRoute()
const activeTabId = computed(() => `workspace-tab-${encodeURIComponent(normalizeRoutePath(route.path))}`)
</script>

<!-- Keep the route outlet independent of sidebar expansion and dynamic slots.
     Sidebar toggles must not rerender a dense business table;
     RouterView still reacts to navigation and children to their own stores. -->
