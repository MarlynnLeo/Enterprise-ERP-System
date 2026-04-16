<!--
/**
 * Report.vue
 * @description 搴撳瓨鎶ヨ〃椤甸潰 鈥?灞曠ず搴撳瓨姹囨€汇€佸垎甯冦€佷环鍊笺€侀璀︾瓑澶氱淮搴︽姤琛? * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="report-page">
    <NavBar title="搴撳瓨鎶ヨ〃" left-arrow @click-left="router.back()" />

    <div class="content-wrapper">
      <!-- 缁熻姒傝 -->
      <div class="stats-banner">
        <div class="stat-item">
          <span class="stat-num">{{ statistics.totalItems }}</span>
          <span class="stat-label">鐗╂枡绉嶇被</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num accent">{{ formatMoney(statistics.totalValue) }}</span>
          <span class="stat-label">搴撳瓨鎬诲€?/span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num success">{{ statistics.totalLocations }}</span>
          <span class="stat-label">浠撳簱鏁?/span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num warn">{{ statistics.lowStock }}</span>
          <span class="stat-label">浣庡簱瀛?/span>
        </div>
      </div>

      <!-- 鎼滅储鏍?-->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="鎼滅储鐗╂枡鍚嶇О/缂栫爜"
          @search="onSearch"
          @clear="onSearch"
        />
      </div>

      <!-- 妯悜婊戝姩绛涢€夋爣绛?-->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="(tab, index) in reportTabs"
            :key="tab.value"
            class="filter-chip"
            :class="{ active: activeTab === index }"
            @click="switchTab(index)"
          >
            <SvgIcon :name="tab.icon" size="0.875rem" />
            <span class="chip-text">{{ tab.label }}</span>
            <span v-if="getTabCount(tab.value)" class="chip-badge">{{
              getTabCount(tab.value)
            }}</span>
          </div>
        </div>
      </div>

      <!-- 鎶ヨ〃鍒楄〃 -->
      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="娌℃湁鏇村鏁版嵁浜?
          @load="onLoad"
        >
          <div v-if="reportList.length === 0 && !loading" class="empty-state">
            <Empty description="鏆傛棤鎶ヨ〃鏁版嵁" />
          </div>

          <!-- 姹囨€绘姤琛ㄥ崱鐗?-->
          <template v-if="currentReportType === 'summary'">
            <div v-for="item in reportList" :key="item.id" class="report-card">
              <div class="card-accent" :class="getStockLevel(item)"></div>
              <div class="card-body">
                <div class="card-header">
                  <div class="title-area">
                    <span class="item-title">{{ item.materialName }}</span>
                    <span class="item-code">{{ item.materialCode }}</span>
                  </div>
                  <span class="qty-badge" :class="getStockLevel(item)">
                    {{ item.quantity }} {{ item.unitName || '' }}
                  </span>
                </div>
                <div class="item-spec" v-if="item.specification">{{ item.specification }}</div>
                <div class="detail-grid">
                  <div class="detail-item">
                    <span class="detail-label">鍒嗙被</span>
                    <span class="detail-value">{{ item.categoryName || '鈥? }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">鍗曚环</span>
                    <span class="detail-value">楼{{ formatNum(item.unitPrice) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">搴撳瓨鎬诲€?/span>
                    <span class="detail-value highlight">楼{{ formatNum(item.totalValue) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">瀹夊叏搴撳瓨</span>
                    <span
                      class="detail-value"
                      :class="{ 'text-warn': item.quantity < item.safetyStock }"
                    >
                      {{ item.safetyStock || '鈥? }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 鍒嗗竷鎶ヨ〃鍗＄墖 -->
          <template v-if="currentReportType === 'location'">
            <div v-for="(item, idx) in reportList" :key="idx" class="report-card">
              <div class="card-accent accent-blue"></div>
              <div class="card-body">
                <div class="card-header">
                  <div class="title-area">
                    <span class="item-title">{{ item.materialName }}</span>
                    <span class="item-code">{{ item.materialCode }}</span>
                  </div>
                  <span class="qty-badge accent-blue"
                    >{{ item.quantity }} {{ item.unitName || '' }}</span
                  >
                </div>
                <div class="detail-grid">
                  <div class="detail-item">
                    <span class="detail-label">浠撳簱</span>
                    <span class="detail-value">{{ item.locationName || '鈥? }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">搴撳瓨浠峰€?/span>
                    <span class="detail-value highlight">楼{{ formatNum(item.totalValue) }}</span>
                  </div>
                  <div class="detail-item" v-if="item.lastMoveDate">
                    <span class="detail-label">鏈€鍚庡彉鍔?/span>
                    <span class="detail-value">{{ item.lastMoveDate }}</span>
                  </div>
                  <div class="detail-item" v-if="item.specification">
                    <span class="detail-label">瑙勬牸</span>
                    <span class="detail-value">{{ item.specification }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 浠峰€兼姤琛ㄥ崱鐗?-->
          <template v-if="currentReportType === 'value'">
            <div v-for="item in reportList" :key="item.id" class="report-card">
              <div class="card-accent accent-green"></div>
              <div class="card-body">
                <div class="card-header">
                  <span class="item-title">{{ item.categoryName || '鏈垎绫? }}</span>
                  <span class="qty-badge accent-green">{{ formatNum(item.valuePercent) }}%</span>
                </div>
                <div class="detail-grid">
                  <div class="detail-item">
                    <span class="detail-label">鐗╂枡鏁?/span>
                    <span class="detail-value">{{ item.materialCount }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">鎬绘暟閲?/span>
                    <span class="detail-value">{{ formatNum(item.totalQuantity) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">鎬讳环鍊?/span>
                    <span class="detail-value highlight">楼{{ formatNum(item.totalValue) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">鍧囦环</span>
                    <span class="detail-value">楼{{ formatNum(item.averagePrice) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 棰勮鎶ヨ〃鍗＄墖 -->
          <template v-if="currentReportType === 'warning'">
            <div v-for="item in reportList" :key="item.id" class="report-card">
              <div class="card-accent accent-red"></div>
              <div class="card-body">
                <div class="card-header">
                  <div class="title-area">
                    <span class="item-title">{{ item.materialName }}</span>
                    <span class="item-code">{{ item.materialCode }}</span>
                  </div>
                  <span class="status-tag" :class="getWarningClass(item)">
                    {{ item.stockStatus || getWarningText(item) }}
                  </span>
                </div>
                <div class="detail-grid">
                  <div class="detail-item">
                    <span class="detail-label">褰撳墠搴撳瓨</span>
                    <span class="detail-value text-warn">{{
                      item.currentQuantity || item.quantity || 0
                    }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">瀹夊叏搴撳瓨</span>
                    <span class="detail-value">{{ item.safetyStock || item.minStock || '鈥? }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">缂哄彛鏁伴噺</span>
                    <span class="detail-value text-warn">{{
                      item.shortage ||
                      Math.max(
                        0,
                        (item.safetyStock || 0) - (item.currentQuantity || item.quantity || 0)
                      )
                    }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">鍒嗙被</span>
                    <span class="detail-value">{{ item.categoryName || '鈥? }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </List>
      </PullRefresh>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Search, Icon, Empty, PullRefresh, List, showToast } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { inventoryApi } from '@/services/api'

  const router = useRouter()
  const searchValue = ref('')
  const refreshing = ref(false)
  const loading = ref(false)
  const finished = ref(false)
  const reportList = ref([])
  const activeTab = ref(0)

  // 缁熻鏁版嵁
  const statistics = reactive({
    totalItems: 0,
    totalValue: 0,
    totalLocations: 0,
    lowStock: 0
  })

  // 鎶ヨ〃绫诲瀷鏍囩锛堝惈鍥炬爣 鈥?涓庣敓浜т换鍔￠〉闈㈢粺涓€椋庢牸锛?  const reportTabs = [
    { label: '姹囨€?, value: 'summary', icon: 'apps' },
    { label: '鍒嗗竷', value: 'location', icon: 'clipboard-check' },
    { label: '浠峰€?, value: 'value', icon: 'badge-check' },
    { label: '棰勮', value: 'warning', icon: 'shield' }
  ]

  // 鑾峰彇鏍囩璁℃暟
  const getTabCount = (value) => {
    if (value === 'summary') return statistics.totalItems
    if (value === 'location') return statistics.totalLocations
    if (value === 'value') return ''
    if (value === 'warning') return statistics.lowStock
    return ''
  }

  const currentReportType = computed(() => reportTabs[activeTab.value].value)

  // 鍒嗛〉鍙傛暟
  const pagination = reactive({
    page: 1,
    pageSize: 20,
    total: 0
  })

  // 鏍煎紡鍖栨暟瀛?  const formatNum = (val) => {
    if (val === null || val === undefined) return '0'
    const num = Number(val)
    if (isNaN(num)) return val
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  // 鏍煎紡鍖栭噾棰濓紙绠€鍖栧ぇ鏁版樉绀猴級
  const formatMoney = (val) => {
    const num = Number(val) || 0
    if (num >= 10000) return (num / 10000).toFixed(1) + '涓?
    return formatNum(num)
  }

  // 鑾峰彇搴撳瓨姘村钩鏍峰紡
  const getStockLevel = (item) => {
    if (!item.safetyStock || item.safetyStock <= 0) return 'accent-blue'
    if (item.quantity <= 0) return 'accent-red'
    if (item.quantity < item.safetyStock) return 'accent-yellow'
    return 'accent-green'
  }

  // 鑾峰彇棰勮鏍峰紡
  const getWarningClass = (item) => {
    const qty = item.currentQuantity || item.quantity || 0
    if (qty <= 0) return 'tag-danger'
    return 'tag-warning'
  }

  // 鑾峰彇棰勮鏂囧瓧
  const getWarningText = (item) => {
    const qty = item.currentQuantity || item.quantity || 0
    if (qty <= 0) return '闆跺簱瀛?
    return '浣庡簱瀛?
  }

  // 鎼滅储
  const onSearch = () => {
    resetList()
    loadReport()
  }

  // 鍒囨崲鎶ヨ〃绫诲瀷
  const switchTab = (index) => {
    activeTab.value = index
    resetList()
    loadReport()
  }

  // 涓嬫媺鍒锋柊
  const onRefresh = () => {
    resetList()
    loadReport().finally(() => {
      refreshing.value = false
      showToast('鍒锋柊鎴愬姛')
    })
  }

  // 閲嶇疆鍒楄〃
  const resetList = () => {
    reportList.value = []
    pagination.page = 1
    finished.value = false
  }

  // 鍔犺浇鏇村
  const onLoad = () => {
    loadReport()
  }

  // 鍔犺浇鎶ヨ〃鏁版嵁
  const loadReport = async () => {
    if (loading.value) return

    loading.value = true
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        reportType: currentReportType.value,
        materialName: searchValue.value || undefined
      }

      const response = await inventoryApi.getInventoryReport(params)

      // 瑙ｅ寘鍝嶅簲鏁版嵁
      let responseData = response.data !== undefined ? response.data : response

      // 鎻愬彇鍒楄〃鏁版嵁
      let items = []
      if (responseData.items && Array.isArray(responseData.items)) {
        items = responseData.items
      } else if (responseData.list && Array.isArray(responseData.list)) {
        items = responseData.list
      } else if (Array.isArray(responseData)) {
        items = responseData
      }

      reportList.value = [...reportList.value, ...items]
      pagination.total = responseData.total || items.length

      // 鏇存柊缁熻鏁版嵁
      if (responseData.statistics) {
        Object.assign(statistics, responseData.statistics)
      }

      finished.value = reportList.value.length >= pagination.total || items.length === 0
      pagination.page++
    } catch (error) {
      console.error('鑾峰彇搴撳瓨鎶ヨ〃澶辫触:', error)
      finished.value = true
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    loadReport()
  })
</script>

<style lang="scss" scoped>
  .report-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }

  .content-wrapper {
    padding: 0 12px 12px;
  }

  // ========== 缁熻姒傝 鈥?涓?Tasks.vue 缁熶竴 ==========
  .stats-banner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 8px;
    margin: 8px 0;
    border: 1px solid var(--glass-border);
    box-shadow: none;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;

    .stat-num {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-primary);
      &.accent {
        color: #3b82f6;
      }
      &.success {
        color: #34d399;
      }
      &.warn {
        color: #ef4444;
      }
    }
    .stat-label {
      font-size: 0.6875rem;
      color: var(--text-tertiary);
    }
  }

  .stat-divider {
    width: 1px;
    height: 28px;
    background: var(--glass-border);
  }

  // ========== 鎼滅储 ==========
  .search-section {
    padding: 4px 0;
  }

  // ========== 妯悜婊戝姩绛涢€?鈥?涓?Tasks.vue 瀹屽叏涓€鑷?==========
  .filter-scroll-wrapper {
    padding: 4px 0 8px;
    overflow: hidden;
  }

  .filter-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 2px 0 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  .filter-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--glass-border);
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: all 0.25s ease;
    cursor: pointer;

    .chip-text {
      font-weight: 500;
    }
    .chip-badge {
      min-width: 18px;
      height: 18px;
      line-height: 18px;
      text-align: center;
      font-size: 0.625rem;
      font-weight: 700;
      border-radius: 9px;
      background: var(--glass-border);
      color: var(--text-secondary);
      padding: 0 4px;
    }

    &.active {
      background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
      border-color: var(--color-accent, #3b82f6);
      color: var(--color-accent, #3b82f6);
      .chip-badge {
        background: var(--color-accent, #3b82f6);
        color: #fff;
      }
    }
  }

  // ========== 鎶ヨ〃鍗＄墖鍒楄〃 ==========
  .report-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 12px;
    margin-bottom: 10px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    box-shadow: none;
    transition: all 0.2s ease;
    animation: fadeInUp 0.35s ease-out both;

    &:active {
      transform: scale(0.98);
      box-shadow: none;
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

  // 宸︿晶鑹叉潯
  .card-accent {
    width: 4px;
    flex-shrink: 0;

    &.accent-green {
      background: linear-gradient(180deg, #10b981, #34d399);
    }
    &.accent-red {
      background: linear-gradient(180deg, #ef4444, #f87171);
    }
    &.accent-purple {
      background: linear-gradient(180deg, #a855f7, #c084fc);
    }
    &.accent-yellow {
      background: linear-gradient(180deg, #f59e0b, #fbbf24);
    }
    &.accent-blue {
      background: linear-gradient(180deg, #3b82f6, #60a5fa);
    }
  }

  .card-body {
    flex: 1;
    padding: 12px 14px;
    min-width: 0;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .title-area {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }

  .item-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-code {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    flex-shrink: 0;
  }

  .item-spec {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-bottom: 6px;
  }

  .qty-badge {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.75rem;
    font-weight: 700;
    flex-shrink: 0;
    font-family: 'SF Mono', 'Menlo', monospace;

    &.accent-green {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    &.accent-red {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
    &.accent-yellow {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
    &.accent-blue {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }
  }

  .status-tag {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.625rem;
    font-weight: 700;
    flex-shrink: 0;

    &.tag-danger {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
    &.tag-warning {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
  }

  // 璇︽儏缃戞牸
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--glass-border);
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detail-label {
    font-size: 0.625rem;
    color: var(--text-tertiary);
  }

  .detail-value {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-primary);

    &.highlight {
      color: #3b82f6;
      font-weight: 700;
    }
    &.text-warn {
      color: #ef4444;
      font-weight: 700;
    }
  }

  // ========== 绌虹姸鎬?==========
  .empty-state {
    padding: 60px 0;
  }
</style>
