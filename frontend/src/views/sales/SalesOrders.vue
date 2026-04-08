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
// 移除未使用的导入

import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick, onActivated } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { salesApi, baseDataApi, inventoryApi, api } from '@/api'
import request from '@/utils/request'
import { usePaginatedFetching, useFormSubmit } from '@/composables/useDataFetching'
import { parseListData } from '@/utils/responseParser'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

// 权限store
const authStore = useAuthStore()
const router = useRouter()

import {
  Search,
  Plus,
  Upload,
  Download,
  Refresh
} from '@element-plus/icons-vue'
import { searchMaterials } from '@/utils/searchConfig'
import { useFinanceStore } from '@/stores/finance'
import { storeToRefs } from 'pinia'

// 财务 store
const financeStore = useFinanceStore()
const { vatRateOptions, defaultVATRate } = storeToRefs(financeStore)

// 常量定义
const SEARCH_DEBOUNCE_DELAY = 300; // 搜索防抖延迟

// 数据定义
const searchQuery = ref('')
const statusFilter = ref('')
const operatorFilter = ref('')
const dateRange = ref([])
const operators = ref([])
// 详情对话框控制
const detailsVisible = ref(false)
const detailsLoading = ref(false)
const currentOrder = ref(null)

// onMounted 将在 usePaginatedFetching 之后定义

onUnmounted(() => {
  // 清理定时器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  if (materialSearchTimeout) {
    clearTimeout(materialSearchTimeout);
    materialSearchTimeout = null;
  }

  // 清理数据 - 注意：ordersData 由 usePaginatedFetching 管理，tableData 是 computed 只读属性
  // 只清理可以直接修改的响应式变量
  currentOrder.value = null;
})

// 状态映射
const orderStatuses = [
  { value: 'pending', label: '待处理' },
  { value: 'confirmed', label: '已确认' },
  { value: 'in_production', label: '生产中' },
  { value: 'ready_to_ship', label: '可发货' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' }
]

// 客户列表和产品列表
const customers = ref([])
const filteredCustomers = ref([]) // 用于存储过滤后的客户列表
const customerSearchLoading = ref(false) // 客户搜索加载状态
const products = ref([]) // 初始化为空数组
const filteredProducts = ref([]) // 用于存储过滤后的产品列表
const materialsLoading = ref(false) // 物料加载状态

// 通用数据提取函数

// 简化的数组确保函数

// 简化监听器 - 移除深度监听以提升性能
watch(() => products.value.length, (newLength) => {
  if (newLength > 0 && filteredProducts.value.length === 0) {
    filteredProducts.value = [...products.value];
  }
});
const MATERIAL_SEARCH_DEBOUNCE_DELAY = 500

// 调试日志函数（生产环境静默）

const materialSearchQuery = ref('') // 存储物料搜索关键词
let materialSearchTimeout = null // 物料搜索防抖定时器

// 优化：只加载客户数据
const fetchCustomers = async () => {
  try {
    const response = await baseDataApi.getCustomers({ status: 'active' }); // 只获取启用的客户

    // 使用统一解析器
    const customersData = parseListData(response, { enableLog: false });

    // 确保是数组后再进行映射
    if (customersData.length > 0) {
      customers.value = customersData.map(customer => ({
        id: customer.id,
        code: customer.code || customer.customer_code || `C${customer.id}`, // 客户编码
        name: customer.name,
        contact_person: customer.contact_person,
        contact_phone: customer.contact_phone,
        address: customer.address
      }));
      // 初始化过滤后的客户列表
      filteredCustomers.value = [...customers.value];
    } else {
      customers.value = [];
      filteredCustomers.value = [];
    }
  } catch (error) {
    console.error('获取客户数据失败:', error);
    ElMessage.error('获取客户数据失败');
    customers.value = [];
    filteredCustomers.value = [];
  }
};

// 客户搜索方法
const searchCustomers = (query) => {
  customerSearchLoading.value = true;

  // 防抖处理
  setTimeout(() => {
    if (query) {
      // 根据客户编码或名称进行搜索
      filteredCustomers.value = customers.value.filter(customer => {
        const searchText = query.toLowerCase();
        return (
          customer.code.toLowerCase().includes(searchText) ||
          customer.name.toLowerCase().includes(searchText) ||
          (customer.contact_person && customer.contact_person.toLowerCase().includes(searchText))
        );
      });
    } else {
      // 如果没有搜索条件，显示所有客户
      filteredCustomers.value = [...customers.value];
    }
    customerSearchLoading.value = false;
  }, 300);
};

// 优化：按需加载物料数据

import { getSalesStatusText, getSalesStatusColor } from '@/constants/systemConstants'

// 状态相关函数已在模板中直接使用

// 添加订单统计数据
const orderStats = ref({
  total: 0,
  pending: 0,
  confirmed: 0,
  inProduction: 0,
  readyToShip: 0,
  shipped: 0,
  cancelled: 0
})

// 格式化日期
const formatDate = (date) => {
  // 如果日期为空或无效，则返回占位符
  if (!date) return '-';
  
  try {
    // 检查日期是否为有效值
    const parsedDate = dayjs(date);
    if (!parsedDate.isValid()) {
      return '-';
    }
    
    // 无论什么类型，都只显示年月日
    return parsedDate.format('YYYY-MM-DD');
  } catch (error) {
    console.error('日期格式化错误:', error, '原始日期:', date);
    return '-';
  }
}

// 计算统计数据 - 支持传入数据或使用当前页数据
const calculateOrderStats = (data = null) => {
  const ordersToCount = data || tableData.value;
  const stats = {
    total: ordersToCount.length,
    pending: 0,
    confirmed: 0,
    inProduction: 0,
    readyToShip: 0,
    shipped: 0,
    cancelled: 0
  }

  ordersToCount.forEach(order => {
    const status = order.status;
    if (status === 'pending' || status === 'draft') {
      stats.pending++
    } else if (status === 'confirmed') {
      stats.confirmed++
    } else if (status === 'in_production' || status === 'processing') {
      stats.inProduction++
    } else if (status === 'ready_to_ship') {
      stats.readyToShip++
    } else if (status === 'shipped' || status === 'completed' || status === 'delivered') {
      // 已发货、已完成、已交付都统计为已发货
      stats.shipped++
    } else if (status === 'cancelled') {
      stats.cancelled++
    }
  })

  orderStats.value = stats
}

// 获取全量订单统计数据
const fetchStats = async () => {
  try {
    // 获取所有订单数据用于统计
    const response = await salesApi.getOrders({ pageSize: 100000 });
    const allOrders = parseListData(response, { enableLog: false });
    calculateOrderStats(allOrders);
  } catch (error) {
    console.error('获取订单统计数据失败:', error);
  }
}

// 获取操作人列表
const fetchOperators = async () => {
  try {
    // 直接调用API，避免缓存问题
    // 拦截器已解包，response.data 就是业务数据
    const response = await api.get('/sales/orders/operators');
    operators.value = response.data || [];
  } catch (error) {
    console.error('获取操作人列表失败:', error);
    operators.value = [];
  }
};

// 处理操作人选择变化
const handleOperatorChange = (value) => {
  // 直接调用fetchData，传递operator参数
  fetchData({ operator: value });
};

// 重置搜索方法
const resetSearch = () => {
  searchQuery.value = '';
  statusFilter.value = '';
  operatorFilter.value = '';
  dateRange.value = [];
  fetchData();
};

// 防抖搜索处理
let searchTimeout = null;
const handleSearch = (immediate = false) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (immediate) {
    updateParams({ page: 1 });
  } else {
    searchTimeout = setTimeout(() => {
      updateParams({ page: 1 });
    }, SEARCH_DEBOUNCE_DELAY);
  }
};

