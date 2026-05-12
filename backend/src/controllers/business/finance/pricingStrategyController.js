const { getConnection } = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');
const logger = require('../../../utils/logger');
const { AuditService, AuditAction, AuditModule } = require('../../../services/AuditService');

const VALID_FIELD_TYPES = new Set(['amount', 'percentage']);

/**
 * 获取定价策略字段列表
 */
exports.getStrategyFields = async (req, res) => {
  let connection;
  try {
    const { isActive } = req.query;

    connection = await getConnection();

    let whereClause = '1=1';
    const params = [];

    if (isActive !== undefined) {
      whereClause += ' AND is_active = ?';
      params.push(parseInt(isActive));
    }

    const query = `
            SELECT
                id,
                field_name,
                field_label,
                field_type,
                unit,
                is_active,
                is_additive,
                sort_order,
                description,
                created_at,
                updated_at
            FROM pricing_strategy_fields
            WHERE ${whereClause}
            ORDER BY sort_order ASC, id ASC
        `;

    const [fields] = await connection.query(query, params);

    ResponseHandler.success(res, fields);
  } catch (error) {
    logger.error('获取策略字段列表失败:', error);
    ResponseHandler.error(res, '获取策略字段列表失败');
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 创建新的策略字段
 */
exports.createStrategyField = async (req, res) => {
  let connection;
  try {
    const {
      field_name,
      field_label,
      field_type,
      unit,
      description,
      sort_order,
      is_additive = 1,
    } = req.body;

    // 参数验证
    if (!field_name || !field_label) {
      return ResponseHandler.error(res, '字段名和显示标签不能为空', 'VALIDATION_ERROR', 400);
    }

    // 检查字段名是否符合规范 (只允许英文字母、数字、下划线)
    if (!/^[a-z_][a-z0-9_]*$/i.test(field_name)) {
      return ResponseHandler.error(
        res,
        '字段名只能包含英文字母、数字和下划线,且必须以字母或下划线开头',
        'VALIDATION_ERROR',
        400
      );
    }

    if (field_type && !VALID_FIELD_TYPES.has(field_type)) {
      return ResponseHandler.error(res, '字段类型只能是 amount 或 percentage', 'VALIDATION_ERROR', 400);
    }

    connection = await getConnection();

    if (field_type && !VALID_FIELD_TYPES.has(field_type)) {
      return ResponseHandler.error(res, '字段类型只能是 amount 或 percentage', 'VALIDATION_ERROR', 400);
    }

    // 检查字段名是否重复
    const [existing] = await connection.query(
      'SELECT id FROM pricing_strategy_fields WHERE field_name = ?',
      [field_name]
    );

    if (existing.length > 0) {
      return ResponseHandler.error(res, '字段名已存在', 'CONFLICT', 409);
    }

    // 插入新字段
    const [result] = await connection.query(
      `INSERT INTO pricing_strategy_fields
            (field_name, field_label, field_type, unit, description, sort_order, is_additive)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        field_name,
        field_label,
        field_type || 'amount',
        unit || '元',
        description || null,
        sort_order || 999,
        is_additive,
      ]
    );

    // 记录审计日志
    await AuditService.logFromRequest(
      req,
      AuditModule.PRICING,
      AuditAction.CREATE,
      'pricing_strategy_fields',
      String(result.insertId),
      null,
      {
        field_name,
        field_label,
        field_type,
      }
    );

    ResponseHandler.success(res, { id: result.insertId }, '策略字段创建成功');
  } catch (error) {
    logger.error('创建策略字段失败:', error);
    ResponseHandler.error(res, '创建策略字段失败');
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 更新策略字段
 */
exports.updateStrategyField = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { field_label, field_type, unit, description, sort_order, is_additive } = req.body;

    connection = await getConnection();

    // 检查字段是否存在
    const [existing] = await connection.query(
      'SELECT * FROM pricing_strategy_fields WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return ResponseHandler.error(res, '策略字段不存在', 'NOT_FOUND', 404);
    }

    // 更新字段 (不允许更新field_name,避免破坏已有关联数据)
    const updates = [];
    const params = [];

    if (field_label !== undefined) {
      updates.push('field_label = ?');
      params.push(field_label);
    }
    if (field_type !== undefined) {
      updates.push('field_type = ?');
      params.push(field_type);
    }
    if (unit !== undefined) {
      updates.push('unit = ?');
      params.push(unit);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(sort_order);
    }
    if (is_additive !== undefined) {
      updates.push('is_additive = ?');
      params.push(is_additive);
    }

    if (updates.length === 0) {
      return ResponseHandler.error(res, '没有可更新的字段', 'VALIDATION_ERROR', 400);
    }

    params.push(id);

    await connection.query(
      `UPDATE pricing_strategy_fields SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // 记录审计日志
    await AuditService.logFromRequest(
      req,
      AuditModule.PRICING,
      AuditAction.UPDATE,
      'pricing_strategy_fields',
      String(id),
      existing[0],
      {
        field_label,
        field_type,
        unit,
        description,
        sort_order,
      }
    );

    ResponseHandler.success(res, null, '策略字段更新成功');
  } catch (error) {
    logger.error('更新策略字段失败:', error);
    ResponseHandler.error(res, '更新策略字段失败');
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 删除策略字段
 */
exports.deleteStrategyField = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();

    // 检查字段是否存在
    const [existing] = await connection.query(
      'SELECT * FROM pricing_strategy_fields WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return ResponseHandler.error(res, '策略字段不存在', 'NOT_FOUND', 404);
    }

    // 检查是否有关联数据
    const [usage] = await connection.query(
      'SELECT COUNT(*) as count FROM product_pricing_strategies WHERE field_id = ?',
      [id]
    );

    if (usage[0].count > 0) {
      return ResponseHandler.error(
        res,
        `该策略字段已被${usage[0].count}条定价记录使用,无法删除`,
        'CONFLICT',
        409
      );
    }

    // 删除字段
    await connection.query('DELETE FROM pricing_strategy_fields WHERE id = ?', [id]);

    // 记录审计日志
    await AuditService.logFromRequest(
      req,
      AuditModule.PRICING,
      AuditAction.DELETE,
      'pricing_strategy_fields',
      String(id),
      existing[0],
      null
    );

    ResponseHandler.success(res, null, '策略字段删除成功');
  } catch (error) {
    logger.error('删除策略字段失败:', error);
    ResponseHandler.error(res, '删除策略字段失败');
  } finally {
    if (connection) connection.release();
  }
};

/**
 * 启用/禁用策略字段
 */
exports.toggleStrategyField = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();

    // 检查字段是否存在
    const [existing] = await connection.query(
      'SELECT * FROM pricing_strategy_fields WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return ResponseHandler.error(res, '策略字段不存在', 'NOT_FOUND', 404);
    }

    const newStatus = existing[0].is_active === 1 ? 0 : 1;

    await connection.query('UPDATE pricing_strategy_fields SET is_active = ? WHERE id = ?', [
      newStatus,
      id,
    ]);

    // 记录审计日志
    await AuditService.logFromRequest(
      req,
      AuditModule.PRICING,
      AuditAction.UPDATE,
      'pricing_strategy_fields',
      String(id),
      existing[0],
      {
        is_active: newStatus,
      }
    );

    ResponseHandler.success(
      res,
      { is_active: newStatus },
      newStatus === 1 ? '字段已启用' : '字段已禁用'
    );
  } catch (error) {
    logger.error('切换策略字段状态失败:', error);
    ResponseHandler.error(res, '切换策略字段状态失败');
  } finally {
    if (connection) connection.release();
  }
};
