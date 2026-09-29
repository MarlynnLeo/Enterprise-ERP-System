<!--
  ProductionPlanTable — 仪表盘生产计划摘要

  经典主题只读展示最多 9 条摘要数据。Element Plus Table 的列宽测量和观察器
  对这个固定布局没有价值，因此使用原生表格，完整计划仍在生产计划页面查看。
-->
<template>
  <section class="dashboard-plan-list" aria-label="生产计划">
    <header class="plan-header">
      <div class="plan-heading"><Document aria-hidden="true" /><h2>生产计划</h2></div>
      <span class="plan-count">{{ plans.length }} 项计划</span>
    </header>
    <div class="plan-table-wrapper">
      <div v-if="plans.length === 0" class="plan-empty-state">
        <Document class="plan-empty-icon" aria-hidden="true" />
        <p class="plan-empty-title">暂无生产计划</p>
        <p class="plan-empty-desc">当前没有进行中的生产计划</p>
      </div>

      <div v-else class="plan-table-scroll">
        <table class="dashboard-native-table production-table">
          <colgroup>
            <col class="plan-column-code">
            <col class="plan-column-name">
            <col class="plan-column-specification">
            <col class="plan-column-quantity">
            <col class="plan-column-status">
          </colgroup>
          <thead>
            <tr>
              <th scope="col">计划编号</th>
              <th scope="col">产品名称</th>
              <th scope="col">产品规格</th>
              <th scope="col">计划数量</th>
              <th scope="col">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(plan, index) in plans"
              :key="plan.id ?? index"
              tabindex="0"
              @click="viewPlan(plan)"
              @keydown.enter.prevent="viewPlan(plan)"
            >
              <td class="cell-ellipsis" :title="plan.studentId">{{ plan.studentId }}</td>
              <td class="cell-ellipsis" :title="plan.name">{{ plan.name }}</td>
              <td class="cell-ellipsis" :title="plan.studentType">{{ plan.studentType }}</td>
              <td>{{ plan.protectionId }}</td>
              <td>
                <span class="plan-status" :class="getStatusClass(plan.status)">
                  {{ plan.warningType }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { Document } from '@element-plus/icons-vue'

const props = defineProps({
  warningList: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['view'])
const plans = computed(() => props.warningList.slice(0, 9))

const STATUS_CLASS_MAP = {
  draft: 'is-info',
  allocated: 'is-warning',
  preparing: 'is-warning',
  material_issuing: 'is-warning',
  material_issued: 'is-primary',
  in_progress: 'is-primary',
  inspection: 'is-warning',
  warehousing: 'is-success',
  completed: 'is-success',
  cancelled: 'is-danger'
}

const getStatusClass = (status) => STATUS_CLASS_MAP[status] || 'is-info'
const viewPlan = (plan) => {
  if (plan?.id) emit('view', plan.id)
}
</script>

<style scoped>
.dashboard-plan-list {
  container: production-plan / inline-size;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-base) ease,
    border-color var(--transition-base) ease,
    box-shadow var(--transition-base) ease;
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 36px;
  flex: 0 0 36px;
  box-sizing: border-box;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-lighter);
}

.plan-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--color-primary);
}

.plan-heading svg { width: 18px; height: 18px; }
.plan-heading h2 { margin: 0; color: var(--color-text-primary); font-size: 13px; font-weight: 600; }
.plan-count { color: var(--color-text-secondary); font-size: 12px; }

.dashboard-plan-list:hover {
  border-color: var(--color-border-light);
}

.plan-table-wrapper,
.plan-table-scroll {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.plan-table-wrapper { flex: 1; }

.plan-table-scroll {
  overflow: auto;
}

.dashboard-native-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  color: var(--color-text-regular);
  font-size: 13px;
}

.dashboard-native-table th,
.dashboard-native-table td {
  height: 31px;
  padding: 1px 8px;
  line-height: 20px;
  border-bottom: 1px solid var(--color-border-lighter);
  text-align: left;
  vertical-align: middle;
  box-sizing: border-box;
}

.dashboard-native-table th {
  height: 28px;
  color: var(--color-text-regular);
  background: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
  font-weight: 400;
}

.dashboard-native-table tbody tr {
  cursor: pointer;
  transition: background-color var(--transition-fast) ease;
}

.dashboard-native-table tbody tr:hover,
.dashboard-native-table tbody tr:focus-visible {
  background: color-mix(in srgb, var(--color-bg-hover) 50%, transparent);
  outline: none;
}

.dashboard-native-table tbody tr:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--color-primary) 35%, transparent);
}

.cell-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plan-column-code { width: 120px; }
.plan-column-name { width: 120px; }
.plan-column-specification { width: 120px; }
.plan-column-quantity { width: 100px; }
.plan-column-status { width: 80px; }

.plan-status {
  display: flex;
  width: max-content;
  align-items: center;
  max-width: 100%;
  box-sizing: border-box;
  padding: 1px 6px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}

.plan-status.is-info {
  color: var(--color-info);
  background: color-mix(in srgb, var(--color-info) 12%, transparent);
}

.plan-status.is-primary {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

.plan-status.is-warning {
  color: var(--color-warning);
  background: color-mix(in srgb, var(--color-warning) 14%, transparent);
}

.plan-status.is-success {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
}

.plan-status.is-danger {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.plan-empty-state {
  display: flex;
  height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-secondary);
  text-align: center;
}

.plan-empty-icon {
  width: 56px;
  height: 56px;
  margin-bottom: 14px;
  color: var(--color-text-placeholder);
  opacity: 0.6;
}

.plan-empty-title,
.plan-empty-desc {
  margin: 0;
}

.plan-empty-title {
  color: var(--color-text-regular);
  font-size: 16px;
  font-weight: 500;
}

.plan-empty-desc {
  margin-top: 8px;
  color: var(--color-text-secondary);
  font-size: 13px;
}

@container production-plan (max-width: 540px) {
  .plan-column-code { width: 22%; }
  .plan-column-name { width: 26%; }
  .plan-column-specification { width: 20%; }
  .plan-column-quantity,
  .plan-column-status { width: 16%; }
  .dashboard-native-table th,
  .dashboard-native-table td { padding: 3px 4px; font-size: 12px; }
  .plan-status { padding-inline: 2px; }
}
</style>
