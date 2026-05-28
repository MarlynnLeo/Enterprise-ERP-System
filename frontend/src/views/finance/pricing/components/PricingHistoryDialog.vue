<template>
  <!-- 定价历史记录对话框 -->
  <el-dialog
    v-model="visible"
    title="定价历史记录"
    width="800px"
  >
    <el-table :data="history" border stripe max-height="400">
      <el-table-column prop="suggested_price" label="建议售价" width="120">
        <template #default="{ row }">
          {{ formatPrice(row.suggested_price) }}
        </template>
      </el-table-column>
      <el-table-column prop="cost_price" label="成本价" width="120">
        <template #default="{ row }">
          {{ formatPrice(row.cost_price) }}
        </template>
      </el-table-column>
      <el-table-column prop="profit_margin" label="利润率" width="100">
        <template #default="{ row }">
          <el-tag :type="getMarginColor(row.profit_margin)" size="small">
            {{ formatPercent(row.profit_margin) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="effective_date" label="生效日期" width="120">
        <template #default="{ row }">
          {{ formatDate(row.effective_date) }}
        </template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" min-width="150" show-overflow-tooltip />
      <el-table-column prop="created_by_name" label="创建人" width="100" />
      <el-table-column prop="created_at" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.created_at) }}
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue';
import { formatDate, formatDateTime } from '@/utils/helpers/dateUtils';

const props = defineProps({
  modelValue: Boolean,
  history: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:modelValue']);

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

// formatNumber 已统一引用公共实现

// 数字格式化
const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || value === '') return '-';
  const num = parseFloat(value);
  if (isNaN(num)) return '-';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const formatPrice = (value) => {
  const formatted = formatNumber(value);
  return formatted === '-' ? '-' : `¥${formatted}`;
};
const formatPercent = (value) => {
  const formatted = formatNumber(value);
  return formatted === '-' ? '-' : `${formatted}%`;
};
const getMarginColor = (value) => {
  if (value === null || value === undefined || value === '') return 'info';
  const margin = Number(value);
  if (Number.isNaN(margin)) return 'info';
  if (margin < 10) return 'danger';
  if (margin < 20) return 'warning';
  return 'success';
};
</script>
