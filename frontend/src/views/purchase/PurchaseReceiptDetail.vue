<!--
/**
 * PurchaseReceiptDetail.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div>
    <div class="page-header">
      <el-row justify="space-between" align="middle">
        <el-col>
          <h2>{{ $t('采购.入库单详情') }}</h2>
        </el-col>
        <el-col style="text-align: right;">
          <div style="display: inline-flex; gap: 8px;">
            <TraceabilityGenerateButton @generated="handleTraceabilityGenerated" />
            <!-- 其他按钮 -->
          </div>
        </el-col>
      </el-row>
    </div>
    
    <!-- 其他内容 -->
  </div>
</template>

<script>



import { ElMessage } from 'element-plus';
import TraceabilityGenerateButton from '../../components/traceability/TraceabilityGenerateButton.vue';

export default {
  components: {
    TraceabilityGenerateButton
  },

  setup() {
    // 处理追溯生成完成事件
    const handleTraceabilityGenerated = (data) => {
      if (data.count > 0) {
        ElMessage.success(`成功生成 ${data.count} 条追溯记录，您可以在质量追溯管理中查看`);
      }
    };

    return {
      handleTraceabilityGenerated
    };
  }
};
</script>

<style scoped>


/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style> 