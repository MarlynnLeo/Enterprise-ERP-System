/**
 * DocumentLinkService.js
 * @description 单据关联追溯服务 — 正向/反向穿透查询与幂等写入
 * 类型/文案/权限 SSOT：constants/documentLinkTypes.js
 */

const { pool } = require('../../config/db');
const { PermissionUtils } = require('../../utils/authUtils');
const {
  DOCUMENT_LINK_TYPE_LABELS: TYPE_LABELS,
  DOCUMENT_LINK_TYPE_PERMISSIONS,
  isKnownDocumentLinkType,
} = require('../../constants/documentLinkTypes');

const ALLOWED_LINK_TYPES = new Set(['generate', 'reference', 'related']);

function normalizeBusinessId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

class DocumentLinkService {
  getViewPermissionsForType(businessType) {
    return DOCUMENT_LINK_TYPE_PERMISSIONS[String(businessType || '').trim()] || [];
  }

  canViewBusinessType(businessType, userPermissions) {
    const permissions = this.getViewPermissionsForType(businessType);
    return permissions.length > 0 && PermissionUtils.hasAnyPermission(userPermissions, permissions);
  }

  filterLinksByPermissions(links, userPermissions) {
    if (!Array.isArray(userPermissions) || userPermissions.includes('*')) {
      return links;
    }
    return links.filter((link) => this.canViewBusinessType(link.related_type, userPermissions));
  }

  /**
   * Document links are an object-level read/write surface of their own.  A
   * feature permission only says that a user may use the link UI; it does not
   * authorize either endpoint of a link.  Delegate the endpoint decision to
   * the same file/business-object registry used by attachment access.  The
   * lazy require avoids the intentional service dependency cycle at module
   * initialization time.
   */
  async assertBusinessObjectAccess(req, businessType, businessId, accessMode = 'read') {
    if (!req) return true; // internal, already-authorized workflow services
    if (!isKnownDocumentLinkType(businessType)) return false;
    const id = normalizeBusinessId(businessId);
    if (!id) return false;
    const FileAccessService = require('../FileAccessService');
    return FileAccessService.assertBusinessObjectAccess(req, businessType, id, accessMode);
  }

  /**
   * A document-link route permission (system:documents:*) only authorizes
   * using the linking feature.  Each endpoint must also be visible to the
   * caller under its own business permission and object scope.  Keep this
   * check in the service so internal callers cannot accidentally bypass the
   * route-level guard by calling create/delete/getLinks directly.
   */
  async assertLinkEndpointAccess(
    req,
    businessType,
    businessId,
    accessMode = 'read',
    userPermissionsOverride = null
  ) {
    if (!req) return true;
    const requiredPermissions = this.getViewPermissionsForType(businessType);
    if (!requiredPermissions.length) return false;

    let userPermissions = userPermissionsOverride;
    if (!Array.isArray(userPermissions)) {
      userPermissions = req.userPermissions || req.documentLinkUserPermissions;
    }
    if (!Array.isArray(userPermissions)) {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) return false;
      // Lazy require avoids the existing PermissionService ↔ business service
      // initialization cycle.  A lookup failure is allowed to propagate so
      // callers return a server error rather than silently granting access.
      const PermissionService = require('../PermissionService');
      userPermissions = await PermissionService.getUserPermissions(userId);
    }
    if (!this.canViewBusinessType(businessType, userPermissions)) return false;

