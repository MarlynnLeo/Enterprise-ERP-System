<template>
  <el-alert
    v-if="summary?.isReconciled === false"
    type="warning"
    show-icon
    :closable="false"
    title="现金流量表尚未完成勾稽核对"
    class="mb-4"
  >
    <p>分类现金流与总账现金变动差额：{{ formatAmount(summary.reconciliationDifference) }} {{ unitText }}。</p>
    <p v-if="summary.ambiguousEntryIds?.length">有 {{ summary.ambiguousEntryIds.length }} 张混合用途凭证需要核对现金流分类。</p>
    <p>期末现金余额取自总账；请完成差额及凭证核对后再使用本报表。</p>
  </el-alert>
</template>

<script setup>
import { formatAmount } from '@/utils/format';

defineProps({
  summary: { type: Object, default: null },
  unitText: { type: String, default: '元' },
});
</script>
