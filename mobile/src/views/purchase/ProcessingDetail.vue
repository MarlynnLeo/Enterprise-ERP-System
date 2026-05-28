<template>
  <div class="detail-page">
    <NavBar title="外协加工详情" left-arrow @click-left="router.back()" />

    <div v-if="loading" class="state">
      <Loading size="24px" vertical>加载中...</Loading>
    </div>

    <div v-else-if="processing" class="content">
      <div class="hero">
        <div>
          <div class="code">{{ processing.processing_no || processing.processing_code || '-' }}</div>
          <div class="name">{{ processing.supplier_name || '未关联供应商' }}</div>
        </div>
        <Tag :type="statusType(processing.status)">{{ statusText(processing.status) }}</Tag>
      </div>

      <CellGroup inset title="基本信息">
        <Cell title="加工日期" :value="dateText(processing.processing_date)" />
        <Cell title="预计交付" :value="dateText(processing.expected_delivery_date || processing.expected_date)" />
        <Cell title="联系人" :value="processing.contact_person || '-'" />
        <Cell title="联系电话" :value="processing.contact_phone || '-'" />
        <Cell title="备注" :label="processing.remarks || '-'" />
      </CellGroup>

      <CellGroup inset title="发料明细">
        <div v-if="materials.length" class="items">
          <div v-for="item in materials" :key="item.id || item.material_id" class="item-row">
            <div>
              <div class="item-title">{{ item.material_name || `物料#${item.material_id}` }}</div>
              <div class="item-subtitle">{{ item.material_code || item.specification || '-' }}</div>
            </div>
            <strong>{{ item.quantity || item.planned_quantity || 0 }} {{ item.unit || item.unit_name || '' }}</strong>
          </div>
        </div>
        <Empty v-else description="暂无发料明细" />
      </CellGroup>

      <CellGroup inset title="成品明细">
        <div v-if="products.length" class="items">
          <div v-for="item in products" :key="item.id || item.product_id" class="item-row">
            <div>
              <div class="item-title">{{ item.product_name || `成品#${item.product_id}` }}</div>
              <div class="item-subtitle">{{ item.product_code || item.specification || '-' }}</div>
            </div>
            <strong>{{ item.quantity || item.planned_quantity || 0 }} {{ item.unit || item.unit_name || '' }}</strong>
          </div>
        </div>
        <Empty v-else description="暂无成品明细" />
      </CellGroup>

      <div v-if="nextAction" class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleNextStatus">
          {{ nextAction.label }}
        </Button>
      </div>
    </div>

    <Empty v-else description="外协加工单不存在" />
  </div>
</template>

<script setup>
  import { computed, onMounted, ref } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Empty, Loading, NavBar, Tag, showConfirmDialog, showToast } from 'vant'
  import { purchaseApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const route = useRoute()
  const router = useRouter()
  const loading = ref(true)
  const submitting = ref(false)
  const processing = ref(null)

  const materials = computed(() => processing.value?.materials || [])
  const products = computed(() => processing.value?.products || [])
  const nextAction = computed(() => {
    if (processing.value?.status === 'pending') return { status: 'confirmed', label: '确认发料' }
    if (processing.value?.status === 'confirmed') return { status: 'completed', label: '完成加工' }
    return null
  })

  const dateText = (value) => (value ? String(value).slice(0, 10) : '-')
  const statusText = (status) =>
    ({ pending: '待发料', confirmed: '加工中', in_progress: '加工中', completed: '已完成', cancelled: '已取消' })[status] || status || '-'
  const statusType = (status) =>
    ({ pending: 'warning', confirmed: 'primary', in_progress: 'primary', completed: 'success', cancelled: 'default' })[status] || 'default'

  const fetchDetail = async () => {
    loading.value = true
    try {
      const response = await purchaseApi.getProcessingById(route.params.id)
      processing.value = extractApiData(response, null)
    } catch (error) {
      console.error('加载外协加工详情失败:', error)
    } finally {
      loading.value = false
    }
  }

  const handleNextStatus = async () => {
    if (!nextAction.value) return
    try {
      await showConfirmDialog({ title: nextAction.value.label, message: '确认执行该操作？' })
      submitting.value = true
      await purchaseApi.updateProcessingStatus(route.params.id, nextAction.value.status)
      showToast({ type: 'success', message: '状态已更新' })
      await fetchDetail()
    } catch (error) {
      if (error !== 'cancel') console.error('更新外协加工状态失败', error)
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
