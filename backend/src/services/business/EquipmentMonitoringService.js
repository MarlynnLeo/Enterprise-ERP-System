/**
 * 自动化设备监控服务
 */

const BaseService = require('../BaseService');

const cacheService = require('../cacheService'); // ✅ 更新：使用统一的缓存服务

class EquipmentMonitoringService extends BaseService {
  constructor() {
    super('equipment', 'id');
    this.realTimeData = new Map(); // 实时数据缓存
    this.connectionPool = new Map(); // 设备连接池
    this.monitoringInterval = null;
  }

  /**
   * 获取设备列表
   */
  async getEquipmentList(filters = {}) {
    const { status, location, page = 1, pageSize = 20 } = filters;

    const conditions = {};
    if (status) conditions.status = status;
    if (location) conditions.location = location;

    return await this.findList({
      conditions,
      page,
      pageSize,
      sort: 'created_at',
      order: 'DESC',
    });
  }

  /**
   * 获取设备详细信息
   */
  async getEquipmentDetail(equipmentId) {
    const cacheKey = `equipment_detail_${equipmentId}`;

    // 尝试从缓存获取
    let equipment = await cacheService.get(cacheKey);
    if (equipment) {
      return equipment;
    }

    const connection = await this.getConnection();

    try {
      // 获取设备基本信息
      const [equipmentRows] = await connection.execute('SELECT * FROM equipment WHERE id = ?', [
        equipmentId,
      ]);

      if (equipmentRows.length === 0) {
        throw new Error('设备不存在');
      }

      equipment = equipmentRows[0];

      // 获取设备参数
      const [parameterRows] = await connection.execute(
        'SELECT * FROM equipment_parameters WHERE equipment_id = ? ORDER BY parameter_name',
        [equipmentId]
      );

      // 获取最新的设备数据
      const [dataRows] = await connection.execute(
        `
        SELECT ep.parameter_name, ep.parameter_code, ep.unit, ed.value, ed.text_value, 
               ed.status, ed.timestamp
        FROM equipment_parameters ep
        LEFT JOIN equipment_data ed ON ep.id = ed.parameter_id
        WHERE ep.equipment_id = ?
        AND (ed.id IS NULL OR ed.id IN (
          SELECT MAX(id) FROM equipment_data 
          WHERE parameter_id = ep.id 
          GROUP BY parameter_id
        ))
        ORDER BY ep.parameter_name
      `,
        [equipmentId]
      );

      // 获取活跃报警
      const [alarmRows] = await connection.execute(
        'SELECT * FROM equipment_alarms WHERE equipment_id = ? AND status = "active" ORDER BY occurred_at DESC',
        [equipmentId]
      );

      equipment.parameters = parameterRows;
      equipment.currentData = dataRows;
      equipment.activeAlarms = alarmRows;

      // 缓存结果
      await cacheService.set(cacheKey, equipment, 60); // 缓存1分钟

      return equipment;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取设备实时数据
   */
  async getEquipmentRealTimeData(equipmentId, timeRange = '1h') {
    const connection = await this.getConnection();

    try {
      let timeCondition = '';
      switch (timeRange) {
        case '1h':
          timeCondition = 'AND ed.timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)';
          break;
        case '24h':
          timeCondition = 'AND ed.timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)';
          break;
        case '7d':
          timeCondition = 'AND ed.timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
          break;
        default:
          timeCondition = 'AND ed.timestamp >= DATE_SUB(NOW(), INTERVAL 1 HOUR)';
      }

      const [rows] = await connection.execute(
        `
        SELECT ep.parameter_name, ep.parameter_code, ep.unit, 
               ed.value, ed.text_value, ed.status, ed.timestamp
        FROM equipment_data ed
        JOIN equipment_parameters ep ON ed.parameter_id = ep.id
        WHERE ed.equipment_id = ? ${timeCondition}
        ORDER BY ed.timestamp DESC, ep.parameter_name
      `,
        [equipmentId]
      );

      // 按参数分组数据
      const groupedData = {};
      rows.forEach((row) => {
        if (!groupedData[row.parameter_code]) {
          groupedData[row.parameter_code] = {
            parameter_name: row.parameter_name,
            parameter_code: row.parameter_code,
            unit: row.unit,
            data: [],
          };
        }
        groupedData[row.parameter_code].data.push({
          value: row.value,
          text_value: row.text_value,
          status: row.status,
          timestamp: row.timestamp,
        });
      });

      return groupedData;
    } finally {
      connection.release();
    }
  }

  /**
   * 记录设备数据
   */
  async recordEquipmentData(equipmentId, parameterCode, value, textValue = null) {
    const connection = await this.getConnection();

    try {
      // 获取参数配置
      const [parameterRows] = await connection.execute(
        'SELECT * FROM equipment_parameters WHERE equipment_id = ? AND parameter_code = ?',
        [equipmentId, parameterCode]
      );

      if (parameterRows.length === 0) {
        throw new Error(`参数 ${parameterCode} 不存在`);
      }

      const parameter = parameterRows[0];

      // 判断数据状态
      let status = 'normal';
      if (
        parameter.parameter_type !== 'boolean' &&
        parameter.parameter_type !== 'string' &&
        value !== null
      ) {
        const numValue = parseFloat(value);
        if (parameter.alarm_min !== null && numValue < parameter.alarm_min) {
          status = 'alarm';
        } else if (parameter.alarm_max !== null && numValue > parameter.alarm_max) {
          status = 'alarm';
        } else if (parameter.warning_min !== null && numValue < parameter.warning_min) {
          status = 'warning';
        } else if (parameter.warning_max !== null && numValue > parameter.warning_max) {
          status = 'warning';
        }
      }

      // 记录数据
      await connection.execute(
        'INSERT INTO equipment_data (equipment_id, parameter_id, value, text_value, status) VALUES (?, ?, ?, ?, ?)',
        [equipmentId, parameter.id, value, textValue, status]
      );

      // 如果是报警状态，创建报警记录
      if (status === 'alarm' || status === 'warning') {
        await this.createAlarm(equipmentId, parameter.id, status, value, parameter);
      }

      // 更新实时数据缓存
      const cacheKey = `equipment_realtime_${equipmentId}_${parameterCode}`;
      await cacheService.set(
        cacheKey,
        {
          value,
          textValue,
          status,
          timestamp: new Date(),
        },
        300
      ); // 缓存5分钟

      return { success: true, status };
    } finally {
      connection.release();
    }
  }

  /**
   * 创建报警记录
   */
  async createAlarm(equipmentId, parameterId, alarmLevel, currentValue, parameter) {
    const connection = await this.getConnection();

    try {
      // 检查是否已有相同的活跃报警
      const [existingAlarms] = await connection.execute(
        'SELECT id FROM equipment_alarms WHERE equipment_id = ? AND parameter_id = ? AND status = "active"',
        [equipmentId, parameterId]
      );

      if (existingAlarms.length > 0) {
        return; // 已有活跃报警，不重复创建
      }

      const alarmMessage = `${parameter.parameter_name} ${alarmLevel === 'alarm' ? '报警' : '警告'}: 当前值 ${currentValue}${parameter.unit || ''}`;

      await connection.execute(
        `
        INSERT INTO equipment_alarms 
        (equipment_id, parameter_id, alarm_type, alarm_level, alarm_message, current_value, threshold_value) 
        VALUES (?, ?, 'parameter', ?, ?, ?, ?)
      `,
        [
          equipmentId,
          parameterId,
          alarmLevel,
          alarmMessage,
          currentValue,
          alarmLevel === 'alarm'
            ? currentValue > parameter.alarm_max
              ? parameter.alarm_max
              : parameter.alarm_min
            : currentValue > parameter.warning_max
              ? parameter.warning_max
              : parameter.warning_min,
        ]
      );
    } finally {
      connection.release();
    }
  }

  /**
   * 获取设备报警列表
   */
  async getEquipmentAlarms(filters = {}) {
    const { equipment_id, alarm_level, status = 'active', page = 1, pageSize = 20 } = filters;

    const connection = await this.getConnection();

    try {
      let whereClause = 'WHERE 1=1';
      const params = [];

      if (equipment_id) {
        whereClause += ' AND ea.equipment_id = ?';
        params.push(equipment_id);
      }

      if (alarm_level) {
        whereClause += ' AND ea.alarm_level = ?';
        params.push(alarm_level);
      }

      if (status) {
        whereClause += ' AND ea.status = ?';
        params.push(status);
      }

      // 获取总数
      const [countResult] = await connection.execute(
        `
        SELECT COUNT(*) as total 
        FROM equipment_alarms ea 
        ${whereClause}
      `,
        params
      );

      const total = countResult[0].total;

      // 获取数据
      const safePageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 20));
      const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * safePageSize;
      const [rows] = await connection.execute(
        `
        SELECT ea.*, e.equipment_name, e.equipment_code, ep.parameter_name
        FROM equipment_alarms ea
        JOIN equipment e ON ea.equipment_id = e.id
        LEFT JOIN equipment_parameters ep ON ea.parameter_id = ep.id
        ${whereClause}
        ORDER BY ea.occurred_at DESC
        LIMIT ${safePageSize} OFFSET ${offset}
      `,
        params
      );

      return {
        items: rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 确认报警
   */
  async acknowledgeAlarm(alarmId, userId) {
    const connection = await this.getConnection();

    try {
      await connection.execute(
        'UPDATE equipment_alarms SET status = "acknowledged", acknowledged_at = NOW(), acknowledged_by = ? WHERE id = ?',
        [userId, alarmId]
      );

      return { success: true };
    } finally {
      connection.release();
    }
  }

  /**
   * 解决报警
   */
  async resolveAlarm(alarmId, userId, resolutionNote) {
    const connection = await this.getConnection();

    try {
      await connection.execute(
        'UPDATE equipment_alarms SET status = "resolved", resolved_at = NOW(), resolved_by = ?, resolution_note = ? WHERE id = ?',
        [userId, resolutionNote, alarmId]
      );

      return { success: true };
    } finally {
      connection.release();
    }
  }

  /**
   * 更新设备状态
   */
  async updateEquipmentStatus(equipmentId, newStatus, reason = '', userId = null) {
    const connection = await this.getConnection();

    try {
      await connection.beginTransaction();

      // 获取当前状态
      const [currentRows] = await connection.execute('SELECT status FROM equipment WHERE id = ?', [
        equipmentId,
      ]);

      if (currentRows.length === 0) {
        throw new Error('设备不存在');
      }

      const previousStatus = currentRows[0].status;

      // 更新设备状态
      await connection.execute('UPDATE equipment SET status = ?, updated_at = NOW() WHERE id = ?', [
        newStatus,
        equipmentId,
      ]);

      // 记录状态历史
      await connection.execute(
        'INSERT INTO equipment_status_history (equipment_id, previous_status, current_status, reason, changed_by) VALUES (?, ?, ?, ?, ?)',
        [equipmentId, previousStatus, newStatus, reason, userId]
      );

      await connection.commit();

      // 清除相关缓存
      await cacheService.deletePattern(`equipment_*_${equipmentId}`);

      return { success: true, previousStatus, newStatus };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 获取设备统计信息
   */
  async getEquipmentStatistics() {
    const cacheKey = 'equipment_statistics';

    // 尝试从缓存获取
    let stats = await cacheService.get(cacheKey);
    if (stats) {
      return stats;
    }

    const connection = await this.getConnection();

    try {
      // 设备状态统计
      const [statusStats] = await connection.execute(`
        SELECT status, COUNT(*) as count 
        FROM equipment 
        WHERE is_active = 1 
        GROUP BY status
      `);

      // 设备类型统计 (表结构无 equipment_type，使用 model 替代)
      const [typeStats] = await connection.execute(`
        SELECT COALESCE(model, '未知型号') as equipment_type, COUNT(*) as count 
        FROM equipment 
        WHERE is_active = 1 
        GROUP BY COALESCE(model, '未知型号')
      `);

      // 活跃报警统计
      const [alarmStats] = await connection.execute(`
        SELECT alarm_level, COUNT(*) as count 
        FROM equipment_alarms 
        WHERE status = 'active' 
        GROUP BY alarm_level
      `);

      // 今日数据点数
      const [dataStats] = await connection.execute(`
        SELECT COUNT(*) as total_data_points
        FROM equipment_data 
        WHERE DATE(timestamp) = CURDATE()
      `);

      stats = {
        statusDistribution: statusStats,
        typeDistribution: typeStats,
        alarmDistribution: alarmStats,
        todayDataPoints: dataStats[0].total_data_points,
        lastUpdated: new Date(),
      };

      // 缓存结果
      await cacheService.set(cacheKey, stats, 300); // 缓存5分钟

      return stats;
    } finally {
      connection.release();
    }
  }
}

module.exports = new EquipmentMonitoringService();
