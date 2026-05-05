/**
 * InventoryCostService.js
 * @description 库存成本自动化服务
 * @date 2025-08-27
 * @version 2.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const financeModel = require('../../models/finance');
const { getUserIdByIdentifier } = require('../../utils/userUtils');
const {
  DOCUMENT_TYPE_MAPPING,
  ENTRY_NUMBER_PREFIX,
  ERROR_MESSAGES,
} = require('../../constants/financeConstants');
const { accountingConfig } = require('../../config/accountingConfig');

/**
 * 库存成本自动化服务
 * 处理库存变动时的成本分录自动生成
 */
class InventoryCostService {
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

      // 2. 计算成本
      // ✅ 优先使用流水传入的实际账单价格 (如采购价/生产成本价)，若无则回退至移动加权平均价或静态参考价
      const inboundUnitCost = transaction.unit_cost !== undefined ? parseFloat(transaction.unit_cost) : parseFloat(material.cost_price || material.price || 0);
      const inboundQty = parseFloat(transaction.quantity) || 0;
      const totalCost = inboundQty * inboundUnitCost;

      // ==========================================
      // [新增] 实施移动加权平均成本 (MAC) 闭环更新
      // ==========================================
      const oldCostPrice = parseFloat(material.cost_price || material.price || 0);
      let newMac = inboundUnitCost; // 默认 fallback

      try {
        // [H-4] 使用 FOR UPDATE 锁防止并发入库时 MAC 计算错误
        // 由于是异步任务或后续调用，台账里可能已经包含了本次插入的 quantity
        const [stockRes] = await connection.execute(
          'SELECT COALESCE(SUM(quantity), 0) as total_qty FROM inventory_ledger WHERE material_id = ? FOR UPDATE',
          [transaction.material_id]
        );
        const currentTotalQty = parseFloat(stockRes[0].total_qty) || 0;

        // 尝试推算出在本次入库发生前的那一刻，系统里还有多少库存
        // 退回逻辑：oldQty = 当前总数量 - 本次入库数量
        const oldQty = Math.max(0, currentTotalQty - inboundQty);

        if (oldQty > 0) {
          const oldTotalValue = oldQty * oldCostPrice;
          const newTotalQty = oldQty + inboundQty;
          newMac = (oldTotalValue + totalCost) / newTotalQty;
        }

        // 回写到 materials 表 (确保其回归反映真实库存账面的职责)
        if (newMac > 0) {
          await connection.execute(
            'UPDATE materials SET cost_price = ? WHERE id = ?',
            [newMac.toFixed(4), transaction.material_id]
          );
          logger.info(`🔥 物料 ${material.code} MAC(移动加权均价)更新完成: 旧单价=${oldCostPrice}, 旧存量=${oldQty}, 本次单价=${inboundUnitCost}, 本次数量=${inboundQty} => 新均价=${newMac.toFixed(4)}`);
        }
      } catch (macErr) {
        logger.error(`⚠️ 更新物料 ${material.code} MAC价格时发生异常:`, macErr);
        // 不阻断凭证流程
      }

      // 3. 获取当前会计期间
      const periodId = context.periodId || (await this.getCurrentPeriodId(connection));

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber(connection, ENTRY_NUMBER_PREFIX.INVENTORY);

      // 5. 获取会计科目ID
      const inventoryAccountId = await this.getInventoryAccountId(
        connection,
        transaction.material_id
      );
      const sourceAccountId = await this.getSourceAccountId(connection, transaction.reference_type);

      // 6. 获取用户ID（如果传入的是用户名或姓名）
      const userId = await getUserIdByIdentifier(connection, context.userId || 'system');

      // 7. 准备分录数据
      const entryData = {
        entry_number: entryNumber,
        entry_date: new Date().toISOString().split('T')[0],
        posting_date: new Date().toISOString().split('T')[0],
        document_type: DOCUMENT_TYPE_MAPPING.INVENTORY_INBOUND,
        document_number: transaction.reference_no,
        period_id: periodId,
        description: `库存入库 - ${material.name} (${material.code})`,
        created_by: userId,
      };

