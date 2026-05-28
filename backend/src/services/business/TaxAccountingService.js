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
const DocumentLinkService = require('./DocumentLinkService');
const { accountingConfig } = require('../../config/accountingConfig');
const { roundMoney } = require('../../utils/money');
const { currentDateString, toLocalDateString } = require('../../utils/dateUtils');

function validationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

function toCents(value) {
  return Math.round(roundMoney(value) * 100);
}

function normalizeInvoiceVoucherAmounts(invoice) {
  const amountExcludingTaxCents = toCents(invoice?.amount_excluding_tax);
  const taxAmountCents = toCents(invoice?.tax_amount);
  const totalAmountCents = toCents(invoice?.total_amount);

  if (amountExcludingTaxCents < 0 || taxAmountCents < 0 || totalAmountCents < 0) {
    throw validationError('发票金额不能为负数，不能生成会计分录');
  }

  if (totalAmountCents <= 0) {
    throw validationError('发票价税合计必须大于0，不能生成会计分录');
  }

  if (amountExcludingTaxCents + taxAmountCents !== totalAmountCents) {
    throw validationError('发票金额不平衡：不含税金额 + 税额必须等于价税合计');
  }

  return {
    amountExcludingTax: amountExcludingTaxCents / 100,
    taxAmount: taxAmountCents / 100,
    totalAmount: totalAmountCents / 100,
  };
}

function addNonZeroEntryItem(items, item, direction, amount) {
  const amountCents = toCents(amount);
  if (amountCents === 0) return;

  const normalizedAmount = amountCents / 100;
  items.push({
    ...item,
    debit_amount: direction === 'debit' ? normalizedAmount : 0,
    credit_amount: direction === 'credit' ? normalizedAmount : 0,
  });
}

class TaxAccountingService {
  static async resolveTaxAccountId(connection, taxConfigKeys, accountConfigKeys, label) {
    const configKeys = [...new Set([].concat(taxConfigKeys).filter(Boolean))];
    if (configKeys.length > 0) {
      const [configs] = await connection.execute(
        `SELECT tac.config_key, tac.account_id
         FROM tax_account_config tac
         JOIN gl_accounts ga ON ga.id = tac.account_id AND ga.is_active = 1
         WHERE tac.config_key IN (${configKeys.map(() => '?').join(',')})
           AND COALESCE(tac.is_active, 1) = 1`,
        configKeys
      );
      const configByKey = new Map(configs.map((config) => [config.config_key, config.account_id]));
      for (const key of configKeys) {
        if (configByKey.has(key)) {
          return configByKey.get(key);
        }
      }
    }

    await accountingConfig.loadFromDatabase(db);
    const accountCodes = [
      ...new Set(
        []
          .concat(accountConfigKeys)
          .filter(Boolean)
          .map((key) => accountingConfig.getAccountCode(key))
          .filter(Boolean)
      ),
    ];

    for (const accountCode of accountCodes) {
      const [accounts] = await connection.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
        [accountCode]
      );
      if (accounts.length > 0) {
        return accounts[0].id;
      }
    }

