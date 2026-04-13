/**
 * 自动化设备监控控制器
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const equipmentMonitoringService = require('../../../services/business/EquipmentMonitoringService');
// const { validateData, ValidationRules } = require('../../../utils/validator');
const { EQUIPMENT_STATUS } = require('../../../constants/systemConstants');

/**
 * 获取设备列表
 */
const getEquipmentList = async (req, res) => {
  try {
    const filters = {
      equipment_type: req.query.equipment_type,
      status: req.query.status,
      location_id: req.query.location_id,
      workshop_id: req.query.workshop_id,
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20,
    };

    const result = await equipmentMonitoringService.getEquipmentList(filters);

    ResponseHandler.success(res, result, '获取设备列表成功');
  } catch (error) {
    logger.error('获取设备列表失败:', error);
    ResponseHandler.error(res, '获取设备列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取设备详细信息
 */
const getEquipmentDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return ResponseHandler.error(res, '设备ID不能为空', 'BAD_REQUEST', 400);
    }

    const equipment = await equipmentMonitoringService.getEquipmentDetail(id);

    ResponseHandler.success(res, equipment, '获取设备详情成功');
  } catch (error) {
    logger.error('获取设备详情失败:', error);
    ResponseHandler.error(res, '获取设备详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取设备实时数据
 */
const getEquipmentRealTimeData = async (req, res) => {
  try {
    const { id } = req.params;
    const { timeRange = '1h' } = req.query;

    if (!id) {
      return ResponseHandler.error(res, '设备ID不能为空', 'BAD_REQUEST', 400);
    }

    const data = await equipmentMonitoringService.getEquipmentRealTimeData(id, timeRange);

    ResponseHandler.success(res, data, '获取实时数据成功');
  } catch (error) {
    logger.error('获取实时数据失败:', error);
    ResponseHandler.error(res, '获取实时数据失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 记录设备数据
 */
const recordEquipmentData = async (req, res) => {
  try {
    const { id } = req.params;
    const { parameterCode, value, textValue } = req.body;

    // 数据验证
    if (!id || !parameterCode) {
      return ResponseHandler.error(res, '设备ID和参数代码不能为空', 'BAD_REQUEST', 400);
    }

    const result = await equipmentMonitoringService.recordEquipmentData(
      id,
      parameterCode,
      value,
      textValue
    );

    ResponseHandler.success(res, result, '记录设备数据成功');
  } catch (error) {
    logger.error('记录设备数据失败:', error);
    ResponseHandler.error(res, '记录设备数据失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 批量记录设备数据
 */
const batchRecordEquipmentData = async (req, res) => {
  try {
    const { id } = req.params;
    const { dataPoints } = req.body;

    if (!id || !Array.isArray(dataPoints) || dataPoints.length === 0) {
      return ResponseHandler.error(res, '设备ID和数据点不能为空', 'BAD_REQUEST', 400);
    }

    const results = [];
    for (const dataPoint of dataPoints) {
      try {
        const result = await equipmentMonitoringService.recordEquipmentData(
          id,
          dataPoint.parameterCode,
          dataPoint.value,
          dataPoint.textValue
        );
        results.push({
          parameterCode: dataPoint.parameterCode,
          success: true,
          result,
        });
      } catch (error) {
        results.push({
          parameterCode: dataPoint.parameterCode,
          success: false,
          error: error.message,
        });
      }
    }

    ResponseHandler.success(res, results, '批量记录设备数据完成');
  } catch (error) {
    logger.error('批量记录设备数据失败:', error);
    ResponseHandler.error(res, '批量记录设备数据失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取设备报警列表
 */
const getEquipmentAlarms = async (req, res) => {
  try {
    const filters = {
      equipment_id: req.query.equipment_id,
      alarm_level: req.query.alarm_level,
      status: req.query.status,
      page: parseInt(req.query.page, 10) || 1,
      pageSize: parseInt(req.query.pageSize, 10) || 20,
    };

    const result = await equipmentMonitoringService.getEquipmentAlarms(filters);

    ResponseHandler.success(res, result, '获取报警列表成功');
  } catch (error) {
    logger.error('获取报警列表失败:', error);
    ResponseHandler.error(res, '获取报警列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 确认报警
 */
const acknowledgeAlarm = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = req.user?.id;

    if (!id) {
      return ResponseHandler.error(res, '报警ID不能为空', 'BAD_REQUEST', 400);
    }

    const result = await equipmentMonitoringService.acknowledgeAlarm(id, userId, note);

    ResponseHandler.success(res, result, '确认报警成功');
  } catch (error) {
    logger.error('确认报警失败:', error);
    ResponseHandler.error(res, '确认报警失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 解决报警
 */
const resolveAlarm = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNote } = req.body;
    const userId = req.user?.id;

    if (!id || !resolutionNote) {
      return ResponseHandler.error(res, '报警ID和解决说明不能为空', 'BAD_REQUEST', 400);
    }

    const result = await equipmentMonitoringService.resolveAlarm(id, userId, resolutionNote);

    ResponseHandler.success(res, result, '解决报警成功');
  } catch (error) {
    logger.error('解决报警失败:', error);
    ResponseHandler.error(res, '解决报警失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 更新设备状态
 */
const updateEquipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const userId = req.user?.id;

    if (!id || !status) {
      return ResponseHandler.error(res, '设备ID和状态不能为空', 'BAD_REQUEST', 400);
    }

    // 验证状态值（使用统一常量）
    const validStatuses = Object.keys(EQUIPMENT_STATUS);
    if (!validStatuses.includes(status)) {
      return ResponseHandler.error(res, '无效的设备状态', 'BAD_REQUEST', 400);
    }

    const result = await equipmentMonitoringService.updateEquipmentStatus(
      id,
      status,
      reason,
      userId
    );

    ResponseHandler.success(res, result, '更新设备状态成功');
  } catch (error) {
    logger.error('更新设备状态失败:', error);
    ResponseHandler.error(res, '更新设备状态失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取设备统计信息
 */
const getEquipmentStatistics = async (req, res) => {
  try {
    const statistics = await equipmentMonitoringService.getEquipmentStatistics();

    ResponseHandler.success(res, statistics, '获取设备统计成功');
  } catch (error) {
    logger.error('获取设备统计失败:', error);
    ResponseHandler.error(res, '获取设备统计失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取设备健康状态
 */
const getEquipmentHealth = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return ResponseHandler.error(res, '设备ID不能为空', 'BAD_REQUEST', 400);
    }

    // 获取设备详情和最新数据
    const equipment = await equipmentMonitoringService.getEquipmentDetail(id);

    // 计算健康评分
    let healthScore = 100;
    let healthStatus = 'healthy';
    const issues = [];

    // 检查活跃报警
    if (equipment.activeAlarms && equipment.activeAlarms.length > 0) {
      const criticalAlarms = equipment.activeAlarms.filter(
        (alarm) => alarm.alarm_level === 'critical'
      ).length;
      const alarmAlarms = equipment.activeAlarms.filter(
        (alarm) => alarm.alarm_level === 'alarm'
      ).length;
      const warningAlarms = equipment.activeAlarms.filter(
        (alarm) => alarm.alarm_level === 'warning'
      ).length;

      healthScore -= criticalAlarms * 30 + alarmAlarms * 20 + warningAlarms * 10;

      if (criticalAlarms > 0) {
        healthStatus = 'critical';
        issues.push(`${criticalAlarms}个严重报警`);
      } else if (alarmAlarms > 0) {
        healthStatus = 'warning';
        issues.push(`${alarmAlarms}个报警`);
      } else if (warningAlarms > 0) {
        healthStatus = 'warning';
        issues.push(`${warningAlarms}个警告`);
      }
    }

    // 检查设备状态
    if (equipment.status === 'error') {
      healthScore -= 40;
      healthStatus = 'critical';
      issues.push('设备故障');
    } else if (equipment.status === 'offline') {
      healthScore -= 30;
      if (healthStatus === 'healthy') healthStatus = 'warning';
      issues.push('设备离线');
    } else if (equipment.status === 'maintenance') {
      healthScore -= 20;
      if (healthStatus === 'healthy') healthStatus = 'warning';
      issues.push('设备维护中');
    }

    healthScore = Math.max(0, healthScore);

    const healthData = {
      equipmentId: id,
      equipmentName: equipment.equipment_name,
      healthScore,
      healthStatus,
      issues,
      lastUpdated: new Date(),
      status: equipment.status,
      activeAlarmsCount: equipment.activeAlarms ? equipment.activeAlarms.length : 0,
    };

    ResponseHandler.success(res, healthData, '获取设备健康状态成功');
  } catch (error) {
    logger.error('获取设备健康状态失败:', error);
    ResponseHandler.error(res, '获取设备健康状态失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  getEquipmentList,
  getEquipmentDetail,
  getEquipmentRealTimeData,
  recordEquipmentData,
  batchRecordEquipmentData,
  getEquipmentAlarms,
  acknowledgeAlarm,
  resolveAlarm,
  updateEquipmentStatus,
  getEquipmentStatistics,
  getEquipmentHealth,
};
