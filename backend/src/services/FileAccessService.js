const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { pool } = require('../config/db');
const ScopeGuard = require('../authorization/ScopeGuard');
const DataScopeService = require('./DataScopeService');
const DocumentLinkService = require('./business/DocumentLinkService');
const PermissionService = require('./PermissionService');
const { PermissionUtils } = require('../utils/authUtils');
const { logger } = require('../utils/logger');

const DEFAULT_FILE_PERMISSIONS = ['system:files:download'];
const DEFAULT_DOCUMENT_PERMISSIONS = ['system:documents:view'];

// Every business-bound file must resolve through this fixed registry. Scope-backed
// resources reuse the same object-existence policy as their API; shared master data and
// legacy domains still require an existing row plus their normal feature permission.
const FILE_OBJECT_POLICIES = Object.freeze({
  process_template: Object.freeze({
    table: 'process_templates',
    deletedAtColumn: 'deleted_at',
    viewPermissions: ['basedata:processtemplates:view', 'basedata:process-templates:view'],
  }),
  process_template_detail: Object.freeze({
    table: 'process_template_details',
    deletedAtColumn: false,
    viewPermissions: ['basedata:processtemplates:view', 'basedata:process-templates:view'],
  }),
  purchase_requisition: Object.freeze({ scopePolicy: 'purchase_requisition' }),
  purchase_order: Object.freeze({ scopePolicy: 'purchase_order' }),
  purchase_receipt: Object.freeze({ scopePolicy: 'purchase_receipt' }),
  purchase_return: Object.freeze({ scopePolicy: 'purchase_return' }),
  sales_quotation: Object.freeze({ scopePolicy: 'sales_quotation' }),
  sales_order: Object.freeze({ scopePolicy: 'sales_order' }),
  sales_outbound: Object.freeze({ scopePolicy: 'sales_outbound' }),
  sales_return: Object.freeze({ scopePolicy: 'sales_return' }),
  sales_exchange: Object.freeze({ scopePolicy: 'sales_exchange' }),
  inventory_inbound: Object.freeze({ scopePolicy: 'inventory_inbound' }),
  inventory_outbound: Object.freeze({ scopePolicy: 'inventory_outbound' }),
  inventory_transfer: Object.freeze({ scopePolicy: 'inventory_transfer' }),
  inventory_check: Object.freeze({ scopePolicy: 'inventory_check' }),
  production_plan: Object.freeze({ scopePolicy: 'production_plan' }),
  production_task: Object.freeze({ scopePolicy: 'production_task' }),
  quality_inspection: Object.freeze({ scopePolicy: 'quality_inspection' }),
  contract: Object.freeze({ scopePolicy: 'contract' }),
  expense: Object.freeze({ scopePolicy: 'expense' }),
  ar_invoice: Object.freeze({ scopePolicy: 'ar_invoice' }),
  ap_invoice: Object.freeze({ scopePolicy: 'ap_invoice' }),
  ar_receipt: Object.freeze({ scopePolicy: 'ar_receipt' }),
  ap_payment: Object.freeze({ scopePolicy: 'ap_payment' }),
  finance_voucher: Object.freeze({ scopePolicy: 'gl_entry' }),
  bank_transaction: Object.freeze({ scopePolicy: 'bank_transaction' }),
  cash_transaction: Object.freeze({ scopePolicy: 'cash_transaction' }),
  ecn: Object.freeze({ scopePolicy: 'ecn' }),

  material: Object.freeze({ table: 'materials', deletedAtColumn: 'deleted_at' }),
  bom: Object.freeze({ table: 'bom_masters', deletedAtColumn: 'deleted_at' }),
  nonconforming_product: Object.freeze({
    table: 'nonconforming_products',
    deletedAtColumn: 'deleted_at',
  }),
  eight_d_report: Object.freeze({ table: 'eight_d_reports', deletedAtColumn: 'deleted_at' }),
  rework_task: Object.freeze({ table: 'rework_tasks', deletedAtColumn: false }),
  scrap_record: Object.freeze({ table: 'scrap_records', deletedAtColumn: false }),
  replacement_order: Object.freeze({ table: 'replacement_orders', deletedAtColumn: false }),
  asset: Object.freeze({ table: 'fixed_assets', deletedAtColumn: false }),
  cip_project: Object.freeze({ table: 'cip_projects', deletedAtColumn: false }),
  asset_transfer: Object.freeze({ table: 'asset_transfers', deletedAtColumn: false }),
  asset_depreciation: Object.freeze({ table: 'asset_depreciation', deletedAtColumn: false }),
  // Asset disposal links use the disposed asset id as their business id.
  asset_disposal: Object.freeze({ table: 'fixed_assets', deletedAtColumn: false }),
  asset_impairment: Object.freeze({ table: 'asset_impairments', deletedAtColumn: false }),
  tax_invoice: Object.freeze({ table: 'tax_invoices', deletedAtColumn: false }),
  tax_return: Object.freeze({ table: 'tax_returns', deletedAtColumn: false }),
  bank_transfer: Object.freeze({ table: 'bank_transactions', deletedAtColumn: false }),
  outsourced_processing: Object.freeze({ table: 'outsourced_processings', deletedAtColumn: false }),
  outsourced_receipt: Object.freeze({
    table: 'outsourced_processing_receipts',
    deletedAtColumn: false,
  }),
});

function normalizeUploadUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  let raw = value.trim().split('?')[0].split('#')[0].replace(/\\/g, '/');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return '';
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      const allowedOrigins = String(process.env.FILE_URL_ALLOWLIST || '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean);
      if (!allowedOrigins.includes(url.origin)) return '';
      raw = url.pathname;
    } catch {
      return '';
    }
  }

  if (!raw.startsWith('/')) raw = `/${raw}`;
  raw = raw.replace(/\/+/g, '/');
  if (!raw.startsWith('/uploads/') || raw.split('/').includes('..') || raw.includes('\0')) {
    return '';
  }
  return raw;
}

function parseNullableId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeBusinessType(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase();
  return /^[a-z][a-z0-9_]{0,49}$/.test(normalized) ? normalized : '';
}

function validateBusinessBinding(businessType, businessId) {
  const typeProvided = businessType !== undefined && businessType !== null && businessType !== '';
  const idProvided = businessId !== undefined && businessId !== null && businessId !== '';

  if (!typeProvided && !idProvided) {
    return { valid: true, bound: false, businessType: null, businessId: null };
  }
  if (!typeProvided || !idProvided) {
    return { valid: false, bound: false, reason: 'BUSINESS_BINDING_INCOMPLETE' };
  }

  const normalizedType = normalizeBusinessType(businessType);
  const normalizedId = parseNullableId(businessId);
  if (!normalizedType || !normalizedId) {
    return { valid: false, bound: false, reason: 'BUSINESS_BINDING_INVALID' };
  }
  if (!FILE_OBJECT_POLICIES[normalizedType]) {
    return { valid: false, bound: false, reason: 'BUSINESS_TYPE_UNSUPPORTED' };
  }

  return {
    valid: true,
    bound: true,
    businessType: normalizedType,
    businessId: normalizedId,
  };
}

function viewPermissionsForBusinessType(businessType) {
  const normalizedType = normalizeBusinessType(businessType);
  const descriptor = normalizedType ? FILE_OBJECT_POLICIES[normalizedType] : null;
  if (!descriptor) return [];
  const policyPermissions = descriptor.viewPermissions || [];
  return policyPermissions.length
    ? policyPermissions
    : DocumentLinkService.getViewPermissionsForType(normalizedType);
}

function requiredPermissionsForRecord(record) {
  if (record.business_type) return viewPermissionsForBusinessType(record.business_type);
  if (record.source === 'documents') return DEFAULT_DOCUMENT_PERMISSIONS;
  return DEFAULT_FILE_PERMISSIONS;
}

function hasFileManagementPermission(userPermissions = []) {
  return PermissionUtils.hasAnyPermission(userPermissions, [
    '*',
    'system:files:manage',
    'system:admin',
  ]);
}

function normalizePublicFlag(value, userPermissions = []) {
  if (!hasFileManagementPermission(userPermissions)) return 0;
  return value === true || value === 1 || value === '1' || value === 'true' ? 1 : 0;
}

