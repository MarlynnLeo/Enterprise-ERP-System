<template>
  <div class="page-container">
    <NavBar title="排班管理" left-arrow @click-left="$router.go(-1)" />
    <div class="page-body">
      <Loading v-if="loading" size="24px" vertical style="padding:40px 0">加载中...</Loading>
      <template v-else>
        <CellGroup inset title="考勤规则">
          <Cell v-for="rule in rules" :key="rule.id" :title="rule.rule_name || rule.name || '--'" :value="rule.work_start ? `${rule.work_start} - ${rule.work_end}` : '--'" :label="`迟到容忍: ${rule.late_tolerance ?? 0}分钟`" />
          <Cell v-if="rules.length === 0" title="暂无考勤规则" />
        </CellGroup>
        <CellGroup inset title="员工花名册">
          <Cell v-for="emp in employees" :key="emp.id" :title="emp.real_name || emp.username" :value="emp.department || '--'" :label="`${emp.position || '--'} | ${emp.employee_no || ''}`" />
          <Cell v-if="employees.length === 0" title="暂无员工数据" />
        </CellGroup>
      </template>
    </div>
  </div>
</template>

<script setup>
  import { ref, onMounted } from 'vue'
  import { NavBar, CellGroup, Cell, Loading } from 'vant'
  import { hrApi } from '@/services/api'
  import { extractApiData } from '@/utils/apiHelper'

  const loading = ref(true)
  const rules = ref([])
  const employees = ref([])

  const fetchData = async () => {
    try {
      const [rulesRes, empRes] = await Promise.allSettled([
        hrApi.getAttendanceRules(),
        hrApi.getEmployees({ pageSize: 50 })
      ])
      if (rulesRes.status === 'fulfilled') {
        const d = extractApiData(rulesRes.value)
        rules.value = Array.isArray(d) ? d : (d.list || d.items || [])
      }
      if (empRes.status === 'fulfilled') {
        const d = extractApiData(empRes.value)
        employees.value = Array.isArray(d) ? d : (d.list || d.items || [])
      }
    } catch { /* 静默 */ } finally { loading.value = false }
  }

  onMounted(fetchData)
</script>

<style lang="scss" scoped>
  .page-container { min-height: 100vh; background: var(--bg-primary); }
  .page-body { padding: 12px; }
</style>
