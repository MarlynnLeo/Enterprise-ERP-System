<!--
  应付待结算明细 — 独立页
-->
<template>
  <div class="module-page ap-settlement-page">
    <PageHeader
      title="应付待结算"
      subtitle="查看采购发票付款进度：待结算、未付、部分付、逾期与已付清"
    >
      <template #actions>
        <el-button @click="goInvoices">采购发票</el-button>
        <el-button type="primary" plain @click="goAging">应付账龄</el-button>
      </template>
    </PageHeader>

    <SettlementDashboard side="ap" standalone :default-key="'open'" :limit="200" />
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import SettlementDashboard from '../components/SettlementDashboard.vue'

const router = useRouter()

const goInvoices = () => {
  router.push({ name: 'ap-invoices' })
}

const goAging = () => {
  router.push({ name: 'ap-aging' })
}
</script>
