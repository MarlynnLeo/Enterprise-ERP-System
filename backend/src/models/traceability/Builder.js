/**
 * traceability/Builder.js
 * @description 追溯链图谱构建器
 * @date 2026-01-23
 * @version 1.0.0
 */

class TraceabilityBuilder {
  /**
   * 构建追溯图节点
   * @param {string} type - 追溯类型 'forward' | 'backward'
   * @param {Array} purchaseRecords - 采购记录
   * @param {Array} productionRecords - 生产记录
   * @param {Array} qualityRecords - 质检记录
   * @param {Array} outboundRecords - 出库记录
   * @param {Array} materialsRecords - 原料记录(反向追溯用)
   * @returns {Array} - 节点列表
   */
  static buildNodes(
    type,
    purchaseRecords,
    productionRecords,
    qualityRecords,
    outboundRecords,
    materialsRecords = []
  ) {
    const nodes = [];

    if (type === 'forward') {
      // 添加原料节点
      if (purchaseRecords.length > 0) {
        const material = purchaseRecords[0];
        nodes.push({
          id: `material_${material.material_code}_${material.batch_number}`,
          name: `${material.material_name} (${material.batch_number})`,
          category: 'material',
        });
      }

      // 添加采购入库节点
      purchaseRecords.forEach((receipt) => {
        nodes.push({
          id: `purchase_${receipt.receipt_id}`,
          name: `入库单: ${receipt.receipt_no}`,
          category: 'purchase',
        });
      });

      // 添加生产节点
      productionRecords.forEach((task) => {
        nodes.push({
          id: `production_${task.task_id}`,
          name: `生产任务: ${task.task_no}`,
          category: 'production',
        });
      });

      // 添加产品节点
      productionRecords.forEach((task) => {
        nodes.push({
          id: `product_${task.product_code}_${task.product_batch}`,
          name: `${task.product_name} (${task.product_batch})`,
          category: 'product',
        });
      });

      // 添加质检节点
      qualityRecords.forEach((inspection) => {
        nodes.push({
          id: `quality_${inspection.inspection_id}`,
          name: `质检: ${inspection.inspection_no}`,
          category: 'quality',
        });
      });

      // 添加出库节点
      outboundRecords.forEach((outbound) => {
        nodes.push({
          id: `outbound_${outbound.outbound_id}`,
          name: `出库单: ${outbound.outbound_no}`,
          category: 'outbound',
        });
      });
    } else {
      // 反向追溯节点

      // 添加出库节点
      outboundRecords.forEach((outbound) => {
        nodes.push({
          id: `outbound_${outbound.outbound_id}`,
          name: `出库单: ${outbound.outbound_no}`,
          category: 'outbound',
        });
      });

      // 添加产品节点
      if (productionRecords.length > 0) {
        const product = productionRecords[0];
        nodes.push({
          id: `product_${product.product_code}_${product.product_batch}`,
          name: `${product.product_name} (${product.product_batch})`,
          category: 'product',
        });
      }

      // 添加生产节点
      productionRecords.forEach((task) => {
        nodes.push({
          id: `production_${task.task_id}`,
          name: `生产任务: ${task.task_no}`,
          category: 'production',
        });
      });

      // 添加质检节点
      qualityRecords.forEach((inspection) => {
        nodes.push({
          id: `quality_${inspection.inspection_id}`,
          name: `质检: ${inspection.inspection_no}`,
          category: 'quality',
        });
      });

      // 添加原料节点
      materialsRecords.forEach((material) => {
        nodes.push({
          id: `material_${material.material_code}_${material.batch_number}`,
          name: `${material.material_name} (${material.batch_number})`,
          category: 'material',
        });
      });

      // 添加采购入库节点
      purchaseRecords.forEach((receipt) => {
        nodes.push({
          id: `purchase_${receipt.receipt_id}`,
          name: `入库单: ${receipt.receipt_no}`,
          category: 'purchase',
        });
      });
    }

    return nodes;
  }

