<!--
/**
 * DetailDialog.vue
 * @description 检验单详情查看弹窗
 * @date 2026-04-03
 * @version 1.0.0
 *
 * 职责：
 * - 检验单基本信息展示
 * - 检验项目表格（只读）
 */
-->
<template>
  <el-dialog v-model="dialogVisible" :title="`检验详情 - ${inspection?.inspectionNo || inspection?.inspection_no || ''}`" width="55%" destroy-on-close>
    <div v-loading="loading">
      <template v-if="inspection">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="检验单号">{{ inspection.inspectionNo || inspection.inspection_no }}</el-descriptions-item>
          <el-descriptions-item label="采购单号">{{ inspection.purchaseOrderNo || inspection.reference_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getQualityStatusColor(inspection.status)">{{ getQualityStatusText(inspection.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="物料编码">{{ inspection.item_code || inspection.material_code || '-' }}</el-descriptions-item>
          <el-descriptions-item label="物料名称">{{ inspection.product_name || inspection.materialName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="产品型号">{{ inspection.product_code || inspection.specs || '-' }}</el-descriptions-item>
          <el-descriptions-item label="供应商">{{ inspection.supplierName || inspection.supplier_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="批次号">{{ inspection.batchNo || inspection.batch_no || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检验数量">{{ Math.floor(inspection.quantity || 0) }}</el-descriptions-item>
          <el-descriptions-item label="合格数">
            <span v-if="inspection.qualified_quantity !== null && inspection.qualified_quantity !== undefined" style="color: var(--color-success); font-weight: bold;">{{ Math.floor(inspection.qualified_quantity) }}</span>
            <span v-else style="color: var(--color-text-secondary);">-</span>
          </el-descriptions-item>
          <el-descriptions-item label="不合格数">
            <span v-if="inspection.unqualified_quantity > 0" style="color: var(--color-danger); font-weight: bold;">{{ Math.floor(inspection.unqualified_quantity) }}</span>
            <span v-else style="color: var(--color-text-secondary);">{{ inspection.unqualified_quantity === 0 ? '0' : '-' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="检验日期">{{ inspection.inspectionDate || inspection.actual_date || '-' }}</el-descriptions-item>
          <el-descriptions-item label="检验员">{{ inspection.inspector || inspection.inspector_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ inspection.note || '-' }}</el-descriptions-item>
        </el-descriptions>

        <!-- 检验项目 -->
        <template v-if="inspection.items && inspection.items.length > 0">
          <el-divider content-position="left">检验项目</el-divider>
          <el-table :data="inspection.items" border style="width: 100%" max-height="300">
            <el-table-column prop="item_name" label="检验项目" width="100" show-overflow-tooltip />
            <el-table-column label="标准" min-width="80" show-overflow-tooltip>
              <template #default="{ row }">{{ row.standard || row.dimension_info || '-' }}</template>
            </el-table-column>
            <el-table-column label="测量值" align="center">
              <el-table-column v-for="n in 6" :key="n" :label="`${n}#`" min-width="55" align="center">
                <template #default="{ row }">
                  <span :style="{ color: row[`measure_${n}`] ? '#303133' : '#C0C4CC' }">{{ row[`measure_${n}`] || '-' }}</span>
                </template>
              </el-table-column>
            </el-table-column>
            <el-table-column label="范围/平均" width="100" align="center">
              <template #default="{ row }">
                <span :style="{ color: row.result === 'passed' || row.result === 'pass' ? '#67C23A' : row.result === 'failed' || row.result === 'fail' ? '#F56C6C' : '', fontWeight: 'bold' }">
                  {{ row.actual_value || '-' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="结果" width="80" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.result === 'pass' || row.result === 'passed' || row.result === '合格'" type="success" size="small">合格</el-tag>
                <el-tag v-else-if="row.result === 'fail' || row.result === 'failed' || row.result === '不合格'" type="danger" size="small">不合格</el-tag>
                <span v-else style="color: var(--color-text-secondary);">{{ row.result || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="remarks" label="备注" min-width="100" show-overflow-tooltip />
          </el-table>
        </template>
      </template>
      <el-empty v-else-if="!loading" description="暂无数据" />
    </div>
    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
      <el-button v-if="inspection?.status === 'pending'" type="primary" @click="handleGoInspect">去检验</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { getQualityStatusText, getQualityStatusColor } from '@/constants/systemConstants'
import { qualityApi } from '@/services/api'
import { fetchInspectionDetailWithItems, extractMaterialNameSimple, extractMaterialSpecsSimple, extractSupplierNameSimple } from '@/utils/inspectionHelpers'

const props = defineProps({
  visible: Boolean,
  row: { type: Object, default: null }
})

const emit = defineEmits(['update:visible', 'inspect'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const loading = ref(false)
const inspection = ref(null)

// 监听弹窗打开时加载数据
watch(() => props.visible, async (val) => {
  if (val && props.row) {
    loading.value = true
    try {
      inspection.value = await fetchInspectionDetailWithItems(
        props.row.id,
        props.row,
        extractMaterialNameSimple,
        extractMaterialSpecsSimple,
        extractSupplierNameSimple
      )
    } catch (error) {
      console.error('获取检验单详情失败:', error)
      inspection.value = props.row
    } finally {
      loading.value = false
    }
  }
})

const handleGoInspect = () => {
  dialogVisible.value = false
  emit('inspect', inspection.value)
}
</script>

<style scoped>
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
