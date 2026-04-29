<template>
  <el-dialog
    title="查看物料详情"
    :model-value="modelValue"
    @update:model-value="val => emit('update:modelValue', val)"
    width="fit-content"
    style="min-width: 600px; max-width: 90vw;"
  >
    <div v-if="viewData">
      <el-descriptions :column="2" border class="custom-descriptions">
        <el-descriptions-item label="物料大类">
          {{ viewData.product_category_name || '未设置' }}
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
          {{ viewData.category_name }}
        </el-descriptions-item>
        <el-descriptions-item label="检验方式">
          {{ viewData.inspection_method_name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料来源">
          {{ viewData.material_source_name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="供应商">
          {{ viewData.supplier_name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="生产组">
          {{ viewData.production_group_name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="图号">
          {{ viewData.drawing_no || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="色号">
          {{ viewData.color_code || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="材质">
          {{ viewData.material_type || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="单位">
          {{ viewData.unit_name }}
        </el-descriptions-item>
        <el-descriptions-item label="仓库">
          {{ viewData.location_name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料负责人">
          {{ viewData.manager_name || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item label="物料位置">
          {{ viewData.location_detail || '未设置' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="canViewPrice" label="销售价格">
          ¥{{ viewData.price || 0 }}
        </el-descriptions-item>
        <el-descriptions-item v-if="canViewCost" label="采购成本">
          ¥{{ viewData.cost_price || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="安全库存">
          {{ viewData.safety_stock || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="最小库存">
          {{ viewData.min_stock || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="最大库存">
          {{ viewData.max_stock || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="税率">
          {{ viewData.tax_rate ? (Number(viewData.tax_rate) * 100) + '%' : '0%' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="String(viewData.status) === '1' ? 'success' : 'danger'">
            {{ String(viewData.status) === '1' ? '启用' : '禁用' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ formatDate(viewData.created_at) }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ formatDate(viewData.updated_at) }}
        </el-descriptions-item>
        <el-descriptions-item label="备注" :span="2">
          {{ viewData.remark || '无' }}
        </el-descriptions-item>
        <el-descriptions-item label="附件" :span="2">
          <template v-if="viewData.attachments && viewData.attachments.length">
            <div v-for="(file, index) in viewData.attachments" :key="index" style="margin-bottom: 4px;">
              <el-link type="primary" :href="file.url || file.file_path" target="_blank" :underline="false">
                <el-icon style="margin-right: 4px;"><Document /></el-icon>{{ file.original_name || file.name || file.file_name || '附件' + (index + 1) }}
              </el-link>
            </div>
          </template>
          <span v-else style="color: var(--color-text-secondary);">无</span>
        </el-descriptions-item>
      </el-descriptions>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { formatDate } from '@/utils/format'
import { Document } from '@element-plus/icons-vue'

defineProps({
  modelValue: Boolean,
  viewData: Object,
  canViewCost: { type: Boolean, default: false },  // 🔒 查看采购成本权限
  canViewPrice: { type: Boolean, default: false }  // 🔒 查看销售价格权限
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
/* 彻底解决等宽导致的换行问题：让描述列表自动适应内容宽度 */
.custom-descriptions :deep(table) {
  table-layout: auto !important;
  width: auto !important; /* 让表格包裹内容，不强制撑满宽度 */
  min-width: 100%; /* 至少撑满弹窗本身的宽度 */
}

/* 标签强制不换行，且收缩到最小必备宽度 */
.custom-descriptions :deep(.el-descriptions__label) {
  white-space: nowrap !important;
  width: 1% !important;
}

/* 内容在空间足够时不换行，实在不够才换行 */
.custom-descriptions :deep(.el-descriptions__content) {
  word-break: break-word;
}
</style>