function getLocalFilePath(fileUrl) {
  const normalized = normalizeUploadUrl(fileUrl);
  if (!normalized) return null;
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const relativePath = normalized.slice('/uploads/'.length);
  if (!relativePath || path.isAbsolute(relativePath)) return null;
  const target = path.resolve(uploadsRoot, relativePath);
  if (!target.startsWith(`${uploadsRoot}${path.sep}`)) return null;
  return { normalized, target, uploadsRoot };
}

function removeLocalFile(fileUrl) {
  const resolved = getLocalFilePath(fileUrl);
  if (!resolved) return false;
  try {
    if (!fs.existsSync(resolved.target)) return false;
    fs.unlinkSync(resolved.target);
    return true;
  } catch (error) {
    logger.error('[FileAccessService] failed to remove orphaned upload', {
      fileUrl: resolved.normalized,
      error: error.message,
    });
    return false;
  }
}

function normalizeRecordPayload(payload) {
  const normalizedUrl = normalizeUploadUrl(payload?.fileUrl);
  if (!normalizedUrl) {
    const error = new Error('文件必须引用受控的 /uploads 路径或已允许的 HTTPS 地址');
    error.code = 'INVALID_FILE_REFERENCE';
    throw error;
  }

  const binding = validateBusinessBinding(payload?.businessType, payload?.businessId);
  if (!binding.valid) {
    const error = new Error('业务类型和业务 ID 必须成对提供，且业务类型必须受支持');
    error.code = binding.reason;
    throw error;
  }

  let metadataJson = null;
  if (payload?.metadata !== undefined && payload?.metadata !== null) {
    metadataJson = JSON.stringify(payload.metadata);
    if (Buffer.byteLength(metadataJson, 'utf8') > 64 * 1024) {
      const error = new Error('文件元数据过大');
      error.code = 'FILE_METADATA_TOO_LARGE';
      throw error;
    }
  }

  return {
    fileUrl: normalizedUrl,
    businessType: binding.businessType,
    businessId: binding.businessId,
    source: String(payload?.source || 'upload').trim().slice(0, 50) || 'upload',
    uploadedBy: parseNullableId(payload?.uploadedBy),
    isPublic: Number(payload?.isPublic) === 1 ? 1 : 0,
    metadataJson,
  };
}

function sameNullableId(left, right) {
  if (left === null || left === undefined) return right === null || right === undefined;
  return Number(left) === Number(right);
}

async function writeAccessRecord(connection, payload, options = {}) {
  const normalized = normalizeRecordPayload(payload);
  const [rows] = await connection.execute(
    `SELECT id, business_type, business_id, source, uploaded_by, deleted_at
       FROM file_access_records
      WHERE file_url = ?
      LIMIT 1
      FOR UPDATE`,
    [normalized.fileUrl]
  );
  const existing = rows[0];

  if (!existing) {
    if (options.requireExisting) {
      const error = new Error('文件访问元数据不存在，请先通过受控上传接口上传文件');
      error.code = 'FILE_ACCESS_RECORD_NOT_FOUND';
      throw error;
    }
    await connection.execute(
      `INSERT INTO file_access_records
         (file_url, business_type, business_id, source, uploaded_by, is_public, metadata,
          deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())`,
      [
        normalized.fileUrl,
        normalized.businessType,
        normalized.businessId,
        normalized.source,
        normalized.uploadedBy,
        normalized.isPublic,
        normalized.metadataJson,
      ]
    );
    return normalized.fileUrl;
  }

  const sameBinding =
    (existing.business_type || null) === normalized.businessType &&
    sameNullableId(existing.business_id, normalized.businessId);
  const sameUploader =
    normalized.uploadedBy !== null && Number(existing.uploaded_by) === normalized.uploadedBy;
  const existingUnbound = !existing.business_type && !existing.business_id;

  if (!sameBinding) {
    const mayClaim =
      options.allowClaim === true &&
      existingUnbound &&
      (sameUploader || options.canManage === true);
    if (!mayClaim) {
      const error = new Error('文件已绑定到其他业务对象，禁止覆盖文件授权元数据');
      error.code = 'FILE_ACCESS_BINDING_CONFLICT';
      throw error;
    }
  } else if (!sameUploader && options.canManage !== true) {
    const error = new Error('无权修改其他用户上传文件的授权元数据');
    error.code = 'FILE_ACCESS_OWNER_MISMATCH';
    throw error;
  }

  await connection.execute(
    `UPDATE file_access_records
        SET business_type = ?, business_id = ?, source = ?, is_public = ?, metadata = ?,
            deleted_at = NULL, updated_at = NOW()
      WHERE id = ?`,
    [
      normalized.businessType,
      normalized.businessId,
      normalized.source,
      normalized.isPublic,
      normalized.metadataJson,
      existing.id,
    ]
  );
  return normalized.fileUrl;
}

