<!--
  EntryFormDialog.vue
  会计凭证录入对话框：支持从业务单据批量生成 + 手工分录
  多选业务单据默认合并为 1 张会计凭证（各单仍分别开票）
-->
<template>
  <AppDialog
    :model-value="modelValue"
    mode="form"
    :title="dialogTitle"
    width="960px"
    :close-on-click-modal="false"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @closed="handleClosed"
  >
    <el-tabs v-model="activeTab" class="entry-tabs">
      <!-- 从业务单据生成 -->
      <el-tab-pane label="从业务单据生成" name="business">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="mb-3"
          title="专业路径：采购应付取「采购入库单」（按入库量），销售应收取「销售出库单」（按交货量）。多选时默认合并为 1 张凭证（各单据仍分别生成发票）。请先「预览凭证」核对/修改金额后再确认生成。"
        />

        <el-form label-width="90px" class="mb-2">
          <el-form-item label="业务类型">
            <el-radio-group v-model="businessType" @change="handleBusinessTypeChange">
              <el-radio-button
                v-for="opt in businessTypeOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="搜索">
            <div class="toolbar-row">
              <el-input
                v-model="orderKeyword"
                clearable
                :placeholder="currentBusinessMeta.searchPlaceholder"
                class="search-input"
                @keyup.enter="loadOrders"
              />
              <el-button type="primary" :loading="orderLoading" @click="loadOrders">
                查询
              </el-button>
            </div>
          </el-form-item>
        </el-form>

        <div v-if="selectedOrders.length" class="selection-bar">
          已选 <strong>{{ selectedOrders.length }}</strong> 张
          <el-button link type="primary" @click="clearSelection">清空</el-button>
        </div>

        <el-table
          ref="orderTableRef"
          :data="orderList"
          border
          v-loading="orderLoading"
          max-height="360"
          row-key="id"
          @selection-change="handleSelectionChange"
        >
          <template #empty>
            <EmptyState :description="currentBusinessMeta.emptyText" />
          </template>
          <el-table-column type="selection" width="48" reserve-selection />
          <el-table-column
            :prop="currentBusinessMeta.docNoField"
            :label="currentBusinessMeta.docNoLabel"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            prop="partyName"
            :label="currentBusinessMeta.partyLabel"
            min-width="140"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ row.partyName || row.customerName || row.supplierName || '-' }}
            </template>
          </el-table-column>
          <el-table-column
            v-if="currentBusinessMeta.showSourceOrder"
            prop="sourceOrderNo"
            :label="currentBusinessMeta.sourceOrderLabel || '关联订单'"
            min-width="130"
            show-overflow-tooltip
          />
          <el-table-column prop="docDate" label="日期" width="110">
            <template #default="{ row }">
              {{
                row.docDate ||
                row.orderDate ||
                row.deliveryDate ||
                row.receiptDate ||
                '-'
              }}
            </template>
          </el-table-column>
          <el-table-column prop="totalAmount" label="金额" width="120" align="right">
            <template #default="{ row }">
              {{ formatCurrency(row.totalAmount || row.subtotal || 0) }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100" />
        </el-table>

        <div v-if="orderTotal > orderPageSize" class="pager">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :total="orderTotal"
            :page-size="orderPageSize"
            :current-page="orderPage"
            @current-change="handleOrderPageChange"
          />
        </div>
      </el-tab-pane>

      <!-- 手工录入 -->
      <el-tab-pane label="手工录入" name="manual">
        <el-form ref="formRef" :model="entryForm" :rules="rules" label-width="90px">
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="记账日期" prop="entryDate">
                <el-date-picker
                  v-model="entryForm.entry_date"
                  type="date"
                  value-format="YYYY-MM-DD"
                  class="w-full"
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="凭证字" prop="voucherWord">
                <el-select v-model="entryForm.voucher_word" class="w-full">
                  <el-option label="记" value="记" />
                  <el-option label="收" value="收" />
                  <el-option label="付" value="付" />
                  <el-option label="转" value="转" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="附单据数" prop="documentNumber">
                <el-input-number v-model="entryForm.document_number" :min="0" class="w-full" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="摘要" prop="description">
            <el-input v-model="entryForm.description" placeholder="凭证摘要" />
          </el-form-item>
        </el-form>

        <div class="items-header">
          <span>凭证明细</span>
          <el-button type="success" size="small" plain @click="addItem">添加明细行</el-button>
        </div>

        <el-table :data="entryForm.items" border class="w-full" max-height="320">
          <el-table-column label="摘要" width="160">
            <template #default="{ row }">
              <el-input v-model="row.description" placeholder="明细摘要" size="small" />
            </template>
          </el-table-column>
          <el-table-column label="会计科目" min-width="220">
            <template #default="{ row, $index }">
              <el-cascader
                v-model="row.accountId"
                :options="accountOptions"
                :props="{ checkStrictly: true, value: 'id', label: 'fullName', emitPath: false }"
                placeholder="请选择科目"
                filterable
                size="small"
                class="w-full"
                @change="(val) => handleAccountChange(val, $index)"
              />
              <div
                v-if="row._accountAux && Object.values(row._accountAux).some(Boolean)"
                class="aux-area"
              >
                <el-select
                  v-if="row._accountAux.has_customer"
                  v-model="row.customerId"
                  placeholder="客户"
                  size="small"
                  class="aux-item"
                >
                  <el-option
                    v-for="c in customerOptions"
                    :key="c.id"
                    :label="c.customerName || c.name"
                    :value="c.id"
                  />
                </el-select>
                <el-select
                  v-if="row._accountAux.has_supplier"
                  v-model="row.supplierId"
                  placeholder="供应商"
                  size="small"
                  class="aux-item"
                >
                  <el-option
                    v-for="s in supplierOptions"
                    :key="s.id"
                    :label="s.supplierName || s.name"
                    :value="s.id"
                  />
                </el-select>
                <el-select
                  v-if="row._accountAux.has_employee"
                  v-model="row.employeeId"
                  placeholder="员工"
                  size="small"
                  class="aux-item"
                >
                  <el-option
                    v-for="u in userOptions"
                    :key="u.id"
                    :label="u.username || u.realName"
                    :value="u.id"
                  />
                </el-select>
                <el-select
                  v-if="row._accountAux.has_department"
                  v-model="row.costCenterId"
                  placeholder="部门"
                  size="small"
                  class="aux-item"
                >
                  <el-option
                    v-for="d in departmentOptions"
                    :key="d.id"
                    :label="d.departmentName || d.name"
                    :value="d.id"
                  />
                </el-select>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="借方" width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.debitAmount"
                :precision="2"
                :min="0"
                :controls="false"
                size="small"
                class="w-full"
                @change="() => (row.creditAmount = row.debitAmount > 0 ? 0 : row.creditAmount)"
              />
            </template>
          </el-table-column>
          <el-table-column label="贷方" width="130">
            <template #default="{ row }">
              <el-input-number
                v-model="row.creditAmount"
                :precision="2"
                :min="0"
                :controls="false"
                size="small"
                class="w-full"
                @change="() => (row.debitAmount = row.creditAmount > 0 ? 0 : row.debitAmount)"
              />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="{ $index }">
              <el-button
                type="danger"
                link
                size="small"
                :disabled="entryForm.items.length <= 2"
                @click="removeItem($index)"
              >
                删
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="totals-row">
          <span>借方合计：{{ formatCurrency(totalDebit) }}</span>
          <span>贷方合计：{{ formatCurrency(totalCredit) }}</span>
          <span :class="isBalanced ? 'ok' : 'bad'">
            {{
              isBalanced
                ? '借贷平衡'
                : `差额 ${formatCurrency(Math.abs(totalDebit - totalCredit))}`
            }}
          </span>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <template v-if="activeTab === 'business'">
        <el-button
          type="primary"
          plain
          :loading="previewLoading"
          :disabled="!selectedOrders.length"
          @click="openPreview"
        >
          预览凭证（{{ selectedOrders.length }}）
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!selectedOrders.length"
          @click="submitBusinessGenerate"
        >
          直接生成（合并 1 张）
        </el-button>
      </template>
      <el-button v-else type="primary" :loading="submitting" @click="submitManualEntry">
        保存凭证
      </el-button>
    </template>
  </AppDialog>

  <!-- 合并凭证预览（可编辑） -->
  <AppDialog
    v-model="previewVisible"
    mode="form"
    :title="previewDialogTitle"
    width="1100px"
    :close-on-click-modal="false"
    destroy-on-close
    @closed="handlePreviewClosed"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      class="mb-3"
      :title="previewHint"
    />

    <div v-loading="previewLoading" class="preview-body">
      <template v-if="previewVouchers.length">
        <el-tabs v-model="activePreviewKey" type="card" class="preview-tabs">
          <el-tab-pane
            v-for="(voucher, vIndex) in previewVouchers"
            :key="voucher._key"
            :name="voucher._key"
          >
            <template #label>
              <span :class="{ 'tab-warn': voucher.skipped || voucher.error }">
                {{ voucherTabLabel(voucher, vIndex) }}
              </span>
            </template>

            <div v-if="voucher.skipped || voucher.error" class="preview-skip">
              <el-result
                :icon="voucher.error ? 'error' : 'info'"
                :title="voucher.error ? '预览失败' : '已存在，将跳过'"
                :sub-title="voucher.skipMessage || voucher.message || ''"
              />
            </div>

            <template v-else>
              <el-form label-width="90px" class="mb-2 preview-header-form">
                <el-row :gutter="12">
                  <el-col :span="8">
                    <el-form-item label="来源单据">
                      <el-input
                        :model-value="
                          voucher.isMerged
                            ? `合并 ${voucher.sourceIds?.length || 1} 张`
                            : voucher.docNo
                        "
                        disabled
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item :label="currentBusinessMeta.partyLabel">
                      <el-input :model-value="voucher.partyName || '-'" disabled />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="记账日期">
                      <el-date-picker
                        v-model="voucher.entryDate"
                        type="date"
                        value-format="YYYY-MM-DD"
                        class="w-full"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row :gutter="12">
                  <el-col :span="16">
                    <el-form-item label="摘要">
                      <el-input v-model="voucher.description" placeholder="凭证摘要" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="8">
                    <el-form-item label="税率">
                      <el-input-number
                        v-model="voucher.taxRatePercent"
                        :min="0"
                        :max="100"
                        :precision="2"
                        :controls="false"
                        class="w-full"
                        @change="() => recalcVoucherFromRate(voucher)"
                      />
                      <span class="field-suffix">%</span>
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item
                  v-if="voucher.isMerged && voucher.sourceDocs?.length"
                  label="合并来源"
                >
                  <div class="merge-docs">
                    <el-tag
                      v-for="doc in voucher.sourceDocs"
                      :key="doc.id"
                      size="small"
                      class="merge-doc-tag"
                    >
                      {{ doc.docNo }} · {{ formatCurrency(doc.totalAmount || 0) }}
                    </el-tag>
                  </div>
                </el-form-item>
              </el-form>

              <div class="items-header">
                <span>业务明细（可改数量/单价，自动重算金额与分录）</span>
              </div>
              <el-table :data="voucher.items" border size="small" max-height="200" class="mb-3">
                <el-table-column
                  v-if="voucher.isMerged"
                  label="来源单号"
                  width="140"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">
                    {{ row.sourceDocNo || '-' }}
                  </template>
                </el-table-column>
                <el-table-column label="物料/产品" min-width="160" show-overflow-tooltip>
                  <template #default="{ row }">
                    {{ row.materialName || row.productName || row.materialCode || '-' }}
                  </template>
                </el-table-column>
                <el-table-column label="数量" width="120">
                  <template #default="{ row }">
                    <el-input-number
                      v-model="row.quantity"
                      :min="0"
                      :precision="4"
                      :controls="false"
                      size="small"
                      class="w-full"
                      @change="() => recalcVoucherFromItems(voucher)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="单价(未税)" width="130">
                  <template #default="{ row }">
                    <el-input-number
                      v-model="row.unitPrice"
                      :min="0"
                      :precision="4"
                      :controls="false"
                      size="small"
                      class="w-full"
                      @change="() => recalcVoucherFromItems(voucher)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="金额(未税)" width="120" align="right">
                  <template #default="{ row }">
                    {{ formatCurrency(row.amount || 0) }}
                  </template>
                </el-table-column>
              </el-table>

              <el-row :gutter="12" class="mb-3 amount-row">
                <el-col :span="8">
                  <div class="amount-box">
                    <span class="lbl">未税合计</span>
                    <strong>{{ formatCurrency(voucher.subtotal) }}</strong>
                  </div>
                </el-col>
                <el-col :span="8">
                  <div class="amount-box">
                    <span class="lbl">税额</span>
                    <el-input-number
                      v-model="voucher.taxAmount"
                      :min="0"
                      :precision="2"
                      :controls="false"
                      size="small"
                      class="amount-input"
                      @change="() => recalcVoucherFromTax(voucher)"
                    />
                  </div>
                </el-col>
                <el-col :span="8">
                  <div class="amount-box">
                    <span class="lbl">价税合计</span>
                    <strong class="total">{{ formatCurrency(voucher.totalAmount) }}</strong>
                  </div>
                </el-col>
              </el-row>

              <div class="items-header">
                <span>凭证明细（可改科目/摘要/借贷）</span>
                <span :class="isPreviewBalanced(voucher) ? 'ok' : 'bad'" class="balance-tag">
                  {{
                    isPreviewBalanced(voucher)
                      ? '借贷平衡'
                      : `差额 ${formatCurrency(Math.abs(previewDebit(voucher) - previewCredit(voucher)))}`
                  }}
                </span>
              </div>
              <el-table :data="voucher.entryLines" border size="small" max-height="240">
                <el-table-column label="摘要" min-width="180">
                  <template #default="{ row }">
                    <el-input v-model="row.description" size="small" />
                  </template>
                </el-table-column>
                <el-table-column label="会计科目" min-width="220">
                  <template #default="{ row }">
                    <el-cascader
                      v-model="row.accountId"
                      :options="accountOptions"
                      :props="{
                        checkStrictly: true,
                        value: 'id',
                        label: 'fullName',
                        emitPath: false,
                      }"
                      filterable
                      size="small"
                      class="w-full"
                      @change="(val) => handlePreviewAccountChange(row, val)"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="借方" width="130">
                  <template #default="{ row }">
                    <el-input-number
                      v-model="row.debitAmount"
                      :precision="2"
                      :min="0"
                      :controls="false"
                      size="small"
                      class="w-full"
                      @change="
                        () => {
                          if (row.debitAmount > 0) row.creditAmount = 0
                        }
                      "
                    />
                  </template>
                </el-table-column>
                <el-table-column label="贷方" width="130">
                  <template #default="{ row }">
                    <el-input-number
                      v-model="row.creditAmount"
                      :precision="2"
                      :min="0"
                      :controls="false"
                      size="small"
                      class="w-full"
                      @change="
                        () => {
                          if (row.creditAmount > 0) row.debitAmount = 0
                        }
                      "
                    />
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </el-tab-pane>
        </el-tabs>
      </template>
      <EmptyState v-else-if="!previewLoading" description="暂无预览数据" />
    </div>

    <template #footer>
      <el-button @click="previewVisible = false">返回修改选择</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!previewReadyCount"
        @click="confirmPreviewGenerate"
      >
        确认生成合并凭证
      </el-button>
    </template>
  </AppDialog>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppDialog from '@/components/ui/AppDialog.vue'
