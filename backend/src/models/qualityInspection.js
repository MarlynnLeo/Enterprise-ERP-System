/**
 * qualityInspection.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');
const db = require('../config/db');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');
const businessConfig = require('../config/businessConfig');
const CodeGeneratorService = require('../services/business/CodeGeneratorService');
const InspectionTemplateResolver = require('../services/business/InspectionTemplateResolverService');
const { firstValidUserId } = require('../utils/userUtils');
const {
  normalizeInspectionSourceType,
  isOutsourcedIncomingInspection,
  resolveInspectionSourceType,
} = require('../utils/quality/inspectionSource');

// 从统一配置获取状态常量
const STATUS = {
  PRODUCTION_TASK: businessConfig.status.productionTask,
};

const TERMINAL_INSPECTION_STATUSES = new Set(['passed', 'failed', 'partial', 'completed']);
const PASS_ITEM_RESULTS = new Set(['passed', 'pass', 'ok', 'qualified', '合格']);
const FAIL_ITEM_RESULTS = new Set(['failed', 'fail', 'ng', 'nok', 'unqualified', '不合格']);
const VALID_ITEM_TYPES = new Set([
  'visual',
  'dimension',
  'quantity',
  'function',
  'weight',
  'performance',
  'safety',
  'electrical',
  'qualitative',
  'other',
]);
const READONLY_INSPECTION_UPDATE_FIELDS = new Set([
  'id',
  'items',
  'attachments',
  'source_type',
  'created_at',
  'updated_at',
  'deleted_at',
]);
const UPDATEABLE_INSPECTION_FIELDS = new Set([
  'reference_id',
  'reference_no',
  'material_id',
  'supplier_id',
  'product_id',
  'product_name',
  'product_code',
  'process_id',
  'process_name',
  'batch_no',
  'quantity',
  'qualified_quantity',
  'unqualified_quantity',
  'unit',
  'unit_id',
  'status',
  'planned_date',
  'actual_date',
  'inspector_id',
  'inspector_name',
  'punch_time',
  'standard_type',
  'standard_no',
  'template_id',
  'note',
  'traceability_id',
  'traceability_batch',
  'chain_id',
  'chain_step_id',
  'is_first_article',
  'first_article_qty',
  'is_full_inspection',
  'first_article_result',
  'production_can_continue',
  'task_id',
  'is_aql',
  'aql_standard_id',
  'aql_level',
  'accept_limit',
  'reject_limit',
]);
const TERMINAL_VALIDATION_UPDATE_FIELDS = new Set([
  'status',
  'items',
  'quantity',
  'qualified_quantity',
  'unqualified_quantity',
  'is_aql',
  'aql_standard_id',
  'aql_level',
  'accept_limit',
  'reject_limit',
]);

/**
 * 质量检验模型类
 */
class QualityInspection {
  static _createValidationError(message) {
    return InspectionTemplateResolver.createValidationError(message);
  }

  static _normalizeItemType(type) {
    return VALID_ITEM_TYPES.has(type) ? type : 'other';
  }

  static _normalizeSourceType(inspectionType, sourceType) {
    return normalizeInspectionSourceType(inspectionType, sourceType);
  }

  static _isOutsourcedIncoming(inspection) {
    return isOutsourcedIncomingInspection(inspection);
  }

  static _normalizeItemResult(result) {
    const normalized = String(result || '').trim().toLowerCase();
    if (PASS_ITEM_RESULTS.has(normalized)) return 'passed';
    if (FAIL_ITEM_RESULTS.has(normalized)) return 'failed';
    return null;
  }

  static _validateTerminalStatusAgainstItems(inspection, status, items) {
    if (!status || !TERMINAL_INSPECTION_STATUSES.has(status)) return;

    if (!Array.isArray(items) || items.length === 0) {
      throw this._createValidationError('检验单没有检验项目，不能判定检验结果');
    }

    const unjudged = items.filter((item) => !this._normalizeItemResult(item.result));
    if (unjudged.length > 0) {
      throw this._createValidationError(
        `还有 ${unjudged.length} 个检验项目未判定，不能关闭检验单`
      );
    }

    const failedItems = items.filter((item) => this._normalizeItemResult(item.result) === 'failed');
    const hasCriticalFailure = failedItems.some(
      (item) => item.is_critical === true || item.is_critical === 1
    );

    if ((status === 'passed' || status === 'completed') && failedItems.length > 0) {
      throw this._createValidationError('检验项目存在不合格项，检验单不能判定为通过');
    }

    if (status === 'partial' && failedItems.length === 0) {
      throw this._createValidationError('部分合格必须至少包含一个不合格检验项目');
    }

    if (status === 'failed' && failedItems.length === 0) {
      throw this._createValidationError('检验不合格必须至少包含一个不合格检验项目');
    }

    if (hasCriticalFailure && status !== 'failed') {
      throw this._createValidationError('关键检验项目不合格时，检验单必须判定为不合格');
    }

    if (
      inspection?.is_aql &&
      status === 'passed' &&
      Number(inspection.reject_limit) > 0 &&
      Number(inspection.unqualified_quantity) >= Number(inspection.reject_limit)
    ) {
      throw this._createValidationError('不合格数量达到AQL拒收数，检验单不能判定为通过');
    }
  }

  static async _getStoredInspectionItems(connection, inspectionId) {
    const [items] = await connection.query(
      'SELECT id, inspection_id, item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower, actual_value, measure_1, measure_2, measure_3, measure_4, measure_5, measure_6, method, result, is_qualified, remark, created_at, updated_at FROM quality_inspection_items WHERE inspection_id = ? ORDER BY id',
      [inspectionId]
    );
    return items || [];
  }

  /**
   * Reconcile explicitly submitted quality attachments in the same transaction
   * as the inspection update.  Files are soft-deleted from the access registry
   * rather than removed from disk so audit/retention jobs can handle lifecycle
   * cleanup without leaving a dangling business reference.
   */
  static async _reconcileInspectionAttachments(connection, inspectionId, attachments) {
    if (!Array.isArray(attachments)) return;

    const FileAccessService = require('../services/FileAccessService');
    const requestedUrls = [];
    for (const attachment of attachments) {
      const rawUrl =
        typeof attachment === 'string'
          ? attachment
          : attachment?.url ??
            attachment?.fileUrl ??
            attachment?.file_url ??
            attachment?.path ??
            attachment?.filePath;
      if (rawUrl === undefined || rawUrl === null || String(rawUrl).trim() === '') continue;

      const normalizedUrl = FileAccessService.normalizeUploadUrl(rawUrl);
      if (!normalizedUrl) {
        throw this._createValidationError('检验附件地址无效');
      }
      if (!requestedUrls.includes(normalizedUrl)) requestedUrls.push(normalizedUrl);
    }

    const [currentRecords] = await connection.execute(
      `SELECT id, file_url
         FROM file_access_records
        WHERE business_type = 'quality_inspection'
          AND business_id = ?
          AND deleted_at IS NULL
        FOR UPDATE`,
      [inspectionId]
    );

    const currentUrls = new Set((currentRecords || []).map((record) => record.file_url));
    const unknownUrls = requestedUrls.filter((url) => !currentUrls.has(url));
    if (unknownUrls.length > 0) {
      throw this._createValidationError('检验附件未通过当前检验单授权校验');
    }

    const staleIds = (currentRecords || [])
      .filter((record) => !requestedUrls.includes(record.file_url))
      .map((record) => record.id)
      .filter((recordId) => Number.isInteger(Number(recordId)) && Number(recordId) > 0);
    if (staleIds.length === 0) return;

    const placeholders = staleIds.map(() => '?').join(',');
    await connection.execute(
      `UPDATE file_access_records
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE id IN (${placeholders})
          AND business_type = 'quality_inspection'
          AND business_id = ?
          AND deleted_at IS NULL`,
      [...staleIds, inspectionId]
    );
  }

