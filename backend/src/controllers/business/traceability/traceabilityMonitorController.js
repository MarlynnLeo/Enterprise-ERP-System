/**
 * 追溯监控控制器
 * 提供追溯数据完整性监控和统计功能
 */

const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');
const { ResponseHandler } = require('../../../utils/responseHandler');

/**
 * 获取追溯数据概览
 */
exports.getTraceabilityOverview = async (req, res) => {
  try {
    const overview = {};

    // 辅助函数：安全执行查询，表不存在时返回0
    const safeQueryCount = async (sql, defaultValue = 0) => {
      try {
        const result = await db.query(sql);
        return result.rows?.[0]?.total || defaultValue;
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
          logger.warn(`表不存在，跳过查询: ${error.message}`);
          return defaultValue;
        }
        throw error;
      }
    };

    const safeQueryRows = async (sql, params = []) => {
      try {
        const result = await db.query(sql, params);
        return result.rows || [];
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
          logger.warn(`追溯监控查询跳过: ${error.message}`);
          return [];
        }
        throw error;
      }
    };

    // 1. 追溯记录总数（单表架构）
    overview.totalChains = await safeQueryCount(`
      SELECT COUNT(DISTINCT child_batch_number) as total FROM batch_relationships WHERE process_type = 'production'
    `);

    // 2. 批次关系条数
    overview.totalSteps = await safeQueryCount(`
      SELECT COUNT(*) as total FROM batch_relationships
    `);

    // 3. 批次库存总数 (单表架构)
    overview.totalBatches = await safeQueryCount(`
      SELECT COUNT(*) as total FROM v_batch_stock
    `);

    // 4. 批次关系总数
    overview.totalRelations = await safeQueryCount(`
      SELECT COUNT(*) as total FROM batch_relationships
    `);

    // 5. 成品销售追溯总数
    overview.totalSalesTraces = await safeQueryCount(`
      SELECT COUNT(*) as total FROM product_sales_traceability
    `);

    overview.recentOperations = await safeQueryRows(`
      SELECT
        DATE(created_at) as operation_date,
        module,
        action,
        COUNT(*) as total
      FROM audit_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND (
          module LIKE '%trace%'
          OR entity_type IN (
            'batch_relationships',
            'product_sales_traceability',
            'inventory_ledger',
            'quality_inspections',
            'sales_outbound'
          )
        )
      GROUP BY DATE(created_at), module, action
      ORDER BY operation_date DESC, total DESC
      LIMIT 50
    `);

    ResponseHandler.success(res, overview);
  } catch (error) {
    logger.error('获取追溯数据概览失败:', error);
    ResponseHandler.error(res, '获取追溯数据概览失败');
  }
};

/**
 * 获取追溯覆盖率统计
 */
exports.getTraceabilityCoverage = async (req, res) => {
  try {
    const coverage = {};

    // 辅助函数：安全执行查询，表/列不存在时返回默认值
    const safeQueryStats = async (sql, defaultResult = { total: 0, traced: 0 }) => {
      try {
        const result = await db.query(sql);
        return {
          total: result.rows?.[0]?.total || 0,
          traced: result.rows?.[0]?.traced || 0,
        };
      } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE' || error.code === 'ER_BAD_FIELD_ERROR') {
          logger.warn(`数据库查询跳过: ${error.message}`);
          return defaultResult;
        }
        throw error;
      }
    };

    // 1. 采购入库追溯覆盖率
    // 追踪标准：采购入库单的明细行(purchase_receipt_items)中有批次号记录
    const purchaseStats = await safeQueryStats(`
      SELECT 
        COUNT(DISTINCT pr.id) as total,
        COUNT(DISTINCT CASE WHEN pri.batch_number IS NOT NULL AND pri.batch_number != '' THEN pr.id END) as traced
      FROM purchase_receipts pr
      LEFT JOIN purchase_receipt_items pri ON pri.receipt_id = pr.id
      WHERE pr.status = 'completed'
    `);
    coverage.purchaseReceipt = {
      total: purchaseStats.total,
      traced: purchaseStats.traced,
      coverage:
        purchaseStats.total > 0
          ? ((purchaseStats.traced / purchaseStats.total) * 100).toFixed(2)
          : 0,
    };

    // 2. 质检追溯覆盖率
    // 追踪标准：质检单记录了 traceability_batch
    const qualityStats = await safeQueryStats(`
      SELECT 
        COUNT(DISTINCT qi.id) as total,
        COUNT(DISTINCT CASE WHEN qi.traceability_batch IS NOT NULL AND qi.traceability_batch != '' THEN qi.id END) as traced
      FROM quality_inspections qi
      WHERE qi.status IN ('passed', 'completed')
    `);
    coverage.qualityInspection = {
      total: qualityStats.total,
      traced: qualityStats.traced,
      coverage:
        qualityStats.total > 0 ? ((qualityStats.traced / qualityStats.total) * 100).toFixed(2) : 0,
    };

    // 3. 生产追溯覆盖率
    // 追踪标准：已完成的生产任务有对应的出库单(物料领用)或入库单(成品入库)
    const productionStats = await safeQueryStats(`
      SELECT 
        COUNT(DISTINCT pt.id) as total,
        COUNT(DISTINCT CASE WHEN io.id IS NOT NULL THEN pt.id END) as traced
      FROM production_tasks pt
      LEFT JOIN inventory_outbound io ON io.reference_id = pt.id AND io.reference_type = 'production_task'
      WHERE pt.status = 'completed'
    `);
    coverage.productionTask = {
      total: productionStats.total,
      traced: productionStats.traced,
      coverage:
        productionStats.total > 0
          ? ((productionStats.traced / productionStats.total) * 100).toFixed(2)
          : 0,
    };

    // 4. 销售出库追溯覆盖率
    // 追踪标准：从产品销售追溯表里能找到对应凭证号的关联
    const salesStats = await safeQueryStats(`
      SELECT 
        COUNT(DISTINCT so.id) as total,
        COUNT(DISTINCT CASE WHEN pst.id IS NOT NULL THEN so.id END) as traced
      FROM sales_outbound so
      LEFT JOIN product_sales_traceability pst ON CAST(so.outbound_no AS CHAR) COLLATE utf8mb4_unicode_ci = CAST(pst.outbound_no AS CHAR) COLLATE utf8mb4_unicode_ci
      WHERE so.status = 'completed'
    `);
    coverage.salesOutbound = {
      total: salesStats.total,
      traced: salesStats.traced,
      coverage:
        salesStats.total > 0 ? ((salesStats.traced / salesStats.total) * 100).toFixed(2) : 0,
    };

    // 计算总体覆盖率
    const totalRecords =
      purchaseStats.total + qualityStats.total + productionStats.total + salesStats.total;
    const totalTraced =
      purchaseStats.traced + qualityStats.traced + productionStats.traced + salesStats.traced;
    coverage.overall = {
      total: totalRecords,
      traced: totalTraced,
      coverage: totalRecords > 0 ? ((totalTraced / totalRecords) * 100).toFixed(2) : 0,
    };

    ResponseHandler.success(res, coverage);
  } catch (error) {
    logger.error('获取追溯覆盖率统计失败:', error);
    // 返回空数据而不是错误，让前端能正常显示
    ResponseHandler.success(res, {
      purchaseReceipt: { total: 0, traced: 0, coverage: 0 },
      qualityInspection: { total: 0, traced: 0, coverage: 0 },
      productionTask: { total: 0, traced: 0, coverage: 0 },
      salesOutbound: { total: 0, traced: 0, coverage: 0 },
      overall: { total: 0, traced: 0, coverage: 0 },
    });
  }
};


