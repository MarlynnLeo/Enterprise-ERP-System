<template>
  <!-- 价格调整历史对话框 -->
  <AppDialog
    v-model="visible"
    :title="`价格调整历史 - ${materialName}`"
    mode="form"
    width="600px"
  >
    <div v-if="history.length > 0" class="history-timeline">
      <el-timeline>
        <el-timeline-item
          v-for="item in history"
          :key="item.id"
          :timestamp="formatDateTime(item.createdAt)"
          placement="top"
          :type="item.isActive ? 'primary' : 'info'"
        >
          <el-card shadow="hover" class="history-card">
            <div class="history-header">
              <el-tag :type="item.isActive ? 'success' : 'info'" size="small">
                {{ item.isActive ? '当前生效' : '历史版本' }}
              </el-tag>
              <span class="version">V{{ item.version }}</span>
            </div>
            <div class="history-content">
              <div class="price-row">
                <span class="label">原始价格:</span>
                <span class="value">{{ formatPrice(item.originalPrice) }}</span>
              </div>
              <div class="price-row">
                <span class="label">调整价格:</span>
                <span class="value adjusted">{{ formatPrice(item.adjustedPrice) }}</span>
              </div>
              <div class="reason-row">
                <span class="label">调整原因:</span>
                <span class="value">{{ item.adjustmentReason }}</span>
              </div>
              <div class="operator-row">
                <span class="label">操作人:</span>
                <span class="value">{{ item.createdByName || '-' }}</span>
              </div>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </div>
    <EmptyState v-else description="暂无调整历史" ::image-size="100" />
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
    </AppDialog>
</template>

<script setup>
import { computed } from 'vue';
import { formatDateTime as _formatDateTime } from '@/utils/helpers/dateUtils'

const props = defineProps({
  modelValue: Boolean,
  history: {
    type: Array,
    default: () => []
  },
  materialName: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue']);

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const formatNumber = (num) => {
  if (num === null || num === undefined || num === '') return '-';
  const value = Number(num);
  return Number.isNaN(value) ? '-' : value.toFixed(2);
};
const formatPrice = (num) => {
  const formatted = formatNumber(num);
  return formatted === '-' ? '-' : `¥${formatted}`;
};
const formatDateTime = (date) => _formatDateTime(date, 'YYYY-MM-DD HH:mm');
</script>

<style scoped>
.history-card {
  margin-bottom: 8px;
}

.history-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.version {
  font-weight: 600;
  color: var(--color-primary);
}

.history-content {
  font-size: 14px;
}

.price-row, .reason-row, .operator-row {
  display: flex;
  margin-bottom: 6px;
}

.label {
  width: 80px;
  color: var(--color-text-secondary);
}

.value {
  flex: 1;
}

.value.adjusted {
  color: var(--color-success);
  font-weight: 600;
}
</style>
