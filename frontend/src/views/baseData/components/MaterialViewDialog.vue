<template>
  <AppDialog
    title="查看物料详情"
    mode="view"
    width="700px"
    :model-value="modelValue"
    :detail-navigation="detailNavigation"
    @update:model-value="val => emit('update:modelValue', val)"
  >
    <div v-if="viewData" class="material-view-content">
      <el-descriptions :column="2" border class="custom-descriptions">
        <el-descriptions-item label="物料大类">
          {{ viewData.productCategoryName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料编码">
          <el-button
            v-if="canLocateBom && viewData.code"
            type="primary"
            link
            title="查看零部件定位结果"
            @click="emit('locate', viewData)"
          >{{ viewData.code }}</el-button>
          <span v-else>{{ viewData.code }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="物料名称">
          {{ viewData.name }}
        </el-descriptions-item>
        <el-descriptions-item label="规格型号">
          {{ viewData.specs || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料类型">
          {{ getMaterialTypeLabel(viewData.materialType) }}
        </el-descriptions-item>
        <el-descriptions-item label="物料分类">
          {{ viewData.categoryName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="检验方式">
          {{ viewData.inspectionMethodName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料来源">
          {{ viewData.materialSourceName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="供应商">
          {{ viewData.supplierName || (viewData.materialSourceName === '自制' ? '自制' : '未设置') }}
        </el-descriptions-item>
        <el-descriptions-item label="生产组">
          {{ viewData.productionGroupName || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料号">
          {{ viewData.drawingNo || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="色号">
          {{ viewData.colorCode || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="材料">
          {{ viewData.material || '无' }}
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
        <el-descriptions-item label="销售价格">
          {{ formatMaskedPrice(viewData.price, canViewPrice, formatCurrency) }}
        </el-descriptions-item>
        <el-descriptions-item label="采购成本">
          {{ formatMaskedPrice(viewData.costPrice, canViewCost, formatCurrency) }}
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
        <!-- 税率属价格敏感字段，无价格权限时不展示 -->
        <el-descriptions-item label="税率">
          {{ canViewPrice || canViewCost ? formatTaxRate(viewData.taxRate) : '***' }}
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
              <el-link v-if="isImageAttachment(file)" type="primary" :underline="false" @click="previewImage(file)">
                <el-icon class="mr-sm"><Document /></el-icon>{{ file.fileName || file.name || '附件' + (index + 1) }}
              </el-link>
              <el-link v-else type="primary" :href="file.url || file.filePath" target="_blank" :underline="false">
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
  <AppDialog v-model="imagePreviewVisible" mode="preview" :title="imagePreviewTitle" width="min(900px, 90vw)">
    <div class="material-image-preview">
      <el-image :src="imagePreviewUrl" fit="contain">
        <template #error><span class="text-muted">图片加载失败，请关闭后重试</span></template>
      </el-image>
    </div>
  </AppDialog>
</template>

<script setup>
import { ref, watch } from 'vue'
import { formatCurrency, formatDate } from '@/utils/format'
import { formatMaskedPrice } from '@/utils/priceVisibility'
import { Document } from '@element-plus/icons-vue'
import { getMaterialTypeLabel } from '@/utils/materialTypes'

const props = defineProps({
  modelValue: Boolean,
  viewData: Object,
  canViewCost: { type: Boolean, default: false },
  canViewPrice: { type: Boolean, default: false },
  canLocateBom: { type: Boolean, default: false },
  detailNavigation: { type: Object, default: null }
})
const emit = defineEmits(['update:modelValue', 'locate'])
const imagePreviewVisible = ref(false)
const imagePreviewUrl = ref('')
const imagePreviewTitle = ref('图片预览')
const isImageAttachment = file => {
  const type = file.fileType || file.type || ''
  const name = file.fileName || file.name || file.url || file.filePath || ''
  return type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg|avif)(?:[?#].*)?$/i.test(name)
}
const previewImage = file => {
  imagePreviewUrl.value = file.url || file.filePath || ''
  imagePreviewTitle.value = file.fileName || file.name || '图片预览'
  imagePreviewVisible.value = true
}
watch(() => [props.modelValue, props.viewData], () => { imagePreviewVisible.value = false })

const formatTaxRate = (value) => {
  if (value === null || value === undefined || value === '') return '-'
  const rate = Number(value)
  if (Number.isNaN(rate)) return '-'
  return `${(rate * 100).toFixed(0)}%`
}
</script>

<style scoped>
.material-image-preview { display: flex; justify-content: center; align-items: center; min-height: 160px; }
.material-image-preview .el-image { width: 100%; height: 65vh; }

.material-view-content {
  width: 100%;
}

.custom-descriptions {
  width: 100%;
}

.custom-descriptions :deep(.el-descriptions__table) {
  table-layout: fixed;
  width: 100%;
}

.custom-descriptions :deep(.el-descriptions__label) {
  white-space: nowrap;
  width: 104px;
  min-width: 85px;
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
    width: 80px;
    min-width: 70px;
  }
}
</style>
