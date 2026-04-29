<template>
  <div class="finance-settings">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>财务系统设置</h2>
          <p class="subtitle">管理财务模块的全局参数、税务规则及业务字典</p>
        </div>
        <div class="header-actions">
          <el-button type="warning" plain @click="handleReset" :loading="resetting">重置为默认</el-button>
          <el-button v-permission="'finance:settings:update'" type="primary" @click="handleSave" :loading="saving">保存设置</el-button>
        </div>
      </div>
    </el-card>

    <el-tabs v-model="activeTab" class="settings-tabs" type="border-card" v-loading="loading">
      
      <!-- 基础发票设置 -->
      <el-tab-pane label="基础设置" name="base">
        <el-form :model="settings.invoice" label-position="top">
          <el-row :gutter="24">
            <el-col :span="8">
              <el-form-item label="默认付款期限（天）">
                <el-input-number v-model="settings.invoice.defaultPaymentTermDays" :min="1" :max="365" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="默认货币">
                <el-select v-model="settings.invoice.defaultCurrency" style="width: 100%">
                  <el-option v-for="item in $dict.getOptions('currency_type')" :key="item.value" :label="item.label" :value="item.value" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="付款条款文本">
                <el-input v-model="settings.invoice.defaultPaymentTermsText" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">前缀设置</el-divider>
          <el-row :gutter="24">
            <el-col :span="8">
              <el-form-item label="应收发票前缀">
                <el-input v-model="settings.invoice.invoiceNumberPrefix.AR" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="应付发票前缀">
                <el-input v-model="settings.invoice.invoiceNumberPrefix.AP" />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="收款单前缀">
                <el-input v-model="settings.invoice.receiptNumberPrefix" />
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">列表选项</el-divider>
          <el-row :gutter="24">
            <el-col :span="12">
              <el-form-item label="付款期限选项（天）">
                <el-select
                  v-model="settings.invoice.paymentTermOptions"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  placeholder="输入天数并回车添加"
                  style="width: 100%"
                >
                  <el-option :value="0" label="即时付款 (0)" />
                  <el-option :value="7" label="7天" />
                  <el-option :value="15" label="15天" />
                  <el-option :value="30" label="30天" />
                  <el-option :value="45" label="45天" />
                  <el-option :value="60" label="60天" />
                  <el-option :value="90" label="90天" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="默认每页显示条数">
                <el-select v-model="settings.invoice.pagination.defaultPageSize" style="width: 100%">
                  <el-option
                    v-for="size in settings.invoice.pagination.pageSizeOptions"
                    :key="size"
                    :label="`${size} 条/页`"
                    :value="size"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-tab-pane>

      <!-- 税务设置 -->
      <el-tab-pane label="税务设置" name="tax">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-card shadow="never" class="inner-card">
              <template #header>税率配置</template>
              <el-form :model="settings.tax" label-position="top">
                <el-form-item label="默认增值税率">
                  <el-select v-model="settings.tax.defaultVATRate" style="width: 100%">
                    <el-option v-for="rate in settings.tax.vatRateOptions" :key="rate" :label="formatPercent(rate)" :value="rate" />
                  </el-select>
                </el-form-item>
                <el-form-item label="可选税率列表">
                  <el-select v-model="settings.tax.vatRateOptions" multiple style="width: 100%">
                    <el-option label="0%" :value="0" />
                    <el-option label="1%" :value="0.01" />
                    <el-option label="3%" :value="0.03" />
                    <el-option label="6%" :value="0.06" />
                    <el-option label="9%" :value="0.09" />
                    <el-option label="13%" :value="0.13" />
                  </el-select>
                </el-form-item>
                <el-row :gutter="12">
                   <el-col :span="12">
                     <el-form-item label="企业所得税率">
                      <el-input-number v-model="settings.tax.incomeTaxRate" :min="0" :max="1" :step="0.01" :precision="2" style="width: 100%" />
                    </el-form-item>
                   </el-col>
                   <el-col :span="12">
                     <el-form-item label="附加税费率">
                      <el-input-number v-model="settings.tax.additionalTaxRate" :min="0" :max="1" :step="0.01" :precision="2" style="width: 100%" />
                    </el-form-item>
                   </el-col>
                </el-row>
              </el-form>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never" class="inner-card">
              <template #header>税务字典</template>
              <el-form :model="settings.tax" label-position="top">
                <el-form-item label="申报类型">
                  <el-select v-model="settings.tax.returnTypes" multiple filterable allow-create default-first-option placeholder="输入并回车添加" style="width: 100%">
                    <el-option v-for="item in settings.tax.returnTypes" :key="item" :label="item" :value="item" />
                  </el-select>
                </el-form-item>
                <el-form-item label="申报状态">
                  <el-select v-model="settings.tax.returnStatuses" multiple filterable allow-create default-first-option placeholder="输入并回车添加" style="width: 100%">
                    <el-option v-for="item in settings.tax.returnStatuses" :key="item" :label="item" :value="item" />
                  </el-select>
                </el-form-item>
                <el-form-item label="税务发票类型">
                  <el-select v-model="settings.tax.invoiceTypes" multiple filterable allow-create default-first-option placeholder="输入并回车添加" style="width: 100%">
                    <el-option v-for="item in settings.tax.invoiceTypes" :key="item" :label="item" :value="item" />
                  </el-select>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- 银行/现金设置 -->
      <el-tab-pane label="银行/现金" name="bank">
        <el-row :gutter="24">
          <el-col :span="12">
            <div class="section-header">
              <h4>支付方式配置</h4>
              <el-button v-permission="'finance:settings:update'" size="small" type="primary" :icon="Plus" @click="addPaymentMethod">添加</el-button>
            </div>
            <el-table :data="settings.bank.paymentMethods" border style="width: 100%" height="400">
              <el-table-column label="显示名称 (Label)" prop="label">
                <template #default="scope">
                  <el-input v-model="scope.row.label" placeholder="显示名称" />
                </template>
              </el-table-column>
              <el-table-column label="代码 (Value)" prop="value">
                <template #default="scope">
                  <el-input v-model="scope.row.value" placeholder="代码值" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" align="center">
                <template #default="scope">
                  <el-button v-permission="'finance:settings:update'" type="danger" link @click="removePaymentMethod(scope.$index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-col>
          <el-col :span="12">
            <div class="section-header">
              <h4>交易类型 (系统核心)</h4>
            </div>
            <el-table :data="settings.bank.transactionTypes" border style="width: 100%">
              <el-table-column label="显示名称" prop="label" />
              <el-table-column label="代码值" prop="value" />
            </el-table>
            <el-alert title="注：交易类型涉及系统核心逻辑，暂开放查看，不可修改代码值。" type="info" :closable="false" style="margin-top: 10px;" />
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- 总账配置 -->
      <el-tab-pane label="总账配置" name="gl">
        <el-form :model="settings.gl" label-position="top" style="max-width: 600px;">
          <el-form-item label="单据类型列表">
            <el-select
              v-model="settings.gl.documentTypes"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="输入并回车添加"
              style="width: 100%"
            >
              <el-option v-for="item in settings.gl.documentTypes" :key="item" :label="item" :value="item" />
            </el-select>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- 系统与规则 -->
      <el-tab-pane label="系统与规则" name="system">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-card shadow="never" class="inner-card">
              <template #header>业务规则</template>
              <el-form :model="settings.businessRules" label-position="top">
                <el-row :gutter="12">
                    <el-col :span="12">
                        <el-form-item label="金额精度">
                          <el-input-number v-model="settings.businessRules.amountPrecision" :min="0" :max="6" style="width: 100%" />
                        </el-form-item>
                    </el-col>
                    <el-col :span="12">
                        <el-form-item label="汇率精度">
                          <el-input-number v-model="settings.businessRules.exchangeRatePrecision" :min="2" :max="8" style="width: 100%" />
                        </el-form-item>
                    </el-col>
                </el-row>
                <el-form-item>
                  <el-checkbox v-model="settings.businessRules.enforceBalancedEntry">强制借贷平衡</el-checkbox>
                </el-form-item>
                <el-form-item>
                  <el-checkbox v-model="settings.businessRules.allowNegativeBalance">允许负余额</el-checkbox>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          <el-col :span="12">
            <el-card shadow="never" class="inner-card">
              <template #header>系统概况</template>
              <el-form :model="settings.system" label-position="top">
                <el-form-item label="默认创建人">
                  <el-input v-model="settings.system.defaultCreator" />
                </el-form-item>
                <el-form-item label="默认操作人">
                  <el-input v-model="settings.system.defaultOperator" />
                </el-form-item>
              </el-form>
              <el-divider>会计期间</el-divider>
              <el-form :model="settings.period" label-position="top">
                <el-form-item>
                  <el-checkbox v-model="settings.period.autoGetCurrentPeriod">自动获取当前会计期间</el-checkbox>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import request from '@/utils/request'