// 使用统一的分页数据获取Hook
const {
  loading,
  data: ordersData,
  pagination,
  fetchData,
  handlePageChange,
  handleSizeChange,
  updateParams
} = usePaginatedFetching(
  async (params) => {
    // 构建查询参数
    const queryParams = {
      search: searchQuery.value?.trim() || '',
      status: statusFilter.value,
      operator: params.operator || operatorFilter.value || '',
      sort: 'order_no',
      order: 'desc',
      ...params
    };

    // 确保operator参数正确传递
    if (params.operator) {
      queryParams.operator = params.operator;
    } else if (operatorFilter.value) {
      queryParams.operator = operatorFilter.value;
    }

    // 构建查询参数

    // 添加日期范围参数
    if (dateRange.value && dateRange.value.length === 2) {
      queryParams.startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD');
      queryParams.endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD');
    }

    const response = await salesApi.getOrders(queryParams);

    // 使用统一解析器
    const rawOrders = parseListData(response, { enableLog: false });
    const orders = normalizeOrdersData(rawOrders);
    
    // 直接返回响应，让 usePaginatedFetching 处理数据结构
    return {
      ...response,
      data: {
        items: orders,
        total: response.data.total || orders.length
      }
    };
  },
  {
    pageSize: 10,
    immediate: true
  }
);

// 保持向后兼容的变量
const tableData = computed(() => ordersData.value);
const currentPage = computed(() => pagination.current);
const pageSize = computed(() => pagination.pageSize);
const total = computed(() => pagination.total);

// 监听数据变化，不再重新计算统计（统计由 fetchStats 独立获取全量数据）
// watch 已移除，避免统计数据被当前页数据覆盖

// 税率配置使用 finance store

// 组件挂载后的初始化
// 组件挂载后的初始化
onMounted(async () => {
  try {
    // 确保DOM完全渲染后再执行操作
    await nextTick();
    
    // 初始化统计数据 - 使用全量数据统计
    fetchStats();

    // 加载税率配置
    financeStore.loadSettings();
    
    // usePaginatedFetching 会自动加载数据，所以这里不需要手动调用 fetchData
    
    // 延迟加载客户数据（用于搜索下拉框）
    setTimeout(() => {
      fetchCustomers();
    }, 500); // 增加延迟时间

    // 获取操作人列表
    fetchOperators();

  } catch (error) {
    console.error('❌ 组件挂载时出错:', error);
  }
});

// 监听页面激活事件（用于 keep-alive 缓存时的自动刷新）
onActivated(() => {
  // 每次切换回该页面时，重新获取当前页数据
  fetchData();
  // 更新统计数据 - 使用全量数据统计
  fetchStats();
});

// 数据规范化处理函数
const normalizeOrdersData = (orders) => {
  if (!Array.isArray(orders)) return [];

  return orders.map(order => ({
    ...order,
    deliveryDate: order.deliveryDate || order.delivery_date,
    updated_at: order.updated_at || order.created_at || order.order_date || new Date().toISOString(),
    // 确保金额字段为数字类型
    totalAmount: parseFloat(order.totalAmount) || 0,
    // 确保订单项存在
    items: Array.isArray(order.items) ? order.items : []
  })).sort((a, b) => {
    // 按订单编号降序排列
    const orderNoA = a.order_no || '';
    const orderNoB = b.order_no || '';
    return orderNoB.localeCompare(orderNoA);
  });
};

// 对话框控制
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogType = ref('add')

// 表单引用
const formRef = ref(null)
const contractCodeInput = ref(null)

// 导入对话框控制
const importDialogVisible = ref(false)
const importMethod = ref('template')
const uploadRef = ref(null)
const importJsonData = ref('')
const importing = ref(false)
const importResult = ref(null)

// 文件对象
let importFile = null

// 表单数据
const form = reactive({
  customer_id: '',
  customer_name: '',
  contract_code: '',
  contact: '',
  phone: '',
  address: '',
  deliveryDate: '',
  status: 'pending',
  items: [],
  remark: '',
  subtotal: 0,        // 不含税金额
  tax_amount: 0,      // 税额
  total_amount: 0
})

// 表单验证规则
const rules = {
  customer_id: [
    { required: true, message: '请选择客户', trigger: 'change' }
  ],
  deliveryDate: [
    { required: true, message: '请选择交付日期', trigger: 'change' }
  ]
}

// 计算订单总金额（含税）
const calculateTotalAmount = () => {
  // 计算小计（所有项目的金额之和）
  const subtotal = form.items.reduce((total, item) => {
    return total + (item.amount || 0)
  }, 0)
  
  // 计算总税额（所有项目的税额之和）
  const taxAmount = form.items.reduce((total, item) => {
    return total + (item.tax_amount || 0)
  }, 0)
  
  form.subtotal = subtotal
  form.tax_amount = taxAmount
  form.total_amount = subtotal + taxAmount
}

// 监听订单项变化，自动计算总金额
watch(() => form.items, () => {
  calculateTotalAmount()
}, { deep: true })

