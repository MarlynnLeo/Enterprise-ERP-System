<template>
  <div class="detail-page">
    <NavBar title="采购退货详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="detail">
      <div class="status-card">
        <div class="status-badge" :class="detail.status">
          {{ statusMap[detail.status] || detail.status }}
        </div>
        <div class="detail-code">
          {{ detail.returnNo || `退货单#${detail.id}` }}
        </div>
      </div>

      <CellGroup inset title="退货信息">
        <Cell title="供应商" :value="detail.supplierName || '--'" />
        <Cell title="关联入库单" :value="detail.receiptNo || '--'" />
        <Cell title="退货仓库" :value="detail.warehouseName || '--'" />
        <Cell title="退货日期" :value="formatDate(detail.returnDate || detail.createdAt)" />
        <Cell title="经办人" :value="detail.operatorName || detail.operator || '--'" />
        <Cell title="退货原因" :value="detail.reason || '--'" />
        <Cell title="备注" :value="detail.remarks || '--'" />
      </CellGroup>

      <CellGroup inset title="退货明细" v-if="detail.items?.length">
        <Cell
          v-for="item in detail.items"
          :key="item.id"
          :title="item.materialName || `物料#${item.materialId}`"
          :value="`${item.quantity || item.returnQuantity || 0} ${item.unitName || item.unit || '件'}`"
          :label="item.materialCode || item.specification || ''"
        />
      </CellGroup>

      <div class="action-section" v-if="['draft', 'confirmed'].includes(detail.status)" v-permission="'purchase:returns:update'">
        <template v-if="detail.status === 'draft'">
          <Button round block type="primary" :loading="actionLoading" @click="handleConfirm">
            确认退货
          </Button>
          <Button round block type="warning" plain :loading="actionLoading" class="mt-10" @click="handleCancel">
            取消退货
          </Button>
        </template>
        <template v-else>
          <Button round block type="success" :loading="actionLoading" @click="handleComplete">
            完成退货
          </Button>
          <Button round block type="warning" plain :loading="actionLoading" class="mt-10" @click="handleCancel">
            取消退货
          </Button>
        </template>
      </div>
    </div>

    <div v-else-if="loading" class="loading-container">
      <Loading size="36" vertical>加载中...</Loading>
    </div>

    <div v-else class="error-container">
      <Empty :description="errorMessage || '采购退货单不存在或已被删除'" />
      <div class="error-actions">
        <Button type="primary" size="small" :loading="loading" @click="loadDetail">重试</Button>
        <Button type="default" size="small" @click="goBack">返回列表</Button>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, CellGroup, Cell, Button, Loading, Empty, showToast, showConfirmDialog } from 'vant'
  import { purchaseApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'

  const route = useRoute()
  const router = useRouter()
  const detail = ref(null)
  const loading = ref(true)
  const errorMessage = ref('')
  const actionLoading = ref(false)

  const statusMap = {
    draft: '草稿',
    confirmed: '已确认',
    completed: '已完成',
    cancelled: '已取消'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const loadDetail = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      const response = await purchaseApi.getReturn(route.params.id)
      detail.value = extractApiData(response, null)
      if (!detail.value) {
        errorMessage.value = '采购退货单不存在或已被删除'
      }
    } catch (error) {
      console.error('加载采购退货详情失败:', error)
      detail.value = null
      errorMessage.value = error?.response?.status === 403
        ? '没有权限查看此采购退货单'
        : error?.response?.status === 404
          ? '采购退货单不存在或已被删除'
          : '加载失败，请重试'
      showToast(errorMessage.value)
    } finally {
      loading.value = false
    }
  }

  const goBack = () => router.back()

  const updateStatus = async (status, title, message, successMessage) => {
    try {
      await showConfirmDialog({ title, message })
      actionLoading.value = true
      await purchaseApi.updateReturnStatus(route.params.id, status)
      showToast(successMessage)
      await loadDetail()
    } catch (error) {
      if (error !== 'cancel') {
        console.error('更新采购退货状态失败:', error)
        showToast(error.response?.data?.message || '操作失败')
      }
    } finally {
      actionLoading.value = false
    }
  }

  const handleConfirm = () =>
    updateStatus('confirmed', '确认退货', '确定确认该采购退货单？', '退货单已确认')

  const handleComplete = () =>
    updateStatus('completed', '完成退货', '确定完成该采购退货？库存将相应扣减。', '退货已完成')

  const handleCancel = () =>
    updateStatus('cancelled', '取消退货', '确定取消该采购退货单？', '退货单已取消')

  onMounted(loadDetail)
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
    color: var(--color-on-primary, #fff);
    margin-bottom: 8px;

    &.draft {
      background: var(--text-tertiary);
    }
    &.confirmed {
      background: var(--color-primary);
    }
    &.completed {
      background: var(--color-success);
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
  .action-section {
    padding: 24px 16px;
  }
  .mt-10 {
    margin-top: 10px;
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
