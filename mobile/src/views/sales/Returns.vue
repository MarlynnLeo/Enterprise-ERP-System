<!--
/**
 * Returns.vue
 * @description 移动端应用文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="page-container">
    <NavBar title="销售退货" left-arrow @click-left="onClickLeft">
      <template #right>
        <Icon name="plus" size="18" @click="createReturn" />
      </template>
    </NavBar>

    <div class="content-container">
      <!-- 搜索和筛选 -->
      <div class="search-filter">
        <Search
          v-model="searchValue"
          placeholder="搜索退货单号或客户名称"
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

      <!-- 退货单列表 -->
      <PullRefresh v-model="refreshing" @refresh="onRefresh">
        <List
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多数据了"
          @load="loadMore"
        >
          <div v-if="returnList.length === 0 && !loading" class="empty-state">
            <Empty description="暂无销售退货单" />
          </div>

          <div
            v-for="returnItem in returnList"
            :key="returnItem.id"
            class="global-list-card"
            @click="viewReturnDetail(returnItem.id)"
          >
            <div>
              <div class="list-header">
                <span class="list-id">{{ returnItem.return_no }}</span>
                <Tag :type="getReturnStatusType(returnItem.status)" size="medium">
                  {{ getReturnStatusText(returnItem.status) }}
                </Tag>
              </div>

              <div class="list-subtitle" v-if="returnItem.order_no">
                关联订单: {{ returnItem.order_no }}
              </div>

              <div class="list-title">{{ returnItem.customer_name }}</div>

              <div class="list-details">
                <div class="list-row">
                  <span class="label">退货日期:</span>
                  <span class="value">{{ formatDate(returnItem.return_date) }}</span>
                </div>
                <div class="list-row" v-if="returnItem.total_amount">
                  <span class="label">退货金额:</span>
                  <span class="value amount">¥{{ formatAmount(returnItem.total_amount) }}</span>
                </div>
                <div class="list-row" v-if="returnItem.return_reason">
                  <span class="label">退货原因:</span>
                  <span class="value">{{ returnItem.return_reason }}</span>
                </div>
                <div class="list-row" v-if="returnItem.contact_person">
                  <span class="label">联系人:</span>
                  <span class="value">{{ returnItem.contact_person }}</span>
                </div>
              </div>

              <div class="list-details" v-if="returnItem.items && returnItem.items.length > 0">
                <div class="list-title" style="font-size:0.8125rem;margin-bottom:8px;">退货物料 ({{ returnItem.items.length }}项)</div>
                <div
                  v-for="(item, index) in returnItem.items.slice(0, 2)"
                  :key="index"
                  class="list-row"
                >
                  <span class="label" style="color:var(--text-primary)">{{ item.material_name }}</span>
                  <span class="value">{{ item.quantity }} {{ item.unit_name }}</span>
                </div>
                <div v-if="returnItem.items.length > 2" class="list-row" style="justify-content:center;margin-top:8px;">
                  <span class="label">还有 {{ returnItem.items.length - 2 }} 项...</span>
                </div>
              </div>

              <div class="list-actions">
                <Button
                  size="small"
                  type="primary"
                  plain
                  @click.stop="viewReturnDetail(returnItem.id)"
                >
                  查看详情
                </Button>
                <Button
                  v-if="returnItem.status === 'draft'"
                  size="small"
                  type="success"
                  plain
                  @click.stop="confirmReturn(returnItem)"
                >
                  确认退货
                </Button>
                <Button
                  v-if="returnItem.status === 'confirmed'"
                  size="small"
                  type="warning"
                  plain
                  @click.stop="processReturn(returnItem)"
                >
                  处理退货
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
    Card,
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
  import { SALES_RETURN_STATUS, getDictText } from '@/constants/dict'

  const router = useRouter()
  const searchValue = ref('')
  const activeTab = ref(0)

  // 状态标签
  const statusTabs = [
    { label: '全部', value: '' },
    { label: '草稿', value: 'draft' },
    { label: '待处理', value: 'pending' },
    { label: '已审核', value: 'approved' },
    { label: '已完成', value: 'completed' },
    { label: '已拒绝', value: 'rejected' },
    { label: '已取消', value: 'cancelled' }
  ]

  // 初始化分页 Hook
  const {
    list: returnList,
    loading,
    finished,
    refreshing,
    onLoad,
    onRefresh
  } = usePagination(salesApi.getSalesReturns, { immediate: true })

  // 返回上一页
  const onClickLeft = () => router.back()

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

  // 初次挂载或标签搜索时传递参数
  const loadMore = () => {
    onLoad({
      search: searchValue.value || undefined,
      status: statusTabs[activeTab.value].value || undefined
    })
  }

  // 创建退货单
  const createReturn = () => {
    router.push('/inventory/inbound/create')
  }

  // 获取退货单状态类型
  const getReturnStatusType = (status) => {
    const statusMap = {
      draft: 'default',
      pending: 'warning',
      approved: 'primary',
      completed: 'success',
      rejected: 'danger',
      cancelled: 'default'
    }
    return statusMap[status] || 'default'
  }

  // 获取退货单状态文本
  const getReturnStatusText = (status) => getDictText(SALES_RETURN_STATUS, status, status)

  // 查看详情
  const viewReturnDetail = (id) => router.push(`/sales/returns/${id}`)

  // 确认退单
  const confirmReturn = async (returnItem) => {
    try {
      await showConfirmDialog({
        title: '确认退单',
        message: `确定要提交退单 ${returnItem.return_no || returnItem.return_code} 吗？`
      })

      // API Call placeholder
      showToast('退单已提交')
      returnItem.status = 'pending'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('提交退货失败:', error)
        showToast('提交失败')
      }
    }
  }

  // 处理退单
  const processReturn = async (returnItem) => {
    try {
      await showConfirmDialog({
        title: '处理退货',
        message: `确定要处理退单 ${returnItem.return_no || returnItem.return_code} 吗？`
      })

      // API Call placeholder
      showToast('退单已开始处理')
      returnItem.status = 'approved'
    } catch (error) {
      if (error !== 'cancel') {
        console.error('处理退货失败:', error)
        showToast('处理失败')
      }
    }
  }
</script>

<style lang="scss" scoped>
  .search-filter {
    padding: $padding-md;
    background-color: white;
    border-bottom: 1px solid var(--van-border-color);
  }

  .filter-tabs {
    display: flex;
    margin-top: $margin-sm;
    overflow-x: auto;

    &::-webkit-scrollbar {
      display: none;
    }

    .filter-tab {
      flex: 0 0 auto;
      text-align: center;
      padding: $padding-xs $padding-sm;
      font-size: 12px;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      margin-right: $margin-sm;

      &.active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
      }
    }
  }

/* 业务自定义CSS已移除，列表由全局.list-*托管 */
</style>
