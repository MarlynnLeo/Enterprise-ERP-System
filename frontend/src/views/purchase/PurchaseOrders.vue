<!--
/**
 * PurchaseOrders.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="purchase-orders-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>{{ $t('page.purchase.orders.title') }}</h2>
          <p class="subtitle">管理采购订单与跟踪</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openOrderDialog()">{{ $t('page.purchase.orders.add') }}</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :model="searchForm" :inline="true" class="search-form">
        <el-form-item label="查询">
          <el-input
            v-model="searchForm.keyword"
            placeholder="订单号或合同编码"
            clearable

            @clear="handleSearch"
            @keyup.enter="handleSearch"
          ></el-input>
        </el-form-item>
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
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch" style="margin-left: 8px;" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
          <el-button @click="showAdvancedFilter = !showAdvancedFilter" style="margin-left: 8px;">
            <el-icon><Filter /></el-icon> 高级筛选
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 高级筛选区域 -->
      <el-collapse-transition>
        <div v-show="showAdvancedFilter" class="advanced-filter" style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed var(--color-border-base);">
          <el-form :inline="true" class="search-form" >
            <el-form-item :label="$t('page.purchase.orders.supplier')">
              <el-select 
                v-model="searchForm.supplier_id"
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
                  :label="item.real_name || item.username"
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
          </el-form>
        </div>
      </el-collapse-transition>
    </el-card>
    
    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ orderStats.total || 0 }}</div>
        <div class="stat-label">订单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ formatCurrency(orderStats.totalAmount || 0) }}</div>
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
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <template #empty>
          <el-empty description="暂无采购订单" />
        </template>
        <el-table-column type="selection" width="55" fixed="left"></el-table-column>
        <el-table-column prop="order_no" label="订单编号" width="140" show-overflow-tooltip></el-table-column>
        <el-table-column prop="order_date" label="订单日期" width="110"></el-table-column>
        <el-table-column label="到货倒计时" width="110">
          <template #default="scope">
            <el-tooltip
              :content="'预计到货：' + (scope.row.expected_delivery_date || '未设置')"
              placement="top"
            >
              <el-tag
                :type="getCountdownType(scope.row.expected_delivery_date, scope.row.status)"
                size="small"
              >
                {{ getCountdownText(scope.row.expected_delivery_date, scope.row.status) }}
              </el-tag>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="supplier_name" label="供应商" min-width="240" show-overflow-tooltip></el-table-column>
        <el-table-column prop="total_amount" label="订单金额" width="120">
          <template #default="scope">
            ¥{{ parseFloat(scope.row.total_amount).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="110">
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">{{ getStatusText(scope.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="requisition_number" label="关联申请单" width="150" show-overflow-tooltip>
          <template #default="scope">
            <!-- 简化条件判断逻辑，直接检查requisition_id和requisition_number -->
            <el-link 
              v-if="scope.row.requisition_id" 
              type="primary" 
              @click="viewRequisition(scope.row.requisition_id)"
            >
              {{ scope.row.requisition_number || `申请单-${scope.row.requisition_id}` }}
            </el-link>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="contract_code" label="合同编码" width="200" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.contract_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="230" fixed="right">
          <template #default="scope">
            <el-button
              size="small"
              v-permission="'purchase:orders:view'"
              @click="viewOrder(scope.row.id)"
            >
              查看
            </el-button>
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
              v-if="scope.row.status === 'draft'"
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
            <el-button
              v-if="scope.row.status === 'draft'"
              size="small"
              type="success"
              v-permission="'purchase:orders:update'"
              @click="updateStatus(scope.row.id, 'pending')"
            >
              提交审批
            </el-button>
            <!-- 审批（pending 状态，不受通用权限控制，由审批流程决定谁可操作） -->
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="success"
              @click="updateStatus(scope.row.id, 'confirmed')"
            >
              批准
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="warning"
              @click="updateStatus(scope.row.id, 'draft')"
            >
              驳回
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
      <div style="display: flex; justify-content: flex-end; margin-top: 16px;">
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
    <el-dialog v-model="orderDialog.visible" :title="orderDialog.isEdit ? '编辑采购订单' : '新建采购订单'" width="50%" destroy-on-close :close-on-click-modal="false" align-center>
      <el-form ref="orderFormRef" :model="orderForm" :rules="orderRules" label-width="110px" v-loading="orderDialog.loading">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="订单编号">
              <el-input v-model="orderForm.order_number" placeholder="系统自动生成" disabled></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="订单日期" prop="order_date">
              <el-date-picker
                v-model="orderForm.order_date"
                type="date"
                placeholder="选择订单日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="预计到货日期" prop="expected_delivery_date">
              <el-date-picker
                v-model="orderForm.expected_delivery_date"
                type="date"
                placeholder="选择预计到货日期"
                style="width: 100%"
                value-format="YYYY-MM-DD"
              ></el-date-picker>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="供应商" prop="supplier_id">
              <el-select
                v-model="orderForm.supplier_id"
                filterable
                remote
                :remote-method="searchSuppliers"
                :loading="supplierLoading"
                placeholder="搜索并选择供应商"
                style="width: 100%"
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
                  <span style="float: right; color: #8492a6; font-size: 12px">{{ item.code }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="联系人">
              <el-input v-model="orderForm.contact_person" placeholder="供应商联系人"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="联系电话">
              <el-input v-model="orderForm.contact_phone" placeholder="联系电话"></el-input>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="16">
            <el-form-item label="备注">
              <el-input v-model="orderForm.notes" type="textarea" :rows="1" placeholder="备注信息"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="默认税率">
              <el-select v-model="orderForm.tax_rate" placeholder="选择税率" style="width: 100%">
                <el-option v-for="rate in vatRateOptions" :key="rate" :label="formatTaxRate(rate)" :value="rate"></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 物料列表 -->
        <el-divider content-position="left">物料列表</el-divider>

        <div class="material-actions" style="display: flex; gap: 10px; margin-bottom: 10px;">
          <el-button type="primary" @click="addMaterialRow">
            <el-icon><Plus /></el-icon>添加物料
          </el-button>
          <el-button @click="openRequisitionDialog">选择采购申请</el-button>
        </div>

        <el-table :data="orderForm.items" border style="width: 100%" max-height="350">
          <el-table-column label="序号" type="index" width="55" align="center"></el-table-column>
          <el-table-column label="物料" min-width="250">
            <template #default="scope">
              <el-autocomplete
                v-if="!scope.row.material_id"
                :ref="(el) => setMaterialSelectRef(el, scope.$index)"
                v-model="scope.row.material_display"
                :fetch-suggestions="fetchMaterialSuggestions"
                placeholder="搜索物料编码/名称"
                style="width: 100%"
                value-key="value"
                :debounce="300"
                @select="(item) => handleMaterialSelect(item, scope.$index)"
                @keyup.enter="handleMaterialEnter(scope.$index)"
              >
                <template #default="{ item }">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span>{{ item.code }} - {{ item.name }}</span>
                    <span style="color: #8492a6; font-size: 12px">{{ item.specs }}</span>
                  </div>
                </template>
              </el-autocomplete>
              <div v-else style="line-height: 1.4;">
                <div>{{ scope.row.material_code }} - {{ scope.row.material_name }}</div>
                <div v-if="scope.row.specification" style="color: #909399; font-size: 12px;">{{ scope.row.specification }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="unit" label="单位" width="70" align="center">
            <template #default="scope">{{ scope.row.unit || scope.row.unit_name || '-' }}</template>
          </el-table-column>
          <el-table-column label="数量" width="110">
            <template #default="scope">
              <el-input-number
                :ref="(el) => setQuantityInputRef(el, scope.$index)"
                v-model="scope.row.quantity"
                :min="0.01"
                :precision="2"
                :controls="false"
                style="width: 100%"
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
                style="width: 100%"
                @change="recalculatePrice(scope.row)"
              ></el-input-number>
            </template>
          </el-table-column>
          <el-table-column label="税率" width="100">
            <template #default="scope">
              <el-select v-model="scope.row.tax_rate" size="small" style="width: 100%">
                <el-option v-for="rate in vatRateOptions" :key="rate" :label="formatTaxRate(rate)" :value="rate"></el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="100" align="right">
            <template #default="scope">
              ¥{{ (scope.row.quantity * scope.row.price || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="70" align="center" fixed="right">
            <template #default="scope">
              <el-button type="danger" link size="small" @click="removeItem(scope.$index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <!-- 合计金额 -->
        <div class="total-price" style="margin-top: 15px; padding: 12px; background: #f5f7fa; border-radius: 4px;">
          <el-row :gutter="20">
            <el-col :span="8" style="text-align: right;">
              <span style="color: #606266;">小计: ￥{{ orderForm.subtotal?.toFixed(2) || '0.00' }}</span>
            </el-col>
            <el-col :span="8" style="text-align: right;">
              <span style="color: #e6a23c;">税额: ￥{{ orderForm.tax_amount?.toFixed(2) || '0.00' }}</span>
            </el-col>
            <el-col :span="8" style="text-align: right;">
              <span style="font-weight: bold; color: #409eff; font-size: 16px;">订单总金额: ￥{{ calculateTotalAmount() }}</span>
            </el-col>
          </el-row>
        </div>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="orderDialog.visible = false">取消</el-button>
          <el-button v-permission="'purchase:orders:update'" type="primary" @click="submitOrderForm">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog
      title="选择未采购物料"
      v-model="requisitionDialogVisible"
      width="55%"
      align-center
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
        style="margin-top: 10px;"
      />
      
      <el-table
        ref="materialTableRef"
        :data="unorderedMaterialsList"
        border
        table-layout="fixed"
        style="width: 100%; margin-top: 15px;"
        @selection-change="handleMaterialSelectionChange"
        row-key="uniqueKey"
        max-height="400"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column prop="requisition_number" label="申请编号" width="120" show-overflow-tooltip></el-table-column>
        <el-table-column prop="material_code" label="物料编码" width="120">
          <template #default="{ row }">
            {{ row.material_code || row.materialCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="material_name" label="物料名称" min-width="120" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_name || row.materialName || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="规格型号" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.material_specs || row.specification || row.specs || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="供应商" width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <el-text v-if="row.supplier_name && row.supplier_name !== '暂无设置供应商'" type="primary">
              {{ row.supplier_name }}
            </el-text>
            <el-text v-else type="info">
              暂无设置供应商
            </el-text>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="数量" width="80" align="right">
          <template #default="{ row }">
            {{ parseFloat(row.quantity || 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="60">
          <template #default="{ row }">
            {{ row.unit || row.unitName || row.unit_name || '-' }}
          </template>
        </el-table-column>
      </el-table>
      
      <div class="pagination-container" v-if="unorderedMaterialsList.length > 0">
        <span style="color: #606266; font-size: 14px;">共 {{ unorderedMaterialsList.length }} 条未采购物料</span>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="requisitionDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmMaterialSelection">确定 ({{ selectedMaterials.length }})</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 订单详情查看对话框 -->
    <el-dialog v-model="viewDialogVisible" title="采购订单详情" width="70%" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单编号">{{ viewData.order_number }}</el-descriptions-item>
          <el-descriptions-item label="订单日期">{{ viewData.order_date }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ viewData.supplier_name }}</el-descriptions-item>
          <el-descriptions-item label="预计交货日期">{{ viewData.expected_delivery_date }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ viewData.contact_person || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ viewData.contact_phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(viewData.status)">{{ getStatusText(viewData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="订单金额">¥{{ parseFloat(viewData.total_amount || 0).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="关联申请单" v-if="viewData.requisition_number">{{ viewData.requisition_number }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="viewData.requisition_number ? 1 : 2">{{ viewData.notes || '无' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="center">订单明细</el-divider>

        <el-table :data="viewData.items || []" border style="width: 100%">
          <el-table-column type="index" label="序号" width="60" align="center"></el-table-column>
          <el-table-column prop="material_code" label="物料编码" width="130" show-overflow-tooltip></el-table-column>
          <el-table-column prop="material_name" label="物料名称" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column prop="specification" label="规格" min-width="150" show-overflow-tooltip></el-table-column>
          <el-table-column prop="unit" label="单位" width="70"></el-table-column>
          <el-table-column label="数量" width="90" align="right">
            <template #default="scope">
              {{ parseFloat(scope.row.quantity || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="单价" width="100" align="right">
            <template #default="scope">
              ¥{{ parseFloat(scope.row.price || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="金额" width="120" align="right">
            <template #default="scope">
              ¥{{ parseFloat(scope.row.total_price || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="已收货" width="80" align="right">
            <template #default="scope">
              <el-text type="primary">{{ parseFloat(scope.row.received_quantity || 0).toFixed(1) }}</el-text>
            </template>
          </el-table-column>
          <el-table-column label="已入库" width="80" align="right">
            <template #default="scope">
              <el-text type="success">{{ parseFloat(scope.row.warehoused_quantity || 0).toFixed(1) }}</el-text>
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
    </el-dialog>

    <!-- 申请单详情对话框 -->
    <el-dialog
      v-model="requisitionViewDialog.visible"
      title="采购申请详情"
      width="1050px"
      destroy-on-close
      align-center
    >
      <div v-loading="requisitionViewDialog.loading">
        <el-descriptions border :column="2">
          <el-descriptions-item label="申请单号">{{ requisitionViewData.requisition_number || requisitionViewData.requisitionNumber || '未知' }}</el-descriptions-item>
          <el-descriptions-item label="申请日期">{{ formatDate(requisitionViewData.request_date || requisitionViewData.requestDate) }}</el-descriptions-item>
          <el-descriptions-item label="申请人">
            {{ requisitionViewData.real_name || requisitionViewData.requester || '未知' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(requisitionViewData.status || 'draft')">{{ getStatusText(requisitionViewData.status || 'draft') }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(requisitionViewData.created_at || requisitionViewData.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatDate(requisitionViewData.updated_at || requisitionViewData.updatedAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ requisitionViewData.remarks || '无' }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="center">申请物料</el-divider>

        <el-table :data="requisitionViewData.materials || []" border style="width: 100%">
          <el-table-column type="index" label="序号" width="60" align="center"></el-table-column>
          <el-table-column prop="material_code" label="物料编码" min-width="120">
            <template #default="scope">
              {{ scope.row.material_code || scope.row.materialCode || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="material_name" label="物料名称" min-width="150">
            <template #default="scope">
              {{ scope.row.material_name || scope.row.materialName || '-' }}
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
    </el-dialog>

    <!-- 到货对话框 -->
    <el-dialog
      v-model="receiveDialogVisible"
      title="确认到货"
      width="1000px"
      destroy-on-close
      :close-on-click-modal="false"
      align-center
    >
      <div v-loading="receiveDialogLoading">
        <el-alert
          title="提示"
          type="info"
          :closable="false"
          style="margin-bottom: 20px;"
        >
          请选择本次到货的物料并填写到货数量。可以只选择部分物料到货。
        </el-alert>

        <el-table
          ref="receiveTableRef"
          :data="receiveForm.items"
          border
          style="width: 100%"
          max-height="400px"
        >
          <el-table-column type="index" label="序号" width="60" align="center"></el-table-column>
          <el-table-column prop="material_code" label="物料编码" width="120"></el-table-column>
          <el-table-column prop="material_name" label="物料名称" min-width="120"></el-table-column>
          <el-table-column prop="specification" label="规格" width="200"></el-table-column>
          <el-table-column prop="unit" label="单位" width="55"></el-table-column>
          <el-table-column label="订单" width="70" align="right">
            <template #default="scope">
              {{ parseFloat(scope.row.quantity || 0).toFixed(1) }}
            </template>
          </el-table-column>
          <el-table-column label="已收货" width="70" align="right">
            <template #default="scope">
              <el-text type="primary">
                {{ parseFloat(scope.row.received_quantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="已检验" width="70" align="right">
            <template #default="scope">
              <el-text type="warning">
                {{ parseFloat(scope.row.inspected_quantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="合格" width="70" align="right">
            <template #default="scope">
              <el-text type="success">
                {{ parseFloat(scope.row.qualified_quantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="不合格" width="70" align="right">
            <template #default="scope">
              <el-text
                v-if="parseFloat(scope.row.unqualified_quantity || 0) > 0"
                type="danger"
              >
                {{ parseFloat(scope.row.unqualified_quantity || 0).toFixed(1) }}
              </el-text>
              <el-text v-else type="info">0.0</el-text>
            </template>
          </el-table-column>
          <el-table-column label="已入库" width="70" align="right">
            <template #default="scope">
              <el-text type="success">
                {{ parseFloat(scope.row.warehoused_quantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="待收货" width="70" align="right">
            <template #default="scope">
              <el-text type="warning">
                {{ (parseFloat(scope.row.quantity || 0) - parseFloat(scope.row.received_quantity || 0)).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="到货" width="90">
            <template #default="scope">
              <el-input
                v-model="scope.row.receive_quantity"
                size="small"

                :disabled="parseFloat(scope.row.pending_quantity || 0) <= 0"
                @blur="handleReceiveQuantityChange(scope.row)"
                @keyup.enter="handleReceiveQuantityChange(scope.row)"
              />
            </template>
          </el-table-column>
        </el-table>

        <div style="margin-top: 20px; text-align: right;">
          <el-text type="primary" size="large">
            本次到货总数量：{{ totalReceiveQuantity.toFixed(2) }}
          </el-text>
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="receiveDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmReceive" :loading="receiveDialogLoading">
            确认到货
          </el-button>
        </span>
      </template>
    </el-dialog>

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
            type="success"
            @click="handleBatchSubmit"
            :loading="batchLoading"
          >
            <el-icon><Promotion /></el-icon> 批量提交
          </el-button>
          <el-button
            v-if="canBatchApprove"
            type="primary"
            @click="handleBatchApprove"
            :loading="batchLoading"
          >
            <el-icon><CircleCheck /></el-icon> 批量批准
          </el-button>
          <el-button
            @click="clearSelection"
          >
            <el-icon><Close /></el-icon> 清空选择
          </el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onActivated, computed } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/services/api'
import { Plus, Search, Refresh, Select, Promotion, CircleCheck, Close, Filter } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { PURCHASE_STATUS_OPTIONS } from '@/constants/purchaseConstants'
import { parseListData } from '@/utils/responseParser'

const router = useRouter()
const authStore = useAuthStore()
const showAdvancedFilter = ref(false)

// ========== 组合式函数导入 ==========
import { usePurchaseOrderForm } from './composables/usePurchaseOrderForm'
import { usePurchaseOrderActions } from './composables/usePurchaseOrderActions'

// ========== 搜索表单和分页 ==========
const searchForm = reactive({ keyword: '', status: '', supplier_id: '', operator: '', date_range: [] })
const pagination = reactive({ current: 1, size: 10, total: 0 })
const loading = ref(false)
const orderList = ref([])
const operators = ref([])

// 状态选项
const statusOptions = PURCHASE_STATUS_OPTIONS

// ========== 解构表单组合式函数 ==========
const {
  financeStore, vatRateOptions, defaultVATRate, formatTaxRate,
  suppliers, filteredSuppliers, supplierLoading,
  filteredProducts, materialsLoading, materialSearchLoading,
  orderFormRef, orderDialog, orderForm, orderRules,
  materialSelectRefs, quantityInputRefs, setMaterialSelectRef, setQuantityInputRef,
  requisitionDialogVisible, requisitionDialogLoading, requisitionSearchKeyword,
  requisitionList, unorderedMaterialsList, selectedMaterials, materialTableRef, requisitionPagination,
  loadSuppliers, ensureSupplierExists, searchSuppliers, handleSupplierFocus, handleSupplierChange,
  addMaterialRow, removeItem, recalculatePrice, formatQuantity, calculateTotalAmount,
  fetchMaterialSuggestions, handleMaterialSelect, handleMaterialEnter, handleQuantityEnter,
  handleMaterialDisplayChange, handleMaterialChange, formatMaterialLabel,
  resetOrderForm, loadOrderDetails, openOrderDialog, handleCreate, editOrder, submitOrderForm,
  searchRequisitions, openRequisitionDialog, removeRequisition,
  handleMaterialSelectionChange, loadRequisitions, confirmMaterialSelection
} = usePurchaseOrderForm(loadOrders)

// ========== 解构操作组合式函数 ==========
const {
  detailLoading, viewDialogVisible, viewData,
  receiveDialogVisible, receiveDialogLoading, receiveForm, receiveTableRef, totalReceiveQuantity,
  requisitionViewDialog, requisitionViewData,
  orderTableRef, selectedOrders, batchLoading, canBatchSubmit, canBatchApprove,
  orderStats, formatDate, formatCurrency, getStatusText, getStatusType,
  getCountdownText, getCountdownType,
  viewOrder, viewRequisition, updateStatus, deleteOrder,
  openReceiveDialog, handleReceiveQuantityChange, confirmReceive, updateReceiving,
  printOrder, getOrderStats,
  handleSelectionChange, clearSelection, handleBatchSubmit, handleBatchApprove
} = usePurchaseOrderActions(loadOrders, orderList)

// ========== 本地方法 ==========

// 加载订单列表
async function loadOrders() {
  loading.value = true
  try {
    const params = {
      page: pagination.current, pageSize: pagination.size,
      keyword: searchForm.keyword, status: searchForm.status,
      supplierId: searchForm.supplier_id
    }
    if (searchForm.date_range && searchForm.date_range.length === 2) {
      params.startDate = searchForm.date_range[0]
      params.endDate = searchForm.date_range[1]
    }
    const res = await api.get('/purchase/orders', { params })
    if (res.data) {
      const orderItems = parseListData(res, { enableLog: false })
      const formattedOrders = orderItems.map(order => {
        const requisitionId = order.requisition_id || order.requisitionId
        let requisitionNumber = order.requisition_number || order.requisitionNumber
        if (requisitionId && (!requisitionNumber || requisitionNumber === '' || requisitionNumber === '关联申请'))
          requisitionNumber = `申请单-${requisitionId}`
        return {
          ...order,
          order_date: formatDate(order.order_date),
          expected_delivery_date: formatDate(order.expected_delivery_date),
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
    const res = await api.get('/system/users/list')
    operators.value = parseListData(res, { logPrefix: '操作人', enableLog: false })
  } catch (error) { console.error('加载操作人列表失败:', error); operators.value = [] }
}

// 搜索
const handleSearch = async () => { pagination.current = 1; await loadOrders(); await getOrderStats() }
const resetSearch = () => {
  searchForm.keyword = ''; searchForm.status = ''; searchForm.supplier_id = ''; searchForm.operator = ''; searchForm.date_range = []
  pagination.current = 1; loadOrders()
}
const handleSizeChange = (val) => { pagination.size = val; loadOrders() }
const handleCurrentChange = (val) => { pagination.current = val; loadOrders() }

// 到货数量相关
const checkItemSelectable = (row) => parseFloat(row.pending_quantity || 0) > 0

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

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

/* 浮动批量操作栏样式 */
.floating-batch-bar {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.4), 0 4px 16px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  gap: 32px;
  min-width: 400px;
}

.floating-batch-bar .batch-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
  font-size: 14px;
}

.floating-batch-bar .batch-info .el-icon {
  font-size: 20px;
}

.floating-batch-bar .batch-info strong {
  color: #ffd700;
  font-size: 18px;
  margin: 0 2px;
}

.floating-batch-bar .batch-buttons {
  display: flex;
  gap: 12px;
}

.floating-batch-bar .batch-buttons .el-button {
  border: 1px solid rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.floating-batch-bar .batch-buttons .el-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* 浮动栏进入/离开动画 */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 100%);
}

/* 操作按钮样式 - 与库存出库页面保持一致 */
.el-table .el-button + .el-button {
  margin-left: 8px;
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
  background: white;
  border: 1px solid var(--color-border-base);
  border-radius: var(--radius-sm);
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
}

.quick-search-item {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f5f7fa;
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
/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
}

.delete-text-btn {
  padding: 0 4px;
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
  color: #f78989 !important;
}
</style> 