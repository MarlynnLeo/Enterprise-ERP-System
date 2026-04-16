<!--
/**
 * ReturnDetail.vue - 销售退货详情
 * @description 销售退货详情页面 - 替代GenericListView占位
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
          {{ detail.return_no || detail.return_code || `退货单#${detail.id}` }}
        </div>
      </div>

      <CellGroup inset title="退货信息">
        <Cell title="客户名称" :value="detail.customer_name || '--'" />
        <Cell title="关联订单" :value="detail.order_code || '--'" />
        <Cell title="退货日期" :value="formatDate(detail.return_date || detail.created_at)" />
        <Cell title="退货金额" :value="detail.total_amount ? `¥${detail.total_amount}` : '--'" />
        <Cell title="退货原因" :value="detail.reason || '--'" />
      </CellGroup>

      <CellGroup inset title="退货明细" v-if="detail.items && detail.items.length > 0">
        <Cell
          v-for="(item, index) in detail.items"
          :key="index"
          :title="item.material_name || item.product_name || `物料#${item.material_id}`"
          :value="`${item.quantity} ${item.unit || '件'}`"
          :label="`退货原因: ${item.reason || '--'}`"
        />
      </CellGroup>

      <CellGroup inset title="备注" v-if="detail.remarks">
        <Cell :title="detail.remarks" />
      </CellGroup>
    </div>

    <div v-else class="loading-container">
      <Loading size="36" />
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { useRoute } from 'vue-router'
  import { NavBar, CellGroup, Cell, Loading, showToast } from 'vant'
  import { salesApi } from '@/services/api'
  import { SALES_RETURN_STATUS, getDictText, getDictClass, UI_COLORS } from '@/constants/dict'

  const route = useRoute()
  const detail = ref(null)

  // 删除了状态映射对象statusMap

  const formatDate = (dateStr) => {
    if (!dateStr) return '--'
    return new Date(dateStr).toLocaleDateString('zh-CN')
  }

  const loadDetail = async () => {
    try {
      const response = await salesApi.getSalesReturn(route.params.id)
      detail.value = response.data || response
    } catch (error) {
      console.error('加载退货详情失败:', error)
      showToast('加载详情失败')
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
  .loading-container {
    display: flex;
    justify-content: center;
    padding: 60px 0;
  }
</style>
