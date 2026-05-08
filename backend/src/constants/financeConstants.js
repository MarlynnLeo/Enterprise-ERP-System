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
 * @version 2.0.0
 * @since 2025-12-13
 */

const { accountingConfig } = require('../config/accountingConfig');

// ==================== 会计分录单据类型 ====================
// 必须与数据库 gl_entries 表的 document_type ENUM 定义保持一致
const DOCUMENT_TYPES = {
  RECEIPT: '收据', // 收据
  INVOICE: '发票', // 发票
  PAYMENT: '付款单', // 付款单
  COLLECTION: '收款单', // 收款单
  TRANSFER: '转账单', // 转账单
  ADJUSTMENT: '调整单', // 调整单
  PROFIT_LOSS_TRANSFER: '损益结转', // 期末损益结转
  YEAR_END_TRANSFER: '年度结转', // 年度利润结转
};

// 单据类型业务映射
const DOCUMENT_TYPE_MAPPING = {
  // 库存相关
  INVENTORY_INBOUND: DOCUMENT_TYPES.ADJUSTMENT, // 库存入库 -> 调整单
  INVENTORY_OUTBOUND: DOCUMENT_TYPES.ADJUSTMENT, // 库存出库 -> 调整单
  INVENTORY_TRANSFER: DOCUMENT_TYPES.TRANSFER, // 库存调拨 -> 转账单

  // 采购相关
  PURCHASE_INVOICE: DOCUMENT_TYPES.INVOICE, // 采购发票 -> 发票
  PURCHASE_PAYMENT: DOCUMENT_TYPES.PAYMENT, // 采购付款 -> 付款单

  // 销售相关
  SALES_INVOICE: DOCUMENT_TYPES.INVOICE, // 销售发票 -> 发票
  SALES_COLLECTION: DOCUMENT_TYPES.COLLECTION, // 销售收款 -> 收款单

  // 资产相关
  ASSET_ACQUISITION: DOCUMENT_TYPES.PAYMENT, // 资产购置 -> 付款单
  ASSET_DISPOSAL: DOCUMENT_TYPES.COLLECTION, // 资产处置 -> 收款单
  ASSET_DEPRECIATION: DOCUMENT_TYPES.ADJUSTMENT, // 资产折旧 -> 调整单
  ASSET_IMPAIRMENT: DOCUMENT_TYPES.ADJUSTMENT, // 资产减值 -> 调整单

  // 银行相关
  BANK_DEPOSIT: DOCUMENT_TYPES.RECEIPT, // 银行存款 -> 收据
  BANK_WITHDRAWAL: DOCUMENT_TYPES.PAYMENT, // 银行取款 -> 付款单
  BANK_TRANSFER: DOCUMENT_TYPES.TRANSFER, // 银行转账 -> 转账单

  // 现金相关
  CASH_RECEIPT: DOCUMENT_TYPES.RECEIPT, // 现金收入 -> 收据
  CASH_PAYMENT: DOCUMENT_TYPES.PAYMENT, // 现金支出 -> 付款单

  // 其他
  MANUAL_ADJUSTMENT: DOCUMENT_TYPES.ADJUSTMENT, // 手工调整 -> 调整单
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
// 注意：此常量已废弃，请使用 accountingConfig.getAccountCode(key)
// 为了向后兼容，保留此对象，但建议迁移到新的配置系统
const ACCOUNT_CODES = new Proxy(
  {},
  {
    get(target, prop) {
      // 动态从配置中获取科目编码
      const code = accountingConfig.getAccountCode(prop);
      if (!code) {
        console.warn(`[DEPRECATED] 会计科目 ${prop} 未配置，请检查 accountingConfig`);
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
