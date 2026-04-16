<!--
/**
 * SupplierDetail.vue - 供应商详情
 * @description 供应商详情页面 - 替代GenericListView占位
 * @date 2026-04-14
 * @version 1.0.0
 */
-->
<template>
  <div class="detail-page">
    <NavBar title="供应商详情" left-arrow @click-left="$router.go(-1)" />

    <div class="content-container" v-if="supplier">
      <div class="info-header">
        <div class="avatar-icon">🏢</div>
        <div class="supplier-name">{{ supplier.name || '--' }}</div>
        <div class="supplier-code">{{ supplier.code || `编码#${supplier.id}` }}</div>
      </div>

      <CellGroup inset title="基本信息">
        <Cell title="联系人" :value="supplier.contact || supplier.contact_person || '--'" />
        <Cell title="联系电话" :value="supplier.phone || supplier.contact_phone || '--'" />
        <Cell title="邮箱" :value="supplier.email || '--'" />
        <Cell title="地址" :value="supplier.address || '--'" />
      </CellGroup>

      <CellGroup inset title="商务信息">
        <Cell title="评级" :value="supplier.rating || supplier.level || '--'" />
        <Cell title="付款方式" :value="supplier.payment_method || '--'" />
        <Cell title="结算周期" :value="supplier.settlement_cycle || '--'" />
        <Cell
          title="合作状态"
          :value="supplier.status === 'active' ? '合作中' : supplier.status || '--'"
        />
      </CellGroup>

      <CellGroup inset title="其他信息" v-if="supplier.remark || supplier.remarks">
        <Cell :title="supplier.remark || supplier.remarks" />
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
  import { baseDataApi } from '@/services/api'

  const route = useRoute()
  const supplier = ref(null)

  const loadDetail = async () => {
    try {
      const response = await baseDataApi.getSupplier(route.params.id)
      supplier.value = response.data || response
    } catch (error) {
      console.error('加载供应商详情失败:', error)
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
  .info-header {
    background: var(--van-background);
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 12px;
    text-align: center;
    border: 1px solid var(--van-border-color);
  }
  .avatar-icon {
    font-size: 3rem;
    margin-bottom: 8px;
  }
  .supplier-name {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--van-text-color);
    margin-bottom: 4px;
  }
  .supplier-code {
    font-size: 0.875rem;
    color: var(--van-text-color-2);
  }
  .loading-container {
    display: flex;
    justify-content: center;
    padding: 60px 0;
  }
</style>
