<!--
/**
 * InventoryOutbound.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="inventory-outbound-container">
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>出库管理</h2>
          <p class="subtitle">管理出库单据与记录</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="handleAdd">新建出库单</el-button>
      </div>
    </el-card>

    <!-- 搜索区域 -->
    <el-card class="search-card">
      <el-form :inline="true" class="search-form">
        <el-form-item label="搜索">
          <el-input v-model="searchKeyword" placeholder="搜索" clearable @keyup.enter="handleSearch"
 />
        </el-form-item>

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
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker v-model="dateRange" type="daterange" range-separator="至" start-placeholder="开始日期"
            end-placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch" :loading="loading">
            <el-icon v-if="!loading">
              <Search />
            </el-icon> 查询
          </el-button>
          <el-button @click="handleResetSearch" :loading="loading">
            <el-icon v-if="!loading">
              <Refresh />
            </el-icon> 重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

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
        <div class="stat-value">{{ outboundStats.cancelledCount || 0 }}</div>
        <div class="stat-label">已取消</div>
      </el-card>
    </div>

    <!-- 数据表格 -->
    <el-card class="data-card">
      <el-table ref="outboundTableRef" :data="outboundList" border style="width: 100%" v-loading="loading"
        @selection-change="handleSelectionChange">
        <template #empty>
          <el-empty description="暂无出库单数据" />
        </template>
        <el-table-column type="selection" width="55" fixed="left"></el-table-column>
        <el-table-column prop="outbound_no" label="出库单号" min-width="150" show-overflow-tooltip></el-table-column>
        <el-table-column prop="product_code" label="物料编码" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.product_code || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="product_specs" label="型号规格" min-width="130" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.product_specs || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="outbound_date" label="出库日期" min-width="110" show-overflow-tooltip>
          <template #default="scope">
            {{ formatDate(scope.row.outbound_date) }}
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
              确定性判断（基于数据库 outbound_type 字段，零推断）：
              bom_issue / batch_issue → 显示生产套数
              其他类型 → 显示物料数量 + 单位
            -->
            <span v-if="(scope.row.outbound_type === 'bom_issue' || scope.row.outbound_type === 'batch_issue') && scope.row.product_quantity">
              {{ Math.floor(scope.row.product_quantity) }} 套
            </span>
            <span v-else>
              {{ Math.floor(scope.row.total_quantity || 0) }}{{ scope.row.item_unit_name ? ' ' + scope.row.item_unit_name : '' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="生产组" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.production_group_names || '-' }}
          </template>
        </el-table-column>
        <el-table-column label="操作人" min-width="90" show-overflow-tooltip>
          <template #default="scope">
            {{ scope.row.operator_name || scope.row.operator }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            {{ formatDate(scope.row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="倒计时" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            <el-tag :type="getCountdownType(scope.row.outbound_date, scope.row.status)" size="small">
              {{ getCountdownText(scope.row.outbound_date, scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip></el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="scope">
            <el-button size="small" @click="handleView(scope.row)">
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
              @click="handleUpdateStatus(scope.row, 'confirmed')">
              确认
            </el-button>
            <el-button v-if="scope.row.status === 'confirmed'" size="small" type="primary"
              @click="handleUpdateStatus(scope.row, 'completed')">
              完成
            </el-button>

            <!-- 已完成状态显示撤销按钮 -->
            <el-button v-if="scope.row.status === 'completed'" size="small" type="danger"
              @click="handleCancelOutbound(scope.row)">
              撤销
            </el-button>

            <!-- 非草稿状态显示打印按钮 -->
            <el-button v-if="scope.row.status !== 'draft'" size="small" type="success" @click="handlePrint(scope.row)">
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
    <el-dialog v-model="dialogVisible"
      :title="dialogType === 'add' ? '新增出库单' : dialogType === 'supplement' ? '补发出库单' : '编辑出库单'" width="55%"
      v-if="dialogType !== 'view'">
      <div v-loading="editLoading" style="min-height: 100px;">
      <el-form ref="outboundFormRef" :model="outboundForm" :rules="outboundRules" label-width="120px">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="生产任务" prop="production_task_id">
              <el-select v-model="outboundForm.production_task_id" placeholder="选择生产任务" style="width: 100%"
                @change="handleProductionPlanChange" clearable filterable>
                <el-option v-for="item in productionPlanOptions" :key="item.id"
                  :label="`${item.code} - ${item.name} (${item.quantity}${item.unit_name || ''})`" :value="item.id">
                  <span style="float: left">{{ item.code }}</span>
                  <span style="float: right; color: var(--color-text-muted); font-size: 13px">{{ item.name }}</span>
                </el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出库单号">
              <el-input v-model="outboundForm.outbound_no" placeholder="系统自动生成" disabled />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="出库日期" prop="outbound_date">
              <el-date-picker v-model="outboundForm.outbound_date" type="date" placeholder="选择日期" style="width: 100%" />
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

        <el-form-item label="备注" prop="remark">
          <el-input v-model="outboundForm.remark" type="textarea" placeholder="请输入备注" :rows="2" />
        </el-form-item>

        <el-divider content-position="center">出库明细</el-divider>

        <el-table :data="expandedTableData" border style="width: 100%"
          :header-cell-style="{ background: 'var(--color-bg-hover)', color: 'var(--color-text-regular)' }" empty-text="请添加出库物料">
          <el-table-column label="序号" width="55">
            <template #default="scope">
              <span v-if="!scope.row.isSubstitute">{{ scope.row.originalIndex + 1 }}</span>
              <span v-else style="margin-left: 20px; color: var(--color-text-secondary);">└</span>
            </template>
          </el-table-column>

          <el-table-column label="物料编码" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <!-- 替代物料显示 -->
              <span v-if="scope.row.isSubstitute" style="color: var(--color-success);">
                {{ scope.row.material_code || scope.row.materialCode }}
              </span>
              <!-- 来自生产计划的物料(只读) -->
              <span v-else-if="scope.row.is_from_plan">
                {{ scope.row.material_code || scope.row.materialCode }}
              </span>
              <!-- 手动添加的物料(可编辑) -->
              <el-autocomplete v-else-if="dialogType !== 'view'"
                :ref="(el) => setMaterialSelectRef(el, scope.row.originalIndex)" v-model="scope.row.material_code"
                placeholder="输入编码/名称/规格" clearable
                :fetch-suggestions="(query, callback) => fetchMaterialSuggestions(query, callback, scope.row.originalIndex)"
                @select="(item) => handleMaterialSelectAutocomplete(item, scope.row.originalIndex)"
                @keydown.enter.prevent="handleMaterialEnter(scope.row.originalIndex)"
                @clear="handleMaterialClear(scope.row.originalIndex)" style="width: 100%" :trigger-on-focus="true"
                :debounce="300" :hide-loading="false" :popper-append-to-body="false" value-key="code">
                <template #default="{ item }">
                  <div style="display: flex; align-items: center; padding: 4px 0; font-size: 13px;">
                    <span style="font-weight: bold; color: var(--color-text-primary); min-width: 80px;">
                      {{ item.code }}
                    </span>
                    <span style="color: var(--color-text-regular); margin: 0 8px; flex: 1;">
                      {{ item.name }}
                    </span>
                    <span style="color: var(--color-text-secondary); margin: 0 8px; min-width: 100px;">
                      {{ item.specs }}
                    </span>
                    <span style="color: var(--color-primary); font-weight: bold; min-width: 60px; text-align: right;">
                      库存: {{ item.stock_quantity || 0 }}
                    </span>
                  </div>
                </template>
              </el-autocomplete>
              <!-- 查看模式 -->
              <span v-else>
                {{ scope.row.material_code || scope.row.materialCode }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="物料名称" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
                {{ scope.row.material_name || scope.row.materialName }}
                <el-tag v-if="scope.row.isSubstitute" type="success" size="small" style="margin-left: 5px;">替代</el-tag>
              </span>
            </template>
          </el-table-column>

          <el-table-column label="规格" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
                {{ scope.row.specification || scope.row.specs || '无规格' }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="单位" min-width="80" show-overflow-tooltip>
            <template #default="scope">
              <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
                {{ scope.row.unit_name || scope.row.unit }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="出库库位" min-width="100" show-overflow-tooltip>
            <template #default="scope">
              <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
                {{ scope.row.location_name }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="库存" min-width="80" show-overflow-tooltip>
            <template #default="scope">
              <span
                :style="scope.row.isSubstitute ? 'color: var(--color-success); font-size: 12px;' : ((dialogType === 'supplement' && (scope.row.stock_quantity || 0) <= 0) ? 'color: var(--color-danger);' : '')">
                {{ scope.row.stock_quantity || scope.row.stockQuantity || 0 }}
              </span>
            </template>
          </el-table-column>

          <el-table-column label="出库" min-width="120" show-overflow-tooltip>
            <template #default="scope">
              <div v-if="scope.row.isSubstitute" style="color: var(--color-success); font-size: 12px;">
                {{ Math.floor(scope.row.quantity || 0) }}
              </div>
              <el-input v-else-if="dialogType !== 'view' && !scope.row.is_from_plan"
                :ref="(el) => setQuantityInputRef(el, scope.row.originalIndex)" v-model="scope.row.quantity" type="text"
                size="small" @blur="validateOutboundQuantity(scope.row)" @input="validateOutboundQuantity(scope.row)"
                @keydown.enter="handleQuantityEnter(scope.row.originalIndex)" placeholder="数量" />
              <el-tooltip v-else-if="scope.row.is_from_plan && !scope.row.isSubstitute"
                :content="'生产计划数量：' + Math.floor(selectedPlan?.quantity || 0) + ' ' + (selectedPlan?.unit_name || '') + '，BOM用量：' + Math.floor(scope.row.bom_quantity || scope.row.bomQuantity || 0) + ' ' + (scope.row.unit_name || scope.row.unit || '')"
                placement="top">
                <span>{{ Math.floor(scope.row.quantity || 0) }}</span>
              </el-tooltip>
              <span v-else-if="!scope.row.isSubstitute">{{ Math.floor(scope.row.quantity || 0) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="操作" width="80" fixed="right" v-if="dialogType !== 'view'">
            <template #default="scope">
              <el-button v-if="!scope.row.isSubstitute && !scope.row.is_from_plan" type="danger" size="small"
                @click="handleRemoveItem(scope.row.originalIndex)"
                v-permission="'inventory:outbound:update'">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="add-material" style="margin-top: 10px;" v-if="dialogType !== 'view'">
          <el-button type="primary" @click="handleAddItem">
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
          <el-button v-if="dialogType !== 'view'" type="primary" @click="handleSubmit" :loading="submitting">
            保存
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看出库单对话框 -->
    <el-dialog v-model="viewDialogVisible" title="出库单详情" width="50%">
      <div v-loading="viewLoading" style="min-height: 100px;">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="出库单号">{{ currentOutbound.outbound_no }}</el-descriptions-item>
        <el-descriptions-item label="出库日期">{{ formatDate(currentOutbound.outbound_date) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentOutbound.status)">
            {{ getStatusText(currentOutbound.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="操作人">{{ currentOutbound.operator_name || currentOutbound.operator
          }}</el-descriptions-item>
        <el-descriptions-item label="生产计划" v-if="currentOutbound.production_plan_code">
          {{ currentOutbound.production_plan_code }} - {{ currentOutbound.production_plan_name || '' }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="currentOutbound.production_plan_code ? 1 : 2">
          {{ currentOutbound.remark || '无' }}
        </el-descriptions-item>
      </el-descriptions>

      <el-divider>出库明细</el-divider>

      <el-table :data="viewExpandedTableData" border style="width: 100%" class="detail-table">
        <el-table-column label="序号" width="55">
          <template #default="scope">
            <span v-if="!scope.row.isSubstitute">{{ scope.row.originalIndex + 1 }}</span>
            <span v-else style="margin-left: 20px; color: var(--color-text-secondary);">└</span>
          </template>
        </el-table-column>
        <el-table-column label="物料编码" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
              {{ scope.row.material_code || scope.row.materialCode }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="物料名称" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
              {{ scope.row.material_name || scope.row.materialName }}
              <el-tag v-if="scope.row.isSubstitute" type="success" size="small" style="margin-left: 5px;">替代</el-tag>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="规格" min-width="120" show-overflow-tooltip>
          <template #default="scope">
            <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
              {{ scope.row.specification || scope.row.specs || '无规格' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="单位" min-width="80" show-overflow-tooltip>
          <template #default="scope">
            <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
              {{ scope.row.unit_name || scope.row.unit }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="数量" min-width="100" show-overflow-tooltip>
          <template #default="scope">
            <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
              {{ Math.floor(scope.row.quantity || 0) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="出库库位" width="100" fixed="right">
          <template #default="scope">
            <span :style="scope.row.isSubstitute ? 'color: var(--color-success);' : ''">
              {{ scope.row.location_name }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      </div>
    </el-dialog>

    <!-- 选择物料对话框 -->
    <el-dialog v-model="materialDialogVisible" title="选择物料" width="50%">
      <div class="material-search">
        <el-input v-model="materialSearchKeyword" placeholder="搜索物料编码/名称" @keyup.enter="searchMaterialsInDialog">
          <template #append>
            <el-button @click="searchMaterialsInDialog">
              <el-icon>
                <Search />
              </el-icon>
            </el-button>
          </template>
        </el-input>
      </div>

      <el-table :data="materialList" border style="width: 100%" height="400px" @row-click="handleSelectMaterial"
        v-loading="loadingMaterials">
        <el-table-column prop="code" label="物料编码" width="120" />
        <el-table-column prop="name" label="物料名称" />
        <el-table-column prop="specification" label="规格" width="240" />
        <el-table-column prop="unit_name" label="单位" width="80" />
        <el-table-column label="默认库位" width="120">
          <template #default="scope">
            <span>{{ scope.row.location_name }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="stock_quantity" label="库存数量" width="100" />
      </el-table>
    </el-dialog>

    <!-- 打印预览对话框 -->
    <el-dialog v-model="printDialogVisible" title="打印预览" width="50%" append-to-body>
      <div class="print-preview">
        <div ref="printContent" class="print-content">
          <div class="print-header">
            <h2>出库单</h2>
            <div class="print-info">
              <div>单号: {{ printData.outbound_no }}</div>
              <div>日期: {{ formatDate(printData.outbound_date) }}</div>
            </div>
          </div>

          <div class="print-warehouse">
            <span>出库仓库: {{ printData.location_name }}</span>
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
                :style="item.isSubstitute ? 'color: var(--color-success);' : ''">
                <td>
                  <span v-if="!item.isSubstitute">{{ item.originalIndex + 1 }}</span>
                  <span v-else style="margin-left: 20px;">└</span>
                </td>
                <td>{{ item.material_code || item.materialCode }}</td>
                <td>
                  {{ item.material_name || item.materialName }}
                  <span v-if="item.isSubstitute" style="font-size: 12px; color: var(--color-success);">[替代]</span>
                </td>
                <td>{{ item.specification || item.specs || '-' }}</td>
                <td>{{ item.unit_name || item.unit }}</td>
                <td>{{ Math.floor(item.quantity || 0) }}</td>
              </tr>
            </tbody>
          </table>

          <div class="print-footer">
            <div>
              <span>备注: {{ printData.remark || '无' }}</span>
            </div>
            <div class="print-signatures">
              <div>
                <span>操作人: {{ printData.operator_name || printData.operator }}</span>
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
    </el-dialog>

    <!-- 浮动批量操作栏 -->
    <Transition name="slide-up">
      <div v-if="selectedOutbounds.length > 0" class="floating-batch-bar">
        <div class="batch-info">
          <el-icon><Select /></el-icon>
          <span>已选中 <strong>{{ selectedOutbounds.length }}</strong> 个出库单</span>
        </div>
        <div class="batch-buttons">
          <el-button type="primary" @click="handleBatchPrint">
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
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus, ArrowDown, Printer, InfoFilled, Refresh, Select, Close } from '@element-plus/icons-vue'
import api, { productionApi, inventoryApi, baseDataApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth'
import { generateOutboundPrintHTML } from '@/utils/printTemplates'
import { getInboundOutboundStatusText, getInboundOutboundStatusColor } from '@/constants/systemConstants'
import { searchMaterials } from '@/utils/searchConfig'
import { parseListData, parsePaginatedData } from '@/utils/responseParser'
import { formatDate } from '@/utils/helpers/dateUtils'

export default {
  name: 'InventoryOutbound',
  components: {
    Search,
    Plus,
    ArrowDown,
    Printer,
    InfoFilled,
    Refresh,
    Select,
    Close,
  },
  setup() {
    const authStore = useAuthStore()

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
      outbound_no: '',
      outbound_date: '',
      status: '',
      operator: '',
      operator_name: '',
      production_plan_code: '',
      production_plan_name: '',
      remark: '',
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
      cancelledCount: 0
    })

    // 计算属性：当前选中的生产任务
    const selectedPlan = computed(() => {
      if (!outboundForm.production_task_id) return null
      return productionPlanOptions.value.find(plan => plan.id === outboundForm.production_task_id)
    })

    // 工具函数
    // formatDate 已统一引用公共实现

    const getStatusType = (status) => {
      return getInboundOutboundStatusColor(status)
    }

    const getStatusText = (status) => {
      return getInboundOutboundStatusText(status)
    }

    // 倒计时核心计算（单一职责，消除重复日期计算）
    const _calcCountdown = (outboundDate, status) => {
      if (status === 'completed') return { diffDays: null, terminal: 'completed' }
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
      if (terminal === 'cancelled' || terminal === 'unset') return 'info'
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
            name: task.productName || task.product_name, // 使用产品名称
            code: task.code || `任务-${task.id}`, // 使用任务编号，如果没有则使用ID
            product_id: task.product_id || task.productId,
            quantity: task.quantity || 0, // 添加生产任务数量
            unit_name: task.unit || task.unitName, // 添加单位信息
            status: task.status, // 添加状态信息
            task_id: task.id // 保存任务ID用于后续引用
          }))
      } catch (error) {
        console.error('加载生产任务失败:', error)
        productionPlanOptions.value = []
        ElMessage.error('加载生产任务失败')
      }
    }

    // 表单数据
    const outboundForm = reactive({
      id: null,
      outbound_no: '',
      outbound_date: new Date(),
      status: 'draft',
      operator: authStore.realName || '系统用户',  // 使用真实姓名
      remark: '',
      production_task_id: null,
      items: []
    })

    // 表单验证规则
    const outboundRules = {
      outbound_date: [
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

        const res = await api.get('/inventory/materials-with-stock', { params })

        // 确保每个物料都有正确的库存数量和ID，以及默认库位信息
        materialList.value = res.data.map(item => {
          // 使用接收到的ID或material_id
          const materialId = item.id || item.material_id
          const stockQuantity = item.stock_quantity !== undefined ?
            parseFloat(item.stock_quantity) :
            (item.quantity !== undefined ? parseFloat(item.quantity) : 0)

          return {
            ...item,
            id: materialId, // 确保id字段存在
            material_id: materialId, // 同时保存material_id
            stock_quantity: stockQuantity,
            location_id: item.location_id, // 物料的默认库位ID
            location_name: item.location_name // 物料的默认库位名称
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
      const materialId = row.id || row.material_id

      // 检查是否已添加
      const existingIndex = outboundForm.items.findIndex(item =>
        item.material_id === materialId || item.material_id === row.id || item.material_id === row.material_id
      )
      if (existingIndex !== -1) {
        ElMessage.warning('该物料已添加')
        return
      }

      const defaultLocationId = row.location_id
      if (!defaultLocationId) {
        ElMessage.warning('该物料没有设置默认库位，无法获取库存信息')
        return
      }

      // 先使用行数据中的库存量作为默认值
      let stockQuantity = row.stock_quantity !== undefined
        ? parseFloat(row.stock_quantity)
        : (row.quantity !== undefined ? parseFloat(row.quantity) : 0)

      // 尝试从Lean API获取最新库存
      try {
        const stockRes = await inventoryApi.getMaterialStock(materialId, defaultLocationId)
        if (stockRes?.data) {
          stockQuantity = (stockRes.data.quantity !== undefined && stockRes.data.quantity !== null)
            ? parseFloat(stockRes.data.quantity)
            : (stockRes.data.stock_quantity !== undefined && stockRes.data.stock_quantity !== null)
              ? parseFloat(stockRes.data.stock_quantity)
              : stockQuantity
        }
      } catch (error) {
        console.error('获取物料库存失败，使用列表数据:', error)
      }

      // 统一推送物料
      outboundForm.items.push({
        material_id: materialId,
        material_code: row.code,
        material_name: row.name,
        specification: row.specification || row.specs || '',
        unit_id: row.unit_id,
        unit_name: row.unit_name,
        stock_quantity: stockQuantity,
        quantity: Math.min(1, stockQuantity),
        location_id: defaultLocationId,
        location_name: row.location_name
      })

      ElMessage.success(`物料添加成功${row.location_name ? '，将从 ' + row.location_name + ' 出库' : ''}`)
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
          production_group_id: productionGroupFilter.value
        }

        // 添加时间范围参数
        if (dateRange.value && dateRange.value.length === 2) {
          params.startDate = dateRange.value[0]
          params.endDate = dateRange.value[1]
        }

        const res = await api.get('/inventory/outbound', { params })

        // 使用统一解析器处理分页数据
        const { list, total: totalCount } = parsePaginatedData(res, { enableLog: false })

        outboundList.value = list
        total.value = totalCount

        // 更新统计数据
        updateStats()
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

    // 共享智能分析函数：获取替代物料信息（handleView 和 handlePrint 共用，DRY原则）
    const _enrichItemsWithSubstitution = async (items, productionPlanCode, status) => {
      try {
        if (productionPlanCode) {
          // 有生产计划编码：调用智能分析API
          const planRes = await api.get(`/production/plans?search=${productionPlanCode}`)
          if (planRes.data?.data?.length > 0) {
            const plan = planRes.data.data[0]
            const smartRes = await api.post('/production/calculate-materials', {
              productId: plan.product_id,
              bomId: plan.bom_id,
              quantity: plan.quantity,
              forceAnalysis: true
            })
            if (smartRes.data && Array.isArray(smartRes.data)) {
              return items.map(item => {
                const sm = smartRes.data.find(m => m.materialId == item.material_id)
                return sm ? { ...item, availableQuantity: sm.availableQuantity || item.stock_quantity, substitutionInfo: sm.substitutionInfo } : item
              })
            }
          }
        }
        // 无生产计划编码：已完成的出库单保持原样，草稿/确认状态不做处理（替代物料应由后端 API 返回）
      } catch (err) {
        console.error('智能分析失败，使用原始数据:', err)
      }
      return items
    }

    // 处理查看
    const handleView = async (row) => {
      viewDialogVisible.value = true
      viewLoading.value = true
      try {
        const res = await api.get(`/inventory/outbound/${row.id}`)

        // 后端使用 ResponseHandler.success 返回，数据在 res.data.data 中
        const outboundData = res.data?.data || res.data

        // 设置查看数据
        Object.assign(currentOutbound, outboundData)

        // 智能分析替代物料信息
        if (currentOutbound.items?.length > 0) {
          currentOutbound.items = await _enrichItemsWithSubstitution(
            currentOutbound.items,
            currentOutbound.production_plan_code,
            currentOutbound.status
          )
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
      if (outboundData.production_task_id && outboundData.production_task_code) {
        const exists = productionPlanOptions.value.find(
          task => task.id === outboundData.production_task_id
        )
        if (!exists) {
          productionPlanOptions.value.push({
            id: outboundData.production_task_id,
            code: outboundData.production_task_code,
            name: outboundData.production_task_product_name,
            quantity: outboundData.production_task_quantity || 0,
            unit_name: '',
            status: fallbackStatus,
            task_id: outboundData.production_task_id
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
        const res = await api.get(`/inventory/outbound/${row.id}`)

        // 后端使用 ResponseHandler.success 返回，数据在 res.data.data 中
        const outboundData = res.data?.data || res.data

        // 检查是否有缺料记录
        if (!outboundData.items || outboundData.items.length === 0) {
          ElMessage.warning('该出库单没有物料信息')
          return
        }

        // 筛选出有缺料的物料（shortage_quantity > 0）
        const shortageItems = outboundData.items.filter(item =>
          item.shortage_quantity && parseFloat(item.shortage_quantity) > 0
        )

        if (shortageItems.length === 0) {
          ElMessage.warning('该出库单没有缺料，无需补发')
          return
        }

        // 创建补发对话框数据
        Object.assign(outboundForm, {
          id: outboundData.id,
          outbound_no: outboundData.outbound_no + '-补发',
          outbound_date: outboundData.outbound_date,
          production_task_id: outboundData.production_task_id,
          production_task_code: outboundData.production_task_code,
          production_group_id: outboundData.production_group_id,
          remark: (outboundData.remark || '') + ' [补发]',
          items: shortageItems.map(item => ({
            ...item,
            quantity: parseFloat(item.shortage_quantity),
            planned_quantity: item.planned_quantity,
            actual_quantity: item.actual_quantity,
            shortage_quantity: item.shortage_quantity,
            stock_quantity: item.stock_quantity,
            is_supplement: true
          }))
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
        const res = await api.get(`/inventory/outbound/${id}`)

        const outboundData = res.data?.data || res.data

        Object.assign(outboundForm, outboundData)

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
        await api.delete(`/inventory/outbound/${row.id}`)
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
          const detailRes = await api.get(`/inventory/outbound/${row.id}`)
          const detail = detailRes.data?.data || detailRes.data || {}
          const items = detail.items || []
          const insufficientList = []

          for (const item of items) {
            const stockQty = parseFloat(item.stock_quantity || item.stockQuantity || 0)
            const outQty = parseFloat(item.quantity || 0)
            if (outQty > stockQty) {
              insufficientList.push(
                `${item.material_code || item.materialCode || '?'} (${item.material_name || item.materialName || '未知'}): 需出库 ${outQty}, 库存 ${stockQty}`
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
          console.warn('出库预检失败，将依赖后端校验:', checkError)
        }
      }

      ElMessageBox.confirm(`确定要${statusText[newStatus]}此出库单吗?`, '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        try {
          await api.put(`/inventory/outbound/${row.id}/status`, { newStatus })
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

    // 撤销出库 - 回退已完成的出库单
    const handleCancelOutbound = async (row, force = false) => {
      const confirmMsg = force
        ? `⚠️ 强制撤销警告：出库单 ${row.outbound_no} 关联的生产任务正在进行中，部分物料可能已被消耗。确定要强制撤销吗？`
        : `确定要撤销出库单 ${row.outbound_no} 吗？撤销后库存将回退，出库单将变为草稿状态。`

      ElMessageBox.confirm(
        confirmMsg,
        force ? '强制撤销确认' : '撤销确认',
        {
          confirmButtonText: force ? '强制撤销' : '确定撤销',
          cancelButtonText: '取消',
          type: force ? 'error' : 'warning',
          dangerouslyUseHTMLString: true
        }
      ).then(async () => {
        try {
          await api.post(`/inventory/outbound/${row.id}/cancel`, { force })
          ElMessage.success('撤销成功，库存已回退')
          fetchOutboundList()
        } catch (error) {
          console.error('撤销失败:', error)
          const errorData = error.response?.data

          // 处理需要确认的情况（生产中状态）
          if (errorData?.code === 'NEED_CONFIRM' && errorData?.data?.needConfirm) {
            ElMessageBox.confirm(
              `${errorData.message}\n\n确定要强制撤销吗？这可能会导致库存数据不一致。`,
              '需要确认',
              {
                confirmButtonText: '强制撤销',
                cancelButtonText: '取消',
                type: 'error'
              }
            ).then(() => {
              // 用户确认后，使用强制撤销
              handleCancelOutbound(row, true)
            }).catch(() => { })
          } else {
            ElMessage.error(errorData?.message || '撤销失败')
          }
        }
      }).catch(() => { })
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
      if (outboundForm.production_task_id) {
        ElMessage.warning('已选择生产任务，无法手动添加物料')
        return
      }

      outboundForm.items.push({
        material_id: '',
        material_code: '',
        material_name: '',
        specification: '',
        quantity: '',
        unit_name: '',
        unit_id: '',
        location_name: '',
        location_id: '',
        stock_quantity: 0,
        is_from_plan: false
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
    const fetchMaterialSuggestions = async (queryString, callback, index) => {
      if (!queryString || queryString.trim().length === 0) {
        callback([])
        return
      }

      try {
        const searchResults = await searchMaterials(baseDataApi, queryString.trim(), {
          pageSize: 500,
          includeAll: true
        })

        // 确保 searchResults 是数组
        if (!searchResults || !Array.isArray(searchResults)) {
          console.warn('搜索结果不是数组:', searchResults)
          callback([])
          return
        }

        const suggestions = searchResults.map(item => ({
          value: item.code || '无编码',
          id: item.id,
          code: item.code || '无编码',
          name: item.name || '未命名',
          specs: item.specification || '',
          unit_name: item.unit_name || '个',
          unit_id: item.unit_id,
          location_name: item.location_name || '',
          location_id: item.location_id,
          stock_quantity: item.stock_quantity || 0
        }))

        callback(suggestions)
      } catch (error) {
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
        idx !== index && existingItem.material_id === materialId
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
          material_id: materialId,
          location_id: item.location_id
        })

        const stockQuantity = stockRes.data?.data?.quantity !== undefined && stockRes.data?.data?.quantity !== null
          ? parseFloat(stockRes.data.data.quantity)
          : (stockRes.data?.quantity !== undefined && stockRes.data?.quantity !== null)
            ? parseFloat(stockRes.data.quantity)
            : (stockRes.data?.stock_quantity !== undefined && stockRes.data?.stock_quantity !== null)
              ? parseFloat(stockRes.data.stock_quantity)
              : 0

        // 更新物料信息
        outboundForm.items[index].material_id = materialId
        outboundForm.items[index].material_code = item.code
        outboundForm.items[index].material_name = item.name
        outboundForm.items[index].specification = item.specs
        outboundForm.items[index].unit_name = item.unit_name
        outboundForm.items[index].unit_id = item.unit_id
        outboundForm.items[index].location_name = item.location_name
        outboundForm.items[index].location_id = item.location_id
        outboundForm.items[index].stock_quantity = stockQuantity

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
      if (outboundForm.items[index].material_id) {
        const quantityInput = quantityInputRefs.value[index]
        if (quantityInput) {
          quantityInput.focus()
        }
      }
    }

    // 处理物料清除
    const handleMaterialClear = (index) => {
      outboundForm.items[index].material_id = ''
      outboundForm.items[index].material_code = ''
      outboundForm.items[index].material_name = ''
      outboundForm.items[index].specification = ''
      outboundForm.items[index].unit_name = ''
      outboundForm.items[index].unit_id = ''
      outboundForm.items[index].location_name = ''
      outboundForm.items[index].location_id = ''
      outboundForm.items[index].stock_quantity = 0
    }

    // 处理数量输入框回车
    const handleQuantityEnter = (index) => {
      // 如果是最后一行，添加新行
      if (index === outboundForm.items.filter(item => !item.is_from_plan).length - 1) {
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
        const maxQuantity = row.shortage_quantity || 9999
        if (row.quantity > maxQuantity) {
          row.quantity = maxQuantity
          ElMessage.warning(`补发数量不能超过缺料数量 ${maxQuantity}`)
        }
      } else {
        // 非补发模式下检查是否超过库存
        const maxQuantity = row.stock_quantity || row.stockQuantity || 9999
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
        if (!item.quantity || item.quantity <= 0) {
          ElMessage.warning(`${item.material_name} 的出库数量必须大于0`)
          return false
        }

        // 补发模式下跳过库存检查,因为后端支持预扣库存冲正
        if (dialogType.value === 'supplement') {
          // 补发模式下只检查补发数量不能超过缺料数量
          if (item.shortage_quantity && item.quantity > parseFloat(item.shortage_quantity)) {
            ElMessage.warning(`${item.material_name} 的补发数量不能超过缺料数量(${item.shortage_quantity})`)
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
        outbound_no: '',
        outbound_date: new Date(),
        status: 'draft',
        operator: authStore.realName || '系统用户',
        remark: '',
        production_task_id: null,
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

        // 格式化表单数据
        const dataToSubmit = retryData || {
          ...outboundForm,
          outbound_date: formatDate(outboundForm.outbound_date)
        }

        // 提交数据
        if (dialogType.value === 'add') {
          // 根据是否关联生产任务自动标记出库类型
          dataToSubmit.outbound_type = dataToSubmit.production_task_id ? 'bom_issue' : 'manual'
          await api.post('/inventory/outbound', dataToSubmit)
          ElMessage.success('创建出库单成功')
        } else if (dialogType.value === 'supplement') {
          // 补发模式：调用补发API
          const supplementData = {
            outbound_id: dataToSubmit.id,
            outbound_date: dataToSubmit.outbound_date,
            remark: dataToSubmit.remark,
            items: dataToSubmit.items.map(item => ({
              material_id: item.material_id,
              quantity: item.quantity,
              outbound_item_id: item.id // 原出库单明细ID
            }))
          }
          await api.post(`/inventory/outbound/${dataToSubmit.id}/supplement`, supplementData)
          ElMessage.success('补发成功')
        } else {
          await api.put(`/inventory/outbound/${dataToSubmit.id}`, dataToSubmit)
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

        // 处理超额领料警告
        if (errorData?.code === 'EXCESS_ISSUE' && errorData?.details) {
          const detailsHtml = errorData.details.map(d =>
            `<div style="color: var(--color-danger); margin-bottom: 4px;">• ${d.message || '超额领料'}</div>`
          ).join('');

          ElMessageBox.confirm(
            `<div style="font-weight: bold; margin-bottom: 10px;">检测到以下超额领料项，是否确认继续？</div>
              ${detailsHtml}
              <div style="margin-top: 15px; color: var(--color-text-regular);">确认后请填写补发/超额原因。</div>`,
            '超额领料警告',
            {
              confirmButtonText: '确认并填写原因',
              cancelButtonText: '取消',
              type: 'warning',
              dangerouslyUseHTMLString: true,
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
                ...(retryData || outboundForm),
                outbound_date: formatDate(outboundForm.outbound_date),
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
    // TODO: 当前统计仅基于当前页数据，分页时不准确。应由后端 getOutboundList 返回全局统计。
    const updateStats = () => {
      const list = Array.isArray(outboundList.value) ? outboundList.value : []
      outboundStats.total = total.value || 0
      outboundStats.draftCount = list.filter(item => item.status === 'draft').length
      outboundStats.confirmedCount = list.filter(item => item.status === 'confirmed').length
      outboundStats.partialCompletedCount = list.filter(item => item.status === 'partial_completed').length
      outboundStats.completedCount = list.filter(item => item.status === 'completed').length
      outboundStats.cancelledCount = list.filter(item => item.status === 'cancelled').length
    }

    // 加载生产组列表
    const loadProductionGroups = async () => {
      try {
        const res = await api.get('/system/departments', {
          params: {
            status: 1
          }
        })

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
        const res = await api.get(`/inventory/outbound/${row.id}`)

        // 后端使用 ResponseHandler.success 返回，数据在 res.data.data 中
        printData.value = res.data?.data || res.data

        // 智能分析替代物料信息
        if (printData.value.items?.length > 0) {
          printData.value.items = await _enrichItemsWithSubstitution(
            printData.value.items,
            printData.value.production_plan_code,
            printData.value.status
          )
        }

        printDialogVisible.value = true
      } catch (error) {
        console.error('获取出库单详情失败:', error)
        ElMessage.error('获取出库单详情失败')
      }
    }

    // 打印出库单
    const printOutbound = async () => {
      try {
        // 尝试获取系统打印模板
        const templateRes = await api.get('/print/templates', {
          params: {
            module: 'inventory',
            template_type: 'production_outbound',
            status: 1,
            limit: 1
          }
        })

        let htmlContent = ''

        // 适配多种响应格式
        let templateList = null
        if (templateRes.data?.data?.length > 0) {
          templateList = templateRes.data.data
        } else if (templateRes.data?.list?.length > 0) {
          templateList = templateRes.data.list
        } else if (Array.isArray(templateRes.data) && templateRes.data.length > 0) {
          templateList = templateRes.data
        }

        if (templateList && templateList.length > 0) {
          // 使用系统模板
          const template = templateList[0]
          htmlContent = template.content

          // 解码 HTML 实体（如果模板内容被转义了）
          if (htmlContent.includes('&lt;') || htmlContent.includes('&gt;')) {
            const textarea = document.createElement('textarea')
            textarea.innerHTML = htmlContent
            htmlContent = textarea.value
          }

          // 替换模板变量
          const templateData = {
            outbound_no: printData.value.outbound_no,
            outbound_date: formatDate(printData.value.outbound_date),
            outbound_type_text: '生产出库',
            operator: printData.value.operator,
            production_plan_code: printData.value.production_plan_code || '',
            status: printData.value.status === 'completed' ? '已完成' : printData.value.status,
            remark: printData.value.remark || '无',
            print_time: new Date().toLocaleString()
          }

          // 替换基本变量
          Object.keys(templateData).forEach(key => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
            htmlContent = htmlContent.replace(regex, templateData[key])
          })

          // 处理物料列表
          const expandedItems = []
          printData.value.items.forEach((item, index) => {
            // 添加主物料
            expandedItems.push({
              ...item,
              originalIndex: index,
              isSubstitute: false
            })

            // 添加替代物料
            if (item.substitutionInfo?.substituteMaterials?.length > 0) {

              item.substitutionInfo.substituteMaterials.forEach(sub => {
                // 计算替代物料的实际出库数量：只替代缺口部分
                // 缺口 = 需要出库数量 - 现有库存数量
                const shortage = Math.max(0, item.quantity - (item.stock_quantity || 0));
                const actualSubstituteQuantity = (sub.requiredQuantity || 1) * shortage;

                expandedItems.push({
                  material_code: sub.code,
                  material_name: sub.name,
                  specification: sub.specification || '',
                  unit_name: sub.unit,
                  quantity: actualSubstituteQuantity,
                  location_name: sub.location_name,
                  originalIndex: index,
                  isSubstitute: true
                })
              })
            }
          })

          // 生成物料表格HTML
          const itemsHtml = expandedItems.map(item => {
            const sequenceNumber = item.isSubstitute ? '└' : (item.originalIndex + 1)
            const materialName = item.isSubstitute ?
              item.material_name + '<span class="substitute-mark">替代</span>' :
              item.material_name
            const rowClass = item.isSubstitute ? ' class="substitute-row"' : ''

            return `
              <tr${rowClass}>
                <td>${sequenceNumber}</td>
                <td>${item.material_code || ''}</td>
                <td>${materialName || ''}</td>
                <td>${item.specification || item.specs || ''}</td>
                <td>${item.unit_name || item.unit || ''}</td>
                <td>${item.quantity || ''}</td>
                <td>${item.location_name || ''}</td>
              </tr>
            `
          }).join('')

          // 替换物料列表
          htmlContent = htmlContent.replace(/\{\{#each items\}\}[\s\S]*?\{\{\/each\}\}/g, itemsHtml)
        } else {
          // 使用默认模板
          htmlContent = generateOutboundPrintHTML(printData.value, formatDate)
        }

        // 创建打印窗口
        const printWindow = window.open('', '_blank')
        printWindow.document.write(htmlContent)
        printWindow.document.close()

      } catch (error) {
        console.error('获取打印模板失败，使用默认模板:', error)
        // 降级到默认模板
        const printWindow = window.open('', '_blank')
        const htmlContent = generateOutboundPrintHTML(printData.value, formatDate)
        printWindow.document.write(htmlContent)
        printWindow.document.close()
      }
    }

    // 辅助函数：获取BOM数据
    const fetchBomData = async (productId) => {
      try {
        const bomRes = await baseDataApi.getBoms({
          params: {
            product_id: productId,
            page: 1,
            pageSize: 10
          }
        })

        if (!bomRes?.data) {
          throw new Error('获取BOM数据失败')
        }

        let bomData
        if (Array.isArray(bomRes.data.data)) {
          bomData = bomRes.data.data[0]
        } else if (bomRes.data.data) {
          bomData = bomRes.data.data
        } else if (Array.isArray(bomRes.data)) {
          bomData = bomRes.data[0]
        } else {
          bomData = bomRes.data
        }

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
      let details = []

      if (Array.isArray(bomData.details)) {
        details = bomData.details
      } else if (bomData.bom_details) {
        details = bomData.bom_details
      } else if (bomData.materials) {
        details = bomData.materials
      }

      if (!details || !details.length) {
        try {
          const materialsRes = await productionApi.calculateMaterials({
            productId,
            bomId: bomData.id,
            quantity
          })

          if (Array.isArray(materialsRes.data) && materialsRes.data.length > 0) {
            details = materialsRes.data
          } else {
            throw new Error('该产品的BOM中没有物料明细')
          }
        } catch (error) {
          throw new Error('计算物料需求失败')
        }
      }

      return details
    }

    // 处理生产任务变化
    const handleProductionPlanChange = async (taskId) => {
      if (!taskId) {
        outboundForm.items = []
        outboundForm.production_task_id = null
        return
      }

      // 设置生产任务ID
      outboundForm.production_task_id = taskId

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
          bomData = await fetchBomData(selectedTask.product_id)
          details = await fetchBomDetails(bomData, selectedTask.product_id, selectedTask.quantity)
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
        // 首先获取所有物料的详细信息（包括默认库位）
        const materialIds = details.map(detail => detail.materialId || detail.material_id).filter(id => id)

        if (materialIds.length === 0) {
          ElMessage.warning('BOM中没有有效的物料信息')
          outboundForm.items = []
          return
        }

        // 初始化映射
        let materialInfoMap = new Map()
        let stockMap = new Map()

        try {
          // 批量获取物料信息
          const materialInfoRes = await baseDataApi.getMaterialsByIds(materialIds)

          if (!materialInfoRes?.data?.success || !materialInfoRes.data.data) {
            throw new Error('获取物料信息失败')
          }

          // 处理不同的响应格式
          let materialsInfo = []
          const innerData = materialInfoRes.data.data

          if (Array.isArray(innerData)) {
            materialsInfo = innerData
          } else if (innerData.list && Array.isArray(innerData.list)) {
            materialsInfo = innerData.list
          } else if (innerData.rows && Array.isArray(innerData.rows)) {
            materialsInfo = innerData.rows
          } else if (innerData.items && Array.isArray(innerData.items)) {
            materialsInfo = innerData.items
          } else {
            console.error('无法识别的物料信息响应格式:', innerData)
            throw new Error('物料信息格式错误')
          }

          // 构建批量库存查询参数
          const stockQueries = materialsInfo
            .filter(material => material.location_id) // 只查询有默认库位的物料
            .map(material => ({
              materialId: material.id,
              locationId: material.location_id
            }))

          // 批量获取库存信息
          let stockResults = []
          if (stockQueries.length > 0) {
            const stockRes = await inventoryApi.getBatchMaterialStock(stockQueries)
            stockResults = stockRes?.data || []
          }

          // 构建物料ID到信息的映射
          materialsInfo.forEach(material => {
            materialInfoMap.set(material.id, {
              material_code: material.code,
              material_name: material.name,
              specification: material.specs || material.specification || '',
              unit_id: material.unit_id,
              unit_name: material.unit_name,
              location_id: material.location_id,
              location_name: material.location_name
            })
          })

          // 构建物料ID到库存的映射
          stockResults.forEach(stock => {
            const key = `${stock.material_id}_${stock.location_id}`
            stockMap.set(key, {
              quantity: parseFloat(stock.quantity || 0),
              stock_quantity: parseFloat(stock.stock_quantity || 0)
            })
          })

        } catch (error) {
          console.error('批量获取物料信息和库存失败:', error)
          ElMessage.error('获取物料信息失败，请重试')
          outboundForm.items = []
          return
        }

        // 更新出库单明细
        outboundForm.items = details.map(detail => {
          // 标准化物料ID字段，可能是materialId或material_id
          const materialId = detail.materialId || detail.material_id

          // 从物料信息映射中获取物料基本信息
          const materialInfo = materialInfoMap.get(materialId) || {}

          // 标准化数量字段，尝试从不同的字段获取BOM用量
          let bomQuantity = 0
          if (typeof detail.quantity !== 'undefined') {
            bomQuantity = detail.quantity
          } else if (typeof detail.bom_quantity !== 'undefined') {
            bomQuantity = detail.bom_quantity
          } else if (typeof detail.bomQuantity !== 'undefined') {
            bomQuantity = detail.bomQuantity
          } else if (typeof detail.unitQuantity !== 'undefined') {
            bomQuantity = detail.unitQuantity
          }

          // 计算实际需要的数量：生产任务数量 * BOM中的单位用量
          const requiredQuantity = selectedTask.quantity * bomQuantity

          // 获取该物料的库存信息
          const stockKey = `${materialId}_${materialInfo.location_id || 1}`
          const stockInfo = stockMap.get(stockKey) || { quantity: 0, stock_quantity: 0 }

          // 将原始物料数据合并，确保规格等信息正确保留
          const materialData = {
            material_id: materialId,
            material_code: materialInfo.material_code || detail.materialCode || detail.material_code || detail.code,
            material_name: materialInfo.material_name || detail.materialName || detail.material_name || detail.name,
            // 优先使用物料信息中的规格字段
            specification: materialInfo.specification || detail.specification || detail.specs || '',
            unit_id: materialInfo.unit_id || detail.unitId || detail.unit_id,
            unit_name: materialInfo.unit_name || detail.unitName || detail.unit_name || detail.unit,
            stock_quantity: stockInfo.stock_quantity,
            // 使用计算后的数量作为出库数量
            quantity: requiredQuantity,
            // 确保保存正确的BOM用量
            bom_quantity: bomQuantity,
            // 添加库位信息
            location_id: materialInfo.location_id,
            location_name: materialInfo.location_name,
            is_from_plan: true
          }

          return materialData
        })

        // 使用智能物料需求分析检查库存状态
        try {
          const smartAnalysisRes = await api.post('/production/calculate-materials', {
            productId: selectedTask.product_id,
            bomId: bomData.id,
            quantity: selectedTask.quantity
          })

          if (smartAnalysisRes.data && Array.isArray(smartAnalysisRes.data)) {
            const smartMaterials = smartAnalysisRes.data

            // 更新出库单物料的智能分析结果
            outboundForm.items = outboundForm.items.map(item => {
              const smartMaterial = smartMaterials.find(sm => sm.materialId == item.material_id)
              if (smartMaterial) {
                return {
                  ...item,
                  availableQuantity: smartMaterial.availableQuantity || item.stock_quantity,
                  substitutionInfo: smartMaterial.substitutionInfo
                }
              }
              return item
            })

            // 检查智能分析结果，分别处理不同状态的物料
            const problematicItems = smartMaterials.filter(material =>
              material.stockQuantity < material.requiredQuantity
            )

            // 显示库存不足的警告
            if (problematicItems.length > 0) {
              const warningMessages = problematicItems.map(material => {
                const materialInfo = outboundForm.items.find(item => item.material_id == material.materialId)
                const code = materialInfo?.material_code || material.code || material.materialId
                const name = materialInfo?.material_name || material.name
                return `${code} - ${name}: 需要 ${material.requiredQuantity}，但库存只有 ${material.stockQuantity}`
              })

              ElMessage({
                message: `以下物料库存不足:\n${warningMessages.join('\n')}`,
                type: 'warning',
                duration: 8000,
                showClose: true
              })
            }

            // 智能替代提醒已移除 - 信息现在直接显示在表格中

            // 所有物料库存充足，无需替代
          } else {
            console.error('智能分析API返回数据格式错误:', smartAnalysisRes.data)
            throw new Error('API返回数据格式错误')
          }
        } catch (smartAnalysisError) {
          console.error('智能物料分析失败，使用简单库存检查:', smartAnalysisError)
          // 降级到简单库存检查
          const insufficientItems = outboundForm.items.filter(item => item.quantity > item.stock_quantity)
          if (insufficientItems.length > 0) {
            const warningMessages = insufficientItems.map(item =>
              `${item.material_code} - ${item.material_name}: 需要 ${item.quantity}，但库存只有 ${item.stock_quantity}`
            )

            ElMessage({
              message: `以下物料库存不足:\n${warningMessages.join('\n')}`,
              type: 'warning',
              duration: 8000,
              showClose: true
            })
          }
        }

      } catch (error) {
        console.error('获取生产计划相关信息失败:', error)
        ElMessage.error(error.message || '获取生产计划相关信息失败')
        outboundForm.items = []
      }
    }

    // 工具函数：构建包含替代物料的展开表格数据（DRY原则，三处共用）
    const _buildExpandedItems = (items, status) => {
      if (!items) return []
      const result = []
      items.forEach((item, index) => {
        result.push({ ...item, originalIndex: index, isSubstitute: false })

        const hasSubs = item.substitutionInfo?.substituteMaterials?.length > 0
        const needsSubs = (item.stock_quantity || 0) < item.quantity
        if (hasSubs && needsSubs) {
          item.substitutionInfo.substituteMaterials.forEach(sub => {
            let qty
            if (status === 'completed' && sub.actualOutboundQuantity !== undefined) {
              qty = sub.actualOutboundQuantity
            } else {
              const shortage = Math.max(0, item.quantity - (item.stock_quantity || 0))
              qty = (sub.requiredQuantity || 1) * shortage
            }
            result.push({
              material_id: sub.materialId,
              material_code: sub.code,
              material_name: sub.name,
              specification: sub.specification || '',
              unit_name: sub.unit,
              location_name: sub.location_name,
              stock_quantity: sub.stockQuantity,
              quantity: qty,
              originalIndex: index,
              isSubstitute: true,
              parentMaterialId: item.material_id
            })
          })
        }
      })
      return result
    }

    // 计算属性：编辑对话框的展开表格数据
    const expandedTableData = computed(() =>
      _buildExpandedItems(outboundForm.items, outboundForm.status)
    )

    // 计算属性：查看对话框的展开表格数据
    const viewExpandedTableData = computed(() =>
      _buildExpandedItems(currentOutbound.items, currentOutbound.status)
    )

    // 计算属性：打印预览的展开表格数据
    const printExpandedTableData = computed(() =>
      _buildExpandedItems(printData.value?.items, printData.value?.status)
    )

    // 计算属性：是否有需要替代的物料
    const hasSubstitutionItems = computed(() => {
      return outboundForm.items.some(item =>
        item.substitutionInfo?.substituteMaterials?.length > 0 &&
        (item.stock_quantity || 0) < item.quantity
      )
    })

    // 计算属性：需要替代的物料列表
    const substitutionItems = computed(() => {
      return outboundForm.items.filter(item =>
        item.substitutionInfo?.substituteMaterials?.length > 0 &&
        (item.stock_quantity || 0) < item.quantity
      )
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
          outboundNos.push(detail.outbound_no)

          if (detail.items && detail.items.length > 0) {
            for (const item of detail.items) {
              const key = `${item.material_code}_${item.material_name}_${item.specification}_${item.unit_name}`

              if (materialMap.has(key)) {
                // 物料已存在，累加数量
                const existing = materialMap.get(key)
                existing.quantity = parseFloat(existing.quantity) + parseFloat(item.quantity || 0)
              } else {
                // 新物料
                materialMap.set(key, {
                  material_code: item.material_code,
                  material_name: item.material_name,
                  specification: item.specification,
                  unit_name: item.unit_name,
                  quantity: parseFloat(item.quantity || 0)
                })
              }
            }
          }
        }

        // 转换为数组
        const mergedItems = Array.from(materialMap.values())

        // 创建合并后的出库单数据
        const mergedOutbound = {
          outbound_no: outboundNos.join(', '),
          outbound_date: outboundDetails[0].outbound_date,
          operator: outboundDetails[0].operator || outboundDetails[0].operator_name,
          remark: `批量打印 (${selectedOutbounds.value.length}个出库单)`,
          items: mergedItems
        }

        // 生成打印HTML
        const htmlContent = generateOutboundPrintHTML(mergedOutbound, formatDate)

        // 打开打印窗口
        const printWindow = window.open('', '_blank')
        printWindow.document.write(htmlContent)
        printWindow.document.close()

        // 等待内容加载后打印
        printWindow.onload = () => {
          printWindow.print()
        }

        ElMessage.success('打印准备完成')
      } catch (error) {
        console.error('批量打印失败:', error)
        ElMessage.error('批量打印失败')
      }
    }

    return {
      // 图标组件
      Search,
      Plus,
      ArrowDown,
      Printer,
      InfoFilled,
      Refresh,
      Select,
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
      validateOutboundQuantity,
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
  gap: 10px;
}

/* 使用全局 common-styles.css 中的 .statistics-row 和 .stat-card */

/* 使用全局 common-styles.css 中的 .stat-value 和 .stat-label */

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

/* 对话框高度 - 页面特定，其他样式使用全局主题 */
:deep(.el-dialog__body) {
  max-height: 60vh;
  overflow-y: auto;
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
  color: var(--color-on-primary, #fff);
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

/* 操作列样式 - 与采购申请页面保持一致 */
.el-table .el-button+.el-button {
  margin-left: 8px;
}
</style>