    const expectedKeys = [...configKeys, ...accountConfigKeys].join(', ');
    throw new Error(`未配置${label}科目(${expectedKeys})`);
  }

  static async linkTaxInvoiceVoucher(invoice, entryInfo, userId, connection) {
    if (!invoice?.id || !entryInfo?.entryId) return;

    await DocumentLinkService.tryAutoLink(
      'tax_invoice',
      invoice.id,
      invoice.invoice_number,
      'finance_voucher',
      entryInfo.entryId,
      entryInfo.entryNumber,
      userId,
      connection
    );
  }

  static async linkTaxReturnVoucher(taxReturn, entryInfo, userId, connection) {
    if (!taxReturn?.id || !entryInfo?.entryId) return;

    await DocumentLinkService.tryAutoLink(
      'tax_return',
      taxReturn.id,
      taxReturn.return_period,
      'finance_voucher',
      entryInfo.entryId,
      entryInfo.entryNumber,
      userId,
      connection
    );
  }

  static async hasLinkedArVoucherForOutputTax(connection, invoice) {
    if (!invoice?.related_document_id) return false;

    const [rows] = await connection.execute(
      `SELECT ai.id
       FROM sales_outbound so
       JOIN ar_invoices ai
         ON ai.source_type = 'sales_order'
        AND ai.source_id = so.order_id
       JOIN document_links dl
         ON dl.source_type = 'ar_invoice'
        AND dl.source_id = ai.id
        AND dl.target_type = 'finance_voucher'
       JOIN gl_entries ge
         ON ge.id = dl.target_id
        AND COALESCE(ge.is_reversed, 0) = 0
       WHERE so.id = ?
       LIMIT 1`,
      [invoice.related_document_id]
    );

    return rows.length > 0;
  }

  static async hasLinkedApVoucherForInputTax(connection, invoice) {
    if (!invoice?.related_document_id) return false;

    const [rows] = await connection.execute(
      `SELECT ai.id
       FROM ap_invoices ai
       JOIN document_links dl
         ON dl.source_type = 'ap_invoice'
        AND dl.source_id = ai.id
        AND dl.target_type = 'finance_voucher'
       JOIN gl_entries ge
         ON ge.id = dl.target_id
        AND COALESCE(ge.is_reversed, 0) = 0
       WHERE ai.source_type = 'purchase_receipt'
         AND ai.source_id = ?
       LIMIT 1`,
      [invoice.related_document_id]
    );

    return rows.length > 0;
  }

  /**
   * 从销项发票生成会计分录
   * @param {Object} invoice - 销项发票数据
   * @param {number} userId - 操作用户ID
   * @returns {Promise<Object>} 生成的会计分录信息
   */
  static async generateOutputTaxEntry(invoice, userId, externalConnection = null) {
    const connection = externalConnection || (await db.pool.getConnection());
    const shouldManageTransaction = !externalConnection;

    try {
      if (shouldManageTransaction) {
        await connection.beginTransaction();
      }

      const outputTaxAccountId = await this.resolveTaxAccountId(
        connection,
        ['VAT_OUTPUT_TAX'],
        ['VAT_OUTPUT_TAX', 'TAX_PAYABLE'],
        '销项税额'
      );
      const arAccountId = await this.resolveTaxAccountId(
        connection,
        ['ACCOUNTS_RECEIVABLE'],
        ['ACCOUNTS_RECEIVABLE'],
        '应收账款'
      );
      const revenueAccountId = await this.resolveTaxAccountId(
        connection,
        ['SALES_REVENUE'],
        ['SALES_REVENUE'],
        '主营业务收入'
      );

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber('VAT-OUT', connection);

      // 5. 获取当前会计期间
      const invoiceDate = toLocalDateString(invoice.invoice_date || currentDateString());
      const periodId = await this.getCurrentPeriodId(invoiceDate, connection);
      const voucherAmounts = normalizeInvoiceVoucherAmounts(invoice);
      const useTaxReclassification = await this.hasLinkedArVoucherForOutputTax(connection, invoice);

      // 6. 创建会计分录
      const entryData = {
        entry_number: entryNumber,
        entry_date: invoiceDate,
        posting_date: invoiceDate,
        document_type: '发票',
        document_number: invoice.invoice_number,
        period_id: periodId,
        description: useTaxReclassification
          ? `VAT output tax reclassification - ${invoice.invoice_number}`
          : `销项税额 - ${invoice.invoice_number}`,
        created_by: userId,
        status: 'posted',
        is_posted: 1,
      };

      const entryItems = [];

      if (useTaxReclassification) {
        addNonZeroEntryItem(
          entryItems,
          {
            account_id: revenueAccountId,
            description: `VAT output tax reclassification - ${invoice.invoice_number}`,
          },
          'debit',
          voucherAmounts.taxAmount
        );
      } else {
        addNonZeroEntryItem(
          entryItems,
          {
            account_id: arAccountId,
            description: `应收账款 - ${invoice.supplier_or_customer_name}`,
          },
          'debit',
          voucherAmounts.totalAmount
        );
        addNonZeroEntryItem(
          entryItems,
          {
            account_id: revenueAccountId,
            description: `主营业务收入 - ${invoice.supplier_or_customer_name}`,
          },
          'credit',
          voucherAmounts.amountExcludingTax
        );
      }
      addNonZeroEntryItem(
        entryItems,
        {
          account_id: outputTaxAccountId,
          description: `应交增值税(销项税额) - ${invoice.invoice_number}`,
        },
        'credit',
        voucherAmounts.taxAmount
      );

      if (entryItems.length === 0) {
        if (shouldManageTransaction) {
          await connection.commit();
        }
        return { skipped: true, message: 'No VAT amount to post' };
      }

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      // 7. 更新税务发票的关联会计分录ID
      await connection.execute('UPDATE tax_invoices SET gl_entry_id = ? WHERE id = ?', [
        entryId,
        invoice.id,
      ]);

      await this.linkTaxInvoiceVoucher(invoice, { entryId, entryNumber }, userId, connection);

      if (shouldManageTransaction) {
        await connection.commit();
      }

      logger.info('销项税额会计分录生成成功', {
        invoiceId: invoice.id,
        entryId,
        entryNumber,
      });

      return { entryId, entryNumber };
    } catch (error) {
      if (shouldManageTransaction) {
        await connection.rollback();
      }
      logger.error('生成销项税额会计分录失败:', error);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        connection.release();
      }
    }
  }

  /**
   * 从进项发票生成会计分录
   * @param {Object} invoice - 进项发票数据
   * @param {number} userId - 操作用户ID
   * @returns {Promise<Object>} 生成的会计分录信息
   */
  static async generateInputTaxEntry(invoice, userId, externalConnection = null) {
    const connection = externalConnection || (await db.pool.getConnection());
    const shouldManageTransaction = !externalConnection;

    try {
      if (shouldManageTransaction) {
        await connection.beginTransaction();
      }

      const inputTaxAccountId = await this.resolveTaxAccountId(
        connection,
        ['VAT_INPUT_TAX'],
        ['VAT_INPUT_TAX', 'TAX_PAYABLE'],
        '进项税额'
      );
      const apAccountId = await this.resolveTaxAccountId(
        connection,
        ['ACCOUNTS_PAYABLE'],
        ['ACCOUNTS_PAYABLE'],
        '应付账款'
      );
      const inventoryAccountId = await this.resolveTaxAccountId(
        connection,
        ['RAW_MATERIALS', 'INVENTORY_GOODS', 'INVENTORY'],
        ['RAW_MATERIALS', 'INVENTORY_GOODS', 'INVENTORY'],
        '原材料/库存商品'
      );

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber('VAT-IN', connection);

      // 5. 获取当前会计期间
      const invoiceDate = toLocalDateString(invoice.invoice_date || currentDateString());
      const periodId = await this.getCurrentPeriodId(invoiceDate, connection);
      const voucherAmounts = normalizeInvoiceVoucherAmounts(invoice);
      const useTaxReclassification = await this.hasLinkedApVoucherForInputTax(connection, invoice);

      // 6. 创建会计分录
      const entryData = {
        entry_number: entryNumber,
        entry_date: invoiceDate,
        posting_date: invoiceDate,
        document_type: '发票',
        document_number: invoice.invoice_number,
        period_id: periodId,
        description: useTaxReclassification
          ? `VAT input tax reclassification - ${invoice.invoice_number}`
          : `进项税额 - ${invoice.invoice_number}`,
        created_by: userId,
        status: 'posted',
        is_posted: 1,
      };

      const entryItems = [];

      if (!useTaxReclassification) {
        addNonZeroEntryItem(
          entryItems,
          {
            account_id: inventoryAccountId,
            description: `原材料/库存商品 - ${invoice.supplier_or_customer_name}`,
          },
          'debit',
          voucherAmounts.amountExcludingTax
        );
      }

      addNonZeroEntryItem(
        entryItems,
        {
          account_id: inputTaxAccountId,
          description: `应交增值税(进项税额) - ${invoice.invoice_number}`,
        },
        'debit',
        voucherAmounts.taxAmount
      );

      if (useTaxReclassification) {
        addNonZeroEntryItem(
          entryItems,
          {
            account_id: inventoryAccountId,
            description: `VAT input tax reclassification - ${invoice.invoice_number}`,
          },
          'credit',
          voucherAmounts.taxAmount
        );
      } else {
        addNonZeroEntryItem(
          entryItems,
          {
            account_id: apAccountId,
            description: `应付账款 - ${invoice.supplier_or_customer_name}`,
          },
          'credit',
          voucherAmounts.totalAmount
        );
      }

      if (entryItems.length === 0) {
        if (shouldManageTransaction) {
          await connection.commit();
        }
        return { skipped: true, message: 'No VAT amount to post' };
      }

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      // 7. 更新税务发票的关联会计分录ID
      await connection.execute('UPDATE tax_invoices SET gl_entry_id = ? WHERE id = ?', [
        entryId,
        invoice.id,
      ]);

      await this.linkTaxInvoiceVoucher(invoice, { entryId, entryNumber }, userId, connection);

      if (shouldManageTransaction) {
        await connection.commit();
      }

      logger.info('进项税额会计分录生成成功', {
        invoiceId: invoice.id,
        entryId,
        entryNumber,
      });

      return { entryId, entryNumber };
    } catch (error) {
      if (shouldManageTransaction) {
        await connection.rollback();
      }
      logger.error('生成进项税额会计分录失败:', error);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        connection.release();
      }
    }
  }

  /**
   * 生成分录编号
   * @param {string} prefix - 前缀
   * @param {Object} connection - 数据库连接
   * @returns {Promise<string>} 分录编号
   */
  static async generateEntryNumber(prefix, connection) {
    const datePart = currentDateString().replace(/-/g, '');

    // 查询当天最大编号
    const [rows] = await connection.execute(
      `
      SELECT entry_number
      FROM gl_entries
      WHERE entry_number LIKE ?
      ORDER BY entry_number DESC
      LIMIT 1
      FOR UPDATE
    `,
      [`${prefix}-${datePart}%`]
    );

    let sequence = 1;
    if (rows.length > 0) {
      const lastNumber = rows[0].entry_number;
      const lastSequence = parseInt(lastNumber.slice(-4));
      sequence = lastSequence + 1;
    }

    return `${prefix}-${datePart}${String(sequence).padStart(4, '0')}`;
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
  static async generateVATReturnEntry(taxReturn, userId, externalConnection = null, options = {}) {
    const connection = externalConnection || (await db.pool.getConnection());
    const shouldManageTransaction = !externalConnection;

    try {
      if (shouldManageTransaction) {
        await connection.beginTransaction();
      }

      const vatPayableAccountId = await this.resolveTaxAccountId(
        connection,
        ['VAT_PAYABLE'],
        ['VAT_PAYABLE', 'TAX_PAYABLE'],
        '应交增值税'
      );
      const bankAccountId = await this.resolveTaxAccountId(
        connection,
        ['BANK_DEPOSIT', 'BANK_DEPOSITS'],
        ['BANK_DEPOSIT'],
        '银行存款'
      );

      // 3. 生成分录编号
      const entryNumber = await this.generateEntryNumber('VAT-PAY', connection);

      // 4. 获取当前会计期间
      const accountingDate = toLocalDateString(options.accountingDate || currentDateString());
      const periodId = await this.getCurrentPeriodId(accountingDate, connection);
      const payableAmount = parseFloat(taxReturn.tax_payable || 0);

      // 5. 创建会计分录
      const entryData = {
        entry_number: entryNumber,
        entry_date: accountingDate,
        posting_date: accountingDate,
        document_type: '转账单',
        document_number: taxReturn.return_period,
        period_id: periodId,
        description: `缴纳增值税 - ${taxReturn.return_period}`,
        created_by: userId,
        status: 'posted',
        is_posted: 1,
      };

      const entryItems = [
        {
          account_id: vatPayableAccountId,
          debit_amount: payableAmount,
          credit_amount: 0,
          description: `应交增值税 - ${taxReturn.return_period}`,
        },
        {
          account_id: bankAccountId,
          debit_amount: 0,
          credit_amount: payableAmount,
          description: '银行存款 - 缴纳增值税',
        },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      // 6. 更新税务申报的关联会计分录ID
      await connection.execute('UPDATE tax_returns SET gl_entry_id = ? WHERE id = ?', [
        entryId,
        taxReturn.id,
      ]);

      await this.linkTaxReturnVoucher(taxReturn, { entryId, entryNumber }, userId, connection);

      if (shouldManageTransaction) {
        await connection.commit();
      }

      logger.info('增值税申报会计分录生成成功', {
        returnId: taxReturn.id,
        entryId,
        entryNumber,
      });

      return { entryId, entryNumber };
    } catch (error) {
      if (shouldManageTransaction) {
        await connection.rollback();
      }
      logger.error('生成增值税申报会计分录失败:', error);
      throw error;
    } finally {
      if (shouldManageTransaction) {
        connection.release();
      }
    }
  }
}

module.exports = TaxAccountingService;
