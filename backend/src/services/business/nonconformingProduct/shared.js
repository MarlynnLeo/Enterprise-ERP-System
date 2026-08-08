/**
 * Shared constants/helpers for NonconformingProductService mixins + facade.
 */

const businessConfig = require('../../../config/businessConfig');

// Centralized NCP statuses from business config.
const STATUS = {
  NCP: businessConfig.status.ncp,
};

const VALID_DISPOSITIONS = ['return', 'replacement', 'rework', 'scrap', 'use_as_is'];
const SUPPLIER_REQUIRED_DISPOSITIONS = ['return', 'replacement'];

function normalizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validateDispositionPayload(dispositionData = {}) {
  const disposition = dispositionData.disposition;
  if (!VALID_DISPOSITIONS.includes(disposition)) {
    throw new Error('Invalid NCP disposition');
  }

  if (!dispositionData.disposition_reason || !String(dispositionData.disposition_reason).trim()) {
    throw new Error('Disposition reason is required');
  }

  if (!dispositionData.responsible_party) {
    throw new Error('Responsible party is required');
  }

  const requiresSupplier =
    dispositionData.responsible_party === 'supplier' ||
    SUPPLIER_REQUIRED_DISPOSITIONS.includes(disposition);
  if (requiresSupplier && !dispositionData.supplier_id) {
    throw new Error('Supplier is required for supplier-related NCP disposition');
  }
}

/**
 * 不合格品自动处理规则配置
 * 可以根据企业实际情况调整这些规则
 */
const AUTO_DISPOSITION_RULES = {
  // 规则1: 来料检验 + 致命缺陷 -> 自动退货
  incoming_critical: {
    inspection_type: 'incoming',
    severity: 'critical',
    disposition: 'return',
    reason: '来料检验发现致命缺陷,自动判定为退货处理',
  },
  // 规则2: 来料检验 + 严重缺陷 + 不合格率>30% -> 自动退货
  incoming_major_high_rate: {
    inspection_type: 'incoming',
    severity: 'major',
    min_unqualified_rate: 30,
    disposition: 'return',
    reason: '来料检验发现严重缺陷且不合格率超过30%,自动判定为退货处理',
  },
  // 规则3: 过程检验 + 轻微缺陷 -> 自动返工
  process_minor: {
    inspection_type: 'process',
    severity: 'minor',
    disposition: 'rework',
    reason: '过程检验发现轻微缺陷,自动判定为返工处理',
  },
  // 规则4: 成品检验 + 致命缺陷 -> 自动报废
  final_critical: {
    inspection_type: 'final',
    severity: 'critical',
    disposition: 'scrap',
    reason: '成品检验发现致命缺陷,自动判定为报废处理',
  },
};

/**
 * 自动处理决策配置
 * enable: 是否启用自动处理决策
 * auto_complete: 是否自动完成处理(跳过人工确认)
 */
const AUTO_DISPOSITION_CONFIG = {
  enable: false, // 默认关闭,需要手动开启
  auto_complete: false, // 默认不自动完成,需要人工确认
  notify_users: true, // 是否通知相关人员
};

module.exports = {
  STATUS,
  VALID_DISPOSITIONS,
  SUPPLIER_REQUIRED_DISPOSITIONS,
  normalizeNumber,
  validateDispositionPayload,
  AUTO_DISPOSITION_RULES,
  AUTO_DISPOSITION_CONFIG,
};