import { financeApi, salesApi, purchaseApi } from '@/api'
import { formatCurrency, formatLocalDate } from '@/utils/format'
import { parsePaginatedData, parseListData, parseResponseData } from '@/utils/responseParser'
import { loadDepartmentOptions, loadUserListOptions } from '@/utils/optionLoaders'

/**
 * 专业 ERP 主路径（对话框仅展示这两类）：
 * - 采购应付：入库单（按入库量）
 * - 销售应收：出库单（按交货量）
 */
const BUSINESS_TYPE_OPTIONS = [
  {
    value: 'purchase_receipt',
    label: '采购入库单',
    searchPlaceholder: '入库单号 / 采购订单号 / 供应商',
    emptyText: '暂无待生成凭证的采购入库单（已生成应付的不会显示）',
    confirmLabel: '采购入库单',
    docNoLabel: '入库单号',
    docNoField: 'receipt_no',
    partyLabel: '供应商',
    showSourceOrder: true,
    sourceOrderLabel: '关联采购订单',
    fetch: (params) => financeApi.integration.getEligiblePurchaseReceipts(params),
  },
  {
    value: 'sales_outbound',
    label: '销售出库单',
    searchPlaceholder: '出库单号 / 销售订单号 / 客户',
    emptyText: '暂无待生成凭证的销售出库单（已生成应收的不会显示）',
    confirmLabel: '销售出库单',
    docNoLabel: '出库单号',
    docNoField: 'outbound_no',
    partyLabel: '客户',
    showSourceOrder: true,
    sourceOrderLabel: '关联销售订单',
    fetch: (params) => financeApi.integration.getEligibleSalesOutbounds(params),
  },
]

