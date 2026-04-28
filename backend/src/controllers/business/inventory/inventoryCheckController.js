/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { softDelete } = require('../../../utils/softDelete');
const { CodeGenerators } = require('../../../utils/codeGenerator');
// const InventoryDeductionService = require('../../../services/business/InventoryDeductionService');
const businessConfig = require('../../../config/businessConfig');
const { getCurrentUserName } = require('../../../utils/userHelper');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;
// DRY: 两处引用相同子查询，统一使用 STOCK_SUBQUERY
const SIMPLE_STOCK_SUBQUERY = STOCK_SUBQUERY;

const {
  getInventoryTransactionTypeText,
  getTransferStatusText,
  getSalesStatusText,
  generateStatusCaseSQL,
  INVENTORY_TRANSACTION_TYPES,
  INVENTORY_TRANSACTION_GROUPS,
} = require('../../../constants/systemConstants');

// 引入库存一致性校验服务

// 引入成本凭证服务（用于生成领料凭证）

// 引入重构后的入库处理服务

// 引入状态映射工具和状态常量
const STATUS = {
  OUTBOUND: businessConfig.status.outbound,
  INBOUND: businessConfig.status.inbound,
  PRODUCTION_TASK: businessConfig.status.productionTask,
  PRODUCTION_PLAN: businessConfig.status.productionPlan,
  APPROVAL: businessConfig.status.approval,
  TRANSFER: businessConfig.status.transfer,
};

/**
 * 获取物料的批次号（FIFO原则）
 * @param {object} connection - 数据库连接
 * @param {number} materialId - 物料ID
 * @param {number} locationId - 库位ID（可选）
 * @param {string} defaultBatchNo - 默认批次号（如果查询失败）
 * @returns {Promise<string>} 批次号
 */

