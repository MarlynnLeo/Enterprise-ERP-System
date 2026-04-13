/**
 * purchaseReceiptController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const db = require('../../../config/db');
const purchaseModel = require('../../../models/purchase');
const { desensitizeData, hasFinancePermission } = require('../../../utils/desensitizer');
const PurchaseOrderStatusService = require('../../../services/business/PurchaseOrderStatusService');
const { getCurrentUserName } = require('../../../utils/userHelper');

// 状态常量
const STATUS = {
  PURCHASE_RECEIPT: {
    DRAFT: 'draft',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

// 获取采购入库列表
const getReceipts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      pageSize = 10,
      receiptNo,
      orderNo,
      supplierId,
      startDate,
      endDate,
      status,
    } = req.query;

    // 转换为数字类型
    const actualPageSize = parseInt(limit || pageSize, 10);
    const actualPage = parseInt(page, 10);
    // 验证参数
    if (isNaN(actualPage) || isNaN(actualPageSize) || actualPage < 1 || actualPageSize < 1) {
      return res.status(400).json({ error: '无效的分页参数' });
    }

    const offset = (actualPage - 1) * actualPageSize;

    // 构建 WHERE 条件（数据查询和计数查询共用）
    let whereClause = ' WHERE 1=1';
    const queryParams = [];

    if (receiptNo) {
      whereClause += ' AND r.receipt_no LIKE ?';
      queryParams.push(`%${receiptNo}%`);
    }

    if (orderNo) {
      whereClause += ' AND r.order_no LIKE ?';
      queryParams.push(`%${orderNo}%`);
    }

    if (supplierId) {
      whereClause += ' AND r.supplier_id = ?';
      queryParams.push(parseInt(supplierId, 10));
    }

    if (startDate) {
      whereClause += ' AND r.receipt_date >= ?';
      queryParams.push(startDate);
    }

    if (endDate) {
      whereClause += ' AND r.receipt_date <= ?';
      queryParams.push(endDate);
    }

    if (status) {
      whereClause += ' AND r.status = ?';
      queryParams.push(status);
    }

    const connection = await db.pool.getConnection();
    try {
      // 1. 快速计数查询（只查主表，不走 JOIN）
      const countQuery = `SELECT COUNT(*) as total FROM purchase_receipts r ${whereClause}`;
      const [countResult] = await connection.query(countQuery, queryParams);
      const totalCount = countResult[0].total;

      // 2. 分页数据查询（带 JOIN 获取关联名称，用 LEFT JOIN users 替代相关子查询）
      const dataQuery = `
        SELECT r.*,
          po.order_no as joined_order_no,
          s.name as joined_supplier_name,
          l.name as joined_warehouse_name,
          u.real_name
        FROM purchase_receipts r
        LEFT JOIN purchase_orders po ON r.order_id = po.id
        LEFT JOIN suppliers s ON r.supplier_id = s.id
        LEFT JOIN locations l ON r.warehouse_id = l.id
        LEFT JOIN users u ON u.username = r.operator
        ${whereClause}
        ORDER BY r.created_at DESC LIMIT ${actualPageSize} OFFSET ${offset}
      `;
      const [result] = await connection.query(dataQuery, queryParams);

      // 整合入库单数据（列表页不需要物料详情，提高响应速度）
      const receipts = result.map((row) => {
        return {
          ...row,
          // 用 JOIN 获取的关联名称覆盖可能为空的冗余字段
          order_no: row.joined_order_no || row.order_no || '',
          supplier_name: row.joined_supplier_name || row.supplier_name || '',
          warehouse_name: row.joined_warehouse_name || row.warehouse_name || '',
          // 优先使用从用户表获取的真实姓名
          receiver: row.operator === 'system' ? '系统' : row.real_name || row.operator || '',
        };
      });

      const hasPerm = await hasFinancePermission(req.user);
      const desensitizedReceipts = desensitizeData(receipts, hasPerm);

      res.json({
        items: desensitizedReceipts,
        total: totalCount,
        page: actualPage,
        pageSize: actualPageSize,
        totalPages: Math.ceil(totalCount / actualPageSize),
      });
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('获取采购入库列表失败:', error);
    return ResponseHandler.error(res, '操作失败', 'OPERATION_ERROR', 500, error);
  }
};

// 获取采购入库详情
const getReceipt = async (req, res) => {
  let connection;
  let retryCount = 0;
  const maxRetries = 3;

  const tryGetReceipt = async () => {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id, 10))) {
        return res.status(400).json({ error: '无效的ID参数' });
      }

      const receiptId = parseInt(id, 10);

      // 获取入库单基本信息
      connection = await db.pool.getConnection();

      // 使用JOIN语句获取更详细的信息
      const query = `
        SELECT 
          pr.*,
          po.order_no,
          s.name AS supplier_name,
          l.name AS warehouse_name,
          (SELECT u.real_name FROM users u WHERE u.username = pr.operator OR u.real_name = pr.operator LIMIT 1) as real_name
        FROM 
          purchase_receipts pr
        LEFT JOIN 
          purchase_orders po ON pr.order_id = po.id
        LEFT JOIN 
          suppliers s ON pr.supplier_id = s.id
        LEFT JOIN 
          locations l ON pr.warehouse_id = l.id
        WHERE 
          pr.id = ?
      `;

      const [result] = await connection.query(query, [receiptId]);

      if (result.length === 0) {
        return res.status(404).json({ error: '采购入库单不存在' });
      }

      const receipt = result[0];

      // 获取入库单物料
      const itemsQuery = `
        SELECT 
          pri.*,
          m.name AS material_name,
          m.code AS material_code,
          m.specs,
          u.name AS unit_name
        FROM 
          purchase_receipt_items pri
        LEFT JOIN 
          materials m ON pri.material_id = m.id
        LEFT JOIN 
          units u ON pri.unit_id = u.id
        WHERE 
          pri.receipt_id = ? 
        ORDER BY 
          pri.id
      `;

      const [itemsResult] = await connection.query(itemsQuery, [receiptId]);

      // 格式化物料项为前端需要的格式
      const formattedItems = itemsResult.map((item) => ({
        id: item.id,
        receipt_id: item.receipt_id,
        material_id: item.material_id,
        material_code: item.material_code,
        material_name: item.material_name,
        specification: item.specs,
        unit_id: item.unit_id,
        unit_name: item.unit_name,
        ordered_quantity: item.ordered_quantity || 0,
        received_quantity: item.received_quantity || 0,
        qualified_quantity: item.qualified_quantity || 0,
        price: item.price || 0,
        remarks: item.remarks || '',
        // 同时提供驼峰命名格式
        materialId: item.material_id,
        materialCode: item.material_code,
        materialName: item.material_name,
        unitId: item.unit_id,
        unitName: item.unit_name,
        orderedQuantity: item.ordered_quantity || 0,
        receivedQuantity: item.received_quantity || 0,
        qualifiedQuantity: item.qualified_quantity || 0,
      }));

      // 格式化日期（防止数据库中存在无效日期值导致 toISOString 崩溃）
      let receiptDate = null;
      if (receipt.receipt_date) {
        const d = new Date(receipt.receipt_date);
        receiptDate = isNaN(d.getTime()) ? String(receipt.receipt_date).slice(0, 10) : d.toISOString().split('T')[0];
      }

      // 准备返回的结果对象（同时提供下划线格式和驼峰格式）
      const response = {
        id: receipt.id,
        receipt_no: receipt.receipt_no,
        order_id: receipt.order_id,
        order_no: receipt.order_no,
        supplier_id: receipt.supplier_id,
        supplier_name: receipt.supplier_name,
        warehouse_id: receipt.warehouse_id,
        warehouse_name: receipt.warehouse_name,
        receipt_date: receiptDate,
        operator: receipt.operator,
        receiver: receipt.operator === 'system' ? '系统' : receipt.real_name || receipt.operator,
        status: receipt.status,
        remarks: receipt.remarks || '',
        items: formattedItems,
        // 同时提供驼峰命名格式
        receiptNo: receipt.receipt_no,
        orderId: receipt.order_id,
        orderNo: receipt.order_no,
        supplierId: receipt.supplier_id,
        supplierName: receipt.supplier_name,
        warehouseId: receipt.warehouse_id,
        warehouseName: receipt.warehouse_name,
        receiptDate: receiptDate,
      };

      const hasPerm = await hasFinancePermission(req.user);
      const desensitizedResponse = desensitizeData(response, hasPerm);

      // 直接返回响应对象，不再嵌套在data中
      return res.json(desensitizedResponse);
    } catch (error) {
      if (
        (error.code === 'ECONNRESET' || error.code === 'PROTOCOL_CONNECTION_LOST') &&
        retryCount < maxRetries
      ) {
        retryCount++;

        // 确保连接被释放
        if (connection) {
          try {
            connection.release();
          } catch (releaseErr) {
            logger.error('释放连接失败:', releaseErr);
          }
          connection = null;
        }

        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
        return await tryGetReceipt();
      }

      logger.error('获取采购入库详情失败:', error);
      return res.status(500).json({
        error: '获取采购入库详情失败',
        message: error.message,
        code: error.code,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  };

  return await tryGetReceipt();
};

// 创建采购入库
const createReceipt = async (req, res) => {
  let client;
  try {
    client = await db.pool.getConnection();
    await client.beginTransaction();

    // 从请求中提取数据，并确保所有值都是有效的（不是undefined）
    const {
      orderId,
      supplierId,
      warehouseId,
      receiptDate,
      receiver = '', // 收货人，使用真实姓名
      remarks = '', // 默认为空字符串而不是undefined
      items: rawItems = [], // 默认为空数组而不是undefined
      from_inspection, // 是否来自检验单自动创建（下划线格式）
      fromInspection, // 是否来自检验单自动创建（驼峰格式）
      material_id = null, // 如果来自检验单，指定的物料ID
      only_inspection_material = false, // 标记是否只包含检验物料，不获取订单中其他物料
    } = req.body;

    // 兼容两种命名方式
    const isFromInspection = from_inspection || fromInspection || false;

    // 强制转换items为数组
    const items = Array.isArray(rawItems) ? rawItems : [];

    logger.info('解构后的数据:', {
      orderId,
      supplierId,
      warehouseId,
      receiptDate,
      receiver,
      remarks,
      isFromInspection,
      material_id,
      only_inspection_material,
      items类型: typeof items,
      items是否数组: Array.isArray(items),
      items长度: items.length,
    });

    // 验证必填字段
    if (!orderId || !supplierId || !warehouseId || !receiptDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: '缺少必填字段',
        details: {
          orderId: !orderId ? '订单ID必填' : null,
          supplierId: !supplierId ? '供应商ID必填' : null,
          warehouseId: !warehouseId ? '仓库ID必填' : null,
          receiptDate: !receiptDate ? '收货日期必填' : null,
        },
      });
    }

    // 确保warehouseId是数字类型
    const warehouseIdNumber = parseInt(warehouseId);
    if (isNaN(warehouseIdNumber)) {
      await client.query('ROLLBACK');
      logger.error(`仓库ID ${warehouseId} 不是有效的数字`);
      return res.status(400).json({ error: `仓库ID必须是数字: ${warehouseId}` });
    }

    // 第一性原理防御：获取订单信息并开启关联悲观锁
    let orderResult;
    try {
      // 通过排它锁锁住主干订单，解决高并发下的车间连击爆雷
      const orderQuery = 'SELECT order_no, status FROM purchase_orders WHERE id = ? FOR UPDATE';
      const [rows] = await client.query(orderQuery, [orderId]);
      orderResult = rows;
      
      if (!orderResult || orderResult.length === 0) {
        await client.rollback();
        return res.status(404).json({ error: '采购订单不存在' });
      }

      // 业务硬控：已终止的订单不可在途收货（允许 completed 状态，因为入库可能在订单收货完成后进行）
      if (['cancelled', 'closed'].includes(orderResult[0].status)) {
        await client.rollback();
        return res.status(400).json({ error: `采购订单当前状态为 ${orderResult[0].status}，无法操作` });
      }

      // 物理并行阻击：检查该订单名下是否已有尚未决议的收货单（通过索引间隙锁预防双胞胎单据）
      const activeReceiptsQuery = `SELECT id, receipt_no FROM purchase_receipts WHERE order_id = ? AND status IN ('draft', 'pending', 'inspecting') FOR UPDATE`;
      const [activeReceipts] = await client.query(activeReceiptsQuery, [orderId]);
      if (activeReceipts.length > 0) {
        await client.rollback();
        return res.status(409).json({ 
          error: `业务防线拦截：该订单已有活体收货单 (${activeReceipts[0].receipt_no}) 未结算。为防止超收及连击建单，请先完成前置单据。` 
        });
      }

    } catch (dbError) {
      logger.error('查询并锁定订单信息失败:', dbError);
      await client.rollback();
      return res.status(500).json({ error: '数据库级联合防护错误: ' + dbError.message });
    }

    const orderNo = orderResult[0].order_no ? orderResult[0].order_no : '';

    // 获取供应商信息
    let supplierResult;
    try {
      const supplierQuery = 'SELECT name FROM suppliers WHERE id = ?';
      const [rows] = await client.query(supplierQuery, [supplierId]);
      supplierResult = rows;
    } catch (dbError) {
      logger.error('查询供应商信息失败:', dbError);
      await client.rollback();
      return res.status(500).json({ error: '数据库查询错误: ' + dbError.message });
    }

    if (!supplierResult || supplierResult.length === 0) {
      await client.rollback();
      return res.status(404).json({ error: '供应商不存在' });
    }

    const supplierName = supplierResult.name ? supplierResult.name : '';

    // 获取仓库信息
    let warehouseResult;
    try {
      const warehouseQuery = 'SELECT name FROM locations WHERE id = ?';
      const [rows] = await client.query(warehouseQuery, [warehouseId]);
      warehouseResult = rows;
    } catch (dbError) {
      logger.error('查询仓库信息失败:', dbError);
      await client.rollback();
      return res.status(500).json({ error: '数据库查询错误: ' + dbError.message });
    }

    if (!warehouseResult || warehouseResult.length === 0) {
      await client.rollback();
      logger.error(`仓库ID ${warehouseId} 不存在于locations表中`);
      return res.status(404).json({ error: '仓库不存在' });
    }

    const warehouseName = warehouseResult.name ? warehouseResult.name : '';

    // 生成入库单号

    if (!purchaseModel || typeof purchaseModel.generateReceiptNo !== 'function') {
      logger.error('purchaseModel对象缺失或generateReceiptNo方法不存在!');
      await client.rollback();
      return res.status(500).json({ error: '系统错误: 无法生成入库单号' });
    }

    let receiptNo;
    try {
      receiptNo = await purchaseModel.generateReceiptNo();
    } catch (genError) {
      logger.error('生成入库单号失败:', genError);
      await client.rollback();
      return res.status(500).json({ error: '生成入库单号失败: ' + genError.message });
    }

    if (!receiptNo) {
      logger.error('生成的入库单号为空!');
      await client.rollback();
      return res.status(500).json({ error: '系统错误: 生成的入库单号为空' });
    }

    // 使用提供的收货人，如果没有则使用登录用户名
    // 优先使用前端传入的receiver(真实姓名)作为operator
    const operator = await getCurrentUserName(req);

    // 记录是否来自检验的标记，便于日志和调试
    if (from_inspection) {
      if (only_inspection_material) {
      }
      if (material_id) {
      }
    }

    // 创建采购入库单
    const insertQuery = `
      INSERT INTO purchase_receipts (
        receipt_no, order_id, order_no, supplier_id, supplier_name, 
        warehouse_id, warehouse_name, receipt_date, operator, remarks, status,
        from_inspection, inspection_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // 确保所有参数都不是undefined
    const insertParams = [
      receiptNo,
      orderId,
      orderNo,
      supplierId,
      supplierName,
      warehouseId,
      warehouseName,
      receiptDate,
      operator,
      remarks || '', // 使用空字符串替代undefined
      'draft',
      isFromInspection ? 1 : 0, // 转换布尔值为0/1
      req.body.inspectionId || req.body.inspection_id || null, // 关联的检验单ID
    ];

    // 检查任何参数是否为undefined
    if (insertParams.includes(undefined)) {
      logger.error(
        '插入采购入库单参数中包含undefined值:',
        insertParams
          .map((param, index) => (param === undefined ? index : null))
          .filter((i) => i !== null)
      );
      await client.rollback();
      return res.status(500).json({ error: '数据处理错误：参数包含undefined值' });
    }

    // 插入采购入库单
    let receiptId;
    try {
      const [result] = await client.query(insertQuery, insertParams);
      receiptId = result.insertId;

      if (!receiptId) {
        throw new Error('插入成功但无法获取收货单ID');
      }
    } catch (insertError) {
      logger.error('插入采购入库单失败:', insertError);
      await client.rollback();
      return res.status(500).json({ error: '数据库插入错误: ' + insertError.message });
    }

    // 获取检验单批次号（如果来自检验单）
    const inspectionBatchMap = new Map(); // 物料ID -> 批次号的映射
    const inspectionId = req.body.inspectionId || req.body.inspection_id;

    if (isFromInspection && inspectionId) {
      try {
        const inspectionQuery = `
          SELECT material_id, batch_no
          FROM quality_inspections
          WHERE id = ? AND batch_no IS NOT NULL
        `;
        const [inspections] = await client.query(inspectionQuery, [inspectionId]);

        if (inspections && inspections.length > 0) {
          inspections.forEach((insp) => {
            if (insp.material_id && insp.batch_no) {
              inspectionBatchMap.set(insp.material_id, insp.batch_no);
            }
          });
          logger.info(
            `✅ 从检验单 ${inspectionId} 获取到 ${inspectionBatchMap.size} 个物料的批次号`
          );
        } else {
          logger.warn(`⚠️ 检验单 ${inspectionId} 没有批次号数据`);
        }
      } catch (inspectionError) {
        logger.error('获取检验单批次号失败:', inspectionError);
        // 不中断流程
      }
    } else {
      logger.info(
        `入库单不是从检验单创建，或没有检验单ID (isFromInspection=${isFromInspection}, inspectionId=${inspectionId})`
      );
    }

    // 创建采购入库物料项目
    if (items && Array.isArray(items) && items.length > 0) {
      // 如果来自检验且只使用检验物料，则过滤物料列表，只保留检验物料
      if (from_inspection && only_inspection_material && material_id) {
        const filteredItems = items.filter((item) => {
          const itemMatId = item.materialId || item.material_id;
          return itemMatId == material_id; // 使用==而不是===，允许字符串和数字的比较
        });

        if (filteredItems.length !== items.length) {
          // 替换原始数组
          items = filteredItems;
        }
      }

      const insertItemsQuery = `
        INSERT INTO purchase_receipt_items
        (receipt_id, material_id, material_code, material_name,
         specification, unit_id, ordered_quantity, quantity, received_quantity, qualified_quantity, batch_number, price, remarks, from_inspection)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (let i = 0; i < items.length; i++) {
        try {
          const item = items[i];

          // 检查item是否是一个有效的对象
          if (!item || typeof item !== 'object') {
            continue;
          }

          // 如果缺少物料编码，从数据库获取
          let materialCode = item.materialCode || item.material_code || '';
          let materialName = item.materialName || item.material_name || '';
          const currentMaterialId = item.materialId || item.material_id || null;

          if ((!materialCode || !materialName) && currentMaterialId) {
            try {
              const [materials] = await client.query(
                'SELECT code, name FROM materials WHERE id = ?',
                [currentMaterialId]
              );

              if (materials && materials.length > 0) {
                materialCode = materialCode || materials[0].code || '';
                materialName = materialName || materials[0].name || '';
              }
            } catch (materialError) {
              logger.error('获取物料信息失败:', materialError);
            }
          }

          // 获取批次号：优先使用检验单的批次号，其次使用传入的批次号
          let batchNumber = null;

          // 1. 优先使用检验单的批次号（从数据库查询）
          if (currentMaterialId && inspectionBatchMap.has(currentMaterialId)) {
            batchNumber = inspectionBatchMap.get(currentMaterialId);
            logger.info(`物料 ${materialCode} 使用检验单批次号: ${batchNumber}`);
          }
          // 2. 其次使用前端传入的批次号（支持多种字段名）
          else if (item.batchNo || item.batchNumber || item.batch_number) {
            batchNumber = item.batchNo || item.batchNumber || item.batch_number;
            logger.info(`物料 ${materialCode} 使用传入批次号: ${batchNumber}`);
          }
          // 3. 如果都没有，记录警告但不自动生成
          else {
            logger.warn(`物料 ${materialCode} 没有批次号，将不记录批次信息`);
          }

          // 获取价格：优先使用传入的价格，其次从采购订单获取，最后从物料主数据获取
          let itemPrice = parseFloat(item.price) || 0;
          if (itemPrice <= 0 && currentMaterialId) {
            try {
              // 尝试从采购订单明细获取价格
              if (orderId) {
                const [orderPriceData] = await client.query(
                  'SELECT price FROM purchase_order_items WHERE order_id = ? AND material_id = ? LIMIT 1',
                  [orderId, currentMaterialId]
                );
                if (orderPriceData && orderPriceData.length > 0 && orderPriceData[0].price > 0) {
                  itemPrice = parseFloat(orderPriceData[0].price);
                  logger.info(`物料 ${materialCode} 从采购订单获取价格: ${itemPrice}`);
                }
              }
              // 如果采购订单也没有价格，尝试从物料主数据获取
              if (itemPrice <= 0) {
                const [materialPriceData] = await client.query(
                  'SELECT cost_price, price FROM materials WHERE id = ? LIMIT 1',
                  [currentMaterialId]
                );
                if (materialPriceData && materialPriceData.length > 0) {
                  itemPrice =
                    parseFloat(materialPriceData[0].cost_price) ||
                    parseFloat(materialPriceData[0].price) ||
                    0;
                  if (itemPrice > 0) {
                    logger.info(`物料 ${materialCode} 从物料主数据获取价格: ${itemPrice}`);
                  }
                }
              }
            } catch (priceError) {
              logger.warn(`获取物料 ${materialCode} 价格失败:`, priceError);
            }
          }

          // 确保所有参数都不是undefined
          const itemParams = [
            receiptId,
            currentMaterialId,
            materialCode,
            materialName,
            item.specification || item.specs || '',
            item.unitId || item.unit_id || null,
            parseFloat(item.orderedQuantity || item.ordered_quantity) || 0,
            parseFloat(item.quantity || item.receivedQuantity || item.received_quantity) || 0, // 使用receivedQuantity作为quantity
            parseFloat(item.receivedQuantity || item.received_quantity) || 0,
            parseFloat(item.qualifiedQuantity || item.qualified_quantity) || 0,
            batchNumber,
            itemPrice,
            item.remarks || item.remark || '',
            item.from_inspection === true || from_inspection === true ? 1 : 0, // 标记是否来自检验
          ];

          // 检查任何参数是否为undefined
          if (itemParams.includes(undefined)) {
            logger.error(
              `第${i + 1}个物料项参数中包含undefined值:`,
              itemParams
                .map((param, index) => (param === undefined ? index : null))
                .filter((i) => i !== null)
            );
            continue; // 跳过这个物料项
          }

          // 使用正确的查询方式，不解构结果
          await client.query(insertItemsQuery, itemParams);
        } catch (itemError) {
          logger.error(`插入第${i + 1}个物料项失败:`, itemError);
          // 继续处理下一个物料项，不中断流程
        }
      }
    } else {
    }

    // 提交事务
    await client.commit();

    // 获取完整的入库单数据
    const getReceiptQuery = `
      SELECT r.*, ri.*, m.code as material_code, m.name as material_name
      FROM purchase_receipts r
      JOIN purchase_receipt_items ri ON r.id = ri.receipt_id
      JOIN materials m ON ri.material_id = m.id
      WHERE r.id = ?
    `;

    const [receiptItems] = await client.query(getReceiptQuery, [receiptId]);

    if (!receiptItems || receiptItems.length === 0) {
      throw new Error('无法获取入库单数据');
    }

    const receipt = receiptItems[0];

    // 生成追溯链路记录
    // 追溯链路创建已移除

    ResponseHandler.success(
      res,
      {
        success: true,
        message: '采购入库单创建成功',
        data: {
          id: receiptId,
          receiptNo,
        },
      },
      '创建成功',
      201
    );
  } catch (error) {
    // 使用普通查询回滚事务
    try {
      if (client) {
        await client.rollback();
      } else {
        logger.error('无法回滚事务: client对象不存在');
      }
    } catch (rollbackError) {
      logger.error('事务回滚失败:', rollbackError);
    }
    logger.error('创建采购入库单失败，详细错误:', error);
    logger.error('错误类型:', error.constructor.name);
    logger.error('错误消息:', error.message);
    logger.error('错误栈:', error.stack);
    res.status(500).json({ error: error.message || '创建采购入库单失败' });
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error('释放数据库连接失败:', releaseError);
      }
    } else {
    }
  }
};

// 更新采购入库
const updateReceipt = async (req, res) => {
  const client = await db.getClient();

  try {
    // 事务命令不支持预处理语句协议，使用普通查询
    await client.query('BEGIN');

    const { id } = req.params;
    const {
      receiptDate,
      warehouseId,
      remarks = '', // 默认为空字符串而不是undefined
      items = [], // 默认为空数组而不是undefined
    } = req.body;

    // 验证必填字段
    if (!id || !receiptDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: '缺少必填字段',
        details: {
          id: !id ? '入库单ID必填' : null,
          receiptDate: !receiptDate ? '收货日期必填' : null,
        },
      });
    }

    // 检查入库单是否存在及其状态
    let checkResult;
    try {
      const checkQuery = 'SELECT status, warehouse_id FROM purchase_receipts WHERE id = ?';
      const result = await client.query(checkQuery, [id]);
      // 安全地获取结果，适配不同格式
      checkResult = Array.isArray(result) ? result : result && result.rows ? result.rows : [];

      if (!checkResult || checkResult.length === 0) {
        // 使用普通查询回滚事务
        await client.query('ROLLBACK');
        return res.status(404).json({ error: '采购入库单不存在' });
      }

      const currentItem = checkResult[0] || {};
      const currentStatus = currentItem.status || null;

      if (currentStatus !== 'draft') {
        // 使用普通查询回滚事务
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '只能编辑草稿状态的收货单' });
      }

      // 如果更改了仓库，则需要获取新仓库的信息
      let warehouseName = null;
      if (warehouseId && warehouseId !== currentItem.warehouse_id) {
        let warehouseResult;
        try {
          const warehouseQuery = 'SELECT name FROM locations WHERE id = ?';
          const result = await client.query(warehouseQuery, [warehouseId]);
          // 安全地获取结果，适配不同格式
          warehouseResult = Array.isArray(result)
            ? result
            : result && result.rows
              ? result.rows
              : [];

          if (!warehouseResult || warehouseResult.length === 0) {
            // 使用普通查询回滚事务
            await client.query('ROLLBACK');
            logger.error(`仓库ID ${warehouseId} 不存在于locations表中`);
            return res.status(404).json({ error: '仓库不存在' });
          }

          warehouseName = (warehouseResult[0] || {}).name || '';
        } catch (dbError) {
          logger.error('查询仓库信息失败:', dbError);
          await client.query('ROLLBACK');
          return res.status(500).json({ error: '数据库查询错误: ' + dbError.message });
        }
      }
    } catch (checkError) {
      logger.error('检查入库单状态失败:', checkError);
      await client.query('ROLLBACK');
      return res.status(500).json({ error: '数据库查询错误: ' + checkError.message });
    }

    // 更新入库单基本信息
    const updateQuery = `
      UPDATE purchase_receipts
      SET receipt_date = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    const queryParams = [receiptDate, remarks || '', id];

    // 检查任何参数是否为undefined
    if (queryParams.includes(undefined)) {
      logger.error(
        '更新采购入库单参数中包含undefined值:',
        queryParams
          .map((param, index) => (param === undefined ? index : null))
          .filter((i) => i !== null)
      );
      await client.query('ROLLBACK');
      return res.status(500).json({ error: '数据处理错误：参数包含undefined值' });
    }

    await client.query(updateQuery, queryParams);

    // 更新物料项目
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        // 支持多种字段名称：actualQuantity, receivedQuantity, received_quantity
        const receivedQty = item.actualQuantity || item.receivedQuantity || item.received_quantity;
        const qualifiedQty = item.qualifiedQuantity || item.qualified_quantity;

        if (!item.id || receivedQty === undefined || receivedQty === null) {
          continue;
        }

        const updateItemQuery = `
          UPDATE purchase_receipt_items
          SET received_quantity = ?, qualified_quantity = ?, updated_at = CURRENT_TIMESTAMP
          WHERE receipt_id = ? AND id = ?
        `;

        const itemParams = [
          parseFloat(receivedQty) || 0,
          parseFloat(qualifiedQty) || 0,
          id,
          item.id,
        ];

        // 检查任何参数是否为undefined
        if (itemParams.includes(undefined)) {
          logger.error(
            '更新物料项参数中包含undefined值:',
            itemParams
              .map((param, index) => (param === undefined ? index : null))
              .filter((i) => i !== null)
          );
          continue; // 跳过这个物料项
        }

        await client.query(updateItemQuery, itemParams);
      }
    }

    // 使用普通查询提交事务
    await client.query('COMMIT');

    ResponseHandler.success(res, null, '采购入库单更新成功');
  } catch (error) {
    // 使用普通查询回滚事务
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('事务回滚失败:', rollbackError);
    }
    logger.error('更新采购入库单失败:', error);
    res.status(500).json({ error: error.message || '更新采购入库单失败' });
  } finally {
    client.release();
  }
};

// 更新采购入库状态
const updateReceiptStatus = async (req, res) => {
  const client = await db.pool.getConnection();

  try {
    await client.beginTransaction();

    const { id } = req.params;
    const { status, remarks = '' } = req.body;

    // 验证必填字段
    if (!id || !status) {
      await client.rollback();
      return res.status(400).json({
        error: '缺少必填字段',
        details: {
          id: !id ? '入库单ID必填' : null,
          status: !status ? '状态必填' : null,
        },
      });
    }

    // 验证状态值
    const validStatuses = ['draft', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      // 使用标准回滚
      await client.rollback();
      return res.status(400).json({ error: '无效的状态值' });
    }

    // 检查入库单是否存在
    let checkResult;
    try {
      const checkQuery = 'SELECT status FROM purchase_receipts WHERE id = ?';
      const [checkRows] = await client.query(checkQuery, [id]);

      if (!checkRows || checkRows.length === 0) {
        await client.rollback();
        return res.status(404).json({ error: '采购入库单不存在' });
      }

      const currentStatus = checkRows[0].status;

      // 验证状态变更是否有效
      if (!isValidStatusTransition(currentStatus, status)) {
        // 使用标准回滚
        await client.rollback();
        return res.status(400).json({ error: '无效的状态变更' });
      }
      // 优化：将状态更新移到事务提交前执行，为了减少行锁持有时间
      // 这里先只进行参数准备，不执行SQL update
    } catch (checkError) {
      logger.error('检查入库单状态失败:', checkError);
      await client.rollback();
      return res.status(500).json({ error: '数据库查询错误: ' + checkError.message });
    }

    // 准备状态变更备注
    const statusRemark = `[${new Date().toISOString()}] 状态变更为 ${status}${remarks ? ': ' + remarks : ''}`;

    // 定义更新查询（稍后执行）
    const updateQuery = `
      UPDATE purchase_receipts
      SET status = ?, remarks = CONCAT(IFNULL(remarks, ''), ' | ', ?)
      WHERE id = ?
    `;
    const updateParams = [status, statusRemark, id];

    // 检查任何参数是否为undefined
    if (updateParams.includes(undefined)) {
      logger.error(
        '更新状态参数中包含undefined值:',
        updateParams
          .map((param, index) => (param === undefined ? index : null))
          .filter((i) => i !== null)
      );
      await client.rollback();
      return res.status(500).json({ error: '数据处理错误：参数包含undefined值' });
    }

    // 如果状态是"completed"，则入库物料到库存
    // 已移除冗余的库存更新逻辑 (updateInventory)
    // 库存更新现在由 InventoryTraceabilityService.handlePurchaseReceipt 统一处理
    // 以避免双重扣减和数据库死锁

    // 如果状态更新为completed，调用批次管理和追溯链路服务
    if (status === STATUS.PURCHASE_RECEIPT.COMPLETED) {
      try {
        // 引入服务
        const InventoryTraceabilityService = require('../../../services/business/InventoryTraceabilityService');

        // 获取收货单详情用于追溯链路
        const getReceiptQuery = `
          SELECT r.*, ri.*, m.code as material_code, m.name as material_name, u.name as unit,
                 COALESCE(poi.price, 0) as order_price,
                 poi.tax_rate as order_tax_rate
          FROM purchase_receipts r
          JOIN purchase_receipt_items ri ON r.id = ri.receipt_id
          JOIN materials m ON ri.material_id = m.id
          LEFT JOIN units u ON m.unit_id = u.id
          LEFT JOIN purchase_orders po ON r.order_id = po.id
          LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND ri.material_id = poi.material_id
          WHERE r.id = ?
        `;

        const [receiptItems] = await client.query(getReceiptQuery, [id]);

        if (receiptItems && receiptItems.length > 0) {
          const receipt = receiptItems[0];

          // 1. 创建批次库存记录（仅处理有批次号的物料）
          try {
            // 只处理有批次号的物料
            const batchItems = receiptItems
              .filter((item) => item.batch_number && item.batch_number.trim() !== '')
              .map((item) => ({
                material_id: item.material_id,
                material_code: item.material_code,
                material_name: item.material_name,
                batch_number: item.batch_number,
                quantity: item.qualified_quantity || item.received_quantity,
                unit: item.unit,
                supplier_id: receipt.supplier_id,
                supplier_name: receipt.supplier_name,
                warehouse_id: receipt.warehouse_id,
                warehouse_name: receipt.warehouse_name,
                receipt_date: receipt.receipt_date,
                unit_cost: item.price !== undefined && item.price !== null ? item.price : (item.order_price || 0), // ✅ 使用收货单明细单价或订单明细单价
                purchase_order_id: receipt.order_id,
                purchase_order_no: receipt.order_no,
                receipt_id: id,
                receipt_no: receipt.receipt_no,
              }));

            if (batchItems.length > 0) {
              await InventoryTraceabilityService.handlePurchaseReceipt(
                {
                  receipt_id: id,
                  receipt_no: receipt.receipt_no,
                  supplier_id: receipt.supplier_id,
                  supplier_name: receipt.supplier_name,
                  warehouse_id: receipt.warehouse_id,
                  warehouse_name: receipt.warehouse_name,
                  receipt_date: receipt.receipt_date,
                  operator: receipt.operator || 'system',
                  items: batchItems,
                },
                client
              ); // ✅ 传递当前事务连接，避免死锁和事务分裂

              logger.info(
                `采购入库单 ${receipt.receipt_no} 批次库存创建成功，共 ${batchItems.length} 个批次`
              );
            } else {
              logger.info(`采购入库单 ${receipt.receipt_no} 没有批次号，跳过批次库存创建`);
            }
          } catch (batchError) {
            logger.error('创建批次库存失败:', batchError);
            // 不阻塞流程
          }

          // 注：物料主数据反写和追溯链路服务已在架构重构中剥离
          // 物料计价由 InventoryCostService MAC 增量算法负责
          // 追溯由 InventoryTraceabilityService.handlePurchaseReceipt 统一处理

          // 更新采购订单状态
          if (receipt.order_id) {
            try {
              logger.info(`准备更新采购订单 ${receipt.order_id} 的入库数量`);

              // ✅ 优化：在循环外查询检验单(只查询一次)
              let inspection = null;
              if (receipt.inspection_id) {
                try {
                  const inspectionQuery = `
                    SELECT quantity, qualified_quantity, unqualified_quantity
                    FROM quality_inspections
                    WHERE id = ?
                  `;
                  const [inspections] = await client.query(inspectionQuery, [
                    receipt.inspection_id,
                  ]);

                  if (inspections && inspections.length > 0) {
                    inspection = inspections[0];
                    const inspectionQty = parseFloat(inspection.quantity) || 0;
                    const inspectionQualifiedQty = parseFloat(inspection.qualified_quantity) || 0;
                    const unqualifiedQty = inspectionQty - inspectionQualifiedQty;
                    logger.info(
                      `检验单信息：检验数量=${inspectionQty}, 合格数量=${inspectionQualifiedQty}, 不合格数量=${unqualifiedQty}`
                    );
                  }
                } catch (inspectionError) {
                  logger.error('查询检验单失败:', inspectionError);
                  // 不影响主流程
                }
              }

              // 为每个物料更新采购订单项目的入库数量
              for (const item of receiptItems) {
                if (item.material_id) {
                  const qualifiedQty = parseFloat(item.qualified_quantity) || 0;

                  // ✅ 入库完成时只更新warehoused_quantity
                  // 使用专门的服务方法,只更新入库数量,不扣减received_quantity
                  await PurchaseOrderStatusService.updateOrderItemWarehousingQuantity(
                    receipt.order_id,
                    item.material_id,
                    qualifiedQty,
                    client
                  );

                  logger.info(
                    `采购订单项目更新成功：物料ID=${item.material_id}, 入库数量=${qualifiedQty}`
                  );
                }
              }
            } catch (orderError) {
              logger.error('更新采购订单状态失败:', orderError);
              logger.error('错误堆栈:', orderError.stack);
              // 不因为订单更新失败而影响收货单完成
            }
          } else {
            logger.warn('入库单没有关联采购订单ID，跳过更新采购订单');
          }
        }
      } catch (traceError) {
        logger.error('更新追溯链路失败:', traceError);
        // 不因为追溯失败而影响收货单的完成
      }

      // (原 sales_orders 自动推进逻辑已迁移至 InventoryService.updateStock 统一收口) 

    }

    // 💡 关键修改：业务逻辑执行完成后，再执行状态更新
    // 这样可以最小化持有 purchase_receipts 行锁的时间，防止超时
    try {
      await client.query(updateQuery, updateParams);
    } catch (updateError) {
      logger.error('执行状态更新SQL失败:', updateError);
      await client.rollback();
      return res.status(500).json({ error: '更新状态失败: ' + updateError.message });
    }

    // 使用普通查询提交事务
    await client.commit();

    // ==========================================
    // [核心] 采购入库完成后，异步触发 MAC(移动加权均价) 成本更新
    // 修复：此前此调用链路缺失，导致 materials.cost_price 始终未被 MAC 算法更新
    // ==========================================
    if (status === STATUS.PURCHASE_RECEIPT.COMPLETED) {
      setImmediate(async () => {
        try {
          const InventoryCostService = require('../../../services/business/InventoryCostService');

          // 从已提交的数据库重新查询入库单物料，获取单价和数量信息
          const [costItems] = await db.pool.execute(
            `SELECT ri.material_id, ri.qualified_quantity, ri.received_quantity,
                    COALESCE(ri.price, poi.price, 0) as unit_price,
                    m.code as material_code
             FROM purchase_receipt_items ri
             LEFT JOIN purchase_receipts pr ON ri.receipt_id = pr.id
             LEFT JOIN purchase_order_items poi ON pr.order_id = poi.order_id AND ri.material_id = poi.material_id
             LEFT JOIN materials m ON ri.material_id = m.id
             WHERE ri.receipt_id = ?`,
            [id]
          );

          for (const item of costItems) {
            if (!item.material_id) continue;
            const qty = parseFloat(item.qualified_quantity || item.received_quantity || 0);
            const unitPrice = parseFloat(item.unit_price || 0);
            if (qty <= 0 || unitPrice <= 0) continue;

            try {
              await InventoryCostService.generateInboundCostEntry(
                {
                  material_id: item.material_id,
                  quantity: qty,
                  unit_cost: unitPrice,
                  reference_no: `GR-${id}`,
                  transaction_type: 'purchase_inbound',
                },
                { userId: req.user?.username || 'system' }
              );
              logger.info(`🔥 物料 ${item.material_code} MAC 成本凭证生成成功 (单价=${unitPrice}, 数量=${qty})`);
            } catch (costErr) {
              logger.error(`⚠️ 物料 ${item.material_code} MAC 成本凭证生成失败: ${costErr.message}`);
            }
          }
        } catch (macError) {
          logger.error(`⚠️ 采购入库 MAC 成本更新失败（不影响入库）: ${macError.message}`);
        }
      });
    }

    // 采购入库完成后，通过事件总线异步解耦触发后续财务集成（应付发票、进项发票）
    if (status === STATUS.PURCHASE_RECEIPT.COMPLETED) {
      setImmediate(() => {
        try {
          const EventBus = require('../../../events/EventBus');
          EventBus.emit('PURCHASE_RECEIPT_COMPLETED', {
            receiptId: id,
            currentUserId: req.user?.id
          });
          logger.info(`📢 业务事件触发: PURCHASE_RECEIPT_COMPLETED (ID: ${id})`);
        } catch (emitErr) {
          logger.error('⚠️ [EventBus] 触发 PURCHASE_RECEIPT_COMPLETED 失败:', emitErr);
        }
      });
    }

    res.json({
      success: true,
      message: '采购入库单状态更新成功',
      data: { newStatus: status },
    });
  } catch (error) {
    // 使用普通查询回滚事务
    try {
      await client.rollback();
    } catch (rollbackError) {
      logger.error('事务回滚失败:', rollbackError);
    }
    logger.error('更新采购入库单状态失败:', error);
    res.status(500).json({ error: error.message || '更新采购入库单状态失败' });
  } finally {
    client.release();
  }
};

// 辅助函数：验证状态变更是否有效
function isValidStatusTransition(currentStatus, newStatus) {
  // 定义有效的状态变更路径
  const validTransitions = {
    draft: ['confirmed', 'completed', 'cancelled'], // 允许草稿直接跳转到完成状态
    confirmed: ['completed', 'cancelled'],
    completed: ['cancelled'],
    cancelled: [],
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

// 获取采购收货单统计
const getReceiptStats = async (req, res) => {
  try {
    // 获取基本统计数据（从明细表计算总金额）
    const statsQuery = `
      SELECT
        COUNT(DISTINCT pr.id) as total,
        SUM(CASE WHEN pr.status = '${STATUS.PURCHASE_RECEIPT.DRAFT}' THEN 1 ELSE 0 END) as draft_count,
        SUM(CASE WHEN pr.status = '${STATUS.PURCHASE_RECEIPT.CONFIRMED}' THEN 1 ELSE 0 END) as confirmed_count,
        SUM(CASE WHEN pr.status = '${STATUS.PURCHASE_RECEIPT.COMPLETED}' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN pr.status = '${STATUS.PURCHASE_RECEIPT.CANCELLED}' THEN 1 ELSE 0 END) as cancelled_count,
        COALESCE(SUM(pri.received_quantity * COALESCE(pri.price, 0)), 0) as total_amount
      FROM purchase_receipts pr
      LEFT JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
    `;

    const [statsResult] = await db.pool.execute(statsQuery);

    // 获取本月统计
    const monthlyQuery = `
      SELECT
        COUNT(DISTINCT pr.id) as monthly_count,
        COALESCE(SUM(pri.received_quantity * COALESCE(pri.price, 0)), 0) as monthly_amount
      FROM purchase_receipts pr
      LEFT JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
      WHERE YEAR(pr.receipt_date) = YEAR(CURDATE())
        AND MONTH(pr.receipt_date) = MONTH(CURDATE())
    `;

    const [monthlyResult] = await db.pool.execute(monthlyQuery);

    // 获取今日统计
    const dailyQuery = `
      SELECT
        COUNT(DISTINCT pr.id) as daily_count,
        COALESCE(SUM(pri.received_quantity * COALESCE(pri.price, 0)), 0) as daily_amount
      FROM purchase_receipts pr
      LEFT JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
      WHERE DATE(pr.receipt_date) = CURDATE()
    `;

    const [dailyResult] = await db.pool.execute(dailyQuery);

    // 获取待处理统计（草稿和已确认状态）
    const pendingQuery = `
      SELECT
        COUNT(*) as pending_count
      FROM purchase_receipts
      WHERE status IN ('${STATUS.PURCHASE_RECEIPT.DRAFT}', '${STATUS.PURCHASE_RECEIPT.CONFIRMED}')
    `;

    const [pendingResult] = await db.pool.execute(pendingQuery);

    const stats = {
      total: parseInt(statsResult[0].total) || 0,
      draftCount: parseInt(statsResult[0].draft_count) || 0,
      confirmedCount: parseInt(statsResult[0].confirmed_count) || 0,
      completedCount: parseInt(statsResult[0].completed_count) || 0,
      cancelledCount: parseInt(statsResult[0].cancelled_count) || 0,
      totalAmount: parseFloat(statsResult[0].total_amount) || 0,
      monthlyCount: parseInt(monthlyResult[0].monthly_count) || 0,
      monthlyAmount: parseFloat(monthlyResult[0].monthly_amount) || 0,
      dailyCount: parseInt(dailyResult[0].daily_count) || 0,
      dailyAmount: parseFloat(dailyResult[0].daily_amount) || 0,
      pendingCount: parseInt(pendingResult[0].pending_count) || 0,
    };

    ResponseHandler.success(res, stats, '获取采购收货单统计成功');
  } catch (error) {
    logger.error('获取采购收货单统计失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: '获取采购收货单统计失败',
    });
  }
};

/**
 * 获取指定物料的采购历史
 * GET /api/purchase/receipts/material/:materialId
 */