const ENTRY_ROLES = Object.freeze({
  COST: 'cost',
  TAX: 'tax',
  PAYABLE: 'payable',
  RECEIVABLE: 'receivable',
  INCOME: 'income',
})

const ROLE_ACCOUNT_KEY = Object.freeze({
  cost: 'costAccountId',
  tax: 'taxAccountId',
  payable: 'payableAccountId',
  receivable: 'receivableAccountId',
  income: 'incomeAccountId',
})

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  defaultVoucherWord: { type: String, default: '记' },
  defaultMode: { type: String, default: 'business' },
})

const emit = defineEmits(['update:modelValue', 'success'])

const activeTab = ref('business')
const businessType = ref('purchase_receipt')
const submitting = ref(false)
const previewLoading = ref(false)
const previewVisible = ref(false)
const previewVouchers = ref([])
const activePreviewKey = ref('')

const businessTypeOptions = BUSINESS_TYPE_OPTIONS
const currentBusinessMeta = computed(
  () =>
    BUSINESS_TYPE_OPTIONS.find((o) => o.value === businessType.value) ||
    BUSINESS_TYPE_OPTIONS[0]
)
const dialogTitle = computed(() =>
  activeTab.value === 'business' ? '从业务单据生成凭证' : '手工录入凭证'
)
const previewDialogTitle = computed(() => {
  const ready = previewVouchers.value.find((v) => !v.skipped && !v.error)
  if (ready?.isMerged && ready.sourceIds?.length > 1) {
    return `合并凭证预览（${ready.sourceIds.length} 张单据 → 1 张凭证）`
  }
  if (ready) return '凭证预览（1 张）'
  return '凭证预览'
})
const previewHint = computed(() => {
  const label = currentBusinessMeta.value.confirmLabel
  const n = selectedOrders.value.length
  if (n > 1) {
    return `已选 ${n} 张${label}：将合并生成 1 张会计凭证（各单据仍分别开票）。请核对合并后的明细与分录，金额不对可直接修改后再确认生成。`
  }
  return `已选 1 张${label}：请核对明细与分录，金额不对可直接修改后再确认生成。`
})
const previewReadyCount = computed(
  () => previewVouchers.value.filter((v) => !v.skipped && !v.error).length
)

