/**
 * processingController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const crypto = require('crypto');
const { mapKeysToSnake } = require('../../utils/fieldMap');
const { logger } = require('../../utils/logger');

const db = require('../../config/db');
const purchaseModel = require('../../models/purchase');
const { CodeGenerators } = require('../../utils/codeGenerator');
const FinanceIntegrationService = require('../../services/external/FinanceIntegrationService');
const DocumentLinkService = require('../../services/business/DocumentLinkService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');
const InventoryService = require('../../services/InventoryService');
const QualityInspection = require('../../models/qualityInspection');
const InspectionClosureService = require('../../services/quality/InspectionClosureService');
const { safeString, safeNumber } = require('../../utils/typeHelper');
const { roundMoney } = require('../../utils/money');
const { parsePagination, appendPaginationSQL } = require('../../utils/safePagination');
const { getRequestActorLabel, firstValidUserId } = require('../../utils/userUtils');
const {
  OUTSOURCED_PROCESSING_TRANSITIONS,
  OUTSOURCED_RECEIPT_TRANSITIONS,
} = require('../../constants/statusRegistry');

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const getProcessingValidationError = ({
  processing_date,
  supplier_id,
  expected_delivery_date,
  materials,
  products,
}) => {
  if (!ISO_DATE_PATTERN.test(String(processing_date || ''))) {
    return '加工日期不能为空且必须为 YYYY-MM-DD 格式';
  }
  if (!Number.isInteger(Number(supplier_id)) || Number(supplier_id) <= 0) {
    return '加工厂不能为空';
  }
  if (!ISO_DATE_PATTERN.test(String(expected_delivery_date || ''))) {
    return '预计交期不能为空且必须为 YYYY-MM-DD 格式';
  }
  if (!Array.isArray(materials) || materials.length === 0) {
    return '至少需要一条发料物料';
  }
  if (!Array.isArray(products) || products.length === 0) {
    return '至少需要一条加工成品';
  }

  const lineChecks = [
    { lines: materials, label: '发料物料', idKey: 'material_id' },
    { lines: products, label: '加工成品', idKey: 'product_id' },
  ];
  for (const { lines, label, idKey } of lineChecks) {
    for (const [index, line] of lines.entries()) {
      const id = Number(line?.[idKey]);
      const quantity = Number(line?.quantity);
      if (!Number.isInteger(id) || id <= 0) {
        return `${label}第 ${index + 1} 行缺少有效物料ID`;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return `${label}第 ${index + 1} 行数量必须大于0`;
      }
    }
  }
  for (const [index, product] of products.entries()) {
    const unitPrice = Number(product?.unit_price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return `加工成品第 ${index + 1} 行加工单价不能为负数`;
    }
  }
  return null;
};

const validationError = (message) => {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.statusCode = 400;
  return error;
};

const getValidSupplier = async (connection, supplierId) => {
  const normalizedSupplierId = safeNumber(supplierId);
  if (!Number.isInteger(normalizedSupplierId) || normalizedSupplierId <= 0) return null;
  const [rows] = await connection.execute(
    'SELECT id, name, contact_person, contact_phone FROM suppliers WHERE id = ? AND status = 1',
    [normalizedSupplierId]
  );
  return rows[0] || null;
};

const normalizeProcessingLines = (lines, type) => {
  const source = Array.isArray(lines) ? lines : [];
  return source.map((line, index) => {
    const idKey = type === 'material' ? 'material_id' : 'product_id';
    const id = safeNumber(line?.[idKey]);
    const quantity = safeNumber(line?.quantity);
    const unitPrice = type === 'product' ? safeNumber(line?.unit_price ?? 0) : 0;
    if (!Number.isInteger(id) || id <= 0) {
      throw validationError(
        `${type === 'material' ? '发料物料' : '加工成品'}第 ${index + 1} 行缺少有效物料ID`
      );
    }
    if (!(quantity > 0)) {
      throw validationError(
        `${type === 'material' ? '发料物料' : '加工成品'}第 ${index + 1} 行数量必须大于0`
      );
    }
    if (type === 'product' && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
      throw validationError(`加工成品第 ${index + 1} 行加工单价不能为负数`);
    }
    return {
      ...line,
      [idKey]: id,
      quantity,
      ...(type === 'product'
        ? {
            unit_price: unitPrice,
            total_price: roundMoney(quantity * unitPrice),
          }
        : {}),
    };
  });
};

const validateProcessingReferences = async (connection, materials, products) => {
  const normalizedMaterials = normalizeProcessingLines(materials, 'material');
  const normalizedProducts = normalizeProcessingLines(products, 'product');
  const ids = [
    ...new Set(
      [...normalizedMaterials, ...normalizedProducts].map((line) =>
        Number(line.material_id ?? line.product_id)
      )
    ),
  ];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.execute(
    `SELECT id, code, name, specs, unit_id
       FROM materials
      WHERE id IN (${placeholders}) AND status = 1`,
    ids
  );
  const materialById = new Map(rows.map((row) => [Number(row.id), row]));
  const canonicalize = (line, type) => {
    const id = Number(line.material_id ?? line.product_id);
    const master = materialById.get(id);
    if (!master) {
      throw validationError(
        `${type === 'material' ? '发料物料' : '加工成品'} ${id} 不存在或已停用`
      );
    }
    const base = {
      ...line,
      ...(type === 'material'
        ? {
            material_id: id,
            material_code: safeString(master.code),
            material_name: safeString(master.name),
            specification: safeString(line.specification || master.specs),
            unit_id: safeNumber(line.unit_id ?? master.unit_id),
          }
        : {
            product_id: id,
            product_code: safeString(master.code),
            product_name: safeString(master.name),
            specification: safeString(line.specification || master.specs),
            unit_id: safeNumber(line.unit_id ?? master.unit_id),
          }),
    };
    return base;
  };

  return {
    materials: normalizedMaterials.map((line) => canonicalize(line, 'material')),
    products: normalizedProducts.map((line) => canonicalize(line, 'product')),
  };
};

// 状态常量
const STATUS = {
  PROCESSING: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  RECEIPT: {
    PENDING: 'pending',
    ARRIVED: 'arrived',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

// 加工单状态转换规则
const toTransitionSets = (transitions) =>
  Object.fromEntries(Object.entries(transitions).map(([status, next]) => [status, new Set(next)]));

const PROCESSING_STATUS_TRANSITIONS = toTransitionSets(OUTSOURCED_PROCESSING_TRANSITIONS);

// 入库单独立状态转换规则（入库单业务流程与加工单不同）
const RECEIPT_STATUS_TRANSITIONS = toTransitionSets(OUTSOURCED_RECEIPT_TRANSITIONS);

const getOutsourcedSupplierOptions = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const pagination = parsePagination(req.query.page, req.query.pageSize ?? req.query.limit, {
      defaultPageSize: 50,
      maxPageSize: 100,
    });
    const where = ['status = 1', 'deleted_at IS NULL'];
    const params = [];

    if (keyword) {
      where.push('(code LIKE ? OR name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereSql = where.join(' AND ');
    const [countRows] = await db.pool.execute(
      `SELECT COUNT(*) AS total FROM suppliers WHERE ${whereSql}`,
      params
    );
    const query = appendPaginationSQL(
      `SELECT id, code, name, contact_person, contact_phone
         FROM suppliers
        WHERE ${whereSql}
        ORDER BY name ASC, id ASC`,
      pagination.pageSize,
      pagination.offset
    );
    const [rows] = await db.pool.execute(query, params);

    return ResponseHandler.paginated(
      res,
      rows,
      Number(countRows[0]?.total || 0),
      pagination.page,
      pagination.pageSize,
      '获取委外加工厂选项成功'
    );
  } catch (error) {
    logger.error('获取委外加工厂选项失败:', error);
    return ResponseHandler.error(res, '获取委外加工厂选项失败', 'SERVER_ERROR', 500, error);
  }
};

const getOutsourcedMaterialOptions = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const pagination = parsePagination(req.query.page, req.query.pageSize ?? req.query.limit, {
      defaultPageSize: 50,
      maxPageSize: 100,
    });
    const where = ['m.status = 1', 'm.deleted_at IS NULL'];
    const params = [];

    if (keyword) {
      where.push('(m.code LIKE ? OR m.name LIKE ? OR m.specs LIKE ? OR m.drawing_no LIKE ?)');
      const search = `%${keyword}%`;
      params.push(search, search, search, search);
    }

    const whereSql = where.join(' AND ');
    const [countRows] = await db.pool.execute(
      `SELECT COUNT(*) AS total FROM materials m WHERE ${whereSql}`,
      params
    );
    const query = appendPaginationSQL(
      `SELECT m.id, m.code, m.name, m.specs AS specification,
              m.unit_id, u.name AS unit_name, m.material_type
         FROM materials m
         LEFT JOIN units u ON u.id = m.unit_id
        WHERE ${whereSql}
        ORDER BY m.code ASC, m.id ASC`,
      pagination.pageSize,
      pagination.offset
    );
    const [rows] = await db.pool.execute(query, params);

    return ResponseHandler.paginated(
      res,
      rows,
      Number(countRows[0]?.total || 0),
      pagination.page,
      pagination.pageSize,
      '获取委外物料选项成功'
    );
  } catch (error) {
    logger.error('获取委外物料选项失败:', error);
    return ResponseHandler.error(res, '获取委外物料选项失败', 'SERVER_ERROR', 500, error);
  }
};

const classifyStatusUpdateError = (error, fallbackMessage) => {
  const message = String(error?.message || fallbackMessage);
  const explicitStatusCode = Number(error?.statusCode);
  const explicitErrorCode = String(error?.code || '');

  // 业务校验错误（包括到货/检验前置条件）必须按 4xx 返回，
  // 否则前端会把“尚未完成检验”等可操作提示误显示成服务器故障。
  if (
    (Number.isInteger(explicitStatusCode) && explicitStatusCode >= 400 && explicitStatusCode < 500) ||
    explicitErrorCode === 'VALIDATION_ERROR'
  ) {
    return {
      message,
      errorCode: explicitErrorCode || 'VALIDATION_ERROR',
      statusCode: Number.isInteger(explicitStatusCode) ? explicitStatusCode : 400,
    };
  }

  // InventoryService marks shortages explicitly; keep the message fallback for
  // legacy/wrapped errors so stock issues are never exposed as a generic 500.
  const insufficientStock =
    explicitErrorCode === 'INSUFFICIENT_STOCK' || /库存不足|FIFO批次库存不足/.test(message);
  const businessFailure =
    insufficientStock ||
    /缺少有效成本|找不到外委发料台账|未找到单据|无法安全回退|分录生成失败|数量必须大于0|没有明细|没有有效物料|不存在|不能|未配置默认仓库|仓库不存在|仓库ID/.test(
      message
    );

  return {
    message: businessFailure ? message : fallbackMessage,
    errorCode: insufficientStock
      ? 'INSUFFICIENT_STOCK'
      : businessFailure
        ? 'VALIDATION_ERROR'
        : 'SERVER_ERROR',
    statusCode: businessFailure ? 400 : 500,
  };
};

/**
 * 获取委外加工单列表
 */
