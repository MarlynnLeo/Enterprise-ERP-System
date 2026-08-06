<!--
/**
 * SalesExchanges.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page outbound-container">
    <!-- 页面标题 -->
    <PageHeader title="销售换货管理" subtitle="管理销售换货与处理">
      <template #actions>
<el-button v-permission="'sales:exchanges:create'" type="primary" :icon="Plus" @click="handleCreate">新增换货单</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input
            v-model="searchQuery"
            placeholder="物料名称"
            @keyup.enter="handleSearch"
            clearable ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="换货状态">
          <el-select v-model="statusFilter" placeholder="换货状态" clearable @change="handleSearch" class="w-full">
            <el-option
              v-for="item in exchangeStatuses"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="handleSearch"
          />
        </el-form-item>
      </template>
    </FinanceQueryCard>
    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ exchangeStats.total }}</div>
        <div class="stat-label">全部换货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ exchangeStats.pending }}</div>
        <div class="stat-label">待处理</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ exchangeStats.processing }}</div>
        <div class="stat-label">处理中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ exchangeStats.completed }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ exchangeStats.rejected }}</div>
        <div class="stat-label">已拒绝</div>
      </el-card>
    </div>
    <!-- 换货单表格 -->
    <el-card class="data-card">
      <el-table
        :data="exchangeRecords"
        border
        class="w-full"
        v-loading="loading"
        table-layout="fixed"
      >
        <el-table-column prop="exchangeNo" label="换货单号" width="150" fixed />
        <el-table-column prop="orderNo" label="原订单号" width="150" />
        <el-table-column prop="customerName" label="客户名称" min-width="150" />
        <el-table-column prop="exchangeDate" label="换货日期" width="120">
          <template #default="scope">
            {{ formatDate(scope.row.exchangeDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="换货原因" min-width="150" />
        <el-table-column label="退回金额" width="110">
          <template #default="scope">
            <span class="text-success">{{ formatCurrency(scope.row.returnAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="换出金额" width="110">
          <template #default="scope">
            <span class="text-primary">{{ formatCurrency(scope.row.newAmount) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="差价" width="110">
          <template #default="scope">
            <span
              class="font-weight-700"
              :class="scope.row.differenceAmount > 0 ? 'amount-positive' : scope.row.differenceAmount < 0 ? 'amount-negative' : 'amount-zero'"
            >
              {{ formatSignedCurrency(scope.row.differenceAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button class="btn-op-view" type="primary"
              size="small"
              @click="handleView(scope.row)"
            >
              查看
            </el-button>
            <!-- 待处理状态：可以开始处理 -->
            <el-button
              v-if="scope.row.status === '待处理'"
              size="small"
              type="primary"
              v-permission="'sales:exchanges:update'"
              @click="handleProcess(scope.row)"
            >
              开始处理
            </el-button>
            <!-- 处理中状态：可以完成或拒绝 -->
            <template v-if="scope.row.status === '处理中'">
              <el-button
                size="small"
                type="success"
                v-permission="'sales:exchanges:update'"
                @click="handleComplete(scope.row)"
              >
                完成
              </el-button>
              <el-button
                size="small"
                type="danger"
                v-permission="'sales:exchanges:update'"
                @click="handleReject(scope.row)"
              >
                拒绝
              </el-button>
            </template>
            <!-- 已拒绝状态：可以编辑 -->
            <el-button
              v-if="scope.row.status === '已拒绝'"
              size="small"
              @click="handleEdit(scope.row)"

              v-permission="'sales:exchanges:update'">
              编辑
            </el-button>
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
          :total="Math.max(total, 1)"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 创建/编辑换货单对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogTitle"
      mode="form"
      wide
      :before-close="handleDialogClose"
    >
      <div v-loading="dialogLoading">
      <el-form
        ref="exchangeFormRef"
        :model="exchangeForm"
        :rules="exchangeRules"
        label-width="120px"
      >
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="原订单号" prop="orderNo">
              <div class="flex-gap-8 w-full">
                <el-input
                  v-model="exchangeForm.orderNo"
                  placeholder="请选择已完成出库的订单"
                  readonly
                  class="flex-1-min0"
                />
                <el-button type="primary" @click="openOrderDialog" class="flex-shrink-0">选择订单</el-button>
                <span v-if="exchangeForm.customerName" class="is-substitute-sm flex-shrink-0">
                  <el-icon><Check /></el-icon>
                </span>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="客户名称" prop="customerName">
              <el-input v-model="exchangeForm.customerName" readonly />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="换货日期" prop="exchangeDate">
              <el-date-picker
                v-model="exchangeForm.exchangeDate"
                type="date"
                placeholder="选择换货日期"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contactPhone">
              <el-input v-model="exchangeForm.contactPhone" placeholder="请输入联系电话" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20" v-if="selectedOrderInfo">
          <el-col :span="24">
            <el-form-item label="出库信息">
              <el-tag type="success" size="small" class="mr-sm">
                <el-icon><Check /></el-icon> 已完成出库
              </el-tag>
              <span class="text-muted text-sm">
                出库日期：{{ selectedOrderInfo.deliveryDate || '未知' }}
              </span>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="换货原因" prop="reason">
          <el-input
            v-model="exchangeForm.reason"
            placeholder="请输入换货原因"
          />
        </el-form-item>
        <el-form-item label="退回商品">
          <div class="section-label">
            从已出库的商品中选择需要退回的商品
          </div>
          <el-table :data="exchangeForm.returnItems" border class="w-full">
            <el-table-column prop="productCode" label="产品编码" width="120" />
            <el-table-column prop="productName" label="产品名称" min-width="150" />
            <el-table-column prop="specification" label="规格" min-width="120" />
            <el-table-column prop="originalQuantity" label="已出库数量" width="120" />
            <el-table-column prop="returnQuantity" label="退回数量" width="120">
              <template #default="scope">
                <el-input
                  v-model="scope.row.returnQuantity"
                  placeholder="退回数量"
                />
              </template>
            </el-table-column>
            <el-table-column label="单价" width="100">
              <template #default="scope">
                <span class="text-muted">{{ formatCurrency(scope.row.unitPrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="110">
              <template #default="scope">
                <span class="text-success">{{ formatExchangeLineAmount(scope.row.returnQuantity, scope.row.unitPrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="returnReason" label="退回原因" min-width="150">
              <template #default="scope">
                <el-input
                  v-model="scope.row.returnReason"
                  placeholder="退回原因"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="80" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button
                  size="small"
                  type="danger"
                  @click="removeReturnItem(scope.$index)"

                  v-permission="isEdit ? 'sales:exchanges:update' : 'sales:exchanges:create'">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>
        <el-form-item label="换出商品">
          <div class="section-label">
            选择要发给客户的新商品
            <el-button type="primary" size="small" @click="openProductDialog" class="ml-10">
              <el-icon><Plus /></el-icon> 添加商品
            </el-button>
          </div>
          <el-table :data="exchangeForm.newItems" border class="w-full">
            <el-table-column prop="productCode" label="产品编码" width="120" />
            <el-table-column prop="productName" label="产品名称" min-width="150" />
            <el-table-column prop="specification" label="规格" min-width="120" />
            <el-table-column prop="unitName" label="单位" width="80" />
            <el-table-column prop="newQuantity" label="换出数量" width="120">
              <template #default="scope">
                <el-input
                  v-model="scope.row.newQuantity"
                  placeholder="换出数量"
                />
              </template>
            </el-table-column>
            <el-table-column label="单价" width="100">
              <template #default="scope">
                <span class="text-muted">{{ formatCurrency(scope.row.unitPrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="110">
              <template #default="scope">
                <span class="text-primary">{{ formatExchangeLineAmount(scope.row.newQuantity, scope.row.unitPrice) }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="newReason" label="换出说明" min-width="150">
              <template #default="scope">
                <el-input
                  v-model="scope.row.newReason"
                  placeholder="换出说明"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" min-width="80" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
              <template #default="scope">
                <el-button
                  size="small"
                  type="danger"
                  @click="removeNewItem(scope.$index)"

                  v-permission="isEdit ? 'sales:exchanges:update' : 'sales:exchanges:create'">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-form-item>
        <!-- 金额汇总 -->
        <el-form-item label="金额汇总">
          <div class="flex-gap-24">
            <span>退回总价: <span class="text-success font-weight-700">{{ formatCurrency(calcReturnTotal()) }}</span></span>
            <span>换出总价: <span class="text-primary font-weight-700">{{ formatCurrency(calcNewTotal()) }}</span></span>
            <span>差价: <span
              class="font-weight-700 text-lg-bold"
              :class="calcDifference() > 0 ? 'amount-positive' : calcDifference() < 0 ? 'amount-negative' : 'amount-zero'"
            >
              {{ formatSignedCurrency(calcDifference()) }}
            </span></span>
            <el-tag v-if="calcDifference() === 0" type="success" size="small">等值换货</el-tag>
            <el-tag v-else-if="calcDifference() > 0" type="danger" size="small">客户需补差价</el-tag>
            <el-tag v-else type="warning" size="small">需退客户差价</el-tag>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="exchangeForm.remark"
            type="textarea"
            :rows="2"
            placeholder="请输入备注信息"
          />
        </el-form-item>
      </el-form>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="handleDialogClose">取消</el-button>
          <el-button v-permission="isEdit ? 'sales:exchanges:update' : 'sales:exchanges:create'" type="primary" @click="handleSubmit" :loading="submitLoading">保存</el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 查看换货单详情对话框 -->
    <AppDialog
      v-model="detailDialogVisible"
      title="换货单详情"
      mode="view"
      content-width="wide"
    >
      <div v-loading="detailDialogLoading">
      <el-descriptions :column="3" border v-if="currentExchange">
        <el-descriptions-item label="换货单号">{{ currentExchange.exchangeNo || currentExchange.id }}</el-descriptions-item>
        <el-descriptions-item label="原订单号">{{ currentExchange.orderNo }}</el-descriptions-item>
        <el-descriptions-item label="客户名称">{{ currentExchange.customerName }}</el-descriptions-item>
        <el-descriptions-item label="换货日期">{{ formatDate(currentExchange.exchangeDate) }}</el-descriptions-item>
        <el-descriptions-item label="联系电话">{{ currentExchange.contactPhone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentExchange.status)">{{ currentExchange.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="换货原因" :span="3">{{ currentExchange.exchangeReason || '-' }}</el-descriptions-item>
        <el-descriptions-item label="退回金额">
          <span class="text-success font-weight-700">{{ formatCurrency(currentExchange.returnAmount ?? currentExchange.return_amount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="换出金额">
          <span class="text-primary font-weight-700">{{ formatCurrency(currentExchange.newAmount ?? currentExchange.new_amount) }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="差价">
          <span
            class="font-weight-700"
            :class="(parseFloat(currentExchange.differenceAmount || 0)) > 0 ? 'amount-positive' : (parseFloat(currentExchange.differenceAmount || 0)) < 0 ? 'amount-negative' : 'amount-zero'"
          >
            {{ formatSignedCurrency(currentExchange.differenceAmount ?? currentExchange.difference_amount) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="3">{{ currentExchange.remark || currentExchange.remarks || '-' }}</el-descriptions-item>
      </el-descriptions>
      <!-- 退回商品表格 -->
      <div class="products-section">
        <div class="products-title return-title">
          <el-icon><ArrowDown /></el-icon>
          退回商品清单
        </div>
        <el-table
          :data="getReturnItems(currentExchange?.items || [])"
          border
          class="w-full"
          :empty-text="'暂无退回商品'"
        >
          <el-table-column prop="productCode" label="产品编码" width="120" />
          <el-table-column prop="productName" label="产品名称" min-width="150" />
          <el-table-column prop="specification" label="规格" min-width="120" />
          <el-table-column prop="originalQuantity" label="原订单数量" width="110">
            <template #default="scope">
              {{ formatQuantity(scope.row.originalQuantity) }}
            </template>
          </el-table-column>
          <el-table-column prop="exchangeQuantity" label="退回数量" width="100">
            <template #default="scope">
              <span class="return-quantity">{{ formatQuantity(scope.row.exchangeQuantity) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="单价" width="100">
            <template #default="scope">
              {{ formatCurrency(scope.row.unitPrice) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="scope">
              <span class="text-success">{{ formatCurrency(scope.row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="exchangeReason" label="退回原因" min-width="150" />
          <el-table-column prop="unitName" label="单位" width="80" />
        </el-table>
      </div>
      <!-- 换出商品表格 -->
      <div class="products-section">
        <div class="products-title exchange-title">
          <el-icon><ArrowUp /></el-icon>
          换出商品清单
        </div>
        <el-table
          :data="getExchangeItems(currentExchange?.items || [])"
          border
          class="w-full"
          :empty-text="'暂无换出商品'"
        >
          <el-table-column prop="productCode" label="产品编码" width="120" />
          <el-table-column prop="productName" label="产品名称" min-width="150" />
          <el-table-column prop="specification" label="规格" min-width="120" />
          <el-table-column prop="exchangeQuantity" label="换出数量" width="100">
            <template #default="scope">
              <span class="exchange-quantity">{{ formatQuantity(scope.row.exchangeQuantity) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="单价" width="100">
            <template #default="scope">
              {{ formatCurrency(scope.row.unitPrice) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="scope">
              <span class="text-primary">{{ formatCurrency(scope.row.amount) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="exchangeReason" label="换出原因" min-width="150" />
          <el-table-column prop="unitName" label="单位" width="80" />
        </el-table>
      </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="detailDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </AppDialog>
    <!-- 商品选择对话框 -->
    <AppDialog
      v-model="productDialogVisible"
      title="选择商品"
      mode="form"
      wide
    >
      <div class="mb-md">
        <el-input
          v-model="productDialog.keyword"
          placeholder="搜索商品编码、名称"
          class="w-300"
          @keyup.enter="loadProducts"
        />
        <el-button type="primary" @click="loadProducts">搜索</el-button>
      </div>
      <el-table
        :data="productDialog.list"
        border
        class="w-full"
        @selection-change="handleProductSelection"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="code" label="物料编码" width="120" />
        <el-table-column prop="name" label="物料名称" min-width="140" />
        <el-table-column prop="specification" label="规格" min-width="140" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column prop="stockQuantity" label="库存数量" width="100">
          <template #default>
            <span :class="row.stockQuantity > 0 ? 'text-stock-ok' : 'text-stock-low'">
              {{ row.stockQuantity }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="locationName" label="库位" width="100" />
      </el-table>
      <div class="mt-md text-center">
        <el-pagination
          v-model:current-page="productDialog.page"
          v-model:page-size="productDialog.pageSize"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50]"
          :total="productDialog.total"
          @current-change="loadProducts"
          @size-change="onProductPageSize"
        />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="productDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmProductSelection">确定</el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 选择订单对话框 -->
    <AppDialog
      v-model="orderDialog.visible"
      title="选择已完成出库的订单"
      mode="form"
      wide
    >
      <div class="flex-gap-8-mb">
        <el-input
          v-model="orderDialog.keyword"
          placeholder="按订单号/客户名搜索已出库订单"
          clearable
          @keyup.enter="loadCompletedOrders" />
        <el-button type="primary" @click="loadCompletedOrders">查询</el-button>
      </div>
      <el-table :data="orderDialog.list" border height="380">
        <el-table-column prop="orderNo" label="订单号" width="160" />
        <el-table-column prop="customerName" label="客户名称" min-width="140" />
        <el-table-column prop="deliveryDate" label="出库日期" width="120">
          <template #default="{ row }">
            {{ formatDate(row.deliveryDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="出库状态" width="100">
          <template #default>
            <el-tag type="success">已完成</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="120" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="selectOrder(row)">选择</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-container mt-md">
        <el-pagination
          v-model:current-page="orderDialog.page"
          v-model:page-size="orderDialog.pageSize"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50]"
          :total="orderDialog.total"
          @current-change="loadCompletedOrders"
          @size-change="onOrderPageSizeChange"
        />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="orderDialog.visible = false">关闭</el-button>
        </span>
      </template>
        </AppDialog>
  </div>
</template>
<script setup>
import { parseListData } from '@/utils/responseParser';
import { formatDate } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/helpers/formatters'
import 'dayjs'
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi, inventoryApi, baseDataApi } from '@/api'
import { Plus, Check, ArrowDown, ArrowUp } from '@element-plus/icons-vue'
const loading = ref(false)
const exchangeRecords = ref([])
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const searchQuery = ref('')
const statusFilter = ref('')
const dateRange = ref([])
const isBlankAmount = (value) => value === null || value === undefined || value === ''
const toMoneyNumber = (value) => {
  if (isBlankAmount(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const formatSignedCurrency = (value) => {
  const number = toMoneyNumber(value)
  if (number === null) return '-'
  return `${number > 0 ? '+' : ''}${formatCurrency(number)}`
}
const formatExchangeLineAmount = (quantity, unitPrice) => {
  const qty = toMoneyNumber(quantity)
  const price = toMoneyNumber(unitPrice)
  if (qty === null || price === null) return '-'
  return formatCurrency(qty * price)
}
// 对话框相关
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const detailDialogVisible = ref(false)
const detailDialogLoading = ref(false)
const dialogTitle = ref('')
const isEdit = ref(false)
const submitLoading = ref(false)
const exchangeFormRef = ref()
// 当前查看的换货单
const currentExchange = ref(null)
// 订单选项
const orderOptions = ref([])
// 选中的订单信息
const selectedOrderInfo = ref(null)
// 订单选择对话框
const orderDialog = ref({
  visible: false,
  keyword: '',
  page: 1,
  pageSize: 10,
  total: 0,
  list: []
})
// 换货单表单
const exchangeForm = ref({
  id: '',
  orderNo: '',
  customerName: '',
  contactPhone: '',
  exchangeDate: '',
  reason: '',
  remark: '',
  returnItems: [], // 退回的商品
  newItems: []     // 换出的新商品
})
// 商品选择对话框
const productDialogVisible = ref(false)
const productDialog = ref({
  keyword: '',
  page: 1,
  pageSize: 10,
  total: 0,
  list: []
})
const selectedProducts = ref([])
// 表单验证规则
const exchangeRules = {
  orderNo: [
    { required: true, message: '请选择原订单', trigger: 'change' }
  ],
  customerName: [
    { required: true, message: '客户名称不能为空', trigger: 'blur' }
  ],
  exchangeDate: [
    { required: true, message: '请选择换货日期', trigger: 'change' }
  ],
  reason: [
    { required: true, message: '请输入换货原因', trigger: 'blur' }
  ]
}
// 换货单统计数据
const exchangeStats = ref({
  total: 2,
  pending: 1,
  processing: 0,
  completed: 1,
  rejected: 0
})
// 状态映射 - 使用统一的销售状态
const exchangeStatuses = [
  { value: 'pending', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'rejected', label: '已拒绝' }
]
import { getSalesStatusColor, getSalesStatusText } from '@/constants/systemConstants'
// 获取状态类型
const getStatusType = (status) => {
  return getSalesStatusColor(status) || 'info'
}
// 获取状态文本
const _getStatusText = (status) => {
  return getSalesStatusText(status) || status
}
// 计算退回商品总价
const calcReturnTotal = () => {
  return (exchangeForm.value.returnItems || []).reduce((sum, item) => {
    return sum + (toMoneyNumber(item.returnQuantity) || 0) * (toMoneyNumber(item.unitPrice) || 0)
  }, 0)
}
// 计算换出商品总价
const calcNewTotal = () => {
  return (exchangeForm.value.newItems || []).reduce((sum, item) => {
    return sum + (toMoneyNumber(item.newQuantity) || 0) * (toMoneyNumber(item.unitPrice) || 0)
  }, 0)
}
// 计算差价
const calcDifference = () => {
  return calcNewTotal() - calcReturnTotal()
}
// 计算统计数据
const calculateExchangeStats = () => {
  const stats = {
    total: exchangeRecords.value.length,
    pending: 0,
    processing: 0,
    completed: 0,
    rejected: 0
  }

  exchangeRecords.value.forEach(record => {
    if (record.status === '待处理') stats.pending++
    else if (record.status === '处理中') stats.processing++
    else if (record.status === '已完成') stats.completed++
    else if (record.status === '已拒绝') stats.rejected++
  })

  exchangeStats.value = stats
}
// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  fetchData()
}
// 重置搜索方法
const resetSearch = () => {
  searchQuery.value = ''
  statusFilter.value = ''
  dateRange.value = []
  fetchData()
}
// 获取换货单数据
const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: currentPage.value,
      pageSize: pageSize.value,
      search: searchQuery.value,
      status: statusFilter.value,
      startDate: dateRange.value?.[0] || '',
      endDate: dateRange.value?.[1] || ''
    }
    const response = await salesApi.getExchanges(params)
    if (response?.data) {
      // 使用统一解析器
      const items = parseListData(response, { enableLog: false })
      exchangeRecords.value = items.map(item => ({
        id: item.id,
        exchangeNo: item.exchangeNo,
        orderNo: item.orderNo,
        customerName: item.customerName,
        contactPhone: item.contactPhone,
        exchangeDate: item.exchangeDate,
        reason: item.exchangeReason || item.reason,
        status: item.status,
        remark: item.remarks || item.remark,
        returnAmount: isBlankAmount(item.returnAmount ?? item.returnAmount) ? null : (item.returnAmount ?? item.returnAmount),
        newAmount: isBlankAmount(item.newAmount ?? item.newAmount) ? null : (item.newAmount ?? item.newAmount),
        differenceAmount: isBlankAmount(item.differenceAmount ?? item.differenceAmount) ? null : (item.differenceAmount ?? item.differenceAmount),
        items: item.items || []
      }))
      total.value = response.data.total || exchangeRecords.value.length
      calculateExchangeStats()
    } else {
      throw new Error('API响应数据格式错误')
    }
  } catch (error) {
    console.error('获取换货单数据失败:', error)
    ElMessage.error('获取换货单数据失败')
    // 清空数据
    exchangeRecords.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}
// 在组件挂载时获取数据
onMounted(() => {
  fetchData()
})
// 创建新换货单
const handleCreate = () => {
  isEdit.value = false
  dialogTitle.value = '新增换货单'
  resetForm()
  dialogVisible.value = true
}
// 编辑换货单
const handleEdit = async (row) => {
  detailDialogVisible.value = false
  dialogVisible.value = true
  dialogLoading.value = true
  isEdit.value = true
  dialogTitle.value = '编辑换货单'
  try {
    // 调用API获取完整的换货单详情（包括退回商品和换出商品）
    const response = await salesApi.getExchange(row.id)
    const exchangeData = response.data || response
    // 填充表单数据
    exchangeForm.value = {
      id: exchangeData.id,
      orderNo: exchangeData.orderNo,
      customerName: exchangeData.customerName,
      contactPhone: exchangeData.contactPhone || '',
      exchangeDate: exchangeData.exchangeDate,
      reason: exchangeData.exchangeReason,
      remark: exchangeData.remarks || exchangeData.remark || '',
      items: exchangeData.items || []
    }
    // 分离退回商品和换出商品
    exchangeForm.value.returnItems = (exchangeData.items || [])
      .filter(item => item.itemType === 'return')
      .map(item => ({
        productCode: item.productCode,
        productName: item.productName,
        specification: item.specification || '',
        originalQuantity: item.originalQuantity || 0,
        returnQuantity: item.returnQuantity || item.quantity || 0,
        returnReason: item.returnReason || '',
        unitPrice: isBlankAmount(item.unitPrice ?? item.unitPrice ?? item.price) ? null : (item.unitPrice ?? item.unitPrice ?? item.price)
      }))
    exchangeForm.value.newItems = (exchangeData.items || [])
      .filter(item => item.itemType === 'new')
      .map(item => ({
        productCode: item.productCode,
        productName: item.productName,
        specification: item.specification || '',
        newQuantity: item.newQuantity || item.quantity || 0,
        newReason: item.newReason || '',
        unitPrice: isBlankAmount(item.unitPrice ?? item.unitPrice ?? item.price) ? null : (item.unitPrice ?? item.unitPrice ?? item.price)
      }))
  } catch (error) {
    console.error('获取换货单详情失败:', error)
    ElMessage.error('获取换货单详情失败')
    dialogVisible.value = false
  } finally {
    dialogLoading.value = false
  }
}
// 查看换货单详情
const handleView = async (row) => {
  detailDialogVisible.value = true
  detailDialogLoading.value = true
  try {
    // 调用API获取完整的换货单详情
    const response = await salesApi.getExchange(row.id)
    // 使用response.data，这是实际的数据
    const exchangeData = response.data || response
    // 直接使用后端返回的数据，同时保留驼峰命名的字段用于显示
    currentExchange.value = {
      ...exchangeData,
      // 保留原始字段名
      exchangeNo: exchangeData.exchangeNo,
      orderNo: exchangeData.orderNo,
      customerName: exchangeData.customerName,
      contactPhone: exchangeData.contactPhone,
      exchangeDate: exchangeData.exchangeDate,
      reason: exchangeData.exchangeReason,
      remark: exchangeData.remarks || exchangeData.remark,
      items: exchangeData.items || []
    }
  } catch (error) {
    console.error('获取换货单详情失败:', error)
    ElMessage.error('获取换货单详情失败')
    detailDialogVisible.value = false
  } finally {
    detailDialogLoading.value = false
  }
}
// 处理换货单
const handleProcess = (row) => {
  ElMessageBox.confirm('确定要处理此换货单吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      // 先获取完整的换货单数据（包括明细）
      const response = await salesApi.getExchange(row.id)
      const fullExchangeData = response.data || response
      // 更新换货单状态为处理中，保留所有原有数据
      const updatedData = {
        orderNo: fullExchangeData.orderNo,
        customerName: fullExchangeData.customerName,
        contactPhone: fullExchangeData.contact_phone,
        exchangeDate: fullExchangeData.exchange_date,
        reason: fullExchangeData.exchange_reason,
        remark: fullExchangeData.remarks,
        status: '处理中',
        items: (fullExchangeData.items || []).map(item => ({
          productCode: item.productCode,
          productName: item.productName,
          specification: item.specification,
          originalQuantity: item.originalQuantity,
          exchangeQuantity: item.exchangeQuantity,
          exchangeReason: item.exchangeReason,
          unitName: item.unitName
        }))
      }
      await salesApi.updateExchange(row.id, updatedData)
      ElMessage.success(`换货单 ${row.exchangeNo || row.id} 已开始处理`)
      // 刷新数据
      await fetchData()
      detailDialogVisible.value = false
    } catch (error) {
      console.error('处理失败:', error)
      ElMessage.error('处理失败，请重试')
    }
  }).catch(() => {})
}
// 完成换货单
const handleComplete = (row) => {
  ElMessageBox.confirm('确认完成这个换货单吗？完成后将无法修改状态。', '确认完成', {
    confirmButtonText: '确认完成',
    cancelButtonText: '取消',
    type: 'success'
  }).then(async () => {
    try {
      // 先获取完整的换货单数据（包括明细）
      const response = await salesApi.getExchange(row.id)
      const fullExchangeData = response.data || response
      // 更新换货单状态为已完成，保留所有原有数据
      const updatedData = {
        orderNo: fullExchangeData.orderNo,
        customerName: fullExchangeData.customerName,
        contactPhone: fullExchangeData.contact_phone,
        exchangeDate: fullExchangeData.exchange_date,
        reason: fullExchangeData.exchange_reason,
        remark: fullExchangeData.remarks,
        status: '已完成',
        items: (fullExchangeData.items || []).map(item => ({
          productCode: item.productCode,
          productName: item.productName,
          specification: item.specification,
          originalQuantity: item.originalQuantity,
          exchangeQuantity: item.exchangeQuantity,
          exchangeReason: item.exchangeReason,
          unitName: item.unitName
        }))
      }
      await salesApi.updateExchange(row.id, updatedData)
      ElMessage.success(`换货单 ${row.exchangeNo || row.id} 已完成`)
      await fetchData()
    } catch (error) {
      console.error('完成失败:', error)
      ElMessage.error('完成失败，请重试')
    }
  }).catch(() => {})
}
// 拒绝换货单
const handleReject = (row) => {
  ElMessageBox.prompt('请输入拒绝原因', '拒绝换货', {
    confirmButtonText: '确认拒绝',
    cancelButtonText: '取消',
    inputPattern: /.+/,
    inputErrorMessage: '拒绝原因不能为空'
  }).then(async ({ value: rejectReason }) => {
    try {
      // 先获取完整的换货单数据（包括明细）
      const response = await salesApi.getExchange(row.id)
      const fullExchangeData = response.data || response
      // 更新换货单状态为已拒绝，保留所有原有数据
      const updatedData = {
        orderNo: fullExchangeData.orderNo,
        customerName: fullExchangeData.customerName,
        contactPhone: fullExchangeData.contact_phone,
        exchangeDate: fullExchangeData.exchange_date,
        reason: fullExchangeData.exchange_reason,
        remark: (fullExchangeData.remarks || '') + `\n拒绝原因：${rejectReason}`,
        status: '已拒绝',
        items: (fullExchangeData.items || []).map(item => ({
          productCode: item.productCode,
          productName: item.productName,
          specification: item.specification,
          originalQuantity: item.originalQuantity,
          exchangeQuantity: item.exchangeQuantity,
          exchangeReason: item.exchangeReason,
          unitName: item.unitName
        }))
      }
      await salesApi.updateExchange(row.id, updatedData)
      ElMessage.success(`换货单 ${row.exchangeNo || row.id} 已拒绝`)
      await fetchData()
    } catch (error) {
      console.error('拒绝失败:', error)
      ElMessage.error('拒绝失败，请重试')
    }
  }).catch(() => {})
}
// 重置表单
const resetForm = () => {
  exchangeForm.value = {
    id: '',
    orderNo: '',
    customerName: '',
    contactPhone: '',
    exchangeDate: '',
    reason: '',
    remark: '',
    returnItems: [],
    newItems: []
  }
  // 清空选中的订单信息
  selectedOrderInfo.value = null
  orderOptions.value = []
  if (exchangeFormRef.value) {
    exchangeFormRef.value.resetFields()
  }
}
// 关闭对话框
const handleDialogClose = () => {
  dialogVisible.value = false
  resetForm()
}
// 打开订单选择对话框
const openOrderDialog = async () => {
  orderDialog.value.visible = true
  orderDialog.value.page = 1
  orderDialog.value.keyword = ''
  await loadCompletedOrders()
}
// 加载已完成出库的订单
const loadCompletedOrders = async () => {
  try {
    const params = {
      page: orderDialog.value.page,
      pageSize: orderDialog.value.pageSize,
      search: orderDialog.value.keyword || undefined,
      status: 'completed' // 只查询已完成的出库单
    }
    const response = await salesApi.getOutbounds(params)
    const data = response.data || {}
    const items = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : [])
    // 从出库单中提取唯一的订单信息
    const uniqueOrders = new Map()
    items.forEach(outbound => {
      const orderKey = outbound.orderNo || outbound.id
      if (orderKey && !uniqueOrders.has(orderKey)) {
        uniqueOrders.set(orderKey, {
          id: outbound.id,
          order_no: outbound.orderNo,
          customer_name: outbound.customerName,
          delivery_date: outbound.deliveryDate,
          contact_phone: outbound.contactPhone,
          outbound_id: outbound.id,
          items: outbound.items || []
        })
      }
    })
    orderDialog.value.list = Array.from(uniqueOrders.values())
    orderDialog.value.total = Number(data.total ?? orderDialog.value.list.length ?? 0)
  } catch (error) {
    console.error('获取已完成出库订单失败:', error)
    ElMessage.error('获取订单数据失败')
    // 清空数据
    orderDialog.value.list = []
    orderDialog.value.total = 0
  }
}
// 订单页面大小变化
const onOrderPageSizeChange = async (size) => {
  orderDialog.value.pageSize = size
  orderDialog.value.page = 1
  await loadCompletedOrders()
}
// 选择订单
const selectOrder = async (row) => {
  try {
    // 设置表单数据
    exchangeForm.value.orderNo = row.orderNo
    exchangeForm.value.customerName = row.customerName
    exchangeForm.value.contactPhone = row.contactPhone
    // 设置选中的订单信息
    selectedOrderInfo.value = {
      deliveryDate: row.deliveryDate,
      outboundId: row.outboundId
    }
    // 获取出库单详情以获取商品信息
    if (row.outboundId) {
      const response = await salesApi.getOutbound(row.outboundId)
      // 拦截器已解包，response.data 就是业务数据
      if (response.data?.items) {
        exchangeForm.value.returnItems = response.data.items.map(item => ({
          productCode: item.productCode || item.materialCode || item.productCode,
          productName: item.productName || item.materialName || item.productName,
          specification: item.specification || item.specs || '无规格信息',
          originalQuantity: item.quantity || item.deliveredQuantity,
          returnQuantity: 1,
          returnReason: '',
          unitName: item.unit || item.unitName || item.unitName,
          unitPrice: isBlankAmount(item.unitPrice ?? item.price) ? null : (item.unitPrice ?? item.price)
        }))
      }
    }
    // 如果没有获取到商品信息，提示用户
    if (!exchangeForm.value.returnItems || exchangeForm.value.returnItems.length === 0) {
      ElMessage.warning('该订单暂无商品信息，请手动添加商品')
      exchangeForm.value.returnItems = []
    }
    // 关闭对话框
    orderDialog.value.visible = false
    ElMessage.success(`已选择订单：${row.orderNo}`)
  } catch (error) {
    console.error('选择订单失败:', error)
    ElMessage.error('获取订单详情失败')
  }
}
// 删除退回商品
const removeReturnItem = (index) => {
  exchangeForm.value.returnItems.splice(index, 1)
}
// 删除换出商品
const removeNewItem = (index) => {
  exchangeForm.value.newItems.splice(index, 1)
}
// 打开商品选择对话框
const openProductDialog = () => {
  productDialogVisible.value = true
  productDialog.value.page = 1
  loadProducts()
}
// 加载商品列表
const loadProducts = async () => {
  const params = {
    page: productDialog.value.page,
    limit: productDialog.value.pageSize,  // 后端使用 limit 参数
    search: productDialog.value.keyword || undefined
  }
  try {
    // 使用库存API获取带库存信息的物料数据
    const response = await inventoryApi.getStocks(params)
    // 处理响应数据
    const data = response.data || {}
    const items = data.items || data.data || []
    productDialog.value.list = items.map(item => ({
      id: item.materialId || item.id,
      code: item.materialCode || item.code,
      name: item.materialName || item.name,
      specification: item.specification || item.specs || '',
      unit_name: item.unitName || '个',
      stock_quantity: item.quantity || item.stockQuantity || 0,
      location_name: item.locationName || '',
      price: isBlankAmount(item.price ?? item.unitPrice) ? null : (item.price ?? item.unitPrice)
    }))
    productDialog.value.total = parseInt(data.total) || items.length
  } catch (error) {
    console.error('加载商品列表失败:', error)
    ElMessage.error('加载商品列表失败')
    // 如果API失败，使用基础物料API作为备选
    try {
      const response = await baseDataApi.getMaterials(params)
      const data = response.data || {}
      const items = data.items || []
      productDialog.value.list = items.map(item => ({
        id: item.id,
        code: item.code,
        name: item.name,
        specification: item.specs || '',
        unit_name: item.unitName || '个',
        stock_quantity: 0, // 基础API没有库存信息
        location_name: ''
      }))
      productDialog.value.total = parseInt(data.total) || items.length
    } catch (fallbackError) {
      console.error('备选API也失败:', fallbackError)
      ElMessage.error('获取物料数据失败')
    }
  }
}
// 商品选择变化
const handleProductSelection = (selection) => {
  selectedProducts.value = selection
}
// 分页大小变化
const onProductPageSize = (size) => {
  productDialog.value.pageSize = size
  productDialog.value.page = 1
  loadProducts()
}
// 确认商品选择
const confirmProductSelection = () => {
  if (selectedProducts.value.length === 0) {
    ElMessage.warning('请选择至少一个商品')
    return
  }
  // 添加选中的商品到换出商品列表
  selectedProducts.value.forEach(product => {
    // 检查是否已经存在
    const exists = exchangeForm.value.newItems.find(item => item.productCode === product.code)
    if (!exists) {
      exchangeForm.value.newItems.push({
        productCode: product.code,
        productName: product.name,
        specification: product.specification,
        unitName: product.unitName,
        newQuantity: 1,
        newReason: '',
        unitPrice: isBlankAmount(product.price) ? null : product.price
      })
    }
  })
  productDialogVisible.value = false
  ElMessage.success(`已添加 ${selectedProducts.value.length} 个商品`)
}
// 提交表单
const handleSubmit = async () => {
  if (!exchangeFormRef.value) return
  try {
    await exchangeFormRef.value.validate()
    // 验证退回商品
    if (exchangeForm.value.returnItems.length === 0) {
      ElMessage.warning('请至少添加一个退回商品')
      return
    }
    // 验证退回商品数量
    for (const item of exchangeForm.value.returnItems) {
      if (!item.returnQuantity || parseFloat(item.returnQuantity) <= 0) {
        ElMessage.error(`请输入有效的退回数量：${item.productName}`)
        return
      }
      if (parseFloat(item.returnQuantity) > parseFloat(item.originalQuantity)) {
        ElMessage.error(`退回数量不能超过原订单数量：${item.productName}`)
        return
      }
    }
    // 验证换出商品
    if (exchangeForm.value.newItems.length === 0) {
      ElMessage.warning('请至少添加一个换出商品')
      return
    }
    // 验证换出商品数量
    for (const item of exchangeForm.value.newItems) {
      if (!item.newQuantity || parseFloat(item.newQuantity) <= 0) {
        ElMessage.error(`请输入有效的换出数量：${item.productName}`)
        return
      }
    }
    submitLoading.value = true
    try {
      if (isEdit.value) {
        // 更新现有换货单
        await salesApi.updateExchange(exchangeForm.value.id, exchangeForm.value)
        ElMessage.success('换货单更新成功')
      } else {
        // 创建新换货单
        const response = await salesApi.createExchange(exchangeForm.value)
        ElMessage.success('换货单创建成功')
        // 如果后端返回了新创建的换货单信息，可以在这里处理
        if (response.data) {
          // 可以在这里添加额外的处理逻辑
        }
      }
      // 刷新数据
      await fetchData()
      dialogVisible.value = false
      resetForm()
    } catch (apiError) {
      console.error('API调用失败:', apiError)
      ElMessage.error('操作失败，请重试')
    }
  } catch (error) {
    console.error('表单验证失败:', error)
  } finally {
    submitLoading.value = false
  }
}
// 处理每页显示数量变化
const handleSizeChange = (val) => {
  pageSize.value = val
  fetchData()
}
// 处理当前页码变化
const handleCurrentChange = (val) => {
  currentPage.value = val
  fetchData()
}
// 格式化数量显示
const formatQuantity = (quantity) => {
  if (quantity === null || quantity === undefined) return '-'
  const num = parseFloat(quantity)
  if (isNaN(num)) return '-'
  // 如果是整数，显示为整数；如果是小数，保留必要的小数位
  return num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '')
}
// 获取退回商品列表
const getReturnItems = (items) => {
  return items.filter(item => item.itemType === 'return')
}
// 获取换出商品列表
const getExchangeItems = (items) => {
  return items.filter(item => item.itemType === 'new')
}
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
.search-form {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-base);
}
.operation-group {
  display: flex;
  gap: 4px;
}
.el-dialog .el-descriptions,
.app-dialog-view-body .el-descriptions {
  margin-bottom: var(--spacing-lg);
}
/* 商品区域样式 */
.products-section {
  margin: 20px 0;
}
.return-title {
  background-color: var(--color-primary-light-9);
  color: var(--ds-blue);
  border-left: 4px solid var(--ds-blue-strong);
}
.exchange-title {
  background-color: var(--ds-red-bg);
  color: var(--ds-red-strong);
  border-left: 4px solid var(--ds-red);
}
/* 数量样式 */
.return-quantity {
  color: var(--ds-green);
  font-weight: 600;
}
.exchange-quantity {
  color: var(--ds-red-strong);
  font-weight: 600;
}
/* 对话框内容防撑宽：依赖 AppDialog / dialog-system SSOT */
.app-dialog-form-body :deep(.el-form),
.app-dialog-view-body :deep(.el-form) {
  overflow-x: hidden;
}
.app-dialog-form-body :deep(.el-table),
.app-dialog-view-body :deep(.el-table) {
  table-layout: fixed;
}
/* 响应式设计 */
@media (max-width: 768px) {
  .statistics-row {
    flex-direction: column;
  }
  .stat-card {
    min-width: auto;
  }
  .search-form {
    flex-direction: column;
  }
  .search-form .el-form-item {
    width: 100%;
  }
  .page-header {
    flex-direction: column;
    gap: var(--spacing-base);
    align-items: flex-start;
  }
  .el-dialog:not(.is-fullscreen) {
    width: 95% !important;
    margin: 0 !important; /* 与全站居中一致，勿再用 5vh 偏上 */
  }
}
/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
