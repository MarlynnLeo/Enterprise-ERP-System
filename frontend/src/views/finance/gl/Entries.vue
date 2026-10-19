<!--
/**
 * Entries.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page entries-container">
    <PageHeader :title="pageTitle" subtitle="管理会计凭证与分录">
      <template #actions>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openEntryDialog"
          v-permission="'finance:entries:create'">
          录入凭证
        </el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      @update:expanded="showAdvancedSearch = $event"
      @search="searchEntries"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="凭证编号">
          <el-input  v-model="searchForm.entryNumber" placeholder="输入凭证编号" clearable ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="凭证日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="单据类型" v-if="!fixedType">
          <el-select v-model="searchForm.documentType" placeholder="选择单据类型" clearable>
            <el-option
              v-for="type in glConfig.documentTypes"
              :key="type"
              :label="type"
              :value="type"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="会计期间">
          <el-select v-model="searchForm.periodId" placeholder="选择会计期间" clearable>
            <el-option
              v-for="period in periods"
              :key="period.id"
              :label="period.periodName"
              :value="period.id"
            ></el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.isPosted" placeholder="选择状态" clearable>
            <el-option
              v-for="status in glConfig.entryStatuses"
              :key="status.value"
              :label="status.label"
              :value="status.value"
            />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ loading || listError ? '—' : statistics.total || 0 }}</div>
        <div class="stat-label">查询凭证数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ loading || listError ? '—' : statistics.posted || 0 }}</div>
        <div class="stat-label">已过账</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ loading || listError ? '—' : statistics.unposted || 0 }}</div>
        <div class="stat-label">未过账</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value voucher-stat-amount">{{ loading || listError ? '—' : formatJournalAmount(statistics.totalAmount) || '0.00' }}</div>
        <div class="stat-label" title="按当前查询条件累计借方金额，含符合条件的未过账凭证，不代表账户余额">查询借方累计（CNY）</div>
      </el-card>
    </div>

    <!-- 凭证序时簿：每条分录直接显示在主表中 -->
    <el-card class="data-card journal-card">
      <div class="journal-toolbar">
        <div class="journal-heading">
          <strong>凭证序时簿</strong>
          <span class="journal-hint">单击选中分录，双击查看凭证</span>
        </div>
        <div class="journal-actions">
          <el-button size="small" :icon="View" :disabled="!selectedEntry || loading" @click="viewEntry(selectedEntry)" v-permission="'finance:entries:view'">查看凭证</el-button>
          <el-button size="small" :icon="Check" :loading="entryAction === 'post'" :disabled="!selectedEntry || loading || !!entryAction || selectedEntry.isPosted || selectedEntry.isReversed" @click="postEntry(selectedEntry)" v-permission="'finance:entries:approve'">过账</el-button>
          <el-button size="small" :icon="RefreshLeft" :title="reversalUnavailableReason(selectedEntry)" :disabled="!selectedEntry || loading || !!entryAction || !canReverseEntry(selectedEntry)" @click="reverseEntry(selectedEntry)" v-permission="'finance:entries:approve'">冲销</el-button>
          <el-button size="small" :icon="Delete" :loading="entryAction === 'delete'" :disabled="!selectedEntry || loading || !!entryAction || selectedEntry.isPosted || selectedEntry.isReversed" @click="deleteEntry(selectedEntry)" v-permission="'finance:entries:delete'">删除</el-button>
          <el-button size="small" :icon="Refresh" :disabled="loading" @click="loadEntries">刷新</el-button>
        </div>
      </div>
      <div class="journal-selection" aria-live="polite">
        <template v-if="selectedEntry">
          <span>已选凭证：<strong>{{ selectedEntry.entryNumber }}</strong></span>
          <span>{{ voucherStatus(selectedEntry) }}</span>
          <span v-if="selectedEntry.isPosted && !isManualVoucher(selectedEntry)" class="journal-hint">业务撤销请回原单办理</span>
        </template>
        <span v-else>请选择分录后操作凭证</span>
        <span class="journal-count">本页 {{ entriesList.length }} 张凭证 · {{ journalItemCount }} 条分录</span>
      </div>
      <el-alert v-if="listError" :title="listError" type="error" :closable="false" show-icon>
        <el-button link type="primary" @click="loadEntries">重新加载</el-button>
      </el-alert>
      <el-table
        ref="journalTable"
        :data="journalRows"
        class="journal-table w-full"
        row-key="rowKey"
        border
        size="small"
        highlight-current-row
        :row-class-name="({ row }) => row.firstLine ? 'voucher-first-line' : 'voucher-continuation'"
        scrollbar-always-on
        v-loading="loading"
        @row-click="selectJournalRow"
        @row-dblclick="row => viewEntry(row.entry)"
      >
        <el-table-column
          v-for="column in JOURNAL_COLUMNS"
          :key="column.prop"
          :prop="column.prop"
          :label="column.label"
          :width="column.width"
          :align="column.numeric ? 'right' : 'left'"
          header-align="center"
          :class-name="column.header ? 'voucher-header-cell' : ''"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ journalCellValue(row, column) }}</template>
        </el-table-column>
        <template #empty>{{ listError ? '凭证数据加载失败，请重试' : '暂无符合条件的凭证' }}</template>
      </el-table>
      <div class="journal-totals">
        <span>本页合计（CNY）</span>
        <span>借方 <strong>{{ formatJournalAmount(journalTotals.debit) || '0.00' }}</strong></span>
        <span>贷方 <strong>{{ formatJournalAmount(journalTotals.credit) || '0.00' }}</strong></span>
        <span class="journal-pagination-note">按凭证分页，分录完整显示</span>
      </div>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(parseInt(total) || 0, 0)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 查看凭证明细对话框 -->
    <AppDialog
      v-model="detailDialogVisible"
      title="凭证明细"
      mode="view"
      width="1000px"
      :loading="detailLoading"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">凭证明细</span>
          <el-button v-permission="'finance:entries:view'" type="primary" size="small" :disabled="printLoading || detailLoading || !!detailError || !currentEntry.id" @click="handlePrint" :icon="Printer">打印凭证</el-button>
        </div>
      </template>
      <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" show-icon>
        <el-button link type="primary" @click="retryEntryDetail">重新加载凭证</el-button>
      </el-alert>
      <EntryVoucherSheet
        v-else-if="currentEntry.id"
        :entry="currentEntry"
        :items="currentEntryItems"
        @open-entry="id => loadEntryDetail({ id })"
      />
    </AppDialog>

    <!-- 冲销凭证对话框 -->
    <AppDialog
      v-model="reverseDialogVisible"
      title="冲销凭证"
      mode="form"
      width="560px"
      :close-on-click-modal="false"
      :close-on-press-escape="!reverseSubmitting"
      :show-close="!reverseSubmitting"
    >
      <el-descriptions :column="2" border class="reversal-summary" v-if="reversingEntry">
        <el-descriptions-item label="原凭证">{{ reversingEntry.entryNumber }}</el-descriptions-item>
        <el-descriptions-item label="原期间">{{ reversingEntry.periodName }}</el-descriptions-item>
        <el-descriptions-item label="原日期">{{ reversingEntry.entryDate }}</el-descriptions-item>
        <el-descriptions-item label="原金额（CNY）">{{ formatJournalAmount(reversingEntry.totalDebit) }}</el-descriptions-item>
      </el-descriptions>

      <el-form :model="reversalForm" :disabled="reverseSubmitting" label-width="100px" class="reversal-form">
        <el-form-item label="冲销日期" required>
          <el-date-picker
            v-model="reversalForm.entry_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择冲销日期"
            class="w-full"
            @change="handleReversalDateChange"
          />
        </el-form-item>
        <el-form-item label="过账日期" required>
          <el-date-picker
            v-model="reversalForm.posting_date"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择过账日期"
            class="w-full"
            @change="handleReversalPostingDateChange"
          />
        </el-form-item>
        <el-form-item label="会计期间" required>
          <el-select
            v-model="reversalForm.period_id"
            placeholder="选择会计期间"
            class="w-full"
            @change="handleReversalPeriodChange"
          >
            <el-option
              v-for="period in openPeriods"
              :key="period.id"
              :label="formatPeriodLabel(period)"
              :value="period.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="摘要">
          <el-input
            v-model="reversalForm.description"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <el-alert
        v-if="reversalPeriodMismatch"
        type="error"
        :closable="false"
        show-icon
        title="冲销日期、过账日期必须落在所选开放会计期间内"
      />

      <template #footer>
        <el-button :disabled="reverseSubmitting" @click="reverseDialogVisible = false">取消</el-button>
        <el-button
          type="warning"
          :loading="reverseSubmitting"
          :disabled="!canSubmitReversal"
          @click="submitReverseEntry"
        >
          确认冲销
        </el-button>
      </template>
        </AppDialog>

    <!-- 录入凭证对话框：业务多选生成 + 手工录入 -->
    <EntryFormDialog
      v-model="entryDialogVisible"
      :default-voucher-word="defaultVoucherWord"
      @success="handleEntryDialogSuccess"
    />
  </div>
</template>

<script setup>
import { PAGE_SIZE_OPTIONS } from '@/config/pagination'
import { getThemeDefaultPageSize } from '@/utils/themePageSize'
import { JOURNAL_COLUMNS, buildJournalRows, journalCellValue, formatJournalAmount } from './entries/journalGrid'
import { voucherStatus, postingMethodLabel, reversalUnavailableReason, isManualVoucher, normalizeVoucherPeriod, isOpenVoucherPeriod } from './entries/voucherPresentation'
import { appendVoucherPrintAudit } from './entries/voucherPrintAudit'
// Vue核心和路由
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { formatDate } from '@/utils/helpers/dateUtils'
import { useRoute } from 'vue-router';

// Element Plus
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { Plus, Printer, Check, RefreshLeft, Delete, View, Refresh } from '@element-plus/icons-vue';

// Pinia Stores
import { useFinanceStore } from '@/stores/finance';
import { storeToRefs } from 'pinia';

// 项目工具和API
import { financeApi } from '@/api';
import printService from '@/services/printService'
import EntryFormDialog from './entries/EntryFormDialog.vue'
import EntryVoucherSheet from './entries/EntryVoucherSheet.vue'
import { getApiErrorMessage } from '@/utils/errorHandler'

// Props定义
const props = defineProps({
  fixedType: {
    type: String,
    default: ''
  }
});

// Stores初始化
const financeStore = useFinanceStore();
const { glConfig } = storeToRefs(financeStore);

// 权限计算属性


// 路由
const route = useRoute();

// 页面标题
const pageTitle = computed(() => props.fixedType || route.query.type || '会计凭证管理');

// 高级搜索展开状态
const showAdvancedSearch = ref(false);

// 数据加载状态
const loading = ref(false);

// 分页相关
const total = ref(0);
const pageSize = ref(getThemeDefaultPageSize(10));
const currentPage = ref(1);

// 凭证列表
const entriesList = ref([]);
const journalTable = ref(null);
const listError = ref('');
const selectedRowKey = ref('');
const journalRows = computed(() => buildJournalRows(entriesList.value));
const journalItemCount = computed(() => journalRows.value.filter(row => row.hasItem).length);
const selectedEntry = computed(() => journalRows.value.find(row => row.rowKey === selectedRowKey.value)?.entry || null);
const journalTotals = computed(() => entriesList.value.reduce((totals, entry) => ({
  debit: totals.debit + (Number(entry.totalDebit) || 0),
  credit: totals.credit + (Number(entry.totalCredit) || 0),
}), { debit: 0, credit: 0 }));
const selectJournalRow = row => { selectedRowKey.value = row.rowKey; };

// 统计数据
const statistics = reactive({
  total: 0,
  posted: 0,
  unposted: 0,
  totalAmount: 0
});

// 详情对话框相关
const detailDialogVisible = ref(false);
const currentEntry = ref({});
const currentEntryItems = ref([]);
const openedRouteEntryId = ref('');
const detailLoading = ref(false);
const printLoading = ref(false);
const detailError = ref('');
let detailRequest = null;
let detailSequence = 0;
let listSequence = 0;
let disposed = false;
const reverseDialogVisible = ref(false);
const reverseSubmitting = ref(false);
const reversingEntry = ref(null);
const reversalForm = reactive({
  entry_date: '',
  posting_date: '',
  period_id: null,
  description: ''
});

// 录入凭证对话框（业务多选生成 + 手工录入）
const entryDialogVisible = ref(false);
const entryAction = ref('');

const defaultVoucherWord = computed(() => {
  const type = props.fixedType || route.query.type || '';
  const typeMap = {
    收款凭证: '收',
    收款单: '收',
    付款凭证: '付',
    付款单: '付',
    转账凭证: '转',
    记账凭证: '记',
  };
  return typeMap[type] || '记';
});

const openEntryDialog = () => {
  entryDialogVisible.value = true;
};

const handleEntryDialogSuccess = async () => {
  await loadEntries();
};

// 打印凭证
const handlePrint = async () => {
  if (printLoading.value) return;
  if (detailLoading.value || detailError.value || !currentEntry.value?.id) {
    ElMessage.warning('凭证数据未就绪');
    return;
  }

  printLoading.value = true;
  try {
    const entry = currentEntry.value
    const items = currentEntryItems.value
    const html = await printService.generateByDefaultTemplate('finance', 'gl_voucher', {
      entry_number: entry.entryNumber || entry.technicalId || '',
      document_no: entry.entryNumber || entry.technicalId || '',
      entry_date: entry.entryDate || '',
      posting_date: entry.postingDate || '',
      document_type: entry.documentType || '',
      document_number: entry.documentNumber || '',
      period_name: entry.periodName || '',
      status: voucherStatus(entry),
      base_currency: 'CNY',
      attachment_count: entry.attachmentCount ?? '',
      approved_by: entry.approverName || '',
      posted_by: entry.postedBy || '',
      posted_at: entry.postedAt || '',
      posting_method: postingMethodLabel(entry.postingMethod),
      description: entry.description || '',
      total_debit: formatJournalAmount(totalDebit.value) || '0.00',
      total_credit: formatJournalAmount(totalCredit.value) || '0.00',
      created_by: entry.createdBy || '',
      print_time: new Date().toLocaleString(),
      items: items.map((item, index) => ({
        index: index + 1,
        account_code: item.accountCode || '',
        account_name: item.accountName || '',
        description: item.description || '',
        debit_amount: formatJournalAmount(item.debitAmount) || '-',
        credit_amount: formatJournalAmount(item.creditAmount) || '-',
        currency_code: item.currencyCode || '',
        exchange_rate: item.exchangeRate,
        foreign_amount: item.foreignAmount,
      }))
    })
    await printService.previewDocument(appendVoucherPrintAudit(html, entry, items))
  } catch (error) {
    console.error('打印凭证失败:', error)
    ElMessage.error('打印凭证失败')
  } finally {
    printLoading.value = false;
  }
};

// 计算借贷方合计
const totalDebit = computed(() => {
  return currentEntryItems.value.reduce((sum, item) => sum + (Number(item.debitAmount) || 0), 0);
});

const totalCredit = computed(() => {
  return currentEntryItems.value.reduce((sum, item) => sum + (Number(item.creditAmount) || 0), 0);
});

// 会计期间列表
const periods = ref([]);

const toLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPeriodStart = period => (period?.startDate || '').slice(0, 10);
const getPeriodEnd = period => (period?.endDate || '').slice(0, 10);

const isDateInPeriod = (date, period) => {
  const start = getPeriodStart(period);
  const end = getPeriodEnd(period);
  return Boolean(date && start && end && date >= start && date <= end);
};

const openPeriods = computed(() => periods.value.filter(isOpenVoucherPeriod));

const selectedReversalPeriod = computed(() => {
  return periods.value.find(period => String(period.id) === String(reversalForm.period_id)) || null;
});

const reversalPeriodMismatch = computed(() => {
  if (!reversalForm.entry_date || !reversalForm.posting_date || !selectedReversalPeriod.value) {
    return false;
  }
  return !isDateInPeriod(reversalForm.entry_date, selectedReversalPeriod.value)
    || !isDateInPeriod(reversalForm.posting_date, selectedReversalPeriod.value);
});

const canSubmitReversal = computed(() => {
  return Boolean(
    reversingEntry.value
    && reversalForm.entry_date
    && reversalForm.posting_date
    && reversalForm.period_id
    && isOpenVoucherPeriod(selectedReversalPeriod.value)
    && !reversalPeriodMismatch.value
    && !reverseSubmitting.value
  );
});

const findOpenPeriodByDate = (date) => {
  return openPeriods.value.find(period => isDateInPeriod(date, period)) || null;
};

const formatPeriodLabel = (period) => {
  const name = period.periodName || '未命名会计期间';
  return `${name} (${getPeriodStart(period)} 至 ${getPeriodEnd(period)})`;
};

const toBooleanFlag = (value) => value === true || value === 1 || value === '1';

const isReversedEntry = (entry) => {
  return toBooleanFlag(entry.isReversed)
    || entry.status === 'reversed'
    || Boolean(entry.reversalEntryId);
};

const isReversalEntry = (entry) => {
  return toBooleanFlag(entry.isReversalEntry)
    || Boolean(entry.reversalOfEntryId);
};

const canReverseEntry = (entry) => {
  return !reversalUnavailableReason(entry);
};

// 搜索表单
const searchForm = reactive({
  entryNumber: '',
  dateRange: [],
  documentType: '',
  periodId: '',
  isPosted: ''
});

// 英文 document_type -> 中文显示标签
const DOCUMENT_TYPE_LABELS = {
  receipt: '收据',
  invoice: '发票',
  payment: '付款单',
  collection: '收款单',
  transfer: '转账单',
  adjustment: '调整单',
  profit_loss_transfer: '损益结转',
  year_end_transfer: '年度结转',
  sales_outbound: '销售出库',
  outsourced_issue: '委外发料',
  outsourced_receipt: '委外入库',
  production_cost_transfer: '生产成本结转',
  inventory_reclass: '库存重分类',
};

// API 已 camel（toGlEntryApi）
const normalizeEntryRow = (entry) => ({
  id: entry.id,
  voucherWord: entry.voucherWord,
  voucherNumber: entry.voucherNumber,
  attachmentCount: entry.attachmentCount ?? null,
  approvalComment: entry.approvalComment || '',
  items: Array.isArray(entry.items) ? entry.items : [],
  approverName: entry.approverName || '',
  postedBy: entry.postedBy || '',
  postedAt: entry.postedAt || '',
  approvedAt: entry.approvedAt || '',
  postingMethod: entry.postingMethod || '',
  entryNumber: entry.entryNumber
    || (entry.voucherWord && entry.voucherNumber
      ? `${entry.voucherWord}-${entry.voucherNumber}`
      : entry.technicalId),
  technicalId: entry.technicalId || entry.entryNumber,
  entryDate: formatDate(entry.entryDate),
  postingDate: formatDate(entry.postingDate),
  documentType: DOCUMENT_TYPE_LABELS[entry.documentType] || entry.documentType,
  rawDocumentType: entry.documentType,
  transactionType: entry.transactionType,
  transactionId: entry.transactionId,
  hasBusinessLinks: entry.hasBusinessLinks,
  documentNumber: entry.documentNumber,
  periodId: entry.periodId,
  periodName: entry.periodName || '未命名会计期间',
  fiscalYear: entry.fiscalYear,
  isPosted: toBooleanFlag(entry.isPosted),
  isReversed: isReversedEntry(entry),
  isReversalEntry: isReversalEntry(entry),
  reversalOfEntryId: entry.reversalOfEntryId,
  reversalEntryId: entry.reversalEntryId,
  createdBy: entry.creatorName || entry.createdBy,
  description: entry.description || '-',
  totalDebit: entry.totalDebit ?? 0,
  totalCredit: entry.totalCredit ?? 0
});

// Older servers return headers only. Fetch missing lines through the existing
// detail endpoint, with bounded concurrency and no mutation of cached responses.
const ensureEntryItems = async (entries, isCurrent) => {
  if (entries.some(entry => entry.items != null && !Array.isArray(entry.items))) {
    throw new Error('凭证明细数据不完整，请重新加载');
  }
  const rows = entries.map(entry => ({ ...entry }));
  const missing = rows.filter(entry => entry.items == null);
  let nextIndex = 0;
  let failed = false;
  const loadNext = async () => {
    while (isCurrent() && !failed && nextIndex < missing.length) {
      const entry = missing[nextIndex++];
      try {
        if (!Number.isSafeInteger(Number(entry.id)) || Number(entry.id) <= 0) {
          throw new Error('凭证编号无效，请重新加载');
        }
        const response = await financeApi.getEntryItems(entry.id);
        if (!isCurrent()) return;
        if (!Array.isArray(response.data)) {
          throw new Error('凭证明细数据不完整，请重新加载');
        }
        entry.items = response.data;
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, missing.length) }, loadNext));
  return rows;
};

// 加载凭证列表
const loadEntries = async () => {
  const sequence = ++listSequence;
  const isCurrent = () => !disposed && sequence === listSequence;
  loading.value = true;
  listError.value = '';
  selectedRowKey.value = '';
  journalTable.value?.setCurrentRow?.();
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      includeItems: true
    };

    // 添加筛选条件（HTTP camel）
    if (searchForm.entryNumber) {
      params.entryNumber = searchForm.entryNumber;
    }
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    // 如果有 fixedType（付款凭证/收款凭证/转账凭证页面），转换为voucher_word筛选
    if (props.fixedType) {
      // 根据fixedType映射到对应的凭证字
      const voucherWordMap = {
        '收款单': '收',
        '收款凭证': '收',
        '付款单': '付',
        '付款凭证': '付',
        '转账凭证': '转',
        '记账凭证': '记'
      };
      const voucherWord = voucherWordMap[props.fixedType];
      if (voucherWord) {
        params.voucherWord = voucherWord;
      } else {
        // 如果没有映射，仍按 documentType 筛选
        params.documentType = props.fixedType;
      }
    } else if (searchForm.documentType) {
      params.documentType = searchForm.documentType;
    }
    if (searchForm.periodId) {
      params.periodId = searchForm.periodId;
    }
    if (searchForm.isPosted !== '') {
      params.isPosted = searchForm.isPosted;
    }

    const response = await financeApi.getEntries(params);
    if (disposed || sequence !== listSequence) return;
    // 根据后端返回的实际数据结构调整
    if (response.data.entries && Array.isArray(response.data.entries)) {
      const entries = await ensureEntryItems(response.data.entries, isCurrent);
      if (!isCurrent()) return;
      // 提取基本数据
      entriesList.value = entries.map(normalizeEntryRow);

      // 设置分页信息
      if (response.data.pagination) {
        total.value = response.data.pagination.total;
      } else {
        total.value = entriesList.value.length;
      }


      // 使用后端返回的统计数据（真实总量）
      calculateStatistics(response.data.statistics);
    } else {
      listError.value = '凭证列表数据不完整，请重新加载';
      ElMessage.warning('返回的数据格式不正确');
      entriesList.value = [];
      total.value = 0;
      // 重置统计数据
      statistics.total = 0;
      statistics.posted = 0;
      statistics.unposted = 0;
      statistics.totalAmount = 0;
    }
  } catch (error) {
    if (disposed || sequence !== listSequence) return;
    listError.value = getApiErrorMessage(error, '加载凭证列表失败，请重试');
    console.error('加载凭证列表失败:', error);
    ElMessage.error('加载凭证列表失败');
    entriesList.value = [];
    total.value = 0;
    // 重置统计数据
    statistics.total = 0;
    statistics.posted = 0;
    statistics.unposted = 0;
    statistics.totalAmount = 0;
  } finally {
    if (!disposed && sequence === listSequence) loading.value = false;
  }
};

// 使用后端返回的统计数据（反映筛选后的真实总量，而非当前页）
const calculateStatistics = (serverStats) => {
  if (serverStats) {
    statistics.total = serverStats.total || 0;
    statistics.posted = serverStats.posted || 0;
    statistics.unposted = serverStats.unposted || 0;
    statistics.totalAmount = serverStats.totalAmount || 0;
  } else {
    // 降级方案：后端未返回统计时使用当前页数据
    const pageTotal = entriesList.value.length;
    const posted = entriesList.value.filter(entry => entry.isPosted).length;
    statistics.total = total.value || pageTotal;
    statistics.posted = posted;
    statistics.unposted = pageTotal - posted;
    statistics.totalAmount = entriesList.value.reduce((sum, entry) => {
      return sum + (parseFloat(entry.totalDebit) || 0);
    }, 0);
  }
};

// 搜索凭证
const searchEntries = () => {
  currentPage.value = 1;
  loadEntries();
};

// 重置搜索条件
const resetSearch = () => {
  searchForm.entryNumber = '';
  searchForm.dateRange = [];
  searchForm.documentType = '';
  searchForm.periodId = '';
  searchForm.isPosted = '';
  searchEntries();
};

// A single request owns the header and items, including route changes and retries.
const loadEntryDetail = async (request) => {
  const sequence = ++detailSequence;
  const isCurrent = () => !disposed && sequence === detailSequence;
  detailRequest = request;
  detailLoading.value = true;
  detailError.value = '';
  currentEntry.value = {};
  currentEntryItems.value = [];
  detailDialogVisible.value = true;
  try {
    if (!Number.isSafeInteger(Number(request.id)) || Number(request.id) <= 0) {
      throw new Error('凭证编号无效，请重新选择凭证');
    }
    const response = await financeApi.getEntry(request.id);
    if (!isCurrent()) return;
    const data = response.data?.entry ?? response.data;
    if (String(data?.id) !== String(request.id)) throw new Error('凭证详情数据不完整，请重新加载');
    const entry = normalizeEntryRow(data);
    let items = data.items;
    if (items == null) {
      const legacy = await financeApi.getEntryItems(entry.id);
      if (!isCurrent()) return;
      items = legacy.data;
    }
    if (!Array.isArray(items)) throw new Error('凭证明细数据不完整，请重新加载');
    currentEntry.value = entry;
    currentEntryItems.value = items;
    if (request.routeId && String(route.query.entryId) === request.routeId) {
      openedRouteEntryId.value = request.routeId;
    }
  } catch (error) {
    if (!isCurrent()) return;
    console.error('加载凭证明细失败:', error);
    detailError.value = getApiErrorMessage(error, '加载凭证明细失败，请重试');
  } finally {
    if (isCurrent()) detailLoading.value = false;
  }
};

const viewEntry = row => loadEntryDetail({ id: row.id, row });
const retryEntryDetail = () => { if (detailRequest && !detailLoading.value) return loadEntryDetail(detailRequest); };

const openRouteEntryDetail = () => {
  const entryId = route.query.entryId;
  if (!entryId || openedRouteEntryId.value === String(entryId)) return;
  const row = entriesList.value.find(item => String(item.id) === String(entryId));
  return loadEntryDetail({ id: entryId, row, routeId: String(entryId) });
};

// 过账凭证
const postEntry = async (row) => {
  if (!row || row.isPosted || row.isReversed || entryAction.value) return;
  entryAction.value = 'post';
  try {
    await ElMessageBox.confirm('确认要过账该凭证吗？过账后将无法修改或删除。', '确认过账', {
      confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning'
    });
    await financeApi.postEntry(row.id);
    ElMessage.success('过账成功');
    await loadEntries();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(getApiErrorMessage(error, '过账凭证失败'));
    }
  } finally {
    entryAction.value = '';
  }
};

const chooseDefaultReversalPeriod = (row) => {
  const today = toLocalDateString();
  const todayPeriod = findOpenPeriodByDate(today);
  if (todayPeriod) {
    return { period: todayPeriod, date: today };
  }

  const originalPeriod = openPeriods.value.find(period => String(period.id) === String(row.periodId));
  if (originalPeriod) {
    const originalDate = row.entryDate && isDateInPeriod(row.entryDate, originalPeriod)
      ? row.entryDate
      : getPeriodEnd(originalPeriod);
    return { period: originalPeriod, date: originalDate };
  }

  const fallbackPeriod = openPeriods.value[0] || null;
  return {
    period: fallbackPeriod,
    date: fallbackPeriod ? getPeriodEnd(fallbackPeriod) : today
  };
};

const resetReversalForm = (row) => {
  const { period, date } = chooseDefaultReversalPeriod(row);
  reversalForm.entry_date = date;
  reversalForm.posting_date = date;
  reversalForm.period_id = period?.id || null;
  reversalForm.description = `冲销凭证：${row.entryNumber}`;
};

// 冲销凭证
const reverseEntry = async (row) => {
  if (entryAction.value || reverseSubmitting.value) return;
  entryAction.value = 'reverse';
  try {
    if (!canReverseEntry(row)) {
      ElMessage.warning(reversalUnavailableReason(row));
      return;
    }
    if (!await loadPeriods()) return;
    if (openPeriods.value.length === 0) {
      ElMessage.error('没有可用的开放会计期间，无法冲销凭证');
      return;
    }

    reversingEntry.value = row;
    resetReversalForm(row);
    reverseDialogVisible.value = true;
  } catch (error) {
    console.error('准备冲销凭证失败:', error);
    ElMessage.error(getApiErrorMessage(error, '准备冲销凭证失败'));
  } finally {
    entryAction.value = '';
  }
};

const handleReversalDateChange = () => {
  if (!reversalForm.entry_date) return;
  reversalForm.posting_date = reversalForm.entry_date;
  const period = findOpenPeriodByDate(reversalForm.entry_date);
  if (period) {
    reversalForm.period_id = period.id;
  }
};

const handleReversalPostingDateChange = () => {
  if (!reversalForm.posting_date) return;
  const currentPeriod = selectedReversalPeriod.value;
  if (!currentPeriod || !isDateInPeriod(reversalForm.posting_date, currentPeriod)) {
    const period = findOpenPeriodByDate(reversalForm.posting_date);
    if (period && isDateInPeriod(reversalForm.entry_date, period)) {
      reversalForm.period_id = period.id;
    }
  }
};

const handleReversalPeriodChange = () => {
  const period = selectedReversalPeriod.value;
  if (!period) return;

  if (!isDateInPeriod(reversalForm.entry_date, period)) {
    const originalDate = reversingEntry.value?.entryDate;
    reversalForm.entry_date = originalDate && isDateInPeriod(originalDate, period)
      ? originalDate
      : getPeriodEnd(period);
  }

  if (!isDateInPeriod(reversalForm.posting_date, period)) {
    reversalForm.posting_date = reversalForm.entry_date;
  }
};

const submitReverseEntry = async () => {
  if (!canSubmitReversal.value) return;

  reverseSubmitting.value = true;
  try {
    await financeApi.reverseEntry(reversingEntry.value.id, {
      entry_date: reversalForm.entry_date,
      posting_date: reversalForm.posting_date,
      period_id: reversalForm.period_id,
      description: reversalForm.description
    });
    ElMessage.success('冲销成功，反向凭证已过账');
    reverseDialogVisible.value = false;
    reversingEntry.value = null;
    await loadEntries();
  } catch (error) {
    console.error('冲销凭证失败:', error);
    ElMessage.error(getApiErrorMessage(error, '冲销凭证失败'));
  } finally {
    reverseSubmitting.value = false;
  }
};

// 删除凭证
const deleteEntry = async (row) => {
  if (!row || row.isPosted || row.isReversed || entryAction.value) return;
  entryAction.value = 'delete';
  try {
    await ElMessageBox.confirm('确认要删除该凭证吗？此操作不可逆。', '警告', {
      confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning'
    });
    await financeApi.deleteEntry(row.id);
    ElMessage.success('删除成功');
    await loadEntries();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(getApiErrorMessage(error, '删除凭证失败'));
    }
  } finally {
    entryAction.value = '';
  }
};

// 加载会计期间列表
const loadPeriods = async () => {
  try {
    const response = await financeApi.periods.getList();
    if (disposed) return;
    const rows = Array.isArray(response.data) ? response.data : response.data?.periods;
    if (!Array.isArray(rows)) throw new Error('会计期间数据不完整，请重新加载');
    periods.value = rows.map(normalizeVoucherPeriod);
    return true;
  } catch (error) {
    if (disposed) return;
    console.error('加载会计期间失败:', error);
    periods.value = [];
    ElMessage.error('加载会计期间失败');
    return false;
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  currentPage.value = 1;
  loadEntries();
};

const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadEntries();
};

// 页面加载时执行
onMounted(() => {
  loadPeriods();
  financeStore.loadSettings();
});

// 监听fixedType和路由变化，重新加载数据
watch(() => [props.fixedType, route.query.type], () => {
  currentPage.value = 1;
  loadEntries();
}, { immediate: true });

watch(() => route.query.entryId, (entryId, previousId) => {
  openedRouteEntryId.value = '';
  if (entryId) openRouteEntryDetail();
  else if (previousId) detailDialogVisible.value = false;
}, { immediate: true });

watch(detailDialogVisible, visible => {
  if (!visible) {
    detailSequence++;
    detailLoading.value = false;
  }
}, { flush: 'sync' });

onBeforeUnmount(() => { disposed = true; listSequence++; detailSequence++; });
</script>

<style scoped>
.header-card {
  margin-bottom: 20px;
}

.title-section h2 {
  margin: 0 0 5px 0;
  font-size: 20px;
  color: var(--color-text-primary);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* 只在序时簿内使用紧凑网格，不影响凭证明细弹窗。 */
