<!--
/**
 * Check.vue
 * @description 库存盘点列表页面 — 暗色主题统一风格
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <div class="check-page">
    <NavBar title="库存盘点" left-arrow @click-left="router.push('/inventory')">
      <template #right>
        <div class="header-actions">
          <Icon name="scan" size="18" @click="openScanner" class="action-icon" />
          <Icon v-permission="'inventory:check:create'" name="plus"
            size="18"
            @click="router.push('/inventory/check/new')"
            class="action-icon"
          />
        </div>
      </template>
    </NavBar>

    <div class="content-wrapper">
      <!-- 统计概览 -->
      <div class="stats-banner">
        <div class="stat-item" @click="filterByStatus('')">
          <span class="stat-num">{{ checkStats.total || 0 }}</span>
          <span class="stat-label">全部</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item" @click="filterByStatus('draft')">
          <span class="stat-num draft">{{ checkStats.draftCount || 0 }}</span>
          <span class="stat-label">草稿</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item" @click="filterByStatus('in_progress')">
          <span class="stat-num accent">{{ checkStats.pendingCount || 0 }}</span>
          <span class="stat-label">进行中</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item" @click="filterByStatus('completed')">
          <span class="stat-num success">{{ checkStats.completeCount || 0 }}</span>
          <span class="stat-label">已完成</span>
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="搜索盘点单号"
          @search="onSearch"
          @clear="onSearch"
        />
      </div>

      <!-- 横向滑动筛选标签 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="tab in statusTabs"
            :key="tab.value"
            class="filter-chip"
            :class="{ active: currentStatus === tab.value }"
            @click="filterByStatus(tab.value)"
          >
            <SvgIcon :name="tab.icon" size="0.875rem" />
            <span class="chip-text">{{ tab.label }}</span>
          </div>
        </div>
      </div>

      <!-- 盘点单列表 -->
      <div class="list-area">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <Empty v-if="checkList.length === 0 && !loading" description="暂无盘点单" />
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <SwipeCell
              v-for="(item, index) in checkList"
              :key="item.id"
            >
              <div
                class="order-card"
                :style="{ animationDelay: `${index * 0.03}s` }"
                @click="router.push(`/inventory/check/${item.id}`)"
              >
                <div class="card-accent" :class="getStatusAccent(item.status)"></div>
                <div class="card-body">
                  <div class="card-top">
                    <div class="code-area">
                      <span class="order-code">{{ item.check_no }}</span>
                      <span class="status-tag" :class="getStatusAccent(item.status)">{{ getStatusText(item.status) }}</span>
                    </div>
                    <div class="order-qty" v-if="item.item_count">
                      {{ item.item_count }}<span class="qty-unit">种</span>
                    </div>
                  </div>
                  <div class="order-title">{{ getCheckTypeText(item.check_type) }}</div>
                  <div class="card-meta">
                    <span class="meta-item" v-if="item.warehouse"><Icon name="location-o" size="12" /> {{ item.warehouse }}</span>
                    <span class="meta-item" v-if="item.check_date">{{ item.check_date }}</span>
                  </div>
                </div>
              </div>
              <!-- 左滑操作按钮 -->
              <template #right>
                <div class="swipe-actions">
                  <Button
                    v-if="item.status === 'draft'"
                    square
                    type="primary"
                    text="编辑"
                    class="swipe-btn"
                    @click="router.push(`/inventory/check/${item.id}/edit`)"
                  />
                  <Button
                    v-if="item.status === 'draft'"
                    square
                    type="success"
                    text="开始"
                    class="swipe-btn"
                    @click="updateStatus(item, 'in_progress')"
                  />
                  <Button
                    v-if="item.status === 'in_progress'"
                    square
                    type="success"
                    text="完成"
                    class="swipe-btn"
                    @click="updateStatus(item, 'completed')"
                  />
                </div>
              </template>
            </SwipeCell>
          </List>
        </PullRefresh>
      </div>
    </div>

    <!-- 回到顶部 -->
    <BackTop bottom="80" right="16" />
  </div>
</template>

<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Search,
    Icon,
    Empty,
    PullRefresh,
    List,
    SwipeCell,
    Button,
    BackTop,
    showToast,
    showConfirmDialog
  } from 'vant'
  import SvgIcon from '@/components/icons/index.vue'
  import { inventoryApi } from '@/services/api'

  const router = useRouter()
  const searchValue = ref('')
  const refreshing = ref(false)
  const loading = ref(false)
  const finished = ref(false)
  const checkList = ref([])
  const currentStatus = ref('')

  const checkStats = ref({ total: 0, draftCount: 0, pendingCount: 0, completeCount: 0 })

  const statusTabs = [
    { label: '全部', value: '', icon: 'apps' },
    { label: '草稿', value: 'draft', icon: 'clipboard-check' },
    { label: '进行中', value: 'in_progress', icon: 'cog' },
    { label: '已完成', value: 'completed', icon: 'badge-check' },
    { label: '已取消', value: 'cancelled', icon: 'shield' }
  ]

  const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

  const getStatusText = (s) =>
    ({
      draft: '草稿',
      in_progress: '进行中',
      pending: '待审核',
      completed: '已完成',
      cancelled: '已取消'
    })[s] || s
  const getStatusAccent = (s) =>
    ({
      draft: 'status-draft',
      in_progress: 'status-progress',
      pending: 'status-progress',
      completed: 'status-completed',
      cancelled: 'status-cancelled'
    })[s] || 'status-default'
  const getCheckTypeText = (t) =>
    ({ cycle: '周期盘点', random: '随机盘点', full: '全面盘点', special: '专项盘点' })[t] ||
    t ||
    '盘点'

  const onSearch = () => {
    resetAndLoad()
  }
  const onRefresh = () => {
    refreshing.value = true
    resetAndLoad()
  }
  const onLoad = () => loadCheckList()
  const openScanner = () => router.push('/scan?mode=check')

  const filterByStatus = (s) => {
    currentStatus.value = s
    resetAndLoad()
  }

  const resetAndLoad = () => {
    checkList.value = []
    pagination.page = 1
    finished.value = false
    loadCheckList()
  }

  const loadCheckList = async () => {
    // 移除 if (loading.value) return，因为 van-list 组件触发 load 事件前会自动将其设置为 true
    try {
      const params = {
        page: pagination.page,
        limit: pagination.pageSize,
        check_no: searchValue.value || undefined,
        status: currentStatus.value || undefined
      }
      const res = await inventoryApi.getCheckList(params)
      let items = []
      if (res.data && Array.isArray(res.data)) {
        items = res.data
      } else {
        items = res.data?.list || res.data?.items || res.data?.rows || []
      }
      const ids = new Set(checkList.value.map((i) => i.id))
      checkList.value.push(...items.filter((i) => !ids.has(i.id)))
      pagination.total = res.data?.total || checkList.value.length
      finished.value = checkList.value.length >= pagination.total || items.length === 0
      pagination.page++
    } catch (e) {
      console.error('获取盘点单列表失败:', e)
      showToast('获取盘点单列表失败')
      finished.value = true
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  const loadCheckStats = async () => {
    try {
      const res = await inventoryApi.getCheckStatistics()
      if (res?.data) checkStats.value = res.data
    } catch (e) {
      console.error('获取盘点统计失败:', e)
    }
  }

  const updateStatus = async (item, newStatus) => {
    const label = getStatusText(newStatus)
    try {
      await showConfirmDialog({
        title: '确认操作',
        message: `确定要将盘点单状态更更新为"${label}"吗？`
      })
      await inventoryApi.updateCheckStatus(item.id, newStatus)
      showToast('状态更新成功')
      item.status = newStatus
      await loadCheckStats()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    }
  }

  const adjustInventory = async (item) => {
    try {
      await showConfirmDialog({ title: '调整库存', message: '确定要根据盘点结果调整库存吗？' })
      await inventoryApi.adjustInventory(item.id)
      showToast('库存调整成功')
      resetAndLoad()
      await loadCheckStats()
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    }
  }

  onMounted(async () => {
    await loadCheckStats()
    await loadCheckList()
  })
</script>

<style lang="scss" scoped>
  .check-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }
  .content-wrapper {
    padding: 0 12px 12px;
  }
  .header-actions {
    display: flex;
    gap: 12px;
  }
  .action-icon {
    cursor: pointer;
  }

  .stats-banner {
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 14px 8px;
    margin: 8px 0;
    border: 1px solid var(--glass-border);
  }
  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    .stat-num {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-primary);
      &.draft {
        color: var(--text-secondary);
      }
      &.accent {
        color: var(--color-warning);
      }
      &.success {
        color: #34d399;
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

  .search-section {
    padding: 4px 0;
  }
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
    &.active {
      background: rgba(59, 130, 246, 0.1);
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
  }

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
    &.status-draft {
      background: linear-gradient(180deg, var(--text-secondary), #cbd5e1);
    }
    &.status-progress {
      background: linear-gradient(180deg, var(--color-warning), var(--color-warning));
    }
    &.status-completed {
      background: linear-gradient(180deg, var(--color-success), #34d399);
    }
    &.status-cancelled {
      background: linear-gradient(180deg, var(--color-danger), var(--color-danger));
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
  }
  .order-code {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  }
  .status-tag {
    display: inline-flex;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.625rem;
    font-weight: 700;
    &.status-draft {
      background: rgba(148, 163, 184, 0.12);
      color: var(--text-secondary);
    }
    &.status-progress {
      background: rgba(245, 158, 11, 0.12);
      color: var(--color-warning);
    }
    &.status-completed {
      background: rgba(16, 185, 129, 0.12);
      color: var(--color-success);
    }
    &.status-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: var(--color-danger);
    }
  }
  .order-qty {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    .qty-unit {
      font-size: 0.625rem;
      opacity: 0.7;
    }
  }
  .order-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 8px;
  }
  .card-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .card-bottom {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--glass-border);
  }
  .remark-text {
    flex: 1;
  }
  .card-actions {
    display: flex;
    gap: 6px;
    .action-btn {
      padding: 3px 12px;
      border-radius: 8px;
      font-size: 0.6875rem;
      font-weight: 600;
      cursor: pointer;
      &.edit {
        background: rgba(148, 163, 184, 0.1);
        color: var(--text-secondary);
      }
      &.confirm {
        background: rgba(59, 130, 246, 0.1);
        color: var(--color-primary);
      }
      &.complete {
        background: rgba(16, 185, 129, 0.1);
        color: var(--color-success);
      }
      &.warning {
        background: rgba(245, 158, 11, 0.1);
        color: var(--color-warning);
      }
    }
  }

  /* 滑动操作按钮 */
  .swipe-actions {
    display: flex;
    height: 100%;
  }
  .swipe-btn {
    height: 100%;
    min-width: 60px;
    font-size: 0.8125rem;
  }
</style>
