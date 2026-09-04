<!--
  ProductionPlanTable — 仪表盘生产计划摘要

  这里只读展示最多 20 条摘要数据。Element Plus Table 的列宽测量和观察器
  对这个固定布局没有价值，因此使用原生表格，完整计划仍在生产计划页面查看。
-->
<template>
  <section class="dashboard-plan-list" aria-label="生产计划">
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
const plans = computed(() => props.warningList)

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
  height: 380px;
  min-height: 380px;
  max-height: 380px;
  overflow: hidden;
  box-sizing: border-box;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-lighter);
  border-radius: 10px;
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 5%, transparent);
  transition: background-color var(--transition-base) ease,
    border-color var(--transition-base) ease,
    box-shadow var(--transition-base) ease;
}

.dashboard-plan-list:hover {
  border-color: var(--color-border-light);
  box-shadow: 0 4px 16px 0 color-mix(in srgb, var(--ds-black) 10%, transparent);
}

.plan-table-wrapper,
.plan-table-scroll {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

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
  height: 40px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border-lighter);
  text-align: left;
  vertical-align: middle;
  box-sizing: border-box;
}

.dashboard-native-table th {
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
  display: inline-block;
  max-width: 100%;
  padding: 2px 9px;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 500;
  line-height: 18px;
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

@media (max-width: 768px) {
  .dashboard-plan-list {
    height: auto;
    min-height: 300px;
    max-height: none;
  }
}
</style>
