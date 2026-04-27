/**
 * 编号生成器工具（统一委托层）
 * @description 所有编号生成统一委托给 CodeGeneratorService（编码规则引擎）
 *              本文件仅作为兼容层保留 CodeGenerators 快捷方法签名，
 *              内部全部直接调用 CodeGeneratorService.nextCode()。
 * @version 2.0.0 - 移除全部旧引擎和降级逻辑
 */

const CodeGeneratorService = require('../services/business/CodeGeneratorService');

/**
 * 常用编号生成快捷方法 — 全部直接委托给编码引擎
 */
const CodeGenerators = {
  // ========== 生产模块 ==========

  /** 生成生产任务编号 */
  async generateTaskCode(connection) {
    return CodeGeneratorService.nextCode('production_task', connection);
  },

  /** 生成生产计划编号 */
  async generatePlanCode(connection) {
    return CodeGeneratorService.nextCode('production_plan', connection);
  },

  /** 生成检验单编号 */
  async generateInspectionCode(connection) {
    return CodeGeneratorService.nextCode('quality_inspection', connection);
  },

  /** 生成采购申请编号 */
  async generatePurchaseRequisitionCode(connection) {
    return CodeGeneratorService.nextCode('purchase_requisition', connection);
  },

  /** 生成检验模板编号 */
  async generateTemplateCode(connection) {
    return CodeGeneratorService.nextCode('inspection_template', connection);
  },

  // ========== 销售模块 ==========

  /** 生成销售订单编号 */
  async generateSalesOrderCode(connection) {
    return CodeGeneratorService.nextCode('sales_order', connection);
  },

  /** 生成销售出库单编号 */
  async generateOutboundCode(connection) {
    return CodeGeneratorService.nextCode('sales_outbound', connection);
  },

  /** 生成销售退货单编号 */
  async generateSalesReturnCode(connection) {
    return CodeGeneratorService.nextCode('sales_return', connection);
  },

  // ========== 采购模块 ==========

  /** 生成采购订单编号 */
  async generatePurchaseOrderCode(connection) {
    return CodeGeneratorService.nextCode('purchase_order', connection);
  },

  /** 生成采购收货单编号 */
  async generateReceiptCode(connection) {
    return CodeGeneratorService.nextCode('purchase_receipt', connection);
  },

  /** 生成采购退货单编号 */
  async generatePurchaseReturnCode(connection) {
    return CodeGeneratorService.nextCode('purchase_return', connection);
  },

  // ========== 库存模块 ==========

  /** 生成装箱单编号 */
  async generatePackingListCode(connection) {
    return CodeGeneratorService.nextCode('packing_list', connection);
  },

  /** 生成库存交易流水编号 */
  async generateTransactionCode(connection) {
    return CodeGeneratorService.nextCode('inventory_transaction', connection);
  },

  /** 生成库存调整单编号 */
  async generateAdjustmentCode(connection) {
    return CodeGeneratorService.nextCode('inventory_adjustment', connection);
  },

  /** 生成库存调拨单编号 */
  async generateTransferCode(connection) {
    return CodeGeneratorService.nextCode('inventory_transfer', connection);
  },

  /** 生成库存出库单编号 */
  async generateInventoryOutboundCode(connection) {
    return CodeGeneratorService.nextCode('inventory_outbound', connection);
  },

  // ========== 外委加工模块 ==========

  /** 生成外委加工单编号 */
  async generateProcessingCode(connection) {
    return CodeGeneratorService.nextCode('outsourced_processing', connection);
  },

  /** 生成外委加工入库单编号 */
  async generateProcessingReceiptCode(connection) {
    return CodeGeneratorService.nextCode('outsourced_receipt', connection);
  },

  // ========== 补全业务模块 ==========

  /** 生成销售报价单编号 */
  async generateSalesQuotationCode(connection) {
    return CodeGeneratorService.nextCode('sales_quotation', connection);
  },

  /** 生成入库单编号 */
  async generateInboundCode(connection) {
    return CodeGeneratorService.nextCode('inventory_inbound', connection);
  },

  /** 生成盘点单编号 */
  async generateCheckCode(connection) {
    return CodeGeneratorService.nextCode('inventory_check', connection);
  },
};

/**
 * 生成检验模板编号（兼容旧调用签名）
 * @param {string} _prefix - 忽略，使用编码规则表配置
 * @param {Object} _db - 忽略，使用编码引擎
 */
async function generateTemplateCode(_prefix, _db) {
  return CodeGeneratorService.nextCode('inspection_template');
}

module.exports = {
  generateTemplateCode,
  CodeGenerators,
};
