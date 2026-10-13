<!--
/**
 * RequisitionDetail.vue - 采购申请详情
 * @description 采购申请单详情页面 - 对齐网页端操作逻辑
 * @date 2026-04-25
 * @version 2.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="采购申请详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="detail">
      <!-- 状态卡片 -->
      <div class="status-card">
        <div class="status-badge" :class="detail.isFullyOrdered ? 'completed' : detail.status">
          {{ detail.isFullyOrdered ? '已生成订单' : detail.isPartiallyOrdered ? '部分生成订单' : statusMap[detail.status] || detail.status }}
        </div>
        <div class="detail-code">
          {{ detail.requisitionNumber || detail.requisitionCode || detail.code || '未生成申请单号' }}
        </div>
      </div>

      <!-- 基本信息 -->
      <CellGroup inset title="申请信息">
        <Cell title="申请日期" :value="formatDate(detail.requestDate || detail.createdAt)" />
        <Cell title="申请部门" :value="detail.department || '--'" />
        <Cell title="申请人" :value="detail.requesterName || detail.realName || detail.createdBy || '--'" />
        <Cell title="备注" :value="detail.remarks || '--'" />
      </CellGroup>

      <!-- 物料明细 -->
      <CellGroup inset title="需求明细" v-if="detail.items && detail.items.length > 0">
        <div v-for="(item, index) in detail.items" :key="index" class="item-card">
          <Cell
            :title="item.materialName || item.materialCode || '未命名物料'"
            :value="`${item.quantity} ${item.unit || '件'}`"
          />
          <Cell
            v-if="item.requiredDate"
            title="需求日期"
            :value="formatDate(item.requiredDate)"
          />
        </div>
      </CellGroup>

      <!-- 提交后直接生成采购订单 -->
      <div class="action-section">
        <Button v-if="canSubmit" round block type="primary" @click="handleSubmit" :loading="actionLoading" v-permission="'purchase:requisitions:update'"
          style="margin-bottom: 10px">
          {{ detail.isPartiallyOrdered ? '生成剩余订单' : '提交并生成采购订单' }}
        </Button>
        <Button v-if="detail.status === 'draft'" round block type="danger" plain @click="handleDelete" :loading="actionLoading" v-permission="'purchase:requisitions:delete'">
          删除申请
        </Button>
      </div>
    </div>

    <div v-else-if="loading" class="loading-container">
      <Loading size="36" vertical>加载中...</Loading>
    </div>

    <div v-else class="error-container">
      <Empty :description="errorMessage || '采购申请不存在或已被删除'" />
      <div class="error-actions">
        <Button type="primary" size="small" :loading="loading" @click="loadDetail">重试</Button>
        <Button type="default" size="small" @click="goBack">返回列表</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, CellGroup, Cell, Button, Loading, Empty, showToast, showConfirmDialog } from 'vant'
  import { purchaseApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'
  import { getApiErrorMessage } from '@/utils/errorHandler'

  const route = useRoute()
  const router = useRouter()
  const detail = ref(null)
  const loading = ref(true)
  const errorMessage = ref('')
  const actionLoading = ref(false)

  const statusMap = {
    draft: '草稿',
    submitted: '待提交',
    pending: '待提交',
    approved: '待提交',
    rejected: '待提交',
    completed: '已生成订单',
    cancelled: '已取消'
  }

  const canSubmit = computed(() => detail.value && !detail.value.isFullyOrdered &&
    ['draft', 'submitted', 'pending', 'approved', 'rejected', 'completed'].includes(detail.value.status))

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const loadDetail = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      const response = await purchaseApi.getRequisition(route.params.id)
      detail.value = extractApiData(response, null)
      if (detail.value) detail.value.items = detail.value.items || detail.value.materials || []
      if (!detail.value) {
        errorMessage.value = '采购申请不存在或已被删除'
      }
    } catch (error) {
      console.error('加载采购申请详情失败:', error)
      detail.value = null
      const fallback = error?.response?.status === 403
        ? '没有权限查看此采购申请'
        : error?.response?.status === 404
          ? '采购申请不存在或已被删除'
          : '加载失败，请重试'
      errorMessage.value = error?.response?.status === 403 || error?.response?.status === 404
        ? fallback
        : getApiErrorMessage(error, fallback)
      showToast(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  const goBack = () => router.back()

  // 提交并自动生成订单
  const handleSubmit = async () => {
    if (actionLoading.value || !canSubmit.value) return
    actionLoading.value = true
    try {
      await purchaseApi.updateRequisitionStatus(route.params.id, 'submitted')
      showToast('已提交并生成采购订单')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(getApiErrorMessage(e, '操作失败'))
    } finally {
      actionLoading.value = false
    }
  }

  // 草稿 → 删除
  const handleDelete = async () => {
    try {
      await showConfirmDialog({ title: '删除确认', message: '确定删除该采购申请？此操作不可撤销。' })
      actionLoading.value = true
      await purchaseApi.deleteRequisition(route.params.id)
      showToast('已删除')
      router.back()
    } catch (e) {
      if (e !== 'cancel') showToast(getApiErrorMessage(e, '删除失败'))
    } finally {
      actionLoading.value = false
    }
  }

  onMounted(() => {
    loadDetail()
  })
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
    background-color: var(--van-background-2);
  }
  .content-container {
    padding: 12px;
  }
  .status-card {
    background: var(--van-background);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 12px;
    text-align: center;
    border: 1px solid var(--van-border-color);
  }
  .status-badge {
    display: inline-block;
    padding: 4px 16px;
    border-radius: 20px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-on-primary, #fff);
    margin-bottom: 8px;

    &.draft {
      background: var(--text-tertiary);
    }
    &.pending,
    &.submitted,
    &.approved,
    &.rejected {
      background: var(--color-warning);
    }
    &.completed {
      background: var(--color-primary);
    }
    &.cancelled {
      background: var(--text-secondary);
    }
  }
  .detail-code {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--van-text-color);
  }
  .item-card {
    border-bottom: 1px dashed var(--van-border-color);
  }
  .item-card:last-child {
    border-bottom: none;
  }
  .action-section {
    padding: 24px 16px;
  }
  .loading-container {
    display: flex;
    justify-content: center;
    padding: 60px 0;
  }

  .error-container {
    padding: 48px 16px;
    text-align: center;
  }

  .error-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
  }
</style>
