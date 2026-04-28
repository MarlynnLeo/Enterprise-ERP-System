/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { CodeGenerators } = require('../../../utils/codeGenerator');

const db = require('../../../config/db');
const { softDelete, softDeleteBatch } = require('../../../utils/softDelete');
const InventoryService = require('../../../services/InventoryService');
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

const getTransferList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      transfer_no = '',
      status = '',
      from_location_id = '',
      to_location_id = '',
      start_date = '',
      end_date = '',
    } = req.query;
    const offsetValue = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const limitValue = parseInt(limit, 10);

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (transfer_no) {
      whereClause += ' AND t.transfer_no LIKE ?';
      params.push(`%${transfer_no}%`);
    }

    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }

    if (from_location_id) {
      whereClause += ' AND t.from_location_id = ?';
      params.push(from_location_id);
    }

    if (to_location_id) {
      whereClause += ' AND t.to_location_id = ?';
      params.push(to_location_id);
    }

    if (start_date && end_date) {
      whereClause += ' AND t.transfer_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    } else if (start_date) {
      whereClause += ' AND t.transfer_date >= ?';
      params.push(start_date);
    } else if (end_date) {
      whereClause += ' AND t.transfer_date <= ?';
      params.push(end_date);
    }

    // 获取总记录数
    const [countResult] = await db.pool.execute(
      `SELECT COUNT(*) as total FROM inventory_transfers t ${whereClause}`,
      params
    );

    const total = countResult[0].total;

    // 使用query代替execute，使用?号占位符插入，但手动拼接LIMIT OFFSET部分
    const query = `
      SELECT
        t.id,
        t.transfer_no,
        t.transfer_date,
        t.from_location_id,
        t.to_location_id,
        fl.name as from_location,
        tl.name as to_location,
        t.status,
        t.remark,
        t.creator,
        (SELECT COALESCE(u.real_name, t.creator)
         FROM users u
         WHERE u.username = t.creator OR u.real_name = t.creator
         LIMIT 1) as creator_name,
        t.created_at,
        t.updated_at,
        (SELECT COUNT(*) FROM inventory_transfer_items WHERE transfer_id = t.id) as item_count
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT ${limitValue} OFFSET ${offsetValue}`;

    const [transfers] = await db.pool.query(query, params);

    ResponseHandler.paginated(
      res,
      transfers,
      total,
      parseInt(page, 10),
      parseInt(limit, 10),
      '获取调拨单列表成功'
    );
  } catch (error) {
    logger.error('获取调拨单列表失败:', error);
    ResponseHandler.error(res, '获取调拨单列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取库存调拨单详情

const getTransferDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取调拨单基本信息
    const [transferResults] = await db.pool.execute(
      `SELECT 
        t.id,
        t.transfer_no,
        t.transfer_date,
        t.from_location_id,
        t.to_location_id,
        fl.name as from_location,
        tl.name as to_location,
        t.status,
        t.remark,
        t.creator,
        t.created_at,
        t.updated_at
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id = ?`,
      [id]
    );

    if (transferResults.length === 0) {
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const transfer = transferResults[0];

    // 获取调拨单物料明细
    const [items] = await db.pool.execute(
      `SELECT 
        i.id,
        i.material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        i.quantity,
        u.id as unit_id,
        u.name as unit_name
      FROM inventory_transfer_items i
      LEFT JOIN materials m ON i.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE i.transfer_id = ?`,
      [id]
    );

    // 返回组合结果
    ResponseHandler.success(
      res,
      {
        ...transfer,
        items,
      },
      '获取调拨单详情成功'
    );
  } catch (error) {
    logger.error('获取调拨单详情失败:', error);
    ResponseHandler.error(res, '获取调拨单详情失败', 'SERVER_ERROR', 500, error);
  }
};

// 创建库存调拨单

const createTransfer = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      transfer_date,
      from_location_id,
      to_location_id,
      items,
      remark,
      status = 'draft',
    } = req.body;

    // 基本验证
    if (
      !transfer_date ||
      !from_location_id ||
      !to_location_id ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '请提供调拨日期、源库位、目标库位和物料明细',
        'BAD_REQUEST',
        400
      );
    }

    // ===== 年度结存校验 =====
    const PeriodValidationService = require('../../../services/business/PeriodValidationService');
    const inventoryCheck =
      await PeriodValidationService.validateInventoryTransaction(transfer_date);
    if (!inventoryCheck.allowed) {
      await connection.rollback();
      return ResponseHandler.error(res, inventoryCheck.message, 'BAD_REQUEST', 400);
    }
    // ===== 年度结存校验结束 =====

    if (from_location_id === to_location_id) {
      await connection.rollback();
      return ResponseHandler.error(res, '源库位和目标库位不能相同', 'BAD_REQUEST', 400);
    }

    // 验证物料明细
    for (const item of items) {
      if (!item.material_id || !item.quantity || item.quantity <= 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '调拨物料必须提供物料ID和大于0的数量',
          'BAD_REQUEST',
          400
        );
      }

      // 使用统一的库存服务检查库存是否足够
      try {
        const validation = await InventoryService.validateStock(
          item.material_id,
          from_location_id,
          parseFloat(item.quantity),
          connection
        );

        if (!validation.isEnough) {
          await connection.rollback();
          const [materialResult] = await connection.execute(
            'SELECT name FROM materials WHERE id = ?',
            [item.material_id]
          );
          const materialName =
            materialResult.length > 0 ? materialResult[0].name : `物料ID: ${item.material_id}`;
          return res.status(400).json({
            message: `库存不足: ${materialName} 当前库存 ${validation.currentStock}, 需要 ${item.quantity}`,
          });
        }
      } catch (error) {
        await connection.rollback();
        logger.error('验证库存时发生错误:', error);
        return ResponseHandler.error(
          res,
          '验证库存失败: ' + error.message,
          'SERVER_ERROR',
          500,
          error
        );
      }
    }

    // 生成调拨单号
    const transfer_no = await CodeGenerators.generateTransferCode(connection);

    // 创建调拨单
    const [transferResult] = await connection.execute(
      `INSERT INTO inventory_transfers (
        transfer_no, 
        transfer_date, 
        from_location_id, 
        to_location_id, 
        status, 
        remark, 
        creator
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transfer_no,
        transfer_date,
        from_location_id,
        to_location_id,
        status,
        remark || '',
        req.user?.username || 'system',
      ]
    );

    const transferId = transferResult.insertId;

    // 添加调拨物料明细
    for (const item of items) {
      await connection.execute(
        `INSERT INTO inventory_transfer_items (
          transfer_id, 
          material_id, 
          quantity
        ) VALUES (?, ?, ?)`,
        [transferId, item.material_id, item.quantity]
      );
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '调拨单创建成功',
        id: transferId,
        transfer_no,
      },
      '创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建库存调拨单失败:', error);
    ResponseHandler.error(res, '创建库存调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新库存调拨单

const updateTransfer = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { transfer_date, from_location_id, to_location_id, items, remark } = req.body;

    // 检查调拨单是否存在
    const [transferResult] = await connection.execute(
      'SELECT status FROM inventory_transfers WHERE id = ?',
      [id]
    );

    if (transferResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = transferResult[0].status;

    // 只有草稿状态的调拨单可以更新
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的调拨单可以更新', 'BAD_REQUEST', 400);
    }

    // 基本验证
    if (
      !transfer_date ||
      !from_location_id ||
      !to_location_id ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        '请提供调拨日期、源库位、目标库位和物料明细',
        'BAD_REQUEST',
        400
      );
    }

    if (from_location_id === to_location_id) {
      await connection.rollback();
      return ResponseHandler.error(res, '源库位和目标库位不能相同', 'BAD_REQUEST', 400);
    }

    // 验证物料明细
    for (const item of items) {
      if (!item.material_id || !item.quantity || item.quantity <= 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '调拨物料必须提供物料ID和大于0的数量',
          'BAD_REQUEST',
          400
        );
      }

      // 检查源库位库存是否足够
      const [stockResult] = await connection.execute(
        `SELECT quantity FROM ${STOCK_SUBQUERY} as current_stock WHERE material_id = ? AND location_id = ?`,
        [item.material_id, from_location_id]
      );

      const currentStock = stockResult.length > 0 ? parseFloat(stockResult[0].quantity) : 0;

      if (currentStock < parseFloat(item.quantity)) {
        await connection.rollback();
        const [materialResult] = await connection.execute(
          'SELECT name FROM materials WHERE id = ?',
          [item.material_id]
        );
        const materialName =
          materialResult.length > 0 ? materialResult[0].name : `物料ID: ${item.material_id}`;
        return res.status(400).json({
          message: `库存不足: ${materialName} 当前库存 ${currentStock}, 需要 ${item.quantity}`,
        });
      }
    }

    // 更新调拨单
    await connection.execute(
      `UPDATE inventory_transfers SET 
        transfer_date = ?, 
        from_location_id = ?, 
        to_location_id = ?, 
        remark = ?, 
        updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?`,
      [transfer_date, from_location_id, to_location_id, remark || '', id]
    );

    // 删除旧的物料明细
    await connection.execute('DELETE FROM inventory_transfer_items WHERE transfer_id = ?', [id]);

    // 添加新的物料明细
    for (const item of items) {
      await connection.execute(
        `INSERT INTO inventory_transfer_items (
          transfer_id, 
          material_id, 
          quantity
        ) VALUES (?, ?, ?)`,
        [id, item.material_id, item.quantity]
      );
    }

    await connection.commit();

    ResponseHandler.success(res, { id }, '调拨单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新库存调拨单失败:', error);
    ResponseHandler.error(res, '更新库存调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 删除库存调拨单

const deleteTransfer = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查调拨单是否存在
    const [transferResult] = await connection.execute(
      'SELECT status FROM inventory_transfers WHERE id = ?',
      [id]
    );

    if (transferResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = transferResult[0].status;

    // 只有草稿状态的调拨单可以删除
    if (currentStatus !== 'draft') {
      await connection.rollback();
      return ResponseHandler.error(res, '只有草稿状态的调拨单可以删除', 'BAD_REQUEST', 400);
    }

    // 删除调拨单物料明细
    await connection.execute('DELETE FROM inventory_transfer_items WHERE transfer_id = ?', [id]);

    // ✅ 软删除调拨单主表
    await softDelete(connection, 'inventory_transfers', 'id', id);

    await connection.commit();

    ResponseHandler.success(res, null, '调拨单删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除库存调拨单失败:', error);
    ResponseHandler.error(res, '删除库存调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新库存调拨单状态

const updateTransferStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { newStatus } = req.body;

    // 验证状态参数
    const validStatuses = ['draft', 'pending', 'approved', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 获取当前调拨单信息
    const [transferResults] = await connection.execute(
      `SELECT 
        t.*,
        fl.name as from_location_name,
        tl.name as to_location_name
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id = ?`,
      [id]
    );

    if (transferResults.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '调拨单不存在', 'NOT_FOUND', 404);
    }

    const transfer = transferResults[0];
    const currentStatus = transfer.status;

    // 状态转换逻辑验证
    const validTransitions = {
      draft: ['pending', 'cancelled'],
      pending: ['approved', 'cancelled'],
      approved: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus].includes(newStatus)) {
      await connection.rollback();
      return res.status(400).json({
        message: `调拨单状态无法从 "${currentStatus}" 变更为 "${newStatus}"`,
      });
    }

    // 如果状态从'approved'变更为'completed'，执行实际的库存转移
    if (currentStatus === STATUS.TRANSFER.APPROVED && newStatus === STATUS.TRANSFER.COMPLETED) {
      // 获取调拨单物料明细
      const [items] = await connection.execute(
        `SELECT
          i.id, 
          i.material_id, 
          i.quantity,
          m.name as material_name,
          m.unit_id
        FROM inventory_transfer_items i
        LEFT JOIN materials m ON i.material_id = m.id
        WHERE i.transfer_id = ?`,
        [id]
      );

      // 获取库位名称用于备注（循环外只查一次，所有物料共享同一源/目标库位）
      const fromLocationName = transfer.from_location_name || `库位ID:${transfer.from_location_id}`;
      const toLocationName = transfer.to_location_name || `库位ID:${transfer.to_location_id}`;

      // 处理每个物料的库存转移 - 使用统一的库存服务
      for (const item of items) {
        const materialId = item.material_id;
        const quantity = parseFloat(item.quantity);

        // 使用统一的库存服务进行库存转移
        try {
          await InventoryService.transferStock(
            {
              materialId,
              fromLocationId: transfer.from_location_id,
              toLocationId: transfer.to_location_id,
              quantity,
              referenceNo: transfer.transfer_no,
              referenceType: 'transfer',
              operator: await getCurrentUserName(req),
              remark: `从 ${fromLocationName} 调拨至 ${toLocationName}`,
              unitId: item.unit_id,
            },
            connection
          );
        } catch (error) {
          logger.error(
            `库存转移失败 - 物料ID:${materialId}, 调拨单:${transfer.transfer_no}:`,
            error
          );
          throw error;
        }
      }
    }

    // 更新调拨单状态
    await connection.execute(
      'UPDATE inventory_transfers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStatus, id]
    );

    await connection.commit();

    ResponseHandler.success(res, { id, status: newStatus }, '调拨单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新库存调拨单状态失败:', error);
    ResponseHandler.error(res, '更新库存调拨单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取调拨单统计信息

const getTransferStatistics = async (req, res) => {
  try {
    const [results] = await db.pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingCount,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approvedCount,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedCount,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelledCount
      FROM inventory_transfers
    `);

    ResponseHandler.success(res, results[0], '获取调拨单统计信息成功');
  } catch (error) {
    logger.error('获取调拨单统计信息失败:', error);
    ResponseHandler.error(res, '获取调拨单统计信息失败', 'SERVER_ERROR', 500, error);
  }
};

