<!--
/**
 * ProductionPlanTable.vue
 * @description 仪表盘生产计划表格组件
 */
-->
<template>
  <div class="warning-container">
    <div class="table-wrapper">
      <el-table
        :data="warningList"
        row-class-name="warning-row"
        :empty-text="'暂无生产计划'"
        class="table-row-click dashboard-table production-table"
      
      @row-click="(row, column, event) => handleTableRowView(row, column, event, () => emit('view', row.id))">
        <el-table-column prop="studentId" label="计划编号" min-width="120" />
        <el-table-column prop="name" label="产品名称" min-width="120" />
        <el-table-column prop="studentType" label="产品规格" min-width="120" show-overflow-tooltip />
        <el-table-column prop="protectionId" label="计划数量" min-width="100" />
        <el-table-column label="状态" min-width="80">
          <template #default="{ row }">
            <el-tag :type="getWarningTagType(row.status)" size="small" effect="light">
              {{ row.warningType }}
            </el-tag>
          </template>
        </el-table-column>
                <!-- 空状态插槽 -->
        <template #empty>
          <div class="empty-state">
            <el-icon class="empty-icon"><Document /></el-icon>
            <p class="empty-text">暂无生产计划</p>
            <p class="empty-desc">当前没有进行中的生产计划</p>
          </div>
        </template>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { handleTableRowView } from '@/utils/tableRowView'
import { Document, View } from '@element-plus/icons-vue'

defineProps({
  warningList: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['view'])

// 内联状态标签类型映射
const WARNING_TAG_MAP = {
  'draft': 'info',
  'preparing': 'warning',
  'material_issuing': 'warning',
  'material_issued': 'primary',
  'in_progress': 'primary',
  'inspection': 'warning',
  'warehousing': 'success',
  'completed': 'success',
  'cancelled': 'danger'
}

const getWarningTagType = (status) => WARNING_TAG_MAP[status] || 'info'
</script>
