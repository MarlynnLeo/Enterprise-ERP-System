<!--
/**
 * Report.vue
 * @description 库存报表页面 — 展示库存汇总、分布、价值、预警等多维度报表
 * @date 2026-04-15
 * @version 1.0.0
 */
-->
<template>
  <div class="report-page">
    <NavBar title="库存报表" left-arrow @click-left="router.back()" />

    <div class="content-wrapper">
      <!-- 统计概览 -->
      <div class="stats-banner">
        <div class="stat-item">
          <span class="stat-num">{{ statistics.totalItems }}</span>
          <span class="stat-label">物料种类</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num accent">￥{{ formatMoney(statistics.totalValue) }}</span>
          <span class="stat-label">库存总值</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num success">{{ statistics.totalLocations }}</span>
          <span class="stat-label">仓库数</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num warn">{{ statistics.lowStock }}</span>
          <span class="stat-label">低库存</span>
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="搜索物料名称/编码"
          @search="onSearch"
          @clear="onSearch"
        />
      </div>

      <!-- 横向滑动筛选标签 -->
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

      <!-- 报表列表 -->
      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多数据了"
          @load="onLoad"
        >
          <div v-if="reportList.length === 0 && !loading" class="empty-state">
            <Empty description="暂无报表数据" />
          </div>

          <!-- 汇总报表卡片 -->
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
                    <span class="detail-label">分类</span>
                    <span class="detail-value">{{ item.categoryName || '-' }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">单价</span>
                    <span class="detail-value">￥{{ formatNum(item.unitPrice) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">库存总值</span>
                    <span class="detail-value highlight">￥{{ formatNum(item.totalValue) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">安全库存</span>
                    <span
                      class="detail-value"
                      :class="{ 'text-warn': item.quantity < item.safetyStock }"
                    >
                      {{ item.safetyStock || '-' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 分布报表卡片 -->
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
                    <span class="detail-label">仓库</span>
                    <span class="detail-value">{{ item.locationName || '-' }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">库存价值</span>
                    <span class="detail-value highlight">￥{{ formatNum(item.totalValue) }}</span>
                  </div>
                  <div class="detail-item" v-if="item.lastMoveDate">
                    <span class="detail-label">最后变动</span>
                    <span class="detail-value">{{ item.lastMoveDate }}</span>
                  </div>
                  <div class="detail-item" v-if="item.specification">
                    <span class="detail-label">规格</span>
                    <span class="detail-value">{{ item.specification }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 价值报表卡片 -->
          <template v-if="currentReportType === 'value'">
            <div v-for="item in reportList" :key="item.id" class="report-card">
              <div class="card-accent accent-green"></div>
              <div class="card-body">
                <div class="card-header">
                  <span class="item-title">{{ item.categoryName || '未分类' }}</span>
                  <span class="qty-badge accent-green">{{ formatNum(item.valuePercent) }}%</span>
                </div>
                <div class="detail-grid">
                  <div class="detail-item">
                    <span class="detail-label">物料数</span>
                    <span class="detail-value">{{ item.materialCount }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">总数量</span>
                    <span class="detail-value">{{ formatNum(item.totalQuantity) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">总价值</span>
                    <span class="detail-value highlight">￥{{ formatNum(item.totalValue) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">均价</span>
                    <span class="detail-value">￥{{ formatNum(item.averagePrice) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 预警报表卡片 -->
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
                    <span class="detail-label">当前库存</span>
                    <span class="detail-value text-warn">{{
                      item.currentQuantity || item.quantity || 0
                    }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">安全库存</span>
                    <span class="detail-value">{{ item.safetyStock || item.minStock || '-' }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">缺口数量</span>
                    <span class="detail-value text-warn">{{
                      item.shortage ||
                      Math.max(
                        0,
                        (item.safetyStock || 0) - (item.currentQuantity || item.quantity || 0)
                      )
                    }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">分类</span>
                    <span class="detail-value">{{ item.categoryName || '-' }}</span>
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

  // 统计数据
  const statistics = reactive({
    totalItems: 0,
    totalValue: 0,
    totalLocations: 0,
    lowStock: 0
  })

  // 报表类型标签
  const reportTabs = [
    { label: '汇总', value: 'summary', icon: 'apps' },
    { label: '分布', value: 'location', icon: 'clipboard-check' },
    { label: '价值', value: 'value', icon: 'badge-check' },
    { label: '预警', value: 'warning', icon: 'shield' }
  ]

  // 获取标签计数
  const getTabCount = (value) => {
    if (value === 'summary') return statistics.totalItems
    if (value === 'location') return statistics.totalLocations
    if (value === 'value') return ''
    if (value === 'warning') return statistics.lowStock
    return ''
  }

  const currentReportType = computed(() => reportTabs[activeTab.value].value)

  // 分页参数
  const pagination = reactive({
    page: 1,
    pageSize: 20,
    total: 0
  })

  // 格式化数字
  const formatNum = (val) => {
    if (val === null || val === undefined) return '0'
    const num = Number(val)
    if (isNaN(num)) return val
    return num.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  // 格式化金额
  const formatMoney = (val) => {
    const num = Number(val) || 0
    if (num >= 10000) return (num / 10000).toFixed(1) + '万'
    return formatNum(num)
  }

  // 获取库存水平样式
  const getStockLevel = (item) => {
    if (!item.safetyStock || item.safetyStock <= 0) return 'accent-blue'
    if (item.quantity <= 0) return 'accent-red'
    if (item.quantity < item.safetyStock) return 'accent-yellow'
    return 'accent-green'
  }

  // 获取预警样式
  const getWarningClass = (item) => {
    const qty = item.currentQuantity || item.quantity || 0
    if (qty <= 0) return 'tag-danger'
    return 'tag-warning'
  }

  // 获取预警文字
  const getWarningText = (item) => {
    const qty = item.currentQuantity || item.quantity || 0
    if (qty <= 0) return '零库存'
    return '低库存'
  }

  // 搜索
  const onSearch = () => {
    resetList()
    loadReport()
  }

  // 切换报表类型
  const switchTab = (index) => {
    activeTab.value = index
    resetList()
    loadReport()
  }

  // 下拉刷新
  const onRefresh = () => {
    resetList()
    loadReport().finally(() => {
      refreshing.value = false
      showToast('刷新成功')
    })
  }

  // 重置列表
  const resetList = () => {
    reportList.value = []
    pagination.page = 1
    finished.value = false
  }

  // 加载更多
  const onLoad = () => {
    loadReport()
  }

  // 加载报表数据
  const loadReport = async () => {
    loading.value = true
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.pageSize,
        reportType: currentReportType.value,
        materialName: searchValue.value || undefined
      }

      const response = await inventoryApi.getInventoryReport(params)

      // 解包响应数据
      let responseData = response.data !== undefined ? response.data : response

      // 提取列表数据
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

      // 更新统计数据
      if (responseData.statistics) {
        Object.assign(statistics, responseData.statistics)
      }

      finished.value = reportList.value.length >= pagination.total || items.length === 0
      pagination.page++
    } catch (error) {
      console.error('获取库存报表失败:', error)
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

  // ========== 统计概览 ==========
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
        color: var(--color-primary);
      }
      &.success {
        color: #34d399;
      }
      &.warn {
        color: var(--color-danger);
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

  // ========== 搜索 ==========
  .search-section {
    padding: 4px 0;
  }

  // ========== 横向滑动筛选 ==========
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
      border-color: var(--color-accent, var(--color-primary));
      color: var(--color-accent, var(--color-primary));
      .chip-badge {
        background: var(--color-accent, var(--color-primary));
        color: var(--text-primary);
      }
    }
  }

  // ========== 报表卡片列表 ==========
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

  // 左侧色条
  .card-accent {
    width: 4px;
    flex-shrink: 0;

    &.accent-green {
      background: linear-gradient(180deg, var(--color-success), #34d399);
    }
    &.accent-red {
      background: linear-gradient(180deg, var(--color-danger), var(--color-danger));
    }
    &.accent-purple {
      background: linear-gradient(180deg, #a855f7, #c084fc);
    }
    &.accent-yellow {
      background: linear-gradient(180deg, var(--color-warning), var(--color-warning));
    }
    &.accent-blue {
      background: linear-gradient(180deg, var(--color-primary), #60a5fa);
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
      color: var(--color-success);
    }
    &.accent-red {
      background: rgba(239, 68, 68, 0.12);
      color: var(--color-danger);
    }
    &.accent-yellow {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
    &.accent-blue {
      background: rgba(59, 130, 246, 0.12);
      color: var(--color-primary);
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
      color: var(--color-danger);
    }
    &.tag-warning {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
  }

  // 详情网格
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
      color: var(--color-primary);
      font-weight: 700;
    }
    &.text-warn {
      color: var(--color-danger);
      font-weight: 700;
    }
  }

  // ========== 空状态 ==========
  .empty-state {
    padding: 60px 0;
  }
</style>