// 导出调拨单

const exportTransfers = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return ResponseHandler.error(res, '请选择要导出的调拨单', 'BAD_REQUEST', 400);
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('调拨单列表');

    // 设置列
    worksheet.columns = [
      { header: '调拨单号', key: 'transfer_no', width: 20 },
      { header: '调出仓库', key: 'from_location', width: 20 },
      { header: '调入仓库', key: 'to_location', width: 20 },
      { header: '状态', key: 'status_text', width: 12 },
      { header: '调拨日期', key: 'transfer_date', width: 15 },
      { header: '创建时间', key: 'created_at', width: 20 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    // 查询调拨单主表数据
    const placeholders = ids.map(() => '?').join(',');
    const [transfers] = await db.pool.execute(
      `
      SELECT 
        t.id,
        t.transfer_no,
        t.from_location_id,
        t.to_location_id,
        t.status,
        t.transfer_date,
        t.remarks,
        t.created_at,
        fl.name as from_location,
        tl.name as to_location
      FROM inventory_transfers t
      LEFT JOIN locations fl ON t.from_location_id = fl.id
      LEFT JOIN locations tl ON t.to_location_id = tl.id
      WHERE t.id IN (${placeholders})
      ORDER BY t.created_at DESC
    `,
      ids
    );

    // 添加数据到表格
    transfers.forEach((transfer) => {
      worksheet.addRow({
        transfer_no: transfer.transfer_no,
        from_location: transfer.from_location || '未知',
        to_location: transfer.to_location || '未知',
        status_text: getTransferStatusText(transfer.status),
        transfer_date: transfer.transfer_date
          ? new Date(transfer.transfer_date).toLocaleDateString('zh-CN')
          : '',
        created_at: transfer.created_at
          ? new Date(transfer.created_at).toLocaleString('zh-CN')
          : '',
        remarks: transfer.remarks || '',
      });
    });

    // 批量查出所有调拨单的明细（消除 N+1）
    const allTransferIds = transfers.map(t => t.id);
    const detailPlaceholders = allTransferIds.map(() => '?').join(',');
    const [allItems] = await db.pool.execute(
      `SELECT 
        ti.transfer_id,
        ti.*,
        m.code as material_code,
        m.name as material_name,
        m.specification,
        u.name as unit_name
      FROM inventory_transfer_items ti
      LEFT JOIN materials m ON ti.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE ti.transfer_id IN (${detailPlaceholders})
      ORDER BY ti.id`,
      allTransferIds
    );
    // 按 transfer_id 分组
    const itemsMap = new Map();
    for (const item of allItems) {
      if (!itemsMap.has(item.transfer_id)) itemsMap.set(item.transfer_id, []);
      itemsMap.get(item.transfer_id).push(item);
    }

    // 为每个调拨单创建详细明细表
    for (const transfer of transfers) {
      const detailSheet = workbook.addWorksheet(`调拨单${transfer.transfer_no}`);

      // 添加调拨单头信息
      detailSheet.addRow(['调拨单号:', transfer.transfer_no]);
      detailSheet.addRow(['调出仓库:', transfer.from_location || '未知']);
      detailSheet.addRow(['调入仓库:', transfer.to_location || '未知']);
      detailSheet.addRow(['状态:', getTransferStatusText(transfer.status)]);
      detailSheet.addRow([
        '调拨日期:',
        transfer.transfer_date ? new Date(transfer.transfer_date).toLocaleDateString('zh-CN') : '',
      ]);
      detailSheet.addRow(['备注:', transfer.remarks || '']);
      detailSheet.addRow([]); // 空行

      // 设置明细列
      detailSheet.columns = [
        { header: '物料编码', key: 'material_code', width: 20 },
        { header: '物料名称', key: 'material_name', width: 30 },
        { header: '规格型号', key: 'specification', width: 25 },
        { header: '调拨数量', key: 'quantity', width: 12 },
        { header: '单位', key: 'unit', width: 10 },
        { header: '备注', key: 'item_remark', width: 30 },
      ];

      const items = itemsMap.get(transfer.id) || [];
      // 添加明细数据
      items.forEach((item) => {
        detailSheet.addRow({
          material_code: item.material_code || '',
          material_name: item.material_name || '',
          specification: item.specification || '',
          quantity: item.quantity,
          unit: item.unit_name || '',
          item_remark: item.remark || '',
        });
      });
    }

    // 设置响应头
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transfer_export_${Date.now()}.xlsx"`
    );

    // 发送文件
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    logger.error('导出调拨单失败:', error);
    ResponseHandler.error(res, '导出调拨单失败', 'SERVER_ERROR', 500, error);
  }
};

