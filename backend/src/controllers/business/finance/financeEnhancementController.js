/**
 * financeEnhancementController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const FinanceIntegrationService = require('../../../services/external/FinanceIntegrationService');
const PeriodEndService = require('../../../services/business/PeriodEndService');
const CostAccountingService = require('../../../services/business/CostAccountingService');
const AdvancedReportsService = require('../../../services/utils/AdvancedReportsService');
const db = require('../../../config/db');

/**
 * 财务增强功能控制器
 * 处理财务模块的增强功能API请求
 * 注意: 审批功能已移除，统一通过 RBAC 权限按钮控制
 */
class FinanceEnhancementController {
  // ==================== 自动化集成功能 ====================

  /**
   * 从销售订单生成应收发票
   */
  static async generateARInvoiceFromSalesOrder(req, res) {
    try {
      const { salesOrderId } = req.params;

      // 获取销售订单信息
      const [salesOrders] = await db.pool.execute('SELECT * FROM sales_orders WHERE id = ?', [
        salesOrderId,
      ]);

      if (salesOrders.length === 0) {
        return ResponseHandler.error(res, '销售订单不存在', 'NOT_FOUND', 404);
      }

      // 传递当前操作用户ID
      const result = await FinanceIntegrationService.generateARInvoiceFromSalesOrder(
        salesOrders[0],
        req.user?.id
      );

      ResponseHandler.success(res, result, '应收发票生成成功');
    } catch (error) {
      logger.error('生成应收发票失败:', error);
      ResponseHandler.error(res, error.message || '生成应收发票失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 从采购入库单生成应付发票
   */
  static async generateAPInvoiceFromPurchaseReceipt(req, res) {
    try {
      const { receiptId } = req.params;

      // 获取采购入库单信息
      const [receipts] = await db.pool.execute('SELECT * FROM purchase_receipts WHERE id = ?', [
        receiptId,
      ]);

      if (receipts.length === 0) {
        return ResponseHandler.error(res, '采购入库单不存在', 'NOT_FOUND', 404);
      }

      // 传递当前操作用户ID
      const result = await FinanceIntegrationService.generateAPInvoiceFromPurchaseReceipt(
        receipts[0],
        req.user?.id
      );

      ResponseHandler.success(res, result, '应付发票生成成功');
    } catch (error) {
      logger.error('生成应付发票失败:', error);
      ResponseHandler.error(res, error.message || '生成应付发票失败', 'SERVER_ERROR', 500, error);
    }
  }

  // ==================== 期末处理功能 ====================

  // 期末结账方法已移除，统一使用主财务控制器的逻辑

  /**
   * 获取期间结账状态
   */
  static async getPeriodClosingStatus(req, res) {
    try {
      const { periodId } = req.params;

      const status = await PeriodEndService.getPeriodClosingStatus(periodId);

      ResponseHandler.success(res, status, '获取期间结账状态成功');
    } catch (error) {
      logger.error('获取期间结账状态失败:', error);
      ResponseHandler.error(
        res,
        error.message || '获取期间结账状态失败',
        'SERVER_ERROR',
        500,
        error
      );
    }
  }

  // ==================== 成本核算功能 ====================

  /**
   * 计算标准成本
   */
  static async calculateStandardCost(req, res) {
    try {
      const { productId } = req.params;
      const { quantity = 1 } = req.query;

      const result = await CostAccountingService.calculateStandardCost(
        parseInt(productId),
        parseFloat(quantity)
      );

      ResponseHandler.success(res, result, '标准成本计算完成');
    } catch (error) {
      ResponseHandler.error(res, error.message || '计算标准成本失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 计算实际成本
   */
  static async calculateActualCost(req, res) {
    try {
      const { productionOrderId } = req.params;

      const result = await CostAccountingService.calculateActualCost(parseInt(productionOrderId));

      ResponseHandler.success(res, result, '实际成本计算完成');
    } catch (error) {
      ResponseHandler.error(res, error.message || '计算实际成本失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 成本差异分析
   */
  static async analyzeCostVariance(req, res) {
    try {
      const { productionOrderId } = req.params;

      const result = await CostAccountingService.analyzeCostVariance(parseInt(productionOrderId));

      ResponseHandler.success(res, result, '成本差异分析完成');
    } catch (error) {
      ResponseHandler.error(res, error.message || '成本差异分析失败', 'SERVER_ERROR', 500, error);
    }
  }

  // ==================== 高级报表功能 ====================

  /**
   * 财务比率分析
   */
  static async generateFinancialRatioAnalysis(req, res) {
    try {
      const params = req.query;

      const result = await AdvancedReportsService.generateFinancialRatioAnalysis(params);

      ResponseHandler.success(res, result, '财务比率分析完成');
    } catch (error) {
      logger.error('财务比率分析失败:', error);
      ResponseHandler.error(res, error.message || '财务比率分析失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 趋势分析
   */
  static async generateTrendAnalysis(req, res) {
    try {
      const params = req.query;

      const result = await AdvancedReportsService.generateTrendAnalysis(params);

      ResponseHandler.success(res, result, '趋势分析完成');
    } catch (error) {
      logger.error('趋势分析失败:', error);
      ResponseHandler.error(res, error.message || '趋势分析失败', 'SERVER_ERROR', 500, error);
    }
  }

  // ==================== 以下为从路由文件迁移的处理器 ====================

  /**
   * 获取年度结转状态
   */
  static async getYearEndStatus(req, res) {
    try {
      const { year } = req.params;
      const result = await PeriodEndService.getYearEndStatus(parseInt(year));
      ResponseHandler.success(res, result, '获取年度结转状态成功');
    } catch (error) {
      logger.error('获取年度结转状态失败:', error);
      ResponseHandler.error(res, error.message || '获取年度结转状态失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 年度结转
   */
  static async yearEndTransfer(req, res) {
    try {
      const yearData = req.body;
      yearData.transferred_by = req.user?.name || req.user?.username || 'system';
      const result = await PeriodEndService.yearEndTransfer(yearData);
      ResponseHandler.success(res, result, '年度结转完成');
    } catch (error) {
      logger.error('年度结转失败:', error);
      ResponseHandler.error(res, error.message || '年度结转失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 获取自动化任务执行历史
   */
  static async getAutomationHistory(req, res) {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const pageNum = parseInt(page) || 1;
      const pageSizeNum = parseInt(pageSize) || 20;
      const offset = (pageNum - 1) * pageSizeNum;

      // 从operation_logs表获取自动化相关的操作记录
      const [rows] = await db.pool.query(`
        SELECT
          id,
          module,
          operation,
          username as executed_by,
          request_data,
          status,
          created_at as executed_at
        FROM operation_logs
        WHERE operation IN (
          'depreciation', 'period_close', 'period_end',
          'year_end_transfer', 'year_end_freeze', 'year_end_execute',
          'production_cost'
        )
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [pageSizeNum, offset]);

      // 获取总数
      const [countResult] = await db.pool.execute(`
        SELECT COUNT(*) as total FROM operation_logs
        WHERE operation IN (
          'depreciation', 'period_close', 'period_end',
          'year_end_transfer', 'year_end_freeze', 'year_end_execute',
          'production_cost'
        )
      `);

      // 转换操作类型
      const operationTypeMap = {
        depreciation: 'depreciation',
        period_close: 'periodEnd',
        period_end: 'periodEnd',
        year_end_transfer: 'financeYearEnd',
        year_end_freeze: 'inventoryYearFreeze',
        year_end_execute: 'inventoryYearEnd',
        production_cost: 'production',
      };

      const history = rows.map((row) => {
        let requestData = {};
        try {
          requestData = JSON.parse(row.request_data || '{}');
        } catch (e) {
          logger.warn(`[财务历史] 无法解析 request_data (id=${row.id}): ${e.message}`);
        }

        // 确定执行期间显示
        let periodDisplay = row.operation;
        if (requestData.period) {
          periodDisplay = requestData.period;
        } else if (requestData.year) {
          periodDisplay = `${requestData.year}年度`;
        } else if (requestData.taskCode) {
          periodDisplay = requestData.taskCode;
        }

        return {
          id: row.id,
          type: operationTypeMap[row.operation] || row.operation,
          period: periodDisplay,
          status: row.status === 200 || row.status === null ? 'success' : 'failed',
          result: requestData.message || row.operation,
          executedAt: row.executed_at,
          executedBy: row.executed_by || 'system',
        };
      });

      ResponseHandler.success(res, {
        items: history,
        total: countResult[0].total,
        page: pageNum,
        pageSize: pageSizeNum,
      }, '获取执行历史成功');
    } catch (error) {
      logger.error('获取执行历史失败:', error);
      ResponseHandler.error(res, error.message || '获取执行历史失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 重新计算库存成本
   */
  static async recalculateInventoryCost(req, res) {
    try {
      const { materialId, method } = req.body;
      const result = await CostAccountingService.recalculateInventoryCost(materialId, method);
      ResponseHandler.success(res, result, '库存成本重新计算完成');
    } catch (error) {
      logger.error('重新计算库存成本失败:', error);
      ResponseHandler.error(res, error.message || '重新计算库存成本失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 财务仪表板数据
   */
  static async getDashboardData(req, res) {
    try {
      const { startDate, endDate } = req.query;

      // 获取基础财务数据
      const financialData = await AdvancedReportsService.getFinancialData(startDate, endDate);

      // 计算关键指标
      const ratios = AdvancedReportsService.calculateFinancialRatios(financialData);

      // 构建仪表板数据
      const dashboardData = {
        period: { startDate, endDate },
        summary: {
          totalRevenue: financialData.income.totalRevenue,
          netIncome: financialData.income.netIncome,
          totalAssets: financialData.assets.totalAssets,
          totalLiabilities: financialData.liabilities.totalLiabilities,
          totalEquity: financialData.equity.totalEquity,
        },
        keyRatios: {
          currentRatio: ratios.liquidity.currentRatio,
          debtToAssetRatio: ratios.leverage.debtToAssetRatio,
          netProfitMargin: ratios.profitability.netProfitMargin,
          returnOnAssets: ratios.profitability.returnOnAssets,
        },
        financialData,
        ratios,
      };

      ResponseHandler.success(res, dashboardData, '财务仪表板数据获取成功');
    } catch (error) {
      logger.error('获取财务仪表板数据失败:', error);
      ResponseHandler.error(res, error.message || '获取财务仪表板数据失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 初始化财务增强功能相关表
   */
  static async initializeSystem(req, res) {
    try {
      await PeriodEndService.initializePeriodEndTables();
      await CostAccountingService.initializeCostAccountingTables();
      ResponseHandler.success(res, null, '财务增强功能初始化完成');
    } catch (error) {
      logger.error('初始化财务增强功能失败:', error);
      ResponseHandler.error(res, error.message || '初始化财务增强功能失败', 'SERVER_ERROR', 500, error);
    }
  }
}

module.exports = FinanceEnhancementController;
