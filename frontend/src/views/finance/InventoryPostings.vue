<template>
  <div class="module-page inventory-postings-container">
    <PageHeader title="存货过账审核" subtitle="审核业务冻结明细，确认存货成本，追溯原单与冲销记录">
      <template #actions>
        <el-button
          v-if="auth.canApproveInventoryApproval"
          v-permission="'finance:inventory:approve'"
          type="primary"
          :icon="Check"
          :disabled="!selectedRows.length || loading || actionLoading"
          :loading="actionLoading"
          @click="handleBatchApprove"
          >批量审核通过{{ selectedRows.length ? ` (${selectedRows.length})` : '' }}</el-button
        >
        <el-button
          :icon="Download"
          :disabled="loading || !!listError || !postings.length"
          @click="handleExportCsv"
          >导出当前页</el-button
        >
        <el-button
          :icon="Refresh"
          :loading="loading"
          :disabled="actionLoading"
          @click="handleRefresh"
          >刷新数据</el-button
        >
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard :loading="loading" @search="handleSearch" @reset="resetSearch">
      <template #basic>
        <el-form-item label="关键词">
          <el-input
            v-model="keywordQuery"
            placeholder="过账单号 / 来源业务单号"
            clearable
            :disabled="actionLoading"
          />
        </el-form-item>
        <el-form-item label="来源业务">
          <el-select
            v-model="sourceTypeFilter"
            placeholder="全部来源业务"
            clearable
            :disabled="actionLoading"
            @change="handleSearch"
          >
            <el-option
              v-for="item in SOURCE_TYPE_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="审核状态">
          <el-select
            v-model="statusFilter"
            placeholder="全部审核状态"
            clearable
            :disabled="actionLoading"
            @change="handleSearch"
          >
            <el-option
              v-for="item in STATUS_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息（系统标准 statistics-row + stat-card） -->
    <div v-loading="loading" class="statistics-row">
      <el-card
        class="stat-card cursor-pointer"
        :class="{ 'is-active': !statusFilter }"
        shadow="hover"
        @click="setStatusFilter('')"
      >
        <div class="stat-value">{{ statistics?.total ?? '-' }}</div>
        <div class="stat-label">全部过账单</div>
      </el-card>
      <el-card
        v-for="item in STATUS_OPTIONS"
        :key="item.value"
        class="stat-card cursor-pointer"
        :class="{ 'is-active': statusFilter === item.value }"
        shadow="hover"
        @click="setStatusFilter(item.value)"
      >
        <div class="stat-value">{{ statistics?.[item.value] ?? '-' }}</div>
        <div class="stat-label">{{ item.label }}</div>
      </el-card>
    </div>

    <el-alert
      v-if="batchFailures.length"
      title="以下过账单未审核成功，请核实原因后重试"
      type="warning"
      show-icon
      class="mb-md"
      @close="batchFailures = []"
    >
      <ul class="failure-list">
        <li v-for="failure in batchFailures" :key="failure.id">
          {{ failure.postingNo }}：{{ failure.error }}
        </li>
      </ul>
    </el-alert>
    <el-alert
      v-if="listError"
      title="列表加载失败，显示内容可能已过期，请刷新后操作。"
      type="error"
      :closable="false"
      class="mb-md"
    />

    <el-card class="data-card">
      <div v-if="selectedRows.length" class="batch-bar">
        已选择 {{ selectedRows.length }} 条可审核记录
        <el-button
          size="small"
          type="primary"
          link
          :disabled="actionLoading"
          @click="clearSelection"
          >取消选择</el-button
        >
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="postings"
        row-key="id"
        border
        class="table-row-click w-full"
        @selection-change="selectedRows = $event"
        @row-click="(row, column, event) => handleTableRowView(row, column, event, () => openDetail(row))"
      >
        <template #empty>
          <EmptyState description="暂无存货过账数据" />
        </template>
        <el-table-column
          v-if="auth.canApproveInventoryApproval"
          type="selection"
          width="48"
          align="center"
          :selectable="isRowSelectable"
        />
        <el-table-column prop="postingNo" label="过账单号" min-width="190" show-overflow-tooltip
          ><template #default="{ row }"
            ><span class="font-medium">{{ row.postingNo }}</span
            ><el-tag v-if="row.postingKind === 'reversal'" type="danger" size="small" class="ml-xs"
              >冲销</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column label="来源业务" width="130"
          ><template #default="{ row }">{{
            sourceTypeLabel(row.sourceType)
          }}</template></el-table-column
        >
        <el-table-column label="来源单据号" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button
              v-if="hasSourcePage(row) && row.sourceNo"
              type="primary"
              link
              :disabled="actionLoading"
              class="source-link-button"
              @click.stop="navigateToSource(row)"
            >
              {{ row.sourceNo }}
            </el-button>
            <span v-else>{{ row.sourceNo || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="流转方向" width="85" align="center"
          ><template #default="{ row }">{{
            directionLabel(row.movementDirection)
          }}</template></el-table-column
        >
        <el-table-column prop="lineCount" label="明细行" width="75" align="center" />
        <el-table-column label="过账金额合计(元)" min-width="145" align="right"
          ><template #default="{ row }">{{
            formatAmount(row.totalValue)
          }}</template></el-table-column
        >
        <el-table-column label="业务完成人/时间" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="row.businessApprovedBy || row.businessApprovedAt">
              <span>{{ row.businessApprovedBy || '-' }}</span>
              <span v-if="row.businessApprovedAt" class="text-secondary ml-xs">{{
                formatDate(row.businessApprovedAt)
              }}</span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="财务审核状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.financeStatus)">{{
              statusLabel(row.financeStatus)
            }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最后审核人/时间" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="lastReview(row).label || lastReview(row).time">
              <span>{{ lastReview(row).label || '-' }}</span>
              <span v-if="lastReview(row).time" class="text-secondary ml-xs">{{
                formatDate(lastReview(row).time)
              }}</span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          min-width="150"
          fixed="right"
          align="left"
          header-align="left"
          class-name="operation-column"
          header-class-name="operation-column-header"
        >
          <template #default="{ row }">
            <TableRowActions>
              <template v-if="row.financeStatus === 'pending' && auth.canApproveInventoryApproval">
                <el-button
                  v-permission="'finance:inventory:approve'"
                  size="small"
                  type="success"
                  :disabled="!canReview(row) || loading || actionLoading || !!listError"
                  :title="separationReason(row, auth.user)"
                  @click.stop="handleReview(row, 'approve')"
                >
                  <el-icon><Check /></el-icon> 通过
                </el-button>
                <el-button
                  v-permission="'finance:inventory:approve'"
                  size="small"
                  type="danger"
                  :disabled="!canReview(row) || loading || actionLoading || !!listError"
                  :title="separationReason(row, auth.user)"
                  @click.stop="handleReview(row, 'reject')"
                >
                  <el-icon><Close /></el-icon> 驳回
                </el-button>
              </template>
              <el-button
                v-if="canReverse(row)"
                v-permission="'finance:inventory:reverse'"
                size="small"
                type="warning"
                :disabled="loading || actionLoading || !!listError"
                @click.stop="handleReview(row, 'reverse')"
              >
                <el-icon><RefreshLeft /></el-icon> 申请反审核
              </el-button>
            </TableRowActions>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-container">
        <el-pagination
          :current-page="pagination.current"
          :page-size="pagination.pageSize"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :total="pagination.total"
          :disabled="actionLoading"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
    <AppDialog
      v-model="detailVisible"
      title="存货过账详情"
      mode="view"
      width="1200px"
      content-width="wide"
    >
      <div v-loading="detailLoading" class="min-h-form">
        <template v-if="currentDetail">
          <el-descriptions :column="2" border class="mb-md">
            <el-descriptions-item label="过账单号">{{
              currentDetail.postingNo
            }}</el-descriptions-item>
            <el-descriptions-item label="过账类型">{{
              currentDetail.postingKind === 'reversal' ? '冲销申请' : '正常过账'
            }}</el-descriptions-item>
            <el-descriptions-item label="来源业务">{{
              sourceTypeLabel(currentDetail.sourceType)
            }}</el-descriptions-item>
            <el-descriptions-item label="来源单据号">
              <el-button
                v-if="sourceTarget(currentDetail) && currentDetail.sourceNo"
                type="primary"
                link
                :disabled="actionLoading"
                class="source-link-button"
                @click="navigateToSource(currentDetail)"
              >
                {{ currentDetail.sourceNo }}
              </el-button>
              <span v-else>{{ currentDetail.sourceNo || '-' }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="财务审核状态"
              ><el-tag :type="statusTag(currentDetail.financeStatus)">{{
                statusLabel(currentDetail.financeStatus)
              }}</el-tag></el-descriptions-item
            >
            <el-descriptions-item label="流转方向">{{
              directionLabel(currentDetail.movementDirection)
            }}</el-descriptions-item>
            <el-descriptions-item label="业务日期">{{
              currentDetail.transactionDate
                ? String(currentDetail.transactionDate).slice(0, 10)
                : '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="过账金额合计(元)">{{
              formatAmount(currentDetail.totalValue)
            }}</el-descriptions-item>
            <el-descriptions-item label="业务完成人">{{
              currentDetail.businessApprovedBy || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="业务完成时间">{{
              currentDetail.businessApprovedAt
                ? formatDateTime(currentDetail.businessApprovedAt)
                : '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="备注说明" :span="2">{{
              currentDetail.remark || '-'
            }}</el-descriptions-item>
          </el-descriptions>
          <el-alert
            v-if="
              currentDetail.financeStatus === 'approved' &&
              currentDetail.capabilities?.reversalUnavailableReason
            "
            :title="currentDetail.capabilities.reversalUnavailableReason"
            type="warning"
            show-icon
            :closable="false"
            class="mb-md"
          />
          <el-divider>存货流转明细</el-divider>
          <p class="text-secondary font-size-13 mb-sm">
            合计为各明细金额的绝对值之和，调拨包含调出与调入。明细保留正负方向，单价保留六位小数；缺失成本显示“-”。
          </p>
          <el-table :data="currentDetail.lines" border stripe class="w-full mb-md" max-height="360">
            <el-table-column prop="lineNo" label="行号" width="55" align="center" />
            <el-table-column
              prop="materialCode"
              label="物料编码"
              min-width="110"
              show-overflow-tooltip
            >
              <template #default="{ row }">{{ row.materialCode || '-' }}</template>
            </el-table-column>
            <el-table-column
              prop="materialName"
              label="物料名称"
              min-width="130"
              show-overflow-tooltip
            >
              <template #default="{ row }">{{ row.materialName || '-' }}</template>
            </el-table-column>
            <el-table-column
              prop="materialSpecs"
              label="规格"
              min-width="100"
              show-overflow-tooltip
            >
              <template #default="{ row }">{{ row.materialSpecs || '-' }}</template>
            </el-table-column>
            <el-table-column
              prop="batchNumber"
              label="批次号"
              min-width="110"
              show-overflow-tooltip
            />
            <el-table-column label="变动数量" width="95" align="right"
              ><template #default="{ row }">{{
                row.signedQuantity ?? '-'
              }}</template></el-table-column
            >
            <el-table-column prop="unitName" label="单位" width="60" align="center">
              <template #default="{ row }">{{ row.unitName || '-' }}</template>
            </el-table-column>
            <el-table-column label="成本单价(元)" width="115" align="right"
              ><template #default="{ row }">{{
                formatAmount(row.unitCost, 6)
              }}</template></el-table-column
            >
            <el-table-column label="变动金额(元)" width="115" align="right"
              ><template #default="{ row }">{{
                formatAmount(signedMovementValue(row))
              }}</template></el-table-column
            >
            <el-table-column label="库位" min-width="95" show-overflow-tooltip
              ><template #default="{ row }">{{
                row.locationName || row.locationCode || '-'
              }}</template></el-table-column
            >
          </el-table>
          <template v-if="currentDetail.relatedPostings.length"
            ><el-divider>原单与冲销关联</el-divider>
            <div class="related-postings">
              <el-button
                v-for="posting in currentDetail.relatedPostings"
                :key="posting.id"
                type="primary"
                link
                :disabled="actionLoading"
                @click="openDetail(posting)"
                >{{ posting.postingNo }}（{{ statusLabel(posting.financeStatus) }}）</el-button
              >
            </div></template
          >
          <template v-if="currentDetail.events.length"
            ><el-divider>审核流水记录</el-divider
            ><el-timeline
              ><el-timeline-item
                v-for="event in currentDetail.events"
                :key="event.id"
                :type="eventTag(event.eventType)"
                :timestamp="event.createdAt ? formatDateTime(event.createdAt) : ''"
                ><span>{{ eventLabel(event.eventType) }}</span
                ><span v-if="event.actorLabel"> · {{ event.actorLabel }}</span>
                <div v-if="event.remark" class="event-remark">
                  {{ event.remark }}
                </div></el-timeline-item
              ></el-timeline
            ></template
          >
        </template>
      </div>
      <template #footer>
        <div class="dialog-footer-actions">
          <template
            v-if="currentDetail?.financeStatus === 'pending' && auth.canApproveInventoryApproval"
          >
            <el-button
              v-permission="'finance:inventory:approve'"
              type="success"
              :icon="Check"
              :loading="actionLoading"
              :disabled="detailLoading || !canReview(currentDetail)"
              @click="handleReview(currentDetail, 'approve')"
            >
              {{ currentDetail.postingKind === 'reversal' ? '审核通过冲销' : '审核通过' }}
            </el-button>
            <el-button
              v-permission="'finance:inventory:approve'"
              type="danger"
              :icon="Close"
              :loading="actionLoading"
              :disabled="detailLoading || !canReview(currentDetail)"
              @click="handleReview(currentDetail, 'reject')"
            >
              驳回
            </el-button>
          </template>
          <el-button
            v-if="canReverse(currentDetail)"
            v-permission="'finance:inventory:reverse'"
            type="warning"
            :icon="RefreshLeft"
            :loading="actionLoading"
            :disabled="detailLoading"
            @click="handleReview(currentDetail, 'reverse')"
          >
            申请反审核
          </el-button>
          <el-button :disabled="actionLoading" @click="detailVisible = false">关闭</el-button>
        </div>
      </template>
    </AppDialog>
  </div>