// 批量删除调拨单

const batchDeleteTransfers = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '请选择要删除的调拨单', 'BAD_REQUEST', 400);
    }

    // 检查所有调拨单的状态
    const placeholders = ids.map(() => '?').join(',');
    const [transferResults] = await connection.execute(
      `SELECT id, transfer_no, status FROM inventory_transfers WHERE id IN (${placeholders})`,
      ids
    );

    if (transferResults.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '未找到要删除的调拨单', 'NOT_FOUND', 404);
    }

    // 检查是否有非草稿状态的调拨单
    const nonDraftTransfers = transferResults.filter((t) => t.status !== 'draft');
    if (nonDraftTransfers.length > 0) {
      await connection.rollback();
      const nonDraftNos = nonDraftTransfers.map((t) => t.transfer_no).join(', ');
      return ResponseHandler.error(
        res,
        `以下调拨单不是草稿状态，无法删除: ${nonDraftNos}`,
        'BAD_REQUEST',
        400
      );
    }

    // 批量删除调拨单物料明细
    await connection.execute(
      `DELETE FROM inventory_transfer_items WHERE transfer_id IN (${placeholders})`,
      ids
    );

    // ✅ 批量软删除调拨单
    const affected = await softDeleteBatch(connection, 'inventory_transfers', 'id', ids);
    const result = { affectedRows: affected };

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        deleted: result.affectedRows,
      },
      `成功删除 ${result.affectedRows} 个调拨单`
    );
  } catch (error) {
    await connection.rollback();
    logger.error('批量删除调拨单失败:', error);
    ResponseHandler.error(res, '批量删除调拨单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取库存盘点统计信息


module.exports = {
  getTransferList,
  getTransferDetail,
  createTransfer,
  updateTransfer,
  deleteTransfer,
  updateTransferStatus,
  getTransferStatistics,
  exportTransfers,
  batchDeleteTransfers,
};
