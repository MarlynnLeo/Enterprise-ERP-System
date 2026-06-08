<template>
  <div class="create-page">
    <NavBar title="手动补卡" left-arrow @click-left="router.back()" />

    <div class="content">
      <CellGroup inset title="补卡对象">
        <Cell title="员工" is-link :value="selectedEmployeeName" @click="showEmployeePicker = true" />
        <Field v-model="form.date" label="补卡日期" type="date" />
      </CellGroup>

      <CellGroup inset title="考勤修正">
        <Field v-model="form.days_in_month" label="计薪天数" type="number" placeholder="21.75" />
        <Field v-model="form.leave_days" label="请假天数" type="number" placeholder="0" />
        <Field v-model="form.vacation_days" label="休假天数" type="number" placeholder="0" />
        <Field v-model="form.overtime_hours" label="加班小时" type="number" placeholder="0" />
        <Cell title="全勤">
          <template #value>
            <Switch v-model="form.full_attendance" size="20" />
          </template>
        </Cell>
        <Field v-model="form.remark" label="说明" type="textarea" rows="3" autosize placeholder="请输入补卡原因" />
      </CellGroup>

      <div class="submit-area">
        <Button type="primary" block round :loading="submitting" @click="handleSubmit">提交补卡</Button>
      </div>
    </div>

    <Popup v-model:show="showEmployeePicker" round position="bottom" :style="{ height: '70%' }">
      <div class="picker-panel">
        <Search v-model="keyword" placeholder="搜索员工" @search="fetchEmployees" />
        <div class="picker-list">
          <Cell
            v-for="item in employees"
            :key="item.id"
            :title="item.name"
            :label="`${item.employee_no || ''} ${item.department_name || ''}`"
            clickable
            @click="pickEmployee(item)"
          />
          <Empty v-if="employees.length === 0" description="暂无员工" />
        </div>
      </div>
    </Popup>
  </div>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { Button, Cell, CellGroup, Empty, Field, NavBar, Popup, Search, Switch, showToast } from 'vant'
  import { hrApi } from '@/api'
  import { extractApiList } from '@/utils/apiHelper'
  import { buildAttendanceRecord, findEmployeeAttendance, getPeriodFromDate } from '@/utils/hrAttendance'

  const router = useRouter()
  const submitting = ref(false)
  const showEmployeePicker = ref(false)
  const keyword = ref('')
  const employees = ref([])
  const selectedEmployee = ref(null)

  const form = reactive({
    date: new Date().toISOString().slice(0, 10),
    days_in_month: 21.75,
    leave_days: 0,
    vacation_days: 0,
    overtime_hours: 0,
    full_attendance: true,
    remark: ''
  })

  const selectedEmployeeName = computed(() => selectedEmployee.value?.name || '请选择员工')

  const fetchEmployees = async () => {
    const response = await hrApi.getEmployees({ keyword: keyword.value || undefined })
    employees.value = extractApiList(response)
  }

  const pickEmployee = (item) => {
    selectedEmployee.value = item
    showEmployeePicker.value = false
  }

  const handleSubmit = async () => {
    if (!selectedEmployee.value) return showToast('请选择员工')
    if (!form.date) return showToast('请选择补卡日期')

    submitting.value = true
    try {
      const period = getPeriodFromDate(form.date)
      const existing = await findEmployeeAttendance(hrApi, selectedEmployee.value.id, period)
      const record = buildAttendanceRecord(selectedEmployee.value.id, existing, form)
      await hrApi.saveAttendanceRecords({ period, records: [record] })
      showToast({ type: 'success', message: '补卡已提交' })
      router.back()
    } catch (error) {
      console.error('提交补卡失败:', error)
    } finally {
      submitting.value = false
    }
  }

  onMounted(fetchEmployees)
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
