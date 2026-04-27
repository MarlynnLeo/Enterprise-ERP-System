<template>
  <!-- 定价设置抽屉 -->
  <el-drawer
    v-model="visible"
    title="定价设置"
    size="600px"
    destroy-on-close
  >
    <div class="settings-content">
      <el-tabs v-model="activeTab">
        <!-- 预警阈值设置 -->
        <el-tab-pane label="预警阈值" name="thresholds">
          <el-form label-width="150px" class="settings-form">
            <el-form-item label="低利润率阈值 (%)">
              <el-input-number 
                v-model="form.lowMarginThreshold" 
                :min="0" 
                :max="100"
                :step="1"
              />
              <div class="form-tip">低于此阈值的产品将显示警告标记</div>
            </el-form-item>
            <el-form-item label="成本变动阈值 (%)">
              <el-input-number 
                v-model="form.costVarianceThreshold" 
                :min="0" 
                :max="100"
                :step="1"
              />
              <div class="form-tip">成本变动超过此阈值时显示警告</div>
            </el-form-item>
            <el-form-item label="最低利润率限制 (%)">
              <el-input-number 
                v-model="form.minProfitMargin" 
                :min="-100" 
                :max="100"
                :step="1"
              />
              <div class="form-tip">定价时利润率不能低于此值</div>
            </el-form-item>
            <el-form-item label="允许成本价销售">
              <el-switch v-model="form.allowCostPrice" />
              <div class="form-tip">开启后允许0%利润率定价</div>
            </el-form-item>
            <el-form-item label="默认筛选">
              <el-select v-model="form.defaultFilter" placeholder="无" clearable>
                <el-option label="低利润率" value="low_margin" />
                <el-option label="成本变动" value="cost_variance" />
                <el-option label="未定价" value="no_pricing" />
              </el-select>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 策略字段管理 -->
        <el-tab-pane label="策略字段" name="strategy-fields">
          <div class="strategy-fields-header">
            <el-button type="primary" @click="$emit('add-field')">
              <el-icon><Plus /></el-icon> 新增字段
            </el-button>
          </div>
          <el-table :data="strategyFields" border stripe v-loading="fieldsLoading" max-height="400">
            <el-table-column prop="field_label" label="显示标签" min-width="120" />
            <el-table-column prop="field_name" label="字段名" width="150">
              <template #default="{ row }">
                <code>{{ row.field_name }}</code>
              </template>
            </el-table-column>
            <el-table-column prop="field_type" label="类型" width="80" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="row.field_type === 'amount' ? 'primary' : 'warning'">
                  {{ row.field_type === 'amount' ? '金额' : '百分比' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="unit" label="单位" width="60" align="center" />
            <el-table-column label="计入成本" width="80" align="center">
              <template #default="{ row }">
                <el-icon v-if="row.is_additive" color="#67C23A"><Check /></el-icon>
                <el-icon v-else color="#909399"><Close /></el-icon>
              </template>
            </el-table-column>
            <el-table-column prop="description" label="描述" show-overflow-tooltip />
            <el-table-column prop="is_active" label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-switch 
                  v-model="row.is_active" 
                  :active-value="1" 
                  :inactive-value="0"
                  @change="$emit('toggle-field', row)"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right" align="center">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="$emit('edit-field', row)" v-permission="'finance:pricing'">编辑</el-button>
                <el-button type="danger" link size="small" @click="$emit('delete-field', row)" v-permission="'finance:pricing'">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-button type="info" plain @click="$emit('reset')" v-if="activeTab === 'thresholds'">恢复默认</el-button>
        <div style="flex: 1"></div>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="$emit('save')" v-if="activeTab === 'thresholds'">保存设置</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup>
import { computed } from 'vue';
import { Plus, Check, Close } from '@element-plus/icons-vue';

const props = defineProps({
  modelValue: Boolean,
  form: {
    type: Object,
    required: true
  },
  strategyFields: {
    type: Array,
    default: () => []
  },
  fieldsLoading: Boolean,
  activeTab: {
    type: String,
    default: 'thresholds'
  }
});

const emit = defineEmits([
  'update:modelValue', 
  'update:activeTab',
  'save', 
  'reset', 
  'add-field', 
  'edit-field', 
  'delete-field', 
  'toggle-field'
]);

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const activeTab = computed({
  get: () => props.activeTab,
  set: (val) => emit('update:activeTab', val)
});
</script>

<style scoped>
.settings-content {
  padding: 0 20px;
}

.settings-form {
  max-width: 500px;
}

.form-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.strategy-fields-header {
  margin-bottom: 16px;
}

.drawer-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