// 计算单个物料项的金额和税额
const calculateItemAmount = (index) => {
  if (index < 0 || index >= form.items.length) {
    return;
  }

  const item = form.items[index];
  if (!item) {
    return;
  }
  
  // 确保数量和单价是数字
  let quantity, unitPrice;
  
  // 检查quantity的类型
  if (typeof item.quantity === 'string') {
    quantity = parseFloat(item.quantity.replace(/,/g, '') || 0);
  } else {
    quantity = Number(item.quantity || 0);
  }
  
  // 检查unit_price的类型
  if (typeof item.unit_price === 'string') {
    unitPrice = parseFloat(item.unit_price.replace(/,/g, '') || 0);
  } else {
    unitPrice = Number(item.unit_price || 0);
  }
  
  // 确保是有效数字
  if (isNaN(quantity)) quantity = 0;
  if (isNaN(unitPrice)) unitPrice = 0;
  
  // 更新物料项的数量和单价为数字类型
  item.quantity = quantity;
  item.unit_price = unitPrice;
  item.amount = quantity * unitPrice;
  
  // 计算该项的税额
  const taxRate = item.tax_rate !== undefined ? item.tax_rate : 0;
  item.tax_amount = item.amount * taxRate;
  
  // 更新订单总金额
  calculateTotalAmount();
}

// 检查库存 - 使用统一的库存服务
const checkInventory = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  // 筛选和验证物料项
  const materialItems = items.filter(item => {
    if (!item.material_id) {
      return false;
    }

    const materialId = parseInt(item.material_id);
    if (isNaN(materialId) || materialId <= 0) {
      return false;
    }

    const quantity = parseFloat(item.quantity);
    if (isNaN(quantity) || quantity <= 0) {
      return false;
    }

    return true;
  });

  if (materialItems.length === 0) {
    return [];
  }

  try {
    // 构建需求数组，使用统一的库存检查服务
    const requirements = materialItems.map(item => ({
      materialId: parseInt(item.material_id),
      quantity: parseFloat(item.quantity),
      materialCode: item.material_code || item.code || '',
      materialName: item.material_name || item.name || '未知物料'
    }));

    // 调用统一的库存检查API
    const response = await inventoryApi.checkStockSufficiency(requirements);
    const insufficientItems = response.data || [];

    return insufficientItems || [];
  } catch (error) {
    console.error('❌ 检查库存时出错:', error);
    ElMessage.error(`检查库存失败: ${error.message || '网络错误'}`);
    return [];
  }
};

// 使用统一的表单提交Hook
const { loading: submitting, submit } = useFormSubmit(
  async (formData) => {
    if (dialogType.value === 'add') {
      return await salesApi.createOrder(formData);
    } else {
      return await salesApi.updateOrder(form.id, formData);
    }
  },
  {
    successMessage: dialogType.value === 'add' ? '订单创建成功' : '订单更新成功',
    onSuccess: () => {
      dialogVisible.value = false;
      fetchData();
    }
  }
);

// 表单提交
const handleSubmit = async () => {
  if (!form.customer_id) {
    ElMessage.error('请选择客户');
    return;
  }
  
  if (form.items.length === 0) {
    ElMessage.error('请添加至少一项产品');
    return;
  }
  
  // 验证所有订单项都有有效的 material_id
  const invalidItems = [];
  form.items.forEach((item, index) => {
    if (!item.material_id) {
      invalidItems.push(index + 1);
    }
  });
  
  if (invalidItems.length > 0) {
    ElMessage.error(`第 ${invalidItems.join(', ')} 行物料未选择，请选择物料后再提交`);
    return;
  }
  
  // 验证所有订单项都有数量（单价可以为0或空）
  const incompleteItems = [];
  form.items.forEach((item, index) => {
    const quantity = Number(item.quantity);
    if (!quantity || quantity <= 0) {
      incompleteItems.push(index + 1);
    }
  });
  
  if (incompleteItems.length > 0) {
    ElMessage.error(`第 ${incompleteItems.join(', ')} 行数量不正确，请检查后再提交`);
    return;
  }
  
  // 检查库存
  try {
    const insufficientItems = await checkInventory(form.items);
    
    // 确定订单状态
    let orderStatus;
    let shouldGeneratePlans = false; // 是否需要生成生产/采购计划
    
    if (dialogType.value === 'edit') {
      // 编辑订单时：保持原有状态，但检查是否需要生成计划
      orderStatus = form.status || 'pending';
      
      // 如果有库存不足的物料，提示用户
      if (insufficientItems.length > 0) {
        const itemMessages = insufficientItems.map(item => 
          `${item.material_name || '未知物料'}: 需要 ${item.quantity}, 库存 ${item.currentStock}`
        );
        
        const alertMessage = `以下物料库存不足:\n${itemMessages.join('\n')}\n\n是否继续保存并生成生产/采购计划?`;
        
        try {
          await ElMessageBox.confirm(alertMessage, '库存不足警告', {
            confirmButtonText: '继续保存',
            cancelButtonText: '取消',
            type: 'warning',
          });
          
          shouldGeneratePlans = true; // 标记需要生成计划
        } catch (userChoice) {
          return; // 用户取消，退出函数
        }
      }
    } else {
      // 新增订单时：根据库存情况设置状态
      if (insufficientItems.length > 0) {
        // 构建提示消息
        const itemMessages = insufficientItems.map(item => 
          `${item.material_name || '未知物料'}: 需要 ${item.quantity}, 库存 ${item.currentStock}`
        );
        
        const alertMessage = `以下物料库存不足:\n${itemMessages.join('\n')}\n\n是否仍要创建订单?`;
        
        try {
          await ElMessageBox.confirm(alertMessage, '库存不足警告', {
            confirmButtonText: '继续创建',
            cancelButtonText: '取消',
            type: 'warning',
          });
          
          // 用户确认创建订单，后端会自动根据物料来源生成生产计划和采购申请
          orderStatus = 'in_production';
          shouldGeneratePlans = true;
        } catch (userChoice) {
          return; // 用户取消，退出函数
        }
      } else {
        // 所有物料库存充足，可以直接设置为可发货状态
        orderStatus = 'ready_to_ship';
      }
    }
    
    // 处理表单数据
    dialogLoading.value = true;
    const postData = {
      customer_id: form.customer_id,
      contract_code: form.contract_code || '',
      delivery_date: form.deliveryDate,
      order_date: new Date().toISOString().split('T')[0], // 使用当前日期作为下单日期
      updated_at: new Date().toISOString(), // 使用当前时间作为更新时间
      status: orderStatus, // 使用确定的订单状态
      should_generate_plans: shouldGeneratePlans, // 告诉后端是否需要生成计划
      // 税率相关字段 - 移至明细行
      subtotal: form.subtotal || 0,
      total_amount: form.total_amount || 0,
      notes: form.remark || '',
      items: form.items.map(item => {
        const quantity = parseFloat(item.quantity) || 0;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const taxRate = item.tax_rate !== undefined ? item.tax_rate : defaultVATRate.value;
        const amount = quantity * unitPrice;
        const taxAmount = amount * taxRate;
        
        return {
          material_id: item.material_id,
          quantity: quantity,
          unit_price: unitPrice,
          amount: amount,
          tax_percent: taxRate, // 映射到数据库的 tax_percent 字段
          tax_amount: taxAmount,
          specification: item.specification,
          remark: item.remark || ''
        };
      })
    };
    
    // 发送请求保存订单
    let orderSaved = false;
    try {
      if (dialogType.value === 'edit') {
        // 编辑订单
        await salesApi.updateOrder(form.id, postData);
        ElMessage.success('订单更新成功');
        orderSaved = true;
      } else {
        // 新增订单
        await salesApi.createOrder(postData);
        ElMessage.success('订单创建成功');
        // 新增订单后重置到第一页
        updateParams({ page: 1 });
        orderSaved = true;
      }

      dialogVisible.value = false;
    } catch (error) {
      const action = dialogType.value === 'edit' ? '更新' : '创建';
      console.error(`${action}订单失败:`, error);
      ElMessage.error(`${action}订单失败: ` + (error.message || '未知错误'));
    } finally {
      dialogLoading.value = false;
      // 无论成功还是失败都刷新数据，但只有在订单保存成功时才刷新
      if (orderSaved) {
        await fetchData(); // 等待数据刷新完成
      }
    }
  } catch (error) {
    console.error('提交过程中发生错误:', error);
    ElMessage.error('提交过程中发生错误: ' + (error.message || '未知错误'));
  }
}