  static _buildInspectionUpdate(data, currentInspection) {
    const updateFields = [];
    const updateValues = [];
    const fieldMapping = {
      inspector: 'inspector_name',
      remarks: 'note',
    };

    for (const [key, value] of Object.entries(data)) {
      if (READONLY_INSPECTION_UPDATE_FIELDS.has(key) || value === undefined) {
        continue;
      }

      if (key === 'inspection_no') {
        if (value && value !== currentInspection.inspection_no) {
          throw this._createValidationError('检验单号不允许通过更新接口修改');
        }
        continue;
      }

      if (key === 'inspection_type') {
        if (value && value !== currentInspection.inspection_type) {
          throw this._createValidationError('检验类型不允许通过更新接口修改');
        }
        continue;
      }

      const fieldName = fieldMapping[key] || key;
      if (!UPDATEABLE_INSPECTION_FIELDS.has(fieldName)) {
        throw this._createValidationError(`不允许更新检验单字段: ${key}`);
      }

      updateFields.push(`${fieldName} = ?`);
      updateValues.push(value);
    }

    return { updateFields, updateValues };
  }

  /**
   * 获取所有检验单列表
   * @param {string} type 检验类型: incoming, process, final
   * @param {object} filters 筛选条件
   * @param {number} page 页码
   * @param {number} pageSize 每页条数
   * @returns {Promise<{rows: Array, total: number}>} 检验单列表和总数
   */
  static async getInspections(type, filters = {}, page = 1, pageSize = 20) {
    const pagination = parsePagination(page, pageSize, {
      defaultPageSize: 20,
      maxPageSize: 100,
    });
    const { limit, offset } = pagination;

    // 根据传入的额外参数决定是否加载供应商和参考数据
    const includeSupplier = filters.include_supplier === true;


    // 构建基础查询
    let query = `
      SELECT
        qi.*,
        CASE
          WHEN qi.inspection_type = 'incoming' THEN m.name
          WHEN qi.inspection_type = 'final' AND task_m.name IS NOT NULL THEN task_m.name
          WHEN qi.product_name IS NOT NULL AND qi.product_name != '' THEN qi.product_name
          ELSE proc_m.name
        END AS item_name,
        CASE
          WHEN qi.inspection_type = 'incoming' THEN m.code
          WHEN qi.inspection_type = 'final' AND task_m.code IS NOT NULL THEN task_m.code
          WHEN qi.product_code IS NOT NULL AND qi.product_code != '' THEN qi.product_code
          ELSE proc_m.code
        END AS item_code,
        CASE
          WHEN qi.inspection_type = 'incoming' THEN m.specs
          WHEN qi.inspection_type = 'final' AND task_m.specs IS NOT NULL THEN task_m.specs
          ELSE proc_m.specs
        END AS item_specs,
        COALESCE((SELECT COUNT(*) FROM process_inspection_punch_records WHERE inspection_id = qi.id), 0) AS punch_count,
        pt.status AS task_status

    `;

    // 根据选项添加额外字段
    if (includeSupplier) {
      query += `,
        s.id as supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact
      `;
    }

    const scopeClause = filters.scopeClause || { join: '', where: '', params: [] };

    query += `
      FROM quality_inspections qi
      LEFT JOIN materials m ON qi.inspection_type = 'incoming' AND qi.material_id = m.id
      LEFT JOIN materials proc_m ON qi.inspection_type IN('process', 'final') AND qi.product_id = proc_m.id
      LEFT JOIN production_tasks pt ON qi.inspection_type IN('process', 'final') AND qi.reference_id = pt.id
      LEFT JOIN materials task_m ON pt.product_id = task_m.id
      ${scopeClause.join || ''}
      `;

    // 根据选项添加供应商连接
    if (includeSupplier) {
      query += `
        LEFT JOIN purchase_orders po ON qi.inspection_type = 'incoming' AND qi.reference_no = po.order_no
        LEFT JOIN suppliers s ON po.supplier_id = s.id
      `;
    }

    query += 'WHERE qi.deleted_at IS NULL AND qi.inspection_type = ?';

    const sqlParams = [type];

    // 添加筛选条件
    if (filters.keyword) {
      const keyword = `%${filters.keyword}%`;
      query += ' AND (qi.inspection_no LIKE ? OR qi.reference_no LIKE ? OR qi.batch_no LIKE ?)';
      sqlParams.push(keyword, keyword, keyword);
    }

    if (filters.status) {
      query += ' AND qi.status = ?';
      sqlParams.push(filters.status);
    }

    if (filters.startDate && filters.endDate) {
      query += ' AND qi.planned_date BETWEEN ? AND ?';
      sqlParams.push(filters.startDate, filters.endDate);
    }

    // 兼容 ScopeGuard 片段（当前已认证用户不追加行级过滤）
    if (scopeClause.where) {
      query += scopeClause.where;
      sqlParams.push(...(scopeClause.params || []));
    }

    // 获取总数的查询 - 单独构建COUNT查询，避免子查询干扰
    let countQuery = `
      SELECT COUNT(*) as total
      FROM quality_inspections qi
      LEFT JOIN materials m ON qi.inspection_type = 'incoming' AND qi.material_id = m.id
      LEFT JOIN materials proc_m ON qi.inspection_type IN('process', 'final') AND qi.product_id = proc_m.id
      LEFT JOIN production_tasks pt ON qi.inspection_type IN('process', 'final') AND qi.reference_id = pt.id
      LEFT JOIN materials task_m ON pt.product_id = task_m.id
      ${scopeClause.join || ''}
      `;

    if (includeSupplier) {
      countQuery += `
        LEFT JOIN purchase_orders po ON qi.inspection_type = 'incoming' AND qi.reference_no = po.order_no
        LEFT JOIN suppliers s ON po.supplier_id = s.id
      `;
    }

    countQuery += ' WHERE qi.deleted_at IS NULL AND qi.inspection_type = ?';

    // 添加筛选条件（与主查询相同）
    if (filters.keyword) {
      countQuery +=
        ' AND (qi.inspection_no LIKE ? OR qi.reference_no LIKE ? OR qi.batch_no LIKE ?)';
    }
    if (filters.status) {
      countQuery += ' AND qi.status = ?';
    }
    if (filters.startDate && filters.endDate) {
      countQuery += ' AND qi.planned_date BETWEEN ? AND ?';
    }
    if (scopeClause.where) {
      countQuery += scopeClause.where;
    }

    // 直接使用connection执行查询
    const connection = await db.pool.getConnection();

    try {
      // 执行总数查询
      const [countRows] = await connection.query(countQuery, sqlParams);
      // 防止countRows[0]为undefined导致错误
      const total = countRows && countRows[0] ? parseInt(countRows[0].total) : 0;

      // 添加分页 — 使用安全分页工具
      query = appendPaginationSQL(query + ' ORDER BY qi.created_at DESC', limit, offset);

      // 使用 query 避免 LIMIT/OFFSET 参数化问题
      const [rows] = await connection.query(query, sqlParams);

      return {
        rows: rows || [], // 确保返回空数组而不是undefined
        total: total || 0, // 确保返回0而不是undefined
      };
    } finally {
      connection.release();
    }
  }

