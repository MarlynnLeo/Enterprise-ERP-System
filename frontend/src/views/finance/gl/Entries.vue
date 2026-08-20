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
        <el-form-item label="记账日期">
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
        <div class="stat-value">{{ statistics.total || 0 }}</div>
        <div class="stat-label">总凭证数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.posted || 0 }}</div>
        <div class="stat-label">已过账</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ statistics.unposted || 0 }}</div>
        <div class="stat-label">未过账</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(statistics.totalAmount) }}</div>
        <div class="stat-label">总金额</div>
      </el-card>
    </div>

    <!-- 表格区域 -->
    <el-card class="data-card">
      <el-table
        :data="entriesList"
        class="w-full"
        row-key="id"
        border
        v-loading="loading"
        @expand-change="handleExpandChange"
      >
        <el-table-column type="expand">
          <template #default="props">
            <div class="expanded-row">
              <div class="expanded-row-header">
                <h4>凭证明细</h4>
                <span class="expanded-row-description">{{ props.row.description }}</span>
              </div>
              <el-table :data="props.row.items || []" border class="table-row-click w-full inner-table"
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewEntry(row))">
                <el-table-column prop="accountCode" label="科目编码" width="120"></el-table-column>
                <el-table-column prop="accountName" label="科目名称" width="180"></el-table-column>
                <el-table-column prop="debitAmount" label="借方金额" width="150">
                  <template #default="scope">
                    <span class="text-success" v-if="scope.row.debitAmount > 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span class="text-danger" v-else-if="scope.row.debitAmount < 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span v-else>-</span>
                  </template>
                </el-table-column>
                <el-table-column prop="creditAmount" label="贷方金额" width="150">
                  <template #default="scope">
                    <span class="text-danger" v-if="scope.row.creditAmount > 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span class="text-success" v-else-if="scope.row.creditAmount < 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                    <span v-else>-</span>
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="描述" show-overflow-tooltip></el-table-column>
              </el-table>
              <div class="expanded-row-footer">
                <div class="total-item">
                  <span class="label">借方合计：</span>
                  <span class="value debit">{{ (props.row.expandedTotalDebit || props.row.totalDebit || 0).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                </div>
                <div class="total-item">
                  <span class="label">贷方合计：</span>
                  <span class="value credit">{{ (props.row.expandedTotalCredit || props.row.totalCredit || 0).toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="entryNumber" label="凭证编号" width="160" show-overflow-tooltip></el-table-column>
        <el-table-column prop="entryDate" label="记账日期" width="100"></el-table-column>
        <el-table-column prop="postingDate" label="过账日期" width="100"></el-table-column>
        <el-table-column prop="documentType" label="单据类型" width="90" show-overflow-tooltip></el-table-column>
        <el-table-column prop="documentNumber" label="单据编号" width="160" show-overflow-tooltip></el-table-column>
        <el-table-column prop="periodName" label="会计期间" width="110" show-overflow-tooltip></el-table-column>
        <el-table-column label="借方合计" width="120">
          <template #default="scope">
            <span class="debit" v-if="scope.row.totalDebit">{{ scope.row.totalDebit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="贷方合计" width="120">
          <template #default="scope">
            <span class="credit" v-if="scope.row.totalCredit">{{ scope.row.totalCredit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.isPosted ? 'success' : 'info'">
              {{ scope.row.isPosted ? '已过账' : '未过账' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="冲销状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.isReversed ? 'warning' : ''" v-if="scope.row.isReversed">
              已冲销
            </el-tag>
            <el-tag type="info" v-else-if="scope.row.isReversalEntry">
              冲销凭证
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="createdBy" label="创建人" width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="description" label="描述" min-width="150" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            <div class="table-actions">
              
              <el-button
                v-if="!scope.row.isPosted && !scope.row.isReversed"
                type="success"
                size="small"
                @click="postEntry(scope.row)"
                v-permission="'finance:entries:approve'"
              >
                <el-icon><Check /></el-icon> 过账
              </el-button>
              <el-button
                v-if="canReverseEntry(scope.row)"
                type="warning"
                size="small"
                @click="reverseEntry(scope.row)"
                v-permission="'finance:entries:update'"
              >
                <el-icon><RefreshLeft /></el-icon> 冲销
              </el-button>
              <el-button v-permission="'finance:entries:delete'"
                v-if="!scope.row.isPosted"
                type="danger"
                size="small"
                @click="deleteEntry(scope.row)"
              >
                <el-icon><Delete /></el-icon> 删除
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :small="false"
          :disabled="false"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="Math.max(parseInt(total) || 0, 1)"
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
      content-width="wide"
    >
      <template #header>
        <div class="dialog-header">
          <span class="dialog-title">凭证明细</span>
          <el-button v-permission="'finance:entries:view'" type="primary" size="small" @click="handlePrint" :icon="Printer">打印凭证</el-button>
        </div>
      </template>
      <div class="print-area">
      <div class="entry-detail-header">
        <div class="detail-item">
          <span class="label">凭证编号：</span>
          <span class="value">{{ currentEntry.entryNumber }}</span>
        </div>
        <div class="detail-item">
          <span class="label">记账日期：</span>
          <span class="value">{{ currentEntry.entryDate }}</span>
        </div>
        <div class="detail-item">
          <span class="label">单据类型：</span>
          <span class="value">{{ currentEntry.documentType }}</span>
        </div>
        <div class="detail-item">
          <span class="label">状态：</span>
          <el-tag :type="currentEntry.isPosted ? 'success' : 'info'" size="small">
            {{ currentEntry.isPosted ? '已过账' : '未过账' }}
          </el-tag>
        </div>
      </div>

      <div class="entry-description">
        <span class="label">描述：</span>
        <span class="value">{{ currentEntry.description }}</span>
      </div>

      <el-table :data="currentEntryItems" border class="w-full mt-md">
        <el-table-column prop="accountCode" label="科目编码" width="120"></el-table-column>
        <el-table-column prop="accountName" label="科目名称" width="180"></el-table-column>
        <el-table-column prop="debitAmount" label="借方金额" width="150">
          <template #default="scope">
            <span class="text-success" v-if="scope.row.debitAmount > 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span class="text-danger" v-else-if="scope.row.debitAmount < 0">{{ scope.row.debitAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="creditAmount" label="贷方金额" width="150">
          <template #default="scope">
            <span class="text-danger" v-if="scope.row.creditAmount > 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span class="text-success" v-else-if="scope.row.creditAmount < 0">{{ scope.row.creditAmount.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" show-overflow-tooltip></el-table-column>
      </el-table>

      <div class="entry-totals">
        <div class="total-item">
          <span class="label">借方合计：</span>
          <span class="value debit">{{ totalDebit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
        </div>
        <div class="total-item">
          <span class="label">贷方合计：</span>
          <span class="value credit">{{ totalCredit.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY' }) }}</span>
        </div>
      </div>
      </div>
    </AppDialog>

    <!-- 冲销凭证对话框 -->
    <AppDialog
      v-model="reverseDialogVisible"
      title="冲销凭证"
      mode="form"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-descriptions :column="2" border class="reversal-summary" v-if="reversingEntry">
        <el-descriptions-item label="原凭证">{{ reversingEntry.entryNumber }}</el-descriptions-item>
        <el-descriptions-item label="原期间">{{ reversingEntry.periodName }}</el-descriptions-item>
        <el-descriptions-item label="原日期">{{ reversingEntry.entryDate }}</el-descriptions-item>
        <el-descriptions-item label="原金额">{{ formatCurrency(reversingEntry.totalDebit) }}</el-descriptions-item>
      </el-descriptions>

      <el-form :model="reversalForm" label-width="100px" class="reversal-form">
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
        <el-button @click="reverseDialogVisible = false">取消</el-button>
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
import { handleTableRowView } from '@/utils/tableRowView'
// Vue核心和路由
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { formatDate } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/format'
import { useRoute } from 'vue-router';

// Element Plus
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Printer, Check, RefreshLeft, Delete } from '@element-plus/icons-vue';

// Pinia Stores
import { useFinanceStore } from '@/stores/finance';
import { storeToRefs } from 'pinia';

// 项目工具和API
import { financeApi } from '@/api';
import printService from '@/services/printService'
import EntryFormDialog from './entries/EntryFormDialog.vue'

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
const pageSize = ref(10);
const currentPage = ref(1);

// 凭证列表
const entriesList = ref([]);

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
  if (!currentEntry.value?.id) {
    ElMessage.warning('凭证数据未就绪');
    return;
  }

  try {
    const entry = currentEntry.value
    const html = await printService.generateByDefaultTemplate('finance', 'gl_voucher', {
      entry_number: entry.entryNumber || entry.technicalId || '',
      document_no: entry.entryNumber || entry.technicalId || '',
      entry_date: entry.entryDate || '',
      posting_date: entry.postingDate || '',
      document_type: entry.documentType || '',
      document_number: entry.documentNumber || '',
      period_name: entry.periodName || '',
      status: entry.isPosted ? '已过账' : '未过账',
      description: entry.description || '',
      total_debit: formatCurrency(totalDebit.value),
      total_credit: formatCurrency(totalCredit.value),
      created_by: entry.createdBy || '',
      print_time: new Date().toLocaleString(),
      items: currentEntryItems.value.map((item, index) => ({
        index: index + 1,
        account_code: item.accountCode || '',
        account_name: item.accountName || '',
        description: item.description || '',
        debit_amount: item.debitAmount ? formatCurrency(item.debitAmount) : '-',
        credit_amount: item.creditAmount ? formatCurrency(item.creditAmount) : '-'
      }))
    })
    printService.previewDocument(html)
    ElMessage.success('打印预览已打开')
  } catch (error) {
    console.error('打印凭证失败:', error)
    ElMessage.error('打印凭证失败')
  }
};

// 计算借贷方合计
const totalDebit = computed(() => {
  return currentEntryItems.value.reduce((sum, item) => sum + (item.debitAmount || 0), 0);
});

const totalCredit = computed(() => {
  return currentEntryItems.value.reduce((sum, item) => sum + (item.creditAmount || 0), 0);
});

// 会计期间列表
const periods = ref([]);

const toLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPeriodStart = (period) => (period?.startDate || period?.startDate || '').slice(0, 10);
const getPeriodEnd = (period) => (period?.endDate || period?.endDate || '').slice(0, 10);

const isClosedPeriod = (period) => {
  const closed = period?.isClosed ?? period?.is_closed;
  return closed === true || closed === 1 || closed === '1';
};

const isDateInPeriod = (date, period) => {
  const start = getPeriodStart(period);
  const end = getPeriodEnd(period);
  return Boolean(date && start && end && date >= start && date <= end);
};

const openPeriods = computed(() => periods.value.filter(period => !isClosedPeriod(period)));

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
    && !reversalPeriodMismatch.value
    && !reverseSubmitting.value
  );
});

const findOpenPeriodByDate = (date) => {
  return openPeriods.value.find(period => isDateInPeriod(date, period)) || null;
};

const formatPeriodLabel = (period) => {
  const name = period.periodName || `期间 ${period.id}`;
  return `${name} (${getPeriodStart(period)} 至 ${getPeriodEnd(period)})`;
};

const getApiErrorMessage = (error, fallback) => {
  return error?.response?.data?.message || error?.message || fallback;
};

const toBooleanFlag = (value) => value === true || value === 1 || value === '1';

const isReversedEntry = (entry) => {
  return toBooleanFlag(entry.isReversed)
    || toBooleanFlag(entry.isReversed)
    || entry.status === 'reversed'
    || Boolean(entry.reversal_entry_id);
};

const isReversalEntry = (entry) => {
  return toBooleanFlag(entry.is_reversal_entry)
    || toBooleanFlag(entry.isReversalEntry)
    || Boolean(entry.reversal_of_entry_id)
    || Boolean(entry.reversalOfEntryId);
};

const canReverseEntry = (entry) => {
  return toBooleanFlag(entry.isPosted)
    && !isReversedEntry(entry)
    && !isReversalEntry(entry);
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
  production_cost_transfer: '生产成本结转',
  inventory_reclass: '库存重分类',
};

// API 已 camel（toGlEntryApi）
const normalizeEntryRow = (entry) => ({
  id: entry.id,
  entryNumber: entry.entryNumber
    || (entry.voucherWord && entry.voucherNumber
      ? `${entry.voucherWord}-${entry.voucherNumber}`
      : entry.technicalId),
  technicalId: entry.technicalId || entry.entryNumber,
  entryDate: formatDate(entry.entryDate),
  postingDate: formatDate(entry.postingDate),
  documentType: DOCUMENT_TYPE_LABELS[entry.documentType] || entry.documentType,
  documentNumber: entry.documentNumber,
  periodId: entry.periodId,
  periodName: entry.periodName || `期间 ${entry.periodId}`,
  fiscalYear: entry.fiscalYear,
  isPosted: toBooleanFlag(entry.isPosted),
  isReversed: isReversedEntry(entry),
  isReversalEntry: isReversalEntry(entry),
  reversalOfEntryId: entry.reversalOfEntryId,
  createdBy: entry.creatorName || entry.createdBy,
  description: entry.description || '-',
  totalDebit: entry.totalDebit ?? 0,
  totalCredit: entry.totalCredit ?? 0
});

// 加载凭证列表
const loadEntries = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value
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
    // 根据后端返回的实际数据结构调整
    if (response.data.entries && Array.isArray(response.data.entries)) {
      // 提取基本数据
      entriesList.value = response.data.entries.map(normalizeEntryRow);

      // 设置分页信息
      if (response.data.pagination) {
        total.value = response.data.pagination.total;
      } else {
        total.value = entriesList.value.length;
      }


      // 使用后端返回的统计数据（真实总量）
      calculateStatistics(response.data.statistics);
      await openRouteEntryDetail();
    } else {
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
    loading.value = false;
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

// 查看凭证详情
const viewEntry = async (row) => {
  try {
    const response = await financeApi.getEntryItems(row.id);
    currentEntry.value = row;
    // 确保获取到的数据能正确映射到前端需要的属性
    if (Array.isArray(response.data)) {
      currentEntryItems.value = response.data;
    } else {
      console.error('获取到的凭证明细数据格式不正确:', response.data);
      currentEntryItems.value = [];
      ElMessage.warning('获取到的凭证明细数据格式不正确');
    }
    detailDialogVisible.value = true;
  } catch (error) {
    console.error('加载凭证明细失败:', error);
    ElMessage.error('加载凭证明细失败');
  }
};

const openRouteEntryDetail = async () => {
  const entryId = route.query.entryId;
  if (!entryId || openedRouteEntryId.value === String(entryId)) return;

  try {
    let entry = entriesList.value.find(item => String(item.id) === String(entryId));
    if (!entry) {
      const response = await financeApi.getEntry(entryId);
      entry = normalizeEntryRow(response.data);
    }
    openedRouteEntryId.value = String(entryId);
    await viewEntry(entry);
  } catch (error) {
    console.error('打开路由指定凭证失败:', error);
  }
};

// 过账凭证
const postEntry = (row) => {
  ElMessageBox.confirm('确认要过账该凭证吗？过账后将无法修改或删除。', '确认过账', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await financeApi.postEntry(row.id);
      ElMessage.success('过账成功');
      loadEntries();
    } catch (error) {
      console.error('过账凭证失败:', error);
      ElMessage.error('过账凭证失败');
    }
  }).catch(() => {});
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
  try {
    if (!canReverseEntry(row)) {
      ElMessage.warning(row.isReversalEntry ? '冲销凭证不能再次冲销' : '该凭证当前状态不允许冲销');
      return;
    }
    if (periods.value.length === 0) {
      await loadPeriods();
    }
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
const deleteEntry = (row) => {
  ElMessageBox.confirm('确认要删除该凭证吗？此操作不可逆。', '警告', {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await financeApi.deleteEntry(row.id);
      ElMessage.success('删除成功');
      loadEntries();
    } catch (error) {
      console.error('删除凭证失败:', error);
      ElMessage.error('删除凭证失败');
    }
  }).catch(() => {});
};

// 处理展开行事件，加载凭证明细
const handleExpandChange = async (row, expandedRows) => {
  // 如果行被展开，且还没有加载过明细数据
  if (expandedRows.includes(row) && !row.items) {
    try {
      const response = await financeApi.getEntryItems(row.id);
      if (Array.isArray(response.data)) {
        // 为当前行添加明细数据
        row.items = response.data;

        // 计算并添加展开行的借贷方合计
        row.expandedTotalDebit = response.data.reduce((sum, item) => sum + (item.debitAmount || 0), 0);
        row.expandedTotalCredit = response.data.reduce((sum, item) => sum + (item.creditAmount || 0), 0);
      } else {
        console.error('获取到的凭证明细数据格式不正确:', response.data);
        row.items = [];
        ElMessage.warning('获取到的凭证明细数据格式不正确');
      }
    } catch (error) {
      console.error(`加载凭证${row.id}明细失败:`, error);
      row.items = [];
      ElMessage.error(`加载凭证明细失败: ${error.message}`);
    }
  }
};

// 加载会计期间列表
const loadPeriods = async () => {
  try {
    const response = await financeApi.periods.getList();
    if (Array.isArray(response.data)) {
      periods.value = response.data.map(period => ({
        id: period.id,
        periodName: period.period_name,
        period_name: period.period_name,
        fiscalYear: period.fiscal_year,
        startDate: period.startDate,
        start_date: period.startDate,
        endDate: period.endDate,
        end_date: period.endDate,
        isClosed: period.is_closed,
        is_closed: period.is_closed
      }));
    } else if (response.data.periods) {
      periods.value = response.data.periods.map(period => ({
        id: period.id,
        periodName: period.period_name,
        period_name: period.period_name,
        fiscalYear: period.fiscal_year,
        startDate: period.startDate,
        start_date: period.startDate,
        endDate: period.endDate,
        end_date: period.endDate,
        isClosed: period.is_closed,
        is_closed: period.is_closed
      }));
    }
  } catch (error) {
    console.error('加载会计期间失败:', error);
    ElMessage.error('加载会计期间失败');
  }
};

// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
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

.entry-detail-header {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: var(--spacing-lg);
}

.detail-item {
  margin-right: 30px;
  margin-bottom: 10px;
}

.entry-description {
  margin-bottom: var(--spacing-lg);
}

.entry-totals {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-lg);
}

.total-item {
  margin-left: 30px;
}

.debit {
  color: var(--color-success);
  font-weight: bold;
}

.credit {
  color: var(--color-danger);
  font-weight: bold;
}

.label {
  font-weight: bold;
  margin-right: 8px;
}

/* 展开行样式 */
.expanded-row {
  padding: 20px;
  background-color: var(--color-bg-hover);
}

.expanded-row-header {
  display: flex;
  align-items: center;
  margin-bottom: 15px;
}

.expanded-row-header h4 {
  margin: 0;
  margin-right: 20px;
  color: var(--color-primary);
}

.expanded-row-description {
  color: var(--color-text-regular);
  font-style: italic;
}

.inner-table {
  margin-bottom: 15px;
  box-shadow: 0 1px 3px color-mix(in srgb, var(--ds-black) 10%, transparent);
}

.expanded-row-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 15px;
  border-top: 1px dashed var(--color-border-base);
}

.expanded-row-footer .total-item {
  margin-left: 30px;
}

.expanded-row-footer .total-item .label {
  font-size: 14px;
}

.expanded-row-footer .total-item .value {
  font-size: 16px;
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

.reversal-form {
  margin-top: 8px;
}

/* 打印区域样式 */
.print-area {
  padding: 10px;
}

@media print {
  .print-area {
    padding: 0;
  }
}
</style>