const activeTab = ref('base')

const addPaymentMethod = () => {
    settings.bank.paymentMethods.push({ label: '新支付方式', value: 'new_method' })
}

const removePaymentMethod = (index) => {
    settings.bank.paymentMethods.splice(index, 1)
}

const loading = ref(false)
const saving = ref(false)
const resetting = ref(false)

const settings = reactive({
  tax: {
    defaultVATRate: 0.13,
    vatRateOptions: [0, 0.03, 0.06, 0.09, 0.13],
    incomeTaxRate: 0.25,
    additionalTaxRate: 0.12,
    returnTypes: [],
    returnStatuses: [],
    invoiceTypes: [],
    invoiceStatuses: []
  },
  bank: {
    paymentMethods: [],
    transactionTypes: [],
    transactionCategories: {
      income: [],
      expense: [],
      transfer: []
    }
  },
  gl: {
    documentTypes: [],
    entryStatuses: []
  },
  invoice: {
    defaultPaymentTermDays: 30,
    defaultPaymentTermsText: '30天付款',
    defaultCurrency: 'CNY',
    defaultExchangeRate: 1.0,
    invoiceNumberPrefix: {
      AR: 'AR',
      AP: 'AP'
    },
    receiptNumberPrefix: 'RC',
    paymentTermOptions: [0, 7, 15, 30, 45, 60, 90],
    pagination: {
      defaultPageSize: 20,
      pageSizeOptions: [10, 20, 50, 100]
    }
  },
  businessRules: {
    allowNegativeBalance: false,
    enforceBalancedEntry: true,
    amountPrecision: 2,
    exchangeRatePrecision: 4
  },
  period: {
    defaultPeriodId: null,
    autoGetCurrentPeriod: true
  },
  system: {
    defaultCreator: 'system',
    defaultOperator: 'system'
  }
})

