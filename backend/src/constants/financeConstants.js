/**
 * 财务模块常量配置
 *
 * 统一管理财务模块中使用的所有常量，包括：
 * - 会计分录单据类型
 * - 会计科目类型
 * - 会计期间状态
 * - 财务业务规则
 *
 * 注意：会计科目编码已迁移到 config/accountingConfig.js
 * 支持环境变量和数据库配置，更加灵活
 *
 * @author 系统开发团队
 * @version 2.1.0
 * @since 2025-12-13
 */

const { accountingConfig } = require('../config/accountingConfig');
const { logger } = require('../utils/logger');

// ==================== 会计分录单据类型 ====================
// 统一使用英文 snake_case 作为数据库存储值
// 中文显示请使用 DOCUMENT_TYPE_LABELS 映射
const DOCUMENT_TYPES = {
  RECEIPT: 'receipt', // 收据
  INVOICE: 'invoice', // 发票
  PAYMENT: 'payment', // 付款单
  COLLECTION: 'collection', // 收款单
  TRANSFER: 'transfer', // 转账单
  ADJUSTMENT: 'adjustment', // 调整单
  PROFIT_LOSS_TRANSFER: 'profit_loss_transfer', // 期末损益结转
  YEAR_END_TRANSFER: 'year_end_transfer', // 年度利润结转
  SALES_OUTBOUND: 'sales_outbound', // 销售出库成本结转
  PRODUCTION_COST_TRANSFER: 'production_cost_transfer', // 生产成本结转
};

// 中文显示标签映射（用于前端展示和报表）
const DOCUMENT_TYPE_LABELS = {
  [DOCUMENT_TYPES.RECEIPT]: '收据',
  [DOCUMENT_TYPES.INVOICE]: '发票',
  [DOCUMENT_TYPES.PAYMENT]: '付款单',
  [DOCUMENT_TYPES.COLLECTION]: '收款单',
  [DOCUMENT_TYPES.TRANSFER]: '转账单',
  [DOCUMENT_TYPES.ADJUSTMENT]: '调整单',
  [DOCUMENT_TYPES.PROFIT_LOSS_TRANSFER]: '损益结转',
  [DOCUMENT_TYPES.YEAR_END_TRANSFER]: '年度结转',
  [DOCUMENT_TYPES.SALES_OUTBOUND]: '销售出库',
  [DOCUMENT_TYPES.PRODUCTION_COST_TRANSFER]: '生产成本结转',
  // 兼容旧数据中的 inventory_reclass（未在常量中定义但DB已存在）
  inventory_reclass: '库存重分类',
};

// 单据类型业务映射
const DOCUMENT_TYPE_MAPPING = {
  // 库存相关
  INVENTORY_INBOUND: DOCUMENT_TYPES.ADJUSTMENT, // 库存入库 -> adjustment
  INVENTORY_OUTBOUND: DOCUMENT_TYPES.ADJUSTMENT, // 库存出库 -> adjustment
  INVENTORY_TRANSFER: DOCUMENT_TYPES.TRANSFER, // 库存调拨 -> transfer

  // 采购相关
  PURCHASE_INVOICE: DOCUMENT_TYPES.INVOICE, // 采购发票 -> invoice
  PURCHASE_PAYMENT: DOCUMENT_TYPES.PAYMENT, // 采购付款 -> payment

  // 销售相关
  SALES_INVOICE: DOCUMENT_TYPES.INVOICE, // 销售发票 -> invoice
  SALES_COLLECTION: DOCUMENT_TYPES.COLLECTION, // 销售收款 -> collection
  SALES_OUTBOUND: DOCUMENT_TYPES.SALES_OUTBOUND, // 销售出库成本 -> sales_outbound

  // 生产相关
  PRODUCTION_COST_TRANSFER: DOCUMENT_TYPES.PRODUCTION_COST_TRANSFER, // 生产成本结转

  // 资产相关
  ASSET_ACQUISITION: DOCUMENT_TYPES.PAYMENT, // 资产购置 -> payment
  ASSET_DISPOSAL: DOCUMENT_TYPES.COLLECTION, // 资产处置 -> collection
  ASSET_DEPRECIATION: DOCUMENT_TYPES.ADJUSTMENT, // 资产折旧 -> adjustment
  ASSET_IMPAIRMENT: DOCUMENT_TYPES.ADJUSTMENT, // 资产减值 -> adjustment

  // 银行相关
  BANK_DEPOSIT: DOCUMENT_TYPES.RECEIPT, // 银行存款 -> receipt
  BANK_WITHDRAWAL: DOCUMENT_TYPES.PAYMENT, // 银行取款 -> payment
  BANK_TRANSFER: DOCUMENT_TYPES.TRANSFER, // 银行转账 -> transfer

  // 现金相关
  CASH_RECEIPT: DOCUMENT_TYPES.RECEIPT, // 现金收入 -> receipt
  CASH_PAYMENT: DOCUMENT_TYPES.PAYMENT, // 现金支出 -> payment

  // 其他
  MANUAL_ADJUSTMENT: DOCUMENT_TYPES.ADJUSTMENT, // 手工调整 -> adjustment
  PROFIT_LOSS_TRANSFER: DOCUMENT_TYPES.PROFIT_LOSS_TRANSFER, // 损益结转
  YEAR_END_TRANSFER: DOCUMENT_TYPES.YEAR_END_TRANSFER, // 年度结转
};

