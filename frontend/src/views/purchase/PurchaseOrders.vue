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
              @click="updateStatus(scope.row.id, 'pending')"
              :disabled="loading"
            >
              提交
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="success"
              @click="updateStatus(scope.row.id, 'approved')"
              :disabled="loading"
            >
              批准订单
            </el-button>
            <el-button
              v-if="scope.row.status === 'approved'"
              size="small"
              type="primary"
              @click="openReceiveDialog(scope.row)"
              :disabled="loading"
            >
              到货
            </el-button>
            <el-button
              v-if="scope.row.status === 'partial_received'"
              size="small"
              type="primary"
              @click="openReceiveDialog(scope.row)"
              :disabled="loading"
            >
              更新收货
            </el-button>
            <el-button
              v-if="scope.row.status === 'pending'"
              size="small"
              type="warning"
              @click="updateStatus(scope.row.id, 'cancelled')"
              :disabled="loading"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      
      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.current"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pagination.size"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
      </div>
    </el-card>
    
    <!-- 查看订单详情对话框 -->
    <el-dialog
      title="采购订单详情"
      v-model="viewDialogVisible"
      width="1050px"
      destroy-on-close
      align-center
    >
      <div v-loading="detailLoading">
        <el-descriptions border :column="2">
          <el-descriptions-item label="订单编号">{{ viewData.order_number }}</el-descriptions-item>
          <el-descriptions-item label="订单日期">{{ viewData.order_date }}</el-descriptions-item>
          <el-descriptions-item label="预计到货日期">{{ viewData.expected_delivery_date }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(viewData.status)">{{ getStatusText(viewData.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="供应商">{{ viewData.supplier_name }}</el-descriptions-item>
          <el-descriptions-item label="总金额">¥{{ parseFloat(viewData.total_amount).toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="联系人">{{ viewData.contact_person }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ viewData.contact_phone }}</el-descriptions-item>
          <el-descriptions-item label="关联申请单" v-if="viewData.requisition_id">
            <el-link type="primary" @click="viewRequisition(viewData.requisition_id)">
              {{ viewData.requisition_number || `申请单-${viewData.requisition_id}` }}
            </el-link>
          </el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ viewData.notes }}</el-descriptions-item>
        </el-descriptions>
        
        <el-divider content-position="center">订单物料</el-divider>
        <el-table :data="viewData.items || []" border style="width: 100%">
          <el-table-column type="index" label="序号" width="55" align="center"></el-table-column>
          <el-table-column prop="material_code" label="物料编码" min-width="120">
            <template #default="scope">
              {{ scope.row.material_code || scope.row.materialCode || scope.row.code || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="material_name" label="物料名称" min-width="130">
            <template #default="scope">
              {{ scope.row.material_name || scope.row.materialName || scope.row.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="规格" min-width="200">
            <template #default="scope">
              {{ scope.row.specs || scope.row.specification || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="unit" label="单位" min-width="55">
            <template #default="scope">
              {{ scope.row.unit || scope.row.unitName || scope.row.unit_name || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="订购数量" width="90" align="right">
            <template #default="scope">
              {{ parseFloat(scope.row.quantity || 0).toFixed(1) }}
            </template>
          </el-table-column>
          <el-table-column label="已收货" width="80" align="right">
            <template #default="scope">
              <el-text type="primary">
                {{ parseFloat(scope.row.received_quantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="已入库" width="80" align="right">
            <template #default="scope">
              <el-text type="success">
                {{ parseFloat(scope.row.warehoused_quantity || 0).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column label="不合格" width="80" align="right">
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
          <el-table-column label="待收货" width="80" align="right">
            <template #default="scope">
              <el-text type="warning">
                {{ (parseFloat(scope.row.quantity || 0) - parseFloat(scope.row.received_quantity || 0)).toFixed(1) }}
              </el-text>
            </template>
          </el-table-column>
          <el-table-column prop="price" label="单价" width="80" align="right">
            <template #default="scope">
              ¥{{ parseFloat(scope.row.price || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="税率" width="70" align="right">
            <template #default="scope">
              {{ ((parseFloat(scope.row.tax_rate || 0)) * 100).toFixed(0) }}%
            </template>
          </el-table-column>
          <el-table-column label="税额" width="90" align="right">
            <template #default="scope">
              ¥{{ parseFloat(scope.row.tax_amount || 0).toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="总价" min-width="120">
            <template #default="scope">
              ¥{{ (parseFloat(scope.row.total_price || scope.row.totalPrice || (scope.row.quantity * scope.row.price) || 0) + parseFloat(scope.row.tax_amount || 0)).toFixed(2) }}
            </template>
          </el-table-column>
        </el-table>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
          <el-button v-permission="'purchase:orders:print'" 
            type="primary" 
            @click="printOrder"
            v-if="viewData.status !== 'draft'"
          >打印订单</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 新建/编辑采购订单对话框 -->
    <el-dialog
      v-model="orderDialog.visible"
      :title="orderDialog.isEdit ? '编辑采购订单' : '新建采购订单'"
      width="1065px"
      destroy-on-close
      align-center
    >
      <el-form ref="orderFormRef" :model="orderForm" :rules="orderRules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="订单编号" prop="order_number">
              <el-input v-model="orderForm.order_number" placeholder="系统自动生成" disabled></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
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
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
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
          <el-col :span="12">
            <el-form-item label="供应商" prop="supplier_id">
              <el-select
                v-model="orderForm.supplier_id"
                filterable
                remote
                reserve-keyword
                :remote-method="searchSuppliers"
                :loading="supplierLoading"
                placeholder="请输入供应商名称或编码进行搜索"
                style="width: 100%"
                @change="handleSupplierChange"
                @focus="handleSupplierFocus"
                default-first-option
              >
                <el-option
                  v-for="item in filteredSuppliers"
                  :key="item.id"
                  :label="`${item.name} (${item.code || item.supplier_code || ''})`"
                  :value="String(item.id)"
                >
                  <span style="float: left">{{ item.name }}</span>
                  <span style="float: right; color: #8492a6; font-size: 13px">{{ item.code || item.supplier_code || '' }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="联系人" prop="contact_person">
              <el-input v-model="orderForm.contact_person" placeholder="供应商联系人"></el-input>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="联系电话" prop="contact_phone">
              <el-input v-model="orderForm.contact_phone" placeholder="联系电话"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <el-row :gutter="20">

          <el-col :span="12">
            <el-form-item label="备注" prop="notes">
              <el-input v-model="orderForm.notes" type="textarea" :rows="1" placeholder="备注信息"></el-input>
            </el-form-item>
          </el-col>
        </el-row>
        
        <!-- 物料列表 -->
        <el-divider content-position="left">物料列表</el-divider>

        <div class="material-list-header">
          <el-button type="primary" @click="openRequisitionDialog">选择采购申请</el-button>
        </div>
        
        <el-table :data="orderForm.items" border style="width: 100%; margin-top: 15px;">
          <el-table-column label="序号" type="index" width="60" align="center"></el-table-column>
          <el-table-column label="物料编码" width="140">
            <template #default="{ row, $index }">
              <el-autocomplete
                :ref="(el) => setMaterialSelectRef(el, $index)"
                v-model="row.material_code"
                placeholder="输入物料编码"
                clearable
                :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                @select="(item) => handleMaterialSelect(item, $index)"
                @keydown.enter="handleMaterialEnter($index)"
                style="width: 100%"
                :trigger-on-focus="false"
                :debounce="300"
              >
                <template #default="{ item }">
                  <div style="display: flex; align-items: center; gap: 12px; padding: 4px 0;">
                    <span style="font-weight: 500; font-size: 13px; min-width: 100px;">{{ item.code }}</span>
                    <span style="color: #606266; font-size: 13px; flex: 1;">{{ item.name }}</span>
                    <span v-if="item.specs" style="color: #909399; font-size: 12px;">{{ item.specs }}</span>
                  </div>
                </template>
              </el-autocomplete>
            </template>
          </el-table-column>
          <el-table-column label="物料名称" width="140" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.material_name || scope.row.name || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="规格" width="140" show-overflow-tooltip>
            <template #default="scope">
              {{ scope.row.specs || scope.row.specification || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="单位" min-width="70">
            <template #default="scope">
              {{ scope.row.unit || scope.row.unit_name || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" width="80">
            <template #default="{ row, $index }">
              <el-input
                :ref="(el) => setQuantityInputRef(el, $index)"
                v-model="row.quantity"
                placeholder="数量"
                style="width: 100%"
                @change="recalculatePrice(row)"
                @blur="formatQuantity(row)"
                @keydown.enter="handleQuantityEnter($index)"
              ></el-input>
            </template>
          </el-table-column>
          <el-table-column prop="price" label="单价" width="80">
            <template #default="scope">
              <el-input
                v-model="scope.row.price"
                placeholder="单价"
                style="width: 100%"
                @change="recalculatePrice(scope.row)"
              ></el-input>
            </template>
          </el-table-column>
          <el-table-column prop="tax_rate" label="税率" width="100">
            <template #default="scope">
              <el-select 
                v-model="scope.row.tax_rate" 
                placeholder="税率" 
                style="width: 100%" 
                @change="recalculatePrice(scope.row)"
              >
                <el-option
                  v-for="rate in vatRateOptions"
                  :key="rate"
                  :label="formatTaxRate(rate)"
                  :value="rate"
                />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column prop="tax_amount" label="税额" width="90">
            <template #default="scope">
              <span>{{ (scope.row.tax_amount || 0).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="total_price" label="总价" width="80">
            <template #default="scope">
              <span>{{ (scope.row.quantity * scope.row.price).toFixed(2) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="80" align="center" fixed="right">
            <template #default="scope">
              <el-button
                link
                class="delete-text-btn"
                @click="removeItem(scope.$index)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <div class="add-material" style="margin-top: 10px;">
          <el-button type="primary" @click="addMaterialRow">
            <el-icon><Plus /></el-icon>添加物料
          </el-button>
        </div>
        
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
import apiAdapter from '@/utils/apiAdapter';

import { ref, reactive, onMounted, onActivated, nextTick, computed } from 'vue';
import { ElMessage, ElMessageBox, ElLoading } from 'element-plus';
import { useRouter } from 'vue-router';
import { api, purchaseApi, supplierApi, baseDataApi } from '@/services/api'
import { Plus, Search, Refresh, Select, Promotion, CircleCheck, Close, Filter } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth';
import { usePurchaseInspection } from '@/composables/usePurchaseInspection';
import { PURCHASE_STATUS, PURCHASE_STATUS_OPTIONS, PURCHASE_STATUS_ACTION_TEXT, isValidStatusTransition, getStatusLabel } from '@/constants/purchaseConstants'
import { searchMaterials } from '@/utils/searchConfig';
import { parseListData } from '@/utils/responseParser';
import { useFinanceStore } from '@/stores/finance';
import { storeToRefs } from 'pinia';
import { getPurchaseStatusText, getPurchaseStatusColor } from '@/constants/systemConstants';

const router = useRouter();
const authStore = useAuthStore();
const showAdvancedFilter = ref(false);

// 财务 store
const financeStore = useFinanceStore();
const { vatRateOptions, defaultVATRate } = storeToRefs(financeStore);

// 格式化税率显示
const formatTaxRate = (rate) => {
  if (rate === null ||rate === undefined) return '0%';
  return `${(rate * 100).toFixed(0)}%`;
};

// 使用采购检验组合式函数
const { createInspectionForOrder, showInspectionResult } = usePurchaseInspection();

// 批量操作相关
const orderTableRef = ref(null);
const selectedOrders = ref([]);
const batchLoading = ref(false);

// ✅ 使用统一的状态选项
const statusOptions = PURCHASE_STATUS_OPTIONS;

// 格式化日期函数，移除ISO日期字符串中的时间部分
const formatDate = (dateString) => {
  if (!dateString) return '';
  // 如果日期包含T和时区信息，只保留年月日部分
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }
  return dateString;
};

// 计算倒计时文本
const getCountdownText = (deliveryDate, status) => {
  // 如果订单已完成，显示已完成
  if (status === 'completed') {
    return '已完成';
  }

  // 如果订单已取消，显示已取消
  if (status === 'cancelled') {
    return '已取消';
  }

  if (!deliveryDate) return '未设置';

  const today = new Date();
  const delivery = new Date(deliveryDate);

  // 设置时间为当天的开始，避免时间差异
  today.setHours(0, 0, 0, 0);
  delivery.setHours(0, 0, 0, 0);

  const diffTime = delivery - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `已逾期${Math.abs(diffDays)}天`;
  } else if (diffDays === 0) {
    return '今天到货';
  } else if (diffDays === 1) {
    return '明天到货';
  } else {
    return `还有${diffDays}天`;
  }
};

// 获取倒计时标签类型（颜色）
const getCountdownType = (deliveryDate, status) => {
  // 如果订单已完成，显示成功绿色
  if (status === 'completed') {
    return 'success';
  }

  // 如果订单已取消，显示灰色
  if (status === 'cancelled') {
    return 'info';
  }

  if (!deliveryDate) return 'info';

  const today = new Date();
  const delivery = new Date(deliveryDate);

  // 设置时间为当天的开始，避免时间差异
  today.setHours(0, 0, 0, 0);
  delivery.setHours(0, 0, 0, 0);

  const diffTime = delivery - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'danger';  // 红色 - 已逾期
  } else if (diffDays <= 3) {
    return 'warning'; // 黄色 - 3天内到货
  } else {
    return 'success'; // 绿色 - 3天以上
  }
};

// 搜索表单
const searchForm = reactive({
  keyword: '',  // 订单号或合同编码关键字
  status: '',
  supplier_id: '',
  operator: '',  // 操作人
  date_range: []
});

// 分页配置
const pagination = reactive({
  current: 1,
  size: 10,
  total: 0
});

// 其他状态变量
const loading = ref(false);
const detailLoading = ref(false);
const orderList = ref([]);
const suppliers = ref([]);           // 供应商缓存（用于回显）
const filteredSuppliers = ref([]);   // 远程搜索结果
const supplierLoading = ref(false);  // 供应商搜索加载状态
const operators = ref([]);  // 操作人列表
const viewDialogVisible = ref(false);
const viewData = reactive({
  id: null,
  order_number: '',
  order_date: '',
  expected_delivery_date: '',
  supplier_id: '',
  supplier_name: '',
  contact_person: '',
  contact_phone: '',
  remarks: '',
  status: '',
  total_amount: 0,
  requisition_id: null,
  requisition_number: '',
  items: []
});

// 订单表单相关
const orderFormRef = ref(null);
const orderDialog = reactive({
  visible: false,
  isEdit: false,
  editId: null,
  loading: false
});

// 订单表单数据
const orderForm = reactive({
  order_number: '',
  order_date: new Date().toISOString().split('T')[0],
  expected_delivery_date: '',
  supplier_id: '',
  supplier_name: '',
  contact_person: '',
  contact_phone: '',
  notes: '',
  requisition_id: null,
  requisition_number: '',
  status: 'draft',
  tax_rate: 0.13,     // 默认税率13%
  subtotal: 0,        // 不含税金额
  tax_amount: 0,      // 税额
  items: []
});

// 表单验证规则
const orderRules = {
  order_date: [{ required: true, message: '请选择订单日期', trigger: 'blur' }],
  expected_delivery_date: [{ required: true, message: '请选择预计到货日期', trigger: 'blur' }],
  supplier_id: [{ required: true, message: '请选择供应商', trigger: 'change' }]
};

// 物料搜索相关 - 与销售订单保持一致
const filteredProducts = ref([]);
const materialsLoading = ref(false);
const materialSearchLoading = ref(false);

// 到货对话框相关
const receiveDialogVisible = ref(false);
const receiveDialogLoading = ref(false);
const receiveForm = reactive({
  order_id: null,
  order_no: '',
  items: []
});
const receiveTableRef = ref(null);

// 计算本次到货总数量
const totalReceiveQuantity = computed(() => {
  return receiveForm.items.reduce((sum, item) => {
    return sum + parseFloat(item.receive_quantity || 0);
  }, 0);
});

// 采购申请对话框相关
const requisitionDialogVisible = ref(false);
const requisitionDialogLoading = ref(false);
const requisitionSearchKeyword = ref('');
const requisitionList = ref([]);
// 扁平化未采购物料列表
const unorderedMaterialsList = ref([]);
const selectedMaterials = ref([]);
const materialTableRef = ref(null);
const requisitionPagination = reactive({
  current: 1,
  size: 10,
  total: 0
});

// 查看申请单详情对话框状态
const requisitionViewDialog = reactive({
  visible: false,
  loading: false
});

// 申请单详情数据
const requisitionViewData = reactive({
  id: null,
  requisition_number: '',
  request_date: '',
  requester: '',
  real_name: '',
  status: '',
  remarks: '',
  created_at: '',
  updated_at: '',
  materials: []
});

// 获取状态文本
const getStatusText = (status) => {
  return getPurchaseStatusText(status);
};

// 获取状态类型（用于标签颜色）
const getStatusType = (status) => {
  return getPurchaseStatusColor(status);
};

// 加载订单列表
const loadOrders = async () => {
  loading.value = true;
  try {
    // 构建查询参数
    const params = {
      page: pagination.current,
      pageSize: pagination.size,
      keyword: searchForm.keyword,  // 订单号或合同编码关键字
      status: searchForm.status,
      supplierId: searchForm.supplier_id
    };

    // 添加日期范围
    if (searchForm.date_range && searchForm.date_range.length === 2) {
      params.startDate = searchForm.date_range[0];
      params.endDate = searchForm.date_range[1];
    }

    const res = await purchaseApi.getOrders(params);

    if (res.data) {
      // 使用统一解析器
      const orderItems = parseListData(res, { enableLog: false });
      // 格式化日期
      const formattedOrders = orderItems.map(order => {
        
        // 检查关联申请字段
        const requisitionId = order.requisition_id || order.requisitionId;
        // 后端可能没有正确传递申请单号，即使有关联，也可能是NULL或""
        // 这里我们做一个更强的处理，如果有ID但没有号码，就设置一个默认值
        let requisitionNumber = order.requisition_number || order.requisitionNumber;
        
        // 如果有ID但没有号码，强制设置一个值，确保显示
        if (requisitionId && (!requisitionNumber || requisitionNumber === '' || requisitionNumber === '关联申请')) {
          requisitionNumber = `申请单-${requisitionId}`;
        }
        
        // 创建格式化后的订单对象
        const formattedOrder = {
          ...order,
          order_date: formatDate(order.order_date),
          expected_delivery_date: formatDate(order.expected_delivery_date),
          // 确保字段名称统一
          requisition_id: requisitionId,
          requisition_number: requisitionNumber
        };
        

        
        return formattedOrder;
      });
      
      orderList.value = formattedOrders;
      pagination.total = res.data.total || 0;
    }
  } catch (error) {
    console.error('获取采购订单列表失败:', error);
    ElMessage.error('获取采购订单列表失败');
  } finally {
    loading.value = false;
    // 在加载完订单列表后更新统计数据
    getOrderStats();
  }
};

// 加载供应商列表（用于搜索区域和初始缓存）
const loadSuppliers = async () => {
  try {
    // 只加载少量供应商用于初始缓存，远程搜索会按需加载
    const res = await supplierApi.getSuppliers({ page: 1, pageSize: 100 });
    suppliers.value = parseListData(res, { enableLog: false });
    // 同步到过滤结果供下拉框使用
    filteredSuppliers.value = [...suppliers.value];
  } catch (error) {
    console.error('获取供应商列表失败:', error);
    suppliers.value = [];
    filteredSuppliers.value = [];
  }
};

// 确保供应商存在于列表中（用于回显）
const ensureSupplierExists = async (supplierId) => {
  if (!supplierId) return;
  
  const idNum = Number(supplierId);
  // 如果缓存中已存在，则不处理
  if (!idNum || suppliers.value.some(s => s.id === idNum)) {
    // 确保也在 filteredSuppliers 中
    const supplier = suppliers.value.find(s => s.id === idNum);
    if (supplier && !filteredSuppliers.value.some(s => s.id === idNum)) {
      filteredSuppliers.value.unshift(supplier);
    }
    return;
  }

  try {
    const res = await supplierApi.getSupplier(idNum);
    const supplier = res.data?.data || res.data || res;
    
    if (supplier && supplier.id) {
      // 添加到缓存
      if (!suppliers.value.some(s => s.id === supplier.id)) {
        suppliers.value.unshift(supplier);
      }
      // 添加到过滤结果（确保显示在下拉框中）
      if (!filteredSuppliers.value.some(s => s.id === supplier.id)) {
        filteredSuppliers.value.unshift(supplier);
      }
    }
  } catch (error) {
    console.warn(`无法获取供应商详情 (ID: ${idNum}):`, error);
  }
};

// 加载操作人列表
const loadOperators = async () => {
  try {
    const res = await api.get('/system/users/list');
    operators.value = parseListData(res, { logPrefix: '操作人', enableLog: false });
  } catch (error) {
    console.error('加载操作人列表失败:', error);
    operators.value = [];
  }
};

// 搜索
const handleSearch = async () => {
  pagination.current = 1;
  await loadOrders();
  await getOrderStats();
};

// 重置搜索
const resetSearch = () => {
  // 重置搜索表单
  searchForm.keyword = '';
  searchForm.status = '';
  searchForm.supplier_id = '';
  searchForm.operator = '';
  searchForm.date_range = [];

  // 重新加载数据
  pagination.current = 1;
  loadOrders();
};

// 处理分页变化
const handleSizeChange = (val) => {
  pagination.size = val;
  loadOrders();
};

const handleCurrentChange = (val) => {
  pagination.current = val;
  loadOrders();
};

// 打开新增/编辑订单对话框
const openOrderDialog = async (id) => {
  // 每次打开对话框都重新加载供应商列表，确保数据最新且类型一致
  await loadSuppliers();
  
  if (id) {
    // 编辑
    orderDialog.isEdit = true;
    orderDialog.editId = id;
    await loadOrderDetails(id);
  } else {
    // 新增
    orderDialog.isEdit = false;
    orderDialog.editId = null;
    resetOrderForm();
  }
  orderDialog.visible = true;
};

// 重置订单表单
const resetOrderForm = () => {
  // 计算三周后的日期
  const threeWeeksLater = new Date();
  threeWeeksLater.setDate(threeWeeksLater.getDate() + 21);
  
  Object.assign(orderForm, {
    order_number: '',
    order_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: threeWeeksLater.toISOString().split('T')[0],
    supplier_id: '',
    supplier_name: '',
    contact_person: '',
    contact_phone: '',
    notes: '',
    requisition_id: null,
    requisition_number: '',
    status: 'draft',
    tax_rate: defaultVATRate.value,     // 使用默认税率
    subtotal: 0,        // 不含税金额
    tax_amount: 0,      // 税额
    items: []
  });
};

// 加载订单详情
const loadOrderDetails = async (id) => {
  orderDialog.loading = true;
  try {
    const res = await purchaseApi.getOrder(id);

    if (res.data) {
      // 支持 ResponseHandler 格式: { success: true, data: {...} }
      const data = res.data?.data || res.data;

      // 处理items，确保每个item都有tax_rate和tax_amount
      const processedItems = (data.items || []).map(item => {
        // 修复税率格式：如果值大于1，说明是整数百分比格式，需要转换为小数
        let taxRate = parseFloat(item.tax_rate || 0);
        if (taxRate > 1) {
          taxRate = taxRate / 100; // 13 -> 0.13
        }
        // 如果税率为0、null或未定义，使用默认税率
        if (!taxRate || taxRate === 0) {
          taxRate = defaultVATRate.value;
        }
        
        const quantity = parseFloat(item.quantity || 0);
        const price = parseFloat(item.price || item.unit_price || 0);
        const totalPrice = parseFloat(item.total_price || item.amount || (quantity * price) || 0);
        // 如果税额为0或未定义，重新计算税额
        const taxAmount = (item.tax_amount && parseFloat(item.tax_amount) > 0) 
          ? parseFloat(item.tax_amount) 
          : totalPrice * taxRate;
        
        return {
          ...item,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          price: price,
          quantity: quantity,
          total_price: totalPrice
        };
      });

      Object.assign(orderForm, {
        order_number: data.order_no || data.orderNo,
        order_date: formatDate(data.order_date || data.orderDate),
        expected_delivery_date: formatDate(data.expected_delivery_date || data.expectedDeliveryDate),
        supplier_id: String(data.supplier_id || data.supplierId || ''),
        supplier_name: data.supplier_name || data.supplierName,
        contact_person: data.contact_person || data.contactPerson,
        contact_phone: data.contact_phone || data.contactPhone,
        notes: data.notes || data.remarks,
        status: data.status || 'draft', // 使用原始状态
        requisition_id: data.requisition_id || data.requisitionId,
        requisition_number: data.requisition_number || data.requisitionNumber,
        items: processedItems
      });

      // 检查并确保供应商存在于列表中
      await ensureSupplierExists(data.supplier_id || data.supplierId);
    }
  } catch (error) {
    console.error('获取采购订单详情失败:', error);
    ElMessage.error('获取采购订单详情失败');
  } finally {
    orderDialog.loading = false;
  }
};

// 新建采购订单 - 现在通过对话框
const handleCreate = () => {
  openOrderDialog();
};

// 编辑采购订单
const editOrder = (id) => {
  openOrderDialog(id);
};

// 远程搜索供应商
const searchSuppliers = async (query) => {
  if (!query || query.length < 1) {
    // 如果没有搜索关键字，显示缓存的供应商或加载默认列表
    filteredSuppliers.value = suppliers.value.slice(0, 50);
    return;
  }
  
  supplierLoading.value = true;
  try {
    const res = await supplierApi.getSuppliers({ 
      page: 1, 
      pageSize: 50,
      keyword: query.trim()
    });
    const results = parseListData(res, { enableLog: false });
    filteredSuppliers.value = results;
    
    // 同时更新缓存，确保选中后能正确回显
    results.forEach(item => {
      if (!suppliers.value.find(s => s.id === item.id)) {
        suppliers.value.push(item);
      }
    });
  } catch (error) {
    console.error('搜索供应商失败:', error);
    filteredSuppliers.value = [];
  } finally {
    supplierLoading.value = false;
  }
};

// 供应商下拉框获得焦点时，显示常用供应商
const handleSupplierFocus = async () => {
  if (filteredSuppliers.value.length === 0) {
    supplierLoading.value = true;
    try {
      const res = await supplierApi.getSuppliers({ page: 1, pageSize: 50 });
      const results = parseListData(res, { enableLog: false });
      filteredSuppliers.value = results;
      
      // 更新缓存
      results.forEach(item => {
        if (!suppliers.value.find(s => s.id === item.id)) {
          suppliers.value.push(item);
        }
      });
    } catch (error) {
      console.error('加载供应商列表失败:', error);
    } finally {
      supplierLoading.value = false;
    }
  }
};

// 处理供应商变更
const handleSupplierChange = async (supplierId) => {
  // 在缓存和搜索结果中查找
  let supplier = suppliers.value.find(s => String(s.id) === String(supplierId));
  if (!supplier) {
    supplier = filteredSuppliers.value.find(s => String(s.id) === String(supplierId));
  }
  
  if (supplier) {
    orderForm.supplier_name = supplier.name;
    orderForm.contact_person = supplier.contact_person || '';
    orderForm.contact_phone = supplier.contact_phone || '';
    
    // 确保供应商在缓存中
    if (!suppliers.value.find(s => s.id === supplier.id)) {
      suppliers.value.push(supplier);
    }
  }
  
  // ⚡【智能辅组】由于换了新供应商，如果此时明细表里已经有了物料，向后台发包批量重算指导价
  let updatedCount = 0;
  for (let i = 0; i < orderForm.items.length; i++) {
    const item = orderForm.items[i];
    if (item.material_id) {
       try {
         const res = await purchaseApi.getLatestPrice({
           material_id: item.material_id,
           supplier_id: supplierId
         });
         if (res && res.data && res.data.price > 0 && res.data.source === 'supplier_history') {
           item.price = res.data.price;
           recalculatePrice(item);
           updatedCount++;
         }
       } catch (error) {
         console.warn(`重算物料 ${item.material_code} 的单价失败`);
       }
    }
  }
  
  if (updatedCount > 0) {
    ElMessage.success(`已根据新供应商的历史成交记录，自动刷新了 ${updatedCount} 项物料单价`);
  }
};

// 物料相关方法（对话框中的搜索）
const searchMaterialsInDialog = async () => {
  materialSearchLoading.value = true;
  try {
    const params = {
      page: materialPagination.current,
      pageSize: materialPagination.size,
      keyword: materialSearchKeyword.value
    };

    const res = await baseDataApi.getMaterials(params);
    const materialData = parseListData(res, { logPrefix: '物料', enableLog: false });

    materialList.value = materialData.map(item => ({
      ...item,
      id: item.id,
      code: item.code || item.material_code,
      name: item.name || item.material_name,
      specs: item.specs || item.specification || '',
      unit_name: item.unit_name || item.unit || '',
      unit_id: item.unit_id || item.unit || '',
      selected: false
    }));

    // 从响应中获取总数
    materialPagination.total = parseInt(res?.data?.total || res?.total || materialData.length) || 0;
  } catch (error) {
    console.error('获取物料列表失败:', error);
    ElMessage.error('获取物料列表失败');
  } finally {
    materialSearchLoading.value = false;
  }
};

// 添加物料行
const addMaterialRow = () => {
  orderForm.items.push({
    material_id: null,
    material_code: '',
    material_name: '',
    specification: '',
    specs: '',
    unit: '',
    unit_name: '',
    unit_id: null,
    quantity: '',
    price: '',
    total_price: 0,
    tax_rate: defaultVATRate.value,
    tax_amount: 0,
    material_display: ''
  });
};

// 组件引用管理
const materialSelectRefs = ref({});
const quantityInputRefs = ref({});

// 设置物料选择框引用
const setMaterialSelectRef = (el, index) => {
  if (el) {
    materialSelectRefs.value[index] = el;
  }
};

// 设置数量输入框引用
const setQuantityInputRef = (el, index) => {
  if (el) {
    quantityInputRefs.value[index] = el;
  }
};

// 获取物料建议 - 使用统一搜索函数
const fetchMaterialSuggestions = async (query, callback) => {
  if (!query || query.length < 1) {
    callback([]);
    return;
  }

  try {
    // 使用统一的搜索函数
    const searchResults = await searchMaterials(baseDataApi, query.trim(), {
      pageSize: 500,
      includeAll: true
    });

    // 格式化数据供自动完成使用
    const suggestions = searchResults.map(item => ({
      value: item.code || '无编码',
      code: item.code || '无编码',
      name: item.name || '未命名',
      specs: item.specification || item.specs || '',
      stock_quantity: item.stock_quantity || 0,
      id: item.id,
      unit_name: item.unit_name || '个',
      unit_id: item.unit_id,
      cost_price: item.cost_price || 0,
      price: item.price || 0,
      tax_rate: item.tax_rate || 0,
      supplier_id: item.supplier_id // 添加供应商ID
    }));

    // 保存到全局变量供Enter键使用
    filteredProducts.value = suggestions;
    callback(suggestions);
  } catch (error) {
    console.error('搜索物料失败:', error);
    ElMessage.error('搜索物料失败');
    callback([]);
  }
};

// 处理自动完成选择
const handleMaterialSelect = async (item, index) => {
  orderForm.items[index].material_id = item.id;
  orderForm.items[index].material_code = item.code;
  orderForm.items[index].material_name = item.name;
  orderForm.items[index].specification = item.specs;
  orderForm.items[index].specs = item.specs;
  orderForm.items[index].unit = item.unit_name;
  orderForm.items[index].unit_name = item.unit_name;
  orderForm.items[index].unit_id = item.unit_id;
  
  // 设置税率（优先使用物料设置的税率）
  if (item.tax_rate !== undefined && item.tax_rate !== null) {
    orderForm.items[index].tax_rate = parseFloat(item.tax_rate);
  }
  
  // ⚡【核心改造】使用专业 ERP 的询价雷达：动态获取供应商的历史报价体系
  try {
    const res = await purchaseApi.getLatestPrice({
      material_id: item.id,
      supplier_id: orderForm.supplier_id || item.supplier_id || ''
    });
    
    if (res && res.data && res.data.price > 0) {
      orderForm.items[index].price = res.data.price;
      
      let sourceMsg = '';
      if(res.data.source === 'supplier_history') {
        sourceMsg = `已自动带入该供应商最近成交价: ￥${res.data.price}`;
      } else if(res.data.source === 'other_supplier_history') {
        sourceMsg = `已参考其他供应商历史价: ￥${res.data.price}`;
      } else {
        sourceMsg = `已带入物料预估参考价: ￥${res.data.price}`;
      }
      
      ElMessage({
        message: sourceMsg,
        type: 'success',
        duration: 2000
      });
    } else {
      orderForm.items[index].price = 0;
    }
  } catch(e) {
    console.error('获取实时指导价抛出异常，执行降级策略:', e);
    // 降级使用传统策略
    const defaultPrice = parseFloat(item.cost_price) || parseFloat(item.price) || 0;
    orderForm.items[index].price = defaultPrice > 0 ? defaultPrice : 0;
  }
  recalculatePrice(orderForm.items[index]);
  
  // 如果订单未设置供应商，且物料有默认供应商，自动设置
  if (!orderForm.supplier_id && item.supplier_id) {
    orderForm.supplier_id = item.supplier_id;
    // 同时也触发一下供应商变更的逻辑（如果有）
    // 通常需要获取供应商名称来显示在下拉框里，如果下拉框是远程搜索的，需要把option加进去
    // 这里先简单设置ID，如果需要名字显示，可能需要去后端查一下
    // 尝试添加进 supplierOptions
    if (item.supplier_name && !supplierOptions.value.some(s => s.id === item.supplier_id)) {
        supplierOptions.value.push({
            id: item.supplier_id,
            name: item.supplier_name
        });
    }
  }
  
  // 选择物料后，自动聚焦到数量输入框
  nextTick(() => {
    const quantityInput = quantityInputRefs.value[index];
    if (quantityInput) {
      quantityInput.focus();
    }
  });
};

// 处理物料编码Enter键
const handleMaterialEnter = (index) => {
  // 如果有搜索结果，自动选择第一个
  if (filteredProducts.value.length > 0) {
    const firstMaterial = filteredProducts.value[0];
    handleMaterialSelect(firstMaterial, index);
  }
};

// 处理数量Enter键
const handleQuantityEnter = (index) => {
  // 添加新的物料行
  addMaterialRow();
  
  // 聚焦到新行的物料选择框
  nextTick(() => {
    const newIndex = orderForm.items.length - 1;
    const materialSelect = materialSelectRefs.value[newIndex];
    if (materialSelect) {
      materialSelect.focus();
    }
  });
};

// 格式化物料标签显示
const formatMaterialLabel = (item) => {
  const code = item.code || item.material_code || item.id || '';
  const name = item.name || item.material_name || item.title || item.product_name || '';
  const specs = item.specs || item.specification || item.model || '';
  
  let label = code;
  if (name) {
    label += ` - ${name}`;
  }
  if (specs) {
    label += ` - ${specs}`;
  }
  
  return label;
};

// 处理物料显示选择
const handleMaterialDisplayChange = (displayValue, index) => {
  if (!displayValue) {
    // 清空物料信息
    orderForm.items[index].material_id = null;
    orderForm.items[index].material_code = '';
    orderForm.items[index].material_name = '';
    orderForm.items[index].specification = '';
    orderForm.items[index].specs = '';
    orderForm.items[index].unit = '';
    orderForm.items[index].unit_name = '';
    orderForm.items[index].unit_id = null;
    orderForm.items[index].material_display = '';
    return;
  }
  
  // 从显示值中提取物料编码（显示值格式：编码 - 名称 - 规格）
  const materialCode = displayValue.split(' - ')[0];
  
  // 从过滤结果中找到选中的物料
  const selectedMaterial = filteredProducts.value.find(m => 
    (m.code || m.material_code || m.id) === materialCode
  );
  
  if (selectedMaterial) {
    orderForm.items[index].material_id = selectedMaterial.id;
    orderForm.items[index].material_code = materialCode;
    orderForm.items[index].material_name = selectedMaterial.name || selectedMaterial.material_name || '';
    orderForm.items[index].specification = selectedMaterial.specs || selectedMaterial.specification || '';
    orderForm.items[index].specs = selectedMaterial.specs || selectedMaterial.specification || '';
    orderForm.items[index].unit = selectedMaterial.unit_name || selectedMaterial.unit || '';
    orderForm.items[index].unit_name = selectedMaterial.unit_name || selectedMaterial.unit || '';
    orderForm.items[index].unit_id = selectedMaterial.unit_id;
    orderForm.items[index].material_display = displayValue;
    
    // 重新计算价格
    recalculatePrice(orderForm.items[index]);
  }
};

// 处理物料选择 - 与销售订单保持一致
const handleMaterialChange = (materialCode, index) => {
  if (!materialCode) {
    // 清空物料信息
    orderForm.items[index].material_id = null;
    orderForm.items[index].material_name = '';
    orderForm.items[index].specification = '';
    orderForm.items[index].specs = '';
    orderForm.items[index].unit = '';
    orderForm.items[index].unit_name = '';
    orderForm.items[index].unit_id = null;
    return;
  }
  
  // 从过滤结果中找到选中的物料
  const selectedMaterial = filteredProducts.value.find(m => 
    (m.code || m.material_code || m.id) === materialCode
  );
  if (selectedMaterial) {
    orderForm.items[index].material_id = selectedMaterial.id;
    orderForm.items[index].material_name = selectedMaterial.name || selectedMaterial.material_name || '';
    orderForm.items[index].specification = selectedMaterial.specs || selectedMaterial.specification || '';
    orderForm.items[index].specs = selectedMaterial.specs || selectedMaterial.specification || '';
    orderForm.items[index].unit = selectedMaterial.unit_name || selectedMaterial.unit || '';
    orderForm.items[index].unit_name = selectedMaterial.unit_name || selectedMaterial.unit || '';
    orderForm.items[index].unit_id = selectedMaterial.unit_id;
    
    // 重新计算价格
    recalculatePrice(orderForm.items[index]);
  }
};

// 重新计算价格
const recalculatePrice = (item) => {
  if (item.quantity <= 0) {
    ElMessage.warning('数量必须大于0');
    item.quantity = 0.01;
  }
  item.total_price = item.quantity * item.price;
  item.tax_amount = item.total_price * (item.tax_rate || 0); // 计算单行税额
};

// 格式化数量为一位小数
const formatQuantity = (item) => {
  if (item.quantity && !isNaN(item.quantity)) {
    item.quantity = parseFloat(item.quantity).toFixed(1);
  }
};

// 移除物料项
const removeItem = (index) => {
  orderForm.items.splice(index, 1);
};

// 计算总金额（含税）
const calculateTotalAmount = () => {
  const subtotal = orderForm.items.reduce((total, item) => total + (item.quantity * item.price), 0);
  const taxAmount = orderForm.items.reduce((total, item) => total + (item.tax_amount || 0), 0);
  orderForm.subtotal = subtotal;
  orderForm.tax_amount = taxAmount;
  return (subtotal + taxAmount).toFixed(2);
};

// 采购申请相关方法
const searchRequisitions = () => {
  requisitionPagination.current = 1;
  loadRequisitions();
};

const handleRequisitionSizeChange = (val) => {
  requisitionPagination.size = val;
  requisitionPagination.current = 1;
  searchRequisitions();
};

const handleRequisitionCurrentChange = (val) => {
  requisitionPagination.current = val;
  searchRequisitions();
};

const handleRequisitionSelectionChange = (selection) => {
  selectedRequisitions.value = selection;
};

// 点击采购申请行选中/取消选中
const handleRequisitionRowClick = (row, column, event) => {
  // 如果点击的是展开列或操作列，不触发选中
  if (column && (column.type === 'expand' || column.label === '操作')) {
    return;
  }

  // 切换选中状态
  const index = selectedRequisitions.value.findIndex(item => item.id === row.id);
  if (index > -1) {
    // 已选中，取消选中
    requisitionTableRef.value.toggleRowSelection(row, false);
  } else {
    // 未选中，选中
    requisitionTableRef.value.toggleRowSelection(row, true);
  }
};

// 处理申请单展开事件
const handleRequisitionExpand = async (row, expandedRows) => {
  // 如果已经加载过详情，直接返回
  if (row._details) {
    return;
  }
  
  // 设置加载状态
  row._loading = true;
  
  try {
    // 获取申请单详情
    const response = await purchaseApi.getRequisition(row.id);
    
    // 将详情数据存储到行对象中
    row._details = {
      materials: response.materials || []
    };
  } catch (error) {
    console.error('获取申请单详情失败:', error);
    ElMessage.error('获取申请单详情失败');
    row._details = { materials: [] };
  } finally {
    row._loading = false;
  }
};

const openRequisitionDialog = () => {
  requisitionDialogVisible.value = true;
  searchRequisitions();
};

// 移除关联的采购申请
const removeRequisition = () => {
  ElMessageBox.confirm('确定要移除关联的采购申请吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    orderForm.requisition_id = null;
    orderForm.requisition_number = '';
    ElMessage.success('已移除关联的采购申请');
  }).catch(() => {});
};

// 提交订单表单
const submitOrderForm = async () => {
  if (orderForm.items.length === 0) {
    ElMessage.warning('请至少添加一个物料');
    return;
  }
  
  try {
    await orderFormRef.value.validate();
    

    
    // 重构表单数据以匹配后端API预期的格式
    const formDataToSubmit = {
      order_date: orderForm.order_date,
      supplier_id: orderForm.supplier_id, 
      expected_delivery_date: orderForm.expected_delivery_date,
      contact_person: orderForm.contact_person,
      contact_phone: orderForm.contact_phone,
      notes: orderForm.notes,
      total_amount: parseFloat(calculateTotalAmount()),
      // 税率相关字段
      tax_rate: orderForm.tax_rate || 0.13,
      tax_amount: orderForm.tax_amount || 0,
      subtotal: orderForm.subtotal || 0,
      status: 'draft', // 强制设置状态为draft，确保创建的订单状态正确
      // 确保申请单信息使用下划线格式，只提供必要的字段
      requisition_id: orderForm.requisition_id || null,
      requisition_number: orderForm.requisition_number || '',
      // 格式化物料项，确保字段名与后端期望的一致
      items: orderForm.items.map(item => ({
        material_id: item.material_id,
        material_code: item.material_code,
        material_name: item.material_name,
        specification: item.specification,
        unit: item.unit,
        unit_id: item.unit_id,
        quantity: parseFloat(item.quantity),
        price: parseFloat(item.price),
        total_price: parseFloat(item.quantity * item.price),
        tax_rate: parseFloat(item.tax_rate || 0),
        tax_amount: parseFloat(item.tax_amount || 0)
      }))
    };
    

    
    // 提交到后端
    let res;
    if (orderDialog.isEdit) {
      // 更新
      res = await purchaseApi.updateOrder(orderDialog.editId, formDataToSubmit);
      ElMessage.success('采购订单更新成功');
    } else {
      // 创建
      res = await purchaseApi.createOrder(formDataToSubmit);
      ElMessage.success('采购订单创建成功');
    }
    
    orderDialog.visible = false;
    loadOrders(); // 刷新列表
  } catch (error) {
    console.error('提交表单失败:', error);
    ElMessage.error(error.message || '提交失败，请检查表单');
  }
};

// 修复物料项结构，确保数据格式正确
const fixItemsStructure = (items) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  return items.map(item => {
    // 确保关键属性存在，包括收货进度字段
    return {
      material_id: item.material_id || item.materialId || item.id || '',
      material_code: item.material_code || item.materialCode || item.code || '',
      material_name: item.material_name || item.materialName || item.name || '',
      specification: item.specification || '',
      unit: item.unit || item.unitName || item.unit_name || '',
      quantity: parseFloat(item.quantity || 0),
      price: parseFloat(item.price || 0),
      total_price: parseFloat(item.total_price || item.totalPrice || (item.quantity * item.price) || 0),
      tax_rate: parseFloat(item.tax_rate || 0),
      tax_amount: parseFloat(item.tax_amount || 0),
      // 新增收货进度字段
      received_quantity: parseFloat(item.received_quantity || 0),
      warehoused_quantity: parseFloat(item.warehoused_quantity || 0),
      received_percentage: parseFloat(item.received_percentage || 0),
      warehoused_percentage: parseFloat(item.warehoused_percentage || 0),
      pending_quantity: parseFloat(item.pending_quantity || 0)
    };
  });
};

// 查看采购订单详情
const viewOrder = async (id) => {
  detailLoading.value = true;
  viewDialogVisible.value = true;
  
  try {
    const response = await purchaseApi.getOrder(id);
    
    // 重置viewData对象，避免旧数据残留
    Object.keys(viewData).forEach(key => {
      if (key !== 'items') {
        viewData[key] = '';
      } else {
        viewData[key] = [];
      }
    });
    
    if (response) {
      // 获取响应数据，支持 ResponseHandler 格式: { success: true, data: {...} }
      const data = response.data?.data || response.data || response;

      // 获取物料数据，尝试多种可能的属性名
      let items = data.items || data.orderItems || data.materialItems || [];
      
      // 修复物料项结构
      items = fixItemsStructure(items);
      
      // 格式化日期，然后更新查看数据
      const formattedResponse = {
        id: data.id,
        order_number: data.order_no || data.orderNo || '',
        order_date: formatDate(data.order_date || data.orderDate || ''),
        expected_delivery_date: formatDate(data.expected_delivery_date || data.expectedDeliveryDate || ''),
        supplier_id: data.supplier_id || data.supplierId || '',
        supplier_name: data.supplier_name || data.supplierName || '',
        contact_person: data.contact_person || data.contactPerson || '',
        contact_phone: data.contact_phone || data.contactPhone || '',
        notes: data.notes || data.remarks || '',
        status: data.status || '',
        total_amount: data.total_amount || data.totalAmount || 0,
        // 确保关联的采购申请字段正确映射
        requisition_id: data.requisition_id || data.requisitionId || null,
        requisition_number: data.requisition_number || data.requisitionNumber || '',
        items: items
      };
      
      // 更新查看数据
      Object.assign(viewData, formattedResponse);
    } else {
      ElMessage.warning('获取不到订单详情');
    }
  } catch (error) {
    console.error('获取采购订单详情失败:', error);
    ElMessage.error('获取采购订单详情失败: ' + (error.message || '未知错误'));
  } finally {
    detailLoading.value = false;
  }
};

// 查看关联的采购申请
const viewRequisition = async (requisitionId) => {
  try {
    requisitionViewDialog.loading = true;
    requisitionViewDialog.visible = true;

    const response = await purchaseApi.getOrderRequisition(requisitionId);

    // 更新requisitionViewData对象的属性
    Object.assign(requisitionViewData, response.data);
  } catch (error) {
    console.error('获取采购申请详情失败:', error);
    ElMessage.error('获取采购申请详情失败');
  } finally {
    requisitionViewDialog.loading = false;
  }
};

// 打印订单 - 使用系统打印模板ID=8
const printOrder = async () => {
  if (!viewData.id) {
    ElMessage.warning('无法打印，订单详情不完整');
    return;
  }
  
  try {
    
    let template = null;
    
    // 获取打印模板ID=8（采购订单模板（标准版））
    const templateResponse = await api.get('/print/templates/8');

    // 适配多种响应格式
    // 格式1: { success: true, data: {...} } - ResponseHandler 格式（已被拦截器解包）
    // 格式2: { code: 200, data: {...} } - 传统格式
    // 格式3: 直接返回模板对象
    if (templateResponse.data?.data) {
      // 传统格式：{ code: 200, data: {...} }
      template = templateResponse.data.data;
    } else if (templateResponse.data?.content) {
      // 已解包或直接返回模板对象
      template = templateResponse.data;
    } else {
      template = templateResponse.data;
    }

    // 验证模板内容
    if (!template || !template.content) {
      console.error('模板数据:', templateResponse.data);
      throw new Error('打印模板内容为空');
    }
    
    // 获取系统设置和打印设置
    let companyInfo = {
      company_name: '',
      company_phone: '',
      company_fax: '',
      company_address: ''
    };
    
    try {
      // 获取系统设置中的公司信息
      const settingsRes = await api.get('/system/settings');
      if (settingsRes.data) {
        const settings = Array.isArray(settingsRes.data) ? settingsRes.data : [];
        const companyNameSetting = settings.find(s => s.key === 'company_name' || s.setting_key === 'company_name');
        const companyPhoneSetting = settings.find(s => s.key === 'company_phone' || s.setting_key === 'company_phone');
        const companyFaxSetting = settings.find(s => s.key === 'company_fax' || s.setting_key === 'company_fax');
        const companyAddressSetting = settings.find(s => s.key === 'company_address' || s.setting_key === 'company_address');
        
        companyInfo.company_name = companyNameSetting?.value || companyNameSetting?.setting_value || '';
        companyInfo.company_phone = companyPhoneSetting?.value || companyPhoneSetting?.setting_value || '';
        companyInfo.company_fax = companyFaxSetting?.value || companyFaxSetting?.setting_value || '';
        companyInfo.company_address = companyAddressSetting?.value || companyAddressSetting?.setting_value || '';
      }
    } catch (error) {
      console.error('获取系统设置失败:', error);
    }
    
    // 准备打印数据 - 匹配模板中的变量名
    const printData = {
      // 公司信息 - 从系统设置中获取
      ...companyInfo,
      
      // 订单信息
      order_number: viewData.order_number || viewData.order_no || '',
      order_no: viewData.order_number || viewData.order_no || '',
      order_date: formatDate(viewData.order_date),
      expected_delivery_date: formatDate(viewData.expected_delivery_date),
      delivery_date: formatDate(viewData.expected_delivery_date),
      
      // 供应商信息
      supplier_name: viewData.supplier_name || '',
      contact_person: viewData.contact_person || '-',
      contact_phone: viewData.contact_phone || '-',
      
      // 订单状态和备注
      status: getStatusText(viewData.status),
      notes: viewData.notes || '',
      remark: viewData.notes || '',
      contract_code: viewData.contract_code || '-',
      
      // 金额信息
      subtotal: parseFloat(viewData.total_amount || 0).toFixed(2),
      tax_amount: '0.00',
      total_amount: parseFloat(viewData.total_amount || 0).toFixed(2),
      total_quantity: (viewData.items || []).reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0).toFixed(2),
      
      // 其他
      print_time: new Date().toLocaleString('zh-CN'),
      
      // 物料列表
      items: viewData.items || []
    };
    
    // 替换模板中的变量
    let printContent = template.content;

    // 解码 HTML 实体（如果模板内容被转义了）
    if (printContent.includes('&lt;') || printContent.includes('&gt;')) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = printContent;
      printContent = textarea.value;
    }

    // 替换简单变量
    Object.keys(printData).forEach(key => {
      if (key !== 'items') {
        const regex = new RegExp(`{{${key}}}`, 'g');
        printContent = printContent.replace(regex, printData[key] || '');
      }
    });
    
    // 处理物料列表循环 - 支持 {{#items}}、{{#each}}、{{#each items}} 三种格式
    let itemsLoopMatch = printContent.match(/{{#items}}([\s\S]*?){{\/items}}/);
    if (!itemsLoopMatch) {
      itemsLoopMatch = printContent.match(/{{#each\s+items}}([\s\S]*?){{\/each}}/);
    }
    if (!itemsLoopMatch) {
      itemsLoopMatch = printContent.match(/{{#each}}([\s\S]*?){{\/each}}/);
    }

    if (itemsLoopMatch && printData.items && printData.items.length > 0) {
      const itemTemplate = itemsLoopMatch[1];
      const itemsHtml = printData.items.map((item, index) => {
        let itemHtml = itemTemplate;

        // 替换序号 - 支持多种格式
        itemHtml = itemHtml.replace(/{{index}}/g, index + 1);
        itemHtml = itemHtml.replace(/{{@index}}/g, index + 1);
        itemHtml = itemHtml.replace(/{{#index}}/g, index + 1);

        // 替换物料信息 - 支持多种字段名称
        const materialCode = item.material_code || item.code || item.product_code || '-';
        const materialName = item.material_name || item.name || item.product_name || '-';
        const specification = item.specification || item.specs || item.model || '-';
        const unit = item.unit || item.unit_name || item.Unit || '-';
        const quantity = parseFloat(item.quantity || 0).toFixed(2);
        const price = parseFloat(item.price || item.unit_price || 0).toFixed(2);
        const totalPrice = parseFloat(item.total_price || item.amount || (quantity * price) || 0).toFixed(2);
        const deliveryDate = formatDate(item.delivery_date || viewData.expected_delivery_date || '');

        // 替换所有可能的变量名称
        itemHtml = itemHtml.replace(/{{material_code}}/g, materialCode);
        itemHtml = itemHtml.replace(/{{code}}/g, materialCode);
        itemHtml = itemHtml.replace(/{{product_code}}/g, materialCode);

        itemHtml = itemHtml.replace(/{{material_name}}/g, materialName);
        itemHtml = itemHtml.replace(/{{name}}/g, materialName);
        itemHtml = itemHtml.replace(/{{product_name}}/g, materialName);

        itemHtml = itemHtml.replace(/{{specification}}/g, specification);
        itemHtml = itemHtml.replace(/{{specs}}/g, specification);
        itemHtml = itemHtml.replace(/{{model}}/g, specification);

        itemHtml = itemHtml.replace(/{{Unit}}/g, unit);
        itemHtml = itemHtml.replace(/{{unit}}/g, unit);
        itemHtml = itemHtml.replace(/{{unit_name}}/g, unit);

        itemHtml = itemHtml.replace(/{{quantity}}/g, quantity);
        itemHtml = itemHtml.replace(/{{price}}/g, price);
        itemHtml = itemHtml.replace(/{{unit_price}}/g, price);
        itemHtml = itemHtml.replace(/{{total_price}}/g, totalPrice);
        itemHtml = itemHtml.replace(/{{amount}}/g, totalPrice);
        itemHtml = itemHtml.replace(/{{delivery_date}}/g, deliveryDate);

        return itemHtml;
      }).join('');

      // 替换循环块 - 支持多种格式
      printContent = printContent.replace(/{{#items}}[\s\S]*?{{\/items}}/g, itemsHtml);
      printContent = printContent.replace(/{{#each\s+items}}[\s\S]*?{{\/each}}/g, itemsHtml);
      printContent = printContent.replace(/{{#each}}[\s\S]*?{{\/each}}/g, itemsHtml);
    }
    
    // 创建打印窗口
    const printWindow = window.open('', '_blank');
    
    if (!printWindow) {
      ElMessage.error('打印窗口被阻止，请允许弹出窗口');
      return;
    }
    
    // 写入内容到新窗口
    printWindow.document.open();
    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // 等待内容加载完成后自动打印
    printWindow.onload = function() {
      setTimeout(() => {
        printWindow.focus();
        // 可以取消注释下面一行以自动触发打印
        // printWindow.print();
      }, 500);
    };
    
  } catch (error) {
    console.error('打印失败:', error);
    ElMessage.error('打印失败: ' + (error.message || '未知错误'));
  }
};

// ✅ 已移除 generateBatchNumber 方法
// 现在使用 usePurchaseInspection 组合式函数中的方法

// ✅ 已移除旧的 createIncomingInspection 方法
// 现在使用 usePurchaseInspection 组合式函数中的 createInspectionForOrder 方法

// 删除订单
const deleteOrder = async (id) => {
  try {
    await purchaseApi.deleteOrder(id);
    ElMessage.success('删除成功');
    loadOrders();
  } catch (error) {
    console.error('删除订单失败:', error);
    ElMessage.error('删除订单失败: ' + (error.message || '未知错误'));
  }
};

// 更新订单状态
const updateStatus = async (id, status) => {
  // ✅ 使用统一的状态常量和流转规则

  try {

    // 首先获取订单当前状态
    const orderRes = await purchaseApi.getOrder(id);

    if (!orderRes || !orderRes.data) {
      ElMessage.error('获取订单信息失败，无法更新状态');
      return;
    }

    const currentStatus = orderRes.data.status;
    // 检查是否是同一状态
    if (currentStatus === status) {
      ElMessage.info(`订单当前已经是"${getStatusLabel(status)}"状态`);
      return;
    }

    // 检查是否是有效的状态转换
    if (!isValidStatusTransition(currentStatus, status)) {
      ElMessage.error(`无法将订单从"${getStatusLabel(currentStatus)}"状态转换为"${getStatusLabel(status)}"状态`);
      return;
    }

    await ElMessageBox.confirm(
      `确定要${PURCHASE_STATUS_ACTION_TEXT[status] || '更新'}此采购订单吗？`,
      '提示',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    const res = await purchaseApi.updateOrderStatus(id, status);
    ElMessage.success(`订单已${PURCHASE_STATUS_ACTION_TEXT[status] || '更新'}`);
    await loadOrders(); // 刷新列表

    // 如果状态变为已完成,创建检验单
    if (status === PURCHASE_STATUS.COMPLETED) {
      // 重新获取订单详情以确保有完整的供应商信息
      const orderDetailRes = await purchaseApi.getOrder(id);
      if (orderDetailRes && orderDetailRes.data) {
        const result = await createInspectionForOrder(orderDetailRes.data);
        showInspectionResult(result);
      }
    }
  } catch (error) {
    if (error === 'cancel') return;

    console.error('更新订单状态失败:', error);
    // 显示详细错误信息
    if (error.response && error.response.data) {
      const errorData = error.response.data;
      if (errorData.error) {
        if (errorData.error === '当前已经是该状态') {
          ElMessage.info(`订单当前已经是"${getStatusLabel(status)}"状态`);
        } else {
          ElMessage.error(`更新失败: ${errorData.error}`);
        }
      } else {
        ElMessage.error('更新失败: 服务器返回未知错误');
      }
    } else {
      ElMessage.error(error.message || '操作失败');
    }
  } finally {
    // 无论成功失败，都刷新一次列表以确保显示最新状态
    loadOrders();
  }
};

// 打开到货对话框
const openReceiveDialog = async (order) => {
  try {
    receiveDialogLoading.value = true;
    receiveDialogVisible.value = true;

    // 获取订单详情
    const orderRes = await purchaseApi.getOrder(order.id);

    if (!orderRes || !orderRes.data) {
      ElMessage.error('获取订单信息失败');
      receiveDialogVisible.value = false;
      return;
    }

    // 支持 ResponseHandler 格式: { success: true, data: {...} }
    const orderData = orderRes.data?.data || orderRes.data;

    // 初始化到货表单
    receiveForm.order_id = orderData.id;
    receiveForm.order_no = orderData.order_number || orderData.order_no;
    receiveForm.supplier_id = orderData.supplier_id;
    receiveForm.supplier_code = orderData.supplier_code;
    receiveForm.supplier_name = orderData.supplier_name;

    // 确保 items 存在
    const items = orderData.items || [];
    receiveForm.items = items.map(item => {
      const pendingQty = parseFloat(item.quantity || 0) - parseFloat(item.received_quantity || 0);
      return {
        ...item,
        receive_quantity: pendingQty > 0 ? pendingQty : 0, // 默认填充待收货数量
        pending_quantity: pendingQty
      };
    });

    // 检查是否有待收货的物料
    const hasPendingItems = receiveForm.items.some(item => parseFloat(item.pending_quantity || 0) > 0);
    if (!hasPendingItems) {
      ElMessage.info('该订单所有物料已全部收货完成');
      receiveDialogVisible.value = false;
      return;
    }

  } catch (error) {
    console.error('打开到货对话框失败:', error);
    ElMessage.error('打开到货对话框失败: ' + (error.message || '未知错误'));
    receiveDialogVisible.value = false;
  } finally {
    receiveDialogLoading.value = false;
  }
};

// 检查物料是否可选择（待收货数量大于0）
const checkItemSelectable = (row) => {
  return parseFloat(row.pending_quantity || 0) > 0;
};

// 到货数量变化处理
const handleReceiveQuantityChange = (row) => {
  // 转换为数字
  let qty = parseFloat(row.receive_quantity);

  // 如果不是有效数字，设为0
  if (isNaN(qty) || qty < 0) {
    qty = 0;
  }

  // 计算最大可到货数量
  const maxQty = parseFloat(row.quantity || 0) - parseFloat(row.received_quantity || 0);

  // 如果超过最大值，限制为最大值
  if (qty > maxQty) {
    qty = maxQty;
    ElMessage.warning(`到货数量不能超过待收货数量 ${maxQty.toFixed(2)}`);
  }

  // 更新值（保留2位小数）
  row.receive_quantity = qty.toFixed(2);
};

// 确认到货
const confirmReceive = async () => {
  try {
    // 筛选出本次到货的物料（到货数量大于0）
    const receivingItems = receiveForm.items.filter(item => {
      return parseFloat(item.receive_quantity || 0) > 0;
    });

    if (receivingItems.length === 0) {
      ElMessage.warning('请至少选择一个物料并填写到货数量');
      return;
    }

    receiveDialogLoading.value = true;

    // 1. 先更新采购订单物料的收货数量
    await purchaseApi.updateOrderItemsReceived(receiveForm.order_id, receivingItems);

    // 2. 准备到货数据
    const receiveData = {
      ...receiveForm,
      items: receivingItems.map(item => ({
        ...item,
        quantity: item.receive_quantity, // 使用本次到货数量
        received_quantity: item.receive_quantity,
        warehoused_quantity: item.receive_quantity
      }))
    };

    // 3. 使用统一的检验单创建方法
    const result = await createInspectionForOrder(receiveData);

    // 4. 检查是否所有物料都已收货完成
    const allReceived = receiveForm.items.every(item => {
      const totalReceived = parseFloat(item.received_quantity || 0) + parseFloat(item.receive_quantity || 0);
      return totalReceived >= parseFloat(item.quantity || 0);
    });

    // 5. 更新订单状态
    if (allReceived) {
      // 全部收货完成，更新为已完成
      await purchaseApi.updateOrderStatus(receiveForm.order_id, PURCHASE_STATUS.COMPLETED);
      ElMessage.success(`到货成功！已为 ${result.successCount} 个物料生成检验单，订单已完成`);
    } else {
      // 部分收货，更新为部分收货状态
      await purchaseApi.updateOrderStatus(receiveForm.order_id, PURCHASE_STATUS.PARTIAL_RECEIVED);
      ElMessage.success(`到货成功！已为 ${result.successCount} 个物料生成检验单，订单状态更新为部分收货`);
    }

    // 显示检验单创建结果
    if (result.failedCount > 0 || result.skippedCount > 0) {
      showInspectionResult(result);
    }

    // 关闭对话框并刷新列表
    receiveDialogVisible.value = false;
    await loadOrders();

  } catch (error) {
    console.error('确认到货失败:', error);
    ElMessage.error('到货失败: ' + (error.message || '未知错误'));
  } finally {
    receiveDialogLoading.value = false;
  }
};

// 更新收货（部分收货状态的订单）
const updateReceiving = async (order) => {
  try {

    // 获取订单详情以获取最新的收货信息
    const orderRes = await purchaseApi.getOrder(order.id);

    if (!orderRes || !orderRes.data) {
      ElMessage.error('获取订单信息失败');
      return;
    }

    // 支持 ResponseHandler 格式: { success: true, data: {...} }
    const orderData = orderRes.data?.data || orderRes.data;

    // 确保 items 存在
    const items = orderData.items || [];

    // 检查是否有剩余未收货的物料
    const pendingItems = items.filter(item => {
      const pendingQty = parseFloat(item.quantity) - parseFloat(item.received_quantity || 0);
      return pendingQty > 0;
    });

    if (pendingItems.length === 0) {
      ElMessage.info('该订单所有物料已全部收货完成');
      return;
    }

    // 计算总的剩余数量
    const totalPendingQty = pendingItems.reduce((sum, item) => {
      return sum + (parseFloat(item.quantity) - parseFloat(item.received_quantity || 0));
    }, 0);

    // 显示确认对话框
    await ElMessageBox.confirm(
      `确定要收货剩余的 ${totalPendingQty.toFixed(2)} 个物料吗？收货后将自动生成检验单并完成订单。`,
      '确认收货',
      {
        confirmButtonText: '确定收货',
        cancelButtonText: '取消',
        type: 'info'
      }
    );

    // 使用统一的检验单创建方法
    const result = await createInspectionForOrder(
      orderData,
      pendingItems.map(item => {
        const pendingQty = parseFloat(item.quantity) - parseFloat(item.received_quantity || 0);
        return {
          ...item,
          // 将剩余数量作为检验数量
          quantity: pendingQty,
          received_quantity: pendingQty,
          warehoused_quantity: pendingQty
        };
      }),
      'quick'
    );

    // 更新订单状态为已完成，防止重复点击
    await purchaseApi.updateOrderStatus(order.id, PURCHASE_STATUS.COMPLETED);

    ElMessage.success(`收货成功！已为 ${result.successCount} 个物料生成检验单，订单已完成`);

    // 显示检验单创建结果
    if (result.failedCount > 0 || result.skippedCount > 0) {
      showInspectionResult(result);
    }

    // 刷新列表
    await loadOrders();

  } catch (error) {
    if (error === 'cancel') return;

    console.error('更新收货失败:', error);
    ElMessage.error('收货失败: ' + (error.message || '未知错误'));
  }
};

// 订单统计数据
const orderStats = ref({
  total: 0,
  totalAmount: 0,
  pendingCount: 0,
  approvedCount: 0,
  completedCount: 0
});

// 格式化货币金额
const formatCurrency = (value) => {
  if (!value) return '¥0.00';
  return '¥' + parseFloat(value).toFixed(2);
};

// 在加载订单时获取统计数据
const getOrderStats = async () => {
  try {
    // 从当前列表数据计算统计信息
    const total = orderList.value.length;
    const pendingCount = orderList.value.filter(item => item.status === 'pending').length;
    const approvedCount = orderList.value.filter(item => item.status === 'approved').length;
    const completedCount = orderList.value.filter(item => item.status === 'completed').length;
    
    // 计算总金额
    const totalAmount = orderList.value.reduce((sum, item) => {
      const amount = parseFloat(item.total_amount || 0);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);
    
    // 更新统计数据
    orderStats.value = {
      total,
      totalAmount,
      pendingCount,
      approvedCount,
      completedCount
    };
  } catch (error) {
    console.error('计算订单统计数据失败:', error);
    // 保持当前统计数据不变
  }
};

// 批量操作相关计算属性
const canBatchSubmit = computed(() => {
  if (selectedOrders.value.length === 0) return false;
  return selectedOrders.value.every(order => order.status === 'draft');
});

const canBatchApprove = computed(() => {
  if (selectedOrders.value.length === 0) return false;
  return selectedOrders.value.every(order => order.status === 'pending');
});

// 批量操作方法
const handleSelectionChange = (selection) => {
  selectedOrders.value = selection;
};

const clearSelection = () => {
  if (orderTableRef.value) {
    orderTableRef.value.clearSelection();
  }
  selectedOrders.value = [];
};

const handleBatchSubmit = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要批量提交选中的 ${selectedOrders.value.length} 个订单吗？`,
      '批量提交',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    batchLoading.value = true;
    let successCount = 0;
    let failCount = 0;

    for (const order of selectedOrders.value) {
      try {
        await purchaseApi.updateOrderStatus(order.id, 'pending');
        successCount++;
      } catch (error) {
        console.error(`订单 ${order.order_no} 提交失败:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      ElMessage.success(`成功提交 ${successCount} 个订单${failCount > 0 ? `，${failCount} 个失败` : ''}`);
      clearSelection();
      await loadOrders();
    } else {
      ElMessage.error('批量提交失败');
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量提交失败:', error);
    }
  } finally {
    batchLoading.value = false;
  }
};

const handleBatchApprove = async () => {
  try {
    await ElMessageBox.confirm(
      `确定要批量批准选中的 ${selectedOrders.value.length} 个订单吗？`,
      '批量批准',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    batchLoading.value = true;
    let successCount = 0;
    let failCount = 0;

    for (const order of selectedOrders.value) {
      try {
        await purchaseApi.updateOrderStatus(order.id, 'approved');
        successCount++;
      } catch (error) {
        console.error(`订单 ${order.order_no} 批准失败:`, error);
        failCount++;
      }
    }

    if (successCount > 0) {
      ElMessage.success(`成功批准 ${successCount} 个订单${failCount > 0 ? `，${failCount} 个失败` : ''}`);
      clearSelection();
      await loadOrders();
    } else {
      ElMessage.error('批量批准失败');
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量批准失败:', error);
    }
  } finally {
    batchLoading.value = false;
  }
};

// 现在使用 usePurchaseInspection 组合式函数中的 getInspectionTemplate 方法

// 税率配置使用 finance store

// 页面初始化
onMounted(async () => {
  // 立即显示加载状态
  loading.value = true;

  // 并行加载数据，提高加载速度
  try {
    await Promise.allSettled([
      loadOrders(),
      loadSuppliers(),
      loadOperators(),
      loadOperators(),
      financeStore.loadSettings(),
      authStore.fetchUserProfile(false) // 不获取权限信息，提高速度
    ]);
  } catch (error) {
    console.error('页面初始化失败:', error);
  } finally {
    loading.value = false;
  }
});

// 页面激活时刷新数据（从其他页面返回时）
onActivated(async () => {
  // 刷新订单列表和统计数据
  try {
    await Promise.allSettled([
      loadOrders(),
      getOrderStats()
    ]);
  } catch (error) {
    console.error('页面激活刷新失败:', error);
  }
});

// 加载采购申请列表（用于创建订单时选择）
const loadRequisitions = async () => {
  try {
    requisitionDialogLoading.value = true;
    const response = await purchaseApi.getOrderRequisitions({
      page: requisitionPagination.current,
      pageSize: requisitionPagination.size,
      requisitionNo: requisitionSearchKeyword.value,
      status: 'approved'  // 只获取已批准的采购申请
    });

    // 显示部分采购和未采购的申请（需要手动处理的）
    const requisitionItems = parseListData(response, { enableLog: false });
    const approvedRequisitions = requisitionItems.filter(item => 
      item.status === 'approved' && !item.is_fully_ordered
    );
    requisitionList.value = approvedRequisitions;
    requisitionPagination.total = approvedRequisitions.length;
    
    // 提取所有未采购的物料（扁平化列表）
    const allUnorderedMaterials = [];
    approvedRequisitions.forEach(req => {
      if (req.materials && req.materials.length > 0) {
        req.materials.forEach((material, idx) => {
          // 只添加未采购的物料（ordered_quantity为0或不存在）
          if (!material.ordered_quantity || parseFloat(material.ordered_quantity) === 0) {
            allUnorderedMaterials.push({
              ...material,
              requisition_id: req.id,
              requisition_number: req.requisition_number,
              uniqueKey: `${req.id}_${material.material_code}_${idx}`
            });
          }
        });
      }
    });
    unorderedMaterialsList.value = allUnorderedMaterials;
    
  } catch (error) {
    console.error('加载申请单列表失败:', error);
    ElMessage.error('加载申请单列表失败');
  } finally {
    requisitionDialogLoading.value = false;
  }
};

// 处理物料选择变化
const handleMaterialSelectionChange = (selection) => {
  selectedMaterials.value = selection;
};

// 确认物料选择
const confirmMaterialSelection = async () => {
  if (!selectedMaterials.value || selectedMaterials.value.length === 0) {
    ElMessage.warning('请选择至少一个物料');
    return;
  }
  
  try {
    // 如果当前已有物料，询问是否保留
    let keepExistingItems = true;
    if (orderForm.items.length > 0) {
      keepExistingItems = await ElMessageBox.confirm(
        '是否保留当前已添加的物料？',
        '提示',
        {
          confirmButtonText: '是',
          cancelButtonText: '否',
          type: 'warning'
        }
      ).then(() => true).catch(() => false);
      
      if (!keepExistingItems) {
        orderForm.items = [];
      }
    }
    
    // 设置关联到第一个申请单
    if (selectedMaterials.value.length > 0) {
      const firstMaterial = selectedMaterials.value[0];
      orderForm.requisition_id = firstMaterial.requisition_id;
      orderForm.requisition_number = firstMaterial.requisition_number;
    }
    
    // 添加选中的物料
    // 添加选中的物料
    // 使用 Loading 服务
    const loadingInstance = ElLoading.service({
      lock: true,
      text: '正在同步最新物料价格和税率...',
      background: 'rgba(0, 0, 0, 0.7)',
    });

    try {
      let addedCount = 0;
      
      // 并行获取所有选中物料的最新详情和历史报价
      const materialsWithDetails = await Promise.all(selectedMaterials.value.map(async (item) => {
        try {
          // 获取最新物料详情（税率等基础信息）
          const response = await baseDataApi.getMaterial(item.material_id);
          const detail = response.data || response;
          
          // ⚡ 使用智能询价 API 获取历史成交价（与 handleMaterialSelect 保持一致）
          let latestPrice = 0;
          try {
            const priceRes = await purchaseApi.getLatestPrice({
              material_id: item.material_id,
              supplier_id: orderForm.supplier_id || ''
            });
            if (priceRes && priceRes.data && priceRes.data.price > 0) {
              latestPrice = priceRes.data.price;
            }
          } catch (priceErr) {
            console.warn(`获取物料 ${item.material_code} 历史报价失败，降级使用物料主数据价格`);
          }
          
          // 如果询价 API 没有结果，降级到物料主数据
          if (latestPrice === 0) {
            latestPrice = parseFloat(detail.cost_price) || parseFloat(detail.price) || 0;
          }
          
          return { ...item, latestDetail: detail, latestPrice };
        } catch (e) {
          console.warn(`获取物料 ${item.material_code} 详情失败，将使用申请单中的数据`, e);
          return { ...item, latestDetail: null, latestPrice: 0 };
        }
      }));

      for (const item of materialsWithDetails) {
        // 检查是否已存在相同物料
        const existingIndex = orderForm.items.findIndex(i => i.material_id === item.material_id);
        
        // 确定最新税率
        let latestTaxRate = 0;
        if (item.latestDetail) {
           latestTaxRate = parseFloat(item.latestDetail.tax_rate) || 0;
           
           // 如果订单未设置供应商，且物料有默认供应商，自动设置
           if (!orderForm.supplier_id && item.latestDetail.supplier_id) {
               orderForm.supplier_id = item.latestDetail.supplier_id;
           }
        }

        if (existingIndex >= 0) {
          // 如果已存在，累加数量
          orderForm.items[existingIndex].quantity += parseFloat(item.quantity);
          // 如果原行价格为0，尝试更新为最新价格
          if (orderForm.items[existingIndex].price === 0 && item.latestPrice > 0) {
             orderForm.items[existingIndex].price = item.latestPrice;
          }
           // 如果原行税率为0（或未设置），尝试更新为最新税率
          if ((!orderForm.items[existingIndex].tax_rate) && latestTaxRate > 0) {
              orderForm.items[existingIndex].tax_rate = latestTaxRate;
          }

          recalculatePrice(orderForm.items[existingIndex]);
        } else {
          // 否则，添加新物料
          const specs = item.material_specs || item.specification || item.specs || '';
          
          orderForm.items.push({
            material_id: item.material_id,
            material_code: item.material_code || '',
            material_name: item.material_name || '',
            specification: specs,
            specs: specs,
            unit: item.unit,
            unit_name: item.unit,
            unit_id: item.unit_id,
            quantity: parseFloat(item.quantity),
            price: item.latestPrice, // 使用智能询价API的结果
            tax_rate: latestTaxRate,
            total_price: 0
          });
          // 计算总价
          const newItemIndex = orderForm.items.length - 1;
          recalculatePrice(orderForm.items[newItemIndex]);
        }
        addedCount++;
      }
      
      orderForm.status = 'draft';
      requisitionDialogVisible.value = false;
      ElMessage.success(`成功添加 ${addedCount} 个物料`);
    } finally {
      loadingInstance.close();
    }
  } catch (error) {
    console.error('添加物料失败:', error);
    ElMessage.error('添加物料失败: ' + (error.message || '未知错误'));
  }
};
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
  color: #303133;
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: #909399;
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
  color: #409eff;
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
  background-color: #f5f7fa !important;
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
  border: 1px solid #dcdfe6;
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
  background-color: #f5f7fa;
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
  color: #f56c6c !important;
  font-weight: 500;
}

.delete-text-btn:hover {
  color: #f78989 !important;
}
</style> 