const formatPercent = (value) => {
  return `${(value * 100).toFixed(0)}%`
}

const loadSettings = async () => {
  loading.value = true
  try {
    const res = await request.get('/finance/settings')
    if (res.success && res.data) {
      // 深度合并或手动赋值，确保响应式丢失
      // Tax
      if (res.data.tax) Object.assign(settings.tax, res.data.tax)
      
      // Invoice
      if (res.data.invoice) {
        Object.assign(settings.invoice, res.data.invoice)
        // 确保 invoiceNumberPrefix 存在
        if (!settings.invoice.invoiceNumberPrefix) {
            settings.invoice.invoiceNumberPrefix = { AR: 'AR', AP: 'AP' }
        }
      }

      // Bank
      if (res.data.bank) {
          settings.bank.paymentMethods = res.data.bank.paymentMethods || []
          settings.bank.transactionTypes = res.data.bank.transactionTypes || []
          settings.bank.transactionCategories = res.data.bank.transactionCategories || { income: [], expense: [], transfer: [] }
      }

      // GL
      if (res.data.gl) {
          settings.gl.documentTypes = res.data.gl.documentTypes || []
          settings.gl.entryStatuses = res.data.gl.entryStatuses || []
      }

      // Other
      if (res.data.businessRules) Object.assign(settings.businessRules, res.data.businessRules)
      if (res.data.period) Object.assign(settings.period, res.data.period)
      if (res.data.system) Object.assign(settings.system, res.data.system)
    }
  } catch (error) {
    console.error('加载设置失败:', error)
    ElMessage.error('加载设置失败')
  } finally {
    loading.value = false
  }
}

const handleSave = async () => {
  saving.value = true
  try {
    const res = await request.put('/finance/settings', settings)
    if (res.success) {
      ElMessage.success('设置已保存')
    } else {
      ElMessage.error(res.message || '保存失败')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

const handleReset = async () => {
  try {
    await ElMessageBox.confirm('确定要重置为默认配置吗？', '警告', {
      type: 'warning'
    })
    
    resetting.value = true
    const res = await request.post('/finance/settings/reset')
    if (res.success && res.data) {
      Object.assign(settings, res.data)
      ElMessage.success('已重置为默认配置')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('重置失败:', error)
      ElMessage.error('重置失败')
    }
  } finally {
    resetting.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<style scoped>
.finance-settings {
  padding: 20px;
}

.header-card {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.title-section h2 {
  margin: 0;
  font-size: 24px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 5px 0 0 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.settings-tabs {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  border: none;
  overflow: hidden;
}

.settings-tabs :deep(.el-tabs__header) {
  background: var(--color-bg-section);
  margin: 0;
  padding: 16px 20px 0;
  border-bottom: 1px solid var(--color-border-light);
}

.settings-tabs :deep(.el-tabs__item) {
  border-radius: 8px 8px 0 0;
  padding: 12px 24px;
  font-weight: 500;
  transition: all 0.3s;
}

.settings-tabs :deep(.el-tabs__item:hover) {
  background: rgba(64, 158, 255, 0.05);
}

.settings-tabs :deep(.el-tabs__item.is-active) {
  background: white;
  color: var(--color-primary);
}

.settings-tabs :deep(.el-tabs__content) {
  padding: 24px;
}

.inner-card {
  height: 100%;
  border-radius: 12px;
  border: 1px solid var(--color-border-light);
  overflow: hidden;
  transition: all 0.3s;
}

.inner-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}

.inner-card :deep(.el-card__header) {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  color: var(--color-text-primary);
  font-weight: 600;
  padding: 14px 20px;
  border-bottom: 1px solid var(--color-border-light);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--color-border-light);
}

.section-header h4 {
  margin: 0;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 600;
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

.settings-tabs :deep(.el-input__wrapper),
.settings-tabs :deep(.el-input-number__wrapper) {
  border-radius: 8px;
  transition: all 0.3s;
}

.settings-tabs :deep(.el-input__wrapper:hover),
.settings-tabs :deep(.el-input-number__wrapper:hover) {
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.15);
}

.settings-tabs :deep(.el-select__wrapper) {
  border-radius: 8px;
}

.settings-tabs :deep(.el-button) {
  border-radius: 8px;
}

.settings-tabs :deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

.settings-tabs :deep(.el-divider__text) {
  background-color: var(--color-on-primary, #fff);
  font-weight: 500;
  color: var(--color-text-regular);
}

.settings-tabs :deep(.el-alert) {
  border-radius: 8px;
}
</style>
