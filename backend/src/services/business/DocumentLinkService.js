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
   * 创建单据关联
   */
  async createLink({ source_type, source_id, source_code, target_type, target_id, target_code, link_type = 'generate', remark, created_by }, conn = null) {
    if (!ALLOWED_LINK_TYPES.has(link_type)) {
      throw new Error(`不支持的单据关联类型: ${link_type}`);
    }
    if (!isKnownDocumentLinkType(source_type) || !isKnownDocumentLinkType(target_type)) {
      throw new Error(
        `未知单据类型: source=${source_type}, target=${target_type}（须使用 documentLinkTypes SSOT）`
      );
    }

    const db = conn || pool;
    await db.query(
      `INSERT IGNORE INTO document_links (source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [source_type, source_id, source_code || null, target_type, target_id, target_code || null, link_type, remark || null, created_by || null]
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
    // 正向关联（本单据作为源）
    const [forward] = await pool.query(
      `SELECT id, source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by, created_at, 'forward' AS direction FROM document_links
       WHERE source_type = ? AND source_id = ?
       ORDER BY created_at DESC`,
      [businessType, businessId]
    );

    // 反向关联（本单据作为目标）
    const [backward] = await pool.query(
      `SELECT id, source_type, source_id, source_code, target_type, target_id, target_code, link_type, remark, created_by, created_at, 'backward' AS direction FROM document_links
       WHERE target_type = ? AND target_id = ?
       ORDER BY created_at DESC`,
      [businessType, businessId]
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

    return this.filterLinksByPermissions(links, options.userPermissions);
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
  async deleteLink(id) {
    await pool.query('DELETE FROM document_links WHERE id = ?', [id]);
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
