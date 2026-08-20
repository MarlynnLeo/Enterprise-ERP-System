/**
 * InventoryCostService.js
 * @description 库存成本自动化服务
 * @date 2025-08-27
 * @version 2.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const financeModel = require('../../models/finance');
const {
  DOCUMENT_TYPE_MAPPING,
  ENTRY_NUMBER_PREFIX,
  ERROR_MESSAGES,
} = require('../../constants/financeConstants');
const { accountingConfig } = require('../../config/accountingConfig');
const { currentDateString, toLocalDateString } = require('../../utils/dateUtils');
const { financeConfig } = require('../../config/financeConfig');
const Precision = require('../../utils/precision');

/**
 * 库存成本自动化服务
 * 处理库存变动时的成本分录自动生成
 */
class InventoryCostService {
  static calculateMacFromBalances(balances, fallbackUnitCost) {
    const totals = (balances || []).reduce(
      (result, balance) => ({
        quantity: Precision.add(result.quantity, parseFloat(balance.quantity) || 0),
        value: Precision.add(result.value, parseFloat(balance.total_value) || 0),
      }),
      { quantity: 0, value: 0 }
    );

    if (totals.quantity > 0 && totals.value > 0) {
      return Precision.div(totals.value, totals.quantity);
    }
    return parseFloat(fallbackUnitCost) || 0;
  }

  static isProductionIssueTransaction(transaction = {}) {
    const transactionType = transaction.transaction_type || transaction.transactionType;
    const referenceType = transaction.reference_type || transaction.referenceType;
    return (
      transactionType === 'production_outbound' ||
      referenceType === 'production_task' ||
      referenceType === 'production_plan' ||
      referenceType === 'batch_production_tasks'
    );
  }

  static isSalesOutboundTransaction(transaction = {}) {
    const transactionType = transaction.transaction_type || transaction.transactionType;
    const referenceType = transaction.reference_type || transaction.referenceType;
    return transactionType === 'sales_outbound' || referenceType === 'sales_outbound';
  }

  /**
   * 库存入库时自动生成成本分录
   * @param {Object} transaction 库存交易记录
   * @param {Object} context 上下文信息 { userId, periodId }
   * @returns {Promise<Object>} 分录创建结果
   */
  static async generateInboundCostEntry(transaction, context = {}) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 验证并获取物料信息
      const material = await this.getMaterialInfo(connection, transaction.material_id);
      const accountingDate = toLocalDateString(
        transaction.transaction_date || transaction.date || currentDateString()
      );
      const documentNumber = `${transaction.reference_no || transaction.id || 'IN'}-M${transaction.material_id}`;
      const existingEntry = await this.findExistingActiveGlEntry(
        connection,
        DOCUMENT_TYPE_MAPPING.INVENTORY_INBOUND,
        documentNumber
      );
      if (existingEntry) {
        await connection.commit();
        return {
          skipped: true,
          entryId: existingEntry.id,
          entryNumber: existingEntry.entry_number,
          message: 'Inventory inbound cost entry already exists',
        };
      }

      // 2. 计算成本
      // ✅ 优先使用流水传入的实际账单价格 (如采购价/生产成本价)，若无则回退至移动加权平均价或静态参考价
      const inboundUnitCost = transaction.unit_cost !== undefined ? parseFloat(transaction.unit_cost) : parseFloat(material.cost_price || 0);
      const inboundQty = parseFloat(transaction.quantity) || 0;
      const totalCost = Precision.round2(Precision.mul(inboundQty, inboundUnitCost));

      if (!(inboundQty > 0)) {
        throw new Error(`物料 ${material.code} 入库数量必须大于 0，不能生成成本分录`);
      }
      if (!(totalCost > 0)) {
        throw new Error(
          `物料 ${material.code} 入库成本必须大于 0，请先维护采购单价、入库单价或物料成本价`
        );
      }

      // ==========================================
      // [新增] 实施移动加权平均成本 (MAC) 闭环更新
      // ==========================================
      const oldCostPrice = parseFloat(material.cost_price || 0);
      let newMac = inboundUnitCost;