      // 8. 准备分录明细
      const entryItems = [
        // 借：库存商品/原材料
        {
          account_id: inventoryAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          currency_code: 'CNY',
          exchange_rate: 1,
          description: `入库 - ${material.name} ${transaction.quantity}${transaction.unit || '个'}`,
        },
        // 贷：应付账款/银行存款（根据入库类型）
        {
          account_id: sourceAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          currency_code: 'CNY',
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
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 验证并获取物料信息
      const material = await this.getMaterialInfo(connection, transaction.material_id);

      // 2. 计算成本
      // ✅ 出库同理，优先取透传价格，若无则取当下材料已被 MAC 算法维护好的 cost_price 移动加权均价
      const unitCost = transaction.unit_cost !== undefined ? parseFloat(transaction.unit_cost) : parseFloat(material.cost_price || material.price || 0);
      const totalCost = Math.abs(transaction.quantity) * unitCost;

      // 3. 获取当前会计期间
      const periodId = context.periodId || (await this.getCurrentPeriodId(connection));

      // 4. 生成分录编号
      const entryNumber = await this.generateEntryNumber(connection, ENTRY_NUMBER_PREFIX.INVENTORY);

      // 5. 获取会计科目ID
      const costAccountId = await this.getCostAccountId(connection, transaction.reference_type);
      const inventoryAccountId = await this.getInventoryAccountId(
        connection,
        transaction.material_id
      );

      // 6. 获取用户ID（如果传入的是用户名或姓名）
      const userId = await getUserIdByIdentifier(connection, context.userId || 'system');

      // 7. 准备分录数据
      const entryData = {
        entry_number: entryNumber,
        entry_date: new Date().toISOString().split('T')[0],
        posting_date: new Date().toISOString().split('T')[0],
        document_type: DOCUMENT_TYPE_MAPPING.INVENTORY_OUTBOUND,
        document_number: transaction.reference_no,
        period_id: periodId,
        description: `库存出库 - ${material.name} (${material.code})`,
        created_by: userId,
      };

      // 8. 准备分录明细
      const entryItems = [
        // 借：销售成本/生产成本（根据出库类型）
        {
          account_id: costAccountId,
          debit_amount: totalCost,
          credit_amount: 0,
          currency_code: 'CNY',
          exchange_rate: 1,
          description: `出库成本 - ${material.name} ${Math.abs(transaction.quantity)}${transaction.unit || '个'}`,
        },
        // 贷：库存商品/原材料
        {
          account_id: inventoryAccountId,
          debit_amount: 0,
          credit_amount: totalCost,
          currency_code: 'CNY',
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
      'SELECT id, name, code, price, cost_price FROM materials WHERE id = ?',
      [materialId]
    );

    if (materials.length === 0) {
      throw new Error(`物料不存在: ID=${materialId}`);
    }

    return materials[0];
  }

  /**
   * 获取当前会计期间ID
   * @private
   */
  static async getCurrentPeriodId(connection) {
    const today = new Date().toISOString().split('T')[0];

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
  static async getInventoryAccountId(connection) {
    // 当前标准成本流程统一使用配置中心的库存商品科目。
    // 如果企业按物料分类分账，应在配置层增加分类映射后再扩展这里。
    await accountingConfig.loadFromDatabase(db);
    const accountCode = accountingConfig.getAccountCode('INVENTORY_GOODS');

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
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const [result] = await connection.execute(
      'SELECT MAX(entry_number) as max_no FROM gl_entries WHERE entry_number LIKE ? FOR UPDATE',
      [`${prefix}${dateStr}%`]
    );

    const maxNo = result[0].max_no || `${prefix}${dateStr}000`;
    const nextNo = `${prefix}${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

    return nextNo;
  }
}

module.exports = InventoryCostService;
