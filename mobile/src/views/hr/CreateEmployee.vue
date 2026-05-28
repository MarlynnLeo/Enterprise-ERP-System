<template>
  <div class="create-page">
    <NavBar title="新员工入职" left-arrow @click-left="router.back()">
      <template #right>
        <Button type="primary" size="small" :loading="submitting" @click="handleSubmit">保存</Button>
      </template>
    </NavBar>

    <div class="content">
      <Form ref="formRef">
        <CellGroup inset title="员工信息">
          <Field v-model="form.employee_no" name="employee_no" label="工号" placeholder="请输入员工工号" :rules="[{ required: true, message: '请输入员工工号' }]" />
          <Field v-model="form.name" name="name" label="姓名" placeholder="请输入员工姓名" :rules="[{ required: true, message: '请输入员工姓名' }]" />
          <Cell title="部门" is-link :value="departmentName" @click="showDepartmentPicker = true" />
          <Field v-model="form.id_card" name="id_card" label="身份证号" placeholder="请输入身份证号" />
          <Field v-model="form.join_date" name="join_date" label="入职日期" type="date" />
        </CellGroup>

        <CellGroup inset title="薪资信息">
          <Field v-model="form.base_salary" name="base_salary" label="基本工资" type="number" placeholder="0.00" />
          <Field v-model="form.split_base_salary" name="split_base_salary" label="拆分基数" type="number" placeholder="0.00" />
          <Cell title="社保公积金" is-link :value="form.insurance_type" @click="showInsurancePicker = true" />
        </CellGroup>
      </Form>

      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">保存员工</Button>
      </div>
    </div>

    <Popup v-model:show="showDepartmentPicker" round position="bottom" :style="{ height: '70%' }">
      <div class="picker-panel">
        <Search v-model="departmentKeyword" placeholder="搜索部门" />
        <div class="picker-list">
          <Cell title="不选择部门" clickable @click="pickDepartment(null)" />
          <Cell v-for="item in filteredDepartments" :key="item.id" :title="item.name" :label="item.code" clickable @click="pickDepartment(item)" />
        </div>
      </div>
    </Popup>

    <Popup v-model:show="showInsurancePicker" round position="bottom">
      <Picker :columns="insuranceOptions" @confirm="onInsuranceConfirm" @cancel="showInsurancePicker = false" />
    </Popup>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Field, Form, NavBar, Picker, Popup, Search, showToast } from 'vant'
  import { hrApi, systemApi } from '@/services/api'
  import { extractApiList } from '@/utils/apiHelper'

  const router = useRouter()
  const formRef = ref()
  const submitting = ref(false)
  const showDepartmentPicker = ref(false)
  const showInsurancePicker = ref(false)
  const departmentKeyword = ref('')
  const departments = ref([])

  const form = reactive({
    employee_no: '',
    name: '',
    department_id: '',
    id_card: '',
    join_date: new Date().toISOString().slice(0, 10),
    base_salary: '',
    split_base_salary: '',
    insurance_type: '有社保有公积金'
  })

  const insuranceOptions = [
    { text: '有社保有公积金', value: '有社保有公积金' },
    { text: '有社保无公积金', value: '有社保无公积金' },
    { text: '无社保无公积金', value: '无社保无公积金' }
  ]

  const departmentName = computed(() => {
    const current = departments.value.find((item) => String(item.id) === String(form.department_id))
    return current?.name || '请选择'
  })

  const filteredDepartments = computed(() => {
    const keyword = departmentKeyword.value.trim().toLowerCase()
    if (!keyword) return departments.value
    return departments.value.filter((item) =>
      [item.name, item.code].some((value) => String(value || '').toLowerCase().includes(keyword))
    )
  })

  const fetchDepartments = async () => {
    const response = await systemApi.getDepartments()
    departments.value = extractApiList(response)
  }

  const pickDepartment = (item) => {
    form.department_id = item?.id || ''
    showDepartmentPicker.value = false
  }

  const onInsuranceConfirm = ({ selectedOptions }) => {
    form.insurance_type = selectedOptions[0]?.value || insuranceOptions[0].value
    showInsurancePicker.value = false
  }

  const handleSubmit = async () => {
    try {
      await formRef.value?.validate()
      submitting.value = true
      await hrApi.createEmployee({
        ...form,
        employee_no: form.employee_no.trim(),
        name: form.name.trim(),
        department_id: form.department_id || null,
        base_salary: Number(form.base_salary) || 0,
        split_base_salary: Number(form.split_base_salary) || 0
      })
      showToast({ type: 'success', message: '员工已创建' })
      router.back()
    } catch (error) {
      if (error?.message) console.error('创建员工失败:', error)
    } finally {
      submitting.value = false
    }
  }

  onMounted(fetchDepartments)
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