class FileAccessService {
  static normalizeUploadUrl(value) {
    return normalizeUploadUrl(value);
  }

  static validateBusinessBinding(businessType, businessId) {
    return validateBusinessBinding(businessType, businessId);
  }

  static normalizePublicFlag(value, userPermissions) {
    return normalizePublicFlag(value, userPermissions);
  }

  static canSetPublic(userPermissions) {
    return hasFileManagementPermission(userPermissions);
  }

  static getViewPermissionsForBusinessType(businessType) {
    return [...viewPermissionsForBusinessType(businessType)];
  }

  static canViewBusinessType(businessType, userPermissions = []) {
    const requiredPermissions = viewPermissionsForBusinessType(businessType);
    return requiredPermissions.length > 0 &&
      PermissionUtils.hasAnyPermission(userPermissions, requiredPermissions);
  }

  static removeLocalFile(fileUrl) {
    return removeLocalFile(fileUrl);
  }

  static removeLocalFiles(fileUrls = []) {
    for (const fileUrl of fileUrls) removeLocalFile(fileUrl);
  }

  static async assertBusinessObjectExists(businessType, businessId) {
    const binding = validateBusinessBinding(businessType, businessId);
    if (!binding.valid) return false;
    if (!binding.bound) return true;

    const descriptor = FILE_OBJECT_POLICIES[binding.businessType];
    if (!descriptor) return false;
    const policy = descriptor.scopePolicy ? ScopeGuard.getPolicy(descriptor.scopePolicy) : descriptor;
    return DataScopeService.assertRecordExists(pool, policy.table, binding.businessId, {
      idColumn: policy.idColumn || 'id',
      deletedAtColumn:
        policy.deletedAtColumn === false ? false : (policy.deletedAtColumn || 'deleted_at'),
      extraSoftDelete: policy.extraSoftDelete || null,
    });
  }

