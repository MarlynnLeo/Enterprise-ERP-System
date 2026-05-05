/**
 * 会计科目配置
 *
 * 支持两种配置方式：
 * 1. 默认配置（此文件）- 作为后备配置
 * 2. 数据库配置（system_settings表）- 优先级更高，可动态修改
 *
 * 配置优先级：数据库配置 > 环境变量 > 默认配置
 *
 * @author 系统开发团队
 * @version 2.0.0
 * @since 2025-12-13
 */

/**
 * 默认会计科目编码映射
 * 基于中国企业会计准则
 */
const DEFAULT_ACCOUNT_CODES = {
  // ==================== 资产类 ====================
  CASH: process.env.ACCOUNT_CASH || '1001', // 库存现金
  BANK_DEPOSIT: process.env.ACCOUNT_BANK_DEPOSIT || '1002', // 银行存款
  OTHER_MONETARY_ASSETS: process.env.ACCOUNT_OTHER_MONETARY || '1003', // 其他货币资金
  ACCOUNTS_RECEIVABLE: process.env.ACCOUNT_AR || '1122', // 应收账款
  PREPAYMENTS: process.env.ACCOUNT_PREPAYMENTS || '1123', // 预付账款

  // 存货类
  MATERIAL_PURCHASE: process.env.ACCOUNT_MATERIAL_PURCHASE || '1401', // 材料采购
  RAW_MATERIALS: process.env.ACCOUNT_RAW_MATERIALS || '1403', // 原材料
  INVENTORY_GOODS: process.env.ACCOUNT_INVENTORY_GOODS || '1405', // 库存商品
  FINISHED_GOODS: process.env.ACCOUNT_FINISHED_GOODS || '1406', // 产成品
  OUTSOURCED_MATERIALS: process.env.ACCOUNT_OUTSOURCED || '1408', // 委托加工物资

  // 固定资产类
  FIXED_ASSETS: process.env.ACCOUNT_FIXED_ASSETS || '1601', // 固定资产
  ACCUMULATED_DEPRECIATION: process.env.ACCOUNT_DEPRECIATION || '1602', // 累计折旧

  // ==================== 负债类 ====================
  ACCOUNTS_PAYABLE: process.env.ACCOUNT_AP || '2202', // 应付账款
  ADVANCE_RECEIPTS: process.env.ACCOUNT_ADVANCE_RECEIPTS || '2131', // 预收账款
  EMPLOYEE_PAYABLE: process.env.ACCOUNT_EMPLOYEE_PAYABLE || '2201', // 应付职工薪酬
  TAX_PAYABLE: process.env.ACCOUNT_TAX_PAYABLE || '2221', // 应交税费

  // ==================== 所有者权益类 ====================
  PAID_IN_CAPITAL: process.env.ACCOUNT_CAPITAL || '3001', // 实收资本
  CAPITAL_RESERVE: process.env.ACCOUNT_CAPITAL_RESERVE || '3002', // 资本公积
  SURPLUS_RESERVE: process.env.ACCOUNT_SURPLUS_RESERVE || '3101', // 盈余公积
  CURRENT_YEAR_PROFIT: process.env.ACCOUNT_CURRENT_PROFIT || '3103', // 本年利润
  RETAINED_EARNINGS: process.env.ACCOUNT_RETAINED_EARNINGS || '3104', // 利润分配

  // ==================== 成本类 ====================
  PRODUCTION_COST: process.env.ACCOUNT_PRODUCTION_COST || '5001', // 生产成本
  MANUFACTURING_EXPENSE: process.env.ACCOUNT_MANUFACTURING || '5101', // 制造费用

  // ==================== 收入类 ====================
  SALES_REVENUE: process.env.ACCOUNT_SALES_REVENUE || '6001', // 主营业务收入
  OTHER_REVENUE: process.env.ACCOUNT_OTHER_REVENUE || '6051', // 其他业务收入

  // ==================== 费用类（成本类） ====================
  SALES_COST: process.env.ACCOUNT_SALES_COST || '6401', // 主营业务成本
  COST_OF_GOODS_SOLD: process.env.ACCOUNT_COGS || '6401', // 销售成本（别名）
  OTHER_COST: process.env.ACCOUNT_OTHER_COST || '6051', // 其他业务成本
  SALES_EXPENSE: process.env.ACCOUNT_SALES_EXPENSE || '6601', // 销售费用
  ADMIN_EXPENSE: process.env.ACCOUNT_ADMIN_EXPENSE || '6201', // 管理费用
  FINANCE_EXPENSE: process.env.ACCOUNT_FINANCE_EXPENSE || '6603', // 财务费用
  DEPRECIATION_EXPENSE: process.env.ACCOUNT_DEPRECIATION_EXP || '6602', // 折旧费用

  // ==================== 别名映射 ====================
  INVENTORY: process.env.ACCOUNT_INVENTORY || '1405', // 库存（指向库存商品）
  PURCHASE_COST: process.env.ACCOUNT_PURCHASE_COST || '1401', // 采购成本（指向材料采购）
  GR_IR: process.env.ACCOUNT_GR_IR || '220201', // GR/IR 暂估应付（材料入库未开票）
};

