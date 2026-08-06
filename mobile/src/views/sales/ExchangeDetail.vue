<template>
  <div class="detail-page">
    <NavBar title="换货详情" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="state">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else-if="exchange" class="content">
      <div class="hero">
        <div>
          <div class="code">{{ exchange.exchangeNo || '-' }}</div>
          <div class="name">{{ exchange.customerName || '未关联客户' }}</div>
        </div>
        <Tag :type="statusType(exchange.status)">{{ statusText(exchange.status) }}</Tag>
      </div>

      <CellGroup inset title="基本信息">
        <Cell title="销售订单" :value="exchange.orderNo || '-'" />
        <Cell title="换货日期" :value="dateText(exchange.exchangeDate)" />
        <Cell title="联系电话" :value="exchange.contact_phone || '-'" />
        <Cell title="换货原因" :label="exchange.exchangeReason || '-'" />
        <Cell title="差价" :value="money(exchange.differenceAmount ?? exchange.difference_amount)" />
      </CellGroup>

      <CellGroup inset title="退回商品">
        <div v-if="returnItems.length" class="items">
          <div v-for="(item, index) in returnItems" :key="`return-${index}`" class="item-row">
            <div>
              <div class="item-title">{{ item.productName || item.productCode }}</div>
              <div class="item-subtitle">{{ item.specification || item.returnReason || '-' }}</div>
            </div>
            <strong>{{ item.returnQuantity || item.quantity || 0 }} {{ item.unitName || '' }}</strong>
          </div>
        </div>
        <Empty v-else description="暂无退回商品" />
      </CellGroup>

      <CellGroup inset title="换出商品">
        <div v-if="newItems.length" class="items">
          <div v-for="(item, index) in newItems" :key="`new-${index}`" class="item-row">
            <div>
              <div class="item-title">{{ item.productName || item.productCode }}</div>
              <div class="item-subtitle">{{ item.specification || item.newReason || '-' }}</div>
            </div>
            <strong>{{ item.newQuantity || item.quantity || 0 }} {{ item.unitName || '' }}</strong>
          </div>
        </div>
        <Empty v-else description="暂无换出商品" />
      </CellGroup>

      <div v-if="nextStatus" class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleNextStatus">
          {{ nextStatus.label }}
        </Button>
      </div>
    </div>

    <Empty v-else description="换货单不存在" />
  </div>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Empty, Loading, NavBar, Tag, showConfirmDialog, showToast } from 'vant'
  import { salesApi } from '@/api'
  import { extractApiData } from '@/utils/apiHelper'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(true)
  const submitting = ref(false)
  const exchange = ref(null)

  const returnItems = computed(() => exchange.value?.returnItems || exchange.value?.items?.filter((item) => item.item_type === 'return') || [])
  const newItems = computed(() => exchange.value?.newItems || exchange.value?.items?.filter((item) => item.item_type === 'new') || [])
  const nextStatus = computed(() => {
    if (exchange.value?.status === 'pending') return { status: 'processing', label: '开始处理' }
    if (exchange.value?.status === 'processing') return { status: 'completed', label: '完成换货' }
    return null
  })

  const money = (value) => {
    if (value === null || value === undefined || value === '') return '--'
    const amount = Number(value)
    return Number.isNaN(amount) ? '--' : `¥${amount.toFixed(2)}`
  }
  const dateText = (value) => (value ? String(value).slice(0, 10) : '-')
  const statusText = (status) =>
    ({ pending: '待处理', processing: '处理中', completed: '已完成', cancelled: '已取消' })[status] || status || '-'
  const statusType = (status) =>
    ({ pending: 'warning', processing: 'primary', completed: 'success', cancelled: 'default' })[status] || 'default'

  const fetchDetail = async () => {
    loading.value = true
    try {
      const response = await salesApi.getSalesExchange(route.params.id)
      exchange.value = extractApiData(response, null)
    } catch (error) {
      console.error('加载换货详情失败:', error)
    } finally {
      loading.value = false
    }
  }

  const handleNextStatus = async () => {
    if (!nextStatus.value) return
    try {
      await showConfirmDialog({ title: nextStatus.value.label, message: '确认执行该操作？' })
      submitting.value = true
      await salesApi.updateSalesExchangeStatus(route.params.id, nextStatus.value.status)
      showToast({ type: 'success', message: '状态已更新' })
      await fetchDetail()
    } catch (error) {
      if (error !== 'cancel') console.error('更新换货状态失败', error)
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
  .item-subtitle {
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

  .submit-area {
    padding: 20px 16px;
  }

  .state {
    padding-top: 35vh;
  }
</style>
