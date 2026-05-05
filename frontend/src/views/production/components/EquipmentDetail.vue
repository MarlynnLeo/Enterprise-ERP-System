<!--
/**
 * EquipmentDetail.vue
 * @description Vue组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="equipment-detail" v-loading="loading">
    <el-row :gutter="20">
      <!-- 基本信息 -->
      <el-col :span="12">
        <el-card title="基本信息">
          <template #header>
            <span>基本信息</span>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="设备编码">
              {{ equipment.equipment_code }}
            </el-descriptions-item>
            <el-descriptions-item label="设备名称">
              {{ equipment.equipment_name }}
            </el-descriptions-item>
            <el-descriptions-item label="设备类型">
              <el-tag :type="getEquipmentTypeTagType(equipment.equipment_type)">
                {{ getEquipmentTypeText(equipment.equipment_type) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="当前状态">
              <el-tag :type="getStatusTagType(equipment.status)">
                {{ getStatusText(equipment.status) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="设备型号">
              {{ equipment.model || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="制造商">
              {{ equipment.manufacturer || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="序列号">
              {{ equipment.serial_number || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="IP地址">
              {{ equipment.ip_address || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="端口">
              {{ equipment.port || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="连接方式">
              {{ equipment.connection_type || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <!-- 健康状态 -->
      <el-col :span="12">
        <el-card title="健康状态">
          <template #header>
            <span>健康状态</span>
          </template>
          <div class="health-status">
            <div class="health-score">
              <el-progress
                type="circle"
                :percentage="healthData.healthScore || 0"
                :color="getHealthColor(healthData.healthScore)"
                :width="120"
              >
                <template #default="{ percentage }">
                  <span class="percentage-value">{{ percentage }}%</span>
                  <span class="percentage-label">健康度</span>
                </template>
              </el-progress>
            </div>
            <div class="health-info">
              <div class="health-status-item">
                <span class="label">健康状态:</span>
                <el-tag :type="getHealthStatusTagType(healthData.healthStatus)">
                  {{ getHealthStatusText(healthData.healthStatus) }}
                </el-tag>
              </div>
              <div class="health-status-item">
                <span class="label">活跃报警:</span>
                <span class="value">{{ healthData.activeAlarmsCount || 0 }} 个</span>
              </div>
              <div class="health-status-item">
                <span class="label">最后更新:</span>
                <span class="value">{{ formatDateTime(healthData.lastUpdated) }}</span>
              </div>
              <div v-if="healthData.issues && healthData.issues.length > 0" class="health-issues">
                <span class="label">问题:</span>
                <div class="issues-list">
                  <el-tag 
                    v-for="issue in healthData.issues" 
                    :key="issue" 
                    type="warning" 
                    size="small"
                    style="margin: 2px;"
                  >
                    {{ issue }}
                  </el-tag>
                </div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
    <!-- 当前参数数据 -->
    <el-card title="当前参数数据" style="margin-top: 20px;">
      <template #header>
        <div class="card-header">
          <span>当前参数数据</span>
          <el-button @click="refreshCurrentData" :loading="refreshing">
            <el-icon><Refresh /></el-icon>
            刷新
          </el-button>
        </div>
      </template>
      
      <el-table :data="equipment.currentData" stripe border>
        <el-table-column prop="parameter_name" label="参数名称" width="150" />
        <el-table-column prop="parameter_code" label="参数代码" width="120" />
        <el-table-column label="当前值" width="120">
          <template #default="{ row }">
            <span v-if="row.value !== null">{{ row.value }}</span>
            <span v-else-if="row.text_value">{{ row.text_value }}</span>
            <span v-else class="no-data">无数据</span>
          </template>
        </el-table-column>
        <el-table-column prop="unit" label="单位" width="80" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getDataStatusTagType(row.status)">
              {{ getDataStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="timestamp" label="更新时间" width="160">
          <template #default="{ row }">
            {{ row.timestamp ? formatDateTime(row.timestamp) : '-' }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    <!-- 活跃报警 -->
    <el-card title="活跃报警" style="margin-top: 20px;" v-if="equipment.activeAlarms && equipment.activeAlarms.length > 0">
      <template #header>
        <span>活跃报警</span>
      </template>
      
      <el-table :data="equipment.activeAlarms" stripe border>
        <el-table-column prop="alarm_level" label="级别" width="100">
          <template #default="{ row }">
            <el-tag :type="getAlarmLevelTagType(row.alarm_level)">
              {{ getAlarmLevelText(row.alarm_level) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="alarm_message" label="报警信息" min-width="200" />
        <el-table-column prop="current_value" label="当前值" width="100" />
        <el-table-column prop="threshold_value" label="阈值" width="100" />
        <el-table-column prop="occurred_at" label="发生时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.occurred_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="acknowledgeAlarm(row.id)">
              确认
            </el-button>
            <el-button size="small" type="success" @click="resolveAlarm(row)">
              解决
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { equipmentMonitoringAPI } from '@/api/modules/business/equipmentMonitoring'
import { formatDateTime } from '@/utils/helpers/dateUtils'
// Props
const props = defineProps({
  equipmentId: {
    type: [String, Number],
    required: true
  }
})
// Emits
const _emit = defineEmits(['close'])
// 响应式数据
const loading = ref(false)
const refreshing = ref(false)
const equipment = ref({})
const healthData = ref({})
// 方法
const fetchEquipmentDetail = async () => {
  try {
    loading.value = true
    const response = await equipmentMonitoringAPI.getEquipmentDetail(props.equipmentId)
    equipment.value = response.data
  } catch (error) {
    ElMessage.error('获取设备详情失败: ' + error.message)
  } finally {
    loading.value = false
  }
}
const fetchHealthData = async () => {
  try {
    const response = await equipmentMonitoringAPI.getEquipmentHealth(props.equipmentId)
    healthData.value = response.data
  } catch (error) {
    console.error('获取健康数据失败:', error)
  }
}
const refreshCurrentData = async () => {
  try {
    refreshing.value = true
    await fetchEquipmentDetail()
    await fetchHealthData()
  } finally {
    refreshing.value = false
  }
}
const acknowledgeAlarm = async (alarmId) => {
  try {
    const { value: note } = await ElMessageBox.prompt(
      '确认此报警，请输入备注信息（可选）',
      '确认报警',
      {
        inputPlaceholder: '备注信息',
        inputType: 'textarea'
      }
    )
    await equipmentMonitoringAPI.acknowledgeAlarm(alarmId, note || '')
    ElMessage.success('报警确认成功')
    await refreshCurrentData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('确认报警失败: ' + error.message)
    }
  }
}
const resolveAlarm = async (alarm) => {
  try {
    const { value: resolutionNote } = await ElMessageBox.prompt(
      `解决报警: ${alarm.alarm_message}`,
      '解决报警',
      {
        inputPlaceholder: '请输入解决方案和处理结果',
        inputType: 'textarea',
        inputValidator: (value) => {
          if (!value || value.trim() === '') {
            return '请输入解决说明'
          }
          return true
        }
      }
    )
    await equipmentMonitoringAPI.resolveAlarm(alarm.id, resolutionNote)
    ElMessage.success('报警解决成功')
    await refreshCurrentData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('解决报警失败: ' + error.message)
    }
  }
}
// 工具方法
const getStatusText = (status) => {
  const statusMap = {
    online: '在线',
    offline: '离线',
    maintenance: '维护中',
    error: '故障',
    idle: '空闲'
  }
  return statusMap[status] || status
}
const getStatusTagType = (status) => {
  const typeMap = {
    online: 'success',
    offline: 'info',
    maintenance: 'warning',
    error: 'danger',
    idle: ''
  }
  return typeMap[status] || ''
}
const getEquipmentTypeText = (type) => {
  const typeMap = {
    production: '生产设备',
    testing: '检测设备',
    packaging: '包装设备',
    transport: '运输设备',
    auxiliary: '辅助设备'
  }
  return typeMap[type] || type
}
const getEquipmentTypeTagType = (type) => {
  const typeMap = {
    production: 'success',
    testing: 'warning',
    packaging: 'info',
    transport: '',
    auxiliary: 'info'
  }
  return typeMap[type] || ''
}
const getHealthColor = (score) => {
  if (score >= 80) return '#67c23a'
  if (score >= 60) return '#e6a23c'
  return '#f56c6c'
}
const getHealthStatusText = (status) => {
  const statusMap = {
    healthy: '健康',
    warning: '警告',
    critical: '严重'
  }
  return statusMap[status] || status
}
const getHealthStatusTagType = (status) => {
  const typeMap = {
    healthy: 'success',
    warning: 'warning',
    critical: 'danger'
  }
  return typeMap[status] || ''
}
const getDataStatusText = (status) => {
  const statusMap = {
    normal: '正常',
    warning: '警告',
    alarm: '报警',
    error: '错误'
  }
  return statusMap[status] || status
}
const getDataStatusTagType = (status) => {
  const typeMap = {
    normal: 'success',
    warning: 'warning',
    alarm: 'danger',
    error: 'danger'
  }
  return typeMap[status] || ''
}
const getAlarmLevelText = (level) => {
  const levelMap = {
    info: '信息',
    warning: '警告',
    alarm: '报警',
    critical: '严重'
  }
  return levelMap[level] || level
}
const getAlarmLevelTagType = (level) => {
  const typeMap = {
    info: 'info',
    warning: 'warning',
    alarm: 'danger',
    critical: 'danger'
  }
  return typeMap[level] || ''
}
// 生命周期
onMounted(async () => {
  await Promise.all([
    fetchEquipmentDetail(),
    fetchHealthData()
  ])
})
</script>
<style scoped>
.equipment-detail {
  padding: 20px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.health-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
}
.health-score {
  flex-shrink: 0;
}
.percentage-value {
  display: block;
  font-size: 16px;
  font-weight: bold;
}
.percentage-label {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
}
.health-info {
  flex: 1;
}
.health-status-item {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
}
.health-status-item .label {
  width: 80px;
  color: var(--color-text-regular);
  font-size: 14px;
}
.health-status-item .value {
  color: var(--color-text-primary);
  font-size: 14px;
}
.health-issues {
  margin-top: 10px;
}
.health-issues .label {
  display: block;
  margin-bottom: 5px;
  color: var(--color-text-regular);
  font-size: 14px;
}
.issues-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.no-data {
  color: var(--color-text-placeholder);
  font-style: italic;
}
/* 详情对话框长文本处理 - 自动添加 */
:deep(.el-descriptions__content) {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.el-table__cell) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>