<template>
  <div class="statistics-row">
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value total">{{ stats.total || 0 }}</div>
      <div class="stat-label">BOM总数</div>
    </el-card>
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value approved">{{ stats.active || 0 }}</div>
      <div class="stat-label">已审核</div>
    </el-card>
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value pending">{{ stats.inactive || 0 }}</div>
      <div class="stat-label">未审核</div>
    </el-card>
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value details">{{ stats.detailsCount || 0 }}</div>
      <div class="stat-label">物料明细</div>
    </el-card>
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value cost">{{ formatCurrency(stats.totalCost || 0) }}</div>
      <div class="stat-label">总成本</div>
    </el-card>
  </div>
</template>

<script setup>
defineProps({
  stats: {
    type: Object,
    default: () => ({
      total: 0,
      active: 0,
      inactive: 0,
      detailsCount: 0,
      totalCost: 0
    })
  }
})

import { formatCurrency } from '@/utils/helpers/formatters';
</script>

<style scoped>
.statistics-row {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

.stat-card {
  flex: 1;
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 10px;
}

/* 差异化颜色 */
.stat-value.total { color: var(--color-primary); }
.stat-value.approved { color: var(--color-success); }
.stat-value.pending { color: var(--color-warning); }
.stat-value.details { color: var(--color-text-secondary); }
.stat-value.cost { color: var(--color-danger); }

.stat-label {
  color: var(--color-text-secondary);
  font-size: 14px;
}
</style>

