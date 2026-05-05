<template>
  <div class="attendance-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>考勤月表</span>
          <div class="header-actions">
            <el-date-picker
              v-model="period" type="month" value-format="YYYY-MM"
              @change="fetchAttendance" style="width:140px; margin-right:10px"
              :clearable="false" />
            <el-button @click="rulesDialogVisible = true">
              <el-icon><Setting /></el-icon> 规则设置
            </el-button>
            <el-upload
              :auto-upload="false" :show-file-list="false" accept=".xlsx,.xls"
              :on-change="handleFileSelected">
              <el-button type="warning"><el-icon><Upload /></el-icon> 导入Excel</el-button>
            </el-upload>
            <el-button type="success" :loading="syncing" @click="handleSyncDingtalk" style="margin-left:10px">
              <el-icon><Refresh /></el-icon> 钉钉拉取
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="tableData" border v-loading="loading" height="calc(100vh - 250px)" style="width:100%" size="small">
        <el-table-column prop="department_name" label="部门" width="80" fixed />
        <el-table-column prop="name" label="姓名" width="70" fixed />
        <el-table-column label="出勤天数" align="center">
          <el-table-column prop="full_work_days" label="全勤天数" width="75" />
          <el-table-column prop="actual_work_days" label="在勤天数" width="75" />
          <el-table-column prop="absent_from_position" label="不在职天" width="75" />
        </el-table-column>
        <el-table-column label="请假" align="center">
          <el-table-column prop="personal_leave_days" label="事假天数" width="75" />
          <el-table-column prop="sick_leave_days" label="病假天数" width="75" />
          <el-table-column prop="total_leave_days" label="天数合计" width="75" class-name="subtotal-col" />
        </el-table-column>
        <el-table-column prop="public_holiday_days" label="公休天数" width="75" />
        <el-table-column label="违规" align="center">
          <el-table-column prop="late_count" label="迟到次数" width="75" />
          <el-table-column prop="missing_punch_count" label="缺卡次数" width="75" />
          <el-table-column prop="total_violation_count" label="次数合计" width="75" class-name="subtotal-col" />
        </el-table-column>
        <el-table-column label="加班" align="center">
          <el-table-column prop="serious_late_overtime" label="严重迟到/上加班" width="100" />
          <el-table-column prop="normal_overtime" label="正常晚" width="70" />
          <el-table-column prop="saturday_overtime" label="周六" width="60" />
          <el-table-column prop="weekend_overtime" label="周末" width="60" />
        </el-table-column>
        <el-table-column label="全勤" width="60">
          <template #default="{ row }">
            <el-tag :type="row.full_attendance ? 'success' : 'info'" size="small">
              {{ row.full_attendance ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      </el-table>
    </el-card>

    <!-- 考勤规则配置弹窗 -->
    <el-dialog title="考勤规则配置" v-model="rulesDialogVisible" width="750px" :close-on-click-modal="false">
      <div v-loading="rulesLoading">
        <div v-for="(group, groupName) in groupedRules" :key="groupName" style="margin-bottom: 20px">
          <el-divider content-position="left">{{ groupName }}</el-divider>
          <div v-for="rule in group" :key="rule.id" class="rule-item">
            <div class="rule-header">
              <span class="rule-name">{{ rule.rule_name }}</span>
            </div>
            <div class="rule-body">
              <div class="rule-values">
                <template v-for="(val, key) in parseRuleValue(rule.rule_value)" :key="key">
                  <div v-if="key !== 'desc'" class="rule-field">
                    <label>{{ fieldLabel(key) }}：</label>
                    <el-input-number
                      v-if="typeof val === 'number'"
                      :model-value="val"
                      @change="v => editRuleField(rule, key, v)"
                      :controls="false" size="small" style="width: 100px" />
                    <el-switch
                      v-else-if="typeof val === 'boolean'"
                      :model-value="val"
                      @change="v => editRuleField(rule, key, v)"
                      size="small" />
                    <el-input
                      v-else :model-value="val"
                      @change="v => editRuleField(rule, key, v)"
                      size="small" style="width: 150px" />
                  </div>
                </template>
              </div>
              <div class="rule-desc">
                <el-input
                  v-model="rule.description" size="small" placeholder="规则说明"
                  style="width: 100%" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button @click="rulesDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="rulesSaving" @click="saveAllRules">保存所有规则</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { hrApi } from '@/api/hr'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Upload, Setting } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const period = ref(dayjs().format('YYYY-MM'))
const tableData = ref([])
const loading = ref(false)
const syncing = ref(false)

// 规则相关
const rulesDialogVisible = ref(false)
const rulesLoading = ref(false)
const rulesSaving = ref(false)
const rulesList = ref([])

const fetchAttendance = async () => {
  if (!period.value) return
  loading.value = true
  try {
    const res = await hrApi.getAttendance(period.value)
    tableData.value = res.data.data || res.data
  } catch {
    ElMessage.error('获取考勤失败')
  } finally {
    loading.value = false
  }
}

// Excel 导入
const handleFileSelected = async (uploadFile) => {
  if (!period.value) return ElMessage.warning('请先选择月份')
  try {
    await ElMessageBox.confirm(
      `即将导入 ${uploadFile.name} 到 ${period.value} 月考勤表，已有数据将被覆盖。确认？`,
      'Excel 导入', { type: 'warning' }
    )
    loading.value = true
    const formData = new FormData()
    formData.append('file', uploadFile.raw)
    formData.append('period', period.value)
    const res = await hrApi.importAttendanceExcel(formData)
    ElMessage.success(res.data.message || '导入成功')
    fetchAttendance()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '导入失败')
  } finally {
    loading.value = false
  }
}

// 钉钉同步
const handleSyncDingtalk = async () => {
  if (!period.value) return ElMessage.warning('请先选择月份')
  try {
    await ElMessageBox.confirm(
      `即将从钉钉拉取 ${period.value} 月全员打卡记录，确认执行？`,
      '钉钉考勤同步', { type: 'warning' }
    )
    syncing.value = true
    const res = await hrApi.syncAttendanceDingtalk(period.value)
    ElMessage.success(res.data.message || '考勤同步完成')
    fetchAttendance()
  } catch (error) {
    if (error !== 'cancel') ElMessage.error(error.response?.data?.message || '考勤同步失败')
  } finally {
    syncing.value = false
  }
}

// --- 规则管理 ---
const fetchRules = async () => {
  rulesLoading.value = true
  try {
    const res = await hrApi.getAttendanceRules()
    rulesList.value = (res.data.data || res.data).map(r => ({
      ...r,
      _editValue: typeof r.rule_value === 'string' ? JSON.parse(r.rule_value) : r.rule_value
    }))
  } catch {
    ElMessage.error('获取规则失败')
  } finally {
    rulesLoading.value = false
  }
}

const groupedRules = computed(() => {
  const groups = {}
  for (const r of rulesList.value) {
    const g = r.rule_group || '通用'
    if (!groups[g]) groups[g] = []
    groups[g].push(r)
  }
  return groups
})

const parseRuleValue = (val) => {
  if (typeof val === 'object') return val
  try { return JSON.parse(val) } catch { return {} }
}

const fieldLabel = (key) => {
  const map = {
    days: '天数', fine: '罚款(元)', amount: '金额(元)',
    min_minutes: '最短(分钟)', max_minutes: '最长(分钟)',
    count: '次数', cancel: '取消满勤', unit: '单位', treatment: '处理方式'
  }
  return map[key] || key
}

const editRuleField = (rule, key, val) => {
  if (!rule._editValue) rule._editValue = parseRuleValue(rule.rule_value)
  rule._editValue[key] = val
  rule.rule_value = JSON.stringify(rule._editValue)
}

const saveAllRules = async () => {
  rulesSaving.value = true
  try {
    for (const rule of rulesList.value) {
      await hrApi.updateAttendanceRule(rule.id, {
        rule_value: rule.rule_value,
        description: rule.description
      })
    }
    ElMessage.success('所有规则保存成功')
    rulesDialogVisible.value = false
  } catch {
    ElMessage.error('保存规则失败')
  } finally {
    rulesSaving.value = false
  }
}

// 弹窗打开时加载规则
watch(rulesDialogVisible, (v) => { if (v) fetchRules() })

onMounted(() => {
  fetchAttendance()
})
</script>

<style scoped>
.attendance-container .card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.attendance-container .header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.subtotal-col {
  background-color: #fdf6ec !important;
  font-weight: bold;
}

.rule-item {
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 10px;
  border: 1px solid var(--color-border-lighter);
}
.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.rule-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text-primary);
}
.rule-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rule-values {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.rule-field {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rule-field label {
  font-size: 13px;
  color: var(--color-text-regular);
  white-space: nowrap;
}
.rule-desc {
  margin-top: 4px;
}
</style>