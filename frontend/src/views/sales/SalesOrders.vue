<!--
/**
 * SalesOrders.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page outbound-container">
    <!-- 页面标题 -->
    <PageHeader :title="$t('page.sales.orders.title')" subtitle="管理销售订单与跟踪">
      <template #actions>
<el-button type="primary" :icon="Plus" v-permission="'sales:orders:create'" @click="handleAdd">{{ $t('page.sales.orders.add') }}</el-button>
      </template>
    </PageHeader>
    <!-- 搜索区域 -->
    <FinanceQueryCard
      :loading="loading"
      @search="handleSearch(true)"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input
            v-model="searchQuery"
            placeholder="物料名称"
            @keyup.enter="() => handleSearch(true)"
            @input="handleSearch"
            clearable
          ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item :label="$t('page.sales.orders.status')">
          <el-select v-model="statusFilter" :placeholder="$t('page.sales.orders.status')" clearable @change="() => handleSearch(true)" class="form-control-xs">
            <el-option
              v-for="item in orderStatuses"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人">
          <el-select v-model="operatorFilter" placeholder="请选择" clearable @change="handleOperatorChange" class="form-control-xs">
            <el-option
              v-for="item in operators"
              :key="item.id"
              :label="item.realName || item.username"
              :value="item.id"
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
            @change="() => handleSearch(true)"
          />
        </el-form-item>
      </template>
      <template #actions>
          <el-dropdown class="ml-sm">
            <el-button type="primary">
              更多操作<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleImport">
                  <el-icon><Upload /></el-icon> 导入
                </el-dropdown-item>
                <el-dropdown-item @click="handleExport">
                  <el-icon><Download /></el-icon> 导出
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
      </template>
    </FinanceQueryCard>
    <!-- 统计卡片 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats?.total || 0 }}</div>
        <div class="stat-label">全部订单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats?.inProduction || 0 }}</div>
        <div class="stat-label">生产中</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats?.readyToShip || 0 }}</div>
        <div class="stat-label">可发货</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats?.shipped || 0 }}</div>
        <div class="stat-label">已发货</div>
      </el-card>
    </div>
    <!-- 订单表格 -->
    <el-card class="data-card">
      <el-table
        :data="tableData"
        border
        class="table-row-click w-full"
        v-loading="loading"
        @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))"
      >
        <template #empty>
          <EmptyState description="暂无销售订单数据" />
        </template>
        <el-table-column prop="orderNo" label="订单编号" width="140" fixed resizable show-overflow-tooltip>
        </el-table-column>
        <el-table-column prop="customerName" label="客户名称" width="230" resizable show-overflow-tooltip>
        </el-table-column>
        <el-table-column prop="createdByRealName" label="操作人" width="100" resizable show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.createdByRealName || row.createdByName || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="contractCode" label="合同编码" width="170" resizable show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.contractCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="totalAmount" label="订单金额" width="120" resizable show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatCurrency(row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="orderDate" label="下单日期" width="120" sortable="custom" resizable show-overflow-tooltip>
          <template #default="{ row }">
            {{ getOrderDate(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="deliveryDate" label="交付日期" width="120" resizable show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDate(row.deliveryDate) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" resizable show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag
              :type="getSalesStatusColor(row.status)"
            >
              {{ getSalesStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="锁定状态" width="100" resizable show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag
              :type="row.isLocked ? 'danger' : 'success'"
              size="small"
            >
              {{ row.isLocked ? '已锁定' : '未锁定' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="360" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <div class="table-actions" @click.stop>
            <el-button
              size="small"
              type="primary"
              v-permission="'sales:orders:update'"
              @click="handleEdit(row)"
              v-if="canEdit(row)"
              :disabled="actionLoadingId === row.id"
            >
              编辑
            </el-button>
            <el-popconfirm
              title="确定要确认该订单吗？"
              @confirm="handleConfirm(row)"
              v-if="canConfirm(row)"
            >
              <template #reference>
                <el-button size="small" type="primary" v-permission="'sales:orders:update'" :loading="actionLoadingId === row.id">确认</el-button>
              </template>
            </el-popconfirm>
            <el-button
              size="small"
              type="success"
              v-permission="'sales:orders:update'"
              @click="handleShip(row)"
              v-if="canShip(row)"
              :loading="actionLoadingId === row.id"
            >发货</el-button>
            <el-popconfirm
              title="确定要锁定该订单吗？锁定后无法修改。"
              @confirm="handleLock(row)"
              confirm-button-type="warning"
              v-if="canLock(row)"
            >
              <template #reference>
                <el-button size="small" type="warning" v-permission="'sales:orders:update'" :loading="actionLoadingId === row.id">锁定</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要解锁该订单吗？"
              @confirm="handleUnlock(row)"
              v-if="canUnlock(row)"
            >
              <template #reference>
                <el-button size="small" type="info" v-permission="'sales:orders:update'" :loading="actionLoadingId === row.id">解锁</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要取消该订单吗？此操作无法恢复。"
              @confirm="handleCancel(row)"
              confirm-button-type="danger"
              v-if="canCancel(row)"
            >
              <template #reference>
                <el-button size="small" type="danger" v-permission="'sales:orders:update'" :loading="actionLoadingId === row.id">取消</el-button>
              </template>
            </el-popconfirm>
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
          :total="Math.max(total, 1)"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        >
        </el-pagination>
      </div>
    </el-card>

    <!-- 新增/编辑订单对话框（宽度适配明细表格完整显示，统一走 AppDialog） -->
    <AppDialog
      v-model="dialogVisible"
      mode="form"
      width="1200px"
      :title="dialogType === 'add' ? '新增订单' : '编辑订单'"
      :loading="dialogLoading"
      :close-on-click-modal="false"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px" @keydown="salesFormKeydown">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="客户名称" prop="customerId">
              <el-select
                v-model="form.customerId"
                placeholder="请选择客户（支持客户编码/名称搜索）"
                filterable
                remote
                reserve-keyword
                clearable
                :remote-method="searchCustomers"
                :loading="customerSearchLoading"
                @visible-change="(open) => { if (open && !filteredCustomers.length) searchCustomers('') }"
                @change="handleCustomerChange"
                @keyup.enter="handleCustomerEnterKey"
                class="w-full"
              >
                <el-option
                  v-for="item in filteredCustomers"
                  :key="item.id"
                  :label="`${item.code} - ${item.name}`"
                  :value="item.id"
                >
                  <span class="option-code">{{ item.code }} - {{ item.name }}</span>
                  <span class="option-name">{{ item.contactPerson || '无联系人' }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="合同编码" prop="contractCode">
              <el-input
                ref="contractCodeInput"
                v-model="form.contractCode"
                placeholder="请输入合同编码"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="交付日期" prop="deliveryDate">
              <el-date-picker
                v-model="form.deliveryDate"
                type="date"
                placeholder="选择交付日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="6">
            <el-form-item label="联系人" prop="contact">
              <el-input v-model="form.contact" placeholder="请输入联系人" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="联系电话" prop="phone">
              <el-input v-model="form.phone" placeholder="请输入联系电话" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="收货地址" prop="address">
              <el-input v-model="form.address" placeholder="请输入收货地址" />
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 订单明细 -->
        <el-form-item label="订单明细">
          <div class="materials-table-container">
            <el-table
              :data="form.items"
              border
              class="w-full"
              table-layout="fixed"
              :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }"
              empty-text="请添加订单物料"
            >
              <el-table-column label="物料编码" width="120">
                <template #default="{ row, $index }">
                  <el-autocomplete
                    :ref="(el) => setMaterialSelectRef(el, $index)"
                    v-model="row.code"
                    placeholder="输入"
                    clearable
                    :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                    @select="(item) => handleMaterialSelect(item, $index)"
                    @keydown.enter.prevent="handleMaterialEnter($index)"
                    @clear="handleMaterialClear($index)"
                    class="w-full"
                    :trigger-on-focus="false"
                    :debounce="300"
                    :class="{ 'is-required-field': !row.materialId }"
                  >
                    <template #default="{ item }">
                      <div class="option-row gap-12">
                        <span class="option-row__code">{{ item.code }}</span>
                        <span class="option-row__name">{{ item.name }}</span>
                        <span v-if="item.specs" class="text-muted text-sm">{{ item.specs }}</span>
                        <span v-if="item.price && Number(item.price) > 0" class="text-emerald-600 font-medium text-sm">¥{{ Number(item.price).toFixed(2) }}</span>
                      </div>
                    </template>
                  </el-autocomplete>
                </template>
              </el-table-column>
              <el-table-column label="物料名称" prop="materialName" width="140" show-overflow-tooltip />

              <el-table-column label="规格" prop="specification" width="140" show-overflow-tooltip />
              <el-table-column label="数量" width="80">
                <template #default="{ row, $index }">
                  <el-input
                    :ref="(el) => setQuantityInputRef(el, $index)"
                    v-model="row.quantity"
                    @input="(val) => { row.quantity = Number(val) || 0; calculateItemAmount($index); }"
                    @keydown.enter="handleQuantityEnter($index)"
                    placeholder="数量"
                    size="small"
                  />
                </template>
              </el-table-column>

              <el-table-column label="单价" width="70">
                <template #default="{ row, $index }">
                  <el-input
                    v-model="row.unitPrice"
                    @input="(val) => { row.unitPrice = isBlankAmount(val) ? null : Number(val); calculateItemAmount($index); }"
                    placeholder="单价"
                    type="number"
                    min="0"
                    step="0.01"
                    size="small"
                  />
                </template>
              </el-table-column>
              <el-table-column label="单位" prop="unitName" width="60" align="center" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ row.unitName || row.unit || '-' }}
                </template>
              </el-table-column>
              <el-table-column label="金额" width="80">
                <template #default="{ row }">
                    {{ formatCurrency(row.amount) }}
                </template>
              </el-table-column>
              <el-table-column label="税率" width="85">
                <template #default="{ row, $index }">
                  <el-select
                    v-model="row.taxRate"
                    placeholder="税率"
                    size="small"
                    @change="calculateItemAmount($index)"
                    class="w-full"
                  >
                    <el-option
                      v-for="rate in vatRateOptions"
                      :key="rate"
                      :label="financeStore.formatTaxRate(rate)"
                      :value="rate"
                    />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="税额" width="90">
                <template #default="{ row }">
                  {{ formatCurrency(row.taxAmount) }}
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="120">
                <template #default="{ row }">
                  <el-input
                    v-model="row.remark"
                    placeholder="请输入备注"
                    size="small"
                    maxlength="200"
                    clearable />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="75" fixed="right" align="center" header-align="center" class-name="operation-column" header-class-name="operation-column-header">
                <template #default="{ $index }">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeMaterial($index)"
                    v-permission="dialogType === 'add' ? 'sales:orders:create' : 'sales:orders:update'">
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="add-material mt-10">
              <el-button type="primary" @click="addMaterial">
                <el-icon><Plus /></el-icon>添加物料
              </el-button>
            </div>
          </div>
        </el-form-item>
        <!-- 订单汇总 -->
        <div class="order-summary summary-box">
          <el-row :gutter="20">
            <el-col :span="6" class="text-right">
              <span class="text-regular">小计: {{ formatCurrency(form.subtotal) }}</span>
            </el-col>
            <el-col :span="6" class="text-right">
              <span class="text-warning">税额: {{ formatCurrency(form.taxAmount) }}</span>
            </el-col>
            <el-col :span="6" class="text-right">
              <span class="text-regular">数量合计: {{ formatQuantityTotal(totalQuantity) }}</span>
            </el-col>
            <el-col :span="6" class="text-right">
              <span class="text-primary font-weight-700">合计: {{ formatCurrency(form.totalAmount) }}</span>
            </el-col>
          </el-row>
        </div>
        <el-form-item label="备注" class="mt-15">
          <el-input type="textarea" v-model="form.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-permission="dialogType === 'add' ? 'sales:orders:create' : 'sales:orders:update'" type="primary" @click="handleSubmit" :loading="dialogLoading">保存</el-button>
        </span>
      </template>
    </AppDialog>
    <!-- 订单详情对话框 -->
    <AppDialog
      v-model="detailsVisible"
      title="订单详情"
      mode="view"
      width="1100px"
      :detail-navigation="orderViewNavigation"
    >
      <div v-loading="detailsLoading" class="order-view">
        <template v-if="currentOrder">
          <el-descriptions :column="2" border class="purchase-view-desc">
            <el-descriptions-item label="订单编号">{{ currentOrder.orderNo }}</el-descriptions-item>
            <el-descriptions-item label="客户名称">{{ currentOrder.customerName || currentOrder.customer }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getSalesStatusColor(currentOrder.status)">{{ getSalesStatusText(currentOrder.status) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="合同编码">{{ currentOrder.contractCode || '-' }}</el-descriptions-item>
            <el-descriptions-item label="交付日期">{{ formatDate(currentOrder.deliveryDate) }}</el-descriptions-item>
            <el-descriptions-item label="订单金额">
              <span class="text-primary font-weight-700">{{ formatCurrency(currentOrder.totalAmount) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="联系人">{{ currentOrder.contact || currentOrder.contactPerson || '-' }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ currentOrder.phone || currentOrder.contactPhone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="收货地址" :span="2">{{ currentOrder.address || '-' }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="2">{{ currentOrder.remarks || '-' }}</el-descriptions-item>
          </el-descriptions>
          <el-divider content-position="center">订单物料明细</el-divider>
          <el-table :data="currentOrder.items || []" border class="w-full purchase-view-table" table-layout="fixed">
            <el-table-column label="物料编码" width="140" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.materialCode || row.productCode || row.code || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="物料名称" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.materialName || row.name || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="规格" width="120" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.specification || row.productSpecs || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column prop="unitName" label="单位" width="60" align="center" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.unitName || row.unit || '-' }}
              </template>
            </el-table-column>
            <el-table-column label="单价" width="100">
              <template #default="{ row }">
                {{ formatCurrency(row.unitPrice) }}
              </template>
            </el-table-column>
            <el-table-column label="金额" width="100">
              <template #default="{ row }">
                {{ formatCurrency(row.amount) }}
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.remarks || '-' }}
              </template>
            </el-table-column>
          </el-table>
        </template>
        <EmptyState v-else-if="!detailsLoading" description="暂无数据" />
      </div>
      <template #footer>
        <el-button @click="detailsVisible = false">关闭</el-button>
        <el-button type="primary" @click="handlePrintOrder" :loading="printLoading" v-if="currentOrder">打印</el-button>
      </template>
    </AppDialog>
    <!-- 导入对话框 -->
    <AppDialog
      v-model="importDialogVisible"
      title="导入订单"
      mode="form"
      width="500px"
    >
      <div class="import-tips">
        <p>1. 请先 <el-link type="primary" @click="downloadTemplate">下载模板</el-link></p>
        <p>2. 按照模板格式填写数据</p>
        <p>3. 选择填好的文件并导入</p>
      </div>
      <el-upload
        ref="uploadRef"
        action=""
        :auto-upload="false"
        :limit="1"
        accept=".xlsx, .xls"
        :on-change="handleFileChange"
        class="mt-15"
      >
        <template #trigger>
          <el-button type="primary">选择文件</el-button>
        </template>
        <template #tip>
          <div class="el-upload__tip">只支持 .xlsx, .xls 格式文件，不超过 10MB</div>
        </template>
      </el-upload>
      <div v-if="importResult" class="import-result">
        <h4>导入结果</h4>
        <el-alert
          :title="`成功：${importResult.success || 0} 条，失败：${importResult.failed || 0} 条`"
          :type="(importResult.failed || 0) > 0 ? 'warning' : 'success'"
          :closable="false"
        />
        <div v-if="(importResult.failed || 0) > 0 && importResult.errors" class="error-details">
          <h5>失败详情：</h5>
          <ul>
            <li v-for="(err, index) in importResult.errors" :key="index">
              第 {{ err.row || (index + 1) }} 行：{{ err.message }}
            </li>
          </ul>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeImportDialog">取消</el-button>
          <el-button v-permission="'sales:orders:create'" type="primary" @click="submitImport" :loading="importing">导入</el-button>
        </span>
      </template>
        </AppDialog>
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { formatDate } from '@/utils/helpers/dateUtils'
import { formatCurrency } from '@/utils/format'
import { salesApi } from '@/api'
import { usePaginatedFetching } from '@/composables/useDataFetching'
import { parseListData, parseResponseData } from '@/utils/responseParser'
import dayjs from 'dayjs'
import { useRouter, useRoute } from 'vue-router'
const _router = useRouter()
const route = useRoute()
import { useFormKeyboardNav } from '@/composables/useFormKeyboardNav'
import { ArrowDown, Plus, Upload, Download } from '@element-plus/icons-vue'
import { getSalesStatusText, getSalesStatusColor, SALES_STATUS_OPTIONS } from '@/constants/systemConstants'
import printService from '@/services/printService'
// ========== 组合式函数导入 ==========
import { useOrderForm } from './composables/useOrderForm'
import { useOrderActions } from './composables/useOrderActions'
import { useOrderImportExport } from './composables/useOrderImportExport'
// ========== 本地状态 ==========
// 支持从应收发票页跳转：?orderNo= / ?orderId=
const searchQuery = ref(String(route.query.orderNo || route.query.keyword || '').trim())
const statusFilter = ref('')
const operatorFilter = ref('')
const dateRange = ref([])
const operators = ref([])
// 常量定义
const SEARCH_DEBOUNCE_DELAY = 300
// 状态映射（动态绑定配置中心）
const orderStatuses = SALES_STATUS_OPTIONS
// 订单统计数据
const orderStats = ref({
  total: 0, pending: 0, confirmed: 0, inProduction: 0,
  readyToShip: 0, shipped: 0, cancelled: 0
})
const isBlankAmount = (value) => value === null || value === undefined || value === ''
const normalizeAmount = (value) => {
  if (isBlankAmount(value)) return null
  const amount = Number(value)
  return Number.isNaN(amount) ? null : amount
}
const formatPrintAmount = (value) => {
  const amount = normalizeAmount(value)
  return amount === null ? '-' : amount.toFixed(2)
}
const formatQuantityTotal = (value) => {
  const quantity = Number(value)
  if (!Number.isFinite(quantity)) return '0'
  return quantity.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}
// 数据规范化处理函数
const normalizeOrdersData = (orders) => {
  if (!Array.isArray(orders)) return []
  // 后端已输出 camel；此处仅补全缺省与排序，不再做 snake 双读
  return orders.map((order) => ({
    ...order,
    orderDate: order.orderDate || order.createdAt,
    deliveryDate: order.deliveryDate,
    totalAmount: normalizeAmount(order.totalAmount),
    items: Array.isArray(order.items) ? order.items : []
  })).sort((a, b) => {
    const orderNoA = a.orderNo || ''
    const orderNoB = b.orderNo || ''
    return orderNoB.localeCompare(orderNoA)
  })
}
// 使用统一的分页数据获取Hook
const {
  loading, data: ordersData, pagination,
  fetchData, handlePageChange, handleSizeChange, updateParams
} = usePaginatedFetching(
  async (params) => {
    const queryParams = {
      search: searchQuery.value?.trim() || '',
      status: statusFilter.value,
      operator: params.operator || operatorFilter.value || '',
      sort: 'order_no', order: 'desc', ...params
    }
    if (params.operator) queryParams.operator = params.operator
    else if (operatorFilter.value) queryParams.operator = operatorFilter.value
    if (dateRange.value && dateRange.value.length === 2) {
      queryParams.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
      queryParams.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    }
    const response = await salesApi.getOrders(queryParams)
    const rawOrders = parseListData(response, { enableLog: false })
    const orders = normalizeOrdersData(rawOrders)
    return { ...response, data: { items: orders, total: response.data.total || orders.length } }
  },
  { pageSize: 10, immediate: true }
)
const tableData = computed(() => ordersData.value)
const currentPage = computed(() => pagination.current)
const pageSize = computed(() => pagination.pageSize)
const total = computed(() => pagination.total)
// ========== 解构组合式函数 ==========
const {
  dialogVisible, dialogLoading, dialogType,
  formRef, contractCodeInput, form, rules, filteredCustomers, customerSearchLoading,
  fetchCustomers, searchCustomers, handleCustomerChange, handleCustomerEnterKey,
  setMaterialSelectRef, setQuantityInputRef,
  addMaterial, removeMaterial,
  fetchMaterialSuggestions, handleMaterialSelect, handleMaterialClear,
  handleMaterialEnter, handleQuantityEnter,
  calculateItemAmount,
  totalQuantity,
  handleSubmit, handleAdd, handleEdit,
  vatRateOptions, financeStore
} = useOrderForm(fetchData, updateParams)
// 键盘导航：Enter 跳转下一字段
const { onFormKeydown: salesFormKeydown } = useFormKeyboardNav(() => handleSubmit())
const {
  detailsVisible, detailsLoading, currentOrder, actionLoadingId,
  handleConfirm, handleCancel, handleShip,
  handleLock, handleUnlock, handleView,
  canConfirm, canEdit, canShip, canCancel, canLock, canUnlock,
  orderViewNavigation
} = useOrderActions(fetchData, ordersData)
const {
  importDialogVisible, uploadRef,
  importing, importResult,
  handleImport, closeImportDialog, downloadTemplate,
  handleFileChange, submitImport, handleExport
} = useOrderImportExport(fetchData, searchQuery, statusFilter, operatorFilter, dateRange)
// ========== 本地方法 ==========
// 计算统计数据
const calculateOrderStats = (data = null) => {
  const ordersToCount = data || tableData.value
  const stats = {
    total: ordersToCount.length, pending: 0, confirmed: 0,
    inProduction: 0, readyToShip: 0, shipped: 0, cancelled: 0
  }
  ordersToCount.forEach(order => {
    const status = order.status
    if (status === 'pending' || status === 'draft') stats.pending++
    else if (status === 'confirmed') stats.confirmed++
    else if (status === 'in_production' || status === 'processing') stats.inProduction++
    else if (status === 'ready_to_ship') stats.readyToShip++
    else if (status === 'shipped' || status === 'completed' || status === 'delivered') stats.shipped++
    else if (status === 'cancelled') stats.cancelled++
  })
  orderStats.value = stats
}
// 获取全量订单统计数据
const fetchStats = async () => {
  try {
    const response = await salesApi.getOrderStats()
    const stats = parseResponseData(response, {})
    orderStats.value = {
      total: Number(stats.total) || 0,
      pending: Number(stats.pending) || 0,
      confirmed: Number(stats.confirmed) || 0,
      inProduction: Number(stats.inProduction) || 0,
      readyToShip: Number(stats.readyToShip) || 0,
      shipped: Number(stats.shipped) || 0,
      cancelled: Number(stats.cancelled) || 0
    }
  } catch (error) {
    console.error('获取订单统计数据失败:', error)
    calculateOrderStats()
  }
}
// 获取操作人列表
const fetchOperators = async () => {
  try {
    const response = await salesApi.getOrderOperators()
    operators.value = response.data || []
  } catch (error) {
    console.error('获取操作人列表失败:', error)
    operators.value = []
  }
}
const handleOperatorChange = (value) => { fetchData({ operator: value }) }
const resetSearch = () => {
  searchQuery.value = ''
  statusFilter.value = ''
  operatorFilter.value = ''
  dateRange.value = []
  fetchData()
}
let searchTimeout = null
const handleSearch = (immediate = false) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  if (immediate) { updateParams({ page: 1 }); fetchData() }
  else searchTimeout = setTimeout(() => { updateParams({ page: 1 }); fetchData() }, SEARCH_DEBOUNCE_DELAY)
}
const getOrderDateFromOrderNo = (orderNo) => {
  if (!orderNo || orderNo.length < 8) return ''
  try {
    const normalizedOrderNo = String(orderNo).trim()
    const dateStr = normalizedOrderNo.startsWith('P')
      ? normalizedOrderNo.substring(1, 7)
      : normalizedOrderNo.substring(2, 8)
    const year = parseInt('20' + dateStr.substring(0, 2))
    const month = parseInt(dateStr.substring(2, 4))
    const day = parseInt(dateStr.substring(4, 6))
    if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return ''
    const parsed = new Date(year, month - 1, day)
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return ''
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  } catch { return '' }
}
const getOrderDate = (row) => {
  for (const value of [row.orderDate, row.createdAt]) {
    const formatted = formatDate(value)
    if (formatted && formatted !== '-') return formatted
  }
  return getOrderDateFromOrderNo(row.orderNo) || '-'
}
// ========== 打印功能 ==========
const printLoading = ref(false)
const handlePrintOrder = async () => {
  if (!currentOrder.value) return
  printLoading.value = true
  try {
    // 组装打印数据，匹配模板变量
    const order = currentOrder.value
    // 打印模板变量仍为 snake；从 camel 业务对象单向映射
    const printData = {
      order_no: order.orderNo || '',
      order_date: getOrderDate(order) || '',
      delivery_date: formatDate(order.deliveryDate) || '',
      customer_name: order.customerName || order.customer || '',
      contact_phone: order.phone || order.contactPhone || '',
      delivery_address: order.address || '',
      total_amount: formatPrintAmount(order.totalAmount),
      remark: order.remarks || '',
      operator: order.createdByRealName || order.createdByName || '',
      items: (order.items || []).map((item, idx) => ({
        index: idx + 1,
        product_code: item.materialCode || item.code || '',
        product_name: item.materialName || item.name || '',
        specification: item.specification || '',
        quantity: parseFloat(item.quantity || 0).toFixed(2),
        unit_name: item.unitName || '',
        unit_price: formatPrintAmount(item.unitPrice),
        amount: formatPrintAmount(item.amount)
      }))
    }
    const html = await printService.generateByDefaultTemplate('sales', 'sales_order', printData)
    printService.previewDocument(html)
  } catch (error) {
    console.error('打印销售订单失败:', error)
    ElMessage.error('打印失败: ' + (error.message || '未知错误'))
  } finally {
    printLoading.value = false
  }
}
// ========== 生命周期 ==========
onMounted(async () => {
  try {
    await nextTick()
    // 发票页「跳转到销售订单」带来的筛选
    if (searchQuery.value) {
      updateParams({ search: searchQuery.value })
    }
    fetchStats()
    financeStore.loadSettings()
    setTimeout(() => { fetchCustomers() }, 500)
    fetchOperators()
  } catch (error) {
    console.error('❌ 组件挂载时出错:', error)
  }
})
onUnmounted(() => {
  if (searchTimeout) { clearTimeout(searchTimeout); searchTimeout = null }
  currentOrder.value = null
})
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
.search-form .el-select {
  width: 150px !important;
}
.search-buttons {
  display: flex;
  gap: 8px;
}
.more-actions {
  display: flex;
  justify-content: flex-start;
}
/* 查看对话框中的订单详情样式 */
.order-details,
.order-view {
  padding: 10px 0;
}
.order-details :deep(.el-descriptions),
.order-view :deep(.el-descriptions) {
  background: var(--color-bg-section);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}
