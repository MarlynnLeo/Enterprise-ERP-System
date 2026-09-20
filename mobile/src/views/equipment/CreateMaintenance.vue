<template>
  <div class="create-page">
    <NavBar title="制定保养计划" left-arrow @click-left="router.back()" />

    <div class="content">
      <CellGroup inset title="选择设备">
        <Cell title="设备" is-link :value="selectedEquipmentName" @click="showEquipmentPicker = true" />
      </CellGroup>

      <Form ref="formRef">
        <CellGroup inset title="保养内容">
          <Field :model-value="maintenanceTypeText" label="保养类型" readonly is-link @click="showTypePicker = true" />
          <Field v-model="form.maintenanceDate" name="maintenanceDate" label="保养日期" type="date" :rules="[{ required: true, message: '请选择保养日期' }]" />
          <Field v-model="form.nextMaintenanceDate" name="nextMaintenanceDate" label="下次保养" type="date" />
          <Field v-model="form.maintenancePerson" name="maintenancePerson" label="保养人" placeholder="请输入保养人" />
          <Field v-model="form.cost" name="cost" label="预算费用" type="number" placeholder="0.00" />
          <Field v-model="form.partsReplaced" name="partsReplaced" label="备件" placeholder="请输入计划更换备件" />
          <Field v-model="form.description" name="description" label="保养说明" type="textarea" rows="3" autosize placeholder="请输入保养内容" />
          <Field v-model="form.remarks" name="remarks" label="备注" type="textarea" rows="2" autosize />
        </CellGroup>
      </Form>

      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">保存计划</Button>
      </div>
    </div>

    <Popup v-model:show="showTypePicker" round position="bottom">
      <Picker title="保养类型" :columns="maintenanceTypes" @confirm="onTypeConfirm" @cancel="showTypePicker = false" />
    </Popup>
    <Popup v-model:show="showEquipmentPicker" round position="bottom" :style="{ height: '70%' }">
      <div class="picker-panel">
        <Search v-model="keyword" placeholder="搜索设备" @search="fetchEquipments" />
        <div class="picker-list">
          <Cell v-for="item in equipments" :key="item.id" :title="item.name" :label="item.code || item.model" clickable @click="pickEquipment(item)" />
          <Empty v-if="equipments.length === 0" description="暂无设备" />
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Empty, Field, Form, NavBar, Picker, Popup, Search, showToast } from 'vant'
  import dayjs from 'dayjs'
  import { equipmentApi } from '@/api'
  import { extractApiList } from '@/utils/apiHelper'

  const router = useRouter()
  const formRef = ref()
  const submitting = ref(false)
  const showEquipmentPicker = ref(false)
  const showTypePicker = ref(false)
  const keyword = ref('')
  const equipments = ref([])
  const selectedEquipment = ref(null)

  const form = reactive({
    maintenanceType: 'routine',
    maintenanceDate: dayjs().format('YYYY-MM-DD'),
    nextMaintenanceDate: '',
    maintenancePerson: '',
    description: '',
    cost: '',
    partsReplaced: '',
    remarks: '',
    status: 'pending'
  })

  const maintenanceTypes = [
    { text: '日常保养', value: 'routine' },
    { text: '预防性保养', value: 'preventive' },
    { text: '故障维修', value: 'corrective' }
  ]
  const maintenanceTypeText = computed(() => maintenanceTypes.find(item => item.value === form.maintenanceType)?.text || '')
  const onTypeConfirm = ({ selectedOptions }) => {
    form.maintenanceType = selectedOptions[0]?.value || 'routine'
    showTypePicker.value = false
  }

  const selectedEquipmentName = computed(() => selectedEquipment.value?.name || '请选择设备')

  const fetchEquipments = async () => {
    try {
      const response = await equipmentApi.getList({ keyword: keyword.value || undefined, pageSize: 50 })
      equipments.value = extractApiList(response)
    } catch {
      equipments.value = []
    }
  }

  const pickEquipment = (item) => {
    selectedEquipment.value = item
    showEquipmentPicker.value = false
  }

  const handleSubmit = async () => {
    if (submitting.value) return
    if (!selectedEquipment.value) return showToast('请选择设备')
    const cost = Number(form.cost)
    if (!Number.isFinite(cost) || cost < 0) return showToast('预算费用必须是大于或等于0的有效数字')
    if (form.nextMaintenanceDate && form.nextMaintenanceDate < form.maintenanceDate) return showToast('下次保养日期不能早于保养日期')
    submitting.value = true
    try {
      await formRef.value?.validate()
      await equipmentApi.addMaintenance(selectedEquipment.value.id, {
        ...form,
        cost
      })
      showToast({ type: 'success', message: '保养计划已保存' })
      router.back()
    } catch (error) {
      if (error?.message) console.error('保存保养计划失败:', error)
    } finally {
      submitting.value = false
    }
  }

  onMounted(fetchEquipments)
</script>

<style lang="scss" scoped>
  .create-page {
    min-height: 100%;
    background: var(--bg-primary);
  }

  .content {
    padding: 12px 0 24px;
  }

  .submit-area {
    padding: 20px 16px;
  }

  .picker-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .picker-list {
    flex: 1;
    overflow-y: auto;
  }
</style>
