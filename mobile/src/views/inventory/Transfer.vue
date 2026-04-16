<!--
/**
 * Transfer.vue
 * @description 库存调拨列表页面 — 与生产任务页面统一风格
 * @date 2026-04-15
 * @version 2.0.0
 */
-->
<template>
  <div class="transfer-page">
    <NavBar title="库存调拨" left-arrow @click-left="router.back()">
      <template #right>
        <Icon name="plus" size="18" @click="router.push('/inventory/transfer/create')" />
      </template>
    </NavBar>

    <div class="content-wrapper">
      <!-- 统计概览 -->
      <div class="stats-banner">
        <div class="stat-item">
          <span class="stat-num">{{ transferList.length }}</span>
          <span class="stat-label">全部</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num draft">{{ getStatusCount('draft') }}</span>
          <span class="stat-label">草稿</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num accent">{{
            getStatusCount('pending') + getStatusCount('approved')
          }}</span>
          <span class="stat-label">审批中</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-num success">{{ getStatusCount('completed') }}</span>
          <span class="stat-label">已完成</span>
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="搜索调拨单号"
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
            :class="{ active: activeStatus === tab.value }"
            @click="switchStatus(tab.value)"
          >
            <SvgIcon :name="tab.icon" size="0.875rem" />
            <span class="chip-text">{{ tab.label }}</span>
            <span v-if="getChipCount(tab.value)" class="chip-badge">{{
              getChipCount(tab.value)
            }}</span>
          </div>
        </div>
      </div>

      <!-- 调拨单列表 -->
      <div class="list-area">
        <PullRefresh v-model="refreshing" @refresh="onRefresh">
          <Empty v-if="filteredList.length === 0 && !loading" description="暂无调拨记录" />
          <List
            v-model:loading="loading"
            :finished="finished"
            finished-text="没有更多了"
            @load="onLoad"
          >
            <div
              v-for="(item, index) in filteredList"
              :key="item.id"
              class="order-card"
              :style="{ animationDelay: `${index * 0.03}s` }"
              @click="router.push(`/inventory/transfer/${item.id}`)"
            >
              <div class="card-accent" :class="getStatusAccent(item.status)"></div>
              <div class="card-body">
                <div class="card-top">
                  <div class="code-area">
                    <span class="order-code">{{ item.transfer_no }}</span>
                    <span class="status-tag" :class="getStatusAccent(item.status)">{{
                      getStatusText(item.status)
                    }}</span>
                  </div>
                  <div class="order-qty" v-if="item.item_count">
                    {{ item.item_count }}<span class="qty-unit">项</span>
                  </div>
                </div>

                <!-- 调拨路线 -->
                <div class="transfer-route">
                  <span class="route-from">{{ item.from_location || '—' }}</span>
                  <Icon name="arrow" size="14" color="var(--text-tertiary)" />
                  <span class="route-to">{{ item.to_location || '—' }}</span>
                </div>

                <div class="card-meta">
                  <span class="meta-item" v-if="item.transfer_date">{{ item.transfer_date }}</span>
                  <span class="meta-item" v-if="item.creator_name">{{ item.creator_name }}</span>
                </div>

                <div
                  class="card-bottom"
                  v-if="item.remark || item.status === 'draft' || item.status === 'approved'"
                >
                  <div class="remark-text" v-if="item.remark">{{ item.remark }}</div>
                  <div class="card-actions" @click.stop>
                    <div
                      v-if="item.status === 'draft'"
                      class="action-btn confirm"
                      @click="changeStatus(item, 'pending')"
                    >
                      提交审批
                    </div>
                    <div
                      v-if="item.status === 'approved'"
                      class="action-btn complete"
                      @click="changeStatus(item, 'completed')"
                    >
                      执行调拨
                    </div>
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
  import { ref, reactive, computed, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Search,
    Icon,
    Empty,
    PullRefresh,
    List,
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
  const transferList = ref([])
  const activeStatus = ref('')

  const statusTabs = [
    { label: '全部', value: '', icon: 'apps' },
    { label: '草稿', value: 'draft', icon: 'clipboard-check' },
    { label: '待审批', value: 'pending', icon: 'cog' },
    { label: '已批准', value: 'approved', icon: 'badge-check' },
    { label: '已完成', value: 'completed', icon: 'badge-check' },
    { label: '已取消', value: 'cancelled', icon: 'shield' }
  ]

  const pagination = reactive({ page: 1, pageSize: 20, total: 0 })

  const getStatusCount = (s) => transferList.value.filter((i) => i.status === s).length
  const getChipCount = (s) => (s ? getStatusCount(s) : transferList.value.length)
  const getStatusText = (s) =>
    ({
      draft: '草稿',
      pending: '待审批',
      approved: '已批准',
      completed: '已完成',
      cancelled: '已取消',
      in_progress: '调拨中'
    })[s] || s
  const getStatusAccent = (s) =>
    ({
      draft: 'status-draft',
      pending: 'status-pending',
      approved: 'status-approved',
      completed: 'status-completed',
      cancelled: 'status-cancelled',
      in_progress: 'status-approved'
    })[s] || 'status-default'

  const filteredList = computed(() => {
    let r = transferList.value
    if (activeStatus.value) r = r.filter((i) => i.status === activeStatus.value)
    if (searchValue.value) {
      const kw = searchValue.value.toLowerCase()
      r = r.filter((i) => (i.transfer_no || '').toLowerCase().includes(kw))
    }
    return r
  })

  const onSearch = () => {}
  const switchStatus = (v) => {
    activeStatus.value = v
  }
  const onRefresh = () => {
    refreshing.value = true
    transferList.value = []
    pagination.page = 1
    finished.value = false
    loadList()
  }
  const onLoad = () => loadList()

  const loadList = async () => {
    if (loading.value) return
    loading.value = true
    try {
      const params = {
        page: pagination.page,
        limit: pagination.pageSize,
        transfer_no: searchValue.value || undefined,
        status: activeStatus.value || undefined
      }
      const res = await inventoryApi.getTransferList(params)
      let items = res.data?.list || res.data?.items || res.data?.rows || []
      const ids = new Set(transferList.value.map((i) => i.id))
      transferList.value.push(...items.filter((i) => !ids.has(i.id)))
      pagination.total = res.data?.total || items.length
      finished.value = transferList.value.length >= pagination.total || items.length === 0
      pagination.page++
    } catch (e) {
      console.error('获取调拨单列表失败:', e)
      finished.value = true
    } finally {
      loading.value = false
      refreshing.value = false
    }
  }

  const changeStatus = async (item, newStatus) => {
    const labels = { pending: '提交审批', completed: '执行调拨' }
    try {
      await showConfirmDialog({
        title: labels[newStatus],
        message: `确定要${labels[newStatus]}调拨单 ${item.transfer_no} 吗？`
      })
      await inventoryApi.updateTransferStatus(item.id, newStatus)
      showToast('操作成功')
      item.status = newStatus
    } catch (e) {
      if (e !== 'cancel') showToast('操作失败')
    }
  }

  onMounted(() => loadList())
</script>

<style lang="scss" scoped>
  .transfer-page {
    min-height: 100vh;
    background-color: var(--bg-primary);
    padding-bottom: 80px;
  }
  .content-wrapper {
    padding: 0 12px 12px;
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
    .stat-num {
      font-size: 1.25rem;
      font-weight: 800;
      color: var(--text-primary);
      &.draft {
        color: #94a3b8;
      }
      &.accent {
        color: #3b82f6;
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
      background: linear-gradient(180deg, #94a3b8, #cbd5e1);
    }
    &.status-pending {
      background: linear-gradient(180deg, #f59e0b, #fbbf24);
    }
    &.status-approved {
      background: linear-gradient(180deg, #3b82f6, #60a5fa);
    }
    &.status-completed {
      background: linear-gradient(180deg, #10b981, #34d399);
    }
    &.status-cancelled {
      background: linear-gradient(180deg, #ef4444, #f87171);
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
      color: #94a3b8;
    }
    &.status-pending {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
    &.status-approved {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
    }
    &.status-completed {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    &.status-cancelled {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
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

  .transfer-route {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    .route-from,
    .route-to {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #3b82f6;
    }
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 4px;
  }
  .meta-item {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }
  .card-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--glass-border);
  }
  .remark-text {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-right: 8px;
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
      &.confirm {
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
      }
      &.complete {
        background: rgba(16, 185, 129, 0.1);
        color: #10b981;
      }
    }
  }
</style>
