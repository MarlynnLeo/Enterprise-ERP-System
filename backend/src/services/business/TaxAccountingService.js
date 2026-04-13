/**
 * 税务会计服务
 *
 * 本服务提供以下核心功能：
 * 1. 自动生成税务相关会计分录
 * 2. 税务发票与会计分录的关联
 * 3. 税务申报与会计分录的关联
 *
 * @module services/business/TaxAccountingService
 */

const db = require('../../config/db');
const { logger } = require('../../utils/logger');
const financeModel = require('../../models/finance');

class TaxAccountingService {
  /**
   * 从销项发票生成会计分录
   * @param {Object} invoice - 销项发票数据
   * @param {number} userId - 操作用户ID
   * @returns {Promise<Object>} 生成的会计分录信息
   */
  static async generateOutputTaxEntry(invoice, userId) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. 获取税务科目配置
      const [outputTaxConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['VAT_OUTPUT_TAX']
      );

      if (outputTaxConfig.length === 0) {
        throw new Error('未配置销项税额科目');
      }

      const outputTaxAccountId = outputTaxConfig[0].account_id;

      // 2. 获取应收账款科目
      const [arConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['ACCOUNTS_RECEIVABLE']
      );

      const arAccountId = arConfig.length > 0 ? arConfig[0].account_id : null;

      // 3. 获取主营业务收入科目
      const [revenueConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['SALES_REVENUE']
      );

      const revenueAccountId = revenueConfig.length > 0 ? revenueConfig[0].account_id : null;

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber('VAT-OUT', connection);

      // 5. 获取当前会计期间
      const periodId = await this.getCurrentPeriodId(invoice.invoice_date, connection);

      // 6. 创建会计分录
      const entryData = {
        entry_number: entryNumber,
        entry_date: invoice.invoice_date,
        posting_date: invoice.invoice_date,
        document_type: '发票',
        document_number: invoice.invoice_number,
        period_id: periodId,
        description: `销项税额 - ${invoice.invoice_number}`,
        created_by: userId,
      };

