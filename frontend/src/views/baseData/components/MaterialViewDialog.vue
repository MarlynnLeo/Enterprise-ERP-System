<template>
  <AppDialog
    title="查看物料详情"
    mode="view"
    :model-value="modelValue"
    content-width="default"
    @update:model-value="val => emit('update:modelValue', val)"
  >
    <div v-if="viewData" class="material-view-content">
      <el-descriptions :column="2" border class="custom-descriptions">
        <el-descriptions-item label="物料大类">
          {{ viewData.productCategoryName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料编码">
          {{ viewData.code }}
        </el-descriptions-item>
        <el-descriptions-item label="物料名称">
          {{ viewData.name }}
        </el-descriptions-item>
        <el-descriptions-item label="规格型号">
          {{ viewData.specs || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料类型">
          {{ viewData.categoryName }}
        </el-descriptions-item>
        <el-descriptions-item label="检验方式">
          {{ viewData.inspectionMethodName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料来源">
          {{ viewData.materialSourceName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="供应商">
          {{ viewData.supplierName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="生产组">
          {{ viewData.production_group_name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="图号">
          {{ viewData.drawingNo || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="色号">
          {{ viewData.colorCode || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="材质">
          {{ viewData.materialType || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="单位">
          {{ viewData.unitName }}
        </el-descriptions-item>
        <el-descriptions-item label="仓库">
          {{ viewData.locationName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料负责人">
          {{ viewData.managerName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料位置">
          {{ viewData.locationDetail || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="canViewPrice" label="销售价格">
          {{ formatCurrency(viewData.price) }}
        </el-descriptions-item>
        <el-descriptions-item v-if="canViewCost" label="采购成本">
          {{ formatCurrency(viewData.costPrice) }}
        </el-descriptions-item>
        <el-descriptions-item label="安全库存">
          {{ viewData.safetyStock || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="最小库存">
          {{ viewData.minStock || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="最大库存">
          {{ viewData.maxStock || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="税率">
          {{ formatTaxRate(viewData.taxRate) }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="String(viewData.status) === '1' ? 'success' : 'danger'">
            {{ String(viewData.status) === '1' ? '启用' : '禁用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDate(viewData.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDate(viewData.updatedAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">
          {{ viewData.remark || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="附件" :span="2">
          <template v-if="viewData.attachments && viewData.attachments.length">
            <div v-for="(file, index) in viewData.attachments" :key="index" class="mb-xs">
              <el-link type="primary" :href="file.url || file.filePath" target="_blank" :underline="false">
                <el-icon class="mr-sm"><Document /></el-icon>{{ file.fileName || file.name || '附件' + (index + 1) }}
              </el-link>
            </div>
          </template>
          <span v-else class="text-muted">无</span>
        </el-descriptions-item>
      </el-descriptions>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </AppDialog>
</template>

<script setup>
import { formatCurrency, formatDate } from '@/utils/format'
import { Document } from '@element-plus/icons-vue'

defineProps({
  modelValue: Boolean,
  viewData: Object,
  canViewCost: { type: Boolean, default: false },
  canViewPrice: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const formatTaxRate = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  const rate = Number(value)
  if (Number.isNaN(rate)) return '-'
  return `${(rate * 100).toFixed(0)}%`
}
</script>

<style scoped>
.custom-descriptions :deep(table) {
  table-layout: fixed;
  width: 100%;
}

.custom-descriptions :deep(.el-descriptions__label) {
  white-space: nowrap;
  width: 112px;
  min-width: 96px;
  color: var(--color-text-secondary);
}

.custom-descriptions :deep(.el-descriptions__content) {
  min-width: 0;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: var(--color-text-primary);
}

.custom-descriptions :deep(.el-link) {
  max-width: 100%;
  vertical-align: top;
}

.custom-descriptions :deep(.el-link__inner) {
  min-width: 0;
  max-width: 100%;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
}

@media (max-width: 768px) {
  .custom-descriptions :deep(.el-descriptions__label) {
    width: 92px;
    min-width: 80px;
  }
}
</style>
