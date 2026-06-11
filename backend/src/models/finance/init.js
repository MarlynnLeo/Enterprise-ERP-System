/**
 * finance/init.js
 * @description 系统初始化方法
 *              从 models/finance.js L1817-1937 提取
 * @date 2026-06-11
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');

module.exports = {
  /**
   * 初始化会计科目和会计期间
   */
  initializeGLAccounts: async () => {
    const conn = await db.pool.getConnection();
    try {
      await conn.beginTransaction();

      const { accountingConfig } = require('../../config/accountingConfig');
      await accountingConfig.loadFromDatabase(db);

      const accountDefinitions = [
        { key: 'CASH', name: '库存现金', type: '资产', isDebit: true },
        { key: 'BANK_DEPOSIT', name: '银行存款', type: '资产', isDebit: true },
        { key: 'OTHER_MONETARY_ASSETS', name: '其他货币资金', type: '资产', isDebit: true },
        { key: 'ACCOUNTS_RECEIVABLE', name: '应收账款', type: '资产', isDebit: true },
        { key: 'PREPAYMENTS', name: '预付账款', type: '资产', isDebit: true },
        { key: 'MATERIAL_PURCHASE', name: '材料采购', type: '资产', isDebit: true },
        { key: 'RAW_MATERIALS', name: '原材料', type: '资产', isDebit: true },
        { key: 'INVENTORY_GOODS', name: '库存商品', type: '资产', isDebit: true },
        { key: 'FINISHED_GOODS', name: '产成品', type: '资产', isDebit: true },
        { key: 'OUTSOURCED_MATERIALS', name: '委托加工物资', type: '资产', isDebit: true },
        { key: 'FIXED_ASSETS', name: '固定资产', type: '资产', isDebit: true },
        { key: 'ACCUMULATED_DEPRECIATION', name: '累计折旧', type: '资产', isDebit: false },
        {
          key: 'FIXED_ASSET_IMPAIRMENT_ALLOWANCE',
          name: '固定资产减值准备',
          type: '资产',
          isDebit: false,
        },
        { key: 'CONSTRUCTION_IN_PROGRESS', name: '在建工程', type: '资产', isDebit: true },
        { key: 'FIXED_ASSET_CLEARING', name: '固定资产清理', type: '资产', isDebit: true },
        { key: 'INTANGIBLE_ASSETS', name: '无形资产', type: '资产', isDebit: true },
        { key: 'ACCUMULATED_AMORTIZATION', name: '累计摊销', type: '资产', isDebit: false },
        { key: 'SHORT_TERM_LOANS', name: '短期借款', type: '负债', isDebit: false },
        { key: 'EMPLOYEE_PAYABLE', name: '应付职工薪酬', type: '负债', isDebit: false },
        { key: 'ACCOUNTS_PAYABLE', name: '应付账款', type: '负债', isDebit: false },
        { key: 'ADVANCE_RECEIPTS', name: '预收账款', type: '负债', isDebit: false },
        { key: 'TAX_PAYABLE', name: '应交税费', type: '负债', isDebit: false },
        { key: 'LONG_TERM_LOANS', name: '长期借款', type: '负债', isDebit: false },
        { key: 'PAID_IN_CAPITAL', name: '实收资本', type: '所有者权益', isDebit: false },
        { key: 'CAPITAL_RESERVE', name: '资本公积', type: '所有者权益', isDebit: false },
        { key: 'SURPLUS_RESERVE', name: '盈余公积', type: '所有者权益', isDebit: false },
        { key: 'CURRENT_YEAR_PROFIT', name: '本年利润', type: '所有者权益', isDebit: false },
        { key: 'RETAINED_EARNINGS', name: '利润分配', type: '所有者权益', isDebit: false },
        { key: 'SALES_REVENUE', name: '主营业务收入', type: '收入', isDebit: false },
        { key: 'OTHER_REVENUE', name: '其他业务收入', type: '收入', isDebit: false },
        { key: 'NON_OPERATING_INCOME', name: '营业外收入', type: '收入', isDebit: false },
        { key: 'SALES_COST', name: '主营业务成本', type: '成本', isDebit: true },
        { key: 'PRODUCTION_COST', name: '生产成本', type: '成本', isDebit: true },
        { key: 'WORK_IN_PROCESS', name: '期末在制品', type: '资产', isDebit: true },
        { key: 'MANUFACTURING_EXPENSE', name: '制造费用', type: '成本', isDebit: true },
        { key: 'OTHER_COST', name: '其他业务成本', type: '成本', isDebit: true },
        { key: 'SALES_EXPENSE', name: '销售费用', type: '费用', isDebit: true },
        { key: 'ADMIN_EXPENSE', name: '管理费用', type: '费用', isDebit: true },
        { key: 'FINANCE_EXPENSE', name: '财务费用', type: '费用', isDebit: true },
        { key: 'DEPRECIATION_EXPENSE', name: '折旧费用', type: '费用', isDebit: true },
        { key: 'NON_OPERATING_EXPENSE', name: '营业外支出', type: '费用', isDebit: true },
        { key: 'ASSET_IMPAIRMENT_LOSS', name: '资产减值损失', type: '费用', isDebit: true },
      ];

      const requiredAccounts = accountDefinitions
        .map((account) => ({
          ...account,
          code: accountingConfig.getAccountCode(account.key),
        }))
        .filter((account) => account.code)
        .filter(
          (account, index, accounts) =>
            accounts.findIndex((candidate) => candidate.code === account.code) === index
        );

      logger.info('开始检查和创建基本会计科目...');

      for (const account of requiredAccounts) {
        const [existingAccount] = await conn.execute(
          'SELECT id FROM gl_accounts WHERE account_code = ?',
          [account.code]
        );

        if (existingAccount.length === 0) {
          logger.info(`创建会计科目: ${account.code} ${account.name}`);
          await conn.execute(
            `INSERT INTO gl_accounts
             (account_code, account_name, account_type, is_debit, is_active, currency_code)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [account.code, account.name, account.type, account.isDebit ? 1 : 0, true, 'CNY']
          );
        } else {
          logger.info(`会计科目已存在: ${account.code} ${account.name}`);
        }
      }

      // 检查基本会计期间是否存在
      const [existingPeriod] = await conn.execute('SELECT id FROM gl_periods WHERE id = ?', [1]);

      if (existingPeriod.length === 0) {
        const currentYear = new Date().getFullYear();
        logger.info(`创建会计期间: ${currentYear}年`);
        await conn.execute(
          'INSERT INTO gl_periods (id, period_name, start_date, end_date, is_closed, fiscal_year) VALUES (?, ?, ?, ?, ?, ?)',
          [1, `${currentYear}年`, `${currentYear}-01-01`, `${currentYear}-12-31`, 0, currentYear]
        );
      } else {
        logger.info('会计期间已存在');
      }

      await conn.commit();
      logger.info('会计科目和会计期间初始化完成');
      return true;
    } catch (error) {
      await conn.rollback();
      logger.error('初始化会计科目和会计期间失败:', error);
      throw error;
    } finally {
      conn.release();
    }
  },
};
