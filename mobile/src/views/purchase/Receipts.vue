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
        <Icon v-permission="'purchase:receipts:create'" name="plus" size="18" @click="createReceipt" />
      </template>
    </NavBar>

    <div class="content-container">
      <!-- 搜索栏 -->
      <div class="search-section">
        <Search
          v-model="searchValue"
          placeholder="搜索入库单号或订单号"
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
            <div class="list-header">
              <span class="list-id">{{ receipt.receiptNo }}</span>
              <Tag :type="getReceiptStatusType(receipt.status)" size="medium">
                {{ getReceiptStatusText(receipt.status) }}
              </Tag>
            </div>

            <div class="list-subtitle" v-if="receipt.orderNo">
              关联订单: {{ receipt.orderNo }}
            </div>

            <div class="list-title">{{ receipt.supplierName }}</div>

            <div class="list-details">
              <div class="list-row">
                <span class="label">入库日期:</span>
                <span class="value">{{ formatDate(receipt.receiptDate) }}</span>
              </div>
              <div class="list-row" v-if="receipt.totalAmount">
                <span class="label">入库金额:</span>
                <span class="value amount">{{ displayAmount(receipt.totalAmount) }}</span>
              </div>
              <div class="list-row" v-if="receipt.receiver || receipt.operatorName">
                <span class="label">收货人:</span>
                <span class="value">{{ receipt.receiver || receipt.operatorName }}</span>
              </div>
              <div class="list-row" v-if="receipt.locationName || receipt.warehouseName">
                <span class="label">入库仓库:</span>
                <span class="value">{{ receipt.locationName || receipt.warehouseName }}</span>
              </div>
            </div>

            <div class="list-details" v-if="receipt.items && receipt.items.length > 0">
              <div class="list-section-title">入库物料 ({{ receipt.items.length }}项)</div>
              <div
                v-for="(item, index) in receipt.items.slice(0, 2)"
                :key="index"
                class="list-row"
              >
                <span class="label" style="color:var(--text-primary)">{{ item.materialName }}</span>
                <span class="value">{{ item.quantity }} {{ item.unitName || item.unit || '' }}</span>
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
                v-if="canCompletePurchaseReceipt(receipt)"
                v-permission="'purchase:receipts:update'"
                size="small"
                type="success"
                plain
                @click.stop="completeReceipt(receipt)"
              >
                入库
              </Button>
              <Button
                v-if="canCancelPurchaseReceipt(receipt)"
                v-permission="'purchase:receipts:update'"
                size="small"
                type="warning"
                plain
                @click.stop="cancelReceipt(receipt)"
              >
                取消
              </Button>
            </div>
          </div>
        </List>
      </PullRefresh>
    </div>
  </div>
</template>

<script setup>
  import { computed, ref, reactive, onMounted } from 'vue'
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
  import { purchaseApi } from '@/api'
  import { useAuthStore } from '@/stores/auth'
  import { canViewMaterialPrices, formatMaskedPrice } from '@/utils/priceVisibility'
  import {
    PURCHASE_RECEIPT_STATUS,
    getPurchaseReceiptStatusColor,
    getPurchaseReceiptStatusText,
    canCompletePurchaseReceipt,
    canCancelPurchaseReceipt,
  } from '@/constants/purchaseReceiptStatus'
  import dayjs from 'dayjs'

  const formatDate = (d) => (d ? dayjs(d).format('YYYY-MM-DD') : '—')

  const router = useRouter()
  const authStore = useAuthStore()
  const canViewPrice = computed(() => canViewMaterialPrices(authStore.hasPermission))
  const searchValue = ref('')
  const refreshing = ref(false)
  const loading = ref(false)
  const finished = ref(false)
  const receiptList = ref([])
  const activeTab = ref(0)

  // 状态标签（与后端 purchase_receipts.status 枚举保持一致）
  const statusTabs = [
    { label: '全部', value: '' },
    ...[
      PURCHASE_RECEIPT_STATUS.DRAFT,
      PURCHASE_RECEIPT_STATUS.INSPECTED,
      PURCHASE_RECEIPT_STATUS.COMPLETED,
      PURCHASE_RECEIPT_STATUS.CANCELLED,
    ].map((value) => ({ label: getPurchaseReceiptStatusText(value), value })),
  ]

  // 分页参数
  const pagination = reactive({
    page: 1,
    limit: 20,
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

  const getReceiptStatusType = getPurchaseReceiptStatusColor
  const getReceiptStatusText = getPurchaseReceiptStatusText

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }

  // 金额权限脱敏显示
  const displayAmount = (amount) =>
    formatMaskedPrice(amount, canViewPrice.value, (value) => `¥${formatAmount(value)}`)

  // 查看入库单详情
  const viewReceiptDetail = (id) => {
    router.push(`/purchase/receipts/${id}`)
  }

  // 已检验 → 已完成；库存过账由后端事务完成。
  const completeReceipt = async (receipt) => {
    try {
      await showConfirmDialog({
        title: '完成入库',
        message: `确定要完成入库单 ${receipt.receiptNo} 吗？库存数量将相应增加。`
      })

      await purchaseApi.updateReceiptStatus(receipt.id, 'completed', '移动端完成入库')
      showToast('入库单已完成')
      resetList()
      await loadReceiptList()
    } catch (error) {
      if (error !== 'cancel') {
        console.error('完成入库失败:', error)
        showToast('完成入库失败')
      }
    }
  }

  const cancelReceipt = async (receipt) => {
    try {
      await showConfirmDialog({
        title: '取消收货单',
        message: `确定要取消收货单 ${receipt.receiptNo} 吗？`,
      })
      await purchaseApi.updateReceiptStatus(receipt.id, 'cancelled', '移动端取消收货单')
      showToast('收货单已取消')
      resetList()
      await loadReceiptList()
    } catch (error) {
      if (error !== 'cancel') {
        console.error('取消收货单失败:', error)
        showToast('取消收货单失败')
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
      color: var(--color-accent-text, var(--color-primary));
    }
  }

/* 业务卡片专属CSS已移除，转接全局.list-* */
</style>
