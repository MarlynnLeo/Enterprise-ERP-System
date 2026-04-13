/**
 * inventory.js
 * @description 库存数据模型文件
 * @date 2025-08-27
 * @version 2.0.0 — 清理死代码，移除未导出/不可用的函数
 */

const logger = require('../utils/logger');
const db = require('../config/db');

// 获取库存列表
const getStockList = async (
  page = 1,
  limit = 20,
  search = '',
  locationId = null,
  categoryId = null
) => {
  try {
    // 确保参数为数字类型
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    // 验证参数
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      throw new Error('Invalid pagination parameters');
    }

    // 构建查询条件 - 从物料表出发，左连接库存汇总    
    let query = `
      SELECT
        CONCAT(m.id, '_', COALESCE(s.location_id, 1)) as id,
        m.code as code,
        m.name as name,
        m.specs as specification,
        COALESCE(s.quantity, 0) as quantity,
        COALESCE(w.name, '默认库位') as location_name,
        c.name as category_name,
        u.name as unit_name,
        COALESCE(s.location_id, 1) as location_id,
        m.category_id,
        m.unit_id,
        m.id as material_id
      FROM
        materials m
        LEFT JOIN (
          SELECT
            material_id,
            location_id,
            SUM(quantity) as quantity,
            MAX(created_at) as updated_at
          FROM inventory_ledger
          GROUP BY material_id, location_id
          HAVING SUM(quantity) > 0
        ) s ON m.id = s.material_id
        LEFT JOIN locations w ON s.location_id = w.id
        JOIN categories c ON m.category_id = c.id
        JOIN units u ON m.unit_id = u.id
      WHERE m.status = 1
    `;

    const params = [];

    // 添加搜索条件 - 使用 LIKE 替代 ILIKE
    if (search) {
      query += ' AND (m.code LIKE ? OR m.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // 添加库位过滤
    if (locationId) {
      query += ' AND s.location_id = ?';
      params.push(locationId);
    }

    // 添加类别过滤
    if (categoryId) {
      query += ' AND m.category_id = ?';
      params.push(categoryId);
    }

    // 计算有效物料的总数（构建与列表查询一致的条件）
    let countQuery = `
      SELECT COUNT(*) as count 
      FROM materials m
      LEFT JOIN (
        SELECT material_id, location_id, SUM(quantity) as quantity
        FROM inventory_ledger
        GROUP BY material_id, location_id
        HAVING SUM(quantity) > 0
      ) s ON m.id = s.material_id
      WHERE m.status = 1
    `;

    const countParams = [];

    if (search) {
      countQuery += ' AND (m.code LIKE ? OR m.name LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }

    if (locationId) {
      countQuery += ' AND s.location_id = ?';
      countParams.push(locationId);
    }

    if (categoryId) {
      countQuery += ' AND m.category_id = ?';
      countParams.push(categoryId);
    }

    const [countResult] = await db.pool.execute(countQuery, countParams);
    const total = parseInt(countResult[0].count);

    // 添加排序和分页
    query += ` ORDER BY m.code LIMIT ${limitNum} OFFSET ${offset}`;

    // 执行最终查询
    const [rows] = await db.pool.execute(query, params);

    return {
      items: rows,
      total,
      page: pageNum,
      limit: limitNum,
    };
  } catch (error) {
    logger.error('Error getting stock list:', error);
    throw error;
  }
};

// 导出库存数据（返回用于生成Excel的数据）
const exportStockData = async (search = '', locationId = null, categoryId = null) => {
  try {
    // 构建查询条件
    let query = `
      SELECT 
        m.code as '物料编码', 
        m.name as '物料名称', 
        m.specs as '规格', 
        COALESCE(w.name, m.location_name) as '库位', 
        c.name as '类别', 
        s.quantity as '库存数量', 
        u.name as '单位'
      FROM
        materials m
        LEFT JOIN (
          SELECT
            material_id,
            location_id,
            SUM(quantity) as quantity
          FROM inventory_ledger
          GROUP BY material_id, location_id
          HAVING SUM(quantity) > 0
        ) s ON m.id = s.material_id
        LEFT JOIN locations w ON s.location_id = w.id
        JOIN categories c ON m.category_id = c.id
        JOIN units u ON m.unit_id = u.id
      WHERE m.status = 1
    `;

    const params = [];

    // 添加搜索条件
    if (search) {
      query += ' AND (m.code LIKE ? OR m.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // 添加库位过滤
    if (locationId) {
      query += ' AND s.location_id = ?';
      params.push(locationId);
    }

    // 添加类别过滤
    if (categoryId) {
      query += ' AND m.category_id = ?';
      params.push(categoryId);
    }

    query += ' ORDER BY m.code';

    const [rows] = await db.pool.execute(query, params);

    return rows;
  } catch (error) {
    logger.error('Error exporting stock data:', error);
    throw error;
  }
};

/**
 * 插入库存事务记录
 * @param {Object} connection - 数据库连接对象
 * @param {Object} params - 事务参数
 * @param {number} params.material_id - 物料ID
 * @param {number} params.location_id - 库位ID
 * @param {string} params.transaction_type - 事务类型
 * @param {number} params.quantity - 数量
 * @param {number} params.unit_id - 单位ID
 * @param {string} params.batch_number - 批次号
 * @param {string} params.reference_no - 参考单号
 * @param {string} params.reference_type - 参考类型
 * @param {string} params.operator - 操作人
 * @param {string} params.remark - 备注
 * @returns {Promise<Object>} - 插入结果
 */
/**
 * @deprecated 请使用 InventoryService.updateStock() 代替。
 * 该方法不走 FIFO 逻辑且 before/after_quantity 可能与主流程不连续。
 * 保留此导出仅为向后兼容，新业务代码禁止调用。
 */
const insertInventoryTransaction = async (
  connection,
  {
    material_id,
    location_id,
    transaction_type,
    quantity,
    unit_id,
    batch_number = null,
    reference_no,
    reference_type,
    operator,
    remark = null,
    beforeQuantity = null,
    afterQuantity = null,
    issue_reason = null,
    is_excess = 0,
    bom_required_qty = null,
    total_issued_qty = null,
  }
) => {
  try {
    // 处理参数
    const parsedQuantity = parseFloat(quantity);

    // 把这些参数挂载到params对象上，以便后续使用params.key访问
    const params = {
      material_id,
      location_id,
      transaction_type,
      quantity,
      unit_id,
      batch_number,
      reference_no,
      reference_type,
      operator,
      remark,
      beforeQuantity,
      afterQuantity,
      issue_reason,
      is_excess,
      bom_required_qty,
      total_issued_qty,
    };

    // 如果beforeQuantity和afterQuantity为空，则自动计算
    if (beforeQuantity === null || afterQuantity === null) {
      // 查询当前库存量
      const [stockResult] = await connection.execute(
        'SELECT COALESCE(SUM(il.quantity), 0) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id)',
        [material_id, location_id]
      );

      beforeQuantity = stockResult.length > 0 ? parseFloat(stockResult[0].quantity) : 0;

      // 计算after_quantity
      afterQuantity = beforeQuantity;
      if (transaction_type === 'inbound' || transaction_type === 'transfer_in') {
        afterQuantity = beforeQuantity + Math.abs(parsedQuantity);
      } else if (transaction_type === 'outbound' || transaction_type === 'transfer_out') {
        afterQuantity = Math.max(0, beforeQuantity - Math.abs(parsedQuantity));
      }
    }

    // 验证并获取有效的 unit_id
    let validUnitId = null;
    if (unit_id) {
      const [unitInfo] = await connection.execute('SELECT id FROM units WHERE id = ?', [unit_id]);
      if (unitInfo.length > 0) {
        validUnitId = unitInfo[0].id;
      } else {
        // unit_id 不存在，记录警告日志
        logger.warn(`单位 ID ${unit_id} 不存在于 units 表中，将使用 NULL`);
      }
    }

    // 插入事务记录 - 使用新的单表架构（包含批次号及超额控制字段）
    const sql = `INSERT INTO inventory_ledger(
    transaction_type,
    material_id,
    location_id,
    quantity,
    unit_id,
    batch_number,
    reference_no,
    reference_type,
    operator,
    remark,
    before_quantity,
    after_quantity,
    issue_reason,
    is_excess,
    bom_required_qty,
    total_issued_qty,
    created_at
  ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

    const sqlParams = [
      transaction_type,
      material_id,
      location_id,
      parsedQuantity,
      validUnitId, // 使用验证后的 unit_id
      batch_number || null, // 批次号
      reference_no || null,
      reference_type || null,
      operator || 'system',
      remark || '',
      beforeQuantity,
      afterQuantity,
      params.issue_reason || null,
      params.is_excess || 0,
      params.bom_required_qty || null,
      params.total_issued_qty || null,
    ];

    return await connection.execute(sql, sqlParams);
  } catch (error) {
    logger.error('插入库存事务记录失败:', error);
    throw error;
  }
};

// ==================== 导出模块 ====================

module.exports = {
  getStockList,
  exportStockData,
  insertInventoryTransaction,
};
