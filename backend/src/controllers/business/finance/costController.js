/**
 * costController.js
 * @description 成本核算控制器（统一导出入口）
 * @date 2026-01-24
 * @version 2.0.0 — 按功能域拆分为独立子模块
 *
 * 子模块：
 *   - costSettingsController     成本设置与费率历史
 *   - costCenterController       成本中心管理
 *   - costCalculationController  标准/实际成本、批量计算、冻结、物料标准成本
 *   - costReportController       WIP/统计/趋势/年度对比/导出/关账
 *   - costVarianceController     成本差异与预警
 *   - costConfigController       补料原因配置与GL映射
 */

const costController = {
  ...require('./costSettingsController'),
  ...require('./costCenterController'),
  ...require('./costCalculationController'),
  ...require('./costReportController'),
  ...require('./costVarianceController'),
  ...require('./costConfigController'),
};

module.exports = costController;