const orderLoading = ref(false)
const orderList = ref([])
const orderKeyword = ref('')
const orderPage = ref(1)
const orderPageSize = ref(10)
const orderTotal = ref(0)
const selectedOrders = ref([])
const orderTableRef = ref(null)

const formRef = ref(null)
const accountOptions = ref([])
const flatAccounts = ref([])
const customerOptions = ref([])
const supplierOptions = ref([])
const userOptions = ref([])
const departmentOptions = ref([])
const optionsLoaded = ref(false)

const createEmptyItem = () => ({
  description: '',
  account_id: null,
  debit_amount: 0,
  credit_amount: 0,
  customer_id: null,
  supplier_id: null,
  employee_id: null,
  cost_center_id: null,
  project_id: null,
  _accountAux: null,
})

const entryForm = reactive({
  entry_date: formatLocalDate(new Date()),
  voucher_word: '记',
  document_number: 0,
  description: '',
  items: [createEmptyItem(), createEmptyItem()],
})

const rules = {
  entry_date: [{ required: true, message: '请选择记账日期', trigger: 'change' }],
  voucher_word: [{ required: true, message: '请选择凭证字', trigger: 'change' }],
}

const totalDebit = computed(() =>
  entryForm.items.reduce((sum, item) => sum + (Number(item.debitAmount) || 0), 0)
)
const totalCredit = computed(() =>
  entryForm.items.reduce((sum, item) => sum + (Number(item.creditAmount) || 0), 0)
)
const isBalanced = computed(
  () => Math.abs(totalDebit.value - totalCredit.value) < 0.01 && totalDebit.value > 0
)

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

