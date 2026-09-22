<template>
  <AppDialog
    :model-value="modelValue"
    title="零部件定位结果"
    mode="view"
    :width="BOM_DIALOG_WIDTH"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-alert
      v-if="loading"
      title="正在定位物料…"
      type="info"
      :closable="false"
      class="mb-md"
    />
    <el-alert
      v-else-if="error"
      :title="error"
      type="error"
      :closable="false"
      class="mb-md"
    />
    <el-alert
      v-else-if="results.length > 0"
      :title="`共找到 ${results.length} 个BOM包含物料 '${keyword}'`"
      type="success"
      :closable="false"
      class="mb-md"
    />
    <el-alert
      v-else
      :title="`未找到包含物料 '${keyword}' 的BOM`"
      type="warning"
      :closable="false"
      class="mb-md"
    />
    <el-table v-if="!loading && !error && results.length > 0" :data="results" border max-height="400">
      <el-table-column prop="productCode" label="产品编码" width="130" />
      <el-table-column prop="productName" label="产品名称" min-width="150" />
      <el-table-column prop="version" label="BOM版本" width="100" />
      <el-table-column prop="materialCode" label="物料编码" width="130" />
      <el-table-column prop="materialName" label="物料名称" min-width="130" />
      <el-table-column prop="quantity" label="用量" width="80" />
      <el-table-column prop="unit" label="单位" width="70" />
    </el-table>
    <template #footer>
      <el-button
        v-if="canExport"
        type="primary"
        :icon="Download"
        :loading="exportLoading"
        :disabled="exportDisabled"
        @click="handleExport"
      >
        导出
      </el-button>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
    </template>
  </AppDialog>
</template>

<script setup>
import { computed } from 'vue'
import { Download } from '@element-plus/icons-vue'
import { useExportExcel } from '@/composables/useExportExcel'
import { BOM_DIALOG_WIDTH } from '@/constants/bom'

const props = defineProps({
  modelValue: Boolean,
  keyword: { type: String, default: '' },
  results: { type: Array, default: () => [] },
  canExport: Boolean,
  loading: Boolean,
  error: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
const { exportLoading, exportToExcel } = useExportExcel()
const exportDisabled = computed(() => props.loading || Boolean(props.error) || props.results.length === 0)

const handleExport = () => {
  if (!props.canExport || exportDisabled.value) return

  exportToExcel({
    columns: [
      { header: '产品编码', key: 'productCode', width: 20 },
      { header: '产品名称', key: 'productName', width: 25 },
      { header: 'BOM版本', key: 'version', width: 12 },
      { header: '物料编码', key: 'materialCode', width: 20 },
      { header: '物料名称', key: 'materialName', width: 25 },
      { header: '用量', key: 'quantity', width: 12 },
      { header: '单位', key: 'unit', width: 10 },
    ],
    data: props.results,
    filename: '零部件定位结果',
    sheetName: '定位结果',
  })
}
</script>
