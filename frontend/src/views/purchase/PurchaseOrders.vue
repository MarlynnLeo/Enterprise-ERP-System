<!--
/**
 * PurchaseOrders.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page purchase-orders-container">
    <PageHeader :title="$t('page.purchase.orders.title')" subtitle="管理采购订单与跟踪">
      <template #actions>
<el-button type="primary" :icon="Plus" v-permission="'purchase:orders:create'" @click="openOrderDialog()">{{ $t('page.purchase.orders.add') }}</el-button>
      </template>
    </PageHeader>
    <!-- 搜索区域 -->
    <FinanceQueryCard
      :model="searchForm"
      :loading="loading"
      @search="handleSearch"
      @reset="resetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input
            v-model="searchForm.keyword"
            placeholder="物料名称"
            clearable
            @clear="handleSearch"
            @keyup.enter="handleSearch"
          ></el-input>
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item :label="$t('page.purchase.orders.status')">
          <el-select
            v-model="searchForm.status"
            :placeholder="$t('page.baseData.materials.statusPlaceholder')"
            clearable
            @change="handleSearch"
          >
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value"></el-option>
          </el-select>
        </el-form-item>
            <el-form-item :label="$t('page.purchase.orders.supplier')">
              <el-select
                v-model="searchForm.supplierId"
                :placeholder="$t('page.purchase.orders.supplierPlaceholder')"
                clearable
                filterable
                @change="handleSearch">
                <el-option
                  v-for="item in suppliers"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                ></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="操作人">
              <el-select
                v-model="searchForm.operator"
                placeholder="请选择操作人"
                clearable
                filterable
                @change="handleSearch"
              >
                <el-option
                  v-for="item in operators"
                  :key="item.username"
                  :label="item.realName || item.username"
                  :value="item.username"
                ></el-option>
              </el-select>
            </el-form-item>
            <el-form-item label="日期范围">
              <el-date-picker
                v-model="searchForm.date_range"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
                @change="handleSearch"
              ></el-date-picker>
            </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats.total || 0 }}</div>
        <div class="stat-label">订单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(orderStats.totalAmount) }}</div>
        <div class="stat-label">订单总金额</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats.pendingCount || 0 }}</div>
        <div class="stat-label">待审批订单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats.approvedCount || 0 }}</div>
        <div class="stat-label">已批准订单</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成订单</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        ref="orderTableRef"
        v-loading="loading"
        :data="orderList"
        border
        class="table-row-click w-full"
        @selection-change="handleSelectionChange"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => viewOrder(row.id))">
        <template #empty>
          <EmptyState description="暂无采购订单" />
        </template>
        <el-table-column type="selection" width="55" fixed="left"></el-table-column>
        <el-table-column prop="orderNo" label="订单编号" width="140" show-overflow-tooltip></el-table-column>
        <el-table-column prop="orderDate" label="订单日期" width="110"></el-table-column>
        <el-table-column label="到货倒计时" width="110">
          <template #default="scope">
            <el-tooltip
              :content="'预计到货：' + (scope.row.expectedDeliveryDate || '未设置')"
              placement="top"
            >
              <el-tag
                :type="getCountdownType(scope.row.expectedDeliveryDate, scope.row.status)"
                size="small"
              >
                {{ getCountdownText(scope.row.expectedDeliveryDate, scope.row.status) }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="supplierName" label="供应商" min-width="240" show-overflow-tooltip></el-table-column>
        <el-table-column prop="totalAmount" label="订单金额" width="120">
          <template #default="scope">
            {{ formatCurrency(scope.row.totalAmount) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="requisitionNumber" label="关联申请单" width="150" show-overflow-tooltip>
          <template #default="scope">
            <!-- 简化条件判断逻辑，直接检查requisition_id和requisition_number -->
            <el-link
              v-if="scope.row.requisitionId"
              type="primary"
              @click="viewRequisition(scope.row.requisitionId)"
            >
              {{ scope.row.requisitionNumber || `申请单-${scope.row.requisitionId}` }}
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="contractCode" label="合同编码" width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.contractCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="360" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="scope">
            
            <el-button
              v-if="scope.row.status === 'draft'"
              size="small"
              type="primary"
              v-permission="'purchase:orders:update'"
              @click="editOrder(scope.row.id)"
            >
              编辑
            </el-button>
            <el-popconfirm
              v-if="canDeleteOrder(scope.row)"
              title="确定要删除该订单吗？此操作无法恢复。"
              @confirm="deleteOrder(scope.row.id)"
              confirm-button-type="danger"
            >
              <template #reference>
                <el-button
                  size="small"
                  type="danger"
                  v-permission="'purchase:orders:delete'"
                  :disabled="loading"
                >
                  删除
                </el-button>
              </template>
            </el-popconfirm>
            <el-tooltip
              v-if="scope.row.status === 'draft'"
              :disabled="hasPurchaseOrderSupplier(scope.row)"
              content="请先编辑订单并设置供应商后再提交审批"
              placement="top"
            >
              <span class="inline-action-wrap">
                <el-button
                  size="small"
                  type="success"
                  v-permission="'purchase:orders:update'"
                  :disabled="loading || !hasPurchaseOrderSupplier(scope.row)"
                  @click="updateStatus(scope.row.id, 'pending')"
                >
                  提交审批
                </el-button>
              </span>
            </el-tooltip>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="warning"
              v-permission="'purchase:orders:approve'"
              @click="openApprovalDialog(scope.row)"
            >
              审批
            </el-button>
            <!-- 到货（confirmed/approved/partial_received 状态） -->
            <el-button
              v-if="['confirmed', 'approved', 'partial_received'].includes(scope.row.status)"
              size="small"
              type="primary"
              v-permission="'purchase:orders:update'"
              @click="openReceiveDialog(scope.row)"
            >
              到货
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页 -->
      <div class="flex-end mt-md">
        <el-pagination
          v-model:current-page="pagination.current"
          v-model:page-size="pagination.size"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    <!-- 订单编辑对话框 -->
    <AppDialog
      v-model="orderDialog.visible"
      :title="orderDialog.isEdit ? '编辑采购订单' : '新建采购订单'"
      mode="form"
      width="850px"
      :close-on-click-modal="false"
    >
      <el-form ref="orderFormRef" :model="orderForm" :rules="orderRules" label-width="110px" v-loading="orderDialog.loading">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="订单编号">
              <el-input v-model="orderForm.orderNumber" placeholder="系统自动生成" disabled class="w-full"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单日期" prop="orderDate">
              <el-date-picker
                v-model="orderForm.orderDate"
                type="date"
                placeholder="选择订单日期"
                class="w-full"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="预计到货日期" prop="expectedDeliveryDate">
              <el-date-picker
                v-model="orderForm.expectedDeliveryDate"
                type="date"
                placeholder="选择预计到货日期"
                class="w-full"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="供应商" prop="supplierId">
              <el-select
                v-model="orderForm.supplierId"
                filterable
                remote
                :remote-method="searchSuppliers"
                :loading="supplierLoading"
                placeholder="搜索并选择供应商"
                class="w-full"
                @change="handleSupplierChange"
                @focus="handleSupplierFocus"
              >
                <el-option
                  v-for="item in filteredSuppliers"
                  :key="item.id"
                  :label="item.name"
                  :value="String(item.id)"
                >
                  <span>{{ item.name }}</span>
                  <span class="option-name text-sm">{{ item.code }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="联系人">
              <el-input v-model="orderForm.contactPerson" placeholder="供应商联系人" class="w-full"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话">
              <el-input v-model="orderForm.contactPhone" placeholder="联系电话" class="w-full"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="默认税率">
              <el-select v-model="orderForm.taxRate" placeholder="选择税率" class="w-full">
                <el-option v-for="rate in vatRateOptions" :key="rate" :label="formatTaxRate(rate)" :value="rate"></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注">
          <el-input v-model="orderForm.notes" type="textarea" :rows="2" placeholder="备注信息" class="w-full"></el-input>
        </el-form-item>
        <!-- 物料列表 -->
        <el-divider content-position="center">物料列表</el-divider>
        <div class="material-actions flex-actions-mb">
          <el-button type="primary" @click="addMaterialRow">
            <el-icon><Plus /></el-icon>添加物料
          </el-button>
          <el-button @click="openRequisitionDialog">选择采购申请</el-button>
        </div>
        <el-table :data="orderForm.items" border class="w-full" max-height="350">
          <el-table-column label="序号" type="index" width="55"></el-table-column>
          <el-table-column label="物料" min-width="250">
            <template #default="scope">
              <el-autocomplete
                v-if="!scope.row.materialId"
                :ref="(el) => setMaterialSelectRef(el, scope.$index)"
                v-model="scope.row.materialDisplay"
                :fetch-suggestions="fetchMaterialSuggestions"
                placeholder="搜索物料编码/名称"
                class="w-full"
                value-key="value"
                :debounce="300"
                @select="(item) => handleMaterialSelect(item, scope.$index)"
                @keyup.enter="handleMaterialEnter(scope.$index)"
              >
                <template #default="{ item }">
                  <div class="flex-between">
                    <span>{{ item.code }} - {{ item.name }}</span>
                    <span class="text-muted text-sm">{{ item.specs }}</span>
                  </div>
                </template>
              </el-autocomplete>
              <div v-else class="line-height-tight">
                <div>{{ scope.row.materialCode }} - {{ scope.row.materialName }}</div>
                <div v-if="scope.row.specification" class="text-muted text-sm">{{ scope.row.specification }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="unit" label="单位" width="70">
            <template #default="scope">{{ scope.row.unit || scope.row.unitName || '-' }}</template>
          </el-table-column>
          <el-table-column label="数量" width="110">
            <template #default="scope">
              <el-input-number
                :ref="(el) => setQuantityInputRef(el, scope.$index)"
                v-model="scope.row.quantity"
                :min="0.01"
                :precision="2"
                :controls="false"
                class="w-full"
                @change="recalculatePrice(scope.row)"
                @keyup.enter="handleQuantityEnter(scope.$index)"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column label="单价" width="110">
            <template #default="scope">
              <el-input-number
                v-model="scope.row.price"
                :min="0"
                :precision="2"
                :controls="false"
                class="w-full"
                @change="recalculatePrice(scope.row)"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column label="税率" width="100">
            <template #default="scope">
              <el-select v-model="scope.row.taxRate" size="small" class="w-full">
                <el-option v-for="rate in vatRateOptions" :key="rate" :label="formatTaxRate(rate)" :value="rate"></el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="100">
            <template #default="scope">
              {{ formatOrderLineAmount(scope.row) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="70" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="scope">
              <el-button type="danger" link size="small" @click="removeItem(scope.$index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 合计金额 -->
        <div class="total-price summary-box">
          <el-row :gutter="20">
            <el-col :span="8" class="text-right">
              <span class="text-regular">小计: {{ formatCurrency(orderForm.subtotal) }}</span>
            </el-col>
            <el-col :span="8" class="text-right">
              <span class="text-warning">税额: {{ formatCurrency(orderForm.taxAmount) }}</span>
            </el-col>
            <el-col :span="8" class="text-right">
              <span class="text-primary font-weight-700">订单总金额: {{ formatCurrency(calculateTotalAmount()) }}</span>
            </el-col>
          </el-row>
        </div>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="orderDialog.visible = false">取消</el-button>
          <el-button v-permission="orderDialog.isEdit ? 'purchase:orders:update' : 'purchase:orders:create'" type="primary" @click="submitOrderForm">保存</el-button>
        </span>
      </template>
        </AppDialog>
    <AppDialog
      v-model="requisitionDialogVisible"
      title="选择未采购物料"
      mode="form"
      width="850px"
    >
      <div class="requisition-search">
        <el-input
          v-model="requisitionSearchKeyword"
          placeholder="输入物料编码或名称搜索"
          clearable
          @keyup.enter="searchRequisitions" >
          <template #append>
            <el-button @click="searchRequisitions">搜索</el-button>
          </template>
        </el-input>
      </div>

      <el-alert
        title="以下是所有采购申请中尚未生成采购订单的物料，可直接勾选需要采购的物料"
        type="info"
        :closable="false"
        show-icon
        class="mt-10"
      />

      <el-table
        ref="materialTableRef"
        :data="unorderedMaterialsList"
        border
        table-layout="fixed"
        class="w-full mt-15"
        @selection-change="handleMaterialSelectionChange"
        row-key="uniqueKey"
        max-height="400"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column prop="requisitionNumber" label="申请编号" width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="materialCode" label="物料编码" width="120">
          <template #default="{ row }">
            {{ row.materialCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="materialName" label="物料名称" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.materialName || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="规格型号" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.materialSpecs || row.specification || row.specs || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="供应商" width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <el-text v-if="row.supplierName && row.supplierName !== '暂无设置供应商'" type="primary">
              {{ row.supplierName }}
            </el-text>
            <el-text v-else type="info">
              暂无设置供应商
            </el-text>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="80">
          <template #default="{ row }">
            {{ parseFloat(row.quantity || 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="60">
          <template #default="{ row }">
            {{ row.unit || row.unitName || '-' }}
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container" v-if="unorderedMaterialsList.length > 0">
        <span class="text-regular">共 {{ unorderedMaterialsList.length }} 条未采购物料</span>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="requisitionDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmMaterialSelection">确定 ({{ selectedMaterials.length }})</el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 订单详情查看对话框 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="采购订单详情"
      mode="view"
      width="850px"
      :detail-navigation="purchaseOrderViewNavigation"
    >
      <div v-loading="detailLoading" class="order-view">
        <el-descriptions :column="2" border class="purchase-view-desc">
          <el-descriptions-item label="订单编号">{{ viewData.orderNumber }}</el-descriptions-item>
          <el-descriptions-item label="订单日期">{{ viewData.order_date }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ viewData.supplierName }}</el-descriptions-item>
          <el-descriptions-item label="预计交货日期">{{ viewData.expected_delivery_date }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ viewData.contact_person || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ viewData.contact_phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(viewData.status)">{{ getStatusText(viewData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="订单金额">{{ formatCurrency(viewData.totalAmount) }}</el-descriptions-item>
          <el-descriptions-item label="关联申请单" v-if="viewData.requisition_number">{{ viewData.requisition_number }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="viewData.requisition_number ? 1 : 2">{{ viewData.notes || '无' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider content-position="center">订单明细</el-divider>
        <el-table :data="viewData.items || []" border class="w-full purchase-view-table">
          <el-table-column type="index" label="序号" width="60"></el-table-column>
          <el-table-column prop="materialCode" label="物料编码" width="130" show-overflow-tooltip></el-table-column>
          <el-table-column prop="materialName" label="物料名称" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column prop="specification" label="规格" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column prop="unit" label="单位" width="70"></el-table-column>
          <el-table-column label="数量" width="90">
            <template #default="scope">
              {{ parseFloat(scope.row.quantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="单价" width="100">
            <template #default="scope">
              {{ formatCurrency(scope.row.price) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" width="120">
            <template #default="scope">
              {{ formatCurrency(scope.row.totalPrice) }}
            </template>
          </el-table-column>
          <el-table-column label="已收货" width="80">
            <template #default="scope">
              <el-text type="primary">{{ parseFloat(scope.row.receivedQuantity || 0).toFixed(1) }}</el-text>
            </template>
          </el-table-column>
          <el-table-column label="已入库" width="80">
            <template #default="scope">
              <el-text type="success">{{ parseFloat(scope.row.warehousedQuantity || 0).toFixed(1) }}</el-text>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
          <el-button type="primary" @click="printOrder">打印</el-button>
        </span>
      </template>
    </AppDialog>
    <!-- 申请单详情对话框 -->
    <AppDialog
      v-model="requisitionViewDialog.visible"
      title="采购申请详情"
      mode="view"
      width="850px"
    >
      <div v-loading="requisitionViewDialog.loading" class="order-view">
        <el-descriptions border :column="2" class="purchase-view-desc">
          <el-descriptions-item label="申请单号">{{ requisitionViewData.requisitionNumber || '未知' }}</el-descriptions-item>
          <el-descriptions-item label="申请日期">{{ formatDate(requisitionViewData.requestDate) }}</el-descriptions-item>
          <el-descriptions-item label="申请人">
            {{ requisitionViewData.realName || requisitionViewData.requester || '未知' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(requisitionViewData.status || 'draft')">{{ getStatusText(requisitionViewData.status || 'draft') }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(requisitionViewData.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDate(requisitionViewData.updatedAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ requisitionViewData.remarks || '无' }}</el-descriptions-item>
        </el-descriptions>
        <el-divider content-position="center">申请物料</el-divider>
        <el-table :data="requisitionViewData.materials || []" border class="w-full purchase-view-table">
          <el-table-column type="index" label="序号" width="60"></el-table-column>
          <el-table-column prop="materialCode" label="物料编码" min-width="120">
            <template #default="scope">
              {{ scope.row.materialCode || scope.row.materialCode || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="materialName" label="物料名称" min-width="150">
            <template #default="scope">
              {{ scope.row.materialName || scope.row.materialName || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="规格" min-width="150">
            <template #default="scope">
              {{ scope.row.specification || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="unit" label="单位" min-width="80">
            <template #default="scope">
              {{ scope.row.unit || scope.row.unitName || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" min-width="80">
            <template #default="scope">
              {{ parseFloat(scope.row.quantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="requisitionViewDialog.visible = false">关闭</el-button>
        </span>
      </template>
    </AppDialog>
    <!-- 到货对话框 -->
    <AppDialog
      v-model="receiveDialogVisible"
      title="确认到货"
      mode="form"
      width="850px"
      :close-on-click-modal="false"
    >
      <div v-loading="receiveDialogLoading">
        <el-alert
          title="提示"
          type="info"
          :closable="false"
          class="mb-20"
        >
          请选择本次到货的物料并填写到货数量。可以只选择部分物料到货。
        </el-alert>
        <el-table
          ref="receiveTableRef"
          :data="receiveForm.items"
          border
          class="w-full"
          max-height="400px"
        >
          <el-table-column type="index" label="序号" width="60"></el-table-column>
          <el-table-column prop="materialCode" label="物料编码" width="120"></el-table-column>
          <el-table-column prop="materialName" label="物料名称" min-width="120"></el-table-column>
          <el-table-column prop="specification" label="规格" width="200"></el-table-column>
          <el-table-column prop="unit" label="单位" width="55"></el-table-column>
          <el-table-column label="订单" width="70">
            <template #default="scope">
              {{ parseFloat(scope.row.quantity || 0).toFixed(1) }}
            </template>
          </el-table-column>
          <el-table-column label="已收货" width="70">
            <template #default="scope">
              <el-text type="primary">
                {{ parseFloat(scope.row.receivedQuantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="已检验" width="70">
            <template #default="scope">
              <el-text type="warning">
                {{ parseFloat(scope.row.inspectedQuantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="合格" width="70">
            <template #default="scope">
              <el-text type="success">
                {{ parseFloat(scope.row.qualifiedQuantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="不合格" width="70">
            <template #default="scope">
              <el-text
                v-if="parseFloat(scope.row.unqualifiedQuantity || 0) > 0"
                type="danger"
              >
                {{ parseFloat(scope.row.unqualifiedQuantity || 0).toFixed(1) }}
              </el-text>
              <el-text v-else type="info">0.0</el-text>
            </template>
          </el-table-column>
          <el-table-column label="已入库" width="70">
            <template #default="scope">
              <el-text type="success">
                {{ parseFloat(scope.row.warehousedQuantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="待收货" width="70">
            <template #default="scope">
              <el-text type="warning">
                {{ (parseFloat(scope.row.quantity || 0) - parseFloat(scope.row.receivedQuantity || 0)).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="到货" width="90">
            <template #default="scope">
              <el-input
                v-model="scope.row.receiveQuantity"
                size="small"
                :disabled="parseFloat(scope.row.pendingQuantity || 0) <= 0"
                @blur="handleReceiveQuantityChange(scope.row)"
                @keyup.enter="handleReceiveQuantityChange(scope.row)"
              />
            </template>
          </el-table-column>
        </el-table>
        <div class="mt-20 text-right">
          <el-text type="primary" size="large">
            本次到货总数量：{{ totalReceiveQuantity.toFixed(2) }}
          </el-text>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="receiveDialogVisible = false">取消</el-button>
          <el-button
            v-permission="'purchase:orders:update'"
            type="primary"
            @click="confirmReceive"
            :loading="receiveDialogLoading"
          >
            确认到货
          </el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedOrders.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><Select /></el-icon>
          <span>已选中 <strong>{{ selectedOrders.length }}</strong> 个订单</span>
        </div>
        <div class="batch-buttons">
          <el-button
            v-if="canBatchSubmit"
            v-permission="'purchase:orders:update'"
            type="success"
            @click="handleBatchSubmit"
            :loading="batchLoading"
          >
            <el-icon><Promotion /></el-icon> 批量提交
          </el-button>
          <el-button
            @click="clearSelection"
          >
            <el-icon><Close /></el-icon> 清空选择
          </el-button>
        </div>
      </div>
    </Transition>
    <BusinessApprovalDialog
      v-model="approvalDialog.visible"
      title="审批采购订单"
      :loading="approvalDialog.loading"
      v-model:comment="approvalDialog.comment"
      :summary-items="orderApprovalSummary"
      @approve="handleApproval('approve')"
      @reject="handleApproval('reject')"
    />
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { ref, reactive, computed, onMounted, onActivated } from 'vue'
import { useRoute } from 'vue-router'
import BusinessApprovalDialog from '@/components/workflow/BusinessApprovalDialog.vue'
import { useBusinessApproval } from '@/composables/useBusinessApproval'
import { purchaseApi } from '@/api'
import { Plus, Select, Promotion, Close } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { PURCHASE_STATUS_OPTIONS } from '@/constants/systemConstants'
import { parseListData } from '@/utils/responseParser'
import { loadUserListOptions } from '@/utils/optionLoaders'
const route = useRoute()
const authStore = useAuthStore()
// ========== 组合式函数导入 ==========
import { usePurchaseOrderForm } from './composables/usePurchaseOrderForm'
import { usePurchaseOrderActions } from './composables/usePurchaseOrderActions'
// ========== 搜索表单和分页 ==========
// 支持从应付发票页跳转：?orderNo= / ?orderId=
const searchForm = reactive({
  keyword: String(route.query.orderNo || route.query.keyword || '').trim(),
  status: '',
  supplierId: '',
  operator: '',
  date_range: [],
})
const pagination = reactive({ current: 1, size: 10, total: 0 })
const loading = ref(false)
const orderList = ref([])
const operators = ref([])
// 状态选项
const statusOptions = PURCHASE_STATUS_OPTIONS
// ========== 解构表单组合式函数 ==========
const {
  financeStore, vatRateOptions, formatTaxRate,
  suppliers, filteredSuppliers, supplierLoading,
  orderFormRef, orderDialog, orderForm, orderRules, setMaterialSelectRef, setQuantityInputRef,
  requisitionDialogVisible, requisitionSearchKeyword, unorderedMaterialsList, selectedMaterials, materialTableRef,
  loadSuppliers, searchSuppliers, handleSupplierFocus, handleSupplierChange,
  addMaterialRow, removeItem, recalculatePrice, calculateTotalAmount,
  fetchMaterialSuggestions, handleMaterialSelect, handleMaterialEnter, handleQuantityEnter, openOrderDialog, editOrder, submitOrderForm,
  searchRequisitions, openRequisitionDialog,
  handleMaterialSelectionChange, confirmMaterialSelection
} = usePurchaseOrderForm(loadOrders)
// ========== 解构操作组合式函数 ==========
const {
  detailLoading, viewDialogVisible, viewData,
  purchaseOrderViewNavigation,
  receiveDialogVisible, receiveDialogLoading, receiveForm, receiveTableRef, totalReceiveQuantity,
  requisitionViewDialog, requisitionViewData,
  orderTableRef, selectedOrders, batchLoading, canBatchSubmit,
  orderStats, formatDate, formatCurrency, getStatusText, getStatusType,
  getCountdownText, getCountdownType,
  hasPurchaseOrderSupplier,
  viewOrder, viewRequisition, updateStatus, deleteOrder: _deleteOrder,
  openReceiveDialog, handleReceiveQuantityChange, confirmReceive,
  printOrder, getOrderStats,
  handleSelectionChange, clearSelection, handleBatchSubmit
} = usePurchaseOrderActions(loadOrders, orderList)
// ========== 本地方法 ==========
const DELETABLE_ORDER_STATUSES = ['draft', 'pending', 'rejected', 'cancelled']
const canDeleteOrder = (row) => DELETABLE_ORDER_STATUSES.includes(row?.status)
const deleteOrder = _deleteOrder
const isBlankAmount = (value) => value === null || value === undefined || value === ''
const formatOrderLineAmount = (row) => {
  if (!isBlankAmount(row?.total_price)) return formatCurrency(row.totalPrice)
  if (isBlankAmount(row?.quantity) || isBlankAmount(row?.price)) return '-'
  return formatCurrency(Number(row.quantity) * Number(row.price))
}

// 加载订单列表
async function loadOrders() {
  loading.value = true
  try {
    const params = {
      page: pagination.current, pageSize: pagination.size,
      keyword: searchForm.keyword, status: searchForm.status,
      supplierId: searchForm.supplierId
    }
    if (searchForm.date_range && searchForm.date_range.length === 2) {
      params.startDate = searchForm.date_range[0]
      params.endDate = searchForm.date_range[1]
    }
    const res = await purchaseApi.getOrders(params)
    if (res.data) {
      const orderItems = parseListData(res, { enableLog: false })
      const formattedOrders = orderItems.map(order => {
        const requisitionId = order.requisitionId
        let requisitionNumber = order.requisitionNumber
        if (requisitionId && (!requisitionNumber || requisitionNumber === '' || requisitionNumber === '关联申请'))
          requisitionNumber = `申请单-${requisitionId}`
        return {
          ...order,
          order_date: formatDate(order.orderDate),
          expected_delivery_date: formatDate(order.expectedDeliveryDate),
          requisition_id: requisitionId, requisition_number: requisitionNumber
        }
      })
      orderList.value = formattedOrders
      pagination.total = res.data.total || 0
    }
  } catch (error) {
    console.error('获取采购订单列表失败:', error)
  } finally {
    loading.value = false
    getOrderStats()
  }
}
// 加载操作人列表
const loadOperators = async () => {
  try {
    operators.value = await loadUserListOptions()
  } catch (error) { console.error('加载操作人列表失败:', error); operators.value = [] }
}
// 搜索
const { approvalDialog, openApprovalDialog, handleApproval } = useBusinessApproval({
  businessType: 'purchase_order',
  onSuccess: async () => {
    await loadOrders()
    await getOrderStats()
  }
})
const orderApprovalSummary = computed(() => {
  const row = approvalDialog.row || {}
  return [
    { label: '订单编号', value: row.orderNo || row.order_no || '-' },
    { label: '供应商', value: row.supplierName || row.supplier_name || '-' },
    { label: '备注', value: row.remarks || row.notes || '无' }
  ]
})
const handleSearch = async () => { pagination.current = 1; await loadOrders(); await getOrderStats() }
const resetSearch = () => {
  searchForm.keyword = ''; searchForm.status = ''; searchForm.supplierId = ''; searchForm.operator = ''; searchForm.date_range = []
  pagination.current = 1; loadOrders()
}
const handleSizeChange = (val) => { pagination.size = val; loadOrders() }
const handleCurrentChange = (val) => { pagination.current = val; loadOrders() }
// 到货数量相关
const _checkItemSelectable = (row) => parseFloat(row.pendingQuantity || 0) > 0
// ========== 生命周期 ==========
onMounted(async () => {
  loading.value = true
  try {
    await Promise.allSettled([
      loadOrders(), loadSuppliers(), loadOperators(),
      financeStore.loadSettings(),
      authStore.fetchUserProfile(false)
    ])
  } catch (error) { console.error('页面初始化失败:', error) }
  finally { loading.value = false }
})
onActivated(async () => {
  try { await Promise.allSettled([loadOrders(), getOrderStats()]) }
  catch (error) { console.error('页面激活刷新失败:', error) }
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
.search-form {
  display: flex;
  flex-wrap: wrap;
}
/* 操作按钮样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
}
/* tooltip 包裹禁用按钮时保持行内布局 */
.inline-action-wrap {
  display: inline-block;
  margin-left: 8px;
  vertical-align: middle;
}
.inline-action-wrap:first-child {
  margin-left: 0;
}
.material-list-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}
.total-price {
  text-align: right;
  margin-top: 15px;
  font-size: 16px;
  font-weight: bold;
  color: var(--color-primary);
}
/* 物料选择下拉框样式 - 强制覆盖 */
:deep(.material-select-dropdown) {
  max-height: 500px !important;
  overflow-y: auto !important;
}
:deep(.material-select-dropdown .el-select-dropdown__item) {
  height: auto !important;
  min-height: 80px !important;
  line-height: normal !important;
  padding: 0 !important;
  white-space: normal !important;
  overflow: visible !important;
}
:deep(.material-select-dropdown .el-select-dropdown__item.hover) {
  background-color: var(--color-bg-hover) !important;
}
:deep(.material-select-dropdown .el-select-dropdown__item > div) {
  overflow: visible !important;
  white-space: normal !important;
  word-wrap: break-word !important;
}
/* 快速搜索下拉框样式 */
.quick-search-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  box-shadow: 0 2px 12px 0 color-mix(in srgb, var(--ds-black) 10%, transparent);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
}
.quick-search-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-bg-hover);
  transition: background-color 0.3s;
}
.quick-search-item:hover {
  background-color: var(--color-bg-hover);
}
.quick-search-item:last-child {
  border-bottom: none;
}
.quick-add-material {
  position: relative;
}
.material-search, .requisition-search {
  margin-bottom: 15px;
}
.delete-text-btn {
  padding: 0 4px;
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
/* 表格单元格不换行显示省略号 */
:deep(.el-table .cell) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 删除按钮红色样式 */
.delete-text-btn {
  color: var(--color-danger) !important;
  font-weight: 500;
}
.delete-text-btn:hover {
  color: var(--ds-red-strong) !important;
}
</style>
