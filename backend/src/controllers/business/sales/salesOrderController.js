/**
 * salesOrderController.js
 * @description 销售订单控制器
 * @version 1.1.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const SalesDao = require('../../../database/salesDao');
const { SALES_STATUS } = require('../../../constants/systemConstants');
const InventoryReservationService = require('../../../services/InventoryReservationService');
const XLSX = require('xlsx');
const { softDelete } = require('../../../utils/softDelete');

// ✅ DRY修复：从 salesShared.js 统一导入，不再重复定义
const { STATUS, getConnection, getConnectionWithTransaction, generateSalesOrderNo, generateTransactionNo } = require('./salesShared');
const { autoGenerateFollowUpDocuments } = require('./salesExchangeController');
const { generateProductionAndPurchasePlans } = require('./salesPackingController');

// 添加新的控制器方法

exports.getSalesOrderOperators = async (req, res) => {
  try {
    const connection = await db.pool.getConnection();

    try {
      // 获取所有创建过销售订单的用户
      const [operators] = await connection.query(`
        SELECT DISTINCT 
          u.id,
          u.username,
          u.real_name,
          COUNT(so.id) as order_count
        FROM users u
        INNER JOIN sales_orders so ON u.id = so.created_by
        GROUP BY u.id, u.username, u.real_name
        ORDER BY order_count DESC, u.real_name ASC
      `);

      ResponseHandler.success(res, operators, '获取操作人列表成功');
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取操作人列表失败:', error);
    ResponseHandler.error(res, '获取操作人列表失败', 'INTERNAL_ERROR', 500);
  }
};

// Sales Order Controllers - 优化版本

exports.getSalesOrders = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      search = '',
      status = '',
      startDate = '',
      endDate = '',
      operator = '',
      sort = 'order_no',
      order = 'desc',
    } = req.query;

    const offset = (page - 1) * pageSize;

    const connection = await db.pool.getConnection();

    try {
      // 构建查询条件
      let whereClause = '';
      const params = [];

      if (search) {
        whereClause += ' AND (so.order_no LIKE ? OR c.name LIKE ? OR so.contract_code LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }

      if (status) {
        whereClause += ' AND so.status = ?';
        params.push(status);
      }

      if (startDate) {
        whereClause += ' AND so.created_at >= ?';
        params.push(startDate);
      }

      if (endDate) {
        whereClause += ' AND so.created_at <= ?';
        params.push(endDate);
      }

      if (operator) {
        whereClause += ' AND so.created_by = ?';
        params.push(operator);
      }

      // 优化的单次查询 - 使用JOIN避免N+1问题
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const actualPageSize = parseInt(pageSize);
      const actualOffset = parseInt(offset);
      const [orders] = await connection.query(
        `
      SELECT
        so.id,
        so.order_no,
        so.created_at as order_date,
        so.delivery_date,
        so.status,
        so.total_amount,
        so.contract_code,
        so.remarks,
        so.created_at,
        so.updated_at,
        so.created_by,
        COALESCE(so.is_locked, 0) as is_locked,
        so.locked_at,
        so.locked_by,
        so.lock_reason,
        c.name as customer_name,
        c.contact_person,
        c.contact_phone,
        c.address as delivery_address,
        u.username as locked_by_name,
        creator.username as created_by_name,
        creator.real_name as created_by_real_name,
        (SELECT COUNT(*) FROM sales_outbound WHERE order_id = so.id AND status = 'draft') > 0 as has_draft_outbound,
        COUNT(*) OVER() as total_count
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      LEFT JOIN users u ON so.locked_by = u.id
      LEFT JOIN users creator ON so.created_by = creator.id
      WHERE 1=1${whereClause}
      ORDER BY so.order_no DESC
      LIMIT ${actualPageSize} OFFSET ${actualOffset}
    `,
        params
      );

      // 如果需要订单明细，批量获取（可选）
      let orderItems = [];
      if (orders.length > 0) {
        const orderIds = orders.map((order) => order.id);
        const [items] = await connection.query(
          `
        SELECT
          soi.*,
          soi.product_code,
          soi.product_specs,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          u.name as unit_name,
          (soi.quantity * soi.unit_price) as total_price,
          soi.remark,
          COALESCE((
            SELECT SUM(quantity)
            FROM inventory_ledger
            WHERE material_id = soi.material_id
          ), 0) as stock_quantity
        FROM sales_order_items soi
        LEFT JOIN materials m ON soi.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE soi.order_id IN (${orderIds.map(() => '?').join(',')})
        ORDER BY soi.order_id, soi.id
      `,
          orderIds
        );

        orderItems = items;
      }

      // 校正订单状态 — 库存变化后状态可能漂移，在此统一回写 DB
      const statusUpdates = [];

      const formattedOrders = orders.map((order) => {
        const items = orderItems.filter((item) => item.order_id === order.id);

        // 检查库存是否充足
        let hasShortage = false;
        if (items.length > 0) {
          for (const item of items) {
            if ((parseFloat(item.stock_quantity) || 0) < (parseFloat(item.quantity) || 0)) {
              hasShortage = true;
              break;
            }
          }
        }

        // 根据库存实际情况校正状态
        let status = order.status;
        if (hasShortage) {
          if (['ready_to_ship', 'can_ship', 'pending', 'confirmed'].includes(status)) {
            status = 'shortage';
          }
        } else {
          if (['confirmed', 'shortage'].includes(status)) {
            status = 'ready_to_ship';
          }
        }

        // 状态发生变化，记录回写
        if (status !== order.status) {
          statusUpdates.push({ id: order.id, status });
        }

        return {
          id: order.id,
          order_no: order.order_no,
          customer: order.customer_name,
          customer_name: order.customer_name,
          contract_code: order.contract_code,
          totalAmount: parseFloat(order.total_amount) || 0,
          total_amount: parseFloat(order.total_amount) || 0,
          orderDate: order.order_date,
          order_date: order.order_date,
          deliveryDate: order.delivery_date,
          delivery_date: order.delivery_date,
          status: status,
          remark: order.remarks,
          remarks: order.remarks,
          address: order.delivery_address,
          delivery_address: order.delivery_address,
          contact: order.contact_person,
          contact_person: order.contact_person,
          phone: order.contact_phone,
          contact_phone: order.contact_phone,
          created_at: order.created_at,
          updated_at: order.updated_at,
          created_by: order.created_by,
          created_by_name: order.created_by_name,
          created_by_real_name: order.created_by_real_name,
          is_locked: Boolean(order.is_locked),
          locked_at: order.locked_at,
          locked_by: order.locked_by,
          lock_reason: order.lock_reason,
          locked_by_name: order.locked_by_name,
          has_draft_outbound: Boolean(order.has_draft_outbound),
          items:
            items.map((item) => ({
              code: item.material_code,
              material_code: item.material_code,
              material_name: item.material_name,
              specification: item.specification,
              product_code: item.product_code || '',
              product_specs: item.product_specs || '',
              quantity: parseFloat(item.quantity) || 0,
              stock_quantity: parseFloat(item.stock_quantity) || 0,
              unit_name: item.unit_name,
              unit_price: parseFloat(item.unit_price) || 0,
              amount: parseFloat(item.amount) || 0,
              total_price: parseFloat(item.total_price) || 0,
              remark: item.remark || '',
              remarks: item.remark || '',
            })) || [],
        };
      });

      // 状态漂移回写 DB — 保证数据库始终是权威数据源
      if (statusUpdates.length > 0) {
        const groupedByStatus = {};
        for (const u of statusUpdates) {
          (groupedByStatus[u.status] ||= []).push(u.id);
        }
        for (const [newStatus, orderIds] of Object.entries(groupedByStatus)) {
          await connection.execute(
            `UPDATE sales_orders SET status = ?, updated_at = NOW() WHERE id IN (${orderIds.map(() => '?').join(',')})`,
            [newStatus, ...orderIds]
          );
        }
        logger.info(`📝 订单状态校正: ${statusUpdates.map(u => `#${u.id}→${u.status}`).join(', ')}`);
      }

      // 返回分页格式
      const total = orders.length > 0 ? orders[0].total_count : 0;

      ResponseHandler.paginated(
        res,
        formattedOrders,
        total,
        parseInt(page),
        parseInt(pageSize),
        '获取销售订单成功'
      );
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting sales orders:', error);
    ResponseHandler.error(res, 'Error getting sales orders', 'SERVER_ERROR', 500, error);
  }
};


exports.getSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const connection = await db.pool.getConnection();

    try {
      // 查询订单主信息
      const [orderResults] = await connection.query(
        `
        SELECT so.*, c.name as customer_name, c.contact_person, c.contact_phone
        FROM sales_orders so
        LEFT JOIN customers c ON so.customer_id = c.id
        WHERE so.id = ? OR so.order_no = ?
      `,
        [id, id]
      );

      if (orderResults.length === 0) {
        return ResponseHandler.error(res, 'Sales order not found', 'NOT_FOUND', 404);
      }

      const order = orderResults[0];

      // 查询订单明细（包含库存数量）
      const [itemResults] = await connection.query(
        `
        SELECT
          soi.*,
          soi.product_code,
          soi.product_specs,
          m.code as material_code,
          m.name as material_name,
          m.specs as specification,
          u.name as unit_name,
          soi.remark,
          COALESCE((
            SELECT SUM(quantity)
            FROM inventory_ledger
            WHERE material_id = soi.material_id
            GROUP BY material_id
          ), 0) as stock_quantity
        FROM sales_order_items soi
        LEFT JOIN materials m ON soi.material_id = m.id
        LEFT JOIN units u ON m.unit_id = u.id
        WHERE soi.order_id = ?
      `,
        [order.id]
      );

      // 组合结果（修复字段名匹配问题）
      order.items = itemResults.map((item) => ({
        id: item.id,
        material_id: item.material_id, // 添加物料ID字段
        code: item.material_code || item.material_id, // 展开行期望的字段名
        material_code: item.material_code || item.material_id, // 前端期望的字段名
        materialCode: item.material_code || item.material_id, // 保持向后兼容
        name: item.material_name, // 展开行期望的字段名
        material_name: item.material_name, // 前端期望的字段名
        materialName: item.material_name, // 保持向后兼容
        specification: item.specification,
        product_code: item.product_code || '', // 产品编码（当没有物料时）
        product_specs: item.product_specs || '', // 产品规格（当没有物料时）
        quantity: item.quantity,
        stock_quantity: item.stock_quantity || 0, // 库存数量
        unit_price: item.unit_price, // 前端期望的字段名
        unitPrice: item.unit_price, // 保持向后兼容
        amount: item.amount, // 前端期望的字段名
        totalPrice: item.amount, // 保持向后兼容
        unit_name: item.unit_name, // 前端期望的字段名
        unitName: item.unit_name, // 保持向后兼容
        remark: item.remark || '', // 备注字段
        remarks: item.remark || '', // 兼容字段
      }));

      // 添加前端期望的字段以保持兼容性
      order.totalAmount = order.total_amount;

      res.json(order);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Error getting sales order:', error);
    ResponseHandler.error(res, 'Error getting sales order', 'SERVER_ERROR', 500, error);
  }
};

// 更新订单状态

exports.updateOrderStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    let { newStatus } = req.body; // 使用 let 而不是 const，因为可能需要根据库存情况调整状态

    // 验证状态值是否有效（使用统一常量）
    const validStatuses = Object.keys(SALES_STATUS);

    if (!validStatuses.includes(newStatus)) {
      await connection.rollback();
      logger.error(
        `❌ [订单状态更新] 无效的状态值: ${newStatus}, 有效状态: ${validStatuses.join(', ')}`
      );
      return ResponseHandler.error(res, `无效的状态值: ${newStatus}`, 'BAD_REQUEST', 400);
    }

    // 检查订单是否存在
    const [checkResult] = await connection.execute('SELECT status FROM sales_orders WHERE id = ?', [
      id,
    ]);

    if (checkResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = checkResult[0].status;

    // 验证状态转换的合法性
    const validTransitions = {
      draft: [
        'pending',
        'confirmed',
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'shortage',
        'cancelled',
      ],
      pending: [
        'confirmed',
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'shortage',
        'cancelled',
      ],
      confirmed: [
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'shortage',
        'partial_shipped',
        'shipped',
        'completed',
        'cancelled',
      ],
      in_production: [
        'ready_to_ship',
        'shortage',
        'partial_shipped',
        'shipped',
        'completed',
        'cancelled',
      ],
      in_procurement: [
        'ready_to_ship',
        'shortage',
        'partial_shipped',
        'shipped',
        'completed',
        'cancelled',
      ],
      ready_to_ship: ['partial_shipped', 'shipped', 'completed', 'cancelled'],
      shortage: [
        'in_production',
        'in_procurement',
        'ready_to_ship',
        'partial_shipped',
        'shipped',
        'cancelled',
      ],
      partial_shipped: ['shipped', 'completed', 'cancelled'],
      shipped: ['delivered', 'completed'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      await connection.rollback();
      const currentStatusText = SALES_STATUS[currentStatus] || currentStatus;
      const newStatusText = SALES_STATUS[newStatus] || newStatus;
      return ResponseHandler.error(
        res,
        `无效的状态转换：订单当前状态为"${currentStatusText}"，不能直接转换为"${newStatusText}"`,
        'BAD_REQUEST',
        400
      );
    }

    // 扩展库存检查触发条件：任何可能需要库存的状态转换都要检查
    const needsInventoryCheck =
      // 原有条件：从草稿/待确认转换到确认/生产状态
      ([STATUS.SALES_ORDER.DRAFT, STATUS.SALES_ORDER.PENDING].includes(currentStatus) &&
        [STATUS.SALES_ORDER.CONFIRMED, STATUS.SALES_ORDER.IN_PRODUCTION].includes(newStatus)) ||
      // 新增条件：任何转换到可发货状态的情况
      newStatus === STATUS.SALES_ORDER.READY_TO_SHIP ||
      // 新增条件：重新确认已有订单（用于修正错误状态）
      (newStatus === STATUS.SALES_ORDER.CONFIRMED &&
        [
          STATUS.SALES_ORDER.READY_TO_SHIP,
          STATUS.SALES_ORDER.IN_PRODUCTION,
          STATUS.SALES_ORDER.IN_PROCUREMENT,
        ].includes(currentStatus));

    if (needsInventoryCheck) {
      logger.info(
        `🔍 开始库存检查 - 订单ID: ${id}, 当前状态: ${currentStatus}, 目标状态: ${newStatus}`
      );

      // 获取订单明细
      const [orderItems] = await connection.execute(
        `SELECT soi.*, m.name as material_name, m.code as material_code, ms.type as source_type
         FROM sales_order_items soi
         LEFT JOIN materials m ON soi.material_id = m.id
         LEFT JOIN material_sources ms ON m.material_source_id = ms.id
         WHERE soi.order_id = ?`,
        [id]
      );

      logger.info(`📋 找到订单明细 ${orderItems.length} 项`);

      if (orderItems.length > 0) {
        // 检查库存并自动生成生产计划/采购申请
        const insufficientItems = [];
        const incompleteMaterials = []; // 收集信息不完整的物料

        // 批量查出所有物料信息（消除 N+1）
        const materialIds = orderItems.filter(i => i.material_id).map(i => i.material_id);
        const matPh = materialIds.map(() => '?').join(',');
        const [allMaterialInfo] = materialIds.length > 0
          ? await connection.execute(
              `SELECT id, code, category_id, unit_id, material_source_id FROM materials WHERE id IN (${matPh})`,
              materialIds
            )
          : [[]];
        const materialInfoMap = new Map(allMaterialInfo.map(m => [m.id, m]));

        // 批量查出所有物料库存（消除 N+1）
        const [allStockInfo] = materialIds.length > 0
          ? await connection.execute(
              `SELECT material_id, COALESCE(SUM(quantity), 0) as current_quantity
               FROM inventory_ledger WHERE material_id IN (${matPh}) GROUP BY material_id`,
              materialIds
            )
          : [[]];
        const stockMap = new Map(allStockInfo.map(s => [s.material_id, parseFloat(s.current_quantity) || 0]));

        for (const item of orderItems) {
          if (item.material_id) {
            // 从批量结果中获取物料信息
            const material = materialInfoMap.get(item.material_id);

            if (material) {
              const isComplete =
                material.code &&
                material.category_id &&
                material.unit_id &&
                material.material_source_id;

              if (!isComplete) {
                const missingFields = [];
                if (!material.code) missingFields.push('物料编码');
                if (!material.category_id) missingFields.push('物料分类');
                if (!material.unit_id) missingFields.push('计量单位');
                if (!material.material_source_id) missingFields.push('物料来源');

                incompleteMaterials.push({
                  name: item.material_name || '未知物料',
                  missingFields: missingFields,
                });

                logger.warn(
                  `⚠️  物料信息不完整: ${item.material_name} - 缺少: ${missingFields.join('、')}`
                );
                continue;
              }
            }

            // 从批量结果中获取库存
            const currentStock = stockMap.get(item.material_id) || 0;
            const requiredQuantity = parseFloat(item.quantity);

            logger.info(
              `📦 物料 ${item.material_name} (${item.material_code}): 需要${requiredQuantity}, 库存${currentStock}`
            );

            if (currentStock < requiredQuantity) {
              insufficientItems.push({
                material_id: item.material_id,
                material_name: item.material_name,
                material_code: item.material_code,
                source_type: item.source_type,
                required: requiredQuantity,
                available: currentStock,
                shortage: requiredQuantity - currentStock,
              });
              logger.info(
                `❌ 库存不足: ${item.material_name}, 缺少${requiredQuantity - currentStock}`
              );
            } else {
              logger.info(`✅ 库存充足: ${item.material_name}`);
            }
          }
        }

        // 如果有物料信息不完整，不允许确认订单
        if (incompleteMaterials.length > 0) {
          await connection.rollback();

          // 构建详细的错误信息
          const errorDetails = incompleteMaterials
            .map((m) => `【${m.name}】缺少: ${m.missingFields.join('、')}`)
            .join('\n');

          const errorMessage = `订单包含物料信息不完整的明细，请先补充以下信息：\n${errorDetails}`;

          logger.error(`❌ 订单确认失败 - 物料信息不完整:\n${errorDetails}`);
          return ResponseHandler.error(res, errorMessage, 'INCOMPLETE_MATERIAL', 400);
        }

        // 根据库存检查结果决定最终状态
        let finalStatus = newStatus;

        // 如果有库存不足的物料，自动生成生产计划或采购申请
        if (insufficientItems.length > 0) {
          logger.info(
            `⚠️  发现 ${insufficientItems.length} 个物料库存不足，开始生成生产计划/采购申请`
          );
          try {
            await generateProductionAndPurchasePlans(
              connection,
              id,
              insufficientItems,
              req.user || { id: 1, username: 'system', real_name: '系统' }
            );

            // 如果生成了计划，状态应该是in_production或in_procurement
            if (newStatus === STATUS.SALES_ORDER.CONFIRMED) {
              // 根据物料来源类型决定状态
              const hasInternal = insufficientItems.some((item) => item.source_type === 'internal');
              const hasExternal = insufficientItems.some((item) => item.source_type === 'external');

              logger.info(`📊 物料来源分析: 自产物料=${hasInternal}, 外购物料=${hasExternal}`);

              if (hasInternal && hasExternal) {
                // 既有自产又有外购，优先标记为生产中（因为生产周期通常更长）
                finalStatus = STATUS.SALES_ORDER.IN_PRODUCTION;
                logger.info(
                  `🔄 状态调整为: ${finalStatus} (因同时有自产和外购物料库存不足，优先标记为生产中)`
                );
              } else if (hasInternal) {
                finalStatus = STATUS.SALES_ORDER.IN_PRODUCTION;
                logger.info(`🔄 状态调整为: ${finalStatus} (因有自产物料库存不足)`);
              } else if (hasExternal) {
                finalStatus = STATUS.SALES_ORDER.IN_PROCUREMENT;
                logger.info(`🔄 状态调整为: ${finalStatus} (因有外购物料库存不足)`);
              }
            }
          } catch (planError) {
            logger.error('自动生成生产计划/采购申请失败:', planError);
            // 不阻止状态更新，但记录错误
          }
        } else {
          // 库存充足，可以直接发货
          if (newStatus === STATUS.SALES_ORDER.CONFIRMED) {
            finalStatus = STATUS.SALES_ORDER.READY_TO_SHIP;
            logger.info(`🔄 状态调整为: ${finalStatus} (库存充足)`);
          }
        }

        // 使用最终状态
        newStatus = finalStatus;
      }
    }

    // 更新订单状态
    await connection.execute(
      'UPDATE sales_orders SET status = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, id]
    );

    // 获取更新后的订单
    const [updatedOrder] = await connection.execute('SELECT * FROM sales_orders WHERE id = ?', [
      id,
    ]);

    await connection.commit();
    res.json(updatedOrder[0]);
  } catch (error) {
    await connection.rollback();
    logger.error('更新订单状态时出错:', error);
    ResponseHandler.error(res, '更新订单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};


exports.createSalesOrder = async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData || !orderData.items || !Array.isArray(orderData.items)) {
      return ResponseHandler.error(res, '订单数据格式不正确', 'BAD_REQUEST', 400);
    }

    // 验证必要字段
    if (!orderData.customer_id) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }

    // 设置创建者信息
    if (req.user && req.user.id) {
      orderData.createdBy = req.user.id;
    } else {
      orderData.createdBy = 1; // 假设1是默认管理员ID
    }

    // 准备订单数据
    const order = {
      orderNo: await generateSalesOrderNo(db.pool), // 使用统一的订单号生成规则
      customerId: orderData.customer_id,
      quotationId: orderData.quotation_id || null,
      contractCode: orderData.contract_code || '',
      totalAmount: orderData.total_amount || 0,
      taxRate: orderData.taxRate || orderData.tax_rate || 0.13, // 税率
      taxAmount: orderData.tax_amount || 0, // 税额
      subtotal: orderData.subtotal || 0, // 不含税金额
      paymentTerms: orderData.payment_terms || '',
      // 确保日期格式正确 (YYYY-MM-DD)
      deliveryDate: orderData.delivery_date
        ? new Date(orderData.delivery_date).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0],
      status: orderData.status || 'draft',
      remarks: orderData.remark || '',
      createdBy: orderData.createdBy,
    };

    // 处理订单项 - 支持自动从物料获取销售价格
    // 批量预查所有缺少单价的物料价格（消除 N+1）
    const allMaterialIds = orderData.items
      .filter(i => i.material_id && (!parseFloat(i.unit_price) || parseFloat(i.unit_price) <= 0))
      .map(i => parseInt(i.material_id))
      .filter(id => !isNaN(id) && id > 0);
    let priceMap = new Map();
    if (allMaterialIds.length > 0) {
      const pricePh = allMaterialIds.map(() => '?').join(',');
      const [priceRows] = await db.pool.execute(
        `SELECT id, price FROM materials WHERE id IN (${pricePh})`,
        allMaterialIds
      );
      priceMap = new Map(priceRows.map(r => [r.id, parseFloat(r.price) || 0]));
    }

    const items = [];
    for (let index = 0; index < orderData.items.length; index++) {
      const item = orderData.items[index];
      const quantity = parseFloat(item.quantity) || 0;
      let unit_price = parseFloat(item.unit_price) || 0;

      // 验证必要字段
      if (!item.material_id || item.material_id === null || item.material_id === '') {
        logger.error(`订单项 ${index + 1} 缺少物料ID:`, item);
        throw new Error(`订单项 ${index + 1} 缺少物料ID，请确保已选择物料`);
      }

      // 验证 material_id 是有效数字
      const materialId = parseInt(item.material_id);
      if (isNaN(materialId) || materialId <= 0) {
        logger.error(`订单项 ${index + 1} 物料ID无效:`, item.material_id);
        throw new Error(`订单项 ${index + 1} 物料ID无效: ${item.material_id}`);
      }

      if (quantity <= 0) {
        throw new Error(`订单项 ${index + 1} 的数量必须大于0`);
      }

      // 如果没有提供单价，从批量预查结果中获取价格
      if (unit_price <= 0) {
        const cachedPrice = priceMap.get(materialId);
        if (cachedPrice && cachedPrice > 0) {
          unit_price = cachedPrice;
          logger.info(`订单项 ${index + 1} 自动引用物料销售价格: ${unit_price}`);
        }
      }

      const amount = Math.round(quantity * unit_price * 100) / 100;

      items.push({
        material_id: materialId,
        quantity: quantity,
        unit_price: unit_price,
        amount: amount,
        tax_percent:
          item.tax_percent !== undefined
            ? item.tax_percent
            : item.tax_rate !== undefined
              ? item.tax_rate
              : 0.13,
        remark: item.remark || '',
      });
    }

    // 计算金额：不含税金额、税额、价税合计（使用整数化精度控制）
    const subtotalCents = items.reduce((sum, item) => sum + Math.round(item.amount * 100), 0);
    const subtotal = subtotalCents / 100;
    const taxRate = order.taxRate || 0.13;
    const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
    order.subtotal = subtotal;
    order.taxAmount = taxAmount;
    order.totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;

    try {
      // 创建销售订单
      const result = await SalesDao.createSalesOrder(order, items);

      // 根据物料来源自动生成后续单据，并获取建议的订单状态
      // 使用统一的生成函数，传入用户信息
      const userInfo = req.user || {
        id: orderData.createdBy,
        username: 'system',
        real_name: '系统',
      };
      const suggestedStatus = await autoGenerateFollowUpDocuments(result.id, items, userInfo);

      // 如果有建议的状态且与当前状态不同，则更新订单状态
      if (suggestedStatus && suggestedStatus !== result.status) {
        await SalesDao.updateSalesOrderStatus(result.id, suggestedStatus);
        result.status = suggestedStatus;
      }

      ResponseHandler.success(res, result, '创建成功', 201);
    } catch (error) {
      logger.error('数据库操作错误:', error);
      ResponseHandler.error(res, '创建订单失败', 'SERVER_ERROR', 500, error);
    }
  } catch (error) {
    logger.error('创建销售订单时出错:', error);
    ResponseHandler.error(res, '创建销售订单时出错', 'SERVER_ERROR', 500, error);
  }
};


exports.updateSalesOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const requestData = req.body;

    // 兼容两种数据格式：
    // 1. { order, items } - 旧格式
    // 2. { customer_id, items, ... } - 新格式（前端直接发送整个对象）
    let order, items;

    if (requestData.order && requestData.items) {
      // 旧格式
      order = requestData.order;
      items = requestData.items;
    } else {
      // 新格式：从请求体中提取items和其他字段
      items = requestData.items || [];
      order = {
        customer_id: requestData.customer_id,
        contract_code: requestData.contract_code,
        delivery_date: requestData.delivery_date,
        order_date: requestData.order_date,
        status: requestData.status,
        notes: requestData.notes,
        remarks: requestData.remarks,
        payment_terms: requestData.payment_terms,
      };
    }

    // 验证必需字段
    if (!order.customer_id) {
      return ResponseHandler.error(res, '客户ID不能为空', 'BAD_REQUEST', 400);
    }

    if (!items || items.length === 0) {
      return ResponseHandler.error(res, '订单明细不能为空', 'BAD_REQUEST', 400);
    }

    // 验证所有物料项都有material_id
    const invalidItems = items.filter((item) => !item.material_id);
    if (invalidItems.length > 0) {
      return ResponseHandler.error(
        res,
        `有 ${invalidItems.length} 个物料项缺少物料ID`,
        'BAD_REQUEST',
        400
      );
    }

    // 调用数据库函数更新订单
    const updatedOrder = await SalesDao.updateSalesOrder(id, order, items);

    // 如果前端标记需要生成生产/采购计划（编辑订单添加了新物料且库存不足）
    if (requestData.should_generate_plans) {
      try {
        logger.info(`✅ 编辑订单 ${id}，需要生成生产/采购计划`);
        const userInfo = req.user || { id: 1, username: 'system', real_name: '系统' };

        // 自动生成生产计划和采购申请
        await autoGenerateFollowUpDocuments(id, items, userInfo);

        logger.info(`✅ 订单 ${id} 的生产/采购计划已生成`);
      } catch (planError) {
        logger.error('⚠️ 生成生产/采购计划失败:', planError);
        // 不阻止订单更新，只记录错误
      }
    }

    ResponseHandler.success(res, updatedOrder, '订单更新成功');
  } catch (error) {
    logger.error('更新销售订单失败:', error);
    ResponseHandler.error(res, '更新销售订单失败', 'SERVER_ERROR', 500, error);
  }
};

// 添加删除订单功能

exports.deleteSalesOrder = async (req, res) => {
  let connection;
  try {
    const { id } = req.params;

    connection = await getConnection();
    await connection.beginTransaction();

    // 1. 查询订单当前状态
    const [orderResult] = await connection.query(
      'SELECT id, order_no, status FROM sales_orders WHERE id = ?',
      [id]
    );

    if (orderResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.notFound(res, '销售订单不存在');
    }

    const order = orderResult[0];

    // 2. 仅允许删除草稿(draft)和待审核(pending)状态的订单
    const deletableStatuses = ['draft', 'pending'];
    if (!deletableStatuses.includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({
        error: `无法删除状态为"${order.status}"的订单。仅草稿和待审核状态的订单可以删除。`,
      });
    }

    // 3. 检查是否存在关联的出库单
    const [outboundCheck] = await connection.query(
      'SELECT COUNT(*) as count FROM sales_outbound WHERE order_id = ?',
      [id]
    );
    if (outboundCheck[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: `此订单已有 ${outboundCheck[0].count} 条关联出库单，无法删除。请先删除相关出库单。`,
      });
    }

    // 4. 检查是否存在关联的退货单
    const [returnCheck] = await connection.query(
      'SELECT COUNT(*) as count FROM sales_returns WHERE order_id = ?',
      [id]
    );
    if (returnCheck[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: `此订单已有 ${returnCheck[0].count} 条关联退货单，无法删除。请先处理相关退货单。`,
      });
    }

    // 5. 检查是否存在关联的换货单
    const [exchangeCheck] = await connection.query(
      'SELECT COUNT(*) as count FROM sales_exchanges WHERE order_id = ?',
      [id]
    );
    if (exchangeCheck[0].count > 0) {
      await connection.rollback();
      return res.status(400).json({
        error: `此订单已有 ${exchangeCheck[0].count} 条关联换货单，无法删除。请先处理相关换货单。`,
      });
    }

    // 6. 安全删除：先删除明细，再软删除主表
    await connection.query('DELETE FROM sales_order_items WHERE order_id = ?', [id]);
    // ✅ 软删除替代硬删除
    await softDelete(connection, 'sales_orders', 'id', id);

    await connection.commit();

    logger.info(`✅ 销售订单 ${order.order_no} (ID: ${id}) 已安全删除，原状态: ${order.status}`);

    res.json({
      message: '销售订单删除成功',
      id: parseInt(id),
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    logger.error('删除销售订单失败:', error);
    ResponseHandler.error(res, '删除销售订单失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};



// 添加总体销售统计数据接口

exports.lockOrder = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { lock_reason } = req.body;
    const userId = req.user ? req.user.id : 1;

    // 检查订单是否存在
    const [orderResult] = await connection.execute('SELECT * FROM sales_orders WHERE id = ?', [id]);

    if (orderResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResult[0];

    // 检查订单是否已经锁定
    if (order.is_locked) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单已经锁定，无法重复锁定', 'BAD_REQUEST', 400);
    }

    // 检查订单状态是否允许锁定 - 只允许生产中和采购中的订单锁定
    const allowedStatuses = ['in_production', 'in_procurement'];

    if (!allowedStatuses.includes(order.status)) {
      await connection.rollback();
      return res.status(400).json({
        message: `订单状态为"${order.status}"，不允许锁定。只有"生产中"和"采购中"的订单才能锁定库存。`,
      });
    }

    // 获取订单物料项
    const [itemsResult] = await connection.execute(
      'SELECT * FROM sales_order_items WHERE order_id = ?',
      [id]
    );

    // 预留库存
    const reservationResult = await InventoryReservationService.reserveInventoryForOrder(
      id,
      order.order_no,
      itemsResult,
      userId,
      connection
    );

    if (!reservationResult.success) {
      await connection.rollback();
      logger.warn('🔒 锁定订单失败 - 库存不足详情:', JSON.stringify({
        orderId: id,
        insufficientItems: reservationResult.insufficientItems,
        reservations: reservationResult.reservations
      }));
      return res.status(400).json({
        success: false,
        message: '库存不足，无法锁定订单',
        errorCode: 'BAD_REQUEST',
        insufficientItems: reservationResult.insufficientItems || []
      });
    }

    // 更新订单锁定状态
    await connection.execute(
      `
      UPDATE sales_orders
      SET is_locked = TRUE, locked_at = NOW(), locked_by = ?, lock_reason = ?, updated_at = NOW()
      WHERE id = ?
        `,
      [userId, lock_reason || '手动锁定', id]
    );

    await connection.commit();

    // 返回详细的锁定结果
    res.json({
      success: reservationResult.success,
      message: reservationResult.fullSuccess ? '订单锁定成功' : '订单部分锁定成功',
      data: {
        orderId: id,
        fullSuccess: reservationResult.fullSuccess,
        partialSuccess: reservationResult.partialSuccess,
        reservations: reservationResult.reservations,
        insufficientItems: reservationResult.insufficientItems,
      }
    });
  } catch (error) {
    await connection.rollback();
    logger.error('锁定订单失败:', error);
    ResponseHandler.error(res, '锁定订单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 解锁销售订单
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */

