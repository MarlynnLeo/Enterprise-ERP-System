/**
 * equipmentController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { validateRequiredFields, validateEnum } = require('../../../utils/validationHelper');
const { handleError } = require('./shared/errorHandler');

const { pool } = require('../../../config/db');

const handleDatabaseError = (error, res) => handleError(res, error);

const parsePagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const requestedSize = query.pageSize ?? query.limit ?? 10;
  const pageSize = Math.min(Math.max(Number.parseInt(requestedSize, 10) || 10, 1), 100);
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
};

const normalizeListStatus = (status) => (status && status !== 'all' ? status : '');

const sendPagedEquipmentRecords = (res, rows, total, page, pageSize) => {
  res.json({
    success: true,
    data: {
      list: rows,
      total,
      page,
      pageSize,
    },
  });
};

/**
 * 获取设备列表
 */
exports.getEquipmentList = async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { code = '', name = '', location = '' } = req.query;
    const status = normalizeListStatus(req.query.status);

    // 构建查询条件
    const conditions = [];
    const params = [];

    if (code) {
      conditions.push('code LIKE ?');
      params.push(`%${code}%`);
    }

    if (name) {
      conditions.push('name LIKE ?');
      params.push(`%${name}%`);
    }

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (location) {
      conditions.push('location LIKE ?');
      params.push(`%${location}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 查询总数
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM equipment ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // 查询分页数据
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const [rows] = await pool.query(
      `SELECT * FROM equipment ${whereClause} ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    sendPagedEquipmentRecords(res, rows, total, page, pageSize);
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

exports.getMaintenanceRecords = async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { search = '', equipment_id = '' } = req.query;
    const status = normalizeListStatus(req.query.status);
    const conditions = [];
    const params = [];

    if (equipment_id) {
      conditions.push('em.equipment_id = ?');
      params.push(equipment_id);
    }

    if (status) {
      conditions.push('em.status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(e.name LIKE ? OR e.code LIKE ? OR em.maintenance_type LIKE ? OR em.maintenance_person LIKE ?)');
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM equipment_maintenance em LEFT JOIN equipment e ON e.id = em.equipment_id ${whereClause}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT em.*, e.name AS equipmentName, e.code AS equipmentCode
       FROM equipment_maintenance em
       LEFT JOIN equipment e ON e.id = em.equipment_id
       ${whereClause}
       ORDER BY em.maintenance_date DESC, em.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    sendPagedEquipmentRecords(res, rows, countResult[0].total, page, pageSize);
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

exports.getFailureRecords = async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { search = '', equipment_id = '' } = req.query;
    const status = normalizeListStatus(req.query.status);
    const conditions = [];
    const params = [];

    if (equipment_id) {
      conditions.push('ef.equipment_id = ?');
      params.push(equipment_id);
    }

    if (status) {
      conditions.push('ef.repair_status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(e.name LIKE ? OR e.code LIKE ? OR ef.failure_type LIKE ? OR ef.description LIKE ? OR ef.reported_by LIKE ?)');
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword, keyword);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM equipment_failure ef LEFT JOIN equipment e ON e.id = ef.equipment_id ${whereClause}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT ef.*, ef.repair_status AS status, e.name AS equipmentName, e.code AS equipmentCode
       FROM equipment_failure ef
       LEFT JOIN equipment e ON e.id = ef.equipment_id
       ${whereClause}
       ORDER BY ef.failure_date DESC, ef.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    sendPagedEquipmentRecords(res, rows, countResult[0].total, page, pageSize);
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

exports.getInspectionRecords = async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { search = '', equipment_id = '' } = req.query;
    const status = normalizeListStatus(req.query.status);
    const conditions = [];
    const params = [];

    if (equipment_id) {
      conditions.push('ei.equipment_id = ?');
      params.push(equipment_id);
    }

    if (status) {
      conditions.push('ei.result = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(e.name LIKE ? OR e.code LIKE ? OR ei.inspector LIKE ? OR ei.inspection_type LIKE ?)');
      const keyword = `%${search}%`;
      params.push(keyword, keyword, keyword, keyword);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM equipment_inspection ei LEFT JOIN equipment e ON e.id = ei.equipment_id ${whereClause}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT ei.*, ei.result AS status, ei.inspection_date AS checkDate, ei.inspector AS checker,
              COALESCE(ei.action_taken, ei.remarks, ei.abnormal_items, '') AS resultDesc,
              e.name AS equipmentName, e.code AS equipmentCode
       FROM equipment_inspection ei
       LEFT JOIN equipment e ON e.id = ei.equipment_id
       ${whereClause}
       ORDER BY ei.inspection_date DESC, ei.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    sendPagedEquipmentRecords(res, rows, countResult[0].total, page, pageSize);
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 获取设备详情
 */
exports.getEquipmentById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM equipment WHERE id = ?', [id]);

    if (rows.length === 0) {
      return ResponseHandler.error(res, '设备不存在', 'NOT_FOUND', 404);
    }

    // 获取设备维护记录
    const [maintenanceRecords] = await pool.query(
      'SELECT * FROM equipment_maintenance WHERE equipment_id = ? ORDER BY maintenance_date DESC',
      [id]
    );

    // 获取设备故障记录
    const [failureRecords] = await pool.query(
      'SELECT * FROM equipment_failure WHERE equipment_id = ? ORDER BY failure_date DESC',
      [id]
    );

    // 获取设备检查记录
    const [inspectionRecords] = await pool.query(
      'SELECT * FROM equipment_inspection WHERE equipment_id = ? ORDER BY inspection_date DESC',
      [id]
    );

    // 获取设备附件
    const [attachments] = await pool.query(
      'SELECT * FROM equipment_attachment WHERE equipment_id = ?',
      [id]
    );

    // 获取设备备件
    const [spareParts] = await pool.query(
      'SELECT * FROM equipment_spare_part WHERE equipment_id = ?',
      [id]
    );

    const equipment = {
      ...rows[0],
      maintenanceRecords,
      failureRecords,
      inspectionRecords,
      attachments,
      spareParts,
    };

    ResponseHandler.success(res, equipment, '操作成功');
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 创建设备
 */
exports.createEquipment = async (req, res) => {
  try {
    const {
      code,
      name,
      model,
      manufacturer,
      purchase_date,
      inspection_date,
      next_inspection_date,
      location,
      status,
      responsible_person,
      specs,
      description,
    } = req.body;

    // 检查必填字段
    if (!code || !name) {
      return ResponseHandler.error(res, '设备编号和设备名称为必填项', 'BAD_REQUEST', 400);
    }

    // 检查设备编号是否已存在
    const [existingEquipment] = await pool.query('SELECT id FROM equipment WHERE code = ?', [code]);

    if (existingEquipment.length > 0) {
      return ResponseHandler.error(res, '设备编号已存在', 'BAD_REQUEST', 400);
    }

    // 格式化日期
    let formattedPurchaseDate = null;
    if (purchase_date) {
      const date = new Date(purchase_date);
      formattedPurchaseDate = date.toISOString().split('T')[0]; // 转换为 YYYY-MM-DD 格式
    }

    // 格式化检验日期
    let formattedInspectionDate = null;
    if (inspection_date) {
      const date = new Date(inspection_date);
      formattedInspectionDate = date.toISOString().split('T')[0]; // 转换为 YYYY-MM-DD 格式
    }

    // 格式化下次检验日期
    let formattedNextInspectionDate = null;
    if (next_inspection_date) {
      const date = new Date(next_inspection_date);
      formattedNextInspectionDate = date.toISOString().split('T')[0]; // 转换为 YYYY-MM-DD 格式
    }

    // 插入设备数据
    const [result] = await pool.query(
      `INSERT INTO equipment (
        code, name, model, manufacturer, 
        purchase_date, inspection_date, next_inspection_date, location, status, responsible_person, specs, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        name,
        model,
        manufacturer,
        formattedPurchaseDate,
        formattedInspectionDate,
        formattedNextInspectionDate,
        location,
        status || 'normal',
        responsible_person,
        specs,
        description,
      ]
    );

    ResponseHandler.success(
      res,
      {
        success: true,
        message: '设备创建成功',
        data: {
          id: result.insertId,
          code,
          name,
        },
      },
      '创建成功',
      201
    );
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 更新设备信息
 */
exports.updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      model,
      manufacturer,
      purchase_date,
      inspection_date,
      next_inspection_date,
      location,
      status,
      responsible_person,
      specs,
      description,
    } = req.body;

    // 检查设备是否存在
    const [existingEquipment] = await pool.query('SELECT id FROM equipment WHERE id = ?', [id]);

    if (existingEquipment.length === 0) {
      return ResponseHandler.error(res, '设备不存在', 'NOT_FOUND', 404);
    }

    // 格式化日期
    let formattedPurchaseDate = null;
    if (purchase_date) {
      const date = new Date(purchase_date);
      formattedPurchaseDate = date.toISOString().split('T')[0]; // 转换为 YYYY-MM-DD 格式
    }

    // 格式化检验日期
    let formattedInspectionDate = null;
    if (inspection_date) {
      const date = new Date(inspection_date);
      formattedInspectionDate = date.toISOString().split('T')[0]; // 转换为 YYYY-MM-DD 格式
    }

    // 格式化下次检验日期
    let formattedNextInspectionDate = null;
    if (next_inspection_date) {
      const date = new Date(next_inspection_date);
      formattedNextInspectionDate = date.toISOString().split('T')[0]; // 转换为 YYYY-MM-DD 格式
    }

    // 更新设备数据
    await pool.query(
      `UPDATE equipment SET
        name = ?,
        model = ?,
        manufacturer = ?,
        purchase_date = ?,
        inspection_date = ?,
        next_inspection_date = ?,
        location = ?,
        status = ?,
        responsible_person = ?,
        specs = ?,
        description = ?
      WHERE id = ?`,
      [
        name,
        model,
        manufacturer,
        formattedPurchaseDate,
        formattedInspectionDate,
        formattedNextInspectionDate,
        location,
        status,
        responsible_person,
        specs,
        description,
        id,
      ]
    );

    ResponseHandler.success(res, null, '设备信息更新成功');
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 删除设备
 */
exports.deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;

    // 检查设备是否存在
    const [existingEquipment] = await pool.query('SELECT id FROM equipment WHERE id = ?', [id]);

    if (existingEquipment.length === 0) {
      return ResponseHandler.error(res, '设备不存在', 'NOT_FOUND', 404);
    }

    // 删除设备数据
    await pool.query('DELETE FROM equipment WHERE id = ?', [id]);

    ResponseHandler.success(res, null, '设备删除成功');
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 更新设备状态
 */
exports.updateEquipmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return ResponseHandler.error(res, '状态不能为空', 'BAD_REQUEST', 400);
    }

    // 检查设备是否存在
    const [existingEquipment] = await pool.query('SELECT id FROM equipment WHERE id = ?', [id]);

    if (existingEquipment.length === 0) {
      return ResponseHandler.error(res, '设备不存在', 'NOT_FOUND', 404);
    }

    // ✅ 安全修复：添加状态白名单校验，防止任意状态值注入
    const VALID_EQUIPMENT_STATUSES = ['normal', 'maintenance', 'repair', 'scrapped', 'idle'];
    if (!VALID_EQUIPMENT_STATUSES.includes(status)) {
      return ResponseHandler.error(
        res,
        `无效的设备状态: "${status}"，允许的状态: ${VALID_EQUIPMENT_STATUSES.join(', ')}`,
        'BAD_REQUEST',
        400
      );
    }

    // 更新设备状态
    const [updateResult] = await pool.query(
      'UPDATE equipment SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    if (updateResult.affectedRows === 0) {
      return ResponseHandler.error(res, '状态更新失败，设备可能已被删除', 'NOT_FOUND', 404);
    }

    ResponseHandler.success(res, null, '设备状态更新成功');
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 获取设备状态统计
 */
exports.getEquipmentStats = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'normal' THEN 1 ELSE 0 END) as normal,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance,
        SUM(CASE WHEN status = 'repair' THEN 1 ELSE 0 END) as repair,
        SUM(CASE WHEN status = 'scrapped' THEN 1 ELSE 0 END) as scrapped
      FROM equipment
    `);

    ResponseHandler.success(res, rows[0], '操作成功');
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 添加设备维护记录
 */
exports.addMaintenanceRecord = async (req, res) => {
  try {
    const { equipment_id } = req.params;
    const {
      maintenance_type,
      maintenance_date,
      maintenance_person,
      description,
      cost,
      parts_replaced,
      next_maintenance_date,
      status,
      remarks,
    } = req.body;

    // 检查设备是否存在
    const [existingEquipment] = await pool.query('SELECT id FROM equipment WHERE id = ?', [
      equipment_id,
    ]);

    if (existingEquipment.length === 0) {
      return ResponseHandler.error(res, '设备不存在', 'NOT_FOUND', 404);
    }

    // 插入维护记录
    const [result] = await pool.query(
      `INSERT INTO equipment_maintenance (
        equipment_id, maintenance_type, maintenance_date, maintenance_person,
        description, cost, parts_replaced, next_maintenance_date, status, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        equipment_id,
        maintenance_type,
        maintenance_date,
        maintenance_person,
        description,
        cost,
        parts_replaced,
        next_maintenance_date,
        status || 'planned',
        remarks,
      ]
    );

    ResponseHandler.success(
      res,
      {
        success: true,
        message: '维护记录添加成功',
        data: {
          id: result.insertId,
        },
      },
      '创建成功',
      201
    );
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 添加设备故障记录
 */
exports.addFailureRecord = async (req, res) => {
  try {
    const { equipment_id } = req.params;
    const {
      failure_date,
      failure_type,
      description,
      reported_by,
      repair_status,
      resolution,
      resolved_date,
      resolved_by,
      downtime_hours,
      repair_cost,
      remarks,
    } = req.body;

    // 检查设备是否存在
    const [existingEquipment] = await pool.query('SELECT id FROM equipment WHERE id = ?', [
      equipment_id,
    ]);

    if (existingEquipment.length === 0) {
      return ResponseHandler.error(res, '设备不存在', 'NOT_FOUND', 404);
    }

    // 插入故障记录
    const [result] = await pool.query(
      `INSERT INTO equipment_failure (
        equipment_id, failure_date, failure_type, description, reported_by,
        repair_status, resolution, resolved_date, resolved_by, downtime_hours, repair_cost, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        equipment_id,
        failure_date,
        failure_type,
        description,
        reported_by,
        repair_status || 'reported',
        resolution,
        resolved_date,
        resolved_by,
        downtime_hours,
        repair_cost,
        remarks,
      ]
    );

    ResponseHandler.success(
      res,
      {
        success: true,
        message: '故障记录添加成功',
        data: {
          id: result.insertId,
        },
      },
      '创建成功',
      201
    );
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 添加设备检查记录
 */
exports.addInspectionRecord = async (req, res) => {
  try {
    const { equipment_id } = req.params;
    const {
      inspection_date,
      inspector,
      inspection_type,
      inspection_items,
      result,
      abnormal_items,
      action_taken,
      next_inspection_date,
      remarks,
    } = req.body;

    // 检查设备是否存在
    const [existingEquipment] = await pool.query('SELECT id FROM equipment WHERE id = ?', [
      equipment_id,
    ]);

    if (existingEquipment.length === 0) {
      return ResponseHandler.error(res, '设备不存在', 'NOT_FOUND', 404);
    }

    // 插入检查记录
    const [result_insert] = await pool.query(
      `INSERT INTO equipment_inspection (
        equipment_id, inspection_date, inspector, inspection_type,
        inspection_items, result, abnormal_items, action_taken, next_inspection_date, remarks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        equipment_id,
        inspection_date,
        inspector,
        inspection_type,
        inspection_items,
        result,
        abnormal_items,
        action_taken,
        next_inspection_date,
        remarks,
      ]
    );

    ResponseHandler.success(
      res,
      {
        success: true,
        message: '检查记录添加成功',
        data: {
          id: result_insert.insertId,
        },
      },
      '创建成功',
      201
    );
  } catch (error) {
    handleDatabaseError(error, res);
  }
};

/**
 * 批量导入设备
 */
exports.importEquipment = async (req, res) => {
  try {
    const { equipments } = req.body;

    if (!equipments || !Array.isArray(equipments) || equipments.length === 0) {
      return ResponseHandler.error(res, '请提供有效的设备数据', 'BAD_REQUEST', 400);
    }

    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    // 开始事务
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      for (let i = 0; i < equipments.length; i++) {
        const equipment = equipments[i];

        try {
          // 使用统一验证工具验证必填字段
          const validationError = validateRequiredFields(equipment, ['code', 'name'], {
            code: '设备编号',
            name: '设备名称',
          });

          if (validationError) {
            errors.push(`第${i + 1}行：${validationError.message}`);
            failedCount++;
            continue;
          }

          // 检查设备编号是否已存在
          const [existingEquipment] = await connection.query(
            'SELECT id FROM equipment WHERE code = ?',
            [equipment.code]
          );

          if (existingEquipment.length > 0) {
            errors.push(`第${i + 1}行：设备编号 ${equipment.code} 已存在`);
            failedCount++;
            continue;
          }

          // 使用统一验证工具验证状态值
          const validStatuses = ['normal', 'maintenance', 'repair', 'scrapped'];
          const statusError = validateEnum(equipment.status, validStatuses, '设备状态');

          if (statusError) {
            errors.push(`第${i + 1}行：${statusError.message}`);
            failedCount++;
            continue;
          }

          // 插入设备数据
          const insertQuery = `
            INSERT INTO equipment (
              code, name, model, manufacturer, purchase_date,
              inspection_date, next_inspection_date, location,
              status, responsible_person, specs, description,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `;

          const insertParams = [
            equipment.code,
            equipment.name,
            equipment.model || '',
            equipment.manufacturer || '',
            equipment.purchase_date || null,
            equipment.inspection_date || null,
            equipment.next_inspection_date || null,
            equipment.location || '',
            equipment.status || 'normal',
            equipment.responsible_person || '',
            equipment.specs || '',
            equipment.description || '',
          ];

          await connection.query(insertQuery, insertParams);
          successCount++;
        } catch (itemError) {
          logger.error(`导入第${i + 1}行设备失败:`, itemError);
          errors.push(`第${i + 1}行：${itemError.message}`);
          failedCount++;
        }
      }

      // 提交事务
      await connection.commit();

      res.json({
        success: true,
        message: `导入完成：成功 ${successCount} 条，失败 ${failedCount} 条`,
        data: {
          total: equipments.length,
          success: successCount,
          failed: failedCount,
          errors: errors,
        },
      });
    } catch (transactionError) {
      // 回滚事务
      await connection.rollback();
      throw transactionError;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('批量导入设备失败:', error);
    ResponseHandler.error(res, '批量导入设备失败', 'SERVER_ERROR', 500, error);
  }
};