// 选择客户时自动填充客户信息
const handleCustomerChange = (customerId) => {
  if (!Array.isArray(customers.value)) {
    console.error('customers.value不是数组:', customers.value)
    ElMessage.error('客户数据格式错误')
    return
  }
  
  const selectedCustomer = customers.value.find(c => c.id === customerId)
  
  if (selectedCustomer) {
    form.customer_name = selectedCustomer.name
    form.contact = selectedCustomer.contact_person || selectedCustomer.contact || ''
    form.phone = selectedCustomer.contact_phone || selectedCustomer.phone || ''
    form.address = selectedCustomer.address || ''
  }
}

// 处理客户选择Enter键事件
const handleCustomerEnterKey = () => {
  // 如果有过滤的客户列表且不为空，自动选择第一个
  if (filteredCustomers.value && filteredCustomers.value.length > 0) {
    const firstCustomer = filteredCustomers.value[0]
    form.customer_id = firstCustomer.id
    handleCustomerChange(firstCustomer.id)
    ElMessage.success(`已自动选择客户: ${firstCustomer.code} - ${firstCustomer.name}`)
    
    // 自动跳转到合同编码输入框
    nextTick(() => {
      if (contractCodeInput.value) {
        contractCodeInput.value.focus()
      }
    })
  } else if (customers.value && customers.value.length > 0) {
    // 如果没有过滤结果但有客户数据，选择第一个客户
    const firstCustomer = customers.value[0]
    form.customer_id = firstCustomer.id
    handleCustomerChange(firstCustomer.id)
    ElMessage.success(`已自动选择客户: ${firstCustomer.code} - ${firstCustomer.name}`)
    
    // 自动跳转到合同编码输入框
    nextTick(() => {
      if (contractCodeInput.value) {
        contractCodeInput.value.focus()
      }
    })
  } else {
    ElMessage.warning('没有可选择的客户，请先加载客户数据')
  }
}

// 处理物料选择变化

// 物料操作
const addMaterial = () => {
  form.items.push({
    id: '',
    material_id: '', // 添加material_id字段
    material_name: '', // 添加material_name字段
    material_code: '', // 添加material_code字段
    name: '',
    code: '',
    specification: '',
    quantity: '', // 改为空字符串，不显示默认值
    unit_name: '',
    unit_id: '',
    unit_price: '', // 改为空字符串，不显示默认值
    amount: 0, // 确保是数字类型
    tax_rate: defaultVATRate.value,  // 默认税率
    tax_amount: 0,                    // 默认税额
    remark: '' // 添加备注字段
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
      price: item.price || 0  // 销售价格
    }));

    // 保存到全局变量供Enter键使用
    filteredProducts.value = suggestions;

    callback(suggestions);
  } catch (error) {
    ElMessage.error('搜索物料失败');
    callback([]);
  }
};

// 处理自动完成选择
const handleMaterialSelect = (item, index) => {
  // 确保 material_id 是数字类型
  const materialId = Number(item.id);
  if (!materialId || isNaN(materialId)) {
    console.error('物料ID无效:', item.id);
    ElMessage.error('物料ID无效，请重新选择');
    return;
  }
  
  form.items[index].material_id = materialId;
  form.items[index].code = item.code;
  form.items[index].material_code = item.code;
  form.items[index].name = item.name;
  form.items[index].material_name = item.name;
  form.items[index].specification = item.specs;
  form.items[index].unit_name = item.unit_name;
  form.items[index].unit_id = item.unit_id;
  
  // 销售订单使用销售价格作为默认单价
  const defaultPrice = parseFloat(item.price) || 0;
  if (defaultPrice > 0) {
    form.items[index].unit_price = defaultPrice;
    // 重新计算金额
    const quantity = parseFloat(form.items[index].quantity) || 0;
    form.items[index].amount = quantity * defaultPrice;
    calculateTotalAmount();
  }
  
  // 选择物料后，自动聚焦到数量输入框
  nextTick(() => {
    const quantityInput = quantityInputRefs.value[index];
    if (quantityInput) {
      quantityInput.focus();
    }
  });
};

// 处理清除物料
const handleMaterialClear = (index) => {
  form.items[index].material_id = '';
  form.items[index].code = '';
  form.items[index].material_code = '';
  form.items[index].name = '';
  form.items[index].material_name = '';
  form.items[index].specification = '';
  form.items[index].unit_name = '';
  form.items[index].unit_id = '';
  form.items[index].unit_price = '';
};

