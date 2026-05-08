const { logger } = require('../../utils/logger');
const DocumentLinkService = require('./DocumentLinkService');

class EightDNcpLinkError extends Error {
  constructor(message, statusCode = 400, errorCode = 'BAD_REQUEST') {
    super(message);
    this.name = 'EightDNcpLinkError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isEightDNcpLinkError = true;
  }
}

class EightDNcpLinkService {
  static async findLinkedNcp(connection, ncpId) {
    if (!ncpId) return null;

    const [rows] = await connection.query(
      `SELECT ncp.*, qi.inspection_no AS qi_inspection_no, qi.status AS inspection_status
       FROM nonconforming_products ncp
       LEFT JOIN quality_inspections qi ON qi.id = ncp.inspection_id
       WHERE ncp.id = ? AND ncp.deleted_at IS NULL`,
      [ncpId]
    );

    return rows[0] || null;
  }

  static async getDownstreamState(connection, ncp) {
    if (!ncp?.id || !ncp.disposition || ncp.disposition === 'pending') {
      return null;
    }

    const dispositionQueries = {
      rework: {
        label: '返工任务',
        sql: `SELECT COUNT(*) AS total,
                     SUM(CASE WHEN status = 'completed' THEN 0 ELSE 1 END) AS open_count
              FROM rework_tasks
              WHERE ncp_id = ?`,
        params: [ncp.id],
      },
      scrap: {
        label: '报废记录',
        sql: `SELECT COUNT(*) AS total,
                     SUM(CASE WHEN status = 'completed' THEN 0 ELSE 1 END) AS open_count
              FROM scrap_records
              WHERE ncp_id = ?`,
        params: [ncp.id],
      },
      replacement: {
        label: '换货单',
        sql: `SELECT COUNT(*) AS total,
                     SUM(CASE WHEN status = 'completed' THEN 0 ELSE 1 END) AS open_count
              FROM replacement_orders
              WHERE ncp_id = ?`,
        params: [ncp.id],
      },
      return: {
        label: '采购退货单',
        sql: `SELECT COUNT(*) AS total,
                     SUM(CASE WHEN status = 'completed' THEN 0 ELSE 1 END) AS open_count
              FROM purchase_returns
              WHERE source_type = 'ncp_return'
                AND remarks LIKE ?`,
        params: [`%${ncp.ncp_no}%`],
      },
      use_as_is: {
        label: '让步接收入库单',
        sql: `SELECT COUNT(*) AS total,
                     SUM(CASE WHEN status = 'completed' THEN 0 ELSE 1 END) AS open_count
              FROM purchase_receipts
              WHERE from_inspection = 1
                AND remarks LIKE ?`,
        params: [`%${ncp.ncp_no}%`],
      },
    };

    const query = dispositionQueries[ncp.disposition];
    if (!query) return null;

    const [rows] = await connection.query(query.sql, query.params);
    const row = rows[0] || {};
    return {
      label: query.label,
      total: Number(row.total || 0),
      openCount: Number(row.open_count || 0),
    };
  }

  static async assertDownstreamClosed(connection, ncp) {
    const downstream = await this.getDownstreamState(connection, ncp);
    if (!downstream) return;

    if (downstream.total === 0) {
      throw new EightDNcpLinkError(
        `关联NCP ${ncp.ncp_no} 缺少${downstream.label}，不能归档8D报告`
      );
    }

    if (downstream.openCount > 0) {
      throw new EightDNcpLinkError(
        `关联NCP ${ncp.ncp_no} 的${downstream.label}尚未完成，不能归档8D报告`
      );
    }
  }

  static fillReportFieldsFromNcp(reportData, ncp) {
    if (!ncp) return reportData;

    reportData.ncp_no = reportData.ncp_no || ncp.ncp_no;
    reportData.inspection_id = reportData.inspection_id || ncp.inspection_id || null;
    reportData.inspection_no = reportData.inspection_no || ncp.inspection_no || ncp.qi_inspection_no || null;
    reportData.material_id = reportData.material_id || ncp.material_id || null;
    reportData.material_code = reportData.material_code || ncp.material_code || null;
    reportData.material_name = reportData.material_name || ncp.material_name || null;
    reportData.supplier_id = reportData.supplier_id || ncp.supplier_id || null;
    reportData.supplier_name = reportData.supplier_name || ncp.supplier_name || null;
    reportData.d2_problem_description = reportData.d2_problem_description || ncp.defect_description || null;
    reportData.d2_quantity_affected = reportData.d2_quantity_affected || ncp.quantity || null;
    reportData.d2_defect_type = reportData.d2_defect_type || ncp.defect_type || null;

    return reportData;
  }

  static async findActiveReport(connection, ncpId, excludeReportId = null) {
    if (!ncpId) return null;

    const params = [ncpId];
    let sql = `
      SELECT id, report_no, status
      FROM eight_d_reports
      WHERE ncp_id = ?
        AND deleted_at IS NULL
        AND status <> 'closed'
    `;

    if (excludeReportId) {
      sql += ' AND id <> ?';
      params.push(excludeReportId);
    }

    const [rows] = await connection.query(sql, params);
    return rows[0] || null;
  }