/**
 * 会计科目配置类
 * 支持从数据库动态加载配置
 */
class AccountingConfig {
  constructor() {
    this.accountCodes = { ...DEFAULT_ACCOUNT_CODES };
    this.cache = null;
    this.cacheTime = null;
    this.cacheTTL = 5 * 60 * 1000; // 缓存5分钟
  }

  /**
   * 获取会计科目编码
   * @param {string} key - 科目键名（如 'SALES_COST'）
   * @returns {string} 科目编码
   */
  getAccountCode(key) {
    return this.accountCodes[key] || null;
  }

  /**
   * 获取所有会计科目编码
   * @returns {Object} 所有科目编码映射
   */
  getAllAccountCodes() {
    return { ...this.accountCodes };
  }

  /**
   * 从数据库加载配置（异步）
   * @param {Object} db - 数据库连接池
   */
  async loadFromDatabase(db) {
    try {
      // 检查缓存是否有效
      if (this.cache && this.cacheTime && Date.now() - this.cacheTime < this.cacheTTL) {
        return this.cache;
      }

      const [settings] = await db.pool.execute(
        "SELECT `value` FROM system_settings WHERE `key` = 'accounting.account_codes' LIMIT 1"
      );

      if (settings.length > 0 && settings[0].value) {
        try {
          // 清理可能的控制字符
          let cleanValue = settings[0].value;
          if (typeof cleanValue === 'string') {
            // 移除控制字符（保留换行符和制表符）
            // eslint-disable-next-line no-control-regex -- intentionally strips unsafe control characters from persisted JSON.
            cleanValue = cleanValue.replace(new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', 'g'), '');
          }

          const dbConfig = JSON.parse(cleanValue);
          // 合并配置：数据库配置覆盖默认配置
          this.accountCodes = { ...DEFAULT_ACCOUNT_CODES, ...dbConfig };
          this.cache = this.accountCodes;
          this.cacheTime = Date.now();
        } catch (parseError) {
          console.error('解析会计科目配置失败，使用默认配置:', parseError.message);
          // JSON解析失败时保持默认配置
        }
      }

      return this.accountCodes;
    } catch (error) {
      console.error('从数据库加载会计科目配置失败，使用默认配置:', error.message);
      return this.accountCodes;
    }
  }

  /**
   * 保存配置到数据库
   * @param {Object} db - 数据库连接池
   * @param {Object} config - 配置对象
   */
  async saveToDatabase(db, config) {
    try {
      const value = JSON.stringify(config);
      await db.pool.execute(
        `INSERT INTO system_settings (\`key\`, \`value\`, description) 
         VALUES ('accounting.account_codes', ?, '会计科目编码映射配置')
         ON DUPLICATE KEY UPDATE \`value\` = ?, updated_at = CURRENT_TIMESTAMP`,
        [value, value]
      );

      // 更新缓存
      this.accountCodes = { ...DEFAULT_ACCOUNT_CODES, ...config };
      this.cache = this.accountCodes;
      this.cacheTime = Date.now();

      return true;
    } catch (error) {
      console.error('保存会计科目配置到数据库失败:', error.message);
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = null;
    this.cacheTime = null;
  }
}

// 导出单例实例
const accountingConfig = new AccountingConfig();

module.exports = {
  DEFAULT_ACCOUNT_CODES,
  accountingConfig,
  AccountingConfig,
};
