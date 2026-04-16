<!--
/**
 * Transaction.vue
 * @description 搴撳瓨娴佹按鎶ヨ〃椤甸潰 鈥?涓庤皟鎷ㄥ垪琛ㄧ粺涓€椋庢牸
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <div class="transaction-page">
    <NavBar title="搴撳瓨娴佹按" left-arrow @click-left="router.back()" />

    <div class="content-wrapper">
      <!-- 缁熻姒傝 -->
      <div class="stats-banner">
        <div class="stat-item">
          <span class="stat-num">{{ statistics.totalTransactions }}</span>
          <span class="stat-label">鎬绘祦姘?/span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num in">{{ statistics.inboundCount }}</span>
          <span class="stat-label">鍏ュ簱</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num out">{{ statistics.outboundCount }}</span>
          <span class="stat-label">鍑哄簱</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num transfer">{{ statistics.transferCount }}</span>
          <span class="stat-label">璋冩嫧</span>
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
            v-for="tab in typeTabs"
            :key="tab.value"
            class="filter-chip"
            :class="{ active: activeType === tab.value }"
            @click="switchType(tab.value)"
          >
            <SvgIcon :name="tab.icon" size="0.875rem" />
            <span class="chip-text">{{ tab.label }}</span>
            <span v-if="getChipCount(tab.value)" class="chip-badge">{{
              getChipCount(tab.value)
            }}</span>
          </div>
        </div>
      </div>

      <!-- 娴佹按鍒楄〃 -->
      <div class="list-area">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <Empty v-if="transactionList.length === 0 && !loading" description="鏆傛棤娴佹按璁板綍" />

          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="娌℃湁鏇村浜?
            @load="onLoad"
          >
            <div
              v-for="(item, index) in transactionList"
              :key="item.id"
              class="order-card"
              :style="{ animationDelay: `${index * 0.03}s` }"
            >
              <div class="card-accent" :class="getAccentClass(item.transactionType)"></div>
              <div class="card-body">
                <!-- 绗竴琛? 浜ゆ槗绫诲瀷 + 鏁伴噺 -->
                <div class="card-top">
                  <div class="code-area">
                    <div class="type-icon" :class="getAccentClass(item.transactionType)">
                      <Icon :name="getTypeIcon(item.transactionType)" size="14" />
                    </div>
                    <span class="type-text">{{
                      item.transactionTypeText || item.transactionType
                    }}</span>
                  </div>
                  <span class="tx-qty" :class="getQtyClass(item.transactionType)">
                    {{ getQtyPrefix(item.transactionType) }}{{ Math.abs(item.quantity) }}
                  </span>
                </div>

                <!-- 绗簩琛? 鐗╂枡淇℃伅 -->
                <div class="order-title">
                  {{ item.materialName || '鈥? }}
                  <span class="mat-code">{{ item.materialCode || '' }}</span>
                </div>

                <!-- 绗笁琛? 璇︾粏淇℃伅 -->
                <div class="card-meta">
                  <span class="meta-item" v-if="item.locationName">
                    <Icon name="location-o" size="12" /> {{ item.locationName }}
                  </span>
                  <span class="meta-item mono" v-if="item.transactionNo || item.referenceNo">
                    {{ item.transactionNo || item.referenceNo }}
                  </span>
                </div>

                <!-- 绗洓琛? 鍙樺姩鍓嶅悗 + 搴曢儴 -->
                <div
                  class="card-bottom"
                  v-if="item.beforeQuantity !== null && item.beforeQuantity !== undefined"
                >
                  <div class="qty-change">
                    <span class="change-before">{{ item.beforeQuantity }}</span>
                    <Icon name="arrow" size="10" color="var(--text-tertiary)" />
                    <span class="change-after">{{ item.afterQuantity }}</span>
                  </div>
                  <div class="bottom-info">
                    <span class="meta-item" v-if="item.operator">{{ item.operator }}</span>
                    <span class="meta-item mono">{{ item.transactionTime || '' }}</span>
                  </div>
                </div>
                <div class="card-bottom" v-else>
                  <div></div>
                  <div class="bottom-info">
                    <span class="meta-item" v-if="item.operator">{{ item.operator }}</span>
                    <span class="meta-item mono">{{ item.transactionTime || '' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { NavBar, Search, Icon, Empty, PullRefresh, List, showToast } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { inventoryApi } from '@/services/api'

  const router = useRouter()
  const searchValue = ref('')
  const refreshing = ref(false)
  const loading = ref(false)
  const finished = ref(false)
  const transactionList = ref([])
  const activeType = ref('')

  // 缁熻鏁版嵁
  const statistics = reactive({
    totalTransactions: 0,
    inboundCount: 0,
    outboundCount: 0,
    transferCount: 0,
    checkCount: 0
  })

  // 绫诲瀷绛涢€夋爣绛撅紙鍚浘鏍囷級
  const typeTabs = [
    { label: '鍏ㄩ儴', value: '', icon: 'apps' },
    { label: '鍏ュ簱', value: 'inbound', icon: 'badge-check' },
    { label: '鍑哄簱', value: 'outbound', icon: 'shield' },
    { label: '璋冩嫧', value: 'transfer', icon: 'cog' },
    { label: '鐩樼偣', value: 'check', icon: 'clipboard-check' }
  ]

  // 鍒嗛〉鍙傛暟
  const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

  // 鍏ュ簱绫诲瀷闆嗗悎
  const inboundTypes = [
    'inbound',
    'in',
    'purchase_inbound',
    'production_inbound',
    'outsourced_inbound',
    'sales_return',
    'purchase_return',
    'sales_exchange_return',
    'adjustment_in',
    'manual_in',
    'other_inbound',
    'production_return'
  ]

  // 鍑哄簱绫诲瀷闆嗗悎
  const outboundTypes = [
    'outbound',
    'out',
    'sales_outbound',
    'production_outbound',
    'outsourced_outbound',
    'sale',
    'sales_exchange_out',
    'adjustment_out',
    'manual_out',
    'other_outbound'
  ]

  // 璋冩嫧绫诲瀷闆嗗悎
  const transferTypes = ['transfer', 'transfer_in', 'transfer_out']

  // 鑾峰彇绛涢€夋爣绛捐鏁?  const getChipCount = (type) => {
    if (!type) return statistics.totalTransactions
    if (type === 'inbound') return statistics.inboundCount
    if (type === 'outbound') return statistics.outboundCount
    if (type === 'transfer') return statistics.transferCount
    if (type === 'check') return statistics.checkCount
    return 0
  }

  // 鑾峰彇鑹叉潯棰滆壊绫诲悕
  const getAccentClass = (type) => {
    if (inboundTypes.includes(type)) return 'accent-green'
    if (outboundTypes.includes(type)) return 'accent-red'
    if (transferTypes.includes(type)) return 'accent-purple'
    if (type === 'check') return 'accent-yellow'
    return 'accent-blue'
  }

  // 鑾峰彇绫诲瀷鍥炬爣
  const getTypeIcon = (type) => {
    if (inboundTypes.includes(type)) return 'down'
    if (outboundTypes.includes(type)) return 'upgrade'
    if (transferTypes.includes(type)) return 'exchange'
    if (type === 'check') return 'todo-list-o'
    return 'orders-o'
  }

  // 鑾峰彇鏁伴噺鏄剧ず鍓嶇紑
  const getQtyPrefix = (type) => {
    if (inboundTypes.includes(type)) return '+'
    if (outboundTypes.includes(type)) return '-'
    return ''
  }

  // 鑾峰彇鏁伴噺鏄剧ず鏍峰紡绫?  const getQtyClass = (type) => {
    if (inboundTypes.includes(type)) return 'qty-in'
    if (outboundTypes.includes(type)) return 'qty-out'
    return 'qty-neutral'
  }

  // 鎼滅储
  const onSearch = () => {
    resetAndLoad()
  }
  const switchType = (v) => {
    activeType.value = v
    resetAndLoad()
  }
  const onRefresh = () => {
    refreshing.value = true
    resetAndLoad()
  }
  const onLoad = () => loadTransactions()
  const resetAndLoad = () => {
    transactionList.value = []
    pagination.page = 1
    finished.value = false
    loadTransactions()
  }

  // 鍔犺浇娴佹按璁板綍
  const loadTransactions = async () => {
    if (loading.value) return
    loading.value = true
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        materialName: searchValue.value || undefined,
        transactionType: activeType.value || undefined
      }
      const response = await inventoryApi.getTransactionList(params)
      let responseData = response.data !== undefined ? response.data : response
      let items =
        responseData.items || responseData.list || (Array.isArray(responseData) ? responseData : [])

      const ids = new Set(transactionList.value.map((i) => i.id))
      transactionList.value.push(...items.filter((i) => !ids.has(i.id)))
      pagination.total = responseData.total || items.length

      if (responseData.statistics) Object.assign(statistics, responseData.statistics)

      finished.value = transactionList.value.length >= pagination.total || items.length === 0
      pagination.page++
    } catch (error) {
      console.error('鑾峰彇搴撳瓨娴佹按澶辫触:', error)
      finished.value = true
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  onMounted(() => loadTransactions())
</script>

<style lang="scss" scoped>
  .transaction-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }
  .content-wrapper {
    padding: 0 12px 12px;
  }

  // ========== 缁熻姒傝 ==========
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
      &.in {
        color: #34d399;
      }
      &.out {
        color: #f87171;
      }
      &.transfer {
        color: #c084fc;
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

  // ========== 妯悜婊戝姩绛涢€?==========
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
      background: rgba(59, 130, 246, 0.1);
      border-color: #3b82f6;
      color: #3b82f6;
      .chip-badge {
        background: #3b82f6;
        color: #fff;
      }
    }
  }

  // ========== 娴佹按鍗＄墖 ==========
  .list-area {
    padding-top: 4px;
  }

  .order-card {
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

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .code-area {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .type-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    &.accent-green {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    &.accent-red {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
    &.accent-purple {
      background: rgba(168, 85, 247, 0.12);
      color: #a855f7;
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

  .type-text {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .tx-qty {
    font-size: 1rem;
    font-weight: 800;
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    flex-shrink: 0;
    &.qty-in {
      color: #10b981;
    }
    &.qty-out {
      color: #ef4444;
    }
    &.qty-neutral {
      color: var(--text-primary);
    }
  }

  .order-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    .mat-code {
      font-size: 0.6875rem;
      color: var(--text-tertiary);
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
      margin-left: 6px;
    }
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    &.mono {
      font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    }
  }

  .card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--glass-border);
  }

  .qty-change {
    display: flex;
    align-items: center;
    gap: 4px;
    .change-before {
      font-size: 0.75rem;
      color: var(--text-tertiary);
      font-family: 'SF Mono', 'Menlo', monospace;
    }
    .change-after {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-primary);
      font-family: 'SF Mono', 'Menlo', monospace;
    }
  }

  .bottom-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
</style>