// ==================== 发票状态 ====================
const INVOICE_STATUS = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  PARTIAL_PAID: '部分付款',
  PAID: '已付款',
  OVERDUE: '已逾期',
  CANCELLED: '已取消',
};

const MANUAL_INVOICE_STATUS_TRANSITIONS = {
  [INVOICE_STATUS.DRAFT]: [INVOICE_STATUS.CONFIRMED, INVOICE_STATUS.CANCELLED],
};

// 会产生银行流水和银行账户余额变化的结算方式。
// 前端可能传英文枚举，数据库中也存在中文枚举，这里统一兼容。
const BANK_BACKED_PAYMENT_METHODS = new Set([
  '银行转账',
  'bank_transfer',
  '电子支付',
  'credit_card',
  '信用卡',
  '支票',
  'check',
  '支付宝',
  'alipay',
  '微信',
  'wechat',
]);

// ==================== 会计科目类型 ====================
const ACCOUNT_TYPES = {
  ASSET: '资产', // 资产类科目
  LIABILITY: '负债', // 负债类科目
  EQUITY: '权益', // 权益类科目
  REVENUE: '收入', // 收入类科目
  EXPENSE: '费用', // 费用类科目
  COST: '成本', // 成本类科目
};

// ==================== 常用会计科目编码 ====================
// 兼容入口：动态委托 accountingConfig.getAccountCode(key)，新代码优先直接使用 accountingConfig。
const ACCOUNT_CODES = new Proxy(
  {},
  {
    get(target, prop) {
      // 动态从配置中获取科目编码
      const code = accountingConfig.getAccountCode(prop);
      if (!code) {
        logger.warn('会计科目未配置，请检查 accountingConfig', {
          accountKey: String(prop),
        });
      }
      return code;
    },
  }
);

// ==================== 分录编号前缀 ====================
const ENTRY_NUMBER_PREFIX = {
  INVENTORY: 'INV', // 库存相关分录
  PURCHASE: 'PUR', // 采购相关分录
  SALES: 'SAL', // 销售相关分录
  ASSET: 'AST', // 资产相关分录
  DEPRECIATION: 'DEP', // 折旧相关分录
  BANK: 'BNK', // 银行相关分录
  CASH: 'CSH', // 现金相关分录
  MANUAL: 'MAN', // 手工分录
};

// ==================== 会计期间状态 ====================
const PERIOD_STATUS = {
  OPEN: 'open', // 开放
  CLOSED: 'closed', // 关闭
  LOCKED: 'locked', // 锁定
};

// ==================== 分录状态 ====================
const ENTRY_STATUS = {
  DRAFT: 'draft', // 草稿
  POSTED: 'posted', // 已过账
  REVERSED: 'reversed', // 已冲销
};

// ==================== 错误消息 ====================
const ERROR_MESSAGES = {
  INVALID_DOCUMENT_TYPE: '无效的单据类型',
  INVALID_ACCOUNT_CODE: '无效的科目编码',
  ACCOUNT_NOT_FOUND: '会计科目不存在',
  PERIOD_NOT_FOUND: '会计期间不存在',
  PERIOD_CLOSED: '会计期间已关闭',
  UNBALANCED_ENTRY: '借贷不平衡',
  ENTRY_ALREADY_POSTED: '分录已过账，无法修改',
  ENTRY_ALREADY_REVERSED: '分录已冲销',
};

// ==================== 导出 ====================
module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_MAPPING,
  INVOICE_STATUS,
  MANUAL_INVOICE_STATUS_TRANSITIONS,
  BANK_BACKED_PAYMENT_METHODS,
  ACCOUNT_TYPES,
  ACCOUNT_CODES,
  ENTRY_NUMBER_PREFIX,
  PERIOD_STATUS,
  ENTRY_STATUS,
  ERROR_MESSAGES,
};
