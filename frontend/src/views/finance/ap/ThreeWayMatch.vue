<!--
  采购三单匹配（PO – 收货 – 发票）MVP
-->
<template>
  <div class="module-page three-way-match-page">
    <PageHeader
      title="三单匹配"
      subtitle="采购订单 / 入库收货 / 供应商发票数量与金额核对（容差内可确认）"
    >
      <template #actions>
        <el-button type="primary" :loading="creating" @click="openCreate">从入库单创建</el-button>
        <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      </template>
    </PageHeader>

    <FinanceQueryCard :loading="loading" @search="loadList" @reset="resetFilter">
      <template #basic>
        <el-form-item label="状态">
          <el-select v-model="filter.status" clearable placeholder="全部">
            <el-option label="草稿/已匹配" value="matched" />
            <el-option label="差异" value="variance" />
            <el-option label="已确认" value="confirmed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <el-card class="data-card" shadow="never">
      <el-table :data="list" border v-loading="loading" class="w-full">
        <template #empty>
          <EmptyState description="暂无匹配单" />
        </template>
        <el-table-column prop="matchNo" label="匹配单号" min-width="140" />
        <el-table-column prop="receiptNo" label="入库单号" min-width="140" />
        <el-table-column prop="supplierName" label="供应商" min-width="140" />
        <el-table-column prop="receiptAmount" label="收货金额" width="120" align="right">
          <template #default="{ row }">{{ formatCurrency(row.receiptAmount) }}</template>
        </el-table-column>
        <el-table-column prop="invoiceAmount" label="发票金额" width="120" align="right">
          <template #default="{ row }">{{ formatCurrency(row.invoiceAmount) }}</template>
        </el-table-column>
        <el-table-column prop="amountVariance" label="金额差异" width="110" align="right">
          <template #default="{ row }">
            <span :class="{ 'text-danger': Math.abs(row.amountVariance) > 0.01 }">
              {{ formatCurrency(row.amountVariance) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="380" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button size="small" type="primary" v-permission="'finance:ap:view'" @click="openDetail(row)">
                <el-icon><View /></el-icon> 明细
              </el-button>
              <el-button
                v-if="['matched', 'variance', 'draft'].includes(row.status)"
                size="small"
                type="warning"
                v-permission="'finance:ap:update'"
                @click="openEdit(row)"
              >
                <el-icon><Edit /></el-icon> 调发票
              </el-button>
              <el-button
                v-if="row.status === 'matched' || row.status === 'variance'"
                size="small"
                type="success"
                :loading="confirmingId === row.id"
                v-permission="'finance:ap:update'"
                @click="confirm(row)"
              >
                <el-icon><Check /></el-icon> 确认匹配
              </el-button>
              <el-button
                v-if="['matched', 'variance', 'confirmed', 'draft'].includes(row.status)"
                size="small"
                type="danger"
                v-permission="'finance:ap:update'"
                @click="cancelMatch(row)"
              >
                <el-icon><Close /></el-icon> 取消
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadList"
        />
      </div>
    </el-card>

    <AppDialog
      v-model="createVisible"
      title="从入库单创建三单匹配"
      mode="form"
      width="560px"
    >
      <el-form label-width="110px">
        <el-form-item label="入库单" required>
          <el-select
            v-model="createForm.receiptId"
            filterable
            remote
            clearable
            :remote-method="searchReceipts"
            :loading="receiptLoading"
            placeholder="搜索入库单号 / 供应商"
            class="w-full"
          >
            <el-option
              v-for="r in receiptOptions"
              :key="r.id"
              :label="`${r.receiptNo} · ${r.supplierName || ''} · ¥${r.totalAmount ?? r.totalAmount ?? 0}`"
              :value="r.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="供应商票号">
          <el-input v-model="createForm.supplierInvoiceNumber" placeholder="可选，便于对账" />
        </el-form-item>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="匹配逻辑"
          description="按物料汇总：PO 量价、收货合格量/价、发票量价（默认等于收货）。容差内可确认；开启「强制三单匹配」后须确认才能确认应付发票。"
        />
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreate">创建</el-button>
      </template>
        </AppDialog>

    <AppDialog
      v-model="detailVisible"
      title="匹配明细"
      mode="view"
      content-width="wide"
    >
      <el-descriptions v-if="detail" :column="3" border class="mb-md">
        <el-descriptions-item label="匹配单号">{{ detail.matchNo }}</el-descriptions-item>
        <el-descriptions-item label="入库单">{{ detail.receiptNo }}</el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detail.supplierName }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ statusLabel(detail.status) }}</el-descriptions-item>
        <el-descriptions-item label="结果">{{ detail.matchResult }}</el-descriptions-item>
        <el-descriptions-item label="金额差异">
          {{ formatCurrency(detail.amountVariance) }}
        </el-descriptions-item>
      </el-descriptions>
      <el-table v-if="detail" :data="editMode ? editLines : detail.items || []" border size="small">
        <el-table-column prop="materialCode" label="物料" width="120" />
        <el-table-column prop="materialName" label="名称" min-width="120" />
        <el-table-column prop="poQty" label="PO数量" width="80" />
        <el-table-column prop="receiptQty" label="收货数量" width="80" />
        <el-table-column label="发票数量" width="110">
          <template #default="{ row }">
            <el-input-number
              v-if="editMode"
              v-model="row.invoiceQty"
              :min="0"
              :precision="4"
              :controls="false"
              class="w-full"
              size="small"
            />
            <span v-else>{{ row.invoiceQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="发票单价" width="110">
          <template #default="{ row }">
            <el-input-number
              v-if="editMode"
              v-model="row.invoicePrice"
              :min="0"
              :precision="6"
              :controls="false"
              class="w-full"
              size="small"
            />
            <span v-else>{{ row.invoicePrice }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="qtyVariance" label="数量差" width="80" />
        <el-table-column prop="amountVariance" label="金额差" width="100">
          <template #default="{ row }">{{ formatCurrency(row.amountVariance) }}</template>
        </el-table-column>
        <el-table-column label="容差内" width="80">
          <template #default="{ row }">
            <el-tag :type="row.withinTolerance ? 'success' : 'danger'" size="small">
              {{ row.withinTolerance ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button v-if="editMode" type="primary" :loading="savingLines" @click="saveLines">
          保存发票量价
        </el-button>
      </template>
        </AppDialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { ElMessageBox } from 'element-plus/es/components/message-box/index'
import { Refresh, View, Edit, Check, Close } from '@element-plus/icons-vue'
import { financeApi } from '@/api/finance'
import { purchaseApi } from '@/api/purchase'
import { formatCurrency } from '@/utils/format'
import { parsePaginatedData, parseListData } from '@/utils/responseParser'

const loading = ref(false)
const creating = ref(false)
const confirmingId = ref(null)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filter = reactive({ status: '' })
const createVisible = ref(false)
const createForm = reactive({ receiptId: null, supplierInvoiceNumber: '' })
const detailVisible = ref(false)
const detail = ref(null)
const editMode = ref(false)
const editLines = ref([])
const savingLines = ref(false)
const receiptOptions = ref([])
const receiptLoading = ref(false)

function statusLabel(s) {
  return (
    {
      draft: '草稿',
      matched: '已匹配',
      variance: '有差异',
      confirmed: '已确认',
      cancelled: '已取消',
    }[s] || s
  )
}
function statusType(s) {
  return (
    {
      matched: 'success',
      variance: 'danger',
      confirmed: 'primary',
      cancelled: 'info',
    }[s] || 'info'
  )
}

async function loadList() {
  loading.value = true
  try {
    const res = await financeApi.listThreeWayMatches({
      page: page.value,
      pageSize: pageSize.value,
      status: filter.status || undefined,
    })
    const parsed = parsePaginatedData(res, { enableLog: false })
    list.value = parsed.list
    total.value = parsed.total
  } catch (e) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

function resetFilter() {
  filter.status = ''
  page.value = 1
  loadList()
}

async function searchReceipts(keyword = '') {
  receiptLoading.value = true
  try {
    const res = await purchaseApi.getReceipts({
      page: 1,
      pageSize: 30,
      status: 'completed',
      keyword: keyword || undefined,
    })
    const { list: rows } = parsePaginatedData(res, { enableLog: false })
    receiptOptions.value = rows.length ? rows : parseListData(res, { enableLog: false })
  } catch {
    receiptOptions.value = []
  } finally {
    receiptLoading.value = false
  }
}

function openCreate() {
  createForm.receiptId = null
  createForm.supplierInvoiceNumber = ''
  createVisible.value = true
  searchReceipts('')
}

async function doCreate() {
  const id = parseInt(createForm.receiptId, 10)
  if (!id) {
    ElMessage.warning('请选择入库单')
    return
  }
  creating.value = true
  try {
    await financeApi.createThreeWayMatchFromReceipt(id, {
      supplierInvoiceNumber: createForm.supplierInvoiceNumber || undefined,
    })
    ElMessage.success('匹配单已创建')
    createVisible.value = false
    loadList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '创建失败')
  } finally {
    creating.value = false
  }
}

async function openDetail(row) {
  try {
    editMode.value = false
    const res = await financeApi.getThreeWayMatch(row.id)
    detail.value = res?.data || res
    detailVisible.value = true
  } catch (e) {
    ElMessage.error(e.message || '加载明细失败')
  }
}

async function openEdit(row) {
  try {
    const res = await financeApi.getThreeWayMatch(row.id)
    detail.value = res?.data || res
    editLines.value = (detail.value.items || []).map((it) => ({
      id: it.id,
      material_id: it.materialId,
      material_code: it.materialCode,
      material_name: it.materialName,
      po_qty: it.po_qty,
      receipt_qty: it.receipt_qty,
      invoice_qty: Number(it.invoice_qty),
      invoice_price: Number(it.invoice_price),
      qty_variance: it.qty_variance,
      amount_variance: it.amount_variance,
      within_tolerance: it.within_tolerance,
    }))
    editMode.value = true
    detailVisible.value = true
  } catch (e) {
    ElMessage.error(e.message || '加载明细失败')
  }
}

async function saveLines() {
  if (!detail.value?.id) return
  savingLines.value = true
  try {
    const res = await financeApi.updateThreeWayMatchLines(detail.value.id, {
      lines: editLines.value.map((l) => ({
        id: l.id,
        material_id: l.materialId,
        invoice_qty: l.invoice_qty,
        invoice_price: l.invoice_price,
      })),
    })
    detail.value = res?.data || res
    editMode.value = false
    ElMessage.success('发票量价已更新，容差已重算')
    loadList()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || e.message || '保存失败')
  } finally {
    savingLines.value = false
  }
}

async function confirm(row) {
  try {
    let forceVariance = false
    if (row.status === 'variance') {
      await ElMessageBox.confirm(
        `匹配单 ${row.matchNo} 存在超容差差异，是否强制确认？强制后可用于应付确认。`,
        '强制确认',
        { type: 'warning', confirmButtonText: '强制确认', cancelButtonText: '取消' }
      )
      forceVariance = true
    } else {
      await ElMessageBox.confirm(
        `确认匹配单 ${row.matchNo}？确认后可用于应付发票确认。`,
        '确认',
        { type: 'warning' }
      )
    }
    confirmingId.value = row.id
    await financeApi.confirmThreeWayMatch(row.id, forceVariance ? { forceVariance: true } : {})
    ElMessage.success('已确认')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || e.message || '确认失败')
  } finally {
    confirmingId.value = null
  }
}

async function cancelMatch(row) {
  try {
    await ElMessageBox.confirm(`取消匹配单 ${row.matchNo}？`, '取消', { type: 'warning' })
    await financeApi.cancelThreeWayMatch(row.id, { reason: '用户取消' })
    ElMessage.success('已取消')
    loadList()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.message || e.message || '取消失败')
  }
}

onMounted(loadList)
</script>

<style scoped>
.text-danger {
  color: var(--el-color-danger);
  font-weight: 600;
}
.mb-md {
  margin-bottom: 12px;
}
</style>
