/**
 * purchaseReturnController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const pool = db.pool; // 正确引用连接池
const purchaseModel = require('../../../models/purchase');
const { ErrorFactory } = require('../../../middleware/unifiedErrorHandler');
const businessConfig = require('../../../config/businessConfig');

// 状态常量
const STATUS = {
  PURCHASE_RETURN: {
    DRAFT: 'draft',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

/**
 * @deprecated 采购退货表结构已迁移至 Knex 迁移文件 20260312000007 管理，此函数保留为空操作
 */
const createTablesIfNotExist = async () => {
  // 表结构由 migrations/20260312000007_baseline_purchase_extended_tables.js 管理
};

// 获取采购退货列表
const getReturns = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      returnNo,
      receiptNo,
      supplierId,
      startDate,
      endDate,
      status,
    } = req.query;
    const offset = (page - 1) * pageSize;

    // 创建两个查询：一个用于获取分页数据，一个用于计算总数
    let dataQuery = `
      SELECT
        r.*,
        s.name as supplier_name,
        l.name as warehouse_name,
        (SELECT u.real_name FROM users u WHERE u.username = r.operator OR u.real_name = r.operator LIMIT 1) as real_name
      FROM purchase_returns r
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      LEFT JOIN locations l ON r.warehouse_id = l.id
      WHERE 1=1
    `;

    let countQuery = `
      SELECT COUNT(*) as total_count
      FROM purchase_returns r
      WHERE 1=1
    `;

    const queryParams = [];
    const countParams = [];

    if (returnNo) {
      const condition = ' AND r.return_no LIKE ?';
      dataQuery += condition;
      countQuery += condition;
      queryParams.push(`%${returnNo}%`);
      countParams.push(`%${returnNo}%`);
    }

    if (receiptNo) {
      const condition = ' AND r.receipt_no LIKE ?';
      dataQuery += condition;
      countQuery += condition;
      queryParams.push(`%${receiptNo}%`);
      countParams.push(`%${receiptNo}%`);
    }

    if (supplierId) {
      const condition = ' AND r.supplier_id = ?';
      dataQuery += condition;
      countQuery += condition;
      queryParams.push(supplierId);
      countParams.push(supplierId);
    }

    if (startDate) {
      const condition = ' AND r.return_date >= ?';
      dataQuery += condition;
      countQuery += condition;
      queryParams.push(startDate);
      countParams.push(startDate);
    }

    if (endDate) {
      const condition = ' AND r.return_date <= ?';
      dataQuery += condition;
      countQuery += condition;
      queryParams.push(endDate);
      countParams.push(endDate);
    }

    if (status) {
      const condition = ' AND r.status = ?';
      dataQuery += condition;
      countQuery += condition;
      queryParams.push(status);
      countParams.push(status);
    }

    // 添加排序和分页
    dataQuery += ` ORDER BY r.created_at DESC LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}`;

    // 执行数据查询
    const [result] = await pool.query(dataQuery, queryParams);

    // 执行计数查询
    const [countResult] = await pool.query(countQuery, countParams);
    const totalCount = countResult[0].total_count;

    // 整合退货单数据，处理操作人真实姓名
    const returns = result.map((row) => {
      return {
        ...row,
        // 优先使用从用户表获取的真实姓名，如果没有则使用操作员用户名
        operator_name: row.real_name || row.operator || '',
      };
    });

    res.json({
      data: returns,
      pagination: {
        total: totalCount,
        current: parseInt(page),
        pageSize: parseInt(pageSize),
      },
    });
  } catch (error) {
    logger.error('获取采购退货列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购退货详情
const getReturn = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取退货单基本信息，关联供应商和仓库表获取名称，获取操作人真实姓名
    const query = `
      SELECT
        r.*,
        s.name as supplier_name,
        l.name as warehouse_name,
        (SELECT u.real_name FROM users u WHERE u.username = r.operator OR u.real_name = r.operator LIMIT 1) as real_name
      FROM purchase_returns r
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      LEFT JOIN locations l ON r.warehouse_id = l.id
      WHERE r.id = ?
    `;
    const [result] = await pool.query(query, [id]);

    if (result.length === 0) {
      return res.status(404).json({ error: '采购退货单不存在' });
    }

    const returnData = result[0];

    // 处理操作人真实姓名
    returnData.operator_name = returnData.real_name || returnData.operator || '';

    // 获取退货单物料（JOIN 物料表获取规格和单位）
    const itemsQuery = `
      SELECT ri.*,
        m.name as material_name,
        m.code as material_code,
        m.specs as specification,
        u.name as unit
      FROM purchase_return_items ri
      LEFT JOIN materials m ON ri.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE ri.return_id = ? ORDER BY ri.id
    `;
    const [itemsResult] = await pool.query(itemsQuery, [id]);

    returnData.items = itemsResult;

    res.json(returnData);
  } catch (error) {
    logger.error('获取采购退货详情失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 创建采购退货
const createReturn = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const {
      receiptId,
      returnDate,
      reason,
      remarks,
      items,
      totalAmount,
      operator: operatorFromBody, // ✅ 接收前端传来的operator
    } = req.body;

    // 获取入库单信息
    const receiptQuery = `
      SELECT receipt_no, supplier_id, supplier_name, warehouse_id, warehouse_name
      FROM purchase_receipts
      WHERE id = ? AND status = '${STATUS.PURCHASE_RETURN.COMPLETED}'
    `;
    const [receiptResult] = await connection.query(receiptQuery, [receiptId]);

    if (receiptResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '完成状态的入库单不存在' });
    }

    const {
      receipt_no: receiptNo,
      supplier_id: supplierId,
      supplier_name: supplierName,
      warehouse_id: warehouseId,
      warehouse_name: warehouseName,
    } = receiptResult[0];

    // 生成退货单号
    const returnNo = await purchaseModel.generateReturnNo();

    // ✅ 优先使用前端传来的operator,否则使用当前登录用户
    const operator = operatorFromBody || req.user?.real_name || req.user?.username || 'system';

    logger.info('✅ 创建退货单 - 操作人:', {
      operatorFromBody,
      userRealName: req.user?.real_name,
      username: req.user?.username,
      finalOperator: operator,
    });

    // 创建采购退货单
    const insertQuery = `
      INSERT INTO purchase_returns (
        return_no, receipt_id, receipt_no, source_type, supplier_id, supplier_name,
        warehouse_id, warehouse_name, return_date, reason,
        total_amount, operator, remarks, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await connection.query(insertQuery, [
      returnNo,
      receiptId,
      receiptNo,
      'manual',
      supplierId,
      supplierName,
      warehouseId,
      warehouseName,
      returnDate,
      reason,
      totalAmount || 0,
      operator,
      remarks,
      'draft',
    ]);

    const returnId = result.insertId;

    // 创建采购退货物料项目
    if (items && items.length > 0) {
      const insertItemsQuery = `
        INSERT INTO purchase_return_items 
        (return_id, receipt_item_id, material_id, material_code, material_name, 
         specification, unit, unit_id, quantity, return_quantity, price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const item of items) {
        if (item.returnQuantity > 0) {
          await connection.query(insertItemsQuery, [
            returnId,
            item.id, // 入库单物料项ID
            item.materialId,
            item.materialCode,
            item.materialName,
            item.specification,
            item.unit,
            item.unitId,
            item.quantity,
            item.returnQuantity,
            item.price,
          ]);
        }
      }
    }

    await connection.commit();

    // 获取完整的退货单信息
    const createdReturn = await getReturnById(returnId);

    ResponseHandler.success(res, createdReturn, '创建成功', 201);
  } catch (error) {
    await connection.rollback();
    logger.error('创建采购退货单失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新采购退货
const updateReturn = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      returnDate,
      reason,
      remarks,
      items,
      totalAmount,
      operator: operatorFromBody, // ✅ 接收前端传来的operator
    } = req.body;

    // 检查退货单是否存在及其状态
    const checkQuery = 'SELECT status FROM purchase_returns WHERE id = ?';
    const [checkResult] = await connection.query(checkQuery, [id]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '采购退货单不存在' });
    }

    const currentStatus = checkResult[0].status;
    if (currentStatus !== 'draft' && currentStatus !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ error: '只能编辑草稿或待处理状态的退货单' });
    }

    // ✅ 优先使用前端传来的operator,否则使用当前登录用户
    const operator = operatorFromBody || req.user?.real_name || req.user?.username || 'system';

    // 更新退货单基本信息
    const updateQuery = `
      UPDATE purchase_returns
      SET return_date = ?, reason = ?, remarks = ?,
          total_amount = ?, operator = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await connection.query(updateQuery, [
      returnDate,
      reason,
      remarks,
      totalAmount || 0,
      operator,
      id,
    ]);

    // 删除原有物料项目
    await connection.query('DELETE FROM purchase_return_items WHERE return_id = ?', [id]);

    // 添加新的物料项目
    if (items && items.length > 0) {
      const insertItemsQuery = `
        INSERT INTO purchase_return_items 
        (return_id, receipt_item_id, material_id, material_code, material_name, 
         specification, unit, unit_id, quantity, return_quantity, price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const item of items) {
        if (item.returnQuantity > 0) {
          await connection.query(insertItemsQuery, [
            id,
            item.id, // 入库单物料项ID
            item.materialId,
            item.materialCode,
            item.materialName,
            item.specification,
            item.unit,
            item.unitId,
            item.quantity,
            item.returnQuantity,
            item.price,
          ]);
        }
      }
    }

    await connection.commit();

    // 获取更新后的退货单信息
    const updatedReturn = await getReturnById(id);

    res.json(updatedReturn);
  } catch (error) {
    await connection.rollback();
    logger.error('更新采购退货单失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 更新采购退货状态
const updateReturnStatus = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { newStatus } = req.body;

    // 检查状态值是否有效
    const validStatuses = ['draft', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: '无效的状态值' });
    }

    // 检查退货单是否存在
    const checkQuery = 'SELECT status, warehouse_id FROM purchase_returns WHERE id = ?';
    const [checkResult] = await connection.query(checkQuery, [id]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: '采购退货单不存在' });
    }

    const currentStatus = checkResult[0].status;

    // 检查状态变更是否有效
    if (currentStatus === newStatus) {
      await connection.rollback();
      return res.status(400).json({ error: '当前已经是该状态' });
    }

    // 特定状态转换的验证
    const validTransitions = {
      draft: ['confirmed', 'cancelled'],
      confirmed: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(newStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: '无效的状态变更' });
    }

    // 如果状态变为已完成，则需要更新库存
    if (newStatus === STATUS.PURCHASE_RETURN.COMPLETED) {
      // 获取退货单基本信息,包括关联的入库单ID
      const returnQuery =
        'SELECT return_no, warehouse_id, receipt_id, source_type FROM purchase_returns WHERE id = ?';
      const [returnResult] = await connection.query(returnQuery, [id]);

      if (returnResult.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: '退货单不存在' });
      }

      const returnNo = returnResult[0].return_no;
      const warehouseId = returnResult[0].warehouse_id;
      const receiptId = returnResult[0].receipt_id;

      // 通过入库单获取采购订单ID
      let orderId = null;
      if (receiptId) {
        const receiptQuery = 'SELECT order_id FROM purchase_receipts WHERE id = ?';
        const [receiptResult] = await connection.query(receiptQuery, [receiptId]);
        if (receiptResult.length > 0) {
          orderId = receiptResult[0].order_id;
          logger.info(`退货单 ${returnNo} 关联的采购订单ID: ${orderId}`);
        }
      }

      // 获取退货单物料
      const itemsQuery = 'SELECT * FROM purchase_return_items WHERE return_id = ?';
      const [itemsResult] = await connection.query(itemsQuery, [id]);

      // ✅ 修复: 判断是否需要扣减库存
      // 不再依赖 receiptId 判断是否扣减库存。退货单指定了出库仓库时，只要仓库有库存，就扣减。
      let shouldDeductStock = false;

      if (warehouseId) {
        for (const item of itemsResult) {
          const [stockCheck] = await connection.query(
            'SELECT COALESCE(SUM(quantity), 0) as qty FROM inventory_ledger WHERE material_id = ? AND location_id = ?',
            [item.material_id, warehouseId]
          );
          if (parseFloat(stockCheck[0].qty) > 0) {
            shouldDeductStock = true;
            break;
          }
        }
      }

      if (shouldDeductStock) {
        logger.info(`退货单 ${returnNo} 所在仓库(ID:${warehouseId})有实际库存,将扣减库存`);
      } else {
        logger.info(`退货单 ${returnNo} 所在仓库无库存或未指定仓库,跳过库存扣减`);
      }

      if (shouldDeductStock) {
        // 扣减库存
        for (const item of itemsResult) {
          // 获取当前库存（使用新的单表架构）
          const stockQuery = `
            SELECT COALESCE(SUM(quantity), 0) as current_quantity
            FROM inventory_ledger
            WHERE material_id = ? AND location_id = ?
          `;
          const [stockResult] = await connection.query(stockQuery, [item.material_id, warehouseId]);

          const currentQuantity = parseFloat(stockResult[0].current_quantity) || 0;
          const returnQuantity = parseFloat(item.return_quantity);

          // 确保库存不会变为负数
          if (currentQuantity < returnQuantity) {
            await connection.rollback();
            return res.status(400).json({
              error: `物料 ${item.material_name} 库存不足，当前库存: ${currentQuantity}, 退货数量: ${returnQuantity}`,
            });
          }

          const newQuantity = currentQuantity - returnQuantity;

          // 获取物料的单位ID
          const unitQuery = 'SELECT unit_id FROM materials WHERE id = ?';
          const [unitResult] = await connection.query(unitQuery, [item.material_id]);
          const unitId = unitResult.length > 0 ? unitResult[0].unit_id : null;

          // 🔥 使用统一的 InventoryService 更新库存（自动同步 batch_inventory）
          const InventoryService = require('../../../services/InventoryService');
          await InventoryService.updateStock(
            {
              materialId: item.material_id,
              locationId: warehouseId,
              quantity: -returnQuantity, // 退货为负数
              transactionType: 'purchase_return',
              referenceNo: returnNo,
              referenceType: 'purchase_return',
              operator: 'system',
              remark: `采购退货：${returnNo}`,
              unitId,
              batchNumber: null, // 退货通常不指定批次
              unitCost: item.unit_price, // 透传退货单价以保证存货账面精确相减
            },
            connection
          );

          // 异步生成采购退货的存货出库成本分录 (借暂估/贷库存)
          setImmediate(async () => {
            try {
              const AsyncTaskService = require('../../../services/business/AsyncTaskService');
              await AsyncTaskService.createCostEntryAsync({
                transaction_type: 'purchase_return',
                reference_no: returnNo,
                reference_type: 'purchase_return',
                material_id: item.material_id,
                quantity: returnQuantity, // 这里传绝对值，底层会自动取绝对值或按照正负号计算成本
                unit_cost: item.unit_price,
                operator: 'system',
              });
            } catch (costErr) {
              logger.warn(`退货单 ${returnNo} 物料 ${item.material_id} 成本核算触发失败:`, costErr.message);
            }
          });

          logger.info(
            `✅ 库存扣减成功（统一服务）及触发存货核算: 物料ID=${item.material_id}, 退货数量=${returnQuantity}`
          );
        }
      } else {
        // 无关联收货单且仓库无库存,跳过库存扣减
        logger.info(`✅ 退货单 ${returnNo} 无需扣减库存(无关联收货单且仓库无库存)`);
      }

      // ✅ 更新采购订单的收货数量和入库数量
      if (orderId) {
        logger.info(`准备更新采购订单 ${orderId} 的收货和入库数量`);

        for (const item of itemsResult) {
          const returnQty = parseFloat(item.return_quantity) || 0;

          if (returnQty > 0) {
            logger.info(
              `扣减采购订单项目：订单ID=${orderId}, 物料ID=${item.material_id}, 退货数量=${returnQty}`
            );

            // ✅ 修复: 根据库存是否实际扣减（shouldDeductStock）来决定是否扣减已入库数量
            // 如果 shouldDeductStock 为 true，说明物料实际在库，需同时扣减 received_quantity 和 warehoused_quantity
            // 否则（未在库退回，或者仓库本身没货），只扣减 received_quantity
            if (shouldDeductStock) {
              const updateOrderItemQuery = `
                UPDATE purchase_order_items
                SET
                  received_quantity = received_quantity - ?,
                  warehoused_quantity = warehoused_quantity - ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ? AND material_id = ?
              `;

              await connection.query(updateOrderItemQuery, [
                returnQty, // 扣减已收货数量
                returnQty, // 扣减已入库数量
                orderId,
                item.material_id,
              ]);

              logger.info(
                `采购订单项目更新成功：已收货和已入库各扣减 ${returnQty} (物料已在库)`
              );
            } else {
              const updateOrderItemQuery = `
                UPDATE purchase_order_items
                SET
                  received_quantity = received_quantity - ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE order_id = ? AND material_id = ?
              `;

              await connection.query(updateOrderItemQuery, [
                returnQty, // 扣减已收货数量
                orderId,
                item.material_id,
              ]);

              logger.info(
                `采购订单项目更新成功：已收货扣减 ${returnQty},已入库保持不变 (物料未在库)`
              );
            }
          }
        }

        // 更新采购订单状态
        const PurchaseOrderStatusService = require('../../../services/business/PurchaseOrderStatusService');
        await PurchaseOrderStatusService.updateOrderStatus(orderId, connection);

        logger.info(`采购订单 ${orderId} 状态更新完成`);
      } else {
        logger.warn(`退货单 ${returnNo} 没有关联采购订单，跳过更新采购订单`);
      }
    }

    // 更新状态
    const updateQuery = `
      UPDATE purchase_returns
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    await connection.query(updateQuery, [newStatus, id]);

    await connection.commit();

    // 获取更新后的数据（事务已提交，使用全局pool可以读到最新数据）
    const updatedReturn = await getReturnById(id);

    // 采购退货完成后，异步生成应付红字发票（在事务提交后执行）
    if (newStatus === STATUS.PURCHASE_RETURN.COMPLETED) {
      setImmediate(async () => {
        try {
          const FinanceIntegrationService = require('../../../services/external/FinanceIntegrationService');

          // 获取完整的退货单信息
          const [returnData] = await pool.execute(
            `SELECT pr.*, s.name as supplier_name
             FROM purchase_returns pr
             LEFT JOIN suppliers s ON pr.supplier_id = s.id
             WHERE pr.id = ?`,
            [id]
          );

          if (returnData.length > 0) {
            const purchaseReturn = returnData[0];

            // 生成应付红字发票（Service 内部已有防重复检查）
            logger.info(
              `📄 采购退货完成，尝试自动生成应付红字发票 - 退货单: ${purchaseReturn.return_no}`
            );
            await FinanceIntegrationService.generateAPCreditNoteFromPurchaseReturn(
              purchaseReturn
            );
            logger.info(`✅ 应付红字发票自动生成成功 - 退货单: ${purchaseReturn.return_no}`);
          }
        } catch (invoiceError) {
          logger.warn(`⚠️ 应付红字发票自动生成失败（不影响退货）: ${invoiceError.message}`);
        }
      });
    }

    res.json(updatedReturn);
  } catch (error) {
    await connection.rollback();
    logger.error('更新采购退货状态失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 通过ID获取采购退货单（内部使用）
const getReturnById = async (id) => {
  // 获取退货单基本信息，关联供应商和仓库表获取名称，获取操作人真实姓名
  const query = `
    SELECT
      r.*,
      s.name as supplier_name,
      l.name as warehouse_name,
      (SELECT u.real_name FROM users u WHERE u.username = r.operator OR u.real_name = r.operator LIMIT 1) as real_name
    FROM purchase_returns r
    LEFT JOIN suppliers s ON r.supplier_id = s.id
    LEFT JOIN locations l ON r.warehouse_id = l.id
    WHERE r.id = ?
  `;
  const [result] = await pool.query(query, [id]);

  if (result.length === 0) {
    return null;
  }

  const returnData = result[0];

  // 处理操作人真实姓名
  returnData.operator_name = returnData.real_name || returnData.operator || '';

  // 获取退货单物料
  const itemsQuery = 'SELECT * FROM purchase_return_items WHERE return_id = ? ORDER BY id';
  const [itemsResult] = await pool.query(itemsQuery, [id]);

  returnData.items = itemsResult;

  return returnData;
};

// 获取采购退货统计信息
const getReturnStats = async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_count,
        COUNT(CASE WHEN status = '${STATUS.PURCHASE_RETURN.DRAFT}' THEN 1 ELSE NULL END) as draft_count,
        COUNT(CASE WHEN status = '${STATUS.PURCHASE_RETURN.CONFIRMED}' THEN 1 ELSE NULL END) as confirmed_count,
        COUNT(CASE WHEN status = '${STATUS.PURCHASE_RETURN.COMPLETED}' THEN 1 ELSE NULL END) as completed_count,
        COUNT(CASE WHEN status = '${STATUS.PURCHASE_RETURN.CANCELLED}' THEN 1 ELSE NULL END) as cancelled_count,
        IFNULL(SUM(total_amount), 0) as total_amount
      FROM purchase_returns
    `;

    const [statsResult] = await pool.query(statsQuery);

    // 计算本月和上月的退货总额
    const currentMonthQuery = `
      SELECT IFNULL(SUM(total_amount), 0) as current_month_amount
      FROM purchase_returns
      WHERE return_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
        AND return_date < DATE_FORMAT(DATE_ADD(CURRENT_DATE, INTERVAL 1 MONTH), '%Y-%m-01')
    `;

    const lastMonthQuery = `
      SELECT IFNULL(SUM(total_amount), 0) as last_month_amount
      FROM purchase_returns
      WHERE return_date >= DATE_FORMAT(DATE_SUB(CURRENT_DATE, INTERVAL 1 MONTH), '%Y-%m-01')
        AND return_date < DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')
    `;

    const [currentMonthResult] = await pool.query(currentMonthQuery);
    const [lastMonthResult] = await pool.query(lastMonthQuery);

    const stats = {
      totalCount: parseInt(statsResult[0].total_count) || 0,
      draftCount: parseInt(statsResult[0].draft_count) || 0,
      confirmedCount: parseInt(statsResult[0].confirmed_count) || 0,
      completedCount: parseInt(statsResult[0].completed_count) || 0,
      cancelledCount: parseInt(statsResult[0].cancelled_count) || 0,
      totalAmount: parseFloat(statsResult[0].total_amount) || 0,
      currentMonthAmount: parseFloat(currentMonthResult[0].current_month_amount) || 0,
      lastMonthAmount: parseFloat(lastMonthResult[0].last_month_amount) || 0,
    };

    res.json(stats);
  } catch (error) {
    logger.error('获取采购退货统计信息失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

module.exports = {
  getReturns,
  getReturn,
  createReturn,
  updateReturn,
  updateReturnStatus,
  getReturnStats,
};