  static async assertBusinessObjectAccess(req, businessType, businessId, accessMode = 'write') {
    const binding = validateBusinessBinding(businessType, businessId);
    if (!binding.valid) return false;
    if (!binding.bound) return true;

    const descriptor = FILE_OBJECT_POLICIES[binding.businessType];
    if (!descriptor) return false;
    if (descriptor.scopePolicy) {
      // Private attachments intentionally remain at least as restrictive as
      // the bound object's existence check.
      return ScopeGuard.assertAccess(pool, req, descriptor.scopePolicy, binding.businessId, {
        accessMode: accessMode === 'read' ? undefined : 'write',
      });
    }

    const quote = (identifier) => `\`${String(identifier).replace(/`/g, '``')}\``;
    const idColumn = descriptor.idColumn || 'id';
    let sql = `SELECT ${quote(idColumn)} AS id FROM ${quote(descriptor.table)} WHERE ${quote(idColumn)} = ?`;
    if (descriptor.deletedAtColumn !== false) {
      sql += ` AND ${quote(descriptor.deletedAtColumn || 'deleted_at')} IS NULL`;
    }
    sql += ' LIMIT 1';
    const [rows] = await pool.execute(sql, [binding.businessId]);
    return rows.length === 1;
  }

  static async recordUpload(payload) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await writeAccessRecord(connection, payload);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async recordUploads(payloads) {
    if (!Array.isArray(payloads) || payloads.length === 0) {
      const error = new Error('没有可登记的上传文件');
      error.code = 'EMPTY_UPLOAD_BATCH';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const urls = [];
      for (const payload of payloads) {
        urls.push(await writeAccessRecord(connection, payload));
      }
      await connection.commit();
      return urls;
    } catch (error) {
      await connection.rollback();
      this.removeLocalFiles(payloads.map((payload) => payload?.fileUrl));
      throw error;
    } finally {
      connection.release();
    }
  }

  static async claimExistingUpload({ req, userPermissions, ...payload }) {
    const binding = validateBusinessBinding(payload.businessType, payload.businessId);
    if (!binding.valid) {
      const error = new Error('业务类型和业务 ID 必须成对提供，且业务类型必须受支持');
      error.code = binding.reason;
      throw error;
    }
    if (binding.bound) {
      let permissions = Array.isArray(userPermissions) ? userPermissions : req?.userPermissions;
      if (!Array.isArray(permissions)) {
        const userId = req?.user?.id || req?.user?.userId || payload.uploadedBy;
        permissions = userId ? await PermissionService.getUserPermissions(userId) : [];
      }
      if (!this.canViewBusinessType(binding.businessType, permissions)) {
        const error = new Error('无权使用该业务类型的文件绑定功能');
        error.code = 'BUSINESS_TYPE_PERMISSION_DENIED';
        throw error;
      }
      if (!(await this.assertBusinessObjectAccess(
        req,
        binding.businessType,
        binding.businessId,
        'write'
      ))) {
        const error = new Error('无权关联该业务对象');
        error.code = 'BUSINESS_OBJECT_ACCESS_DENIED';
        throw error;
      }
    }

    const resolved = getLocalFilePath(payload.fileUrl);
    if (!resolved || !fs.existsSync(resolved.target)) {
      const error = new Error('待关联的上传文件不存在');
      error.code = 'UPLOAD_FILE_NOT_FOUND';
      throw error;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await writeAccessRecord(
        connection,
        {
          ...payload,
          businessType: binding.businessType,
          businessId: binding.businessId,
        },
        {
          requireExisting: true,
          allowClaim: true,
          canManage: hasFileManagementPermission(userPermissions),
        }
      );
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Bind a previously uploaded, unbound file to a newly-created business row
   * inside the caller's transaction.  The owner check prevents a user from
   * claiming another user's temporary upload by guessing its URL.
   */
  static async bindExistingUploadInTransaction(connection, { userId, fileUrl, businessType, businessId }) {
    const binding = validateBusinessBinding(businessType, businessId);
    if (!binding.valid || !binding.bound) {
      const error = new Error('业务附件绑定参数无效');
      error.code = 'BUSINESS_BINDING_INVALID';
      throw error;
    }
    const normalizedUrl = normalizeUploadUrl(fileUrl);
    if (!normalizedUrl) {
      const error = new Error('文件路径无效');
      error.code = 'INVALID_FILE_REFERENCE';
      throw error;
    }
    const [rows] = await connection.execute(
      `SELECT id, business_type, business_id, uploaded_by, deleted_at
         FROM file_access_records
        WHERE file_url = ?
        LIMIT 1
        FOR UPDATE`,
      [normalizedUrl]
    );
    const record = rows[0];
    if (!record || record.deleted_at) {
      const error = new Error('文件访问元数据不存在');
      error.code = 'FILE_ACCESS_RECORD_NOT_FOUND';
      throw error;
    }
    if (record.business_type || record.business_id) {
      if (
        record.business_type !== binding.businessType ||
        Number(record.business_id) !== binding.businessId
      ) {
        const error = new Error('文件已绑定到其他业务对象');
        error.code = 'FILE_ACCESS_BINDING_CONFLICT';
        throw error;
      }
      return normalizedUrl;
    }
    if (Number(record.uploaded_by) !== Number(userId)) {
      const error = new Error('只能绑定自己上传的临时文件');
      error.code = 'FILE_OWNER_MISMATCH';
      throw error;
    }
    await connection.execute(
      `UPDATE file_access_records
          SET business_type = ?, business_id = ?, updated_at = NOW()
        WHERE id = ?`,
      [binding.businessType, binding.businessId, record.id]
    );
    return normalizedUrl;
  }

  static async markDeleted(fileUrl) {
    const normalizedUrl = normalizeUploadUrl(fileUrl);
    if (!normalizedUrl) return false;
    const [result] = await pool.execute(
      `UPDATE file_access_records
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE file_url = ? AND deleted_at IS NULL`,
      [normalizedUrl]
    );
    return result.affectedRows > 0;
  }

  static async setPublicFlag(fileUrl, isPublic) {
    const normalizedUrl = normalizeUploadUrl(fileUrl);
    if (!normalizedUrl) return false;
    const [result] = await pool.execute(
      `UPDATE file_access_records
          SET is_public = ?, updated_at = NOW()
        WHERE file_url = ? AND deleted_at IS NULL`,
      [Number(isPublic) === 1 ? 1 : 0, normalizedUrl]
    );
    return result.affectedRows > 0;
  }

  static async findAccessRecord(fileUrl) {
    const normalizedUrl = normalizeUploadUrl(fileUrl);
    if (!normalizedUrl) return null;

    const [[record]] = await pool.query(
      `SELECT file_url, business_type, business_id, source, is_public, uploaded_by,
              NULL AS department_id
         FROM file_access_records
        WHERE file_url = ? AND deleted_at IS NULL
        LIMIT 1`,
      [normalizedUrl]
    );
    if (record) return record;

    const [[documentRecord]] = await pool.query(
      `SELECT file_url, business_type, business_id, 'documents' AS source, is_public,
              created_by AS uploaded_by, department_id
         FROM documents
        WHERE file_url = ? AND deleted_at IS NULL
        LIMIT 1`,
      [normalizedUrl]
    );
    if (documentRecord) return documentRecord;

    const [[materialRecord]] = await pool.query(
      `SELECT file_path AS file_url, 'material' AS business_type, material_id AS business_id,
              'material_attachments' AS source, 0 AS is_public, uploader_id AS uploaded_by,
              NULL AS department_id
         FROM material_attachments
        WHERE file_path = ?
        LIMIT 1`,
      [normalizedUrl]
    );
    return materialRecord || null;
  }

  static async authorize({ userId, fileUrl, req, userPermissions }) {
    const record = await this.findAccessRecord(fileUrl);
    if (!record) {
      return { known: false, allowed: false, requiredPermissions: DEFAULT_FILE_PERMISSIONS };
    }

    const binding = validateBusinessBinding(record.business_type, record.business_id);
    if (!binding.valid) {
      return {
        known: true,
        allowed: false,
        record,
        requiredPermissions: [],
        reason: binding.reason,
      };
    }

    if (
      binding.bound &&
      !(await this.assertBusinessObjectExists(binding.businessType, binding.businessId))
    ) {
      return {
        known: true,
        allowed: false,
        record,
        requiredPermissions: [],
        reason: 'BUSINESS_OBJECT_NOT_FOUND',
      };
    }

    const requiredPermissions = requiredPermissionsForRecord(record);
    const permissions = Array.isArray(userPermissions)
      ? userPermissions
      : await PermissionService.getUserPermissions(userId);
    if (
      requiredPermissions.length === 0 ||
      !PermissionUtils.hasAnyPermission(permissions, requiredPermissions)
    ) {
      return {
        known: true,
        allowed: false,
        record,
        requiredPermissions,
        reason: 'FEATURE_PERMISSION_DENIED',
      };
    }

    // Public is only a cross-department/object-scope read flag. The business
    // feature permission above is mandatory for every business-bound file.
    if (Number(record.is_public) === 1) {
      return { known: true, allowed: true, record, requiredPermissions };
    }

    if (binding.bound && !req) {
      return {
        known: true,
        allowed: false,
        record,
        requiredPermissions: [],
        reason: 'REQUEST_CONTEXT_REQUIRED',
      };
    }

    if (binding.bound) {
      let inScope = false;
      try {
        inScope = await this.assertBusinessObjectAccess(
          req,
          binding.businessType,
          binding.businessId,
          'read'
        );
      } catch (error) {
        logger.error('[FileAccessService] object scope check failed', {
          businessType: binding.businessType,
          businessId: binding.businessId,
          error: error.message,
        });
      }
      if (!inScope) {
        return {
          known: true,
          allowed: false,
          record,
          requiredPermissions: [],
          reason: 'OBJECT_SCOPE_DENIED',
        };
      }
    }

    return { known: true, allowed: true, record, requiredPermissions };
  }

  static async authorizeMutation({ userId, fileUrl, req, userPermissions }) {
    const record = await this.findAccessRecord(fileUrl);
    if (!record) return { known: false, allowed: false, reason: 'FILE_NOT_TRACKED' };

    const binding = validateBusinessBinding(record.business_type, record.business_id);
    if (!binding.valid) {
      return { known: true, allowed: false, record, reason: binding.reason };
    }

    const permissions = Array.isArray(userPermissions)
      ? userPermissions
      : await PermissionService.getUserPermissions(userId);
    if (!binding.bound) {
      const isOwner = userId && Number(record.uploaded_by) === Number(userId);
      return {
        known: true,
        allowed: Boolean(isOwner || hasFileManagementPermission(permissions)),
        record,
        reason: isOwner || hasFileManagementPermission(permissions) ? null : 'FILE_OWNER_DENIED',
      };
    }

    const requiredPermissions = viewPermissionsForBusinessType(binding.businessType);
    if (
      requiredPermissions.length === 0 ||
      !PermissionUtils.hasAnyPermission(permissions, requiredPermissions)
    ) {
      return {
        known: true,
        allowed: false,
        record,
        requiredPermissions,
        reason: 'FEATURE_PERMISSION_DENIED',
      };
    }

    let allowed = false;
    try {
      allowed = await this.assertBusinessObjectAccess(
        req,
        binding.businessType,
        binding.businessId,
        'write'
      );
    } catch (error) {
      logger.error('[FileAccessService] object mutation scope check failed', {
        businessType: binding.businessType,
        businessId: binding.businessId,
        error: error.message,
      });
    }
    return {
      known: true,
      allowed,
      record,
      requiredPermissions,
      reason: allowed ? null : 'OBJECT_SCOPE_DENIED',
    };
  }

  static async deleteTrackedLocalFile({ userId, fileUrl, req, userPermissions }) {
    const decision = await this.authorizeMutation({ userId, fileUrl, req, userPermissions });
    if (!decision.allowed) return decision;

    // Business modules own their references and lifecycle. Deleting a bound
    // file here would leave a dangling document/material/BOM reference.
    if (decision.record.business_id) {
      return {
        ...decision,
        allowed: false,
        reason: 'BUSINESS_FILE_REQUIRES_OWNER_ENDPOINT',
      };
    }

    const resolved = getLocalFilePath(fileUrl);
    if (!resolved) return { ...decision, allowed: false, reason: 'INVALID_FILE_REFERENCE' };

    const quarantinePath = `${resolved.target}.deleting-${crypto.randomBytes(8).toString('hex')}`;
    try {
      const stat = await fs.promises.lstat(resolved.target);
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        return { ...decision, allowed: false, reason: 'NOT_A_FILE' };
      }
      await fs.promises.rename(resolved.target, quarantinePath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { ...decision, allowed: false, reason: 'FILE_NOT_FOUND' };
      }
      throw error;
    }

    try {
      const marked = await this.markDeleted(resolved.normalized);
      if (!marked) {
        const error = new Error('文件访问元数据已不存在或已删除');
        error.code = 'FILE_ACCESS_RECORD_NOT_FOUND';
        throw error;
      }
    } catch (error) {
      try {
        await fs.promises.rename(quarantinePath, resolved.target);
      } catch (restoreError) {
        logger.error('[FileAccessService] failed to restore quarantined file', {
          fileUrl: resolved.normalized,
          error: restoreError.message,
        });
      }
      throw error;
    }

    try {
      await fs.promises.unlink(quarantinePath);
    } catch (error) {
      logger.error('[FileAccessService] metadata deleted but quarantine cleanup failed', {
        fileUrl: resolved.normalized,
        error: error.message,
      });
    }
    return { ...decision, deleted: true };
  }

  static async safeRecordUpload(payload) {
    try {
      return await this.recordUpload(payload);
    } catch (error) {
      removeLocalFile(payload?.fileUrl);
      logger.error('[FileAccessService] failed to record file access metadata', {
        fileUrl: normalizeUploadUrl(payload?.fileUrl),
        error: error.message,
      });
      throw error;
    }
  }

  static async safeMarkDeleted(fileUrl) {
    try {
      return await this.markDeleted(fileUrl);
    } catch (error) {
      logger.error('[FileAccessService] failed to mark file access record deleted', {
        fileUrl: normalizeUploadUrl(fileUrl),
        error: error.message,
      });
      throw error;
    }
  }
}

module.exports = FileAccessService;
