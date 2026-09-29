<template>
  <component :is="isClassic ? ClassicDashboardLayout : SharedDashboardLayout" />
</template>

<script setup>
import { computed, inject, nextTick, watch } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { DASHBOARD_CONTEXT } from '../dashboardContext'
import ClassicDashboardLayout from './ClassicDashboardLayout.vue'
import SharedDashboardLayout from './SharedDashboardLayout.vue'

const themeStore = useThemeStore()
const { refreshDashboardCharts } = inject(DASHBOARD_CONTEXT)
const isClassic = computed(() => themeStore.appearance.preset === 'workspace')

watch(isClassic, async () => {
  await nextTick()
  await refreshDashboardCharts()
})
</script>