// 处理物料编码Enter键
const handleMaterialEnter = async (index) => {
  const inputCode = form.items[index].code?.trim();
  
  if (!inputCode) {
    ElMessage.warning('请输入物料编码');
    return;
  }
  
  // 首先在当前搜索结果中查找精确匹配（编码或规格）
  let exactMatch = filteredProducts.value.find(m => {
    const codeMatch = m.code === inputCode || m.code.toLowerCase() === inputCode.toLowerCase();
    const specsMatch = m.specs === inputCode || m.specs?.toLowerCase() === inputCode.toLowerCase();
    return codeMatch || specsMatch;
  });
  
  if (exactMatch) {
    handleMaterialSelect(exactMatch, index);
    return;
  }
  
  // 如果搜索结果中没有，尝试通过API精确查找
  try {
    const res = await baseDataApi.getMaterials({
      keyword: inputCode,  // 使用keyword参数进行全字段搜索
      page: 1,
      pageSize: 20  // 增加返回数量，提高找到精确匹配的概率
    });
    
    // 使用统一解析器
    const materials = parseListData(res, { enableLog: false });

    // 在API返回结果中查找精确匹配（编码或规格）
    exactMatch = materials.find(m => {
      const codeMatch = (m.code || '').toLowerCase() === inputCode.toLowerCase();
      const specsMatch = (m.specs || m.specification || '').toLowerCase() === inputCode.toLowerCase();
      return codeMatch || specsMatch;
    });
    
    if (exactMatch) {
      const materialItem = {
        id: exactMatch.id,
        code: exactMatch.code || exactMatch.material_code || '',
        name: exactMatch.name || exactMatch.material_name || '',
        specs: exactMatch.specs || exactMatch.specification || '',
        stock_quantity: exactMatch.stock_quantity || exactMatch.inventory || 0,
        unit_name: exactMatch.unit_name || exactMatch.unit || '',
        unit_id: exactMatch.unit_id
      };
      handleMaterialSelect(materialItem, index);
      return;
    }
    
    // 如果还是找不到精确匹配，但有搜索结果，自动选择第一个
    if (filteredProducts.value.length > 0) {
      const firstMaterial = filteredProducts.value[0];
      const displayInfo = firstMaterial.specs ? `${firstMaterial.code} (${firstMaterial.specs})` : firstMaterial.code;
      ElMessage.info(`未找到精确匹配 "${inputCode}"，已自动选择: ${displayInfo}`);
      handleMaterialSelect(firstMaterial, index);
      return;
    }
    
    // 如果连搜索结果都没有，提示用户
    ElMessage.warning(`未找到包含 "${inputCode}" 的物料`);
  } catch (error) {
    // 即使API查找失败，如果有本地搜索结果，也尝试使用
    if (filteredProducts.value.length > 0) {
      const firstMaterial = filteredProducts.value[0];
      const displayInfo = firstMaterial.specs ? `${firstMaterial.code} (${firstMaterial.specs})` : firstMaterial.code;
      ElMessage.info(`已自动选择: ${displayInfo}`);
      handleMaterialSelect(firstMaterial, index);
    } else {
      ElMessage.error('查找物料失败，请重试');
    }
  }
};

// 处理数量Enter键
const handleQuantityEnter = (index) => {
  // 添加新的物料行
  addMaterial();
  
  // 聚焦到新行的物料选择框
  nextTick(() => {
    const newIndex = form.items.length - 1;
    const materialSelect = materialSelectRefs.value[newIndex];
    if (materialSelect) {
      materialSelect.focus();
    }
  });
};

const removeMaterial = (index) => {
  form.items.splice(index, 1)
}

// 状态判断函数
const canConfirm = (row) => ['draft', 'pending'].includes(row.status)
const canShip = (row) => ['ready_to_ship', 'partial_shipped'].includes(row.status) && !row.has_draft_outbound
const canCancel = (row) => ['draft', 'pending', 'confirmed', 'in_production', 'ready_to_ship'].includes(row.status)
const canLock = (row) => {
  const allowedStatuses = ['in_production', 'in_procurement']
  return !row.is_locked && allowedStatuses.includes(row.status)
}
const canUnlock = (row) => {
  return !!row.is_locked
}

// 订单操作
const handleAdd = async () => {
  dialogType.value = 'add'
  // 重置表单
  Object.keys(form).forEach(key => {
    if (key === 'items') {
      form[key] = [{
        id: '',
        name: '',
        code: '',
        material_name: '', // 添加物料名称字段
        material_code: '', // 添加物料编码字段
        material_id: '', // 添加物料ID字段
        specification: '',
        quantity: '', // 改为空字符串，不显示默认值
        unit_name: '',
        unit_id: '',
        unit_price: '', // 改为空字符串，不显示默认值
        amount: 0, // 确保是数字类型
        remark: '' // 添加备注字段
      }];
    } else if (key === 'deliveryDate') {
      // 自动设置交付日期为3周后
      const today = new Date();
      const deliveryDate = new Date(today);
      deliveryDate.setDate(today.getDate() + 21); // 3周 = 21天
      form[key] = deliveryDate.toISOString().split('T')[0]; // 格式化为 YYYY-MM-DD
    } else if (key === 'taxRate') {
      form[key] = defaultVATRate.value; // 使用默认税率
    } else if (key === 'subtotal' || key === 'tax_amount' || key === 'total_amount') {
      form[key] = 0; // 金额默认为0
    } else {
      form[key] = ''
    }
  })

  // 确保 products 数据为数组，并重置过滤列表
  const productsArray = Array.isArray(products.value) ? products.value : [];
  filteredProducts.value = [...productsArray];

  // 确保客户数据已加载
  if (customers.value.length === 0) {
    await fetchCustomers();
  } else {
    // 如果客户数据已存在，确保过滤列表已初始化
    filteredCustomers.value = [...customers.value];
  }

  // 优化：只在真正需要时才加载物料数据
  if (products.value.length === 0) {
    // 只加载物料数据，不重置客户数据
    try {
      materialsLoading.value = true;
      const materialsRes = await baseDataApi.getMaterials({
        limit: 100,  // 大幅减少初始加载量，提升性能
        pageSize: 100,
        page: 1
      });

      const resData = materialsRes.data;
      const materialsData = Array.isArray(resData) ? resData
        : Array.isArray(resData?.list) ? resData.list
        : Array.isArray(resData?.data) ? resData.data
        : [];
      products.value = materialsData.map(material => ({
        id: material.id,
        code: material.code || '',
        value: material.code || '',
        name: material.name || '',
        material_name: material.name || '',
        specs: material.specs || material.specification || '',
        drawing_no: material.drawing_no || '',
        stock_quantity: material.stock_quantity || material.quantity || 0,
        label: `${material.code || ''} - ${material.name || ''} ${material.specs ? `(${material.specs})` : ''} [库存:${material.stock_quantity || material.quantity || 0}]`,
        specification: material.specification || material.specs || '',
        unit_id: material.unit_id,
        unit_name: material.unit_name || '个',
        price: material.price || 0
      })).filter(item => item.id);

      filteredProducts.value = [...products.value];
    } catch (error) {
      console.error('加载物料数据失败:', error);
    } finally {
      materialsLoading.value = false;
    }
  }

  dialogVisible.value = true
}

