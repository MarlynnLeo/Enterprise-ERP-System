/**
 * purchaseReceiptController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const crypto = require('crypto');

const db = require('../../../config/db');
const purchaseModel = require('../../../models/purchase');
const { desensitizeData, hasFinancePermission } = require('../../../utils/desensitizer');
const PurchaseOrderStatusService = require('../../../services/business/PurchaseOrderStatusService');
const PurchasePriceService = require('../../../services/business/PurchasePriceService');
const { getCurrentUserName } = require('../../../utils/userHelper');
const DLQService = require('../../../services/business/DLQService');
const DomainEventService = require('../../../services/business/DomainEventService');
const AuditLogService = require('../../../services/system/AuditLogService');
const { lineAmount, normalizeTaxRate, roundMoney, taxAmount: calculateTaxAmount } = require('../../../utils/money');
const { resolveUnitPrice } = require('../../../utils/unitPriceFields');
const { financeConfig } = require('../../../config/financeConfig');
const { PURCHASE_RECEIPT_STATUS_TRANSITIONS } = require('../../../constants/statusRegistry');
const { getRequestActorLabel } = require('../../../utils/userUtils');
const {
  purchaseReceiptMap,
  purchaseReceiptItemMap,
  toNumber: toNumberSafe,
} = require('../../../utils/purchase/purchaseFieldMap');

// 状态常量
const STATUS = {
  PURCHASE_RECEIPT: {
    DRAFT: 'draft',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function getIdempotencyKey(req) {
  return (
    req.headers['x-idempotency-key'] ||
    req.headers['idempotency-key'] ||
    req.body?.idempotencyKey ||
    req.body?.idempotency_key ||
    null
  );
}

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
    const actualPageSize = Math.min(Math.max(parseInt(limit || pageSize, 10) || 20, 1), 100);
    const actualPage = parseInt(page, 10);
    // 验证参数
    if (isNaN(actualPage) || isNaN(actualPageSize) || actualPage < 1 || actualPageSize < 1) {
      return ResponseHandler.error(res, '无效的分页参数', 'VALIDATION_ERROR', 400);
    }

    const offset = (actualPage - 1) * actualPageSize;

    // 构建 WHERE 条件（数据查询和计数查询共用）
    const ScopeGuard = require('../../../authorization/ScopeGuard');
    const scopeClause = await ScopeGuard.applyListScope(req, 'purchase_receipt', {
      tableAlias: 'r',
      ownerAlias: 'purchase_receipt_owner_scope',
      accessMode: 'read',
    });
    let whereClause = ' WHERE r.deleted_at IS NULL';
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

    whereClause += scopeClause.where || '';
    queryParams.push(...(scopeClause.params || []));

    const connection = await db.pool.getConnection();
    try {
      // 1. 快速计数查询（只查主表，不走 JOIN）
      const countQuery = `SELECT COUNT(*) as total FROM purchase_receipts r ${scopeClause.join} ${whereClause}`;
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
        ${scopeClause.join}
        ${whereClause}
        ORDER BY r.created_at DESC LIMIT ${actualPageSize} OFFSET ${offset}
      `;
      const [result] = await connection.query(dataQuery, queryParams);

      // 列表：snake 行 → camel API（purchaseReceiptMap）
      const receipts = result.map((row) =>
        purchaseReceiptMap.toApi({
          ...row,
          order_no: row.joined_order_no || row.order_no || '',
          supplier_name: row.joined_supplier_name || row.supplier_name || '',
          warehouse_name: row.joined_warehouse_name || row.warehouse_name || '',
          receiver: row.operator === 'system' ? '系统' : row.realName || row.operator || '',
        })
      );

      const hasPerm = await hasFinancePermission(req.user);
      const desensitizedReceipts = desensitizeData(receipts, hasPerm);

      return ResponseHandler.paginated(
        res,
        desensitizedReceipts,
        totalCount,
        actualPage,
        actualPageSize,
        undefined,
        {
          items: desensitizedReceipts,
        }
      );
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
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'purchase_receipt', id, { accessMode: 'read' }))) {
        return ResponseHandler.forbidden(res, '无权访问该采购入库单');
      }
    }
  }

  let connection;
  let retryCount = 0;
  const maxRetries = 3;

  const tryGetReceipt = async () => {
    try {
      const { id } = req.params;

      if (!id || isNaN(parseInt(id, 10))) {
        return ResponseHandler.error(res, '无效的ID参数', 'VALIDATION_ERROR', 400);
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
          pr.id = ? AND pr.deleted_at IS NULL
      `;

      const [result] = await connection.query(query, [receiptId]);

      if (result.length === 0) {
        return ResponseHandler.notFound(res, '采购入库单不存在');
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

      // 明细：仅 camel（purchaseReceiptItemMap）；扩展数量字段一并输出
      const formattedItems = itemsResult.map((item) => {
        const apiItem = purchaseReceiptItemMap.toApi({
          ...item,
          specification: item.specs,
        });
        apiItem.unitId = item.unit_id ?? null;
        apiItem.unitName = item.unit_name ?? null;
        apiItem.orderedQuantity = toNumberSafe(item.ordered_quantity, 0);
        apiItem.receivedQuantity = toNumberSafe(item.received_quantity, 0);
        return apiItem;
      });

      const response = purchaseReceiptMap.toApi({
        ...receipt,
        order_no: receipt.order_no,
        supplier_name: receipt.supplier_name,
        warehouse_name: receipt.warehouse_name,
        receiver: receipt.operator === 'system' ? '系统' : receipt.realName || receipt.operator,
        items: undefined,
      });
      response.items = formattedItems;
      response.remarks = response.remarks || '';

      const hasPerm = await hasFinancePermission(req.user);
      const desensitizedResponse = desensitizeData(response, hasPerm);

      // 直接返回响应对象，不再嵌套在data中
      return ResponseHandler.success(res, desensitizedResponse);
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
      return ResponseHandler.error(res, '获取采购入库详情失败', 'SERVER_ERROR', 500, error);
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

    // HTTP camel → 内部（purchaseReceiptMap）；质检来源标志仅认 camel fromInspection / inspectionId
    const mapped = purchaseReceiptMap.fromApi(req.body || {});
    const orderId = mapped.order_id ?? req.body?.orderId;
    const supplierId = mapped.supplier_id ?? req.body?.supplierId;
    const warehouseId = mapped.warehouse_id ?? req.body?.warehouseId;
    const receiptDate = mapped.receipt_date ?? req.body?.receiptDate;
    const receiver = req.body?.receiver || '';
    const remarks = mapped.remarks ?? req.body?.remarks ?? '';
    const rawItems = mapped.items ?? req.body?.items ?? [];
    const fromInspection = Boolean(req.body?.fromInspection);
    const material_id = req.body?.materialId ?? req.body?.material_id ?? null;
    const only_inspection_material = Boolean(
      req.body?.onlyInspectionMaterial ?? req.body?.only_inspection_material
    );

    const inspectionId = req.body?.inspectionId ?? null;
    let inspectionContext = null;

    // 带 inspectionId 即按质检来源处理
    const isFromInspection = Boolean(fromInspection || inspectionId);
    const clientIdempotencyKey = getIdempotencyKey(req) || mapped.idempotency_key;
    const receiptIdempotencyKey = inspectionId
      ? `purchase_receipt:inspection:${inspectionId}`
      : clientIdempotencyKey
        ? `purchase_receipt:manual:${clientIdempotencyKey}`
        : null;
    // 明细：契约层已转 snake；若仍是原始 camel 再 map 一次
    let items = Array.isArray(rawItems)
      ? rawItems.map((it) =>
          it.material_id != null || it.price != null ? it : purchaseReceiptItemMap.fromApi(it)
        )
      : [];
    const idempotencyHash = sha256(
      stableStringify({
        orderId,
        supplierId,
        warehouseId,
        receiptDate,
        receiver,
        remarks,
        inspectionId,
        items,
      })
    );
    const createValidationError = (message) => {
      const error = new Error(message);
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      return error;
    };

    logger.debug('Purchase receipt payload normalized', {
      orderId,
      supplierId,
      warehouseId,
      receiptDate,
      receiver,
      remarks,
      isFromInspection,
      inspectionId,
      material_id,
      only_inspection_material,
      itemsType: typeof items,
      itemsIsArray: Array.isArray(items),
      itemsLength: items.length,
    });

    // 验证必填字段
    if (!orderId || !supplierId || !warehouseId || !receiptDate) {
      await client.query('ROLLBACK');
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    if (!isFromInspection && !receiptIdempotencyKey) {
      await client.rollback();
      return ResponseHandler.error(
        res,
        '手工创建采购收货单必须提供 Idempotency-Key，防止重复入库',
        'IDEMPOTENCY_KEY_REQUIRED',
        400
      );
    }

    // 确保warehouseId是数字类型
    const warehouseIdNumber = parseInt(warehouseId);
    if (isNaN(warehouseIdNumber)) {
      await client.query('ROLLBACK');
      logger.error(`仓库ID ${warehouseId} 不是有效的数字`);
      return ResponseHandler.error(res, `仓库ID必须是数字: ${warehouseId}`, 'VALIDATION_ERROR', 400);
    }

    // 第一性原理防御：获取订单信息并开启关联悲观锁
    let orderResult;
    try {
      // 通过排它锁锁住主干订单，解决高并发下的车间连击爆雷
      const orderQuery = 'SELECT order_no, status FROM purchase_orders WHERE id = ? AND deleted_at IS NULL FOR UPDATE';
      const [rows] = await client.query(orderQuery, [orderId]);
      orderResult = rows;

      if (!orderResult || orderResult.length === 0) {
        await client.rollback();
        return ResponseHandler.notFound(res, '采购订单不存在');
      }

      // 业务硬控：已终止的订单不可在途收货（允许 completed 状态，因为入库可能在订单收货完成后进行）
      if (['cancelled', 'closed'].includes(orderResult[0].status)) {
        await client.rollback();
        return ResponseHandler.error(res, `采购订单当前状态为 ${orderResult[0].status}，无法操作`, 'VALIDATION_ERROR', 400);
      }

      if (receiptIdempotencyKey) {
        const [existingByKey] = await client.query(
          `SELECT id, receipt_no, idempotency_hash
             FROM purchase_receipts
            WHERE idempotency_key = ?
              AND deleted_at IS NULL
            LIMIT 1
            FOR UPDATE`,
          [receiptIdempotencyKey]
        );
        if (existingByKey.length > 0) {
          await client.rollback();
          if (existingByKey[0].idempotency_hash && existingByKey[0].idempotency_hash !== idempotencyHash) {
            return ResponseHandler.error(
              res,
              '相同 Idempotency-Key 已用于不同收货单内容',
              'IDEMPOTENCY_CONFLICT',
              409
            );
          }
          return ResponseHandler.success(
            res,
            {
              success: true,
              id: existingByKey[0].id,
              receiptNo: existingByKey[0].receipt_no,
              idempotent: true,
            },
            '该请求已创建过采购收货单',
            200
          );
        }
      }

      // ========== 防重复建单（基于实际业务关系，非订单级暴力阻击） ==========
      // 业务事实：一个采购订单允许多次到货、多次检验、多次收货（分批收货）
      // 防重复的维度应该是：同一张检验单不能重复建单 / 手动建单防连击
      if (inspectionId) {
        const [inspectionRows] = await client.query(
          `SELECT id, inspection_no, inspection_type, reference_id,
                  COALESCE(material_id, product_id) AS material_id,
                  status, qualified_quantity, batch_no
           FROM quality_inspections
           WHERE id = ? AND deleted_at IS NULL
           FOR UPDATE`,
          [inspectionId]
        );

        if (!inspectionRows || inspectionRows.length === 0) {
          await client.rollback();
          return ResponseHandler.notFound(res, '来料检验单不存在');
        }

        inspectionContext = inspectionRows[0];
        const inspectionOrderId = Number(inspectionContext.reference_id);
        const cleanOrderId = Number(orderId);
        const qualifiedQuantity = parseFloat(inspectionContext.qualified_quantity) || 0;

        if (inspectionContext.inspection_type !== 'incoming') {
          await client.rollback();
          return ResponseHandler.error(res, '只能引用来料检验单创建采购入库单', 'VALIDATION_ERROR', 400);
        }

        if (inspectionOrderId !== cleanOrderId) {
          await client.rollback();
          return ResponseHandler.error(res, '来料检验单与采购订单不匹配，不能创建入库单', 'VALIDATION_ERROR', 400);
        }

        if (!['passed', 'partial', 'completed'].includes(inspectionContext.status)) {
          await client.rollback();
          return ResponseHandler.error(
            res,
            `来料检验单状态为 ${inspectionContext.status}，只有合格、部分合格或已完成才能创建入库单`,
            'VALIDATION_ERROR',
            400
          );
        }

        if (qualifiedQuantity <= 0) {
          await client.rollback();
          return ResponseHandler.error(res, '来料检验单合格数量必须大于0，不能创建入库单', 'VALIDATION_ERROR', 400);
        }

        // 场景A：来自检验单的自动/手动建单 → 基于 inspection_id 精确去重
        const dupQuery = `SELECT id, receipt_no FROM purchase_receipts WHERE inspection_id = ? AND deleted_at IS NULL AND status != 'cancelled' LIMIT 1`;
        const [dupReceipts] = await client.query(dupQuery, [inspectionId]);
        if (dupReceipts.length > 0) {
          await client.rollback();
          logger.info(`检验单 ${inspectionId} 已有收货单 ${dupReceipts[0].receipt_no}，跳过重复创建`);
          return ResponseHandler.success(
            res,
            {
              id: dupReceipts[0].id,
              receiptNo: dupReceipts[0].receipt_no,
            },
            '该检验单已创建过收货单',
            200
          );
        }
      }

    } catch (dbError) {
      logger.error('查询并锁定订单信息失败:', dbError);
      await client.rollback();
      return ResponseHandler.error(res, '数据库级联合防护错误', 'SERVER_ERROR', 500, dbError);
    }

    const orderNo = orderResult[0].order_no ? orderResult[0].order_no : '';

    // 获取供应商信息
    let supplierResult;
    try {
      const supplierQuery = 'SELECT name FROM suppliers WHERE id = ? AND deleted_at IS NULL';
      const [rows] = await client.query(supplierQuery, [supplierId]);
      supplierResult = rows;
    } catch (dbError) {
      logger.error('查询供应商信息失败:', dbError);
      await client.rollback();
      return ResponseHandler.error(res, '数据库查询错误', 'SERVER_ERROR', 500, dbError);
    }

    if (!supplierResult || supplierResult.length === 0) {
      await client.rollback();
      return ResponseHandler.notFound(res, '供应商不存在');
    }

    const supplierName = supplierResult[0]?.name || '';

    // 获取仓库信息
    let warehouseResult;
    try {
      const warehouseQuery = 'SELECT name FROM locations WHERE id = ? AND deleted_at IS NULL';
      const [rows] = await client.query(warehouseQuery, [warehouseId]);
      warehouseResult = rows;
    } catch (dbError) {
      logger.error('查询仓库信息失败:', dbError);
      await client.rollback();
      return ResponseHandler.error(res, '数据库查询错误', 'SERVER_ERROR', 500, dbError);
    }

    if (!warehouseResult || warehouseResult.length === 0) {
      await client.rollback();
      logger.error(`仓库ID ${warehouseId} 不存在于locations表中`);
      return ResponseHandler.notFound(res, '仓库不存在');
    }

    const warehouseName = warehouseResult[0]?.name || '';

    // 生成入库单号

    if (!purchaseModel || typeof purchaseModel.generateReceiptNo !== 'function') {
      logger.error('purchaseModel对象缺失或generateReceiptNo方法不存在!');
      await client.rollback();
      return ResponseHandler.error(res, '系统错误: 无法生成入库单号', 'SERVER_ERROR', 500);
    }

    let receiptNo;
    try {
      receiptNo = await purchaseModel.generateReceiptNo(client);
    } catch (genError) {
      logger.error('生成入库单号失败:', genError);
      await client.rollback();
      return ResponseHandler.error(res, '生成入库单号失败', 'SERVER_ERROR', 500, genError);
    }

    if (!receiptNo) {
      logger.error('生成的入库单号为空!');
      await client.rollback();
      return ResponseHandler.error(res, '系统错误: 生成的入库单号为空', 'SERVER_ERROR', 500);
    }

    // 使用提供的收货人，如果没有则使用登录用户名
    // 优先使用前端传入的receiver(真实姓名)作为operator
    const operator = await getCurrentUserName(req);

    // 创建采购入库单
    const insertQuery = `
      INSERT INTO purchase_receipts (
        receipt_no, order_id, order_no, supplier_id, supplier_name,
        warehouse_id, warehouse_name, receipt_date, operator, remarks, status,
        from_inspection, inspection_id, idempotency_key, idempotency_hash, active_inspection_key, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      inspectionId, // 关联的检验单ID
      receiptIdempotencyKey,
      idempotencyHash,
      inspectionId ? `INSPECTION:${inspectionId}` : null,
      (() => { const ScopeGuard = require('../../../authorization/ScopeGuard'); return ScopeGuard.tryStampOwner(req, 'purchase_receipt').created_by; })(),
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
      return ResponseHandler.error(res, '数据处理错误：参数包含undefined值', 'SERVER_ERROR', 500);
    }

    // 插入采购入库单
    let receiptId;
    try {
      const [result] = await client.query(insertQuery, insertParams);
      receiptId = result.insertId;

      if (!receiptId) {
        throw new Error('插入成功但无法获取收货单ID');
      }

      // 标准业务链：PO → 收货；来料检验 → 收货（DocumentChainService / 类型 SSOT）
      const DocumentChainService = require('../../../services/business/DocumentChainService');
      let inspectionNo = null;
      if (isFromInspection && inspectionId) {
        const [[insp]] = await client.query(
          'SELECT inspection_no FROM quality_inspections WHERE id = ? AND deleted_at IS NULL LIMIT 1',
          [inspectionId]
        );
        inspectionNo = insp?.inspection_no || null;
      }
      await DocumentChainService.afterPurchaseReceiptCreated(
        {
          orderId,
          orderNo,
          receiptId,
          receiptNo,
          inspectionId: isFromInspection ? inspectionId : null,
          inspectionNo,
        },
        req.user?.userId || req.user?.id || null,
        client
      );
    } catch (insertError) {
      if (insertError.code === 'ER_DUP_ENTRY' && receiptIdempotencyKey) {
        const [existingRows] = await client.query(
          `SELECT id, receipt_no, idempotency_hash
             FROM purchase_receipts
            WHERE idempotency_key = ? OR active_inspection_key = ?
            LIMIT 1`,
          [receiptIdempotencyKey, inspectionId ? `INSPECTION:${inspectionId}` : null]
        );
        if (existingRows.length > 0) {
          await client.rollback();
          if (existingRows[0].idempotency_hash && existingRows[0].idempotency_hash !== idempotencyHash) {
            return ResponseHandler.error(
              res,
              '相同幂等键已绑定不同采购收货内容',
              'IDEMPOTENCY_CONFLICT',
              409
            );
          }
          return ResponseHandler.success(
            res,
            {
              success: true,
              id: existingRows[0].id,
              receiptNo: existingRows[0].receipt_no,
              idempotent: true,
            },
            '该请求已创建过采购收货单',
            200
          );
        }
      }
      logger.error('插入采购入库单失败:', insertError);
      await client.rollback();
      return ResponseHandler.error(res, '数据库插入错误', 'SERVER_ERROR', 500, insertError);
    }

    // 获取检验单批次号（如果来自检验单）
    const inspectionBatchMap = new Map(); // 物料ID -> 批次号的映射
    if (isFromInspection && inspectionId) {
      try {
        const inspectionQuery = `
          SELECT COALESCE(material_id, product_id) AS material_id, batch_no
          FROM quality_inspections
          WHERE id = ? AND batch_no IS NOT NULL
        `;
        const [inspections] = await client.query(inspectionQuery, [inspectionId]);

        if (inspections && inspections.length > 0) {
          inspections.forEach((insp) => {
            if (insp.material_id && insp.batch_no) {
              inspectionBatchMap.set(Number(insp.material_id), insp.batch_no);
            }
          });
          logger.info(
            `✅ 从检验单 ${inspectionId} 获取到 ${inspectionBatchMap.size} 个物料的批次号`
          );
        } else {
          logger.warn(`Inspection has no batch number data: inspectionId=${inspectionId}`);
        }
      } catch (inspectionError) {
        logger.error('获取检验单批次号失败:', inspectionError);
        throw inspectionError;
      }
    } else {
      logger.info(
        `入库单不是从检验单创建，或没有检验单ID (isFromInspection=${isFromInspection}, inspectionId=${inspectionId})`
      );
    }

    // 创建采购入库物料项目
    let receiptTotalAmount = 0;
    let receiptTaxAmount = 0;

    if (items && Array.isArray(items) && items.length > 0) {
      // 如果来自检验且只使用检验物料，则过滤物料列表，只保留检验物料
      if (isFromInspection && only_inspection_material && material_id) {
        // items 已由 purchaseReceiptItemMap 转为 snake
        const filteredItems = items.filter((item) => {
          const itemMatId = item.material_id;
          return String(itemMatId) === String(material_id);
        });

        if (filteredItems.length !== items.length) {
          // 替换原始数组
          items = filteredItems;
        }
      }

      const insertItemsQuery = `
        INSERT INTO purchase_receipt_items
        (receipt_id, order_item_id, material_id, material_code, material_name,
         specification, unit_id, ordered_quantity, quantity, received_quantity, qualified_quantity,
         batch_number, price, tax_rate, amount_excluding_tax, tax_amount, total_amount, remarks, from_inspection)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const receiptMaterialIds = [...new Set(
        items
          .map((item) => Number(item?.material_id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
      const materialInfoMap = new Map();
      const orderContextMap = new Map();

      if (receiptMaterialIds.length > 0) {
        const materialPlaceholders = receiptMaterialIds.map(() => '?').join(',');
        const [materials] = await client.query(
          `SELECT id, code, name FROM materials WHERE id IN (${materialPlaceholders})`,
          receiptMaterialIds
        );
        materials.forEach((material) => {
          materialInfoMap.set(Number(material.id), material);
        });

        if (orderId) {
          const [orderPrices] = await client.query(
            `SELECT id AS order_item_id, material_id, price, tax_rate
             FROM purchase_order_items
             WHERE order_id = ? AND material_id IN (${materialPlaceholders})
             ORDER BY id`,
            [orderId, ...receiptMaterialIds]
          );
          orderPrices.forEach((row) => {
            const key = Number(row.material_id);
            const contexts = orderContextMap.get(key) || [];
            contexts.push({
              orderItemId: Number(row.order_item_id),
              price: parseFloat(row.price) || 0,
              taxRate: normalizeTaxRate(row.tax_rate, financeConfig.get('tax.defaultVATRate', 0.13)),
            });
            orderContextMap.set(key, contexts);
          });
        }
      }

      const resolvedReceiptPrices = await PurchasePriceService.resolvePurchasePrices(
        client,
        items.map((item) => ({
          materialId: item?.materialId || item?.material_id,
          materialCode: item?.materialCode || item?.material_code,
          supplierId,
        }))
      );

      let insertedItemCount = 0;
      for (let i = 0; i < items.length; i++) {
        try {
          const item = items[i];

          // 检查item是否是一个有效的对象
          if (!item || typeof item !== 'object') {
            throw new Error(`第${i + 1}个物料项无效`);
          }

          // items 已由 FieldMap 转为 snake（material_id / material_code …）
          let materialCode = item.material_code || '';
          let materialName = item.material_name || '';
          const currentMaterialId = Number(item.material_id) || null;

          if ((!materialCode || !materialName) && currentMaterialId) {
            const materialInfo = materialInfoMap.get(currentMaterialId);
            if (materialInfo) {
              materialCode = materialCode || materialInfo.code || '';
              materialName = materialName || materialInfo.name || '';
            }
          }

          if (!currentMaterialId) {
            throw new Error(`第${i + 1}个物料项缺少物料ID`);
          }

          const orderContexts = orderContextMap.get(currentMaterialId) || [];
          const requestedOrderItemId = Number(item.order_item_id) || null;
          let orderContext;
          if (requestedOrderItemId) {
            orderContext = orderContexts.find(
              (context) => context.orderItemId === requestedOrderItemId
            );
            if (!orderContext) {
              throw createValidationError(
                `第${i + 1}个物料项指定的采购订单明细不属于当前订单或物料`
              );
            }
          } else if (orderContexts.length === 1) {
            [orderContext] = orderContexts;
          } else if (orderContexts.length === 0) {
            throw createValidationError(`第${i + 1}个物料项不属于当前采购订单`);
          } else {
            throw createValidationError(
              `采购订单中物料 ${materialCode || currentMaterialId} 存在多条明细，请明确提供采购订单明细ID`
            );
          }

          if (
            inspectionContext &&
            String(currentMaterialId) !== String(inspectionContext.material_id)
          ) {
            throw createValidationError(
              `第${i + 1}个物料项不属于所引用的来料检验单，不能混入其他物料`
            );
          }

          if (!materialCode || !materialName) {
            throw new Error(`第${i + 1}个物料项基础资料不完整`);
          }

          // 获取批次号：优先使用检验单的批次号，其次使用传入的批次号
          let batchNumber = null;

          // 1. 优先使用检验单的批次号（从数据库查询）
          if (currentMaterialId && inspectionBatchMap.has(currentMaterialId)) {
            batchNumber = inspectionBatchMap.get(currentMaterialId);
            logger.info(`物料 ${materialCode} 使用检验单批次号: ${batchNumber}`);
          }
          // 2. 其次使用明细批次号（FieldMap 后为 snake batch_number）
          else if (item.batch_number) {
            batchNumber = item.batch_number;
            logger.info(`物料 ${materialCode} 使用传入批次号: ${batchNumber}`);
          }
          // 3. 如果都没有，记录警告但不自动生成
          else if (isFromInspection) {
            throw createValidationError(
              `来自质检单的物料 ${materialCode} 缺少批次号，不能创建入库单`
            );
          } else {
            logger.warn(`物料 ${materialCode} 没有批次号，将不记录批次信息`);
          }

          // 获取价格：优先使用传入价格（price/unit_price），其次采购订单，最后统一取价
          let itemPrice = resolveUnitPrice(item);
          if (itemPrice <= 0 && currentMaterialId) {
            itemPrice = orderContext.price || 0;
            if (itemPrice > 0) {
              logger.info(`物料 ${materialCode} 从采购订单获取价格: ${itemPrice}`);
            }
          }
          if (itemPrice <= 0 && currentMaterialId) {
            const priceInfo = resolvedReceiptPrices[i] || {};
            itemPrice = parseFloat(priceInfo.price) || 0;
            if (itemPrice > 0) {
              logger.info(`物料 ${materialCode} 从统一采购取价服务获取价格: ${itemPrice}`);
            }
          }

          if (!(itemPrice > 0)) {
            throw createValidationError(
              `物料 ${materialCode} 缺少有效采购成本，不能完成收货入库；请先维护采购订单单价或收货单价`
            );
          }

          // FieldMap snake：quantity / received_quantity / qualified_quantity
          // Use || so quantity=0 falls through to received_quantity (common camel-only bodies)
          const receiptQuantity =
            parseFloat(item.quantity) || parseFloat(item.received_quantity) || 0;
          if (receiptQuantity <= 0) {
            throw new Error(`物料 ${materialCode} 入库数量必须大于0`);
          }

          const qualifiedQuantity = parseFloat(item.qualified_quantity) || 0;
          if (inspectionContext) {
            const inspectionQualifiedQuantity =
              parseFloat(inspectionContext.qualified_quantity) || 0;
            if (qualifiedQuantity <= 0) {
              throw createValidationError(`物料 ${materialCode} 合格数量必须大于0`);
            }
            if (qualifiedQuantity > inspectionQualifiedQuantity + 0.0001) {
              throw createValidationError(
                `物料 ${materialCode} 合格入库数量超过检验合格数量: 检验合格=${inspectionQualifiedQuantity}, 本次=${qualifiedQuantity}`
              );
            }
          }

          // 确保所有参数都不是undefined
          const taxRate = normalizeTaxRate(
            item.tax_rate ?? orderContext.taxRate,
            financeConfig.get('tax.defaultVATRate', 0.13)
          );
          const amountExcludingTax = lineAmount(receiptQuantity, itemPrice);
          const itemTaxAmount = calculateTaxAmount(amountExcludingTax, taxRate);
          const itemTotalAmount = roundMoney(amountExcludingTax + itemTaxAmount);
          receiptTaxAmount = roundMoney(receiptTaxAmount + itemTaxAmount);
          receiptTotalAmount = roundMoney(receiptTotalAmount + itemTotalAmount);

          const itemParams = [
            receiptId,
            orderContext.orderItemId,
            currentMaterialId,
            materialCode,
            materialName,
            item.specification || item.specs || '',
            item.unit_id || null,
            parseFloat(item.ordered_quantity) || 0,
            receiptQuantity,
            parseFloat(item.received_quantity) || receiptQuantity || 0,
            qualifiedQuantity,
            batchNumber,
            itemPrice,
            taxRate,
            amountExcludingTax,
            itemTaxAmount,
            itemTotalAmount,
            item.remarks || item.remark || '',
            item.from_inspection === true || isFromInspection ? 1 : 0, // 标记是否来自检验
          ];

          // 检查任何参数是否为undefined
          if (itemParams.includes(undefined)) {
            logger.error(
              `第${i + 1}个物料项参数中包含undefined值:`,
              itemParams
                .map((param, index) => (param === undefined ? index : null))
                .filter((i) => i !== null)
            );
            throw new Error(`第${i + 1}个物料项参数不完整`);
          }

          // 使用正确的查询方式，不解构结果
          await client.query(insertItemsQuery, itemParams);
          insertedItemCount += 1;
        } catch (itemError) {
          logger.error(`插入第${i + 1}个物料项失败:`, itemError);
          throw itemError;
        }
      }

      if (insertedItemCount === 0) {
        throw new Error('入库单必须包含至少一条有效明细');
      }
    } else {
      throw new Error('入库单必须包含至少一条有效明细');
    }

    // 获取完整的入库单数据
    await client.query(
      `UPDATE purchase_receipts
       SET total_amount = ?, total_tax_amount = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND deleted_at IS NULL`,
      [receiptTotalAmount, receiptTaxAmount, receiptId]
    );

    const getReceiptQuery = `
      SELECT r.*, ri.*, m.code as material_code, m.name as material_name
      FROM purchase_receipts r
      JOIN purchase_receipt_items ri ON r.id = ri.receipt_id
      JOIN materials m ON ri.material_id = m.id
      WHERE r.id = ? AND r.deleted_at IS NULL
    `;

    const [receiptItems] = await client.query(getReceiptQuery, [receiptId]);

    if (!receiptItems || receiptItems.length === 0) {
      throw new Error('无法获取入库单数据');
    }


    // 生成追溯链路记录
    // 追溯链路创建已移除

    // 提交事务
    await client.commit();

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
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
    const message = statusCode === 400 ? error.message : '创建采购入库单失败';
    ResponseHandler.error(res, message, errorCode, statusCode, error);
  } finally {
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error('释放数据库连接失败:', releaseError);
      }
    }
  }
};

// 更新采购入库
const updateReceipt = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'purchase_receipt', id))) {
        return ResponseHandler.forbidden(res, '无权修改该采购入库单');
      }
    }
  }

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
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    // 检查入库单是否存在及其状态
    let checkResult;
    try {
      const checkQuery = 'SELECT status, warehouse_id FROM purchase_receipts WHERE id = ? AND deleted_at IS NULL';
      const result = await client.query(checkQuery, [id]);
      // 安全地获取结果，适配不同格式
      checkResult = Array.isArray(result) ? result : result && result.rows ? result.rows : [];

      if (!checkResult || checkResult.length === 0) {
        // 使用普通查询回滚事务
        await client.query('ROLLBACK');
        return ResponseHandler.notFound(res, '采购入库单不存在');
      }

      const currentItem = checkResult[0] || {};
      const currentStatus = currentItem.status || null;

      if (currentStatus !== 'draft') {
        // 使用普通查询回滚事务
        await client.query('ROLLBACK');
        return ResponseHandler.error(res, '只能编辑草稿状态的收货单', 'VALIDATION_ERROR', 400);
      }

      // 如果更改了仓库，则需要获取新仓库的信息
      if (warehouseId && warehouseId !== currentItem.warehouse_id) {
        let warehouseResult;
        try {
          const warehouseQuery = 'SELECT name FROM locations WHERE id = ? AND deleted_at IS NULL';
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
            return ResponseHandler.notFound(res, '仓库不存在');
          }

        } catch (dbError) {
          logger.error('查询仓库信息失败:', dbError);
          await client.query('ROLLBACK');
          return ResponseHandler.error(res, '数据库查询错误', 'SERVER_ERROR', 500, dbError);
        }
      }
    } catch (checkError) {
      logger.error('检查入库单状态失败:', checkError);
      await client.query('ROLLBACK');
      return ResponseHandler.error(res, '数据库查询错误', 'SERVER_ERROR', 500, checkError);
    }

    // 更新入库单基本信息
    const updateQuery = `
      UPDATE purchase_receipts
      SET receipt_date = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
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
      return ResponseHandler.error(res, '数据处理错误：参数包含undefined值', 'SERVER_ERROR', 500);
    }

    await client.query(updateQuery, queryParams);

    // 更新物料项目
    if (items && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        // update 路径明细：优先 snake（已 map），兼容 HTTP camel actualQuantity/receivedQuantity
        const receivedQty =
          item.received_quantity ?? item.actualQuantity ?? item.receivedQuantity;
        const qualifiedQty = item.qualified_quantity ?? item.qualifiedQuantity;

        if (!item.id || receivedQty === undefined || receivedQty === null) {
          throw new Error('采购入库单明细缺少ID或收货数量');
        }

        const updateItemQuery = `
          UPDATE purchase_receipt_items
          SET received_quantity = ?,
              qualified_quantity = ?,
              amount_excluding_tax = ROUND(? * COALESCE(price, 0), 2),
              tax_amount = ROUND(
                ROUND(? * COALESCE(price, 0), 2) *
                (CASE WHEN COALESCE(tax_rate, 0) > 1 THEN COALESCE(tax_rate, 0) / 100 ELSE COALESCE(tax_rate, 0) END),
                2
              ),
              total_amount = ROUND(? * COALESCE(price, 0), 2) + ROUND(
                ROUND(? * COALESCE(price, 0), 2) *
                (CASE WHEN COALESCE(tax_rate, 0) > 1 THEN COALESCE(tax_rate, 0) / 100 ELSE COALESCE(tax_rate, 0) END),
                2
              ),
              updated_at = CURRENT_TIMESTAMP
          WHERE receipt_id = ? AND id = ?
        `;

        const numericReceivedQty = parseFloat(receivedQty) || 0;
        const itemParams = [
          numericReceivedQty,
          parseFloat(qualifiedQty) || 0,
          numericReceivedQty,
          numericReceivedQty,
          numericReceivedQty,
          numericReceivedQty,
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
          throw new Error('采购入库单明细参数不完整');
        }

        await client.query(updateItemQuery, itemParams);
      }

      await client.query(
        `UPDATE purchase_receipts pr
         JOIN (
           SELECT receipt_id,
                  ROUND(SUM(COALESCE(total_amount, 0)), 2) AS total_amount,
                  ROUND(SUM(COALESCE(tax_amount, 0)), 2) AS total_tax_amount
           FROM purchase_receipt_items
           WHERE receipt_id = ?
           GROUP BY receipt_id
         ) x ON x.receipt_id = pr.id
         SET pr.total_amount = x.total_amount,
             pr.total_tax_amount = x.total_tax_amount,
             pr.updated_at = CURRENT_TIMESTAMP
         WHERE pr.id = ? AND pr.deleted_at IS NULL`,
        [id, id]
      );
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
    ResponseHandler.error(res, '更新采购入库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    client.release();
  }
};

// 更新采购入库状态
const updateReceiptStatus = async (req, res) => {
  {
    const { id } = req.params;
    if (id !== null && id !== undefined && id !== '') {
      const ScopeGuard = require('../../../authorization/ScopeGuard');
      if (!(await ScopeGuard.assertAccess(db.pool, req, 'purchase_receipt', id))) {
        return ResponseHandler.forbidden(res, '无权变更该采购入库单状态');
      }
    }
  }

  const client = await db.pool.getConnection();

  try {
    await client.beginTransaction();

    const { id } = req.params;
    const { status, remarks = '' } = req.body;
    const requestId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || req.id || null;

    // 验证必填字段
    if (!id || !status) {
      await client.rollback();
      return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
    }

    // 验证状态值
    const validStatuses = ['draft', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      // 使用标准回滚
      await client.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
    }

    // 检查入库单是否存在
    let currentStatus = null;

    try {
      const checkQuery = 'SELECT id, receipt_no, status FROM purchase_receipts WHERE id = ? AND deleted_at IS NULL FOR UPDATE';
      const [checkRows] = await client.query(checkQuery, [id]);

      if (!checkRows || checkRows.length === 0) {
        await client.rollback();
        return ResponseHandler.notFound(res, '采购入库单不存在');
      }

      currentStatus = checkRows[0].status;

      // 验证状态变更是否有效
      if (!isValidStatusTransition(currentStatus, status)) {
        // 使用标准回滚
        await client.rollback();
        return ResponseHandler.error(res, '无效的状态变更', 'VALIDATION_ERROR', 400);
      }
      // 优化：将状态更新移到事务提交前执行，为了减少行锁持有时间
      // 这里先只进行参数准备，不执行SQL update
    } catch (checkError) {
      logger.error('检查入库单状态失败:', checkError);
      await client.rollback();
      return ResponseHandler.error(res, '数据库查询错误', 'SERVER_ERROR', 500, checkError);
    }

    // 准备状态变更备注
    const statusRemark = `[${new Date().toISOString()}] 状态变更为 ${status}${remarks ? ': ' + remarks : ''}`;

    // 定义更新查询（稍后执行）
    const updateQuery = `
      UPDATE purchase_receipts
      SET status = ?, remarks = CONCAT(IFNULL(remarks, ''), ' | ', ?)
      WHERE id = ? AND deleted_at IS NULL
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
      return ResponseHandler.error(res, '数据处理错误：参数包含undefined值', 'SERVER_ERROR', 500);
    }

    // 如果状态是"completed"，则入库物料到库存
    // 已移除冗余的库存更新逻辑 (updateInventory)
    // 库存更新现在由 InventoryTraceabilityService.handlePurchaseReceipt 统一处理
    // 以避免双重扣减和数据库死锁

    // 如果状态更新为completed，调用批次管理和追溯链路服务
    // Reconciliation only counts confirmed/completed receipts, so expose the
    // target status inside this transaction before recalculating quantities.
    await client.query(updateQuery, updateParams);

    if (
      currentStatus === STATUS.PURCHASE_RECEIPT.DRAFT &&
      [STATUS.PURCHASE_RECEIPT.CONFIRMED, STATUS.PURCHASE_RECEIPT.COMPLETED].includes(status)
    ) {
      // ✅ 根源修复：使用全量同步替代累加，保证幂等性
      // 从所有已确认/完成的收货单汇总收货量，直接SET到采购订单项
      const [receivedItems] = await client.query(
        `SELECT DISTINCT r.order_id, ri.material_id
         FROM purchase_receipts r
         JOIN purchase_receipt_items ri ON r.id = ri.receipt_id
         WHERE r.id = ? AND r.deleted_at IS NULL`,
        [id]
      );

      for (const item of receivedItems) {
        if (item.order_id && item.material_id) {
          await PurchaseOrderStatusService.syncOrderItemReceivedFromReceipts(
            item.order_id,
            item.material_id,
            client
          );
        }
      }
    }

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
          WHERE r.id = ? AND r.deleted_at IS NULL
        `;

        const [receiptItems] = await client.query(getReceiptQuery, [id]);

        if (receiptItems && receiptItems.length > 0) {
          const receipt = receiptItems[0];

          // 1. 创建批次库存记录（仅处理有批次号的物料）
          try {
            const missingBatchItems = receiptItems.filter(
              (item) => !item.batch_number || item.batch_number.trim() === ''
            );
            if (missingBatchItems.length > 0) {
              throw new Error(
                `采购收货单 ${receipt.receipt_no} 有 ${missingBatchItems.length} 条明细缺少批次号，不能完成入库`
              );
            }

            const batchItems = receiptItems.map((item) => ({
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

            const invalidCostItem = batchItems.find((item) => !(Number(item.unit_cost) > 0));
            if (invalidCostItem) {
              throw new Error(
                `采购收货单 ${receipt.receipt_no} 的物料 ${invalidCostItem.material_code || invalidCostItem.material_id} 缺少大于0的采购成本，不能完成入库`
              );
            }

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
                  operator: receipt.operator || getRequestActorLabel(req),
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
            throw batchError;
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
                  throw inspectionError;
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
              throw orderError;
            }
          } else {
            throw new Error('采购入库单没有关联采购订单ID，不能完成入库');
          }
        } else {
          throw new Error(`采购入库单 ${id} 没有明细，不能完成入库`);
        }
      } catch (traceError) {
        logger.error('更新追溯链路失败:', traceError);
        throw traceError;
      }

      // (原 sales_orders 自动推进逻辑已迁移至 InventoryService.updateStock 统一收口)

    }

    // The status was updated earlier in this transaction so reconciliation
    // could include the current receipt. Audit and event creation stay atomic.
    let domainEventId = null;
    try {
      await AuditLogService.log({
        request_id: requestId,
        operator_id: req.user?.id || null,
        operator_name: getRequestActorLabel(req),
        action: 'UPDATE_STATUS',
        module: 'purchase_receipt',
        target_table: 'purchase_receipts',
        target_id: String(id),
        old_payload: { status: currentStatus },
        new_payload: { status },
        method: req.method,
        path: req.originalUrl,
        ip_address: req.ip || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'],
      }, client);

      if (status === STATUS.PURCHASE_RECEIPT.COMPLETED && currentStatus !== STATUS.PURCHASE_RECEIPT.COMPLETED) {
        domainEventId = await DomainEventService.enqueue(
          'PURCHASE_RECEIPT_COMPLETED',
          {
            receiptId: id,
            currentUserId: req.user?.id,
          },
          {
            connection: client,
            aggregateType: 'purchase_receipt',
            aggregateId: id,
            dedupKey: `PURCHASE_RECEIPT_COMPLETED:${id}`,
          }
        );
      }
    } catch (updateError) {
      logger.error('执行状态更新SQL失败:', updateError);
      await client.rollback();
      return ResponseHandler.error(res, '更新状态失败', 'SERVER_ERROR', 500, updateError);
    }

    await client.commit();
    DomainEventService.dispatchSoon(domainEventId);

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
                { userId: getRequestActorLabel(req) }
              );
              logger.info(
                `Material ${item.material_code} MAC cost entry generated (unitPrice=${unitPrice}, quantity=${qty})`
              );
            } catch (costErr) {
              await DLQService.recordSideEffectFailure(
                'CostAccounting:PurchaseInboundMAC',
                {
                  receiptId: id,
                  materialId: item.material_id,
                  materialCode: item.material_code,
                  quantity: qty,
                  unitPrice,
                },
                costErr
              );
            }
          }
        } catch (macError) {
          await DLQService.recordSideEffectFailure(
            'CostAccounting:PurchaseInboundMACBatch',
            { receiptId: id },
            macError
          );
        }
      });
    }

    return ResponseHandler.success(res, { newStatus: status }, '采购入库单状态更新成功');
  } catch (error) {
    // 使用普通查询回滚事务
    try {
      await client.rollback();
    } catch (rollbackError) {
      logger.error('事务回滚失败:', rollbackError);
    }
    logger.error('更新采购入库单状态失败:', error);
    const statusCode = error.statusCode || 500;
    const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
    const message = statusCode < 500 ? error.message : '更新采购入库单状态失败';
    ResponseHandler.error(res, message, errorCode, statusCode, error);
  } finally {
    client.release();
  }
};

// 辅助函数：验证状态变更是否有效（引用统一状态注册表）
function isValidStatusTransition(currentStatus, newStatus) {
  return PURCHASE_RECEIPT_STATUS_TRANSITIONS[currentStatus]?.includes(newStatus) || false;
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
      WHERE pr.deleted_at IS NULL
    `;

    const [statsResult] = await db.pool.execute(statsQuery);

    // 获取本月统计
    const monthlyQuery = `
      SELECT
        COUNT(DISTINCT pr.id) as monthly_count,
        COALESCE(SUM(pri.received_quantity * COALESCE(pri.price, 0)), 0) as monthly_amount
      FROM purchase_receipts pr
      LEFT JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
      WHERE pr.deleted_at IS NULL
        AND YEAR(pr.receipt_date) = YEAR(CURDATE())
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
      WHERE pr.deleted_at IS NULL
        AND DATE(pr.receipt_date) = CURDATE()
    `;

    const [dailyResult] = await db.pool.execute(dailyQuery);

    // 获取待处理统计（草稿和已确认状态）
    const pendingQuery = `
      SELECT
        COUNT(*) as pending_count
      FROM purchase_receipts
      WHERE deleted_at IS NULL
        AND status IN ('${STATUS.PURCHASE_RECEIPT.DRAFT}', '${STATUS.PURCHASE_RECEIPT.CONFIRMED}')
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
    ResponseHandler.error(res, '获取采购收货单统计失败', 'SERVER_ERROR', 500, error);
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
      return ResponseHandler.error(res, '物料ID不能为空', 'VALIDATION_ERROR', 400);
    }

    // 解析并验证 materialId
    const parsedMaterialId = parseInt(materialId, 10);
    if (isNaN(parsedMaterialId)) {
      return ResponseHandler.error(res, '物料ID必须是有效的数字', 'VALIDATION_ERROR', 400);
    }

    // 确保分页参数是有效的数字
    const actualPage = Math.max(1, parseInt(page, 10) || 1);
    const actualPageSize = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 10));
    const offset = (actualPage - 1) * actualPageSize;

    const client = await db.getClient();

    try {
      // 构建查询条件
      let whereClause = 'WHERE pri.material_id = ? AND pr.deleted_at IS NULL';
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

      // 查询总数
      const countQuery = `
        SELECT COUNT(DISTINCT pr.id) as total
        FROM purchase_receipts pr
        INNER JOIN purchase_receipt_items pri ON pr.id = pri.receipt_id
        ${whereClause}
      `;

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
      return ResponseHandler.paginated(
        res,
        dataRows,
        total,
        actualPage,
        actualPageSize,
        '获取物料采购历史成功',
        {
          rows: dataRows,
        }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('获取物料采购历史失败:', error);
    ResponseHandler.error(res, '获取物料采购历史失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取通用的所有采购历史明细项目
const getPurchaseHistoryItems = async (req, res) => {
  try {
    const { page = 1, pageSize = 20, materialCode, materialName, supplierId, startDate, endDate } = req.query;

    const actualPage = Math.max(1, parseInt(page, 10) || 1);
    const actualPageSize = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 20));
    const offset = (actualPage - 1) * actualPageSize;

    const client = await db.getClient();
    try {
      let whereClause = 'WHERE pr.status = ? AND pr.deleted_at IS NULL';
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

      return ResponseHandler.paginated(
        res,
        dataRows,
        parseInt(total) || 0,
        actualPage,
        actualPageSize,
        '获取全量采购历史明细成功',
        {
          rows: dataRows,
        }
      );
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('获取全量采购历史明细失败:', error);
    ResponseHandler.error(res, '获取采购历史失败', 'SERVER_ERROR', 500, error);
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
