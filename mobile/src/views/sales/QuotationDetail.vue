<template>
  <div class="detail-page">
    <NavBar title="报价详情" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="state">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else-if="quotation" class="content">
      <div class="hero">
        <div>
          <div class="code">{{ quotation.quotation_no || quotation.quotation_code || '-' }}</div>
          <div class="name">{{ quotation.customer_name || quotation.customerName || '未关联客户' }}</div>
        </div>
        <Tag :type="statusType(quotation.status)">{{ statusText(quotation.status) }}</Tag>
      </div>

      <CellGroup inset title="基本信息">
        <Cell title="报价金额" :value="money(quotation.total_amount)" />
        <Cell title="有效期至" :value="dateText(quotation.validity_date || quotation.valid_until)" />
        <Cell title="创建人" :value="quotation.creator_name || '-'" />
        <Cell title="备注" :label="quotation.remarks || quotation.remark || '-'" />
      </CellGroup>

      <CellGroup inset title="报价明细">
        <div v-if="items.length" class="items">
          <div v-for="item in items" :key="item.id || item.product_id" class="item-row">
            <div>
              <div class="item-title">{{ item.product_name || item.material_name || `产品#${item.product_id}` }}</div>
              <div class="item-subtitle">{{ item.specification || item.product_code || '-' }}</div>
            </div>
            <div class="item-amount">
              <span>{{ item.quantity || 0 }}</span>
              <strong>{{ money(lineTotal(item)) }}</strong>
            </div>
          </div>
        </div>
        <Empty v-else description="暂无报价明细" />
      </CellGroup>

      <div v-if="canConvert" class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleConvert">转销售订单</Button>
      </div>
    </div>

    <Empty v-else description="报价单不存在" />
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
  const quotation = ref(null)

  const items = computed(() => quotation.value?.items || [])
  const canConvert = computed(() => quotation.value && !['converted', 'cancelled'].includes(quotation.value.status))

  const money = (value) => {
    if (value === null || value === undefined || value === '') return '--'
    const amount = Number(value)
    return Number.isNaN(amount) ? '--' : `¥${amount.toFixed(2)}`
  }
  const lineTotal = (item) => {
    if (item.total_price !== null && item.total_price !== undefined && item.total_price !== '') return item.total_price
    if (item.amount !== null && item.amount !== undefined && item.amount !== '') return item.amount
    if (item.unit_price === null || item.unit_price === undefined || item.unit_price === '') return null
    const unitPrice = Number(item.unit_price)
    return Number.isNaN(unitPrice) ? null : (Number(item.quantity) || 0) * unitPrice
  }
  const dateText = (value) => (value ? String(value).slice(0, 10) : '-')
  const statusText = (status) =>
    ({ draft: '草稿', pending: '待审核', approved: '已审核', rejected: '已拒绝', converted: '已转单' })[status] || status || '-'
  const statusType = (status) =>
    ({ draft: 'default', pending: 'warning', approved: 'success', rejected: 'danger', converted: 'primary' })[status] || 'default'

  const fetchDetail = async () => {
    loading.value = true
    try {
      const response = await salesApi.getSalesQuotation(route.params.id)
      quotation.value = extractApiData(response, null)
    } catch (error) {
      console.error('加载报价详情失败:', error)
    } finally {
      loading.value = false
    }
  }

  const handleConvert = async () => {
    try {
      await showConfirmDialog({ title: '转销售订单', message: '确认将该报价单转为销售订单？' })
      submitting.value = true
      await salesApi.convertQuotationToOrder(route.params.id)
      showToast({ type: 'success', message: '已转为销售订单' })
      await fetchDetail()
    } catch (error) {
      if (error !== 'cancel') console.error('报价转单失败:', error)
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
  .item-amount span {
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

  .item-amount {
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
