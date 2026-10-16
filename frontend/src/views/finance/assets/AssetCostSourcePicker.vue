<template>
  <div class="w-full">
    <el-select :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
      filterable remote clearable :remote-method="load" :loading="loading" class="w-full"
      placeholder="按凭证号查找已过账成本" @visible-change="visible => visible && load('')">
      <el-option v-if="modelValue && !sources.some(item => item.id === modelValue)"
        :value="modelValue" label="已关联的成本凭证明细" />
      <el-option v-for="item in sources" :key="item.id" :value="item.id"
        :label="`${item.entryNumber} · ${item.description || '成本明细'} · 可分配 ${Number(item.availableAmount).toFixed(2)}`" />
    </el-select>
    <p class="text-secondary">选择已按实际付款、应付或期初来源入账的凭证。关联时核对可分配金额，不重复记账。</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>
<script setup>
import { ref } from 'vue'
import { financeApi } from '@/api/finance'
import { getApiErrorMessage } from '@/utils/errorHandler'
const props = defineProps({ modelValue: { type: Number, default: null }, kind: { type: String, default: 'asset' } })
defineEmits(['update:modelValue'])
const sources = ref([])
const loading = ref(false)
const error = ref('')
let requestId = 0
const load = async (search) => {
  const current = ++requestId
  loading.value = true
  error.value = ''
  try {
    const response = await financeApi.getAssetCostSources({ kind: props.kind, search })
    if (current === requestId) sources.value = response.data || []
  } catch (e) {
    if (current === requestId) error.value = getApiErrorMessage(e, '成本来源加载失败')
  } finally {
    if (current === requestId) loading.value = false
  }
}
</script>
