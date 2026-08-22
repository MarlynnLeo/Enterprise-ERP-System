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
      <el-table-column prop="specs" label="规格型号" width="200" show-overflow-tooltip></el-table-column>

      <el-table-column label="物料类型" width="90" show-overflow-tooltip>
        <template #default="{ row }">{{ getMaterialTypeLabel(row.materialType) }}</template>
      </el-table-column>
      <el-table-column prop="categoryName" label="物料分类" width="140" show-overflow-tooltip></el-table-column>
      <el-table-column prop="materialSourceName" label="物料来源" width="90" show-overflow-tooltip></el-table-column>
      <el-table-column label="供应商" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ formatSupplierName(row) }}</template>
      </el-table-column>
      <el-table-column label="生产组" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.productionGroupName || '—' }}</template>
      </el-table-column>
      <el-table-column prop="unitName" label="单位" width="60" show-overflow-tooltip></el-table-column>
      <el-table-column prop="locationName" label="仓库" width="100" show-overflow-tooltip></el-table-column>
      <el-table-column prop="managerName" label="物料负责人" width="100" show-overflow-tooltip></el-table-column>


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
      <el-table-column
        label="操作"
        min-width="72"
        fixed="right"
        align="left"
        header-align="left"
        class-name="operation-column"
        header-class-name="operation-column-header"
      >
        <template #default="scope">
          <TableRowActions
            :row="scope.row"
            :can-update="canUpdate"
            :can-delete="canDelete"
            resource-label="物料"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @enable="emit('enable', $event)"
            @disable="emit('disable', $event)"
          />
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
import { getMaterialTypeLabel } from '@/utils/materialTypes'
import TableRowActions from '@/components/common/TableRowActions.vue'

const formatSupplierName = (row) => {
  const name = row.supplierName
  if (name) return name
  const source = row.materialSourceName || ''
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
