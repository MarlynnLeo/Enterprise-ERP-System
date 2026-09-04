<!--
/**
 * ReturnDetail.vue - 销售退货详情
 * @description 销售退货详情页面
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="销售退货详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="detail">
      <div class="status-card">
        <div class="status-badge" :class="getDictClass(SALES_RETURN_STATUS, detail.status)">
          {{ getDictText(SALES_RETURN_STATUS, detail.status) }}
        </div>
        <div class="detail-code">
          {{ detail.returnNo || detail.returnCode || `退货单#${detail.id}` }}
        </div>
      </div>

      <CellGroup inset title="退货信息">
        <Cell title="客户名称" :value="detail.customerName || '--'" />
        <Cell title="关联订单" :value="detail.orderCode || '--'" />
        <Cell title="退货日期" :value="formatDate(detail.returnDate || detail.createdAt)" />
        <Cell title="退货金额" :value="displayAmount(detail.totalAmount)" />
        <Cell title="退货原因" :value="detail.reason || '--'" />
      </CellGroup>

      <CellGroup inset title="退货明细" v-if="detail.items && detail.items.length > 0">
        <Cell
          v-for="(item, index) in detail.items"
          :key="index"
          :title="item.materialName || item.productName || item.materialName || item.productName || `物料#${item.materialId}`"
          :value="`${item.quantity} ${item.unit || '件'}`"
          :label="`退货原因: ${item.reason || '--'}`"
        />
      </CellGroup>

      <CellGroup inset title="备注" v-if="detail.remarks">
        <Cell :title="detail.remarks" />
      </CellGroup>

      <!-- 操作按钮 -->
      <div class="action-section" v-if="detail.status === 'pending'" v-permission="'sales:returns:update'">
        <Button round block type="success" @click="handleApprove" :loading="actionLoading" style="margin-bottom: 10px">
          审批通过
        </Button>
        <Button round block type="danger" @click="handleReject" :loading="actionLoading">
          拒绝退货
        </Button>
      </div>
      <div class="action-section" v-else-if="detail.status === 'approved'" v-permission="'sales:returns:update'">
        <Button round block type="primary" @click="handleComplete" :loading="actionLoading">
          完成退货
        </Button>
      </div>
    </div>

    <div v-else-if="loading" class="loading-container">
      <Loading size="36" vertical>加载中...</Loading>
    </div>

    <div v-else class="error-container">
      <Empty :description="errorMessage || '销售退货单不存在或已被删除'" />
      <div class="error-actions">
        <Button type="primary" size="small" :loading="loading" @click="loadDetail">重试</Button>
        <Button type="default" size="small" @click="goBack">返回列表</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { computed, ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, CellGroup, Cell, Button, Loading, Empty, showToast, showConfirmDialog } from 'vant'
  import { salesApi } from '@/api'
  import { useAuthStore } from '@/stores/auth'
  import { canViewMaterialPrices, formatMaskedPrice } from '@/utils/priceVisibility'
  import { extractApiData } from '@/utils/apiHelper'
  import { SALES_RETURN_STATUS, getDictText, getDictClass } from '@/constants/dict'

  const route = useRoute()
  const router = useRouter()
  const authStore = useAuthStore()
  const canViewPrice = computed(() => canViewMaterialPrices(authStore.hasPermission))
  const displayAmount = (amount) => formatMaskedPrice(amount, canViewPrice.value)
  const detail = ref(null)
  const loading = ref(true)
  const errorMessage = ref('')
  const actionLoading = ref(false)

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const loadDetail = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      const response = await salesApi.getSalesReturn(route.params.id)
      detail.value = extractApiData(response, null)
      if (!detail.value) {
        errorMessage.value = '销售退货单不存在或已被删除'
      }
    } catch (error) {
      detail.value = null
      errorMessage.value = error?.response?.status === 403
        ? '没有权限查看此销售退货单'
        : error?.response?.status === 404
          ? '销售退货单不存在或已被删除'
          : '加载失败，请重试'
      showToast(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  const goBack = () => router.back()

  // 审批通过
  const handleApprove = async () => {
    try {
      await showConfirmDialog({ title: '审批确认', message: '确定审批通过此退货申请？' })
      actionLoading.value = true
      await salesApi.updateSalesReturnStatus(detail.value.id, 'approved')
      showToast('审批通过')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
    } finally {
      actionLoading.value = false
    }
  }

  // 拒绝退货
  const handleReject = async () => {
    try {
      await showConfirmDialog({ title: '拒绝确认', message: '确定拒绝此退货申请？' })
      actionLoading.value = true
      await salesApi.updateSalesReturnStatus(detail.value.id, 'rejected')
      showToast('已拒绝')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
    } finally {
      actionLoading.value = false
    }
  }

  // 完成退货
  const handleComplete = async () => {
    try {
      await showConfirmDialog({ title: '完成确认', message: '确定完成此退货？退货商品将入库。' })
      actionLoading.value = true
      await salesApi.updateSalesReturnStatus(detail.value.id, 'completed')
      showToast('退货完成')
      await loadDetail()
    } catch (e) {
      if (e !== 'cancel') showToast(e.response?.data?.message || '操作失败')
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
    padding-bottom: var(--app-bottom-space);
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
    color: var(--text-primary);
    margin-bottom: 8px;
    background: var(--text-tertiary);
  }
  .detail-code {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--van-text-color);
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

  .action-section {
    padding: 20px 16px;
  }
</style>
