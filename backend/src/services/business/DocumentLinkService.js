/**
 * DocumentLinkService.js
 * @description 单据关联追溯服务 — 正向/反向穿透查询
 * @date 2026-04-21
 */

const { pool } = require('../../config/db');

// 业务类型中文映射
const TYPE_LABELS = {
  purchase_requisition: '采购请购单',
  purchase_order: '采购订单',
  purchase_receipt: '采购收货单',
  purchase_return: '采购退货单',
  sales_quotation: '销售报价单',
  sales_order: '销售订单',
  sales_outbound: '销售出库单',
  sales_return: '销售退货单',
  sales_exchange: '销售换货单',
  inventory_inbound: '入库单',
  inventory_outbound: '出库单',
  inventory_transfer: '调拨单',
  inventory_check: '盘点单',
  production_plan: '生产计划',
  production_task: '生产任务',
  quality_inspection: '质检单',
  finance_voucher: '记账凭证',
  ap_invoice: '应付发票',
  ar_invoice: '应收发票',
  ap_payment: '付款单',
  ar_receipt: '收款单',
  contract: '合同',
  expense: '费用单',
  ecn: '工程变更',
};

class DocumentLinkService {

  /**
   * 创建单据关联
   */
  async createLink({ source_type, source_id, source_code, target_type, target_id, target_code, link_type = 'generate', remark, created_by }, conn = null) {
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
  async getLinks(businessType, businessId) {
    // 正向关联（本单据作为源）
    const [forward] = await pool.query(
      `SELECT *, 'forward' AS direction FROM document_links
       WHERE source_type = ? AND source_id = ?
       ORDER BY created_at DESC`,
      [businessType, businessId]
    );

    // 反向关联（本单据作为目标）
    const [backward] = await pool.query(
      `SELECT *, 'backward' AS direction FROM document_links
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

    return links;
  }

  /**
   * 获取完整单据链（递归追溯）
   */
  async getFullChain(businessType, businessId, visited = new Set()) {
    const key = `${businessType}:${businessId}`;
    if (visited.has(key)) return [];
    visited.add(key);

    const links = await this.getLinks(businessType, businessId);
    const chain = [{ type: businessType, type_label: TYPE_LABELS[businessType] || businessType, id: businessId, links }];

    // 递归（限深度防循环）
    if (visited.size < 20) {
      for (const link of links) {
        const subChain = await this.getFullChain(link.related_type, link.related_id, visited);
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
   * 便捷方法：在业务逻辑中一行调用，失败时进入死信队列等待补偿。
   * @example await DocumentLinkService.tryAutoLink('sales_order', orderId, orderNo, 'sales_outbound', outboundId, outboundNo, userId, conn);
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