const handleEdit = async (row) => {
  dialogType.value = 'edit'
  
  // 先清空表单，避免数据混淆
  Object.keys(form).forEach(key => {
    if (key === 'items') {
      form[key] = []
    } else {
      form[key] = ''
    }
  })
  
  dialogVisible.value = true
  dialogLoading.value = true
  
  // 获取完整的订单详情（确保包含所有物料信息）
  try {
    const response = await salesApi.getOrder(row.id);
    const orderDetail = response.data;
    
    // 将订单数据复制到表单中
    Object.assign(form, {
      id: orderDetail.id,
      customer_id: orderDetail.customer_id || row.customer_id || '',
      customer_name: orderDetail.customer_name || row.customer_name || row.customer || '',
      deliveryDate: orderDetail.deliveryDate || orderDetail.delivery_date || row.deliveryDate || row.delivery_date || '',
      address: orderDetail.address || orderDetail.delivery_address || row.address || '',
      contact: orderDetail.contact || orderDetail.contact_person || row.contact || '',
      phone: orderDetail.phone || orderDetail.contact_phone || row.phone || '',
      contract_code: orderDetail.contract_code || row.contract_code || '',
      status: orderDetail.status || row.status || 'pending', // 保存原有状态
      remark: orderDetail.remark || orderDetail.remarks || orderDetail.notes || row.remark || '',
      items: [] // 先设置为空数组，后面处理
    });
    
    // 处理物料项
    const orderItems = orderDetail.items || row.items || [];
    if (Array.isArray(orderItems) && orderItems.length > 0) {
      // 深拷贝物料项数组
      form.items = orderItems.map(item => {
        // 确保数量和单价是数字类型
        let quantity, unitPrice, amount;
        
        // 处理数量
        if (typeof item.quantity === 'string') {
          quantity = parseFloat(item.quantity.replace(/,/g, '') || 0);
        } else {
          quantity = Number(item.quantity || 0);
        }
        
        // 处理单价
        if (typeof item.unit_price === 'string') {
          unitPrice = parseFloat(item.unit_price.replace(/,/g, '') || 0);
        } else {
          unitPrice = Number(item.unit_price || 0);
        }
        
        // 处理金额
        if (typeof item.amount === 'string') {
          amount = parseFloat(item.amount.replace(/,/g, '') || 0);
        } else {
          amount = Number(item.amount || 0);
        }
        
        // 如果金额无效，则根据数量和单价计算
        if (isNaN(amount) || amount === 0) {
          amount = quantity * unitPrice;
        }
        
        // 确保 material_id 存在
        let materialId = item.material_id;
        
        // 确保每个物料项包含正确的字段
        return {
          ...item,
          code: item.material_code || item.code || '',
          material_code: item.material_code || item.code || '',
          material_name: item.material_name || item.name || '',
          material_id: materialId || '', // 如果没有 material_id，设为空字符串，用户可以重新选择
          specification: item.specification || item.specs || '',
          quantity: quantity,
          unit_price: unitPrice,
          unit_name: item.unit_name || '个',
          unit_id: item.unit_id || '',
          amount: amount,
          tax_rate: item.tax_rate !== undefined ? item.tax_rate : (item.tax_percent !== undefined ? item.tax_percent : defaultVATRate.value),  // 支持tax_rate或tax_percent字段
          tax_amount: item.tax_amount || (amount * (item.tax_rate || item.tax_percent || 0)),  // 计算税额
          remark: item.remark || item.remarks || ''
        };
      });
      
      // 对于缺少 material_id 的物料项，尝试通过物料编码查找
      const itemsNeedingMaterialId = form.items.filter(item => !item.material_id && item.code);
      if (itemsNeedingMaterialId.length > 0) {
        // 异步查找物料ID（不阻塞对话框打开）
        setTimeout(async () => {
          for (let i = 0; i < form.items.length; i++) {
            const item = form.items[i];
            if (!item.material_id && item.code) {
              try {
                const res = await baseDataApi.getMaterials({
                  keyword: item.code,
                  page: 1,
                  pageSize: 10
                });
                
                // 使用统一解析器
                const materials = parseListData(res, { enableLog: false });

                // 查找精确匹配的物料
                const exactMatch = materials.find(m => 
                  (m.code || '').toLowerCase() === item.code.toLowerCase() ||
                  (m.specs || m.specification || '').toLowerCase() === item.code.toLowerCase()
                );
                
                if (exactMatch) {
                  form.items[i].material_id = exactMatch.id;
                  form.items[i].material_code = exactMatch.code || item.code;
                  form.items[i].material_name = exactMatch.name || item.material_name;
                  form.items[i].specification = exactMatch.specs || exactMatch.specification || item.specification;
                  form.items[i].unit_id = exactMatch.unit_id || item.unit_id;
                  form.items[i].unit_name = exactMatch.unit_name || item.unit_name;
                }
              } catch (error) {
                console.error(`查找物料 ${item.code} 失败:`, error);
              }
            }
          }
        }, 500);
      }
    }
  } catch (error) {
    console.error('获取订单详情失败:', error);
    ElMessage.error('获取订单详情失败，请重试');
    dialogLoading.value = false;
    return;
  } finally {
    dialogLoading.value = false;
  }
  
  // 计算总金额
  calculateTotalAmount()
  
  // 重置过滤后的产品列表，确保显示所有物料
  filteredProducts.value = [...products.value]

  // 如果没有客户ID，尝试通过客户名查找对应的客户ID
  if (!form.customer_id && form.customer_name && Array.isArray(customers.value)) {
    const matchedCustomer = customers.value.find(c => 
      c.name === form.customer_name || 
      c.name === form.customer
    )
    
    if (matchedCustomer) {
      form.customer_id = matchedCustomer.id
    }
  }
}

