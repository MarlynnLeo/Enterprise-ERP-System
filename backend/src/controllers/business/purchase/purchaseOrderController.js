/**
 * purchaseOrderController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const pool = db.pool; // 正确引用连接池
const purchaseModel = require('../../../models/purchase');
const {
  getPurchaseStatusText,
  generateStatusCaseSQL,
} = require('../../../constants/systemConstants');
const {
  PURCHASE_STATUS,
  PURCHASE_STATUS_TRANSITIONS,
  isValidStatusTransition,
  getStatusLabel,
} = require('../../../constants/purchaseConstants');
const PurchaseOrderService = require('../../../services/PurchaseOrderService');
const DBManager = require('../../../utils/dbManager');

// 获取采购订单列表
const getOrders = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      orderNo,
      contractCode,
      keyword,
      supplierId,
      operator,
      startDate,
      endDate,
      status,
    } = req.query;
    const offset = (page - 1) * pageSize;

    let query = `
      SELECT o.*, s.name as supplier_name, s.code as supplier_code,
             s.contact_person as supplier_contact_person,
             s.contact_phone as supplier_contact_phone,
             NULL as operator_name,
             COUNT(*) OVER() as total_count
      FROM purchase_orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      WHERE 1=1
    `;

    const queryParams = [];

    // 支持keyword参数同时搜索订单号和合同编码
    if (keyword) {
      query += ' AND (o.order_no LIKE ? OR o.contract_code LIKE ?)';
      queryParams.push(`%${keyword}%`, `%${keyword}%`);
    } else {
      // 兼容旧的独立参数
      if (orderNo) {
        query += ' AND o.order_no LIKE ?';
        queryParams.push(`%${orderNo}%`);
      }

      if (contractCode) {
        query += ' AND o.contract_code LIKE ?';
        queryParams.push(`%${contractCode}%`);
      }
    }

    // 注意: operator 字段在 purchase_orders 表中不存在，已移除相关过滤

    if (supplierId) {
      query += ' AND o.supplier_id = ?';
      queryParams.push(supplierId);
    }

    if (startDate) {
      query += ' AND o.order_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      query += ' AND o.order_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      query += ' AND o.status = ?';
      queryParams.push(status);
    }

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = parseInt(pageSize);
    const actualOffset = parseInt(offset);
    query += ` ORDER BY o.created_at DESC LIMIT ${actualPageSize} OFFSET ${actualOffset}`;

    // 使用正确的连接池查询方法
    const [rows] = await pool.query(query, queryParams);

    // 获取订单的物料详情
    const items = [];
    if (rows.length > 0) {
      const orderIds = rows.map((row) => row.id);
      if (orderIds.length > 0) {
        const placeholders = orderIds.map(() => '?').join(',');
        const itemsQuery = `
          SELECT poi.*,
                 COALESCE(poi.received_quantity, 0) as received_quantity,
                 COALESCE(poi.warehoused_quantity, 0) as warehoused_quantity,
                 CASE
                   WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.received_quantity, 0) / poi.quantity) * 100, 2)
                   ELSE 0
                 END as received_percentage,
                 CASE
                   WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.warehoused_quantity, 0) / poi.quantity) * 100, 2)
                   ELSE 0
                 END as warehoused_percentage
          FROM purchase_order_items poi
          WHERE poi.order_id IN (${placeholders})
          ORDER BY poi.id
        `;
        const [itemRows] = await pool.query(itemsQuery, orderIds);
        items.push(...itemRows);
      }
    }

    // 整合订单及其物料
    const orders = rows.map((row) => {
      const orderItems = items.filter((item) => item.order_id === row.id);

      // 添加前端期望的字段，映射数据库字段
      const orderWithMappedFields = {
        ...row,
        items: orderItems,
        order_number: row.order_no,
        notes: row.remarks,
      };

      return orderWithMappedFields;
    });

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

    res.json({
      items: orders,
      total: totalCount,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(totalCount / pageSize),
    });
  } catch (error) {
    logger.error('获取采购订单列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购订单详情
const getOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // 判断传入的是ID还是订单号
    const isNumericId = /^\d+$/.test(id);
    let orderId;

    if (isNumericId) {
      // 如果是纯数字，直接使用ID
      orderId = parseInt(id);
    } else {
      // 如果不是纯数字，按订单号查询获取ID
      const query = 'SELECT id FROM purchase_orders WHERE order_no = ?';
      const [rows] = await pool.query(query, [id]);

      if (rows.length === 0) {
        return res.status(404).json({ error: '采购订单不存在' });
      }

      orderId = rows[0].id;
    }

    // 使用getOrderById函数获取完整的订单信息（包含收货进度）
    const order = await getOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: '采购订单不存在' });
    }

    res.json(order);
  } catch (error) {
    logger.error('获取采购订单详情失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 创建采购订单
const createOrder = async (req, res) => {
  try {
    const {
      order_date: orderDate,
      supplier_id: supplierId,
      expected_delivery_date: expectedDeliveryDate,
      contact_person: contactPerson,
      contact_phone: contactPhone,
      remarks,
      total_amount: totalAmount,
      requisition_id: requisitionId,
      requisition_number: requisitionNumber,
      contract_code: contractCode,
      items,
    } = req.body;

    const createdOrder = await DBManager.executeTransaction(async (connection) => {
      // 验证供应商并获取供应商名称
      const supplierName = await PurchaseOrderService.validateSupplier(connection, supplierId);

      // 生成订单号（传入连接确保事务一致性）
      const orderNo = await purchaseModel.generateOrderNo(connection);

      // 创建采购订单（含税率字段）
      const taxRate = req.body.tax_rate !== undefined ? req.body.tax_rate : 0.13;
      const subtotal = req.body.subtotal || totalAmount / (1 + taxRate);
      const taxAmount = req.body.tax_amount || totalAmount - subtotal;

      const insertQuery = `
        INSERT INTO purchase_orders (
          order_no, order_date, supplier_id, supplier_name, contract_code,
          expected_delivery_date, contact_person, contact_phone, 
          total_amount, tax_rate, tax_amount, subtotal, remarks, status, requisition_id, requisition_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const [result] = await connection.query(insertQuery, [
        orderNo,
        orderDate,
        supplierId,
        supplierName,
        contractCode || null,
        expectedDeliveryDate,
        contactPerson,
        contactPhone,
        totalAmount || 0,
        taxRate,
        taxAmount,
        subtotal,
        remarks,
        req.body.status || 'draft',
        requisitionId || null,
        requisitionNumber || null,
      ]);

      const orderId = result.insertId;

      // 更新采购申请状态（如果有关联申请单）
      if (requisitionId) {
        await PurchaseOrderService.updateRequisitionStatus(connection, requisitionId, 'completed');
      }

      // 插入订单物料项目
      await PurchaseOrderService.insertOrderItems(connection, orderId, items);

      return orderId;
    });

    // 获取完整的订单信息
    const orderDetails = await getOrderById(createdOrder);

    ResponseHandler.success(res, orderDetails, '创建成功', 201);
  } catch (error) {
    logger.error('创建采购订单失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 更新采购订单
const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      order_date: orderDate,
      supplier_id: supplierId,
      expected_delivery_date: expectedDeliveryDate,
      contact_person: contactPerson,
      contact_phone: contactPhone,
      remarks,
      total_amount: totalAmount,
      requisition_id: requisitionId,
      requisition_number: requisitionNumber,
      contract_code: contractCode,
      items,
    } = req.body;

    const updatedOrder = await DBManager.executeTransaction(async (connection) => {
      // 验证订单是否可编辑
      await PurchaseOrderService.validateOrderEditable(connection, id);

      // 验证供应商并获取供应商名称
      const supplierName = await PurchaseOrderService.validateSupplier(connection, supplierId);

      // 更新采购订单基本信息
      const updateQuery = `
        UPDATE purchase_orders
        SET order_date = ?, supplier_id = ?, supplier_name = ?, contract_code = ?,
            expected_delivery_date = ?, contact_person = ?, contact_phone = ?,
            total_amount = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP,
            requisition_id = ?, requisition_number = ?
        WHERE id = ?
      `;
      await connection.query(updateQuery, [
        orderDate,
        supplierId,
        supplierName,
        contractCode || null,
        expectedDeliveryDate,
        contactPerson,
        contactPhone,
        totalAmount || 0,
        remarks,
        requisitionId || null,
        requisitionNumber || null,
        id,
      ]);

      // 更新采购申请状态（如果有关联申请单）
      if (requisitionId) {
        await PurchaseOrderService.updateRequisitionStatus(connection, requisitionId, 'completed');
      }

      // 删除原有物料项目
      await connection.query('DELETE FROM purchase_order_items WHERE order_id = ?', [id]);

      // 插入新的物料项目
      await PurchaseOrderService.insertOrderItems(connection, id, items);

      return id;
    });

    // 获取更新后的订单信息
    const orderDetails = await getOrderById(updatedOrder);

    res.json(orderDetails);
  } catch (error) {
    logger.error('更新采购订单失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 删除采购订单
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    await DBManager.executeTransaction(async (connection) => {
      // 验证订单是否可编辑（删除）
      await PurchaseOrderService.validateOrderEditable(connection, id);

      // 删除订单 (物料项目会通过外键CASCADE自动删除)
      await connection.query('DELETE FROM purchase_orders WHERE id = ?', [id]);
    });

    res.json({ message: '采购订单删除成功' });
  } catch (error) {
    logger.error('删除采购订单失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 更新采购订单状态
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // 从请求体中获取状态 - 支持多种格式
    let newStatus;
    if (req.body.newStatus) {
      newStatus = req.body.newStatus;
    } else if (req.body.status) {
      newStatus = req.body.status;
    } else if (typeof req.body === 'string') {
      newStatus = req.body;
    } else {
      return res.status(400).json({
        error: '无效的状态格式',
        receivedBody: req.body,
      });
    }

    // 检查状态值是否有效（使用统一常量）
    const validStatuses = Object.values(PURCHASE_STATUS);
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({
        error: '无效的状态值',
        receivedStatus: newStatus,
        validStatuses: validStatuses,
      });
    }

    const updatedOrder = await DBManager.executeTransaction(async (connection) => {
      // 检查订单是否存在
      const [checkRows] = await connection.query('SELECT * FROM purchase_orders WHERE id = ?', [
        id,
      ]);

      if (checkRows.length === 0) {
        throw new Error('采购订单不存在');
      }

      const currentOrder = checkRows[0];
      const currentStatus = currentOrder.status;

      // 如果状态没有变化，直接返回（允许保持相同状态）
      if (currentStatus === newStatus) {
        logger.info(`订单状态保持不变: ${currentStatus}`);
        return id;
      }

      // ✅ 使用统一的状态流转规则
      if (!isValidStatusTransition(currentStatus, newStatus)) {
        throw new Error(
          `无效的状态变更: 从 ${getStatusLabel(currentStatus)} 到 ${getStatusLabel(newStatus)}`
        );
      }

      // 更新状态
      const updateQuery = `
        UPDATE purchase_orders
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      await connection.query(updateQuery, [newStatus, id]);

      return id;
    });

    // 获取更新后的订单
    const orderDetails = await getOrderById(updatedOrder);

    res.json(orderDetails);
  } catch (error) {
    logger.error('更新采购订单状态失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购统计数据
const getStatistics = async (req, res) => {
  try {
    // 获取订单数量统计
    const ordersCountQuery = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.DRAFT}' THEN 1 END) as draft_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.PENDING}' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.APPROVED}' THEN 1 END) as approved_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.COMPLETED}' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = '${PURCHASE_STATUS.CANCELLED}' THEN 1 END) as cancelled_orders
      FROM purchase_orders
    `;
    const [countRows] = await pool.query(ordersCountQuery);

    // 获取本月订单金额
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const monthlyAmountQuery = `
      SELECT COALESCE(SUM(total_amount), 0) as monthly_amount
      FROM purchase_orders
      WHERE order_date BETWEEN ? AND ?
    `;
    const [amountRows] = await pool.query(monthlyAmountQuery, [
      firstDayOfMonth.toISOString().split('T')[0],
      lastDayOfMonth.toISOString().split('T')[0],
    ]);

    // 获取Top5供应商
    const topSuppliersQuery = `
      SELECT supplier_id, supplier_name, COUNT(*) as order_count, SUM(total_amount) as total_spent
      FROM purchase_orders
      WHERE status IN ('${PURCHASE_STATUS.APPROVED}', '${PURCHASE_STATUS.COMPLETED}')
      GROUP BY supplier_id, supplier_name
      ORDER BY total_spent DESC
      LIMIT 5
    `;
    const [supplierRows] = await pool.query(topSuppliersQuery);

    res.json({
      counts: countRows[0],
      monthlyAmount: amountRows[0].monthly_amount,
      topSuppliers: supplierRows,
    });
  } catch (error) {
    logger.error('获取采购统计数据失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 根据ID获取采购订单信息（内部使用）
const getOrderById = async (id) => {
  try {
    // 获取订单基本信息,包含供应商编码
    const query = `
      SELECT o.*, s.code as supplier_code
      FROM purchase_orders o
      LEFT JOIN suppliers s ON o.supplier_id = s.id
      WHERE o.id = ?
    `;
    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return null;
    }

    const order = rows[0];

    // 获取订单物料，关联单位表获取单位名称，包含收货进度信息
    const itemsQuery = `
      SELECT
        poi.*,
        po.order_no,
        COALESCE(u1.name, u2.name) as unit_name,
        COALESCE(poi.unit_id, m.unit_id) as effective_unit_id,
        COALESCE(poi.received_quantity, 0) as received_quantity,
        COALESCE(poi.warehoused_quantity, 0) as warehoused_quantity,
        COALESCE(SUM(qi.unqualified_quantity), 0) as unqualified_quantity,
        CASE
          WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.received_quantity, 0) / poi.quantity) * 100, 2)
          ELSE 0
        END as received_percentage,
        CASE
          WHEN poi.quantity > 0 THEN ROUND((COALESCE(poi.warehoused_quantity, 0) / poi.quantity) * 100, 2)
          ELSE 0
        END as warehoused_percentage,
        (poi.quantity - COALESCE(poi.received_quantity, 0)) as pending_quantity
      FROM
        purchase_order_items poi
        LEFT JOIN purchase_orders po ON poi.order_id = po.id
        LEFT JOIN units u1 ON poi.unit_id = u1.id
        LEFT JOIN materials m ON poi.material_id = m.id
        LEFT JOIN units u2 ON m.unit_id = u2.id
        LEFT JOIN quality_inspections qi ON (qi.reference_id = poi.order_id OR qi.reference_no = po.order_no)
          AND qi.material_id = poi.material_id
          AND qi.inspection_type = 'incoming'
      WHERE
        poi.order_id = ?
      GROUP BY
        poi.id, po.order_no, u1.name, u2.name, poi.unit_id, m.unit_id, poi.received_quantity, poi.warehoused_quantity
      ORDER BY
        poi.id
    `;
    const [itemRows] = await pool.query(itemsQuery, [id]);

    // 计算订单整体完成度
    let totalQuantity = 0;
    let totalReceived = 0;
    let totalWarehoused = 0;

    itemRows.forEach((item) => {
      totalQuantity += parseFloat(item.quantity) || 0;
      totalReceived += parseFloat(item.received_quantity) || 0;
      totalWarehoused += parseFloat(item.warehoused_quantity) || 0;
    });

    order.items = itemRows;
    order.total_quantity = totalQuantity;
    order.total_received = totalReceived;
    order.total_warehoused = totalWarehoused;
    order.received_percentage =
      totalQuantity > 0 ? Math.round((totalReceived / totalQuantity) * 100 * 100) / 100 : 0;
    order.warehoused_percentage =
      totalQuantity > 0 ? Math.round((totalWarehoused / totalQuantity) * 100 * 100) / 100 : 0;
    order.pending_quantity = totalQuantity - totalReceived;

    // 添加前端期望的字段，映射数据库字段
    order.order_number = order.order_no;
    order.notes = order.remarks;

    return order;
  } catch (error) {
    logger.error('获取采购订单详情失败:', error);
    throw error;
  }
};

// 获取供应商列表（用于采购订单中选择）
const getSuppliers = async (req, res) => {
  try {
    const { status, limit } = req.query;
    let query = 'SELECT id, code, name, contact_person, contact_phone, status FROM suppliers';
    const queryParams = [];

    // 如果指定了状态，则添加过滤条件
    if (status !== undefined) {
      query += ' WHERE status = ?';
      queryParams.push(status);
    }

    query += ' ORDER BY code';

    // 如果指定了限制数量
    if (limit) {
      const safeLimit = parseInt(limit, 10) || 100;
      query += ` LIMIT ${safeLimit}`;
    }

    const [rows] = await pool.query(query, queryParams);

    res.json(rows);
  } catch (error) {
    logger.error('获取供应商列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

const getRequisitions = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, requisitionNo, status } = req.query;
    const offset = (page - 1) * pageSize;

    // 默认只显示已批准的采购申请，除非明确指定其他状态
    const defaultStatus = status || 'approved';

    let query = `
      SELECT r.*, u.real_name as user_real_name, COUNT(*) OVER() as total_count
      FROM purchase_requisitions r
      LEFT JOIN users u ON r.requester = u.username
      WHERE r.status = ?
    `;

    const queryParams = [defaultStatus];

    if (requisitionNo) {
      query += ' AND r.requisition_number LIKE ?';
      queryParams.push(`%${requisitionNo}%`);
    }

    // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
    const actualPageSize = Number(pageSize);
    const actualOffset = Number(offset);
    query += ` ORDER BY r.created_at DESC LIMIT ${actualPageSize} OFFSET ${actualOffset}`;

    const [rows] = await pool.query(query, queryParams);

    // 获取申请单的物料详情
    const items = [];
    if (rows.length > 0) {
      const requisitionIds = rows.map((row) => row.id);
      const itemsQuery = `
        SELECT * FROM purchase_requisition_items
        WHERE requisition_id IN (?)
        ORDER BY id
      `;
      const [itemRows] = await pool.query(itemsQuery, [requisitionIds]);
      items.push(...itemRows);

      // 获取已订购数量统计（用于计算采购状态）
      const orderedQuery = `
        SELECT po.requisition_id, poi.material_code, SUM(poi.quantity) as ordered_qty
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.order_id = po.id
        WHERE po.requisition_id IN (?)
        AND po.requisition_id IS NOT NULL
        GROUP BY po.requisition_id, poi.material_code
      `;
      const [orderedRows] = await pool.query(orderedQuery, [requisitionIds]);

      // 将已订购信息附加到items上
      items.forEach((item) => {
        const orderedInfo = orderedRows.find(
          (r) => r.requisition_id === item.requisition_id && r.material_code === item.material_code
        );
        item.ordered_quantity = orderedInfo ? parseFloat(orderedInfo.ordered_qty) : 0;
      });
    }

    // 整合申请单及其物料，确保real_name有值
    const requisitions = rows.map((row) => {
      const requisitionItems = items.filter((item) => item.requisition_id === row.id);

      // 优先使用数据库中的real_name，如果为空则使用user_real_name
      if ((!row.real_name || row.real_name === '') && row.user_real_name) {
        row.real_name = row.user_real_name;
      }

      // 移除临时字段
      delete row.user_real_name;

      const processedReq = {
        ...row,
        materials: requisitionItems,
        // 判断是否全部生成订单（所有物料都有采购订单，不管数量）
        is_fully_ordered:
          requisitionItems.length > 0 &&
          requisitionItems.every((item) => item.ordered_quantity > 0),
        // 判断是否部分生成订单（部分物料有订单，部分没有）
        is_partially_ordered: false, // 初始值，下面计算
      };

      // 计算部分订购状态：至少有一个物料有订单，且至少有一个物料没订单
      if (requisitionItems.length > 0 && !processedReq.is_fully_ordered) {
        const hasAnyOrdered = requisitionItems.some((item) => item.ordered_quantity > 0);
        processedReq.is_partially_ordered = hasAnyOrdered;
      }

      return processedReq;
    });

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count) : 0;

    res.json({
      items: requisitions,
      total: totalCount,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(totalCount / pageSize),
    });
  } catch (error) {
    logger.error('获取采购申请列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

const getRequisition = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取申请单基本信息，包括real_name字段，允许获取已批准或已完成状态的申请单
    const query =
      'SELECT r.*, u.real_name as user_real_name FROM purchase_requisitions r LEFT JOIN users u ON r.requester = u.username WHERE r.id = ? AND r.status IN (?, ?)';
    const [rows] = await pool.query(query, [id, 'approved', 'completed']);

    if (rows.length === 0) {
      return res.status(404).json({ error: '采购申请不存在或状态不是已批准/已完成' });
    }

    const requisition = rows[0];

    // 如果real_name为空，使用user_real_name
    if ((!requisition.real_name || requisition.real_name === '') && requisition.user_real_name) {
      requisition.real_name = requisition.user_real_name;
    }

    // 删除临时字段
    delete requisition.user_real_name;

    // 获取申请单物料
    const itemsQuery =
      'SELECT * FROM purchase_requisition_items WHERE requisition_id = ? ORDER BY id';
    const [itemRows] = await pool.query(itemsQuery, [id]);

    // 获取已订购数量统计（用于过滤已采购物料）
    const orderedQuery = `
      SELECT poi.material_code, SUM(poi.quantity) as ordered_qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.order_id = po.id
      WHERE po.requisition_id = ?
      AND po.requisition_id IS NOT NULL
      GROUP BY poi.material_code
    `;
    const [orderedRows] = await pool.query(orderedQuery, [id]);

    // 将已订购信息附加到物料上
    itemRows.forEach((item) => {
      const orderedInfo = orderedRows.find((r) => r.material_code === item.material_code);
      item.ordered_quantity = orderedInfo ? parseFloat(orderedInfo.ordered_qty) : 0;
    });

    requisition.materials = itemRows;

    res.json(requisition);
  } catch (error) {
    logger.error('获取采购申请详情失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购综合统计数据（用于数据概览）
const getPurchaseDashboardStats = async (req, res) => {
  try {
    // 使用服务层获取数据
    const PurchaseDashboardService = require('../../../services/business/PurchaseDashboardService');
    const dashboardData = await PurchaseDashboardService.getDashboardData();

    res.json(dashboardData);
  } catch (error) {
    logger.error('获取采购综合统计数据失败:', error);
    res.status(500).json({
      error: error.message,
      statistics: {
        requisitions: { total: 0, pending: 0 },
        orders: { total: 0, pending: 0 },
        receipts: { total: 0, pending: 0 },
        returns: { total: 0, pending: 0 },
      },
      trendData: [],
      categoryDistribution: [],
      pendingItems: [],
    });
  }
};

// 更新采购订单物料收货数量
const updateOrderItemsReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '缺少物料收货信息' });
    }

    // 引入采购订单状态服务
    const PurchaseOrderStatusService = require('../../../services/business/PurchaseOrderStatusService');

    // 使用事务更新所有物料的收货数量
    await DBManager.executeTransaction(async (connection) => {
      for (const item of items) {
        if (item.material_id && item.receive_quantity > 0) {
          await PurchaseOrderStatusService.updateOrderItemReceivedQuantity(
            id,
            item.material_id,
            parseFloat(item.receive_quantity) || 0, // 已收货数量
            0, // ✅ 到货时不更新已入库数量，等检验合格后入库时再更新
            connection
          );
        }
      }
    });

    res.json({ message: '收货数量更新成功' });
  } catch (error) {
    logger.error('更新采购订单物料收货数量失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

/**
 * 获取物料的最新采购指导价 (Purchase Info Record 模拟)
 * 三级降级策略：供应商历史价 → 全局历史价 → 物料主数据预估价
 */
