<template>
  <div class="pricing-container">
    <!-- Header -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>产品定价/成本核算</h2>
          <p class="subtitle">管理产品BOM成本与销售定价</p>
        </div>
        <div class="action-section">
          <el-button type="primary" @click="settingsVisible = true">
            <el-icon><Setting /></el-icon> 定价设置
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- Search -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="产品名称/编码">
          <el-input
            v-model="pricing.searchQuery.value"
            placeholder="请输入产品名称或编码"
            clearable
            @keyup.enter="pricing.handleSearch"

          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="筛选">
          <el-select v-model="pricing.filterType.value" placeholder="全部" clearable @change="pricing.handleSearch">
            <el-option label="低利润率" value="low_margin" />
            <el-option label="成本变动" value="cost_variance" />
            <el-option label="未定价" value="no_pricing" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="pricing.handleSearch">
            <el-icon><Search /></el-icon> 搜索
          </el-button>
          <el-button type="success" @click="pricing.handleExport" :loading="pricing.exporting.value">
            <el-icon><Download /></el-icon> 导出
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Table -->
    <el-card class="data-card">
      <el-table :data="pricing.tableData.value" border style="width: 100%" v-loading="pricing.loading.value" stripe>
        <el-table-column prop="product_code" label="产品编码" width="120" />
        <el-table-column prop="product_name" label="产品名称" min-width="150" />
        <el-table-column prop="product_specs" label="规格型号" width="150" show-overflow-tooltip />
        <el-table-column prop="cost_price" label="成本价" width="120" align="right">
          <template #default="{ row }">
            <span>¥{{ formatNumber(row.cost_price) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="suggested_price" label="建议售价" width="120" align="right">
          <template #default="{ row }">
            <span class="suggested-price">¥{{ formatNumber(row.suggested_price) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="profit_margin" label="利润率" width="120" align="right">
          <template #default="{ row }">
            <el-tag :type="getMarginColor(row.profit_margin)">
              {{ formatNumber(row.profit_margin) }}%
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="effective_date" label="生效日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.effective_date) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="openPricingDrawer(row)">定价</el-button>
            <el-button type="success" size="small" @click="bom.handleViewBom(row, 'preview', pricing.currentProduct)">BOM</el-button>
            <el-button type="info" size="small" @click="bom.handleHistory(row)">历史</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pricing.currentPage.value"
          v-model:page-size="pricing.pageSize.value"
          :total="pricing.total.value"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="pricing.handleSearch"
          @current-change="pricing.fetchData"
        />
      </div>
    </el-card>

    <!-- Pricing Drawer -->
    <el-drawer v-model="pricing.drawerVisible.value" title="产品定价设置" size="650px" destroy-on-close>
      <div v-loading="pricing.drawerLoading.value" class="drawer-content">
        <el-descriptions :column="1" border class="mb-4">
          <el-descriptions-item label="产品编码">{{ pricing.currentProduct.value.code }}</el-descriptions-item>
          <el-descriptions-item label="产品名称">{{ pricing.currentProduct.value.name }}</el-descriptions-item>
          <el-descriptions-item label="规格型号">{{ pricing.currentProduct.value.specs }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">成本核算</el-divider>
        
        <div 
          class="cost-section"
          @click="pricing.costType.value === 'bom' && pricing.pricingForm.product_id ? openBomPriceDialog() : null"
        >
          <div class="cost-icon">
            <el-icon><Money /></el-icon>
          </div>
          <div class="cost-info">
            <div class="cost-label-row">
              <span class="label-text">{{ costTypeText }}</span>
            </div>
            <div class="cost-value-row">
              <span class="currency">¥</span>
              <span class="amount">{{ formatNumber(pricing.pricingForm.cost_price) }}</span>
            </div>
          </div>
          <div class="cost-actions">
            <el-button type="primary" link @click.stop="pricing.recalculateCost">
              <el-icon class="mr-1"><Refresh /></el-icon> 重新计算
            </el-button>
            <el-divider direction="vertical" />
            <el-button v-if="pricing.costType.value === 'bom'" type="primary" link @click.stop="openBomPriceDialog">
              <el-icon class="mr-1"><List /></el-icon> 查看明细
            </el-button>
          </div>
        </div>

        <el-divider content-position="left">定价策略</el-divider>

        <el-form :model="pricing.pricingForm" label-position="top" :rules="pricing.rules" ref="formRef">
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="目标利润率 (%)" prop="profit_margin">
                <el-input-number 
                  v-model="pricing.pricingForm.profit_margin" 
                  :precision="2"
                  :step="1"
                  @change="() => pricing.handleMarginChange(calculateAdjustedCost)"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="建议售价 (¥)" prop="suggested_price">
                <el-input-number 
                  v-model="pricing.pricingForm.suggested_price" 
                  :precision="2"
                  :min="0"
                  @change="() => pricing.handlePriceChange(calculateAdjustedCost)"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>

          <!-- 策略字段选择 -->
          <el-form-item label="策略字段">
            <el-select 
              v-model="strategy.selectedFieldIds.value" 
              multiple 
              filterable 
              clearable 
              collapse-tags
              collapse-tags-tooltip
              :max-collapse-tags="2"
              placeholder="选择要应用的策略字段"
              style="width: 100%"
              @change="handleStrategyFieldsSelect"
            >
              <el-option 
                v-for="field in strategy.availableFields.value" 
                :key="field.id" 
                :label="`${field.field_label} (${field.unit})`" 
                :value="field.id"
              />
            </el-select>
          </el-form-item>

          <!-- 选中字段值输入(紧凑布局) -->
          <el-form-item v-if="strategy.selectedFieldIds.value.length > 0" label="策略字段值">
            <el-row :gutter="12" class="strategy-fields-grid">
              <el-col :span="12" v-for="fieldId in strategy.selectedFieldIds.value" :key="fieldId">
                <div class="strategy-field-compact">
                  <span class="field-name">{{ strategy.getFieldById(fieldId).field_label }}</span>
                  <el-input-number 
                    v-model="strategy.getFieldById(fieldId).value" 
                    :precision="2" 
                    :step="1"
                    size="small"
                    controls-position="right"
                    @change="handleStrategyValueChange"

                  />
                  <span class="field-unit">{{ strategy.getFieldById(fieldId).unit }}</span>
                </div>
              </el-col>
            </el-row>
          </el-form-item>

          <el-form-item label="生效日期" prop="effective_date">
            <el-date-picker
              v-model="pricing.pricingForm.effective_date"
              type="date"
              placeholder="选择生效日期"
              style="width: 100%"
              value-format="YYYY-MM-DD"
            />
          </el-form-item>

          <el-form-item label="定价备注">
            <el-input 
              v-model="pricing.pricingForm.remarks" 
              type="textarea" 
              :rows="3"
              placeholder="请输入备注信息"
            />
          </el-form-item>
        </el-form>
      </div>

      <template #footer>
        <el-button @click="pricing.drawerVisible.value = false">取消</el-button>
        <el-button v-permission="'finance:pricing:update'" type="primary" @click="handleSubmitPricing" :loading="pricing.submitting.value">保存定价</el-button>
      </template>
    </el-drawer>

    <!-- BOM Preview Dialog -->
    <BomPreviewDialog
      v-model="bom.bomVisible.value"
      :loading="bom.bomLoading.value"
      :data="bom.bomData.value"
      :product="pricing.currentProduct.value"
      :mode="bom.bomDialogMode.value"
      @adjust="(row) => bom.openPriceAdjustDialog(row, pricing.pricingForm.product_id)"
      @history="(row) => bom.viewPriceHistory(row, pricing.pricingForm.product_id)"
    />

    <!-- BOM Price Dialog -->
    <BomPriceDialog
      v-model="bom.bomPriceDialogVisible.value"
      :loading="bom.bomPriceLoading.value"
      :data="bom.bomPriceData.value"
      @adjust="(row) => bom.openPriceAdjustDialog(row, pricing.pricingForm.product_id)"
      @history="(row) => bom.viewPriceHistory(row, pricing.pricingForm.product_id)"
    />

    <!-- Price Adjust Dialog -->
    <PriceAdjustDialog
      v-model="bom.priceAdjustDialogVisible.value"
      :form="bom.priceAdjustForm"
      :submitting="bom.priceAdjustSubmitting.value"
      @save="() => bom.savePriceAdjustment(pricing.pricingForm.product_id)"
    />

    <!-- Price History Dialog -->
    <PriceHistoryDialog
      v-model="bom.priceHistoryDialogVisible.value"
      :history="bom.priceHistory.value"
      :material-name="bom.currentHistoryMaterial.value"
    />

    <!-- Pricing History Dialog -->
    <PricingHistoryDialog
      v-model="bom.historyVisible.value"
      :history="bom.historyData.value"
    />

    <!-- Settings Drawer -->
    <SettingsDrawer
      v-model="settingsVisible"
      v-model:active-tab="settingsActiveTab"
      :form="pricing.settingsForm"
      :strategy-fields="strategy.fieldsList.value"
      :fields-loading="strategy.fieldsLoading.value"
      @save="handleSaveSettings"
      @reset="pricing.resetSettings"
      @add-field="strategy.handleAdd"
      @edit-field="strategy.handleEdit"
      @delete-field="strategy.handleDelete"
      @toggle-field="strategy.handleToggle"
    />

    <!-- Strategy Field Dialog -->
    <el-dialog
      v-model="strategy.dialogVisible.value"
      :title="strategy.form.id ? '编辑策略字段' : '新增策略字段'"
      width="500px"
    >
      <el-form :model="strategy.form" label-width="100px" ref="strategyFormRef" :rules="strategy.rules">
        <el-form-item label="显示标签" prop="field_label">
          <el-input v-model="strategy.form.field_label" placeholder="如:模具摊销费" />
        </el-form-item>
        <el-form-item label="字段名" prop="field_name">
          <el-input v-model="strategy.form.field_name" placeholder="如:mold_amortization" :disabled="!!strategy.form.id" />
          <div class="form-tip">只能包含英文字母、数字和下划线</div>
        </el-form-item>
        <el-form-item label="字段类型" prop="field_type">
          <el-select v-model="strategy.form.field_type" style="width: 100%">
            <el-option label="金额" value="amount" />
            <el-option label="百分比" value="percentage" />
          </el-select>
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <el-input v-model="strategy.form.unit" placeholder="如:元/件、%等" />
        </el-form-item>
        <el-form-item label="参与成本">
          <el-switch v-model="strategy.form.is_additive" :active-value="1" :inactive-value="0" />
          <div class="form-tip">开启后，该字段的数值将计入成本计算</div>
        </el-form-item>
        <el-form-item label="排序" prop="sort_order">
          <el-input-number v-model="strategy.form.sort_order" :min="0" :max="999" style="width: 100%" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="strategy.form.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="strategy.dialogVisible.value = false">取消</el-button>
        <el-button v-permission="'finance:pricing:update'" type="primary" @click="handleSaveStrategyField" :loading="strategy.submitting.value">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue';
import { Search, Refresh, List, Download, Setting, Money } from '@element-plus/icons-vue'



// Utils
import { formatNumber } from '@/utils/format';
import { formatDate } from '@/utils/helpers/dateUtils';

// Composables
import { usePricing } from './composables/usePricing';
import { useBomAdjustment } from './composables/useBomAdjustment';
import { useStrategyFields } from './composables/useStrategyFields';

// Components
import BomPreviewDialog from './components/BomPreviewDialog.vue';
import BomPriceDialog from './components/BomPriceDialog.vue';
import PriceAdjustDialog from './components/PriceAdjustDialog.vue';
import PriceHistoryDialog from './components/PriceHistoryDialog.vue';
import PricingHistoryDialog from './components/PricingHistoryDialog.vue';
import SettingsDrawer from './components/SettingsDrawer.vue';

// ========== Composables ==========
const pricing = usePricing();
const bom = useBomAdjustment();
const strategy = useStrategyFields();


// ========== 设置 ==========
const settingsVisible = ref(false);
const settingsActiveTab = ref('thresholds');

// ========== Computed ==========
const costTypeText = computed(() => pricing.costType.value === 'bom' ? 'BOM成本' : '采购成本');

const getMarginColor = (margin) => {
  if (margin < pricing.settingsForm.lowMarginThreshold) return 'danger';
  if (margin < pricing.settingsForm.lowMarginThreshold * 2) return 'warning';
  return 'success';
};

// ========== 策略字段计算 ==========
const calculateAdjustedCost = () => {
  return strategy.calculateAdjustedCost(pricing.pricingForm.cost_price);
};

// 策略字段选择变更时触发
const handleStrategyFieldsSelect = (selectedIds) => {
  // 先处理字段初始化
  strategy.handleFieldsChange(selectedIds);
  // 然后重新计算价格
  handleStrategyValueChange();
};

const handleStrategyValueChange = () => {
  if (pricing.pricingForm.profit_margin > 0) {
    pricing.handleMarginChange(calculateAdjustedCost);
  } else if (pricing.pricingForm.suggested_price > 0) {
    pricing.handlePriceChange(calculateAdjustedCost);
  }
};

// ========== 事件处理 ==========
const formRef = ref(null);
const strategyFormRef = ref(null);

const openPricingDrawer = (row) => {
  pricing.handleEdit(row, strategy.availableFields, strategy.selectedFieldIds);
};

const openBomPriceDialog = () => {
  bom.handleViewBomPrice(pricing.pricingForm.product_id);
};

const handleSubmitPricing = async () => {
  // 将本地formRef传递给composable
  pricing.formRef.value = formRef.value;
  const selectedStrategies = strategy.getSelectedStrategies();
  await pricing.submitPricing(selectedStrategies);
};

const handleSaveSettings = () => {
  pricing.saveSettings();
  settingsVisible.value = false;
};

const handleSaveStrategyField = async () => {
  strategy.formRef.value = strategyFormRef.value;
  await strategy.save();
};

// ========== Watchers ==========
watch(settingsVisible, (newVal) => {
  if (newVal && settingsActiveTab.value === 'strategy-fields') {
    strategy.loadFields();
  }
});

watch(settingsActiveTab, (newTab) => {
  if (newTab === 'strategy-fields' && settingsVisible.value) {
    strategy.loadFields();
  }
});

// ========== Lifecycle ==========
onMounted(() => {
  pricing.loadSettings();
  pricing.fetchData();
  strategy.loadAvailableFields();
});
</script>

<style scoped>
.pricing-container {
  padding: 20px;
}

.header-card, .search-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 5px 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}

.drawer-content {
  padding: 20px;
}

/* Cost Section Styles */
.cost-section {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  padding: 20px 24px;
  background-color: #ffff;
  border: 1px solid var(--color-border-lighter);
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.3s;
}

.cost-section:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  border-color: #d9ecff;
}

.cost-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-primary-light-9);
  color: var(--color-primary);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
  margin-right: 20px;
}

.cost-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.cost-label-row {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.cost-label-row .label-text {
  margin-right: 8px;
}

.cost-value-row {
  display: flex;
  align-items: baseline;
  color: var(--color-text-primary);
}

.cost-value-row .currency {
  font-size: 16px;
  font-weight: 600;
  margin-right: 4px;
}

.cost-value-row .amount {
  font-size: 32px;
  font-weight: bold;
  font-family: DINAlternate, "Helvetica Neue", Helvetica, Arial, sans-serif;
  letter-spacing: 1px;
}

.cost-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 20px;
  border-left: 1px solid var(--color-border-lighter);
}

/* Strategy Styles */
.strategies-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.strategy-tag {
  background: var(--color-primary-light-9);
  color: var(--color-primary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}

.more-tag {
  background: #f0f0f0;
  color: var(--color-text-regular);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.strategy-fields-grid {
  margin-bottom: 8px;
}

.strategy-field-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-bg-hover);
  border-radius: 6px;
  margin-bottom: 8px;
}

.strategy-field-compact .field-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-regular);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.strategy-field-compact .field-unit {
  font-size: 12px;
  color: var(--color-text-secondary);
  min-width: 24px;
}

.form-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}
</style>
