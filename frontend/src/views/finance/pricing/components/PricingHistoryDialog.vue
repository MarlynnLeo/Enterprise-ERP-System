<template>
  <!-- 定价历史记录对话框 -->
  <AppDialog
    v-model="visible"
    title="定价历史记录"
    mode="form"
    width="800px"
  >
    <el-table :data="history" border stripe max-height="400">
      <el-table-column prop="suggestedPrice" label="建议售价" width="120">
        <template #default="{ row }">
          {{ formatPrice(row.suggestedPrice) }}
        </template>
      </el-table-column>
      <el-table-column prop="costPrice" label="成本价" width="120">
        <template #default="{ row }">
          {{ formatPrice(row.costPrice) }}
        </template>
      </el-table-column>
      <el-table-column prop="profitMargin" label="利润率" width="100">
        <template #default="{ row }">
          <el-tag :type="getMarginColor(row.profitMargin)" size="small">
            {{ formatPercent(row.profitMargin) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="effectiveDate" label="生效日期" width="120">
        <template #default="{ row }">
          {{ formatDate(row.effectiveDate) }}
        </template>
      </el-table-column>
      <el-table-column prop="remarks" label="备注" min-width="150" show-overflow-tooltip />
      <el-table-column prop="createdByName" label="创建人" width="100" />
      <el-table-column prop="createdAt" label="创建时间" width="160">
        <template #default="{ row }">
          {{ formatDateTime(row.createdAt) }}
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
    </AppDialog>
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
