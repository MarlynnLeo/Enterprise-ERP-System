<!--
  EntryFormDialog.vue
  会计凭证录入对话框：支持从业务单据批量生成 + 手工分录
  多选业务单据合并应收/应付凭证，销售成本按出库单独立结转。
-->
<template>
  <AppDialog
    :model-value="modelValue"
    mode="form"
    :title="dialogTitle"
    width="1100px"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    destroy-on-close
    @update:model-value="handleDialogVisibility"
    @closed="handleClosed"
  >
    <el-tabs v-model="activeTab" class="entry-tabs" :inert="submitting">
      <!-- 从业务单据生成 -->
      <el-tab-pane label="从业务单据生成" name="business">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="mb-3"
          title="采购应付取「采购入库单」，销售应收取「销售出库单」。人民币单据可多选合并应收或应付凭证，各单仍分别开票；美元单据仅支持逐单生成。销售成本按每张出库单独立结转。请先预览并核对金额。"
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
        <el-alert v-if="unsupportedUsdMerge" type="warning" :closable="false" show-icon class="mb-3" :title="usdMergeMessage" />

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
            prop="docNo"
            :label="currentBusinessMeta.docNoLabel"
            min-width="150"
            show-overflow-tooltip
          />
          <el-table-column
            prop="partyName"
            :label="currentBusinessMeta.partyLabel"
            min-width="140"
            show-overflow-tooltip
          />
          <el-table-column
            v-if="currentBusinessMeta.showSourceOrder"
            prop="sourceOrderNo"
            :label="currentBusinessMeta.sourceOrderLabel || '关联订单'"
            min-width="130"
            show-overflow-tooltip
          />
          <el-table-column prop="docDate" label="日期" width="110" />
          <el-table-column prop="totalAmount" label="金额" width="120" align="right">
            <template #default="{ row }">
              {{ formatBusinessAmount(row.totalAmount, row.currencyCode) }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag
                :type="row.status === 'completed' || row.status === 'confirmed' ? 'success' : 'info'"
                size="small"
              >
                {{ formatOrderStatus(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
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
        <div v-if="manualOptionsError" class="manual-options-error" role="alert">
          <span>{{ manualOptionsError }}</span>
          <el-button type="primary" link :loading="manualOptionsLoading" @click="loadManualOptions({ force: true })">重新加载选项</el-button>
        </div>
        <el-form ref="formRef" :model="entryForm" :rules="rules" label-width="90px">
          <el-row :gutter="16">
            <el-col :span="8"><el-form-item label="记账日期" prop="entryDate"><el-date-picker v-model="entryForm.entryDate" type="date" value-format="YYYY-MM-DD" class="w-full" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="凭证字" prop="voucherWord"><el-select v-model="entryForm.voucherWord" class="w-full"><el-option v-for="word in ['记', '收', '付', '转']" :key="word" :label="word" :value="word" /></el-select></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="附单据数" prop="attachmentCount"><VoucherNumberInput v-model="entryForm.attachmentCount" :min="0" :precision="0" placeholder="未填写" class="w-full" /></el-form-item></el-col>
          </el-row>
          <el-form-item label="业务票据号" prop="documentNumber"><el-input v-model="entryForm.documentNumber" maxlength="100" placeholder="业务单据编号（选填）" /></el-form-item>
          <el-form-item label="摘要" prop="description"><el-input v-model="entryForm.description" maxlength="200" placeholder="凭证摘要" /></el-form-item>
        </el-form>
        <div class="items-header"><span>凭证明细 · 借贷金额均为人民币（CNY）</span><el-button type="success" size="small" plain @click="addItem">添加明细行</el-button></div>
        <el-table :data="entryForm.items" border class="w-full manual-entry-table" v-loading="manualOptionsLoading" :row-class-name="({ row }) => entryForm.items.indexOf(row) === selectedManualIndex ? 'manual-selected-line' : ''" @row-click="selectManualRow">
          <el-table-column label="摘要" min-width="170"><template #default="{ row }"><el-input v-model="row.description" maxlength="200" placeholder="明细摘要" size="small" /></template></el-table-column>
          <el-table-column label="会计科目" min-width="240"><template #default="{ row, $index }"><el-cascader v-model="row.accountId" :options="accountOptions" :props="{ checkStrictly: true, value: 'id', label: 'fullName', emitPath: false }" :disabled="!optionsLoaded" placeholder="请选择科目" filterable size="small" class="w-full" @change="value => handleAccountChange(value, $index)" /></template></el-table-column>
          <el-table-column label="借方" width="140"><template #default="{ row }"><VoucherNumberInput v-model="row.debitAmount" :precision="2" :min="0" :controls="false" size="small" class="w-full" @change="() => (row.creditAmount = row.debitAmount > 0 ? 0 : row.creditAmount)" /></template></el-table-column>
          <el-table-column label="贷方" width="140"><template #default="{ row }"><VoucherNumberInput v-model="row.creditAmount" :precision="2" :min="0" :controls="false" size="small" class="w-full" @change="() => (row.debitAmount = row.creditAmount > 0 ? 0 : row.debitAmount)" /></template></el-table-column>
          <el-table-column label="操作" width="125" align="center" class-name="operation-column" header-class-name="operation-column-header"><template #default="{ $index }"><div class="manual-row-actions"><el-button size="small" link type="primary" @click="selectedManualIndex = $index">辅助</el-button><el-button type="danger" size="small" link :disabled="entryForm.items.length <= 2" @click.stop="removeItem($index)">删除</el-button></div></template></el-table-column>
        </el-table>
        <div class="totals-row"><span>借方合计：{{ formatCurrency(totalDebit) }}</span><span>贷方合计：{{ formatCurrency(totalCredit) }}</span><span :class="isBalanced ? 'ok' : 'bad'">{{ isBalanced ? '借贷平衡' : `差额 ${formatCurrency(Math.abs(totalDebit - totalCredit))}` }}</span></div>
        <section v-if="selectedManualItem" class="manual-line-details" aria-label="分录辅助信息">
          <div class="manual-detail-heading"><strong>第 {{ selectedManualIndex + 1 }} 行辅助信息</strong><span>{{ selectedManualAccount?.fullName || '请先选择会计科目' }}</span></div>
          <p v-if="selectedManualAccount?.currencyCode === 'USD'" class="manual-currency-note">所选科目原币为 USD，币种固定为美元。请填写美元金额及实际汇率，借贷金额仍以人民币填列。</p>
          <el-form ref="manualAuxFormRef" :model="selectedManualItem" :rules="manualAuxRules" :validate-on-rule-change="false" label-position="top" class="manual-aux-grid" :disabled="!optionsLoaded">
            <el-form-item label="部门" prop="departmentId"><el-select v-model="selectedManualItem.departmentId" filterable clearable class="w-full" placeholder="选择部门"><el-option v-for="option in departmentOptions" :key="option.id" :label="option.departmentName || option.name" :value="option.id" /></el-select></el-form-item>
            <el-form-item label="成本中心" prop="costCenterId"><el-select v-model="selectedManualItem.costCenterId" filterable clearable class="w-full" placeholder="选择成本中心"><el-option v-for="option in costCenterOptions" :key="option.id" :label="option.name || option.costCenterName" :value="option.id" /></el-select></el-form-item>
            <el-form-item label="员工" prop="employeeId"><el-select v-model="selectedManualItem.employeeId" filterable clearable class="w-full" placeholder="选择员工"><el-option v-for="option in userOptions" :key="option.id" :label="option.realName || option.username" :value="option.id" /></el-select></el-form-item>
            <el-form-item label="客户" prop="customerId"><el-select v-model="selectedManualItem.customerId" filterable clearable class="w-full" placeholder="选择客户"><el-option v-for="option in customerOptions" :key="option.id" :label="option.customerName || option.name" :value="option.id" /></el-select></el-form-item>
            <el-form-item label="供应商" prop="supplierId"><el-select v-model="selectedManualItem.supplierId" filterable clearable class="w-full" placeholder="选择供应商"><el-option v-for="option in supplierOptions" :key="option.id" :label="option.supplierName || option.name" :value="option.id" /></el-select></el-form-item>
            <el-form-item label="项目名称" prop="projectName"><el-input v-model="selectedManualItem.projectName" maxlength="200" placeholder="填写项目名称" /></el-form-item>
            <el-form-item label="币种" prop="currencyCode"><el-select v-model="selectedManualItem.currencyCode" :disabled="selectedManualAccount?.currencyCode === 'USD'" class="w-full" @change="handleManualCurrencyChange"><el-option label="人民币（CNY）" value="CNY" /><el-option label="美元（USD）" value="USD" /></el-select></el-form-item>
            <el-form-item :label="selectedManualItem.currencyCode === 'USD' ? '汇率（1 USD = x CNY）' : '人民币汇率'" prop="exchangeRate"><VoucherNumberInput v-model="selectedManualItem.exchangeRate" :disabled="selectedManualItem.currencyCode === 'CNY'" :precision="8" :min="0.00000001" :controls="false" placeholder="填写实际采用的汇率" class="w-full" /></el-form-item>
            <el-form-item label="外币金额（USD）" prop="foreignAmount"><VoucherNumberInput v-model="selectedManualItem.foreignAmount" :disabled="selectedManualItem.currencyCode !== 'USD'" :precision="2" :min="0.01" :controls="false" placeholder="填写美元金额" class="w-full" /></el-form-item>
            <el-form-item label="数量" prop="quantity"><VoucherNumberInput v-model="selectedManualItem.quantity" :precision="6" :min="0" :controls="false" class="w-full" /></el-form-item>
            <el-form-item label="单位" prop="unitName"><el-input v-model="selectedManualItem.unitName" maxlength="50" placeholder="如：个、箱" /></el-form-item>
            <el-form-item label="单价" prop="unitPrice"><VoucherNumberInput v-model="selectedManualItem.unitPrice" :precision="6" :min="0" :controls="false" class="w-full" /></el-form-item>
            <el-form-item label="结算方式" prop="settlementMethod"><el-input v-model="selectedManualItem.settlementMethod" maxlength="50" placeholder="填写结算方式" /></el-form-item>
            <el-form-item label="发票号" prop="invoiceNumber"><el-input v-model="selectedManualItem.invoiceNumber" maxlength="100" placeholder="填写发票号" /></el-form-item>
          </el-form>
          <p v-if="selectedManualItem.currencyCode === 'USD'" class="manual-currency-note">人民币借方或贷方金额 = 美元金额 × 汇率，保留两位小数。请在上方填写对应人民币金额。</p>
        </section>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button v-if="batchResult" :disabled="submitting" @click="batchResultVisible = true">查看上次生成结果</el-button>
      <el-button :disabled="submitting" @click="handleDialogVisibility(false)">取消</el-button>
      <template v-if="activeTab === 'business'">
        <el-button
          type="primary"
          plain
          :loading="previewLoading"
          :disabled="!selectedOrders.length || unsupportedUsdMerge || submitting"
          @click="openPreview"
        >
          预览凭证（{{ selectedOrders.length }}）
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="!selectedOrders.length || unsupportedUsdMerge || previewLoading"
          @click="submitBusinessGenerate"
        >
          {{ directGenerateLabel }}
        </el-button>
      </template>
      <el-button v-else type="primary" :loading="submitting" :disabled="manualOptionsLoading || !optionsLoaded" @click="submitManualEntry">
        保存凭证
      </el-button>
    </template>
  </AppDialog>

  <!-- 合并凭证预览（可编辑） -->
  <AppDialog
    :model-value="previewVisible"
    mode="form"
    :title="previewDialogTitle"
    width="1100px"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    destroy-on-close
    @update:model-value="handlePreviewVisibility"
    @closed="handlePreviewClosed"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      class="mb-3"
      :title="previewHint"
    />

    <div v-loading="previewLoading" class="preview-body" :inert="submitting">
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
              <p class="manual-currency-note">币种：{{ voucher.currencyCode || 'CNY' }}<template v-if="voucher.currencyCode === 'USD'"> · 汇率：1 USD = {{ voucher.exchangeRate }} CNY；本预览为美元原币金额，生成后总账按该汇率折合人民币。</template></p>
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
                      {{ doc.docNo }} · {{ formatBusinessAmount(doc.totalAmount, doc.currencyCode || voucher.currencyCode) }}
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
                    {{ formatBusinessAmount(row.amount, voucher.currencyCode) }}
                  </template>
                </el-table-column>
              </el-table>

              <el-row :gutter="12" class="mb-3 amount-row">
                <el-col :span="8">
                  <div class="amount-box">
                    <span class="lbl">未税合计</span>
                    <strong>{{ formatBusinessAmount(voucher.subtotal, voucher.currencyCode) }}</strong>
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
                    <strong class="total">{{ formatBusinessAmount(voucher.totalAmount, voucher.currencyCode) }}</strong>
                  </div>
                </el-col>
              </el-row>

              <div class="items-header">
                <span>凭证明细（可改科目/摘要/借贷）</span>
                <span :class="isPreviewBalanced(voucher) ? 'ok' : 'bad'" class="balance-tag">
                  {{
                    isPreviewBalanced(voucher)
                      ? '借贷平衡'
                      : `差额 ${formatBusinessAmount(Math.abs(previewDebit(voucher) - previewCredit(voucher)), voucher.currencyCode)}`
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
      <el-button :disabled="submitting" @click="handlePreviewVisibility(false)">返回修改选择</el-button>
      <el-button
        type="primary"
        :loading="submitting"
        :disabled="!previewReadyCount || previewLoading || unsupportedUsdMerge"
        @click="confirmPreviewGenerate"
      >
        确认生成凭证
      </el-button>
    </template>
  </AppDialog>
  <BatchResultDialog v-model="batchResultVisible" :result="batchResult" />
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import AppDialog from '@/components/ui/AppDialog.vue'
import VoucherNumberInput from './VoucherNumberInput.vue'
import BatchResultDialog from './BatchResultDialog.vue'
import { financeApi } from '@/api'
import { formatCurrency, formatLocalDate } from '@/utils/format'
import { parsePaginatedData, parseResponseData } from '@/utils/responseParser'
import { getApiErrorMessage } from '@/utils/errorHandler'
import { accountAuxiliary, createManualItem, prepareAccountOptions, manualEntryError, manualEntryPayload } from './manualEntry'

const ORDER_STATUS_MAP = Object.freeze({
  completed: '已完成',
  confirmed: '已确认',
  approved: '已审核',
  pending: '待处理',
  draft: '草稿',
})
const formatOrderStatus = (status) => ORDER_STATUS_MAP[status] || status || '-'
const formatBusinessAmount = (value, currency = 'CNY') => new Intl.NumberFormat('zh-CN', {
  style: 'currency', currency: currency === 'USD' ? 'USD' : 'CNY',
}).format(Number(value) || 0)

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
    docNoField: 'docNo',
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
    docNoField: 'docNo',
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
const batchResult = ref(null)
const batchResultVisible = ref(false)
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
const recognitionVoucherLabel = computed(() => businessType.value === 'sales_outbound' ? '应收凭证' : '应付凭证')
const salesCostHint = computed(() => businessType.value === 'sales_outbound'
  ? '销售成本将按每张出库单另行生成或复用独立凭证。' : '')
const previewDialogTitle = computed(() => {
  const ready = previewVouchers.value.find((v) => !v.skipped && !v.error)
  if (ready?.isMerged && ready.sourceIds?.length > 1) {
    return `合并${recognitionVoucherLabel.value}预览（${ready.sourceIds.length} 张单据 → 1 张）`
  }
  if (ready) return `${recognitionVoucherLabel.value}预览（1 张）`
  return '凭证预览'
})
const previewHint = computed(() => {
  if (unsupportedUsdMerge.value) return usdMergeMessage
  const label = currentBusinessMeta.value.confirmLabel
  const n = selectedOrders.value.length
  if (n > 1) {
    return `已选 ${n} 张${label}：将合并生成 1 张${recognitionVoucherLabel.value}（各单仍分别开票）。${salesCostHint.value}请核对明细与分录，修改后再确认生成。`
  }
  return `已选 1 张${label}：请核对明细与分录，修改后再确认生成。${selectedOrders.value.some(row => row.currencyCode === 'USD') ? '美元来源仅支持逐单生成。' : ''}${salesCostHint.value}`
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
const usdMergeMessage = '美元来源请逐单生成凭证，以保留原单核销金额；请仅选择一张美元单据。'
const unsupportedUsdMerge = computed(() => selectedOrders.value.length > 1 && selectedOrders.value.some(row => row.currencyCode === 'USD'))
const directGenerateLabel = computed(() => unsupportedUsdMerge.value
  ? '美元单据请逐单生成'
  : selectedOrders.value.length > 1 ? '直接生成（合并 1 张）' : '直接生成凭证')
let orderSequence = 0
let previewSequence = 0
let dialogSequence = 0

const formRef = ref(null)
const accountOptions = ref([])
const flatAccounts = ref([])
const customerOptions = ref([])
const supplierOptions = ref([])
const userOptions = ref([])
const departmentOptions = ref([])
const costCenterOptions = ref([])
const optionsLoaded = ref(false)
const manualOptionsLoading = ref(false)
const manualOptionsError = ref('')
const selectedManualIndex = ref(0)
const manualAuxFormRef = ref(null)
let optionsSequence = 0
let optionsPromise = null
let disposed = false

const entryForm = reactive({
  entryDate: formatLocalDate(new Date()),
  voucherWord: '记',
  attachmentCount: null,
  documentNumber: '',
  description: '',
  items: [createManualItem(), createManualItem()],
})
const selectedManualItem = computed(() => entryForm.items[selectedManualIndex.value] || null)
const selectedManualAccount = computed(() => flatAccounts.value.find(account => String(account.id) === String(selectedManualItem.value?.accountId)))
const manualAuxRules = computed(() => {
  const aux = selectedManualItem.value?._accountAux || {}
  const usd = selectedManualItem.value?.currencyCode === 'USD'
  return Object.fromEntries([
    ['departmentId', aux.hasDepartment, '请选择部门'],
    ['employeeId', aux.hasEmployee, '请选择员工'],
    ['customerId', aux.hasCustomer, '请选择客户'],
    ['supplierId', aux.hasSupplier, '请选择供应商'],
    ['projectName', aux.hasProject, '请填写项目名称'],
    ['exchangeRate', usd, '请填写美元汇率'],
    ['foreignAmount', usd, '请填写美元金额'],
  ].map(([field, required, message]) => [field, [{ type: 'any', required: Boolean(required), message, trigger: 'change' }]]))
})
watch([selectedManualItem, selectedManualAccount], async () => {
  await nextTick()
  manualAuxFormRef.value?.clearValidate()
})


const rules = {
  entryDate: [{ required: true, message: '请选择记账日期', trigger: 'change' }],
  voucherWord: [{ required: true, message: '请选择凭证字', trigger: 'change' }],
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
  orderSequence++
  orderLoading.value = false
  orderList.value = []
  orderKeyword.value = ''
  orderPage.value = 1
  orderTotal.value = 0
  selectedOrders.value = []
  nextTick(() => orderTableRef.value?.clearSelection?.())
}

function resetPreviewState() {
  previewSequence++
  previewVouchers.value = []
  activePreviewKey.value = ''
  previewLoading.value = false
}

function resetManualForm() {
  entryForm.entryDate = formatLocalDate(new Date())
  entryForm.voucherWord = props.defaultVoucherWord || '记'
  entryForm.attachmentCount = null
  entryForm.documentNumber = ''
  entryForm.description = ''
  entryForm.items = [createManualItem(), createManualItem()]
  selectedManualIndex.value = 0
}

function handleClosed() {
  if (props.modelValue) return
  resetBusinessState()
  resetManualForm()
  resetPreviewState()
  previewVisible.value = false
  activeTab.value = 'business'
  businessType.value = 'purchase_receipt'
}

function handlePreviewClosed() {
  if (!previewVisible.value) resetPreviewState()
}

function handleDialogVisibility(visible) {
  if (!submitting.value) emit('update:modelValue', visible)
}

function handlePreviewVisibility(visible) {
  if (submitting.value) return
  previewVisible.value = visible
  if (!visible) resetPreviewState()
}

function voucherTabLabel(voucher, index) {
  if (voucher.error) return `${index + 1}. 失败`
  if (voucher.skipped) return `${index + 1}. ${voucher.docNo || voucher.receiptNo || voucher.outboundNo || '未命名单据'} · 跳过`
  if (voucher.isMerged && voucher.sourceIds?.length > 1) {
    return `合并凭证（${voucher.sourceIds.length} 张）`
  }
  return `${index + 1}. ${voucher.docNo || voucher.receiptNo || voucher.outboundNo || '未命名单据'}`
}

function previewDebit(voucher) {
  return sumField(voucher.entryLines, 'debitAmount')
}

function previewCredit(voucher) {
  return sumField(voucher.entryLines, 'creditAmount')
}

function isPreviewBalanced(voucher) {
  const debit = previewDebit(voucher)
  const credit = previewCredit(voucher)
  return Math.abs(debit - credit) < 0.01 && debit > 0
}

function setLineAmounts(line, debit, credit) {
  if (!line) return
  line.debitAmount = debit
  line.creditAmount = credit
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
  const account = flatAccounts.value.find((a) => Number(a.id) === Number(accountId))
  if (!account) return
  line.accountCode = account.accountCode
  line.accountName = account.accountName
  line.accountLabel = `${account.accountCode} - ${account.accountName}`
}

function normalizePreviewItem(item) {
  const quantity = Number(item.quantity) || 0
  const unitPrice = Number(item.unitPrice ?? item.price) || 0
  return {
    ...item,
    sourceId: item.sourceId || null,
    sourceDocNo: item.sourceDocNo || null,
    quantity,
    unitPrice: unitPrice,
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
      accountId: line.accountId || null,
      debitAmount: Number(line.debitAmount) || 0,
      creditAmount: Number(line.creditAmount) || 0,
      description: line.description || '',
    })),
  }
}

async function openPreview() {
  if (submitting.value || previewLoading.value || !props.modelValue) return
  if (!selectedOrders.value.length) {
    ElMessage.warning('请先勾选业务单据')
    return
  }
  if (unsupportedUsdMerge.value) {
    ElMessage.warning(usdMergeMessage)
    return
  }
  const sequence = ++previewSequence
  const session = dialogSequence
  const request = { businessType: businessType.value, ids: selectedOrders.value.map(row => row.id), merge: true }
  const current = () => !disposed && props.modelValue && previewVisible.value &&
    sequence === previewSequence && session === dialogSequence
  previewVouchers.value = []
  activePreviewKey.value = ''
  previewLoading.value = true
  previewVisible.value = true
  try {
    const optionsReady = await loadManualOptions()
    if (!current()) return
    if (!optionsReady) throw new Error(manualOptionsError.value || '凭证选项尚未加载，请重试')
    const response = await financeApi.integration.batchPreviewFromOrders(request)
    if (!current()) return
    const data = parseResponseData(response, {}) || {}
    const list = Array.isArray(data.vouchers) ? data.vouchers : []
    previewVouchers.value = list.map((v, i) => normalizePreviewVoucher(v, i))
    const firstReady = previewVouchers.value.find((v) => !v.skipped && !v.error)
    activePreviewKey.value = firstReady?._key || previewVouchers.value[0]?._key || ''

    if (!previewReadyCount.value) {
      ElMessage.warning(getApiErrorMessage(data, '所选单据均无法生成（可能已存在凭证或预览失败）'))
    } else {
      ElMessage.success(data.message || '凭证预览已就绪，请核对后确认')
    }
  } catch (error) {
    if (!current()) return
    console.error(error)
    ElMessage.error(getApiErrorMessage(error, '预览失败'))
    previewVisible.value = false
  } finally {
    if (sequence === previewSequence) previewLoading.value = false
  }
}

function accountsFromEntryLines(entryLines = []) {
  const accounts = {}
  for (const line of entryLines) {
    const key = ROLE_ACCOUNT_KEY[line.role]
    if (key && line.accountId) accounts[key] = line.accountId
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
        currencyCode: v.currencyCode || 'CNY',
        exchangeRate: v.exchangeRate,
        items: (v.items || []).map((it) => {
          const quantity = Number(it.quantity) || 0
          const unitPrice = Number(it.unitPrice) || 0
          const materialId = it.materialId || it.productId || null
          const name = it.materialName || it.productName || null
          return {
            source_id: it.sourceId || v.id,
            source_doc_no: it.sourceDocNo || null,
            material_id: materialId,
            product_id: materialId,
            material_name: name,
            product_name: name,
            material_code: it.materialCode || null,
            description: it.description || null,
            quantity,
            unit_price: unitPrice,
            unit_name: it.unitName ?? it.unit_name ?? null,
            price: unitPrice,
            amount: Number(it.amount) || round2(quantity * unitPrice),
          }
        }),
        entryLines: (v.entryLines || []).map((line) => ({
          role: line.role,
          account_id: line.accountId,
          description: line.description,
          debit_amount: Number(line.debitAmount) || 0,
          credit_amount: Number(line.creditAmount) || 0,
          supplier_id: line.supplierId || null,
          customer_id: line.customerId || null,
          department_id: line.departmentId ?? line.department_id ?? null,
          cost_center_id: line.costCenterId ?? line.cost_center_id ?? null,
          employee_id: line.employeeId ?? line.employee_id ?? null,
          employee_source: line.employeeSource ?? line.employee_source ?? null,
          project_id: line.projectId ?? line.project_id ?? null,
          project_name: line.projectName ?? line.project_name ?? null,
          quantity: line.quantity ?? null,
          unit_name: line.unitName ?? line.unit_name ?? null,
          unit_price: line.unitPrice ?? line.unit_price ?? null,
          settlement_method: line.settlementMethod ?? line.settlement_method ?? null,
          invoice_number: line.invoiceNumber ?? line.invoice_number ?? null,
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
        }；新增成本凭证 ${data.costVoucherCount || 0} 张`
      : `批量完成：成功 ${successCount}，已存在 ${skippedCount}，失败 ${failedCount}`)

  if (failedCount > 0 && successCount === 0 && skippedCount === 0) ElMessage.error(msg)
  else if (failedCount > 0) ElMessage.warning(msg)
  else ElMessage.success(msg)
}

function rememberBatchResult(response, data, context) {
  batchResult.value = { ...data, businessType: context.businessType, sourceDocs: context.sourceDocs }
  batchResultVisible.value = true
  showBatchResultMessage(response, data)
}

async function confirmPreviewGenerate() {
  if (submitting.value || previewLoading.value || !props.modelValue || !previewVisible.value) return
  submitting.value = true
  const session = dialogSequence
  const current = () => !disposed && props.modelValue && session === dialogSequence
  try {
    if (unsupportedUsdMerge.value) {
      ElMessage.warning(usdMergeMessage)
      return
    }
    const ready = previewVouchers.value.filter((v) => !v.skipped && !v.error)
    if (!ready.length) {
      ElMessage.warning('没有可生成的凭证')
      return
    }
    const unbalanced = ready.filter((v) => !isPreviewBalanced(v))
    if (unbalanced.length) {
      ElMessage.error(
        `有 ${unbalanced.length} 张凭证借贷不平，请修正后再生成${unbalanced[0].docNo ? `（如 ${unbalanced[0].docNo}）` : ''}`
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
    const request = { businessType: businessType.value, ids: sourceIds, merge: true, overrides: buildOverridesFromPreview() }
    const context = { businessType: request.businessType, sourceDocs: selectedOrders.value.map(row => ({ ...row })) }

    try {
      await ElMessageBox.confirm(
        sourceCount > 1
          ? `确认将 ${sourceCount} 张业务单据合并生成 1 张${recognitionVoucherLabel.value}吗？\n各单据仍分别开票。${salesCostHint.value}`
          : `确认生成 1 张${recognitionVoucherLabel.value}吗？${salesCostHint.value}`,
        '确认生成',
        { type: 'warning', confirmButtonText: '确认生成', cancelButtonText: '再检查一下' }
      )
    } catch {
      return
    }

    if (!current()) return
    const response = await financeApi.integration.batchGenerateFromOrders(request)
    const data = response?.data || response || {}
    if (disposed) return
    rememberBatchResult(response, data, context)
    if (current()) {
      previewVisible.value = false
      emit('update:modelValue', false)
    }
    emit('success', data)
  } catch (error) {
    console.error(error)
    const msg = getApiErrorMessage(error, '批量生成失败')
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

async function loadOrders() {
  if (!props.modelValue || disposed) return
  const sequence = ++orderSequence
  const type = businessType.value
  const params = { page: orderPage.value, pageSize: orderPageSize.value, keyword: orderKeyword.value || undefined }
  const meta = currentBusinessMeta.value
  const current = () => !disposed && props.modelValue && sequence === orderSequence &&
    type === businessType.value && params.keyword === (orderKeyword.value || undefined) && params.page === orderPage.value
  orderLoading.value = true
  try {
    const response = await meta.fetch(params)
    if (!current()) return
    const result = parsePaginatedData(response, { enableLog: false })
    orderList.value = result.list || []
    orderTotal.value = result.total || orderList.value.length
  } catch (error) {
    if (!current()) return
    console.error(error)
    ElMessage.error(getApiErrorMessage(error, '加载单据失败'))
    orderList.value = []
    orderTotal.value = 0
  } finally {
    if (sequence === orderSequence) orderLoading.value = false
  }
}

function handleBusinessTypeChange() {
  resetPreviewState()
  previewVisible.value = false
  orderList.value = []
  orderTotal.value = 0
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
  if (JSON.stringify((rows || []).map(row => row.id)) !== JSON.stringify(selectedOrders.value.map(row => row.id))) {
    resetPreviewState()
    previewVisible.value = false
  }
  selectedOrders.value = rows || []
}

function clearSelection() {
  handleSelectionChange([])
  orderTableRef.value?.clearSelection?.()
}

async function submitBusinessGenerate() {
  if (submitting.value || previewLoading.value || !props.modelValue) return
  submitting.value = true
  const session = dialogSequence
  const current = () => !disposed && props.modelValue && session === dialogSequence
  let goPreview = false
  try {
    if (!selectedOrders.value.length) {
      ElMessage.warning('请先勾选业务单据')
      return
    }
    if (unsupportedUsdMerge.value) {
      ElMessage.warning(usdMergeMessage)
      return
    }
    const label = currentBusinessMeta.value.confirmLabel
    const n = selectedOrders.value.length
    const request = { businessType: businessType.value, ids: selectedOrders.value.map(row => row.id), merge: true }
    const context = { businessType: request.businessType, sourceDocs: selectedOrders.value.map(row => ({ ...row })) }
    try {
      await ElMessageBox.confirm(
        n > 1
          ? `将把选中的 ${n} 张${label}合并生成 1 张${recognitionVoucherLabel.value}（各单仍分别开票）。${salesCostHint.value}\n建议先预览核对金额。是否仍直接生成？`
          : `确认根据选中的 1 张${label}生成${recognitionVoucherLabel.value}吗？${salesCostHint.value}`,
        '确认直接生成',
        {
          type: 'warning',
          confirmButtonText: '直接生成',
          cancelButtonText: '去预览',
          distinguishCancelAndClose: true,
        }
      )
    } catch (action) {
      goPreview = action === 'cancel' && current()
      return
    }

    if (!current()) return
    const response = await financeApi.integration.batchGenerateFromOrders(request)
    const data = response?.data || response || {}
    if (disposed) return
    rememberBatchResult(response, data, context)
    if (current()) emit('update:modelValue', false)
    emit('success', data)
  } catch (error) {
    console.error(error)
    const msg = getApiErrorMessage(error, '批量生成失败')
    ElMessage.error(msg)
  } finally {
    submitting.value = false
    if (goPreview) await openPreview()
  }
}

function invalidateManualOptions() {
  optionsSequence++
  optionsPromise = null
  optionsLoaded.value = false
  manualOptionsLoading.value = false
  manualOptionsError.value = ''
  accountOptions.value = []
  flatAccounts.value = []
  customerOptions.value = []
  supplierOptions.value = []
  departmentOptions.value = []
  costCenterOptions.value = []
  userOptions.value = []
}

async function loadManualOptions({ force = false } = {}) {
  if (!force && optionsLoaded.value) return true
  if (!force && optionsPromise) return optionsPromise
  const sequence = ++optionsSequence
  const current = () => !disposed && props.modelValue && sequence === optionsSequence
  optionsLoaded.value = false
  manualOptionsLoading.value = true
  manualOptionsError.value = ''
  const pending = (async () => {
    try {
      const response = await financeApi.getEntryOptions()
      if (!current()) return false
      const data = parseResponseData(response, {})
      if (!['accounts', 'customers', 'suppliers', 'departments', 'costCenters', 'employees'].every(key => Array.isArray(data?.[key]))) {
        throw new Error('凭证选项数据不完整，请重新加载')
      }
      const accounts = prepareAccountOptions(data.accounts)
      accountOptions.value = accounts.tree
      flatAccounts.value = accounts.flat
      customerOptions.value = data.customers
      supplierOptions.value = data.suppliers
      departmentOptions.value = data.departments
      costCenterOptions.value = data.costCenters
      userOptions.value = data.employees
      for (const item of entryForm.items) item._accountAux = accountAuxiliary(accounts.flat.find(account => String(account.id) === String(item.accountId)))
      optionsLoaded.value = true
      return true
    } catch (error) {
      if (!current()) return false
      manualOptionsError.value = getApiErrorMessage(error, '加载凭证选项失败，请重试')
      return false
    } finally {
      if (current()) {
        manualOptionsLoading.value = false
        optionsPromise = null
      }
    }
  })()
  optionsPromise = pending
  return pending
}

function handleAccountChange(accountId, index) {
  const item = entryForm.items[index]
  if (!item) return
  selectedManualIndex.value = index
  const account = flatAccounts.value.find(candidate => String(candidate.id) === String(accountId))
  item._accountAux = accountAuxiliary(account)
  if (account?.currencyCode === 'USD' && item.currencyCode !== 'USD') {
    item.currencyCode = 'USD'
    item.exchangeRate = null
    item.foreignAmount = null
  }
}

function handleManualCurrencyChange(currency) {
  if (!selectedManualItem.value) return
  selectedManualItem.value.exchangeRate = currency === 'CNY' ? 1 : null
  selectedManualItem.value.foreignAmount = null
}

function selectManualRow(row) {
  const index = entryForm.items.indexOf(row)
  if (index >= 0) selectedManualIndex.value = index
}

function addItem() {
  entryForm.items.push(createManualItem())
  selectedManualIndex.value = entryForm.items.length - 1
}

function removeItem(index) {
  if (entryForm.items.length <= 2) return
  entryForm.items.splice(index, 1)
  selectedManualIndex.value = Math.min(selectedManualIndex.value, entryForm.items.length - 1)
}

async function submitManualEntry() {
  if (submitting.value || !props.modelValue || !formRef.value || !optionsLoaded.value || manualOptionsLoading.value) return
  submitting.value = true
  const session = dialogSequence
  const current = () => !disposed && props.modelValue && session === dialogSequence
  try {
    if (!(await formRef.value.validate().catch(() => false))) return
    if (!current()) return
    const error = manualEntryError(entryForm, flatAccounts.value)
    if (error) {
      ElMessage.warning(error)
      return
    }
    const response = await financeApi.createEntry(manualEntryPayload(entryForm))
    if (disposed) return
    ElMessage.success('凭证录入成功')
    if (current()) emit('update:modelValue', false)
    emit('success', response?.data)
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '凭证保存失败'))
  } finally {
    submitting.value = false
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    dialogSequence++
    orderSequence++
    orderLoading.value = false
    resetPreviewState()
    previewVisible.value = false
    invalidateManualOptions()
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
  },
  { immediate: true }
)

watch(activeTab, async (tab) => {
  if (!props.modelValue) return
  if (tab === 'manual') {
    await loadManualOptions()
  } else if (tab === 'business' && !orderList.value.length) {
    await loadOrders()
  }
})
onBeforeUnmount(() => { disposed = true; orderSequence++; previewSequence++; invalidateManualOptions() })
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
.manual-line-details { margin-top: 16px; padding: 16px; border: 1px solid var(--color-border-light); background: var(--color-bg-base); }
.manual-detail-heading { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.manual-detail-heading span, .manual-currency-note { font-size: 12px; color: var(--color-text-secondary); }
.manual-aux-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 20px; }
.manual-aux-grid :deep(.el-form-item) { min-width: 0; }
.manual-row-actions { display: flex; align-items: center; justify-content: center; gap: 8px; }
.manual-row-actions :deep(.el-button + .el-button) { margin-left: 0; }
.manual-options-error { display: flex; align-items: center; gap: 12px; color: var(--color-danger); margin-bottom: 12px; }
.manual-entry-table :deep(.manual-selected-line > td.el-table__cell) { background: var(--color-primary-light-9, var(--color-bg-section)); }
@media (max-width: 760px) { .manual-aux-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .totals-row { flex-wrap: wrap; gap: 8px 16px; } }
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
