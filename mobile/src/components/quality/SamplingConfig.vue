<template>
  <CellGroup inset title="检验方式与抽样依据">
    <Cell title="全数检验">
      <template #right-icon><Switch :model-value="!!inspection.isFullInspection" :disabled="!editable" size="24" @update:model-value="setFull" /></template>
    </Cell>
    <Field v-if="!inspection.isFullInspection" label="AQL标准" :model-value="inspection.aqlStandardName || inspection.samplingPlan || ''" readonly :is-link="editable" placeholder="请选择抽样标准" @click="editable && openAql()" />
    <Cell title="抽样数量" :value="inspection.isFullInspection ? inspection.quantity : inspection.sampleQuantity ?? '未配置'" />
    <Cell v-if="!inspection.isFullInspection" title="接收 / 拒收数" :value="`Ac=${inspection.acceptLimit ?? '未配置'} / Re=${inspection.rejectLimit ?? '未配置'}`" />
    <Popup v-model:show="showPicker" position="bottom" round><Picker title="选择AQL标准" :columns="options" @confirm="selectAql" @cancel="showPicker = false" /></Popup>
  </CellGroup>
</template>
<script setup>
import { ref } from 'vue'
import { CellGroup, Cell, Field, Switch, Popup, Picker, showToast } from 'vant'
import { qualityApi } from '@/api'
import { extractApiList, extractApiTotal } from '@/utils/apiHelper'
import { getApiErrorMessage } from '@/utils/errorHandler'
const props = defineProps({ inspection: { type: Object, required: true }, editable: Boolean })
const emit = defineEmits(['update:inspection'])
const showPicker = ref(false)
const options = ref([])
const setFull = value => emit('update:inspection', { ...props.inspection, isFullInspection: value, isAql: !value })
const openAql = async () => {
  try {
    const response = await qualityApi.getAqlStandards({ status: 'active', pageSize: 100 })
    const rules = extractApiList(response)
    const total = extractApiTotal(response, rules.length)
    for (let page = 2; rules.length < total; page++) {
      const next = extractApiList(await qualityApi.getAqlStandards({ status: 'active', pageSize: 100, page }))
      if (!next.length) break
      rules.push(...next)
    }
    const quantity = Number(props.inspection.quantity)
    options.value = rules.filter(rule => (Number(rule.batchMin) <= quantity || (quantity === 1 && Number(rule.batchMin) === 2)) && Number(rule.batchMax) >= quantity)
      .map(standard => ({ text: `${standard.name} · n=${Math.min(Number(standard.sampleSize), quantity)} Ac=${standard.acceptLimit}/Re=${standard.rejectLimit}`, value: standard.id, standard }))
    if (!options.value.length) { showToast('当前批量没有适用的 AQL 标准，请先维护'); return }
    showPicker.value = true
  } catch (error) { showToast(getApiErrorMessage(error, '抽样标准加载失败')) }
}
const selectAql = ({ selectedOptions }) => {
  const rule = selectedOptions[0]?.standard
  if (!rule) return
  emit('update:inspection', { ...props.inspection, isFullInspection: false, isAql: true, aqlStandardId: rule.id, aqlStandardName: rule.name,
    sampleQuantity: Math.min(Number(rule.sampleSize), Number(props.inspection.quantity)), aqlLevel: rule.aqlLevel, acceptLimit: rule.acceptLimit, rejectLimit: rule.rejectLimit })
  showPicker.value = false
}
</script>
