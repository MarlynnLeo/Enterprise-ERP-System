<template>
  <!-- BOM价格调整对话框(定价设置专用,简化版) -->
  <AppDialog
    v-model="visible"
    title="BOM成本明细与价格调整"
    mode="view"
    content-width="wide"
    :close-on-click-modal="true"
  >
    <div v-loading="loading">
      <div v-if="data.hasBom">
        <!-- BOM明细表格 -->
        <el-table :data="data.details" border stripe max-height="450">
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="materialCode" label="物料编码" width="130" />
          <el-table-column prop="materialName" label="物料名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="materialSpecs" label="规格型号" width="130" show-overflow-tooltip />
          <el-table-column prop="quantity" label="用量" width="80" />
          <el-table-column label="单价" width="180">
            <template #default="{ row }">
              <div class="price-cell-container">
                <div class="price-cell" :class="{ 'line-through text-gray-400': row.hasAdjustment }">
                  <span class="price-value">{{ formatPrice(firstPresent(row.originalPrice, row.currentPrice)) }}</span>
                </div>
                <div v-if="row.hasAdjustment" class="adjusted-price-display">
                  <span class="adjusted-price-value">{{ formatPrice(row.adjustedPrice) }}</span>
                  <el-tag size="small" type="success">已调整</el-tag>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="subtotal" label="小计" width="110">
            <template #default="{ row }">
              <span class="subtotal-value">{{ formatPrice(row.subtotal) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="130" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="{ row }">
              <div class="bom-actions">
                <el-button v-permission="'finance:pricing:update'" type="primary" link size="small" @click="$emit('adjust', row)">
                  {{ row.hasAdjustment ? '重新调整' : '调整' }}
                </el-button>
                <el-button
                  v-if="row.hasAdjustment"
                  type="info"
                  link
                  size="small"
                  @click="$emit('history', row)"
                >
                  历史
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <!-- 总成本 -->
        <div class="mt-4 text-right">
          <el-tag size="large" type="primary">
            总成本: {{ formatPrice(data.totalCost) }}
          </el-tag>
        </div>
      </div>
      <EmptyState v-else description="该产品暂无BOM数据" ::image-size="120" />
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
    </AppDialog>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: Boolean,
  loading: Boolean,
  data: {
    type: Object,
    default: () => ({ hasBom: false, details: [], totalCost: 0 })
  }
});

const emit = defineEmits(['update:modelValue', 'adjust', 'history']);

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const isBlankValue = (value) => value === null || value === undefined || value === '';
const firstPresent = (...values) => values.find((value) => !isBlankValue(value));
const formatNumber = (num) => {
  if (isBlankValue(num)) return '-';
  const value = Number(num);
  return Number.isNaN(value) ? '-' : value.toFixed(2);
};
const formatPrice = (num) => {
  const formatted = formatNumber(num);
  return formatted === '-' ? '-' : `¥${formatted}`;
};
</script>

<style scoped>
.price-cell-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.line-through {
  text-decoration: line-through;
}

.text-gray-400 {
  color: var(--ds-gray);
}

.adjusted-price-display {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.adjusted-price-value {
  color: var(--color-success);
  font-weight: 600;
}

.subtotal-value {
  font-weight: 600;
}

.bom-actions {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.mt-4 {
  margin-top: 16px;
}

.text-right {
  text-align: right;
}
</style>
