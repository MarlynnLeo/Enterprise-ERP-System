<template>
  <div class="cost-closing-page module-page">
    <section class="page-toolbar header-card">
      <div>
        <h2>成本关账</h2>
        <p>{{ statusText }}</p>
      </div>
      <div class="toolbar-actions">
        <el-select
          v-model="selectedPeriodId"
          placeholder="选择期间"
          filterable
          :loading="periodsLoading"
          @change="loadStatus"
        >
          <el-option
            v-for="period in periods"
            :key="period.id"
            :label="`${period.period_name}${period.is_closed ? '（已关闭）' : ''}`"
            :value="period.id"
          />
        </el-select>
        <el-button :icon="Refresh" @click="loadStatus" :loading="loading">刷新</el-button>
        <el-button
          v-permission="'finance:cost:execute'"
          type="primary"
          :icon="CircleCheck"
          :disabled="!canExecute"
          :loading="executing"
          @click="executeClosing"
        >
          执行闭环
        </el-button>
      </div>
    </section>

    <section class="summary-band statistics-row">
      <div class="summary-item stat-card">
        <span>检查项</span>
        <strong>{{ summary.total }}</strong>
      </div>
      <div class="summary-item stat-card success">
        <span>通过</span>
        <strong>{{ summary.passed }}</strong>
      </div>
      <div class="summary-item stat-card danger">
        <span>阻断</span>
        <strong>{{ summary.blockers }}</strong>
      </div>
      <div class="summary-item stat-card warning">
        <span>待执行</span>
        <strong>{{ summary.warnings }}</strong>
      </div>
      <div class="summary-item stat-card">
        <span>状态</span>
        <el-tag :type="overallTagType" effect="dark">{{ overallLabel }}</el-tag>
      </div>
    </section>

    <el-alert
      v-if="status?.period?.isClosed"
      type="info"
      show-icon
      :closable="false"
      title="当前期间已关闭，成本数据已锁定。"
    />
    <el-alert
      v-else-if="summary.blockers > 0"
      type="error"
      show-icon
      :closable="false"
      title="存在阻断项，需要先修复数据后再执行成本闭环。"
    />
    <el-alert
      v-else-if="summary.warnings > 0"
      type="warning"
      show-icon
      :closable="false"
      title="基础数据已通过，还需要执行 WIP、凭证或差异动作。"
    />
    <el-alert
      v-else
      type="success"
      show-icon
      :closable="false"
      title="该期间成本链路已闭环，可以进入财务关账流程。"
    />

    <el-table class="check-table" :data="checks" border v-loading="loading">
      <el-table-column label="结果" width="100">
        <template #default="{ row }">
          <el-tag :type="checkTagType(row.status)">{{ checkLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="检查项" min-width="160" />
      <el-table-column prop="description" label="闭环要求" min-width="260" />
      <el-table-column prop="count" label="异常数" width="100" align="right" />
      <el-table-column label="样例" min-width="260">
        <template #default="{ row }">
          <span class="sample-text">{{ sampleText(row.sampleRows) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <section v-if="executionResult" class="result-panel">
      <h3>最近执行结果</h3>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="WIP任务数">
          {{ executionResult.results?.wip?.taskCount ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="WIP金额">
          {{ formatMoney(executionResult.results?.wip?.totalWIPCost) }}
        </el-descriptions-item>
        <el-descriptions-item label="凭证">
          {{ executionResult.results?.wipVoucher?.entryNumber || executionResult.results?.wipVoucher?.entryId || executionResult.results?.wipVoucher?.reason || '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { CircleCheck, Refresh } from '@element-plus/icons-vue';
import { financeApi } from '@/api/finance';

const periods = ref([]);
const periodsLoading = ref(false);
const selectedPeriodId = ref(null);
const status = ref(null);
const loading = ref(false);
const executing = ref(false);
const executionResult = ref(null);

const checks = computed(() => status.value?.checks || []);
const summary = computed(() => status.value?.summary || {
  total: 0,
  passed: 0,
  blockers: 0,
  warnings: 0
});
const canExecute = computed(() => Boolean(status.value?.canExecute && selectedPeriodId.value));
const overallLabel = computed(() => {
  const map = {
    closed: '已关闭',
    blocked: '阻断',
    action_required: '待执行',
    ready: '已闭环'
  };
  return map[status.value?.status] || '未检查';
});
const overallTagType = computed(() => {
  const map = {
    closed: 'info',
    blocked: 'danger',
    action_required: 'warning',
    ready: 'success'
  };
  return map[status.value?.status] || 'info';
});
const statusText = computed(() => {
  const period = status.value?.period;
  if (!period) return '按期间检查采购、库存、生产、成本差异和凭证闭环';
  return `${period.periodName}：${period.startDate} 至 ${period.endDate}`;
});

const checkTagType = (state) => {
  if (state === 'passed') return 'success';
  if (state === 'blocker') return 'danger';
  if (state === 'warning') return 'warning';
  return 'info';
};

const checkLabel = (state) => {
  if (state === 'passed') return '通过';
  if (state === 'blocker') return '阻断';
  if (state === 'warning') return '待执行';
  return '未知';
};

const sampleText = (rows = []) => {
  if (!rows.length) return '-';
  const first = rows[0];
  const values = Object.entries(first)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${value}`);
  return values.join('，');
};

const formatMoney = (value) => {
  const number = Number(value || 0);
  return `¥${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const loadPeriods = async () => {
  periodsLoading.value = true;
  try {
    const response = await financeApi.cost.getPeriods();
    periods.value = response.data?.periods || response.data || [];
    const firstOpen = periods.value.find((period) => !period.is_closed) || periods.value[0];
    if (firstOpen && !selectedPeriodId.value) {
      selectedPeriodId.value = firstOpen.id;
    }
  } finally {
    periodsLoading.value = false;
  }
};

const loadStatus = async () => {
  if (!selectedPeriodId.value) return;
  loading.value = true;
  try {
    const response = await financeApi.cost.getClosingStatus({ periodId: selectedPeriodId.value });
    status.value = response.data;
  } finally {
    loading.value = false;
  }
};

const executeClosing = async () => {
  if (!selectedPeriodId.value || !status.value?.canExecute) return;
  await ElMessageBox.confirm(
    '将执行 WIP 计算、WIP 凭证和成本差异分摊。执行前请确认当前期间业务单据已经处理完成。',
    '执行成本闭环',
    { type: 'warning' }
  );
  executing.value = true;
  try {
    const response = await financeApi.cost.executeClosingWorkbench(selectedPeriodId.value);
    executionResult.value = response.data;
    status.value = response.data?.after || status.value;
    ElMessage.success('成本闭环执行完成');
  } finally {
    executing.value = false;
  }
};

onMounted(async () => {
  await loadPeriods();
  await loadStatus();
});
</script>

<style scoped>
.cost-closing-page {
  padding: 0;
}

.page-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 16px 20px;
  border: 1px solid var(--color-border-lighter);
  border-radius: var(--radius-md, 12px);
  background: var(--color-bg-base);
  box-shadow: var(--shadow-sm);
  margin-bottom: 16px;
}

.page-toolbar h2 {
  margin: 0 0 6px;
  font-size: 22px;
}

.page-toolbar p {
  margin: 0;
  color: var(--color-text-secondary);
}

.toolbar-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.toolbar-actions .el-select {
  width: 240px;
}

.summary-band {
  margin-bottom: 16px;
}

.summary-item {
  min-height: 82px;
}

.summary-item span {
  display: block;
  margin-bottom: 8px;
}

.summary-item strong {
  display: block;
}

.summary-item.success strong {
  color: #67c23a;
}

.summary-item.warning strong {
  color: #e6a23c;
}

.summary-item.danger strong {
  color: #f56c6c;
}

.check-table {
  margin-top: 16px;
}

.sample-text {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.result-panel {
  margin-top: 16px;
}

.result-panel h3 {
  margin: 0 0 12px;
  font-size: 16px;
}

@media (max-width: 900px) {
  .page-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .toolbar-actions {
    flex-wrap: wrap;
  }

  .summary-band {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }
}
</style>
