<!--
/**
 * ProductionCalendar.vue
 * @description 生产日历管理 - 班次配置 + 月历视图
 * @date 2026-06-06
 * @version 2.0.0
 */
-->
<template>
  <div class="module-page production-calendar-container">
    <!-- 页面标题 -->
    <el-card class="header-card">
      <div class="header-content">
        <div class="title-section">
          <h2>生产日历设置</h2>
          <p class="subtitle">班次配置与月度排班管理</p>
        </div>
        <el-button :icon="Refresh" circle @click="refreshAll" :loading="loading" />
      </div>
    </el-card>

    <!-- 默认班次配置 -->
    <el-card class="data-card">
      <template #header>
        <div class="card-header">
          <span><el-icon><Setting /></el-icon> 默认班次配置</span>
          <el-tag size="small" type="info">排程计算使用默认班次</el-tag>
        </div>
      </template>
      <el-table :data="calendars" v-loading="loading" border stripe size="small">
        <el-table-column prop="name" label="班次名称" width="120" />
        <el-table-column label="上班" width="90">
          <template #default="{ row }">{{ fmtTime(row.work_start) }}</template>
        </el-table-column>
        <el-table-column label="下班" width="90">
          <template #default="{ row }">{{ fmtTime(row.work_end) }}</template>
        </el-table-column>
        <el-table-column label="午休" width="140">
          <template #default="{ row }">
            {{ row.break_start ? fmtTime(row.break_start) + ' ~ ' + fmtTime(row.break_end) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="晚餐" width="140">
          <template #default="{ row }">
            {{ row.dinner_start ? fmtTime(row.dinner_start) + ' ~ ' + fmtTime(row.dinner_end) : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="工时" width="90">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ calcWorkHours(row) }}h</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="周末" width="90">
          <template #default="{ row }">
            <el-tag :type="row.exclude_weekends ? 'warning' : 'success'" size="small">
              {{ row.exclude_weekends ? '排除' : '不排除' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="默认" width="70">
          <template #default="{ row }">
            <el-tag v-if="row.is_default" type="success" size="small" effect="dark">✓</el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="canUpdateCalendar" label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" type="success" link :disabled="!!row.is_default" @click="handleSetDefault(row)">设为默认</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 月历视图 -->
    <el-card class="data-card calendar-section">
      <template #header>
        <div class="card-header">
          <span><el-icon><Calendar /></el-icon> 月度日历</span>
          <div class="month-nav">
            <el-button :icon="ArrowLeft" size="small" @click="prevMonth" />
            <span class="month-label">{{ currentYear }}年{{ currentMonth }}月</span>
            <el-button :icon="ArrowRight" size="small" @click="nextMonth" />
            <el-button size="small" @click="goToday" style="margin-left: 8px">今天</el-button>
          </div>
        </div>
      </template>
      <div v-loading="calendarLoading">
        <!-- 星期头 -->
        <div class="calendar-grid">
          <div class="calendar-weekday" v-for="w in weekdays" :key="w">{{ w }}</div>

          <!-- 日期格子 -->
          <div
            v-for="cell in calendarCells"
            :key="cell.dateStr"
            class="calendar-cell"
            :class="{
              'is-other-month': !cell.isCurrentMonth,
              'is-today': cell.isToday,
              'is-workday': cell.isWorkday,
              'is-rest': !cell.isWorkday,
              'is-override': cell.hasOverride,
            }"
            @click="cell.isCurrentMonth && canUpdateCalendar && openDayEdit(cell)"
          >
            <div class="calendar-cell__day">{{ cell.day }}</div>
            <div class="calendar-cell__info" v-if="cell.isCurrentMonth">
              <template v-if="cell.hasOverride">
                <span v-if="cell.isWorkday" class="cell-badge work">
                  {{ cell.label || '加班' }}
                </span>
                <span v-else class="cell-badge rest">
                  {{ cell.label || '休息' }}
                </span>
              </template>
              <template v-else>
                <span v-if="cell.isWorkday" class="cell-badge default-work">工作日</span>
                <span v-else class="cell-badge default-rest">休息</span>
              </template>
            </div>
            <div class="calendar-cell__time" v-if="cell.isCurrentMonth && cell.isWorkday && cell.hasOverride">
              {{ fmtTime(cell.work_start) }}-{{ fmtTime(cell.work_end) }}
            </div>
          </div>
        </div>

        <!-- 图例 -->
        <div class="calendar-legend">
          <span class="legend-item"><span class="legend-dot default-work"></span>默认工作日</span>
          <span class="legend-item"><span class="legend-dot default-rest"></span>默认休息日</span>
          <span class="legend-item"><span class="legend-dot override-work"></span>加班（覆盖）</span>
          <span class="legend-item"><span class="legend-dot override-rest"></span>放假（覆盖）</span>
        </div>
      </div>
    </el-card>

    <!-- 编辑班次弹窗 -->
    <el-dialog v-model="editVisible" :title="`编辑班次 - ${editForm.name || ''}`" width="520px" destroy-on-close>
      <el-form ref="editFormRef" :model="editForm" :rules="formRules" label-width="100px">
        <el-form-item label="班次名称" prop="name">
          <el-input v-model="editForm.name" placeholder="如：白班、夜班" />
        </el-form-item>
        <el-divider content-position="left">工作时间</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="上班时间" prop="work_start">
              <el-time-picker v-model="editForm.work_start" format="HH:mm" value-format="HH:mm" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="下班时间" prop="work_end">
              <el-time-picker v-model="editForm.work_end" format="HH:mm" value-format="HH:mm" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider content-position="left">午休时间（可选）</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="午休开始">
              <el-time-picker v-model="editForm.break_start" format="HH:mm" value-format="HH:mm" style="width:100%" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="午休结束">
              <el-time-picker v-model="editForm.break_end" format="HH:mm" value-format="HH:mm" style="width:100%" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider content-position="left">晚餐休息（可选）</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="晚餐开始">
              <el-time-picker v-model="editForm.dinner_start" format="HH:mm" value-format="HH:mm" style="width:100%" clearable />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="晚餐结束">
              <el-time-picker v-model="editForm.dinner_end" format="HH:mm" value-format="HH:mm" style="width:100%" clearable />
            </el-form-item>
          </el-col>
        </el-row>
        <el-divider content-position="left">其他设置</el-divider>
        <el-form-item label="排除周末">
          <el-switch v-model="editForm.exclude_weekends" active-text="排除" inactive-text="不排除" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 编辑单日弹窗 -->
    <el-dialog v-model="dayEditVisible" :title="dayEditTitle" width="480px" destroy-on-close>
      <el-form :model="dayEditForm" label-width="100px">
        <el-form-item label="日期">
          <el-tag>{{ dayEditForm.calendar_date }}</el-tag>
          <el-tag type="info" style="margin-left:8px">{{ dayEditForm.weekdayText }}</el-tag>
        </el-form-item>

        <el-form-item label="工作状态">
          <el-radio-group v-model="dayEditForm.is_workday">
            <el-radio-button :value="true">工作日</el-radio-button>
            <el-radio-button :value="false">休息日</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <template v-if="dayEditForm.is_workday">
          <el-divider content-position="left">自定义时间（留空使用默认班次）</el-divider>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="上班时间">
                <el-time-picker v-model="dayEditForm.work_start" format="HH:mm" value-format="HH:mm" style="width:100%" clearable :placeholder="defaultCalendarText.work_start" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="下班时间">
                <el-time-picker v-model="dayEditForm.work_end" format="HH:mm" value-format="HH:mm" style="width:100%" clearable :placeholder="defaultCalendarText.work_end" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="午休开始">
                <el-time-picker v-model="dayEditForm.break_start" format="HH:mm" value-format="HH:mm" style="width:100%" clearable :placeholder="defaultCalendarText.break_start" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="午休结束">
                <el-time-picker v-model="dayEditForm.break_end" format="HH:mm" value-format="HH:mm" style="width:100%" clearable :placeholder="defaultCalendarText.break_end" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="晚餐开始">
                <el-time-picker v-model="dayEditForm.dinner_start" format="HH:mm" value-format="HH:mm" style="width:100%" clearable :placeholder="defaultCalendarText.dinner_start" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="晚餐结束">
                <el-time-picker v-model="dayEditForm.dinner_end" format="HH:mm" value-format="HH:mm" style="width:100%" clearable :placeholder="defaultCalendarText.dinner_end" />
              </el-form-item>
            </el-col>
          </el-row>
        </template>

        <el-form-item label="备注">
          <el-input v-model="dayEditForm.label" placeholder="如：端午节、周六加班" maxlength="50" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="dayEditForm.hasOverride" type="danger" @click="handleResetDay" :loading="saving">恢复默认</el-button>
        <div style="flex:1"></div>
        <el-button @click="dayEditVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSaveDay">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Setting, Calendar, ArrowLeft, ArrowRight } from '@element-plus/icons-vue'
import { productionApi } from '@/api/production'
import { parseListData } from '@/utils/responseParser'
import { useAuthStore } from '@/stores/auth'
import dayjs from 'dayjs'

// ============ 响应式数据 ============
const authStore = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const calendarLoading = ref(false)
const calendars = ref([])

// 班次编辑
const editVisible = ref(false)
const editFormRef = ref(null)
const editForm = ref({ id: null, name: '', work_start: '', work_end: '', break_start: '', break_end: '', dinner_start: '', dinner_end: '', exclude_weekends: false })
const formRules = {
  name: [{ required: true, message: '请输入班次名称', trigger: 'blur' }],
  work_start: [{ required: true, message: '请选择上班时间', trigger: 'change' }],
  work_end: [{ required: true, message: '请选择下班时间', trigger: 'change' }],
}

// 月历
const currentYear = ref(dayjs().year())
const currentMonth = ref(dayjs().month() + 1) // 1-12
const overrides = ref(new Map()) // dateStr -> override
const weekdays = ['一', '二', '三', '四', '五', '六', '日']

// 单日编辑
const dayEditVisible = ref(false)
const dayEditForm = ref({
  calendar_date: '',
  weekdayText: '',
  is_workday: true,
  work_start: '',
  work_end: '',
  break_start: '',
  break_end: '',
  dinner_start: '',
  dinner_end: '',
  label: '',
  hasOverride: false,
})

// ============ 计算属性 ============
const defaultCalendar = computed(() => calendars.value.find(c => c.is_default) || calendars.value[0] || {})
const canUpdateCalendar = computed(() =>
  authStore.hasPermission('production:calendar:update') ||
  authStore.hasPermission('production:tasks:update')
)

const defaultCalendarText = computed(() => ({
  work_start: fmtTime(defaultCalendar.value.work_start) || '08:00',
  work_end: fmtTime(defaultCalendar.value.work_end) || '20:00',
  break_start: fmtTime(defaultCalendar.value.break_start) || '11:30',
  break_end: fmtTime(defaultCalendar.value.break_end) || '12:30',
  dinner_start: fmtTime(defaultCalendar.value.dinner_start) || '17:00',
  dinner_end: fmtTime(defaultCalendar.value.dinner_end) || '17:30',
}))

const dayEditTitle = computed(() => `编辑 ${dayEditForm.value.calendar_date}（${dayEditForm.value.weekdayText}）`)

const calendarCells = computed(() => {
  const cells = []
  const firstDay = dayjs(`${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-01`)
  const daysInMonth = firstDay.daysInMonth()

  // 星期一=0, 星期日=6
  let startDow = firstDay.day() - 1
  if (startDow < 0) startDow = 6

  // 上个月补齐
  const prevMonth = firstDay.subtract(1, 'month')
  const prevDays = prevMonth.daysInMonth()
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevDays - i
    const dateStr = prevMonth.date(d).format('YYYY-MM-DD')
    cells.push({ day: d, dateStr, isCurrentMonth: false, isWorkday: true, isToday: false, hasOverride: false })
  }

  // 本月
  const today = dayjs().format('YYYY-MM-DD')
  const cal = defaultCalendar.value
  for (let d = 1; d <= daysInMonth; d++) {
    const dateDayjs = firstDay.date(d)
    const dateStr = dateDayjs.format('YYYY-MM-DD')
    const dow = dateDayjs.day() // 0=周日

    const override = overrides.value.get(dateStr)
    let isWorkday
    let hasOverride = false
    let label = ''
    let work_start = null
    let work_end = null

    if (override) {
      hasOverride = true
      isWorkday = !!override.is_workday
      label = override.label || ''
      work_start = override.work_start
      work_end = override.work_end
    } else {
      // 用全局默认判断
      isWorkday = !(cal.exclude_weekends && (dow === 0 || dow === 6))
    }

    cells.push({
      day: d,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === today,
      isWorkday,
      hasOverride,
      label,
      work_start: work_start || cal.work_start,
      work_end: work_end || cal.work_end,
    })
  }

  // 下个月补齐到 42 格（6行）
  const nextMonth = firstDay.add(1, 'month')
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) {
    const dateStr = nextMonth.date(d).format('YYYY-MM-DD')
    cells.push({ day: d, dateStr, isCurrentMonth: false, isWorkday: true, isToday: false, hasOverride: false })
  }

  return cells
})