    return this.assertBusinessObjectAccess(req, businessType, businessId, accessMode);
  }

  /**
   * 创建单据关联
   */
  async createLink({ source_type, source_id, source_code, target_type, target_id, target_code, link_type = 'generate', remark, created_by }, conn = null, options = {}) {
    if (!ALLOWED_LINK_TYPES.has(link_type)) {
      throw new Error(`不支持的单据关联类型: ${link_type}`);
    }
    if (!isKnownDocumentLinkType(source_type) || !isKnownDocumentLinkType(target_type)) {
      throw new Error(
        `未知单据类型: source=${source_type}, target=${target_type}（须使用 documentLinkTypes SSOT）`
      );
    }

    const normalizedSourceId = normalizeBusinessId(source_id);
    const normalizedTargetId = normalizeBusinessId(target_id);
    if (!normalizedSourceId || !normalizedTargetId) {
      throw Object.assign(new Error('单据关联的源/目标 ID 无效'), { code: 'INVALID_DOCUMENT_LINK_ID', statusCode: 400 });
    }
    if (options.req) {
      if (!(await this.assertLinkEndpointAccess(options.req, source_type, normalizedSourceId, 'write')) ||
          !(await this.assertLinkEndpointAccess(options.req, target_type, normalizedTargetId, 'write'))) {
        throw Object.assign(new Error('无权关联该源或目标单据'), { code: 'DOCUMENT_LINK_ACCESS_DENIED', statusCode: 403 });
      }
    }

    const db = conn || pool;
    await db.query(
      `INSERT IGNORE INTO document_links (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [source_type, normalizedSourceId, source_code || null, target_type, normalizedTargetId, target_code || null, link_type, remark || null,
        options.req?.user?.id || options.req?.user?.userId || created_by || null]
    );
  }

  /**
   * 批量创建关联
   */
  async createLinks(links, conn = null) {
    for (const link of links) {
      await this.createLink(link, conn);
    }
  }

  /**
   * 获取某单据的所有关联（正向+反向）
   */
  async getLinks(businessType, businessId, options = {}) {
    const normalizedBusinessId = normalizeBusinessId(businessId);
    if (!isKnownDocumentLinkType(businessType) || !normalizedBusinessId) {
      throw Object.assign(new Error('无效的单据类型或 ID'), { code: 'INVALID_DOCUMENT_LINK_QUERY', statusCode: 400 });
    }
    if (options.req && !(await this.assertLinkEndpointAccess(options.req, businessType, normalizedBusinessId, 'read'))) {
      throw Object.assign(new Error('无权查看该单据关联'), { code: 'DOCUMENT_LINK_ACCESS_DENIED', statusCode: 403 });
    }
    // 正向关联（本单据作为源）
    const [forward] = await pool.query(
      `SELECT id, source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by, created_at, 'forward' AS direction FROM document_links
       WHERE source_type = ? AND source_id = ?
       ORDER BY created_at DESC`,
      [businessType, normalizedBusinessId]
    );

    // 反向关联（本单据作为目标）
    const [backward] = await pool.query(
      `SELECT id, source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by, created_at, 'backward' AS direction FROM document_links
       WHERE target_type = ? AND target_id = ?
       ORDER BY created_at DESC`,
      [businessType, normalizedBusinessId]
    );

    // 转换为统一格式
    const links = [];

    for (const f of forward) {
      links.push({
        id: f.id,
        direction: 'forward',
        link_type: f.link_type,
        related_type: f.target_type,
        related_type_label: TYPE_LABELS[f.target_type] || f.target_type,
        related_id: f.target_id,
        related_code: f.target_code,
        remark: f.remark,
        created_at: f.created_at,
      });
    }

    for (const b of backward) {
      links.push({
        id: b.id,
        direction: 'backward',
        link_type: b.link_type,
        related_type: b.source_type,
        related_type_label: TYPE_LABELS[b.source_type] || b.source_type,
        related_id: b.source_id,
        related_code: b.source_code,
        remark: b.remark,
        created_at: b.created_at,
      });
    }

    const permissionFiltered = this.filterLinksByPermissions(links, options.userPermissions);
    if (!options.req) return permissionFiltered;

    const visible = [];
    for (const link of permissionFiltered) {
      if (await this.assertLinkEndpointAccess(
        options.req,
        link.related_type,
        link.related_id,
        'read',
        options.userPermissions
      )) {
        visible.push(link);
      }
    }
    return visible;
  }

  /**
   * 获取完整单据链（递归追溯）
   */
  async getFullChain(businessType, businessId, optionsOrVisited = {}, maybeVisited = new Set()) {
    const options = optionsOrVisited instanceof Set ? {} : optionsOrVisited;
    const visited = optionsOrVisited instanceof Set ? optionsOrVisited : maybeVisited;

    if (Array.isArray(options.userPermissions) && !this.canViewBusinessType(businessType, options.userPermissions)) {
      return [];
    }

    const key = `${businessType}:${businessId}`;
    if (visited.has(key)) return [];
    visited.add(key);

    const links = await this.getLinks(businessType, businessId, options);
    const chain = [{ type: businessType, type_label: TYPE_LABELS[businessType] || businessType, id: businessId, links }];

    // 递归（限深度防循环）
    if (visited.size < 20) {
      for (const link of links) {
        const subChain = await this.getFullChain(link.related_type, link.related_id, options, visited);
        chain.push(...subChain);
      }
    }

    return chain;
  }

  /**
   * 删除关联
   */
  async deleteLink(id, options = {}) {
    const normalizedId = normalizeBusinessId(id);
    if (!normalizedId) {
      throw Object.assign(new Error('关联 ID 无效'), { code: 'INVALID_DOCUMENT_LINK_ID', statusCode: 400 });
    }
    if (options.req) {
      const [[link]] = await pool.query(
        `SELECT source_type, source_id, target_type, target_id
           FROM document_links
          WHERE id = ?
          LIMIT 1`,
        [normalizedId]
      );
      if (!link) {
        throw Object.assign(new Error('单据关联不存在'), { code: 'DOCUMENT_LINK_NOT_FOUND', statusCode: 404 });
      }
      if (!(await this.assertLinkEndpointAccess(options.req, link.source_type, link.source_id, 'write')) ||
          !(await this.assertLinkEndpointAccess(options.req, link.target_type, link.target_id, 'write'))) {
        throw Object.assign(new Error('无权删除该单据关联'), { code: 'DOCUMENT_LINK_ACCESS_DENIED', statusCode: 403 });
      }
    }
    const [result] = await pool.query('DELETE FROM document_links WHERE id = ?', [normalizedId]);
    if (!result.affectedRows && options.req) {
      throw Object.assign(new Error('单据关联不存在'), { code: 'DOCUMENT_LINK_NOT_FOUND', statusCode: 404 });
    }
  }

  /**
   * 按源/目标组合删除关联，用于未入账单据撤销人工关联。
   */
  async deleteLinksByPair({ source_type, source_id, target_type, target_id }, conn = null) {
    const db = conn || pool;
    await db.query(
      `DELETE FROM document_links
       WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?`,
      [source_type, source_id, target_type, target_id]
    );
  }

  /**
   * 便捷方法：在业务逻辑中一行调用，失败时进入死信队列等待补偿。
   * @example await DocumentLinkService.tryAutoLink(DocType.SALES_ORDER, orderId, orderNo, DocType.SALES_OUTBOUND, outboundId, outboundNo, userId, conn);
   */
  async tryAutoLink(srcType, srcId, srcCode, tgtType, tgtId, tgtCode, userId, conn) {
    try {
      await this.createLink({
        source_type: srcType, source_id: srcId, source_code: srcCode,
        target_type: tgtType, target_id: tgtId, target_code: tgtCode,
        link_type: 'generate', created_by: userId,
      }, conn);
    } catch (e) {
      const DLQService = require('./DLQService');
      await DLQService.recordSideEffectFailure(
        'DocumentLink:autoLink',
        { srcType, srcId, srcCode, tgtType, tgtId, tgtCode, userId },
        e
      );
    }
  }

  /**
   * 获取业务类型映射
   */
  getTypeLabels() {
    return TYPE_LABELS;
  }
}

module.exports = new DocumentLinkService();
