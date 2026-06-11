<!--
/**
 * DashboardCalendar.vue
 * @description 仪表盘日历组件
 */
-->
<template>
  <div class="calendar-wrapper">
    <div class="calendar-header">
      <div class="month-selector">
        <el-icon class="month-arrow" @click="$emit('change-month', -1)"><ArrowLeft /></el-icon>
        <span>{{ currentMonthStr }}</span>
        <el-icon class="month-arrow" @click="$emit('change-month', 1)"><ArrowRight /></el-icon>
      </div>
      <el-button link class="more-btn">更多</el-button>
    </div>
    <div class="calendar-alert">{{ currentYear }}年{{ currentMonth }}月{{ currentDay }}日</div>
    <div class="calendar-content">
      <div class="weekdays-header">
        <div class="weekday">日</div>
        <div class="weekday">一</div>
        <div class="weekday">二</div>
        <div class="weekday">三</div>
        <div class="weekday">四</div>
        <div class="weekday">五</div>
        <div class="weekday">六</div>
      </div>
      <div class="days-grid">
        <div class="day-cell" v-for="day in calendarDays" :key="day.date">
          <div :class="['day-number', {'has-events': day.hasEvents, 'current': day.isCurrentDay, 'other-month': !day.isCurrentMonth}]">
            {{ day.date }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ArrowLeft, ArrowRight } from '@element-plus/icons-vue'

defineProps({
  currentYear: {
    type: Number,
    required: true
  },
  currentMonth: {
    type: Number,
    required: true
  },
  currentDay: {
    type: Number,
    required: true
  },
  currentMonthStr: {
    type: String,
    required: true
  },
  calendarDays: {
    type: Array,
    default: () => []
  }
})

defineEmits(['change-month'])
</script>