exports.unlockOrder = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const userId = req.user ? req.user.id : 1;

    // 检查订单是否存在
    const [orderResult] = await connection.execute('SELECT * FROM sales_orders WHERE id = ?', [id]);

    if (orderResult.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResult[0];

    // 检查订单是否已经锁定
    if (!order.is_locked) {
      await connection.rollback();
      return ResponseHandler.error(res, '订单未锁定，无需解锁', 'BAD_REQUEST', 400);
    }

    // 释放库存预留
    const releaseResult = await InventoryReservationService.releaseInventoryReservation(
      id,
      userId,
      connection
    );

    // 更新订单锁定状态
    await connection.execute(
      `
      UPDATE sales_orders
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL, lock_reason = NULL, updated_at = NOW()
      WHERE id = ?
        `,
      [id]
    );

    await connection.commit();

    res.json({
      success: true,
      message: '订单解锁成功',
      data: {
        orderId: id,
        releaseResult: releaseResult,
      }
    });
  } catch (error) {
    await connection.rollback();
    logger.error('解锁订单失败:', error);
    ResponseHandler.error(res, '解锁订单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取订单锁定状态和预留信息
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */

exports.getOrderLockStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取订单锁定信息
    const [orderResult] = await db.pool.execute(
      `
      SELECT so.*, u.username as locked_by_name
      FROM sales_orders so
      LEFT JOIN users u ON so.locked_by = u.id
      WHERE so.id = ?
        `,
      [id]
    );

    if (orderResult.length === 0) {
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResult[0];

    // 获取预留信息
    const reservations = await InventoryReservationService.getOrderReservations(id);

    res.json({
      orderId: id,
      isLocked: order.is_locked,
      lockedAt: order.locked_at,
      lockedBy: order.locked_by,
      lockedByName: order.locked_by_name,
      lockReason: order.lock_reason,
      reservations: reservations,
    });
  } catch (error) {
    logger.error('获取订单锁定状态失败:', error);
    ResponseHandler.error(res, '获取订单锁定状态失败', 'SERVER_ERROR', 500, error);
  }
};

// ==================== 装箱单管理 ====================

/**
 * @deprecated 装箱单表结构已迁移至 Knex 迁移文件 20260312000009 管理，此函数保留为空操作
 */
async function ensurePackingListTablesExist() {
  // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理
  // 测试数据应由 seeds/ 种子文件管理
}

/**
 * 使用统一的编号生成服务 - 替代原 generatePackingListNo 函数
 */
async function generatePackingListNo(connection) {
  return await CodeGenerators.generatePackingListCode(connection);
}

/**
 * 获取装箱单列表
 */

exports.exportOrders = async (req, res) => {
  try {
    const { search = '', status = '', startDate = '', endDate = '' } = req.body;

    // 构建查询条件
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (so.order_no LIKE ? OR c.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      whereClause += ' AND so.status = ?';
      params.push(status);
    }

    if (startDate) {
      whereClause += ' AND DATE(so.created_at) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND DATE(so.created_at) <= ?';
      params.push(endDate);
    }

    const connection = await db.pool.getConnection();

    try {
      // 获取订单数据
      const [orders] = await connection.query(
        `
      SELECT
      so.order_no as '订单编号',
        c.name as '客户名称',
        DATE(so.created_at) as '订单日期',
        so.delivery_date as '交货日期',
        so.total_amount as '订单金额',
        CASE so.status
            WHEN 'draft' THEN '草稿'
            WHEN 'confirmed' THEN '已确认'
            WHEN 'in_production' THEN '生产中'
            WHEN 'completed' THEN '已完成'
            WHEN 'cancelled' THEN '已取消'
            ELSE so.status
      END as '订单状态',
        so.remarks as '备注',
        so.created_at as '创建时间'
        FROM sales_orders so
        LEFT JOIN customers c ON so.customer_id = c.id
        ${whereClause}
        ORDER BY so.created_at DESC
        LIMIT 1000
      `,
        params
      );

      // 使用 ExcelJS 创建Excel文件
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('销售订单');

      // 设置列，注意 key 必须与 SQL 查询的 AS 别名完全一致
      worksheet.columns = [
        { header: '订单编号', key: '订单编号', width: 20 },
        { header: '客户名称', key: '客户名称', width: 25 },
        { header: '订单日期', key: '订单日期', width: 15 },
        { header: '交货日期', key: '交货日期', width: 15 },
        { header: '订单金额', key: '订单金额', width: 15 },
        { header: '订单状态', key: '订单状态', width: 15 },
        { header: '备注', key: '备注', width: 30 },
        { header: '创建时间', key: '创建时间', width: 20 },
      ];

      // 添加数据行
      orders.forEach((order) => {
        worksheet.addRow(order);
      });

      // 生成Excel文件
      const excelBuffer = await workbook.xlsx.writeBuffer();

      // 设置响应头
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      const filename = `sales_orders_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader(
        'Content-Disposition',
        `attachment; filename = "${filename}"; filename *= UTF - 8''${encodeURIComponent('销售订单_' + new Date().toISOString().slice(0, 10) + '.xlsx')} `
      );

      res.send(excelBuffer);
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('导出销售订单失败:', error);
    ResponseHandler.error(res, '导出销售订单失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 导入销售订单
 */

exports.importOrders = async (req, res) => {
  try {
    // 记录当前用户信息
    logger.info('📥 导入订单 - 当前用户信息:', {
      id: req.user?.id,
      username: req.user?.username,
      real_name: req.user?.real_name,
    });

    if (!req.file) {
      return ResponseHandler.error(res, '请选择要导入的文件', 'BAD_REQUEST', 400);
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    const data = [];
    const headers = [];

    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value;
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // 跳过表头
      const rowData = {};
      row.eachCell((cell, colNumber) => {
        rowData[headers[colNumber - 1]] = cell.value;
      });
      data.push(rowData);
    });

    if (!data || data.length === 0) {
      return ResponseHandler.error(res, '导入文件为空或格式不正确', 'BAD_REQUEST', 400);
    }

    const connection = await db.pool.getConnection();
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    try {
      await connection.beginTransaction();

      // 按客户+合同编码分组处理订单
      const ordersByCustomer = {};

      // 先验证所有数据并按客户+合同编码分组
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;

        try {
          // 验证必填字段
          if (!row['客户编码']) {
            errors.push(`第${rowNum} 行: 客户编码为必填项`);
            errorCount++;
            continue;
          }

          // 验证产品信息（编码或规格至少填一个）
          if (!row['产品编码'] && !row['产品规格']) {
            errors.push(`第${rowNum} 行: 产品编码或产品规格至少填写一个`);
            errorCount++;
            continue;
          }

          // 验证数量
          const quantity = parseFloat(row['数量']) || 0;
          if (quantity <= 0) {
            errors.push(`第${rowNum} 行: 数量必须大于0`);
            errorCount++;
            continue;
          }

          // 单价可以为空，默认为0
          const unitPrice = parseFloat(row['单价']) || 0;

          // 按客户编码+合同编码分组（不同客户或不同合同的订单分开）
          const customerCode = row['客户编码'];
          const contractCode = row['合同编码'] || '';
          const groupKey = `${customerCode}_${contractCode} `;

          if (!ordersByCustomer[groupKey]) {
            // 处理交货日期
            let deliveryDate;
            if (row['交货日期']) {
              // 如果Excel中填写了交货日期，就使用表格中的日期
              const originalDate = new Date(row['交货日期']);
              deliveryDate = originalDate.toISOString().split('T')[0];
            } else {
              // 如果Excel中没有填写交货日期，默认使用当前日期+21天（3周）
              const defaultDate = new Date();
              defaultDate.setDate(defaultDate.getDate() + 21);
              deliveryDate = defaultDate.toISOString().split('T')[0];
            }

            ordersByCustomer[groupKey] = {
              customerCode: customerCode,
              contractCode: contractCode,
              deliveryDate: deliveryDate,
              remarks: row['备注'] || '',
              items: [],
            };

            // 调试日志：记录备注信息
            if (row['备注']) {
              logger.info(
                `📝 读取到备注信息: "${row['备注']}"(客户: ${customerCode}, 合同: ${contractCode})`
              );
            }
          }

          // 添加订单明细
          ordersByCustomer[groupKey].items.push({
            productCode: row['产品编码'] || '',
            productSpecs: row['产品规格'] || '',
            quantity: quantity,
            unitPrice: unitPrice, // 可以为0
            amount: quantity * unitPrice, // 如果单价为0，金额也为0
            remark: row['备注'] || '', // 添加产品级别的备注
            rowNum: rowNum,
          });

          // 调试日志：记录产品级别的备注
          if (row['备注']) {
            logger.info(
              `📝 读取到产品备注: "${row['备注']}"(产品编码: ${row['产品编码'] || row['产品规格']})`
            );
          }
        } catch (error) {
          logger.error(`验证第${rowNum} 行数据失败: `, error);
          errors.push(`第${rowNum} 行: ${error.message} `);
          errorCount++;
        }
      }

      // 处理每个分组的订单（按客户+合同编码分组）
      for (const [groupKey, orderData] of Object.entries(ordersByCustomer)) {
        try {
          // 通过客户编码查找客户ID
          const [customers] = await connection.query('SELECT id FROM customers WHERE code = ? AND deleted_at IS NULL', [
            orderData.customerCode,
          ]);

          if (customers.length === 0) {
            // 标记该客户的所有行为错误
            orderData.items.forEach((item) => {
              errors.push(
                `第${item.rowNum} 行: 找不到客户编码"${orderData.customerCode}"，请确认客户编码是否正确`
              );
              errorCount++;
            });
            continue;
          }

          // 计算订单总金额
          const totalAmount = orderData.items.reduce((sum, item) => sum + item.amount, 0);

          // 生成订单编号
          const orderNo = await generateSalesOrderNo(connection);

          // 调试日志：记录即将插入的备注信息
          logger.info(`📝 准备插入订单备注: "${orderData.remarks}"(订单号: ${orderNo})`);

          // 插入销售订单主记录
          const [orderResult] = await connection.query(
            `
            INSERT INTO sales_orders(
          order_no, customer_id, contract_code, delivery_date,
          total_amount, status, remarks, created_by, created_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `,
            [
              orderNo,
              customers[0].id,
              orderData.contractCode,
              orderData.deliveryDate,
              totalAmount,
              'draft',
              orderData.remarks,
              req.user?.id || 1,
            ]
          );

          const orderId = orderResult.insertId;

          // 插入订单明细
          for (const item of orderData.items) {
            let materialId = null;
            const productCodeForStorage = item.productCode || '';
            const productSpecsForStorage = item.productSpecs || '';

            // 根据产品编码或规格查找物料
            if (item.productCode) {
              const [materials] = await connection.query(
                'SELECT id FROM materials WHERE code = ?',
                [item.productCode]
              );
              if (materials.length > 0) {
                materialId = materials[0].id;
                logger.info(`✅ 找到物料: 编码 = ${item.productCode}, ID = ${materialId} `);
              } else {
                logger.warn(`⚠️ 未找到产品编码 ${item.productCode} 对应的物料，将自动创建物料记录`);

                // 获取默认的物料来源ID（外购）
                const [defaultSource] = await connection.query(`
                  SELECT id FROM material_sources WHERE type = 'external' AND status = 1 ORDER BY sort LIMIT 1
        `);
                const defaultSourceId = defaultSource.length > 0 ? defaultSource[0].id : null;

                // 自动创建物料记录（名称和规格使用产品编码，设置默认物料来源）
                const [createResult] = await connection.query(
                  `
                  INSERT INTO materials(name, specs, material_source_id, created_at, updated_at)
      VALUES(?, ?, ?, NOW(), NOW())
                `,
                  [item.productCode, item.productCode, defaultSourceId]
                );

                materialId = createResult.insertId;
                logger.info(
                  `✅ 已自动创建物料: ID = ${materialId}, 名称 = ${item.productCode}, 规格 = ${item.productCode}, 物料来源ID = ${defaultSourceId || '未设置'} `
                );
              }
            } else if (item.productSpecs) {
              const [materials] = await connection.query(
                'SELECT id FROM materials WHERE specs = ?',
                [item.productSpecs]
              );
              if (materials.length > 0) {
                materialId = materials[0].id;
                logger.info(`✅ 找到物料: 规格 = ${item.productSpecs}, ID = ${materialId} `);
              } else {
                logger.warn(
                  `⚠️ 未找到产品规格 ${item.productSpecs} 对应的物料，将自动创建物料记录`
                );

                // 获取默认的物料来源ID（外购）
                const [defaultSource] = await connection.query(`
                  SELECT id FROM material_sources WHERE type = 'external' AND status = 1 ORDER BY sort LIMIT 1
        `);
                const defaultSourceId = defaultSource.length > 0 ? defaultSource[0].id : null;

                // 自动创建物料记录（名称和规格使用产品规格，设置默认物料来源）
                const [createResult] = await connection.query(
                  `
                  INSERT INTO materials(name, specs, material_source_id, created_at, updated_at)
      VALUES(?, ?, ?, NOW(), NOW())
                `,
                  [item.productSpecs, item.productSpecs, defaultSourceId]
                );

                materialId = createResult.insertId;
                logger.info(
                  `✅ 已自动创建物料: ID = ${materialId}, 名称 = ${item.productSpecs}, 规格 = ${item.productSpecs}, 物料来源ID = ${defaultSourceId || '未设置'} `
                );
              }
            }

            // 如果仍然没有物料ID（既没有编码也没有规格），记录警告
            if (!materialId) {
              logger.warn(
                `📝 订单明细暂无物料ID：产品编码 = ${productCodeForStorage || '无'}，产品规格 = ${productSpecsForStorage || '无'}，数量 = ${item.quantity}，单价 = ${item.unitPrice} `
              );
            }

            // 调试日志：记录产品备注插入
            if (item.remark) {
              logger.info(`📝 插入产品备注: "${item.remark}"(物料ID: ${materialId || '待补充'})`);
            }

            // 插入订单明细（允许material_id为NULL）
            await connection.query(
              `
              INSERT INTO sales_order_items(
        order_id, material_id, quantity, unit_price, amount, remark, product_code, product_specs
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            `,
              [
                orderId,
                materialId, // 可以为NULL
                item.quantity,
                item.unitPrice,
                item.amount,
                item.remark || '',
                productCodeForStorage,
                productSpecsForStorage,
              ]
            );
          }

          // 导入完成后立即进行库存检查并设置正确状态
          logger.info(`🔍 导入订单后进行库存检查 - 订单ID: ${orderId}, 订单号: ${orderNo} `);

          // 获取订单明细进行库存检查
          const [orderItems] = await connection.execute(
            `SELECT soi.*, m.name as material_name, m.code as material_code, ms.type as source_type
             FROM sales_order_items soi
             LEFT JOIN materials m ON soi.material_id = m.id
             LEFT JOIN material_sources ms ON m.material_source_id = ms.id
             WHERE soi.order_id = ? `,
            [orderId]
          );

          // 如果订单没有任何明细项（这种情况理论上不应该发生，因为我们刚刚插入了明细）
          if (orderItems.length === 0) {
            // ✅ 软删除替代硬删除
            await softDelete(connection, 'sales_orders', 'id', orderId);
            const errorMsg = `订单 ${orderNo} 没有明细项，已删除`;
            logger.error(errorMsg);
            errors.push(errorMsg);
            errorCount++;
            continue; // 跳过这个订单
          }

          logger.info(`✅ 订单 ${orderNo} 共有 ${orderItems.length} 个明细项`);

          if (orderItems.length > 0) {
            const insufficientItems = [];
            let hasIncompleteMaterial = false; // 标记是否有物料信息不完整

            for (const item of orderItems) {
              if (item.material_id) {
                // 验证物料信息是否完整
                const [materialInfo] = await connection.execute(
                  'SELECT code, category_id, unit_id, material_source_id FROM materials WHERE id = ?',
                  [item.material_id]
                );

                if (materialInfo.length > 0) {
                  const material = materialInfo[0];
                  const isComplete =
                    material.code &&
                    material.category_id &&
                    material.unit_id &&
                    material.material_source_id;

                  if (!isComplete) {
                    hasIncompleteMaterial = true;
                    logger.warn(
                      `⚠️  物料信息不完整: ${item.material_name} (编码: ${material.code || '无'
                      }, 分类:${material.category_id || '无'}, 单位:${material.unit_id || '无'}, 来源:${material.material_source_id || '无'})`
                    );
                    continue; // 跳过此物料，不检查库存
                  }
                }

                // 检查库存
                const [stockResult] = await connection.execute(
                  `SELECT COALESCE(SUM(current_quantity), 0) as current_quantity
                   FROM v_batch_stock
                   WHERE material_id = ? `,
                  [item.material_id]
                );

                const currentStock = parseFloat(stockResult[0]?.current_quantity || 0);
                const requiredQuantity = parseFloat(item.quantity);

                logger.info(
                  `📦 物料 ${item.material_name} (${item.material_code}): 需要${requiredQuantity}, 库存${currentStock} `
                );

                if (currentStock < requiredQuantity) {
                  insufficientItems.push({
                    material_id: item.material_id,
                    material_name: item.material_name,
                    material_code: item.material_code,
                    source_type: item.source_type,
                    required: requiredQuantity,
                    available: currentStock,
                    shortage: requiredQuantity - currentStock,
                  });
                  logger.info(
                    `❌ 库存不足: ${item.material_name}, 缺少${requiredQuantity - currentStock} `
                  );
                } else {
                  logger.info(`✅ 库存充足: ${item.material_name} `);
                }
              }
            }

            // 根据库存检查结果设置正确状态
            let finalStatus = 'draft';

            // 如果有物料信息不完整，保持草稿状态
            if (hasIncompleteMaterial) {
              finalStatus = 'draft';
              logger.warn(
                `⚠️  订单 ${orderNo} 包含物料信息不完整的明细，状态设置为: draft，请补充物料信息后再确认订单`
              );
            } else if (insufficientItems.length > 0) {
              logger.info(`⚠️  发现 ${insufficientItems.length} 个物料库存不足`);

              // 自动生成生产计划或采购申请
              try {
                await generateProductionAndPurchasePlans(
                  connection,
                  orderId,
                  insufficientItems,
                  req.user || { id: 1, username: 'system', real_name: '系统' }
                );

                // 根据物料来源类型决定状态
                const hasInternal = insufficientItems.some(
                  (item) => item.source_type === 'internal'
                );
                const hasExternal = insufficientItems.some(
                  (item) => item.source_type === 'external'
                );

                if (hasInternal) {
                  finalStatus = 'in_production';
                  logger.info(`🔄 状态设置为: ${finalStatus} (因有自产物料库存不足)`);
                } else if (hasExternal) {
                  finalStatus = 'in_procurement';
                  logger.info(`🔄 状态设置为: ${finalStatus} (因有外购物料库存不足)`);
                }
              } catch (planError) {
                logger.error('自动生成生产计划/采购申请失败:', planError);
                finalStatus = 'in_production'; // 默认设为生产中
              }
            } else {
              // 库存充足，可以直接发货
              finalStatus = 'ready_to_ship';
              logger.info(`🔄 状态设置为: ${finalStatus} (库存充足)`);
            }

            // 更新订单状态
            await connection.execute(
              'UPDATE sales_orders SET status = ?, updated_at = NOW() WHERE id = ?',
              [finalStatus, orderId]
            );

            logger.info(`✅ 订单 ${orderNo} 状态已设置为: ${finalStatus} `);
          }

          successCount += orderData.items.length;
        } catch (error) {
          logger.error(
            `处理客户编码"${orderData.customerCode}"、合同编码"${orderData.contractCode}"的订单失败: `,
            error
          );
          // 标记该分组的所有行为错误
          orderData.items.forEach((item) => {
            errors.push(`第${item.rowNum} 行: ${error.message} `);
            errorCount++;
          });
        }
      }

      await connection.commit();

      res.json({
        success: true,
        message: `导入完成，成功${successCount} 条，失败${errorCount} 条`,
        data: {
          successCount,
          errorCount,
          errors: errors.slice(0, 10), // 只返回前10个错误
        },
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('导入销售订单失败:', error);
    ResponseHandler.error(res, '导入销售订单失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 下载销售订单导入模板
 */

exports.downloadOrderTemplate = async (req, res) => {
  try {
    logger.info('收到销售订单导入模板下载请求');

    // 准备模板数据
    const templateData = [
      {
        客户编码: 'C001',
        合同编码: 'HT2025001',
        产品编码: 'PROD001',
        产品规格: '10*20*30mm',
        数量: 10,
        单价: 100,
        交货日期: '2025-09-15',
        订单金额: 1000,
        备注: '示例订单备注',
      },
      {
        客户编码: 'C001',
        合同编码: 'HT2025001',
        产品编码: '',
        产品规格: '不锈钢板材 厚度5mm',
        数量: 5,
        单价: 200,
        交货日期: '2025-09-15',
        订单金额: 1000,
        备注: '可以只填产品编码或产品规格',
      },
    ];

    // 创建工作簿
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(templateData);

    // 设置列宽
    const colWidths = [
      { wch: 15 }, // 客户编码
      { wch: 15 }, // 合同编码
      { wch: 15 }, // 产品编码
      { wch: 25 }, // 产品规格
      { wch: 10 }, // 数量
      { wch: 12 }, // 单价
      { wch: 15 }, // 交货日期
      { wch: 15 }, // 订单金额
      { wch: 30 }, // 备注
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, '销售订单导入模板');

    // 生成Excel文件
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 设置响应头
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const filename = 'sales_order_import_template.xlsx';
    res.setHeader(
      'Content-Disposition',
      `attachment; filename = "${filename}"; filename *= UTF - 8''${encodeURIComponent('销售订单导入模板.xlsx')} `
    );

    logger.info('销售订单导入模板下载成功，文件大小:', excelBuffer.length);
    res.send(excelBuffer);
  } catch (error) {
    logger.error('下载销售订单导入模板失败:', error);
    ResponseHandler.error(res, '下载销售订单导入模板失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取装箱单统计信息
 */

exports.getOrderUnshippedItems = async (req, res) => {
  let connection;

  try {
    const { id } = req.params; // 订单ID

    connection = await getConnection();

    // 查询订单基本信息
    const [orderResults] = await connection.query(
      `
      SELECT so.*, c.name as customer_name, c.contact_person, c.contact_phone
      FROM sales_orders so
      LEFT JOIN customers c ON so.customer_id = c.id
      WHERE so.id = ? OR so.order_no = ?
    `,
      [id, id]
    );

    if (orderResults.length === 0) {
      return ResponseHandler.error(res, '订单不存在', 'NOT_FOUND', 404);
    }

    const order = orderResults[0];

    // 首先获取订单的所有物料项
    const [orderItems] = await connection.query(
      `
      SELECT
  soi.id as order_item_id,
    soi.material_id,
    soi.quantity as ordered_quantity,
    soi.unit_price,
    soi.amount,
    m.code as material_code,
    m.name as material_name,
    m.specs as specification,
    m.unit_id,
    u.name as unit_name
      FROM sales_order_items soi
      LEFT JOIN materials m ON soi.material_id = m.id
      LEFT JOIN units u ON m.unit_id = u.id
      WHERE soi.order_id = ?
    ORDER BY m.code
      `,
      [order.id]
    );

    // 然后获取已发货数量（支持单订单和多订单出库）
    const [shippedItems] = await connection.query(
      `
  SELECT
  soi.material_id,
    SUM(sobi.quantity) as shipped_quantity
      FROM sales_order_items soi
      INNER JOIN sales_outbound_items sobi ON soi.material_id = sobi.product_id
      INNER JOIN sales_outbound sob ON sobi.outbound_id = sob.id
      WHERE soi.order_id = ?
    AND sob.status IN('completed', 'processing')
  AND(
    --单订单出库：直接匹配order_id
          sob.order_id = soi.order_id
          OR
          --多订单出库：检查related_orders字段
    (sob.is_multi_order = 1 AND sob.related_orders IS NOT NULL
           AND(
      JSON_CONTAINS(sob.related_orders, CAST(soi.order_id AS JSON))
             OR sob.related_orders LIKE CONCAT('%', soi.order_id, '%')
    ))
  )
      GROUP BY soi.material_id
    `,
      [order.id]
    );

    // 创建已发货数量映射
    const shippedMap = {};
    shippedItems.forEach((item) => {
      shippedMap[item.material_id] = parseFloat(item.shipped_quantity) || 0;
    });

    // 筛选出未完全发货的物料
    const unshippedItems = orderItems
      .map((item) => {
        const orderedQty = parseFloat(item.ordered_quantity) || 0;
        const shippedQty = shippedMap[item.material_id] || 0;
        const remainingQty = orderedQty - shippedQty;

        let shippingStatus = 'unshipped';
        if (shippedQty === 0) {
          shippingStatus = 'unshipped';
        } else if (shippedQty >= orderedQty) {
          shippingStatus = 'fully_shipped';
        } else {
          shippingStatus = 'partial_shipped';
        }

        return {
          id: item.order_item_id,
          material_id: item.material_id,
          material_code: item.material_code,
          material_name: item.material_name,
          specification: item.specification,
          unit_id: item.unit_id,
          unit_name: item.unit_name,
          ordered_quantity: orderedQty,
          shipped_quantity: shippedQty,
          remaining_quantity: remainingQty,
          quantity: remainingQty, // 默认出库数量为剩余数量
          unit_price: parseFloat(item.unit_price) || 0,
          amount: parseFloat(item.amount) || 0,
          shipping_status: shippingStatus,
        };
      })
      .filter((item) => item.shipping_status !== 'fully_shipped'); // 只返回未完全发货的物料

    // 组合结果
    const result = {
      ...order,
      items: unshippedItems,
      total_items: unshippedItems.length,
      unshipped_items_count: unshippedItems.filter((item) => item.shipping_status === 'unshipped')
        .length,
      partial_shipped_items_count: unshippedItems.filter(
        (item) => item.shipping_status === 'partial_shipped'
      ).length,
    };

    ResponseHandler.success(res, result, '操作成功');
  } catch (error) {
    logger.error('获取订单未发货物料失败:', error);
    ResponseHandler.error(res, '获取订单未发货物料失败', 'SERVER_ERROR', 500, error);
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

// 获取客户所有订单的产品明细