  /**
   * 根据ID获取检验单详情
   * @param {number} id 检验单ID
   * @param {object} options 选项
   * @returns {Promise<object>} 检验单详情
   */
  static async getInspectionById(id, options = {}) {
    try {
      if (!id) return null;

      const inspectionId = parseInt(id, 10);
      if (isNaN(inspectionId)) return null;

      // 默认加载供应商信息
      const includeSupplier = options.include_supplier !== false;

      const connection = await db.pool.getConnection();
      try {
        // 构建基础查询
        let query = `
      SELECT
      qi.*,
        CASE
              WHEN qi.inspection_type = 'incoming' THEN m.name
              WHEN qi.inspection_type = 'final' AND task_m.name IS NOT NULL THEN task_m.name
              WHEN qi.product_name IS NOT NULL AND qi.product_name != '' THEN qi.product_name
              ELSE proc_m.name
            END AS item_name,
        CASE
              WHEN qi.inspection_type = 'incoming' THEN m.code
              WHEN qi.inspection_type = 'final' AND task_m.code IS NOT NULL THEN task_m.code
              WHEN qi.product_code IS NOT NULL AND qi.product_code != '' THEN qi.product_code
              ELSE proc_m.code
            END AS item_code,
        CASE
              WHEN qi.inspection_type = 'incoming' THEN m.specs
              WHEN qi.inspection_type = 'final' AND task_m.specs IS NOT NULL THEN task_m.specs
              ELSE proc_m.specs
            END AS item_specs,
        it.template_code,
        it.template_name
          `;

        // 根据选项添加额外字段
        if (includeSupplier) {
          query += `,
        s.id as supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact
      `;
        }

        query += `
          FROM quality_inspections qi
          LEFT JOIN materials m ON qi.inspection_type = 'incoming' AND qi.material_id = m.id
          LEFT JOIN materials proc_m ON qi.inspection_type IN('process', 'final') AND qi.product_id = proc_m.id
          LEFT JOIN production_tasks pt ON qi.inspection_type = 'final' AND qi.reference_id = pt.id
          LEFT JOIN materials task_m ON pt.product_id = task_m.id
          LEFT JOIN inspection_templates it ON qi.template_id = it.id
        `;

        // 根据选项添加供应商连接
        if (includeSupplier) {
          query += `
            LEFT JOIN purchase_orders po ON qi.inspection_type = 'incoming' AND qi.reference_no = po.order_no
            LEFT JOIN suppliers s ON po.supplier_id = s.id
        `;
        }

        query += 'WHERE qi.deleted_at IS NULL AND qi.id = ?';

        // 执行查询
        const [rows] = await connection.query(query, [inspectionId]);
        if (rows.length === 0) {
          return null;
        }

        // 获取检验项
        const itemsQuery = `
      SELECT id, inspection_id, item_name, standard, type, is_critical, dimension_value, tolerance_upper, tolerance_lower, actual_value, measure_1, measure_2, measure_3, measure_4, measure_5, measure_6, method, result, is_qualified, remark, created_at, updated_at FROM quality_inspection_items
          WHERE inspection_id = ?
        ORDER BY id
        `;
        const [items] = await connection.query(itemsQuery, [inspectionId]);

        if (items.length > 0) {
          const itemIds = items.map((item) => item.id);
          const placeholders = itemIds.map(() => '?').join(',');
          const [measurementRows] = await connection.query(
            `SELECT item_id, sample_no, measured_value, measured_by,
                    is_qualified, measured_at
               FROM quality_inspection_measurements
              WHERE item_id IN (${placeholders})
              ORDER BY item_id, sample_no`,
            itemIds
          );
          const measurementsByItem = new Map();
          for (const measurement of measurementRows) {
            if (!measurementsByItem.has(measurement.item_id)) {
              measurementsByItem.set(measurement.item_id, []);
            }
            measurementsByItem.get(measurement.item_id).push(measurement);
          }
          for (const item of items) {
            item.measurements = measurementsByItem.get(item.id) || [];
          }
        }

        // 获取关联的检验附件（问题照片、现场取证图片等）
        const [attachments] = await connection.query(
          `SELECT id, file_url, metadata, created_at
             FROM file_access_records
            WHERE business_type = 'quality_inspection'
              AND business_id = ?
              AND deleted_at IS NULL
            ORDER BY id ASC`,
          [inspectionId]
        );

        return {
          ...rows[0],
          items,
          attachments: (attachments || []).map((att) => {
            let meta;
            try {
              meta = typeof att.metadata === 'string' ? JSON.parse(att.metadata || '{}') : (att.metadata || {});
            } catch {
              meta = {};
            }
            return {
              id: att.id,
              url: att.file_url,
              name: meta.originalName || '现场照片',
              size: meta.size,
              type: meta.mimetype || meta.mimeType || null,
              createdAt: att.created_at,
            };
          }),
        };
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('获取检验单详情失败:', error);
      throw error;
    }
  }

  /**
   * 创建质量检验单
   * @param {object} inspection 检验单数据
   * @returns {Promise<object>} 创建结果
   */
  static _getTemplateMaterialId(inspection) {
    return InspectionTemplateResolver.getInspectionMaterialId(inspection);
  }

  static async findMatchingInspectionTemplate(connection, inspectionType, materialId, explicitTemplateId = null) {
    return InspectionTemplateResolver.findMatchingTemplate(
      connection,
      inspectionType,
      materialId,
      explicitTemplateId
    );
  }

  static async getTemplateItems(connection, templateId) {
    return InspectionTemplateResolver.getTemplateItems(connection, templateId);
  }

  static async createInspection(inspection, externalConnection = null) {
    let connection;
    const useOwnConnection = !externalConnection;
    try {
      connection = externalConnection || await db.pool.getConnection();
      if (useOwnConnection) {
        await connection.beginTransaction();
      }

      // 来料检验必须明确区分采购订单与委外入库单；旧调用方未传来源时
      // 兼容性默认为采购订单，但显式委外来源必须原样持久化。
      inspection.source_type = this._normalizeSourceType(
        inspection.inspection_type,
        inspection.source_type
      );

      // 生成检验单号
      let inspectionNo;
      if (inspection.inspection_no) {
        inspectionNo = inspection.inspection_no;
      } else {
        const prefix = this._getInspectionPrefix(inspection.inspection_type);
        inspectionNo = await this.generateInspectionNo(prefix, connection);
      }

      // 批次号必须来自采购、生产或前端显式录入，避免模型层生成不可追溯的业务编号
      if (!inspection.batch_no || String(inspection.batch_no).includes('默认')) {
        throw new Error('批次号不能为空，请从业务来源传入可追溯的批次号');
      }

      // 如果来料检验的 reference_id 为空但 reference_no 存在，按来源单据补齐 ID。
      if (
        inspection.inspection_type === 'incoming' &&
        !inspection.reference_id &&
        inspection.reference_no
      ) {
        const isOutsourcedIncoming = this._isOutsourcedIncoming(inspection);
        const sourceTable = isOutsourcedIncoming
          ? 'outsourced_processing_receipts'
          : 'purchase_orders';
        const sourceNumberColumn = isOutsourcedIncoming ? 'receipt_no' : 'order_no';
        const [orderRows] = await connection.query(
          `SELECT id FROM ${sourceTable} WHERE ${sourceNumberColumn} = ? LIMIT 1`,
          [inspection.reference_no]
        );
        if (orderRows && orderRows.length > 0) {
          inspection.reference_id = orderRows[0].id;
          logger.info(
            `Inspection source reference resolved automatically: sourceType=${inspection.source_type}, sourceId=${inspection.reference_id}, sourceNo=${inspection.reference_no}`
          );
        } else {
          const sourceLabel = isOutsourcedIncoming ? '委外入库单' : '采购订单';
          throw new Error(`来料检验单缺少有效${sourceLabel}引用: ${inspection.reference_no}`);
        }
      }

      if (inspection.inspection_type === 'incoming' && !inspection.reference_id) {
        throw new Error(
          this._isOutsourcedIncoming(inspection)
            ? '委外来料检验单必须关联委外入库单，不能创建无来源的来料检验单'
            : '来料检验单必须关联采购订单，不能创建无来源的来料检验单'
        );
      }

      // 如果product_id存在但product_code或product_name为空，从materials表查询
      if (inspection.product_id && (!inspection.product_code || !inspection.product_name)) {
        const [productRows] = await connection.query(
          'SELECT code, name FROM materials WHERE id = ?',
          [inspection.product_id]
        );
        if (productRows && productRows.length > 0) {
          inspection.product_code = inspection.product_code || productRows[0].code;
          inspection.product_name = inspection.product_name || productRows[0].name;
          logger.info(
            `从materials表查询到产品信息: code = ${inspection.product_code}, name = ${inspection.product_name} `
          );
        }
      }

      // 如果material_id存在但unit或unit_id为空，从materials表查询补全
      if (inspection.material_id && (!inspection.unit || !inspection.unit_id)) {
        const [materialRows] = await connection.query(
          'SELECT unit_id FROM materials WHERE id = ?',
          [inspection.material_id]
        );
        if (materialRows && materialRows.length > 0 && materialRows[0].unit_id) {
          // 补全 unit_id
          if (!inspection.unit_id) {
            inspection.unit_id = materialRows[0].unit_id;
          }
          // 补全 unit 文本
          if (!inspection.unit) {
            const [unitRows] = await connection.query('SELECT name FROM units WHERE id = ?', [
              materialRows[0].unit_id,
            ]);
            if (unitRows && unitRows.length > 0) {
              inspection.unit = unitRows[0].name;
            }
          }
        }
      }

      // 【检验方式逻辑】查询当前物料的检验方式（免检/抽检/全检）
      let isExempt = false;
      let isSampling = false;
      if (inspection.material_id) {
        const [methodRows] = await connection.query(
          `SELECT im.code FROM materials m LEFT JOIN inspection_methods im ON m.inspection_method_id = im.id WHERE m.id = ?`,
          [inspection.material_id]
        );
        if (methodRows && methodRows.length > 0) {
          const methodCode = methodRows[0].code;
          if (methodCode === 'exempt') {
            isExempt = true;
            logger.info(
              `Material inspection exemption applied: materialId=${inspection.material_id}`
            );
            // 覆盖单据状态以自动合格
            inspection.status = 'passed';
            inspection.inspector_name = '系统(自动免检)';
            inspection.note = (inspection.note ? inspection.note + ' | ' : '') + '依据物料免检配置，系统自动判定合格';
          } else if (methodCode === 'sampling') {
            isSampling = true;
            logger.info(
              `AQL sampling enabled by material inspection method: materialId=${inspection.material_id}`
            );
            inspection.is_aql = 1;
          }
        }
      }

      // DataScope owner: explicit inspector first, then the source document owner.
      let inspectorId = firstValidUserId(inspection.inspector_id);
      if (!inspectorId) {
        const sourceTable = inspection.inspection_type === 'incoming'
          ? this._isOutsourcedIncoming(inspection)
            ? null
            : 'purchase_orders'
          : inspection.task_id || inspection.reference_id
            ? 'production_tasks'
            : null;
        const sourceId = inspection.inspection_type === 'incoming'
          ? inspection.reference_id
          : inspection.task_id || inspection.reference_id;

        if (sourceTable && sourceId) {
          const [sourceRows] = await connection.query(
            `SELECT created_by FROM ${sourceTable} WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
            [sourceId]
          );
          inspectorId = firstValidUserId(sourceRows[0]?.created_by);
        }
      }
      if (!inspectorId) {
        throw new Error('检验单缺少可追溯责任人，请指定检验员或补全来源单据创建人');
      }

      // 创建检验单
      const [result] = await connection.query(
        `
          INSERT INTO quality_inspections(
          inspection_no, inspection_type, source_type, reference_id, reference_no,
          material_id, supplier_id, product_id, product_name, product_code, process_id, process_name, task_id,
          batch_no, quantity, unit, unit_id, standard_type, standard_no,
          planned_date, actual_date, note, inspector_id, inspector_name, status,
          is_first_article, first_article_qty, is_full_inspection, first_article_result, production_can_continue,
          is_aql, aql_level
        ) VALUES(
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
          `,
        [
          inspectionNo,
          inspection.inspection_type,
          inspection.source_type,
          inspection.reference_id,
          inspection.reference_no,
          inspection.material_id || null,
          inspection.supplier_id || null,
          inspection.product_id || null,
          inspection.product_name || null,
          inspection.product_code || null,
          inspection.process_id || null,
          inspection.process_name || null,
          inspection.task_id || inspection.reference_id || null,
          inspection.batch_no,
          inspection.quantity,
          inspection.unit,
          inspection.unit_id || null,
          inspection.standard_type || null,
          inspection.standard_no || null,
          inspection.planned_date,
          isExempt ? new Date() : null, // 实际检验日期
          inspection.note,
          inspectorId,
          inspection.inspector_name || null, // 检验员姓名
          inspection.status || 'pending',
          inspection.inspection_type === 'first_article' || inspection.is_first_article ? 1 : 0,
          inspection.first_article_qty ?? 5,
          inspection.is_full_inspection ? 1 : 0,
          inspection.first_article_result || (inspection.inspection_type === 'first_article' ? 'pending' : null),
          inspection.production_can_continue ? 1 : 0,
          inspection.is_aql || 0, // AQL抽样开关
          inspection.aql_level || null, // AQL级别
        ]
      );

      const inspectionId = result.insertId;

      // ===== 自动引用检验模板：显式模板 > 专用模板 > 默认通用模板 =====
      const templateMaterialId = this._getTemplateMaterialId(inspection);
      const appliedTemplate = await this.findMatchingInspectionTemplate(
        connection,
        inspection.inspection_type,
        templateMaterialId,
        inspection.template_id
      );

      if (appliedTemplate) {
        inspection.template_id = appliedTemplate.id;
        const updateFields = ['template_id = ?'];
        const updateValues = [appliedTemplate.id];
        const templateUsesAql = appliedTemplate.is_aql === true || appliedTemplate.is_aql === 1;

        if (templateUsesAql && !inspection.is_aql) {
          inspection.is_aql = 1;
          inspection.aql_level = appliedTemplate.aql_level || inspection.aql_level || null;
          updateFields.push('is_aql = ?', 'aql_level = ?');
          updateValues.push(1, inspection.aql_level);
        } else if (templateUsesAql && !inspection.aql_level && appliedTemplate.aql_level) {
          inspection.aql_level = appliedTemplate.aql_level;
          updateFields.push('aql_level = ?');
          updateValues.push(inspection.aql_level);
        }

        updateValues.push(inspectionId);
        await connection.query(
          `UPDATE quality_inspections SET ${updateFields.join(', ')} WHERE id = ?`,
          updateValues
        );

        if (!inspection.items || !Array.isArray(inspection.items) || inspection.items.length === 0) {
          inspection.items = await this.getTemplateItems(connection, appliedTemplate.id);
          logger.info(`自动引用检验模板 ${appliedTemplate.template_name}，加载 ${inspection.items.length} 个检验项目`);
        }
      }

      if (inspection.is_aql && !inspection.aql_level) {
        throw InspectionTemplateResolver.createValidationError(
          'AQL抽检已启用，但未配置AQL等级；请在检验模板或检验单中维护AQL等级'
        );
      }

      if (
        ['incoming', 'process', 'final', 'first_article'].includes(inspection.inspection_type) &&
        (!inspection.items || !Array.isArray(inspection.items) || inspection.items.length === 0)
      ) {
        throw InspectionTemplateResolver.createValidationError(
          '未匹配到可用检验模板，且检验单没有检验项目，不能创建来料/过程/成品/首件检验单'
        );
      }

      // 如果有检验项目数据，则创建检验项目
      if (inspection.items && Array.isArray(inspection.items) && inspection.items.length > 0) {
        for (const item of inspection.items) {
          // 处理is_critical字段，确保它是0或1
          const isCritical = item.is_critical === true || item.is_critical === 1 ? 1 : 0;

          // 处理备注字段
          const remark = item.remarks || item.remark || null;

          const itemType = this._normalizeItemType(item.type);
          // 数值录入模式由检验标准决定，不再局限于 dimension 类型。
          // 前端会把定性项目的固定列置空，因此这里保留所有已提交的数值列。
          const fixedMeasurements = Array.from(
            { length: 6 },
            (_, index) => item[`measure_${index + 1}`] ?? item[`measure${index + 1}`] ?? null
          );

          // 这里如果是免检我们自动赋予OK通过结果
          let itemResult = null;
          let actualValue = null;
          if (isExempt) {
            itemResult = 'OK';
            actualValue = '免检项自动合格';
          }

          // 插入检验项目（包含 result, actual_value, 和6次测量值字段）
          const [itemResultDb] = await connection.query(
            `
              INSERT INTO quality_inspection_items(
            inspection_id, item_name, standard, method, type, is_critical,
            dimension_value, tolerance_upper, tolerance_lower,
            result, actual_value, remark,
            measure_1, measure_2, measure_3, measure_4, measure_5, measure_6
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
              inspectionId,
              item.item_name,
              item.standard,
              item.method || item.inspection_method || null,
              itemType,
              isCritical,
              item.dimension_value === '' ? null : item.dimension_value ?? null,
              item.tolerance_upper === '' ? null : item.tolerance_upper ?? null,
              item.tolerance_lower === '' ? null : item.tolerance_lower ?? null,
              itemResult,
              actualValue,
              remark,
              ...fixedMeasurements,
            ]
          );

          // 同时写入动态测量子表 (quality_inspection_measurements)
          const insertedItemId = itemResultDb.insertId;
          const measurements = Array.isArray(item.measurements) ? item.measurements.slice(0, 6) : [];
          // 优先使用 measurements 数组，其次回退到 measure_1~6
          if (measurements.length > 0) {
            for (const m of measurements) {
              if (m?.measured_value === null || m?.measured_value === undefined || m?.measured_value === '') continue;
              await connection.query(
                `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value, measured_by)
                 VALUES (?, ?, ?, ?)`,
                [insertedItemId, m.sample_no, m.measured_value, m.measured_by || null]
              );
            }
          } else {
            // 回退: 从 measure_1~6 写入
            for (let si = 1; si <= 6; si++) {
              const val = item[`measure_${si}`];
              if (val !== null && val !== undefined && val !== '') {
                await connection.query(
                  `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value)
                   VALUES (?, ?, ?)`,
                  [insertedItemId, si, val]
                );
              }
            }
          }
        }
      }

      if (
        inspection.inspection_type === 'incoming' &&
        !this._isOutsourcedIncoming(inspection) &&
        ['passed', 'partial', 'completed'].includes(String(inspection.status || ''))
      ) {
        const ProductionInboundService = require('../services/business/ProductionInboundService');
        const incomingQty = Number(inspection.qualified_quantity ?? inspection.quantity ?? 0);
        if (incomingQty > 0) {
          await ProductionInboundService.createDraftFromIncomingInspection(connection, {
            inspection: {
              ...inspection,
              id: inspectionId,
              inspection_no: inspectionNo,
              qualified_quantity: incomingQty,
            },
            qualifiedQuantity: incomingQty,
            operator: inspection.inspector_name || '系统',
            createdBy: inspectorId,
          });
        }
      }

      if (useOwnConnection) {
        await connection.commit();
      }

      return {
        id: inspectionId,
        inspection_no: inspectionNo,
        is_exempt: isExempt, // 向上层标志是否由系统免检生成
        is_sampling: isSampling, // 向上层标志是否由系统自动启用AQL抽样
        ...inspection,
      };
    } catch (error) {
      if (useOwnConnection && connection) {
        await connection.rollback();
      }
      logger.error('创建检验单失败:', error);
      throw error;
    } finally {
      if (useOwnConnection && connection) {
        connection.release();
      }
    }
  }

  /**
   * 更新检验单信息
   * @param {number} id 检验单ID
   * @param {object} data 更新数据
   * @returns {Promise<object>} 更新后的检验单
   */
  static async updateInspection(id, data, externalConnection = null) {
    let connection;
    const useOwnConnection = !externalConnection;
    try {
      logger.debug('Updating quality inspection', { id });
      logger.debug('Quality inspection update payload normalized', {
        id,
        status: data.status,
        qualifiedQuantity: data.qualified_quantity,
        unqualifiedQuantity: data.unqualified_quantity,
        itemCount: Array.isArray(data.items) ? data.items.length : 0,
        hasActualDate: Boolean(data.actual_date),
      });

      connection = externalConnection || await db.pool.getConnection();
      if (useOwnConnection) {
        await connection.beginTransaction();
      }

      try {
        // 获取当前检验单的信息
        const [currentInspection] = await connection.query(
          'SELECT id, inspection_no, inspection_type, source_type, reference_id, reference_no, material_id, supplier_id, product_id, product_name, product_code, process_id, process_name, batch_no, quantity, qualified_quantity, unqualified_quantity, unit, unit_id, status, planned_date, actual_date, inspector_id, inspector_name, punch_time, standard_type, standard_no, template_id, note, created_at, updated_at, traceability_id, traceability_batch, chain_id, chain_step_id, is_first_article, first_article_qty, is_full_inspection, first_article_result, production_can_continue, task_id, is_aql, aql_standard_id, aql_level, accept_limit, reject_limit, deleted_at FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [id]
        );

        if (currentInspection.length === 0) {
          throw new Error('检验单不存在');
        }

        const inspection = currentInspection[0];

        // 修复历史记录中 source_type 为空的情况；若 reference_no 对应委外
        // 入库单则立即回写委外来源，否则按采购来源兼容旧数据。
        inspection.source_type = await resolveInspectionSourceType(
          connection,
          inspection,
          { persist: true }
        );

        const effectiveStatus = Object.prototype.hasOwnProperty.call(data, 'status')
          ? data.status
          : inspection.status;
        const shouldValidateTerminalStatus = Object.keys(data).some((key) =>
          TERMINAL_VALIDATION_UPDATE_FIELDS.has(key)
        );

        if (
          shouldValidateTerminalStatus &&
          TERMINAL_INSPECTION_STATUSES.has(effectiveStatus) &&
          ['incoming', 'process', 'final', 'first_article'].includes(inspection.inspection_type)
        ) {
          const itemsForValidation =
            Array.isArray(data.items) && data.items.length > 0
              ? data.items
              : await this._getStoredInspectionItems(connection, id);
          this._validateTerminalStatusAgainstItems(
            { ...inspection, ...data },
            effectiveStatus,
            itemsForValidation
          );
        }

        // 更新检验单基本信息
        const { updateFields, updateValues } = this._buildInspectionUpdate(data, inspection);

        if (updateFields.length > 0) {
          updateValues.push(id);

          await connection.execute(
            `UPDATE quality_inspections
             SET ${updateFields.join(', ')}
             WHERE id = ? AND deleted_at IS NULL`,
            updateValues
          );
        }

        if (Object.prototype.hasOwnProperty.call(data, 'attachments')) {
          await this._reconcileInspectionAttachments(connection, id, data.attachments);
        }

        // 如果有检验项，更新检验项
        if (data.items && data.items.length > 0) {
          // 先删除旧的检验项
          await connection.execute(
            `DELETE qim FROM quality_inspection_measurements qim
               INNER JOIN quality_inspection_items qii ON qii.id = qim.item_id
              WHERE qii.inspection_id = ?`,
            [id]
          );
          await connection.execute('DELETE FROM quality_inspection_items WHERE inspection_id = ?', [
            id,
          ]);

          // 插入新的检验项
          for (const item of data.items) {
            // 处理is_critical字段，确保它是0或1
            const isCritical = item.is_critical === true || item.is_critical === 1 ? 1 : 0;

            // 处理remarks和remark字段
            const remark = item.remarks || item.remark || null;

            const itemType = this._normalizeItemType(item.type);
            // performance / safety 等项目也可能依据标准文本录入数值。
            const fixedMeasurements = Array.from(
              { length: 6 },
              (_, index) => item[`measure_${index + 1}`] ?? item[`measure${index + 1}`] ?? null
            );

            const [updatedItemResult] = await connection.execute(
              `INSERT INTO quality_inspection_items(
            inspection_id, item_name, standard, method, type, is_critical,
            dimension_value, tolerance_upper, tolerance_lower,
            result, actual_value, remark,
            measure_1, measure_2, measure_3, measure_4, measure_5, measure_6
          ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                item.item_name,
                item.standard,
                item.method || item.inspection_method || null,
                itemType,
                isCritical,
                item.dimension_value === '' ? null : item.dimension_value ?? null,
                item.tolerance_upper === '' ? null : item.tolerance_upper ?? null,
                item.tolerance_lower === '' ? null : item.tolerance_lower ?? null,
                item.result || null,
                item.actual_value === '' ? null : item.actual_value ?? null,
                remark,
                ...fixedMeasurements,
              ]
            );

            // 同时写入动态测量子表
            const updatedItemId = updatedItemResult.insertId;
            const measurements = Array.isArray(item.measurements) ? item.measurements.slice(0, 6) : [];
            if (measurements.length > 0) {
              for (const m of measurements) {
                if (m?.measured_value === null || m?.measured_value === undefined || m?.measured_value === '') continue;
                await connection.execute(
                  `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value, measured_by)
                   VALUES (?, ?, ?, ?)`,
                  [updatedItemId, m.sample_no, m.measured_value, m.measured_by || null]
                );
              }
            } else {
              for (let si = 1; si <= 6; si++) {
                const val = item[`measure_${si}`];
                if (val !== null && val !== undefined && val !== '') {
                  await connection.execute(
                    `INSERT INTO quality_inspection_measurements (item_id, sample_no, measured_value)
                     VALUES (?, ?, ?)`,
                    [updatedItemId, si, val]
                  );
                }
              }
            }
          }
        }

        // 来料检验合格：自动生成零部件仓入库草稿，由仓库管理员确认
        if (
          inspection.inspection_type === 'incoming' &&
          !this._isOutsourcedIncoming(inspection) &&
          data.status
        ) {
          const incomingQty = Number(
            data.qualified_quantity ?? inspection.qualified_quantity ?? inspection.quantity ?? 0
          );
          if (
            incomingQty > 0 &&
            ['passed', 'partial', 'completed'].includes(String(data.status))
          ) {
            const ProductionInboundService = require('../services/business/ProductionInboundService');
            const inboundCreatedBy = firstValidUserId(data.inspector_id, inspection.inspector_id);
            await ProductionInboundService.createDraftFromIncomingInspection(connection, {
              inspection: {
                ...inspection,
                qualified_quantity: incomingQty,
              },
              qualifiedQuantity: incomingQty,
              operator: data.inspector_name || inspection.inspector_name || '系统',
              createdBy: inboundCreatedBy,
            });
          }
        }

        // 成品终检：任务状态机 + 生产入库（领域服务，禁止模型内拼装入库 SQL）
        if (inspection.inspection_type === 'final' && inspection.reference_id && data.status) {
          try {
            const taskId = inspection.reference_id;
            const newInspectionStatus = data.status;
            const {
              promoteTaskToward,
              syncPlanStatus,
            } = require('../services/business/TaskLifecycleService');
            const ProductionInboundService = require('../services/business/ProductionInboundService');

            const [taskResult] = await connection.query(
              'SELECT id, plan_id, status FROM production_tasks WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
              [taskId]
            );

            if (taskResult.length > 0) {
              const planId = taskResult[0].plan_id;
              let targetTaskStatus = null;

              if (newInspectionStatus === 'in_progress') {
                targetTaskStatus = STATUS.PRODUCTION_TASK.INSPECTION;
              } else if (
                newInspectionStatus === 'passed' ||
                newInspectionStatus === 'partial' ||
                (newInspectionStatus === 'completed' &&
                  Number(data.qualified_quantity ?? inspection.qualified_quantity) > 0)
              ) {
                // 全合格或部分合格：均可进入入库阶段
                targetTaskStatus = STATUS.PRODUCTION_TASK.WAREHOUSING;
              }

              if (targetTaskStatus) {
                const promoteResult = await promoteTaskToward(
                  connection,
                  taskId,
                  targetTaskStatus,
                  { requireOpenInspectionClear: false }
                );
                logger.info(
                  `生产任务 ${taskId} 生命周期推进: ${promoteResult.status} (promoted=${promoteResult.promoted}, reason=${promoteResult.reason || ''})`
                );

                if (newInspectionStatus === 'passed') {
                  await connection.execute(
                    `UPDATE production_processes
                     SET status = 'completed'
                     WHERE task_id = ?
                       AND status NOT IN ('completed', 'cancelled')`,
                    [taskId]
                  );
                }

                if (planId) {
                  await syncPlanStatus(planId, connection);
                }

                // passed / partial / completed 且有合格量 → 自动建生产入库草稿
                const qualifiedQty = Number(
                  data.qualified_quantity ?? inspection.qualified_quantity ?? 0
                );
                const shouldCreateInbound =
                  qualifiedQty > 0 &&
                  ['passed', 'partial', 'completed'].includes(String(newInspectionStatus));

                if (shouldCreateInbound) {
                  const inboundCreatedBy = firstValidUserId(
                    data.inspector_id,
                    inspection.inspector_id
                  );
                  const operator =
                    data.inspector_name || inspection.inspector_name || '系统';
                  if (!inboundCreatedBy) {
                    throw new Error('终检单缺少检验员用户ID，不能自动创建生产入库单');
                  }

                  await ProductionInboundService.createDraftFromFinalInspection(connection, {
                    inspection: {
                      ...inspection,
                      id,
                      inspection_type: inspection.inspection_type,
                      inspection_no: inspection.inspection_no,
                      reference_id: inspection.reference_id,
                      task_id: inspection.task_id || inspection.reference_id,
                      batch_no: inspection.batch_no,
                      qualified_quantity: qualifiedQty,
                      inspector_id: inboundCreatedBy,
                      inspector_name: operator,
                    },
                    qualifiedQuantity: qualifiedQty,
                    operator,
                    createdBy: inboundCreatedBy,
                  });
                }
              }
            }
          } catch (error) {
            logger.error('同步更新生产任务、计划和过程状态失败:', error);
            throw error;
          }
        }

        // 首件/工序检验通过后：若工序已全部完成，尝试推进任务进入待检并创建终检
        if (
          ['first_article', 'process'].includes(inspection.inspection_type) &&
          data.status &&
          ['passed', 'completed'].includes(String(data.status))
        ) {
          const taskIdForPromote = inspection.task_id || inspection.reference_id;
          if (taskIdForPromote) {
            try {
              const {
                promoteTaskToInspection,
              } = require('../services/business/TaskLifecycleService');
              const [procStats] = await connection.query(
                `SELECT
                   COUNT(*) AS total,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                   SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
                 FROM production_processes
                 WHERE task_id = ?`,
                [taskIdForPromote]
              );
              const total = Number(procStats[0]?.total || 0);
              const completed = Number(procStats[0]?.completed || 0);
              const cancelled = Number(procStats[0]?.cancelled || 0);
              const allDone = total > 0 && completed === total - cancelled;
              if (allDone) {
                const promoteResult = await promoteTaskToInspection(connection, taskIdForPromote, {
                  setCompletedQuantityToPlan: true,
                  requireOpenInspectionClear: true,
                });
                if (promoteResult?.promoted || promoteResult?.status === 'inspection') {
                  const FinalInspectionService = require('../services/business/FinalInspectionService');
                  await FinalInspectionService.ensureForTask(connection, taskIdForPromote, {
                    note: '首件/工序检验完成后自动创建终检',
                  });
                  logger.info(
                    `首件/工序检验通过后任务 ${taskIdForPromote} 已推进待检并确保终检单`
                  );
                }
              }
            } catch (promoteAfterInspectErr) {
              if (promoteAfterInspectErr.code === 'OPEN_INSPECTIONS') {
                logger.info(
                  `首件/工序检验更新后仍有未关闭检验，暂不推进任务: ${promoteAfterInspectErr.message}`
                );
              } else {
                logger.warn(
                  `首件/工序检验通过后推进任务失败: ${promoteAfterInspectErr.message}`
                );
              }
            }
          }
        }

        if (useOwnConnection) {
          await connection.commit();
        }
        logger.debug('Quality inspection update transaction committed', { id });

        return { id, ...data };
      } catch (error) {
        logger.error('更新检验单过程中出错:', error);
        if (connection && useOwnConnection) {
          await connection.rollback();
          logger.info('事务已回滚');
        }
        throw error;
      }
    } catch (error) {
      logger.error('更新检验单失败:', error);
      throw error;
    } finally {
      if (connection && useOwnConnection) {
        connection.release();
        logger.info('数据库连接已释放');
      }
    }
  }

  /**
   * 删除检验单
   * @param {number} id 检验单ID
   * @returns {Promise<boolean>} 删除结果
   */
  static async deleteInspection(id) {
    try {
      const connection = await db.pool.getConnection();
      await connection.beginTransaction();

      try {
        const [inspections] = await connection.execute(
          'SELECT id, status FROM quality_inspections WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
          [id]
        );
        if (inspections.length === 0) {
          throw new Error('检验单不存在');
        }
        if (inspections[0].status !== 'pending') {
          throw new Error('只有待检验状态的检验单才能删除');
        }

        // 附件授权记录与检验单生命周期保持一致。物理文件不在这里删除，
        // 由留存/清理任务按审计策略处理，避免删除业务单据后留下可见附件。
        await connection.execute(
          `UPDATE file_access_records
              SET deleted_at = NOW(), updated_at = NOW()
            WHERE business_type = 'quality_inspection'
              AND business_id = ?
              AND deleted_at IS NULL`,
          [id]
        );

        // 删除检验项
        await connection.execute('DELETE FROM quality_inspection_items WHERE inspection_id = ?', [
          id,
        ]);

        // 删除检验单
        // ✅ 软删除替代硬删除
        await softDelete(connection, 'quality_inspections', 'id', id);

        await connection.commit();
        return true;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('删除检验单失败:', error);
      throw error;
    }
  }

  /**
   * 获取检验相关的引用数据（物料、产品、工序等）
   * @param {string} type 检验类型
   * @returns {Promise<object>} 相关数据
   */
  static async getReferenceData(type) {
    const data = {};

    if (type === 'incoming') {
      // 获取采购单
      const purchaseOrdersResult = await db.query(`
        SELECT po.id, po.order_no, po.supplier_id, s.name as supplier_name
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        WHERE po.deleted_at IS NULL
          AND po.status IN ('confirmed', 'approved', 'received', 'partial_received', 'inspecting', 'inspected', 'warehousing')
        ORDER BY po.created_at DESC
        LIMIT 100
        `);
      const purchaseOrders = purchaseOrdersResult.rows || [];

      data.purchaseOrders = purchaseOrders;

      // 获取物料
      if (purchaseOrders.length > 0) {
        const supplierIds = [...new Set(purchaseOrders.map((po) => po.supplier_id))];
        const materialsResult = await db.query(
          `
          SELECT m.id, m.name, m.code, m.unit_id, u.name as unit_name, u.name as unit
          FROM materials m
          JOIN supplier_materials sm ON m.id = sm.material_id
          LEFT JOIN units u ON m.unit_id = u.id
          WHERE sm.supplier_id IN(?)
        `,
          [supplierIds]
        );
        const materials = materialsResult.rows || [];

        data.materials = materials;
      }
    } else {
      // 获取生产工单
      const productionOrdersResult = await db.query(`
        SELECT pt.id, pt.code as order_no, pt.product_id, m.name as product_name, m.specs as unit
        FROM production_tasks pt
        JOIN materials m ON pt.product_id = m.id
        WHERE pt.status IN('in_progress', 'pending')
        ORDER BY pt.created_at DESC
        LIMIT 100
        `);
      const productionOrders = productionOrdersResult.rows || [];

      data.productionOrders = productionOrders;

      if (type === 'process' && productionOrders.length > 0) {
        // 获取工序

        const processesResult = await db.query(
          `
          SELECT pp.id, pp.task_id, pp.process_name, pp.sequence, pp.status
          FROM production_processes pp
          WHERE pp.task_id IN(?)
          ORDER BY pp.sequence
        `,
          [productionOrders.map(po => po.id)]
        );
        const processes = processesResult.rows || [];

        data.processes = processes;
      }
    }

    return data;
  }

  /**
   * 获取检验标准数据
   * @param {string} type 检验类型
   * @param {number} targetId 目标ID (物料ID或产品ID)
   * @returns {Promise<Array>} 标准数据
   */
  static async getStandards(type, targetId) {
    const targetType = type === 'incoming' ? 'material' : 'product';

    const standardsResult = await db.query(
      `
      SELECT s.*, COUNT(si.id) as item_count
      FROM quality_standards s
      LEFT JOIN quality_standard_items si ON s.id = si.standard_id
      WHERE s.target_type = ? AND s.target_id = ? AND s.is_active = 1
      GROUP BY s.id
      ORDER BY s.created_at DESC
        `,
      [targetType, targetId]
    );
    const standards = standardsResult.rows || [];

    // 获取标准项
    if (standards.length > 0) {
      const standardIds = standards.map((s) => s.id);
      const itemsResult = await db.query(
        `
      SELECT id, standard_id, item_name, item_standard, method, is_required, sequence, created_at, updated_at FROM quality_standard_items
        WHERE standard_id IN(?)
        ORDER BY sequence
      `,
        [standardIds]
      );
      const items = itemsResult.rows || [];

      // 组装数据
      standards.forEach((standard) => {
        standard.items = items.filter((item) => item.standard_id === standard.id);
      });
    }

    return standards;
  }

  /**
   * 根据检验类型获取检验单号前缀
   * @param {string} inspectionType 检验类型: incoming, process, final
   * @returns {string} 检验单号前缀
   * @private
   */
  static _getInspectionPrefix(inspectionType) {
    // 根据检验类型生成不同的前缀
    let prefix;
    if (inspectionType === 'incoming') {
      prefix = 'IQC'; // Incoming Quality Control
    } else if (inspectionType === 'process') {
      prefix = 'PQC'; // Process Quality Control
    } else if (inspectionType === 'final') {
      prefix = 'FQC'; // Final Quality Control
    } else if (inspectionType === 'first_article') {
      prefix = 'FAI'; // First Article Inspection
    } else {
      prefix = inspectionType.toUpperCase();
    }

    return prefix;
  }

  /**
   * 生成检验单号
   * @param {string} prefix 检验单号前缀
   * @returns {string} 生成的检验单号
   */
  static async generateInspectionNo(_prefix, connection = null) {
    try {
      return await CodeGeneratorService.nextCode('quality_inspection', connection);
    } catch (error) {
      logger.error('生成检验单号失败:', error);
      throw error;
    }
  }
}

module.exports = QualityInspection;