const getCheckStatistics = async (req, res) => {
  try {
    const [results] = await db.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'inProgress' THEN 1 ELSE 0 END) as inProgressCount,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
      FROM inventory_checks
    `);

    ResponseHandler.success(res, results[0], '获取库存盘点统计信息成功');
  } catch (error) {
    logger.error('获取库存盘点统计信息失败:', error);
    ResponseHandler.error(res, '获取库存盘点统计信息失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存盘点列表

const getCheckList = async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (c.check_no LIKE ? OR l.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      whereClause += ' AND c.status = ?';
      params.push(status);
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
      ${whereClause}
    `;

    const [countResult] = await db.pool.execute(countQuery, params);
    const total = countResult[0].total;

    const listQuery = `
      SELECT
        c.id,
        c.check_no,
        c.location_id,
        l.name as location_name,
        c.check_date,
        c.status,
        c.created_by,
        c.created_at,
        c.updated_at,
        c.remark,
        u.username as creator_name,
        u.real_name as creator_real_name,
        COALESCE(c.check_type, 'warehouse') as check_type,
        (SELECT COUNT(*) FROM inventory_check_items WHERE check_id = c.id) as item_count
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN users u ON c.created_by = u.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ${parseInt(limit, 10)} OFFSET ${offset}
    `;

    const [checks] = await db.pool.execute(listQuery, params);

    // 处理返回数据，确保字段映射正确
    const processedChecks = checks.map((check) => ({
      ...check,
      warehouse: check.location_name || '未知仓库',
      creator: check.creator_real_name || check.creator_name || '未知',
      check_type: check.check_type || 'warehouse',
    }));

    ResponseHandler.paginated(
      res,
      processedChecks,
      total,
      parseInt(page),
      parseInt(limit),
      '获取库存盘点列表成功'
    );
  } catch (error) {
    logger.error('获取库存盘点列表失败:', error);
    ResponseHandler.error(res, '获取库存盘点列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存盘点详情

const getCheckDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取盘点单基本信息
    const [checkResults] = await db.pool.execute(
      `SELECT 
        c.*,
        l.name as location_name,
        u.username as creator_name
      FROM inventory_checks c
      LEFT JOIN locations l ON c.location_id = l.id
      LEFT JOIN users u ON c.created_by = u.id
      WHERE c.id = ?`,
      [id]
    );

    if (checkResults.length === 0) {
      return ResponseHandler.error(res, '库存盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResults[0];

    // 获取盘点明细
    const [items] = await db.pool.execute(
      `SELECT 
        i.*,
        m.code as material_code,
        m.name as material_name,
        m.specs as material_specs,
        u.name as unit_name
      FROM inventory_check_items i
      LEFT JOIN materials m ON i.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE i.check_id = ?`,
      [id]
    );

    // 确保数值类型正确
    const processedItems = items.map((item) => ({
      ...item,
      system_quantity: parseFloat(item.system_quantity || 0),
      actual_quantity: parseFloat(item.actual_quantity || 0),
      difference: parseFloat(item.difference || 0),
      // 添加前端需要的字段别名
      book_qty: parseFloat(item.system_quantity || 0),
      actual_qty: parseFloat(item.actual_quantity || 0),
      specs: item.material_specs,
    }));

    ResponseHandler.success(
      res,
      {
        ...check,
        items: processedItems,
      },
      '获取库存盘点详情成功'
    );
  } catch (error) {
    logger.error('获取库存盘点详情失败:', error);
    ResponseHandler.error(res, '获取库存盘点详情失败', 'SERVER_ERROR', 500, error);
  }
};

// 创建库存盘点单

const createCheck = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { location_id, check_date, check_type, remark } = req.body;

    // 验证必要参数
    if (!location_id || !check_date) {
      await connection.rollback();
      return ResponseHandler.error(res, '仓库位置和盘点日期为必填项', 'BAD_REQUEST', 400);
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck = await PeriodValidationService.validateInventoryTransaction(check_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'BAD_REQUEST', 400);
    }
    // ===== 年度结存校验结束 =====

    // ✅ 使用统一编码规则引擎生成盘点单号
    const checkNo = await CodeGenerators.generateCheckCode(connection);

    // 创建盘点单
    const [checkResult] = await connection.execute(
      `INSERT INTO inventory_checks (
        check_no,
        location_id,
        check_type,
        check_date,
        status,
        remark,
        created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        checkNo,
        location_id,
        check_type || 'warehouse',
        check_date,
        'draft',
        remark || null,
        req.user?.id || 1, // 默认用户ID为1
      ]
    );

    const checkId = checkResult.insertId;

    // 仅针对 全面盘点（full）或周期盘点（cycle），或者未分类的库位盘点时，自动加载账面现有库存
    // 若为随机盘点（random）或专项盘点（special），则默认创建“空”的盘点单，完全由人工扫码一条条追加
    const shouldPrepopulate = check_type === 'full' || check_type === 'cycle' || check_type === 'warehouse';

    if (shouldPrepopulate) {
      // 为该库位的所有物料创建盘点明细条目
      const [stockItems] = await connection.execute(
        `SELECT 
          s.material_id, 
          s.quantity as system_quantity,
          m.unit_id
        FROM ${SIMPLE_STOCK_SUBQUERY} as s
        JOIN materials m ON s.material_id = m.id
        WHERE s.location_id = ?`,
        [location_id]
      );

      if (stockItems.length > 0) {
        // 批量查出所有物料在该库位的最新 after_quantity（消除 N+1）
        const materialIds = stockItems.map(i => i.material_id);
        const mPh = materialIds.map(() => '?').join(',');
        const [latestRecords] = await connection.execute(
          `SELECT material_id, after_quantity FROM (
             SELECT material_id, after_quantity,
                    ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY created_at DESC) as rn
             FROM inventory_ledger
             WHERE material_id IN (${mPh}) AND location_id = ?
           ) t WHERE rn = 1`,
          [...materialIds, location_id]
        );
        const afterQtyMap = new Map(latestRecords.map(r => [r.material_id, parseFloat(r.after_quantity)]));

        // 批量插入盘点明细
        const insertValues = stockItems.map(item => {
          const aq = afterQtyMap.get(item.material_id);
          const actualSystemQuantity = (aq !== undefined && aq !== null) ? aq : parseFloat(item.system_quantity || 0);
          return [checkId, item.material_id, actualSystemQuantity, actualSystemQuantity, item.unit_id, 0];
        });
        const insertPh = insertValues.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        await connection.execute(
          `INSERT INTO inventory_check_items (check_id, material_id, system_quantity, actual_quantity, unit_id, difference)
           VALUES ${insertPh}`,
          insertValues.flat()
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '盘点单创建成功',
        id: checkId,
        check_no: checkNo,
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建库存盘点单失败:', error);
    ResponseHandler.error(res, '创建库存盘点单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新库存盘点单

const updateCheck = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { check_date, remark, items } = req.body;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status FROM inventory_checks WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 只有草稿状态的盘点单可以更新
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的盘点单可以更新', 'BAD_REQUEST', 400);
    }

    // 更新盘点单基本信息
    await connection.execute(
      `UPDATE inventory_checks SET 
        check_date = ?, 
        remark = ?, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [check_date, remark || null, id]
    );

    // 如果提供了物料明细，更新明细
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.id || !item.actual_quantity) {
          continue;
        }

        const systemQuantity = parseFloat(item.system_quantity) || 0;
        const actualQuantity = parseFloat(item.actual_quantity) || 0;
        const difference = actualQuantity - systemQuantity;

        await connection.execute(
          `UPDATE inventory_check_items SET 
            actual_quantity = ?, 
            difference = ?, 
            remark = ? 
          WHERE id = ? AND check_id = ?`,
          [actualQuantity, difference, item.remark || null, item.id, id]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(res, { id }, '盘点单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新库存盘点单失败:', error);
    ResponseHandler.error(res, '更新库存盘点单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 删除库存盘点单

const deleteCheck = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute(
      'SELECT status FROM inventory_checks WHERE id = ?',
      [id]
    );

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 只有草稿状态的盘点单可以删除
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的盘点单可以删除', 'BAD_REQUEST', 400);
    }

    // 删除盘点单明细
    await connection.execute('DELETE FROM inventory_check_items WHERE check_id = ?', [id]);

    // 删除盘点单
    // ✅ 软删除盘点单主表
    await softDelete(connection, 'inventory_checks', 'id', id);

    await connection.commit();

    ResponseHandler.success(res, null, '盘点单删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除库存盘点单失败:', error);
    ResponseHandler.error(res, '删除库存盘点单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 提交盘点结果

const submitCheckResult = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { items } = req.body;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute('SELECT * FROM inventory_checks WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResult[0];

    // 只有草稿或进行中状态的盘点单可以提交结果
    if (check.status !== 'draft' && check.status !== 'in_progress') {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '只有草稿或进行中状态的盘点单可以提交结果',
        'BAD_REQUEST',
        400
      );
    }

    // 更新盘点单状态为待审核
    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['pending', id]
    );

    // 如果提供了物料明细，更新明细
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.id || item.actual_quantity === undefined) {
          continue;
        }

        const systemQuantity = parseFloat(item.system_quantity) || 0;
        const actualQuantity = parseFloat(item.actual_quantity) || 0;
        const difference = actualQuantity - systemQuantity;

        await connection.execute(
          `UPDATE inventory_check_items SET 
            actual_quantity = ?, 
            difference = ?, 
            remark = ? 
          WHERE id = ? AND check_id = ?`,
          [actualQuantity, difference, item.remark || null, item.id, id]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(res, { id }, '盘点结果提交成功，等待审核');
  } catch (error) {
    await connection.rollback();
    logger.error('提交盘点结果失败:', error);
    ResponseHandler.error(res, '提交盘点结果失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新盘点单状态

const updateCheckStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    // 验证状态值
    const validStatuses = ['draft', 'in_progress', 'pending', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute('SELECT * FROM inventory_checks WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResult[0];
    const currentStatus = check.status;

    // 状态转换验证
    const validTransitions = {
      draft: ['in_progress', 'cancelled'],
      in_progress: ['pending', 'cancelled'],
      pending: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus].includes(status)) {
      await connection.rollback();
      return res.status(400).json({
        message: `无法从"${currentStatus}"状态转换为"${status}"状态`,
      });
    }

    // 更新状态
    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        id,
        oldStatus: currentStatus,
        newStatus: status,
      },
      '状态更新成功'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('更新盘点单状态失败:', error);
    ResponseHandler.error(res, '更新盘点单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 调整库存（基于盘点结果）

const adjustInventory = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查盘点单是否存在
    const [checkResult] = await connection.execute('SELECT * FROM inventory_checks WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '盘点单不存在', 'NOT_FOUND', 404);
    }

    const check = checkResult[0];

    // 只有待审核状态的盘点单可以进行库存调整
    if (check.status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '只有待审核状态的盘点单可以进行库存调整',
        'BAD_REQUEST',
        400
      );
    }

    // 获取盘点明细
    const [items] = await connection.execute(
      `SELECT 
        i.*,
        m.name as material_name,
        m.unit_id
      FROM inventory_check_items i
      JOIN materials m ON i.material_id = m.id
      WHERE i.check_id = ?`,
      [id]
    );

    // 处理每个物料的库存调整
    for (const item of items) {
      // 只处理有差异的物料
      if (parseFloat(item.difference) === 0) {
        continue;
      }

      // 获取当前库存（移除HAVING条件，获取真实库存数量）
      const [stockResult] = await connection.execute(
        'SELECT material_id, location_id, SUM(il.quantity) as quantity FROM inventory_ledger il JOIN materials mat ON il.material_id = mat.id WHERE il.material_id = ? AND il.location_id = ? AND (mat.location_id IS NULL OR il.location_id = mat.location_id) GROUP BY material_id, location_id',
        [item.material_id, check.location_id]
      );

      const currentQuantity = stockResult.length > 0 ? parseFloat(stockResult[0].quantity) : 0;
      const newQuantity = parseFloat(item.actual_quantity);
      const difference = parseFloat(item.difference);

      // 记录库存交易日志
      await _insertInventoryLedgerLocal(connection, {
        material_id: item.material_id,
        location_id: check.location_id,
        transaction_type: 'check',
        quantity: difference,
        unit_id: item.unit_id,
        reference_no: check.check_no,
        reference_type: 'check',
        operator: await getCurrentUserName(req),
        remark: `盘点调整：系统库存${currentQuantity}，实际库存${newQuantity}，差异${difference}`,
        beforeQuantity: currentQuantity,
        afterQuantity: newQuantity,
      });

      // 在新架构中，库存通过inventory_ledger流水记录汇总计算
      // 只需要插入调整记录，无需直接更新库存表
    }

    // 更新盘点单状态为已完成
    await connection.execute(
      'UPDATE inventory_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      ['completed', id]
    );

    await connection.commit();

    ResponseHandler.success(res, { id }, '库存调整成功');
  } catch (error) {
    await connection.rollback();
    logger.error('库存调整失败:', error);
    ResponseHandler.error(res, '库存调整失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 状态映射检查API

const checkStatusMappings = async (req, res) => {
  try {
    const { generateStatusMappingReport } = require('../../../utils/statusMappingValidator');
    const report = generateStatusMappingReport();

    ResponseHandler.success(res, report, '状态映射检查完成');
  } catch (error) {
    logger.error('状态映射检查失败:', error);
    ResponseHandler.error(res, '状态映射检查失败', 'SERVER_ERROR', 500, error);
  }
};

// 批量库存查询API（优化版）


module.exports = {
  getCheckStatistics,
  getCheckList,
  getCheckDetail,
  createCheck,
  updateCheck,
  deleteCheck,
  submitCheckResult,
  updateCheckStatus,
  adjustInventory,
  checkStatusMappings,
};