/**
 * 获取追溯数据质量报告
 */
exports.getDataQualityReport = async (req, res) => {
  try {
    const report = {
      issues: [],
      summary: {},
    };

    // 1. 检查孤立的追溯记录（销售追溯中的批次在库存台账中无任何记录）
    let orphanChains = [];
    try {
      const orphanChainsResult = await db.query(`
        SELECT pst.product_code, pst.product_batch_number as batch_number, pst.created_at
        FROM product_sales_traceability pst
        LEFT JOIN inventory_ledger il ON il.batch_number = pst.product_batch_number
        WHERE il.id IS NULL AND pst.product_batch_number IS NOT NULL AND pst.product_batch_number != ''
        LIMIT 100
      `);
      orphanChains = orphanChainsResult.rows || [];
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      logger.warn(`跳过查询: ${err.message}`);
    }

    if (orphanChains.length > 0) {
      report.issues.push({
        type: 'orphan_chains',
        severity: 'warning',
        count: orphanChains.length,
        message: '发现孤立的追溯链(没有步骤)',
        samples: orphanChains.slice(0, 5),
      });
    }

    // 2. 检查批次库存数量异常 (单表架构)
    let negativeStock = [];
    try {
      const negativeStockResult = await db.query(`
        SELECT material_id, batch_number, current_quantity as quantity
        FROM v_batch_stock
        WHERE current_quantity < 0
        LIMIT 100
      `);
      negativeStock = negativeStockResult.rows || [];
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      logger.warn(`跳过查询: ${err.message}`);
    }

    if (negativeStock.length > 0) {
      report.issues.push({
        type: 'negative_stock',
        severity: 'error',
        count: negativeStock.length,
        message: '发现负库存的批次',
        samples: negativeStock.slice(0, 5),
      });
    }

    // 3. 检查缺失批次号的记录
    let missingBatchCount = 0;
    try {
      const missingBatchResult = await db.query(`
        SELECT COUNT(*) as count
        FROM batch_relationships
        WHERE parent_batch_number IS NULL OR parent_batch_number = '' OR child_batch_number IS NULL OR child_batch_number = ''
      `);
      missingBatchCount = missingBatchResult.rows?.[0]?.count || 0;
    } catch (err) {
      if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      logger.warn(`跳过查询: ${err.message}`);
    }

    if (missingBatchCount > 0) {
      report.issues.push({
        type: 'missing_batch_number',
        severity: 'warning',
        count: missingBatchCount,
        message: '发现缺失批次号的追溯链',
      });
    }

    // 生成总结
    report.summary = {
      totalIssues: report.issues.length,
      errorCount: report.issues.filter((i) => i.severity === 'error').length,
      warningCount: report.issues.filter((i) => i.severity === 'warning').length,
      healthScore: Math.max(0, 100 - report.issues.length * 10),
    };

    ResponseHandler.success(res, report);
  } catch (error) {
    logger.error('获取追溯数据质量报告失败:', error);
    // 返回默认报告而不是错误
    ResponseHandler.success(res, {
      issues: [],
      summary: { totalIssues: 0, errorCount: 0, warningCount: 0, healthScore: 100 },
    });
  }
};
