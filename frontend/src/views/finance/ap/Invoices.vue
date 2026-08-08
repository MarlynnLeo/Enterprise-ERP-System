<!--
/**
 * Invoices.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page invoices-container">
    <PageHeader title="应付发票" subtitle="请在会计凭证页选择采购订单手工生成；本页手工录入仅用于期初或例外">
      <template #actions>
<el-button
          type="info"
          plain
          :icon="Plus"
          @click="showAddDialog"
          v-permission="'finance:ap:create'"
        >
          期初/例外录入
        </el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :expanded="showAdvancedSearch"
      :loading="loading"
      @update:expanded="showAdvancedSearch = $event"
      @search="searchInvoices"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="发票编号">
          <el-input v-model="searchForm.invoiceNumber" placeholder="系统编号"></el-input>
        </el-form-item>
        <el-form-item label="供应商发票号">
          <el-input
            v-model="searchForm.supplierInvoiceNumber"
            placeholder="供应商发票号"
          ></el-input>
        </el-form-item>
        <el-form-item label="供应商">
          <el-input
            v-model="searchForm.supplierName"
            placeholder="输入供应商名称"
            clearable
          ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="开票日期">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="选择状态" clearable>
            <el-option label="草稿" value="草稿"></el-option>
            <el-option label="已确认" value="已确认"></el-option>
            <el-option label="部分付款" value="部分付款"></el-option>
            <el-option label="已付款" value="已付款"></el-option>
            <el-option label="已逾期" value="已逾期"></el-option>
            <el-option label="已取消" value="已取消"></el-option>
          </el-select>
        </el-form-item>
      </template>
    </FinanceQueryCard>

<!-- 表格区域 -->
    <el-card class="data-card">
      <el-table :data="invoiceList" class="w-full" border v-loading="loading">
        <template #empty>
          <EmptyState description="暂无发票数据" />
        </template>
        <el-table-column prop="invoiceNumber" label="系统编号" width="140" fixed="left">
          <template #default="{ row }">
            <el-link
              v-if="row.relatedOrderId || row.relatedOrderNo"
              type="primary"
              :underline="false"
              @click="openRelatedPurchaseOrderDialog(row)"
              :title="row.relatedOrderNo ? `查看采购订单 ${row.relatedOrderNo}` : '查看关联采购订单'"
            >
              {{ row.invoiceNumber }}
            </el-link>
            <span v-else>{{ row.invoiceNumber }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="supplierInvoiceNumber" label="供应商发票号" width="200"></el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="180"></el-table-column>
        <el-table-column prop="invoiceDate" label="开票日期" width="110"></el-table-column>
        <el-table-column prop="dueDate" label="到期日期" width="110"></el-table-column>
        <el-table-column prop="totalAmount" label="价税合计" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="amountExcludingTax" label="未税" width="110">
          <template #default="scope">
            {{ formatCurrency(scope.row.amountExcludingTax) }}
          </template>
        </el-table-column>
        <el-table-column prop="taxAmount" label="税额" width="100">
          <template #default="scope">
            {{ formatCurrency(scope.row.taxAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="paidAmount" label="已付金额" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.paidAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="balanceAmount" label="剩余金额" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.balanceAmount) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row)">
              {{ getStatusText(scope.row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="340" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === '草稿'"
              type="primary"
              size="small"
              @click="handleEdit(scope.row)"
              v-permission="'finance:ap:update'"
            >
              编辑
            </el-button>
            <el-button
              v-if="scope.row.status === '草稿'"
              type="success"
              size="small"
              @click="handleStatusChange(scope.row, '已确认')"
              v-permission="'finance:ap:update'"
            >
              确认
            </el-button>
            <el-button
              v-if="
                scope.row.status === '草稿' ||
                (['已确认', '已逾期'].includes(scope.row.status) &&
                  Math.abs(Number(scope.row.paidAmount || 0)) < 0.005)
              "
              type="warning"
              size="small"
              @click="handleStatusChange(scope.row, '已取消')"
              v-permission="'finance:ap:update'"
            >
              取消
            </el-button>
            <el-button
              v-if="
                ['已确认', '部分付款', '已逾期'].includes(scope.row.status) &&
                (scope.row.balanceAmount ?? 0) > 0
              "
              v-permission="'finance:ap:pay'"
              type="success"
              size="small"
              @click="handleRecordPayment(scope.row)"
            >
              付款
            </el-button>
            <el-button class="btn-op-view" type="primary" size="small" @click="handleViewDetails(scope.row)"
              >查看</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="pagination?.pageSizeOptions || [10, 20, 50, 100]"
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

    <!-- 添加/编辑对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      mode="form"
      width="700px"
    >
      <el-form :model="invoiceForm" :rules="invoiceRules" ref="invoiceFormRef" label-width="110px">
        <!-- 第一行：系统编号 + 供应商发票号 -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="系统编号" prop="invoiceNumber">
              <el-input v-model="invoiceForm.invoiceNumber" placeholder="系统自动生成" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供应商发票号" prop="supplierInvoiceNumber">
              <el-input
                v-model="invoiceForm.supplierInvoiceNumber"
                placeholder="请输入供应商发票号"
              />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 第二行：供应商 -->
        <el-row :gutter="20">
          <el-col :span="24">
            <el-form-item label="供应商" prop="supplierId">
              <el-select
                v-model="invoiceForm.supplierId"
                placeholder="请选择供应商"
                filterable
                class="w-full"
              >
                <el-option
                  v-for="supplier in supplierOptions"
                  :key="supplier.id"
                  :label="supplier.name"
                  :value="supplier.id"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 第三行：开票日期 + 到期日期 -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="开票日期" prop="invoiceDate">
              <el-date-picker
                v-model="invoiceForm.invoiceDate"
                type="date"
                placeholder="选择开票日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                class="w-full"
                @change="handleInvoiceDateChange"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="到期日期" prop="dueDate">
              <el-date-picker
                v-model="invoiceForm.dueDate"
                type="date"
                placeholder="选择到期日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                class="w-full"
              ></el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <!-- 第四行：付款期限 -->
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="付款期限">
              <el-select
                v-model="paymentTerms"
                placeholder="选择付款期限"
                class="w-full"
                @change="handlePaymentTermsChange"
              >
                <el-option
                  v-for="term in paymentTermOptions"
                  :key="term"
                  :label="term === 0 ? '即时付款' : `${term}天`"
                  :value="term"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 发票明细项 -->
        <div class="invoice-items">
          <h3 class="section-title-sm">发票明细</h3>
          <div class="details-table-container">
            <el-table :data="invoiceForm.items" border size="small" class="w-full">
              <el-table-column label="物料/服务" width="140">
                <template #default="scope">
                  <el-select
                    v-model="scope.row.materialId"
                    placeholder="请输入物料名称/编码搜索"
                    filterable
                    remote
                    :remote-method="debouncedSearchMaterials"
                    :loading="loadingMaterials"
                    size="small"
                    class="w-full"
                    @change="() => handleMaterialChange(scope.row)"
                  >
                    <el-option
                      v-for="material in materialOptions"
                      :key="material.id"
                      :label="material.name"
                      :value="material.id"
                    ></el-option>
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="描述" width="120">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.description"
                    placeholder="描述"
                    size="small"
                  ></el-input>
                </template>
              </el-table-column>
              <el-table-column label="数量" width="80">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.quantity"
                    placeholder="数量"
                    size="small"
                    @input="calculateItemAmount(scope.row)"
                  ></el-input>
                </template>
              </el-table-column>
              <el-table-column label="单价" width="100">
                <template #default="scope">
                  <el-input
                    v-model="scope.row.unitPrice"
                    placeholder="单价"
                    size="small"
                    @input="calculateItemAmount(scope.row)"
                  ></el-input>
                </template>
              </el-table-column>
              <el-table-column label="金额" width="100">
                <template #default="scope">
                  {{ formatCurrency(scope.row.amount) }}
                </template>
              </el-table-column>
              <el-table-column label="操作" min-width="60" :resizable="false" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
                <template #default="scope">
                  <el-button
                    type="danger"
                    size="small"
                    link
                    @click="removeInvoiceItem(scope.$index)"
                    v-permission="'finance:ap:update'"
                    class="py-4"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
          <div class="add-item mt-10">
            <el-button
              v-permission="'finance:ap:create'"
              type="primary"
              size="small"
              @click="addInvoiceItem"
              >添加明细项</el-button
            >
          </div>
        </div>

        <!-- 税率和总计 -->
        <div class="invoice-total invoice-total-box">
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="税率" label-width="60px">
                <el-select
                  v-model="invoiceForm.taxRate"
                  placeholder="税率"
                  size="small"
                  class="w-full"
                >
                  <el-option
                    v-for="rate in vatRateOptions"
                    :key="rate"
                    :label="financeStore.formatTaxRate(rate)"
                    :value="rate"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="16">
              <div class="flex-col pt-4">
                <div class="flex-between text-md">
                  <span>小计：</span>
                  <span>{{ formatCurrency(calculateSubtotal()) }}</span>
                </div>
                <div class="flex-between text-md">
                  <span>税额：</span>
                  <span>{{ formatCurrency(calculateTax()) }}</span>
                </div>
                <div class="total-line-primary">
                  <span>总计：</span>
                  <span>{{ formatCurrency(calculateTotal()) }}</span>
                </div>
              </div>
            </el-col>
          </el-row>
        </div>

        <el-form-item label="备注" label-width="60px" class="mt-md">
          <el-input
            v-model="invoiceForm.notes"
            type="textarea"
            :rows="2"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button
            v-permission="invoiceForm.id ? 'finance:ap:update' : 'finance:ap:create'"
            type="primary"
            @click="saveInvoice"
            :loading="saveLoading"
            >确认</el-button
          >
        </span>
      </template>
        </AppDialog>

    <!-- 记录付款对话框 -->
    <AppDialog
      v-model="paymentDialogVisible"
      title="记录付款"
      mode="form"
      width="600px"
    >
      <el-form :model="paymentForm" :rules="paymentRules" ref="paymentFormRef" label-width="100px">
        <el-form-item label="发票编号">
          <el-input v-model="paymentForm.invoiceNumber" disabled></el-input>
        </el-form-item>
        <el-form-item label="供应商名称">
          <el-input v-model="paymentForm.supplierName" disabled></el-input>
        </el-form-item>
        <el-form-item label="发票金额">
          <el-input v-model="paymentForm.invoiceAmount" disabled></el-input>
        </el-form-item>
        <el-form-item label="已付金额">
          <el-input v-model="paymentForm.paidAmount" disabled></el-input>
        </el-form-item>
        <el-form-item label="剩余金额">
          <el-input v-model="paymentForm.balance" disabled></el-input>
        </el-form-item>
        <el-form-item label="付款日期" prop="paymentDate">
          <el-date-picker
            v-model="paymentForm.paymentDate"
            type="date"
            placeholder="选择付款日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            class="w-full"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="付款金额" prop="amount">
          <el-input-number
            v-model="paymentForm.amount"
            :precision="2"
            :min="0"
            :max="paymentForm.balanceValue"
            class="w-full"
          ></el-input-number>
        </el-form-item>
        <el-form-item label="付款方式" prop="paymentMethod">
          <el-select
            v-model="paymentForm.paymentMethod"
            placeholder="请选择付款方式"
            class="w-full"
          >
            <el-option label="现金" value="cash"></el-option>
            <el-option label="银行转账" value="bank_transfer"></el-option>
            <el-option label="支票" value="check"></el-option>
            <el-option label="信用卡" value="credit_card"></el-option>
            <el-option label="其他" value="other"></el-option>
          </el-select>
        </el-form-item>
        <el-form-item
          label="银行账户"
          prop="bankAccountId"
          v-if="['bank_transfer', 'credit_card', 'check'].includes(paymentForm.paymentMethod)"
        >
          <el-select
            v-model="paymentForm.bankAccountId"
            placeholder="请选择银行账户"
            class="w-full"
            filterable
            :loading="bankAccountsLoading"
          >
            <el-option
              v-for="account in bankAccounts"
              :key="account.id"
              :label="`${account.bankName} - ${account.accountName}`"
              :value="account.id"
            >
              <div class="flex-between">
                <span>{{ account.bankName }} - {{ account.accountName }}</span>
                <span class="text-muted text-md">{{
                  formatCurrency(account.balance)
                }}</span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="备注" prop="notes">
          <el-input
            v-model="paymentForm.notes"
            type="textarea"
            :rows="3"
            placeholder="请输入备注信息"
          ></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="paymentDialogVisible = false">取消</el-button>
          <el-button
            v-permission="'finance:ap:pay'"
            type="primary"
            @click="savePayment"
            :loading="savePaymentLoading"
            >确认</el-button
          >
        </span>
      </template>
        </AppDialog>

    <!-- 发票明细查看对话框 -->
    <AppDialog
      v-model="detailsDialogVisible"
      title="发票详情查看"
      mode="view"
      content-width="wide"
    >
      <div v-loading="detailsLoading">
        <!-- 基本信息 -->
        <el-descriptions :column="2" border>
          <el-descriptions-item label="系统编号">{{
            invoiceDetail.invoiceNumber
          }}</el-descriptions-item>
          <el-descriptions-item label="供应商发票号">{{
            invoiceDetail.supplierInvoiceNumber
          }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{
            invoiceDetail.supplierName
          }}</el-descriptions-item>
          <el-descriptions-item label="开票日期">{{
            invoiceDetail.invoiceDate
          }}</el-descriptions-item>
          <el-descriptions-item label="到期日期">{{ invoiceDetail.dueDate }}</el-descriptions-item>
          <el-descriptions-item label="未税金额">{{
            formatCurrency(invoiceDetail.amountExcludingTax)
          }}</el-descriptions-item>
          <el-descriptions-item label="税额">{{
            formatCurrency(invoiceDetail.taxAmount)
          }}</el-descriptions-item>
          <el-descriptions-item label="价税合计">{{
            formatCurrency(invoiceDetail.totalAmount)
          }}</el-descriptions-item>
          <el-descriptions-item label="付款条款">{{
            invoiceDetail.terms || '—'
          }}</el-descriptions-item>
          <el-descriptions-item label="已付金额">{{
            formatCurrency(invoiceDetail.paidAmount)
          }}</el-descriptions-item>
          <el-descriptions-item label="剩余金额">{{
            formatCurrency(invoiceDetail.balanceAmount)
          }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(invoiceDetail)">{{ getStatusText(invoiceDetail) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{
            invoiceDetail.createdAt
          }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{
            invoiceDetail.notes || '无'
          }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="center">发票明细项</el-divider>

        <el-table
          v-if="(invoiceDetail.items || []).length"
          :data="invoiceDetail.items || []"
          border
          class="w-full"
        >
          <el-table-column prop="materialName" label="物料/服务" min-width="150" show-overflow-tooltip />
          <el-table-column prop="description" label="描述" min-width="160" show-overflow-tooltip />
          <el-table-column prop="quantity" label="数量" width="100" />
          <el-table-column prop="unitPrice" label="单价" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.unitPrice) }}
            </template>
          </el-table-column>
          <el-table-column prop="amount" label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.amount) }}
            </template>
          </el-table-column>
        </el-table>
        <EmptyState v-else description="暂无明细项" ::image-size="72" />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailsDialogVisible = false">关闭</el-button>
          <el-button
            type="primary"
            @click="handleRecordPayment(invoiceDetail)"
            v-if="
              ['已确认', '部分付款', '已逾期'].includes(invoiceDetail.status) &&
              invoiceDetail.balanceAmount > 0
            "
            v-permission="'finance:ap:pay'"
            >记录付款</el-button
          >
          <el-button v-permission="'finance:ap:view'" type="primary" @click="printInvoiceDetail"
            >打印</el-button
          >
        </span>
      </template>
    </AppDialog>

    <!-- 关联采购订单预览（与发票详情同一 AppDialog 风格） -->
    <RelatedOrderDialog
      v-model="relatedOrderDialogVisible"
      kind="purchase"
      :loading="relatedOrderLoading"
      :invoice-number="relatedOrderContext.invoiceNumber"
      :partner-name="relatedOrderContext.supplierName"
      :related-order-id="relatedOrderContext.relatedOrderId"
      :related-order-no="relatedOrderContext.relatedOrderNo"
      :order="relatedOrderDetail"
      @jump="jumpToRelatedPurchaseOrder"
    />
  </div>
</template>
<script setup>
import { parsePaginatedData, parseListData, parseResponseData } from '@/utils/responseParser';
import { searchMaterials, mapMaterialData, SEARCH_CONFIG } from '@/utils/searchConfig';
import { formatCurrency, formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { baseDataApi, purchaseApi } from '@/api';
import { financeApi } from '@/api/finance';
import { useFinanceStore } from '@/stores/finance';
import { storeToRefs } from 'pinia';
import printService from '@/services/printService';
import RelatedOrderDialog from '../components/RelatedOrderDialog.vue';
const router = useRouter();
const financeStore = useFinanceStore();

const relatedOrderDialogVisible = ref(false);
const relatedOrderLoading = ref(false);
const relatedOrderDetail = ref(null);
const relatedOrderContext = reactive({
  invoiceNumber: '',
  supplierName: '',
  relatedOrderId: null,
  relatedOrderNo: '',
});

/** 点击发票编号 → 弹窗展示关联采购订单 */
const openRelatedPurchaseOrderDialog = async (row) => {
  if (!row?.relatedOrderId && !row?.relatedOrderNo) {
    ElMessage.warning('该发票未关联采购订单');
    return;
  }
  relatedOrderContext.invoiceNumber = row.invoiceNumber || '';
  relatedOrderContext.supplierName = row.supplierName || '';
  relatedOrderContext.relatedOrderId = row.relatedOrderId || null;
  relatedOrderContext.relatedOrderNo = row.relatedOrderNo || '';
  relatedOrderDetail.value = null;
  relatedOrderDialogVisible.value = true;
  relatedOrderLoading.value = true;
  try {
    let orderId = row.relatedOrderId;
    if (!orderId && row.relatedOrderNo) {
      const listRes = await purchaseApi.getOrders({
        keyword: row.relatedOrderNo,
        page: 1,
        pageSize: 5,
      });
      const list = parseListData(listRes, { enableLog: false }) || [];
      const hit =
        list.find((o) => String(o.orderNo || '') === String(row.relatedOrderNo)) || list[0];
      orderId = hit?.id;
      if (hit?.orderNo) relatedOrderContext.relatedOrderNo = hit.orderNo;
      if (hit?.id) relatedOrderContext.relatedOrderId = hit.id;
    }
    if (!orderId) {
      ElMessage.warning('未找到对应采购订单详情');
      return;
    }
    const res = await purchaseApi.getOrder(orderId);
    relatedOrderDetail.value = parseResponseData(res, null) || res?.data || null;
    if (relatedOrderDetail.value?.id) {
      relatedOrderContext.relatedOrderId = relatedOrderDetail.value.id;
    }
    if (relatedOrderDetail.value?.orderNo) {
      relatedOrderContext.relatedOrderNo = relatedOrderDetail.value.orderNo;
    }
  } catch (error) {
    console.error('加载关联采购订单失败:', error);
    ElMessage.error(error?.response?.data?.message || error.message || '加载采购订单失败');
  } finally {
    relatedOrderLoading.value = false;
  }
};

