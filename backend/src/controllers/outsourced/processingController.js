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
const { accountingConfig } = require('../../config/accountingConfig');
const FinanceIntegrationService = require('../../services/external/FinanceIntegrationService');
const { safeString, safeNumber } = require('../../utils/typeHelper');

// 状态常量
const STATUS = {
  PROCESSING: {
    DRAFT: 'draft',
    CONFIRMED: 'confirmed',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
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

    // 不使用参数占位符，而是直接拼接SQL语句中的分页数字
    query += ` ORDER BY id DESC LIMIT ${actualPageSize} OFFSET ${offset}`;

    // 使用原始参数数组，不添加分页参数
    const [rows] = await db.pool.execute(query, params);

    // 返回前端期望的格式
    res.json({
      success: true,
      data: rows,
      total: total,
      page: pageInt,
      pageSize: actualPageSize,
      message: '获取外委加工单列表成功',
    });
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

    res.json({
      success: true,
      data: {
        ...processing[0],
        materials,
        products,
      },
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
      location_id,
      warehouse_name,
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

    // 插入发料明细
    if (materials && materials.length > 0) {
      for (const material of materials) {
        await connection.execute(
          `INSERT INTO outsourced_processing_materials (
            processing_id, material_id, material_code, material_name,
            specification, unit, unit_id, quantity, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            processing_id,
            safeNumber(material.material_id),
            safeString(material.material_code),
            safeString(material.material_name),
            safeString(material.specification),
            safeString(material.unit),
            safeNumber(material.unit_id),
            safeNumber(material.quantity || 0),
            safeString(material.remark),
          ]
        );
      }
    }

    // 插入成品明细
    if (products && products.length > 0) {
      for (const product of products) {
        await connection.execute(
          `INSERT INTO outsourced_processing_products (
            processing_id, product_id, product_code, product_name,
            specification, unit, unit_id, quantity, unit_price, total_price, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            processing_id,
            safeNumber(product.product_id),
            safeString(product.product_code),
            safeString(product.product_name),
            safeString(product.specification),
            safeString(product.unit),
            safeNumber(product.unit_id),
            safeNumber(product.quantity || 0),
            safeNumber(product.unit_price || 0),
            safeNumber(product.total_price || 0),
            safeString(product.remark),
          ]
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(
      res,
      {
        success: true,
        message: '外委加工单创建成功',
        data: { id: processing_id, processing_no },
      },
      '创建成功',
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
      return ResponseHandler.error(res, '外委加工单不存在', 'NOT_FOUND', 404);
    }

    if (existingProcessing[0].status !== 'pending') {
      return ResponseHandler.error(res, '只能修改待确认状态的加工单', 'BAD_REQUEST', 400);
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

    // 插入新的发料明细
    if (materials && materials.length > 0) {
      for (const material of materials) {
        await connection.execute(
          `INSERT INTO outsourced_processing_materials (
            processing_id, material_id, material_code, material_name,
            specification, unit, unit_id, quantity, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            safeNumber(material.material_id),
            safeString(material.material_code),
            safeString(material.material_name),
            safeString(material.specification),
            safeString(material.unit),
            safeNumber(material.unit_id),
            safeNumber(material.quantity || 0),
            safeString(material.remark),
          ]
        );
      }
    }

    // 插入新的成品明细
    if (products && products.length > 0) {
      for (const product of products) {
        await connection.execute(
          `INSERT INTO outsourced_processing_products (
            processing_id, product_id, product_code, product_name,
            specification, unit, unit_id, quantity, unit_price, total_price, remark
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            safeNumber(product.product_id),
            safeString(product.product_code),
            safeString(product.product_name),
            safeString(product.specification),
            safeString(product.unit),
            safeNumber(product.unit_id),
            safeNumber(product.quantity || 0),
            safeNumber(product.unit_price || 0),
            safeNumber(product.total_price || 0),
            safeString(product.remark),
          ]
        );
      }
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
      return ResponseHandler.error(res, '外委加工单不存在', 'NOT_FOUND', 404);
    }

    if (existingProcessing[0].status !== 'pending') {
      return ResponseHandler.error(res, '只能删除待确认状态的加工单', 'BAD_REQUEST', 400);
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
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查加工单是否存在
    const [existingProcessing] = await connection.execute(
      'SELECT * FROM outsourced_processings WHERE id = ?',
      [id]
    );

    if (existingProcessing.length === 0) {
      return ResponseHandler.error(res, '外委加工单不存在', 'NOT_FOUND', 404);
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
      const InventoryService = require('../../services/InventoryService');

      // 减少每个发料物料的库存
      for (const material of materials) {
        // 优先使用加工单指定的仓库，其次使用物料基础资料中配置的默认仓库
        let usedWarehouseId;
        let usedWarehouseName;

        if (existingProcessing[0].location_id) {
          usedWarehouseId = existingProcessing[0].location_id;
          usedWarehouseName = existingProcessing[0].warehouse_name || '指定仓库';
        } else {
          // 通过统一方法获取物料默认仓库
          usedWarehouseId = await InventoryService.getMaterialLocation(material.material_id, connection);
          const [locationInfo] = await connection.execute(
            'SELECT name FROM locations WHERE id = ?',
            [usedWarehouseId]
          );
          usedWarehouseName = locationInfo.length > 0 ? locationInfo[0].name : '物料默认仓库';
        }

        try {
          // 🔥 使用统一的 InventoryService 更新库存（自动同步 batch_inventory）
          const InventoryService = require('../../services/InventoryService');
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
          materials
        );
        if (glResult.success) {
          logger.info(`外委发料分录生成成功: ${existingProcessing[0].processing_no}`);
        } else if (!glResult.skipped) {
          warnings.push(`外委发料分录生成失败: ${glResult.error}`);
        }
      } catch (glError) {
        logger.error('调用外委发料分录生成服务失败:', glError);
        warnings.push('外委发料分录生成异常');
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

    // 不使用参数占位符，而是直接拼接SQL语句中的分页数字
    query += ` ORDER BY id DESC LIMIT ${actualPageSize} OFFSET ${offset}`;

    // 使用原始参数数组，不添加分页参数
    const [rows] = await db.pool.execute(query, params);

    // 返回前端期望的格式
    res.json({
      success: true,
      data: rows,
      total: total,
      page: pageInt,
      pageSize: actualPageSize,
      message: '获取外委加工入库单列表成功',
    });
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

    res.json({
      success: true,
      data: {
        ...receipt[0],
        items,
      },
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
      warehouse_name,
      receipt_date,
      operator,
      remarks,
      items,
    } = req.body;

    // 处理外委加工入库单数据

    // 验证仓库是否存在
    const [existingWarehouse] = await connection.execute(
      'SELECT id, name FROM locations WHERE id = ?',
      [location_id]
    );

    if (existingWarehouse.length === 0) {
      return res.status(400).json({
        success: false,
        message: `仓库ID ${location_id} 不存在，请确保选择了有效的仓库`,
      });
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

      // ✅ 自动生成外委入库会计分录
      try {
        const glResult = await FinanceIntegrationService.generateOutsourcedReceiptEntry(
          { ...req.body, receipt_no, processing_id },
          items
        );
        if (glResult.success) {
          logger.info(`外委入库分录生成成功: ${receipt_no}`);
        } else if (!glResult.skipped) {
          logger.warn(`外委入库分录生成失败: ${glResult.error}`);
        }
      } catch (glError) {
        logger.error('调用外委入库分录生成服务失败:', glError);
      }

      await connection.commit();

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '外委加工入库单创建成功',
          data: { id: receipt_id, receipt_no },
        },
        '创建成功',
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
      return ResponseHandler.error(res, '外委加工入库单不存在', 'NOT_FOUND', 404);
    }

    if (existingReceipt[0].status !== 'pending') {
      return ResponseHandler.error(res, '只能修改待确认状态的入库单', 'BAD_REQUEST', 400);
    }

    // 更新入库单主表
    await connection.execute(
      `UPDATE outsourced_processing_receipts SET
        location_id = ?, warehouse_name = ?, receipt_date = ?,
        operator = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [location_id, warehouse_name, receipt_date, operator, remarks, id]
    );

    // 删除旧的入库明细
    await connection.execute(
      'DELETE FROM outsourced_processing_receipt_items WHERE receipt_id = ?',
      [id]
    );

    // 插入新的入库明细
    if (items && items.length > 0) {
      for (const item of items) {
        const total_price = parseFloat(item.unit_price) * parseFloat(item.actual_quantity);

        await connection.execute(
          `INSERT INTO outsourced_processing_receipt_items (
            receipt_id, product_id, product_code, product_name,
            specification, unit, unit_id, expected_quantity,
            actual_quantity, unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            item.product_id,
            item.product_code,
            item.product_name,
            item.specification,
            item.unit,
            item.unit_id,
            item.expected_quantity,
            item.actual_quantity,
            item.unit_price,
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
      return ResponseHandler.error(res, '无效的状态值', 'BAD_REQUEST', 400);
    }

    // 检查入库单是否存在
    const [existingReceipt] = await connection.execute(
      'SELECT * FROM outsourced_processing_receipts WHERE id = ?',
      [id]
    );

    if (existingReceipt.length === 0) {
      return ResponseHandler.error(res, '外委加工入库单不存在', 'NOT_FOUND', 404);
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

      // 更新库存
      for (const item of items) {
        try {
          const material_id = item.product_id;
          const location_id = existingReceipt[0].location_id;
          const actualQuantity = parseFloat(item.actual_quantity);

          // 🔥 使用统一的 InventoryService 更新库存（自动同步 batch_inventory）
          const InventoryService = require('../../services/InventoryService');
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

      // 如果所有产品已入库，则将对应的加工单状态更新为已完成
      if (existingReceipt[0].processing_id) {
        await connection.execute(
          `UPDATE outsourced_processings SET status = 'completed', updated_at = CURRENT_TIMESTAMP 
           WHERE id = ?`,
          [existingReceipt[0].processing_id]
        );
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
