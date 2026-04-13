<!--
/**
 * SalesOrders.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="outbound-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>{{ $t('page.sales.orders.title') }}</h2>
          <p class="subtitle">管理销售订单与跟踪</p>
        </div>
        <el-button type="primary" :icon="Plus" v-permission="'sales:orders:create'" @click="handleAdd">{{ $t('page.sales.orders.add') }}</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item :label="$t('page.sales.orders.orderNoCustomer')">
          <el-input
            v-model="searchQuery"
            :placeholder="$t('page.sales.orders.orderNoCustomerPlaceholder')"
            @keyup.enter="() => handleSearch(true)"
            @input="handleSearch"
            clearable
          ></el-input>
        </el-form-item>

        <el-form-item :label="$t('page.sales.orders.status')">
          <el-select v-model="statusFilter" :placeholder="$t('page.sales.orders.status')" clearable @change="() => handleSearch(true)" style="width: 110px !important">
            <el-option
              v-for="item in orderStatuses"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="操作人">
          <el-select v-model="operatorFilter" placeholder="请选择" clearable @change="handleOperatorChange" style="width: 110px !important">
            <el-option
              v-for="item in operators"
              :key="item.id"
              :label="item.real_name || item.username"
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
        
        <el-form-item>
          <el-button type="primary" @click="() => handleSearch(true)" :loading="loading">
            <el-icon v-if="!loading"><Search /></el-icon> 查询
          </el-button>
          <el-button @click="resetSearch" style="margin-left: 12px;" :loading="loading">
            <el-icon v-if="!loading"><Refresh /></el-icon> 重置
          </el-button>
          <el-dropdown style="margin-left: 12px;">
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
        </el-form-item>
      </el-form>
    </el-card>

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
        style="width: 100%"
        v-loading="loading"
      >
        <template #empty>
          <el-empty description="暂无销售订单数据" />
        </template>
        <el-table-column type="expand" width="50">
          <template #default="props">
            <div class="order-detail">
              <el-descriptions :column="3" border>
                <el-descriptions-item label="收货地址">{{ props.row.address }}</el-descriptions-item>
                <el-descriptions-item label="联系人">{{ props.row.contact }}</el-descriptions-item>
                <el-descriptions-item label="联系电话">{{ props.row.phone }}</el-descriptions-item>
                <el-descriptions-item label="合同编码">{{ props.row.contract_code || '-' }}</el-descriptions-item>
                <el-descriptions-item label="订单备注" :span="2">{{ props.row.remark }}</el-descriptions-item>
              </el-descriptions>
              
              <el-divider>订单物料</el-divider>
              <el-table :data="props.row.items" border style="width: 100%" table-layout="fixed">
                <el-table-column prop="material_code" label="物料编码" width="120" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.material_code || row.code">
                      {{ row.material_code || row.code }}
                    </span>
                    <span v-else-if="row.product_code || row.product_specs" style="color: #E6A23C;">
                      {{ row.product_code || row.product_specs }}
                      <el-tooltip content="该产品暂未匹配到物料，请在系统中补充" placement="top">
                        <el-icon style="margin-left: 4px;"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </span>
                    <span v-else style="color: #F56C6C;">
                      待补充
                      <el-tooltip content="该产品暂无编码，请补充物料信息" placement="top">
                        <el-icon style="margin-left: 4px;"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="material_name" label="物料名称" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span v-if="row.material_name || row.name">
                      {{ row.material_name || row.name }}
                    </span>
                    <span v-else style="color: #C0C4CC;">-</span>
                  </template>
                </el-table-column>
                <el-table-column prop="specification" label="规格" show-overflow-tooltip />
                <el-table-column prop="quantity" label="数量" width="100" show-overflow-tooltip />
                <el-table-column prop="stock_quantity" label="库存数量" width="100" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span :style="{ color: (row.stock_quantity || 0) >= (row.quantity || 0) ? '#67C23A' : '#F56C6C' }">
                      {{ (typeof row.stock_quantity === 'number' ? row.stock_quantity : parseFloat(row.stock_quantity) || 0).toFixed(2) }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column prop="unit_name" label="单位" width="80" show-overflow-tooltip />
                <el-table-column prop="unit_price" label="单价" width="100" show-overflow-tooltip>
                  <template #default="{ row }">
                    ¥{{ (typeof row.unit_price === 'number' ? row.unit_price : parseFloat(row.unit_price) || 0).toFixed(2) }}
                  </template>
                </el-table-column>
                <el-table-column prop="amount" label="金额" width="120" show-overflow-tooltip>
                  <template #default="{ row }">
                    ¥{{ (typeof row.amount === 'number' ? row.amount : parseFloat(row.amount) || 0).toFixed(2) }}
                  </template>
                </el-table-column>
                <el-table-column prop="remark" label="备注" width="120" show-overflow-tooltip>
                  <template #default="{ row }">
                    {{ row.remark || row.remarks || '-' }}
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        
        <el-table-column
          prop="order_no"
          label="订单编号"
          width="120"
          fixed
          resizable
          show-overflow-tooltip>
        </el-table-column>
        <el-table-column
          prop="customer"
          label="客户名称"
          width="250"
          resizable
          show-overflow-tooltip>
        </el-table-column>
        <el-table-column
          prop="created_by_real_name"
          label="操作人"
          width="100"
          resizable
          show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.created_by_real_name || row.created_by_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column
          prop="contract_code"
          label="合同编码"
          width="170"
          resizable
          show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.contract_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column 
          prop="totalAmount" 
          label="订单金额" 
          width="120"
          resizable
          show-overflow-tooltip>
          <template #default="{ row }">
            ¥{{ (typeof row.totalAmount === 'number' ? row.totalAmount : parseFloat(row.totalAmount) || 0).toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column 
          prop="order_no" 
          label="下单日期" 
          width="120"
          sortable="custom"
          resizable
          show-overflow-tooltip>
          <template #default="{ row }">
            {{ getOrderDateFromOrderNo(row.order_no) }}
          </template>
        </el-table-column>
        <el-table-column 
          prop="deliveryDate" 
          label="交付日期" 
          width="120"
          resizable
          show-overflow-tooltip>
          <template #default="{ row }">
            {{ formatDate(row.deliveryDate) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="status"
          label="状态"
          width="110"
          resizable
          show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag
              :type="getSalesStatusColor(row.status)"
            >
              {{ getSalesStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="锁定状态"
          width="100"
          resizable
          show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag
              :type="row.is_locked ? 'danger' : 'success'"
              size="small"
            >
              {{ row.is_locked ? '已锁定' : '未锁定' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          min-width="280"
          fixed="right">
          <template #default="{ row }">
            <el-button
              size="small"
              v-permission="'sales:orders:view'"
              @click="handleView(row)"
            >
              查看
            </el-button>
            <el-button
              size="small"
              type="primary"
              v-permission="'sales:orders:update'"
              @click="handleEdit(row)"
              v-if="row.status === 'draft' || row.status === 'pending'"
            >
              编辑
            </el-button>
            <el-popconfirm
              title="确定要确认该订单吗？"
              @confirm="handleConfirm(row)"
              v-if="canConfirm(row)"
            >
              <template #reference>
                <el-button size="small" type="primary" v-permission="'sales:orders:confirm'">确认</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要发货该订单吗？"
              @confirm="handleShip(row)"
              v-if="canShip(row)"
            >
              <template #reference>
                <el-button size="small" type="success" v-permission="'sales:orders:update'">发货</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要锁定该订单吗？锁定后无法修改。"
              @confirm="handleLock(row)"
              confirm-button-type="warning"
              v-if="canLock(row)"
            >
              <template #reference>
                <el-button size="small" type="warning" v-permission="'sales:orders:lock'">锁定</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要解锁该订单吗？"
              @confirm="handleUnlock(row)"
              v-if="canUnlock(row)"
            >
              <template #reference>
                <el-button size="small" type="info" v-permission="'sales:orders:unlock'">解锁</el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              title="确定要取消该订单吗？此操作无法恢复。"
              @confirm="handleCancel(row)"
              confirm-button-type="danger"
              v-if="canCancel(row)"
            >
              <template #reference>
                <el-button size="small" type="danger" v-permission="'sales:orders:cancel'">取消</el-button>
              </template>
            </el-popconfirm>
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

    <!-- 新增/编辑订单对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增订单' : '编辑订单'"
      width="58%"
      destroy-on-close
    >
      <div v-loading="dialogLoading">
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="客户名称" prop="customer_id">
              <el-select
                v-model="form.customer_id"
                placeholder="请选择客户（支持客户编码/名称搜索）"
                filterable
                remote
                :remote-method="searchCustomers"
                :loading="customerSearchLoading"
                @change="handleCustomerChange"
                @keyup.enter="handleCustomerEnterKey"
                style="width: 100%"
              >
                <el-option
                  v-for="item in filteredCustomers"
                  :key="item.id"
                  :label="`${item.code} - ${item.name}`"
                  :value="item.id"
                >
                  <span style="float: left">{{ item.code }} - {{ item.name }}</span>
                  <span style="float: right; color: #8492a6; font-size: 13px">{{ item.contact_person || '无联系人' }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="合同编码" prop="contract_code">
              <el-input
                ref="contractCodeInput"
                v-model="form.contract_code"
                placeholder="请输入合同编码"
                style="width: 100%"
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
                style="width: 100%"
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
              style="width: 100%"
              table-layout="fixed"
              :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
              empty-text="请添加订单物料"
            >
              <el-table-column label="物料编码" width="160">
                <template #default="{ row, $index }">
                  <el-autocomplete
                    :ref="(el) => setMaterialSelectRef(el, $index)"
                    v-model="row.code"
                    placeholder="输入编码/名称/规格"
                    clearable
                    :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                    @select="(item) => handleMaterialSelect(item, $index)"
                    @keydown.enter.prevent="handleMaterialEnter($index)"
                    @clear="handleMaterialClear($index)"
                    style="width: 100%"
                    :trigger-on-focus="false"
                    :debounce="300"
                    :class="{ 'is-required-field': !row.material_id }"
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
              <el-table-column label="物料名称" prop="material_name" width="140" show-overflow-tooltip />
              
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
                    v-model="row.unit_price"
                    @input="(val) => { row.unit_price = Number(val) || 0; calculateItemAmount($index); }"
                    placeholder="单价"
                    type="number"
                    min="0"
                    step="0.01"
                    size="small"
                  />
                </template>
              </el-table-column>

              <el-table-column label="单位" prop="unit_name" width="70" />

              <el-table-column label="金额" width="100">
                <template #default="{ row }">
                    ¥{{ row.amount ? row.amount.toFixed(2) : '0.00' }}
                </template>
              </el-table-column>

              <el-table-column label="税率" width="100">
                <template #default="{ row, $index }">
                  <el-select 
                    v-model="row.tax_rate" 
                    placeholder="税率"
                    size="small"
                    @change="calculateItemAmount($index)"
                    style="width: 100%"
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
                  ¥{{ row.tax_amount ? row.tax_amount.toFixed(2) : '0.00' }}
                </template>
              </el-table-column>

              <el-table-column label="备注" width="125">
                <template #default="{ row }">
                  <el-input 
                    v-model="row.remark"
                    placeholder="请输入备注"
                    size="small"
                    maxlength="200"
                    clearable />
                </template>
              </el-table-column>

              <el-table-column label="操作" width="80" fixed="right">
                <template #default="{ $index }">
                  <el-button
                    type="danger"
                    size="small"
                    @click="removeMaterial($index)"
                  >
                    删除
                  </el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="add-material" style="margin-top: 10px;">
              <el-button type="primary" @click="addMaterial">
                <el-icon><Plus /></el-icon>添加物料
              </el-button>
            </div>
          </div>
        </el-form-item>

        <!-- 订单汇总 -->
        <div class="order-summary" style="margin-top: 15px; padding: 12px; background: #f5f7fa; border-radius: 4px;">
          <el-row :gutter="20">
            <el-col :span="8" style="text-align: right;">
              <span style="color: #606266;">小计: ￥{{ form.subtotal?.toFixed(2) || '0.00' }}</span>
            </el-col>
            <el-col :span="8" style="text-align: right;">
              <span style="color: #e6a23c;">税额: ￥{{ form.tax_amount?.toFixed(2) || '0.00' }}</span>
            </el-col>
            <el-col :span="8" style="text-align: right;">
              <span style="font-weight: bold; color: #409eff; font-size: 16px;">合计: ￥{{ form.total_amount?.toFixed(2) || '0.00' }}</span>
            </el-col>
          </el-row>
        </div>

        <el-form-item label="备注" style="margin-top: 15px;">
          <el-input type="textarea" v-model="form.remark" />
        </el-form-item>
      </el-form>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-permission="'sales:orders:update'" type="primary" @click="handleSubmit" :loading="dialogLoading">保存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 订单详情对话框 -->
    <el-dialog
      v-model="detailsVisible"
      title="订单详情"
      width="55%"
      destroy-on-close
    >
      <div v-loading="detailsLoading">
        <template v-if="currentOrder">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="订单编号">{{ currentOrder.order_no }}</el-descriptions-item>
            <el-descriptions-item label="客户名称">{{ currentOrder.customer_name || currentOrder.customer }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="getSalesStatusColor(currentOrder.status)">{{ getSalesStatusText(currentOrder.status) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="合同编码">{{ currentOrder.contract_code || '-' }}</el-descriptions-item>
            <el-descriptions-item label="交付日期">{{ formatDate(currentOrder.deliveryDate) }}</el-descriptions-item>
            <el-descriptions-item label="订单金额">
              <span style="font-weight: bold; color: #409eff;">¥{{ (parseFloat(currentOrder.totalAmount) || 0).toFixed(2) }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="联系人">{{ currentOrder.contact || '-' }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ currentOrder.phone || '-' }}</el-descriptions-item>
            <el-descriptions-item label="收货地址">{{ currentOrder.address || '-' }}</el-descriptions-item>
            <el-descriptions-item label="备注" :span="3">{{ currentOrder.remark || '-' }}</el-descriptions-item>
          </el-descriptions>

          <el-divider content-position="left">订单物料明细</el-divider>
          <el-table :data="currentOrder.items || []" border style="width: 100%" table-layout="fixed">
            <el-table-column prop="material_code" label="物料编码" width="140" show-overflow-tooltip />
            <el-table-column prop="material_name" label="物料名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="specification" label="规格" width="120" show-overflow-tooltip />
            <el-table-column prop="quantity" label="数量" width="90" align="center" />
            <el-table-column prop="unit_name" label="单位" width="70" align="center" />
            <el-table-column label="单价" width="100" align="right">
              <template #default="{ row }">
                ¥{{ (parseFloat(row.unit_price) || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column label="金额" width="120" align="right">
              <template #default="{ row }">
                ¥{{ (parseFloat(row.amount) || 0).toFixed(2) }}
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" width="120" show-overflow-tooltip>
              <template #default="{ row }">
                {{ row.remark || '-' }}
              </template>
            </el-table-column>
          </el-table>
        </template>
        <el-empty v-else-if="!detailsLoading" description="暂无数据" />
      </div>
      <template #footer>
        <el-button @click="detailsVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 导入对话框 -->
    <el-dialog
      title="导入订单"
      v-model="importDialogVisible"
      width="500px"
    >
      <el-tabs v-model="importMethod">
        <el-tab-pane label="文件导入" name="template">
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
            style="margin-top: 15px;"
          >
            <template #trigger>
              <el-button type="primary">选择文件</el-button>
            </template>
            <template #tip>
              <div class="el-upload__tip">只支持 .xlsx, .xls 格式文件，不超过 10MB</div>
            </template>
          </el-upload>
        </el-tab-pane>
        <el-tab-pane label="JSON导入" name="json">
          <el-input
            v-model="importJsonData"
            type="textarea"
            :rows="10"
            placeholder="说明：当前系统暂未开启纯 JSON 批量直导支持"
            disabled
          ></el-input>
        </el-tab-pane>
      </el-tabs>

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
          <el-button v-permission="'sales:orders:import'" type="primary" @click="submitImport" :loading="importing">导入</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { salesApi, api } from '@/api'
import { usePaginatedFetching } from '@/composables/useDataFetching'
import { parseListData } from '@/utils/responseParser'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()

import { Search, Plus, Upload, Download, Refresh } from '@element-plus/icons-vue'
import { getSalesStatusText, getSalesStatusColor } from '@/constants/systemConstants'

// ========== 组合式函数导入 ==========
import { useOrderForm } from './composables/useOrderForm'
import { useOrderActions } from './composables/useOrderActions'
import { useOrderImportExport } from './composables/useOrderImportExport'

// ========== 本地状态 ==========
const searchQuery = ref('')
const statusFilter = ref('')
const operatorFilter = ref('')
const dateRange = ref([])
const operators = ref([])

// 常量定义
const SEARCH_DEBOUNCE_DELAY = 300

// 状态映射
const orderStatuses = [
  { value: 'pending', label: '待处理' },
  { value: 'confirmed', label: '已确认' },
  { value: 'in_production', label: '生产中' },
  { value: 'ready_to_ship', label: '可发货' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' }
]

// 订单统计数据
const orderStats = ref({
  total: 0, pending: 0, confirmed: 0, inProduction: 0,
  readyToShip: 0, shipped: 0, cancelled: 0
})

// 数据规范化处理函数
const normalizeOrdersData = (orders) => {
  if (!Array.isArray(orders)) return []
  return orders.map(order => ({
    ...order,
    deliveryDate: order.deliveryDate || order.delivery_date,
    updated_at: order.updated_at || order.created_at || order.order_date || new Date().toISOString(),
    totalAmount: parseFloat(order.totalAmount) || 0,
    items: Array.isArray(order.items) ? order.items : []
  })).sort((a, b) => {
    const orderNoA = a.order_no || ''
    const orderNoB = b.order_no || ''
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
  formRef, contractCodeInput, form, rules,
  customers, filteredCustomers, customerSearchLoading,
  fetchCustomers, searchCustomers, handleCustomerChange, handleCustomerEnterKey,
  products, filteredProducts, materialsLoading,
  materialSelectRefs, quantityInputRefs,
  setMaterialSelectRef, setQuantityInputRef,
  addMaterial, removeMaterial,
  fetchMaterialSuggestions, handleMaterialSelect, handleMaterialClear,
  handleMaterialEnter, handleQuantityEnter,
  calculateItemAmount, calculateTotalAmount,
  handleSubmit, handleAdd, handleEdit,
  vatRateOptions, defaultVATRate, financeStore
} = useOrderForm(fetchData, updateParams)

const {
  detailsVisible, detailsLoading, currentOrder,
  handleConfirm, handleCancel, handleShip,
  handleLock, handleUnlock, handleView,
  canConfirm, canShip, canCancel, canLock, canUnlock
} = useOrderActions(fetchData, tableData)

const {
  importDialogVisible, importMethod, uploadRef, importJsonData,
  importing, importResult,
  handleImport, closeImportDialog, downloadTemplate,
  handleFileChange, submitImport, handleExport
} = useOrderImportExport(fetchData, searchQuery, statusFilter, operatorFilter, dateRange)

// ========== 本地方法 ==========

// 格式化日期
const formatDate = (date) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}


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
    const response = await salesApi.getOrders({ pageSize: 100000 })
    const allOrders = parseListData(response, { enableLog: false })
    calculateOrderStats(allOrders)
  } catch (error) {
    console.error('获取订单统计数据失败:', error)
  }
}

// 获取操作人列表
const fetchOperators = async () => {
  try {
    const response = await api.get('/sales/orders/operators')
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
let materialSearchTimeout = null
const handleSearch = (immediate = false) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  if (immediate) updateParams({ page: 1 })
  else searchTimeout = setTimeout(() => { updateParams({ page: 1 }) }, SEARCH_DEBOUNCE_DELAY)
}

const getOrderDateFromOrderNo = (orderNo) => {
  if (!orderNo || orderNo.length < 8) return '2024-04-01'
  try {
    const dateStr = orderNo.substring(2, 8)
    const year = parseInt('20' + dateStr.substring(0, 2))
    const month = parseInt(dateStr.substring(2, 4))
    const day = parseInt(dateStr.substring(4, 6))
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
  } catch (e) { return '2024-05-01' }
}

// ========== 生命周期 ==========
onMounted(async () => {
  try {
    await nextTick()
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
  if (materialSearchTimeout) { clearTimeout(materialSearchTimeout); materialSearchTimeout = null }
  currentOrder.value = null
})

onActivated(() => {
  fetchData()
  fetchStats()
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

.order-detail {
  padding: 20px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 8px;
  margin: 10px 0;
}

.order-detail :deep(.el-descriptions) {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.order-detail :deep(.el-descriptions__label) {
  font-weight: 500;
  color: #64748b;
  background: #f8fafc;
}

.order-detail :deep(.el-descriptions__content) {
  color: #1e293b;
}

.order-detail :deep(.el-divider) {
  margin: 20px 0 16px 0;
}

/* 订单物料表格样式 */
.order-detail :deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.order-detail :deep(.el-table th) {
  background: #f1f5f9 !important;
  color: #475569;
  font-weight: 600;
  font-size: 13px;
}

