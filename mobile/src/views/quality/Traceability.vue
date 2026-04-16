<!--
/**
 * Traceability.vue
 * @description 质量追溯管理 — 批次列表页面
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="traceability-page">
    <NavBar title="追溯管理" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <VanIcon name="search" size="18" @click="showSearchPanel = !showSearchPanel" />
      </template>
    </NavBar>

    <div class="content-wrapper">
      <!-- 搜索面板 -->
      <div v-if="showSearchPanel" class="search-section">
        <Search
          v-model="searchKeyword"
          placeholder="搜索物料编码或批次号..."
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 类型筛选标签 -->
      <div class="filter-section">
        <div class="filter-tabs">
          <div
            v-for="tab in filterTabs"
            :key="tab.value"
            class="filter-tab"
            :class="{ active: activeFilter === tab.value }"
            @click="activeFilter = tab.value"
          >
            <span class="tab-icon">{{ tab.icon }}</span>
            <span class="tab-label">{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <!-- 批次列表 -->
      <div class="batch-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <!-- 空状态 -->
          <Empty v-if="filteredBatches.length === 0 && !loading" description="暂无追溯记录" />

          <!-- 批次卡片 -->
          <div
            v-for="(batch, index) in filteredBatches"
            :key="batch.batch_number + '-' + index"
            class="batch-card"
            @click="viewBatchDetail(batch)"
          >
            <!-- 卡片头部 -->
            <div class="card-header">
              <div
                class="batch-type-indicator"
                :class="batch.type === 'product' ? 'type-product' : 'type-material'"
              >
                {{ batch.type === 'product' ? '成品' : '原料' }}
              </div>
              <div class="batch-time">{{ formatDate(batch.created_at) }}</div>
            </div>

            <!-- 卡片主体 -->
            <div class="card-body">
              <div class="material-code-row">
                <span class="material-icon">{{ batch.type === 'product' ? '🏭' : '📦' }}</span>
                <span class="material-code">{{ batch.material_code }}</span>
              </div>
              <div class="batch-number-row">
                <span class="label">批次号</span>
                <span class="value">{{ batch.batch_number }}</span>
              </div>
            </div>

            <!-- 卡片底部：操作提示 -->
            <div class="card-footer">
              <span class="trace-hint">
                <VanIcon name="guide-o" size="14" />
                点击查看追溯链路
              </span>
              <VanIcon name="arrow" size="14" color="var(--text-tertiary)" />
            </div>
          </div>

          <!-- 加载提示 -->
          <div v-if="loading" class="loading-more">
            <Loading type="spinner" size="20" color="var(--color-accent)">加载中...</Loading>
          </div>
        </PullRefresh>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Icon as VanIcon,
    Search,
    PullRefresh,
    Empty,
    Loading,
    showToast
  } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  // 响应式数据
  const batches = ref([])
  const loading = ref(false)
  const refreshing = ref(false)
  const searchKeyword = ref('')
  const activeFilter = ref('all')
  const showSearchPanel = ref(false)

  // 筛选标签配置
  const filterTabs = ref([
    { label: '全部', value: 'all', icon: '📋' },
    { label: '原料', value: 'material', icon: '📦' },
    { label: '成品', value: 'product', icon: '🏭' }
  ])

  // 按类型筛选后的批次列表
  const filteredBatches = computed(() => {
    let result = batches.value

    // 按类型筛选
    if (activeFilter.value !== 'all') {
      result = result.filter((b) => b.type === activeFilter.value)
    }

    // 按搜索关键字筛选
    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase()
      result = result.filter(
        (b) =>
          (b.material_code || '').toLowerCase().includes(kw) ||
          (b.batch_number || '').toLowerCase().includes(kw)
      )
    }

    return result
  })

  // 格式化日期
  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }

  // 加载批次数据
  const loadBatches = async () => {
    if (loading.value) return
    loading.value = true

    try {
      const params = { limit: 50 }
      const response = await qualityApi.getTraceabilityRecords(params)

      // 解析响应
      let data = []
      const responseData = response.data || response

      if (responseData.data && Array.isArray(responseData.data)) {
        data = responseData.data
      } else if (Array.isArray(responseData)) {
        data = responseData
      } else if (responseData.list && Array.isArray(responseData.list)) {
        data = responseData.list
      } else if (responseData.data && responseData.data.list) {
        data = responseData.data.list
      }

      batches.value = data
    } catch (error) {
      console.error('加载追溯批次失败:', error)
      showToast('加载失败，请重试')
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  // 下拉刷新
  const onRefresh = () => {
    refreshing.value = true
    loadBatches()
  }

  // 搜索
  const handleSearch = () => {
    // 前端过滤已通过 computed 实现
  }

  const handleClear = () => {
    searchKeyword.value = ''
  }

  // 查看批次详情 — 跳转到追溯详情页
  const viewBatchDetail = (batch) => {
    router.push({
      path: '/quality/traceability/detail',
      query: {
        materialCode: batch.material_code,
        batchNumber: batch.batch_number,
        type: batch.type
      }
    })
  }

  onMounted(() => {
    loadBatches()
  })
</script>

<style lang="scss" scoped>
  .traceability-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }

  .content-wrapper {
    padding: 0 12px 12px;
  }

  // 搜索区域
  .search-section {
    padding: 8px 0;
    animation: slideDown 0.2s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  // 筛选标签
  .filter-section {
    padding: 8px 0 4px;

    .filter-tabs {
      display: flex;
      gap: 8px;

      .filter-tab {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 10px 0;
        border-radius: 10px;
        background: var(--bg-secondary);
        border: 1.5px solid var(--van-border-color);
        font-size: 0.8125rem;
        color: var(--text-secondary);
        transition: all 0.25s ease;
        cursor: pointer;

        .tab-icon {
          font-size: 0.875rem;
        }

        .tab-label {
          font-weight: 500;
        }

        &.active {
          background: var(--color-primary-bg);
          border-color: var(--color-primary);
          color: var(--color-primary);
          font-weight: 600;
        }
      }
    }
  }

  // 批次列表
  .batch-list {
    padding-top: 8px;
  }

  // 批次卡片
  .batch-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    border: 1px solid var(--van-border-color);
    margin-bottom: 10px;
    overflow: hidden;
    box-shadow: none;
    transition: all 0.2s ease;
    animation: fadeInUp 0.35s ease-out both;

    &:active {
      transform: scale(0.98);
      box-shadow: none;
    }

    // 渐进动画
    @for $i from 1 through 20 {
      &:nth-child(#{$i}) {
        animation-delay: #{$i * 0.04}s;
      }
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  // 卡片头部
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px 0;
  }

  .batch-type-indicator {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.5px;

    &.type-product {
      background: rgba(103, 193, 217, 0.15);
      color: #4ba8c0;
    }

    &.type-material {
      background: rgba(245, 158, 11, 0.12);
      color: #d97706;
    }
  }

  .batch-time {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  // 卡片主体
  .card-body {
    padding: 10px 14px;
  }

  .material-code-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .material-icon {
      font-size: 1.5rem;
      line-height: 1;
    }

    .material-code {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-primary);
      word-break: break-all;
    }
  }

  .batch-number-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bg-primary);
    border-radius: 8px;

    .label {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      flex-shrink: 0;
    }

    .value {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      font-family: 'SF Mono', 'Menlo', monospace;
      word-break: break-all;
    }
  }

  // 卡片底部
  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    border-top: 1px solid var(--van-border-color);

    .trace-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }
  }

  // 加载更多
  .loading-more {
    display: flex;
    justify-content: center;
    padding: 20px 0;
  }
</style>
