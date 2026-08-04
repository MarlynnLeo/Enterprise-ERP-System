<!--
  应收待结算明细 — 独立页
-->
<template>
  <div class="module-page ar-settlement-page">
    <PageHeader
      title="应收待结算"
      subtitle="查看销售发票收款进度：待结算、未收、部分收、逾期与已收清"
    >
      <template #actions>
        <el-button @click="goInvoices">销售发票</el-button>
        <el-button type="primary" plain @click="goAging">应收账龄</el-button>
      </template>
    </PageHeader>

    <SettlementDashboard side="ar" standalone :default-key="'open'" :limit="200" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import SettlementDashboard from '../components/SettlementDashboard.vue'

const router = useRouter()

const goInvoices = () => {
  router.push({ name: 'ar-invoices' })
}

const goAging = () => {
  router.push({ name: 'ar-aging' })
}
</script>