      try {
        // 结存表已经包含本次库存变动，直接按结存数量和金额计算 MAC。
        const [stockBalances] = await connection.execute(
          `SELECT quantity, total_value
             FROM inventory_stock_balances
            WHERE material_id = ?
            FOR UPDATE`,
          [transaction.material_id]
        );
        newMac = this.calculateMacFromBalances(stockBalances, inboundUnitCost);

        // 回写到 materials 表 (确保其回归反映真实库存账面的职责)
        if (newMac > 0) {
          await connection.execute(
            'UPDATE materials SET cost_price = ? WHERE id = ? AND deleted_at IS NULL',
            [newMac.toFixed(4), transaction.material_id]
          );
          logger.info(
            `Material ${material.code} MAC updated: oldUnitCost=${oldCostPrice}, inboundUnitCost=${inboundUnitCost}, inboundQuantity=${inboundQty}, newUnitCost=${newMac.toFixed(4)}`
          );
        }
      } catch (macErr) {
        logger.error(`Failed to update material ${material.code} MAC price:`, macErr);
        // 不阻断凭证流程
      }

      // 3. 获取当前会计期间
      const periodId = context.periodId || (await this.getCurrentPeriodId(connection, accountingDate));

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber(connection, ENTRY_NUMBER_PREFIX.INVENTORY);

      // 5. 获取会计科目ID
      const referenceType = transaction.reference_type || transaction.transaction_type;
      const inventoryAccountId = await this.getInventoryAccountId(
        connection,
        transaction.material_id,
        referenceType
      );
      const sourceAccountId = await this.getSourceAccountId(connection, referenceType);

      // 6. 获取用户ID（如果传入的是用户名或姓名）
      const { resolveActorUserId } = require('../../utils/userUtils');
      const userId = await resolveActorUserId(connection, context.userId, context.created_by);

      // 7. 准备分录数据
      const entryData = {
        entry_number: entryNumber,
        entry_date: accountingDate,
        posting_date: accountingDate,
        document_type: DOCUMENT_TYPE_MAPPING.INVENTORY_INBOUND,
        document_number: documentNumber,
        period_id: periodId,
        description: `库存入库 - ${material.name} (${material.code})`,
        created_by: userId,
        status: 'posted',
        is_posted: 1,
      };

      // 8. 准备分录明细
      const entryItems = [
        // 借：库存商品/原材料
        {
          account_id: inventoryAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
          exchange_rate: 1,
          description: `入库 - ${material.name} ${transaction.quantity}${transaction.unit || '个'}`,
        },
        // 贷：应付账款/银行存款（根据入库类型）
        {
          account_id: sourceAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
          exchange_rate: 1,
          description: `入库来源 - ${material.name}`,
        },
      ];

      // 9. 创建会计分录
      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      await connection.commit();

      logger.debug(
        `库存入库成本分录创建成功: ${entryNumber}, 物料: ${material.name}, 金额: ${totalCost}`
      );

