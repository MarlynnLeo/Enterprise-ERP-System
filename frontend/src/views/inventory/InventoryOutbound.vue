<!--
/**
 * InventoryOutbound.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="module-page inventory-outbound-container">
    <PageHeader title="出库管理" subtitle="管理出库单据与记录">
      <template #actions>
<el-button type="primary" :icon="Plus" v-permission="'inventory:outbound:create'" @click="handleAdd">新建出库单</el-button>
      </template>
    </PageHeader>

    <!-- 搜索区域 -->
    <FinanceQueryCard
      :loading="loading"
      @search="handleSearch"
      @reset="handleResetSearch"
    >
      <template #basic>
        <el-form-item label="物料名称">
          <el-input v-model="searchKeyword" placeholder="物料名称" clearable @keyup.enter="handleSearch" />
        </el-form-item>
      </template>
      <template #advanced>
        <el-form-item label="生产组">
          <el-select v-model="productionGroupFilter" placeholder="生产组" clearable>
            <el-option v-for="group in productionGroupList" :key="group.id" :label="group.name" :value="group.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="状态">
          <el-select v-model="statusFilter" placeholder="状态" clearable>
            <el-option label="草稿" value="draft" />
            <el-option label="已确认" value="confirmed" />
            <el-option label="部分" value="partial_completed" />
            <el-option label="已完成" value="completed" />
            <el-option label="已冲销" value="reversed" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期"
            end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" clearable />
        </el-form-item>
      </template>
    </FinanceQueryCard>

    <!-- 统计信息 -->
    <div class="statistics-row">
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ outboundStats.total || 0 }}</div>
        <div class="stat-label">出库单总数</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ outboundStats.draftCount || 0 }}</div>
        <div class="stat-label">草稿状态</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ outboundStats.confirmedCount || 0 }}</div>
        <div class="stat-label">已确认</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ outboundStats.partialCompletedCount || 0 }}</div>
        <div class="stat-label">部分</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ outboundStats.completedCount || 0 }}</div>
        <div class="stat-label">已完成</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ outboundStats.reversedCount || 0 }}</div>
        <div class="stat-label">已冲销</div>
      </el-card>
      <el-card class="stat-card" shadow="hover">
        <div class="stat-value">{{ outboundStats.cancelledCount || 0 }}</div>
        <div class="stat-label">已取消</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table ref="outboundTableRef" :data="outboundList" border class="w-full" v-loading="loading"
        @selection-change="handleSelectionChange">
        <template #empty>
          <EmptyState description="暂无出库单数据" />
        </template>
        <el-table-column type="selection" width="55" fixed="left"></el-table-column>
        <el-table-column prop="outboundNo" label="出库单号" min-width="150" show-overflow-tooltip></el-table-column>
        <el-table-column prop="productCode" label="物料编码" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.productCode || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="productSpecs" label="型号规格" min-width="130" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.productSpecs || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="outboundDate" label="出库日期" min-width="110" show-overflow-tooltip>
          <template #default="scope">
            {{ formatDate(scope.row.outboundDate) }}
          </template>
        </el-table-column>

        <el-table-column prop="status" label="状态" min-width="90" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getStatusType(scope.row.status)">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数量" min-width="90" show-overflow-tooltip>
          <template #default="scope">
            <!--
              确定性判断（基于 outboundType 字段，零推断）：
              bom_issue / batch_issue → 显示生产套数
              其他类型 → 显示物料数量 + 单位
            -->
            <span v-if="(scope.row.outboundType === 'bom_issue' || scope.row.outboundType === 'batch_issue') && scope.row.productQuantity">
              {{ Math.floor(scope.row.productQuantity) }} 套
            </span>
            <span v-else>
              {{ Math.floor(scope.row.totalQuantity || 0) }}{{ scope.row.itemUnitName ? ' ' + scope.row.itemUnitName : '' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="生产组" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.productionGroupName || scope.row.productionGroupNames || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作人" min-width="90" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.operatorName || scope.row.operator }}
          </template>
        </el-table-column>
        <el-table-column prop="createdAtFormatted" label="创建时间" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="倒计时" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getCountdownType(scope.row.outboundDate, scope.row.status)" size="small">
              {{ getCountdownText(scope.row.outboundDate, scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" min-width="420" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
          <template #default="scope">
            <el-button class="btn-op-view" type="primary" size="small" v-permission="'inventory:outbound:view'" @click="handleView(scope.row)">
              查看
            </el-button>
            <!-- 草稿和已确认状态显示编辑按钮 -->
            <el-button v-if="scope.row.status === 'draft' || scope.row.status === 'confirmed'" size="small"
              type="primary" @click="handleEdit(scope.row)"
              v-permission="'inventory:outbound:update'">
              编辑
            </el-button>
            <!-- 部分完成状态显示补发按钮 -->
            <el-button v-if="scope.row.status === 'partial_completed'" size="small" type="warning"
              v-permission="'inventory:outbound:update'"
              @click="handleSupplementIssue(scope.row)">
              补发
            </el-button>
            <el-popconfirm v-if="scope.row.status === 'draft'" title="确定要删除该出库单吗？此操作无法恢复。"
              @confirm="handleDelete(scope.row)" confirm-button-type="danger">
              <template #reference>
                <el-button v-permission="'inventory:outbound:delete'" size="small" type="danger">删除</el-button>
              </template>
            </el-popconfirm>
            <el-button v-if="scope.row.status === 'draft'" size="small" type="primary"
              v-permission="'inventory:outbound:update'"
              @click="handleUpdateStatus(scope.row, 'confirmed')">
              确认
            </el-button>
            <el-button v-if="scope.row.status === 'confirmed'" size="small" type="primary"
              v-permission="'inventory:outbound:update'"
              @click="handleUpdateStatus(scope.row, 'completed')">
              完成
            </el-button>
            <el-button v-if="['draft', 'confirmed'].includes(scope.row.status)" size="small" type="warning"
              v-permission="'inventory:outbound:update'"
              @click="handleUpdateStatus(scope.row, 'cancelled')">
              取消
            </el-button>

            <!-- 已出库状态显示撤销重发按钮 -->
            <el-button v-if="scope.row.status === 'completed' || scope.row.status === 'partial_completed'" size="small" type="danger"
              v-permission="'inventory:outbound:update'"
              @click="handleCancelOutbound(scope.row)">
              撤销重发
            </el-button>

            <!-- 非草稿状态显示打印按钮 -->
            <el-button v-if="scope.row.status !== 'draft'" size="small" type="success" v-permission="'inventory:outbound:view'" @click="handlePrint(scope.row)">
              打印
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[10, 20, 50, 100]"
          :small="false" :disabled="false" :background="true" layout="total, sizes, prev, pager, next, jumper"
          :total="Number(total)" @size-change="handleSizeChange" @current-change="handleCurrentChange" />
      </div>
    </el-card>

    <!-- 新增/编辑/补发出库单对话框 -->
    <AppDialog
      v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增出库单' : dialogType === 'supplement' ? '补发出库单' : '编辑出库单'"
      mode="form"
      wide
    >
      <div v-loading="editLoading" class="min-h-form">
      <el-form ref="outboundFormRef" :model="outboundForm" :rules="outboundRules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="生产任务" prop="productionTaskId">
              <el-select v-model="outboundForm.productionTaskId" placeholder="选择生产任务" class="w-full"
                @change="handleProductionPlanChange" clearable filterable>
                <el-option v-for="item in productionPlanOptions" :key="item.id"
                  :label="`${item.code} - ${item.name} (${item.quantity}${item.unitName || ''})`" :value="item.id">
                  <span class="option-code">{{ item.code }}</span>
                  <span class="option-name">{{ item.name }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出库单号">
              <el-input v-model="outboundForm.outboundNo" placeholder="系统自动生成" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出库日期" prop="outboundDate">
              <el-date-picker v-model="outboundForm.outboundDate" type="date" placeholder="选择日期" class="w-full" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="操作人" prop="operator">
              <el-input v-model="outboundForm.operator" placeholder="系统自动填充当前用户姓名" readonly />
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="备注" prop="remarks">
          <el-input v-model="outboundForm.remarks" type="textarea" placeholder="请输入备注" :rows="2" />
        </el-form-item>

        <el-divider content-position="center">出库明细</el-divider>

        <el-table :data="expandedTableData" border class="w-full"
          :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }" empty-text="请添加出库物料">
          <el-table-column label="序号" width="55">
            <template #default="scope">
              <span v-if="!scope.row.isSubstitute">{{ scope.row.originalIndex + 1 }}</span>
              <span v-else class="tree-indent">└</span>
            </template>
          </el-table-column>

          <el-table-column label="物料编码" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <!-- 真实出库明细 -->
              <span v-if="scope.row.isSubstitute" class="text-success">
                {{ scope.row.materialCode }}
              </span>
              <!-- 来自生产计划的物料(只读) -->
              <span v-else-if="scope.row.isFromPlan">
                {{ scope.row.materialCode }}
              </span>
              <!-- 手动添加的物料(可编辑) -->
              <el-autocomplete v-else-if="dialogType !== 'view'"
                :ref="(el) => setMaterialSelectRef(el, scope.row.originalIndex)" v-model="scope.row.materialCode"
                placeholder="输入编码/名称/规格" clearable
                :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, scope.row.originalIndex)"
                @select="(item) => handleMaterialSelectAutocomplete(item, scope.row.originalIndex)"
                @keydown.enter.prevent="handleMaterialEnter(scope.row.originalIndex)"
                @clear="handleMaterialClear(scope.row.originalIndex)" class="w-full" :trigger-on-focus="true"
                :debounce="300" :hide-loading="false" :popper-append-to-body="false" value-key="code">
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
              <!-- 查看模式 -->
              <span v-else>
                {{ scope.row.materialCode }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="物料名称" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
                {{ scope.row.materialName }}
                <el-tag v-if="scope.row.isSubstitute" type="success" size="small" class="ml-sm">替代</el-tag>
              </span>
            </template>
          </el-table-column>

          <el-table-column label="规格" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
                {{ scope.row.specification || '无规格' }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="单位" min-width="80" show-overflow-tooltip>
            <template #default="scope">
              <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
                {{ scope.row.unitName || scope.row.unit || '' }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="出库库位" min-width="100" show-overflow-tooltip>
            <template #default="scope">
              <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
                {{ scope.row.locationName || '' }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="库存" min-width="80" show-overflow-tooltip>
            <template #default="scope">
              <span
                :class="scope.row.isSubstitute ? 'is-substitute-sm' : ((dialogType === 'supplement' && (scope.row.stockQuantity || 0) <= 0) ? 'text-stock-low' : '')">
                {{ scope.row.stockQuantity || 0 }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="出库" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <div v-if="scope.row.isSubstitute" class="is-substitute-sm">
                {{ Math.floor(scope.row.quantity || 0) }}
              </div>
              <el-input v-else-if="dialogType !== 'view' && !scope.row.isFromPlan"
                :ref="(el) => setQuantityInputRef(el, scope.row.originalIndex)" v-model="scope.row.quantity" type="text"
                size="small" @blur="validateOutboundQuantity(scope.row)" @input="validateOutboundQuantity(scope.row)"
                @keydown.enter="handleQuantityEnter(scope.row.originalIndex)" placeholder="数量" />
              <el-tooltip v-else-if="scope.row.isFromPlan && !scope.row.isSubstitute"
                :content="'生产计划数量：' + Math.floor(selectedPlan?.quantity || 0) + ' ' + (selectedPlan?.unitName || '') + '，BOM用量：' + Math.floor(scope.row.bomQuantity || 0) + ' ' + (scope.row.unitName || scope.row.unit || '')"
                placement="top">
                <span>{{ Math.floor(scope.row.quantity || 0) }}</span>
              </el-tooltip>
              <span v-else-if="!scope.row.isSubstitute">{{ Math.floor(scope.row.quantity || 0) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" min-width="80" fixed="right" v-if="dialogType !== 'view'" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
            <template #default="scope">
              <el-button v-if="!scope.row.isSubstitute && !scope.row.isFromPlan" type="danger" size="small"
                @click="handleRemoveItem(scope.row.originalIndex)"
                v-permission="dialogType === 'add' ? 'inventory:outbound:create' : 'inventory:outbound:update'">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="add-material mt-10" v-if="dialogType !== 'view'">
          <el-button type="primary" v-permission="dialogType === 'add' ? 'inventory:outbound:create' : 'inventory:outbound:update'" @click="handleAddItem">
            <el-icon>
              <Plus />
            </el-icon>添加物料
          </el-button>
        </div>
      </el-form>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button v-if="dialogType !== 'view'" type="primary" v-permission="dialogType === 'add' ? 'inventory:outbound:create' : 'inventory:outbound:update'" @click="handleSubmit" :loading="submitting">
            保存
          </el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 查看出库单对话框 -->
    <AppDialog v-model="viewDialogVisible" title="出库单详情" mode="view" content-width="wide">
      <div v-loading="viewLoading" class="min-h-form">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="出库单号">{{ currentOutbound.outboundNo }}</el-descriptions-item>
        <el-descriptions-item label="出库日期">{{ formatDate(currentOutbound.outboundDate) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentOutbound.status)">
            {{ getStatusText(currentOutbound.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作人">{{ currentOutbound.operatorName || currentOutbound.operator
          }}</el-descriptions-item>
        <el-descriptions-item label="生产计划" v-if="currentOutbound.productionTaskCode || currentOutbound.productionPlanCode">
          {{ currentOutbound.productionTaskCode || currentOutbound.productionPlanCode }} - {{ currentOutbound.productionTaskProductName || currentOutbound.productionPlanName || '' }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="(currentOutbound.productionTaskCode || currentOutbound.productionPlanCode) ? 1 : 2">
          {{ currentOutbound.remarks || '无' }}
        </el-descriptions-item>
      </el-descriptions>

      <el-divider>出库明细</el-divider>

      <el-table :data="viewExpandedTableData" border class="w-full detail-table">
        <el-table-column label="序号" width="55">
          <template #default="scope">
            <span v-if="!scope.row.isSubstitute">{{ scope.row.originalIndex + 1 }}</span>
            <span v-else class="tree-indent">└</span>
          </template>
        </el-table-column>
        <el-table-column label="物料编码" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
              {{ scope.row.materialCode }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="物料名称" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
              {{ scope.row.materialName }}
              <el-tag v-if="scope.row.isSubstitute" type="success" size="small" class="ml-sm">替代</el-tag>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="规格" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
              {{ scope.row.specification || '无规格' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位" min-width="80" show-overflow-tooltip>
          <template #default="scope">
            <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
              {{ scope.row.unitName || scope.row.unit || '' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="数量" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
              {{ Math.floor(scope.row.quantity || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="出库库位" width="100" fixed="right">
          <template #default="scope">
            <span :class="scope.row.isSubstitute ? 'is-substitute' : ''">
              {{ scope.row.locationName || '' }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      </div>
    </AppDialog>

    <!-- 选择物料对话框 -->
    <AppDialog
      v-model="materialDialogVisible"
      title="选择物料"
      mode="form"
      wide
    >
      <div class="material-search">
        <el-input v-model="materialSearchKeyword" placeholder="搜索物料编码/名称" @keyup.enter="searchMaterialsInDialog">
          <template #append>
            <el-button @click="searchMaterialsInDialog">
              <el-icon>
                <SearchIcon />
              </el-icon>
            </el-button>
          </template>
        </el-input>
      </div>

      <el-table :data="materialList" border class="w-full" height="400px" @row-click="handleSelectMaterial"
        v-loading="loadingMaterials">
        <el-table-column prop="code" label="物料编码" width="120" />
        <el-table-column prop="name" label="物料名称" />
        <el-table-column prop="specification" label="规格" width="240" />
        <el-table-column prop="unitName" label="单位" width="80" />
        <el-table-column label="默认库位" width="120">
          <template #default="scope">
            <span>{{ scope.row.locationName || '' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="stockQuantity" label="库存数量" width="100" />
      </el-table>
        </AppDialog>

    <!-- 打印预览对话框 -->
    <AppDialog
      v-model="printDialogVisible"
      title="打印预览"
      mode="view"
      content-width="wide"
    >
      <div class="print-preview">
        <div ref="printContent" class="print-content">
          <div class="print-header">
            <h2>出库单</h2>
            <div class="print-info">
              <div>单号: {{ printData.outboundNo }}</div>
              <div>日期: {{ formatDate(printData.outboundDate) }}</div>
            </div>
          </div>

          <div class="print-warehouse">
            <span>出库仓库: {{ printData.locationName || '' }}</span>
          </div>

          <table class="print-table">
            <thead>
              <tr>
                <th>序号</th>
                <th>物料编码</th>
                <th>物料名称</th>
                <th>规格</th>
                <th>单位</th>
                <th>数量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in printExpandedTableData" :key="index"
                :class="item.isSubstitute ? 'is-substitute' : ''">
                <td>
                  <span v-if="!item.isSubstitute">{{ item.originalIndex + 1 }}</span>
                  <span v-else class="tree-indent">└</span>
                </td>
                <td>{{ item.materialCode }}</td>
                <td>
                  {{ item.materialName }}
                  <span v-if="item.isSubstitute" class="is-substitute-sm">[替代]</span>
                </td>
                <td>{{ item.specification || '-' }}</td>
                <td>{{ item.unitName || item.unit || '' }}</td>
                <td>{{ Math.floor(item.quantity || 0) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="print-footer">
            <div>
              <span>备注: {{ printData.remarks || '无' }}</span>
            </div>
            <div class="print-signatures">
              <div>
                <span>操作人: {{ printData.operatorName || printData.operator || '' }}</span>
              </div>
              <div>
                <span>签收人: ________________</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="printDialogVisible = false">取消</el-button>
          <el-button v-permission="'inventory:outbound:view'" type="primary" @click="printOutbound">确认打印</el-button>
        </span>
      </template>
        </AppDialog>

    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedOutbounds.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><SelectIcon /></el-icon>
          <span>已选中 <strong>{{ selectedOutbounds.length }}</strong> 个出库单</span>
        </div>
        <div class="batch-buttons">
          <el-button type="primary" v-permission="'inventory:outbound:view'" @click="handleBatchPrint">
            <el-icon>
              <Printer />
            </el-icon> 批量打印
          </el-button>
          <el-button @click="clearSelection">
            <el-icon>
              <Close />
            </el-icon> 清空选择
          </el-button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script>
import { ref, reactive, onMounted, computed, nextTick, h } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search as SearchIcon, Plus, Printer, Select as SelectIcon, Close } from '@element-plus/icons-vue'
import { productionApi, inventoryApi, baseDataApi, systemApi } from '@/api'
import { useAuthStore } from '@/stores/auth'
import printService from '@/services/printService'
import { getInboundOutboundStatusText, getInboundOutboundStatusColor } from '@/constants/systemConstants'
import { searchMaterials } from '@/utils/searchConfig'
import { parseListData, parsePaginatedData, parseResponseData } from '@/utils/responseParser'
import { formatDate } from '@/utils/helpers/dateUtils'
export default {
  name: 'InventoryOutbound',
  components: {
    SearchIcon,
    Plus,
    Printer,
    SelectIcon,
    Close,
  },
  setup() {
    const authStore = useAuthStore()
    const BATCH_MATERIAL_QUERY_LIMIT = 100
    const BATCH_STOCK_QUERY_LIMIT = 50
    const chunkArray = (items, size) => {
      const chunks = []
      for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
      }
      return chunks
    }

    // 列表数据
    const outboundList = ref([])
    const loading = ref(false)
    const currentPage = ref(1)
    const pageSize = ref(10)
    const total = ref(0) // 确保是数字类型
    const searchKeyword = ref('')

    const statusFilter = ref('')
    const productionGroupFilter = ref('')
    const dateRange = ref([])  // 时间范围
    const productionGroupList = ref([])
    const tableHeight = ref('500px')

    // 批量选择相关
    const outboundTableRef = ref(null)
    const selectedOutbounds = ref([])

    // 对话框控制
    const dialogVisible = ref(false)
    const dialogType = ref('add') // 'add', 'edit'
    const outboundFormRef = ref(null)
    const submitting = ref(false)

    // 查看对话框控制
    const viewDialogVisible = ref(false)
    const viewLoading = ref(false)
    const editLoading = ref(false)
    const currentOutbound = reactive({
      outboundNo: '',
      outboundDate: '',
      status: '',
      operator: '',
      operatorName: '',
      productionTaskCode: '',
      productionTaskProductName: '',
      productionPlanCode: '',
      productionPlanName: '',
      remarks: '',
      items: []
    })

    // 选择物料相关
    const materialDialogVisible = ref(false)
    const materialSearchKeyword = ref('')
    const materialList = ref([])
    const loadingMaterials = ref(false)

    // 打印相关
    const printDialogVisible = ref(false)
    const printContent = ref(null)
    const printData = ref({})

    // 下拉选项
    const productionPlanOptions = ref([])

    // 出库单统计数据
    const outboundStats = reactive({
      total: 0,
      draftCount: 0,
      confirmedCount: 0,
      partialCompletedCount: 0,
      completedCount: 0,
      reversedCount: 0,
      cancelledCount: 0
    })

    // 计算属性：当前选中的生产任务
    const selectedPlan = computed(() => {
      if (!outboundForm.productionTaskId) return null
      return productionPlanOptions.value.find(plan => plan.id === outboundForm.productionTaskId)
    })

    // 工具函数
    // formatDate 已统一引用公共实现

    const getStatusType = (status) => {
      if (status === 'reversed') return 'info'
      return getInboundOutboundStatusColor(status)
    }

    const getStatusText = (status) => {
      if (status === 'reversed') return '已冲销'
      return getInboundOutboundStatusText(status)
    }

    // 倒计时核心计算（单一职责，消除重复日期计算）
    const _calcCountdown = (outboundDate, status) => {
      if (status === 'completed') return { diffDays: null, terminal: 'completed' }
      if (status === 'reversed') return { diffDays: null, terminal: 'reversed' }
      if (status === 'cancelled') return { diffDays: null, terminal: 'cancelled' }
      if (!outboundDate) return { diffDays: null, terminal: 'unset' }

      const today = new Date()
      const outbound = new Date(outboundDate)
      today.setHours(0, 0, 0, 0)
      outbound.setHours(0, 0, 0, 0)
      return { diffDays: Math.ceil((outbound - today) / (1000 * 60 * 60 * 24)), terminal: null }
    }

    // 倒计时文本
    const getCountdownText = (outboundDate, status) => {
      const { diffDays, terminal } = _calcCountdown(outboundDate, status)
      if (terminal === 'completed') return '已完成'
      if (terminal === 'reversed') return '已冲销'
      if (terminal === 'cancelled') return '已取消'
      if (terminal === 'unset') return '未设置'
      if (diffDays < 0) return `逾${Math.abs(diffDays)}天`
      if (diffDays === 0) return '今天'
      if (diffDays === 1) return '明天'
      return `剩${diffDays}天`
    }

    // 倒计时标签颜色
    const getCountdownType = (outboundDate, status) => {
      const { diffDays, terminal } = _calcCountdown(outboundDate, status)
      if (terminal === 'completed') return 'success'
      if (terminal === 'reversed' || terminal === 'cancelled' || terminal === 'unset') return 'info'
      if (diffDays < 0) return 'danger'
      if (diffDays <= 3) return 'warning'
      return 'success'
    }

    // 加载生产任务列表
    const loadProductionPlans = async () => {
      try {
        // 只获取待处理状态的生产任务，避免重复引用
        const res = await productionApi.getProductionTasks({ status: ['pending'] })

        // 使用统一解析器
        const tasks = parseListData(res, { enableLog: false })

        productionPlanOptions.value = tasks
          .filter(task => task && task.id !== undefined && task.id !== null)
          .map(task => ({
            id: task.id,
            name: task.productName, // 使用产品名称
            code: task.code || `任务-${task.id}`, // 使用任务编号，如果没有则使用ID
            productId: task.productId,
            quantity: task.quantity || 0, // 添加生产任务数量
            unitName: task.unit || task.unitName, // 添加单位信息
            status: task.status, // 添加状态信息
            taskId: task.id // 保存任务ID用于后续引用
          }))
      } catch (error) {
        console.error('加载生产任务失败:', error)
        productionPlanOptions.value = []
        ElMessage.error('加载生产任务失败')
      }
    }

    // 表单数据（纯 camel，后端 inventoryOutboundMap.fromApi）
    const outboundForm = reactive({
      id: null,
      outboundNo: '',
      outboundDate: new Date(),
      status: 'draft',
      operator: authStore.realName || '系统用户',  // 使用真实姓名
      remarks: '',
      productionTaskId: null,
      items: []
    })

    // 表单验证规则
    const outboundRules = {
      outboundDate: [
        { required: true, message: '请选择出库日期', trigger: 'change' }
      ],
      operator: [
        { required: true, message: '请填写操作人', trigger: 'blur' }
      ]
    }

    // 搜索物料（对话框中的搜索）
    const searchMaterialsInDialog = async () => {
      loadingMaterials.value = true
      try {
        const params = {
          keyword: materialSearchKeyword.value,
          include_stock: true,  // 添加参数，确保返回库存信息
          include_location: true  // 包含物料的默认库位信息
        }

        const res = await inventoryApi.getMaterialsWithStock(params)

        // 确保每个物料都有正确的库存数量和ID，以及默认库位信息（纯 camel）
        materialList.value = res.data.map(item => {
          const materialId = item.id || item.materialId
          const stockQuantity = item.stockQuantity !== undefined
            ? parseFloat(item.stockQuantity)
            : (item.quantity !== undefined ? parseFloat(item.quantity) : 0)

          return {
            ...item,
            id: materialId,
            materialId,
            stockQuantity,
            unitName: item.unitName,
            unitId: item.unitId,
            locationId: item.locationId,
            locationName: item.locationName,
            specification: item.specification || item.specs || ''
          }
        })
      } catch (error) {
        console.error('搜索物料失败:', error)
        ElMessage.error('搜索物料失败')
      } finally {
        loadingMaterials.value = false
      }
    }

    // 选择物料
    const handleSelectMaterial = async (row) => {
      const materialId = row.id || row.materialId

      // 检查是否已添加
      const existingIndex = outboundForm.items.findIndex(item => item.materialId === materialId)
      if (existingIndex !== -1) {
        ElMessage.warning('该物料已添加')
        return
      }

      const defaultLocationId = row.locationId
      if (!defaultLocationId) {
        ElMessage.warning('该物料没有设置默认库位，无法获取库存信息')
        return
      }

      // 先使用行数据中的库存量作为默认值
      let stockQuantity = row.stockQuantity !== undefined
        ? parseFloat(row.stockQuantity)
        : (row.quantity !== undefined ? parseFloat(row.quantity) : 0)

      // 尝试从Lean API获取最新库存
      try {
        const stockRes = await inventoryApi.getMaterialStock(materialId, defaultLocationId)
        if (stockRes?.data) {
          stockQuantity = (stockRes.data.quantity !== undefined && stockRes.data.quantity !== null)
            ? parseFloat(stockRes.data.quantity)
            : (stockRes.data.stockQuantity !== undefined && stockRes.data.stockQuantity !== null)
              ? parseFloat(stockRes.data.stockQuantity)
              : stockQuantity
        }
      } catch (error) {
        console.error('获取物料库存失败，使用列表数据:', error)
      }

      // 统一推送物料（纯 camel）
      outboundForm.items.push({
        materialId,
        materialCode: row.code,
        materialName: row.name,
        specification: row.specification || row.specs || '',
        unitId: row.unitId,
        unitName: row.unitName,
        stockQuantity,
        quantity: Math.min(1, stockQuantity),
        locationId: defaultLocationId,
        locationName: row.locationName,
        isFromPlan: false
      })

      ElMessage.success(`物料添加成功${row.locationName ? '，将从 ' + row.locationName + ' 出库' : ''}`)
      materialDialogVisible.value = false
    }

    // 处理搜索
    const handleSearch = () => {
      currentPage.value = 1
      fetchOutboundList()
    }

    // 重置搜索
    const handleResetSearch = () => {
      searchKeyword.value = ''
      statusFilter.value = ''
      productionGroupFilter.value = ''
      dateRange.value = []
      currentPage.value = 1
      fetchOutboundList()
    }

    // 处理分页大小变化
    const handleSizeChange = (val) => {
      pageSize.value = val
      fetchOutboundList()
    }

    // 处理当前页变化
    const handleCurrentChange = (val) => {
      currentPage.value = val
      fetchOutboundList()
    }

    // 获取出库单列表
    const fetchOutboundList = async () => {
      loading.value = true
      try {
        const params = {
          page: currentPage.value,
          limit: pageSize.value,
          search: searchKeyword.value,
          status: statusFilter.value,
          productionGroupId: productionGroupFilter.value
        }

        // 添加时间范围参数
        if (dateRange.value && dateRange.value.length === 2) {
          params.startDate = dateRange.value[0]
          params.endDate = dateRange.value[1]
        }

        const res = await inventoryApi.getOutboundList(params)

        // 使用统一解析器处理分页数据
        const { list, total: totalCount, statistics } = parsePaginatedData(res, { enableLog: false })

        outboundList.value = list
        total.value = totalCount

        // 更新统计数据
        updateStats(statistics)
      } catch (error) {
        console.error('获取出库单列表失败:', error)
        ElMessage.error('获取出库单列表失败')
        // 确保出错时也有默认值
        outboundList.value = []
        total.value = 0
      } finally {
        loading.value = false
      }
    }

    // 处理添加
    // 在打开对话框时加载生产计划
    const handleAdd = async () => {
      await loadProductionPlans() // 加载生产计划列表
      resetForm()                 // 重置表单数据
      dialogType.value = 'add'    // 设置对话框类型为新增
      dialogVisible.value = true  // 显示对话框
    }

    // 查看和打印只展示已落表的真实出库明细
    const _normalizePersistedOutboundItems = async (items) => {
      return items
    }

    // 处理查看
    const handleView = async (row) => {
      viewDialogVisible.value = true
      viewLoading.value = true
      try {
        const res = await inventoryApi.getOutbound(row.id)

        // 后端使用 ResponseHandler.success 返回，统一由 parser 解包
        const outboundData = parseResponseData(res)

        // 设置查看数据
        Object.assign(currentOutbound, outboundData)

        // 只展示已落表的真实出库明细
        if (currentOutbound.items?.length > 0) {
          currentOutbound.items = await _normalizePersistedOutboundItems(currentOutbound.items)
        }

      } catch (error) {
        console.error('获取出库单详情失败:', error)
        ElMessage.error('获取出库单详情失败')
      } finally {
        viewLoading.value = false
      }
    }

    // 处理编辑
    const handleEdit = (row) => {
      fetchOutboundDetail(row.id, 'edit')
    }

    // 辅助函数：确保生产任务在下拉选项列表中（DRY原则抽取）
    const _ensureTaskInOptions = (outboundData, fallbackStatus = 'pending') => {
      const taskId = outboundData.productionTaskId
      const taskCode = outboundData.productionTaskCode
      if (taskId && taskCode) {
        const exists = productionPlanOptions.value.find(task => task.id === taskId)
        if (!exists) {
          productionPlanOptions.value.push({
            id: taskId,
            code: taskCode,
            name: outboundData.productionTaskProductName,
            quantity: outboundData.productionTaskQuantity ?? 0,
            unitName: '',
            status: fallbackStatus,
            taskId,
            productId: outboundData.productId
          })
        }
      }
    }

    // 处理补发（部分完成的出库单继续发货）
    const handleSupplementIssue = async (row) => {
      dialogType.value = 'supplement'
      dialogVisible.value = true
      editLoading.value = true

      try {
        // 获取出库单详情
        const res = await inventoryApi.getOutbound(row.id)

        // 后端使用 ResponseHandler.success 返回，统一由 parser 解包
        const outboundData = parseResponseData(res)

        // 检查是否有缺料记录
        if (!outboundData.items || outboundData.items.length === 0) {
          ElMessage.warning('该出库单没有物料信息')
          return
        }

        // 筛选出有缺料的物料
        const shortageItems = outboundData.items.filter(item => {
          const shortage = item.shortageQuantity
          return shortage && parseFloat(shortage) > 0
        })

        if (shortageItems.length === 0) {
          ElMessage.warning('该出库单没有缺料，无需补发')
          return
        }

        // 创建补发对话框数据（纯 camel）
        Object.assign(outboundForm, {
          id: outboundData.id,
          outboundNo: (outboundData.outboundNo || '') + '-补发',
          outboundDate: outboundData.outboundDate,
          productionTaskId: outboundData.productionTaskId,
          remarks: ((outboundData.remarks || '') + ' [补发]').trim(),
          items: shortageItems.map(item => {
            const shortage = parseFloat(item.shortageQuantity)
            return {
              id: item.id,
              materialId: item.materialId,
              materialCode: item.materialCode,
              materialName: item.materialName,
              specification: item.specification,
              quantity: shortage,
              plannedQuantity: item.plannedQuantity,
              actualQuantity: item.actualQuantity,
              shortageQuantity: shortage,
              stockQuantity: item.stockQuantity,
              unitId: item.unitId,
              unitName: item.unitName,
              locationId: item.locationId,
              locationName: item.locationName,
              isFromPlan: true,
              isSupplement: true
            }
          })
        })

        _ensureTaskInOptions(outboundData, 'material_partial_issued')

      } catch (error) {
        console.error('获取补发信息失败:', error)
        ElMessage.error('获取补发信息失败: ' + (error.response?.data?.message || error.message))
      } finally {
        editLoading.value = false
      }
    }

    // 获取出库单详情（用于编辑）
    const fetchOutboundDetail = async (id, type) => {
      dialogType.value = type
      dialogVisible.value = true
      editLoading.value = true

      try {
        const res = await inventoryApi.getOutbound(id)

        const outboundData = parseResponseData(res)

        Object.assign(outboundForm, {
          id: outboundData.id,
          outboundNo: outboundData.outboundNo ?? '',
          outboundDate: outboundData.outboundDate ?? new Date(),
          status: outboundData.status || 'draft',
          operator: outboundData.operatorName || outboundData.operator || authStore.realName || '系统用户',
          remarks: outboundData.remarks ?? '',
          productionTaskId: outboundData.productionTaskId ?? null,
          items: (outboundData.items || []).map((item) => ({
            id: item.id,
            materialId: item.materialId,
            materialCode: item.materialCode,
            materialName: item.materialName,
            specification: item.specification,
            quantity: item.quantity,
            unitId: item.unitId,
            unitName: item.unitName,
            batchNo: item.batchNo,
            locationId: item.locationId,
            locationName: item.locationName,
            stockQuantity: item.stockQuantity,
            remarks: item.remarks,
            isFromPlan: item.isFromPlan
          }))
        })

        _ensureTaskInOptions(outboundData, 'pending')

      } catch (error) {
        console.error('获取出库单详情失败:', error)
        ElMessage.error('获取出库单详情失败')
      } finally {
        editLoading.value = false
      }
    }

    // 处理删除
    const handleDelete = async (row) => {
      try {
        await inventoryApi.deleteOutbound(row.id)
        ElMessage.success('删除成功')
        fetchOutboundList()
      } catch (error) {
        console.error('删除出库单失败:', error)
        ElMessage.error('删除出库单失败')
      }
    }

    // 处理更新状态
    const handleUpdateStatus = async (row, newStatus) => {
      const statusText = {
        'confirmed': '确认',
        'completed': '完成',
        'cancelled': '取消'
      }

      // [M-8] 完成出库时前端预检库存充足性
      if (newStatus === 'completed') {
        try {
          const detailRes = await inventoryApi.getOutbound(row.id)
          const detail = parseResponseData(detailRes, {})
          const items = detail.items || []
          const insufficientList = []

          for (const item of items) {
            const stockQty = parseFloat(item.stockQuantity || 0)
            const outQty = parseFloat(item.quantity || 0)
            if (outQty > stockQty) {
              insufficientList.push(
                `${item.materialCode || '?'} (${item.materialName || '未知'}): 需出库 ${outQty}, 库存 ${stockQty}`
              )
            }
          }

          if (insufficientList.length > 0) {
            await ElMessageBox.confirm(
              `以下物料库存不足：\n${insufficientList.join('\n')}\n\n后端将尝试FIFO分批出库，是否继续？`,
              '库存预检警告',
              { confirmButtonText: '继续完成', cancelButtonText: '取消', type: 'warning' }
            )
          }
        } catch (checkError) {
          if (checkError === 'cancel') return
          // 预检失败不阻止流程，继续走后端校验
        }
      }

      ElMessageBox.confirm(`确定要${statusText[newStatus]}此出库单吗?`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        try {
          await inventoryApi.updateOutboundStatus(row.id, newStatus)
          ElMessage.success(`${statusText[newStatus]}成功`)
          fetchOutboundList()
        } catch (error) {
          console.error('更新出库单状态失败:', error)
          // 提取后端返回的详细错误信息
          const errorMsg = error.response?.data?.message || error.response?.data?.error || '更新出库单状态失败'
          ElMessage.error(errorMsg)
        }
      }).catch(() => { })
    }

    // 撤销重发 - 冲回库存并按最新BOM生成新的草稿出库单
    const executeCancelOutbound = async (row, force = false) => {
      try {
        const res = await inventoryApi.cancelOutbound(row.id, { force })
        const data = parseResponseData(res, {})
        const reissueNo = data.reissueOutbound?.outboundNo
        const financeErrors = data.financeReversal?.errors || []

        ElMessage.success(reissueNo ? `撤销重发成功，新出库单：${reissueNo}` : '撤销成功，库存已冲回')
        if (financeErrors.length > 0) {
          ElMessage.warning('库存已冲回，但财务凭证冲销失败，请到总账凭证人工复核')
        }
        fetchOutboundList()
      } catch (error) {
        console.error('撤销失败:', error)
        const errorData = error.response?.data

        // 处理需要确认的情况（生产中状态）
        if (errorData?.code === 'NEED_CONFIRM' && errorData?.data?.needConfirm) {
          ElMessageBox.confirm(
            `${errorData.message}\n\n确定要强制撤销重发吗？这可能会导致生产进度与库存数据需要人工复核。`,
            '需要确认',
            {
              confirmButtonText: '强制撤销重发',
              cancelButtonText: '取消',
              type: 'error'
            }
          ).then(() => {
            executeCancelOutbound(row, true)
          }).catch(() => { })
        } else {
          ElMessage.error(errorData?.message || '撤销失败')
        }
      }
    }

    const handleCancelOutbound = async (row, force = false) => {
      const confirmMsg = force
        ? `强制撤销重发警告：出库单 ${row.outboundNo} 关联的生产任务正在进行中，部分物料可能已被消耗。确定要强制撤销重发吗？`
        : `确定要撤销重发出库单 ${row.outboundNo} 吗？系统会冲回原库存流水，将原单标记为已冲销，并按最新BOM生成新的草稿出库单。`

      ElMessageBox.confirm(
        confirmMsg,
        force ? '强制撤销重发确认' : '撤销重发确认',
        {
          confirmButtonText: force ? '强制撤销重发' : '确定撤销重发',
          cancelButtonText: '取消',
          type: force ? 'error' : 'warning',
          dangerouslyUseHTMLString: false
        }
      ).then(() => executeCancelOutbound(row, force)).catch(() => { })
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

    // 处理添加物料 - 直接插入新行
    const handleAddItem = () => {
      if (outboundForm.productionTaskId) {
        ElMessage.warning('已选择生产任务，无法手动添加物料')
        return
      }

      outboundForm.items.push({
        materialId: '',
        materialCode: '',
        materialName: '',
        specification: '',
        quantity: '',
        unitName: '',
        unitId: '',
        locationName: '',
        locationId: '',
        stockQuantity: 0,
        isFromPlan: false
      })

      // 聚焦到新添加行的物料输入框
      nextTick(() => {
        const newIndex = outboundForm.items.length - 1
        const materialInput = materialSelectRefs.value[newIndex]
        if (materialInput) {
          materialInput.focus()
        }
      })
    }

    // 获取物料建议列表
    const fetchMaterialSuggestions = async (queryString, callback) => {
      if (!queryString || queryString.trim().length === 0) {
        callback([])
        return
      }

      try {
        const searchResults = await searchMaterials(baseDataApi, queryString.trim(), {
          includeAll: true
        })

        // 确保 searchResults 是数组
        if (!searchResults || !Array.isArray(searchResults)) {
          callback([])
          return
        }

        const suggestions = searchResults.map(item => ({
          value: item.code || '无编码',
          id: item.id,
          code: item.code || '无编码',
          name: item.name || '未命名',
          specs: item.specification || item.specs || '',
          unitName: item.unitName || '个',
          unitId: item.unitId,
          locationName: item.locationName || '',
          locationId: item.locationId,
          stockQuantity: item.stockQuantity ?? item.stockQuantity ?? 0
        }))

        callback(suggestions)
      } catch {
        ElMessage.error('搜索物料失败')
        callback([])
      }
    }

    // 处理物料选择
    const handleMaterialSelectAutocomplete = async (item, index) => {
      const materialId = Number(item.id)
      if (!materialId || isNaN(materialId)) {
        ElMessage.error('物料ID无效，请重新选择')
        return
      }

      // 检查是否已经添加过该物料
      const existingIndex = outboundForm.items.findIndex((existingItem, idx) =>
        idx !== index && existingItem.materialId === materialId
      )

      if (existingIndex !== -1) {
        ElMessage.warning('该物料已添加，请勿重复添加')
        // 清除当前行
        handleMaterialClear(index)
        return
      }

      try {
        // 获取库存信息
        const stockRes = await inventoryApi.getStock({
          materialId: materialId,
          locationId: item.locationId
        })

        const stockData = parseResponseData(stockRes, {})
        const stockQuantity = stockData.quantity !== undefined && stockData.quantity !== null
          ? parseFloat(stockData.quantity)
          : (stockData.stockQuantity !== undefined && stockData.stockQuantity !== null)
            ? parseFloat(stockData.stockQuantity)
            : 0

        // 更新物料信息（纯 camel）
        outboundForm.items[index].materialId = materialId
        outboundForm.items[index].materialCode = item.code
        outboundForm.items[index].materialName = item.name
        outboundForm.items[index].specification = item.specs
        outboundForm.items[index].unitName = item.unitName
        outboundForm.items[index].unitId = item.unitId
        outboundForm.items[index].locationName = item.locationName
        outboundForm.items[index].locationId = item.locationId
        outboundForm.items[index].stockQuantity = stockQuantity

        // 选择物料后，自动聚焦到数量输入框
        nextTick(() => {
          const quantityInput = quantityInputRefs.value[index]
          if (quantityInput) {
            quantityInput.focus()
          }
        })
      } catch (error) {
        console.error('获取库存信息失败:', error)
        ElMessage.error('获取库存信息失败')
      }
    }

    // 处理物料输入框回车
    const handleMaterialEnter = (index) => {
      if (outboundForm.items[index].materialId) {
        const quantityInput = quantityInputRefs.value[index]
        if (quantityInput) {
          quantityInput.focus()
        }
      }
    }

    // 处理物料清除
    const handleMaterialClear = (index) => {
      outboundForm.items[index].materialId = ''
      outboundForm.items[index].materialCode = ''
      outboundForm.items[index].materialName = ''
      outboundForm.items[index].specification = ''
      outboundForm.items[index].unitName = ''
      outboundForm.items[index].unitId = ''
      outboundForm.items[index].locationName = ''
      outboundForm.items[index].locationId = ''
      outboundForm.items[index].stockQuantity = 0
    }

    // 处理数量输入框回车
    const handleQuantityEnter = (index) => {
      // 如果是最后一行，添加新行
      if (index === outboundForm.items.filter(item => !item.isFromPlan).length - 1) {
        handleAddItem()
      } else {
        // 否则跳转到下一行的物料输入框
        const nextMaterialInput = materialSelectRefs.value[index + 1]
        if (nextMaterialInput) {
          nextMaterialInput.focus()
        }
      }
    }

    // 验证出库数量输入
    const validateOutboundQuantity = (row) => {
      // 确保数量是有效数字
      const quantity = Number(row.quantity)
      if (isNaN(quantity) || quantity < 0) {
        row.quantity = 0
        return
      }

      // 保留两位小数
      row.quantity = Number(quantity.toFixed(2))

      // 补发模式下跳过库存检查
      if (dialogType.value === 'supplement') {
        // 补发模式下只检查不能超过缺料数量
        const maxQuantity = row.shortageQuantity ?? 9999
        if (row.quantity > maxQuantity) {
          row.quantity = maxQuantity
          ElMessage.warning(`补发数量不能超过缺料数量 ${maxQuantity}`)
        }
      } else {
        // 非补发模式下检查是否超过库存
        const maxQuantity = row.stockQuantity ?? 9999
        if (row.quantity > maxQuantity) {
          row.quantity = maxQuantity
          ElMessage.warning(`出库数量不能超过库存数量 ${maxQuantity}`)
        }
      }
    }

    // 验证物料数据
    const validateItems = () => {
      if (outboundForm.items.length === 0) {
        ElMessage.warning('请添加至少一个物料')
        return false
      }

      for (const item of outboundForm.items) {
        const materialName = item.materialName || item.materialCode || '物料'
        if (!item.quantity || item.quantity <= 0) {
          ElMessage.warning(`${materialName} 的出库数量必须大于0`)
          return false
        }

        if (!item.locationId) {
          ElMessage.warning(`${materialName} 未配置默认库位，请先维护物料库位`)
          return false
        }

        // 补发模式下跳过库存检查,因为后端支持预扣库存冲正
        if (dialogType.value === 'supplement') {
          const shortage = item.shortageQuantity
          // 补发模式下只检查补发数量不能超过缺料数量
          if (shortage && item.quantity > parseFloat(shortage)) {
            ElMessage.warning(`${materialName} 的补发数量不能超过缺料数量(${shortage})`)
            return false
          }
          continue
        }

        // 移除库存数量限制，允许出库数量大于库存数量
        // 这样可以支持预出库、负库存等业务场景
      }
      return true
    }

    // 移除物料项
    const handleRemoveItem = (index) => {
      outboundForm.items.splice(index, 1)
    }

    // 重置表单
    const resetForm = () => {
      // 重置表单数据为初始状态
      Object.assign(outboundForm, {
        id: null,
        outboundNo: '',
        outboundDate: new Date(),
        status: 'draft',
        operator: authStore.realName || '系统用户',
        remarks: '',
        productionTaskId: null,
        items: []
      })

      // 如果表单引用存在，重置表单的验证状态
      if (outboundFormRef.value) {
        outboundFormRef.value.resetFields()
      }
    }

    // 提交表单
    const handleSubmit = async (retryData = null) => {
      if (!outboundFormRef.value && !retryData) return

      try {
        // 如果不是重试，则进行验证
        if (!retryData) {
          // 表单验证
          await outboundFormRef.value.validate()

          // 物料验证
          if (!validateItems()) return
        }

        submitting.value = true

        // 格式化表单数据（纯 camel）
        const dataToSubmit = retryData || {
          id: outboundForm.id,
          outboundNo: outboundForm.outboundNo,
          outboundDate: formatDate(outboundForm.outboundDate),
          status: outboundForm.status,
          operator: outboundForm.operator,
          remarks: outboundForm.remarks,
          productionTaskId: outboundForm.productionTaskId,
          items: (outboundForm.items || []).map((item) => ({
            id: item.id,
            materialId: item.materialId,
            quantity: item.quantity,
            unitId: item.unitId,
            batchNo: item.batchNo,
            locationId: item.locationId,
            remarks: item.remarks
          }))
        }

        // 提交数据
        if (dialogType.value === 'add') {
          // 根据是否关联生产任务自动标记出库类型
          dataToSubmit.outboundType = dataToSubmit.productionTaskId ? 'bom_issue' : 'manual'
          await inventoryApi.createOutbound(dataToSubmit)
          ElMessage.success('创建出库单成功')
        } else if (dialogType.value === 'supplement') {
          // 补发模式：调用补发API
          const supplementData = {
            outboundId: dataToSubmit.id,
            outboundDate: dataToSubmit.outboundDate,
            remarks: dataToSubmit.remarks,
            items: dataToSubmit.items.map(item => ({
              materialId: item.materialId,
              quantity: item.quantity,
              outboundItemId: item.id // 原出库单明细ID
            }))
          }
          await inventoryApi.supplementOutbound(dataToSubmit.id, supplementData)
          ElMessage.success('补发成功')
        } else {
          await inventoryApi.updateOutbound(dataToSubmit)
          ElMessage.success('更新出库单成功')
        }

        dialogVisible.value = false
        fetchOutboundList()
        submitting.value = false
      } catch (error) {
        if (error.name === 'ValidationError') {
          return
        }

        console.error('保存出库单失败:', error)
        const errorData = error.response?.data

        // 处理超额领料警告（后端字段为 errorCode，兼容历史 code）
        const errCode = errorData?.errorCode || errorData?.code
        if (errCode === 'EXCESS_ISSUE' && errorData?.details) {
          const excessMessage = h('div', [
            h('div', { style: { fontWeight: 'bold', marginBottom: '10px' } }, '检测到以下超额领料项，是否确认继续？'),
            ...errorData.details.map(d =>
              h('div', { style: { color: 'var(--color-danger)', marginBottom: '4px' } }, `• ${d.message || '超额领料'}`)
            ),
            h('div', { style: { marginTop: '15px', color: 'var(--color-text-regular)' } }, '确认后请填写补发/超额原因。')
          ]);

          ElMessageBox.confirm(
            excessMessage,
            '超额领料警告',
            {
              confirmButtonText: '确认并填写原因',
              cancelButtonText: '取消',
              type: 'warning',
              dangerouslyUseHTMLString: false,
              closeOnClickModal: false
            }
          ).then(() => {
            ElMessageBox.prompt('请输入补发/超额原因', '填写原因', {
              confirmButtonText: '提交',
              cancelButtonText: '取消',
              inputPattern: /\S+/,
              inputErrorMessage: '原因不能为空'
            }).then(({ value }) => {
              handleSubmit({
                ...(retryData || {
                  id: outboundForm.id,
                  outboundNo: outboundForm.outboundNo,
                  outboundDate: formatDate(outboundForm.outboundDate),
                  status: outboundForm.status,
                  operator: outboundForm.operator,
                  remarks: outboundForm.remarks,
                  productionTaskId: outboundForm.productionTaskId,
                  items: (outboundForm.items || []).map((item) => ({
                    id: item.id,
                    materialId: item.materialId,
                    quantity: item.quantity,
                    unitId: item.unitId,
                    batchNo: item.batchNo,
                    locationId: item.locationId,
                    remarks: item.remarks
                  }))
                }),
                outboundDate: formatDate(outboundForm.outboundDate),
                allowExcess: true,
                issueReason: value
              });
            }).catch(() => {
              submitting.value = false;
            });
          }).catch(() => {
            submitting.value = false;
          });
          // 等待用户交互，不重置 submitting
          return;
        }

        // 其他错误情况
        if (errorData?.code === 'MISSING_ISSUE_REASON') {
          ElMessage.error(errorData.message);
        } else {
          ElMessage.error('保存出库单失败: ' + (errorData?.message || error.message))
        }
        submitting.value = false
      }
    }

    // 更新统计数据
    const updateStats = (statistics = null) => {
      if (statistics) {
        outboundStats.total = statistics.total || 0
        outboundStats.draftCount = statistics.draftCount || 0
        outboundStats.confirmedCount = statistics.confirmedCount || 0
        outboundStats.partialCompletedCount = statistics.partialCompletedCount || 0
        outboundStats.completedCount = statistics.completedCount || 0
        outboundStats.reversedCount = statistics.reversedCount || 0
        outboundStats.cancelledCount = statistics.cancelledCount || 0
        return
      }
      const list = Array.isArray(outboundList.value) ? outboundList.value : []
      outboundStats.total = total.value || 0
      outboundStats.draftCount = list.filter(item => item.status === 'draft').length
      outboundStats.confirmedCount = list.filter(item => item.status === 'confirmed').length
      outboundStats.partialCompletedCount = list.filter(item => item.status === 'partial_completed').length
      outboundStats.completedCount = list.filter(item => item.status === 'completed').length
      outboundStats.reversedCount = list.filter(item => item.status === 'reversed').length
      outboundStats.cancelledCount = list.filter(item => item.status === 'cancelled').length
    }

    // 加载生产组列表
    const loadProductionGroups = async () => {
      try {
        const res = await systemApi.getDepartments({ status: 1 })

        // 使用统一解析器
        const groups = parseListData(res, { enableLog: false })

        // 过滤掉 id 为 undefined 或 null 的项
        productionGroupList.value = groups.filter(g => g && (g.id !== undefined && g.id !== null))
      } catch (error) {
        console.error('加载生产组列表失败:', error)
        productionGroupList.value = []
        // 不显示错误消息，因为这不是关键功能
      }
    }

    // 在页面加载时初始化数据
    onMounted(async () => {
      try {
        await Promise.all([
          fetchOutboundList(),  // 获取出库单列表
          loadProductionPlans(), // 获取生产计划列表
          loadProductionGroups() // 获取生产组列表
        ])
      } catch (error) {
        console.error('初始化数据失败:', error)
        ElMessage.error('初始化数据失败')
      }
    })

    // 处理打印
    const handlePrint = async (row) => {
      try {
        const res = await inventoryApi.getOutbound(row.id)

        // 后端使用 ResponseHandler.success 返回，统一由 parser 解包
        printData.value = parseResponseData(res)

        // 只展示已落表的真实出库明细
        if (printData.value.items?.length > 0) {
          printData.value.items = await _normalizePersistedOutboundItems(printData.value.items)
        }

        printDialogVisible.value = true
      } catch (error) {
        console.error('获取出库单详情失败:', error)
        ElMessage.error('获取出库单详情失败')
      }
    }

    // 业务侧只传 camel；printService.normalizePrintData 会展开 snake 模板占位
    const buildProductionOutboundPrintData = (outbound) => ({
      outboundNo: outbound.outboundNo || '',
      outboundDate: formatDate(outbound.outboundDate),
      outboundTypeText: '生产出库',
      operator: outbound.operatorName || outbound.operator || '',
      productionPlanCode: outbound.productionTaskCode || outbound.productionPlanCode || '',
      status: outbound.status === 'completed' ? '已完成' : (outbound.status || ''),
      remarks: outbound.remarks || '无',
      remark: outbound.remarks || '无',
      printTime: new Date().toLocaleString(),
      items: (outbound.items || []).map((item, index) => ({
        index: index + 1,
        materialCode: item.materialCode || '',
        materialName: item.materialName || '',
        specification: item.specification || '',
        unitName: item.unitName || item.unit || '',
        plannedQuantity: parseFloat(item.plannedQuantity ?? item.quantity ?? 0).toFixed(2),
        actualQuantity: parseFloat(item.actualQuantity ?? item.quantity ?? 0).toFixed(2),
        shortageQuantity: parseFloat(item.shortageQuantity ?? 0).toFixed(2),
        quantity: parseFloat(item.actualQuantity ?? item.quantity ?? 0).toFixed(2),
        locationName: item.locationName || ''
      }))
    })

    // 打印出库单
    const printOutbound = async () => {
      try {
        const htmlContent = await printService.generateByDefaultTemplate(
          'inventory',
          'production_outbound',
          buildProductionOutboundPrintData(printData.value)
        )
        printService.previewDocument(htmlContent)
      } catch (error) {
        console.error('打印生产出库单失败:', error)
        ElMessage.error(error.message || '打印生产出库单失败')
      }
    }

    // 辅助函数：获取BOM数据
    const fetchBomData = async (productId) => {
      try {
        const bomRes = await baseDataApi.getBoms({
          params: {
            productId,
            page: 1,
            pageSize: 10
          }
        })

        const [bomData] = parseListData(bomRes)

        if (!bomData?.id) {
          throw new Error('未找到对应的BOM信息')
        }

        return bomData
      } catch (error) {
        throw error
      }
    }

    // 辅助函数：获取BOM明细
    const fetchBomDetails = async (bomData, productId, quantity) => {
      try {
        const materialsRes = await productionApi.calculateMaterials({
          productId,
          bomId: bomData.id,
          quantity
        })

        if (Array.isArray(materialsRes.data) && materialsRes.data.length > 0) {
          return materialsRes.data
        }

        throw new Error('统一净需求结果为空')
      } catch {
        throw new Error('计算物料净需求失败')
      }
    }

    // 处理生产任务变化
    const handleProductionPlanChange = async (taskId) => {
      if (!taskId) {
        outboundForm.items = []
        outboundForm.productionTaskId = null
        return
      }

      // 设置生产任务ID
      outboundForm.productionTaskId = taskId

      try {
        // 获取选中的生产任务
        const selectedTask = productionPlanOptions.value?.find(task => task?.id === taskId)
        if (!selectedTask) {
          ElMessage.warning('未找到选中的生产任务，请刷新页面重试')
          outboundForm.items = []
          return
        }

        if (!selectedTask.quantity || selectedTask.quantity <= 0) {
          ElMessage.warning('生产任务数量异常，请检查生产任务')
          outboundForm.items = []
          return
        }

        // 获取BOM信息和明细
        let bomData, details
        try {
          bomData = await fetchBomData(selectedTask.productId)
          details = await fetchBomDetails(bomData, selectedTask.productId, selectedTask.quantity)
        } catch (error) {
          ElMessage({
            message: error.message || '获取BOM信息失败',
            type: 'warning',
            duration: 5000
          })
          outboundForm.items = []
          return
        }

        // 获取库存信息 - 使用批量查询优化性能
        const materialIds = [...new Set(details.map(detail => detail.materialId).filter(id => id))]

        if (materialIds.length === 0) {
          ElMessage.warning('BOM中没有有效的物料信息')
          outboundForm.items = []
          return
        }

        // 初始化映射
        const materialInfoMap = new Map()
        const stockMap = new Map()

        try {
          // 批量获取物料信息
          const materialsInfo = []
          for (const chunk of chunkArray(materialIds, BATCH_MATERIAL_QUERY_LIMIT)) {
            const materialInfoRes = await baseDataApi.getMaterialsByIds(chunk)
            materialsInfo.push(...parseListData(materialInfoRes))
          }
          if (!materialsInfo.length) {
            throw new Error('获取物料信息失败')
          }

          // 构建批量库存查询参数
          const stockQueries = materialsInfo
            .filter(material => material.locationId)
            .map(material => ({
              materialId: material.id,
              locationId: material.locationId
            }))

          // 批量获取库存信息
          const stockResults = []
          if (stockQueries.length > 0) {
            for (const chunk of chunkArray(stockQueries, BATCH_STOCK_QUERY_LIMIT)) {
              const stockRes = await inventoryApi.getBatchMaterialStock(chunk)
              stockResults.push(...(stockRes?.data || []))
            }
          }

          // 构建物料ID到信息的映射（纯 camel）
          materialsInfo.forEach(material => {
            materialInfoMap.set(material.id, {
              materialCode: material.code,
              materialName: material.name,
              specification: material.specs || material.specification || '',
              unitId: material.unitId,
              unitName: material.unitName,
              locationId: material.locationId,
              locationName: material.locationName
            })
          })

          // 构建物料ID到库存的映射
          stockResults.forEach(stock => {
            const mid = stock.materialId ?? stock.materialId
            const lid = stock.locationId ?? stock.locationId
            const key = `${mid}_${lid}`
            stockMap.set(key, {
              quantity: parseFloat(stock.quantity || 0),
              stockQuantity: parseFloat(stock.stockQuantity ?? stock.stock_quantity ?? stock.quantity ?? 0)
            })
          })

        } catch (error) {
          console.error('批量获取物料信息和库存失败:', error)
          ElMessage.error('获取物料信息失败，请重试')
          outboundForm.items = []
          return
        }

        // 更新出库单明细（纯 camel）
        outboundForm.items = details.map(detail => {
          const materialId = detail.materialId
          const materialInfo = materialInfoMap.get(materialId) || {}

          // BOM 用量：优先净需求 API 的 unitQuantity / bomQuantity
          const bomQuantity = detail.unitQuantity ?? detail.bomQuantity ?? detail.quantity ?? 0

          // 生产出库以统一净需求为准
          const requiredQuantity = detail.requiredQuantity ?? (selectedTask.quantity * bomQuantity)
          const issueQuantity = detail.issueQuantity ?? detail.actualQuantity ?? requiredQuantity
          const shortageQuantity = detail.shortageQuantity ?? Math.max(0, requiredQuantity - issueQuantity)
          const grossRequiredQuantity = detail.grossRequiredQuantity ?? requiredQuantity

          const stockKey = materialInfo.locationId ? `${materialId}_${materialInfo.locationId}` : null
          const stockInfo = stockKey
            ? (stockMap.get(stockKey) || { quantity: 0, stockQuantity: 0 })
            : { quantity: 0, stockQuantity: 0 }

          return {
            materialId,
            materialCode: materialInfo.materialCode || detail.materialCode || detail.code,
            materialName: materialInfo.materialName || detail.materialName || detail.name,
            specification: materialInfo.specification || detail.specification || '',
            unitId: materialInfo.unitId || detail.unitId,
            unitName: materialInfo.unitName || detail.unitName || detail.unit,
            stockQuantity: stockInfo.stockQuantity,
            quantity: requiredQuantity,
            plannedQuantity: requiredQuantity,
            actualQuantity: issueQuantity,
            shortageQuantity,
            grossRequiredQuantity,
            bomQuantity,
            locationId: materialInfo.locationId,
            locationName: materialInfo.locationName,
            isFromPlan: true
          }
        })

        const shortageItems = outboundForm.items.filter(item => Number(item.shortageQuantity || 0) > 0)
        if (shortageItems.length > 0) {
          const warningMessages = shortageItems.map(item =>
            `${item.materialCode} - ${item.materialName}: 计划 ${item.plannedQuantity}，可发 ${item.actualQuantity}，缺料 ${item.shortageQuantity}`
          )

          ElMessage({
            message: `以下物料存在缺料:\n${warningMessages.join('\n')}`,
            type: 'warning',
            duration: 8000,
            showClose: true
          })
        }

      } catch (error) {
        console.error('获取生产计划相关信息失败:', error)
        ElMessage.error(error.message || '获取生产计划相关信息失败')
        outboundForm.items = []
      }
    }

    // 工具函数：构建真实出库明细表格数据
    const _buildExpandedItems = (items) => {
      if (!items) return []
      return items.map((item, index) => ({ ...item, originalIndex: index, isSubstitute: false }))
    }

    // 计算属性：编辑对话框的展开表格数据
    const expandedTableData = computed(() =>
      _buildExpandedItems(outboundForm.items)
    )

    // 计算属性：查看对话框的展开表格数据
    const viewExpandedTableData = computed(() =>
      _buildExpandedItems(currentOutbound.items)
    )

    // 计算属性：打印预览的展开表格数据
    const printExpandedTableData = computed(() =>
      _buildExpandedItems(printData.value?.items)
    )

    // 计算属性：是否有需要替代的物料
    const hasSubstitutionItems = computed(() => {
      return false
    })

    // 计算属性：需要替代的物料列表
    const substitutionItems = computed(() => {
      return []
    })

    // ========== 批量选择相关 ==========
    const handleSelectionChange = (selection) => {
      selectedOutbounds.value = selection
    }

    // 清空选择
    const clearSelection = () => {
      if (outboundTableRef.value) {
        outboundTableRef.value.clearSelection()
      }
      selectedOutbounds.value = []
    }

    // 批量打印
    const handleBatchPrint = async () => {
      if (selectedOutbounds.value.length === 0) {
        ElMessage.warning('请先选择要打印的出库单')
        return
      }

      try {
        ElMessage.info('正在准备打印...')

        // 收集所有出库单的详情
        const outboundDetails = []
        for (const outbound of selectedOutbounds.value) {
          const res = await inventoryApi.getOutbound(outbound.id)
          outboundDetails.push(res.data)
        }

        // 合并物料
        const materialMap = new Map()
        const outboundNos = []

        for (const detail of outboundDetails) {
          outboundNos.push(detail.outboundNo)

          if (detail.items && detail.items.length > 0) {
            for (const item of detail.items) {
              const key = `${item.materialCode}_${item.materialName}_${item.specification}_${item.unitName}`

              if (materialMap.has(key)) {
                // 物料已存在，累加数量
                const existing = materialMap.get(key)
                existing.quantity = parseFloat(existing.quantity) + parseFloat(item.quantity || 0)
              } else {
                // 新物料（纯 camel，供 buildProductionOutboundPrintData 读取）
                materialMap.set(key, {
                  materialCode: item.materialCode,
                  materialName: item.materialName,
                  specification: item.specification,
                  unitName: item.unitName,
                  quantity: parseFloat(item.quantity || 0)
                })
              }
            }
          }
        }

        // 转换为数组
        const mergedItems = Array.from(materialMap.values())

        // 创建合并后的出库单数据（纯 camel）
        const mergedOutbound = {
          outboundNo: outboundNos.join(', '),
          outboundDate: outboundDetails[0].outboundDate,
          operatorName: outboundDetails[0].operatorName || outboundDetails[0].operator,
          remarks: `批量打印 (${selectedOutbounds.value.length}个出库单)`,
          items: mergedItems
        }

        const htmlContent = await printService.generateByDefaultTemplate(
          'inventory',
          'production_outbound',
          buildProductionOutboundPrintData(mergedOutbound)
        )

        // 打开打印窗口
        printService.previewDocument(htmlContent)

        ElMessage.success('打印准备完成')
      } catch (error) {
        console.error('批量打印失败:', error)
        ElMessage.error('批量打印失败')
      }
    }

    return {
      // 图标组件
      SearchIcon,
      Plus,
      Printer,
      SelectIcon,
      Close,
      // 数据
      outboundList,
      loading,
      currentPage,
      pageSize,
      total,
      searchKeyword,
      statusFilter,
      productionGroupFilter,
      dateRange,
      productionGroupList,
      dialogVisible,
      dialogType,
      outboundFormRef,
      outboundForm,
      outboundRules,
      submitting,
      viewDialogVisible,
      viewLoading,
      editLoading,
      currentOutbound,
      productionPlanOptions,
      selectedPlan,
      materialDialogVisible,
      materialSearchKeyword,
      materialList,
      loadingMaterials,
      printDialogVisible,
      printContent,
      printData,
      handleSearch,
      handleResetSearch,
      handleSizeChange,
      handleCurrentChange,
      handleAdd,
      handleView,
      handleEdit,
      handleDelete,
      handleUpdateStatus,
      handleCancelOutbound,
      handleAddItem,
      handleRemoveItem,
      handleSubmit,
      handleSupplementIssue,
      handlePrint,
      printOutbound,
      searchMaterialsInDialog,
      handleSelectMaterial,
      formatDate,
      getStatusType,
      getStatusText,
      getCountdownText,
      getCountdownType,
      tableHeight,
      handleProductionPlanChange,
      outboundStats,
      // 新增的自动完成相关函数
      setMaterialSelectRef,
      setQuantityInputRef,
      fetchMaterialSuggestions,
      handleMaterialSelectAutocomplete,
      handleMaterialEnter,
      handleMaterialClear,
      handleQuantityEnter,
      validateOutboundQuantity,
      updateStats,
      hasSubstitutionItems,
      substitutionItems,
      expandedTableData,
      viewExpandedTableData,
      printExpandedTableData,
      // 批量选择相关
      outboundTableRef,
      selectedOutbounds,
      handleSelectionChange,
      clearSelection,
      handleBatchPrint
    }
  }
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
  gap: 10px;
}

.material-search {
  margin-bottom: 15px;
}

.print-preview {
  padding: 20px;
}

.print-content {
  max-height: 400px;
  overflow-y: auto;
}

.print-header {
  margin-bottom: var(--spacing-lg);
  text-align: center;
}

.print-info {
  display: flex;
  justify-content: space-between;
}

.print-warehouse {
  margin-bottom: var(--spacing-lg);
  text-align: center;
}

.print-table {
  width: 100%;
  border-collapse: collapse;
}

.print-table th,
.print-table td {
  padding: 8px;
  text-align: left;
}

.print-footer {
  margin-top: var(--spacing-lg);
  text-align: right;
}

.print-signatures {
  display: flex;
  justify-content: space-between;
}

.form-tip {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 4px;
  line-height: 1.2;
}

/* 详情对话框中的长文本处理 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 详情表格文本溢出处理 */
.detail-table :deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 隐藏数字输入框的上下箭头 */
:deep(.el-input__inner[type="text"]) {
  -moz-appearance: textfield;
  appearance: textfield;
}

:deep(.el-input__inner[type="text"]::-webkit-outer-spin-button),
:deep(.el-input__inner[type="text"]::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}

/* 操作列样式 - 与采购申请页面保持一致 */
.el-table .el-button+.el-button {
  margin-left: 8px;
}
</style>
