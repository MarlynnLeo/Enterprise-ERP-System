<template>
  <div class="page-container">
    <NavBar title="新建报修" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <CellGroup inset title="选择设备">
        <Cell title="设备" is-link :value="selectedEquipment?.name || '请选择'" @click="showPicker = true" />
      </CellGroup>
      <CellGroup inset title="故障信息">
        <Field v-model="form.failure_type" label="故障类型" placeholder="如：电气/机械/液压" />
        <Field v-model="form.description" type="textarea" rows="3" label="故障描述" placeholder="请详细描述故障现象..." autosize />
        <Cell title="紧急程度">
          <template #value>
            <RadioGroup v-model="form.severity" direction="horizontal">
              <Radio name="low">一般</Radio>
              <Radio name="medium">紧急</Radio>
              <Radio name="high">严重</Radio>
            </RadioGroup>
          </template>
        </Cell>
        <Cell title="是否停机">
          <template #value>
            <Switch v-model="form.is_shutdown" size="20px" />
          </template>
        </Cell>
      </CellGroup>
      <div class="submit-area">
        <Button type="danger" block round :loading="submitting" @click="handleSubmit">提交报修</Button>
      </div>
    </div>

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
  import { NavBar, CellGroup, Cell, Field, Button, RadioGroup, Radio, Switch, Popup, Search, Empty, showToast } from 'vant'
  import { useRouter } from 'vue-router'
  import { equipmentApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const router = useRouter()
  const showPicker = ref(false)
  const submitting = ref(false)
  const eqKeyword = ref('')
  const equipments = ref([])
  const selectedEquipment = ref(null)
  const form = ref({ failure_type: '', description: '', severity: 'low', is_shutdown: false })

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
    if (!form.value.description) return showToast('请填写故障描述')
    submitting.value = true
    try {
      await equipmentApi.addFailure(selectedEquipment.value.id, {
        failure_type: form.value.failure_type,
        description: form.value.description,
        severity: form.value.severity,
        is_shutdown: form.value.is_shutdown
      })
      showToast('报修提交成功')
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
