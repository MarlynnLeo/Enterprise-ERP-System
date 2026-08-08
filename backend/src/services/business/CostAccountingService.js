/**
 * CostAccountingService.js
 * @description 成本核算服务 — 统一入口（Facade）
 * @date 2025-08-27
 * @version 2.0.0
 *
 * 实现按职责拆分至 ./costAccounting/*Methods.js，本文件仅保留：
 * - 公共常量（COSTING_METHOD / COST_ELEMENT）
 * - 子模块 mixin 挂载（Object.assign）
 * - 对外统一 API（调用方无需改 require）
 *
 * 子模块：
 * 1. helpersMethods — 工具、物料移动归集、WIP 凭证比对
 * 2. standardCostMethods — 标准成本 / BOM 多层成本
 * 3. actualCostMethods — 实际成本（材料/人工/制造费用）
 * 4. varianceMethods — 成本差异分析与分摊
 * 5. inventoryRecalcMethods — 库存成本重算（FIFO / 加权平均）
 * 6. settingsMethods — 成本参数与表初始化
 * 7. wipMethods — 在制品成本与 WIP 凭证
 * 8. vouchersMethods — 科目解析与废弃凭证桩
 * 9. reportsMethods — 期间解析与成本报表
 */

const helpersMethods = require('./costAccounting/helpersMethods');
const standardCostMethods = require('./costAccounting/standardCostMethods');
const actualCostMethods = require('./costAccounting/actualCostMethods');
const varianceMethods = require('./costAccounting/varianceMethods');
const inventoryRecalcMethods = require('./costAccounting/inventoryRecalcMethods');
const settingsMethods = require('./costAccounting/settingsMethods');
const wipMethods = require('./costAccounting/wipMethods');
const vouchersMethods = require('./costAccounting/vouchersMethods');
const reportsMethods = require('./costAccounting/reportsMethods');

/**
 * 成本核算服务
 * 处理产品成本核算、标准成本、实际成本计算和成本差异分析
 */
class CostAccountingService {
  /**
   * 成本核算方法枚举
   */
  static COSTING_METHOD = {
    FIFO: 'fifo', // 先进先出
    LIFO: 'lifo', // 后进先出
    WEIGHTED_AVERAGE: 'weighted_average', // 加权平均
    STANDARD: 'standard', // 标准成本
  };

  /**
   * 库存成本重算方法别名
   */
  static INVENTORY_COSTING_METHOD_ALIASES = {
    fifo: 'fifo',
    weighted_average: 'weighted_average',
    moving_average: 'weighted_average',
    average: 'weighted_average',
    mac: 'weighted_average',
  };

  /**
   * 成本要素枚举
   */
  static COST_ELEMENT = {
    MATERIAL: 'material', // 直接材料
    LABOR: 'labor', // 直接人工
    OVERHEAD: 'overhead', // 制造费用
  };
}

Object.assign(
  CostAccountingService,
  helpersMethods,
  standardCostMethods,
  actualCostMethods,
  varianceMethods,
  inventoryRecalcMethods,
  settingsMethods,
  wipMethods,
  vouchersMethods,
  reportsMethods
);

module.exports = CostAccountingService;