/** 对话框底部：跳转采购订单列表并筛选 */
const jumpToRelatedPurchaseOrder = () => {
  if (!relatedOrderContext.relatedOrderId && !relatedOrderContext.relatedOrderNo) {
    ElMessage.warning('无关联采购订单可跳转');
    return;
  }
  relatedOrderDialogVisible.value = false;
  router.push({
    path: '/purchase/orders',
    query: {
      ...(relatedOrderContext.relatedOrderId
        ? { orderId: String(relatedOrderContext.relatedOrderId) }
        : {}),
      ...(relatedOrderContext.relatedOrderNo
        ? { orderNo: String(relatedOrderContext.relatedOrderNo) }
        : {}),
    },
  });
};
const { vatRateOptions, defaultVATRate, paymentTermOptions, defaultPaymentTermDays, pagination } =
  storeToRefs(financeStore);
// 高级搜索展开状态
const showAdvancedSearch = ref(false);
// 数据加载状态
const loading = ref(false);
const saveLoading = ref(false);
const savePaymentLoading = ref(false);
const detailsLoading = ref(false);
const bankAccountsLoading = ref(false);
// 分页相关
const total = ref(0);
const pageSize = ref(10);
const currentPage = ref(1);
const loadingMaterials = ref(false);
let searchTimeout = null;
let currentSearchId = 0;
// 表单相关
const dialogVisible = ref(false);
const dialogTitle = ref('期初/例外录入采购发票');
const invoiceFormRef = ref(null);
const paymentDialogVisible = ref(false);
const paymentFormRef = ref(null);
const detailsDialogVisible = ref(false);
// 数据列表
const invoiceList = ref([]);
const supplierOptions = ref([]);
const materialOptions = ref([]);
const bankAccounts = ref([]);
const invoiceDetail = ref({});
// 搜索表单
const searchForm = reactive({
  invoiceNumber: '',
  supplierInvoiceNumber: '',
  supplierName: '',
  dateRange: [],
  status: '',
});
// 发票表单
const invoiceForm = reactive({
  id: null,
  invoiceNumber: '',
  supplierInvoiceNumber: '',
  supplierId: null,
  invoiceDate: formatLocalDate(new Date()),
  dueDate: '',
  items: [],
  notes: '',
  taxRate: defaultVATRate.value, // 使用动态配置的默认税率
  status: '草稿',
});
// 付款期限
const paymentTerms = ref(defaultPaymentTermDays.value || 30); // 默认付款期限
// 付款表单
const paymentForm = reactive({
  invoiceId: null,
  invoiceNumber: '',
  supplierName: '',
  invoiceAmount: '',
  paidAmount: '',
  balance: '',
  balanceValue: 0,
  paymentDate: formatLocalDate(new Date()),
  amount: 0,
  paymentMethod: 'bank_transfer',
  bankAccountId: null,
  notes: '',
});
// 表单验证规则
const invoiceRules = {
  invoiceNumber: [{ required: false, message: '系统自动生成', trigger: 'blur' }],
  supplierInvoiceNumber: [{ required: true, message: '请输入供应商发票号', trigger: 'blur' }],
  supplierId: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  invoiceDate: [{ required: true, message: '请选择开票日期', trigger: 'change' }],
  dueDate: [{ required: true, message: '请选择到期日期', trigger: 'change' }],
};
const paymentRules = {
  paymentDate: [{ required: true, message: '请选择付款日期', trigger: 'change' }],
  amount: [{ required: true, message: '请输入付款金额', trigger: 'blur' }],
  paymentMethod: [{ required: true, message: '请选择付款方式', trigger: 'change' }],
  bankAccountId: [
    {
      required: true,
      message: '请选择银行账户',
      trigger: 'change',
      validator: (rule, value, callback) => {
        if (
          ['bank_transfer', 'credit_card', 'check'].includes(paymentForm.paymentMethod) &&
          !value
        ) {
          callback(new Error('请选择银行账户'));
        } else {
          callback();
        }
      },
    },
  ],
};
// 获取状态类型
const getStatusType = (invoice) => {
  const statusMap = {
    草稿: 'info',
    已确认: 'primary',
    部分付款: 'warning',
    已付款: 'success',
    已逾期: 'danger',
    已取消: 'info',
  };
  return statusMap[invoice.status] || 'info';
};
// 获取状态文本
const getStatusText = (invoice) => {
  // 直接使用数据库状态字段
  return invoice.status || '草稿';
};
// 处理物料选择变化
const handleMaterialChange = (item) => {
  // 根据选择的物料自动填充描述和单价
  const selectedMaterial = materialOptions.value.find((m) => m.id === item.materialId);
  if (selectedMaterial) {
    item.description = selectedMaterial.name;
    item.unitPrice = selectedMaterial.price || 0;
    calculateItemAmount(item);
  }
};
// 计算单项金额（整数化精度控制，避免浮点误差）
const calculateItemAmount = (item) => {
  const quantity = parseFloat(item.quantity) || 0;
  const unitPrice = parseFloat(item.unitPrice) || 0;
  item.amount = Math.round(quantity * unitPrice * 100) / 100;
};
// 计算小计（整数化累加，避免多行累计误差放大）
const calculateSubtotal = () => {
  const totalCents = invoiceForm.items.reduce(
    (sum, item) => sum + Math.round((item.amount || 0) * 100),
    0
  );
  return totalCents / 100;
};
// 计算税额
const calculateTax = () => {
  return Math.round(calculateSubtotal() * invoiceForm.taxRate * 100) / 100;
};
// 计算总计
const calculateTotal = () => {
  return Math.round((calculateSubtotal() + calculateTax()) * 100) / 100;
};
// 处理开票日期变化
const handleInvoiceDateChange = (date) => {
  if (date && paymentTerms.value) {
    const invoiceDate = new Date(date);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + paymentTerms.value);
    invoiceForm.dueDate = formatLocalDate(dueDate);
  }
};
// 处理付款期限变化
const handlePaymentTermsChange = (days) => {
  if (invoiceForm.invoiceDate && days !== null) {
    const invoiceDate = new Date(invoiceForm.invoiceDate);
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + days);
    invoiceForm.dueDate = formatLocalDate(dueDate);
  }
};
// 自动生成发票编号
// 添加发票明细项
const addInvoiceItem = () => {
  invoiceForm.items.push({
    materialId: null,
    description: '',
    quantity: 1,
    unitPrice: 0,
    amount: 0,
  });
};
// 移除发票明细项
const removeInvoiceItem = (index) => {
  invoiceForm.items.splice(index, 1);
};
// 加载发票列表
const loadInvoices = async () => {
  loading.value = true;
  try {
    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      invoiceNumber: searchForm.invoiceNumber,
      supplierName: searchForm.supplierName,
      startDate: searchForm.dateRange?.[0] || '',
      endDate: searchForm.dateRange?.[1] || '',
      status: searchForm.status,
    };

    const response = await financeApi.getAPInvoices(params);
    const { list, total: totalCount } = parsePaginatedData(response);
    invoiceList.value = list;
    total.value = totalCount;
  } catch {
    ElMessage.error('加载发票列表失败');

    // 出错时使用空数据
    invoiceList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};
