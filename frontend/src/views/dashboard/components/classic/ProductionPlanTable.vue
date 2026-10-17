<!--
  ProductionPlanTable — 经典主题仪表盘生产计划摘要
-->
<template>
  <section class="dashboard-plan-list" aria-label="生产计划">
    <header class="plan-header">
      <div class="plan-heading">
        <div class="heading-icon-wrap">
          <Document class="heading-icon" aria-hidden="true" />
        </div>
        <h2>生产计划摘要</h2>
      </div>
      <span class="plan-count">{{ plans.length }} 项计划</span>
    </header>

    <div class="plan-table-wrapper">
      <div v-if="plans.length === 0" class="plan-empty-state">
        <div class="empty-icon-wrap">
          <Document class="plan-empty-icon" aria-hidden="true" />
        </div>
        <p class="plan-empty-title">暂无生产计划</p>
        <p class="plan-empty-desc">当前生产线均处于正常空闲或已完工状态</p>
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
              <th scope="col">计划单号</th>
              <th scope="col">产品名称</th>
              <th scope="col">规格型号</th>
              <th scope="col" class="text-right">计划数量</th>
              <th scope="col" class="text-center">生产状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(plan, index) in plans"
              :key="plan.id ?? index"
              class="plan-row"
              tabindex="0"
              @click="viewPlan(plan)"
              @keydown.enter.prevent="viewPlan(plan)"
            >
              <td class="plan-code-cell" :title="plan.studentId">
                <span class="code-text">{{ plan.studentId }}</span>
              </td>
              <td class="cell-ellipsis font-medium" :title="plan.name">{{ plan.name }}</td>
              <td class="cell-ellipsis text-secondary" :title="plan.studentType">{{ plan.studentType }}</td>
              <td class="text-right font-mono">{{ plan.protectionId }}</td>
              <td class="text-center">
                <span class="plan-status-pill" :class="getStatusClass(plan.status)">
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
  draft: 'status-draft',
  allocated: 'status-amber',
  preparing: 'status-amber',
  material_issuing: 'status-blue',
  material_issued: 'status-blue',
  in_progress: 'status-indigo',
  inspection: 'status-amber',
  warehousing: 'status-emerald',
  completed: 'status-emerald',
  cancelled: 'status-rose'
}

const getStatusClass = (status) => STATUS_CLASS_MAP[status] || 'status-slate'
const viewPlan = (plan) => {
  if (plan?.id) emit('view', plan.id)
}
</script>

<style scoped>
.dashboard-plan-list {
  container-type: inline-size;
  container-name: production-plan;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: 4px;
  box-shadow: none;
  transition: all var(--transition-base) ease;
}

.dashboard-plan-list:hover {
  border-color: color-mix(in srgb, var(--color-primary) 25%, var(--color-border-base));
}

.plan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  flex: 0 0 46px;
  box-sizing: border-box;
  padding: 0 14px;
  border-bottom: 1px solid var(--color-border-lighter);
}

.plan-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.heading-icon-wrap {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.heading-icon {
  width: 15px;
  height: 15px;
}

.plan-heading h2 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 14px;
  font-weight: 700;
}

.plan-count {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--color-bg-section);
  border: 1px solid var(--color-border-light);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.plan-table-wrapper {
  flex: 1;
  min-height: 0;
  padding: 6px 10px 10px;
  display: flex;
  flex-direction: column;
}

.plan-table-scroll {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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
  height: 38px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-border-lighter);
  text-align: left;
  vertical-align: middle;
  box-sizing: border-box;
}

.dashboard-native-table th {
  height: 32px;
  color: var(--color-text-secondary);
  background: color-mix(in srgb, var(--color-bg-page) 60%, var(--color-bg-base));
  font-size: 12px;
  font-weight: 600;
  border-radius: 4px;
}

.plan-row {
  cursor: pointer;
  transition: background-color var(--transition-fast) ease;
}

.plan-row:hover {
  background: color-mix(in srgb, var(--color-primary) 4%, transparent);
}

.plan-row:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.plan-column-code { width: 140px; }
.plan-column-name { width: auto; }
.plan-column-specification { width: 110px; }
.plan-column-quantity { width: 90px; }
.plan-column-status { width: 100px; }

.plan-code-cell {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 600;
}

.code-text:hover {
  text-decoration: underline;
}

.cell-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.font-medium {
  font-weight: 500;
  color: var(--color-text-primary);
}

.font-mono {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--color-text-primary);
}

.text-secondary {
  color: var(--color-text-secondary);
  font-size: 12px;
}

.text-right {
  text-align: right !important;
}

.text-center {
  text-align: center !important;
}

/* 状态徽章 */
.plan-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.status-emerald { background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }
.status-indigo { background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; }
.status-blue { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }
.status-amber { background: #FFFBEB; color: #B45309; border: 1px solid #FDE68A; }
.status-rose { background: #FEF2F2; color: #BE123C; border: 1px solid #FECDD3; }
.status-slate { background: #F8FAFC; color: #475569; border: 1px solid #E2E8F0; }

/* 空状态 */
.plan-empty-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 16px;
  text-align: center;
}

.empty-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-base));
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.plan-empty-icon {
  width: 28px;
  height: 28px;
  color: var(--color-primary);
}

.plan-empty-title {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 15px;
  font-weight: 600;
}

.plan-empty-desc {
  margin: 4px 0 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}
</style>
