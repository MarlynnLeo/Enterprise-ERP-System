<template>
  <AppDialog :model-value="modelValue" title="业务凭证生成结果" mode="view" width="1060px" @update:model-value="$emit('update:modelValue', $event)">
    <template v-if="result">
      <p class="batch-summary" role="status">新开发票 {{ result.successCount || 0 }} 张 · 复用发票 {{ result.skippedCount || 0 }} 张 · 失败 {{ result.failedCount || 0 }} 张</p>
      <p class="batch-note">各来源单据的发票、应收应付凭证与成本凭证分别列示。关闭后可在录入窗口中再次查看本次结果。</p>
      <el-table v-if="rows.length" :data="rows" border row-key="id">
        <el-table-column prop="docNo" label="来源单据" min-width="160" />
        <el-table-column label="结果" width="95"><template #default="{ row }"><el-tag :type="row.success === false ? 'danger' : row.skipped ? 'info' : 'success'">{{ row.success === false ? '失败' : row.skipped ? '已存在' : '成功' }}</el-tag></template></el-table-column>
        <el-table-column :label="isSales ? '应收发票' : '应付发票'" min-width="180"><template #default="{ row }">
          <a v-if="row.invoiceId" :href="invoiceHref(row.invoiceId)" target="_blank" rel="noopener">{{ row.invoiceNumber || `发票 #${row.invoiceId}` }}</a><span v-else>{{ row.invoiceNumber || '—' }}</span>
          <small v-if="row.invoiceId || row.invoiceNumber">{{ row.skipped ? '复用' : '新开' }}</small>
        </template></el-table-column>
        <el-table-column :label="isSales ? '应收凭证' : '应付凭证'" min-width="180"><template #default="{ row }">
          <a v-if="row.entryId" :href="entryHref(row.entryId)" target="_blank" rel="noopener">{{ row.entryNumber || `凭证 #${row.entryId}` }}</a><span v-else>{{ row.entryNumber || '未返回关联凭证' }}</span>
          <small v-if="row.entryId || row.entryNumber">{{ row.skipped ? '复用' : '生成' }}</small>
        </template></el-table-column>
        <el-table-column v-if="isSales" label="销售成本凭证" min-width="180"><template #default="{ row }">
          <template v-if="row.cost?.entryId"><a :href="entryHref(row.cost.entryId)" target="_blank" rel="noopener">{{ row.cost.entryNumber || `凭证 #${row.cost.entryId}` }}</a><small>{{ row.cost.existing ? '复用' : '生成' }}</small></template>
          <span v-else>{{ row.cost?.entryNumber || '未返回成本凭证' }}</span>
        </template></el-table-column>
        <el-table-column prop="message" label="说明" min-width="180" />
      </el-table>
      <p v-else>服务未返回逐单结果，请通过发票与凭证列表核对。</p>
    </template>
    <template #footer><el-button type="primary" @click="$emit('update:modelValue', false)">关闭结果</el-button></template>
  </AppDialog>
</template>

<script setup>
import { computed } from 'vue'
import AppDialog from '@/components/ui/AppDialog.vue'

const props = defineProps({ modelValue: Boolean, result: { type: Object, default: null } })
defineEmits(['update:modelValue'])
const isSales = computed(() => props.result?.businessType === 'sales_outbound')
const rows = computed(() => (props.result?.results || []).map(item => {
  const source = props.result?.sourceDocs?.find(row => String(row.id) === String(item.id))
  const merged = item.success !== false && !item.skipped ? props.result?.mergedEntry : null
  const sideCost = item.sideEffects?.cost
  return {
    ...item,
    docNo: item.docNo || item.orderNo || source?.docNo || `来源 #${item.id}`,
    entryId: item.entryId || merged?.entryId || null,
    entryNumber: item.entryNumber || merged?.entryNumber || null,
    cost: props.result?.costEntries?.find(cost => String(cost.sourceId) === String(item.id)) ||
      (sideCost?.entryId ? { ...sideCost, existing: sideCost.skipped === true } : null),
  }
}))
const invoiceHref = id => `/finance/${isSales.value ? 'ar' : 'ap'}/invoices?invoiceId=${encodeURIComponent(id)}`
const entryHref = id => `/finance/gl/entries?entryId=${encodeURIComponent(id)}`
</script>

<style scoped>
.batch-summary { font-weight: 600; margin: 0 0 8px; }
.batch-note { margin: 0 0 16px; color: var(--el-text-color-secondary); }
a { color: var(--el-color-primary); text-decoration: none; }
a:hover { text-decoration: underline; }
small { display: block; color: var(--el-text-color-secondary); }
</style>