// 加载供应商选项
const loadSupplierOptions = async () => {
  try {
    const response = await baseDataApi.getSuppliers({ pageSize: 50 });
    const suppliers = parseListData(response, { enableLog: false });
    if (suppliers.length > 0) {
      supplierOptions.value = suppliers.map((supplier) => ({
        id: parseInt(supplier.id),
        name: supplier.name || supplier.supplierName || '未命名供应商',
      }));
    } else {
      supplierOptions.value = [];
    }
  } catch (error) {
    console.error('加载供应商选项失败:', error);
    ElMessage.error('加载供应商选项失败');
    supplierOptions.value = [];
  }
};
// 加载物料选项 (只加载初始展示的选项)
const loadMaterialOptions = async () => {
  debouncedSearchMaterials('');
};
// 异步搜索物料
const debouncedSearchMaterials = (query) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  const searchId = ++currentSearchId;

  searchTimeout = setTimeout(async () => {
    loadingMaterials.value = true;
    try {
      const results = await searchMaterials(baseDataApi, query, {
        pageSize: 50, // Invoices 通常也只需要前50项来展示
      });

      if (searchId === currentSearchId) {
        materialOptions.value = mapMaterialData(results);
      }
    } catch (error) {
      console.error('获取物料数据失败:', error);
      if (searchId === currentSearchId) {
        materialOptions.value = [];
      }
    } finally {
      if (searchId === currentSearchId) {
        loadingMaterials.value = false;
      }
    }
  }, SEARCH_CONFIG.debounceTime);
};
// 加载银行账户选项
const loadBankAccounts = async () => {
  bankAccountsLoading.value = true;
  try {
    const response = await financeApi.getBankAccounts();
    // 使用统一解析器
    if (response.data) {
      const data = parseListData(response, { enableLog: false });
      bankAccounts.value = data.map((account) => ({
        id: account.id,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        bankName: account.bankName,
        balance: parseFloat(account.currentBalance || 0),
      }));
    } else {
      bankAccounts.value = [];
    }
  } catch {
    bankAccounts.value = [];
  } finally {
    bankAccountsLoading.value = false;
  }
};
// 搜索发票
const searchInvoices = () => {
  currentPage.value = 1;
  loadInvoices();
};
// 重置搜索条件
const resetSearch = () => {
  searchForm.invoiceNumber = '';
  searchForm.supplierName = '';
  searchForm.dateRange = [];
  searchForm.status = '';
  searchInvoices();
};
// 新增发票
const showAddDialog = () => {
  dialogTitle.value = '期初/例外录入采购发票';
  resetInvoiceForm();
  // 添加默认一个明细项
  addInvoiceItem();
  dialogVisible.value = true;
};
const handleStatusChange = async (row, status) => {
  const actionText = status === '已确认' ? '确认' : '取消';
  const isCancelConfirmed =
    status === '已取消' && ['已确认', '已逾期'].includes(row.status);
  const confirmMsg = isCancelConfirmed
    ? `确定取消已确认发票 ${row.invoiceNumber} 吗？将冲销关联会计凭证并释放来源单据，未付款发票才可取消。`
    : `确定要${actionText}发票 ${row.invoiceNumber} 吗？`;
  try {
    await ElMessageBox.confirm(confirmMsg, `${actionText}发票`, {
      type: status === '已确认' ? 'success' : 'warning',
    });
    await financeApi.updateAPInvoiceStatus(row.id, { status });
    ElMessage.success(
      isCancelConfirmed
        ? '发票已取消，关联凭证已冲销'
        : `发票已${status === '已确认' ? '确认' : '取消'}`
    );
    loadInvoices();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error.response?.data?.message || error.message || '状态更新失败');
  }
};
// 编辑发票
const handleEdit = async (row) => {
  dialogTitle.value = '编辑采购发票';

  try {
    // 确保供应商选项已加载（编辑前必须加载，否则 el-select 无法匹配显示名称）
    if (supplierOptions.value.length === 0) {
      await loadSupplierOptions();
    }

    const response = await financeApi.getAPInvoice(row.id);
    const invoice = response.data;

    resetInvoiceForm();

    // 填充表单数据
    invoiceForm.id = invoice.id;
    invoiceForm.invoiceNumber = invoice.invoiceNumber;
    invoiceForm.supplierInvoiceNumber = invoice.supplierInvoiceNumber;
    // 确保 supplierId 类型与 supplierOptions 中的 id 类型一致（统一为整数）
    invoiceForm.supplierId = invoice.supplierId != null ? parseInt(invoice.supplierId) : null;
    invoiceForm.invoiceDate = invoice.invoiceDate;
    invoiceForm.dueDate = invoice.dueDate;
    invoiceForm.notes = invoice.notes;
    // 填充明细项
    invoiceForm.items = invoice.items || [];

    if (invoice.taxRate != null) {
      invoiceForm.taxRate = invoice.taxRate;
    } else if (invoice.totalAmount != null && invoiceForm.items.length > 0) {
      const subtotal = invoiceForm.items.reduce(
        (sum, item) => sum + (parseFloat(item.amount) || 0),
        0
      );
      if (subtotal > 0 && invoice.totalAmount >= subtotal) {
        const impliedTaxRate = (parseFloat(invoice.totalAmount) - subtotal) / subtotal;
        invoiceForm.taxRate = Math.round(impliedTaxRate * 100) / 100;
      } else {
        invoiceForm.taxRate = defaultVATRate.value;
      }
    } else {
      invoiceForm.taxRate = defaultVATRate.value;
    }

    dialogVisible.value = true;
  } catch {
    ElMessage.error('获取发票详情失败');
  }
};
// 查看明细
const handleViewDetails = async (row) => {
  detailsLoading.value = true;
  try {
    const response = await financeApi.getAPInvoice(row.id);
    // 拦截器已解包，response.data 就是业务数据
    const invoice = response.data;
    invoiceDetail.value = invoice;
    // 加载相关付款记录
    try {
      const paymentsResponse = await financeApi.getAPInvoicePayments(row.id);
      // 拦截器已解包，response.data 可能是 {data: [...]} 格式，也可能是直接的数组
      invoiceDetail.value.paymentRecords =
        paymentsResponse.data ||
        paymentsResponse.list ||
        (Array.isArray(paymentsResponse) ? paymentsResponse : []);
    } catch {
      invoiceDetail.value.paymentRecords = [];
    }
    detailsDialogVisible.value = true;
  } catch {
    ElMessage.error('获取发票详情失败');
  } finally {
    detailsLoading.value = false;
  }
};
// 打印发票详情 - 使用打印模板系统
const printInvoiceDetail = async () => {
  try {
    const items = (invoiceDetail.value.items || []).map((item, index) => ({
      index: index + 1,
      material_code: item.materialCode || '',
      material_name: item.materialName || item.description || '',
      specification: item.specification || item.specs || '',
      quantity: item.quantity?.toString() || '0',
      unit_price: formatCurrency(item.unitPrice ?? item.unitPrice),
      tax_amount: formatCurrency(item.taxAmount),
      amount: formatCurrency(item.amount),
    }));
    const visibleAmounts = (invoiceDetail.value.items || []).every(
      (item) => item.amount !== null && item.amount !== undefined && item.amount !== ''
    );
    const subtotal = visibleAmounts
      ? (invoiceDetail.value.items || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)
      : null;
    const taxAmount = invoiceDetail.value.taxAmount;

    const html = await printService.generateByDefaultTemplate('finance', 'ap_invoice', {
      invoice_number: invoiceDetail.value.invoiceNumber || '-',
      order_no: invoiceDetail.value.orderNumber || invoiceDetail.value.relatedOrderNo || '',
      supplier_name: invoiceDetail.value.supplierName || '-',
      invoice_date: invoiceDetail.value.invoiceDate || '-',
      due_date: invoiceDetail.value.dueDate || '-',
      status: getStatusText(invoiceDetail.value),
      subtotal: formatCurrency(invoiceDetail.value.subtotal ?? subtotal),
      tax_amount: formatCurrency(taxAmount),
      total_amount: formatCurrency(invoiceDetail.value.totalAmount),
      paid_amount: formatCurrency(invoiceDetail.value.paidAmount),
      balance_amount: formatCurrency(invoiceDetail.value.balanceAmount),
      notes: invoiceDetail.value.notes || '无',
      print_time: new Date().toLocaleString(),
      items,
    });

    printService.previewDocument(html);
  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error('打印失败');
  }
};
// 记录付款
const handleRecordPayment = (row) => {
  // 直接使用服务端已计算的余额字段，避免前端浮点减法与DB值不一致
  const balance = parseFloat(row.balanceAmount) || 0;

  // 填充付款表单
  paymentForm.invoiceId = row.id;
  paymentForm.invoiceNumber = row.invoiceNumber;
  paymentForm.supplierName = row.supplierName;
  paymentForm.invoiceAmount = formatCurrency(row.totalAmount);
  paymentForm.paidAmount = formatCurrency(row.paidAmount);
  paymentForm.balance = formatCurrency(balance);
  paymentForm.balanceValue = balance;
  paymentForm.amount = balance; // 默认填充剩余金额
  paymentForm.paymentMethod = 'bank_transfer'; // 默认为银行转账
  paymentForm.bankAccountId = null; // 清空银行账户选择

  // 确保有银行账户选项可选
  if (bankAccounts.value.length === 0) {
    loadBankAccounts();
  }

  paymentDialogVisible.value = true;
};
// 保存发票
const saveInvoice = async () => {
  if (!invoiceFormRef.value) return;

  // 至少有一个明细项
  if (invoiceForm.items.length === 0) {
    ElMessage.warning('请至少添加一个发票明细项');
    return;
  }

  // 每个明细项都需要填写完整
  for (const item of invoiceForm.items) {
    if (!item.materialId || item.quantity <= 0 || item.unitPrice <= 0) {
      ElMessage.warning('请确保所有明细项的物料、数量和单价都已填写完整');
      return;
    }
  }

  await invoiceFormRef.value.validate(async (valid) => {
    if (valid) {
      saveLoading.value = true;
      try {
        // 准备提交的数据
        const data = {
          ...invoiceForm,
          amount: calculateTotal(), // 设置总金额
        };

        if (invoiceForm.id) {
          // 更新
          await financeApi.updateAPInvoice(invoiceForm.id, data);
          ElMessage.success('更新成功');
        } else {
          // 新增
          await financeApi.createAPInvoice(data);
          ElMessage.success('添加成功');
        }

        dialogVisible.value = false;
        loadInvoices();
      } catch (error) {
        ElMessage.error('保存发票失败: ' + (error.response?.data?.details || error.message));
      } finally {
        saveLoading.value = false;
      }
    }
  });
};
// 保存付款记录
const savePayment = async () => {
  if (!paymentFormRef.value) return;

  // 银行转账必须关联银行账户
  if (
    ['bank_transfer', 'credit_card', 'check'].includes(paymentForm.paymentMethod) &&
    !paymentForm.bankAccountId
  ) {
    ElMessage.warning('请选择银行账户');
    return;
  }

  await paymentFormRef.value.validate(async (valid) => {
    if (valid) {
      savePaymentLoading.value = true;
      try {
        // 准备提交的数据
        const data = {
          invoiceId: paymentForm.invoiceId,
          paymentDate: paymentForm.paymentDate,
          amount: paymentForm.amount,
          paymentMethod: paymentForm.paymentMethod,
          bankAccountId: paymentForm.bankAccountId,
          notes: paymentForm.notes,
        };

        const response = await financeApi.createPayment(data);
        ElMessage.success('付款记录已保存');

        // 拦截器已解包，response.data 就是业务数据
        if (response.data?.details) {
          ElMessage({
            message: `付款单号: ${response.data.details.paymentNumber}, 金额: ${formatCurrency(response.data.details.amount)}`,
            type: 'success',
            duration: 3000,
          });
        }

        paymentDialogVisible.value = false;
        loadInvoices();

        // 如果是从详情对话框发起的付款，刷新详情
        if (detailsDialogVisible.value && invoiceDetail.value.id === paymentForm.invoiceId) {
          handleViewDetails({ id: invoiceDetail.value.id });
        }
      } catch (error) {
        ElMessage.error('保存付款记录失败: ' + (error.response?.data?.error || error.message));
      } finally {
        savePaymentLoading.value = false;
      }
    }
  });
};
// 重置发票表单
const resetInvoiceForm = () => {
  invoiceForm.id = null;
  invoiceForm.invoiceNumber = '';
  invoiceForm.supplierId = null;
  invoiceForm.invoiceDate = formatLocalDate(new Date());
  invoiceForm.dueDate = '';
  invoiceForm.items = [];
  invoiceForm.notes = '';
  invoiceForm.taxRate = defaultVATRate.value;
  invoiceForm.status = '草稿';
  paymentTerms.value = defaultPaymentTermDays.value || 30;
  // 自动计算到期日期
  handlePaymentTermsChange(paymentTerms.value);
  // 清除校验
  if (invoiceFormRef.value) {
    invoiceFormRef.value.resetFields();
  }
};
// 分页相关方法
const handleSizeChange = (size) => {
  pageSize.value = size;
  loadInvoices();
};
const handleCurrentChange = (page) => {
  currentPage.value = page;
  loadInvoices();
};
// 页面加载时执行
onMounted(() => {
  loadInvoices();
  loadSupplierOptions();
  loadMaterialOptions();
  loadBankAccounts();
  financeStore.loadSettings(); // 加载税率配置
});
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
.invoice-items {
  margin-bottom: var(--spacing-lg);
}
.invoice-items h3 {
  margin-bottom: 10px;
}
.details-table-container {
  min-width: 650px;
}
.add-item {
  margin-top: 10px;
  display: flex;
  justify-content: center;
}
.invoice-total {
  margin: 20px 0;
}
.total-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  padding: 5px 20px;
}
.total-amount {
  font-weight: bold;
  font-size: 16px;
  border-top: 1px solid var(--color-border-lighter);
  padding-top: 10px;
}
/* 表单内明细表格 */
.invoice-items .details-table-container {
  width: 100%;
  overflow-x: auto;
}
/* 移除操作列右侧空白 */
.invoice-items :deep(.el-table__body-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
}
.invoice-items :deep(.el-table__header-wrapper .el-table__cell:last-child) {
  padding-right: 8px;
}
</style>
