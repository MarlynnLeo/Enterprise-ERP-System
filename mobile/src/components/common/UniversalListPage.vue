<!--
/**
 * UniversalListPage.vue - 通用列表页面组件
 * @description 根据配置自动渲染列表页面 — 统一卡片风格
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <div class="universal-page">
    <NavBar
      :title="config.title || listTitle || $route.meta?.title || '数据列表'"
      left-arrow
      @click-left="goBack"
    >
      <template #right>
        <span v-if="showAdd" @click="handleAdd" v-permission="addPermission">
          <SvgIcon name="plus" size="1.125rem" />
        </span>
      </template>
    </NavBar>

    <div class="page-body">
      <!-- 统计概览 — 横排统计条 -->
      <div class="stats-banner" v-if="statsData && statsData.length > 0">
        <template v-for="(stat, idx) in statsData" :key="stat.label">
          <div class="stat-item">
            <span class="stat-num" :class="stat.iconClass">{{ stat.value }}</span>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
          <div v-if="idx < statsData.length - 1" class="stat-divider"></div>
        </template>
      </div>

      <!-- 搜索栏 -->
      <div v-if="config.searchPlaceholder || showFilter" class="search-section">
        <Search v-model="searchValue" :placeholder="config.searchPlaceholder || '搜索...'" />
      </div>

      <!-- 横向滑动筛选标签 -->
      <div v-if="filterTabs.length > 0" class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="tab in filterTabs"
            :key="tab.value"
            class="filter-chip"
            :class="{ active: activeTag === tab.value }"
            @click="activeTag = tab.value"
          >
            <span class="chip-text">{{ tab.label }}</span>
            <span v-if="getTabCount(tab.value)" class="chip-badge">{{
              getTabCount(tab.value)
            }}</span>
          </div>
        </div>
      </div>

      <!-- 列表 -->
      <div class="list-area">
        <!-- 骨架屏（首屏加载时显示） -->
        <div v-if="initialLoading" class="skeleton-list">
          <div v-for="i in 3" :key="i" class="skeleton-card">
            <div class="skeleton-accent"></div>
            <div class="skeleton-body">
              <div class="skeleton-line title"></div>
              <div class="skeleton-line subtitle"></div>
              <div class="skeleton-line detail"></div>
            </div>
          </div>
        </div>

        <PullRefresh v-else v-model="refreshing" @refresh="onRefresh">
          <Empty v-if="filteredItems.length === 0 && !loading" description="暂无数据" />

          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div
              v-for="(item, index) in filteredItems"
              :key="item[config.fields.id]"
              class="list-card"
              :style="{ animationDelay: `${index * 0.03}s` }"
              @click="handleItemClick(item)"
            >
              <!-- 左侧色条 -->
              <div class="card-accent" :class="getAccentColor(item)"></div>

              <!-- 卡片主体 -->
              <div class="card-body">
                <!-- 第一行: 标题 + 状态标签 -->
                <div class="card-top">
                  <div class="title-area">
                    <div v-if="getIconName(item)" class="item-icon" :class="getAccentColor(item)">
                      <SvgIcon :name="getIconName(item)" size="0.875rem" />
                    </div>
                    <span class="item-title">{{ getFieldValue(item, config.fields.title) }}</span>
                  </div>
                  <template v-if="config.fields.tags && config.fields.tags.length">
                    <span
                      v-for="tag in config.fields.tags"
                      :key="tag.field"
                      class="status-tag"
                      :class="getTagClass(item, tag)"
                      >{{ getTagText(item, tag) }}</span
                    >
                  </template>
                  <template v-else-if="config.fields.status">
                    <span class="status-tag" :class="getStatusAccent(item)">{{
                      getStatusText(item)
                    }}</span>
                  </template>
                </div>

                <!-- 第二行: 副标题 -->
                <div class="item-subtitle" v-if="config.fields.subtitle">
                  {{ getFieldValue(item, config.fields.subtitle) }}
                </div>

                <!-- 进度条 -->
                <div v-if="config.fields.progress" class="progress-section">
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :class="'fill-' + getProgressLevel(item)"
                      :style="{ width: getProgressValue(item) + '%' }"
                    ></div>
                  </div>
                  <span class="progress-text">{{ Math.round(getProgressValue(item)) }}%</span>
                </div>

                <!-- 详细信息网格 -->
                <div v-if="config.fields.details" class="detail-grid">
                  <div
                    v-for="(detail, dIdx) in config.fields.details"
                    :key="dIdx"
                    class="detail-item"
                  >
                    <span class="detail-label">{{ detail.label }}</span>
                    <span class="detail-value">{{ formatDetailValue(item, detail) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 回到顶部 -->
    <BackTop bottom="80" right="16" />
  </div>
</template>

<script setup>
  import { ref, computed, watch, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { showToast, NavBar, Search, PullRefresh, List, Empty, BackTop } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import dayjs from 'dayjs'
  import { useDebouncedRef } from '@/composables/useDebounce'

  const props = defineProps({
    config: { type: Object, required: true },
    apiFunction: { type: Function, required: true },
    showAdd: { type: Boolean, default: true },
    addPermission: { type: String, default: '' },
    showFilter: { type: Boolean, default: false },
    listTitle: { type: String, default: '' }
  })

  const emit = defineEmits(['add', 'filter', 'item-click', 'item-more'])

  const router = useRouter()
  const searchValue = ref('')
  const debouncedSearch = useDebouncedRef(searchValue, 300)  // 搜索防抖 300ms
  const activeTag = ref('all')
  const loading = ref(false)
  const finished = ref(false)
  const refreshing = ref(false)
  const items = ref([])
  const statistics = ref({})
  const initialLoading = ref(true)  // 骨架屏控制

  // ==================== 分页状态 ====================
  const PAGE_SIZE = 20
  const currentPage = ref(1)
  const totalCount = ref(0)

  // 筛选标签 — 优先使用 config.filterTabs，其次 config.tags
  const filterTabs = computed(() => props.config.filterTabs || props.config.tags || [])

  // 统计数据
  const statsData = computed(() => {
    if (!props.config.stats) return []
    return props.config.stats.map((stat) => ({
      label: stat.label,
      value: (statistics.value[stat.field] || 0).toString() + (stat.suffix || ''),
      icon: stat.icon,
      iconClass: stat.iconClass
    }))
  })

  const getTabCount = (value) => {
    if (value === 'all') return totalCount.value > 0 ? totalCount.value : items.value.length
    if (props.config.fields.status) {
      const field = props.config.fields.status.field || props.config.fields.status
      return items.value.filter((i) => i[field] === value).length
    }
    return 0
  }

  // 过滤后的列表（客户端筛选已加载的数据）
  const filteredItems = computed(() => {
    let filtered = items.value
    if (activeTag.value !== 'all') {
      filtered = filtered.filter((item) => {
        if (props.config.fields.status) {
          const field =
            typeof props.config.fields.status === 'string'
              ? props.config.fields.status
              : props.config.fields.status.field
          return item[field] === activeTag.value
        }
        return true
      })
    }
    return filtered
  })

  // 搜索词变化时重新加载（服务端搜索）
  watch(debouncedSearch, () => {
    loadData(true)
  })

  // 获取字段值
  const getFieldValue = (item, field) => {
    if (typeof field === 'function') return field(item)
    return item[field] || ''
  }

  // 获取图标名称
  const getIconName = (item) => {
    if (!props.config.fields.icon) return null
    if (typeof props.config.fields.icon === 'function') return props.config.fields.icon(item)
    return props.config.fields.icon
  }

  // 色条颜色 — 基于状态
  const accentMap = {
    draft: 'accent-gray',
    pending: 'accent-gray',
    confirmed: 'accent-blue',
    allocated: 'accent-blue',
    preparing: 'accent-yellow',
    material_issuing: 'accent-yellow',
    material_issued: 'accent-yellow',
    in_progress: 'accent-yellow',
    in_production: 'accent-yellow',
    in_procurement: 'accent-yellow',
    ready_to_ship: 'accent-blue',
    shortage: 'accent-red',
    partial_shipped: 'accent-blue',
    shipped: 'accent-blue',
    delivered: 'accent-green',
    inspection: 'accent-purple',
    warehousing: 'accent-blue',
    processing: 'accent-yellow',
    completed: 'accent-green',
    cancelled: 'accent-red',
    paused: 'accent-red',
    active: 'accent-blue',
    inactive: 'accent-gray',
    approved: 'accent-green',
    rejected: 'accent-red',
    posted: 'accent-green',
    voided: 'accent-gray',
    received: 'accent-green',
    passed: 'accent-green',
    failed: 'accent-red',
    overdue: 'accent-red',
    partial: 'accent-yellow',
    closed: 'accent-gray',
    // 中文状态（财务模块使用）
    '草稿': 'accent-gray',
    '已确认': 'accent-blue',
    '部分付款': 'accent-yellow',
    '已付款': 'accent-green',
    '已逾期': 'accent-red',
    '已取消': 'accent-gray',
    '部分收款': 'accent-yellow',
    '已收款': 'accent-green',
    '正常': 'accent-blue',
    '已作废': 'accent-gray'
  }
  const getAccentColor = (item) => {
    if (props.config.fields.status) {
      const field =
        typeof props.config.fields.status === 'string'
          ? props.config.fields.status
          : props.config.fields.status.field
      return accentMap[item[field]] || 'accent-blue'
    }
    return 'accent-blue'
  }

  // 状态相关
  const getStatusAccent = (item) => {
    if (!props.config.fields.status) return ''
    const field =
      typeof props.config.fields.status === 'string'
        ? props.config.fields.status
        : props.config.fields.status.field
    return 'st-' + (item[field] || 'default')
  }
  const getStatusText = (item) => {
    if (!props.config.fields.status) return ''
    const status =
      item[
        typeof props.config.fields.status === 'string'
          ? props.config.fields.status
          : props.config.fields.status.field
      ]
    const map = props.config.fields.status.map
    return map ? map[status]?.text || status : status
  }

  // Tag 相关
  const getTagClass = (item, tag) => {
    if (!tag.map) return ''
    const val = item[tag.field]
    const entry = tag.map[val]
    if (!entry) return ''
    return 'tag-' + (entry.color || 'default')
  }
  const getTagText = (item, tag) => {
    if (!tag.map) return item[tag.field] || ''
    const val = item[tag.field]
    const entry = tag.map[val]
    return entry ? entry.text : val || ''
  }

  // 格式化详情值
  const formatDetailValue = (item, detail) => {
    let value
    if (typeof detail.field === 'function') {
      value = detail.field(item)
    } else {
      value = item[detail.field]
    }
    if (value === undefined || value === null) value = ''

    const fmt = detail.format || detail.type
    if (fmt === 'date' && value) return (detail.prefix || '') + dayjs(value).format('YYYY-MM-DD')
    if (fmt === 'datetime' && value)
      return (detail.prefix || '') + dayjs(value).format('YYYY-MM-DD HH:mm')
    if (fmt === 'money' && value !== '') {
      const num = Number(value)
      const formatted = isNaN(num)
        ? value
        : num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      return (detail.prefix || '') + formatted
    }

    if (detail.prefix) value = detail.prefix + value
    if (detail.suffix) {
      if (typeof detail.suffix === 'string' && detail.suffix.startsWith('_')) {
        value = value + ' ' + (item[detail.suffix] || '')
      } else {
        value = value + ' ' + detail.suffix
      }
    }
    return value || '—'
  }

  // 进度相关
  const getProgressValue = (item) => {
    if (!props.config.fields.progress) return 0
    if (props.config.fields.progress.calculate)
      return props.config.fields.progress.calculate(item).percent || 0
    const current = item[props.config.fields.progress.field] || 0
    const total = item[props.config.fields.progress.total] || 1
    return Math.min((current / total) * 100, 100)
  }
  const getProgressLevel = (item) => {
    if (!props.config.fields.progress) return 'good'
    if (props.config.fields.progress.calculate)
      return props.config.fields.progress.calculate(item).level || 'good'
    const p = getProgressValue(item)
    if (p >= 100) return 'good'
    if (p >= 50) return 'medium'
    return 'low'
  }

  // ==================== 数据提取工具 ====================

  // 从响应中提取数据数组
  const extractDataFromResponse = (response) => {
    let data = []
    let responseData = response
    if (response.data !== undefined) responseData = response.data

    if (responseData.list && Array.isArray(responseData.list)) data = responseData.list
    else if (responseData.items && Array.isArray(responseData.items)) data = responseData.items
    else if (
      responseData.data &&
      responseData.data.items &&
      Array.isArray(responseData.data.items)
    )
      data = responseData.data.items
    else if (responseData.data && responseData.data.list && Array.isArray(responseData.data.list))
      data = responseData.data.list
    else if (responseData.data && Array.isArray(responseData.data)) data = responseData.data
    else if (Array.isArray(responseData)) data = responseData
    else if (responseData.data && typeof responseData.data === 'object') {
      const innerData = responseData.data
      const arrayKey = Object.keys(innerData).find((k) => Array.isArray(innerData[k]))
      if (arrayKey) data = innerData[arrayKey]
    } else if (typeof responseData === 'object' && responseData !== null) {
      const arrayKey = Object.keys(responseData).find((k) => Array.isArray(responseData[k]))
      if (arrayKey) data = responseData[arrayKey]
    }

    return { data, responseData }
  }

  // 从响应中提取 total 总数
  const extractTotal = (responseData) => {
    if (responseData.total !== undefined) return Number(responseData.total)
    if (responseData.data && responseData.data.total !== undefined) return Number(responseData.data.total)
    if (responseData.pagination && responseData.pagination.total !== undefined) return Number(responseData.pagination.total)
    if (responseData.count !== undefined) return Number(responseData.count)
    return -1  // 未知总数
  }

  // ==================== 核心加载逻辑（支持无限滚动分页） ====================
  const loadData = async (isRefresh = false) => {
    if (isRefresh) {
      items.value = []
      currentPage.value = 1
      totalCount.value = 0
      finished.value = false
    }

    try {
      // 同时传 pageSize 和 limit，兼容不同后端接口
      const params = {
        page: currentPage.value,
        pageSize: PAGE_SIZE,
        limit: PAGE_SIZE,
        search: searchValue.value || undefined
      }

      const response = await props.apiFunction(params)
      const { data, responseData } = extractDataFromResponse(response)

      if (isRefresh || currentPage.value === 1) {
        // 首次加载或刷新：替换数据
        items.value = data
      } else {
        // 加载更多：追加数据（去重）
        const existingIds = new Set(items.value.map(i => i.id || i._id))
        const newItems = data.filter(i => !existingIds.has(i.id || i._id))
        items.value = [...items.value, ...newItems]
      }

      // 判断是否还有更多数据
      const total = extractTotal(responseData)
      if (total >= 0) {
        totalCount.value = total
        finished.value = items.value.length >= total
      } else {
        // 无法获取总数时，根据返回数据量判断
        finished.value = data.length < PAGE_SIZE
      }

      // 页码+1 准备下次加载
      currentPage.value++

      // 更新统计数据
      if (props.config.stats) statistics.value = calculateStatistics(items.value, responseData)
    } catch (error) {
      console.error('加载数据失败:', error)
      showToast('加载失败，请重试')
      finished.value = true  // 出错时停止继续加载
    } finally {
      loading.value = false
      refreshing.value = false
      initialLoading.value = false
    }
  }

  const calculateStatistics = (data, responseData = {}) => {
    const stats = {}
    if (!props.config.stats) return stats
    props.config.stats.forEach((stat) => {
      if (stat.field === 'total' || stat.field === 'totalMaterials') {
        stats[stat.field] = totalCount.value > 0 ? totalCount.value : (responseData.total || data.length)
      } else if (stat.field === 'lowStock') {
        stats.lowStock = data.filter((i) => {
          const q = i.quantity || 0
          const m = i.min_stock || 0
          return m > 0 && q <= m
        }).length
      } else if (stat.field === 'active') {
        stats.active = data.filter((i) => i.status === 'active').length
      } else if (props.config.fields.status) {
        const field =
          typeof props.config.fields.status === 'string'
            ? props.config.fields.status
            : props.config.fields.status.field
        stats[stat.field] = data.filter((i) => i[field] === stat.field).length
      }
    })
    return stats
  }

  const goBack = () => router.back()
  const handleAdd = () => emit('add')
  const handleFilter = () => emit('filter')
  const handleItemClick = (item) => {
    if (props.config.detailRoute) {
      const route = props.config.detailRoute.replace(':id', item[props.config.fields.id])
      router.push(route)
    }
    emit('item-click', item)
  }

  // Vant List 组件触发加载更多
  const onLoad = () => {
    if (!finished.value) {
      loading.value = true
      loadData()
    }
  }
  // 下拉刷新
  const onRefresh = () => {
    refreshing.value = true
    loadData(true)
  }

  onMounted(() => loadData(true))
</script>

<style lang="scss" scoped>
  .universal-page {
    min-height: 100vh;
    background: var(--bg-primary);
    padding-bottom: 80px;
  }
  .page-body {
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
  }
  .stat-num {
    font-size: 1.25rem;
    font-weight: 800;
    color: var(--text-primary);
    &.bg-blue {
      color: #3b82f6;
    }
    &.bg-purple {
      color: #a855f7;
    }
    &.bg-green {
      color: #34d399;
    }
    &.bg-red {
      color: #ef4444;
    }
    &.bg-yellow {
      color: #fbbf24;
    }
    &.bg-orange {
      color: #f97316;
    }
  }
  .stat-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
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
    transition: all 0.25s;
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

  // ========== 列表卡片 ==========
  .list-area {
    padding-top: 4px;
  }
  .list-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 10px;
    margin-bottom: 8px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
    box-shadow: none;
    transition: all 0.2s;
    animation: fadeInUp 0.35s ease-out both;
    cursor: pointer;
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
    width: 3px;
    flex-shrink: 0;
    &.accent-blue {
      background: linear-gradient(180deg, #3b82f6, #60a5fa);
    }
    &.accent-green {
      background: linear-gradient(180deg, #10b981, #34d399);
    }
    &.accent-yellow {
      background: linear-gradient(180deg, #f59e0b, #fbbf24);
    }
    &.accent-red {
      background: linear-gradient(180deg, #ef4444, #f87171);
    }
    &.accent-gray {
      background: linear-gradient(180deg, #94a3b8, #cbd5e1);
    }
    &.accent-purple {
      background: linear-gradient(180deg, #a855f7, #c084fc);
    }
  }

  .card-body {
    flex: 1;
    padding: 10px 12px;
    min-width: 0;
  }

  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2px;
  }
  .title-area {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
  }
  .item-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    &.accent-blue {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }
    &.accent-green {
      background: rgba(16, 185, 129, 0.1);
      color: #10b981;
    }
    &.accent-yellow {
      background: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }
    &.accent-red {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
    &.accent-gray {
      background: rgba(148, 163, 184, 0.1);
      color: #94a3b8;
    }
    &.accent-purple {
      background: rgba(168, 85, 247, 0.1);
      color: #a855f7;
    }
  }
  .item-title {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // 状态标签
  .status-tag {
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 0.625rem;
    font-weight: 700;
    flex-shrink: 0;
    &.st-draft,
    &.st-pending,
    &.tag-default {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }
    &.st-confirmed,
    &.st-allocated,
    &.st-ready_to_ship,
    &.st-partial_shipped,
    &.st-shipped,
    &.tag-info {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }
    &.st-preparing,
    &.st-material_issuing,
    &.st-material_issued,
    &.st-in_progress,
    &.st-in_production,
    &.st-in_procurement,
    &.st-processing,
    &.tag-warning {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
    &.st-inspection,
    &.st-warehousing {
      background: rgba(168, 85, 247, 0.12);
      color: #a855f7;
    }
    &.st-completed,
    &.st-delivered,
    &.tag-success,
    &.st-active {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    &.st-cancelled,
    &.st-inactive {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }
    &.st-paused,
    &.st-shortage,
    &.st-rejected,
    &.st-overdue,
    &.st-failed,
    &.tag-danger {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
    &.st-approved,
    &.st-posted,
    &.st-received,
    &.st-passed,
    &.tag-primary {
      background: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }
    &.st-voided,
    &.st-closed {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }
  }

  .item-subtitle {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    margin-bottom: 4px;
    font-family: 'SF Mono', monospace;
  }

  // 进度条
  .progress-section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--glass-border);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s;
    &.fill-good {
      background: linear-gradient(90deg, #10b981, #34d399);
    }
    &.fill-medium {
      background: linear-gradient(90deg, #f59e0b, #fbbf24);
    }
    &.fill-low {
      background: linear-gradient(90deg, #ef4444, #f87171);
    }
  }
  .progress-text {
    font-size: 0.6875rem;
    font-weight: 700;
    color: var(--text-secondary);
    font-family: 'SF Mono', monospace;
    min-width: 30px;
    text-align: right;
  }

  // 详情网格
  .detail-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--glass-border);
  }
  .detail-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .detail-label {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .detail-value {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  // ========== 骨架屏 ==========
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }
  .skeleton-card {
    display: flex;
    background: var(--bg-secondary);
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--glass-border);
  }
  .skeleton-accent {
    width: 3px;
    flex-shrink: 0;
    background: var(--glass-border);
  }
  .skeleton-body {
    flex: 1;
    padding: 14px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .skeleton-line {
    height: 12px;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--bg-tertiary, #e8eaed) 25%,
      var(--bg-secondary, #f8f9fa) 50%,
      var(--bg-tertiary, #e8eaed) 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite ease-in-out;
    &.title {
      width: 60%;
      height: 14px;
    }
    &.subtitle {
      width: 40%;
    }
    &.detail {
      width: 80%;
    }
  }
  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