      const entryItems = [
        {
          account_id: arAccountId,
          debit_amount: invoice.total_amount,
          credit_amount: 0,
          description: `应收账款 - ${invoice.supplier_or_customer_name}`,
        },
        {
          account_id: revenueAccountId,
          debit_amount: 0,
          credit_amount: invoice.amount_excluding_tax,
          description: `主营业务收入 - ${invoice.supplier_or_customer_name}`,
        },
        {
          account_id: outputTaxAccountId,
          debit_amount: 0,
          credit_amount: invoice.tax_amount,
          description: `应交增值税(销项税额) - ${invoice.invoice_number}`,
        },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      // 7. 更新税务发票的关联会计分录ID
      await connection.execute('UPDATE tax_invoices SET gl_entry_id = ? WHERE id = ?', [
        entryId,
        invoice.id,
      ]);

      await connection.commit();

      logger.info('销项税额会计分录生成成功', {
        invoiceId: invoice.id,
        entryId,
        entryNumber,
      });

      return { entryId, entryNumber };
    } catch (error) {
      await connection.rollback();
      logger.error('生成销项税额会计分录失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 从进项发票生成会计分录
   * @param {Object} invoice - 进项发票数据
   * @param {number} userId - 操作用户ID
   * @returns {Promise<Object>} 生成的会计分录信息
   */
  static async generateInputTaxEntry(invoice, userId) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. 获取税务科目配置
      const [inputTaxConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['VAT_INPUT_TAX']
      );

      if (inputTaxConfig.length === 0) {
        throw new Error('未配置进项税额科目');
      }

      const inputTaxAccountId = inputTaxConfig[0].account_id;

      // 2. 获取应付账款科目
      const [apConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['ACCOUNTS_PAYABLE']
      );

      const apAccountId = apConfig.length > 0 ? apConfig[0].account_id : null;

      // 3. 获取原材料/库存商品科目（根据关联单据类型）
      const [inventoryConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['RAW_MATERIALS']
      );

      const inventoryAccountId = inventoryConfig.length > 0 ? inventoryConfig[0].account_id : null;

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber('VAT-IN', connection);

      // 5. 获取当前会计期间
      const periodId = await this.getCurrentPeriodId(invoice.invoice_date, connection);

      // 6. 创建会计分录
      const entryData = {
        entry_number: entryNumber,
        entry_date: invoice.invoice_date,
        posting_date: invoice.invoice_date,
        document_type: '发票',
        document_number: invoice.invoice_number,
        period_id: periodId,
        description: `进项税额 - ${invoice.invoice_number}`,
        created_by: userId,
      };

      const entryItems = [];

      // 借方明细
      entryItems.push({
        account_id: inventoryAccountId,
        debit_amount: invoice.amount_excluding_tax,
        credit_amount: 0,
        description: `原材料/库存商品 - ${invoice.supplier_or_customer_name}`,
      });

      entryItems.push({
        account_id: inputTaxAccountId,
        debit_amount: invoice.tax_amount,
        credit_amount: 0,
        description: `应交增值税(进项税额) - ${invoice.invoice_number}`,
      });

      // 贷方明细
      entryItems.push({
        account_id: apAccountId,
        debit_amount: 0,
        credit_amount: invoice.total_amount,
        description: `应付账款 - ${invoice.supplier_or_customer_name}`,
      });

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      // 7. 更新税务发票的关联会计分录ID
      await connection.execute('UPDATE tax_invoices SET gl_entry_id = ? WHERE id = ?', [
        entryId,
        invoice.id,
      ]);

      await connection.commit();

      logger.info('进项税额会计分录生成成功', {
        invoiceId: invoice.id,
        entryId,
        entryNumber,
      });

      return { entryId, entryNumber };
    } catch (error) {
      await connection.rollback();
      logger.error('生成进项税额会计分录失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成分录编号
   * @param {string} prefix - 前缀
   * @param {Object} connection - 数据库连接
   * @returns {Promise<string>} 分录编号
   */
  static async generateEntryNumber(prefix, connection) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // 查询当天最大编号
    const [rows] = await connection.execute(
      `
      SELECT entry_number
      FROM gl_entries
      WHERE entry_number LIKE ?
      ORDER BY entry_number DESC
      LIMIT 1
    `,
      [`${prefix}-${year}${month}${day}%`]
    );

    let sequence = 1;
    if (rows.length > 0) {
      const lastNumber = rows[0].entry_number;
      const lastSequence = parseInt(lastNumber.slice(-4));
      sequence = lastSequence + 1;
    }

    return `${prefix}-${year}${month}${day}${String(sequence).padStart(4, '0')}`;
  }

  /**
   * 获取当前会计期间ID
   * @param {string} date - 日期
   * @param {Object} connection - 数据库连接
   * @returns {Promise<number>} 期间ID
   */
  static async getCurrentPeriodId(date, connection) {
    const [periods] = await connection.execute(
      `
      SELECT id
      FROM gl_periods
      WHERE start_date <= ? AND end_date >= ? AND is_closed = false
      LIMIT 1
    `,
      [date, date]
    );

    if (periods.length === 0) {
      throw new Error('未找到开启的会计期间');
    }

    return periods[0].id;
  }

  /**
   * 生成增值税申报会计分录
   * @param {Object} taxReturn - 税务申报数据
   * @param {number} userId - 操作用户ID
   * @returns {Promise<Object>} 生成的会计分录信息
   */
  static async generateVATReturnEntry(taxReturn, userId) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. 获取税务科目配置
      const [vatPayableConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['VAT_PAYABLE']
      );

      if (vatPayableConfig.length === 0) {
        throw new Error('未配置应交增值税科目');
      }

      const vatPayableAccountId = vatPayableConfig[0].account_id;

      // 2. 获取银行存款科目
      const [bankConfig] = await connection.execute(
        'SELECT account_id FROM tax_account_config WHERE config_key = ?',
        ['BANK_DEPOSITS']
      );

      const bankAccountId = bankConfig.length > 0 ? bankConfig[0].account_id : null;

      // 3. 生成分录编号
      const entryNumber = await this.generateEntryNumber('VAT-PAY', connection);

      // 4. 获取当前会计期间
      const periodId = await this.getCurrentPeriodId(
        new Date().toISOString().split('T')[0],
        connection
      );

      const today = new Date().toISOString().split('T')[0];

      // 5. 创建会计分录
      const entryData = {
        entry_number: entryNumber,
        entry_date: today,
        posting_date: today,
        document_type: '转账单',
        document_number: taxReturn.return_period,
        period_id: periodId,
        description: `缴纳增值税 - ${taxReturn.return_period}`,
        created_by: userId,
      };

      const entryItems = [
        {
          account_id: vatPayableAccountId,
          debit_amount: taxReturn.tax_payable,
          credit_amount: 0,
          description: `应交增值税 - ${taxReturn.return_period}`,
        },
        {
          account_id: bankAccountId,
          debit_amount: 0,
          credit_amount: taxReturn.tax_payable,
          description: '银行存款 - 缴纳增值税',
        },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      // 6. 更新税务申报的关联会计分录ID
      await connection.execute('UPDATE tax_returns SET gl_entry_id = ? WHERE id = ?', [
        entryId,
        taxReturn.id,
      ]);

      await connection.commit();

      logger.info('增值税申报会计分录生成成功', {
        returnId: taxReturn.id,
        entryId,
        entryNumber,
      });

      return { entryId, entryNumber };
    } catch (error) {
      await connection.rollback();
      logger.error('生成增值税申报会计分录失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = TaxAccountingService;
