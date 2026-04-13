/**
 * Business Type Controller
 * @description 业务类型管理控制器
 * @author AI Assistant
 * @date 2025-11-22
 */

const { pool } = require('../../config/db');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

/**
 * 获取所有业务类型
 */
const getAllBusinessTypes = async (req, res) => {
  try {
    const { category, group_code, status, keyword } = req.query;

    let sql = 'SELECT * FROM business_types WHERE 1=1';
    const params = [];

    if (group_code) {
      sql += ' AND group_code = ?';
      params.push(group_code);
    }

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }

    if (status !== undefined && status !== '') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (keyword) {
      sql += ' AND (name LIKE ? OR code LIKE ? OR description LIKE ?)';
      const searchTerm = `%${keyword}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY group_code, category, sort_order, id';

    const [types] = await pool.execute(sql, params);

    ResponseHandler.success(res, types, '获取业务类型列表成功');
  } catch (error) {
    logger.error('获取业务类型列表失败:', error);
    ResponseHandler.error(res, '获取业务类型列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 根据分类获取库存业务类型（向后兼容遗留接口）
 */
const getBusinessTypesByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const [types] = await pool.execute(
      'SELECT * FROM business_types WHERE category = ? AND group_code = "inventory_transaction" AND status = 1 ORDER BY sort_order, id',
      [category]
    );

    ResponseHandler.success(res, types, '获取业务类型成功');
  } catch (error) {
    logger.error('获取业务类型失败:', error);
    ResponseHandler.error(res, '获取业务类型失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取所有字典分组标识列表
 */
const getBusinessTypeGroups = async (req, res) => {
  try {
    const [groups] = await pool.execute(
      'SELECT DISTINCT group_code FROM business_types WHERE group_code IS NOT NULL ORDER BY group_code'
    );
    const result = groups.map(g => g.group_code);
    ResponseHandler.success(res, result, '获取字典分组列表成功');
  } catch (error) {
    logger.error('获取字典分组失败:', error);
    ResponseHandler.error(res, '获取字典分组失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取单个业务类型
 */
const getBusinessTypeById = async (req, res) => {
  try {
    const { id } = req.params;

    const [types] = await pool.execute('SELECT * FROM business_types WHERE id = ?', [id]);

    if (types.length === 0) {
      return ResponseHandler.error(res, '业务类型不存在', 'NOT_FOUND', 404);
    }

    ResponseHandler.success(res, types[0], '获取业务类型详情成功');
  } catch (error) {
    logger.error('获取业务类型详情失败:', error);
    ResponseHandler.error(res, '获取业务类型详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 创建业务类型
 */
const createBusinessType = async (req, res) => {
  try {
    const { code, name, category, group_code, tag_type, description, icon, color, sort_order } = req.body;
    const userId = req.user?.id;
    const actualGroupCode = group_code || 'inventory_transaction';

    // 验证必填字段
    if (!code || !name) {
      return ResponseHandler.error(res, '编码和名称为必填项', 'BAD_REQUEST', 400);
    }

    // 检查编码在同一个分组内是否已存在
    const [existing] = await pool.execute('SELECT id FROM business_types WHERE group_code = ? AND code = ?', [actualGroupCode, code]);

    if (existing.length > 0) {
      return ResponseHandler.error(res, '该分组下业务类型编码已存在', 'CONFLICT', 409);
    }

    const [result] = await pool.execute(
      `INSERT INTO business_types (code, name, category, group_code, tag_type, description, icon, color, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        name,
        category || null,
        actualGroupCode,
        tag_type || null,
        description || null,
        icon || null,
        color || null,
        sort_order || 0,
        userId,
        userId,
      ]
    );

    ResponseHandler.success(res, { id: result.insertId }, '创建业务类型成功', 201);
  } catch (error) {
    logger.error('创建业务类型失败:', error);
    ResponseHandler.error(res, '创建业务类型失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 更新业务类型
 */
const updateBusinessType = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, category, group_code, tag_type, description, icon, color, sort_order, status } = req.body;
    const userId = req.user?.id;

    // 检查业务类型是否存在
    const [existing] = await pool.execute('SELECT is_system, group_code, status FROM business_types WHERE id = ?', [
      id,
    ]);

    if (existing.length === 0) {
      return ResponseHandler.error(res, '业务类型不存在', 'NOT_FOUND', 404);
    }


    // 系统内置类型只能修改部分字段
    const isSystem = existing[0].is_system;
    const currentGroupCode = group_code || existing[0].group_code;

    let sql = 'UPDATE business_types SET updated_by = ?, updated_at = NOW()';
    const params = [userId];

    if (!isSystem && code) {
      // 检查新编码是否与其他记录冲突
      const [duplicate] = await pool.execute(
        'SELECT id FROM business_types WHERE group_code = ? AND code = ? AND id != ?',
        [currentGroupCode, code, id]
      );
      if (duplicate.length > 0) {
        return ResponseHandler.error(res, '该分组下业务类型编码已存在', 'CONFLICT', 409);
      }
      sql += ', code = ?';
      params.push(code);
    }

    if (name) {
      sql += ', name = ?';
      params.push(name);
    }

    if (!isSystem && category !== undefined) {
      sql += ', category = ?';
      params.push(category);
    }

    if (!isSystem && group_code !== undefined) {
      sql += ', group_code = ?';
      params.push(group_code);
    }

    if (tag_type !== undefined) {
      sql += ', tag_type = ?';
      params.push(tag_type);
    }

    if (description !== undefined) {
      sql += ', description = ?';
      params.push(description);
    }

    if (icon !== undefined) {
      sql += ', icon = ?';
      params.push(icon);
    }

    if (color !== undefined) {
      sql += ', color = ?';
      params.push(color);
    }

    if (sort_order !== undefined) {
      sql += ', sort_order = ?';
      params.push(sort_order);
    }

    if (status !== undefined) {
      sql += ', status = ?';
      params.push(status);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    await pool.execute(sql, params);

    ResponseHandler.success(res, null, '更新业务类型成功');
  } catch (error) {
    logger.error('更新业务类型失败:', error);
    ResponseHandler.error(res, '更新业务类型失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 删除业务类型
 */
const deleteBusinessType = async (req, res) => {
  try {
    const { id } = req.params;

    // 检查业务类型是否存在
    const [existing] = await pool.execute('SELECT is_system, status FROM business_types WHERE id = ?', [
      id,
    ]);

    if (existing.length === 0) {
      return ResponseHandler.error(res, '业务类型不存在', 'NOT_FOUND', 404);
    }

    // 系统内置类型不能删除
    if (existing[0].is_system) {
      return ResponseHandler.error(res, '系统内置业务类型不能删除', 'FORBIDDEN', 403);
    }


    // 检查是否被使用（这里可以添加检查逻辑）
    // TODO: 检查 inventory_transactions 表中是否有使用此业务类型的记录

    await pool.execute('DELETE FROM business_types WHERE id = ?', [id]);

    ResponseHandler.success(res, null, '删除业务类型成功');
  } catch (error) {
    logger.error('删除业务类型失败:', error);
    ResponseHandler.error(res, '删除业务类型失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 批量更新排序
 */
const updateSortOrder = async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return ResponseHandler.error(res, '请提供要排序的项目', 'BAD_REQUEST', 400);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const item of items) {
        await connection.execute('UPDATE business_types SET sort_order = ? WHERE id = ?', [
          item.sort_order,
          item.id,
        ]);
      }

      await connection.commit();
      ResponseHandler.success(res, null, '更新排序成功');
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('更新排序失败:', error);
    ResponseHandler.error(res, '更新排序失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  getAllBusinessTypes,
  getBusinessTypesByCategory,
  getBusinessTypeGroups,
  getBusinessTypeById,
  createBusinessType,
  updateBusinessType,
  deleteBusinessType,
  updateSortOrder,
};
