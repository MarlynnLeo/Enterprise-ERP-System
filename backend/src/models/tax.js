/**
 * 税务管理模块数据库操作
 *
 * 本模块提供以下核心功能：
 * 1. 税务发票管理 - 进项发票、销项发票的完整生命周期管理
 * 2. 税务申报管理 - 增值税申报、企业所得税申报
 * 3. 税务科目配置 - 税务相关会计科目配置
 * 4. 税务统计分析 - 税负分析、税务报表
 *
 * @module models/tax
 */

const db = require('../config/db');
const { logger } = require('../utils/logger');

const taxModel = {
  /**
   * 创建税务发票
   * @param {Object} invoiceData - 发票数据
   * @param {Object} connection - 数据库连接（可选，用于事务）
   * @returns {Promise<number>} 发票ID
   */
  createTaxInvoice: async (invoiceData, connection = null) => {
    const conn = connection || db.pool;

    try {
      const {
        invoice_type,
        invoice_number,
        invoice_code,
        invoice_date,
        supplier_id,
        customer_id,
        supplier_or_customer_name,
        supplier_tax_number,
        amount_excluding_tax,
        tax_rate,
        tax_amount,
        total_amount,
        status = '未认证',
        related_document_type,
        related_document_id,
        remark,
        created_by,
      } = invoiceData;

      const [result] = await conn.execute(
        `
        INSERT INTO tax_invoices (
          invoice_type, invoice_number, invoice_code, invoice_date,
          supplier_id, customer_id, supplier_or_customer_name, supplier_tax_number,
          amount_excluding_tax, tax_rate, tax_amount, total_amount,
          status, related_document_type, related_document_id, remark, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          invoice_type,
          invoice_number,
          invoice_code,
          invoice_date,
          supplier_id,
          customer_id,
          supplier_or_customer_name,
          supplier_tax_number,
          amount_excluding_tax,
          tax_rate,
          tax_amount,
          total_amount,
          status,
          related_document_type,
          related_document_id,
          remark,
          created_by,
        ]
      );

      logger.info('税务发票创建成功', { invoiceId: result.insertId, invoice_number });
      return result.insertId;
    } catch (error) {
      logger.error('创建税务发票失败:', error);
      throw error;
    }
  },

  /**
   * 获取税务发票列表
   * @param {Object} filters - 查询条件
   * @returns {Promise<Array>} 发票列表
   */
  getTaxInvoices: async (filters = {}) => {
    try {
      const {
        invoice_type,
        status,
        start_date,
        end_date,
        supplier_id,
        customer_id,
        limit = 50,
        offset = 0,
      } = filters;

      let query = `
        SELECT 
          ti.*,
          s.name AS supplier_name,
          c.name AS customer_name,
          u.real_name AS creator_name,
          CASE 
            WHEN ti.related_document_type = 'ap_invoice' THEN ap.invoice_number
            WHEN ti.related_document_type = 'ar_invoice' THEN ar.invoice_number
            WHEN ti.related_document_type = '采购入库单' THEN pr.receipt_no
            WHEN ti.related_document_type = '销售出库单' THEN so.outbound_no
            ELSE NULL
          END AS linked_document_number,
          CASE 
            WHEN ti.related_document_type = 'ap_invoice' THEN ap.total_amount
            WHEN ti.related_document_type = 'ar_invoice' THEN ar.total_amount
            WHEN ti.related_document_type = '采购入库单' THEN pr.total_amount
            ELSE NULL
          END AS linked_document_amount,
          CASE 
            WHEN ti.related_document_type = 'ap_invoice' THEN ap.status
            WHEN ti.related_document_type = 'ar_invoice' THEN ar.status
            WHEN ti.related_document_type = '采购入库单' THEN pr.status
            WHEN ti.related_document_type = '销售出库单' THEN so.status
            ELSE NULL
          END AS linked_document_status
        FROM tax_invoices ti
        LEFT JOIN suppliers s ON ti.supplier_id = s.id
        LEFT JOIN customers c ON ti.customer_id = c.id
        LEFT JOIN users u ON ti.created_by = u.id
        LEFT JOIN ap_invoices ap ON ti.related_document_type = 'ap_invoice' AND ti.related_document_id = ap.id
        LEFT JOIN ar_invoices ar ON ti.related_document_type = 'ar_invoice' AND ti.related_document_id = ar.id
        LEFT JOIN purchase_receipts pr ON ti.related_document_type = '采购入库单' AND ti.related_document_id = pr.id
        LEFT JOIN sales_outbound so ON ti.related_document_type = '销售出库单' AND ti.related_document_id = so.id
        WHERE 1=1
      `;

      const params = [];

      if (invoice_type) {
        query += ' AND ti.invoice_type = ?';
        params.push(invoice_type);
      }

      if (status) {
        query += ' AND ti.status = ?';
        params.push(status);
      }

      if (start_date) {
        query += ' AND ti.invoice_date >= ?';
        params.push(start_date);
      }

      if (end_date) {
        query += ' AND ti.invoice_date <= ?';
        params.push(end_date);
      }

      if (supplier_id) {
        query += ' AND ti.supplier_id = ?';
        params.push(supplier_id);
      }

      if (customer_id) {
        query += ' AND ti.customer_id = ?';
        params.push(customer_id);
      }

      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const limitNum = parseInt(limit);
      const offsetNum = parseInt(offset);
      query += ` ORDER BY ti.invoice_date DESC, ti.id DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

      const [invoices] = await db.pool.execute(query, params);
      return invoices;
    } catch (error) {
      logger.error('获取税务发票列表失败:', error);
      throw error;
    }
  },

  /**
   * 获取税务发票详情
   * @param {number} id - 发票ID
   * @returns {Promise<Object>} 发票详情
   */
  getTaxInvoiceById: async (id) => {
    try {
      const [invoices] = await db.pool.execute(
        `
        SELECT
          ti.*,
          s.name AS supplier_name,
          c.name AS customer_name,
          u.real_name AS creator_name,
          CASE 
            WHEN ti.related_document_type = 'ap_invoice' THEN ap.invoice_number
            WHEN ti.related_document_type = 'ar_invoice' THEN ar.invoice_number
            WHEN ti.related_document_type = '采购入库单' THEN pr.receipt_no
            WHEN ti.related_document_type = '销售出库单' THEN so.outbound_no
            ELSE NULL
          END AS linked_document_number,
          CASE 
            WHEN ti.related_document_type = 'ap_invoice' THEN ap.total_amount
            WHEN ti.related_document_type = 'ar_invoice' THEN ar.total_amount
            WHEN ti.related_document_type = '采购入库单' THEN pr.total_amount
            ELSE NULL
          END AS linked_document_amount,
          CASE 
            WHEN ti.related_document_type = 'ap_invoice' THEN ap.status
            WHEN ti.related_document_type = 'ar_invoice' THEN ar.status
            WHEN ti.related_document_type = '采购入库单' THEN pr.status
            WHEN ti.related_document_type = '销售出库单' THEN so.status
            ELSE NULL
          END AS linked_document_status,
          CASE 
            WHEN ti.related_document_type = 'ap_invoice' THEN ap_s.name
            WHEN ti.related_document_type = 'ar_invoice' THEN ar_c.name
            WHEN ti.related_document_type = '采购入库单' THEN pr_s.name
            WHEN ti.related_document_type = '销售出库单' THEN so_ord_c.name
            ELSE NULL
          END AS linked_party_name
        FROM tax_invoices ti
        LEFT JOIN suppliers s ON ti.supplier_id = s.id
        LEFT JOIN customers c ON ti.customer_id = c.id
        LEFT JOIN users u ON ti.created_by = u.id
        LEFT JOIN ap_invoices ap ON ti.related_document_type = 'ap_invoice' AND ti.related_document_id = ap.id
        LEFT JOIN suppliers ap_s ON ap.supplier_id = ap_s.id
        LEFT JOIN ar_invoices ar ON ti.related_document_type = 'ar_invoice' AND ti.related_document_id = ar.id
        LEFT JOIN customers ar_c ON ar.customer_id = ar_c.id
        LEFT JOIN purchase_receipts pr ON ti.related_document_type = '采购入库单' AND ti.related_document_id = pr.id
        LEFT JOIN suppliers pr_s ON pr.supplier_id = pr_s.id
        LEFT JOIN sales_outbound so ON ti.related_document_type = '销售出库单' AND ti.related_document_id = so.id
        LEFT JOIN sales_orders so_ord ON so.order_id = so_ord.id
        LEFT JOIN customers so_ord_c ON so_ord.customer_id = so_ord_c.id
        WHERE ti.id = ?
      `,
        [id]
      );

      return invoices[0] || null;
    } catch (error) {
      logger.error('获取税务发票详情失败:', error);
      throw error;
    }
  },

  /**
   * 更新税务发票状态
   * @param {number} id - 发票ID
   * @param {string} status - 新状态
   * @param {Object} extraData - 额外数据（如认证日期、抵扣日期）
   * @returns {Promise<boolean>} 是否成功
   */
  updateTaxInvoiceStatus: async (id, status, extraData = {}) => {
    try {
      const { certification_date, deduction_date } = extraData;

      let query = 'UPDATE tax_invoices SET status = ?';
      const params = [status];

      if (certification_date) {
        query += ', certification_date = ?';
        params.push(certification_date);
      }

      if (deduction_date) {
        query += ', deduction_date = ?';
        params.push(deduction_date);
      }

      query += ' WHERE id = ?';
      params.push(id);

      const [result] = await db.pool.execute(query, params);

      logger.info('税务发票状态更新成功', { id, status });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新税务发票状态失败:', error);
      throw error;
    }
  },

  /**
   * 更新税务发票号码
   * @param {number} id - 发票ID
   * @param {string} invoiceNumber - 新发票号码
   * @returns {Promise<boolean>} 是否更新成功
   */
  updateTaxInvoiceNumber: async (id, invoiceNumber) => {
    try {
      const [result] = await db.pool.execute(
        'UPDATE tax_invoices SET invoice_number = ?, updated_at = NOW() WHERE id = ?',
        [invoiceNumber, id]
      );
      logger.info('税务发票号码更新成功', { id, invoiceNumber });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新税务发票号码失败:', error);
      throw error;
    }
  },

  /**
   * 创建税务申报
   * @param {Object} returnData - 申报数据
   * @param {Object} connection - 数据库连接（可选，用于事务）
   * @returns {Promise<number>} 申报ID
   */
  createTaxReturn: async (returnData, connection = null) => {
    const conn = connection || db.pool;

    try {
      const {
        return_period,
        return_type,
        sales_amount = 0,
        sales_output_tax = 0,
        purchase_amount = 0,
        purchase_input_tax = 0,
        input_tax_deduction = 0,
        tax_payable = 0,
        total_revenue = 0,
        total_cost = 0,
        total_expense = 0,
        taxable_income = 0,
        income_tax_rate = 25.0,
        income_tax_payable = 0,
        status = '草稿',
        remark,
        created_by,
      } = returnData;

      const [result] = await conn.execute(
        `
        INSERT INTO tax_returns (
          return_period, return_type,
          sales_amount, sales_output_tax, purchase_amount, purchase_input_tax,
          input_tax_deduction, tax_payable,
          total_revenue, total_cost, total_expense, taxable_income,
          income_tax_rate, income_tax_payable,
          status, remark, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          return_period,
          return_type,
          sales_amount,
          sales_output_tax,
          purchase_amount,
          purchase_input_tax,
          input_tax_deduction,
          tax_payable,
          total_revenue,
          total_cost,
          total_expense,
          taxable_income,
          income_tax_rate,
          income_tax_payable,
          status,
          remark,
          created_by,
        ]
      );

      logger.info('税务申报创建成功', { returnId: result.insertId, return_period, return_type });
      return result.insertId;
    } catch (error) {
      logger.error('创建税务申报失败:', error);
      throw error;
    }
  },

  /**
   * 获取税务申报列表
   * @param {Object} filters - 查询条件
   * @returns {Promise<Array>} 申报列表
   */
  getTaxReturns: async (filters = {}) => {
    try {
      const { return_type, status, year, limit = 50, offset = 0 } = filters;

      let query = `
        SELECT
          tr.*,
          u.real_name AS creator_name
        FROM tax_returns tr
        LEFT JOIN users u ON tr.created_by = u.id
        WHERE 1=1
      `;

      const params = [];

      if (return_type) {
        query += ' AND tr.return_type = ?';
        params.push(return_type);
      }

      if (status) {
        query += ' AND tr.status = ?';
        params.push(status);
      }

      if (year) {
        query += ' AND tr.return_period LIKE ?';
        params.push(`${year}%`);
      }

      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const limitNum = parseInt(limit);
      const offsetNum = parseInt(offset);
      query += ` ORDER BY tr.return_period DESC, tr.id DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

      const [returns] = await db.pool.execute(query, params);
      return returns;
    } catch (error) {
      logger.error('获取税务申报列表失败:', error);
      throw error;
    }
  },

  /**
   * 获取税务申报详情
   * @param {number} id - 申报ID
   * @returns {Promise<Object>} 申报详情
   */
  getTaxReturnById: async (id) => {
    try {
      const [returns] = await db.pool.execute(
        `
        SELECT
          tr.*,
          u.real_name AS creator_name
        FROM tax_returns tr
        LEFT JOIN users u ON tr.created_by = u.id
        WHERE tr.id = ?
      `,
        [id]
      );

      return returns[0] || null;
    } catch (error) {
      logger.error('获取税务申报详情失败:', error);
      throw error;
    }
  },

  /**
   * 更新税务申报状态
   * @param {number} id - 申报ID
   * @param {string} status - 新状态
   * @param {Object} extraData - 额外数据（如申报日期、缴纳日期）
   * @returns {Promise<boolean>} 是否成功
   */
  updateTaxReturnStatus: async (id, status, extraData = {}) => {
    try {
      const { declaration_date, payment_date } = extraData;

      let query = 'UPDATE tax_returns SET status = ?';
      const params = [status];

      if (declaration_date) {
        query += ', declaration_date = ?';
        params.push(declaration_date);
      }

      if (payment_date) {
        query += ', payment_date = ?';
        params.push(payment_date);
      }

      query += ' WHERE id = ?';
      params.push(id);

      const [result] = await db.pool.execute(query, params);

      logger.info('税务申报状态更新成功', { id, status });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新税务申报状态失败:', error);
      throw error;
    }
  },

  /**
   * 删除税务申报（仅草稿状态可删除）
   * @param {number} id - 申报ID
   * @returns {Promise<boolean>} 是否成功
   */
  deleteTaxReturn: async (id) => {
    try {
      // 先检查状态
      const taxReturn = await taxModel.getTaxReturnById(id);
      if (!taxReturn) {
        throw new Error('税务申报不存在');
      }
      if (taxReturn.status !== '草稿') {
        throw new Error('只能删除草稿状态的申报');
      }

      const [result] = await db.pool.execute('DELETE FROM tax_returns WHERE id = ? AND status = ?', [id, '草稿']);

      logger.info('税务申报删除成功', { id });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('删除税务申报失败:', error);
      throw error;
    }
  },

  // ==================== 税务科目配置 ====================

  /**
   * 获取所有税务科目配置
   * @returns {Promise<Array>} 配置列表
   */
  getTaxAccountConfigs: async () => {
    try {
      const [configs] = await db.pool.execute(`
        SELECT
          tac.*,
          a.account_code,
          a.account_name
        FROM tax_account_config tac
        LEFT JOIN gl_accounts a ON tac.account_id = a.id
        ORDER BY tac.config_key
      `);

      return configs;
    } catch (error) {
      logger.error('获取税务科目配置失败:', error);
      throw error;
    }
  },

  /**
   * 根据配置键获取税务科目配置
   * @param {string} configKey - 配置键
   * @returns {Promise<Object|null>} 配置信息
   */
  getTaxAccountConfigByKey: async (configKey) => {
    try {
      const [configs] = await db.pool.execute(
        'SELECT * FROM tax_account_config WHERE config_key = ?',
        [configKey]
      );

      return configs.length > 0 ? configs[0] : null;
    } catch (error) {
      logger.error('获取税务科目配置失败:', error);
      throw error;
    }
  },

  /**
   * 创建税务科目配置
   * @param {Object} configData - 配置数据
   * @returns {Promise<number>} 配置ID
   */
  createTaxAccountConfig: async (configData) => {
    try {
      const { config_key, config_name, account_id, description } = configData;

      const [result] = await db.pool.execute(
        `
        INSERT INTO tax_account_config (
          config_key, config_name, account_id, description
        ) VALUES (?, ?, ?, ?)
      `,
        [config_key, config_name, account_id, description]
      );

      logger.info('税务科目配置创建成功', { configId: result.insertId, config_key });
      return result.insertId;
    } catch (error) {
      logger.error('创建税务科目配置失败:', error);
      throw error;
    }
  },

  /**
   * 更新税务科目配置
   * @param {number} id - 配置ID
   * @param {Object} configData - 配置数据
   * @returns {Promise<boolean>} 是否成功
   */
  updateTaxAccountConfig: async (id, configData) => {
    try {
      const { config_name, account_id, description } = configData;

      const [result] = await db.pool.execute(
        `
        UPDATE tax_account_config
        SET config_name = ?, account_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [config_name, account_id, description, id]
      );

      logger.info('税务科目配置更新成功', { id });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新税务科目配置失败:', error);
      throw error;
    }
  },

  /**
   * 删除税务科目配置
   * @param {number} id - 配置ID
   * @returns {Promise<boolean>} 是否成功
   */
  deleteTaxAccountConfig: async (id) => {
    try {
      const [result] = await db.pool.execute('DELETE FROM tax_account_config WHERE id = ?', [id]);

      logger.info('税务科目配置删除成功', { id });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('删除税务科目配置失败:', error);
      throw error;
    }
  },
  /**
   * 关联税务发票与 AP/AR 单据
   * @param {number} taxInvoiceId - 税务发票ID
   * @param {string} documentType - 单据类型：'ap_invoice' 或 'ar_invoice'
   * @param {number} documentId - AP/AR 发票ID
   * @returns {Promise<boolean>}
   */
  linkToDocument: async (taxInvoiceId, documentType, documentId) => {
    try {
      // 校验单据类型
      if (!['ap_invoice', 'ar_invoice'].includes(documentType)) {
        throw new Error('无效的单据类型，仅支持 ap_invoice 或 ar_invoice');
      }

      // 校验目标单据是否存在
      const table = documentType === 'ap_invoice' ? 'ap_invoices' : 'ar_invoices';
      const [docs] = await db.pool.execute(`SELECT id FROM ${table} WHERE id = ?`, [documentId]);
      if (docs.length === 0) {
        throw new Error('关联的单据不存在');
      }

      const [result] = await db.pool.execute(
        'UPDATE tax_invoices SET related_document_type = ?, related_document_id = ? WHERE id = ?',
        [documentType, documentId, taxInvoiceId]
      );

      logger.info('税务发票关联成功', { taxInvoiceId, documentType, documentId });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('关联税务发票失败:', error);
      throw error;
    }
  },

  /**
   * 取消税务发票的单据关联
   * @param {number} taxInvoiceId
   * @returns {Promise<boolean>}
   */
  unlinkDocument: async (taxInvoiceId) => {
    try {
      const [result] = await db.pool.execute(
        'UPDATE tax_invoices SET related_document_type = NULL, related_document_id = NULL WHERE id = ?',
        [taxInvoiceId]
      );
      logger.info('税务发票关联已取消', { taxInvoiceId });
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('取消税务发票关联失败:', error);
      throw error;
    }
  },

  /**
   * 获取可关联的 AP/AR 单据列表
   * @param {string} type - 'ap' 或 'ar'
   * @param {string} keyword - 搜索关键词（发票号或供应商/客户名）
   * @returns {Promise<Array>}
   */
  getAvailableDocuments: async (type, keyword = '') => {
    try {
      let query;
      const params = [];

      if (type === 'ap') {
        query = `
          SELECT id, invoice_number, supplier_name, total_amount, status, invoice_date
          FROM ap_invoices
          WHERE 1=1
        `;
        if (keyword) {
          query += ' AND (invoice_number LIKE ? OR supplier_name LIKE ?)';
          params.push(`%${keyword}%`, `%${keyword}%`);
        }
      } else {
        query = `
          SELECT id, invoice_number, customer_name, total_amount, status, invoice_date
          FROM ar_invoices
          WHERE 1=1
        `;
        if (keyword) {
          query += ' AND (invoice_number LIKE ? OR customer_name LIKE ?)';
          params.push(`%${keyword}%`, `%${keyword}%`);
        }
      }

      query += ' ORDER BY invoice_date DESC LIMIT 50';

      const [docs] = await db.pool.execute(query, params);
      return docs;
    } catch (error) {
      logger.error('获取可关联单据失败:', error);
      throw error;
    }
  },

  /**
   * 创建税务模块相关表
   * @deprecated 表结构已迁移至 Knex migration 文件管理，此方法保留为空操作以兼容旧调用
   */
  createTables: async () => {
    logger.info('税务系统表格已由 Knex migration 管理，跳过运行时创建');
    return true;
  },
};

module.exports = taxModel;
