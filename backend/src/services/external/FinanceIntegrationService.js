const db = require('../../config/db');
const SystemConfigService = require('../system/SystemConfigService');
const arModel = require('../../models/ar');
const apModel = require('../../models/ap');
const financeModel = require('../../models/finance');
const taxModel = require('../../models/tax');
const { financeConfig } = require('../../config/financeConfig');
const { getUserIdByIdentifier } = require('../../utils/userUtils');
const logger = require('../../utils/logger');

class FinanceIntegrationService {
  /**
   * 批量解析会计科目ID（1次查询替代 N+1）
   * @param {string[]} keys - 科目配置键名数组，如 ['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']
   * @returns {Object} key → accountId 的映射，例如 { ACCOUNTS_RECEIVABLE: 12, SALES_REVENUE: 15 }
   * @throws {Error} 如果任何科目缺少配置或不存在
   */
  static async resolveAccountIds(keys) {
    const { accountingConfig } = require('../../config/accountingConfig');

    // 1. 从配置中解析出所有科目编码
    const keyToCode = {};
    for (const key of keys) {
      const code = accountingConfig.getAccountCode(key);
      if (!code) {
        throw new Error(`缺少必需的财务配置: ${key}，请先在财务设置中配置`);
      }
      keyToCode[key] = code;
    }

    // 2. 批量查询所有科目ID（1次 SQL 替代 N 次）
    const uniqueCodes = [...new Set(Object.values(keyToCode))];
    const placeholders = uniqueCodes.map(() => '?').join(',');
    const [rows] = await db.pool.execute(
      `SELECT id, account_code FROM gl_accounts WHERE account_code IN (${placeholders})`,
      uniqueCodes
    );

    // 3. 构建编码→ID映射
    const codeToId = {};
    for (const row of rows) {
      codeToId[row.account_code] = row.id;
    }

    // 4. 校验并构建返回结果
    const result = {};
    for (const key of keys) {
      const code = keyToCode[key];
      if (!codeToId[code]) {
        throw new Error(`相关的财务科目不存在: ${code}，请前往会计科目页面配置后再试！`);
      }
      result[key] = codeToId[code];
    }

    return result;
  }

  /**
   * 验证必需的财务配置（委托给 resolveAccountIds）
   */
  static async validateRequiredConfigs(keys) {
    await this.resolveAccountIds(keys);
  }

  /**
   * 获取会计科目ID（单个查询，保留兼容性）
   */
  static async getAccountIdByKey(key) {
    try {
      const result = await this.resolveAccountIds([key]);
      return result[key] || null;
    } catch {
      return null;
    }
  }

  /**
   * 获取当前打开的会计期间
   */
  static async getCurrentPeriod(connection, date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const [periods] = await connection.execute(
      'SELECT id FROM gl_periods WHERE is_closed = 0 AND start_date <= ? AND end_date >= ?',
      [targetDate, targetDate]
    );

    if (periods.length === 0) {
      throw new Error(`找不到包含日期 ${targetDate} 的已打开会计期间`);
    }

    return periods[0];
  }

  /**
   * 加载系统配置到内存
   */
  static async loadConfigurations() {
    await financeConfig.loadFromDatabase(db);
  }

  /**
   * 生成业务单据编号
   */
  static async generateInvoiceNumber(prefix, connection) {
    const CodeGeneratorService = require('../business/CodeGeneratorService');
    const businessType = prefix === 'AR' ? 'ar_invoice' : 'ap_invoice';
    return await CodeGeneratorService.nextCode(businessType, connection);
  }

  // ==================== 销售模块集成 ====================

  /**
   * 从销售订单自动生成应收发票
   */
  static async generateARInvoiceFromSalesOrder(salesOrder) {
    const autoGenerate = await SystemConfigService.get('auto_generate_ar_invoice', true);
    if (!autoGenerate) return { skipped: true, message: '功能已关闭' };

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
      const receivableAccountId = accountIds.ACCOUNTS_RECEIVABLE;
      const incomeAccountId = accountIds.SALES_REVENUE;

      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AR', connection);

      const [orderItems] = await connection.execute(
        `SELECT soi.material_id, soi.quantity, soi.unit_price, m.name as material_name, m.code as material_code
         FROM sales_order_items soi
         LEFT JOIN materials m ON soi.material_id = m.id
         WHERE soi.order_id = ?`,
        [salesOrder.id]
      );

      if (orderItems.length === 0) {
        await connection.rollback();
        return { skipped: true, message: '订单无明细' };
      }

      // ✅ 精度修复：使用整数运算避免浮点累加误差（与 GLService 对齐）
      const totalAmount = orderItems.reduce((sum, item) => {
        return sum + Math.round(parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0) * 100);
      }, 0) / 100;

