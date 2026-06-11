/**
 * finance/index.js
 * @description 财务模型统一入口
 *              将拆分后的子模块合并为统一的 financeModel 对象导出
 *              保持与原 models/finance.js 完全一致的 API 接口
 * @date 2026-06-11
 */

const accounts = require('./accounts');
const entries = require('./entries');
const periods = require('./periods');
const trialBalance = require('./trialBalance');
const closing = require('./closing');
const init = require('./init');

const financeModel = {
  // 总账科目
  ...accounts,
  // 会计分录
  ...entries,
  // 会计期间
  ...periods,
  // 试算平衡表
  ...trialBalance,
  // 期末结转
  ...closing,
  // 系统初始化
  ...init,
};

module.exports = financeModel;
