<template>
  <!-- BOM预览对话框(只读模式) -->
  <el-dialog 
    v-model="visible" 
    title="BOM成本明细" 
    width="1000px"
    destroy-on-close
  >
    <div v-loading="loading">
      <div v-if="data.hasBom">

        <!-- BOM状态信息 -->
        <el-row :gutter="20" class="mb-4">
          <el-col :span="8">
            <div class="stat-item">
              <div class="stat-title">BOM版本</div>
              <div class="stat-value">{{ data.bom?.version || 'V1.0' }}</div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-item">
              <div class="stat-title">BOM状态</div>
              <div class="stat-value">
                <el-tag :type="data.bom?.approved ? 'success' : 'warning'" size="small">
                  {{ data.bom?.approved ? '已审批' : '待审批' }}
                </el-tag>
              </div>
            </div>
          </el-col>
          <el-col :span="8">
            <div class="stat-item">
              <div class="stat-title">材料数量</div>
              <div class="stat-value">{{ data.details?.length || 0 }} 种</div>
            </div>
          </el-col>
        </el-row>

        <!-- BOM明细表格 -->
        <el-table :data="data.details" border stripe max-height="350">
          <el-table-column type="index" label="#" width="50" align="center" />
          <el-table-column prop="material_code" label="物料编码" width="130" />
          <el-table-column prop="material_name" label="物料名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="material_specs" label="规格型号" width="130" show-overflow-tooltip />
          <el-table-column prop="quantity" label="用量" width="80" align="center" />
          <el-table-column label="单价" width="150" align="right">
            <template #default="{ row }">
              <div class="price-display">
                <span v-if="row.has_adjustment" class="original-price line-through">
                  ¥{{ formatNumber(row.original_price) }}
                </span>
                <span :class="{ 'adjusted-price': row.has_adjustment }">
                  ¥{{ formatNumber(row.effective_price || row.current_price) }}
                </span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="subtotal" label="小计" width="110" align="right">
            <template #default="{ row }">
              <span class="font-semibold">¥{{ formatNumber(row.subtotal) }}</span>
            </template>
          </el-table-column>
          <!-- 编辑模式下显示操作列 -->
          <el-table-column v-if="mode === 'edit'" label="操作" width="130" align="center" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="$emit('adjust', row)">
                {{ row.has_adjustment ? '重新调整' : '调整' }}
              </el-button>
              <el-button v-if="row.has_adjustment" type="info" link size="small" @click="$emit('history', row)">
                历史
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 成本汇总 -->
        <div class="cost-summary mt-4">
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-title">当前BOM总成本</div>
                <div class="stat-value text-primary">¥{{ formatNumber(data.totalCost) }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-title">上次定价成本</div>
                <div class="stat-value">¥{{ formatNumber(data.lastSavedCost) }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-title">成本变动</div>
                <div class="stat-value" :class="{ 'text-danger': data.costVariance > 0, 'text-success': data.costVariance < 0 }">
                  {{ data.costVariance > 0 ? '+' : '' }}¥{{ formatNumber(data.costVariance) }}
                </div>
              </div>
            </el-col>
          </el-row>
        </div>

        <!-- 策略字段显示(如有) -->
        <div v-if="product.strategies && product.strategies.length > 0" class="strategy-summary mt-4">
          <el-divider content-position="left">定价策略字段</el-divider>
          <div class="strategy-grid">
            <div v-for="strategy in product.strategies" :key="strategy.field_id" class="strategy-item">
              <span class="strategy-label">{{ strategy.field_label }}:</span>
              <span class="strategy-value">
                {{ strategy.field_value }}{{ strategy.unit }}
              </span>
            </div>
          </div>
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
    default: () => ({ hasBom: false, bom: null, details: [], totalCost: 0 })
  },
  product: {
    type: Object,
    default: () => ({})
  },
  mode: {
    type: String,
    default: 'preview' // 'preview' | 'edit'
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
.bom-dialog-header {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea, #764ba2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-on-primary, #fff);
  flex-shrink: 0;
}

.header-text h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-text p {
  margin: 4px 0 0;
  font-size: 13px;
}

.mb-4 { margin-bottom: 16px; }
.mt-4 { margin-top: 16px; }

/* 统计项样式 */
.stat-item {
  text-align: center;
  padding: 12px;
  background: var(--color-bg-hover);
  border-radius: 8px;
}

.stat-title {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.text-primary { color: var(--color-primary); }
.text-success { color: var(--color-success); }
.text-danger { color: var(--color-danger); }

.price-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.original-price {
  color: #9ca3af;
  font-size: 12px;
}

.line-through {
  text-decoration: line-through;
}

.adjusted-price {
  color: var(--color-success);
  font-weight: 600;
}

.font-semibold {
  font-weight: 600;
}

.text-gray-500 { color: #6b7280; }

.strategy-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.strategy-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--color-bg-hover);
  border-radius: 8px;
  border: 1px solid var(--color-border-light);
}

.strategy-label {
  color: var(--color-text-regular);
  font-size: 13px;
}

.strategy-value {
  font-weight: 600;
  color: var(--color-primary);
  font-size: 14px;
}
</style>
