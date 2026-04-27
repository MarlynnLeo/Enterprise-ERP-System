/**
 * salesOutboundController.js
 * @description 销售出库控制器
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const { softDelete } = require('../../../utils/softDelete');
const SalesOrderStatusService = require('../../../services/business/SalesOrderStatusService');
const DBManager = require('../../../utils/dbManager');
const { getCurrentUserName } = require('../../../utils/userHelper');

// ✅ DRY修复：从 salesShared.js 统一导入，不再重复定义
const { STATUS, getConnection, getConnectionWithTransaction, generateSalesOutboundNo, generateTransactionNo } = require('./salesShared');

// 添加新的控制器方法

exports.getSalesOutbound = async (req, res) => {
  try {
    const { page = 1, pageSize = 50, search, startDate, endDate, status } = req.query;
    const offset = (page - 1) * pageSize;

    const connection = await db.pool.getConnection();

    try {
      // 构建查询条件
      let whereClause = '';
      const queryParams = [];

      if (search) {
        whereClause += ' AND (so.outbound_no LIKE ? OR o.order_no LIKE ? OR c.name LIKE ?)';
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (startDate) {
        whereClause += ' AND so.delivery_date >= ?';
        queryParams.push(startDate);
      }

      if (endDate) {
        whereClause += ' AND so.delivery_date <= ?';
        queryParams.push(endDate);
      }

      if (status) {
        whereClause += ' AND so.status = ?';
        queryParams.push(status);
      }

      // 查询总数
      const countQuery = `
        SELECT COUNT(*) as total
        FROM sales_outbound so
        LEFT JOIN sales_orders o ON so.order_id = o.id
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE 1=1 ${whereClause}
      `;

      const [countResult] = await connection.query(countQuery, queryParams);
      const total = parseInt(countResult[0].total) || 0;

      // 查询数据
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const actualPageSize = parseInt(pageSize);
      const actualOffset = parseInt(offset);
      const query = `
        SELECT so.*, o.order_no, o.contract_code, o.customer_id, c.name as customer_name
        FROM sales_outbound so
        LEFT JOIN sales_orders o ON so.order_id = o.id
        LEFT JOIN customers c ON o.customer_id = c.id
        WHERE 1=1 ${whereClause}
        ORDER BY so.created_at DESC
        LIMIT ${actualPageSize} OFFSET ${actualOffset}
      `;

      const [results] = await connection.query(query, queryParams);

      // 处理多订单出库的客户信息和关联订单信息
      for (const outbound of results) {
        if (outbound.is_multi_order && outbound.related_orders) {
          let relatedOrderIds = [];

          try {
            // 解析关联订单ID
            if (typeof outbound.related_orders === 'string') {
              relatedOrderIds = JSON.parse(outbound.related_orders);
            } else {
              relatedOrderIds = outbound.related_orders;
            }

            if (relatedOrderIds.length > 0) {
              // 查询关联订单信息
              const [relatedOrders] = await connection.query(
                `
                SELECT so.id, so.order_no, c.name as customer_name
                FROM sales_orders so
                LEFT JOIN customers c ON so.customer_id = c.id
                WHERE so.id IN (?)
              `,
                [relatedOrderIds]
              );

              outbound.related_order_details = relatedOrders;
              outbound.order_nos = relatedOrders.map((order) => order.order_no).join(', ');

              // 统一客户名称（如果所有订单都是同一客户）
              const customerNames = [
                ...new Set(relatedOrders.map((o) => o.customer_name).filter((n) => n)),
              ];
              if (customerNames.length === 1) {
                outbound.customer_name = customerNames[0];
              } else if (customerNames.length > 1) {
                outbound.customer_name = `多个客户 (${customerNames.length}个)`;
              }
            }
          } catch (error) {
            logger.error('处理多订单出库信息失败:', error);
          }
        }
      }

      // 统计不同状态的数量
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM sales_outbound
        GROUP BY status
      `;

      const [statusCounts] = await connection.query(statusQuery);


      // 格式化状态统计数据
      const statusStats = {
        total: total,
        pendingCount: 0,
        processingCount: 0,
        completedCount: 0,
        cancelledCount: 0,
      };

      statusCounts.forEach((item) => {
        if (item.status === STATUS.EXCHANGE.PENDING) statusStats.pendingCount = item.count;
        if (item.status === STATUS.EXCHANGE.PROCESSING) statusStats.processingCount = item.count;
        if (item.status === STATUS.EXCHANGE.COMPLETED) statusStats.completedCount = item.count;
        if (item.status === STATUS.EXCHANGE.CANCELLED) statusStats.cancelledCount = item.count;
      });

      ResponseHandler.success(
        res,
        {
          list: results,
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          statusStats,
        },
        '获取销售出库单成功'
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取销售出库单列表失败:', error);
    ResponseHandler.error(res, '获取销售出库单列表失败', 'SERVER_ERROR', 500);
  }
};


exports.getSalesOutboundById = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();

    // 查询出库单主信息
    const query = `
      SELECT so.*, o.order_no, o.contract_code, o.customer_id, c.name as customer_name, c.contact_person, c.contact_phone
      FROM sales_outbound so
      LEFT JOIN sales_orders o ON so.order_id = o.id
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE so.id = ?
    `;

    const [results] = await connection.query(query, [id]);

    if (results.length === 0) {
      return ResponseHandler.notFound(res, '出库单不存在');
    }

    const outbound = results[0];

    // 查询销售出库单明细
    try {

      // 查询明细数据
      const itemsQuery = `
        SELECT soi.id, soi.outbound_id, soi.product_id, soi.quantity
        FROM sales_outbound_items soi
        WHERE soi.outbound_id = ?
      `;

      const [itemsResult] = await connection.query(itemsQuery, [id]);


      // 如果有明细数据，查询相应的物料信息
      if (itemsResult.length > 0) {
        // 提取所有物料ID
        const materialIds = itemsResult.map((item) => item.product_id);

        // 查询物料信息
        const materialsQuery = `
          SELECT id, code, name, specs, unit_id
          FROM materials
          WHERE id IN (?)
        `;

        const [materialsResult] = await connection.query(materialsQuery, [materialIds]);

        // 查询单位信息
        const unitIds = materialsResult
          .map((m) => m.unit_id)
          .filter((id) => id !== null && id !== undefined);

        let unitsResult = [];
        if (unitIds.length > 0) {
          const unitsQuery = `
            SELECT id, name
            FROM units
            WHERE id IN (?)
          `;

          [unitsResult] = await connection.query(unitsQuery, [unitIds]);
        }

        // 查询该订单下各物料的历史已退数量（排除已拒绝和已取消的退货单）
        let returnedMap = new Map();
        if (outbound.order_id) {
          const [returnedRows] = await connection.query(
            `SELECT sri.product_id, SUM(sri.quantity) AS total_returned
             FROM sales_return_items sri
             JOIN sales_returns sr ON sri.return_id = sr.id
             WHERE sr.order_id = ? AND sr.status NOT IN ('rejected', 'cancelled')
             GROUP BY sri.product_id`,
            [outbound.order_id]
          );
          returnedRows.forEach(row => {
            returnedMap.set(row.product_id, parseFloat(row.total_returned) || 0);
          });
        }

        // 组装完整的明细数据
        const items = itemsResult.map((item) => {
          const material = materialsResult.find((m) => m.id === item.product_id) || {};
          const unit = material.unit_id ? unitsResult.find((u) => u.id === material.unit_id) : null;
          const returnedQty = returnedMap.get(item.product_id) || 0;

          return {
            id: item.id,
            outbound_id: item.outbound_id,
            product_id: item.product_id,
            quantity: item.quantity,
            returned_quantity: returnedQty,
            returnable_quantity: Math.max(0, item.quantity - returnedQty),
            material_name: material.name,
            material_code: material.code,
            specification: material.specs,
            unit_name: unit ? unit.name : null,
            unit_id: material.unit_id,
          };
        });

        // 转换字段名称保持兼容性
        const formattedItems = items.map((item) => ({
          id: item.id,
          outbound_id: item.outbound_id,
          product_id: item.product_id,
          quantity: item.quantity,
          returned_quantity: item.returned_quantity,
          returnable_quantity: item.returnable_quantity,
          product_name: item.material_name || `未知物料(ID:${item.product_id})`,
          product_code: item.material_code || '未知代码',
          specification: item.specification || '无规格信息',
          unit: item.unit_name || '未知单位',
        }));

        outbound.items = formattedItems;
      } else {
        outbound.items = [];
      }

      // 处理多订单关联信息
      if (outbound.is_multi_order && outbound.related_orders) {
        try {
          let relatedOrderIds = [];
          const rawValue = outbound.related_orders;

          // 处理不同类型的数据
          if (typeof rawValue === 'string') {
            // 尝试直接JSON解析
            try {
              relatedOrderIds = JSON.parse(rawValue);
            } catch (jsonError) {
              // 如果JSON解析失败，尝试解析逗号分隔的ID列表
              logger.info('JSON解析失败，尝试解析逗号分隔的ID:', rawValue);
              relatedOrderIds = rawValue
                .split(',')
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            }
          } else if (Array.isArray(rawValue)) {
            relatedOrderIds = rawValue;
          } else if (Buffer.isBuffer(rawValue)) {
            // 处理Buffer类型
            const stringValue = rawValue.toString('utf8');
            try {
              relatedOrderIds = JSON.parse(stringValue);
            } catch (jsonError) {
              relatedOrderIds = stringValue
                .split(',')
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            }
          } else {
            // 其他类型，尝试转换为字符串处理
            const stringValue = String(rawValue);
            try {
              relatedOrderIds = JSON.parse(stringValue);
            } catch (jsonError) {
              relatedOrderIds = stringValue
                .split(',')
                .map((id) => parseInt(id.trim()))
                .filter((id) => !isNaN(id));
            }
          }

          if (relatedOrderIds.length > 0) {
            // 查询关联订单信息
            const [relatedOrders] = await connection.query(
              `
              SELECT so.id, so.order_no, c.name as customer_name
              FROM sales_orders so
              LEFT JOIN customers c ON so.customer_id = c.id
              WHERE so.id IN (?)
            `,
              [relatedOrderIds]
            );

            outbound.related_order_details = relatedOrders;
            outbound.order_nos = relatedOrders.map((order) => order.order_no).join(', ');

            // 统一客户名称（如果所有订单都是同一客户）
            const customerNames = [
              ...new Set(relatedOrders.map((o) => o.customer_name).filter((n) => n)),
            ];
            if (customerNames.length === 1) {
              outbound.customer_name = customerNames[0];
            } else if (customerNames.length > 1) {
              outbound.customer_name = `多个客户 (${customerNames.length}个)`;
            }
          }
        } catch (error) {
          logger.error('解析关联订单信息失败:', error, '原始值:', outbound.related_orders);
          outbound.related_order_details = [];
          outbound.order_nos = '';
        }
      } else if (outbound.order_no) {
        // 单订单情况
        outbound.order_nos = outbound.order_no;
        outbound.related_order_details = [
          {
            id: outbound.order_id,
            order_no: outbound.order_no,
            customer_name: outbound.customer_name,
          },
        ];
      }

      res.json(outbound);
    } catch (error) {
      throw error;
    }
  } catch (error) {
    logger.error('获取销售出库单详情失败:', error);
    ResponseHandler.error(res, '获取销售出库单详情失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};



exports.createSalesOutbound = async (req, res) => {
  let connection;

  try {
    const {
      order_id,
      related_orders: rawRelatedOrders = [],
      is_multi_order = false,
      delivery_date,
      status,
      remarks,
      items = [],
    } = req.body;

    // 处理related_orders参数，支持JSON字符串或数组
    let related_orders = [];
    if (typeof rawRelatedOrders === 'string') {
      try {
        related_orders = JSON.parse(rawRelatedOrders);
      } catch (error) {
        logger.error('解析related_orders JSON失败:', error);
        return ResponseHandler.error(res, '无效的关联订单格式', 'BAD_REQUEST', 400);
      }
    } else if (Array.isArray(rawRelatedOrders)) {
      related_orders = rawRelatedOrders;
    }
    const created_by = req.user?.userId || req.user?.id || 1;

    logger.info(
      '销售出库单创建请求:',
      JSON.stringify(
        {
          order_id,
          related_orders,
          is_multi_order,
          delivery_date,
          status,
          remarks,
          items_count: items?.length || 0,
        },
        null,
        2
      )
    );

    // 验证日期格式转换
    let formattedDeliveryDate;
    try {
      // 支持ISO格式日期或标准日期字符串
      if (delivery_date) {
        formattedDeliveryDate = new Date(delivery_date).toISOString().split('T')[0];
      } else {
        formattedDeliveryDate = new Date().toISOString().split('T')[0];
      }
    } catch (error) {
      logger.error('日期格式转换错误:', error);
      return ResponseHandler.error(res, '无效的日期格式', 'BAD_REQUEST', 400);
    }

    connection = await DBManager.getConnection();
    await connection.beginTransaction();

    // 🔒 业务规则检查：防止重复创建草稿出库单
    // 策略：只要该订单存在状态为'draft'的出库单，就不允许创建新的
    // 目的：确保每个订单同一时间只有一个待处理的出库单，避免重复操作
    const duplicateCheckQuery = `
      SELECT id, outbound_no, status, created_at
      FROM sales_outbound
      WHERE order_id = ?
        AND status = 'draft'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const [recentDrafts] = await connection.query(duplicateCheckQuery, [order_id]);

    if (recentDrafts.length > 0) {
      await connection.rollback();

      logger.warn('🔒 业务检查：检测到已存在草稿出库单，拒绝创建', {
        order_id,
        existing_outbound: recentDrafts[0].outbound_no,
        existing_status: recentDrafts[0].status,
        created_at: recentDrafts[0].created_at,
        request_user: created_by,
        reason: '已存在草稿出库单',
      });

      return res.status(409).json({
        success: false,
        error: `该订单已存在草稿状态的出库单 ${recentDrafts[0].outbound_no}。请先完成或取消现有出库单，才能创建新的出库单。`,
        code: 'DUPLICATE_DRAFT_EXISTS',
        existing_outbound_no: recentDrafts[0].outbound_no,
      });
    }

    logger.info('✅ 幂等性检查通过，开始创建出库单', { order_id, created_by });

    // 验证订单存在性
    if (is_multi_order) {
      // 多订单模式：验证所有关联订单存在
      if (!related_orders || related_orders.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '多订单模式下必须提供关联订单列表', 'BAD_REQUEST', 400);
      }

      const [orderCheck] = await connection.query(
        'SELECT id, order_no, customer_id FROM sales_orders WHERE id IN (?)',
        [related_orders]
      );

      if (orderCheck.length !== related_orders.length) {
        await connection.rollback();
        return ResponseHandler.error(res, '部分关联订单不存在', 'BAD_REQUEST', 400);
      }

      // 检查是否所有订单属于同一客户（可选验证）
      const customerIds = [...new Set(orderCheck.map((order) => order.customer_id))];
      if (customerIds.length > 1) {
        logger.warn('警告：多订单出库涉及不同客户，请确认业务逻辑');
      }
    } else {
      // 单订单模式：验证单个订单存在
      if (order_id) {
        const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id = ?', [
          order_id,
        ]);

        if (orderCheck.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '关联的订单不存在', 'BAD_REQUEST', 400);
        }
      }
    }

    // 生成出库单编号
    const outboundNo = await generateSalesOutboundNo(connection);

    // 插入出库单主表
    const insertQuery = `
      INSERT INTO sales_outbound (
        outbound_no, order_id, is_multi_order, related_orders,
        delivery_date, status, remarks, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await connection.query(insertQuery, [
      outboundNo,
      is_multi_order ? null : order_id,
      is_multi_order,
      is_multi_order ? JSON.stringify(related_orders) : null,
      formattedDeliveryDate,
      status || 'draft',
      remarks,
      created_by,
    ]);

    const outboundId = result.insertId;

    // 插入明细表
    if (items && items.length > 0) {
      // 验证物料是否存在于materials表中
      const materialIds = items.map((item) => item.material_id || item.product_id).filter(Boolean);

      if (materialIds.length > 0) {
        try {
          // 安全处理IN查询，当只有一个ID时，直接使用等于
          let materialsQuery;
          let materialsParams;

          if (materialIds.length === 1) {
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id = ?';
            materialsParams = [materialIds[0]];
          } else {
            materialsQuery = 'SELECT id, code, name FROM materials WHERE id IN (?)';
            materialsParams = [materialIds];
          }


          const [materialCheck] = await connection.query(materialsQuery, materialsParams);

          const validMaterialIds = materialCheck.map((m) => m.id);

          // 查找无效的物料ID
          const invalidMaterialIds = materialIds.filter((id) => !validMaterialIds.includes(id));
          if (invalidMaterialIds.length > 0) {
          }

          // 过滤出有效的物料项
          const validItems = items.filter((item) => {
            const materialId = item.material_id || item.product_id;
            return validMaterialIds.includes(materialId);
          });

          if (validItems.length === 0) {
          } else {
            // 插入出库单明细
            try {
              const detailQuery = `
                INSERT INTO sales_outbound_items (
                  outbound_id, product_id, quantity, price, amount, source_order_id, source_order_no
                ) VALUES ?
              `;

              const detailValues = [];

              // 预加载订单明细的单价映射（防止前端不传价格导致 price=0）
              let orderPriceMap = {};
              const sourceOrderId = items[0]?.source_order_id || items[0]?.order_id || order_id;
              if (sourceOrderId) {
                const [orderItems] = await connection.query(
                  'SELECT material_id, unit_price FROM sales_order_items WHERE order_id = ?',
                  [sourceOrderId]
                );
                orderItems.forEach(oi => { orderPriceMap[oi.material_id] = parseFloat(oi.unit_price) || 0; });
              }

              for (const item of validItems) {
                const materialId = item.material_id || item.product_id;
                const material = materialCheck.find((m) => m.id === materialId);
                // 从前端传入 → 订单明细单价 → 物料基础价格（三级回退）
                let unitPrice = parseFloat(item.unit_price || item.price || 0);
                if (unitPrice === 0) {
                  unitPrice = orderPriceMap[materialId] || 0;
                }
                const amount = parseFloat(item.quantity || 0) * unitPrice;

                // 确保这里推入数组的值顺序和上方列名完全一致
                detailValues.push([
                  outboundId,
                  materialId,
                  item.quantity,
                  unitPrice,
                  amount,
                  item.source_order_id || item.order_id || null,
                  item.source_order_no || item.order_no || null,
                ]);
              }

              if (detailValues.length > 0) {
                try {
                  await connection.query(detailQuery, [detailValues]);
                } catch (insertError) {
                  logger.error('插入明细数据失败:', insertError);
                  throw new Error('插入明细数据失败: ' + insertError.message);
                }
              }
            } catch (error) {
              throw error;
            }
          }
        } catch (error) {
          logger.error('验证物料ID或插入明细时出错:', error);
          throw new Error(`验证物料ID或插入明细时出错: ${error.message}`);
        }
      } else {
      }
    }

    // 自动创建单据关联（销售订单 → 出库单）
    if (order_id) {
      const DocumentLinkService = require('../../../services/business/DocumentLinkService');
      const [[orderRow]] = await connection.query('SELECT order_no FROM sales_orders WHERE id = ?', [order_id]);
      await DocumentLinkService.tryAutoLink(
        'sales_order', order_id, orderRow?.order_no || null,
        'sales_outbound', outboundId, outboundNo, created_by, connection
      );
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        message: '销售出库单创建成功',
        id: outboundId,
        outbound_no: outboundNo,
      },
      '创建成功',
      201
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('创建销售出库单失败:', error);
    ResponseHandler.error(res, '创建销售出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


exports.updateSalesOutbound = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const {
      delivery_date,
      order_id,
      related_orders = [],
      is_multi_order = false,
      status,
      remarks,
      items,
    } = req.body;

    logger.info('请求数据:', req.body);

    // 转换日期格式为YYYY-MM-DD
    const formattedDeliveryDate = delivery_date
      ? new Date(delivery_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    connection = await getConnection();
    await connection.beginTransaction();

    // 1. 检查出库单是否存在并获取当前状态和明细
    const [outboundCheck] = await connection.query('SELECT * FROM sales_outbound WHERE id = ?', [
      id,
    ]);

    if (outboundCheck.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '出库单不存在');
    }

    const currentOutbound = outboundCheck[0];

    // 获取当前明细
    const [currentItems] = await connection.query(
      'SELECT * FROM sales_outbound_items WHERE outbound_id = ?',
      [id]
    );

    // 2. 验证状态转换的合法性
    const validTransitions = {
      draft: ['processing', 'cancelled'],
      processing: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (
      status &&
      status !== currentOutbound.status &&
      !validTransitions[currentOutbound.status]?.includes(status)
    ) {
      await connection.rollback();
      return res.status(400).json({
        error: '无效的状态转换',
        currentStatus: currentOutbound.status,
        newStatus: status,
        message: `当前状态 "${currentOutbound.status}" 不能转换为 "${status}"`,
      });
    }

    // 3. 验证订单存在性
    let finalOrderId = order_id;
    let finalRelatedOrders = related_orders;
    let finalIsMultiOrder = is_multi_order;

    if (finalIsMultiOrder) {
      // 多订单模式：验证所有关联订单存在
      if (!finalRelatedOrders || finalRelatedOrders.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '多订单模式下必须提供关联订单列表', 'BAD_REQUEST', 400);
      }

      const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id IN (?)', [
        finalRelatedOrders,
      ]);

      if (orderCheck.length !== finalRelatedOrders.length) {
        await connection.rollback();
        return ResponseHandler.error(res, '部分关联订单不存在', 'BAD_REQUEST', 400);
      }

      finalOrderId = null; // 多订单时主订单ID为空
    } else {
      // 单订单模式
      if (finalOrderId) {
        const [orderCheck] = await connection.query('SELECT id FROM sales_orders WHERE id = ?', [
          finalOrderId,
        ]);

        if (orderCheck.length === 0) {
          await connection.rollback();
          return ResponseHandler.error(res, '关联的订单不存在', 'BAD_REQUEST', 400);
        }
      } else {
        finalOrderId = currentOutbound.order_id;
        finalIsMultiOrder = currentOutbound.is_multi_order || false;
        // 安全解析 related_orders JSON
        finalRelatedOrders = [];
        if (currentOutbound.related_orders) {
          try {
            const rawValue = currentOutbound.related_orders;

            if (typeof rawValue === 'string') {
              // 尝试直接JSON解析
              try {
                finalRelatedOrders = JSON.parse(rawValue);
              } catch (jsonError) {
                // 如果JSON解析失败，尝试解析逗号分隔的ID列表
                logger.info('JSON解析失败，尝试解析逗号分隔的ID:', rawValue);
                finalRelatedOrders = rawValue
                  .split(',')
                  .map((id) => parseInt(id.trim()))
                  .filter((id) => !isNaN(id));
              }
            } else if (Array.isArray(rawValue)) {
              finalRelatedOrders = rawValue;
            } else if (Buffer.isBuffer(rawValue)) {
              // 处理Buffer类型
              const stringValue = rawValue.toString('utf8');
              try {
                finalRelatedOrders = JSON.parse(stringValue);
              } catch (jsonError) {
                finalRelatedOrders = stringValue
                  .split(',')
                  .map((id) => parseInt(id.trim()))
                  .filter((id) => !isNaN(id));
              }
            } else {
              // 其他类型，尝试转换为字符串处理
              const stringValue = String(rawValue);
              try {
                finalRelatedOrders = JSON.parse(stringValue);
              } catch (jsonError) {
                finalRelatedOrders = stringValue
                  .split(',')
                  .map((id) => parseInt(id.trim()))
                  .filter((id) => !isNaN(id));
              }
            }
          } catch (error) {
            logger.error(
              '解析 related_orders 失败:',
              error.message,
              '原始值:',
              currentOutbound.related_orders
            );
            finalRelatedOrders = [];
          }
        }
      }
    }

    // 4. 更新主表
    const updateQuery = `
      UPDATE sales_outbound SET
        order_id = ?,
        is_multi_order = ?,
        related_orders = ?,
        delivery_date = ?,
        status = ?,
        remarks = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    const finalStatus = status || currentOutbound.status;
    const finalRemarks = remarks || currentOutbound.remarks;

    await connection.query(updateQuery, [
      finalOrderId,
      finalIsMultiOrder,
      finalIsMultiOrder ? JSON.stringify(finalRelatedOrders) : null,
      formattedDeliveryDate,
      finalStatus,
      finalRemarks,
      id,
    ]);

    // 5. 处理明细
    if (items && items.length > 0) {
      // 验证物料是否存在于materials表中
      const materialIds = items.map((item) => item.material_id || item.product_id).filter(Boolean);

      if (materialIds.length > 0) {
        // 检查ID是否存在于materials表中
        const [materialCheck] = await connection.query(
          'SELECT id, code, name FROM materials WHERE id IN (?)',
          [materialIds]
        );

        const validMaterialIds = materialCheck.map((m) => m.id);

        // 过滤出有效的物料项
        const validItems = items.filter((item) => {
          const materialId = item.material_id || item.product_id;
          return validMaterialIds.includes(materialId);
        });

        if (validItems.length === 0) {
        } else {
          try {
            // 删除原有明细
            await connection.query('DELETE FROM sales_outbound_items WHERE outbound_id = ?', [id]);

            // 插入新明细
            const detailQuery = `
              INSERT INTO sales_outbound_items (
                outbound_id, product_id, quantity, price, amount
              ) VALUES ?
            `;

            const detailValues = [];

            for (const item of validItems) {
              const materialId = item.material_id || item.product_id;
              const material = materialCheck.find((m) => m.id === materialId);
              const unitPrice = parseFloat(item.unit_price || item.price || 0);
              const amount = parseFloat(item.quantity || 0) * unitPrice;

              detailValues.push([id, materialId, item.quantity, unitPrice, amount]);
            }

            if (detailValues.length > 0) {
              await connection.query(detailQuery, [detailValues]);
            }
          } catch (error) {
            throw error;
          }
        }
      } else {
      }
    } else {
      // 确保原有明细存在
      if (currentItems.length === 0) {
      } else {
      }
    }

    // 判断是否刚刚变更为完成状态
    const isJustCompleted = finalStatus === STATUS.OUTBOUND.COMPLETED && currentOutbound.status !== STATUS.OUTBOUND.COMPLETED;

    // 6. 如果状态变为completed，处理库存和追溯
    if (isJustCompleted) {
      // 使用 ProductSalesTraceabilityService 处理发货追溯和库存扣减
      // 该服务会自动按FIFO原则从不同库位分配库存，并记录追溯关系
      const ProductSalesTraceabilityService = require('../../../services/business/ProductSalesTraceabilityService');

      const salesData = {
        outbound_id: id,
        outbound_no: currentOutbound.outbound_no,
        order_id: finalOrderId,
        customer_id: currentOutbound.customer_id, // 需要确保currentOutbound或者关联订单中有customer_id
        delivery_date: formattedDeliveryDate,
        items: items && items.length > 0 ? items : currentItems,
        operator: await getCurrentUserName(req),
      };

      // 如果 currentOutbound 没有 customer_id (可能之前没存)，尝试从订单获取
      if (!salesData.customer_id && finalOrderId) {
        const [orderRes] = await connection.query(
          'SELECT customer_id FROM sales_orders WHERE id = ?',
          [finalOrderId]
        );
        if (orderRes.length > 0) {
          salesData.customer_id = orderRes[0].customer_id;
        }
      }

      await ProductSalesTraceabilityService.handleProductSalesOutbound(salesData, connection);

      logger.info(`✅ 销售出库单 ${id} 完成，库存和追溯数据已处理`);

      // 注意: 销售成本分录由 FinanceIntegrationService.generateCostEntryFromSalesOutbound
      // 在 commit 后的 setImmediate 中统一生成，此处不再重复生成
    }

    // 更新订单状态 - 使用智能状态服务
    logger.debug('状态更新信息:', {
      finalIsMultiOrder,
      finalRelatedOrdersLength: finalRelatedOrders ? finalRelatedOrders.length : 0,
      finalRelatedOrders,
      finalOrderId,
      outboundId: id,
    });

    // 使用新的基于物料的状态更新方法
    // 这将更新所有包含这些物料的订单，而不仅仅是关联订单
    if (items && items.length > 0) {
      logger.info('🔄 基于出库物料更新所有相关订单状态...');
      try {
        const results = await SalesOrderStatusService.updateOrderStatusByMaterials(
          items,
          connection
        );
        logger.info(`✅ 共更新了 ${results.length} 个订单的状态`);

        results.forEach((result) => {
          if (result.error) {
            logger.error(`❌ 订单 ${result.orderId} 状态更新失败: ${result.error} `);
          } else {
            logger.info(`✅ 订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
          }
        });
      } catch (error) {
        logger.error('❌ 基于物料的订单状态更新失败:', error);

        // 如果基于物料的更新失败，回退到原有逻辑
        if (finalIsMultiOrder && finalRelatedOrders && finalRelatedOrders.length > 0) {
          logger.info(
            `📦 回退：开始智能更新 ${finalRelatedOrders.length} 个订单状态: [${finalRelatedOrders.join(', ')}]`
          );
          const updateResults = await SalesOrderStatusService.updateMultipleOrderStatus(
            finalRelatedOrders,
            connection
          );
          updateResults.forEach((result) => {
            if (result.error) {
              logger.error(`❌ 订单 ${result.orderId} 状态更新失败: ${result.error} `);
            } else {
              logger.info(`✅ 订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
            }
          });
        } else if (finalOrderId) {
          logger.info(`📦 回退：开始智能更新单个订单 ${finalOrderId} 状态...`);
          try {
            const result = await SalesOrderStatusService.updateOrderStatus(
              finalOrderId,
              connection
            );
            logger.info(`✅ 订单 ${finalOrderId} 状态: ${result.status} (${result.message})`);
          } catch (error) {
            logger.error(`❌ 订单 ${finalOrderId} 状态更新失败: `, error);
          }
        }
      }
    } else {
      // 没有物料信息时使用原有逻辑
      if (finalIsMultiOrder && finalRelatedOrders && finalRelatedOrders.length > 0) {
        logger.info(
          `📦 开始智能更新 ${finalRelatedOrders.length} 个订单状态: [${finalRelatedOrders.join(', ')}]`
        );
        const updateResults = await SalesOrderStatusService.updateMultipleOrderStatus(
          finalRelatedOrders,
          connection
        );
        updateResults.forEach((result) => {
          if (result.error) {
            logger.error(`❌ 订单 ${result.orderId} 状态更新失败: ${result.error} `);
          } else {
            logger.info(`✅ 订单 ${result.orderId} 状态: ${result.status} (${result.message})`);
          }
        });
      } else if (finalOrderId) {
        logger.info(`📦 开始智能更新单个订单 ${finalOrderId} 状态...`);
        try {
          const result = await SalesOrderStatusService.updateOrderStatus(finalOrderId, connection);
          logger.info(`✅ 订单 ${finalOrderId} 状态: ${result.status} (${result.message})`);
        } catch (error) {
          logger.error(`❌ 订单 ${finalOrderId} 状态更新失败: `, error);
        }
      } else {
        logger.warn('⚠️ 没有找到需要更新状态的订单，跳过状态更新');
      }
    }

    // ========== 在事务内预先查好下游需要的数据（仅读取，不编排） ==========
    let eventPayload = null;
    try {
      let fullSalesOrder = null;
      let customerId = null;
      let customerName = null;

      if (finalOrderId) {
        const [salesOrders] = await connection.execute(
          `SELECT so.*, c.name as customer_name 
           FROM sales_orders so 
           LEFT JOIN customers c ON so.customer_id = c.id 
           WHERE so.id = ?`,
          [finalOrderId]
        );
        if (salesOrders.length > 0) {
          fullSalesOrder = salesOrders[0];
          customerId = fullSalesOrder.customer_id ?? null;
          customerName = fullSalesOrder.customer_name ?? null;
        }
      }

      eventPayload = {
        salesOrder: fullSalesOrder,
        outboundData: {
          id: id ?? null,
          outbound_no: currentOutbound.outbound_no ?? null,
          outbound_date: currentOutbound.delivery_date ?? null,
          customer_id: customerId,
          customer_name: customerName,
          total_amount: currentOutbound.total_amount ?? null,
          created_by: currentOutbound.created_by ?? null,
        },
        currentUserId: req.user?.id ?? null,
      };
    } catch (evtError) {
      logger.error('⚠️ 财务事件数据准备失败，但不阻塞出库:', evtError);
    }

    // ========== 提交主事务，释放所有行锁 ==========
    await connection.commit();

    // 7. 获取更新后的完整出库单信息
    const [updatedOutbound] = await connection.query(
      `SELECT so.*, o.order_no, c.name as customer_name
       FROM sales_outbound so
       LEFT JOIN sales_orders o ON so.order_id = o.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE so.id = ? `,
      [id]
    );

    // 获取更新后的明细
    const [updatedItems] = await connection.query(
      `SELECT soi.*, m.code as material_code, m.name as material_name, m.specs as specification, u.name as unit_name
       FROM sales_outbound_items soi
       LEFT JOIN materials m ON soi.product_id = m.id
       LEFT JOIN units u ON m.unit_id = u.id
       WHERE soi.outbound_id = ? `,
      [id]
    );

    // 组合完整数据
    const completeOutbound = {
      ...updatedOutbound[0],
      items: updatedItems,
    };

    res.json({
      message: '销售出库单更新成功',
      data: completeOutbound,
    });

    // ========== 响应已返回、事务已提交、连接即将归还 ==========
    // 【关键】EventEmitter.emit 是同步的！如果直接 emit，订阅者的 async handler
    // 会在当前同步调用栈中立即开始执行，此时主连接可能还未 release，造成锁等待。
    // 使用 setImmediate 推迟到下一个宏任务，确保 finally 中 connection.release() 先执行。
    if (eventPayload && isJustCompleted) {
      const outboundNo = currentOutbound.outbound_no;
      setImmediate(() => {
        try {
          const EventBus = require('../../../events/EventBus');
          EventBus.emit('SALES_OUTBOUND_COMPLETED', eventPayload);
          logger.info(`📢 业务事件触发: SALES_OUTBOUND_COMPLETED (单号: ${outboundNo})`);
        } catch (emitErr) {
          logger.error('⚠️ [EventBus] 发送事件失败:', emitErr);
        }
      });
    }
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('更新销售出库单失败:', error);
    ResponseHandler.error(res, '更新销售出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 删除出库单功能（仅允许草稿/待处理状态，已完成的出库单禁止删除以保护库存和财务数据一致性）

exports.deleteSalesOutbound = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 安全检查：查询出库单当前状态
    const [outboundResult] = await connection.query(
      'SELECT id, status, outbound_no, order_id FROM sales_outbound WHERE id = ?',
      [id]
    );

    if (outboundResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '出库单不存在');
    }

    const outbound = outboundResult[0];

    // 仅允许删除草稿(draft)和待处理(pending)状态的出库单
    // 已完成(completed)/处理中(processing)的出库单已产生库存变动和财务凭证，不允许直接删除
    const deletableStatuses = ['draft', 'pending'];
    if (!deletableStatuses.includes(outbound.status)) {
      await connection.rollback();
      return res.status(400).json({
        error: `无法删除状态为"${outbound.status}"的出库单。已完成或处理中的出库单请使用"撤销"功能以回滚库存和财务数据。仅草稿和待处理状态的出库单可以直接删除。`,
      });
    }

    try {
      // 删除明细
      await connection.query('DELETE FROM sales_outbound_items WHERE outbound_id = ?', [id]);

      // ✅ 软删除出库单主表
      await softDelete(connection, 'sales_outbound', 'id', id);

      await connection.commit();

      logger.info(`✅ 销售出库单 ${outbound.outbound_no} (ID: ${id}) 已安全删除，状态: ${outbound.status}`);

      res.json({
        message: '销售出库单删除成功',
        id: parseInt(id),
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售出库单失败:', error);
    ResponseHandler.error(res, '删除销售出库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// Sales Return Controllers

exports.getMaterialSalesHistory = async (req, res) => {
  let connection;
  try {
    const { materialId } = req.params;
    const { page = 1, pageSize = 10, startDate, endDate, customerId } = req.query;

    // 验证参数
    if (!materialId) {
      return res.status(400).json({
        success: false,
        error: '物料ID不能为空',
      });
    }

    const actualPage = parseInt(page, 10);
    const actualPageSize = parseInt(pageSize, 10);
    const offset = (actualPage - 1) * actualPageSize;

    connection = await getConnection();

    // 构建查询条件
    let whereClause = 'WHERE soi.product_id = ?';
    const queryParams = [materialId];

    if (startDate) {
      whereClause += ' AND so.delivery_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND so.delivery_date <= ?';
      queryParams.push(endDate);
    }

    if (customerId) {
      whereClause += ' AND o.customer_id = ?';
      queryParams.push(customerId);
    }

    // 只查询已完成的出库单
    whereClause += ' AND so.status = ?';
    queryParams.push('completed');

    // 查询总数
    const countQuery = `
      SELECT COUNT(DISTINCT so.id) as total
      FROM sales_outbound so
      INNER JOIN sales_outbound_items soi ON so.id = soi.outbound_id
      LEFT JOIN sales_orders o ON so.order_id = o.id
      ${whereClause}
  `;

    const [countResult] = await connection.query(countQuery, queryParams);
    const total = parseInt(countResult[0].total) || 0;

    // 查询销售出库历史数据
    // 注：sales_outbound_items.price/amount 创建出库单时可能未回填，
    // 因此优先取出库明细价格，为0时回退到关联订单明细的价格
    const dataQuery = `
  SELECT
  so.id,
    so.outbound_no,
    DATE_FORMAT(so.delivery_date, '%Y-%m-%d') as outbound_date,
    so.order_id,
    so.is_multi_order,
    so.related_orders,
    so.status,
    so.remarks,
    so.created_at,
    o.order_no,
    o.customer_id,
    c.name as customer_name,
    soi.product_id,
    m.code as product_code,
    m.name as product_name,
    m.specs as specification,
    soi.unit_id,
    u.name as unit,
    soi.quantity,
    COALESCE(NULLIF(soi.price, 0), oi.unit_price, 0) as unit_price,
    COALESCE(NULLIF(soi.amount, 0), oi.amount, soi.quantity * COALESCE(NULLIF(soi.price, 0), oi.unit_price, 0)) as total_amount,
    soi.remarks as item_remarks
      FROM sales_outbound so
      INNER JOIN sales_outbound_items soi ON so.id = soi.outbound_id
      LEFT JOIN sales_orders o ON so.order_id = o.id
      LEFT JOIN sales_order_items oi ON o.id = oi.order_id AND soi.product_id = oi.material_id
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN materials m ON soi.product_id = m.id
      LEFT JOIN units u ON soi.unit_id = u.id
      ${whereClause}
      ORDER BY so.delivery_date DESC, so.created_at DESC
      LIMIT ${actualPageSize} OFFSET ${offset}
  `;

    const [dataResult] = await connection.query(dataQuery, queryParams);

    // 返回结果
    res.json({
      success: true,
      data: {
        list: dataResult,
        total: total,
        page: actualPage,
        pageSize: actualPageSize,
      },
      message: '获取物料销售历史成功',
    });
  } catch (error) {
    logger.error('获取物料销售历史失败:', error);
    ResponseHandler.error(res, '获取物料销售历史失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};


