const { pool } = require('../config/db');
const PermissionService = require('./PermissionService');
const DocumentLinkService = require('./business/DocumentLinkService');
const { PermissionUtils } = require('../utils/authUtils');
const { logger } = require('../utils/logger');

const DEFAULT_FILE_PERMISSIONS = ['system:files:download'];
const DEFAULT_DOCUMENT_PERMISSIONS = ['system:documents:view'];

function normalizeUploadUrl(value) {
  if (!value) return '';
  let raw = String(value).split('?')[0].split('#')[0].replace(/\\/g, '/');
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return '';
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      return '';
    }
  }

  if (!raw.startsWith('/')) raw = `/${raw}`;
  raw = raw.replace(/\/+/g, '/');
  if (!raw.startsWith('/uploads/')) {
    raw = `/uploads${raw}`;
  }

  return raw;
}

function parseNullableId(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function requiredPermissionsForRecord(record) {
  if (record.source === 'documents' && !record.business_type) {
    return DEFAULT_DOCUMENT_PERMISSIONS;
  }

  const businessPermissions = DocumentLinkService.getViewPermissionsForType(record.business_type);
  if (businessPermissions.length) {
    return businessPermissions;
  }

  return DEFAULT_FILE_PERMISSIONS;
}

class FileAccessService {
  static normalizeUploadUrl(value) {
    return normalizeUploadUrl(value);
  }

  static async recordUpload({
    fileUrl,
    businessType,
    businessId,
    source = 'upload',
    uploadedBy = null,
    isPublic = 0,
    metadata = null,
  }) {
    const normalizedUrl = normalizeUploadUrl(fileUrl);
    if (!normalizedUrl) return null;

    const normalizedBusinessType = businessType ? String(businessType).trim() : null;
    const normalizedBusinessId = parseNullableId(businessId);
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    await pool.query(
      `INSERT INTO file_access_records
         (file_url, business_type, business_id, source, uploaded_by, is_public, metadata, deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         business_type = VALUES(business_type),
         business_id = VALUES(business_id),
         source = VALUES(source),
         uploaded_by = VALUES(uploaded_by),
         is_public = VALUES(is_public),
         metadata = VALUES(metadata),
         deleted_at = NULL,
         updated_at = NOW()`,
      [
        normalizedUrl,
        normalizedBusinessType,
        normalizedBusinessId,
        source,
        uploadedBy || null,
        isPublic ? 1 : 0,
        metadataJson,
      ]
    );

    return normalizedUrl;
  }

  static async markDeleted(fileUrl) {
    const normalizedUrl = normalizeUploadUrl(fileUrl);
    if (!normalizedUrl) return;
    await pool.query(
      'UPDATE file_access_records SET deleted_at = NOW(), updated_at = NOW() WHERE file_url = ?',
      [normalizedUrl]
    );
  }

  static async findAccessRecord(fileUrl) {
    const normalizedUrl = normalizeUploadUrl(fileUrl);
    if (!normalizedUrl) return null;

    const [[record]] = await pool.query(
      `SELECT file_url, business_type, business_id, source, is_public, uploaded_by
       FROM file_access_records
       WHERE file_url = ? AND deleted_at IS NULL
       LIMIT 1`,
      [normalizedUrl]
    );
    if (record) return record;

    const [[documentRecord]] = await pool.query(
      `SELECT file_url, business_type, business_id, 'documents' AS source, is_public, created_by AS uploaded_by
       FROM documents
       WHERE file_url = ? AND deleted_at IS NULL
       LIMIT 1`,
      [normalizedUrl]
    );
    if (documentRecord) return documentRecord;

    const [[materialRecord]] = await pool.query(
      `SELECT file_path AS file_url, 'material' AS business_type, material_id AS business_id,
              'material_attachments' AS source, 0 AS is_public, uploader_id AS uploaded_by
       FROM material_attachments
       WHERE file_path = ?
       LIMIT 1`,
      [normalizedUrl]
    );
    if (materialRecord) return materialRecord;

    return null;
  }

  static async authorize({ userId, fileUrl }) {
    const record = await this.findAccessRecord(fileUrl);
    if (!record) {
      return { known: false, allowed: false, requiredPermissions: DEFAULT_FILE_PERMISSIONS };
    }

    if (Number(record.is_public) === 1) {
      return { known: true, allowed: true, record, requiredPermissions: [] };
    }

    const requiredPermissions = requiredPermissionsForRecord(record);
    const userPermissions = await PermissionService.getUserPermissions(userId);
    const allowed = PermissionUtils.hasAnyPermission(userPermissions, requiredPermissions);

    return { known: true, allowed, record, requiredPermissions };
  }

  static async safeRecordUpload(payload) {
    try {
      return await this.recordUpload(payload);
    } catch (error) {
      logger.warn('[FileAccessService] failed to record file access metadata:', error);
      return null;
    }
  }

  static async safeMarkDeleted(fileUrl) {
    try {
      await this.markDeleted(fileUrl);
    } catch (error) {
      logger.warn('[FileAccessService] failed to mark file access record deleted:', error);
    }
  }
}

module.exports = FileAccessService;