.entries-container .journal-toolbar,
.journal-heading,
.journal-actions,
.journal-selection,
.journal-totals {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.entries-container .journal-toolbar {
  justify-content: space-between;
  margin-bottom: 10px;
}

.journal-heading strong {
  font-size: 15px;
  color: var(--color-text-primary);
}

.journal-hint,
.journal-selection,
.journal-pagination-note {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.journal-actions {
  gap: 6px;
}

.journal-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.journal-selection {
  min-height: 24px;
  margin-bottom: 6px;
}

.journal-count,
.journal-pagination-note {
  margin-left: auto;
}

.entries-container :deep(.journal-table.el-table) {
  border-radius: 0;
  font-variant-numeric: tabular-nums;
  --erp-table-fixed-current-bg: var(--color-primary);
}

.entries-container :deep(.journal-table .el-table__header th.el-table__cell) {
  padding: 4px 0 !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  color: var(--color-text-primary) !important;
}

.entries-container :deep(.journal-table .el-table__body td.el-table__cell) {
  padding: 1px 0 !important;
  font-size: 12px !important;
  color: var(--color-primary-text, var(--color-primary)) !important;
  transition: none !important;
}

.entries-container :deep(.journal-table .cell) {
  padding: 0 6px;
  line-height: 21px;
}

.entries-container :deep(.journal-table .el-table__row) {
  cursor: pointer;
}

.entries-container :deep(.journal-table .el-table__body tr.current-row > td.el-table__cell) {
  background: var(--color-primary) !important;
  color: var(--color-on-primary) !important;
}

.journal-totals {
  padding: 10px 0;
  font-size: 12px;
  border-bottom: 1px solid var(--color-border-light);
}

.journal-totals strong {
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 确保表格单元格内容不换行 */
:deep(.el-table .cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 打印对话框头部样式 */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding-right: 40px;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.reversal-summary {
  margin-bottom: 18px;
}

.voucher-stat-amount { font-size: clamp(18px, 2vw, 28px); overflow-wrap: anywhere; }

.reversal-form {
  margin-top: 8px;
}

</style>
