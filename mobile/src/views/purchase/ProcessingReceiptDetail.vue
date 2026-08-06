<template>
  <div class="detail-page">
    <NavBar title="外协入库详情" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="state">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else-if="receipt" class="content">
      <div class="hero">
        <div>
          <div class="code">{{ receipt.receiptNo || receipt.receiptCode || receipt.receiptCode || '-' }}</div>
          <div class="name">{{ receipt.supplierName || '未关联供应商' }}</div>
        </div>
        <Tag :type="statusType(receipt.status)">{{ statusText(receipt.status) }}</Tag>
      </div>

      <CellGroup inset title="基本信息">
        <Cell title="加工单号" :value="receipt.processingNo || '-'" />
        <Cell title="入库日期" :value="dateText(receipt.receiptDate)" />
        <Cell title="经办人" :value="receipt.operator || '-'" />
        <Cell title="备注" :label="receipt.remarks || '-'" />
      </CellGroup>

      <CellGroup inset title="入库明细">
        <div v-if="items.length" class="items">
          <div v-for="item in items" :key="item.id || item.productId" class="item-row">
            <div>
              <div class="item-title">{{ item.productName || item.materialName || item.productName || item.materialName || `产品#${item.productId}` }}</div>
              <div class="item-subtitle">{{ item.productCode || item.specification || '-' }}</div>
            </div>
            <div class="qty">
              <strong>{{ item.actualQuantity || item.quantity || 0 }}</strong>
              <span>{{ item.unitName || item.unit || item.unitName || '' }}</span>
            </div>
          </div>
        </div>
        <Empty v-else description="暂无入库明细" />
      </CellGroup>

      <div v-if="nextAction" class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleNextStatus">
          {{ nextAction.label }}
        </Button>
      </div>
    </div>

    <Empty v-else description="外协入库单不存在" />
  </div>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Empty, Loading, NavBar, Tag, showConfirmDialog, showToast } from 'vant'
  import { purchaseApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(true)
  const submitting = ref(false)
  const receipt = ref(null)

  const items = computed(() => receipt.value?.items || [])
  const nextAction = computed(() => {
    if (receipt.value?.status === 'pending') return { status: 'confirmed', label: '确认入库' }
    if (receipt.value?.status === 'confirmed') return { status: 'completed', label: '完成入库' }
    return null
  })

  const dateText = (value) => (value ? String(value).slice(0, 10) : '-')
  const statusText = (status) =>
    ({ pending: '待确认', confirmed: '已确认', completed: '已完成', cancelled: '已取消' })[status] || status || '-'
  const statusType = (status) =>
    ({ pending: 'warning', confirmed: 'primary', completed: 'success', cancelled: 'default' })[status] || 'default'

  const fetchDetail = async () => {
    loading.value = true
    try {
      const response = await purchaseApi.getProcessingReceipt(route.params.id)
      receipt.value = extractApiData(response, null)
    } catch (error) {
      console.error('加载外协入库详情失败:', error)
    } finally {
      loading.value = false
    }
  }

  const handleNextStatus = async () => {
    if (!nextAction.value) return
    try {
      await showConfirmDialog({ title: nextAction.value.label, message: '确认执行该操作？' })
      submitting.value = true
      await purchaseApi.updateProcessingReceiptStatus(route.params.id, nextAction.value.status)
      showToast({ type: 'success', message: '状态已更新' })
      await fetchDetail()
    } catch (error) {
      if (error !== 'cancel') console.error('更新外协入库状态失败', error)
    } finally {
      submitting.value = false
    }
  }

  onMounted(fetchDetail)
</script>

<style lang="scss" scoped>
  .detail-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .hero {
    margin: 0 12px 12px;
    padding: 16px;
    border-radius: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--surface-border);
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }

  .code {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .name,
  .item-subtitle,
  .qty span {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .items {
    padding: 0 12px var(--app-bottom-space);
  }

  .item-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid var(--surface-border);
  }

  .item-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .qty {
    text-align: right;
    strong,
    span {
      display: block;
    }
  }

  .submit-area {
    padding: 20px 16px;
  }

  .state {
    padding-top: 35vh;
  }
</style>
