<template>
  <fieldset class="sampling-fields">
    <legend>检验方式与抽样依据</legend>
    <label>检验方式
      <el-select :model-value="mode" placeholder="请选择检验方式" @update:model-value="setMode">
        <el-option label="全数检验" value="full" /><el-option label="AQL抽样" value="aql" />
      </el-select>
    </label>
    <template v-if="mode === 'aql'">
      <label>AQL标准
        <el-select :model-value="modelValue.aqlStandardId" :loading="loading" filterable placeholder="请选择适用标准" @visible-change="value => value && loadStandards()" @update:model-value="selectStandard">
          <el-option v-for="rule in standards" :key="rule.id" :value="rule.id" :label="`${rule.name} · n=${Math.min(Number(rule.sampleSize), Number(quantity))} Ac=${rule.acceptLimit}/Re=${rule.rejectLimit}`" />
        </el-select>
      </label>
      <span>标准：{{ modelValue.aqlStandardName || '未选择' }}；Ac={{ modelValue.acceptLimit ?? '未配置' }} / Re={{ modelValue.rejectLimit ?? '未配置' }}</span>
    </template>
    <span>抽样数量：{{ mode === 'full' ? quantity : modelValue.sampleQuantity ?? '未配置' }}</span>
    <span v-if="mode === 'aql'">达到拒收数须按拒收流程处置，不得部分放行。</span>
  </fieldset>
</template>
<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index'
import { qualityApi } from '@/api/quality'
import { parseListData, parseResponseData } from '@/utils/responseParser'
import { getApiErrorMessage } from '@/utils/errorHandler'
const props = defineProps({ modelValue: { type: Object, required: true }, quantity: [Number, String] })
const emit = defineEmits(['update:modelValue'])
const loading = ref(false)
const standards = ref([])
const mode = computed(() => props.modelValue.isFullInspection ? 'full' : props.modelValue.isAql ? 'aql' : '')
const setMode = value => emit('update:modelValue', { ...props.modelValue, isFullInspection: value === 'full', isAql: value === 'aql' })
const loadStandards = async () => {
  if (loading.value) return
  loading.value = true
  try {
    const response = await qualityApi.getAqlStandards({ status: 'active', pageSize: 100, page: 1 })
    const rows = parseListData(response, { enableLog: false })
    const data = parseResponseData(response, {})
    const total = Number(data.total ?? rows.length)
    for (let page = 2; rows.length < total; page++) {
      const next = parseListData(await qualityApi.getAqlStandards({ status: 'active', pageSize: 100, page }), { enableLog: false })
      if (!next.length) break
      rows.push(...next)
    }
    const quantity = Number(props.quantity)
    standards.value = rows.filter(rule => (Number(rule.batchMin) <= quantity || (quantity === 1 && Number(rule.batchMin) === 2)) && Number(rule.batchMax) >= quantity)
    if (!standards.value.length) ElMessage.warning('当前批量没有适用的AQL标准，请先维护抽样标准')
  } catch (error) { ElMessage.error(getApiErrorMessage(error, '获取抽样标准失败')) }
  finally { loading.value = false }
}
const selectStandard = id => {
  const rule = standards.value.find(item => item.id === id)
  if (!rule) return
  emit('update:modelValue', { isFullInspection: false, isAql: true, aqlStandardId: rule.id, aqlStandardName: rule.name,
    sampleQuantity: Math.min(Number(rule.sampleSize), Number(props.quantity)), aqlLevel: rule.aqlLevel,
    acceptLimit: rule.acceptLimit, rejectLimit: rule.rejectLimit })
}
</script>
<style scoped>
.sampling-fields { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; margin: 12px 0; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 6px; }
.sampling-fields label { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.sampling-fields .el-select { min-width: 200px; max-width: 100%; }
</style>
