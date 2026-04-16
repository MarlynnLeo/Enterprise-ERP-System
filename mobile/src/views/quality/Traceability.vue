<!--
/**
 * Traceability.vue
 * @description 璐ㄩ噺杩芥函绠＄悊 鈥?鎵规鍒楄〃椤甸潰
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="traceability-page">
    <NavBar title="杩芥函绠＄悊" left-arrow @click-left="$router.go(-1)">
      <template #right>
        <VanIcon name="search" size="18" @click="showSearchPanel = !showSearchPanel" />
      </template>
    </NavBar>

    <div class="content-wrapper">
      <!-- 鎼滅储闈㈡澘 -->
      <div v-if="showSearchPanel" class="search-section">
        <Search
          v-model="searchKeyword"
          placeholder="鎼滅储鐗╂枡缂栫爜鎴栨壒娆″彿..."
          @search="handleSearch"
          @clear="handleClear"
        />
      </div>

      <!-- 绫诲瀷绛涢€夋爣绛?-->
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

      <!-- 鎵规鍒楄〃 -->
      <div class="batch-list">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <!-- 绌虹姸鎬?-->
          <Empty v-if="filteredBatches.length === 0 && !loading" description="鏆傛棤杩芥函璁板綍" />

          <!-- 鎵规鍗＄墖 -->
          <div
            v-for="(batch, index) in filteredBatches"
            :key="batch.batch_number + '-' + index"
            class="batch-card"
            @click="viewBatchDetail(batch)"
          >
            <!-- 鍗＄墖澶撮儴 -->
            <div class="card-header">
              <div
                class="batch-type-indicator"
                :class="batch.type === 'product' ? 'type-product' : 'type-material'"
              >
                {{ batch.type === 'product' ? '鎴愬搧' : '鍘熸枡' }}
              </div>
              <div class="batch-time">{{ formatDate(batch.created_at) }}</div>
            </div>

            <!-- 鍗＄墖涓讳綋 -->
            <div class="card-body">
              <div class="material-code-row">
                <span class="material-icon">{{ batch.type === 'product' ? '馃彮' : '馃摝' }}</span>
                <span class="material-code">{{ batch.material_code }}</span>
              </div>
              <div class="batch-number-row">
                <span class="label">鎵规鍙?/span>
                <span class="value">{{ batch.batch_number }}</span>
              </div>
            </div>

            <!-- 鍗＄墖搴曢儴锛氭搷浣滄彁绀?-->
            <div class="card-footer">
              <span class="trace-hint">
                <VanIcon name="guide-o" size="14" />
                鐐瑰嚮鏌ョ湅杩芥函閾捐矾
              </span>
              <VanIcon name="arrow" size="14" color="var(--text-tertiary)" />
            </div>
          </div>

          <!-- 鍔犺浇鎻愮ず -->
          <div v-if="loading" class="loading-more">
            <Loading type="spinner" size="20" color="var(--color-accent)">鍔犺浇涓?..</Loading>
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
    Icon,
    Search,
    PullRefresh,
    Empty,
    Loading,
    showToast,
    Icon as VanIcon
  } from 'vant'
  import { qualityApi } from '@/services/api'

  const router = useRouter()

  // 鍝嶅簲寮忔暟鎹?  const batches = ref([])
  const loading = ref(false)
  const refreshing = ref(false)
  const searchKeyword = ref('')
  const activeFilter = ref('all')
  const showSearchPanel = ref(false)

  // 绛涢€夋爣绛鹃厤缃?  const filterTabs = ref([
    { label: '鍏ㄩ儴', value: 'all', icon: '馃搵' },
    { label: '鍘熸枡', value: 'material', icon: '馃摝' },
    { label: '鎴愬搧', value: 'product', icon: '馃彮' }
  ])

  // 鎸夌被鍨嬬瓫閫夊悗鐨勬壒娆″垪琛?  const filteredBatches = computed(() => {
    let result = batches.value

    // 鎸夌被鍨嬬瓫閫?    if (activeFilter.value !== 'all') {
      result = result.filter((b) => b.type === activeFilter.value)
    }

    // 鎸夋悳绱㈠叧閿瓧绛涢€?    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase()
      result = result.filter(
        (b) =>
          (b.material_code || '').toLowerCase().includes(kw) ||
          (b.batch_number || '').toLowerCase().includes(kw)
      )
    }

    return result
  })

  // 鏍煎紡鍖栨棩鏈?  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return '浠婂ぉ'
    if (diffDays === 1) return '鏄ㄥぉ'
    if (diffDays < 7) return `${diffDays}澶╁墠`
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }

  // 鍔犺浇鎵规鏁版嵁
  const loadBatches = async () => {
    if (loading.value) return
    loading.value = true

    try {
      const params = { limit: 50 }
      const response = await qualityApi.getTraceabilityRecords(params)

      // 瑙ｆ瀽鍝嶅簲
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
      console.error('鍔犺浇杩芥函鎵规澶辫触:', error)
      showToast('鍔犺浇澶辫触锛岃閲嶈瘯')
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  // 涓嬫媺鍒锋柊
  const onRefresh = () => {
    refreshing.value = true
    loadBatches()
  }

  // 鎼滅储
  const handleSearch = () => {
    // 鍓嶇杩囨护宸查€氳繃 computed 瀹炵幇
  }

  const handleClear = () => {
    searchKeyword.value = ''
  }

  // 鏌ョ湅鎵规璇︽儏 鈥?璺宠浆鍒拌拷婧鎯呴〉
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

  // 鎼滅储鍖哄煙
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

  // 绛涢€夋爣绛?  .filter-section {
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
        border: 1.5px solid var(--glass-border);
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
          background: var(--color-accent-bg);
          border-color: var(--color-accent);
          color: var(--color-accent);
          font-weight: 600;
        }
      }
    }
  }

  // 鎵规鍒楄〃
  .batch-list {
    padding-top: 8px;
  }

  // 鎵规鍗＄墖
  .batch-card {
    background: var(--bg-secondary);
    border-radius: 12px;
    border: 1px solid var(--glass-border);
    margin-bottom: 10px;
    overflow: hidden;
    box-shadow: none;
    transition: all 0.2s ease;
    animation: fadeInUp 0.35s ease-out both;

    &:active {
      transform: scale(0.98);
      box-shadow: none;
    }

    // 娓愭鍔ㄧ敾
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

  // 鍗＄墖澶撮儴
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

  // 鍗＄墖涓讳綋
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

  // 鍗＄墖搴曢儴
  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 14px;
    border-top: 1px solid var(--glass-border);
    background: rgba(0, 0, 0, 0.01);

    .trace-hint {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.75rem;
      color: var(--text-tertiary);
    }
  }

  // 鍔犺浇鏇村
  .loading-more {
    display: flex;
    justify-content: center;
    padding: 20px 0;
  }
</style>