.order-detail :deep(.el-table td) {
  font-size: 13px;
  color: #334155;
}

.order-detail :deep(.el-table--striped .el-table__body tr.el-table__row--striped td) {
  background: #fafbfc;
}

/* 查看对话框中的订单详情样式 */
.order-details {
  padding: 10px 0;
}

.order-details :deep(.el-descriptions) {
  background: #fafbfc;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
}

.order-details :deep(.el-descriptions__label) {
  font-weight: 500;
  color: #64748b;
}

.order-details :deep(.el-divider) {
  margin: 20px 0 16px 0;
}

.order-details :deep(.el-table) {
  border-radius: 8px;
  overflow: hidden;
}

.order-details :deep(.el-table th) {
  background: #f1f5f9 !important;
  color: #475569;
  font-weight: 600;
  font-size: 13px;
}

.order-details :deep(.el-table td) {
  font-size: 13px;
  color: #334155;
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

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
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
  background-color: #f0f9ff;
  border: 1px solid #b3d8ff;
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
  background-color: #fef0f0 !important;
}

.is-required-field :deep(.el-input__wrapper):hover {
  border-color: var(--color-danger) !important;
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

/* 对话框滚动样式 */
:deep(.el-dialog__body) {
  max-height: 70vh;
  overflow-y: auto;
  overflow-x: hidden;
}

/* 表格容器宽度控制 */
.materials-table-container {
  width: 100%;
  overflow-x: auto;
}

</style>