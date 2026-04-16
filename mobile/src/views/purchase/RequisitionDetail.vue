<!--
/**
 * RequisitionDetail.vue - 采购申请详情
 * @description 采购申请单详情页面 - 替代GenericListView占位
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="采购申请详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="detail">
      <!-- 状态卡片 -->
      <div class="status-card">
        <div class="status-badge" :class="detail.status">
          {{ statusMap[detail.status] || detail.status }}
        </div>
        <div class="detail-code">
          {{ detail.requisition_code || detail.code || `申请#${detail.id}` }}
        </div>
      </div>

      <!-- 基本信息 -->
      <CellGroup inset title="申请信息">
        <Cell title="申请日期" :value="formatDate(detail.request_date || detail.created_at)" />
        <Cell title="申请部门" :value="detail.department || '--'" />
        <Cell title="申请人" :value="detail.requester_name || detail.created_by || '--'" />
        <Cell title="备注" :value="detail.remarks || '--'" />
      </CellGroup>

      <!-- 物料明细 -->
      <CellGroup inset title="需求明细" v-if="detail.items && detail.items.length > 0">
        <div v-for="(item, index) in detail.items" :key="index" class="item-card">
          <Cell
            :title="item.material_name || `物料#${item.material_id}`"
            :value="`${item.quantity} ${item.unit || '件'}`"
          />
          <Cell
            v-if="item.required_date"
            title="需求日期"
            :value="formatDate(item.required_date)"
          />
        </div>
      </CellGroup>

      <!-- 审批操作 -->
      <div class="action-section" v-if="detail.status === 'pending' || detail.status === 'draft'">
        <Button round block type="primary" @click="handleApprove" :loading="approving">
          审批通过
        </Button>
      </div>
    </div>

    <div v-else class="loading-container">
      <Loading size="36" />
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { NavBar, CellGroup, Cell, Button, Loading, showToast, showConfirmDialog } from 'vant'
  import { purchaseApi } from '@/services/api'

  const route = useRoute()
  const router = useRouter()
  const detail = ref(null)
  const approving = ref(false)

  const statusMap = {
    draft: '草稿',
    pending: '待审批',
    approved: '已审批',
    rejected: '已拒绝',
    completed: '已完成',
    cancelled: '已取消'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const loadDetail = async () => {
    try {
      const response = await purchaseApi.getRequisition(route.params.id)
      detail.value = response.data || response
    } catch (error) {
      console.error('加载采购申请详情失败:', error)
      showToast('加载详情失败')
    }
  }

  const handleApprove = async () => {
    try {
      await showConfirmDialog({ title: '确认', message: '确定审批通过该采购申请？' })
      approving.value = true
      await purchaseApi.updateRequisitionStatus(route.params.id, 'approved')
      showToast('审批通过')
      detail.value.status = 'approved'
    } catch (error) {
      if (error === 'cancel') return
      showToast('操作失败')
    } finally {
      approving.value = false
    }
  }

  onMounted(() => {
    loadDetail()
  })
</script>

<style scoped>
  .detail-page {
    min-height: 100vh;
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
    color: var(--text-primary);
    margin-bottom: 8px;
    background: var(--text-tertiary);
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
</style>