function sumField(rows, field) {
  return round2((rows || []).reduce((sum, row) => sum + (Number(row[field]) || 0), 0))
}

function resetBusinessState() {
  orderList.value = []
  orderKeyword.value = ''
  orderPage.value = 1
  orderTotal.value = 0
  selectedOrders.value = []
  nextTick(() => orderTableRef.value?.clearSelection?.())
}

function resetPreviewState() {
  previewVouchers.value = []
  activePreviewKey.value = ''
  previewLoading.value = false
}

function resetManualForm() {
  entryForm.entry_date = formatLocalDate(new Date())
  entryForm.voucher_word = props.defaultVoucherWord || '记'
  entryForm.document_number = 0
  entryForm.description = ''
  entryForm.items = [createEmptyItem(), createEmptyItem()]
}

function handleClosed() {
  resetBusinessState()
  resetManualForm()
  resetPreviewState()
  previewVisible.value = false
  activeTab.value = 'business'
  businessType.value = 'purchase_receipt'
  submitting.value = false
}

function handlePreviewClosed() {
  previewLoading.value = false
}

function voucherTabLabel(voucher, index) {
  if (voucher.error) return `${index + 1}. 失败`
  if (voucher.skipped) return `${index + 1}. ${voucher.docNo || voucher.id || '单据'} · 跳过`
  if (voucher.isMerged && voucher.sourceIds?.length > 1) {
    return `合并凭证（${voucher.sourceIds.length} 张）`
  }
  return `${index + 1}. ${voucher.docNo || `#${voucher.id}`}`
}

function previewDebit(voucher) {
  return sumField(voucher.entryLines, 'debit_amount')
}

function previewCredit(voucher) {
  return sumField(voucher.entryLines, 'credit_amount')
}

function isPreviewBalanced(voucher) {
  const debit = previewDebit(voucher)
  const credit = previewCredit(voucher)
  return Math.abs(debit - credit) < 0.01 && debit > 0
}

function setLineAmounts(line, debit, credit) {
  if (!line) return
  line.debit_amount = debit
  line.credit_amount = credit
}

function syncEntryLinesAmounts(voucher) {
  const lines = voucher.entryLines || []
  if (!lines.length) return
  const subtotal = round2(voucher.subtotal)
  const tax = round2(voucher.taxAmount)
  const total = round2(voucher.totalAmount)
  const byRole = (role) => lines.find((line) => line.role === role)
  const splitTax = tax > 0.0001 && byRole(ENTRY_ROLES.TAX)

  if (businessType.value === 'purchase_receipt') {
    setLineAmounts(byRole(ENTRY_ROLES.COST), splitTax ? subtotal : total, 0)
    setLineAmounts(byRole(ENTRY_ROLES.TAX), splitTax ? tax : 0, 0)
    setLineAmounts(byRole(ENTRY_ROLES.PAYABLE), 0, total)
    return
  }

  setLineAmounts(byRole(ENTRY_ROLES.RECEIVABLE), total, 0)
  setLineAmounts(byRole(ENTRY_ROLES.INCOME), 0, splitTax ? subtotal : total)
  setLineAmounts(byRole(ENTRY_ROLES.TAX), 0, splitTax ? tax : 0)
}

function recalcVoucherFromItems(voucher) {
  if (!voucher?.items) return
  let subtotal = 0
  for (const row of voucher.items) {
    const qty = Number(row.quantity) || 0
    const price = Number(row.unitPrice) || 0
    row.amount = round2(qty * price)
    subtotal += row.amount
  }
  voucher.subtotal = round2(subtotal)
  const rate = Number(voucher.taxRate) || 0
  voucher.taxAmount = round2(subtotal * rate)
  voucher.totalAmount = round2(voucher.subtotal + voucher.taxAmount)
  syncEntryLinesAmounts(voucher)
}

function recalcVoucherFromRate(voucher) {
  const percent = Number(voucher.taxRatePercent)
  const rate = Number.isFinite(percent) ? percent / 100 : 0
  voucher.taxRate = rate
  voucher.taxAmount = round2((Number(voucher.subtotal) || 0) * rate)
  voucher.totalAmount = round2((Number(voucher.subtotal) || 0) + voucher.taxAmount)
  syncEntryLinesAmounts(voucher)
}

function recalcVoucherFromTax(voucher) {
  voucher.taxAmount = round2(voucher.taxAmount)
  voucher.totalAmount = round2((Number(voucher.subtotal) || 0) + voucher.taxAmount)
  const sub = Number(voucher.subtotal) || 0
  if (sub > 0) {
    voucher.taxRate = round2(voucher.taxAmount / sub)
    voucher.taxRatePercent = round2(voucher.taxRate * 100)
  }
  syncEntryLinesAmounts(voucher)
}

function handlePreviewAccountChange(line, accountId) {
  const account = flatAccounts.value.find((a) => a.id === accountId)
  if (!account) return
  line.account_code = account.account_code
  line.account_name = account.account_name
  line.account_label = `${account.account_code} - ${account.account_name}`
}

function normalizePreviewItem(item) {
  const quantity = Number(item.quantity) || 0
  const unitPrice = Number(item.unitPrice ?? item.price) || 0
  return {
    ...item,
    source_id: item.sourceId || null,
    source_doc_no: item.sourceDocNo || null,
    quantity,
    unit_price: unitPrice,
    amount: Number(item.amount) || round2(quantity * unitPrice),
  }
}

