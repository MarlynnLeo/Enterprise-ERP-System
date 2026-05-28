/**
 * 设备监控相关API
 */

import { api } from '@/services/axiosInstance'

export const equipmentMonitoringAPI = {
  /**
   * 获取设备列表
   */
  getEquipmentList(params = {}) {
    return api.get('/equipment-monitoring/equipment', { params })
  },

  /**
   * 获取设备详细信息
   */
  getEquipmentDetail(id) {
    return api.get(`/equipment-monitoring/equipment/${id}`)
  },

  /**
   * 获取设备实时数据
   */
  getEquipmentRealTimeData(id, timeRange = '1h') {
    return api.get(`/equipment-monitoring/equipment/${id}/realtime-data`, { params: { timeRange } })
  },

  /**
   * 获取设备健康状态
   */
  getEquipmentHealth(id) {
    return api.get(`/equipment-monitoring/equipment/${id}/health`)
  },

  /**
   * 更新设备状态
   */
  updateEquipmentStatus(id, data) {
    return api.put(`/equipment-monitoring/equipment/${id}/status`, data)
  },

  /**
   * 记录设备数据
   */
  recordEquipmentData(id, data) {
    return api.post(`/equipment-monitoring/equipment/${id}/data`, data)
  },

  /**
   * 批量记录设备数据
   */
  batchRecordEquipmentData(id, dataPoints) {
    return api.post(`/equipment-monitoring/equipment/${id}/data/batch`, { dataPoints })
  },

  /**
   * 获取设备报警列表
   */
  getEquipmentAlarms(params = {}) {
    return api.get('/equipment-monitoring/alarms', { params })
  },

  /**
   * 确认报警
   */
  acknowledgeAlarm(id, note = '') {
    return api.put(`/equipment-monitoring/alarms/${id}/acknowledge`, { note })
  },

  /**
   * 解决报警
   */
  resolveAlarm(id, resolutionNote) {
    return api.put(`/equipment-monitoring/alarms/${id}/resolve`, { resolutionNote })
  },

  /**
   * 获取设备统计信息
   */
  getStatistics() {
    return api.get('/equipment-monitoring/statistics')
  }
}
