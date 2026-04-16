<!--
/**
 * Receipts.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="unified-page">
    <NavBar title="采购入库" left-arrow @click-left="onClickLeft">
      <template #right>
        <Icon name="plus" size="18" @click="createReceipt" />
      </template>
    </NavBar>

    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-filter">
        <Search
          v-model="searchValue"
          placeholder="搜索入库单号或订单号"
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

      <!-- 入库单列表 -->
      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多数据了"
          @load="onLoad"
        >
          <div v-if="receiptList.length === 0 && !loading" class="empty-state">
            <Empty description="暂无采购入库单" />
          </div>

          <div
            v-for="receipt in receiptList"
            :key="receipt.id"
            class="global-list-card"
            @click="viewReceiptDetail(receipt.id)"
          >
            <div>
              <div class="list-header">
                <span class="list-id">{{ receipt.receipt_no }}</span>
                <Tag :type="getReceiptStatusType(receipt.status)" size="medium">
                  {{ getReceiptStatusText(receipt.status) }}
                </Tag>
              </div>

              <div class="list-subtitle" v-if="receipt.order_no">
                关联订单: {{ receipt.order_no }}
              </div>

              <div class="list-title">{{ receipt.supplier_name }}</div>

              <div class="list-details">
                <div class="list-row">
                  <span class="label">入库日期:</span>
                  <span class="value">{{ formatDate(receipt.receipt_date) }}</span>
                </div>
                <div class="list-row" v-if="receipt.total_amount">
                  <span class="label">入库金额:</span>
                  <span class="value amount">¥{{ formatAmount(receipt.total_amount) }}</span>
                </div>
                <div class="list-row" v-if="receipt.receiver">
                  <span class="label">收货人:</span>
                  <span class="value">{{ receipt.receiver }}</span>
                </div>
                <div class="list-row" v-if="receipt.warehouse_name">
                  <span class="label">入库仓库:</span>
                  <span class="value">{{ receipt.warehouse_name }}</span>
                </div>
              </div>

              <div class="list-details" v-if="receipt.items && receipt.items.length > 0">
                <div class="list-title" style="font-size:0.8125rem;margin-bottom:8px;">入库物料 ({{ receipt.items.length }}项)</div>
                <div
                  v-for="(item, index) in receipt.items.slice(0, 2)"
                  :key="index"
                  class="list-row"
                >
                  <span class="label" style="color:var(--text-primary)">{{ item.material_name }}</span>
                  <span class="value">{{ item.quantity }} {{ item.unit_name }}</span>
                </div>
                <div v-if="receipt.items.length > 2" class="list-row" style="justify-content:center;margin-top:8px;">
                  <span class="label">还有 {{ receipt.items.length - 2 }} 项...</span>
                </div>
              </div>

              <div class="list-actions">
                <Button
                  size="small"
                  type="primary"
                  plain
                  @click.stop="viewReceiptDetail(receipt.id)"
                >
                  查看详情
                </Button>
                <Button
                  v-if="receipt.status === 'draft'"
                  size="small"
                  type="success"
                  plain
                  @click.stop="confirmReceipt(receipt)"
                >
                  确认入库
                </Button>
                <Button
                  v-if="receipt.status === 'confirmed'"
                  size="small"
                  type="warning"
                  plain
                  @click.stop="completeReceipt(receipt)"
                >
                  完成入库
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
  import { ref, reactive, onMounted } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    NavBar,
    Search,
    Icon,
    Empty,
    Card,
    Tag,
    PullRefresh,
    List,
    Button,
    showToast,
    showConfirmDialog
  } from 'vant'
  import { purchaseApi } from '@/services/api'
  import dayjs from 'dayjs'

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '—')

  const router = useRouter()
  const searchValue = ref('')
  const refreshing = ref(false)
  const loading = ref(false)
  const finished = ref(false)
  const receiptList = ref([])
  const activeTab = ref(0)

  // 状态标签
  const statusTabs = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'draft' },
    { label: '已确认', value: 'confirmed' },
    { label: '已完成', value: 'completed' },
    { label: '已取消', value: 'cancelled' }
  ]

  // 分页参数
  const pagination = reactive({
    page: 1,
    limit: 10,
    total: 0
  })

  // 返回上一页
  const onClickLeft = () => {
    router.back()
  }

  // 创建入库单
  const createReceipt = () => {
    router.push('/purchase/receipts/create')
  }

  // 搜索
  const onSearch = (val) => {
    searchValue.value = val
    resetList()
    loadReceiptList()
  }

  // 切换标签
  const switchTab = (index) => {
    activeTab.value = index
    resetList()
    loadReceiptList()
  }

  // 下拉刷新
  const onRefresh = () => {
    resetList()
    loadReceiptList().finally(() => {
      refreshing.value = false
      showToast('刷新成功')
    })
  }

  // 重置列表
  const resetList = () => {
    receiptList.value = []
    pagination.page = 1
    finished.value = false
  }

  // 加载更多
  const onLoad = () => {
    loadReceiptList()
  }

  // 加载入库单列表
  const loadReceiptList = async () => {
    if (loading.value) return

    loading.value = true
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.limit,
        receiptNo: searchValue.value || undefined,
        status: statusTabs[activeTab.value].value || undefined
      }

      const response = await purchaseApi.getReceipts(params)

      if (response.data && (response.data.list || response.data.items || response.data.rows)) {
        const dataItems = response.data.list || response.data.items || response.data.rows
        receiptList.value = [...receiptList.value, ...dataItems]
        pagination.total = response.data.total || 0
        finished.value = receiptList.value.length >= pagination.total
      } else {
        finished.value = true
      }

      pagination.page++
    } catch (error) {
      console.error('获取采购入库单列表失败:', error)
      showToast('获取采购入库单列表失败')
      finished.value = true
    } finally {
      loading.value = false
    }
  }

  // 获取入库单状态类型
  const getReceiptStatusType = (status) => {
    const statusMap = {
      draft: 'default',
      confirmed: 'primary',
      completed: 'success',
      cancelled: 'danger'
    }
    return statusMap[status] || 'default'
  }

  // 获取入库单状态文本
  const getReceiptStatusText = (status) => {
    const statusMap = {
      draft: '草稿',
      confirmed: '已确认',
      completed: '已完成',
      cancelled: '已取消'
    }
    return statusMap[status] || status
  }

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }

  // 查看入库单详情
  const viewReceiptDetail = (id) => {
    router.push(`/purchase/receipts/${id}`)
  }

  // 确认入库
  const confirmReceipt = async (receipt) => {
    try {
      await showConfirmDialog({
        title: '确认入库',
        message: `确定要确认入库单 ${receipt.receipt_no} 吗？`
      })

      // 这里需要调用确认入库的API
      showToast('入库单已确认')

      // 更新本地状态
      receipt.status = 'confirmed'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('确认入库失败:', error)
        showToast('确认入库失败')
      }
    }
  }

  // 完成入库
  const completeReceipt = async (receipt) => {
    try {
      await showConfirmDialog({
        title: '完成入库',
        message: `确定要完成入库单 ${receipt.receipt_no} 吗？`
      })

      // 这里需要调用完成入库的API
      showToast('入库单已完成')

      // 更新本地状态
      receipt.status = 'completed'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('完成入库失败:', error)
        showToast('完成入库失败')
      }
    }
  }

  onMounted(() => {
    loadReceiptList()
  })
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
    padding: 1rem;
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--glass-border);
  }

  .filter-tabs {
    display: flex;
    margin-top: 0.5rem;
    overflow-x: auto;

    &::-webkit-scrollbar {
      display: none;
    }

    .filter-tab {
      flex: 0 0 auto;
      text-align: center;
      padding: 0.25rem 0.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      margin-right: 0.5rem;

      &.active {
        color: var(--color-primary, #3b82f6);
        border-bottom-color: var(--color-primary, #3b82f6);
      }
    }
  }

/* 业务卡片专属CSS已移除，转接全局.list-* */
</style>
