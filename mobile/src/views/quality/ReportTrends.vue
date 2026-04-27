<template>
  <div class="page-container">
    <NavBar title="质量趋势" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <!-- 分组切换 -->
      <div class="group-tabs">
        <div v-for="g in groups" :key="g.value" class="group-tab" :class="{ active: groupBy === g.value }" @click="switchGroup(g.value)">{{ g.label }}</div>
      </div>

      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <div v-for="(item, i) in trendList" :key="i" class="trend-item">
          <div class="trend-date">{{ item.period }}</div>
          <div class="trend-bar-wrap">
            <div class="trend-bar" :style="{ width: item.percent + '%' }"></div>
          </div>
          <div class="trend-count">{{ item.count }}</div>
        </div>
        <Empty v-if="trendList.length === 0" description="暂无趋势数据" />
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, Loading, Empty } from 'vant'
  import { qualityApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const groupBy = ref('day')
  const trendList = ref([])
  const groups = [
    { label: '按日', value: 'day' },
    { label: '按周', value: 'week' },
    { label: '按月', value: 'month' }
  ]

  const fetchTrend = async () => {
    loading.value = true
    try {
      const res = await qualityApi.getTrendAnalysis({ groupBy: groupBy.value })
      const arr = extractApiData(res)
      const list = Array.isArray(arr) ? arr : []
      const maxCount = Math.max(...list.map(d => d.count || 0), 1)
      trendList.value = list.map(d => ({
        period: d.period || d.date || '--',
        count: d.count || 0,
        percent: Math.round(((d.count || 0) / maxCount) * 100)
      }))
    } catch { trendList.value = [] } finally { loading.value = false }
  }

  const switchGroup = (g) => { groupBy.value = g; fetchTrend() }

  onMounted(fetchTrend)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }

  .group-tabs {
    display: flex; gap: 8px; margin-bottom: 12px;
  }
  .group-tab {
    flex: 1; text-align: center; padding: 8px 0; border-radius: 8px;
    background: var(--van-background); border: 1px solid var(--van-border-color);
    font-size: 0.8125rem; color: var(--text-secondary); transition: all 0.2s;
    &.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
  }

  .trend-item {
    display: flex; align-items: center; gap: 8px; padding: 8px 0;
    border-bottom: 1px solid var(--van-border-color);
  }
  .trend-date { width: 80px; font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0; }
  .trend-bar-wrap { flex: 1; height: 16px; background: rgba(255,255,255,0.05); border-radius: 8px; overflow: hidden; }
  .trend-bar { height: 100%; background: var(--color-primary); border-radius: 8px; transition: width 0.3s; min-width: 4px; }
  .trend-count { width: 40px; text-align: right; font-weight: 600; font-size: 0.8125rem; color: var(--text-primary); }
</style>
