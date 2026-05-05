/**
 * 财务模块配置管理
 *
 * 统一管理财务模块的所有配置项，支持：
 * 1. 默认配置（此文件）- 作为后备配置
 * 2. 环境变量配置 - 中等优先级
 * 3. 数据库配置（system_settings表）- 最高优先级
 *
 * 配置优先级：数据库配置 > 环境变量 > 默认配置
 *
 * @author 系统开发团队
 * @version 1.0.0
 * @since 2025-12-13
 */

const logger = require('../utils/logger');

/**
 * 默认财务配置
 */
const DEFAULT_FINANCE_CONFIG = {
  // ==================== 发票配置 ====================
  invoice: {
    // 默认付款期限（天）
    defaultPaymentTermDays: parseInt(process.env.FINANCE_DEFAULT_PAYMENT_TERM_DAYS) || 30,
    // 默认付款条款文本
    defaultPaymentTermsText: process.env.FINANCE_DEFAULT_PAYMENT_TERMS || '30天付款',
    // 默认货币代码
    defaultCurrency: process.env.FINANCE_DEFAULT_CURRENCY || 'CNY',
    // 默认汇率
    defaultExchangeRate: parseFloat(process.env.FINANCE_DEFAULT_EXCHANGE_RATE) || 1.0,
    // 发票编号前缀
    invoiceNumberPrefix: {
      AR: process.env.FINANCE_AR_PREFIX || 'AR', // 应收
      AP: process.env.FINANCE_AP_PREFIX || 'AP', // 应付
    },
    // 收款编号前缀
    receiptNumberPrefix: process.env.FINANCE_RECEIPT_PREFIX || 'RC',
    // 付款期限选项
    paymentTermOptions: (process.env.FINANCE_PAYMENT_TERM_OPTIONS || '0,7,15,30,45,60,90')
      .split(',')
      .map((term) => parseInt(term)),

    // 分页配置
    pagination: {
      defaultPageSize: parseInt(process.env.FINANCE_DEFAULT_PAGE_SIZE) || 20,
      pageSizeOptions: (process.env.FINANCE_PAGE_SIZE_OPTIONS || '10,20,50,100')
        .split(',')
        .map((size) => parseInt(size)),
    },
  },

  // ==================== 会计期间配置 ====================
  period: {
    // 默认会计期间ID（用于自动分录）
    defaultPeriodId: parseInt(process.env.FINANCE_DEFAULT_PERIOD_ID) || null,
    // 是否自动获取当前期间
    autoGetCurrentPeriod: process.env.FINANCE_AUTO_GET_CURRENT_PERIOD !== 'false',
  },

  // ==================== 会计科目配置 ====================
  account: {
    // 默认货币代码
    defaultCurrency: process.env.FINANCE_ACCOUNT_DEFAULT_CURRENCY || 'CNY',
    // 默认启用状态
    defaultIsActive: process.env.FINANCE_ACCOUNT_DEFAULT_ACTIVE !== 'false',
    // 是否允许自动创建科目
    allowAutoCreate: process.env.FINANCE_ALLOW_AUTO_CREATE_ACCOUNT === 'true',
  },

  // ==================== 系统配置 ====================
  system: {
    // 默认创建人（用于系统自动操作）
    defaultCreator: process.env.FINANCE_DEFAULT_CREATOR || 'system',
    // 默认操作人（用于系统自动操作）
    defaultOperator: process.env.FINANCE_DEFAULT_OPERATOR || 'system',
  },

  // ==================== 状态配置 ====================
  status: {
    // 发票状态列表
    invoiceStatuses: ['草稿', '已确认', '部分付款', '已付款', '已逾期', '已取消'],
    // 付款状态列表
    paymentStatuses: ['待付款', '部分付款', '已付款', '已取消'],
    // 收款状态列表
    collectionStatuses: ['待收款', '部分收款', '已收款', '已取消'],
    // 会计期间状态
    periodStatuses: ['open', 'closed', 'locked'],
    // 分录状态
    entryStatuses: ['draft', 'posted', 'reversed'],
  },

  // ==================== 业务规则配置 ====================
  businessRules: {
    // 是否允许负余额
    allowNegativeBalance: process.env.FINANCE_ALLOW_NEGATIVE_BALANCE === 'true',
    // 是否强制借贷平衡
    enforceBalancedEntry: process.env.FINANCE_ENFORCE_BALANCED_ENTRY !== 'false',
    // 金额精度（小数位数）
    amountPrecision: parseInt(process.env.FINANCE_AMOUNT_PRECISION) || 2,
    // 汇率精度（小数位数）
    exchangeRatePrecision: parseInt(process.env.FINANCE_EXCHANGE_RATE_PRECISION) || 4,
  },

  // ==================== 税率配置 ====================
  tax: {
    // 默认增值税率
    defaultVATRate: parseFloat(process.env.FINANCE_DEFAULT_VAT_RATE) || 0.13,
    // 可选增值税率列表
    vatRateOptions: (process.env.FINANCE_VAT_RATE_OPTIONS || '0,0.03,0.06,0.09,0.13')
      .split(',')
      .map((rate) => parseFloat(rate)),
    // 企业所得税率
    incomeTaxRate: parseFloat(process.env.FINANCE_INCOME_TAX_RATE) || 0.25,
    // 附加税费率（城建税+教育附加+地方教育附加）
    additionalTaxRate: parseFloat(process.env.FINANCE_ADDITIONAL_TAX_RATE) || 0.12,

    // 纳税申报类型
    returnTypes: ['增值税', '企业所得税', '个人所得税', '印花税', '附加税'],
    // 纳税申报状态
    returnStatuses: ['草稿', '已申报', '已缴纳', '已作废', '逾期'],
    // 税务发票类型
    invoiceTypes: ['进项', '销项'],
    // 税务发票状态
    invoiceStatuses: ['未认证', '已认证', '已抵扣', '已作废', '异常'],
  },

  // ==================== 银行/现金配置 ====================
  bank: {
    // 交易类型
    transactionTypes: [
      { label: '收入', value: 'income' },
      { label: '支出', value: 'expense' },
      { label: '转账', value: 'transfer' },
    ],
    // 支付方式
    paymentMethods: [
      { label: '现金', value: 'cash' },
      { label: '银行转账', value: 'bank_transfer' },
      { label: '支票', value: 'check' },
      { label: '信用卡', value: 'credit_card' },
      { label: '电子支付', value: 'electronic_payment' },
      { label: '其他', value: 'other' },
    ],
    // 交易分类 (简化版，仅作为默认参考，实际逻辑可能更复杂)
    transactionCategories: {
      income: [
        { label: '销售收入', value: 'sales_income' },
        { label: '投资收益', value: 'investment_income' },
        { label: '利息收入', value: 'interest_income' },
        { label: '其他收入', value: 'other_income' },
      ],
      expense: [
        { label: '采购支出', value: 'purchase_expense' },
        { label: '工资支出', value: 'salary_expense' },
        { label: '租金支出', value: 'rent_expense' },
        { label: '水电费', value: 'utility_expense' },
        { label: '办公费用', value: 'office_expense' },
        { label: '其他支出', value: 'other_expense' },
      ],
      transfer: [
        { label: '内部转账', value: 'internal_transfer' },
        { label: '资金调拨', value: 'fund_allocation' },
      ],
    },
  },

  // ==================== 总账配置 ====================
  gl: {
    // 单据类型
    documentTypes: ['收款凭证', '付款凭证', '转账凭证'],
    // 凭证状态
    entryStatuses: [
      { label: '已过账', value: true },
      { label: '未过账', value: false },
    ],
  },
};

