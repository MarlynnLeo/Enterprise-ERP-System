/**
 * processingController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const db = require('../../config/db');
const purchaseModel = require('../../models/purchase');
const FinanceIntegrationService = require('../../services/external/FinanceIntegrationService');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const InventoryService = require('../../services/InventoryService');
const { safeString, safeNumber } = require('../../utils/typeHelper');
const { appendPaginationSQL } = require('../../utils/safePagination');

// 状态常量
const STATUS = {
  PROCESSING: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

// 加工单状态转换规则
const PROCESSING_STATUS_TRANSITIONS = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
};

// 入库单独立状态转换规则（入库单业务流程与加工单不同）
const RECEIPT_STATUS_TRANSITIONS = {
  pending: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['completed', 'cancelled']),
  completed: new Set(),
  cancelled: new Set(),
};

/**
 * 获取外委加工单列表
 */
const getProcessings = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      limit = 10,
      processing_no = '',
      supplier_name = '',
      status = '',
      start_date = '',
      end_date = '',
    } = req.query;

    // 统一使用pageSize，兼容limit参数
    const actualPageSize = parseInt(pageSize || limit, 10);

    let query = `
      SELECT * FROM outsourced_processings
      WHERE 1=1
    `;

    const params = [];

    if (processing_no) {
      query += ' AND processing_no LIKE ?';
      params.push(`%${processing_no}%`);
    }

    if (supplier_name) {
      query += ' AND supplier_name LIKE ?';
      params.push(`%${supplier_name}%`);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (start_date && end_date) {
      query += ' AND processing_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    // 获取总数
    const [countResult] = await db.pool.execute(
      `SELECT COUNT(*) as total FROM (${query}) as countTable`,
      params
    );

    const total = countResult[0].total;

    // 转换分页参数为整数
    const pageInt = parseInt(page, 10);
    const offset = (pageInt - 1) * actualPageSize;

    // 使用统一分页工具追加 LIMIT/OFFSET
    query = appendPaginationSQL(query + ' ORDER BY id DESC', actualPageSize, offset);

    // 使用原始参数数组，不添加分页参数
    const [rows] = await db.pool.execute(query, params);

    // 返回前端期望的格式
    return ResponseHandler.paginated(res, rows, total, pageInt, actualPageSize, '获取外委加工单列表成功');
  } catch (error) {
    logger.error('获取外委加工单列表失败:', error);
    ResponseHandler.error(res, '获取外委加工单列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取单个外委加工单详情
 */
const getProcessing = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取加工单主信息
    const [processing] = await db.pool.execute(
      'SELECT * FROM outsourced_processings WHERE id = ?',
      [id]
    );

    if (processing.length === 0) {
      return ResponseHandler.error(res, '外委加工单不存在', 'NOT_FOUND', 404);
    }

    // 获取发料信息
    const [materials] = await db.pool.execute(
      'SELECT * FROM outsourced_processing_materials WHERE processing_id = ?',
      [id]
    );

    // 获取成品信息
    const [products] = await db.pool.execute(
      'SELECT * FROM outsourced_processing_products WHERE processing_id = ?',
      [id]
    );

    return ResponseHandler.success(res, {
      ...processing[0],
      materials,
      products,
    });
  } catch (error) {
    logger.error('获取外委加工单详情失败:', error);
    ResponseHandler.error(res, '获取外委加工单详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 创建外委加工单
 */
const createProcessing = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      processing_date,
      supplier_id,
      supplier_name,
      expected_delivery_date,
      contact_person,
      contact_phone,
      remarks,
      materials,
      products,
    } = req.body;

    // 处理外委加工单数据

    // 生成加工单号
    const processing_no = await purchaseModel.generateProcessingNo();

    // 计算总金额，确保不会有NaN
    const total_amount =
      products && products.length > 0
        ? products.reduce((sum, product) => sum + (parseFloat(product.total_price || 0) || 0), 0)
        : 0;


    // 插入加工单主表，确保所有值都是安全的
    const [result] = await connection.execute(
      `INSERT INTO outsourced_processings (
        processing_no, processing_date, supplier_id, supplier_name,
        expected_delivery_date, contact_person, contact_phone,
        total_amount, remarks, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        safeString(processing_no),
        safeString(processing_date),
        safeNumber(supplier_id),
        safeString(supplier_name),
        safeString(expected_delivery_date),
        safeString(contact_person),
        safeString(contact_phone),
        safeNumber(total_amount),
        safeString(remarks),
      ]
    );

    const processing_id = result.insertId;

    // 批量插入发料明细
    if (materials && materials.length > 0) {
      const matPlaceholders = materials.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const matValues = materials.flatMap(m => [
        processing_id,
        safeNumber(m.material_id),
        safeString(m.material_code),
        safeString(m.material_name),
        safeString(m.specification),
        safeString(m.unit),
        safeNumber(m.unit_id),
        safeNumber(m.quantity || 0),
        safeString(m.remark),
      ]);
      await connection.execute(
        `INSERT INTO outsourced_processing_materials (
          processing_id, material_id, material_code, material_name,
          specification, unit, unit_id, quantity, remark
        ) VALUES ${matPlaceholders}`,
        matValues
      );
    }

    // 批量插入成品明细
    if (products && products.length > 0) {
      const prodPlaceholders = products.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const prodValues = products.flatMap(p => [
        processing_id,
        safeNumber(p.product_id),
        safeString(p.product_code),
        safeString(p.product_name),
        safeString(p.specification),
        safeString(p.unit),
        safeNumber(p.unit_id),
        safeNumber(p.quantity || 0),
        safeNumber(p.unit_price || 0),
        safeNumber(p.total_price || 0),
        safeString(p.remark),
      ]);
      await connection.execute(
        `INSERT INTO outsourced_processing_products (
          processing_id, product_id, product_code, product_name,
          specification, unit, unit_id, quantity, unit_price, total_price, remark
        ) VALUES ${prodPlaceholders}`,
        prodValues
      );
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      { id: processing_id, processing_no },
      '外委加工单创建成功',
      201
    );
  } catch (error) {
    await connection.rollback();
    logger.error('创建外委加工单失败:', error);
    logger.error('错误详情:', error.stack);
    ResponseHandler.error(res, '创建外委加工单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新外委加工单
 */
const updateProcessing = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      processing_date,
      supplier_id,
      supplier_name,
      expected_delivery_date,
      contact_person,
      contact_phone,
      remarks,
      location_id,
      warehouse_name,
      materials,
      products,
    } = req.body;

    // 更新外委加工单数据

    // 检查加工单是否存在且状态为待确认
    const [existingProcessing] = await connection.execute(
      'SELECT status FROM outsourced_processings WHERE id = ?',
      [id]
    );

    if (existingProcessing.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '外委加工单不存在', 'NOT_FOUND', 404);
    }

    if (existingProcessing[0].status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能修改待确认状态的加工单', 'VALIDATION_ERROR', 400);
    }


    // 计算总金额，确保不会有NaN
    const total_amount =
      products && products.length > 0
        ? products.reduce((sum, product) => sum + (parseFloat(product.total_price || 0) || 0), 0)
        : 0;

    // 更新加工单主表
    await connection.execute(
      `UPDATE outsourced_processings SET
        processing_date = ?, supplier_id = ?, supplier_name = ?,
        expected_delivery_date = ?, contact_person = ?, contact_phone = ?,
        location_id = ?, warehouse_name = ?, total_amount = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        safeString(processing_date),
        safeNumber(supplier_id),
        safeString(supplier_name),
        safeString(expected_delivery_date),
        safeString(contact_person),
        safeString(contact_phone),
        safeNumber(location_id),
        safeString(warehouse_name),
        safeNumber(total_amount),
        safeString(remarks),
        id,
      ]
    );

    // 删除旧的发料明细
    await connection.execute(
      'DELETE FROM outsourced_processing_materials WHERE processing_id = ?',
      [id]
    );

    // 删除旧的成品明细
    await connection.execute('DELETE FROM outsourced_processing_products WHERE processing_id = ?', [
      id,
    ]);

    // 批量插入新的发料明细
    if (materials && materials.length > 0) {
      const matPlaceholders = materials.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const matValues = materials.flatMap(m => [
        id,
        safeNumber(m.material_id),
        safeString(m.material_code),
        safeString(m.material_name),
        safeString(m.specification),
        safeString(m.unit),
        safeNumber(m.unit_id),
        safeNumber(m.quantity || 0),
        safeString(m.remark),
      ]);
      await connection.execute(
        `INSERT INTO outsourced_processing_materials (
          processing_id, material_id, material_code, material_name,
          specification, unit, unit_id, quantity, remark
        ) VALUES ${matPlaceholders}`,
        matValues
      );
    }

    // 批量插入新的成品明细
    if (products && products.length > 0) {
      const prodPlaceholders = products.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const prodValues = products.flatMap(p => [
        id,
        safeNumber(p.product_id),
        safeString(p.product_code),
        safeString(p.product_name),
        safeString(p.specification),
        safeString(p.unit),
        safeNumber(p.unit_id),
        safeNumber(p.quantity || 0),
        safeNumber(p.unit_price || 0),
        safeNumber(p.total_price || 0),
        safeString(p.remark),
      ]);
      await connection.execute(
        `INSERT INTO outsourced_processing_products (
          processing_id, product_id, product_code, product_name,
          specification, unit, unit_id, quantity, unit_price, total_price, remark
        ) VALUES ${prodPlaceholders}`,
        prodValues
      );
    }

    await connection.commit();

    ResponseHandler.success(res, null, '外委加工单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新外委加工单失败:', error);
    logger.error('错误详情:', error.stack);
    ResponseHandler.error(res, '更新外委加工单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除外委加工单
 */
const deleteProcessing = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // 检查加工单是否存在且状态为待确认
    const [existingProcessing] = await connection.execute(
      'SELECT status FROM outsourced_processings WHERE id = ?',
      [id]
    );

    if (existingProcessing.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '外委加工单不存在', 'NOT_FOUND', 404);
    }

    if (existingProcessing[0].status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能删除待确认状态的加工单', 'VALIDATION_ERROR', 400);
    }

    // 删除相关明细记录
    await connection.execute(
      'DELETE FROM outsourced_processing_materials WHERE processing_id = ?',
      [id]
    );

    await connection.execute('DELETE FROM outsourced_processing_products WHERE processing_id = ?', [
      id,
    ]);

    // 删除主表记录
    await connection.execute('DELETE FROM outsourced_processings WHERE id = ?', [id]);

    await connection.commit();

    ResponseHandler.success(res, null, '外委加工单删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除外委加工单失败:', error);
    ResponseHandler.error(res, '删除外委加工单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新外委加工单状态
 */
const updateProcessingStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    // 初始化warnings数组
    const warnings = [];

    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
    }

    // 检查加工单是否存在
    const [existingProcessing] = await connection.execute(
      'SELECT * FROM outsourced_processings WHERE id = ?',
      [id]
    );

    if (existingProcessing.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '外委加工单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = existingProcessing[0].status;
    if (currentStatus === status) {
      await connection.rollback();
      return ResponseHandler.success(res, null, '外委加工单状态未变化');
    }

    if (!PROCESSING_STATUS_TRANSITIONS[currentStatus]?.has(status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `外委加工单不能从 ${currentStatus} 变更为 ${status}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 更新加工单状态
    await connection.execute(
      'UPDATE outsourced_processings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    // 如果状态为已确认，则尝试减少发料物料的库存
    if (status === STATUS.PROCESSING.CONFIRMED) {
      // 获取发料明细
      const [materials] = await connection.execute(
        'SELECT * FROM outsourced_processing_materials WHERE processing_id = ?',
        [id]
      );

      // 使用加工单中指定的仓库，如果没有则从物料基础资料获取
      // InventoryService 已在文件顶部引入

      // 减少每个发料物料的库存
      for (const material of materials) {
        // 优先使用加工单指定的仓库，其次使用物料基础资料中配置的默认仓库
        let usedWarehouseId;

        if (existingProcessing[0].location_id) {
          usedWarehouseId = existingProcessing[0].location_id;
        } else {
          // 通过统一方法获取物料默认仓库
          usedWarehouseId = await InventoryService.getMaterialLocation(material.material_id, connection);
        }

        try {
          // 使用统一的 InventoryService 更新库存（已在循环外引入）
          await InventoryService.updateStock(
            {
              materialId: material.material_id,
              locationId: usedWarehouseId,
              quantity: -parseFloat(material.quantity), // 出库为负数
              transactionType: 'outsourced_outbound',
              referenceNo: existingProcessing[0].processing_no,
              referenceType: 'outsourced_processing_material',
              operator: 'system',
              remark: `外委加工发料 ${existingProcessing[0].processing_no}`,
              unitId: material.unit_id,
              batchNumber: null,
            },
            connection
          );
          logger.info(`✅ 外委发料扣减成功: 物料ID=${material.material_id}, 数量=${material.quantity}`);
        } catch (stockError) {
          warnings.push(`物料 ${material.material_name} 扣减失败: ${stockError.message}`);
          throw stockError; // 抛出错误以回滚事务，防止发料不成功却更新状态
        }
      }

      // ✅ 自动生成外委发料会计分录
      try {
        const glResult = await FinanceIntegrationService.generateOutsourcedIssueEntry(
          existingProcessing[0],
          materials,
          connection
        );
        if (!glResult.success) {
          throw new Error(glResult.message || glResult.error || '外委发料分录生成失败');
        }
        if (glResult.success) {
          logger.info(`外委发料分录生成成功: ${existingProcessing[0].processing_no}`);
        }
      } catch (glError) {
        logger.error('外委发料分录生成失败:', glError.message);
        warnings.push('外委发料分录生成异常');
        throw glError;
      }
    }

    // 如果从已确认状态取消，需要回退已扣减的发料库存
    if (status === 'cancelled' && currentStatus === STATUS.PROCESSING.CONFIRMED) {
      const [materials] = await connection.execute(
        'SELECT * FROM outsourced_processing_materials WHERE processing_id = ?',
        [id]
      );

      if (materials.length > 0) {
        // InventoryService 已在文件顶部引入

        for (const material of materials) {
          // 使用与发料时相同的仓库逻辑
          let usedWarehouseId;
          if (existingProcessing[0].location_id) {
            usedWarehouseId = existingProcessing[0].location_id;
          } else {
            usedWarehouseId = await InventoryService.getMaterialLocation(material.material_id, connection);
          }

          try {
            // 正数 = 退回库存
            await InventoryService.updateStock(
              {
                materialId: material.material_id,
                locationId: usedWarehouseId,
                quantity: parseFloat(material.quantity),
                transactionType: 'outsourced_return',
                referenceNo: existingProcessing[0].processing_no,
                referenceType: 'outsourced_processing_cancel',
                operator: 'system',
                remark: `外委加工取消退料 ${existingProcessing[0].processing_no}`,
                unitId: material.unit_id,
                batchNumber: null,
              },
              connection
            );
            logger.info(`✅ 外委取消退料成功: 物料ID=${material.material_id}, 数量=${material.quantity}`);
          } catch (returnError) {
            logger.error(`外委取消退料失败: 物料ID=${material.material_id}`, returnError.message);
            throw returnError;
          }
        }

        logger.info(`外委加工单 ${existingProcessing[0].processing_no} 取消，已回退 ${materials.length} 个物料的库存`);
        warnings.push(`已回退 ${materials.length} 个发料物料的库存，请检查关联的外委发料会计分录是否需要手动冲销`);
      }
    }

    await connection.commit();

    const responseData = warnings && warnings.length > 0 ? { warnings } : null;
    ResponseHandler.success(res, responseData, '外委加工单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新外委加工单状态失败:', error);
    ResponseHandler.error(res, '更新外委加工单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 获取外委加工入库单列表
 */
const getReceipts = async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      limit = 10,
      receipt_no = '',
      processing_no = '',
      supplier_name = '',
      status = '',
      start_date = '',
      end_date = '',
    } = req.query;

    // 统一使用pageSize，兼容limit参数
    const actualPageSize = parseInt(pageSize || limit, 10);

    let query = `
      SELECT * FROM outsourced_processing_receipts
      WHERE 1=1
    `;

    const params = [];

    if (receipt_no) {
      query += ' AND receipt_no LIKE ?';
      params.push(`%${receipt_no}%`);
    }

    if (processing_no) {
      query += ' AND processing_no LIKE ?';
      params.push(`%${processing_no}%`);
    }

    if (supplier_name) {
      query += ' AND supplier_name LIKE ?';
      params.push(`%${supplier_name}%`);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (start_date && end_date) {
      query += ' AND receipt_date BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    // 获取总数
    const [countResult] = await db.pool.execute(
      `SELECT COUNT(*) as total FROM (${query}) as countTable`,
      params
    );

    const total = countResult[0].total;

    // 转换分页参数为整数
    const pageInt = parseInt(page, 10);
    const offset = (pageInt - 1) * actualPageSize;

    // 使用统一分页工具追加 LIMIT/OFFSET
    query = appendPaginationSQL(query + ' ORDER BY id DESC', actualPageSize, offset);

    // 使用原始参数数组，不添加分页参数
    const [rows] = await db.pool.execute(query, params);

    // 返回前端期望的格式
    return ResponseHandler.paginated(res, rows, total, pageInt, actualPageSize, '获取外委加工入库单列表成功');
  } catch (error) {
    logger.error('获取外委加工入库单列表失败:', error);
    ResponseHandler.error(res, '获取外委加工入库单列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取单个外委加工入库单详情
 */
const getReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取入库单主信息
    const [receipt] = await db.pool.execute(
      'SELECT * FROM outsourced_processing_receipts WHERE id = ?',
      [id]
    );

    if (receipt.length === 0) {
      return ResponseHandler.error(res, '外委加工入库单不存在', 'NOT_FOUND', 404);
    }

    // 获取入库明细
    const [items] = await db.pool.execute(
      'SELECT * FROM outsourced_processing_receipt_items WHERE receipt_id = ?',
      [id]
    );

    return ResponseHandler.success(res, {
      ...receipt[0],
      items,
    });
  } catch (error) {
    logger.error('获取外委加工入库单详情失败:', error);
    ResponseHandler.error(res, '获取外委加工入库单详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 创建外委加工入库单
 */
const createReceipt = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      processing_id,
      processing_no,
      supplier_id,
      supplier_name,
      location_id,
      receipt_date,
      operator,
      remarks,
      items,
    } = req.body;

    // 处理外委加工入库单数据

    // 验证仓库是否存在
    const [existingWarehouse] = await connection.execute(
      'SELECT id, name FROM locations WHERE id = ? AND deleted_at IS NULL',
      [location_id]
    );

    if (existingWarehouse.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, `仓库ID ${location_id} 不存在，请确保选择了有效的仓库`, 'VALIDATION_ERROR', 400);
    }

    // 使用仓库表中的名称，确保一致性
    const validWarehouseName = existingWarehouse[0].name;

    // 生成入库单号
    const receipt_no = await purchaseModel.generateProcessingReceiptNo();


    try {
      // 插入入库单主表
      const [result] = await connection.execute(
        `INSERT INTO outsourced_processing_receipts (
          receipt_no, processing_id, processing_no, supplier_id, supplier_name,
          location_id, warehouse_name, receipt_date, operator, remarks, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          safeString(receipt_no),
          safeNumber(processing_id),
          safeString(processing_no),
          safeNumber(supplier_id),
          safeString(supplier_name),
          safeNumber(location_id),
          safeString(validWarehouseName), // 使用验证后的仓库名
          safeString(receipt_date),
          safeString(operator),
          safeString(remarks),
        ]
      );

      const receipt_id = result.insertId;

      // 插入入库明细
      if (items && items.length > 0) {
        for (const item of items) {
          // 安全计算总价
          const unitPrice = safeNumber(item.unit_price || 0);
          const actualQty = safeNumber(item.actual_quantity || 0);
          const total_price = unitPrice * actualQty;

          await connection.execute(
            `INSERT INTO outsourced_processing_receipt_items (
              receipt_id, product_id, product_code, product_name,
              specification, unit, unit_id, expected_quantity,
              actual_quantity, unit_price, total_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              receipt_id,
              safeNumber(item.product_id),
              safeString(item.product_code),
              safeString(item.product_name),
              safeString(item.specification),
              safeString(item.unit),
              safeNumber(item.unit_id),
              safeNumber(item.expected_quantity || 0),
              actualQty,
              unitPrice,
              total_price,
            ]
          );
        }
      }

      await DocumentLinkService.tryAutoLink(
        'outsourced_processing',
        processing_id,
        processing_no,
        'outsourced_receipt',
        receipt_id,
        receipt_no,
        req.user?.id || null,
        connection
      );

      await connection.commit();

      ResponseHandler.success(
        res,
        { id: receipt_id, receipt_no },
        '外委加工入库单创建成功',
        201
      );
    } catch (error) {
      logger.error('创建外委加工入库单错误:', error.code, error.message);

      // 检查是否是外键约束错误
      if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
        // 外键约束结构由 Knex 迁移文件 000007/000010 管理
        logger.error('外键约束错误，请检查迁移文件是否已执行:', error.message);
      }


      throw error; // 如果不是特定的外键约束错误，继续抛出错误
    }
  } catch (error) {
    await connection.rollback();
    logger.error('创建外委加工入库单失败:', error);
    logger.error('错误详情:', error.stack);

    // 提供更友好的错误信息
    let errorMessage = '创建外委加工入库单失败';

    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      if (error.sqlMessage.includes('location_id')) {
        errorMessage = '所选仓库不存在或无效，请检查仓库设置';
      } else if (error.sqlMessage.includes('supplier_id')) {
        errorMessage = '所选供应商不存在或无效，请检查供应商设置';
      } else if (error.sqlMessage.includes('processing_id')) {
        errorMessage = '所选加工单不存在或无效，请检查加工单信息';
      }
    }

    ResponseHandler.error(res, errorMessage, 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新外委加工入库单
 */
const updateReceipt = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { location_id, warehouse_name, receipt_date, operator, remarks, items } = req.body;

    // 检查入库单是否存在且状态为待确认
    const [existingReceipt] = await connection.execute(
      'SELECT status FROM outsourced_processing_receipts WHERE id = ?',
      [id]
    );

    if (existingReceipt.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '外委加工入库单不存在', 'NOT_FOUND', 404);
    }

    if (existingReceipt[0].status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能修改待确认状态的入库单', 'VALIDATION_ERROR', 400);
    }

    // 更新入库单主表
    await connection.execute(
      `UPDATE outsourced_processing_receipts SET
        location_id = ?, warehouse_name = ?, receipt_date = ?,
        operator = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [safeNumber(location_id), safeString(warehouse_name), safeString(receipt_date), safeString(operator), safeString(remarks), id]
    );

    // 删除旧的入库明细
    await connection.execute(
      'DELETE FROM outsourced_processing_receipt_items WHERE receipt_id = ?',
      [id]
    );

    // 插入新的入库明细
    if (items && items.length > 0) {
      for (const item of items) {
        const unitPrice = safeNumber(item.unit_price || 0);
        const actualQty = safeNumber(item.actual_quantity || 0);
        const total_price = unitPrice * actualQty;

        await connection.execute(
          `INSERT INTO outsourced_processing_receipt_items (
            receipt_id, product_id, product_code, product_name,
            specification, unit, unit_id, expected_quantity,
            actual_quantity, unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            safeNumber(item.product_id),
            safeString(item.product_code),
            safeString(item.product_name),
            safeString(item.specification),
            safeString(item.unit),
            safeNumber(item.unit_id),
            safeNumber(item.expected_quantity || 0),
            actualQty,
            unitPrice,
            total_price,
          ]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(res, null, '外委加工入库单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新外委加工入库单失败:', error);
    ResponseHandler.error(res, '更新外委加工入库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新外委加工入库单状态
 */
const updateReceiptStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
    }

    // 检查入库单是否存在
    const [existingReceipt] = await connection.execute(
      'SELECT * FROM outsourced_processing_receipts WHERE id = ?',
      [id]
    );

    if (existingReceipt.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '外委加工入库单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = existingReceipt[0].status;
    if (currentStatus === status) {
      await connection.rollback();
      return ResponseHandler.success(res, null, '外委加工入库单状态未变化');
    }

    if (!RECEIPT_STATUS_TRANSITIONS[currentStatus]?.has(status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `外委加工入库单不能从 ${currentStatus} 变更为 ${status}`,
        'VALIDATION_ERROR',
        400
      );
    }

    // 更新入库单状态
    await connection.execute(
      'UPDATE outsourced_processing_receipts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    // 如果状态为已确认，则需要更新库存
    if (status === STATUS.PROCESSING.CONFIRMED) {
      // 获取入库单明细
      const [items] = await connection.execute(
        'SELECT * FROM outsourced_processing_receipt_items WHERE receipt_id = ?',
        [id]
      );

      if (items.length === 0) {
        throw new Error('外委加工入库单没有明细，不能确认入库');
      }

      // 更新库存
      for (const item of items) {
        try {
          const material_id = item.product_id;
          const location_id = existingReceipt[0].location_id;
          const actualQuantity = parseFloat(item.actual_quantity);
          if (!Number.isFinite(actualQuantity) || actualQuantity <= 0) {
            throw new Error(`物料 ${item.product_name || item.product_id} 入库数量必须大于0`);
          }

          // 使用统一的 InventoryService 更新库存
          // InventoryService 已在文件顶部引入
          await InventoryService.updateStock(
            {
              materialId: material_id,
              locationId: location_id,
              quantity: actualQuantity, // 入库为正数
              transactionType: 'outsourced_inbound',
              referenceNo: existingReceipt[0].receipt_no,
              referenceType: 'outsourced_processing_receipt',
              operator: existingReceipt[0].operator || 'system',
              remark: `外委加工入库 ${existingReceipt[0].receipt_no}`,
              unitId: item.unit_id,
              batchNumber: null,
            },
            connection
          );

          logger.info(`✅ 外委入库成功: 物料ID=${material_id}, 数量=${actualQuantity}`);
        } catch (error) {
          logger.error(`处理物料ID ${item.product_id} 的入库库存时出错:`, error);
          throw error;
        }
      }

      const glResult = await FinanceIntegrationService.generateOutsourcedReceiptEntry(
        { ...existingReceipt[0], id: Number(id) },
        items,
        connection
      );
      if (!glResult.success) {
        throw new Error(glResult.message || glResult.error || '外委入库分录生成失败');
      }
      logger.info(`外委入库分录生成成功: ${existingReceipt[0].receipt_no}`);

      // 检查加工单是否所有入库单都已确认，满足条件时才标记加工单为完成
      if (existingReceipt[0].processing_id) {
        const [pendingReceipts] = await connection.execute(
          `SELECT COUNT(*) as cnt FROM outsourced_processing_receipts
           WHERE processing_id = ? AND status NOT IN ('confirmed', 'completed', 'cancelled')`,
          [existingReceipt[0].processing_id]
        );
        // 所有入库单都已确认/完成，才将加工单标记为完成
        if (pendingReceipts[0].cnt === 0) {
          await connection.execute(
            `UPDATE outsourced_processings SET status = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND status = ?`,
            [STATUS.PROCESSING.COMPLETED, existingReceipt[0].processing_id, STATUS.PROCESSING.CONFIRMED]
          );
          logger.info(`外委加工单 ${existingReceipt[0].processing_id} 所有入库单已确认，自动标记为完成`);
        }
      }
    }

    await connection.commit();

    ResponseHandler.success(res, null, '外委加工入库单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新外委加工入库单状态失败:', error);
    ResponseHandler.error(res, '更新外委加工入库单状态失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

module.exports = {
  getProcessings,
  getProcessing,
  createProcessing,
  updateProcessing,
  deleteProcessing: deleteProcessing,
  updateProcessingStatus,
  getReceipts,
  getReceipt,
  createReceipt,
  updateReceipt,
  updateReceiptStatus,
};
