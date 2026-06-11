/**
 * inventoryOutboundController.js
 * @description 出库管理控制器 - 汇总导出层
 * @date 2025-08-27
 * @version 2.0.0 - 按功能拆分到 outbound/ 子目录
 *
 * 拆分结构:
 *   outbound/outboundHelpers.js       - 共享辅助函数和常量
 *   outbound/outboundCrudController.js - CRUD操作（列表/详情/创建/编辑/删除/导出）
 *   outbound/outboundStatusController.js - 状态管理（确认/完成/撤销/批量状态更新）
 *   outbound/outboundBomController.js - BOM展开和批量出库操作
 */

const {
  getOutboundList,
  exportOutbound,
  getOutboundDetail,
  updateOutbound,
  _createOutbound,
  createOutbound,
  deleteOutbound,
} = require('./outbound/outboundCrudController');

const {
  updateOutboundStatus,
  batchUpdateOutboundStatus,
  batchDeleteOutbound,
  cancelOutboundReissue,
} = require('./outbound/outboundStatusController');

const {
  fetchBomItemsForOutbound,
  supplementOutbound,
  batchOutbound,
} = require('./outbound/outboundBomController');

const {
  getTaskMaterialIssueRecords,
} = require('./outbound/outboundHelpers');

module.exports = {
  getOutboundList,
  exportOutbound,
  getOutboundDetail,
  updateOutbound,
  _createOutbound,
  createOutbound,
  deleteOutbound,
  cancelOutbound: cancelOutboundReissue,
  fetchBomItemsForOutbound,
  updateOutboundStatus,
  supplementOutbound,
  batchOutbound,
  getTaskMaterialIssueRecords,
  batchUpdateOutboundStatus,
  batchDeleteOutbound,
};