/**
 * 财务配置管理类
 */
class FinanceConfig {
  constructor() {
    this.config = { ...DEFAULT_FINANCE_CONFIG };
    this.cache = null;
    this.cacheTime = null;
    this.cacheTTL = 5 * 60 * 1000; // 5分钟缓存
  }

  /**
   * 从数据库加载配置
   * @param {Object} db - 数据库连接对象
   * @returns {Object} 配置对象
   */
  async loadFromDatabase(db) {
    try {
      // 检查缓存有效性
      if (this.cache && this.cacheTime && Date.now() - this.cacheTime < this.cacheTTL) {
        return this.cache;
      }

      // 从 system_settings 表加载配置
      const [settings] = await db.pool.execute(
        "SELECT `value` FROM system_settings WHERE `key` = 'finance.config' LIMIT 1"
      );

      if (settings.length > 0 && settings[0].value) {
        try {
          // 清理可能的控制字符
          let cleanValue = settings[0].value;
          if (typeof cleanValue === 'string') {
            // 移除所有控制字符（包括换行符和制表符，因为JSON字符串中不应该有这些）
            // eslint-disable-next-line no-control-regex -- intentionally strips unsafe control characters from persisted JSON.
            cleanValue = cleanValue.replace(new RegExp('[\\x00-\\x1F\\x7F-\\x9F]', 'g'), '');
            // 移除可能的BOM标记
            cleanValue = cleanValue.replace(/^\uFEFF/, '');
            // 移除字符串前后的空白字符
            cleanValue = cleanValue.trim();
          }

          const dbConfig = JSON.parse(cleanValue);
          // 深度合并配置
          this.config = this.deepMerge(DEFAULT_FINANCE_CONFIG, dbConfig);
          this.cache = this.config;
          this.cacheTime = Date.now();
          logger.info('[FinanceConfig] 已从数据库加载财务配置');
        } catch (parseError) {
          logger.error('[FinanceConfig] 解析数据库配置失败，使用默认配置:', parseError);
          // JSON解析失败时使用默认配置
          this.config = { ...DEFAULT_FINANCE_CONFIG };
          this.cache = this.config;
          this.cacheTime = Date.now();
        }
      } else {
        // 使用默认配置
        this.config = { ...DEFAULT_FINANCE_CONFIG };
        this.cache = this.config;
        this.cacheTime = Date.now();
        logger.info('[FinanceConfig] 使用默认财务配置');
      }

      return this.config;
    } catch (error) {
      logger.error('[FinanceConfig] 加载财务配置失败:', error);
      // 出错时使用默认配置
      this.config = { ...DEFAULT_FINANCE_CONFIG };
      this.cache = this.config;
      this.cacheTime = Date.now();
      return this.config;
    }
  }