const getMaterialPurchaseHistory = async (req, res) => {
  try {
    const { materialId } = req.params;
    const { page = 1, pageSize = 10, startDate, endDate, supplierId } = req.query;

    // 验证参数
    if (!materialId) {
      return res.status(400).json({
        success: false,
        error: '物料ID不能为空',
      });
    }

    // 解析并验证 materialId
    const parsedMaterialId = parseInt(materialId, 10);
    if (isNaN(parsedMaterialId)) {
      return res.status(400).json({
        success: false,
        error: '物料ID必须是有效的数字',
      });
    }

    // 确保分页参数是有效的数字
    const actualPage = Math.max(1, parseInt(page, 10) || 1);
    const actualPageSize = Math.max(1, Math.min(10000, parseInt(pageSize, 10) || 10));
    const offset = (actualPage - 1) * actualPageSize;

    const client = await db.getClient();

    try {
      // 构建查询条件
      let whereClause = 'WHERE pri.material_id = ?';
      const queryParams = [parsedMaterialId]; // 使用已验证的数字

      if (startDate) {
        whereClause += ' AND pr.receipt_date >= ?';
        queryParams.push(startDate);
      }

      if (endDate) {
        whereClause += ' AND pr.receipt_date <= ?';
        queryParams.push(endDate);
      }

      if (supplierId) {
        const parsedSupplierId = parseInt(supplierId, 10);
        if (!isNaN(parsedSupplierId)) {
          whereClause += ' AND pr.supplier_id = ?';
          queryParams.push(parsedSupplierId); // 只有在有效时才添加
        }
      }

      // 只查询已完成的入库单
      whereClause += ' AND pr.status = ?';
      queryParams.push('completed');

      // 记录查询参数用于调试
      logger.debug('查询物料采购历史参数:', {
        materialId: parsedMaterialId,
        queryParams,
        actualPage,
        actualPageSize,
        offset,
      });

      // 查询总数
      const countQuery = `
        SELECT COUNT(DISTINCT pr.id) as total
        FROM purchase_receipts pr
        INNER JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
        ${whereClause}
      `;

      logger.debug('执行物料采购历史计数查询:', {
        queryParams,
        types: queryParams.map((p) => typeof p),
        values: queryParams.map((p) => (p === null ? 'null' : p === undefined ? 'undefined' : p)),
      });

      const countResult = await client.query(countQuery, queryParams);
      const countRows = Array.isArray(countResult)
        ? countResult
        : countResult && countResult.rows
          ? countResult.rows
          : [];
      const total = countRows.length > 0 ? parseInt(countRows[0].total) || 0 : 0;

      // 查询采购历史数据
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      // 注：pr.supplier_name 可能为空，需要 JOIN suppliers 表获取
      // 注：字段别名 unit_price/total_amount 需要与前端 prop 匹配
      const dataQuery = `
        SELECT
          pr.id,
          pr.receipt_no,
          DATE_FORMAT(pr.receipt_date, '%Y-%m-%d') as receipt_date,
          pr.supplier_id,
          COALESCE(NULLIF(pr.supplier_name, ''), s.name, '') as supplier_name,
          pr.warehouse_id,
          pr.warehouse_name,
          pr.order_no,
          pr.operator,
          pr.remarks,
          pr.status,
          pr.created_at,
          pri.material_id,
          pri.material_code,
          pri.material_name,
          pri.specification,
          pri.unit,
          pri.ordered_quantity,
          pri.quantity,
          pri.received_quantity,
          pri.qualified_quantity,
          pri.price as unit_price,
          (pri.received_quantity * pri.price) as total_amount
        FROM purchase_receipts pr
        INNER JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
        LEFT JOIN suppliers s ON pr.supplier_id = s.id
        ${whereClause}
        ORDER BY pr.receipt_date DESC, pr.created_at DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `;

      const dataParams = queryParams;

      // 记录完整的查询参数用于调试
      logger.debug('执行物料采购历史查询:', {
        whereClause,
        dataParams,
        paramCount: dataParams.length,
        types: dataParams.map((p) => typeof p),
        values: dataParams.map((p) => (p === null ? 'null' : p === undefined ? 'undefined' : p)),
        actualPageSize,
        offset,
      });

      // 验证参数
      const placeholderCount = (dataQuery.match(/\?/g) || []).length;
      if (dataParams.length !== placeholderCount) {
        throw new Error(
          `参数数量不匹配: 需要 ${placeholderCount} 个参数，但提供了 ${dataParams.length} 个`
        );
      }

      // 验证所有参数都不是 undefined 或 NaN
      for (let i = 0; i < dataParams.length; i++) {
        if (dataParams[i] === undefined) {
          throw new Error(`参数 ${i} 是 undefined`);
        }
        if (typeof dataParams[i] === 'number' && isNaN(dataParams[i])) {
          throw new Error(`参数 ${i} 是 NaN`);
        }
      }

      const dataResult = await client.query(dataQuery, dataParams);
      const dataRows = Array.isArray(dataResult)
        ? dataResult
        : dataResult && dataResult.rows
          ? dataResult.rows
          : [];

      // 返回结果
      res.json({
        success: true,
        data: {
          rows: dataRows,
          total: total,
          page: actualPage,
          pageSize: actualPageSize,
        },
        message: '获取物料采购历史成功',
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('获取物料采购历史失败:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: '获取物料采购历史失败',
    });
  }
};

// 获取通用的所有采购历史明细项目
const getPurchaseHistoryItems = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, materialCode, materialName, supplierId, startDate, endDate } = req.query;

    const actualPage = Math.max(1, parseInt(page, 10) || 1);
    const actualPageSize = Math.max(1, Math.min(1000, parseInt(pageSize, 10) || 20));
    const offset = (actualPage - 1) * actualPageSize;

    const client = await db.getClient();
    try {
      let whereClause = 'WHERE pr.status = ?';
      const queryParams = ['completed'];
      const countParams = ['completed'];

      // 部件编码搜索 (模糊搜索)
      if (materialCode) {
        whereClause += ' AND pri.material_code LIKE ?';
        queryParams.push(`%${materialCode}%`);
        countParams.push(`%${materialCode}%`);
      }

      // 名称搜索 (模糊搜索)
      if (materialName) {
        whereClause += ' AND pri.material_name LIKE ?';
        queryParams.push(`%${materialName}%`);
        countParams.push(`%${materialName}%`);
      }

      // 供应商过滤
      if (supplierId) {
        const parsedSupplierId = parseInt(supplierId, 10);
        if (!isNaN(parsedSupplierId)) {
          whereClause += ' AND pr.supplier_id = ?';
          queryParams.push(parsedSupplierId);
          countParams.push(parsedSupplierId);
        }
      }

      // 日期过滤
      if (startDate) {
        whereClause += ' AND pr.receipt_date >= ?';
        queryParams.push(startDate);
        countParams.push(startDate);
      }
      if (endDate) {
        whereClause += ' AND pr.receipt_date <= ?';
        queryParams.push(endDate);
        countParams.push(endDate);
      }

      // 查询总数
      const countQuery = `
        SELECT count(*) as total
        FROM purchase_receipts pr
        INNER JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
        ${whereClause}
      `;
      const countResult = await client.query(countQuery, countParams);
      const total = Array.isArray(countResult)
        ? countResult[0]?.total || 0
        : countResult && countResult.rows
          ? countResult.rows[0]?.total || 0
          : 0;

      // 查询实体数据
      const dataQuery = `
        SELECT
          pr.id as receipt_id,
          pr.receipt_no,
          DATE_FORMAT(pr.receipt_date, '%Y-%m-%d') as receipt_date,
          pr.supplier_id,
          COALESCE(NULLIF(pr.supplier_name, ''), s.name, '') as supplier_name,
          pr.warehouse_name,
          pri.id as item_id,
          pri.material_id,
          pri.material_code,
          pri.material_name,
          pri.specification,
          pri.unit,
          pri.qualified_quantity as quantity,
          pri.price as unit_price,
          (pri.qualified_quantity * pri.price) as total_amount
        FROM purchase_receipts pr
        INNER JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
        LEFT JOIN suppliers s ON pr.supplier_id = s.id
        ${whereClause}
        ORDER BY pr.receipt_date DESC, pr.id DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `;
      
      const dataResult = await client.query(dataQuery, queryParams);
      const dataRows = Array.isArray(dataResult)
        ? dataResult
        : dataResult && dataResult.rows
          ? dataResult.rows
          : [];

      res.json({
        success: true,
        data: {
          rows: dataRows,
          total: parseInt(total) || 0,
          page: actualPage,
          pageSize: actualPageSize,
        },
        message: '获取全量采购历史明细成功'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('获取全量采购历史明细失败:', error);
    res.status(500).json({ error: '获取采购历史失败: ' + error.message });
  }
};

module.exports = {
  getReceipts,
  getReceipt,
  createReceipt,
  updateReceipt,
  updateReceiptStatus,
  getReceiptStats,
  getMaterialPurchaseHistory,
  getPurchaseHistoryItems,
};
