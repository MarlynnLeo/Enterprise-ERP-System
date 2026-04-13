<template>
  <div class="statistics-row">
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value">{{ stats.total || 0 }}</div>
      <div class="stat-label">总数</div>
    </el-card>
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value">{{ stats.active || 0 }}</div>
      <div class="stat-label">启用</div>
    </el-card>
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value">{{ stats.inactive || 0 }}</div>
      <div class="stat-label">未启用</div>
    </el-card>
    <el-card class="stat-card" shadow="hover">
      <div class="stat-value">{{ stats.lowStock || 0 }}</div>
      <div class="stat-label">库存不足</div>
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
      lowStock: 0
    })
  }
})
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
  color: var(--color-primary);
  margin-bottom: 10px;
}

.stat-label {
  color: var(--color-text-secondary);
  font-size: 14px;
}
</style>
