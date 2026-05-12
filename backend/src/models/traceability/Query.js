/**
 * traceability/Query.js
 * @description 追溯管理高级查询（正向/反向追溯）
 * @date 2026-01-23
 * @version 1.0.0
 */

const logger = require('../../utils/logger');
const db = require('../../config/db');
const Builder = require('./Builder');

class TraceabilityQuery {
  /**
   * 获取全链路追溯数据 - 从采购入库到成品出库
   * @param {string} type - 追溯类型：'forward'(正向)或'backward'(反向)
   * @param {string} code - 追溯码（物料编码或产品编码）
   * @param {string} batchNumber - 批次号
   * @returns {Promise<Object>} - 追溯链数据
   */
  static async getFullTraceability(type, code, batchNumber) {
    try {
      // 验证参数
      if (!type || !code || !batchNumber) {
        throw new Error('追溯类型、编码和批次号不能为空');
      }

      // 根据追溯类型选择不同的查询路径
      if (type === 'forward') {
        // 正向追溯: 从原料到成品
        return await this.getForwardTraceability(code, batchNumber);
      } else if (type === 'backward') {
        // 反向追溯: 从成品到原料
        return await this.getBackwardTraceability(code, batchNumber);
      } else {
        throw new Error('无效的追溯类型，只支持 forward 或 backward');
      }
    } catch (error) {
      logger.error('获取全链路追溯数据失败:', error);
      throw error;
    }
  }

  /**
   * 正向追溯 - 从原料到成品
   * @param {string} materialCode - 物料编码
   * @param {string} batchNumber - 批次号
   * @returns {Promise<Object>} - 追溯链数据
   */
  static async getForwardTraceability(materialCode, batchNumber) {
    try {
      // 1. 查询采购入库记录
      const purchaseQuery = `
        SELECT
          pr.id AS receipt_id,
          pr.receipt_no,
          pr.receipt_date,
          pri.material_id,
          m.code AS material_code,
          m.name AS material_name,
          pri.batch_number,
          pri.quantity,
          s.name AS supplier_name,
          pr.created_at
        FROM
          purchase_receipt_items pri
        JOIN
          purchase_receipts pr ON pri.receipt_id = pr.id
        JOIN
          materials m ON pri.material_id = m.id
        JOIN
          suppliers s ON pr.supplier_id = s.id
        WHERE
          m.code = ? AND (pri.batch_number = ? OR pri.batch_number LIKE ?)
      `;

      const purchaseResult = await db.query(purchaseQuery, [
        materialCode,
        batchNumber,
        `%${materialCode}%`,
      ]);
      const purchaseRecords = purchaseResult.rows || [];

      if (purchaseRecords.length === 0) {
        return { success: false, message: '未找到相关采购入库记录' };
      }

      // 2. 查询生产记录
      // 查找使用了该物料的生产任务
      const productionQuery = `
        SELECT
          pt.id AS task_id,
          pt.task_no,
          pt.plan_id,
          pp.plan_no,
          pt.product_id,
          m.code AS product_code,
          m.name AS product_name,
          pt.batch_number AS product_batch,
          pt.planned_quantity,
          pt.completed_quantity,
          pt.status,
          pt.start_time,
          pt.end_time
        FROM
          production_task_materials ptm
        JOIN
          production_tasks pt ON ptm.task_id = pt.id
        JOIN
          production_plans pp ON pt.plan_id = pp.id
        JOIN
          materials m ON pt.product_id = m.id
        WHERE
          ptm.material_id = (SELECT id FROM materials WHERE code = ?)
          AND ptm.batch_number = ?
      `;

      const productionResult = await db.query(productionQuery, [materialCode, batchNumber]);
      const productionRecords = productionResult.rows || [];

      // 3. 查询质检记录
      let qualityRecords = [];
      if (productionRecords.length > 0) {
        const taskIds = productionRecords.map((record) => record.task_id).join(',');

        const qualityQuery = `
          SELECT
            qi.id AS inspection_id,
            qi.inspection_no,
            qi.inspection_type,
            qi.target_id,
            qi.target_type,
            qi.status,
            qi.result,
            qi.inspector,
            qi.inspection_date,
            qi.created_at
          FROM
            quality_inspections qi
          WHERE
            qi.target_type = 'production_task' AND qi.target_id IN (${taskIds})
        `;

        const qualityResult = await db.query(qualityQuery, []);
        qualityRecords = qualityResult.rows || [];
      }

      // 4. 查询成品出库记录
      let outboundRecords = [];
      if (productionRecords.length > 0) {
        const productCodes = productionRecords
          .map((record) => `'${record.product_code}'`)
          .join(',');
        const productBatches = productionRecords
          .map((record) => `'${record.product_batch}'`)
          .join(',');

        const outboundQuery = `
          SELECT
            io.id AS outbound_id,
            io.outbound_no,
            io.outbound_date,
            ioi.material_id,
            m.code AS material_code,
            m.name AS material_name,
            ioi.batch_number,
            ioi.quantity,
            io.created_at
          FROM
            inventory_outbound_items ioi
          JOIN
            inventory_outbound io ON ioi.outbound_id = io.id
          JOIN
            materials m ON ioi.material_id = m.id
          WHERE
            m.code IN (${productCodes}) AND ioi.batch_number IN (${productBatches})
        `;

        const outboundResult = await db.query(outboundQuery, []);
        outboundRecords = outboundResult.rows || [];
      }

      // 5. 构建完整的追溯链
      return {
        success: true,
        traceability: {
          material: {
            code: materialCode,
            batch: batchNumber,
          },
          purchase: purchaseRecords,
          production: productionRecords,
          quality: qualityRecords,
          outbound: outboundRecords,
          // 构建节点和链接关系，方便前端展示
          nodes: Builder.buildNodes(
            'forward',
            purchaseRecords,
            productionRecords,
            qualityRecords,
            outboundRecords
          ),
          links: Builder.buildLinks(
            'forward',
            purchaseRecords,
            productionRecords,
            qualityRecords,
            outboundRecords
          ),
        },
      };
    } catch (error) {
      logger.error('正向追溯失败:', error);
      throw error;
    }
  }