const handleConfirm = async (row) => {
  try {
    // 先获取完整的订单详情，确保有物料信息
    const orderResponse = await salesApi.getOrder(row.id);
    const orderDetail = orderResponse.data;
    const orderItems = orderDetail.items || [];

    if (orderItems.length === 0) {
      ElMessage.warning('订单没有物料明细，无法确认');
      return;
    }

    // 确认订单前先检查库存
    const insufficientItems = await checkInventory(orderItems);

    // 如果有库存不足的物料，显示提示信息
    if (insufficientItems.length > 0) {
      // 显示库存不足的提示信息
      // 后端返回字段：materialName, materialCode, quantity, currentStock, shortfall
      const itemMessages = insufficientItems.map(item =>
        `${item.materialName || item.material_name || '未知物料'}: 需要${item.quantity}，库存${item.currentStock || 0}`
      );

      await ElMessageBox.confirm(
        `以下物料库存不足:\n${itemMessages.join('\n')}\n\n系统将自动生成生产计划和采购申请，是否继续确认订单?`,
        '库存不足警告',
        {
          confirmButtonText: '继续确认',
          cancelButtonText: '取消',
          type: 'warning',
        }
      );
    }

    // 调用API更新订单状态
    // 始终发送 'confirmed' 状态，让后端根据物料来源和库存情况自动决定最终状态
    // 后端会自动判断：
    // - 库存充足 → ready_to_ship（可发货）
    // - 有自产物料缺料 → in_production（生产中）
    // - 有外购物料缺料 → in_procurement（采购中）
    await salesApi.updateOrderStatus(row.id, { newStatus: 'confirmed' });

    ElMessage.success('订单已确认');
    await fetchData(); // 刷新列表
  } catch (error) {
    // 用户取消操作时不显示错误
    if (error === 'cancel' || error.toString().includes('cancel')) {
      return;
    }
    
    console.error('确认订单时出错:', error);

    // 提取后端返回的详细错误信息
    let errorMessage = '确认订单失败';

    if (error.response?.data) {
      // 后端返回的错误信息
      const errorData = error.response.data;

      if (errorData.message) {
        // 使用后端返回的中文错误信息
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = errorData.error;
      }
    } else if (error.message) {
      errorMessage = `确认订单失败: ${error.message}`;
    }

    // 如果错误信息包含换行符，使用 MessageBox 显示，否则使用 Message
    if (errorMessage.includes('\n')) {
      ElMessageBox.alert(errorMessage, '确认订单失败', {
        confirmButtonText: '知道了',
        type: 'error',
        dangerouslyUseHTMLString: false
      });
    } else {
      ElMessage.error(errorMessage);
    }
  }
}

const handleCancel = (row) => {
  let message = '确定要取消该订单吗？';
  
  if (row.status === 'in_production') {
    message = '该订单正在生产中，确定要取消吗？';
  } else if (row.status === 'confirmed') {
    message = '该订单已确认，确定要取消吗？';
  }
  
  ElMessageBox.confirm(
    message,
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      // 调用API更新订单状态为已取消
      await salesApi.updateOrderStatus(row.id, { newStatus: 'cancelled' });

      ElMessage.success('订单已取消');
      await fetchData(); // 刷新列表
    } catch (error) {
      console.error('取消订单时出错:', error);
      ElMessage.error('取消订单失败: ' + (error.message || '未知错误'));
    }
  }).catch(() => {
    // 用户取消操作
  });
}

// 发货 - 直接创建出库单
const handleShip = async (row) => {
  try {
    // 确认发货
    await ElMessageBox.confirm(
      `确定要为订单 ${row.order_no} 创建出库单吗？将按订单数量全额发货。`,
      '确认发货',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    );

    // 获取订单详情（包含物料明细）
    const orderDetail = await salesApi.getOrder(row.id);
    const orderData = orderDetail.data || orderDetail;
    const items = orderData.items || [];

    if (items.length === 0) {
      ElMessage.warning('订单没有物料明细，无法发货');
      return;
    }

    // 构建出库单数据
    const outboundData = {
      order_id: row.id,
      delivery_date: new Date().toISOString().split('T')[0],
      status: 'draft',
      remarks: `从销售订单 ${row.order_no} 创建`,
      items: items.map(item => ({
        product_id: item.material_id,
        quantity: item.quantity
      }))
    };

    // 创建出库单
    await salesApi.createOutbound(outboundData);
    
    ElMessage.success('出库单创建成功');
    fetchData(); // 刷新列表
  } catch (error) {
    if (error === 'cancel') return;
    
    console.error('创建出库单失败:', error);
    
    // 适配后端的错误返回格式
    let errorMsg = '网络错误或服务器异常';
    if (error.response?.data) {
       errorMsg = error.response.data.error || 
                  error.response.data.message || 
                  error.response.data.msg || 
                  errorMsg;
    } else if (error.message) {
       errorMsg = error.message;
    }
    
    // 根据状态码区分提示等级
    if (error.response?.status === 409) {
      ElMessageBox.alert(errorMsg, '发货限制', {
        confirmButtonText: '我知道了',
        type: 'warning'
      });
    } else {
      ElMessage.error('创建出库单失败: ' + errorMsg);
    }
  }
}

// 导入导出
const handleImport = () => {
  importDialogVisible.value = true;
  importMethod.value = 'template';
  importJsonData.value = '';
  importResult.value = null;
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
};

// 关闭导入对话框
const closeImportDialog = () => {
  importDialogVisible.value = false;
  importResult.value = null;
  importFile = null;
  if (uploadRef.value) {
    uploadRef.value.clearFiles();
  }
};

// 下载模板
const downloadTemplate = async () => {
  try {
    const response = await salesApi.downloadOrderTemplate();

    let blob;
    if (response instanceof Blob) {
      blob = response;
    } else if (response?.data instanceof Blob) {
      blob = response.data;
    } else {
      blob = new Blob([response?.data || response], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '销售订单导入模板.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    ElMessage.success('模板下载成功');
  } catch (error) {
    ElMessage.error('下载模板失败: ' + (error.response?.data?.message || error.message));
  }
};

// 处理文件选择
const handleFileChange = (file) => {
  importFile = file.raw;

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    ElMessage.error('文件大小不能超过10MB');
    uploadRef.value.clearFiles();
    importFile = null;
    return;
  }

  const allowedTypes = ['.xlsx', '.xls'];
  const fileName = file.name.toLowerCase();
  const isValidType = allowedTypes.some(type => fileName.endsWith(type));

  if (!isValidType) {
    ElMessage.error('只支持Excel文件格式(.xlsx, .xls)');
    uploadRef.value.clearFiles();
    importFile = null;
    return;
  }

  ElMessage.success('文件选择成功');
};

// 提交导入
const submitImport = async () => {
  if (importMethod.value === 'template') {
    if (!importFile) {
      ElMessage.error('请先选择要导入的文件');
      return;
    }
  } else {
    ElMessage.error('暂不支持JSON格式直导');
    return;
  }

  importing.value = true;
  importResult.value = null;

  try {
    const formData = new FormData();
    formData.append('file', importFile);
    const response = await salesApi.importOrders(formData);

    importResult.value = response.data;

    if (response.data?.success > 0) {
      ElMessage.success(`成功导入 ${response.data.success} 条订单数据`);
      fetchData(); 
    }

    if (response.data?.failed > 0) {
      ElMessage.warning(`${response.data.failed} 条订单数据导入失败，请查看详情`);
    }

  } catch (error) {
    console.error('导入订单失败:', error);
    ElMessage.error('导入订单失败: ' + (error.response?.data?.message || error.message || '未知错误'));
  } finally {
    importing.value = false;
  }
};

const handleExport = async () => {
  try {
    // 构建导出参数，使用当前的搜索条件
    const exportParams = {
      search: searchQuery.value?.trim() || '',
      status: statusFilter.value || '',
      operator: operatorFilter.value || '',
      startDate: dateRange.value && dateRange.value.length > 0 ? dayjs(dateRange.value[0]).format('YYYY-MM-DD') : '',
      endDate: dateRange.value && dateRange.value.length > 1 ? dayjs(dateRange.value[1]).format('YYYY-MM-DD') : ''
    };
    
    const response = await salesApi.exportOrders(exportParams);
    
    // 创建下载链接
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `销售订单_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.xlsx`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    ElMessage.success('导出成功');
  } catch (error) {
    console.error('导出失败:', error);
    ElMessage.error('导出失败: ' + (error.message || '未知错误'));
  }
}

// 表格排序事件处理函数

// 过滤物料方法 - 支持远程搜索，添加防抖

// 移除多余的监听器以提升性能
// watch(() => products.value.length, ...) 已在上方合并

// 从订单号提取日期时间
const getOrderDateFromOrderNo = (orderNo) => {
  if (!orderNo || orderNo.length < 8) {
    return '2024-04-01'; // 默认日期，只显示年月日
  }
  
  try {
    // 提取订单号中的日期部分 DD250408001 -> 250408
    const dateStr = orderNo.substring(2, 8);
    
    // 解析年月日
    const year = parseInt('20' + dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));
    
    // 直接返回YYYY-MM-DD格式
    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  } catch (e) {
    return '2024-05-01'; // 发生错误时的默认值，只显示年月日
  }
};

