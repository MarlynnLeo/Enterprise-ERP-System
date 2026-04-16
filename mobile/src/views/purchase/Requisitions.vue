<!--
/**
 * Requisitions.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="unified-page">
    <NavBar title="采购申请" left-arrow @click-left="onClickLeft">
      <template #right>
        <Icon name="plus" size="18" @click="createRequisition" />
      </template>
    </NavBar>

    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-filter">
        <Search
          v-model="searchValue"
          placeholder="搜索申请单号或申请人"
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

      <!-- 申请单列表 -->
      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多数据了"
          @load="onLoad"
        >
          <div v-if="requisitionList.length === 0 && !loading" class="empty-state">
            <Empty description="暂无采购申请" />
          </div>

          <div
            v-for="requisition in requisitionList"
            :key="requisition.id"
            class="global-list-card"
            @click="viewRequisitionDetail(requisition.id)"
          >
            <div>
              <div class="list-header">
                <span class="list-id">{{ requisition.requisition_number }}</span>
                <Tag :type="getRequisitionStatusType(requisition.status)" size="medium">
                  {{ getRequisitionStatusText(requisition.status) }}
                </Tag>
              </div>

              <div class="list-title">申请人: {{ requisition.real_name }}</div>

              <div class="list-details">
                <div class="list-row">
                  <span class="label">申请日期:</span>
                  <span class="value">{{ formatDate(requisition.request_date) }}</span>
                </div>
                <div class="list-row" v-if="requisition.materials_count">
                  <span class="label">物料数量:</span>
                  <span class="value">{{ requisition.materials_count }} 项</span>
                </div>
                <div class="list-row" v-if="requisition.total_amount">
                  <span class="label">预估金额:</span>
                  <span class="value amount">¥{{ formatAmount(requisition.total_amount) }}</span>
                </div>
                <div class="list-row" v-if="requisition.remarks">
                  <span class="label">备注:</span>
                  <span class="value">{{ requisition.remarks }}</span>
                </div>
              </div>

              <div class="list-actions">
                <Button
                  size="small"
                  type="primary"
                  plain
                  @click.stop="viewRequisitionDetail(requisition.id)"
                >
                  查看详情
                </Button>
                <Button
                  v-if="requisition.status === 'draft'"
                  size="small"
                  type="success"
                  plain
                  @click.stop="submitRequisition(requisition)"
                >
                  提交申请
                </Button>
                <Button
                  v-if="requisition.status === 'approved'"
                  size="small"
                  type="warning"
                  plain
                  @click.stop="createOrder(requisition)"
                >
                  创建订单
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
  const requisitionList = ref([])
  const activeTab = ref(0)

  // 状态标签
  const statusTabs = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'draft' },
    { label: '已提交', value: 'submitted' },
    { label: '已批准', value: 'approved' },
    { label: '已拒绝', value: 'rejected' },
    { label: '已完成', value: 'completed' }
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

  // 创建申请
  const createRequisition = () => {
    router.push('/purchase/requisitions/create')
  }

  // 搜索
  const onSearch = (val) => {
    searchValue.value = val
    resetList()
    loadRequisitionList()
  }

  // 切换标签
  const switchTab = (index) => {
    activeTab.value = index
    resetList()
    loadRequisitionList()
  }

  // 下拉刷新
  const onRefresh = () => {
    resetList()
    loadRequisitionList().finally(() => {
      refreshing.value = false
      showToast('刷新成功')
    })
  }

  // 重置列表
  const resetList = () => {
    requisitionList.value = []
    pagination.page = 1
    finished.value = false
  }

  // 加载更多
  const onLoad = () => {
    loadRequisitionList()
  }

  // 加载申请单列表
  const loadRequisitionList = async () => {
    if (loading.value) return

    loading.value = true
    try {
      const params = {
        page: pagination.page,
        pageSize: pagination.limit,
        requisitionNo: searchValue.value || undefined,
        status: statusTabs[activeTab.value].value || undefined
      }

      const response = await purchaseApi.getRequisitions(params)

      if (response.data && (response.data.list || response.data.items || response.data.rows)) {
        const dataItems = response.data.list || response.data.items || response.data.rows
        requisitionList.value = [...requisitionList.value, ...dataItems]
        pagination.total = response.data.total || 0
        finished.value = requisitionList.value.length >= pagination.total
      } else {
        finished.value = true
      }

      pagination.page++
    } catch (error) {
      console.error('获取采购申请列表失败:', error)
      showToast('获取采购申请列表失败')
      finished.value = true
    } finally {
      loading.value = false
    }
  }

  // 获取申请状态类型
  const getRequisitionStatusType = (status) => {
    const statusMap = {
      draft: 'default',
      submitted: 'primary',
      approved: 'success',
      rejected: 'danger',
      completed: 'success'
    }
    return statusMap[status] || 'default'
  }

  // 获取申请状态文本
  const getRequisitionStatusText = (status) => {
    const statusMap = {
      draft: '草稿',
      submitted: '已提交',
      approved: '已批准',
      rejected: '已拒绝',
      completed: '已完成'
    }
    return statusMap[status] || status
  }

  // 格式化金额
  const formatAmount = (amount) => {
    if (!amount) return '0.00'
    return parseFloat(amount).toFixed(2)
  }

  // 查看申请详情
  const viewRequisitionDetail = (id) => {
    router.push(`/purchase/requisitions/${id}`)
  }

  // 提交申请
  const submitRequisition = async (requisition) => {
    try {
      await showConfirmDialog({
        title: '提交申请',
        message: `确定要提交申请 ${requisition.requisition_number} 吗？`
      })

      await purchaseApi.updateRequisitionStatus(requisition.id, 'submitted')
      showToast('申请已提交')

      // 更新本地状态
      requisition.status = 'submitted'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('提交申请失败:', error)
        showToast('提交申请失败')
      }
    }
  }

  // 创建订单
  const createOrder = (requisition) => {
    router.push(`/purchase/orders/new?requisitionId=${requisition.id}`)
  }

  onMounted(() => {
    loadRequisitionList()
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

/* 业务自定义CSS已移除，列表由全局.list-*托管 */
</style>
