<!--
/**
 * Outbound.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="unified-page">
    <NavBar title="销售出库" left-arrow @click-left="onClickLeft">
      <template #right>
        <Icon name="plus" size="18" @click="createOutbound" />
      </template>
    </NavBar>

    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-filter">
        <Search
          v-model="searchValue"
          placeholder="搜索出库单号或订单号"
          @search="onSearch"
          shape="round"
        />

        <div class="filter-tabs">
          <div
            v-for="(tab, index) in statusTabs"
            :key="index"
            :class="['filter-tab', { active: activeTab === index }]"
            @click="switchTab(index)"
          >
            {{ tab.label }}
          </div>
        </div>
      </div>

      <!-- 出库单列表 -->
      <PullRefresh
        v-model="refreshing"
        @refresh="
          () =>
            onRefresh({
              search: searchValue || undefined,
              status: statusTabs[activeTab].value || undefined
            })
        "
      >
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多数据了"
          @load="loadMore"
        >
          <div v-if="outboundList.length === 0 && !loading" class="empty-state">
            <Empty description="暂无销售出库单" />
          </div>

          <div
            v-for="outbound in outboundList"
            :key="outbound.id"
            class="global-list-card"
            @click="viewOutboundDetail(outbound.id)"
          >
            <div>
              <div class="list-header">
                <span class="list-id">{{ outbound.outbound_no }}</span>
                <Tag :type="getOutboundStatusType(outbound.status)" size="medium">
                  {{ getOutboundStatusText(outbound.status) }}
                </Tag>
              </div>

              <div class="list-subtitle" v-if="outbound.order_no">
                关联订单: {{ outbound.order_no }}
              </div>

              <div class="list-title">{{ outbound.customer_name }}</div>

              <div class="list-details">
                <div class="list-row">
                  <span class="label">出库日期:</span>
                  <span class="value">{{ formatDate(outbound.delivery_date) }}</span>
                </div>
                <div class="list-row" v-if="outbound.total_amount">
                  <span class="label">出库金额:</span>
                  <span class="value amount">¥{{ formatAmount(outbound.total_amount) }}</span>
                </div>
                <div class="list-row" v-if="outbound.receiver">
                  <span class="label">收货人:</span>
                  <span class="value">{{ outbound.receiver }}</span>
                </div>
                <div class="list-row" v-if="outbound.contact_phone">
                  <span class="label">联系电话:</span>
                  <span class="value">{{ outbound.contact_phone }}</span>
                </div>
              </div>

              <div class="list-details" v-if="outbound.items_count">
                <div class="list-row">
                  <span class="label">物料数:</span>
                  <span class="value"
                    >{{ outbound.items_count }} 项 / {{ outbound.total_quantity }} 件</span
                  >
                </div>
              </div>

              <div class="list-actions">
                <Button
                  size="small"
                  type="primary"
                  plain
                  @click.stop="viewOutboundDetail(outbound.id)"
                >
                  查看详情
                </Button>
                <Button
                  v-if="outbound.status === 'draft'"
                  size="small"
                  type="success"
                  plain
                  @click.stop="confirmOutbound(outbound)"
                >
                  确认出库
                </Button>
                <Button
                  v-if="outbound.status === 'confirmed'"
                  size="small"
                  type="warning"
                  plain
                  @click.stop="shipOutbound(outbound)"
                >
                  发货
                </Button>
              </div>
            </div>
          </div>
        </List>
      </PullRefresh>
    </div>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Search,
    Icon,
    Empty,
    Tag,
    PullRefresh,
    List,
    Button,
    showToast,
    showConfirmDialog
  } from 'vant'
  import { salesApi } from '@/services/api'
  import { usePagination } from '@/composables/usePagination'
  import { formatAmount, formatDate } from '@/utils/format'
  import { SALES_OUTBOUND_STATUS, getDictText } from '@/constants/dict'

  const router = useRouter()
  const searchValue = ref('')
  const activeTab = ref(0)

  // 状态标签
  const statusTabs = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'draft' },
    { label: '待处理', value: 'pending' },
    { label: '已发货', value: 'shipped' },
    { label: '已完成', value: 'completed' },
    { label: '已取消', value: 'cancelled' }
  ]

  // 初始化分页 Hook
  const {
    list: outboundList,
    loading,
    finished,
    refreshing,
    onLoad,
    onRefresh
  } = usePagination(salesApi.getSalesOutbound, { immediate: true })

  // 返回上一页
  const onClickLeft = () => router.back()

  // 创建出库单
  const createOutbound = () => router.push('/inventory/outbound/create')

  const reloadData = () => {
    onRefresh({
      search: searchValue.value || undefined,
      status: statusTabs[activeTab.value].value || undefined
    })
  }

  // 搜索
  const onSearch = (val) => {
    searchValue.value = val
    reloadData()
  }

  // 切换标签
  const switchTab = (index) => {
    activeTab.value = index
    reloadData()
  }

  // 列表底部加载更多
  const loadMore = () => {
    onLoad({
      search: searchValue.value || undefined,
      status: statusTabs[activeTab.value].value || undefined
    })
  }

  // 获取出库单状态类型
  const getOutboundStatusType = (status) => {
    const statusMap = {
      draft: 'default',
      pending: 'warning',
      confirmed: 'primary',
      shipped: 'warning',
      completed: 'success',
      cancelled: 'danger'
    }
    return statusMap[status] || 'default'
  }

  // 获取出库单状态文本
  const getOutboundStatusText = (status) => getDictText(SALES_OUTBOUND_STATUS, status, status)

  // 查看出库单详情
  const viewOutboundDetail = (id) => router.push(`/sales/outbound/${id}`)

  // 确认出库
  const confirmOutbound = async (outbound) => {
    try {
      await showConfirmDialog({
        title: '确认出库',
        message: `确定要确认出库单 ${outbound.outbound_no} 吗？`
      })
      showToast('出库单已确认')
      outbound.status = 'confirmed'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('确认出库失败:', error)
        showToast('确认出库失败')
      }
    }
  }

  // 发货
  const shipOutbound = async (outbound) => {
    try {
      await showConfirmDialog({
        title: '确认发货',
        message: `确定要发货出库单 ${outbound.outbound_no} 吗？`
      })
      showToast('出库单已发货')
      outbound.status = 'shipped'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('发货失败:', error)
        showToast('发货失败')
      }
    }
  }
</script>

<style lang="scss" scoped>
  .unified-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: var(--bg-primary);
  }

  .page-content {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    padding: 0.5rem 1rem;
    gap: 0.75rem;
  }

  .shrink-search {
    flex: 1;
    :deep(.van-search__content) {
      background: var(--bg-secondary);
    }
  }

  .filter-btn {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    border: 1px solid var(--van-border-color);
    color: var(--text-secondary, #94a3b8);
    cursor: pointer;
    flex-shrink: 0;
  }

  .stats-panel {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
  }

  .stat-card {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--van-border-color);
  }

  .stat-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.625rem;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
    &.bg-blue {
      background: linear-gradient(135deg, #667eea, #764ba2);
    }
    &.bg-red {
      background: linear-gradient(135deg, #f5576c, #ff6b6b);
    }
    &.bg-green {
      background: linear-gradient(135deg, #2ccfb0, #1ba392);
    }
    &.bg-purple {
      background: linear-gradient(135deg, #a855f7, #7c3aed);
    }
    &.bg-yellow {
      background: linear-gradient(135deg, #fbbf24, #f59e0b);
    }
  }

  .stat-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--text-secondary, #94a3b8);
  }

  .stat-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary, #f1f5f9);
  }

  .content-container {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .search-filter {
    padding: 12px;
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--glass-border);
  }

  .filter-tabs {
    display: flex;
    margin-top: 8px;
    overflow-x: auto;

    &::-webkit-scrollbar {
      display: none;
    }

    .filter-tab {
      flex: 0 0 auto;
      text-align: center;
      padding: 4px 8px;
      font-size: 0.8125rem;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      margin-right: 8px;

      &.active {
        color: #3b82f6;
        border-bottom-color: #3b82f6;
      }
    }
  }

/* 业务自定义CSS已移除，列表由全局.list-*托管 */
</style>