function normalizePreviewVoucher(raw, index) {
  const sourceIds = Array.isArray(raw.sourceIds)
    ? raw.sourceIds
    : raw.id != null
      ? [raw.id]
      : []
  const taxRate = Number(raw.taxRate) || 0
  const isMerged = Boolean(raw.isMerged || sourceIds.length > 1)

  return {
    ...raw,
    _key: `v-${isMerged ? 'merge' : 'single'}-${raw.id ?? index}-${index}`,
    isMerged,
    sourceIds,
    sourceDocs: Array.isArray(raw.sourceDocs) ? raw.sourceDocs : [],
    entryDate: raw.entryDate || formatLocalDate(new Date()),
    description: raw.description || '',
    subtotal: Number(raw.subtotal) || 0,
    taxAmount: Number(raw.taxAmount) || 0,
    taxRate,
    taxRatePercent: round2(taxRate * 100),
    totalAmount: Number(raw.totalAmount) || 0,
    items: (raw.items || []).map(normalizePreviewItem),
    entryLines: (raw.entryLines || []).map((line) => ({
      ...line,
      role: line.role || '',
      account_id: line.account_id || null,
      debit_amount: Number(line.debit_amount) || 0,
      credit_amount: Number(line.credit_amount) || 0,
      description: line.description || '',
    })),
  }
}

async function openPreview() {
  if (!selectedOrders.value.length) {
    ElMessage.warning('请先勾选业务单据')
    return
  }
  previewLoading.value = true
  previewVisible.value = true
  try {
    await loadManualOptions()
    const response = await financeApi.integration.batchPreviewFromOrders({
      businessType: businessType.value,
      ids: selectedOrders.value.map((r) => r.id),
      merge: true,
    })
    const data = parseResponseData(response, {}) || {}
    const list = Array.isArray(data.vouchers) ? data.vouchers : []
    previewVouchers.value = list.map((v, i) => normalizePreviewVoucher(v, i))
    const firstReady = previewVouchers.value.find((v) => !v.skipped && !v.error)
    activePreviewKey.value = firstReady?._key || previewVouchers.value[0]?._key || ''

    if (!previewReadyCount.value) {
      ElMessage.warning(data.message || '所选单据均无法生成（可能已存在凭证或预览失败）')
    } else {
      ElMessage.success(data.message || '合并凭证预览已就绪，请核对后确认')
    }
  } catch (error) {
    console.error(error)
    ElMessage.error(error?.response?.data?.message || error.message || '预览失败')
    previewVisible.value = false
  } finally {
    previewLoading.value = false
  }
}

function accountsFromEntryLines(entryLines = []) {
  const accounts = {}
  for (const line of entryLines) {
    const key = ROLE_ACCOUNT_KEY[line.role]
    if (key && line.account_id) accounts[key] = line.account_id
  }
  return accounts
}

function buildOverridesFromPreview() {
  return previewVouchers.value
    .filter((v) => !v.skipped && !v.error)
    .map((v) => {
      const sourceIds = v.sourceIds?.length ? v.sourceIds : [v.id]
      return {
        id: v.id,
        isMerged: Boolean(v.isMerged),
        businessType: businessType.value,
        sourceIds,
        partyId: v.partyId || null,
        invoiceDate: v.entryDate,
        description: v.description,
        notes: v.description,
        taxRate: v.taxRate,
        taxAmount: v.taxAmount,
        subtotal: v.subtotal,
        totalAmount: v.totalAmount,
        items: (v.items || []).map((it) => {
          const quantity = Number(it.quantity) || 0
          const unitPrice = Number(it.unitPrice) || 0
          const materialId = it.materialId || it.productId || null
          const name = it.materialName || it.productName || null
          return {
            source_id: it.sourceId || v.id,
            source_doc_no: it.source_doc_no || null,
            material_id: materialId,
            product_id: materialId,
            material_name: name,
            product_name: name,
            material_code: it.materialCode || null,
            description: it.description || null,
            quantity,
            unit_price: unitPrice,
            price: unitPrice,
            amount: Number(it.amount) || round2(quantity * unitPrice),
          }
        }),
        entryLines: (v.entryLines || []).map((line) => ({
          role: line.role,
          account_id: line.account_id,
          description: line.description,
          debit_amount: Number(line.debit_amount) || 0,
          credit_amount: Number(line.credit_amount) || 0,
          supplier_id: line.supplierId || null,
          customer_id: line.customerId || null,
        })),
        accounts: {
          ...(v.accounts || {}),
          ...accountsFromEntryLines(v.entryLines),
        },
      }
    })
}

function showBatchResultMessage(response, data) {
  const successCount = data.successCount || 0
  const skippedCount = data.skippedCount || 0
  const failedCount = data.failedCount || 0
  const entryNo = data.mergedEntry?.entryNumber || data.mergedEntry?.entryId
  const msg =
    response?.message ||
    (data.merge
      ? `合并完成：发票成功 ${successCount}，已存在 ${skippedCount}，失败 ${failedCount}${
          entryNo ? `；凭证 ${entryNo}` : ''
        }`
      : `批量完成：成功 ${successCount}，已存在 ${skippedCount}，失败 ${failedCount}`)

  if (failedCount > 0 && successCount === 0 && skippedCount === 0) ElMessage.error(msg)
  else if (failedCount > 0) ElMessage.warning(msg)
  else ElMessage.success(msg)
}