.order-details :deep(.el-descriptions__label),
.order-view :deep(.el-descriptions__label) {
  font-weight: 500;
  color: var(--color-text-secondary);
}
.order-details :deep(.el-divider),
.order-view :deep(.el-divider) {
  margin: 20px 0 16px 0;
}
.order-details :deep(.el-divider__text),
.order-view :deep(.el-divider__text) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}
.order-details :deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}
.order-details :deep(.el-table th) {
  background: var(--color-bg-hover) !important;
  color: var(--color-text-secondary);
  font-weight: 600;
  font-size: 13px;
}
.order-details :deep(.el-table td) {
  font-size: 13px;
  color: var(--color-text-regular);
}
.operation-group {
  display: flex;
  gap: 4px;
}
.operation-group:not(:last-child) {
  border-right: 1px solid var(--color-border-lighter);
  padding-right: 8px;
}
.materials-table {
  margin-bottom: var(--spacing-lg);
  overflow: visible;
}
/* 移除所有高度限制 */
.el-table-column,
.el-table__body,
.el-table__header,
.el-table__body-wrapper,
.el-table__header-wrapper {
  max-height: none !important;
  height: auto !important;
  overflow: visible !important;
}
/* 物料选择下拉样式 */
:deep(.material-select-dropdown) {
  max-height: 400px !important;
}
:deep(.material-select-dropdown .el-scrollbar__wrap) {
  max-height: 400px !important;
}
:deep(.el-select-dropdown__list) {
  max-height: none !important;
}
:deep(.el-select-dropdown__wrap) {
  max-height: 400px !important;
}
/* 隐藏数字输入框的加减按钮 */
:deep(.el-input__inner[type="number"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}
:deep(.el-input__inner[type="number"]::-webkit-outer-spin-button),
:deep(.el-input__inner[type="number"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
/* 导入对话框样式 */
.import-tips {
  margin-top: 10px;
  padding: 10px;
  background-color: var(--color-primary-light-9);
  border: 1px solid var(--color-primary-light-7);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-text-regular);
}
.import-tips p {
  margin: 5px 0;
}
.import-result {
  margin-top: var(--spacing-lg);
  padding: 15px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}
.import-result h3 {
  margin: 0 0 10px 0;
  color: var(--color-text-primary);
  font-size: 16px;
}
.import-result h4 {
  margin: 15px 0 10px 0;
  color: var(--color-text-regular);
  font-size: 14px;
}
/* 物料选择框优化样式 */
.material-select-dropdown {
  min-width: 400px !important;
  max-width: 600px !important;
}
.material-select-dropdown .el-select-dropdown__item {
  height: auto !important;
  line-height: 1.4 !important;
  padding: 8px 12px !important;
  white-space: normal !important;
}
.material-select-dropdown .el-select-dropdown__item > div {
  width: 100% !important;
}
/* 确保物料编码完整显示 */
.el-table .el-table__cell {
  overflow: visible !important;
}
.el-select {
  width: 100% !important;
}
.el-select .el-input__inner {
  text-overflow: ellipsis !important;
}
/* 必填字段样式 */
.is-required-field :deep(.el-input__wrapper) {
  border-color: var(--color-danger) !important;
  background-color: var(--ds-red-bg) !important;
}
.is-required-field :deep(.el-input__wrapper):hover {
  border-color: var(--color-danger) !important;
}
.purchase-view-desc,
.purchase-view-desc :deep(.el-descriptions__body),
.purchase-view-desc :deep(.el-descriptions__table),
.purchase-view-table {
  width: 100%;
}
.purchase-view-desc :deep(.el-descriptions__label) {
  width: 112px;
  min-width: 112px;
  white-space: nowrap;
}
.purchase-view-desc :deep(.el-descriptions__content) {
  min-width: 0;
  white-space: normal;
  word-break: break-word;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 表单弹窗滚动由 dialog-system / AppDialog 统一管理 */
/* 表格容器宽度控制 */
.materials-table-container {
  width: 100%;
  overflow-x: auto;
}
</style>
