<!--
/**
 * FirstArticleViewDialog.vue
 * @description 首检详情查看弹窗
 */
-->
<template>
  <el-dialog v-model="dialogVisible" title="首检详情" width="700px" destroy-on-close>
    <el-descriptions :column="2" border>
      <el-descriptions-item label="检验单号">{{ inspection?.inspection_no }}</el-descriptions-item>
      <el-descriptions-item label="生产任务号">{{ inspection?.task_code }}</el-descriptions-item>
      <el-descriptions-item label="产品编码">{{ inspection?.product_code }}</el-descriptions-item>
      <el-descriptions-item label="产品名称">{{ inspection?.product_name }}</el-descriptions-item>
      <el-descriptions-item label="批次号">{{ inspection?.batch_no }}</el-descriptions-item>
      <el-descriptions-item label="检验类型">
        <el-tag :type="inspection?.is_full_inspection ? 'warning' : 'primary'" size="small">
          {{ inspection?.is_full_inspection ? '全检' : '抽检' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="检验数量">{{ inspection?.quantity }} {{ inspection?.unit }}</el-descriptions-item>
      <el-descriptions-item label="合格数量">{{ inspection?.qualified_quantity || 0 }} {{ inspection?.unit }}</el-descriptions-item>
      <el-descriptions-item label="不合格数量">{{ inspection?.unqualified_quantity || 0 }} {{ inspection?.unit }}</el-descriptions-item>
      <el-descriptions-item label="首检结果">
        <el-tag :type="getResultType(inspection?.first_article_result)">
          {{ getResultText(inspection?.first_article_result) }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="可继续生产">
        <el-tag :type="inspection?.production_can_continue ? 'success' : 'info'" size="small">
          {{ inspection?.production_can_continue ? '是' : '否' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="检验员">{{ inspection?.inspector_name || '-' }}</el-descriptions-item>
      <el-descriptions-item label="计划日期">{{ formatDate(inspection?.planned_date) }}</el-descriptions-item>
      <el-descriptions-item label="实际日期">{{ formatDate(inspection?.actual_date) }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ inspection?.note || '-' }}</el-descriptions-item>
    </el-descriptions>

    <!-- 检验项目明细 -->
    <div v-if="inspectionItems.length > 0" style="margin-top: 20px;">
      <el-divider content-position="left">检验项目明细</el-divider>
      <el-table :data="inspectionItems" border size="small">
        <el-table-column prop="item_name" label="检验项目" />
        <el-table-column prop="standard_value" label="标准值" />
        <el-table-column prop="actual_value" label="实测值" />
        <el-table-column prop="result" label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="row.result === 'passed' ? 'success' : 'danger'" size="small">
              {{ row.result === 'passed' ? '合格' : '不合格' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" />
      </el-table>
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { qualityApi } from '@/api/quality'
import 'dayjs'
import { formatDate } from '@/utils/helpers/dateUtils'

const props = defineProps({ visible: Boolean, inspection: Object })
const emit = defineEmits(['update:visible'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const inspectionItems = ref([])

// 获取检验项目明细
const fetchItems = async () => {
  if (!props.inspection?.id) return
  try {
    const res = await qualityApi.getFirstArticleInspection(props.inspection.id)
    const data = res.data || res
    inspectionItems.value = data.items || []
  } catch (error) {
    console.error('获取检验项目失败:', error)
  }
}

watch(() => props.visible, (val) => {
  if (val && props.inspection?.id) {
    fetchItems()
  }
})

// formatDate: 使用公共实现
const getResultText = (result) => ({
  pending: '待检验',
  passed: '合格',
  failed: '不合格',
  conditional: '有条件放行'
}[result] || '未知')
</script>

