/**
 * salesReturnController.js
 * @description 销售退货控制器
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { softDelete } = require('../../../utils/softDelete');

// ✅ DRY修复：从 salesShared.js 统一导入，不再重复定义
const { STATUS, getConnection, getConnectionWithTransaction, generateTransactionNo } = require('./salesShared');

// 添加新的控制器方法
exports.getSalesReturns = async (req, res) => {
  let conn;
  try {
    const { page = 1, pageSize = 10, search, startDate, endDate, status } = req.query;
    const offset = (page - 1) * pageSize;

    conn = await getConnection();

    // 构建查询条件
    let whereClause = '';
    const queryParams = [];

    if (search) {
      whereClause += ' AND (sr.return_no LIKE ? OR c.name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (startDate) {
      whereClause += ' AND sr.return_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND sr.return_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      whereClause += ' AND sr.status = ?';
      queryParams.push(status);
    }

    // 鏌ヨ鎬绘暟
    const countQuery = `
      SELECT COUNT(*) as total
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1 = 1 ${whereClause}
      `;

    const [countResult] = await conn.query(countQuery, queryParams);
    const total = countResult[0].total;

    // 鏌ヨ鏁版嵁
    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = parseInt(pageSize);
    const actualOffset = parseInt(offset);
    const query = `
      SELECT sr.*, c.name AS customer_name, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE 1 = 1 ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT ${actualPageSize} OFFSET ${actualOffset}
      `;

    const [results] = await conn.query(query, queryParams);

    // 获取状态明细
    for (let i = 0; i < results.length; i++) {
      const returnItem = results[i];

      // 保留英文状态 key，添加中文标签供前端展示
      const statusLabelMap = {
        draft: '草稿',
        pending: '',
        approved: '',
        completed: '',
        rejected: '',
      };
      results[i].status_label = statusLabelMap[returnItem.status] || returnItem.status;

      const detailsQuery = `
      SELECT
      sri.*,
        m.code as material_code,
        m.code as productCode,
        m.name as material_name,
        m.name as productName,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(soi.unit_price, m.price, 0) as unit_price,
        ROUND(sri.quantity * COALESCE(soi.unit_price, m.price, 0), 2) as amount
        FROM sales_return_items sri
        LEFT JOIN materials m ON sri.product_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        LEFT JOIN sales_order_items soi ON soi.order_id = ? AND soi.material_id = sri.product_id
        WHERE sri.return_id = ?
        `;

      const [detailsResults] = await conn.query(detailsQuery, [returnItem.order_id, returnItem.id]);
      results[i].items = detailsResults;

      // 汇总退货总额
      results[i].total_amount = detailsResults.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    }

    // 统计不同状态的数量
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM sales_returns
      GROUP BY status
        `;

    const [statusCounts] = await conn.query(statusQuery);

    // 格式化状态数据
    const statusStats = {
      total: total,
      draftCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      completedCount: 0,
      rejectedCount: 0,
    };

    statusCounts.forEach((item) => {
      if (item.status === STATUS.SALES_RETURN.DRAFT) statusStats.draftCount = item.count;
      if (item.status === STATUS.SALES_RETURN.PENDING) statusStats.pendingCount = item.count;
      if (item.status === STATUS.SALES_RETURN.APPROVED) statusStats.approvedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.COMPLETED) statusStats.completedCount = item.count;
      if (item.status === STATUS.SALES_RETURN.REJECTED) statusStats.rejectedCount = item.count;
    });

    res.json({
      items: results,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      statusStats,
    });
  } catch (error) {
    logger.error('获取销售退货单列表失败:', error);
    ResponseHandler.error(res, '获取销售退货单列表失败', 'SERVER_ERROR', 500);
  } finally {
    if (conn) conn.release();
  }
};


exports.getSalesReturnById = async (req, res) => {
  let conn;
  try {
    const { id } = req.params;

    conn = await getConnection();

    // 查询退货单主信息
    const query = `
      SELECT sr.*, c.name as customer_name, c.contact_person, c.contact_phone, o.order_no
      FROM sales_returns sr
      LEFT JOIN sales_orders o ON sr.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE sr.id = ?
        `;

    const [returnResults] = await conn.query(query, [id]);

    if (returnResults.length === 0) {
      return ResponseHandler.notFound(res, 'Data not found');
    }

    const returnData = returnResults[0];

    // 查询退货单明细
    const detailsQuery = `
      SELECT
      sri.*,
        m.code as material_code,
        m.code as productCode,
        m.name as material_name,
        m.name as productName,
        m.specs as specification,
        u.name as unit_name,
        COALESCE(soi.unit_price, m.price, 0) as unit_price,
        ROUND(sri.quantity * COALESCE(soi.unit_price, m.price, 0), 2) as amount
      FROM sales_return_items sri
      LEFT JOIN materials m ON sri.product_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      LEFT JOIN sales_order_items soi ON soi.order_id = ? AND soi.material_id = sri.product_id
      WHERE sri.return_id = ?
        `;

    const [detailsResults] = await conn.query(detailsQuery, [returnData.order_id, id]);

    // 淇濈暀鑻辨枃鐘舵€?key锛屾坊鍔犱腑鏂囨爣绛句緵鍓嶇灞曠ず
    const statusLabelMap = {
      draft: '草稿',
      pending: '',
      approved: '',
      completed: '',
      rejected: '',
    };
    returnData.status_label = statusLabelMap[returnData.status] || returnData.status;

    // 组合结果
    returnData.items = detailsResults;
    returnData.total_amount = detailsResults.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

    res.json(returnData);
  } catch (error) {
    logger.error('获取销售退货单详情失败:', error);
    ResponseHandler.error(res, '获取销售退货单详情失败', 'SERVER_ERROR', 500);
  } finally {
    if (conn) conn.release();
  }
};


exports.createSalesReturn = async (req, res) => {
  let connection;
  try {
    const {
      return_date,
      order_id,
      outbound_id,
      outbound_no,
      order_no,
      customer_name,
      return_reason,
      status,
      remarks,
      items,
    } = req.body;

    // 验证必要参数（支持基于出库单或订单的退货）
    if (!return_date || !return_reason) {
      return ResponseHandler.error(res, 'Data not found', 'BAD_REQUEST', 400);
    }

    if (!outbound_id && !order_id) {
      return ResponseHandler.error(res, '必须指定出库单ID或订单ID', 'BAD_REQUEST', 400);
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return ResponseHandler.error(res, 'Data not found', 'BAD_REQUEST', 400);
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // 生成退货单号 RT + 年月日 + 3位序号
    const date = new Date();
    const dateStr =
      date.getFullYear() +
      ('0' + (date.getMonth() + 1)).slice(-2) +
      ('0' + date.getDate()).slice(-2);

    // 查询当天最大序号
    const [seqResult] = await connection.query(
      'SELECT MAX(SUBSTRING(return_no, 11)) as max_seq FROM sales_returns WHERE return_no LIKE ?',
      [`RT${dateStr}%`]
    );

    const seq = seqResult[0].max_seq ? parseInt(seqResult[0].max_seq) + 1 : 1;
    const returnNo = `RT${dateStr}${seq.toString().padStart(3, '0')}`;

    // 如果是基于出库单的退货，需要获取订单信息
    let finalOrderId = order_id;
    if (outbound_id && !order_id) {
      const [outboundResult] = await connection.query(
        'SELECT order_id FROM sales_outbound WHERE id = ?',
        [outbound_id]
      );
      if (outboundResult.length > 0) {
        finalOrderId = outboundResult[0].order_id;
      }
    }

    // 【新增】超额退货防范机制，严格校验累退货数量不得超过原订单购买数量
    if (finalOrderId && items && items.length > 0) {
      for (const item of items) {
        const productId = item.product_id;
        const returnQty = parseFloat(item.quantity) || 0;

        // 鑾峰彇璁㈠崟鍘熷璐拱鏁伴噺
        const [orderItemResult] = await connection.query(
          'SELECT quantity FROM sales_order_items WHERE order_id = ? AND material_id = ?',
          [finalOrderId, productId]
        );

        if (orderItemResult.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, 'Data not found', 'BAD_REQUEST', 400);
        }

        const maxOrderQty = parseFloat(orderItemResult[0].quantity) || 0;

        // 汇总该订单下此物料的所有历史有效退货记录（排除已被拦截和作废的记录）
        const [historicalReturn] = await connection.query(
          `SELECT SUM(sri.quantity) as total_returned
           FROM sales_return_items sri
           JOIN sales_returns sr ON sri.return_id = sr.id
           WHERE sr.order_id = ? AND sri.product_id = ? AND sr.status NOT IN ('rejected', 'cancelled')`,
          [finalOrderId, productId]
        );

        const alreadyReturnedQty = parseFloat(historicalReturn[0].total_returned) || 0;
        const maxReturnableQty = Math.max(0, maxOrderQty - alreadyReturnedQty);

        if (returnQty > maxReturnableQty) {
          await connection.rollback();
          return res.status(400).json({ error: `退货数量超限阻止！原订单总购件数：${maxOrderQty}，历史已退累件数：${alreadyReturnedQty}。本次您最多只能申请退回余数：${maxReturnableQty}件。` });
        }
      }
    }

    // 插入退货单主表
    const insertQuery = `
      INSERT INTO sales_returns(
          return_no, order_id, return_date, return_reason,
          status, remarks, created_by, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, NOW())
          `;

    const created_by = req.user?.userId || req.user?.id || 1;

    const [result] = await connection.query(insertQuery, [
      returnNo,
      finalOrderId,
      return_date,
      return_reason,
      status || 'pending',
      remarks,
      created_by,
    ]);

    const returnId = result.insertId;

    // 插入明细行
    if (items && items.length > 0) {
      const detailQuery = `
        INSERT INTO sales_return_items(
            return_id, product_id, quantity, reason
          ) VALUES ?
            `;

      const detailValues = items.map((item) => [
        returnId,
        item.product_id,
        item.quantity,
        item.reason || '',
      ]);

      await connection.query(detailQuery, [detailValues]);
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '销售退货单创建成功',
        id: returnId,
        return_no: returnNo,
      },
      '创建成功',
      201
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('创建销售退货单失败:', error);
    ResponseHandler.error(res, '创建销售退货单失败', 'SERVER_ERROR', 500);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


exports.updateSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { return_date, order_id, return_reason, status, remarks, items } = req.body;

    connection = await getConnection();
    await connection.beginTransaction();

    // 如果是基于出库单的退货，需要获取订单信息
    let finalOrderId = order_id;
    // 如果前端只传了 outbound_id 没有 order_id（虽然前端有控制，但也防范一下）
    // 或者直接使用原数据库记录的 order_id

    // 【新增】超额退货防范机制
     if (finalOrderId && items && items.length > 0) {
      for (const item of items) {
        const productId = item.product_id;
        const returnQty = parseFloat(item.quantity) || 0;

        // 鑾峰彇璁㈠崟鍘熷璐拱鏁伴噺
        const [orderItemResult] = await connection.query(
          'SELECT quantity FROM sales_order_items WHERE order_id = ? AND material_id = ?',
          [finalOrderId, productId]
        );

        if (orderItemResult.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '数据异常：原订单中不存在您要修改的产品！', 'BAD_REQUEST', 400);
        }

        const maxOrderQty = parseFloat(orderItemResult[0].quantity) || 0;

        // 汇总该订单下此物料的所有历史有效退货记录（排除当前正在修改的退货单以及作废单）
        const [historicalReturn] = await connection.query(
          `SELECT SUM(sri.quantity) as total_returned
           FROM sales_return_items sri
           JOIN sales_returns sr ON sri.return_id = sr.id
           WHERE sr.order_id = ? AND sri.product_id = ? 
             AND sr.id != ? 
             AND sr.status NOT IN ('rejected', 'cancelled')`,
          [finalOrderId, productId, id]
        );

        const alreadyReturnedQty = parseFloat(historicalReturn[0].total_returned) || 0;
        const maxReturnableQty = Math.max(0, maxOrderQty - alreadyReturnedQty);

        if (returnQty > maxReturnableQty) {
          await connection.rollback();
          return res.status(400).json({ error: `修改数量超限阻止！原订单总购件数：${maxOrderQty}，除当前单外历史已退件数：${alreadyReturnedQty}。本次您最多只能将件数修改为：${maxReturnableQty}件。` });
        }
      }
    }

    // 更新主表
    const updateQuery = `
      UPDATE sales_returns SET
      return_date = ?,
        order_id = ?,
        return_reason = ?,
        status = ?,
        remarks = ?,
        updated_at = NOW()
      WHERE id = ?
        `;

    await connection.query(updateQuery, [
      return_date,
      order_id,
      return_reason,
      status,
      remarks,
      id,
    ]);

    // 删除原有明细
    await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);

    // 插入新明细
    if (items && items.length > 0) {
      const detailQuery = `
        INSERT INTO sales_return_items(
          return_id, product_id, quantity, reason
        ) VALUES ?
          `;

      const detailValues = items.map((item) => [
        id,
        item.product_id,
        item.quantity,
        item.reason || '',
      ]);

      await connection.query(detailQuery, [detailValues]);
    }

    // 濡傛灉鐘舵€佸彉涓哄凡瀹屾垚锛屽鐞嗗簱瀛樺叆搴?
     if (status === STATUS.SALES_RETURN.COMPLETED && items && items.length > 0) {
      for (const item of items) {
        // 鍏煎涓嶅悓鐨勫瓧娈靛悕
        const productId = item.product_id || item.productId || item.material_id;
        const quantity = item.quantity || item.return_quantity;

        if (!productId || !quantity) {
          continue;
        }

        // 获取物料信息、单位和默认仓库
        const [materialResults] = await connection.query(
          `
          SELECT m.code, m.name, m.unit_id, m.location_id, m.location_name,
        u.name as unit_name, loc.name as warehouse_name
          FROM materials m
          LEFT JOIN units u ON m.unit_id = u.id
          LEFT JOIN locations loc ON m.location_id = loc.id
          WHERE m.id = ?
        `,
          [productId]
        );

        if (materialResults.length > 0) {
          const material = materialResults[0];

          // 使用物料的默认仓库，如果没有则强制抛错终止业务
          const warehouseId = material.location_id;
          if (!warehouseId) {
            throw new Error(`物料 ${productId} 未配置默认仓库，请在物料资料中设置后再操作。`);
          }
          const warehouseName = material.warehouse_name || material.location_name || '';

          // 获取当前库存（使用单表架构，参考采购退货逻辑）
          const [stockResult] = await connection.query(
            `
            SELECT COALESCE(SUM(quantity), 0) as current_quantity
            FROM inventory_ledger
            WHERE material_id = ? AND location_id = ? FOR UPDATE
        `,
            [productId, warehouseId]
          );

          const beforeQuantity = parseFloat(stockResult[0]?.current_quantity || 0);
          const changeQuantity = parseFloat(quantity);
          const afterQuantity = beforeQuantity + changeQuantity;

          // 获取物料单位ID
          const unitId = material.unit_id;

          // 获取当前退货单的正确编号
          const [returnInfo] = await connection.query(
            'SELECT return_no FROM sales_returns WHERE id = ?',
            [id]
          );
          const actualReturnNo = returnInfo[0]?.return_no || `RT${id} `;

          // 使用统一的 InventoryService 更新库存
          const InventoryService = require('../../../services/InventoryService');
          await InventoryService.updateStock(
            {
              materialId: productId,
              locationId: warehouseId,
              quantity: changeQuantity, // 退货为正数（入库）
              transactionType: 'sales_return',
              referenceNo: actualReturnNo,
              referenceType: 'sales_return',
              operator: 'system',
              remark: `销售退货入库：${material.code} ${material.name}`,
              unitId: material.unit_id,
              batchNumber: `RT-${actualReturnNo}-${productId}`,
            },
            connection
          );

          logger.info(`✅ 销售退货入库完成（统一服务） 物料${productId}, 数量${changeQuantity}`);
        }
      }

      // 退货单库存处理完成

      // 获取退货单信息用于生成红字发票
      const [returnInfo] = await connection.query('SELECT * FROM sales_returns WHERE id = ?', [id]);

      // 退货单库存处理完成
      // 缓存退货信息，commit 后异步生成红字发票
      let pendingReturnForFinance = null;
      if (returnInfo.length > 0) {
        pendingReturnForFinance = returnInfo[0];
      }
    }

    await connection.commit();

    // 在事务 commit 之后异步生成红字发票
    if (pendingReturnForFinance) {
      setImmediate(async () => {
        try {
          const FinanceIntegrationService = require('../../../services/external/FinanceIntegrationService');
          await FinanceIntegrationService.generateARCreditNoteFromSalesReturn(pendingReturnForFinance);
          logger.info(`✅ 销售退货红字发票自动生成成功 - 退货单: ${pendingReturnForFinance.return_no}`);
        } catch (financeError) {
          logger.warn(`⚠️ 销售退货红字发票自动生成失败（不影响退货）: ${financeError.message}`);
        }
      });
    }

    res.json({
      message: '销售退货单更新成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新销售退货单失败:', error);
    ResponseHandler.error(res, '更新销售退货单失败', 'SERVER_ERROR', 500);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 删除退货单功能

exports.deleteSalesReturn = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 删除明细
    await connection.query('DELETE FROM sales_return_items WHERE return_id = ?', [id]);

    // 删除主表
    // ✅ 软删除退货单主表
    await softDelete(connection, 'sales_returns', 'id', id);

    await connection.commit();

    res.json({
      message: '销售退货单删除成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售退货单失败:', error);
    ResponseHandler.error(res, '删除销售退货单失败', 'SERVER_ERROR', 500);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Sales Exchange Controllers

