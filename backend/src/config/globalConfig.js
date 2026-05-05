/**
 * SSOT 全局配置中心 (Single Source of Truth)
 *
 * 初始化阶段全量合并，深度冻结。业务层直接读取，严禁修改与兜底拦截处理。
 */
const db = require('./db');
const { DEFAULT_ACCOUNT_CODES } = require('./accountingConfig');
const { logger } = require('../utils/logger');

class GlobalConfigManager {
  constructor() {
    this.config = null;
    this.isInitialized = false;
  }

  /**
   * 初始化并构建不可变的配置树 (在 app.js / server 启动时调用)
   */
  async init() {
    if (this.isInitialized) return this.config;

    try {
      // 1. 读取基础的会计科目配置
      let accountCodes = { ...DEFAULT_ACCOUNT_CODES };
      const [accSettings] = await db.pool.execute(
        "SELECT `value` FROM system_settings WHERE `key` = 'accounting.account_codes' LIMIT 1"
      );
      if (accSettings.length > 0 && accSettings[0].value) {
        try {
          // eslint-disable-next-line no-control-regex -- intentionally strips unsafe control characters from persisted JSON.
          const cleanValue = accSettings[0].value.replace(new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', 'g'), '');
          const dbConfig = JSON.parse(cleanValue);
          accountCodes = { ...accountCodes, ...dbConfig };
        } catch (e) {
          logger.error('解析会计科目配置出错', e);
        }
      }

      // 2. 读取成本相关的配置 (费率方法等)
      const [cstSettings] = await db.pool.execute(
        `SELECT labor_rate, overhead_rate, costing_method, wage_payment_method, piece_rate,
                fallback_material_ratio, fallback_labor_ratio, fallback_overhead_ratio
         FROM cost_settings WHERE is_active = 1 LIMIT 1`
      );

      if (cstSettings.length === 0) {
         logger.error('❌ 致命错误：系统未提取到有效的成本基础配置 (cost_settings)，拒绝启动以避免核算裸奔。');
         throw new Error('Missing Cost Settings in SSOT Initialization');
      }

      const row = cstSettings[0];
      const costSettings = {
        laborRate: Number(row.labor_rate),
        overheadRate: Number(row.overhead_rate),
        costingMethod: row.costing_method,
        wagePaymentMethod: row.wage_payment_method,
        pieceRate: Number(row.piece_rate),
        // 成本估算拆分比例（数据库 DEFAULT 已保证有值）
        fallbackMaterialRatio: Number(row.fallback_material_ratio),
        fallbackLaborRatio: Number(row.fallback_labor_ratio),
        fallbackOverheadRatio: Number(row.fallback_overhead_ratio),
      };

      // 3. 构建原子化配置树
      const mergedConfig = {
        accounting: {
          accounts: accountCodes
        },
        cost: costSettings
      };

      // 4. 深度冻结 (不可变保证)
      this.config = this._deepFreeze(mergedConfig);
      this.isInitialized = true;
      logger.info('✅ 全局 SSOT 配置树初始化并冻结完成');
      return this.config;
    } catch (error) {
      logger.error('SSOT 全局配置树初始化失败:', error);
      throw error; // 致命错误，必须挂掉
    }
  }

  /**
   * 必须在确保 init 之后使用
   */
  getConfig() {
    if (!this.isInitialized) {
      throw new Error("❌ GlobalConfig 未经初始化被调用 (违背 SSOT 契约)");
    }
    return this.config;
  }

  /**
   * 按需重载配置 (提供给特定热更新接口)
   */
  async reload() {
    this.isInitialized = false;
    return await this.init();
  }

  _deepFreeze(obj) {
    Object.keys(obj).forEach(prop => {
      const val = obj[prop];
      if (val !== null && typeof val === 'object') {
        this._deepFreeze(val);
      }
    });
    return Object.freeze(obj);
  }
}

const globalConfigManager = new GlobalConfigManager();
module.exports = globalConfigManager;
