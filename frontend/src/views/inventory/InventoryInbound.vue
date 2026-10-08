<!--
/**
 * InventoryInbound.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inventory-inbound-container">
    <PageHeader title="入库管理" subtitle="管理入库单据与记录">
      <template #actions>
<el-button v-if="canCreate" type="primary" :icon="Plus" @click="handleCreate">新建入库单</el-button>
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
          <el-input v-model="searchForm.materialName" placeholder="物料名称" clearable @keyup.enter="handleSearch" />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="入库单号">
          <el-input v-model="searchForm.inboundNo" placeholder="入库单号" clearable />
        </el-form-item>
        <el-form-item label="仓库">
          <el-select v-model="searchForm.locationId" placeholder="仓库" clearable>
            <el-option
              v-for="item in locations"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="状态" clearable>
            <el-option v-for="status in inboundStatuses" :key="status" :label="getStatusText(status)" :value="status" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.total || 0 }}</div>
        <div class="stat-label">入库单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.draftCount || 0 }}</div>
        <div class="stat-label">草稿状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.confirmedCount || 0 }}</div>
        <div class="stat-label">已确认</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ inboundStats.cancelledCount || 0 }}</div>
        <div class="stat-label">已取消</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table
        :data="tableData"
        class="table-row-click w-full"
        v-loading="loading"
        border
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row.id))">
        <template #empty>
          <EmptyState description="暂无入库单数据" />
        </template>
        <el-table-column prop="inboundNo" label="入库单号" width="135" />
        <el-table-column prop="inboundType" label="入库类型" width="110">
          <template #default="{ row }">
            <el-tag :type="getInboundTypeTagType(row.inboundType)" size="small">
              {{ getInboundTypeText(row.inboundType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="materialCode" label="物料编码" width="120">
          <template #default="{ row }">
            <span v-if="row.materialCode">{{ row.materialCode }}</span>
            <span v-else-if="row.itemsCount > 1" class="text-muted">多个物料</span>
            <span v-else class="text-disabled">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="materialName" label="物料名称" width="157" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.materialName">{{ row.materialName }}</span>
            <span v-else-if="row.itemsCount > 1" class="text-muted">多个物料</span>
            <span v-else class="text-disabled">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="materialSpecs" label="型号规格" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.materialSpecs || row.specification">{{ row.materialSpecs || row.specification }}</span>
            <span v-else class="text-disabled">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="firstItemQuantity" label="数量" width="80">
          <template #default="{ row }">
            <span v-if="row.firstItemQuantity">{{ row.firstItemQuantity }}</span>
            <span v-else-if="row.totalQuantity" class="text-primary" :title="`总数量：${row.totalQuantity}`">{{ row.totalQuantity }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="inboundDate" label="入库日期" width="100" />
        <el-table-column prop="locationName" label="仓库" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="80">
          <template #default="scope">
            {{ scope.row.operatorName || scope.row.operator || '未知' }}
          </template>
        </el-table-column>
        <el-table-column prop="remarks" label="备注" width="180" show-overflow-tooltip />
        <el-table-column label="操作" min-width="320" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
          <template #default="{ row }">
            <TableRowActions>
              <el-button v-if="canEditInbound(row)" size="small" type="primary" :icon="Edit" @click="handleEdit(row)">编辑</el-button>
              <el-popconfirm
                v-if="row.status === 'draft'"
                title="确定要确认该入库单吗？"
                @confirm="handleUpdateStatus(row.id, 'confirmed')"
              >
                <template #reference>
                  <el-button
                    size="small"
                    type="success"
                    v-permission="'inventory:inbound:update'"
                  >
                    <el-icon><Check /></el-icon> 确认
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="row.status === 'confirmed'"
                title="确定要完成该入库单吗？"
                @confirm="handleUpdateStatus(row.id, 'completed')"
              >
                <template #reference>
                  <el-button
                    size="small"
                    type="primary"
                    v-permission="'inventory:inbound:update'"
                  >
                    <el-icon><Finished /></el-icon> 完成
                  </el-button>
                </template>
              </el-popconfirm>
              <el-popconfirm
                v-if="['draft', 'confirmed'].includes(row.status)"
                title="确定要取消该入库单吗？"
                @confirm="handleUpdateStatus(row.id, 'cancelled')"
                confirm-button-type="danger"
              >
                <template #reference>
                  <el-button
                    size="small"
                    type="danger"
                    v-permission="'inventory:inbound:update'"
                  >
                    <el-icon><Close /></el-icon> 取消
                  </el-button>
                </template>
              </el-popconfirm>
            </TableRowActions>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          :current-page="pagination.currentPage"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :page-size="pagination.pageSize"
          :background="true"
          layout="total, sizes, prev, pager, next, jumper"
          :total="pagination.total"
        >
        </el-pagination>
      </div>
    </el-card>
    <!-- 新建/编辑入库单对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="getDialogTitle"
      mode="form"
      wide
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="入库类型" prop="inboundType">
              <el-select
                v-model="form.inboundType"
                :disabled="Boolean(form.inspectionId)"
                placeholder="请选择入库类型"
                class="w-full"
                @change="handleInboundTypeChange"
              >
                <el-option
                  v-for="item in inboundTypeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="入库日期" prop="inboundDate">
              <el-date-picker
                v-model="form.inboundDate"
                type="date"
                placeholder="选择日期"
                value-format="YYYY-MM-DD"
                class="w-full"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="仓库" prop="locationId">
              <el-select
                v-model="form.locationId"
                :disabled="form.inboundType === 'production_return' && form.items.length > 0"
                placeholder="请选择仓库"
                class="w-full"
                @change="handleLocationChange"
              >
                <el-option
                  v-for="item in locations"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <!-- 生产入库和退料均从关联任务选择明细 -->
        <el-row :gutter="20" v-if="requiresProductionTask">
          <el-col :span="16">
            <el-form-item label="关联任务" prop="referenceId">
              <el-input
                v-model="form.referenceNo"
                :disabled="Boolean(form.inspectionId)"
                placeholder="点击选择生产任务"
                readonly
                @click="openTaskSelectDialog"
              >
                <template #append>
                  <el-button :disabled="Boolean(form.inspectionId)" @click="openTaskSelectDialog">选择任务</el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="任务产品" v-if="selectedTask">
              <span>{{ selectedTask.productName }}</span>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="操作人" prop="operator">
              <el-input v-model="form.operator" placeholder="系统自动填充当前用户姓名" readonly />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input
                v-model="form.remarks"
                type="textarea"
                :rows="1"
                placeholder="请输入备注"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider>{{ form.inboundType === 'production_return' ? '退料明细' : '入库明细' }}</el-divider>
        <el-alert title="完成入库前请补齐每条明细的批次号；生产退料沿用原领料批次和仓库。" type="info" :closable="false" class="mb-10" />
        <el-table
          :data="form.items"
          border
          class="w-full"
          :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }"
          empty-text="请添加入库物料"
        >
          <el-table-column label="物料编码" width="160">
            <template #default="{ row, $index }">
              <span v-if="requiresProductionTask">{{ row.materialCode }}</span>
              <el-autocomplete
                v-else
                :ref="(el) => setMaterialSelectRef(el, $index)"
                v-model="row.materialCode"
                placeholder="输入编码/名称/规格"
                clearable
                :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, $index)"
                @select="(item) => handleMaterialSelect(item, $index)"
                @keydown.enter.prevent="handleMaterialEnter($index)"
                @clear="handleMaterialClear($index)"
                class="w-full"
                :trigger-on-focus="true"
                :debounce="300"
                :hide-loading="false"
                :popper-append-to-body="false"
                value-key="code"
              >
                <template #default="{ item }">
                  <div class="option-row">
                    <span class="option-row__code">
                      {{ item.code }}
                    </span>
                    <span class="option-row__name">
                      {{ item.name }}
                    </span>
                    <span class="option-row__meta">
                      {{ item.specs }}
                    </span>
                    <span class="option-row__stock">
                      库存: {{ item.stockQuantity || 0 }}
                    </span>
                  </div>
                </template>
              </el-autocomplete>
            </template>
          </el-table-column>
          <el-table-column label="物料名称" prop="materialName" width="140" show-overflow-tooltip />
          <el-table-column label="规格" prop="specification" width="140" show-overflow-tooltip />
          <el-table-column label="数量" width="120">
            <template #default="{ row, $index }">
              <el-input
                :ref="(el) => setQuantityInputRef(el, $index)"
                v-model="row.quantity"
                @input="(val) => { row.quantity = Number(val) || 0; }"
                @keydown.enter="handleQuantityEnter($index)"
                placeholder="数量"
                size="small"
              />
            </template>
          </el-table-column>
          <el-table-column label="单位" prop="unitName" width="70" />
          <el-table-column v-if="form.inboundType === 'production_return'" label="退料仓库" width="120">
            <template #default="{ row }">{{ row.locationName || locations.find(location => Number(location.id) === Number(row.locationId))?.name || '-' }}</template>
          </el-table-column>
          <el-table-column label="批次号" width="150">
            <template #default="{ row }">
              <el-input
                v-model="row.batchNo"
                :disabled="form.inboundType === 'production_return'"
                placeholder="请输入批次号"
                size="small"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" width="150">
            <template #default="{ row }">
              <el-input
                v-model="row.remarks"
                placeholder="请输入备注"
                size="small"
                maxlength="200"
                clearable />
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="80" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="{ $index }">
              <el-button
                type="danger"
                size="small"
                @click="handleRemoveItem($index)"
                v-permission="dialogType === 'create' ? 'inventory:inbound:create' : 'inventory:inbound:update'"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!requiresProductionTask" class="add-material mt-10">
          <el-button
            type="primary"
            v-permission="dialogType === 'create' ? 'inventory:inbound:create' : 'inventory:inbound:update'"
            @click="handleAddItem"
          >
            <el-icon><Plus /></el-icon>添加物料
          </el-button>
        </div>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button
            type="primary"
            v-permission="dialogType === 'create' ? 'inventory:inbound:create' : 'inventory:inbound:update'"
            @click="handleSubmit"
            :loading="submitLoading"
          >
            确定
          </el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 查看入库单对话框 -->
    <AppDialog
      v-model="viewDialogVisible"
      title="入库单详情"
      mode="view"
      content-width="wide"
      :detail-navigation="inboundViewNavigation"
    >
      <div v-loading="viewLoading">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="入库单号">{{ currentInbound.inboundNo }}</el-descriptions-item>
        <el-descriptions-item label="入库日期">{{ currentInbound.inboundDate }}</el-descriptions-item>
        <el-descriptions-item label="仓库">{{ currentInbound.locationName }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentInbound.status)">
            {{ getStatusText(currentInbound.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作人">{{ currentInbound.operatorName || currentInbound.operator || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ currentInbound.remarks }}</el-descriptions-item>
      </el-descriptions>
      <el-divider>入库明细</el-divider>
      <el-table :data="currentInbound.items" border class="w-full">
        <el-table-column prop="materialCode" label="物料编码" width="120" />
        <el-table-column prop="materialName" label="物料名称" min-width="150" />
        <el-table-column prop="quantity" label="数量" width="100" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column prop="batchNo" label="批次号" width="200" />
        <el-table-column prop="remarks" label="备注" min-width="150" />
      </el-table>
      <InventoryApprovalPanel
        ref="inventoryApprovalPanelRef"
        v-if="authStore.canViewInventoryApproval"
        source-type="inbound"
        :source-id="currentInbound.id"
        :source-no="currentInbound.inboundNo"
        :resubmit-status="currentInbound.status === 'completed' ? 'completed' : ''"
        @resubmit="handleResubmitInbound"
        @changed="handleApprovalChanged"
      />
      </div>
      <template #footer>
        <el-button v-if="canEditInbound(currentInbound)" type="primary" :disabled="viewLoading" @click="handleEdit(currentInbound)">编辑</el-button>
        <el-button v-if="canResubmitWithoutFinanceView" type="warning" :loading="resubmitLoading" :disabled="viewLoading" @click="handleResubmitInbound('completed')">重新提交审核</el-button>
        <el-button @click="viewDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="handlePrintInbound" :loading="printLoading" :disabled="viewLoading">打印</el-button>
      </template>
    </AppDialog>
    <!-- 物料选择对话框 -->
    <AppDialog
      v-model="materialDialogVisible"
      title="选择物料"
      mode="form"
      wide
    >
      <el-form :inline="true" class="search-form material-search-form" :model="materialSearchForm">
        <el-form-item label="物料编码">
          <el-input  v-model="materialSearchForm.code" placeholder="物料编码" clearable />
        </el-form-item>
        <el-form-item label="物料名称">
          <el-input  v-model="materialSearchForm.name" placeholder="物料名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleMaterialSearch">搜索</el-button>
        </el-form-item>
      </el-form>
      <el-table
        :data="materialTableData"
        class="w-full"
        v-loading="materialLoading"
        @selection-change="handleMaterialSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="code" label="物料编码" width="120" />
        <el-table-column prop="name" label="物料名称" width="180" />
        <el-table-column prop="specs" label="规格" width="220" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column label="操作" min-width="100" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleAddSingleMaterial(row)">
              <el-icon><Check /></el-icon> 选择
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="materialCurrentPage"
          v-model:page-size="materialPageSize"
          :page-sizes="PAGE_SIZE_OPTIONS"
          :total="materialTotal"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleMaterialSizeChange"
          @current-change="handleMaterialCurrentChange"
        />
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="materialDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="handleMaterialConfirm">确定</el-button>
        </span>
      </template>
        </AppDialog>
    <!-- 生产任务选择对话框 -->
    <AppDialog
      v-model="productionTaskDialogVisible"
      :title="form.inboundType === 'production' ? '选择生产任务（生产入库）' : '选择生产任务（生产退料）'"
      mode="form"
      wide
    >
      <el-form :inline="true" class="search-form" :model="{ keyword: taskSearchKeyword }">
        <el-form-item label="任务编号/产品">
          <el-input
            v-model="taskSearchKeyword"
            placeholder="输入任务编号或产品名称"
            clearable
            @keyup.enter="searchProductionTasks" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="searchProductionTasks">查询</el-button>
        </el-form-item>
      </el-form>
      <el-table
        :data="productionTasks"
        v-loading="taskLoading"
        border
        class="w-full"
        @row-click="handleTaskRowClick"
        highlight-current-row
      >
        <el-table-column prop="code" label="任务编号" width="150" />
        <el-table-column prop="productCode" label="产品编码" width="130" />
        <el-table-column prop="productName" label="产品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="quantity" label="生产数量" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getTaskStatusType(row.status)">{{ getTaskStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="100" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click.stop="selectTask(row)">选择</el-button>
          </template>
        </el-table-column>
      </el-table>
      <!-- 选中任务后显示领料记录 -->
      <template v-if="taskSelection && form.inboundType === 'production_return'">
        <el-divider>任务 {{ taskSelection.code }} 的领料记录</el-divider>
        <el-alert
          v-if="taskMaterialRecords.length === 0 && !taskMaterialLoading"
          title="该任务暂无领料记录"
          type="warning"
          :closable="false"
        />
        <el-table
          v-else
          :data="taskMaterialRecords"
          v-loading="taskMaterialLoading"
          border
          class="w-full"
          @selection-change="handleReturnMaterialSelection"
        >
          <el-table-column type="selection" width="55" :selectable="checkReturnSelectable" />
          <el-table-column prop="materialCode" label="物料编码" width="130" />
          <el-table-column prop="materialName" label="物料名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="materialSpecs" label="规格" width="150" show-overflow-tooltip />
          <el-table-column prop="batchNo" label="领料批次" width="150" show-overflow-tooltip />
          <el-table-column prop="issuedQuantity" label="领料数量" width="100" />
          <el-table-column prop="returnedQuantity" label="已退数量" width="100">
            <template #default="{ row }">
              <span :class="row.returnedQuantity > 0 ? 'text-warning' : ''">
                {{ row.returnedQuantity || 0 }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="maxReturnableQuantity" label="可退数量" width="100">
            <template #default="{ row }">
              <span :class="row.maxReturnableQuantity > 0 ? 'text-success' : 'text-muted'">
                {{ row.maxReturnableQuantity }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="defaultLocationName" label="退料仓库" width="120">
            <template #default="{ row }">
              <span>{{ row.defaultLocationName || '未设置' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="退料数量" width="120">
            <template #default="{ row }">
              <el-input-number
                v-model="row.returnQuantity"
                :min="0"
                :max="row.maxReturnableQuantity"
                :precision="2"
                size="small"
                :disabled="row.maxReturnableQuantity <= 0"
              />
            </template>
          </el-table-column>
        </el-table>
      </template>
      <el-select v-if="taskSelection && form.inboundType === 'production'" v-model="selectedInspectionId" placeholder="选择终检放行依据">
        <el-option v-for="inspection in taskInspections" :key="inspection.id" :value="inspection.id"
          :label="`${inspection.inspectionNo} / ${inspection.batchNo} / 可用 ${inspection.availableQuantity}`" />
      </el-select>
      <el-alert v-if="taskSelection && form.inboundType === 'production'" :title="`将入库任务产品：${taskSelection.productName || taskProduct?.name || ''}，必须选择终检放行依据；已有自动草稿请直接办理，不能重复占用额度。`" type="info" :closable="false" />
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="productionTaskDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmTaskSelection" :disabled="!taskSelection || taskMaterialLoading">确认选择</el-button>
        </span>
      </template>
        </AppDialog>
  </div>
</template>
<script setup>
import { PAGE_SIZE_OPTIONS } from '@/config/pagination'
import { getThemeDefaultPageSize } from '@/utils/themePageSize'
import { getApiErrorMessage } from '@/utils/errorHandler'
import { handleTableRowView } from '@/utils/tableRowView'
import { formatLocalDate } from '@/utils/format';
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus/es/components/message/index'
import { Plus, Check, Finished, Close, Edit } from '@element-plus/icons-vue'
import { inventoryApi, baseDataApi, productionApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useDictionaryStore } from '@/stores/dictionary'
import { tokenManager } from '@/utils/unifiedStorage'
import {
  getInboundOutboundStatusText,
  getInboundOutboundStatusColor,
  getInventoryInboundTypeText,
  getInventoryInboundTypeColor,
  getProductionStatusText,
  getProductionStatusColor,
} from '@/constants/systemConstants'
import { searchMaterials } from '@/utils/searchConfig'
import { parseListData, parsePaginatedData, parseResponseData } from '@/utils/responseParser'
import { useListDetailNavigation } from '@/composables/useListDetailNavigation'
import { loadLocationOptions } from '@/utils/optionLoaders'
import printService from '@/services/printService'
import TableRowActions from '@/components/common/TableRowActions.vue'
import InventoryApprovalPanel from '@/components/inventory/InventoryApprovalPanel.vue'
const route = useRoute()
// 权限store
const authStore = useAuthStore()
const dictionaryStore = useDictionaryStore()
const getCurrentUserDisplayName = () => {
  const currentUser = authStore.user || tokenManager.getUser()
  return currentUser?.realName || currentUser?.realName || currentUser?.name || currentUser?.username || ''
}
// 权限计算属性
const canCreate = computed(() => authStore.hasPermission && authStore.hasPermission('inventory:inbound:create'));
const canUpdate = computed(() => Boolean(authStore.hasPermission?.('inventory:inbound:update')))
const canEditInbound = (inbound) => canUpdate.value && ['draft', 'confirmed'].includes(inbound.status) &&
  !['purchase', 'purchase_inbound', 'purchase_receipt'].includes(inbound.inboundType) &&
  !['purchase_order', 'purchase_receipt', 'purchase_inbound'].includes(inbound.referenceType)
const inboundStatuses = ['draft', 'confirmed', 'completed', 'cancelled', 'reversed']
// 搜索表单
const searchForm = reactive({
  materialName: '',
  inboundNo: '',
  locationId: '',
  status: '',
  dateRange: []
})
// 表格数据
const tableData = ref([])
const {
  previousItem: previousViewInbound,
  nextItem: nextViewInbound,
  hasPrevious: hasPreviousViewInbound,
  hasNext: hasNextViewInbound,
  setCurrentItem: setCurrentViewInbound
} = useListDetailNavigation(tableData)
const loading = ref(false)
// 添加响应式分页对象
const pagination = reactive({
  currentPage: 1,
  pageSize: getThemeDefaultPageSize(10),
  total: 0
})
// 对话框相关
const dialogVisible = ref(false)
const dialogType = ref('create')
const viewDialogVisible = ref(false)
const viewLoading = ref(false)
const submitLoading = ref(false)
const formRef = ref(null)
const form = reactive({
  id: null,
  inspectionId: null,
  inboundDate: '',
  locationId: '',
  operator: '',
  remarks: '',
  status: 'draft',
  items: [],
  // 新增字段：入库类型和关联单据
  inboundType: 'other',
  referenceType: null,
  referenceId: null,
  referenceNo: null
})
const requiresProductionTask = computed(() => ['production', 'production_return'].includes(form.inboundType))
const inboundTypeDefinitions = Object.freeze([
  { value: 'other', dictionaryCode: 'inbound', fallbackLabel: '其他入库' },
  { value: 'production', dictionaryCode: 'production_inbound', fallbackLabel: '生产入库' },
  { value: 'production_return', dictionaryCode: 'production_return', fallbackLabel: '生产退料' },
  { value: 'defective_return', dictionaryCode: 'defective_return', fallbackLabel: '不良退回' },
  { value: 'outsourced', dictionaryCode: 'outsourced_inbound', fallbackLabel: '委外入库' },
  { value: 'sales_return', dictionaryCode: 'sales_return', fallbackLabel: '销售退货' },
])
// 入库单类型来自“系统管理 → 业务类型”的 inventory_transaction / 入库分类。
// 已有单据仍使用 purchase/production 等领域编码，因此在展示层映射到字典标准编码。
const inboundTypeOptions = computed(() => {
  const configured = dictionaryStore.groups.inventory_transaction || []
  if (!dictionaryStore.isLoaded || configured.length === 0) {
    return inboundTypeDefinitions.map((item) => ({
      value: item.value,
      label: item.fallbackLabel,
    }))
  }

  const configuredByCode = new Map(configured.map((item) => [item.code, item]))
  return inboundTypeDefinitions.flatMap((definition) => {
    const item = configuredByCode.get(definition.dictionaryCode)
    return item ? [{ value: definition.value, label: item.name }] : []
  })
})
const getDefaultInboundType = () =>
  inboundTypeOptions.value.find((item) => item.value === 'other')?.value ||
  inboundTypeOptions.value[0]?.value ||
  'other'
// 生产退料相关
const productionTaskDialogVisible = ref(false)
const productionTasks = ref([])
const taskInspections = ref([])
const selectedInspectionId = ref(null)
const taskSearchKeyword = ref('')
const taskLoading = ref(false)
const selectedTask = ref(null)
const taskSelection = ref(null)
const taskProduct = ref(null)
const taskMaterialRecords = ref([])
const taskMaterialLoading = ref(false)
let taskSelectionRequest = 0
const inventoryApprovalPanelRef = ref(null)
const resubmitLoading = ref(false)
const canResubmitWithoutFinanceView = computed(() => !authStore.canViewInventoryApproval && canUpdate.value &&
  currentInbound.status === 'completed' && currentInbound.financeStatus === 'rejected')
// 当前查看的入库单
const currentInbound = reactive({
  inboundNo: '',
  inboundDate: '',
  locationName: '',
  status: '',
  operator: '',
  operatorName: '',
  remarks: '',
  items: []
})
// 基础数据
const locations = ref([])
const _materials = ref([])
const units = ref([])
// 物料选择对话框相关
const materialDialogVisible = ref(false)
const materialSearchForm = reactive({
  code: '',
  name: ''
})
const materialTableData = ref([])
const materialLoading = ref(false)
const materialCurrentPage = ref(1)
const materialPageSize = ref(10)
const materialTotal = ref(0)
const selectedMaterials = ref([])
// 表单验证规则
const rules = {
  inboundDate: [
    { required: true, message: '请选择入库日期', trigger: 'change' }
  ],
  locationId: [
    { required: true, message: '请选择仓库', trigger: 'change' }
  ],
  operator: [
    { required: true, message: '请输入操作人', trigger: 'blur' }
  ],
  referenceId: [{ validator: (_rule, value, callback) => {
    if (requiresProductionTask.value && !form.inspectionId && (!value || form.referenceType !== 'production_task')) callback(new Error('请选择关联生产任务'))
    else callback()
  }, trigger: 'change' }]
}
// 入库单统计数据
const inboundStats = reactive({
  total: 0,
  draftCount: 0,
  confirmedCount: 0,
  completedCount: 0,
  cancelledCount: 0
});
// 获取状态类型
const getStatusType = (status) => getInboundOutboundStatusColor(status) || 'info';
// 获取状态文本
const getStatusText = (status) => getInboundOutboundStatusText(status) || status;
// 获取入库类型文本
const getInboundTypeText = (type) => getInventoryInboundTypeText(type) || type || '未知'
// 获取入库类型标签样式
const getInboundTypeTagType = (type) => getInventoryInboundTypeColor(type) || 'info'
// 加载仓库列表
const loadLocations = async () => {
  try {
    locations.value = await loadLocationOptions();
    if (locations.value.length === 0) {
      ElMessage.warning('未找到可用的仓库，请先在基础数据中添加仓库');
    }
  } catch (error) {
    console.error('加载仓库数据失败:', error);
    ElMessage.error('加载仓库数据失败: ' + (getApiErrorMessage(error, '未知错误')));
    locations.value = [];
  }
};
// 加载物料列表
const loadMaterials = async () => {
  try {
    materialLoading.value = true
    const params = {
      page: materialCurrentPage.value,
      pageSize: materialPageSize.value,
      name: materialSearchForm.name,
      code: materialSearchForm.code
    }
    const response = await baseDataApi.getMaterials(params)
    const { list, total } = parsePaginatedData(response)
    materialTableData.value = list
    materialTotal.value = total
  } catch (error) {
    console.error('加载物料数据失败:', error)
    ElMessage.error('加载物料数据失败')
  } finally {
    materialLoading.value = false
  }
}
// 加载单位数据
const loadUnits = async () => {
  try {
    const response = await baseDataApi.getUnits({ status: 1 }); // 只获取启用的单位
    units.value = parseListData(response, { enableLog: false });
    return units.value;
  } catch (error) {
    console.error('加载单位数据失败:', error);
    ElMessage.error('加载单位数据失败');
    return [];
  }
};
// 加载入库单列表
const loadInbounds = async () => {
  loading.value = true;
  try {
    const params = {
      page: pagination.currentPage,
      pageSize: pagination.pageSize,
      materialName: searchForm.materialName,
      inboundNo: searchForm.inboundNo,
      locationId: searchForm.locationId,
      status: searchForm.status,
      startDate: searchForm.dateRange && searchForm.dateRange[0] ? searchForm.dateRange[0] : '',
      endDate: searchForm.dateRange && searchForm.dateRange[1] ? searchForm.dateRange[1] : ''
    };
    const response = await inventoryApi.getInboundList(params);
    const { list, total } = parsePaginatedData(response);
    tableData.value = list;
    pagination.total = Math.max(total, 0);
    updateStats();
  } catch (error) {
    console.error('加载入库单失败:', error);
    ElMessage.error('加载入库单失败');
    tableData.value = [];
    pagination.total = 0;
  } finally {
    loading.value = false;
  }
};
// 搜索处理
const handleSearch = () => {
  pagination.currentPage = 1;
  loadInbounds();
};
// 新建入库单
const handleCreate = () => {
  dialogType.value = 'create'
  form.id = null
  form.inspectionId = null
  form.inboundDate = formatLocalDate(new Date())
  form.locationId = ''
  form.inboundType = getDefaultInboundType()
  form.referenceType = null
  form.referenceId = null
  form.referenceNo = null
  selectedTask.value = null
  selectedReturnMaterials.value = []
  // 设置当前用户为操作人（使用真实姓名）
  form.operator = getCurrentUserDisplayName()

  form.remarks = ''
  form.status = 'draft'
  form.items = []
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}
const handleEdit = async (row) => {
  if (!canEditInbound(row)) return
  viewLoading.value = true
  try {
    const inbound = parseResponseData(await inventoryApi.getInboundDetail(row.id))
    if (!canEditInbound(inbound)) {
      ElMessage.warning('该入库单当前状态不允许编辑，请刷新后重试')
      return
    }
    let task = null
    if (['production', 'production_return'].includes(inbound.inboundType) && inbound.referenceId && inbound.referenceType === 'production_task') {
      task = parseResponseData(await productionApi.getProductionTask(inbound.referenceId))
    }
    Object.assign(form, {
      id: inbound.id, inspectionId: inbound.inspectionId || null, inboundDate: inbound.inboundDate, locationId: inbound.locationId,
      operator: inbound.operator || inbound.operatorName || getCurrentUserDisplayName(),
      remarks: inbound.remarks || '', status: inbound.status, inboundType: inbound.inboundType || 'other',
      referenceType: inbound.referenceType || null, referenceId: inbound.referenceId || null, referenceNo: inbound.referenceNo || null,
      items: (inbound.items || []).map(item => ({ ...item, batchNo: item.batchNo || '', remarks: item.remarks || '' }))
    })
    selectedTask.value = task
    dialogType.value = 'edit'
    viewDialogVisible.value = false
    dialogVisible.value = true
    nextTick(() => formRef.value?.clearValidate())
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '获取入库单编辑信息失败'))
  } finally {
    viewLoading.value = false
  }
}
// ========== 打印功能 ==========
const printLoading = ref(false)
const handlePrintInbound = async () => {
  printLoading.value = true
  try {
    // 业务侧只传 camel；printService 展开 snake 模板占位
    const printData = {
      inboundNo: currentInbound.inboundNo || '',
      inboundDate: currentInbound.inboundDate || '',
      inboundType: getInboundTypeText(currentInbound.inboundType) || '其他入库',
      supplierName: currentInbound.supplierName || '',
      locationName: currentInbound.locationName || '',
      remarks: currentInbound.remarks || '',
      remark: currentInbound.remarks || '',
      operator: currentInbound.operatorName || currentInbound.operator || '',
      items: (currentInbound.items || []).map((item, idx) => ({
        index: idx + 1,
        materialCode: item.materialCode || '',
        materialName: item.materialName || '',
        specification: item.specification || '',
        quantity: parseFloat(item.quantity || 0).toFixed(2),
        unitName: item.unitName || '',
        remarks: item.remarks || '',
        remark: item.remarks || ''
      }))
    }
    const html = await printService.generateByDefaultTemplate('inventory', 'inbound', printData)
    printService.previewDocument(html)
  } catch (error) {
    console.error('打印入库单失败:', error)
    ElMessage.error('打印失败: ' + (getApiErrorMessage(error, '未知错误')))
  } finally {
    printLoading.value = false
  }
}
// 查看入库单
const handleView = async (id) => {
  viewDialogVisible.value = true
  viewLoading.value = true
  try {
    const res = await inventoryApi.getInboundDetail(id)
    // 后端使用 ResponseHandler.success 返回，统一由 parser 解包
    const inboundData = parseResponseData(res)
    Object.assign(currentInbound, inboundData)
    const row = tableData.value.find((item) => String(item.id) === String(id))
    if (row) setCurrentViewInbound(row)
  } catch (error) {
    console.error('获取入库单详情失败:', error)
    ElMessage.error('获取入库单详情失败')
  } finally {
    viewLoading.value = false
  }
}

const handleViewPrevious = () => {
  if (previousViewInbound.value) handleView(previousViewInbound.value.id)
}

const handleViewNext = () => {
  if (nextViewInbound.value) handleView(nextViewInbound.value.id)
}

const inboundViewNavigation = computed(() => ({
  hasPrevious: hasPreviousViewInbound.value,
  hasNext: hasNextViewInbound.value,
  loading: viewLoading.value,
  previous: handleViewPrevious,
  next: handleViewNext
}))
// 更新入库单状态
const handleUpdateStatus = async (id, newStatus) => {
  try {
    // 确保使用正确的参数格式
    await inventoryApi.updateInboundStatus(id, { newStatus });
    // 追溯记录由底层 batch_relationships 统一管理，此处只更新入库状态。
    ElMessage.success('状态更新成功');
    // 刷新数据
    await handleApprovalChanged();
  } catch (error) {
    console.error('状态更新失败:', error);
    ElMessage.error(getApiErrorMessage(error, '状态更新失败'));
  }
}

const handleResubmitInbound = async (status) => {
  if (!canUpdate.value || !currentInbound.id || status !== 'completed' || resubmitLoading.value) return
  resubmitLoading.value = true
  try {
    await inventoryApi.updateInboundStatus(currentInbound.id, { newStatus: status })
    ElMessage.success('已重新提交财务审核')
    await handleApprovalChanged()
    await inventoryApprovalPanelRef.value?.refresh()
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '重新提交审核失败'))
  } finally {
    resubmitLoading.value = false
  }
}

const handleApprovalChanged = async () => {
  await loadInbounds()
  if (viewDialogVisible.value && currentInbound.id) await handleView(currentInbound.id)
}
// 组件引用管理
const materialSelectRefs = ref({})
const quantityInputRefs = ref({})
// 设置物料选择框引用
const setMaterialSelectRef = (el, index) => {
  if (el) {
    materialSelectRefs.value[index] = el
  }
}
// 设置数量输入框引用
const setQuantityInputRef = (el, index) => {
  if (el) {
    quantityInputRefs.value[index] = el
  }
}
// 添加物料项
const handleAddItem = () => {
  if (requiresProductionTask.value) return
  form.items.push({
    materialId: '',
    materialCode: '',
    materialName: '',
    specification: '',
    quantity: '',
    unitName: '',
    unitId: '',
    batchNo: '',
    remarks: ''
  })
  // 聚焦到新添加行的物料输入框
  nextTick(() => {
    const newIndex = form.items.length - 1
    const materialInput = materialSelectRefs.value[newIndex]
    if (materialInput) {
      materialInput.focus()
    }
  })
}
// 删除物料项
const handleRemoveItem = (index) => {
  form.items.splice(index, 1)
}
// 获取物料建议列表
const fetchMaterialSuggestions = async (queryString, callback) => {
  // 如果查询字符串为空,返回空数组
  if (!queryString || queryString.trim().length === 0) {
    callback([])
    return
  }
  try {
    // 使用统一的搜索函数
    const searchResults = await searchMaterials(baseDataApi, queryString.trim(), {
      includeAll: true
    })
    // 映射搜索结果为自动完成需要的格式
    const suggestions = searchResults.map(item => ({
      value: item.code || '无编码', // value 用于显示在输入框中
      id: item.id,
      code: item.code || '无编码',
      name: item.name || '未命名',
      specs: item.specification || item.specs || '',
      unitName: item.unitName || '个',
      unitId: item.unitId,
      stockQuantity: item.stockQuantity ?? item.stockQuantity ?? 0
    }))
    callback(suggestions)
  } catch {
    ElMessage.error('搜索物料失败')
    callback([])
  }
}
// 处理物料选择
const handleMaterialSelect = (item, index) => {
  const materialId = Number(item.id)
  if (!materialId || isNaN(materialId)) {
    console.error('物料ID无效:', item.id)
    ElMessage.error('所选物料无效，请重新选择')
    return
  }
  form.items[index].materialId = materialId
  form.items[index].materialCode = item.code
  form.items[index].materialName = item.name
  form.items[index].specification = item.specs
  form.items[index].unitName = item.unitName
  form.items[index].unitId = item.unitId
  // 选择物料后，自动聚焦到数量输入框
  nextTick(() => {
    const quantityInput = quantityInputRefs.value[index]
    if (quantityInput) {
      quantityInput.focus()
    }
  })
}
// 处理物料输入框回车
const handleMaterialEnter = (index) => {
  // 如果已选择物料，跳转到数量输入框
  if (form.items[index].materialId) {
    const quantityInput = quantityInputRefs.value[index]
    if (quantityInput) {
      quantityInput.focus()
    }
  }
}
// 处理物料清除
const handleMaterialClear = (index) => {
  form.items[index].materialId = ''
  form.items[index].materialCode = ''
  form.items[index].materialName = ''
  form.items[index].specification = ''
  form.items[index].unitName = ''
  form.items[index].unitId = ''
}
// 处理数量输入框回车
const handleQuantityEnter = (index) => {
  // 如果是最后一行，添加新行
  if (index === form.items.length - 1) {
    handleAddItem()
  } else {
    // 否则跳转到下一行的物料输入框
    const nextMaterialInput = materialSelectRefs.value[index + 1]
    if (nextMaterialInput) {
      nextMaterialInput.focus()
    }
  }
}
// 仓库选择变化
const handleLocationChange = () => {
  if (form.inboundType !== 'production_return') {
    form.items.forEach(item => { item.locationId = form.locationId })
  }
}
// 入库类型变化
const handleInboundTypeChange = () => {
  taskSelectionRequest += 1
  // 清空关联信息和明细
  form.referenceType = null
  form.referenceId = null
  form.referenceNo = null
  form.items = []
  selectedTask.value = null
  taskMaterialRecords.value = []
  selectedReturnMaterials.value = []
}
// 计算对话框标题
const getDialogTitle = computed(() => {
  if (dialogType.value === 'create') {
    if (form.inboundType === 'production_return') {
      return '新建退料单'
    }
    return '新建入库单'
  }
  return '编辑入库单'
})
// 打开生产任务选择对话框
const openTaskSelectDialog = async () => {
  if (form.inspectionId) return
  taskSelectionRequest += 1
  productionTaskDialogVisible.value = true
  taskSearchKeyword.value = ''
  taskSelection.value = null
  taskProduct.value = null
  taskInspections.value = []
  selectedInspectionId.value = null
  taskMaterialRecords.value = []
  selectedReturnMaterials.value = []
  await searchProductionTasks()
}
// 搜索生产任务
const searchProductionTasks = async () => {
  try {
    taskLoading.value = true
    const response = await productionApi.getProductionTasks({
      keyword: taskSearchKeyword.value,
      status: 'in_progress,material_issued,inspection,warehousing,completed',
      limit: 50
    })
    productionTasks.value = parseListData(response)
  } catch (error) {
    console.error('查询生产任务失败:', error)
    productionTasks.value = []
  } finally {
    taskLoading.value = false
  }
}
// 点击任务行
const handleTaskRowClick = (row) => {
  selectTask(row)
}
// 选择任务
const selectTask = async (task) => {
  const request = ++taskSelectionRequest
  taskSelection.value = null
  taskProduct.value = null
  taskMaterialRecords.value = []
  selectedReturnMaterials.value = []
  taskMaterialLoading.value = true
  try {
    const detail = parseResponseData(await productionApi.getProductionTask(task.id))
    if (request !== taskSelectionRequest) return
    if (form.inboundType === 'production') {
      if (!detail?.productId) throw new Error('该生产任务没有关联产品')
      const product = parseResponseData(await baseDataApi.getMaterial(detail.productId))
      if (request !== taskSelectionRequest) return
      if (!product?.id || !product.unitId) throw new Error('任务产品缺少物料或单位信息，请先维护产品资料')
      const inspections = parseListData(await inventoryApi.getTaskReleaseSources(task.id))
      if (request !== taskSelectionRequest) return
      taskInspections.value = inspections.filter(row => Number(row.taskId || row.referenceId) === Number(task.id) &&
        ['passed', 'partial', 'completed', 'failed'].includes(row.status) && Number(row.availableQuantity) > 0)
      taskProduct.value = product
    } else {
      await loadTaskMaterialRecords(task.id, request)
      if (request !== taskSelectionRequest) return
    }
    taskSelection.value = detail
  } catch (error) {
    if (request === taskSelectionRequest) ElMessage.error(getApiErrorMessage(error, '加载生产任务失败'))
  } finally {
    if (request === taskSelectionRequest) taskMaterialLoading.value = false
  }
}
// 加载任务领料记录
const loadTaskMaterialRecords = async (taskId, request = taskSelectionRequest) => {
  try {
    taskMaterialLoading.value = true
    const response = await inventoryApi.getTaskMaterialIssueRecords(taskId, form.id ? { excludeInboundId: form.id } : undefined)
    const data = parseResponseData(response)
    if (request !== taskSelectionRequest) return
    taskMaterialRecords.value = (data?.records || []).map(r => ({
      ...r,
      batchNo: r.batchNo ?? r.batchNumber,
      issuedQuantity: Number(r.issuedQuantity) || 0,
      returnedQuantity: Number(r.returnedQuantity) || 0,
      maxReturnableQuantity: Number(r.maxReturnableQuantity) || 0,
      returnQuantity: Math.max(Number(r.maxReturnableQuantity) || 0, 0)
    }))
  } catch (error) {
    console.error('获取领料记录失败:', error)
    if (request === taskSelectionRequest) taskMaterialRecords.value = []
  } finally {
    if (request === taskSelectionRequest) taskMaterialLoading.value = false
  }
}
// 检查是否可选择退料
const checkReturnSelectable = (row) => {
  return (row.maxReturnableQuantity || 0) > 0
}
// 处理退料物料选择
const selectedReturnMaterials = ref([])
const handleReturnMaterialSelection = (selection) => {
  selectedReturnMaterials.value = selection
}
// 确认任务选择
const confirmTaskSelection = () => {
  if (!taskSelection.value || taskMaterialLoading.value) {
    ElMessage.warning('请先选择一个生产任务')
    return
  }
  if (form.inboundType === 'production') {
    const product = taskProduct.value
    const inspection = taskInspections.value.find(row => row.id === selectedInspectionId.value)
    if (!product) return
    if (!inspection) { ElMessage.warning('请选择已放行的成品终检单；如已有自动草稿，请直接办理该草稿'); return }
    form.inspectionId = inspection.id
    form.inspectionNo = inspection.inspectionNo
    selectedTask.value = taskSelection.value
    form.referenceType = 'production_task'
    form.referenceId = taskSelection.value.id
    form.referenceNo = taskSelection.value.code
    form.locationId = form.locationId || product.defaultLocationId || product.locationId || locations.value[0]?.id || ''
    form.items = [{
      materialId: product.id, materialCode: product.code, materialName: product.name,
      specification: product.specification || product.specs || '', quantity: inspection.availableQuantity,
      unitId: product.unitId, unitName: product.unitName || units.value.find(unit => unit.id === product.unitId)?.name || '',
      batchNo: inspection.batchNo, locationId: form.locationId, remarks: ''
    }]
    productionTaskDialogVisible.value = false
    return
  }
  // 获取选中的退料物料
  const returnItems = selectedReturnMaterials.value.filter(r => taskMaterialRecords.value.includes(r) && Number(r.returnQuantity) > 0 && Number(r.maxReturnableQuantity) > 0)
  if (returnItems.length === 0) {
    ElMessage.warning('请至少选择一个物料并设置退料数量')
    return
  }
  if (returnItems.some(item => !Number.isFinite(Number(item.returnQuantity)) || Number(item.returnQuantity) > Number(item.maxReturnableQuantity))) {
    ElMessage.warning('退料数量不能超过该批次的可退数量')
    return
  }
  selectedTask.value = taskSelection.value
  // 设置关联信息
  form.referenceType = 'production_task'
  form.referenceId = selectedTask.value.id
  form.referenceNo = selectedTask.value.code
  // 自动设置表单仓库：优先使用有默认仓库的物料，否则使用仓库列表第一个
  const locationsWithDefault = returnItems.map(i => i.defaultLocationId).filter(Boolean)
  if (locationsWithDefault.length > 0) {
    form.locationId = locationsWithDefault[0]
  } else if (locations.value.length > 0) {
    form.locationId = locations.value[0].id
  }
  // 构建退料明细（使用物料的默认仓库，没有则使用表单仓库）
  form.items = returnItems.map(item => ({
    materialId: item.materialId,
    materialCode: item.materialCode,
    materialName: item.materialName,
    specification: item.materialSpecs,
    quantity: item.returnQuantity,
    unitName: item.unitName,
    unitId: item.unitId || null,
    batchNo: item.batchNo || '',
    locationId: item.defaultLocationId || form.locationId,
    locationName: item.defaultLocationName || '',
    maxReturnableQuantity: item.maxReturnableQuantity,
    remarks: `生产退料 - 任务${selectedTask.value.code}`
  }))
  productionTaskDialogVisible.value = false
  ElMessage.success(`已选择${returnItems.length}个物料进行退料`)
}
// 获取任务状态类型
const getTaskStatusType = (status) => getProductionStatusColor(status) || 'info'
// 获取任务状态文字
const getTaskStatusText = (status) => getProductionStatusText(status) || status || '未知'
// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()

    if (form.items.length === 0) {
      ElMessage.warning('请至少添加一个物料项')
      return
    }

    if (requiresProductionTask.value && (!form.inspectionId || form.referenceType === 'production_task') && (form.referenceType !== 'production_task' || !form.referenceId)) {
      ElMessage.warning('请选择关联生产任务')
      return
    }
    if (form.inboundType === 'production' && !form.inspectionId) {
      ElMessage.warning('生产入库必须选择成品终检放行依据')
      return
    }
    if (form.items.some(item => !Number.isInteger(Number(item.materialId)) || Number(item.materialId) <= 0 || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
      ElMessage.warning('请检查物料信息，并填写大于零的有效数量')
      return
    }
    if (form.inboundType === 'production' && (!form.inspectionId || selectedTask.value?.productId)) {
      if (!selectedTask.value?.productId || form.items.some(item => Number(item.materialId) !== Number(selectedTask.value.productId))) {
        ElMessage.warning('生产入库明细必须为关联任务的产品，请重新选择任务')
        return
      }
      const totalQuantity = form.items.reduce((sum, item) => sum + Number(item.quantity), 0)
      if (Number(selectedTask.value.quantity) > 0 && totalQuantity > Number(selectedTask.value.quantity)) {
        ElMessage.warning('本次入库数量不能超过生产任务数量')
        return
      }
    }
    if (form.inboundType === 'production_return' && form.items.some(item => item.maxReturnableQuantity != null && Number(item.quantity) > Number(item.maxReturnableQuantity))) {
      ElMessage.warning('退料数量不能超过该批次的可退数量')
      return
    }

    submitLoading.value = true

    // 确保所有物料项有 unitId / unitName
    for (const item of form.items) {
      if (!item.unitId) {
        ElMessage.warning('存在物料没有指定单位，请检查')
        return
      }

      // 确保有 unitName
      if (!item.unitName && item.unitId) {
        const unit = units.value.find(u => u.id === item.unitId)
        if (unit) {
          item.unitName = unit.name
        }
      }
    }

    // 纯 camel 提交（后端 inventoryInboundMap.fromApi）
    const submitData = {
      inboundDate: form.inboundDate,
      locationId: form.locationId,
      operator: form.operator,
      remarks: form.remarks,
      status: form.status,
      inboundType: form.inboundType,
      referenceType: form.referenceType,
      referenceId: form.referenceId,
      referenceNo: form.referenceNo,
      inspectionId: form.inspectionId,
      items: form.items.map(item => ({
        materialId: item.materialId,
        quantity: Number(item.quantity),
        unitId: item.unitId,
        batchNo: String(item.batchNo || '').trim(),
        locationId: item.locationId || form.locationId,
        remarks: item.remarks
      }))
    };

    // 根据对话框类型决定是创建还是更新
    if (dialogType.value === 'create') {
      await inventoryApi.createInbound(submitData)
      ElMessage.success('入库单创建成功')
    } else {
      await inventoryApi.updateInbound(form.id, submitData)
      ElMessage.success('入库单更新成功')
    }
    // 追溯关系由后端入库流程统一写入 batch_relationships，前端不再重复发起旧追溯接口。

    dialogVisible.value = false
    await handleApprovalChanged()
  } catch (error) {
    console.error('提交失败:', error)
    ElMessage.error(getApiErrorMessage(error, '提交失败'))
  } finally {
    submitLoading.value = false
  }
}
// 分页处理
const handleSizeChange = (val) => {
  pagination.pageSize = val;
  pagination.currentPage = 1;
  loadInbounds();
};
const handleCurrentChange = (val) => {
  pagination.currentPage = val;
  loadInbounds();
};
// 物料搜索
const handleMaterialSearch = () => {
  materialCurrentPage.value = 1
  loadMaterials()
}
// 物料选择变化
const handleMaterialSelectionChange = (selection) => {
  selectedMaterials.value = selection
}
// 确认选择物料
const handleMaterialConfirm = async () => {
  if (selectedMaterials.value.length === 0) {
    ElMessage.warning('请选择至少一个物料')
    return
  }

  // 确保已加载单位数据
  if (units.value.length === 0) {
    await loadUnits();
    }

  // 添加选中的物料到表单
  for (const material of selectedMaterials.value) {
    // 获取物料详细信息
    try {
      const materialDetail = await baseDataApi.getMaterial(material.id);
      const detailedMaterial = materialDetail.data;

      // 确保每个物料都有 unitId
      const unitId = detailedMaterial.unitId || (units.value.length > 0 ? units.value[0].id : null);
      let unitName = '';

      // 查找单位名称
      if (unitId) {
        const unit = units.value.find(u => u.id === unitId);
        if (unit) {
          unitName = unit.name;
        }
      }

      form.items.push({
        materialId: detailedMaterial.id,
        materialCode: detailedMaterial.code,
        materialName: detailedMaterial.name,
        specification: detailedMaterial.specs,
        quantity: 0,
        unitId: unitId,
        unitName: unitName,
        batchNo: '',
        remarks: ''
      });
    } catch (error) {
      console.error(`获取物料${material.id}详情失败:`, error);

      // 使用列表中的简略信息
      const unitId = material.unitId || (units.value.length > 0 ? units.value[0].id : null);
      let unitName = material.unitName || '';

      // 查找单位名称
      if (unitId && !unitName) {
        const unit = units.value.find(u => u.id === unitId);
        if (unit) {
          unitName = unit.name;
        }
      }

      form.items.push({
        materialId: material.id,
        materialCode: material.code,
        materialName: material.name,
        specification: material.specs,
        quantity: 0,
        unitId: unitId,
        unitName: unitName,
        batchNo: '',
        remarks: ''
      });
    }
  }

  materialDialogVisible.value = false;
  selectedMaterials.value = [];
}
// 分页大小变化
const handleMaterialSizeChange = (val) => {
  materialPageSize.value = val
  materialCurrentPage.value = 1
  loadMaterials()
}
// 页码变化
const handleMaterialCurrentChange = (val) => {
  materialCurrentPage.value = val
  loadMaterials()
}
// 直接添加单个物料
const handleAddSingleMaterial = async (material) => {
  try {
    // 获取物料详情
    const materialDetail = await baseDataApi.getMaterial(material.id);
    const detailedMaterial = materialDetail.data;

    // 确保已加载单位数据
    if (units.value.length === 0) {
      await loadUnits();
    }

    // 设置单位
    const unitId = detailedMaterial.unitId || (units.value.length > 0 ? units.value[0].id : null);
    let unitName = '';

    if (unitId) {
      const unit = units.value.find(u => u.id === unitId);
      if (unit) {
        unitName = unit.name;
      }
    }

    // 添加到物料列表
    form.items.push({
      materialId: detailedMaterial.id,
      materialCode: detailedMaterial.code,
      materialName: detailedMaterial.name,
      specification: detailedMaterial.specs,
      quantity: 0,
      unitId: unitId,
      unitName: unitName,
      batchNo: '',
      remarks: ''
    });

    materialDialogVisible.value = false;
    ElMessage.success(`已添加物料: ${detailedMaterial.code} - ${detailedMaterial.name}`);
  } catch (error) {
    console.error('添加单个物料失败:', error);
    ElMessage.error('添加物料失败');
  }
}
// 重置搜索
const resetSearch = () => {
  searchForm.materialName = '';
  searchForm.inboundNo = '';
  searchForm.locationId = '';
  searchForm.status = '';
  searchForm.dateRange = [];
  pagination.currentPage = 1;
  loadInbounds();
};
// 更新统计数据 - 从服务端获取真实统计
const updateStats = async () => {
  try {
    const params = {
      materialName: searchForm.materialName || undefined,
      inboundNo: searchForm.inboundNo || undefined,
      locationId: searchForm.locationId || undefined,
      status: searchForm.status || undefined
    };
    if (searchForm.dateRange && searchForm.dateRange.length === 2) {
      params.startDate = searchForm.dateRange[0];
      params.endDate = searchForm.dateRange[1];
    }
    const response = await inventoryApi.getInboundStatistics(params);
    const stats = parseResponseData(response, {});
    inboundStats.total = Number(stats.total) || 0;
    inboundStats.draftCount = Number(stats.draftCount) || 0;
    inboundStats.confirmedCount = Number(stats.confirmedCount) || 0;
    inboundStats.completedCount = Number(stats.completedCount) || 0;
    inboundStats.cancelledCount = Number(stats.cancelledCount) || 0;
  } catch (error) {
    console.error('获取统计数据失败:', error);
    // 失败时使用当前分页的数据作为fallback
    inboundStats.total = pagination.total;
  }
};
onMounted(async () => {
  await dictionaryStore.fetchDictionary()
  await loadLocations();
  loadMaterials();
  loadUnits();
  loadInbounds();
  // 检查是否从生产工序页面跳转过来（退料操作）
  if (route.query.action === 'return' && route.query.taskId) {
    await handleReturnFromProduction(route.query.taskId, route.query.taskCode)
  }
});
// 处理从生产工序页面跳转过来的退料
const handleReturnFromProduction = async (taskId, taskCode) => {
  handleCreate()
  form.inboundType = 'production_return'
  await openTaskSelectDialog()
  await selectTask({ id: Number(taskId), code: taskCode })
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
}
.table-toolbar {
  margin-bottom: 10px;
}
.material-info {
  margin-top: 4px;
  color: var(--color-text-regular);
  font-size: 12px;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
