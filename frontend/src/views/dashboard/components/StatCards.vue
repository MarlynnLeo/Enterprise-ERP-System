<!--
/**
 * StatCards.vue
 * @description 仪表盘统计卡片组件
 */
-->
<template>
  <el-col
    v-for="(stat, index) in statCards"
    :key="index"
    :xs="24"
    :sm="6"
    :md="4"
  >
    <div class="stat-card" :class="{ 'stat-card-loading': loading }">
      <div class="icon-container" :class="stat.colorClass">
        <el-icon><component :is="stat.icon" /></el-icon>
      </div>
      <div class="stat-content">
        <div class="number" v-if="!loading">
          <span class="animated-number" :data-value="stat.value">{{ stat.value }}</span>
        </div>
        <el-skeleton-item v-else variant="h3" class="skel-icon" />
        <div class="text">{{ stat.label }}</div>
      </div>
      <!-- 数据更新指示器 -->
      <div class="update-indicator" v-if="!loading"></div>
    </div>
  </el-col>
</template>

<script setup>
defineProps({
  statCards: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  }
})
</script>
