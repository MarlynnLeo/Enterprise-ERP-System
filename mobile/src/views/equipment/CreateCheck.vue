<template>
  <div class="page-container">
    <NavBar title="新建点检" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <CellGroup inset title="选择设备">
        <Cell title="设备" is-link :value="selectedEquipment?.name || '请选择'" @click="showPicker = true" />
      </CellGroup>
      <CellGroup inset title="点检内容">
        <Field v-model="form.description" type="textarea" rows="3" placeholder="描述点检情况..." autosize />
        <Cell title="点检结果">
          <template #value>
            <RadioGroup v-model="form.result" direction="horizontal">
              <Radio name="normal">正常</Radio>
              <Radio name="abnormal">异常</Radio>
            </RadioGroup>
          </template>
        </Cell>
        <Field v-if="form.result === 'abnormal'" v-model="form.abnormal_detail" type="textarea" rows="2" placeholder="请描述异常情况..." autosize />
      </CellGroup>
      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">提交点检</Button>
      </div>
    </div>

    <!-- 设备选择 -->
    <Popup v-model:show="showPicker" round position="bottom" :style="{ height: '50%' }">
      <div style="padding:12px">
        <Search v-model="eqKeyword" placeholder="搜索设备" @search="fetchEquipments" />
        <div v-for="eq in equipments" :key="eq.id" class="eq-item" @click="pickEquipment(eq)">
          <span>{{ eq.name }}</span>
          <span class="eq-code">{{ eq.code || eq.equipment_code }}</span>
        </div>
        <Empty v-if="equipments.length === 0" description="无设备" :image-size="60" />
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell, Field, Button, RadioGroup, Radio, Popup, Search, Empty, showToast } from 'vant'
  import { useRouter } from 'vue-router'
  import { equipmentApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const router = useRouter()
  const showPicker = ref(false)
  const submitting = ref(false)
  const eqKeyword = ref('')
  const equipments = ref([])
  const selectedEquipment = ref(null)
  const form = ref({ description: '', result: 'normal', abnormal_detail: '' })

  const fetchEquipments = async () => {
    try {
      const res = await equipmentApi.getList({ keyword: eqKeyword.value, pageSize: 50 })
      const d = extractApiData(res)
      equipments.value = Array.isArray(d) ? d : (d.list || d.items || [])
    } catch { equipments.value = [] }
  }

  const pickEquipment = (eq) => { selectedEquipment.value = eq; showPicker.value = false }

  const handleSubmit = async () => {
    if (!selectedEquipment.value) return showToast('请选择设备')
    submitting.value = true
    try {
      await equipmentApi.addInspection(selectedEquipment.value.id, {
        inspection_type: 'daily',
        description: form.value.description,
        result: form.value.result,
        abnormal_detail: form.value.abnormal_detail
      })
      showToast('点检提交成功')
      router.go(-1)
    } catch { showToast('提交失败') } finally { submitting.value = false }
  }

  onMounted(fetchEquipments)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
  .submit-area { padding: 20px 16px; }
  .eq-item {
    display: flex; justify-content: space-between; padding: 10px 4px;
    border-bottom: 1px solid var(--van-border-color); font-size: 0.875rem;
  }
  .eq-code { color: var(--text-secondary); font-size: 0.75rem; }
</style>
