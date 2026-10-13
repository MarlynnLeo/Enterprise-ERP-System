<template>
  <CellGroup inset title="检验项目 · 逐项判定">
    <Cell v-if="!modelValue.length" title="当前检验单没有检验项目，请先配置检验模板" />
    <div v-for="(item, index) in modelValue" :key="item.id || index" class="inspection-item">
      <Cell :title="item.itemName" :label="`标准：${item.standard || '未配置'} · 方法：${item.method || '未记录'}`" />
      <Field v-if="isNumericInspectionItem(item)" v-model="item.actualValue" label="实测值" placeholder="请输入实测数值" :readonly="!editable" @update:model-value="evaluate(item)" />
      <template v-if="isNumericInspectionItem(item)">
        <Field v-for="sample in [2,3,4,5,6]" :key="sample" v-model="item[`measure${sample}`]" :label="`测量${sample}`" placeholder="选填实测值" :readonly="!editable" @update:model-value="evaluate(item)" />
        <Field v-for="measurement in (item.measurements || []).filter(m => Number(m.sampleNo) > 6)" :key="`sample-${measurement.sampleNo}`" v-model="measurement.measuredValue" :label="`测量${measurement.sampleNo}`" :readonly="!editable" @update:model-value="evaluate(item)" />
      </template>
      <Cell title="判定" :value="item.result === 'passed' ? '合格' : item.result === 'failed' ? '不合格' : '未判定'">
        <template v-if="editable" #extra>
          <Button size="small" :type="item.result === 'passed' ? 'success' : 'default'" @click="judge(item, 'passed')">合格</Button>
          <Button size="small" :type="item.result === 'failed' ? 'danger' : 'default'" @click="judge(item, 'failed')">不合格</Button>
        </template>
      </Cell>
      <Field v-model="item.remarks" label="项目备注" placeholder="缺陷或测量说明" :readonly="!editable" />
    </div>
  </CellGroup>
</template>
<script setup>
import { CellGroup, Cell, Field, Button, showToast } from 'vant'
import { isNumericInspectionItem, evaluateInspectionMeasurements } from '@/utils/inspectionMeasurement'
defineProps({ modelValue: { type: Array, default: () => [] }, editable: Boolean })
const samples = item => [item.actualValue, ...[2,3,4,5,6].map(n => item[`measure${n}`]), ...(item.measurements || []).filter(m => Number(m.sampleNo) > 6).map(m => m.measuredValue)]
const evaluate = item => { item.result = evaluateInspectionMeasurements(item, samples(item)).result }
const judge = (item, result) => {
  if (result === 'passed' && isNumericInspectionItem(item)) {
    const verdict = evaluateInspectionMeasurements(item, samples(item))
    if (!verdict.values.length || verdict.values.some(v => v === null) || verdict.result === 'failed') {
      showToast('请填写有效实测值，超出标准不能判为合格'); return
    }
  }
  item.result = result
}
</script>
<style scoped>
.inspection-item { border-bottom: 8px solid var(--van-background); }
.van-button + .van-button { margin-left: 8px; }
</style>