const getProcessings = async (req, res) => {
  try {
    const {
      page = 1,
      processing_no = req.query.processingNo || '',
      supplier_name = req.query.supplierName || '',
      keyword = '',
      status = '',
      start_date = req.query.startDate || '',
      end_date = req.query.endDate || '',
    } = req.query;

    // 统一使用pageSize，兼容limit参数
    const pagination = parsePagination(page, req.query.pageSize ?? req.query.limit, {
      defaultPageSize: 10,
      maxPageSize: 100,
    });
    const actualPageSize = pagination.pageSize;

    let query = `
      SELECT id, processing_no, processing_date, supplier_id, supplier_name, expected_delivery_date, contact_person, contact_phone, total_amount, remarks, status, created_at, updated_at, confirmed_at, location_id, warehouse_name FROM outsourced_processings
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

    if (keyword) {
      query += ` AND (
        processing_no LIKE ?
        OR EXISTS (
          SELECT 1 FROM outsourced_processing_materials opm
           WHERE opm.processing_id = outsourced_processings.id
             AND (opm.material_name LIKE ? OR opm.material_code LIKE ?)
        )
      )`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
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
    const pageInt = pagination.page;
    const offset = pagination.offset;

    // 使用统一分页工具追加 LIMIT/OFFSET
    query = appendPaginationSQL(query + ' ORDER BY id DESC', actualPageSize, offset);

    // 使用原始参数数组，不添加分页参数
    const [rows] = await db.pool.execute(query, params);

    // 返回前端期望的格式
    return ResponseHandler.paginated(
      res,
      rows,
      total,
      pageInt,
      actualPageSize,
      '获取委外加工单列表成功'
    );
  } catch (error) {
    logger.error('获取委外加工单列表失败:', error);
    ResponseHandler.error(res, '获取委外加工单列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取单个委外加工单详情
 */
const getProcessing = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取加工单主信息
    const [processing] = await db.pool.execute(
      'SELECT id, processing_no, processing_date, supplier_id, supplier_name, expected_delivery_date, contact_person, contact_phone, total_amount, remarks, status, created_at, updated_at, confirmed_at, location_id, warehouse_name FROM outsourced_processings WHERE id = ?',
      [id]
    );

    if (processing.length === 0) {
      return ResponseHandler.error(res, '委外加工单不存在', 'NOT_FOUND', 404);
    }

    // 获取发料信息
    const [materials] = await db.pool.execute(
      'SELECT id, processing_id, material_id, material_code, material_name, specification, unit, unit_id, quantity, remark, created_at, updated_at FROM outsourced_processing_materials WHERE processing_id = ?',
      [id]
    );

    // 获取成品信息
    const [products] = await db.pool.execute(
      `SELECT opp.id, opp.processing_id, opp.product_id, opp.product_code, opp.product_name,
              COALESCE(NULLIF(opp.specification, ''), m.specs, '') AS specification,
              opp.unit, opp.unit_id, opp.quantity, opp.unit_price, opp.total_price,
              opp.remark, opp.created_at, opp.updated_at
         FROM outsourced_processing_products opp
         LEFT JOIN materials m ON m.id = opp.product_id
        WHERE opp.processing_id = ?`,
      [id]
    );

    const [receivedRows] = await db.pool.execute(
      `SELECT opri.product_id,
              COALESCE(SUM(opri.actual_quantity), 0) AS received_quantity
         FROM outsourced_processing_receipt_items opri
         INNER JOIN outsourced_processing_receipts opr
           ON opr.id = opri.receipt_id
        WHERE opr.processing_id = ?
          AND opr.status <> 'cancelled'
        GROUP BY opri.product_id`,
      [id]
    );
    const receivedByProductId = new Map(
      receivedRows.map((row) => [Number(row.product_id), Number(row.received_quantity || 0)])
    );
    const productsWithReceivableQuantity = products.map((product) => {
      const quantity = Number(product.quantity || 0);
      const receivedQuantity = receivedByProductId.get(Number(product.product_id)) || 0;
      return {
        ...product,
        received_quantity: receivedQuantity,
        receivable_quantity: Math.max(quantity - receivedQuantity, 0),
      };
    });

    return ResponseHandler.success(res, {
      ...processing[0],
      materials,
      products: productsWithReceivableQuantity,
    });
  } catch (error) {
    logger.error('获取委外加工单详情失败:', error);
    ResponseHandler.error(res, '获取委外加工单详情失败', 'SERVER_ERROR', 500, error);
  }
};

const normalizeReceiptItems = (items) =>
  (Array.isArray(items) ? items : []).map((item) => ({
    product_id: safeNumber(item.product_id),
    product_code: safeString(item.product_code),
    product_name: safeString(item.product_name),
    specification: safeString(item.specification),
    unit: safeString(item.unit),
    unit_id: safeNumber(item.unit_id),
    expected_quantity: safeNumber(item.expected_quantity || 0),
    actual_quantity: safeNumber(item.actual_quantity || 0),
    unit_price: safeNumber(item.unit_price || 0),
  }));

const validateReceiptItems = async (
  connection,
  processingId,
  items,
  excludedReceiptId = null,
  { allowZeroQuantities = false } = {}
) => {
  const normalizedItems = normalizeReceiptItems(items);
  if (normalizedItems.length === 0) {
    throw new Error('委外入库单必须包含至少一项成品');
  }

  const [productRows] = await connection.execute(
    `SELECT opp.product_id, opp.product_code, opp.product_name,
            COALESCE(NULLIF(opp.specification, ''), m.specs, '') AS specification,
            opp.unit, opp.unit_id, opp.quantity, opp.unit_price
       FROM outsourced_processing_products opp
       LEFT JOIN materials m ON m.id = opp.product_id
      WHERE opp.processing_id = ?`,
    [processingId]
  );
  const productById = new Map(productRows.map((row) => [Number(row.product_id), row]));
  const receivedParams = [processingId];
  let excludedReceiptSql = '';
  if (excludedReceiptId) {
    excludedReceiptSql = ' AND opr.id <> ?';
    receivedParams.push(excludedReceiptId);
  }
  const [receivedRows] = await connection.execute(
    `SELECT opri.product_id,
            COALESCE(SUM(opri.actual_quantity), 0) AS received_quantity
       FROM outsourced_processing_receipt_items opri
       INNER JOIN outsourced_processing_receipts opr
         ON opr.id = opri.receipt_id
      WHERE opr.processing_id = ?
        AND opr.status <> 'cancelled'
        ${excludedReceiptSql}
      GROUP BY opri.product_id`,
    receivedParams
  );
  const receivedByProductId = new Map(
    receivedRows.map((row) => [Number(row.product_id), Number(row.received_quantity || 0)])
  );
  const requestedByProductId = new Map();

  const validatedItems = [];
  for (const item of normalizedItems) {
    const product = productById.get(Number(item.product_id));
    if (!product) {
      throw new Error(`成品 ${item.product_code || item.product_id} 不属于当前委外加工单`);
    }
    if (!allowZeroQuantities && !(item.actual_quantity > 0)) {
      throw new Error(`成品 ${product.product_name || product.product_code} 实收数量必须大于0`);
    }

    const productId = Number(item.product_id);
    requestedByProductId.set(
      productId,
      (requestedByProductId.get(productId) || 0) + item.actual_quantity
    );
    validatedItems.push({
      ...item,
      product_code: safeString(product.product_code),
      product_name: safeString(product.product_name),
      specification: safeString(product.specification),
      unit: safeString(product.unit),
      unit_id: safeNumber(product.unit_id),
      unit_price: safeNumber(product.unit_price || 0),
    });
  }

  for (const [productId, requestedQuantity] of requestedByProductId.entries()) {
    const product = productById.get(productId);
    const orderedQuantity = Number(product.quantity || 0);
    const receivedQuantity = receivedByProductId.get(productId) || 0;
    const remainingQuantity = Math.max(orderedQuantity - receivedQuantity, 0);
    if (requestedQuantity > remainingQuantity + 0.000001) {
      throw new Error(
        `成品 ${product.product_name || product.product_code} 实收数量 ${requestedQuantity} 超过剩余应收数量 ${remainingQuantity}`
      );
    }
  }

  return validatedItems;
};

const getIncompleteReceiptProductCount = async (connection, processingId) => {
  const [rows] = await connection.execute(
    `SELECT COUNT(*) AS incomplete_count
       FROM (
         SELECT opp.product_id,
                SUM(opp.quantity) AS ordered_quantity,
                COALESCE(received.received_quantity, 0) AS received_quantity
           FROM outsourced_processing_products opp
           LEFT JOIN (
             SELECT opri.product_id,
                    SUM(opri.actual_quantity) AS received_quantity
               FROM outsourced_processing_receipt_items opri
               INNER JOIN outsourced_processing_receipts opr
                 ON opr.id = opri.receipt_id
              WHERE opr.processing_id = ?
                AND opr.status = 'completed'
              GROUP BY opri.product_id
           ) received
             ON received.product_id = opp.product_id
          WHERE opp.processing_id = ?
          GROUP BY opp.product_id, received.received_quantity
         HAVING COALESCE(received.received_quantity, 0) + 0.000001 < SUM(opp.quantity)
       ) incomplete_products`,
    [processingId, processingId]
  );

  return Number(rows[0]?.incomplete_count || 0);
};

/**
 * Resolve the warehouse context from material master data.
 * The document header warehouse is only a legacy display field; inventory
 * postings must use the location configured on each material.
 */
const getMaterialWarehouseContext = async (connection, materialIds) => {
  const normalizedMaterialIds = [
    ...new Set(
      (Array.isArray(materialIds) ? materialIds : [])
        .map((id) => safeNumber(id))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];

  if (normalizedMaterialIds.length === 0) {
    throw validationError('委外单没有有效物料，无法确定默认仓库');
  }

  const materialInfoById = await InventoryService.getBatchMaterialInfo(
    normalizedMaterialIds,
    connection
  );
  const locationIds = [
    ...new Set(normalizedMaterialIds.map((id) => safeNumber(materialInfoById.get(id)?.locationId))),
  ].filter((id) => Number.isInteger(id) && id > 0);
  if (locationIds.length === 0) {
    throw validationError('委外单物料未配置默认仓库，请先在物料编码管理中设置仓库');
  }
  const placeholders = locationIds.map(() => '?').join(',');
  const [warehouseRows] = await connection.execute(
    `SELECT id, name
       FROM locations
      WHERE id IN (${placeholders})
        AND deleted_at IS NULL
        AND (status = 1 OR status = 'active')`,
    locationIds
  );
  const warehouseById = new Map(warehouseRows.map((row) => [Number(row.id), row]));

  for (const materialId of normalizedMaterialIds) {
    const materialInfo = materialInfoById.get(materialId);
    const locationId = safeNumber(materialInfo?.locationId);
    if (!warehouseById.has(locationId)) {
      throw validationError(
        `物料 ${materialInfo?.code || materialId} 的默认仓库不存在或已停用，请先在物料编码管理中修正仓库设置`
      );
    }
  }

  const warehouseNames = [
    ...new Set(
      locationIds
        .map((locationId) => safeString(warehouseById.get(locationId)?.name))
        .filter(Boolean)
    ),
  ];
  return {
    materialInfoById,
    warehouseById,
    primaryLocationId: locationIds[0],
    headerWarehouseName: warehouseNames.length === 1 ? warehouseNames[0] : '按物料默认仓库（多仓）',
  };
};

const getOutsourcedReceiptWarehouseOptions = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const pagination = parsePagination(req.query.page, req.query.pageSize ?? req.query.limit, {
      defaultPageSize: 50,
      maxPageSize: 100,
    });
    const where = ['deleted_at IS NULL', '(status = 1 OR status = "active")'];
    const params = [];
    if (keyword) {
      where.push('name LIKE ?');
      params.push(`%${keyword}%`);
    }
    const whereSql = where.join(' AND ');
    const [countRows] = await db.pool.execute(
      `SELECT COUNT(*) AS total FROM locations WHERE ${whereSql}`,
      params
    );
    const query = appendPaginationSQL(
      `SELECT id, name, type, is_default
         FROM locations
        WHERE ${whereSql}
        ORDER BY is_default DESC, name ASC, id ASC`,
      pagination.pageSize,
      pagination.offset
    );
    const [rows] = await db.pool.execute(query, params);
    return ResponseHandler.paginated(
      res,
      rows,
      Number(countRows[0]?.total || 0),
      pagination.page,
      pagination.pageSize,
      '获取委外入库仓库选项成功'
    );
  } catch (error) {
    logger.error('获取委外入库仓库选项失败:', error);
    return ResponseHandler.error(res, '获取委外入库仓库选项失败', 'SERVER_ERROR', 500, error);
  }
};

const getOutsourcedReceiptProcessingOptions = async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const pagination = parsePagination(req.query.page, req.query.pageSize ?? req.query.limit, {
      defaultPageSize: 50,
      maxPageSize: 100,
    });
    const where = [
      "op.status IN ('confirmed', 'in_progress')",
      `EXISTS (
        SELECT 1
          FROM outsourced_processing_products opp0
         WHERE opp0.processing_id = op.id
      )`,
      `NOT EXISTS (
        SELECT 1
          FROM outsourced_processing_receipts pending_receipt
         WHERE pending_receipt.processing_id = op.id
           AND (pending_receipt.status = 'pending' OR pending_receipt.status = 'arrived')
      )`,
      `EXISTS (
        SELECT 1
          FROM outsourced_processing_products opp1
         WHERE opp1.processing_id = op.id
           AND opp1.quantity > COALESCE((
             SELECT SUM(opri1.actual_quantity)
               FROM outsourced_processing_receipt_items opri1
               INNER JOIN outsourced_processing_receipts opr1
                 ON opr1.id = opri1.receipt_id
              WHERE opr1.processing_id = op.id
                AND opr1.status <> 'cancelled'
                AND opri1.product_id = opp1.product_id
           ), 0) + 0.000001
      )`,
    ];
    const params = [];
    if (keyword) {
      where.push('(op.processing_no LIKE ? OR op.supplier_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const whereSql = where.join(' AND ');
    const [countRows] = await db.pool.execute(
      `SELECT COUNT(*) AS total FROM outsourced_processings op WHERE ${whereSql}`,
      params
    );
    const query = appendPaginationSQL(
      `SELECT op.id, op.processing_no, op.supplier_id, op.supplier_name,
              op.processing_date, op.expected_delivery_date, op.status
         FROM outsourced_processings op
        WHERE ${whereSql}
        ORDER BY op.processing_date DESC, op.id DESC`,
      pagination.pageSize,
      pagination.offset
    );
    const [rows] = await db.pool.execute(query, params);
    return ResponseHandler.paginated(
      res,
      rows,
      Number(countRows[0]?.total || 0),
      pagination.page,
      pagination.pageSize,
      '获取可入库委外加工单选项成功'
    );
  } catch (error) {
    logger.error('获取可入库委外加工单选项失败:', error);
    return ResponseHandler.error(res, '获取可入库委外加工单选项失败', 'SERVER_ERROR', 500, error);
  }
};

const getOutsourcedReceiptProcessingDetail = async (req, res) => {
  try {
    const { processingId } = req.params;
    const [processingRows] = await db.pool.execute(
      `SELECT id, processing_no, processing_date, supplier_id, supplier_name,
              expected_delivery_date, contact_person, contact_phone, status
        FROM outsourced_processings
        WHERE id = ?
          AND status IN ('confirmed', 'in_progress')
          AND NOT EXISTS (
            SELECT 1
              FROM outsourced_processing_receipts pending_receipt
             WHERE pending_receipt.processing_id = outsourced_processings.id
             AND (pending_receipt.status = 'pending' OR pending_receipt.status = 'arrived')
          )`,
      [processingId]
    );
    if (processingRows.length === 0) {
      return ResponseHandler.error(res, '委外加工单不存在或当前不可入库', 'NOT_FOUND', 404);
    }

    const [products] = await db.pool.execute(
      `SELECT opp.id, opp.processing_id, opp.product_id, opp.product_code,
              opp.product_name, COALESCE(NULLIF(opp.specification, ''), m.specs, '') AS specification,
              opp.unit, opp.unit_id, opp.quantity, opp.unit_price, opp.total_price,
              COALESCE(received.received_quantity, 0) AS received_quantity,
              GREATEST(opp.quantity - COALESCE(received.received_quantity, 0), 0) AS receivable_quantity
         FROM outsourced_processing_products opp
         LEFT JOIN materials m ON m.id = opp.product_id
         LEFT JOIN (
           SELECT opri.product_id, SUM(opri.actual_quantity) AS received_quantity
             FROM outsourced_processing_receipt_items opri
             INNER JOIN outsourced_processing_receipts opr
               ON opr.id = opri.receipt_id
            WHERE opr.processing_id = ?
              AND opr.status <> 'cancelled'
            GROUP BY opri.product_id
         ) received ON received.product_id = opp.product_id
        WHERE opp.processing_id = ?
        ORDER BY opp.id ASC`,
      [processingId, processingId]
    );

    return ResponseHandler.success(res, {
      ...processingRows[0],
      products,
    });
  } catch (error) {
    logger.error('获取委外入库加工单详情失败:', error);
    return ResponseHandler.error(res, '获取委外入库加工单详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 创建委外加工单
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
    } = mapKeysToSnake(req.body || {});

    const validationError = getProcessingValidationError({
      processing_date,
      supplier_id,
      supplier_name,
      expected_delivery_date,
      materials,
      products,
    });
    if (validationError) {
      await connection.rollback();
      return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
    }

    const supplier = await getValidSupplier(connection, supplier_id);
    if (!supplier) {
      await connection.rollback();
      return ResponseHandler.error(res, '加工厂不存在或已停用', 'VALIDATION_ERROR', 400);
    }

    let normalizedProcessing;
    try {
      normalizedProcessing = await validateProcessingReferences(connection, materials, products);
    } catch (error) {
      await connection.rollback();
      return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }

    // 生成加工单号
    const processing_no = await purchaseModel.generateProcessingNo();

    // 计算总金额，确保不会有NaN
    const total_amount = normalizedProcessing.products.reduce(
      (sum, product) => sum + Number(product.total_price || 0),
      0
    );

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
        safeNumber(supplier.id),
        safeString(supplier.name),
        safeString(expected_delivery_date),
        safeString(contact_person),
        safeString(contact_phone),
        safeNumber(total_amount),
        safeString(remarks),
      ]
    );

    const processing_id = result.insertId;

    // 批量插入发料明细
    if (normalizedProcessing.materials.length > 0) {
      const matPlaceholders = normalizedProcessing.materials
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const matValues = normalizedProcessing.materials.flatMap((m) => [
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
    if (normalizedProcessing.products.length > 0) {
      const prodPlaceholders = normalizedProcessing.products
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const prodValues = normalizedProcessing.products.flatMap((p) => [
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

    ResponseHandler.success(res, { id: processing_id, processing_no }, '委外加工单创建成功', 201);
  } catch (error) {
    await connection.rollback();
    logger.error('创建委外加工单失败:', error);
    ResponseHandler.error(res, '创建委外加工单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新委外加工单
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
    } = mapKeysToSnake(req.body || {});

    const validationError = getProcessingValidationError({
      processing_date,
      supplier_id,
      supplier_name,
      expected_delivery_date,
      materials,
      products,
    });
    if (validationError) {
      await connection.rollback();
      return ResponseHandler.error(res, validationError, 'VALIDATION_ERROR', 400);
    }

    const supplier = await getValidSupplier(connection, supplier_id);
    if (!supplier) {
      await connection.rollback();
      return ResponseHandler.error(res, '加工厂不存在或已停用', 'VALIDATION_ERROR', 400);
    }

    let normalizedProcessing;
    try {
      normalizedProcessing = await validateProcessingReferences(connection, materials, products);
    } catch (error) {
      await connection.rollback();
      return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }

    // 检查加工单是否存在且状态为待出库(pending)
    const [existingProcessing] = await connection.execute(
      'SELECT status FROM outsourced_processings WHERE id = ?',
      [id]
    );

    if (existingProcessing.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外加工单不存在', 'NOT_FOUND', 404);
    }

    if (existingProcessing[0].status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能修改待出库状态的加工单', 'VALIDATION_ERROR', 400);
    }

    // 计算总金额
    const total_amount = normalizedProcessing.products.reduce(
      (sum, product) => sum + Number(product.total_price || 0),
      0
    );

    // 更新加工单主表
    await connection.execute(
      `UPDATE outsourced_processings SET
        processing_date = ?, supplier_id = ?, supplier_name = ?,
        expected_delivery_date = ?, contact_person = ?, contact_phone = ?,
        location_id = ?, warehouse_name = ?, total_amount = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        safeString(processing_date),
        safeNumber(supplier.id),
        safeString(supplier.name),
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
    if (normalizedProcessing.materials.length > 0) {
      const matPlaceholders = normalizedProcessing.materials
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const matValues = normalizedProcessing.materials.flatMap((m) => [
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
    if (normalizedProcessing.products.length > 0) {
      const prodPlaceholders = normalizedProcessing.products
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const prodValues = normalizedProcessing.products.flatMap((p) => [
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

    ResponseHandler.success(res, null, '委外加工单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新委外加工单失败:', error);
    ResponseHandler.error(res, '更新委外加工单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 删除委外加工单
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
      return ResponseHandler.error(res, '委外加工单不存在', 'NOT_FOUND', 404);
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

    ResponseHandler.success(res, null, '委外加工单删除成功');
  } catch (error) {
    await connection.rollback();
    logger.error('删除委外加工单失败:', error);
    ResponseHandler.error(res, '删除委外加工单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新委外加工单状态
 */
const updateProcessingStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    // 初始化warnings数组
    const warnings = [];

    if (!Object.prototype.hasOwnProperty.call(PROCESSING_STATUS_TRANSITIONS, status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
    }

    // 检查加工单是否存在
    const [existingProcessing] = await connection.execute(
      'SELECT id, processing_no, processing_date, supplier_id, supplier_name, expected_delivery_date, contact_person, contact_phone, total_amount, remarks, status, created_at, updated_at, confirmed_at, location_id, warehouse_name FROM outsourced_processings WHERE id = ? FOR UPDATE',
      [id]
    );

    if (existingProcessing.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外加工单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = existingProcessing[0].status;
    if (currentStatus === status) {
      await connection.rollback();
      return ResponseHandler.success(res, { warnings: [] }, '委外加工单状态未变化');
    }

    if (!PROCESSING_STATUS_TRANSITIONS[currentStatus]?.has(status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `委外加工单不能从 ${currentStatus} 变更为 ${status}`,
        'VALIDATION_ERROR',
        400
      );
    }

    if (status === 'cancelled') {
      const [activeReceipts] = await connection.execute(
        `SELECT id, receipt_no, status
           FROM outsourced_processing_receipts
          WHERE processing_id = ? AND status <> 'cancelled'
          LIMIT 1
          FOR UPDATE`,
        [id]
      );
      if (activeReceipts.length > 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `存在未取消的委外入库单 ${activeReceipts[0].receipt_no}，不能取消加工单`,
          'VALIDATION_ERROR',
          400
        );
      }
    }

    // 更新加工单状态
    await connection.execute(
      'UPDATE outsourced_processings SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    // 如果从待出库(pending)状态执行发料出库(进入已确认或加工中)，则扣减发料原材料库存
    const isOutboundFromPending =
      currentStatus === STATUS.PROCESSING.PENDING &&
      [STATUS.PROCESSING.CONFIRMED, STATUS.PROCESSING.IN_PROGRESS].includes(status);

    if (isOutboundFromPending) {
      // 获取发料明细
      const [materials] = await connection.execute(
        'SELECT id, processing_id, material_id, material_code, material_name, specification, unit, unit_id, quantity, remark, created_at, updated_at FROM outsourced_processing_materials WHERE processing_id = ?',
        [id]
      );
      const warehouseContext = await getMaterialWarehouseContext(
        connection,
        materials.map((material) => material.material_id)
      );

      // 减少每个发料物料的库存
      for (const material of materials) {
        const materialInfo = warehouseContext.materialInfoById.get(Number(material.material_id));
        const usedWarehouseId = materialInfo.locationId;
        const warehouseName = warehouseContext.warehouseById.get(Number(usedWarehouseId))?.name;

        try {
          // 出库不指定批次：由 InventoryService 按 FIFO 自动拆批写台账
          await InventoryService.updateStock(
            {
              materialId: material.material_id,
              locationId: usedWarehouseId,
              quantity: -parseFloat(material.quantity), // 出库为负数
              transactionType: 'outsourced_outbound',
              referenceNo: existingProcessing[0].processing_no,
              referenceType: 'outsourced_processing_material',
              operator: getRequestActorLabel(req),
              remark: `委外加工发料 ${existingProcessing[0].processing_no}`,
              unitId: material.unit_id,
              warehouseName,
              // 不传 batchNumber → FIFO 拆批；幂等键按物料行防重
              idempotencyKey: `outsourced_outbound:${existingProcessing[0].processing_no}:${material.material_id}:${usedWarehouseId}:${material.id}`,
            },
            connection
          );
          logger.info(
            `Outsourced issue stock deducted: materialId=${material.material_id}, quantity=${material.quantity}`
          );
        } catch (stockError) {
          warnings.push(`物料 ${material.material_name} 扣减失败: ${stockError.message}`);
          throw stockError; // 抛出错误以回滚事务，防止发料不成功却更新状态
        }
      }

      // 外委发料库存完成后只冻结过账快照；财务凭证由库存过账审核事件生成。
      await FinanceIntegrationService.generateOutsourcedIssueEntry(
        existingProcessing[0],
        materials,
        connection,
        { deferUntilInventoryApproval: true }
      );

      // ✅ 自动生成对应的委外入库单（进入待入库状态，收货时直接在委外入库单操作）
      try {
        const [existingReceipts] = await connection.execute(
          'SELECT id FROM outsourced_processing_receipts WHERE processing_id = ? AND status <> "cancelled" LIMIT 1',
          [id]
        );

        if (existingReceipts.length === 0) {
          const [products] = await connection.execute(
            'SELECT product_id, product_code, product_name, specification, unit, unit_id, quantity, unit_price, total_price FROM outsourced_processing_products WHERE processing_id = ?',
            [id]
          );
          const receiptWarehouseContext = await getMaterialWarehouseContext(
            connection,
            products.map((product) => product.product_id)
          );

          const receiptNo = await CodeGenerators.generateProcessingReceiptCode(connection);
          const today = new Date().toISOString().slice(0, 10);

          const [receiptInsert] = await connection.execute(
            `INSERT INTO outsourced_processing_receipts (
              receipt_no, processing_id, processing_no, supplier_id, supplier_name,
              location_id, warehouse_name, receipt_date, operator, remarks, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
              safeString(receiptNo),
              safeNumber(id),
              safeString(existingProcessing[0].processing_no),
              safeNumber(existingProcessing[0].supplier_id),
              safeString(existingProcessing[0].supplier_name),
              safeNumber(receiptWarehouseContext.primaryLocationId),
              safeString(receiptWarehouseContext.headerWarehouseName),
              today,
              getRequestActorLabel(req),
              `由委外加工单 ${existingProcessing[0].processing_no} 发料出库自动生成`,
            ]
          );
          const newReceiptId = receiptInsert.insertId;

          for (const prod of products) {
            const qty = safeNumber(prod.quantity || 0);
            const uPrice = safeNumber(prod.unit_price || 0);
            await connection.execute(
              `INSERT INTO outsourced_processing_receipt_items (
                receipt_id, product_id, product_code, product_name,
                specification, unit, unit_id, expected_quantity,
                actual_quantity, unit_price, total_price
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                newReceiptId,
                safeNumber(prod.product_id),
                safeString(prod.product_code),
                safeString(prod.product_name),
                safeString(prod.specification),
                safeString(prod.unit),
                safeNumber(prod.unit_id),
                qty,
                // 发料后只建立“待到货”单据，实际到货数量由到货动作登记。
                0,
                uPrice,
                0,
              ]
            );
          }
          logger.info(`发料出库自动生成委外入库单成功: ${receiptNo}, ID=${newReceiptId}`);
          warnings.push(`已自动生成委外入库单【${receiptNo}】`);
        }
      } catch (receiptError) {
        logger.error('发料出库自动生成入库单失败:', receiptError.message);
        throw receiptError;
      }
    }

    // 如果从已确认状态取消，需要回退已扣减的发料库存
    if (
      status === 'cancelled' &&
      [STATUS.PROCESSING.CONFIRMED, STATUS.PROCESSING.IN_PROGRESS].includes(currentStatus)
    ) {
      const [materials] = await connection.execute(
        'SELECT id, processing_id, material_id, material_code, material_name, specification, unit, unit_id, quantity, remark, created_at, updated_at FROM outsourced_processing_materials WHERE processing_id = ?',
        [id]
      );

      if (materials.length > 0) {
        const processingNo = existingProcessing[0].processing_no;
        const InventoryPostingService = require('../../services/InventoryPostingService');
        const posting = await InventoryPostingService.requireApprovedForTransaction(connection, {
          reference_no: processingNo,
          reference_type: 'outsourced_processing_material',
        });
        const reversal = await InventoryPostingService.requestReversal(
          posting.id,
          InventoryPostingService.actorFromRequest(req),
          `取消委外加工单 ${processingNo}`,
          {
            sourceType: 'outsourced_processing_material',
            sourceId: Number(id),
            sourceNo: processingNo,
            referenceType: 'outsourced_processing_material',
            referenceId: Number(id),
          },
          connection
        );
        await connection.commit();
        return ResponseHandler.success(
          res,
          {
            id: Number(id),
            status: currentStatus,
            reversalDocumentId: reversal.reversalDocumentId,
            financeStatus: reversal.financeStatus,
            warnings,
          },
          '委外加工取消申请已提交，待财务审批后冲销发料并完成业务收尾'
        );
      }
    }

    await connection.commit();

    // Keep the response shape stable so clients can always inspect warnings.
    const responseData = { warnings };
    ResponseHandler.success(res, responseData, '委外加工单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新委外加工单状态失败:', error);
    const classified = classifyStatusUpdateError(error, '更新委外加工单状态失败');
    ResponseHandler.error(
      res,
      classified.message,
      classified.errorCode,
      classified.statusCode,
      error
    );
  } finally {
    connection.release();
  }
};

/**
 * 获取委外入库单列表
 */
const getReceipts = async (req, res) => {
  try {
    const {
      page = 1,
      receipt_no = req.query.receiptNo || '',
      processing_no = req.query.processingNo || '',
      supplier_name = req.query.supplierName || '',
      keyword = '',
      status = '',
      start_date = req.query.startDate || '',
      end_date = req.query.endDate || '',
    } = req.query;

    // 统一使用pageSize，兼容limit参数
    const pagination = parsePagination(page, req.query.pageSize ?? req.query.limit, {
      defaultPageSize: 10,
      maxPageSize: 100,
    });
    const actualPageSize = pagination.pageSize;

    let query = `
      SELECT id, receipt_no, processing_id, processing_no, supplier_id, supplier_name, warehouse_id, warehouse_name, receipt_date, operator, remarks, status, created_at, updated_at, location_id,
             CASE WHEN EXISTS (
               SELECT 1 FROM outsourced_processing_receipt_items opri_status
                WHERE opri_status.receipt_id = outsourced_processing_receipts.id
                  AND COALESCE(opri_status.actual_quantity, 0) + 0.000001 <
                      COALESCE(opri_status.expected_quantity, 0)
             ) THEN 1 ELSE 0 END AS arrival_required
        FROM outsourced_processing_receipts
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

    if (keyword) {
      query += ` AND (
        receipt_no LIKE ?
        OR EXISTS (
          SELECT 1 FROM outsourced_processing_receipt_items opri
           WHERE opri.receipt_id = outsourced_processing_receipts.id
             AND (opri.product_name LIKE ? OR opri.product_code LIKE ?)
        )
      )`;
      params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
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
    const pageInt = pagination.page;
    const offset = pagination.offset;

    // 使用统一分页工具追加 LIMIT/OFFSET
    query = appendPaginationSQL(query + ' ORDER BY id DESC', actualPageSize, offset);

    // 使用原始参数数组，不添加分页参数
    const [rows] = await db.pool.execute(query, params);

    // 返回前端期望的格式
    return ResponseHandler.paginated(
      res,
      rows,
      total,
      pageInt,
      actualPageSize,
      '获取委外入库单列表成功'
    );
  } catch (error) {
    logger.error('获取委外入库单列表失败:', error);
    ResponseHandler.error(res, '获取委外入库单列表失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 获取单个委外入库单详情
 */
const getReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    // 获取入库单主信息
    const [receipt] = await db.pool.execute(
      'SELECT id, receipt_no, processing_id, processing_no, supplier_id, supplier_name, warehouse_id, warehouse_name, receipt_date, operator, remarks, status, created_at, updated_at, location_id FROM outsourced_processing_receipts WHERE id = ?',
      [id]
    );

    if (receipt.length === 0) {
      return ResponseHandler.error(res, '委外入库单不存在', 'NOT_FOUND', 404);
    }

    // 获取入库明细
    const [items] = await db.pool.execute(
      `SELECT opri.id, opri.receipt_id, opri.product_id, opri.product_code, opri.product_name,
              COALESCE(NULLIF(opri.specification, ''), m.specs, '') AS specification,
              opri.unit, opri.unit_id, opri.expected_quantity, opri.actual_quantity,
              opri.unit_price, opri.total_price, opri.created_at, opri.updated_at
         FROM outsourced_processing_receipt_items opri
         LEFT JOIN materials m ON m.id = opri.product_id
        WHERE opri.receipt_id = ?`,
      [id]
    );

    return ResponseHandler.success(res, {
      ...receipt[0],
      items,
    });
  } catch (error) {
    logger.error('获取委外入库单详情失败:', error);
    ResponseHandler.error(res, '获取委外入库单详情失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 委外入库到货：登记本次到货数量，并为每个到货成品自动生成来料检验单。
 *
 * 该动作只更新到货累计数量和检验单，不做库存过账；库存过账仍由“确认入库”完成，
 * 从而保证委外加工返回成品与采购到货使用相同的“到货 → IQC → 入库”节奏。
 */
const receiveReceiptWithInspection = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const receiptId = safeNumber(req.params.id);
    if (!Number.isInteger(receiptId) || receiptId <= 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外入库单ID无效', 'VALIDATION_ERROR', 400);
    }

    const body = mapKeysToSnake(req.body || {});
    const sourceItems = Array.isArray(body.items) ? body.items : [];
    const requestedByProductId = new Map();
    const requestedMetaByProductId = new Map();
    for (const item of sourceItems) {
      const productId = safeNumber(item.product_id);
      const quantity = Number(
        item.receive_quantity ?? item.receiveQuantity ?? item.quantity ?? 0
      );
      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !Number.isFinite(quantity) ||
        !(quantity > 0)
      ) {
        continue;
      }
      requestedByProductId.set(
        productId,
        (requestedByProductId.get(productId) || 0) + quantity
      );
      requestedMetaByProductId.set(productId, item);
    }

    if (requestedByProductId.size === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '请至少填写一个成品的到货数量', 'VALIDATION_ERROR', 400);
    }

    const [receiptRows] = await connection.execute(
      `SELECT id, receipt_no, processing_id, processing_no, supplier_id, supplier_name,
              warehouse_id, warehouse_name, receipt_date, operator, remarks, status,
              arrival_idempotency_key,
              created_at, updated_at, location_id
         FROM outsourced_processing_receipts
        WHERE id = ?
        FOR UPDATE`,
      [receiptId]
    );
    if (receiptRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外入库单不存在', 'NOT_FOUND', 404);
    }

    const receipt = receiptRows[0];
    if (![STATUS.RECEIPT.PENDING, STATUS.RECEIPT.ARRIVED].includes(receipt.status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `当前状态为 ${receipt.status}，不能登记到货`,
        'VALIDATION_ERROR',
        400
      );
    }

    const [processingRows] = await connection.execute(
      `SELECT id, processing_no, supplier_id, supplier_name, status
         FROM outsourced_processings
        WHERE id = ?
        FOR UPDATE`,
      [receipt.processing_id]
    );
    if (processingRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '关联委外加工单不存在', 'NOT_FOUND', 404);
    }
    if (![STATUS.PROCESSING.CONFIRMED, STATUS.PROCESSING.IN_PROGRESS].includes(processingRows[0].status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `委外加工单状态为 ${processingRows[0].status}，不能登记到货`,
        'VALIDATION_ERROR',
        400
      );
    }

    const [receiptItems] = await connection.execute(
      `SELECT id, receipt_id, product_id, product_code, product_name, specification,
              unit, unit_id, expected_quantity, actual_quantity, unit_price, total_price
         FROM outsourced_processing_receipt_items
        WHERE receipt_id = ?
        ORDER BY id
        FOR UPDATE`,
      [receiptId]
    );
    if (receiptItems.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外入库单没有明细，不能登记到货', 'VALIDATION_ERROR', 400);
    }

    const requestedIdempotencyKey = String(
      req.headers['x-idempotency-key'] || req.headers['idempotency-key'] || body.idempotency_key || ''
    ).trim();
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        receiptId,
        items: sourceItems,
        currentQuantities: receiptItems.map((item) => [item.id, item.actual_quantity]),
      }))
      .digest('hex');
    const idempotencyKey = requestedIdempotencyKey || `outsourced_arrival:${receiptId}:${fingerprint}`;

    if (receipt.arrival_idempotency_key === idempotencyKey) {
      const [existingInspections] = await connection.execute(
        `SELECT id, inspection_no, batch_no, status, quantity, material_id AS product_id,
                product_name, is_exempt
           FROM quality_inspections
          WHERE source_type = 'outsourced_receipt' AND reference_id = ?
          ORDER BY id DESC`,
        [receiptId]
      );
      await connection.rollback();
      return ResponseHandler.success(
        res,
        {
          receiptId,
          receiptNo: receipt.receipt_no,
          successCount: existingInspections.length,
          failedCount: 0,
          inspections: existingInspections,
          receiptStatus: receipt.status,
          idempotentReplay: true,
        },
        '委外入库到货请求已处理，返回原结果'
      );
    }

    await connection.execute(
      `UPDATE outsourced_processing_receipts
          SET arrival_idempotency_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [idempotencyKey, receiptId]
    );

    const itemByProductId = new Map();
    for (const item of receiptItems) {
      const productId = Number(item.product_id);
      if (!itemByProductId.has(productId)) itemByProductId.set(productId, item);
    }

    for (const [productId, quantity] of requestedByProductId.entries()) {
      const item = itemByProductId.get(productId);
      if (!item) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `成品 ${productId} 不属于该委外入库单`,
          'VALIDATION_ERROR',
          400
        );
      }
      const expectedQuantity = Number(item.expected_quantity || 0);
      const arrivedQuantity = Number(item.actual_quantity || 0);
      const remainingQuantity = Math.max(expectedQuantity - arrivedQuantity, 0);
      if (quantity > remainingQuantity + 0.000001) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `成品 ${item.product_name || item.product_code} 本次到货数量 ${quantity} 超过待到货数量 ${remainingQuantity}`,
          'VALIDATION_ERROR',
          400
        );
      }
    }

    const inspectorId = firstValidUserId(req.user?.userId, req.user?.id);
    if (!inspectorId) {
      await connection.rollback();
      return ResponseHandler.error(res, '当前登录用户无有效ID，无法生成来料检验单', 'VALIDATION_ERROR', 400);
    }
    const inspectorName = getRequestActorLabel(req) || String(inspectorId);
    const inspections = [];
    let sequence = 0;

    for (const [productId, quantity] of requestedByProductId.entries()) {
      const item = itemByProductId.get(productId);
      const nextActualQuantity = Number((Number(item.actual_quantity || 0) + quantity).toFixed(6));
      const unitPrice = Number(item.unit_price || 0);
      const batchSuffix = `${String(Date.now()).slice(-8)}${String(sequence + 1).padStart(2, '0')}`;
      const batchNo = `OSP-${receipt.receipt_no}-${item.id}-${batchSuffix}`.slice(0, 50);
      const meta = requestedMetaByProductId.get(productId) || {};

      await connection.execute(
        `UPDATE outsourced_processing_receipt_items
            SET actual_quantity = ?,
                total_price = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [nextActualQuantity, Number((nextActualQuantity * unitPrice).toFixed(2)), item.id]
      );

      const inspection = await QualityInspection.createInspection(
        {
          inspection_type: 'incoming',
          source_type: 'outsourced_receipt',
          reference_id: receipt.id,
          reference_no: receipt.receipt_no,
          material_id: productId,
          product_id: productId,
          material_code: item.product_code,
          material_name: item.product_name,
          product_code: item.product_code,
          product_name: item.product_name,
          supplier_id: receipt.supplier_id,
          supplier_name: receipt.supplier_name,
          batch_no: meta.batch_no || meta.batchNo || batchNo,
          quantity,
          unit: item.unit || '个',
          unit_id: item.unit_id || null,
          planned_date: new Date().toISOString().slice(0, 10),
          actual_date: null,
          status: 'pending',
          inspector_id: inspectorId,
          inspector_name: inspectorName,
          template_id: meta.template_id || meta.templateId || null,
          note: `委外入库到货自动生成来料检验单 - 委外入库单: ${receipt.receipt_no}`,
        },
        connection
      );

      // 免检物料沿用采购到货的自动放行逻辑，但只更新委外入库闭环，
      // 不创建采购入库单（InspectionClosureService 会依据 source_type 区分来源）。
      if (inspection.is_exempt) {
        const closureResult = await InspectionClosureService.closeIfTerminal(
          inspection,
          {
            id: inspection.id,
            status: 'passed',
            qualified_quantity: quantity,
            unqualified_quantity: 0,
          },
          connection
        );
        Object.assign(inspection, closureResult);
      }

      inspections.push({
        id: inspection.id,
        inspection_no: inspection.inspection_no,
        receipt_item_id: item.id,
        product_id: productId,
        product_name: item.product_name,
        quantity,
        batch_no: inspection.batch_no,
        status: inspection.status,
        is_exempt: Boolean(inspection.is_exempt),
      });
      sequence += 1;
    }

    await connection.execute(
      `UPDATE outsourced_processing_receipts
          SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [STATUS.RECEIPT.ARRIVED, receiptId]
    );

    await connection.commit();
    return ResponseHandler.success(
      res,
      {
        receiptId,
        receiptNo: receipt.receipt_no,
        successCount: inspections.length,
        failedCount: 0,
        inspections,
        receiptStatus: STATUS.RECEIPT.ARRIVED,
      },
      '委外入库到货成功，已生成来料检验单'
    );
  } catch (error) {
    await connection.rollback();
    logger.error('委外入库到货并生成来料检验失败:', error);
    const statusCode = error.statusCode || (error.code === 'VALIDATION_ERROR' ? 400 : 500);
    const errorCode = error.code || (statusCode === 400 ? 'VALIDATION_ERROR' : 'SERVER_ERROR');
    // 4xx 业务错误（包括不存在、状态不允许、数量超限）直接返回可操作提示；
    // 仅 5xx 才隐藏底层异常，和采购到货接口保持一致。
    const message = statusCode < 500 ? error.message : '委外入库到货失败';
    ResponseHandler.error(res, message, errorCode, statusCode, error);
  } finally {
    connection.release();
  }
};

const INCOMING_TERMINAL_STATUSES = new Set(['passed', 'failed', 'partial', 'completed']);

const resolveInspectionQualifiedQuantity = (inspection) => {
  const rawExplicit = inspection?.qualified_quantity;
  // MySQL NULL 经过 Number(null) 会变成 0，不能把“未填合格数”误判为
  // 已明确判定为 0；对历史 passed/completed 检验单应回退到检验数量。
  if (rawExplicit !== null && rawExplicit !== undefined && rawExplicit !== '') {
    const explicit = Number(rawExplicit);
    if (Number.isFinite(explicit)) return Math.max(explicit, 0);
  }
  if (['passed', 'completed'].includes(String(inspection.status))) {
    return Math.max(Number(inspection.quantity || 0), 0);
  }
  return 0;
};

/**
 * Resolve the quantities that are allowed to be posted into stock.
 * New arrival documents must have complete incoming inspections; legacy pending
 * documents with an already-filled actual_quantity keep the historical direct
 * confirmation path for backward compatibility.
 */
const resolveReceiptItemsForPosting = async (
  connection,
  receipt,
  receiptItems,
  currentStatus
) => {
  const requiresInspection =
    currentStatus === STATUS.RECEIPT.ARRIVED ||
    // 只要仍有未到货数量，就不能沿用历史“直接入库”兼容路径。
    // 这样可避免手工单据填写部分实收数量后绕过到货/IQC。
    receiptItems.some(
      (item) =>
        Number(item.actual_quantity || 0) + 0.000001 <
        Number(item.expected_quantity || 0)
    );

  if (!requiresInspection) return receiptItems;

  const [inspectionRows] = await connection.execute(
    `SELECT id, inspection_no, source_type, reference_id, reference_no,
            material_id, product_id, batch_no, quantity, qualified_quantity,
            unqualified_quantity, status
       FROM quality_inspections
      WHERE inspection_type = 'incoming'
        AND source_type = 'outsourced_receipt'
        AND reference_id = ?
        AND reference_no = ?
        AND deleted_at IS NULL
      ORDER BY id ASC
      FOR UPDATE`,
    [receipt.id, receipt.receipt_no]
  );

  if (inspectionRows.length === 0) {
    throw validationError('请先执行到货并生成来料检验单，完成检验后才能确认入库');
  }

  const unfinished = inspectionRows.filter(
    (inspection) => !INCOMING_TERMINAL_STATUSES.has(String(inspection.status))
  );
  if (unfinished.length > 0) {
    throw validationError(
      `存在 ${unfinished.length} 张未完成的来料检验单，请完成检验后再确认入库`
    );
  }

  const inspectedByProduct = new Map();
  const qualifiedByProduct = new Map();
  for (const inspection of inspectionRows) {
    const productId = Number(inspection.material_id || inspection.product_id || 0);
    if (!productId) continue;
    const quantity = Math.max(Number(inspection.quantity || 0), 0);
    inspectedByProduct.set(productId, (inspectedByProduct.get(productId) || 0) + quantity);
    qualifiedByProduct.set(
      productId,
      (qualifiedByProduct.get(productId) || 0) + resolveInspectionQualifiedQuantity(inspection)
    );
  }

  const itemsForPosting = [];
  for (const item of receiptItems) {
    const productId = Number(item.product_id);
    const arrivedQuantity = Math.max(Number(item.actual_quantity || 0), 0);
    const inspectedQuantity = inspectedByProduct.get(productId) || 0;
    if (Math.abs(inspectedQuantity - arrivedQuantity) > 0.0001) {
      throw validationError(
        `成品 ${item.product_name || item.product_code} 的检验数量 ${inspectedQuantity} 与到货数量 ${arrivedQuantity} 不一致`
      );
    }
    const qualifiedQuantity = Math.min(
      Math.max(qualifiedByProduct.get(productId) || 0, 0),
      arrivedQuantity
    );
    if (qualifiedQuantity > 0) {
      itemsForPosting.push({ ...item, actual_quantity: qualifiedQuantity });
    }
  }

  if (itemsForPosting.length === 0) {
    throw validationError('来料检验没有合格数量，不能确认入库');
  }

  return itemsForPosting;
};

/**
 * 创建委外入库单
 */
const createReceipt = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { processing_id, receipt_date, operator, remarks, items } = mapKeysToSnake(
      req.body || {}
    );

    const [processingRows] = await connection.execute(
      `SELECT id, processing_no, supplier_id, supplier_name, status
         FROM outsourced_processings
        WHERE id = ?
        FOR UPDATE`,
      [processing_id]
    );
    if (processingRows.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外加工单不存在', 'NOT_FOUND', 404);
    }
    const processing = processingRows[0];
    if (!['confirmed', 'in_progress'].includes(processing.status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `只有已确认或加工中的委外加工单才能创建入库单，当前状态为 ${processing.status}`,
        'VALIDATION_ERROR',
        400
      );
    }

    const [pendingReceiptRows] = await connection.execute(
      `SELECT id, receipt_no
         FROM outsourced_processing_receipts
        WHERE processing_id = ? AND (status = 'pending' OR status = 'arrived')
        LIMIT 1
        FOR UPDATE`,
      [processing_id]
    );
    if (pendingReceiptRows.length > 0) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `该委外加工单已有待处理入库单 ${pendingReceiptRows[0].receipt_no}，请直接编辑该单据`,
        'VALIDATION_ERROR',
        400
      );
    }

    let normalizedItems;
    try {
      // 新建委外入库单只登记应收数量；实际到货必须通过到货动作登记，
      // 由到货动作自动生成来料检验单，避免手工建单绕过 IQC。
      normalizedItems = await validateReceiptItems(
        connection,
        processing_id,
        items,
        null,
        { allowZeroQuantities: true }
      );
      if (!normalizedItems.some((item) => Number(item.expected_quantity || 0) > 0)) {
        throw validationError('委外入库单至少需要一项应收数量大于0的成品');
      }
      if (normalizedItems.some((item) => Number(item.actual_quantity || 0) > 0.000001)) {
        throw validationError('新建委外入库单不能直接填写实收数量，请保存后使用“到货”操作');
      }
    } catch (validationError) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        validationError.message,
        'VALIDATION_ERROR',
        400,
        validationError
      );
    }
    let warehouseContext;
    try {
      warehouseContext = await getMaterialWarehouseContext(
        connection,
        normalizedItems.map((item) => item.product_id)
      );
    } catch (warehouseError) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        warehouseError.message,
        'VALIDATION_ERROR',
        400,
        warehouseError
      );
    }

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
          safeString(processing.processing_no),
          safeNumber(processing.supplier_id),
          safeString(processing.supplier_name),
          safeNumber(warehouseContext.primaryLocationId),
          safeString(warehouseContext.headerWarehouseName),
          safeString(receipt_date),
          safeString(operator),
          safeString(remarks),
        ]
      );

      const receipt_id = result.insertId;

      // 插入入库明细
      if (normalizedItems.length > 0) {
        for (const item of normalizedItems) {
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
        DocType.OUTSOURCED_PROCESSING,
        processing_id,
        processing.processing_no,
        DocType.OUTSOURCED_RECEIPT,
        receipt_id,
        receipt_no,
        req.user?.id || null,
        connection
      );

      await connection.commit();

      ResponseHandler.success(res, { id: receipt_id, receipt_no }, '委外入库单创建成功', 201);
    } catch (error) {
      logger.error('创建委外入库单错误:', error.code, error.message);

      // 检查是否是外键约束错误
      if (error.code === 'ER_NO_REFERENCED_ROW_2' || error.code === 'ER_NO_REFERENCED_ROW') {
        // 外键约束结构由 Knex 迁移文件 000007/000010 管理
        logger.error('外键约束错误，请检查迁移文件是否已执行:', error.message);
      }

      throw error; // 如果不是特定的外键约束错误，继续抛出错误
    }
  } catch (error) {
    await connection.rollback();
    logger.error('创建委外入库单失败:', error);

    // 提供更友好的错误信息
    let errorMessage = '创建委外入库单失败';

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
 * 更新委外入库单
 */
const updateReceipt = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { receipt_date, operator, remarks, items } = mapKeysToSnake(req.body || {});

    // 检查入库单是否存在且状态为待确认
    const [existingReceipt] = await connection.execute(
      'SELECT status, processing_id FROM outsourced_processing_receipts WHERE id = ? FOR UPDATE',
      [id]
    );

    if (existingReceipt.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外入库单不存在', 'NOT_FOUND', 404);
    }

    if (existingReceipt[0].status !== 'pending') {
      await connection.rollback();
      return ResponseHandler.error(res, '只能修改待确认状态的入库单', 'VALIDATION_ERROR', 400);
    }

    // 自动生成的委外入库单在到货前实收数量为 0。禁止通过“编辑”
    // 直接填入实收数量绕过“到货 → IQC → 入库”流程；已有历史实收单据
    // 仍保留原有编辑/直入兼容路径。
    const [existingItems] = await connection.execute(
      `SELECT product_id, expected_quantity, actual_quantity
         FROM outsourced_processing_receipt_items
        WHERE receipt_id = ?
        FOR UPDATE`,
      [id]
    );
    const isPendingArrivalReceipt =
      existingItems.length > 0 &&
      existingItems.every((item) => Number(item.actual_quantity || 0) <= 0.000001);
    if (isPendingArrivalReceipt) {
      const requestedItems = normalizeReceiptItems(items);
      if (requestedItems.some((item) => Number(item.actual_quantity || 0) > 0.000001)) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '该委外入库单尚未到货，请使用“到货”操作，系统会自动生成来料检验单',
          'VALIDATION_ERROR',
          400
        );
      }
    }

    let normalizedItems;
    try {
      normalizedItems = await validateReceiptItems(
        connection,
        existingReceipt[0].processing_id,
        items,
        id,
        { allowZeroQuantities: true }
      );
    } catch (validationError) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        validationError.message,
        'VALIDATION_ERROR',
        400,
        validationError
      );
    }
    let warehouseContext;
    try {
      warehouseContext = await getMaterialWarehouseContext(
        connection,
        normalizedItems.map((item) => item.product_id)
      );
    } catch (warehouseError) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        warehouseError.message,
        'VALIDATION_ERROR',
        400,
        warehouseError
      );
    }

    // 更新入库单主表
    await connection.execute(
      `UPDATE outsourced_processing_receipts SET
        location_id = ?, warehouse_name = ?, receipt_date = ?,
        operator = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        safeNumber(warehouseContext.primaryLocationId),
        safeString(warehouseContext.headerWarehouseName),
        safeString(receipt_date),
        safeString(operator),
        safeString(remarks),
        id,
      ]
    );

    // 删除旧的入库明细
    await connection.execute(
      'DELETE FROM outsourced_processing_receipt_items WHERE receipt_id = ?',
      [id]
    );

    // 插入新的入库明细
    if (normalizedItems.length > 0) {
      for (const item of normalizedItems) {
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

    ResponseHandler.success(res, null, '委外入库单更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新委外入库单失败:', error);
    ResponseHandler.error(res, '更新委外入库单失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

/**
 * 更新委外入库单状态
 */
const updateReceiptStatus = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { status } = req.body;

    if (!Object.prototype.hasOwnProperty.call(RECEIPT_STATUS_TRANSITIONS, status)) {
      await connection.rollback();
      return ResponseHandler.error(res, '无效的状态值', 'VALIDATION_ERROR', 400);
    }

    // 检查入库单是否存在
    const [existingReceipt] = await connection.execute(
      'SELECT id, receipt_no, processing_id, processing_no, supplier_id, supplier_name, warehouse_id, warehouse_name, receipt_date, operator, remarks, status, created_at, updated_at, location_id FROM outsourced_processing_receipts WHERE id = ? FOR UPDATE',
      [id]
    );

    if (existingReceipt.length === 0) {
      await connection.rollback();
      return ResponseHandler.error(res, '委外入库单不存在', 'NOT_FOUND', 404);
    }

    const currentStatus = existingReceipt[0].status;
    if (currentStatus === status) {
      await connection.rollback();
      return ResponseHandler.success(res, null, '委外入库单状态未变化');
    }

    if (!RECEIPT_STATUS_TRANSITIONS[currentStatus]?.has(status)) {
      await connection.rollback();
      return ResponseHandler.error(
        res,
        `委外入库单不能从 ${currentStatus} 变更为 ${status}`,
        'VALIDATION_ERROR',
        400
      );
    }

    if (status === 'confirmed') {
      const [processingRows] = await connection.execute(
        'SELECT id, status FROM outsourced_processings WHERE id = ? FOR UPDATE',
        [existingReceipt[0].processing_id]
      );
      if (
        processingRows.length === 0 ||
        ![STATUS.PROCESSING.CONFIRMED, STATUS.PROCESSING.IN_PROGRESS].includes(
          processingRows[0].status
        )
      ) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          `委外加工单状态为 ${processingRows[0]?.status || '不存在'}，不能确认入库`,
          'VALIDATION_ERROR',
          400
        );
      }

      const [receiptItems] = await connection.execute(
        'SELECT id, receipt_id, product_id, product_code, product_name, specification, unit, unit_id, expected_quantity, actual_quantity, unit_price, total_price, created_at, updated_at FROM outsourced_processing_receipt_items WHERE receipt_id = ?',
        [id]
      );
      if (receiptItems.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(
          res,
          '委外入库单没有明细，不能确认入库',
          'VALIDATION_ERROR',
          400
        );
      }
      // 只有新到货单（arrived，或历史 pending 但尚未登记实收数量）需要
      // 校验来料检验结果；旧的已填实收数量 pending 单据保留兼容直入路径。
      existingReceipt[0].itemsForPosting = await resolveReceiptItemsForPosting(
        connection,
        existingReceipt[0],
        receiptItems,
        currentStatus
      );
      existingReceipt[0].warehouseContext = await getMaterialWarehouseContext(
        connection,
        existingReceipt[0].itemsForPosting.map((item) => item.product_id)
      );
    }

    // 更新入库单状态
    await connection.execute(
      'UPDATE outsourced_processing_receipts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    );

    // 如果状态为已确认，则需要更新库存
    if (status === STATUS.RECEIPT.CONFIRMED) {
      // 获取入库单明细
      const items = existingReceipt[0].itemsForPosting || [];

      if (items.length === 0) {
        throw new Error('委外入库单没有明细，不能确认入库');
      }

      const warehouseContext = existingReceipt[0].warehouseContext;

      const costAllocation = await FinanceIntegrationService.getOutsourcedReceiptCostAllocation(
        connection,
        { ...existingReceipt[0], id: Number(id) },
        items
      );

      // 更新库存
      for (const item of items) {
        try {
          const material_id = item.product_id;
          const materialInfo = warehouseContext.materialInfoById.get(Number(material_id));
          const location_id = materialInfo.locationId;
          const warehouseName = warehouseContext.warehouseById.get(Number(location_id))?.name;
          const actualQuantity = parseFloat(item.actual_quantity);
          if (!Number.isFinite(actualQuantity) || actualQuantity <= 0) {
            throw new Error(`物料 ${item.product_name || item.product_id} 入库数量必须大于0`);
          }

          // 入库必须可追溯批次 + 有效成本：按入库单明细生成稳定业务批次键
          const receiptNo = existingReceipt[0].receipt_no;
          const inboundBatch = `OSP-${receiptNo}-${item.id}`;
          const itemCost = costAllocation.materialCostByItemId.get(Number(item.id));
          const inboundUnitCost = Number(itemCost?.unitCost || 0);
          if (!(inboundUnitCost > 0)) {
            throw new Error(
              `委外入库缺少有效成品成本: receipt_no=${receiptNo}, item_id=${item.id}`
            );
          }
          await InventoryService.updateStock(
            {
              materialId: material_id,
              locationId: location_id,
              quantity: actualQuantity, // 入库为正数
              transactionType: 'outsourced_inbound',
              referenceNo: receiptNo,
              referenceType: 'outsourced_processing_receipt',
              operator: existingReceipt[0].operator || getRequestActorLabel(req),
              remark: `委外入库 ${receiptNo}`,
              unitId: item.unit_id,
              warehouseName,
              batchNumber: inboundBatch,
              unitCost: inboundUnitCost,
              idempotencyKey: `outsourced_inbound:${receiptNo}:${item.id}`,
            },
            connection
          );

          logger.info(
            `Outsourced receipt stock posted: materialId=${material_id}, quantity=${actualQuantity}`
          );
        } catch (error) {
          logger.error(`处理物料ID ${item.product_id} 的入库库存时出错:`, error);
          throw error;
        }
      }

      // 委外入库库存完成后只冻结过账快照；财务凭证由库存过账审核事件生成。
      await FinanceIntegrationService.generateOutsourcedReceiptEntry(
        { ...existingReceipt[0], id: Number(id) },
        items,
        connection,
        { deferUntilInventoryApproval: true }
      );
    }

    // 确认入库只负责库存和财务过账。加工单完成必须由完成入库动作触发。
    if (status === STATUS.RECEIPT.COMPLETED && existingReceipt[0].processing_id) {
      const incompleteProductCount = await getIncompleteReceiptProductCount(
        connection,
        existingReceipt[0].processing_id
      );
      if (incompleteProductCount === 0) {
        await connection.execute(
          `UPDATE outsourced_processings SET status = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status IN (?, ?)`,
          [
            STATUS.PROCESSING.COMPLETED,
            existingReceipt[0].processing_id,
            STATUS.PROCESSING.CONFIRMED,
            STATUS.PROCESSING.IN_PROGRESS,
          ]
        );
        logger.info(
          `委外加工单 ${existingReceipt[0].processing_id} 已完成全部成品入库，自动标记为完成`
        );
      }
    }

    await connection.commit();

    ResponseHandler.success(res, null, '委外入库单状态更新成功');
  } catch (error) {
    await connection.rollback();
    logger.error('更新委外入库单状态失败:', error);
    const classified = classifyStatusUpdateError(error, '更新委外入库单状态失败');
    ResponseHandler.error(
      res,
      classified.message,
      classified.errorCode,
      classified.statusCode,
      error
    );
  } finally {
    connection.release();
  }
};

module.exports = {
  getOutsourcedSupplierOptions,
  getOutsourcedMaterialOptions,
  getOutsourcedReceiptWarehouseOptions,
  getOutsourcedReceiptProcessingOptions,
  getOutsourcedReceiptProcessingDetail,
  getProcessings,
  getProcessing,
  createProcessing,
  updateProcessing,
  deleteProcessing: deleteProcessing,
  updateProcessingStatus,
  getReceipts,
  getReceipt,
  receiveReceiptWithInspection,
  createReceipt,
  updateReceipt,
  updateReceiptStatus,
  PROCESSING_STATUS_TRANSITIONS,
  RECEIPT_STATUS_TRANSITIONS,
  classifyStatusUpdateError,
  normalizeReceiptItems,
  validateReceiptItems,
  getProcessingValidationError,
  validateProcessingReferences,
  getIncompleteReceiptProductCount,
  getMaterialWarehouseContext,
  resolveReceiptItemsForPosting,
};