async function confirmPreviewGenerate() {
  const ready = previewVouchers.value.filter((v) => !v.skipped && !v.error)
  if (!ready.length) {
    ElMessage.warning('没有可生成的凭证')
    return
  }
  const unbalanced = ready.filter((v) => !isPreviewBalanced(v))
  if (unbalanced.length) {
    ElMessage.error(
      `有 ${unbalanced.length} 张凭证借贷不平，请修正后再生成（如 ${unbalanced[0].docNo || unbalanced[0].id}）`
    )
    activePreviewKey.value = unbalanced[0]._key
    return
  }
  const zeroAmount = ready.filter((v) => !(Number(v.totalAmount) > 0))
  if (zeroAmount.length) {
    ElMessage.error(`有 ${zeroAmount.length} 张凭证金额为 0，请修正后再生成`)
    activePreviewKey.value = zeroAmount[0]._key
    return
  }

  const sourceIds = [
    ...new Set(
      ready.flatMap((v) =>
        v.sourceIds?.length ? v.sourceIds : v.id != null ? [v.id] : []
      )
    ),
  ]
  const sourceCount = sourceIds.length || ready.length

  try {
    await ElMessageBox.confirm(
      sourceCount > 1
        ? `确认将 ${sourceCount} 张业务单据合并生成 1 张会计凭证吗？\n（各单据仍会分别生成发票，总账合并为一张）`
        : `确认生成 1 张凭证吗？`,
      '确认生成',
      { type: 'warning', confirmButtonText: '确认生成', cancelButtonText: '再检查一下' }
    )
  } catch {
    return
  }

  submitting.value = true
  try {
    const overrides = buildOverridesFromPreview()
    const response = await financeApi.integration.batchGenerateFromOrders({
      businessType: businessType.value,
      ids: sourceIds,
      merge: true,
      overrides,
    })
    const data = response?.data || response || {}
    showBatchResultMessage(response, data)
    previewVisible.value = false
    emit('update:modelValue', false)
    emit('success', data)
  } catch (error) {
    console.error(error)
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      '批量生成失败'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

async function loadOrders() {
  orderLoading.value = true
  try {
    const params = {
      page: orderPage.value,
      pageSize: orderPageSize.value,
      keyword: orderKeyword.value || undefined,
    }
    const meta = currentBusinessMeta.value
    const response = await meta.fetch(params)
    const result = parsePaginatedData(response, { enableLog: false })
    orderList.value = result.list || []
    orderTotal.value = result.total || orderList.value.length
  } catch (error) {
    console.error(error)
    ElMessage.error(error?.response?.data?.message || error.message || '加载单据失败')
    orderList.value = []
    orderTotal.value = 0
  } finally {
    orderLoading.value = false
  }
}

function handleBusinessTypeChange() {
  orderPage.value = 1
  selectedOrders.value = []
  nextTick(() => orderTableRef.value?.clearSelection?.())
  loadOrders()
}

function handleOrderPageChange(page) {
  orderPage.value = page
  loadOrders()
}

function handleSelectionChange(rows) {
  selectedOrders.value = rows || []
}

function clearSelection() {
  selectedOrders.value = []
  orderTableRef.value?.clearSelection?.()
}

async function submitBusinessGenerate() {
  if (!selectedOrders.value.length) {
    ElMessage.warning('请先勾选业务单据')
    return
  }
  const label = currentBusinessMeta.value.confirmLabel
  const n = selectedOrders.value.length
  try {
    await ElMessageBox.confirm(
      n > 1
        ? `将把选中的 ${n} 张${label}合并生成 1 张会计凭证（各单仍分别开票）。\n建议先点「预览凭证」核对金额。是否仍直接生成？`
        : `确认根据选中的 1 张${label}生成凭证吗？`,
      '确认直接生成',
      {
        type: 'warning',
        confirmButtonText: '直接生成',
        cancelButtonText: '去预览',
        distinguishCancelAndClose: true,
      }
    )
  } catch (action) {
    if (action === 'cancel') {
      await openPreview()
    }
    return
  }

  submitting.value = true
  try {
    const response = await financeApi.integration.batchGenerateFromOrders({
      businessType: businessType.value,
      ids: selectedOrders.value.map((r) => r.id),
      merge: true,
    })
    const data = response?.data || response || {}
    showBatchResultMessage(response, data)
    emit('update:modelValue', false)
    emit('success', data)
  } catch (error) {
    console.error(error)
    const msg =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      '批量生成失败'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

function flattenAccounts(accounts, result = []) {
  accounts.forEach((acc) => {
    result.push(acc)
    if (acc.children?.length) flattenAccounts(acc.children, result)
  })
  return result
}

async function loadManualOptions() {
  if (optionsLoaded.value) return
  try {
    const accRes = await financeApi.accounts.getOptions()
    const accounts = parseListData(accRes, { enableLog: false })
    const processAccounts = (list) =>
      list.map((item) => {
        const processed = {
          ...item,
          fullName: `${item.accountCode} - ${item.accountName}`,
        }
        if (item.children?.length) {
          processed.children = processAccounts(item.children)
        }
        return processed
      })
    accountOptions.value = processAccounts(accounts)
    flatAccounts.value = flattenAccounts(accountOptions.value)

    try {
      const custRes = await salesApi.getCustomers().catch(() => ({ data: [] }))
      customerOptions.value = parseResponseData(custRes, [])
    } catch {
      /* ignore */
    }
    try {
      userOptions.value = await loadUserListOptions()
    } catch {
      /* ignore */
    }
    try {
      departmentOptions.value = await loadDepartmentOptions()
    } catch {
      /* ignore */
    }
    try {
      const suppRes = await purchaseApi.getSuppliers().catch(() => ({ data: [] }))
      supplierOptions.value = parseResponseData(suppRes, [])
    } catch {
      /* ignore */
    }
    optionsLoaded.value = true
  } catch (err) {
    console.error(err)
    ElMessage.error('加载科目选项失败')
  }
}

function handleAccountChange(accountId, index) {
  const account = flatAccounts.value.find((a) => a.id === accountId)
  if (!account) return
  entryForm.items[index]._accountAux = {
    has_customer: Boolean(account.has_customer),
    has_supplier: Boolean(account.has_supplier),
    has_employee: Boolean(account.has_employee),
    has_department: Boolean(account.has_department),
    has_project: Boolean(account.has_project),
  }
  if (!account.has_customer) entryForm.items[index].customerId = null
  if (!account.has_supplier) entryForm.items[index].supplierId = null
  if (!account.has_employee) entryForm.items[index].employeeId = null
  if (!account.has_department) entryForm.items[index].costCenterId = null
  if (!account.has_project) entryForm.items[index].project_id = null
}

function addItem() {
  entryForm.items.push(createEmptyItem())
}

function removeItem(index) {
  if (entryForm.items.length > 2) entryForm.items.splice(index, 1)
}

async function submitManualEntry() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  if (!isBalanced.value) {
    ElMessage.error('凭证借贷不平，无法保存')
    return
  }

  const items = entryForm.items
    .filter((i) => i.account_id && (i.debit_amount > 0 || i.credit_amount > 0))
    .map((i) => ({
      account_id: i.account_id,
      description: i.description || entryForm.description,
      debit_amount: i.debit_amount,
      credit_amount: i.credit_amount,
      customer_id: i.customerId,
      supplier_id: i.supplierId,
      employee_id: i.employeeId,
      cost_center_id: i.costCenterId,
      project_id: i.project_id,
    }))

  if (!items.length) {
    ElMessage.warning('请至少录入一行有效明细')
    return
  }

  submitting.value = true
  try {
    await financeApi.createEntry({
      entry_date: entryForm.entry_date,
      posting_date: entryForm.entry_date,
      voucher_word: entryForm.voucher_word,
      document_number: entryForm.document_number,
      description: entryForm.description,
      items,
    })
    ElMessage.success('凭证录入成功')
    emit('update:modelValue', false)
    emit('success')
  } catch (err) {
    console.error(err)
    ElMessage.error(err?.response?.data?.message || err.message || '凭证保存失败')
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    resetBusinessState()
    resetManualForm()
    if (props.defaultMode === 'manual') {
      activeTab.value = 'manual'
      await loadManualOptions()
    } else {
      activeTab.value = 'business'
      const allowed = BUSINESS_TYPE_OPTIONS.map((o) => o.value)
      businessType.value = allowed.includes(props.defaultMode)
        ? props.defaultMode
        : 'purchase_receipt'
      await loadOrders()
    }
  }
)

watch(activeTab, async (tab) => {
  if (tab === 'manual') {
    await loadManualOptions()
  } else if (tab === 'business' && !orderList.value.length) {
    await loadOrders()
  }
})
</script>

<style scoped>
.entry-tabs {
  min-height: 420px;
}
.mb-2 {
  margin-bottom: 8px;
}
.mb-3 {
  margin-bottom: 12px;
}
.w-full {
  width: 100%;
}
.toolbar-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.search-input {
  flex: 1;
  max-width: 360px;
}
.selection-bar {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.items-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0 10px;
  font-weight: 600;
}
.aux-area {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.aux-item {
  width: 120px;
}
.totals-row {
  display: flex;
  gap: 24px;
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--color-bg-section);
  border-radius: 4px;
  font-weight: 600;
}
.totals-row .ok {
  color: var(--color-success);
}
.preview-body {
  min-height: 360px;
}
.preview-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.tab-warn {
  color: var(--color-warning);
}
.preview-skip {
  padding: 12px 0;
}
.preview-header-form {
  margin-bottom: 4px;
}
.field-suffix {
  margin-left: 6px;
  color: var(--color-text-secondary);
  font-size: 12px;
}
.amount-row {
  margin-top: 4px;
}
.amount-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--color-bg-section);
  border-radius: 4px;
}
.amount-box .lbl {
  color: var(--color-text-secondary);
  font-size: 13px;
  white-space: nowrap;
}
.amount-box .total {
  color: var(--color-primary);
  font-size: 15px;
}
.amount-input {
  width: 120px;
}
.balance-tag {
  font-size: 13px;
  font-weight: 600;
}
.balance-tag.ok,
.totals-row .ok {
  color: var(--color-success);
}
.balance-tag.bad,
.totals-row .bad {
  color: var(--color-danger);
}
.merge-docs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.merge-doc-tag {
  margin: 0;
}
</style>