// ============ 工具函数 ============
function fmtTime(t) { return t ? String(t).substring(0, 5) : '' }
function calcWorkHours(row) {
  const toMin = (s) => { const p = String(s).split(':'); return parseInt(p[0]) * 60 + parseInt(p[1] || 0) }
  const total = toMin(row.work_end) - toMin(row.work_start)
  const brk = (row.break_start && row.break_end) ? toMin(row.break_end) - toMin(row.break_start) : 0
  const dnr = (row.dinner_start && row.dinner_end) ? toMin(row.dinner_end) - toMin(row.dinner_start) : 0
  return ((total - brk - dnr) / 60).toFixed(1)
}

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DATE_ONLY_PREFIX = /^(\d{4}-\d{2}-\d{2})/

// ============ 数据请求 ============
async function fetchCalendars() {
  loading.value = true
  try {
    const res = await productionApi.getCalendars()
    calendars.value = parseListData(res, { enableLog: false })
    return true
  } catch (e) {
    console.error('获取班次列表失败:', e)
    ElMessage.error('获取班次列表失败')
    return false
  } finally {
    loading.value = false
  }
}

async function fetchOverrides() {
  calendarLoading.value = true
  try {
    const month = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}`
    const res = await productionApi.getCalendarOverrides({ month })
    const list = parseListData(res, { enableLog: false })
    const map = new Map()
    for (const item of list) {
      const dateMatch = typeof item.calendar_date === 'string'
        ? DATE_ONLY_PREFIX.exec(item.calendar_date)
        : null
      const dateKey = dateMatch
        ? dateMatch[1]
        : dayjs(item.calendar_date).format('YYYY-MM-DD')
      if (dateKey) map.set(dateKey, item)
    }
    overrides.value = map
    return true
  } catch (e) {
    console.error('获取覆盖日期失败:', e)
    ElMessage.error('获取覆盖日期失败')
    return false
  } finally {
    calendarLoading.value = false
  }
}

async function refreshAll() {
  const [calendarsOk, overridesOk] = await Promise.all([fetchCalendars(), fetchOverrides()])
  if (calendarsOk && overridesOk) {
    ElMessage.success('数据已刷新')
  } else {
    ElMessage.warning('部分数据刷新失败')
  }
}

// ============ 月份导航 ============
function prevMonth() {
  if (currentMonth.value === 1) {
    currentYear.value--
    currentMonth.value = 12
  } else {
    currentMonth.value--
  }
}
function nextMonth() {
  if (currentMonth.value === 12) {
    currentYear.value++
    currentMonth.value = 1
  } else {
    currentMonth.value++
  }
}
function goToday() {
  currentYear.value = dayjs().year()
  currentMonth.value = dayjs().month() + 1
}

watch([currentYear, currentMonth], () => fetchOverrides())

// ============ 班次编辑 ============
function openEdit(row) {
  if (!canUpdateCalendar.value) return
  editForm.value = {
    id: row.id,
    name: row.name,
    work_start: fmtTime(row.work_start),
    work_end: fmtTime(row.work_end),
    break_start: row.break_start ? fmtTime(row.break_start) : '',
    break_end: row.break_end ? fmtTime(row.break_end) : '',
    dinner_start: row.dinner_start ? fmtTime(row.dinner_start) : '',
    dinner_end: row.dinner_end ? fmtTime(row.dinner_end) : '',
    exclude_weekends: !!row.exclude_weekends,
  }
  editVisible.value = true
}

async function handleSave() {
  if (!canUpdateCalendar.value) {
    ElMessage.error('无权维护生产日历')
    return
  }
  if (!editFormRef.value) return
  try { await editFormRef.value.validate() } catch { return }
  saving.value = true
  try {
    await productionApi.updateCalendar(editForm.value.id, editForm.value)
    ElMessage.success('班次配置更新成功')
    editVisible.value = false
    await fetchCalendars()
    await fetchOverrides() // 刷新月历（默认规则可能改变）
  } catch (e) {
    ElMessage.error('更新失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

async function handleSetDefault(row) {
  if (!canUpdateCalendar.value) {
    ElMessage.error('无权维护生产日历')
    return
  }
  try {
    await productionApi.setDefaultCalendar(row.id)
    ElMessage.success(`已将「${row.name}」设为默认班次`)
    await fetchCalendars()
  } catch {
    ElMessage.error('设置默认失败')
  }
}

// ============ 单日编辑 ============
function openDayEdit(cell) {
  if (!canUpdateCalendar.value) return
  const dow = dayjs(cell.dateStr).day()
  const override = overrides.value.get(cell.dateStr)

  dayEditForm.value = {
    calendar_date: cell.dateStr,
    weekdayText: weekdayNames[dow],
    is_workday: cell.isWorkday,
    work_start: override?.work_start ? fmtTime(override.work_start) : '',
    work_end: override?.work_end ? fmtTime(override.work_end) : '',
    break_start: override?.break_start ? fmtTime(override.break_start) : '',
    break_end: override?.break_end ? fmtTime(override.break_end) : '',
    dinner_start: override?.dinner_start ? fmtTime(override.dinner_start) : '',
    dinner_end: override?.dinner_end ? fmtTime(override.dinner_end) : '',
    label: override?.label || '',
    hasOverride: !!override,
  }
  dayEditVisible.value = true
}

async function handleSaveDay() {
  if (!canUpdateCalendar.value) {
    ElMessage.error('无权维护生产日历')
    return
  }
  saving.value = true
  try {
    await productionApi.saveCalendarOverrides({
      overrides: [{
        calendar_date: dayEditForm.value.calendar_date,
        is_workday: dayEditForm.value.is_workday,
        work_start: dayEditForm.value.work_start || null,
        work_end: dayEditForm.value.work_end || null,
        break_start: dayEditForm.value.break_start || null,
        break_end: dayEditForm.value.break_end || null,
        dinner_start: dayEditForm.value.dinner_start || null,
        dinner_end: dayEditForm.value.dinner_end || null,
        label: dayEditForm.value.label || null,
      }],
    })
    ElMessage.success(`${dayEditForm.value.calendar_date} 已更新`)
    dayEditVisible.value = false
    await fetchOverrides()
  } catch (e) {
    ElMessage.error('保存失败: ' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

async function handleResetDay() {
  if (!canUpdateCalendar.value) {
    ElMessage.error('无权维护生产日历')
    return
  }
  saving.value = true
  try {
    await productionApi.deleteCalendarOverride(dayEditForm.value.calendar_date)
    ElMessage.success(`${dayEditForm.value.calendar_date} 已恢复默认`)
    dayEditVisible.value = false
    await fetchOverrides()
  } catch {
    ElMessage.error('恢复默认失败')
  } finally {
    saving.value = false
  }
}

// ============ 初始化 ============
fetchCalendars()
fetchOverrides()
</script>

<style scoped>
/* 标题区域的 card-header 复用全局 module-page 样式 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-header span {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

/* 月份导航 */
.month-nav {
  display: flex;
  align-items: center;
  gap: 8px;
}
.month-label {
  font-size: 15px;
  font-weight: 700;
  min-width: 100px;
  text-align: center;
  color: var(--color-text-primary);
}

/* 日历网格 */
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}
.calendar-weekday {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border-lighter);
}

/* 日期格子 */
.calendar-cell {
  min-height: 78px;
  padding: 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-lighter);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.calendar-cell:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}
.calendar-cell.is-other-month {
  opacity: 0.3;
  cursor: default;
}
.calendar-cell.is-other-month:hover {
  border-color: var(--color-border-lighter);
  box-shadow: none;
}
.calendar-cell.is-today {
  border-color: var(--color-primary);
  border-width: 2px;
}

/* 工作日/休息日颜色 */
.calendar-cell.is-workday {
  background: color-mix(in srgb, var(--color-success) 6%, var(--color-bg-base));
}
.calendar-cell.is-rest {
  background: color-mix(in srgb, var(--color-border-light) 30%, var(--color-bg-base));
}
.calendar-cell.is-override.is-workday {
  background: color-mix(in srgb, var(--color-warning) 12%, var(--color-bg-base));
  border-color: var(--color-warning);
}
.calendar-cell.is-override.is-rest {
  background: color-mix(in srgb, var(--color-danger) 8%, var(--color-bg-base));
  border-color: var(--color-danger);
}

.calendar-cell__day {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text-primary);
}
.calendar-cell__info {
  font-size: 11px;
}
.calendar-cell__time {
  font-size: 10px;
  color: var(--color-text-secondary);
}

/* 标签 */
.cell-badge {
  display: inline-block;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 16px;
  font-weight: 500;
}
.cell-badge.work {
  background: var(--color-warning);
  color: #fff;
}
.cell-badge.rest {
  background: var(--color-danger);
  color: #fff;
}
.cell-badge.default-work {
  color: var(--color-success);
}
.cell-badge.default-rest {
  color: var(--color-text-secondary);
}

/* 图例 */
.calendar-legend {
  display: flex;
  gap: 16px;
  padding: 12px 0 4px;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid var(--color-border-lighter);
}
.legend-dot.default-work {
  background: color-mix(in srgb, var(--color-success) 15%, var(--color-bg-base));
}
.legend-dot.default-rest {
  background: color-mix(in srgb, var(--color-border-light) 40%, var(--color-bg-base));
}
.legend-dot.override-work {
  background: color-mix(in srgb, var(--color-warning) 25%, var(--color-bg-base));
  border-color: var(--color-warning);
}
.legend-dot.override-rest {
  background: color-mix(in srgb, var(--color-danger) 15%, var(--color-bg-base));
  border-color: var(--color-danger);
}

/* 弹窗底部按钮 */
:deep(.el-dialog__footer) {
  display: flex;
  align-items: center;
}
</style>
