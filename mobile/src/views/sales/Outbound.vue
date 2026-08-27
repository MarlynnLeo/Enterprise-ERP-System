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
        <Icon v-permission="'sales:outbound:create'" name="plus" size="18" @click="createOutbound" />
      </template>
    </NavBar>

    <div class="content-container">
      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="搜索出库单号或订单号"
          @search="onSearch"
          shape="round"
        />
      </div>

      <!-- 横向滑动筛选标签 -->
      <div class="filter-scroll-wrapper">
        <div class="filter-scroll">
          <div
            v-for="(tab, index) in statusTabs"
            :key="index"
            class="filter-chip"
            :class="{ active: activeTab === index }"
            @click="switchTab(index)"
          >
            <span class="chip-text">{{ tab.label }}</span>
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
            <div class="list-header">
              <span class="list-id">{{ outbound.outboundNo }}</span>
              <Tag :type="getOutboundStatusType(outbound.status)" size="medium">
                {{ getOutboundStatusText(outbound.status) }}
              </Tag>
            </div>

            <div class="list-subtitle" v-if="outbound.orderNo">
              关联订单: {{ outbound.orderNo }}
            </div>

            <div class="list-title">{{ outbound.customerName }}</div>

            <div class="list-details">
              <div class="list-row">
                <span class="label">出库日期:</span>
                <span class="value">{{ formatDate(outbound.deliveryDate) }}</span>
              </div>
              <div class="list-row" v-if="outbound.totalAmount">
                <span class="label">出库金额:</span>
                <span class="value amount">{{ displayAmount(outbound.totalAmount) }}</span>
              </div>
              <div class="list-row" v-if="outbound.contactPerson || outbound.receiver">
                <span class="label">收货人:</span>
                <span class="value">{{ outbound.contactPerson || outbound.receiver }}</span>
              </div>
              <div class="list-row" v-if="outbound.contactPhone">
                <span class="label">联系电话:</span>
                <span class="value">{{ outbound.contactPhone }}</span>
              </div>
            </div>

            <div class="list-details" v-if="outbound.itemsCount || (outbound.items && outbound.items.length)">
              <div class="list-row">
                <span class="label">物料数:</span>
                <span class="value"
                  >{{ outbound.itemsCount || outbound.items?.length || 0 }} 项 / {{ outbound.totalQuantity || 0 }} 件</span
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
                v-permission="'sales:outbound:update'"
                size="small"
                type="success"
                plain
                @click.stop="confirmOutbound(outbound)"
              >
                开始出库
              </Button>
              <Button
                v-if="outbound.status === 'processing'"
                v-permission="'sales:outbound:update'"
                size="small"
                type="warning"
                plain
                @click.stop="shipOutbound(outbound)"
              >
                完成出库
              </Button>
            </div>
          </div>
        </List>
      </PullRefresh>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed } from 'vue'
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
  import { salesApi } from '@/api'
  import { usePagination } from '@/composables/usePagination'
  import { formatAmount, formatDate } from '@/utils/format'
  import { SALES_OUTBOUND_STATUS, getDictText } from '@/constants/dict'
  import { useAuthStore } from '@/stores/auth'
  import { canViewMaterialPrices, formatMaskedPrice } from '@/utils/priceVisibility'

  const router = useRouter()
  const authStore = useAuthStore()
  const canViewPrice = computed(() => canViewMaterialPrices((code) => authStore.hasPermission(code)))
  const displayAmount = (amount) => formatMaskedPrice(amount, canViewPrice.value, (value) => `¥${formatAmount(value)}`)
  const searchValue = ref('')
  const activeTab = ref(0)

  // 状态标签
  const statusTabs = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'draft' },
    { label: '出库中', value: 'processing' },
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
  const createOutbound = () => {
    router.push('/sales/outbound/new')
  }

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
      processing: 'warning',
      completed: 'success',
      cancelled: 'danger'
    }
    return statusMap[status] || 'default'
  }

  // 获取出库单状态文本
  const getOutboundStatusText = (status) => getDictText(SALES_OUTBOUND_STATUS, status, status)

  // 查看出库单详情
  const viewOutboundDetail = (id) => router.push(`/sales/outbound/${id}`)

  const buildStatusPayload = (outbound, status) => ({
    status,
    deliveryDate: outbound.deliveryDate || new Date().toISOString().slice(0, 10),
    remarks: outbound.remarks
  })

  // 草稿 → 出库中
  const confirmOutbound = async (outbound) => {
    try {
      await showConfirmDialog({
        title: '开始出库',
        message: `确定开始处理出库单 ${outbound.outboundNo} 吗？`
      })
      await salesApi.updateSalesOutbound(outbound.id, buildStatusPayload(outbound, 'processing'))
      showToast('已进入出库中')
      outbound.status = 'processing'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('确认出库失败:', error)
        showToast('确认出库失败')
      }
    }
  }

  // 出库中 → 已完成
  const shipOutbound = async (outbound) => {
    try {
      await showConfirmDialog({
        title: '完成出库',
        message: `确定完成出库单 ${outbound.outboundNo} 吗？库存数量将相应扣减。`
      })
      await salesApi.updateSalesOutbound(outbound.id, buildStatusPayload(outbound, 'completed'))
      showToast('出库完成')
      outbound.status = 'completed'
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
    height: 100%;
    background: var(--bg-primary);
  }



  .content-container {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 0 12px;
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
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    &::-webkit-scrollbar { display: none; }
  }
  .filter-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--bg-secondary);
    border: 1.5px solid var(--surface-border, var(--border-subtle));
    white-space: nowrap;
    flex-shrink: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease, box-shadow 0.25s ease, opacity 0.25s ease, transform 0.25s ease;
    cursor: pointer;
    .chip-text { font-weight: 500; }
    &.active {
      background: var(--color-accent-bg, rgba(59, 130, 246, 0.1));
      border-color: var(--color-accent, var(--color-primary));
      color: var(--color-accent, var(--color-primary));
    }
  }

/* 业务自定义CSS已移除，列表由全局.list-*托管 */
</style>