  /**
   * 构建追溯图连接关系
   * @param {string} type - 追溯类型 'forward' | 'backward'
   * @param {Array} purchaseRecords - 采购记录
   * @param {Array} productionRecords - 生产记录
   * @param {Array} qualityRecords - 质检记录
   * @param {Array} outboundRecords - 出库记录
   * @param {Array} materialsRecords - 原料记录(反向追溯用)
   * @returns {Array} - 连接列表
   */
  static buildLinks(
    type,
    purchaseRecords,
    productionRecords,
    qualityRecords,
    outboundRecords,
    materialsRecords = []
  ) {
    const links = [];

    if (type === 'forward') {
      // 正向追溯链接

      // 原料到采购入库的链接
      if (purchaseRecords.length > 0) {
        const material = purchaseRecords[0];
        purchaseRecords.forEach((receipt) => {
          links.push({
            source: `material_${material.material_code}_${material.batch_number}`,
            target: `purchase_${receipt.receipt_id}`,
          });
        });
      }

      // 采购入库到生产任务的链接
      purchaseRecords.forEach((receipt) => {
        productionRecords.forEach((task) => {
          links.push({
            source: `purchase_${receipt.receipt_id}`,
            target: `production_${task.task_id}`,
          });
        });
      });

      // 生产任务到产品的链接
      productionRecords.forEach((task) => {
        links.push({
          source: `production_${task.task_id}`,
          target: `product_${task.product_code}_${task.product_batch}`,
        });
      });

      // 质检到生产任务的链接
      qualityRecords.forEach((inspection) => {
        const taskId = inspection.target_id;
        links.push({
          source: `quality_${inspection.inspection_id}`,
          target: `production_${taskId}`,
        });
      });

      // 产品到出库的链接
      productionRecords.forEach((task) => {
        outboundRecords.forEach((outbound) => {
          if (
            outbound.material_code === task.product_code &&
            outbound.batch_number === task.product_batch
          ) {
            links.push({
              source: `product_${task.product_code}_${task.product_batch}`,
              target: `outbound_${outbound.outbound_id}`,
            });
          }
        });
      });
    } else {
      // 反向追溯链接

      // 出库到产品的链接
      if (productionRecords.length > 0 && outboundRecords.length > 0) {
        const product = productionRecords[0];
        outboundRecords.forEach((outbound) => {
          links.push({
            source: `outbound_${outbound.outbound_id}`,
            target: `product_${product.product_code}_${product.product_batch}`,
          });
        });
      }

      // 产品到生产任务的链接
      if (productionRecords.length > 0) {
        const product = productionRecords[0];
        productionRecords.forEach((task) => {
          links.push({
            source: `product_${product.product_code}_${product.product_batch}`,
            target: `production_${task.task_id}`,
          });
        });
      }

      // 质检到生产任务的链接
      qualityRecords.forEach((inspection) => {
        const taskId = inspection.target_id;
        links.push({
          source: `quality_${inspection.inspection_id}`,
          target: `production_${taskId}`,
        });
      });

      // 生产任务到原料的链接
      productionRecords.forEach((task) => {
        materialsRecords.forEach((material) => {
          if (material.task_id === task.task_id) {
            links.push({
              source: `production_${task.task_id}`,
              target: `material_${material.material_code}_${material.batch_number}`,
            });
          }
        });
      });

      // 原料到采购入库的链接
      materialsRecords.forEach((material) => {
        purchaseRecords.forEach((receipt) => {
          if (
            receipt.material_code === material.material_code &&
            receipt.batch_number === material.batch_number
          ) {
            links.push({
              source: `material_${material.material_code}_${material.batch_number}`,
              target: `purchase_${receipt.receipt_id}`,
            });
          }
        });
      });
    }

    return links;
  }
}

module.exports = TraceabilityBuilder;
