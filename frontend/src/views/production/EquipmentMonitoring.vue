<!--
/**
 * EquipmentMonitoring.vue
 * @description 前端界面组件文件
  * @date 2025-08-27
 * @version 1.0.0
 */
-->
<template>
  <div class="equipment-monitoring">
    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-cards">
      <el-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <el-card class="stat-card online">
          <div class="stat-content">
            <div class="stat-icon">
              <el-icon><Monitor /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.onlineCount || 0 }}</div>
              <div class="stat-label">在线设备</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <el-card class="stat-card offline">
          <div class="stat-content">
            <div class="stat-icon">
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.offlineCount || 0 }}</div>
              <div class="stat-label">离线设备</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <el-card class="stat-card alarm">
          <div class="stat-content">
            <div class="stat-icon">
              <el-icon><Bell /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.alarmCount || 0 }}</div>
              <div class="stat-label">活跃报警</div>
            </div>
          </div>
        </el-card>
      </el-col>
      
      <el-col :xs="12" :sm="6" :md="6" :lg="6" :xl="6">
        <el-card class="stat-card maintenance">
          <div class="stat-content">
            <div class="stat-icon">
              <el-icon><Tools /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ statistics.maintenanceCount || 0 }}</div>
              <div class="stat-label">维护中</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 设备列表 -->
    <el-card class="equipment-list-card">
      <template #header>
        <div class="card-header">
          <span>设备监控</span>
          <div class="header-actions">
            <el-button @click="refreshData" :loading="loading">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <!-- 筛选条件 -->
      <div class="filter-section">
        <el-form :inline="true" class="search-form filter-form" :model="filters">
          <el-form-item label="设备类型">
            <el-select  v-model="filters.equipment_type" placeholder="全部类型" clearable>
              <el-option label="生产设备" value="production" />
              <el-option label="检测设备" value="testing" />
              <el-option label="包装设备" value="packaging" />
              <el-option label="运输设备" value="transport" />
              <el-option label="辅助设备" value="auxiliary" />
            </el-select>
          </el-form-item>
          
          <el-form-item label="设备状态">
            <el-select  v-model="filters.status" placeholder="全部状态" clearable>
              <el-option label="在线" value="online" />
              <el-option label="离线" value="offline" />
              <el-option label="维护中" value="maintenance" />
              <el-option label="故障" value="error" />
              <el-option label="空闲" value="idle" />
            </el-select>
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              <el-icon><Search /></el-icon>
              查询
            </el-button>
            <el-button @click="resetFilters">重置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 设备表格 -->
      <el-table 
        :data="equipmentList" 
        v-loading="loading"
        stripe
        border
        @row-click="handleRowClick"
        style="cursor: pointer;"
      >
        <el-table-column prop="equipment_code" label="设备编码" width="120" />
        <el-table-column prop="equipment_name" label="设备名称" min-width="150" />
        <el-table-column prop="equipment_type" label="设备类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getEquipmentTypeTagType(row.equipment_type)">
              {{ getEquipmentTypeText(row.equipment_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="getStatusTagType(row.status)">
              {{ getStatusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="model" label="型号" width="120" />
        <el-table-column prop="manufacturer" label="制造商" width="120" />
        <el-table-column prop="ip_address" label="IP地址" width="120" />
        <el-table-column prop="updated_at" label="最后更新" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.updated_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click.stop="viewDetail(row)">
              详情
            </el-button>
            <el-button size="small" @click.stop="viewRealTimeData(row)">
              实时数据
            </el-button>
            <el-dropdown @command="(command) => handleStatusChange(row, command)" @click.stop>
              <el-button size="small">
                状态 <el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="online">设为在线</el-dropdown-item>
                  <el-dropdown-item command="offline">设为离线</el-dropdown-item>
                  <el-dropdown-item command="maintenance">设为维护</el-dropdown-item>
                  <el-dropdown-item command="error">设为故障</el-dropdown-item>
                  <el-dropdown-item command="idle">设为空闲</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="pagination.total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 设备详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="设备详情"
      width="80%"
      :before-close="handleDetailClose"
    >
      <EquipmentDetail 
        v-if="selectedEquipment"
        :equipment-id="selectedEquipment.id"
        @close="detailDialogVisible = false"
      />
    </el-dialog>

    <!-- 实时数据对话框 -->
    <el-dialog
      v-model="realTimeDialogVisible"
      title="实时数据监控"
      width="90%"
      :before-close="handleRealTimeClose"
    >
      <EquipmentRealTimeData 
        v-if="selectedEquipment"
        :equipment-id="selectedEquipment.id"
        :equipment-name="selectedEquipment.equipment_name"
        @close="realTimeDialogVisible = false"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import apiAdapter from '@/utils/apiAdapter';
import { parsePaginatedData } from '@/utils/responseParser';

import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Monitor, Warning, Bell, Tools, Refresh, Search, ArrowDown
} from '@element-plus/icons-vue'
import EquipmentDetail from './components/EquipmentDetail.vue'
import EquipmentRealTimeData from './components/EquipmentRealTimeData.vue'
import { equipmentMonitoringAPI } from '@/api/modules/business/equipmentMonitoring'
import { formatDateTime } from '@/utils/helpers/dateUtils'
import { useAuthStore } from '@/stores/auth'

// 权限store
const authStore = useAuthStore()

// 响应式数据
const loading = ref(false)
const equipmentList = ref([])
const statistics = ref({})
const selectedEquipment = ref(null)
const detailDialogVisible = ref(false)
const realTimeDialogVisible = ref(false)

// 筛选条件
const filters = reactive({
  equipment_type: '',
  status: ''
})

// 分页
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0
})

// 自动刷新定时器
let refreshTimer = null

// 方法
const fetchEquipmentList = async () => {
  try {
    loading.value = true
    const params = {
      ...filters,
      page: pagination.page,
      pageSize: pagination.pageSize
    }
    
    const response = await equipmentMonitoringAPI.getEquipmentList(params)
    // 使用统一解析器
    const { list, total } = parsePaginatedData(response, { enableLog: false })
    equipmentList.value = list
    pagination.total = total
  } catch (error) {
    ElMessage.error('获取设备列表失败: ' + error.message)
  } finally {
    loading.value = false
  }
}

const fetchStatistics = async () => {
  try {
    const response = await equipmentMonitoringAPI.getStatistics()
    // axios拦截器已自动解包ResponseHandler格式
    const stats = response.data?.data || response.data || {}

    // 确保 statusDistribution 和 alarmDistribution 是数组
    const statusDistribution = Array.isArray(stats.statusDistribution) ? stats.statusDistribution : []
    const alarmDistribution = Array.isArray(stats.alarmDistribution) ? stats.alarmDistribution : []

    // 处理统计数据
    statistics.value = {
      onlineCount: statusDistribution.find(s => s.status === 'online')?.count || 0,
      offlineCount: statusDistribution.find(s => s.status === 'offline')?.count || 0,
      maintenanceCount: statusDistribution.find(s => s.status === 'maintenance')?.count || 0,
      alarmCount: alarmDistribution.reduce((sum, alarm) => sum + (alarm.count || 0), 0)
    }
  } catch (error) {
    console.error('获取统计数据失败:', error)
  }
}

const refreshData = async () => {
  await Promise.all([
    fetchEquipmentList(),
    fetchStatistics()
  ])
}

const handleSearch = () => {
  pagination.page = 1
  fetchEquipmentList()
}

const resetFilters = () => {
  filters.equipment_type = ''
  filters.status = ''
  pagination.page = 1
  fetchEquipmentList()
}

const handleSizeChange = (size) => {
  pagination.pageSize = size
  pagination.page = 1
  fetchEquipmentList()
}

const handleCurrentChange = (page) => {
  pagination.page = page
  fetchEquipmentList()
}

const handleRowClick = (row) => {
  viewDetail(row)
}

const viewDetail = (equipment) => {
  selectedEquipment.value = equipment
  detailDialogVisible.value = true
}

const viewRealTimeData = (equipment) => {
  selectedEquipment.value = equipment
  realTimeDialogVisible.value = true
}

const handleDetailClose = () => {
  detailDialogVisible.value = false
  selectedEquipment.value = null
}

const handleRealTimeClose = () => {
  realTimeDialogVisible.value = false
  selectedEquipment.value = null
}

const handleStatusChange = async (equipment, newStatus) => {
  try {
    const { value: reason } = await ElMessageBox.prompt(
      `确定要将设备 ${equipment.equipment_name} 状态改为 ${getStatusText(newStatus)} 吗？`,
      '状态变更',
      {
        inputPlaceholder: '请输入变更原因（可选）',
        inputType: 'textarea'
      }
    )

    await equipmentMonitoringAPI.updateEquipmentStatus(equipment.id, {
      status: newStatus,
      reason: reason || ''
    })

    ElMessage.success('设备状态更新成功')
    await refreshData()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('更新设备状态失败: ' + error.message)
    }
  }
}

import { getEquipmentStatusText, getEquipmentStatusColor } from '@/constants/systemConstants'

// 工具方法
const getStatusText = (status) => {
  return getEquipmentStatusText(status)
}

const getStatusTagType = (status) => {
  return getEquipmentStatusColor(status)
}

const getEquipmentTypeText = (type) => {
  const typeMap = {
    production: '生产',
    testing: '检测',
    packaging: '包装',
    transport: '运输',
    auxiliary: '辅助'
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

// 生命周期
onMounted(() => {
  refreshData()
  
  // 设置自动刷新
  refreshTimer = setInterval(() => {
    refreshData()
  }, 30000) // 30秒刷新一次
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
  }
})
</script>

<style scoped>
.equipment-monitoring {
  padding: 20px;
}

.stats-cards {
  margin-bottom: var(--spacing-lg);
}

.stat-card.online {
  border-left: 4px solid #67c23a;
}

.stat-card.offline {
  border-left: 4px solid var(--color-text-secondary);
}

.stat-card.alarm {
  border-left: 4px solid #f56c6c;
}

.stat-card.maintenance {
  border-left: 4px solid #e6a23c;
}

.stat-content {
  display: flex;
  align-items: center;
}

.stat-icon {
  font-size: 32px;
  margin-right: 16px;
  color: var(--color-primary);
}

.stat-info {
  flex: 1;
}

.equipment-list-card {
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.filter-section {
  margin-bottom: var(--spacing-lg);
  padding: 16px;
  background-color: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}

.filter-form {
  margin-bottom: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .equipment-monitoring {
    padding: 10px;
  }
  
  .stats-cards {
    margin-bottom: 15px;
  }
  
  .filter-form {
    display: block;
  }
  
  .filter-form .el-form-item {
    display: block;
    margin-bottom: 10px;
  }
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