</template>

<script setup>
import { onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { Check, Close, Download, Refresh, RefreshLeft } from '@element-plus/icons-vue';
import TableRowActions from '@/components/common/TableRowActions.vue';
import { PAGE_SIZE_OPTIONS } from '@/config/pagination';
import { getThemeDefaultPageSize } from '@/utils/themePageSize';
import { financeApi } from '@/api/finance';
import { useAuthStore } from '@/stores/auth';
import { usePaginatedFetching } from '@/composables/useDataFetching';
import { formatDate, formatDateTime } from '@/utils/helpers/dateUtils';
import { getApiErrorMessage } from '@/utils/errorHandler';
import { handleTableRowView } from '@/utils/tableRowView';
import {
  SOURCE_TYPE_OPTIONS,
  STATUS_OPTIONS,
  normalizePosting,
  sourceTypeLabel,
  statusLabel,
  statusTag,
  directionLabel,
  formatAmount,
  signedMovementValue,
  lastReview,
  separationReason,
  sourceTarget,
  auditCsv,
} from './inventoryPostingModel';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const tableRef = ref(null);
const keywordQuery = ref('');
const sourceTypeFilter = ref('');
const statusFilter = ref('');
const selectedRows = ref([]);
const batchFailures = ref([]);
const detailVisible = ref(false);
const detailLoading = ref(false);
const currentDetail = ref(null);
const actionLoading = ref(false);
let detailGeneration = 0;
let sourceNavigationGeneration = 0;
let viewGeneration = 0;
let active = true;
let disposed = false;

const {
  loading,
  data: postings,
  pagination,
  statistics,
  error: listError,
  fetchData,
} = usePaginatedFetching(
  async (params) => {
    const response = await financeApi.inventoryPostings.list({
      keyword: keywordQuery.value.trim(),
      sourceType: sourceTypeFilter.value,
      financeStatus: statusFilter.value,
      page: params.page,
      pageSize: params.pageSize,
    });
    const data = response.data;
    return { ...data, list: (data.list || []).map(normalizePosting) };
  },
  { pageSize: getThemeDefaultPageSize(20), errorMessage: '获取存货过账列表失败' }
);

const canReview = (row) =>
  Boolean(
    auth.canApproveInventoryApproval &&
    row?.financeStatus === 'pending' &&
    !separationReason(row, auth.user)
  );
const canReverse = (row) =>
  Boolean(
    auth.canReverseInventoryApproval &&
    row?.postingKind === 'movement' &&
    row.financeStatus === 'approved' &&
    Number(row.locked) === 1 &&
    row.capabilities?.reversalSupported &&
    !separationReason(row, auth.user, { reversal: false }) &&
    !row.relatedPostings.some(
      (item) =>
        item.postingKind === 'reversal' && ['pending', 'approved'].includes(item.financeStatus)
    )
  );
const isRowSelectable = (row) =>
  canReview(row) && !loading.value && !actionLoading.value && !listError.value;
function clearSelection() {
  tableRef.value?.clearSelection();
  selectedRows.value = [];
}
async function fetchPostings() {
  clearSelection();
  const result = await fetchData();
  if (
    result &&
    pagination.current > Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
  ) {
    pagination.current = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
    return fetchData();
  }
  return result;
}
function handleRefresh() {
  if (!actionLoading.value) return fetchPostings();
}
function handleSearch() {
  if (actionLoading.value) return;
  pagination.current = 1;
  return fetchPostings();
}
function resetSearch() {
  if (actionLoading.value) return;
  keywordQuery.value = '';
  sourceTypeFilter.value = '';
  statusFilter.value = '';
  return handleSearch();
}
function setStatusFilter(status) {
  if (actionLoading.value) return;
  statusFilter.value = status;
  return handleSearch();
}
function handlePageChange(page) {
  if (actionLoading.value) return;
  pagination.current = page;
  return fetchPostings();
}
function handleSizeChange(size) {
  if (actionLoading.value) return;
  pagination.pageSize = size;
  return handleSearch();
}
const hasSourcePage = (row) =>
  SOURCE_TYPE_OPTIONS.some((item) => item.value === row.sourceType && item.path);
async function navigateToSource(row) {
  if (!active || actionLoading.value) return;
  const generation = ++sourceNavigationGeneration;
  const view = viewGeneration;
  try {
    const posting =
      row.postingKind === 'reversal' && !sourceTarget(row)
        ? normalizePosting((await financeApi.inventoryPostings.get(row.id)).data)
        : row;
    if (disposed || !active || view !== viewGeneration || generation !== sourceNavigationGeneration)
      return;
    const target = sourceTarget(posting);
    if (target) await router.push(target);
    else ElMessage.info('未找到可打开的来源单据，请根据来源单号核对业务记录');
  } catch (error) {
    if (!disposed && active && view === viewGeneration && generation === sourceNavigationGeneration)
      ElMessage.error(getApiErrorMessage(error, '打开来源单据失败'));
  }
}
async function openDetail(row) {
  if (!active || actionLoading.value || !row?.id) return;
  const generation = ++detailGeneration;
  detailVisible.value = true;
  detailLoading.value = true;
  currentDetail.value = null;
  try {
    const response = await financeApi.inventoryPostings.get(row.id);
    if (!disposed && generation === detailGeneration && detailVisible.value)
      currentDetail.value = normalizePosting(response.data);
  } catch (error) {
    if (!disposed && generation === detailGeneration && detailVisible.value) {
      ElMessage.error(getApiErrorMessage(error, '获取存货过账详情失败'));
      detailVisible.value = false;
    }
  } finally {
    if (!disposed && generation === detailGeneration) detailLoading.value = false;
  }
}
watch(detailVisible, (visible) => {
  if (!visible) {
    detailGeneration += 1;
    currentDetail.value = null;
    detailLoading.value = false;
  }
});
const eventLabel = (type) =>
  ({
    business_approved: '业务完成待审',
    finance_approved: '财务审核通过',
    finance_rejected: '财务驳回',
    reversal_requested: '申请反审核',
    finance_reversed: '原过账已冲销',
    resubmitted: '重新提交审核',
    reversal_closure_completed: '下游冲销完成',
  })[type] ||
  type ||
  '审核事件';
const eventTag = (type) =>
  ({
    finance_approved: 'success',
    finance_rejected: 'danger',
    reversal_requested: 'warning',
    finance_reversed: 'info',
  })[type] || 'primary';
const isDismissed = (error) => error === 'cancel' || error === 'close';
const validateRemark = (value) =>
  (String(value || '').trim().length > 0 && String(value).trim().length <= 1000) ||
  '请填写 1 至 1000 字的原因';
async function refreshAfterAction() {
  const result = await fetchPostings();
  if (!result && !disposed) ElMessage.warning('操作已完成，列表刷新失败，请刷新数据核对最新状态');
}
async function handleReview(row, action) {
  if (
    !active ||
    actionLoading.value ||
    detailLoading.value ||
    (action === 'reverse' ? !canReverse(row) : !canReview(row))
  )
    return;
  const target = { ...row };
  const view = viewGeneration;
  actionLoading.value = true;
  try {
    let remark = '';
    if (action === 'approve') {
      await ElMessageBox.confirm(
        target.postingKind === 'reversal'
          ? `确认审核通过冲销申请 ${target.postingNo}？通过后将正式冲销原库存过账并更新相关业务。`
          : `确认审核通过 ${target.postingNo}？通过后将确认存货成本并正式登记库存台账。`,
        '财务审核确认',
        { confirmButtonText: '确定通过', cancelButtonText: '取消', type: 'warning' }
      );
    } else {
      const result = await ElMessageBox.prompt(
        action === 'reverse'
          ? `请输入 ${target.postingNo} 的反审核原因。提交后仍需独立财务审核，原过账暂不冲销。`
          : `请输入驳回 ${target.postingNo} 的原因：`,
        action === 'reverse' ? '申请反审核' : '驳回确认',
        {
          confirmButtonText: '确定提交',
          cancelButtonText: '取消',
          inputType: 'textarea',
          inputValidator: validateRemark,
        }
      );
      remark = String(result.value || '').trim();
      if (validateRemark(remark) !== true) {
        ElMessage.warning('请填写 1 至 1000 字的原因');
        return;
      }
    }
    if (
      disposed || !active || view !== viewGeneration ||
      (action === 'reverse' ? !canReverse(target) : !canReview(target))
    ) return;
    const response = await financeApi.inventoryPostings[action](
      target.id,
      ...(action === 'approve' ? [] : [{ remark }])
    );
    if (disposed) return;
    ElMessage.success(
      response.message ||
        {
          approve: '存货过账审核通过',
          reject: '过账单已驳回',
          reverse: '反审核申请已提交，待独立财务审核',
        }[action]
    );
    if (String(currentDetail.value?.id) === String(target.id)) detailVisible.value = false;
    await refreshAfterAction();
  } catch (error) {
    if (!isDismissed(error) && !disposed)
      ElMessage.error(getApiErrorMessage(error, '审核操作失败'));
  } finally {
    if (!disposed) {
      actionLoading.value = false;
      if (active && view !== viewGeneration) syncRouteQuery();
    }
  }
}
async function handleBatchApprove() {
  if (!active || actionLoading.value || loading.value || listError.value) return;
  const targets = selectedRows.value.filter(canReview).map((row) => ({ ...row }));
  if (!targets.length) return;
  const view = viewGeneration;
  actionLoading.value = true;
  try {
    await ElMessageBox.confirm(
      `确认审核通过所选 ${targets.length} 条过账单？其中 ${targets.filter((row) => row.postingKind === 'reversal').length} 条为冲销申请。每条分别提交，失败项保留待处理状态。`,
      '批量审核确认',
      { type: 'warning', confirmButtonText: '确定通过', cancelButtonText: '取消' }
    );
    if (disposed || !active || view !== viewGeneration || targets.some((row) => !canReview(row))) return;
    const response = await financeApi.inventoryPostings.batchApprove({
      ids: targets.map((row) => row.id),
    });
    if (disposed) return;
    const result = response.data;
    batchFailures.value = result.results
      .filter((item) => !item.success)
      .map((item) => ({
        ...item,
        postingNo: targets.find((row) => String(row.id) === String(item.id))?.postingNo || item.id,
      }));
    const summary = `批量审核完成：成功 ${result.successCount} 条，失败 ${result.failureCount} 条`;
    if (result.failureCount) ElMessage.warning(summary);
    else ElMessage.success(summary);
    await refreshAfterAction();
  } catch (error) {
    if (!isDismissed(error) && !disposed)
      ElMessage.error(getApiErrorMessage(error, '批量审核失败'));
  } finally {
    if (!disposed) {
      actionLoading.value = false;
      if (active && view !== viewGeneration) syncRouteQuery();
    }
  }
}
function handleExportCsv() {
  if (loading.value || listError.value || !postings.value.length) return;
  const url = URL.createObjectURL(
    new Blob([auditCsv(postings.value)], { type: 'text/csv;charset=utf-8;' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `存货过账审核_第${pagination.current}页_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function syncRouteQuery() {
  if (!active || disposed) return;
  const { sourceType, sourceNo, postingId } = route.query;
  keywordQuery.value = typeof sourceNo === 'string' ? sourceNo : '';
  sourceTypeFilter.value = typeof sourceType === 'string' ? sourceType : '';
  statusFilter.value = '';
  void handleSearch();
  if (/^[1-9]\d*$/.test(String(postingId || ''))) void openDetail({ id: postingId });
}
watch(
  () => [route.query.sourceType, route.query.sourceNo, route.query.postingId],
  syncRouteQuery,
  { immediate: true }
);
onBeforeUnmount(() => {
  disposed = true;
  detailGeneration += 1;
});
onActivated(() => {
  const returning = !active;
  active = true;
  if (returning) syncRouteQuery();
});
onDeactivated(() => {
  active = false;
  viewGeneration += 1;
  detailGeneration += 1;
  detailVisible.value = false;
  currentDetail.value = null;
  detailLoading.value = false;
  clearSelection();
});
</script>

<style scoped>
.statistics-row > .stat-card.is-active {
  border-color: var(--el-color-primary) !important;
  outline: 1px solid var(--el-color-primary);
  outline-offset: -1px;
}
.batch-bar,
.related-postings {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.dialog-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.event-remark,
.failure-list {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.source-link-button {
  padding: 0;
  height: auto;
  font-weight: 500;
  vertical-align: baseline;
}
</style>
