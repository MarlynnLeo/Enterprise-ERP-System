<template>
  <!-- BOM价格调整对话框(定价设置专用,简化版) -->
  <el-dialog 
    v-model="visible" 
    title="BOM成本明细与价格调整" 
    width="900px"
    :close-on-click-modal="true"
  >
    <div v-loading="loading">
      <div v-if="data.hasBom">
        <!-- BOM明细表格 -->
        <el-table :data="data.details" border stripe max-height="450">
          <el-table-column type="index" label="#" width="50" align="center" />
          <el-table-column prop="material_code" label="物料编码" width="130" />
          <el-table-column prop="material_name" label="物料名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="material_specs" label="规格型号" width="130" show-overflow-tooltip />
          <el-table-column prop="quantity" label="用量" width="80" align="center" />
          <el-table-column label="单价" width="180" align="right">
            <template #default="{ row }">
              <div class="price-cell-container">
                <div class="price-cell" :class="{ 'line-through text-gray-400': row.has_adjustment }">
                  <span class="price-value">¥{{ formatNumber(row.original_price || row.current_price) }}</span>
                </div>
                <div v-if="row.has_adjustment" class="adjusted-price-display">
                  <span class="adjusted-price-value">¥{{ formatNumber(row.adjusted_price) }}</span>
                  <el-tag size="small" type="success">已调整</el-tag>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="subtotal" label="小计" width="110" align="right">
            <template #default="{ row }">
              <span class="subtotal-value">¥{{ formatNumber(row.subtotal) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" align="center" fixed="right">
            <template #default="{ row }">
              <div class="bom-actions">
                <el-button type="primary" link size="small" @click="$emit('adjust', row)">
                  {{ row.has_adjustment ? '重新调整' : '调整' }}
                </el-button>
                <el-button 
                  v-if="row.has_adjustment" 
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
            总成本: ¥{{ formatNumber(data.totalCost) }}
          </el-tag>
        </div>
      </div>
      <el-empty v-else description="该产品暂无BOM数据" :image-size="120" />
    </div>
    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
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

const formatNumber = (num) => Number(num || 0).toFixed(2);
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
  color: #9ca3af;
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
