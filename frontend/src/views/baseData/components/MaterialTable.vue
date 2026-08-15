<template>
  <div class="material-table-container">
    <el-table
      v-loading="loading"
      :data="tableData"
      border
      class="w-full material-table--row-click"
      @row-click="handleRowClick"
    >
      <template #empty>
        <EmptyState description="暂无物料数据" />
      </template>
      <el-table-column prop="code" label="物料编码" width="120" show-overflow-tooltip></el-table-column>
      <el-table-column prop="name" label="物料名称" width="200" show-overflow-tooltip></el-table-column>
      <el-table-column prop="specs" label="规格型号" width="260" show-overflow-tooltip></el-table-column>
      <el-table-column label="物料类型" width="90" show-overflow-tooltip>
        <template #default="{ row }">{{ getMaterialTypeLabel(row.materialType || row.material_type) }}</template>
      </el-table-column>
      <el-table-column prop="categoryName" label="物料分类" width="140" show-overflow-tooltip></el-table-column>
      <el-table-column prop="materialSourceName" label="物料来源" width="90" show-overflow-tooltip></el-table-column>
      <el-table-column label="供应商" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ formatSupplierName(row) }}</template>
      </el-table-column>
      <el-table-column label="生产组" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.productionGroupName || row.production_group_name || '—' }}</template>
      </el-table-column>
      <el-table-column prop="unitName" label="单位" width="60" show-overflow-tooltip></el-table-column>
      <el-table-column prop="locationName" label="仓库" width="100" show-overflow-tooltip></el-table-column>
      <el-table-column prop="managerName" label="物料负责人" width="100" show-overflow-tooltip></el-table-column>
      <el-table-column label="销售价格" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ formatMaskedPrice(row.price, canViewPrice, formatCurrency) }}</template>
      </el-table-column>
      <el-table-column label="采购成本" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ formatMaskedPrice(row.costPrice, canViewCost, formatCurrency) }}</template>
      </el-table-column>

      <el-table-column prop="minStock" label="最小库存" width="85" show-overflow-tooltip></el-table-column>
      <el-table-column prop="maxStock" label="最大库存" width="85" show-overflow-tooltip></el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="scope">
          <el-tag :type="String(scope.row.status) === '1' ? 'success' : 'danger'">
            {{ String(scope.row.status) === '1' ? '启用' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" show-overflow-tooltip></el-table-column>
      <el-table-column label="操作" min-width="220" fixed="right" align="left" header-align="left" class-name="operation-column" header-class-name="operation-column-header">
        <template #default="scope">
          <div class="table-actions" @click.stop>
            <el-popconfirm
              v-if="canUpdate && String(scope.row.status) !== '1'"
              title="确定要启用该物料吗？"
              @confirm="emit('enable', scope.row)"
            >
              <template #reference>
                <el-button
                  size="small"
                  type="success"
                >
                  <el-icon><Check /></el-icon> 启用
                </el-button>
              </template>
            </el-popconfirm>

            <el-popconfirm
              v-if="canUpdate && String(scope.row.status) === '1'"
              title="确定要禁用该物料吗？"
              @confirm="emit('disable', scope.row)"
              confirm-button-type="danger"
            >
              <template #reference>
                <el-button
                  size="small"
                  type="warning"
                >
                  <el-icon><Close /></el-icon> 禁用
                </el-button>
              </template>
            </el-popconfirm>

            <el-button
              v-if="canUpdate && String(scope.row.status) !== '1'"
              size="small"
              @click="emit('edit', scope.row)"
            >
              <el-icon><Edit /></el-icon> 编辑
            </el-button>

            <el-popconfirm
              v-if="canDelete && String(scope.row.status) !== '1'"
              title="确定要删除该物料吗？此操作无法恢复。"
              @confirm="emit('delete', scope.row)"
              confirm-button-type="danger"
            >
              <template #reference>
                <el-button
                  size="small"
                  type="danger"
                >
                  <el-icon><Delete /></el-icon> 删除
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-container">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :small="false"
        :disabled="false"
        :background="true"
        layout="total, sizes, prev, pager, next, jumper"
        :total="Math.max(parseInt(total) || 0, 1)"
        @size-change="val => emit('update:pageSize', val)"
        @current-change="val => emit('update:currentPage', val)"
      />
    </div>
  </div>
</template>

<script setup>
import { Check, Close, Edit, Delete } from '@element-plus/icons-vue'
import { formatCurrency } from '@/utils/format'
import { formatMaskedPrice } from '@/utils/priceVisibility'
import { getMaterialTypeLabel } from '@/utils/materialTypes'

const formatSupplierName = (row) => {
  const name = row.supplierName || row.supplier_name
  if (name) return name
  const source = row.materialSourceName || row.material_source_name || ''
  if (source === '自制') return '自制'
  return '—'
}

defineProps({
  tableData: Array,
  loading: Boolean,
  total: [Number, String],
  currentPage: Number,
  pageSize: Number,
  canUpdate: Boolean,
  canDelete: Boolean,
  canViewCost: { type: Boolean, default: false },  // 🔒 查看采购成本权限
  canViewPrice: { type: Boolean, default: false }  // 🔒 查看销售价格权限
})

const emit = defineEmits([
  'view',
  'edit',
  'delete',
  'enable',
  'disable',
  'update:currentPage',
  'update:pageSize'
])

const handleRowClick = (row, column, event) => {
  if (column?.className?.includes('operation-column')) return
  if (event?.target?.closest?.('.table-actions, .el-button, .el-popper, .el-popconfirm')) return
  emit('view', row)
}
</script>

<style scoped>
.material-table--row-click :deep(.el-table__body tr) {
  cursor: pointer;
}
</style>
