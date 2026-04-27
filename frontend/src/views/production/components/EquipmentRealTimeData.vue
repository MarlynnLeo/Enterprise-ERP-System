<!--
/**
 * EquipmentRealTimeData.vue
 * @description Vue组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="equipment-realtime-data">
    <!-- 控制面板 -->
    <div class="control-panel">
      <div class="time-range-selector">
        <el-radio-group v-model="timeRange" @change="handleTimeRangeChange">
          <el-radio-button value="1h">1小时</el-radio-button>
          <el-radio-button value="24h">24小时</el-radio-button>
          <el-radio-button value="7d">7天</el-radio-button>
        </el-radio-group>
      </div>
      
      <div class="control-buttons">
        <el-button @click="refreshData" :loading="loading">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button @click="toggleAutoRefresh" :type="autoRefresh ? 'success' : ''">
          <el-icon><Timer /></el-icon>
          {{ autoRefresh ? '停止自动刷新' : '开启自动刷新' }}
        </el-button>
      </div>
    </div>

    <!-- 参数卡片 -->
    <div class="parameter-cards" v-loading="loading">
      <el-row :gutter="20">
        <el-col 
          v-for="(parameter, parameterCode) in realTimeData" 
          :key="parameterCode"
          :xs="24" :sm="12" :md="8" :lg="6" :xl="6"
        >
          <el-card class="parameter-card">
            <template #header>
              <div class="parameter-header">
                <span class="parameter-name">{{ parameter.parameter_name }}</span>
                <el-tag 
                  :type="getParameterStatusType(parameter)" 
                  size="small"
                >
                  {{ getParameterStatusText(parameter) }}
                </el-tag>
              </div>
            </template>
            
            <div class="parameter-content">
              <!-- 当前值显示 -->
              <div class="current-value">
                <span class="value">
                  {{ getCurrentValue(parameter) }}
                </span>
                <span class="unit" v-if="parameter.unit">{{ parameter.unit }}</span>
              </div>
              
              <!-- 趋势图 -->
              <div class="trend-chart" :id="`chart-${parameterCode}`"></div>
              
              <!-- 统计信息 -->
              <div class="parameter-stats">
                <div class="stat-item">
                  <span class="label">数据点:</span>
                  <span class="value">{{ parameter.data.length }}</span>
                </div>
                <div class="stat-item">
                  <span class="label">最后更新:</span>
                  <span class="value">{{ getLastUpdateTime(parameter) }}</span>
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <!-- 无数据提示 -->
    <el-empty 
      v-if="!loading && Object.keys(realTimeData).length === 0"
      description="暂无实时数据"
    />
  </div>
</template>

<script setup>

import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, Timer } from '@element-plus/icons-vue'
import { equipmentMonitoringAPI } from '@/api/modules/business/equipmentMonitoring'
import { formatTime } from '@/utils/helpers/dateUtils'
import * as echarts from 'echarts'

// Props
const props = defineProps({
  equipmentId: {
    type: [String, Number],
    required: true
  },
  equipmentName: {
    type: String,
    default: ''
  }
})

// 响应式数据
const loading = ref(false)
const timeRange = ref('1h')
const autoRefresh = ref(false)
const realTimeData = ref({})
const charts = reactive({})

// 统一的 resize 处理函数（具名引用，确保可移除）
const handleResize = () => {
  Object.values(charts).forEach(chart => {
    if (chart && !chart.isDisposed()) {
      chart.resize()
    }
  })
}

// 定时器
let refreshTimer = null

// 方法
const fetchRealTimeData = async () => {
  try {
    loading.value = true
    const response = await equipmentMonitoringAPI.getEquipmentRealTimeData(
      props.equipmentId, 
      timeRange.value
    )
    realTimeData.value = response.data
    
    // 更新图表
    await nextTick()
    updateCharts()
  } catch (error) {
    ElMessage.error('获取实时数据失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

const updateCharts = () => {
  Object.keys(realTimeData.value).forEach(parameterCode => {
    const parameter = realTimeData.value[parameterCode]
    const chartId = `chart-${parameterCode}`
    const chartElement = document.getElementById(chartId)
    
    if (chartElement) {
      // 销毁旧图表
      if (charts[parameterCode]) {
        charts[parameterCode].dispose()
      }
      
      // 创建新图表
      const chart = echarts.init(chartElement)
      charts[parameterCode] = chart
      
      // 准备数据
      const timeData = []
      const valueData = []
      
      parameter.data.forEach(item => {
        timeData.push(formatTime(item.timestamp))
        valueData.push(item.value !== null ? item.value : 0)
      })
      
      // 图表配置
      const option = {
        grid: {
          top: 10,
          left: 10,
          right: 10,
          bottom: 20,
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: timeData,
          axisLabel: {
            fontSize: 10,
            rotate: 45
          }
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            fontSize: 10
          }
        },
        series: [{
          data: valueData,
          type: 'line',
          smooth: true,
          lineStyle: {
            width: 2,
            color: getParameterColor(parameter)
          },
          itemStyle: {
            color: getParameterColor(parameter)
          },
          areaStyle: {
            opacity: 0.1,
            color: getParameterColor(parameter)
          }
        }],
        tooltip: {
          trigger: 'axis',
          formatter: function(params) {
            const point = params[0]
            return `${point.name}<br/>${point.value}${parameter.unit || ''}`
          }
        }
      }
      
      chart.setOption(option)
    }
  })
}

const refreshData = () => {
  fetchRealTimeData()
}

const handleTimeRangeChange = () => {
  fetchRealTimeData()
}

const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value
  
  if (autoRefresh.value) {
    refreshTimer = setInterval(() => {
      fetchRealTimeData()
    }, 10000) // 10秒刷新一次
    ElMessage.success('已开启自动刷新')
  } else {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    ElMessage.info('已停止自动刷新')
  }
}

// 工具方法
const getCurrentValue = (parameter) => {
  if (parameter.data.length === 0) return '-'
  
  const latestData = parameter.data[0] // 数据按时间倒序排列
  if (latestData.value !== null) {
    return latestData.value
  } else if (latestData.text_value) {
    return latestData.text_value
  }
  return '-'
}

const getLastUpdateTime = (parameter) => {
  if (parameter.data.length === 0) return '-'
  
  const latestData = parameter.data[0]
  return formatTime(latestData.timestamp)
}

const getParameterStatusText = (parameter) => {
  if (parameter.data.length === 0) return '无数据'
  
  const latestData = parameter.data[0]
  const statusMap = {
    normal: '正常',
    warning: '警告',
    alarm: '报警',
    error: '错误'
  }
  return statusMap[latestData.status] || latestData.status
}

const getParameterStatusType = (parameter) => {
  if (parameter.data.length === 0) return 'info'
  
  const latestData = parameter.data[0]
  const typeMap = {
    normal: 'success',
    warning: 'warning',
    alarm: 'danger',
    error: 'danger'
  }
  return typeMap[latestData.status] || 'info'
}

const getParameterColor = (parameter) => {
  if (parameter.data.length === 0) return '#909399'
  
  const latestData = parameter.data[0]
  const colorMap = {
    normal: '#67c23a',
    warning: '#e6a23c',
    alarm: '#f56c6c',
    error: '#f56c6c'
  }
  return colorMap[latestData.status] || '#409eff'
}

// 生命周期
onMounted(() => {
  fetchRealTimeData()
  // 注册统一的 resize 监听（仅注册一次）
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  // 移除 resize 监听
  window.removeEventListener('resize', handleResize)
  
  // 清理定时器
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
  
  // 销毁图表
  Object.values(charts).forEach(chart => {
    if (chart) {
      chart.dispose()
    }
  })
})
</script>

<style scoped>
.equipment-realtime-data {
  padding: 20px;
}

.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
  padding: 16px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

.control-buttons {
  display: flex;
  gap: 10px;
}

.parameter-cards {
  min-height: 400px;
}

.parameter-card {
  height: 300px;
  margin-bottom: var(--spacing-lg);
}

.parameter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.parameter-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.parameter-content {
  height: 200px;
  display: flex;
  flex-direction: column;
}

.current-value {
  text-align: center;
  margin-bottom: 10px;
}

.current-value .value {
  font-size: 24px;
  font-weight: bold;
  color: var(--color-text-primary);
}

.current-value .unit {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-left: 4px;
}

.trend-chart {
  flex: 1;
  min-height: 120px;
}

.parameter-stats {
  display: flex;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-lighter);
}

.stat-item {
  font-size: 12px;
}

.stat-item .label {
  color: var(--color-text-secondary);
}

.stat-item .value {
  color: var(--color-text-primary);
  margin-left: 4px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .equipment-realtime-data {
    padding: 10px;
  }
  
  .control-panel {
    flex-direction: column;
    gap: 10px;
  }
  
  .parameter-card {
    height: 250px;
  }
  
  .current-value .value {
    font-size: 20px;
  }
  
  .trend-chart {
    min-height: 100px;
  }
}
</style>