      return {
        entryId,
        entryNumber,
        totalCost,
        message: '库存入库成本分录生成成功',
      };
    } catch (error) {
      await connection.rollback();
      logger.error('生成库存入库成本分录失败:', {
        error: error.message,
        transaction,
        stack: error.stack,
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 库存出库时自动生成成本分录
   * @param {Object} transaction 库存交易记录
   * @param {Object} context 上下文信息 { userId, periodId }
   * @returns {Promise<Object>} 分录创建结果
   */
  static async generateOutboundCostEntry(transaction, context = {}) {
    if (this.isProductionIssueTransaction(transaction)) {
      return {
        skipped: true,
        message: 'Production material issue is posted by CostAccountingService',
      };
    }
    if (this.isSalesOutboundTransaction(transaction)) {
      return {
        skipped: true,
        message: 'Sales outbound cost is posted by FinanceIntegrationService',
      };
    }

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 验证并获取物料信息
      const material = await this.getMaterialInfo(connection, transaction.material_id);
      const accountingDate = toLocalDateString(
        transaction.transaction_date || transaction.date || currentDateString()
      );
      const documentNumber = `${transaction.reference_no || transaction.id || 'OUT'}-M${transaction.material_id}`;
      const existingEntry = await this.findExistingActiveGlEntry(
        connection,
        DOCUMENT_TYPE_MAPPING.INVENTORY_OUTBOUND,
        documentNumber
      );
      if (existingEntry) {
        await connection.commit();
        return {
          skipped: true,
          entryId: existingEntry.id,
          entryNumber: existingEntry.entry_number,
          message: 'Inventory outbound cost entry already exists',
        };
      }

      // 2. 计算成本
      // ✅ 出库同理，优先取透传价格，若无则取当下材料已被 MAC 算法维护好的 cost_price 移动加权均价
      const unitCost = transaction.unit_cost !== undefined ? parseFloat(transaction.unit_cost) : parseFloat(material.cost_price || 0);
      if (!(unitCost > 0)) {
        throw new Error(`物料 ${material.code} 出库单位成本必须大于 0，请先维护物料成本价`);
      }
      const totalCost = Precision.round2(Precision.mul(Math.abs(parseFloat(transaction.quantity) || 0), unitCost));

      if (!(totalCost > 0)) {
        throw new Error(`物料 ${material.code} 出库总成本必须大于 0，不能生成成本分录`);
      }

      // 3. 获取当前会计期间
      const periodId = context.periodId || (await this.getCurrentPeriodId(connection, accountingDate));

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber(connection, ENTRY_NUMBER_PREFIX.INVENTORY);

      // 5. 获取会计科目ID
      const referenceType = transaction.reference_type || transaction.transaction_type;
      const costAccountId = await this.getCostAccountId(connection, referenceType);
      const inventoryAccountId = await this.getInventoryAccountId(
        connection,
        transaction.material_id
      );

      // 6. 获取用户ID（如果传入的是用户名或姓名）
      const { resolveActorUserId } = require('../../utils/userUtils');
      const userId = await resolveActorUserId(connection, context.userId, context.created_by);

      // 7. 准备分录数据
      const entryData = {
        entry_number: entryNumber,
        entry_date: accountingDate,
        posting_date: accountingDate,
        document_type: DOCUMENT_TYPE_MAPPING.INVENTORY_OUTBOUND,
        document_number: documentNumber,
        period_id: periodId,
        description: `库存出库 - ${material.name} (${material.code})`,
        created_by: userId,
        status: 'posted',
        is_posted: 1,
      };

      // 8. 准备分录明细
      const entryItems = [
        // 借：销售成本/生产成本（根据出库类型）
        {
          account_id: costAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
          exchange_rate: 1,
          description: `出库成本 - ${material.name} ${Math.abs(transaction.quantity)}${transaction.unit || '个'}`,
        },
        // 贷：库存商品/原材料
        {
          account_id: inventoryAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          currency_code: financeConfig.get('invoice.defaultCurrency', 'CNY'),
          exchange_rate: 1,
          description: `出库 - ${material.name}`,
        },
      ];

      // 8. 创建会计分录
      const entryId = await financeModel.createEntry(entryData, entryItems, connection);

      await connection.commit();

      logger.debug(
        `库存出库成本分录创建成功: ${entryNumber}, 物料: ${material.name}, 金额: ${totalCost}`
      );

      return {
        entryId,
        entryNumber,
        totalCost,
        message: '库存出库成本分录生成成功',
      };
    } catch (error) {
      await connection.rollback();
      logger.error('生成库存出库成本分录失败:', {
        error: error.message,
        transaction,
        stack: error.stack,
      });
      throw error;
    } finally {
      connection.release();
    }
  }

  // ==================== 私有辅助方法 ====================

  /**
   * 获取物料信息
   * @private
   */
  static async getMaterialInfo(connection, materialId) {
    const [materials] = await connection.execute(
      'SELECT id, name, code, price, cost_price FROM materials WHERE id = ? AND deleted_at IS NULL',
      [materialId]
    );

    if (materials.length === 0) {
      throw new Error(`物料不存在: ID=${materialId}`);
    }

    return materials[0];
  }

  static async findExistingActiveGlEntry(connection, documentType, documentNumber) {
    if (!documentType || !documentNumber) return null;

    const [entries] = await connection.execute(
      `SELECT id, entry_number
       FROM gl_entries
       WHERE document_type = ?
         AND document_number = ?
         AND COALESCE(is_reversed, 0) = 0
       LIMIT 1
       FOR UPDATE`,
      [documentType, documentNumber]
    );

    return entries[0] || null;
  }

  /**
   * 获取当前会计期间ID
   * @private
   */
  static async getCurrentPeriodId(connection, date = currentDateString()) {
    const today = toLocalDateString(date);

    const [periods] = await connection.execute(
      'SELECT id FROM gl_periods WHERE start_date <= ? AND end_date >= ? AND is_closed = 0 LIMIT 1',
      [today, today]
    );

    if (periods.length === 0) {
      throw new Error(ERROR_MESSAGES.PERIOD_NOT_FOUND);
    }

    return periods[0].id;
  }

  /**
   * 获取库存科目ID
   * @private
   */
  static async getInventoryAccountId(connection, _materialId = null, referenceType = null) {
    // 当前标准成本流程统一使用配置中心的库存商品科目。
    // 如果企业按物料分类分账，应在配置层增加分类映射后再扩展这里。
    await accountingConfig.loadFromDatabase(db);
    const accountKey = ['purchase_inbound', 'purchase_receipt', 'purchase_return'].includes(referenceType)
      ? 'RAW_MATERIALS'
      : 'INVENTORY_GOODS';
    const accountCode = accountingConfig.getAccountCode(accountKey);

    const [accounts] = await connection.execute(
      'SELECT id FROM gl_accounts WHERE account_code = ? LIMIT 1',
      [accountCode]
    );

    if (accounts.length === 0) {
      throw new Error(`${ERROR_MESSAGES.ACCOUNT_NOT_FOUND}: ${accountCode}`);
    }

    return accounts[0].id;
  }

  /**
   * 获取来源科目ID（入库时的贷方科目）
   * @private
   */
  static async getSourceAccountId(connection, referenceType) {
    // 从配置中获取科目编码
    await accountingConfig.loadFromDatabase(db);

    let accountKey;

    switch (referenceType) {
      case 'purchase_inbound':
      case 'purchase_receipt':
        accountKey = 'GR_IR'; // 应付暂估 / GR_IR
        break;
      case 'production_inbound':
        accountKey = 'PRODUCTION_COST'; // 生产成本
        break;
      case 'sales_return':
        accountKey = 'SALES_COST'; // 销售退货入库冲回主营业务成本
        break;
      case 'manual_in':
      case 'adjustment_in':
        accountKey = 'BANK_DEPOSIT'; // 银行存款
        break;
      default:
        accountKey = 'ACCOUNTS_PAYABLE'; // 默认应付账款
    }

    const accountCode = accountingConfig.getAccountCode(accountKey);

    const [accounts] = await connection.execute(
      'SELECT id FROM gl_accounts WHERE account_code = ? LIMIT 1',
      [accountCode]
    );

    if (accounts.length === 0) {
      throw new Error(`${ERROR_MESSAGES.ACCOUNT_NOT_FOUND}: ${accountCode}`);
    }

    return accounts[0].id;
  }

  /**
   * 获取成本科目ID（出库时的借方科目）
   * @private
   */
  static async getCostAccountId(connection, referenceType) {
    // 从配置中获取科目编码
    await accountingConfig.loadFromDatabase(db);

    let accountKey;

    switch (referenceType) {
      case 'purchase_return':
        accountKey = 'GR_IR'; // 采购退货出库借方科目：应付暂估
        break;
      case 'sales_outbound':
      case 'sale':
      case 'outbound': // 添加通用出库类型
        accountKey = 'SALES_COST'; // 销售成本
        break;
      case 'production_outbound':
        accountKey = 'PRODUCTION_COST'; // 生产成本
        break;
      case 'manual_out':
      case 'adjustment_out':
        accountKey = 'MANUFACTURING_EXPENSE'; // 制造费用
        break;
      default:
        accountKey = 'SALES_COST'; // 默认销售成本
    }

    const accountCode = accountingConfig.getAccountCode(accountKey);

    const [accounts] = await connection.execute(
      'SELECT id FROM gl_accounts WHERE account_code = ? LIMIT 1',
      [accountCode]
    );

    if (accounts.length === 0) {
      throw new Error(`${ERROR_MESSAGES.ACCOUNT_NOT_FOUND}: ${accountCode}`);
    }

    return accounts[0].id;
  }

  /**
   * 生成分录编号
   * @private
   */
  static async generateEntryNumber(connection, prefix) {
    const dateStr = currentDateString().replace(/-/g, '');

    const likePrefix = `${prefix}${dateStr}`;
    // 取序号部分的数值最大值（而非字典序/末3位），避免超 999 后重号或截断
    const [result] = await connection.execute(
      `SELECT MAX(CAST(SUBSTRING(entry_number, ?) AS UNSIGNED)) AS max_seq
       FROM gl_entries WHERE entry_number LIKE ? FOR UPDATE`,
      [likePrefix.length + 1, `${likePrefix}%`]
    );

    const maxSeq = result[0].max_seq || 0;
    const nextNo = `${likePrefix}${String(maxSeq + 1).padStart(3, '0')}`;

    return nextNo;
  }
}

module.exports = InventoryCostService;
