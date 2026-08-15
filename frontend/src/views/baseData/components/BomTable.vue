<template>
  <div class="bom-table-container">
    <el-table
      v-loading="loading"
      :data="tableData"
      border
      class="table-row-click w-full"
      ref="tableRef"
      @selection-change="handleSelectionChange"
    
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => handleView(row))">
      <template #empty>
        <EmptyState description="暂无BOM数据" />
      </template>
      <el-table-column v-if="selectionMode" type="selection" width="55" :selectable="(row) => true"></el-table-column>
      <el-table-column label="产品编码" width="120" sortable prop="productCode" show-overflow-tooltip>
        <template #default="scope">
          {{ scope.row.productCode || '未知' }}
        </template>
      </el-table-column>
      <el-table-column label="产品名称" min-width="150" sortable prop="productName" show-overflow-tooltip>
        <template #default="scope">
          {{ scope.row.productName || '未知' }}
        </template>
      </el-table-column>
      <el-table-column label="规格型号" min-width="180" show-overflow-tooltip>
        <template #default="scope">
          <span v-if="scope.row.productSpecs">{{ scope.row.productSpecs }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column prop="version" label="版本" width="80" sortable></el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="scope">
          <el-tag v-if="isHistoryVersion(scope.row)" type="info">历史版本</el-tag>
          <el-tag v-else :type="getStatusType(isApproved(scope.row))">
            {{ formatStatus(isApproved(scope.row)) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdBy" label="创建人" width="90" show-overflow-tooltip></el-table-column>
      <el-table-column prop="updatedBy" label="修改人" width="90" show-overflow-tooltip></el-table-column>
      <el-table-column label="修改时间" width="120" sortable prop="updatedAt">
        <template #default="scope">
          {{ DateFormatter.toDate(scope.row.updatedAt) }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="120" sortable prop="createdAt">
        <template #default="scope">
          {{ DateFormatter.toDate(scope.row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="150" show-overflow-tooltip></el-table-column>
      <el-table-column label="操作" min-width="360" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header"
      >
        <template #default="scope">
          <div class="table-actions">
          
          <!-- 历史版本只显示查看按钮 -->
          <template v-if="!isHistoryVersion(scope.row)">
            <el-button
              v-if="canUpdate && !isApproved(scope.row)"
              size="small"
              type="primary"
              @click="handleEdit(scope.row)">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button
              v-if="canUpdate && !isApproved(scope.row)"
              size="small"
              type="primary"
              plain
              @click="handleUpgrade(scope.row)"
              title="创建保留历史版本的新BOM草稿">
              <el-icon><RefreshRight /></el-icon> 升版
            </el-button>
            <el-popconfirm
              v-if="canDelete && !isApproved(scope.row)"
              title="确定要删除该BOM吗？此操作无法恢复。"
              @confirm="handleDelete(scope.row)"
              confirm-button-type="danger"
            >
              <template #reference>
                <el-button size="small" type="danger">
                  <el-icon><Delete /></el-icon> 删除
                </el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="canApprove && !isApproved(scope.row)"
              title="确定要审核该BOM吗？审核后将无法再编辑。"
              @confirm="handleApprove(scope.row)"
            >
              <template #reference>
                <el-button size="small" type="success">
                  <el-icon><Check /></el-icon> 审核
                </el-button>
              </template>
            </el-popconfirm>
            <el-popconfirm
              v-if="isApproved(scope.row)"
              title="确定要反审该BOM吗？反审后可修改。"
              @confirm="handleUnapprove(scope.row)"
              confirm-button-type="warning"
            >
              <template #reference>
                <el-button size="small" type="warning">
                  <el-icon><Close /></el-icon> 反审
                </el-button>
              </template>
            </el-popconfirm>
          </template>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <!-- 分页 -->
    <div class="pagination-container">
      <el-pagination
        background
        layout="total, sizes, prev, pager, next, jumper"
        :current-page="currentPage"
        :page-size="pageSize"
        :total="parseInt(total) || 0"
        :page-sizes="[10, 20, 50, 100]"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>
<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { View, Edit, Delete, Check, Close, RefreshRight } from '@element-plus/icons-vue'
import { DateFormatter } from '@/utils/commonHelpers'
const _props = defineProps({
  tableData: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  selectionMode: {
    type: Boolean,
    default: false
  },
  total: {
    type: [Number, String],
    default: 0
  },
  currentPage: {
    type: Number,
    default: 1
  },
  pageSize: {
    type: Number,
    default: 20
  },
  canUpdate: {
    type: Boolean,
    default: true
  },
  canDelete: {
    type: Boolean,
    default: true
  },
  canApprove: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits([
  'selection-change',
  'view',
  'edit',
  'upgrade',
  'delete',
  'approve',
  'unapprove',
  'update:currentPage',
  'update:pageSize',
  'size-change',
  'current-change'
])
const handleSelectionChange = (selection) => {
  emit('selection-change', selection)
}
const handleView = (row) => {
  emit('view', row)
}
const handleEdit = (row) => {
  emit('edit', row)
}
const handleUpgrade = (row) => {
  emit('upgrade', row)
}
const handleDelete = (row) => {
  emit('delete', row)
}
const handleApprove = (row) => {
  emit('approve', row)
}
const handleUnapprove = (row) => {
  emit('unapprove', row)
}
const handleSizeChange = (val) => {
  emit('update:pageSize', val)
  emit('size-change', val)
}
const handleCurrentChange = (val) => {
  emit('update:currentPage', val)
  emit('current-change', val)
}
// 判断是否为历史版本（status=2）
const isHistoryVersion = (row) => {
  return Number(row.status) === 2
}
// 辅助函数 - 正确处理approved字段的类型（可能是字符串"0"/"1"或数字0/1）
const isApproved = (row) => {
  // 优先使用approved字段，如果不存在则使用approved_by判断
  if (row.approved !== undefined) {
    return Number(row.approved) === 1
  }
  // 兜底：如果approved_by不为null则视为已审核
  return row.approvedBy !== null && row.approvedBy !== undefined
}
const getStatusType = (approved) => {
  return approved ? 'success' : 'warning'
}
const formatStatus = (approved) => {
  return approved ? '已审核' : '未审核'
}
</script>