      const paymentTermDays = financeConfig.get('invoice.defaultPaymentTermDays', 30);
      const invoiceDate = new Date();
      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + paymentTermDays);
      const invoiceDateStr = invoiceDate.toISOString().split('T')[0];
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const createdByIdentifier = financeConfig.get('system.defaultCreator', 'system');
      const createdBy = await getUserIdByIdentifier(connection, createdByIdentifier);

      const invoiceData = {
        invoice_number: invoiceNumber,
        customer_id: salesOrder.customer_id || null,
        invoice_date: invoiceDateStr,
        due_date: dueDate.toISOString().split('T')[0],
        total_amount: totalAmount,
        currency_code: salesOrder.currency || financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: salesOrder.exchange_rate || financeConfig.get('invoice.defaultExchangeRate', 1.0),
        status: '已确认',
        terms: financeConfig.get('invoice.defaultPaymentTermsText', '30天付款'),
        notes: `由销售订单 ${salesOrder.order_no} 自动生成`,
        source_type: 'sales_order',
        source_id: salesOrder.id || null,
        customer_name: salesOrder.customer_name || null,
        gl_entry: {
          period_id: currentPeriod?.id ?? null,
          receivable_account_id: receivableAccountId,
          income_account_id: incomeAccountId,
          created_by: createdBy,
        },
      };

      const invoiceItems = orderItems.map(item => ({
        product_id: item.material_id,
        product_name: item.material_name || item.material_code,
        description: `销售商品 ${item.material_name || item.material_code}`,
        quantity: parseFloat(item.quantity || 0),
        unit_price: parseFloat(item.unit_price || 0),
        amount: parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0),
      }));

      invoiceData.items = invoiceItems;
      const invoiceId = await arModel.createInvoice(invoiceData, connection);
      await connection.commit();
      return { invoiceId, invoiceNumber, amount: totalAmount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成销售红字发票
   */
  static async generateARCreditNoteFromSalesReturn(salesReturn) {
    const autoGenerate = await SystemConfigService.get('auto_generate_ar_credit_note', true);
    if (!autoGenerate) return { skipped: true, message: '功能已关闭' };

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
      const receivableAccountId = accountIds.ACCOUNTS_RECEIVABLE;
      const incomeAccountId = accountIds.SALES_REVENUE;

      let customerId = salesReturn.customer_id;
      let customerName = salesReturn.customer_name;
      if (!customerId && salesReturn.order_id) {
        const [orderRows] = await connection.execute(
          `SELECT so.customer_id, c.name AS customer_name
           FROM sales_orders so
           LEFT JOIN customers c ON so.customer_id = c.id
           WHERE so.id = ?`,
          [salesReturn.order_id]
        );
        if (orderRows.length > 0) {
          customerId = orderRows[0].customer_id;
          customerName = orderRows[0].customer_name || customerName;
        }
      }
      if (!customerId) {
        await connection.rollback();
        return { skipped: true, message: '无法获取客户信息' };
      }

      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AR', connection);

      const [returnItems] = await connection.execute(
        `SELECT sri.product_id as material_id, m.name as material_name, m.code as material_code,
                sri.quantity as return_quantity,
                COALESCE(soi.unit_price, m.price, 0) AS unit_price
         FROM sales_return_items sri
         LEFT JOIN materials m ON sri.product_id = m.id
         LEFT JOIN sales_returns sr ON sri.return_id = sr.id
         LEFT JOIN sales_orders so ON sr.order_id = so.id
         LEFT JOIN sales_order_items soi ON so.id = soi.order_id AND sri.product_id = soi.material_id
         WHERE sri.return_id = ?`,
        [salesReturn.id]
      );

      if (returnItems.length === 0) {
        await connection.rollback();
        return { skipped: true, message: '无物料明细' };
      }

      // ✅ 精度修复：整数运算
      const totalAmount = returnItems.reduce((sum, item) => sum + Math.round(parseFloat(item.return_quantity || 0) * parseFloat(item.unit_price || 0) * 100), 0) / 100;
      const creditNoteAmount = -Math.abs(totalAmount);
      if (totalAmount === 0) {
        await connection.rollback();
        return { skipped: true, message: '退货金额为0' };
      }

      const invoiceDate = salesReturn.return_date ? new Date(salesReturn.return_date) : new Date();
      const invoiceDateStr = invoiceDate.toISOString().split('T')[0];
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);

      const invoiceData = {
        invoice_number: invoiceNumber,
        customer_id: customerId || null,
        invoice_date: invoiceDateStr,
        due_date: invoiceDateStr,
        total_amount: creditNoteAmount,
        currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: 1.0,
        status: '已确认',
        notes: `【红字发票】销售退货单 ${salesReturn.return_no} 冲减`,
        source_type: 'sales_return',
        source_id: salesReturn.id || null,
        customer_name: customerName || null,
        gl_entry: { period_id: currentPeriod?.id ?? null, receivable_account_id: receivableAccountId, income_account_id: incomeAccountId },
        items: returnItems.map(item => ({
          product_id: item.material_id,
          product_name: item.material_name || item.material_code,
          description: `退货冲减 ${item.material_name || item.material_code}`,
          quantity: -parseFloat(item.return_quantity || 0),
          unit_price: parseFloat(item.unit_price || 0),
          amount: -parseFloat(item.return_quantity || 0) * parseFloat(item.unit_price || 0),
        }))
      };

      const invoiceId = await arModel.createInvoice(invoiceData, connection);
      await connection.commit();
      return { invoiceId, invoiceNumber, amount: creditNoteAmount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 采购模块集成 ====================

  /**
   * 生成应付发票
   */
  static async generateAPInvoiceFromPurchaseReceipt(purchaseReceipt, userId = null) {
    const autoGenerate = await SystemConfigService.get('auto_generate_ap_invoice', true);
    if (!autoGenerate) return { skipped: true, message: '功能已关闭' };

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_PAYABLE', 'GR_IR']);
      const payableAccountId = accountIds.ACCOUNTS_PAYABLE;
      const purchaseCostAccountId = accountIds.GR_IR;
      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AP', connection);

      const [receiptItems] = await connection.execute(
        `SELECT pri.material_id, pri.qualified_quantity as quantity, COALESCE(poi.price, m.cost_price, m.price, 0) as price, m.name as material_name, m.code as material_code
         FROM purchase_receipt_items pri
         LEFT JOIN purchase_receipts pr ON pri.receipt_id = pr.id
         LEFT JOIN purchase_orders po ON pr.order_id = po.id
         LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND pri.material_id = poi.material_id
         LEFT JOIN materials m ON pri.material_id = m.id
         WHERE pri.receipt_id = ?`,
        [purchaseReceipt.id]
      );

      if (receiptItems.length === 0) {
        await connection.rollback();
        return { skipped: true, message: '无明细' };
      }

      // ✅ 精度修复：整数运算
      const totalAmount = receiptItems.reduce((sum, item) => sum + Math.round(parseFloat(item.quantity || 0) * parseFloat(item.price || 0) * 100), 0) / 100;
      const invoiceDateStr = purchaseReceipt.receipt_date || new Date().toISOString().split('T')[0];
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);
      const createdBy = await getUserIdByIdentifier(connection, userId || purchaseReceipt.operator || 'system');

      const invoiceData = {
        invoice_number: invoiceNumber,
        supplier_id: purchaseReceipt.supplier_id || null,
        invoice_date: invoiceDateStr,
        due_date: invoiceDateStr,
        total_amount: totalAmount,
        currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: 1.0,
        status: '已确认',
        notes: `由采购入库单 ${purchaseReceipt.receipt_no} 自动生成`,
        source_type: 'purchase_receipt',
        source_id: purchaseReceipt.id || null,
        supplier_name: purchaseReceipt.supplier_name || null,
        gl_entry: { period_id: currentPeriod?.id ?? null, payable_account_id: payableAccountId, purchase_cost_account_id: purchaseCostAccountId, created_by: createdBy },
        items: receiptItems.map(item => ({
          material_id: item.material_id,
          material_name: item.material_name || item.material_code,
          description: `采购物资 ${item.material_name || item.material_code}`,
          quantity: parseFloat(item.quantity || 0),
          unit_price: parseFloat(item.price || 0),
          amount: parseFloat(item.quantity || 0) * parseFloat(item.price || 0),
        }))
      };

      const invoiceId = await apModel.createInvoice(invoiceData, connection);
      await connection.commit();
      return { invoiceId, invoiceNumber, amount: totalAmount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成采购红字发票
   */
  static async generateAPCreditNoteFromPurchaseReturn(purchaseReturn, externalConn = null) {
    const autoGenerate = await SystemConfigService.get('auto_generate_ap_credit_note', true);
    if (!autoGenerate) return { skipped: true, message: '功能已关闭' };

    const isExternalConn = !!externalConn;
    const connection = externalConn || await db.pool.getConnection();
    try {
      if (!isExternalConn) await connection.beginTransaction();
      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_PAYABLE', 'GR_IR']);
      const payableAccountId = accountIds.ACCOUNTS_PAYABLE;
      const purchaseCostAccountId = accountIds.GR_IR;
      await this.loadConfigurations();

      const invoiceNumber = await this.generateInvoiceNumber('AP', connection);

      const [returnItems] = await connection.execute(
        `SELECT pri.material_id, pri.material_name, pri.material_code,
                pri.return_quantity, pri.price,
                COALESCE(pri.price, poi.price, m.cost_price, m.price, 0) AS unit_price
         FROM purchase_return_items pri
         LEFT JOIN purchase_returns pr ON pri.return_id = pr.id
         LEFT JOIN purchase_receipts prec ON pr.receipt_id = prec.id
         LEFT JOIN purchase_orders po ON prec.order_id = po.id
         LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND pri.material_id = poi.material_id
         LEFT JOIN materials m ON pri.material_id = m.id
         WHERE pri.return_id = ?`,
        [purchaseReturn.id]
      );

      if (returnItems.length === 0) {
        if (!isExternalConn) await connection.rollback();
        return { skipped: true, message: '无明细' };
      }

      // ✅ 精度修复：整数运算
      const totalAmount = returnItems.reduce((sum, item) => sum + Math.round(parseFloat(item.return_quantity || 0) * parseFloat(item.unit_price || 0) * 100), 0) / 100;
      const creditNoteAmount = -Math.abs(totalAmount);
      if (totalAmount === 0) {
        if (!isExternalConn) await connection.rollback();
        return { skipped: true, message: '金额为0' };
      }

      const invoiceDateStr = (purchaseReturn.return_date ? new Date(purchaseReturn.return_date) : new Date()).toISOString().split('T')[0];
      const currentPeriod = await this.getCurrentPeriod(connection, invoiceDateStr);

      const invoiceData = {
        invoice_number: invoiceNumber,
        supplier_id: purchaseReturn.supplier_id || null,
        invoice_date: invoiceDateStr,
        due_date: invoiceDateStr,
        total_amount: creditNoteAmount,
        currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
        exchange_rate: 1.0,
        status: '已确认',
        notes: `【红字发票】采购退货单 ${purchaseReturn.return_no} 冲减`,
        source_type: 'purchase_return',
        source_id: purchaseReturn.id || null,
        supplier_name: purchaseReturn.supplier_name || null,
        gl_entry: { period_id: currentPeriod?.id ?? null, payable_account_id: payableAccountId, purchase_cost_account_id: purchaseCostAccountId },
        items: returnItems.map(item => ({
          material_id: item.material_id,
          material_name: item.material_name || item.material_code,
          description: `退货冲减 ${item.material_name || item.material_code}`,
          quantity: -parseFloat(item.return_quantity || 0),
          unit_price: parseFloat(item.unit_price || 0),
          amount: -parseFloat(item.return_quantity || 0) * parseFloat(item.unit_price || 0),
        }))
      };

      const invoiceId = await apModel.createInvoice(invoiceData, connection);
      if (!isExternalConn) await connection.commit();
      return { invoiceId, invoiceNumber, amount: creditNoteAmount };
    } catch (error) {
      if (!isExternalConn) await connection.rollback();
      throw error;
    } finally {
      if (!isExternalConn) connection.release();
    }
  }

  // ==================== 销售成本分录生成 ====================

  /**
   * 生成销售成本结转分录
   */
  static async generateCostEntryFromSalesOutbound(salesOutbound) {
    const autoGenerate = await SystemConfigService.get('auto_generate_sales_cost_entry', true);
    if (!autoGenerate) return { skipped: true, message: '功能已关闭' };

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();


      // 批量解析科目ID（1次查询替代4次）
      const accountIds = await this.resolveAccountIds(['COST_OF_GOODS_SOLD', 'INVENTORY']);
      const cogsAccountId = accountIds.COST_OF_GOODS_SOLD;
      const inventoryAccountId = accountIds.INVENTORY;

      const [outboundItems] = await connection.execute(
        `SELECT soi.product_id, soi.quantity, m.cost_price, m.price, m.name as material_name
         FROM sales_outbound_items soi 
         LEFT JOIN materials m ON soi.product_id = m.id
         WHERE soi.outbound_id = ?`,
        [salesOutbound.id]
      );

      if (outboundItems.length === 0) {
        await connection.rollback();
        return { skipped: true, message: '无明细' };
      }

      // ✅ 精度修复：整数运算
      const totalCost = outboundItems.reduce((sum, item) => sum + Math.round(parseFloat(item.quantity || 0) * parseFloat(item.cost_price || item.price || 0) * 100), 0) / 100;
      if (totalCost <= 0) {
        await connection.rollback();
        return { skipped: true, message: '成本为0' };
      }

      const currentPeriod = await this.getCurrentPeriod(connection, salesOutbound.delivery_date || new Date().toISOString().split('T')[0]);
      const createdBy = await getUserIdByIdentifier(connection, salesOutbound.created_by || 'system');

      const entryData = {
        period_id: currentPeriod.id || null,
        entry_date: salesOutbound.delivery_date || new Date().toISOString().split('T')[0],
        document_type: 'sales_outbound',
        document_number: salesOutbound.outbound_no || null,
        description: `销售成本结转 - 销售出库单 ${salesOutbound.outbound_no}`,
        created_by: createdBy || null,
      };

      const entryItems = [
        { account_id: cogsAccountId, debit_amount: totalCost, credit_amount: 0, description: `销售成本 - ${salesOutbound.outbound_no}` },
        { account_id: inventoryAccountId, debit_amount: 0, credit_amount: totalCost, description: `库存减少 - ${salesOutbound.outbound_no}` },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);
      const [entries] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [entryId]);
      const entryNumber = entries.length > 0 ? entries[0].entry_number : null;

      // 自动凭证在同一事务中立即标记过账（期间状态已由 getCurrentPeriod 在事务开头校验，无需走 postEntry 校验）
      await connection.execute('UPDATE gl_entries SET is_posted = 1 WHERE id = ?', [entryId]);
      await connection.commit();

      return { entryId, entryNumber, amount: totalCost };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 税务发票生成 ====================

  /**
   * 生成销项发票
   */
  static async generateOutputTaxInvoiceFromSalesOutbound(salesOutbound, userId = null) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();


      const invoiceNumber = `待补录-${salesOutbound.outbound_no}`;

      // 查询出库明细，并回溯订单明细获取售价（出库单 price 可能为0）
      const [outboundItems] = await connection.execute(
        `SELECT soi.quantity, 
                COALESCE(NULLIF(soi.price, 0), soitm.unit_price, m.price, 0) AS price
         FROM sales_outbound_items soi
         LEFT JOIN sales_outbound so ON soi.outbound_id = so.id
         LEFT JOIN sales_order_items soitm ON so.order_id = soitm.order_id AND soi.product_id = soitm.material_id
         LEFT JOIN materials m ON soi.product_id = m.id
         WHERE soi.outbound_id = ?`,
        [salesOutbound.id]
      );

      // ✅ 精度修复：整数运算
      const amountExcludingTax = outboundItems.reduce((sum, item) => sum + Math.round(parseFloat(item.quantity || 0) * parseFloat(item.price || 0) * 100), 0) / 100;
      // 从财务设置获取税率（前端设置的小数格式，如 0.13 = 13%）
      await this.loadConfigurations();
      const taxRate = financeConfig.get('tax.defaultVATRate', 0.13);
      const taxRatePercent = taxRate * 100; // 用于存储显示
      const taxAmount = amountExcludingTax * taxRate;
      const totalAmount = amountExcludingTax + taxAmount;

      const invoiceData = {
        invoice_type: '销项',
        invoice_number: invoiceNumber,
        invoice_code: null,
        invoice_date: salesOutbound.outbound_date || new Date().toISOString().split('T')[0],
        customer_id: salesOutbound.customer_id || null,
        supplier_id: null,
        supplier_or_customer_name: salesOutbound.customer_name || null,
        supplier_tax_number: null,
        amount_excluding_tax: amountExcludingTax.toFixed(2),
        tax_rate: taxRatePercent,
        tax_amount: taxAmount.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        status: '未认证',
        related_document_type: '销售出库单',
        related_document_id: salesOutbound.id,
        remark: `自动生成 - 销售出库单: ${salesOutbound.outbound_no}`,
        created_by: userId || salesOutbound.created_by || 0,
      };

      const invoiceId = await taxModel.createTaxInvoice(invoiceData, connection);
      await connection.commit();
      return { invoiceId, invoiceNumber, totalAmount: totalAmount.toFixed(2) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 生成进项发票
   */
  static async generateInputTaxInvoiceFromPurchaseReceipt(purchaseReceipt, userId = null) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();


      const invoiceNumber = `待补录-${purchaseReceipt.receipt_no}`;

      const [receiptItems] = await connection.execute(
        `SELECT pri.qualified_quantity, COALESCE(poi.price, m.cost_price, m.price, 0) as price
         FROM purchase_receipt_items pri
         JOIN purchase_receipts pr ON pri.receipt_id = pr.id
         LEFT JOIN purchase_orders po ON pr.order_id = po.id
         LEFT JOIN purchase_order_items poi ON po.id = poi.order_id AND pri.material_id = poi.material_id
         LEFT JOIN materials m ON pri.material_id = m.id
         WHERE pri.receipt_id = ?`,
        [purchaseReceipt.id]
      );

      // ✅ 精度修复：整数运算
      const amountExcludingTax = receiptItems.reduce((sum, item) => sum + Math.round(parseFloat(item.qualified_quantity || 0) * parseFloat(item.price || 0) * 100), 0) / 100;
      // 从财务设置获取税率（前端设置的小数格式，如 0.13 = 13%）
      await this.loadConfigurations();
      const taxRate = financeConfig.get('tax.defaultVATRate', 0.13);
      const taxRatePercent = taxRate * 100; // 用于存储显示
      const taxAmount = amountExcludingTax * taxRate;
      const totalAmount = amountExcludingTax + taxAmount;

      const invoiceData = {
        invoice_type: '进项',
        invoice_number: invoiceNumber,
        invoice_code: null,
        invoice_date: purchaseReceipt.receipt_date || new Date().toISOString().split('T')[0],
        supplier_id: purchaseReceipt.supplier_id || null,
        customer_id: null,
        supplier_or_customer_name: purchaseReceipt.supplier_name || null,
        supplier_tax_number: null,
        amount_excluding_tax: amountExcludingTax.toFixed(2),
        tax_rate: taxRatePercent,
        tax_amount: taxAmount.toFixed(2),
        total_amount: totalAmount.toFixed(2),
        status: '未认证',
        related_document_type: '采购入库单',
        related_document_id: purchaseReceipt.id,
        remark: `自动生成 - 采购入库单: ${purchaseReceipt.receipt_no}`,
        created_by: userId || purchaseReceipt.created_by || 0,
      };

      const invoiceId = await taxModel.createTaxInvoice(invoiceData, connection);
      await connection.commit();
      return { invoiceId, invoiceNumber, totalAmount: totalAmount.toFixed(2) };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 外委加工分录生成 ====================
  // (外委发料分录在这一版本被精简或与当前无需防重复的核心功能保持一致)

  // ==================== 销售换货差价分录生成 ====================
  /**
   * 根据换货单生成差价财务分录
   * - 差价 = 0：等值换货，不生成凭证
   * - 差价 > 0（换出更贵）：借 应收账款，贷 销售收入
   * - 差价 < 0（退回更贵）：借 销售收入，贷 应收账款
   */
  static async generateExchangeDifferenceEntry(salesExchange) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();


      const exchangeNo = salesExchange.exchange_no;

      // 查询差价金额（从主表获取）
      const differenceAmount = parseFloat(salesExchange.difference_amount || 0);

      // 等值换货无需生成凭证
      if (differenceAmount === 0) {
        logger.info(`换货单 ${exchangeNo} 为等值换货（差价=0），无需生成财务分录`);
        await connection.rollback();
        return null;
      }

      const absDiff = Math.abs(differenceAmount);

      // 批量解析科目ID（1次查询替代2次）
      let description;
      const accountIds = await this.resolveAccountIds(['ACCOUNTS_RECEIVABLE', 'SALES_REVENUE']);
      let debitAccountId, creditAccountId;

      if (differenceAmount > 0) {
        // 换出更贵 → 客户应补差价
        debitAccountId = accountIds.ACCOUNTS_RECEIVABLE;
        creditAccountId = accountIds.SALES_REVENUE;
        description = `销售换货补差价 - 换货单: ${exchangeNo}`;
      } else {
        // 退回更贵 → 应退客户差价
        debitAccountId = accountIds.SALES_REVENUE;
        creditAccountId = accountIds.ACCOUNTS_RECEIVABLE;
        description = `销售换货退差价 - 换货单: ${exchangeNo}`;
      }

      // 获取会计期间
      const now = new Date().toISOString().split('T')[0];
      let currentPeriod;
      try {
        currentPeriod = await this.getCurrentPeriod(connection, now);
      } catch (e) {
        logger.warn(`换货差价分录: 无可用会计期间 - ${e.message}`);
        await connection.rollback();
        return null;
      }

      const createdBy = salesExchange.created_by || 0;

      // 使用标准的 GL 分录模式（头表 + 明细表）
      const entryData = {
        period_id: currentPeriod?.id ?? null,
        entry_date: now,
        document_type: 'sales_exchange',
        document_number: exchangeNo,
        description: description,
        created_by: createdBy,
      };

      const entryItems = [
        { account_id: debitAccountId, debit_amount: absDiff, credit_amount: 0, description: `借方 - ${description}` },
        { account_id: creditAccountId, debit_amount: 0, credit_amount: absDiff, description: `贷方 - ${description}` },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      // 标记为已过账
      // 自动凭证在同一事务中立即标记过账（期间状态已由 getCurrentPeriod 在事务开头校验，无需走 postEntry 校验）
      await connection.execute('UPDATE gl_entries SET is_posted = 1 WHERE id = ?', [entryId]);

      await connection.commit();
      logger.info(`✅ 换货差价分录生成成功 - ${exchangeNo}: ${differenceAmount > 0 ? '补差价' : '退差价'} ¥${absDiff}`);
      return { entryId, exchangeNo, differenceAmount, type: differenceAmount > 0 ? 'supplement' : 'refund' };
    } catch (error) {
      await connection.rollback();
      logger.error(`换货差价分录生成失败 - ${salesExchange.exchange_no}:`, error.message);
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 外委加工模块集成 ====================

  /**
   * 外委发料自动生成会计分录
   * 借：委托加工物资 (1408)
   * 贷：原材料 (1403)
   *
   * @param {Object} processing - 加工单数据（含 processing_no, id 等）
   * @param {Array} materials - 物料明细（含 material_id, material_name, quantity, unit_price 等）
   * @returns {Object} { success, entryId } 或 { skipped, message }
   */
  static async generateOutsourcedIssueEntry(processing, materials) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 批量解析科目ID（1次查询）
      const accountIds = await this.resolveAccountIds(['OUTSOURCED_MATERIALS', 'RAW_MATERIALS']);
      const outsourcedAccountId = accountIds.OUTSOURCED_MATERIALS;
      const rawMaterialAccountId = accountIds.RAW_MATERIALS;


      // 计算发料总金额（精度修复：整数运算）
      const totalAmount = materials.reduce((sum, item) => {
        return sum + Math.round(
          parseFloat(item.quantity || 0) * parseFloat(item.unit_price || item.price || 0) * 100
        );
      }, 0) / 100;

      if (totalAmount <= 0) {
        await connection.rollback();
        return { success: false, skipped: true, message: '发料金额为0' };
      }

      // 获取会计期间
      const now = new Date().toISOString().split('T')[0];
      const currentPeriod = await this.getCurrentPeriod(connection, now);
      const createdBy = processing.created_by || 0;

      // 构建 GL 分录
      const entryData = {
        period_id: currentPeriod.id || null,
        entry_date: now,
        posting_date: now,
        document_type: 'outsourced_issue',
        document_number: processing.processing_no,
        description: `外委发料 - 加工单: ${processing.processing_no}`,
        created_by: createdBy,
      };

      const entryItems = [
        {
          account_id: outsourcedAccountId,
          debit_amount: totalAmount,
          credit_amount: 0,
          description: `委托加工物资增加 - ${processing.processing_no}`,
        },
        {
          account_id: rawMaterialAccountId,
          debit_amount: 0,
          credit_amount: totalAmount,
          description: `原材料减少（外委发料） - ${processing.processing_no}`,
        },
      ];

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);
      await connection.commit();

      logger.info(`✅ 外委发料分录生成成功 - 加工单: ${processing.processing_no}, 金额: ${totalAmount}`);
      return { success: true, entryId, amount: totalAmount };
    } catch (error) {
      await connection.rollback();
      logger.error(`外委发料分录生成失败 - ${processing.processing_no}:`, error.message);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }

  /**
   * 外委收货入库自动生成会计分录
   * 借：库存商品 (1405)  — 物料成本 + 加工费
   * 贷：委托加工物资 (1408)  — 原物料成本
   * 贷：应付账款 (2202)  — 加工费部分
   *
   * @param {Object} receipt - 入库单数据（含 receipt_no, processing_id 等）
   * @param {Array} items - 入库明细（含 product_id, actual_quantity, unit_price, total_price 等）
   * @returns {Object} { success, entryId } 或 { skipped, message }
   */
  static async generateOutsourcedReceiptEntry(receipt, items) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 批量解析科目ID（1次查询）
      const accountIds = await this.resolveAccountIds([
        'INVENTORY_GOODS', 'OUTSOURCED_MATERIALS', 'ACCOUNTS_PAYABLE'
      ]);
      const inventoryAccountId = accountIds.INVENTORY_GOODS;
      const outsourcedAccountId = accountIds.OUTSOURCED_MATERIALS;
      const payableAccountId = accountIds.ACCOUNTS_PAYABLE;

      const receiptNo = receipt.receipt_no || `OPR-${receipt.processing_id}`;


      // 计算入库总加工费（精度修复：整数运算）
      const totalProcessingFee = (items || []).reduce((sum, item) => {
        return sum + Math.round(
          parseFloat(item.actual_quantity || 0) * parseFloat(item.unit_price || 0) * 100
        );
      }, 0) / 100;

      // 获取外委发料时的物料成本
      let materialCost = 0;
      if (receipt.processing_id) {
        const [materialRows] = await connection.execute(
          `SELECT COALESCE(SUM(opm.quantity * COALESCE(m.cost_price, m.price, 0)), 0) AS total_cost
           FROM outsourced_processing_materials opm
           LEFT JOIN materials m ON opm.material_id = m.id
           WHERE opm.processing_id = ?`,
          [receipt.processing_id]
        );
        materialCost = parseFloat(materialRows[0]?.total_cost || 0);
      }

      const totalInventoryValue = materialCost + totalProcessingFee;

      if (totalInventoryValue <= 0) {
        await connection.rollback();
        return { success: false, skipped: true, message: '入库价值为0' };
      }

      // 获取会计期间
      const now = new Date().toISOString().split('T')[0];
      const currentPeriod = await this.getCurrentPeriod(connection, now);

      // 构建 GL 分录
      const entryData = {
        period_id: currentPeriod.id || null,
        entry_date: now,
        posting_date: now,
        document_type: 'outsourced_receipt',
        document_number: receiptNo,
        description: `外委收货入库 - 入库单: ${receiptNo}`,
        created_by: receipt.operator || 0,
      };

      const entryItems = [
        // 借：库存商品（物料成本 + 加工费）
        {
          account_id: inventoryAccountId,
          debit_amount: totalInventoryValue,
          credit_amount: 0,
          description: `库存商品增加（外委入库） - ${receiptNo}`,
        },
      ];

      // 贷：委托加工物资（物料成本部分）
      if (materialCost > 0) {
        entryItems.push({
          account_id: outsourcedAccountId,
          debit_amount: 0,
          credit_amount: materialCost,
          description: `委托加工物资减少 - ${receiptNo}`,
        });
      }

      // 贷：应付账款（加工费部分）
      if (totalProcessingFee > 0) {
        entryItems.push({
          account_id: payableAccountId,
          debit_amount: 0,
          credit_amount: totalProcessingFee,
          description: `应付加工费 - ${receiptNo}`,
        });
      }

      const entryId = await financeModel.createEntry(entryData, entryItems, connection);
      await connection.commit();

      logger.info(`✅ 外委入库分录生成成功 - 入库单: ${receiptNo}, 物料成本: ${materialCost}, 加工费: ${totalProcessingFee}`);
      return { success: true, entryId, materialCost, processingFee: totalProcessingFee, totalValue: totalInventoryValue };
    } catch (error) {
      await connection.rollback();
      logger.error(`外委入库分录生成失败 - ${receipt.receipt_no}:`, error.message);
      return { success: false, error: error.message };
    } finally {
      connection.release();
    }
  }
}

module.exports = FinanceIntegrationService;