  /**
   * 反向追溯 - 从成品到原料
   * @param {string} productCode - 产品编码
   * @param {string} batchNumber - 批次号
   * @returns {Promise<Object>} - 追溯链数据
   */
  static async getBackwardTraceability(productCode, batchNumber) {
    try {
      // 1. 查询成品信息
      const productQuery = `
        SELECT
          m.id AS material_id,
          m.code,
          m.name,
          m.specs,
          m.category_id
        FROM
          materials m
        WHERE
          m.code = ?
      `;

      const productResult = await db.query(productQuery, [productCode]);
      const productRecords = productResult.rows || [];

      if (productRecords.length === 0) {
        return { success: false, message: '未找到产品信息' };
      }

      const productId = productRecords[0].material_id;

      // 2. 查询生产记录
      const productionQuery = `
        SELECT
          pt.id AS task_id,
          pt.task_no,
          pt.plan_id,
          pp.plan_no,
          pt.product_id,
          m.code AS product_code,
          m.name AS product_name,
          pt.batch_number AS product_batch,
          pt.planned_quantity,
          pt.completed_quantity,
          pt.status,
          pt.start_time,
          pt.end_time
        FROM
          production_tasks pt
        JOIN
          production_plans pp ON pt.plan_id = pp.id
        JOIN
          materials m ON pt.product_id = m.id
        WHERE
          pt.product_id = ? AND pt.batch_number = ?
      `;

      const productionResult = await db.query(productionQuery, [productId, batchNumber]);
      const productionRecords = productionResult.rows || [];

      if (productionRecords.length === 0) {
        return { success: false, message: '未找到相关生产记录' };
      }

      // 3. 查询生产使用的物料(从出库记录中获取)
      const taskIds = productionRecords.map((record) => record.task_id).join(',');

      const materialsQuery = `
        SELECT
          oi.id,
          io.reference_id AS task_id,
          oi.material_id,
          m.code AS material_code,
          m.name AS material_name,
          il.batch_number,
          oi.quantity AS planned_quantity,
          oi.quantity AS actual_quantity
        FROM
          inventory_outbound_items oi
        JOIN
          inventory_outbound io ON oi.outbound_id = io.id
        JOIN
          materials m ON oi.material_id = m.id
        LEFT JOIN
          inventory_ledger il ON il.material_id = oi.material_id
          AND il.reference_no = io.outbound_no
          AND il.transaction_type = 'production_outbound'
        WHERE
          io.reference_type = 'production_task'
          AND io.reference_id IN (${taskIds})
          AND io.status = 'completed'
        GROUP BY oi.id, il.batch_number
      `;

      const materialsResult = await db.query(materialsQuery, []);
      const materialsRecords = materialsResult.rows || [];

      // 4. 查询采购记录
      let purchaseRecords = [];
      if (materialsRecords.length > 0) {
        const materialBatches = materialsRecords
          .filter((m) => m.batch_number)
          .map((m) => `'${m.batch_number}'`)
          .join(',');

        if (materialBatches) {
          const purchaseQuery = `
            SELECT
              pr.id AS receipt_id,
              pr.receipt_no,
              pr.receipt_date,
              pri.material_id,
              m.code AS material_code,
              m.name AS material_name,
              pri.batch_number,
              pri.quantity,
              s.name AS supplier_name,
              pr.created_at
            FROM
              purchase_receipt_items pri
            JOIN
              purchase_receipts pr ON pri.receipt_id = pr.id
            JOIN
              materials m ON pri.material_id = m.id
            JOIN
              suppliers s ON pr.supplier_id = s.id
            WHERE
              pri.batch_number IN (${materialBatches})
          `;

          const purchaseResult = await db.query(purchaseQuery, []);
          purchaseRecords = purchaseResult.rows || [];
        }
      }

      // 5. 查询相关成品的质检记录
      const qualityQuery = `
        SELECT
          qi.id AS inspection_id,
          qi.inspection_no,
          qi.inspection_type,
          qi.target_id,
          qi.target_type,
          qi.status,
          qi.result,
          qi.inspector,
          qi.inspection_date,
          qi.created_at
        FROM
          quality_inspections qi
        WHERE
          qi.target_type = 'production_task' AND qi.target_id IN (${taskIds})
      `;

      const qualityResult = await db.query(qualityQuery, []);
      const qualityRecords = qualityResult.rows || [];

      return {
        success: true,
        traceability: {
          product: {
            code: productCode,
            batch: batchNumber,
          },
          production: productionRecords,
          materials: materialsRecords,
          purchase: purchaseRecords,
          quality: qualityRecords,
          // 构建节点和链接关系
          nodes: Builder.buildNodes(
            'backward',
            purchaseRecords,
            productionRecords,
            qualityRecords,
            [],
            materialsRecords
          ),
          links: Builder.buildLinks(
            'backward',
            purchaseRecords,
            productionRecords,
            qualityRecords,
            [],
            materialsRecords
          ),
        },
      };
    } catch (error) {
      logger.error('反向追溯失败:', error);
      throw error;
    }
  }
}

module.exports = TraceabilityQuery;