// 处理每页显示数量变化 - 现在使用Hook提供的方法
// const handleSizeChange = (val) => {
//   pageSize.value = val
//   fetchData()
// }

// 处理当前页码变化 - 现在使用Hook提供的方法
// const handleCurrentChange = (val) => {
//   currentPage.value = val
//   fetchData()
// }

// 锁定订单
const handleLock = async (row) => {
  try {
    await ElMessageBox.prompt('请输入锁定原因（可选）', '锁定订单', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '锁定原因',
      inputValidator: () => true // 允许空值
    }).then(async ({ value }) => {
      const response = await salesApi.lockOrder(row.id, { lock_reason: value || '手动锁定' })

      // 检查是否是部分锁定
      if (response.data.partialSuccess) {
        const reservationDetails = response.data.reservations.map(item =>
          `${item.materialName}: 已预留${item.reservedQuantity}/${item.requiredQuantity}个`
        ).join('\n')

        const insufficientDetails = response.data.insufficientItems.map(item =>
          `${item.materialName}: 缺少${item.shortage}个`
        ).join('\n')

        ElMessageBox.alert(
          `订单已部分锁定：\n\n已预留库存：\n${reservationDetails}\n\n库存不足：\n${insufficientDetails}`,
          '部分锁定成功',
          {
            confirmButtonText: '确定',
            type: 'warning'
          }
        )
      } else {
        ElMessage.success('订单锁定成功')
      }

      // 立即更新本地数据，避免重新请求
      const orderIndex = tableData.value.findIndex(order => order.id === row.id)
      if (orderIndex !== -1) {
        tableData.value[orderIndex].is_locked = true
        tableData.value[orderIndex].locked_at = new Date().toISOString()
        tableData.value[orderIndex].locked_by = 1 // 当前用户ID
      }
    })
  } catch (error) {
    if (error !== 'cancel') {
      console.error('锁定订单失败:', error)
      const errorData = error.response?.data
      console.warn('🔍 [DEBUG] 锁定失败 - error.response.status:', error.response?.status, 'errorData:', JSON.stringify(errorData))
      let errorMessage = '锁定订单失败: ' + (errorData?.message || error.message || '未知错误')

      // 如果有库存不足的详细信息，显示给用户
      if (errorData?.insufficientItems && errorData.insufficientItems.length > 0) {
        const insufficientDetails = errorData.insufficientItems.map(item =>
          `${item.materialName}(${item.materialCode}): 需要${item.required}个，可用${item.available}个，缺少${item.shortage}个`
        ).join('\n')

        ElMessageBox.alert(
          `库存不足，无法锁定订单：\n\n${insufficientDetails}`,
          '库存不足',
          {
            confirmButtonText: '确定',
            type: 'warning'
          }
        )
      } else {
        ElMessage.error(errorMessage)
      }
    }
  }
}

// 解锁订单
const handleUnlock = async (row) => {
  try {
    await ElMessageBox.confirm('确定要解锁此订单吗？解锁后将释放预留的库存。', '解锁订单', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await salesApi.unlockOrder(row.id)
    ElMessage.success('订单解锁成功')

    // 立即更新本地数据，避免重新请求
    const orderIndex = tableData.value.findIndex(order => order.id === row.id)
    if (orderIndex !== -1) {
      tableData.value[orderIndex].is_locked = false
      tableData.value[orderIndex].locked_at = null
      tableData.value[orderIndex].locked_by = null
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('解锁订单失败:', error)
      ElMessage.error('解锁订单失败: ' + (error.response?.data?.message || error.message || '未知错误'))
    }
  }
}

// 查看订单详情
const handleView = async (row) => {
  detailsVisible.value = true
  detailsLoading.value = true
  try {
    // 获取最新的订单详情
    const response = await salesApi.getOrder(row.id)
    const orderData = response.data
    
    // 合并原始行数据中的客户信息，防止API返回的数据缺少这些字段
    orderData.customer = orderData.customer || row.customer
    orderData.customer_name = orderData.customer_name || row.customer_name || row.customer
    orderData.deliveryDate = orderData.deliveryDate || row.deliveryDate || orderData.delivery_date
    orderData.address = orderData.address || row.address || orderData.delivery_address
    orderData.contact = orderData.contact || row.contact || orderData.contact_person
    orderData.phone = orderData.phone || row.phone || orderData.contact_phone
    
    // 确保物料项的数值字段都是数字类型，并处理编码和名称
    if (orderData.items && Array.isArray(orderData.items)) {
      orderData.items = orderData.items.map(item => ({
        ...item,
        quantity: parseFloat(item.quantity) || 0,
        unit_price: parseFloat(item.unit_price) || 0,
        amount: parseFloat(item.amount) || 0,
        // 确保物料编码和名称正确显示
        material_code: item.material_code || item.code || '',
        material_name: item.material_name || item.name || ''
      }))
    }
    
    currentOrder.value = orderData
  } catch (error) {
    console.error('获取订单详情失败:', error)
    ElMessage.error('获取订单详情失败: ' + (error.message || '未知错误'))
  } finally {
    detailsLoading.value = false
  }
}

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
  border-right: 1px solid #ebeef5;
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
  background-color: #f5f7fa;
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