  /**
   * 保存配置到数据库
   * @param {Object} db - 数据库连接对象
   * @param {Object} config - 配置对象
   */
  async saveToDatabase(db, config) {
    try {
      const configValue = JSON.stringify(config);

      await db.pool.execute(
        `INSERT INTO system_settings (\`key\`, \`value\`, description)
         VALUES ('finance.config', ?, '财务模块配置')
         ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = CURRENT_TIMESTAMP`,
        [configValue]
      );

      // 清除缓存
      this.clearCache();
      logger.info('[FinanceConfig] 财务配置已保存到数据库');
    } catch (error) {
      logger.error('[FinanceConfig] 保存财务配置失败:', error);
      throw error;
    }
  }

  /**
   * 获取配置项
   * @param {string} path - 配置路径，如 'invoice.defaultPaymentTermDays'
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return defaultValue;
      }
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * 获取所有配置
   * @returns {Object} 配置对象
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = null;
    this.cacheTime = null;
    logger.info('[FinanceConfig] 缓存已清除');
  }

  /**
   * 深度合并对象
   * @param {Object} target - 目标对象
   * @param {Object} source - 源对象
   * @returns {Object} 合并后的对象
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(target[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 获取当前会计期间ID
   * @param {Object} db - 数据库连接对象
   * @returns {number|null} 期间ID
   */
  async getCurrentPeriodId(db) {
    try {
      // 如果配置了默认期间ID，直接返回
      const defaultPeriodId = this.get('period.defaultPeriodId');
      if (defaultPeriodId) {
        return defaultPeriodId;
      }

      // 如果启用了自动获取当前期间
      if (this.get('period.autoGetCurrentPeriod', true)) {
        const currentDate = new Date().toISOString().split('T')[0];
        const [periods] = await db.pool.execute(
          `SELECT id FROM gl_periods
           WHERE start_date <= ? AND end_date >= ? AND is_closed = false
           ORDER BY start_date DESC LIMIT 1`,
          [currentDate, currentDate]
        );

        if (periods.length > 0) {
          return periods[0].id;
        }
      }

      return null;
    } catch (error) {
      logger.error('[FinanceConfig] 获取当前会计期间失败:', error);
      return null;
    }
  }
}

// 导出单例
const financeConfig = new FinanceConfig();

module.exports = {
  DEFAULT_FINANCE_CONFIG,
  FinanceConfig,
  financeConfig,
};