const getLatestPrice = async (req, res) => {
  try {
    const { material_id, material_code, supplier_id } = req.query;
    
    // 物料标识是必须的，供应商可选（未选供应商时直接走全局历史查询）
    if (!material_id && !material_code) {
      return ResponseHandler.error(res, '缺少必要参数 (物料编码或物料ID)', 'BAD_REQUEST', 400);
    }
    
    // 第一层：查找该供应商历史上卖给我们这个物料的最新有效价格（仅当供应商已选定时）
    if (supplier_id) {
      const supplierQuery = `
        SELECT poi.price, po.order_date
        FROM purchase_order_items poi
        JOIN purchase_orders po ON poi.order_id = po.id
        WHERE (poi.material_id = ? OR poi.material_code = ?) 
          AND po.supplier_id = ?
          AND po.status NOT IN ('cancelled')
          AND poi.price > 0
        ORDER BY po.order_date DESC, po.id DESC
        LIMIT 1
      `;
      const [supplierRows] = await pool.execute(supplierQuery, [material_id || null, material_code || '', supplier_id]);
      
      if (supplierRows.length > 0) {
        return ResponseHandler.success(res, {
          price: supplierRows[0].price,
          source: 'supplier_history',
          last_date: supplierRows[0].order_date
        }, '获取供应商历史最新价成功');
      }
    }
    
    // 第二层：查找所有供应商历史上卖给我们这个物料的最新有效价格
    const globalQuery = `
      SELECT poi.price, po.order_date, s.name as supplier_name
      FROM purchase_order_items poi
      JOIN purchase_orders po ON poi.order_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE (poi.material_id = ? OR poi.material_code = ?) 
        AND po.status NOT IN ('cancelled')
        AND poi.price > 0
      ORDER BY po.order_date DESC, po.id DESC
      LIMIT 1
    `;
    const [globalRows] = await pool.execute(globalQuery, [material_id || null, material_code || '']);
    
    if (globalRows.length > 0) {
      return ResponseHandler.success(res, {
        price: globalRows[0].price,
        source: 'other_supplier_history',
        last_supplier: globalRows[0].supplier_name,
        last_date: globalRows[0].order_date
      }, '获取全局历史最新参考价成功');
    }
    
    // 第三层：从物料主数据提取预估成本价作为兜底
    const matQuery = `
      SELECT cost_price, price FROM materials 
      WHERE (id = ? OR code = ?)
      LIMIT 1
    `;
    const [matRows] = await pool.execute(matQuery, [material_id || null, material_code || '']);
    
    if (matRows.length > 0) {
      const mat = matRows[0];
      const fallbackPrice = parseFloat(mat.cost_price) || parseFloat(mat.price) || 0;
      return ResponseHandler.success(res, {
        price: fallbackPrice,
        source: 'material_master',
      }, '获取物料默认预估价成功');
    }
    
    return ResponseHandler.success(res, {
      price: 0,
      source: 'none'
    }, '无历史价格参考');

  } catch (error) {
    logger.error('获取最新指导价失败:', error);
    return ResponseHandler.error(res, '获取指导价失败', 'SERVER_ERROR', 500, error);
  }
};

module.exports = {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  updateOrderStatus,
  updateOrderItemsReceived,
  getStatistics,
  getPurchaseDashboardStats,
  getSuppliers,
  getRequisitions,
  getRequisition,
  getLatestPrice,
};
