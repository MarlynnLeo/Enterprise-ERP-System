<template>
  <!-- 价格调整历史对话框 -->
  <el-dialog 
    v-model="visible" 
    :title="`价格调整历史 - ${materialName}`" 
    width="600px"
  >
    <div v-if="history.length > 0" class="history-timeline">
      <el-timeline>
        <el-timeline-item
          v-for="item in history"
          :key="item.id"
          :timestamp="formatDateTime(item.created_at)"
          placement="top"
          :type="item.is_active ? 'primary' : 'info'"
        >
          <el-card shadow="hover" class="history-card">
            <div class="history-header">
              <el-tag :type="item.is_active ? 'success' : 'info'" size="small">
                {{ item.is_active ? '当前生效' : '历史版本' }}
              </el-tag>
              <span class="version">V{{ item.version }}</span>
            </div>
            <div class="history-content">
              <div class="price-row">
                <span class="label">原始价格:</span>
                <span class="value">¥{{ formatNumber(item.original_price) }}</span>
              </div>
              <div class="price-row">
                <span class="label">调整价格:</span>
                <span class="value adjusted">¥{{ formatNumber(item.adjusted_price) }}</span>
              </div>
              <div class="reason-row">
                <span class="label">调整原因:</span>
                <span class="value">{{ item.adjustment_reason }}</span>
              </div>
              <div class="operator-row">
                <span class="label">操作人:</span>
                <span class="value">{{ item.created_by_name || '-' }}</span>
              </div>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </div>
    <el-empty v-else description="暂无调整历史" :image-size="100" />
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed } from 'vue';
import dayjs from 'dayjs';

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

const formatNumber = (num) => Number(num || 0).toFixed(2);
const formatDateTime = (date) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-';
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