  static async prepareCreate(connection, reportData) {
    const linkedNcp = await this.findLinkedNcp(connection, reportData.ncp_id);

    if (reportData.ncp_id && !linkedNcp) {
      throw new EightDNcpLinkError('关联NCP不存在，无法创建8D报告');
    }

    if (!linkedNcp) {
      return null;
    }

    const activeReport = await this.findActiveReport(connection, reportData.ncp_id);
    if (activeReport) {
      throw new EightDNcpLinkError(`该NCP已有未归档8D报告：${activeReport.report_no}`);
    }

    this.fillReportFieldsFromNcp(reportData, linkedNcp);
    return linkedNcp;
  }

  static async prepareUpdate(connection, existingReport, reportData, reportId) {
    const currentNcpId = existingReport.ncp_id;
    const nextNcpId = reportData.ncp_id !== undefined ? reportData.ncp_id : currentNcpId;
    const changed = reportData.ncp_id !== undefined && String(reportData.ncp_id || '') !== String(currentNcpId || '');

    if (changed && existingReport.status !== 'draft') {
      throw new EightDNcpLinkError('报告提交流程后不可变更关联NCP');
    }

    const linkedNcp = await this.findLinkedNcp(connection, nextNcpId);
    if (reportData.ncp_id && !linkedNcp) {
      throw new EightDNcpLinkError('关联NCP不存在，无法更新8D报告');
    }

    if (changed) {
      const activeReport = await this.findActiveReport(connection, reportData.ncp_id, reportId);
      if (activeReport) {
        throw new EightDNcpLinkError(`该NCP已有未归档8D报告：${activeReport.report_no}`);
      }
    }

    if (linkedNcp) {
      this.fillReportFieldsFromNcp(reportData, linkedNcp);
    }

    return { changed, linkedNcp };
  }

  static async markProcessingIfPending(connection, ncp, operator) {
    if (!ncp || ncp.status !== 'pending') return;

    await connection.query(
      `UPDATE nonconforming_products
       SET status = 'processing', updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [operator, ncp.id]
    );
  }

  static async recordAction(connection, ncpId, actionType, description, operator) {
    if (!ncpId) return;

    try {
      await connection.query(
        `INSERT INTO nonconforming_product_actions (ncp_id, action_type, action_description, action_by)
         VALUES (?, ?, ?, ?)`,
        [ncpId, actionType, description, operator]
      );
    } catch (error) {
      logger.error(`[8D] 写入关联NCP动作失败 (NCPID: ${ncpId}):`, error.message);
    }
  }

  static async markCreated(connection, ncp, reportNo, operator, reportId = null) {
    if (!ncp) return;

    await this.markProcessingIfPending(connection, ncp, operator);
    if (reportId) {
      await DocumentLinkService.tryAutoLink(
        'nonconforming_product',
        ncp.id,
        ncp.ncp_no,
        'eight_d_report',
        reportId,
        reportNo,
        null,
        connection
      );
    }
    await this.recordAction(
      connection,
      ncp.id,
      'evaluate',
      `关联8D报告 ${reportNo}，进入纠正预防闭环`,
      operator
    );
  }

  static async markAssociationChanged(connection, ncp, reportNo, operator, reportId = null) {
    if (!ncp) return;

    await this.markProcessingIfPending(connection, ncp, operator);
    if (reportId) {
      await DocumentLinkService.tryAutoLink(
        'nonconforming_product',
        ncp.id,
        ncp.ncp_no,
        'eight_d_report',
        reportId,
        reportNo,
        null,
        connection
      );
    }
    await this.recordAction(
      connection,
      ncp.id,
      'evaluate',
      `关联8D报告 ${reportNo} 已更新`,
      operator
    );
  }

  static async markCompleted(connection, report, operator) {
    if (!report.ncp_id) return;

    await this.recordAction(
      connection,
      report.ncp_id,
      'evaluate',
      `关联8D报告 ${report.report_no || report.id} 已完成，等待最终归档`,
      operator
    );
  }

  static async closeLinkedNcp(connection, report, operator) {
    if (!report.ncp_id) return;

    const linkedNcp = await this.findLinkedNcp(connection, report.ncp_id);
    if (!linkedNcp) {
      throw new EightDNcpLinkError('关联NCP不存在，无法完成归档闭环');
    }

    if (!['completed', 'closed'].includes(linkedNcp.status)) {
      throw new EightDNcpLinkError(`关联NCP ${linkedNcp.ncp_no} 尚未完成处置，不能归档8D报告`);
    }

    await this.assertDownstreamClosed(connection, linkedNcp);

    if (linkedNcp.status === 'completed') {
      await connection.query(
        `UPDATE nonconforming_products
         SET status = 'closed', updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [operator, linkedNcp.id]
      );
    }

    await this.recordAction(
      connection,
      linkedNcp.id,
      'close',
      `关联8D报告 ${report.report_no || report.id} 已归档，NCP纠正预防闭环关闭`,
      operator
    );
  }
}

module.exports = {
  EightDNcpLinkError,
  EightDNcpLinkService,
};
