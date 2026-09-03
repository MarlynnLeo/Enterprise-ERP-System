/**
 * financeEnhancementController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const ManualVoucherService = require('../../../services/finance/ManualVoucherService');
const PeriodEndService = require('../../../services/business/PeriodEndService');
const CostAccountingService = require('../../../services/business/CostAccountingService');
const AdvancedReportsService = require('../../../services/utils/AdvancedReportsService');
const db = require('../../../config/db');
const { toLocalDateString } = require('../../../utils/dateUtils');
const { safeParseId } = require('../../../utils/safeParseId');
const { getRequestActorLabel } = require('../../../utils/userUtils');
const InventoryPostingService = require('../../../services/InventoryPostingService');

function getDefaultReportRange(query = {}) {
  const today = new Date();
  const defaultStartDate = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1));
  const defaultEndDate = toLocalDateString(today);

  return {
    ...query,
    startDate: query.startDate || defaultStartDate,
    endDate: query.endDate || defaultEndDate,
  };
}

function parsePositiveInteger(value, fallback, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

/** 统一错误响应（ManualVoucherService 抛出的业务错误带 statusCode/code） */
function respondServiceError(res, error, fallbackMessage) {
  const status = error.statusCode || 500;
  const code = error.code || (status >= 500 ? 'SERVER_ERROR' : 'BAD_REQUEST');
  if (status >= 500) {
    logger.error(fallbackMessage, error);
  }
  return ResponseHandler.error(res, error.message || fallbackMessage, code, status, error);
}

function respondGenerateResult(res, result, successMessage, skipMessagePrefix) {
  if (result?.skipped) {
    const inv = result.invoiceNumber ? `（${result.invoiceNumber}）` : '';
    return ResponseHandler.success(
      res,
      result,
      result.message || `${skipMessagePrefix}${inv}，无需重复生成`
    );
  }
  return ResponseHandler.success(res, result, successMessage);
}

/**
 * 财务增强功能控制器
 * 处理财务模块的增强功能API请求
 * 注意: 审批功能已移除，统一通过 RBAC 权限按钮控制
 */
class FinanceEnhancementController {
  // ==================== 库存过账财务审核 ====================

  static async listInventoryPostings(req, res) {
    try {
      const result = await InventoryPostingService.list(req.query);
      return ResponseHandler.paginated(
        res,
        result.list,
        result.total,
        result.page,
        result.pageSize,
        '库存过账列表获取成功'
      );
    } catch (error) {
      return respondServiceError(res, error, '获取库存过账列表失败');
    }
  }

  static async getInventoryPosting(req, res) {
    try {
      const result = await InventoryPostingService.get(req.params.id);
      return ResponseHandler.success(res, result, '库存过账详情获取成功');
    } catch (error) {
      return respondServiceError(res, error, '获取库存过账详情失败');
    }
  }

  static async approveInventoryPosting(req, res) {
    try {
      const actor = InventoryPostingService.actorFromRequest(req);
      const result = await InventoryPostingService.approve(req.params.id, actor);
      return ResponseHandler.success(res, result, '库存过账审核通过，库存已正式入账');
    } catch (error) {
      return respondServiceError(res, error, '库存过账审核失败');
    }
  }

  static async rejectInventoryPosting(req, res) {
    try {
      const actor = InventoryPostingService.actorFromRequest(req);
      const result = await InventoryPostingService.reject(req.params.id, actor, req.body?.remark || '');
      return ResponseHandler.success(res, result, '库存过账已驳回');
    } catch (error) {
      return respondServiceError(res, error, '驳回库存过账失败');
    }
  }

  static async reverseInventoryPosting(req, res) {
    try {
      const actor = InventoryPostingService.actorFromRequest(req);
      const result = await InventoryPostingService.reverse(req.params.id, actor, req.body?.remark || '');
      return ResponseHandler.success(res, result, '反审核申请已提交，待财务审批后正式冲销库存');
    } catch (error) {
      return respondServiceError(res, error, '库存过账反审核失败');
    }
  }

  // ==================== 手工凭证集成（委托 ManualVoucherService） ====================

  /** 专业主路径：可生成凭证的采购入库单 */
  static async listEligiblePurchaseReceiptsForVoucher(req, res) {
    try {
      const { list, total, page, pageSize } =
        await ManualVoucherService.listEligiblePurchaseReceipts(req.query);
      return ResponseHandler.paginated(
        res,
        list,
        total,
        page,
        pageSize,
        '可生成凭证的采购入库单'
      );
    } catch (error) {
      return respondServiceError(res, error, '获取可生成凭证采购入库单失败');
    }
  }

  /** 专业主路径：可生成凭证的销售出库单 */
  static async listEligibleSalesOutboundsForVoucher(req, res) {
    try {
      const { list, total, page, pageSize } =
        await ManualVoucherService.listEligibleSalesOutbounds(req.query);
      return ResponseHandler.paginated(
        res,
        list,
        total,
        page,
        pageSize,
        '可生成凭证的销售出库单'
      );
    } catch (error) {
      return respondServiceError(res, error, '获取可生成凭证销售出库单失败');
    }
  }

  /** 例外：订单级销售（不推荐主路径） */
  static async listEligibleSalesOrdersForVoucher(req, res) {
    try {
      const { list, total, page, pageSize } =
        await ManualVoucherService.listEligibleSalesOrders(req.query);
      return ResponseHandler.paginated(res, list, total, page, pageSize, '可生成凭证的销售订单');
    } catch (error) {
      return respondServiceError(res, error, '获取可生成凭证销售订单失败');
    }
  }

  /** 例外：订单级采购（不推荐主路径） */
  static async listEligiblePurchaseOrdersForVoucher(req, res) {
    try {
      const { list, total, page, pageSize } =
        await ManualVoucherService.listEligiblePurchaseOrders(req.query);
      return ResponseHandler.paginated(res, list, total, page, pageSize, '可生成凭证的采购订单');
    } catch (error) {
      return respondServiceError(res, error, '获取可生成凭证采购订单失败');
    }
  }

  /**
   * body: { businessType, ids, merge?=true }
   * 默认合并为一张凭证预览
   */
  static async batchPreviewVouchersFromOrders(req, res) {
    try {
      const businessType = String(req.body?.businessType || req.body?.type || '').trim();
      const data = await ManualVoucherService.batchPreview(businessType, req.body?.ids, {
        merge: req.body?.merge,
      });
      return ResponseHandler.success(
        res,
        data,
        data.message ||
          `预览完成：可生成 ${data.readyCount} 张，已存在 ${data.skippedCount}，失败 ${data.failedCount}`
      );
    } catch (error) {
      return respondServiceError(res, error, '预览凭证失败');
    }
  }

  /**
   * body: { businessType, ids, merge?=true, overrides? }
   * 默认：各单开票 + 1 张合并总账；merge=false 时一单一证
   */
  static async batchGenerateVouchersFromOrders(req, res) {
    try {
      const businessType = String(req.body?.businessType || req.body?.type || '').trim();
      const data = await ManualVoucherService.batchGenerate(
        businessType,
        req.body?.ids,
        req.user?.id || null,
        req.body?.overrides || null,
        { merge: req.body?.merge }
      );
      const voucherHint = data.merge
        ? data.mergedEntry
          ? `（合并为 1 张凭证 ${data.mergedEntry.entryNumber || data.mergedEntry.entryId}）`
          : '（合并模式）'
        : `（共 ${data.successCount} 张独立凭证）`;
      return ResponseHandler.success(
        res,
        data,
        `批量生成完成：成功 ${data.successCount}，已存在 ${data.skippedCount}，失败 ${data.failedCount}${voucherHint}`
      );
    } catch (error) {
      return respondServiceError(res, error, '批量生成凭证失败');
    }
  }

  /** 主路径：出库 → 应收 */
  static async generateARInvoiceFromSalesOutbound(req, res) {
    try {
      const outboundId = safeParseId(req.params.outboundId);
      const { result } = await ManualVoucherService.generateFromSalesOutbound(
        outboundId,
        req.user?.id
      );
      return respondGenerateResult(
        res,
        result,
        '应收发票与会计凭证生成成功',
        '该销售出库单已生成应收发票'
      );
    } catch (error) {
      return respondServiceError(res, error, '从销售出库单生成应收失败');
    }
  }

  /** 主路径：入库 → 应付 */
  static async generateAPInvoiceFromPurchaseReceipt(req, res) {
    try {
      const receiptId = safeParseId(req.params.receiptId);
      const { result } = await ManualVoucherService.generateFromPurchaseReceipt(
        receiptId,
        req.user?.id
      );
      return respondGenerateResult(
        res,
        result,
        '应付发票与会计凭证生成成功',
        '该采购入库单已生成应付发票'
      );
    } catch (error) {
      return respondServiceError(res, error, '生成应付发票失败');
    }
  }

  /** 例外：整单销售订单（补录） */
  static async generateARInvoiceFromSalesOrder(req, res) {
    try {
      const salesOrderId = safeParseId(req.params.salesOrderId);
      const { result } = await ManualVoucherService.generateFromSalesOrder(
        salesOrderId,
        req.user?.id
      );
      return respondGenerateResult(
        res,
        result,
        '应收发票与会计凭证生成成功',
        '该销售订单已生成应收发票'
      );
    } catch (error) {
      return respondServiceError(res, error, '生成应收发票失败');
    }
  }

  /** 例外：整单采购订单（补录） */
  static async generateAPInvoiceFromPurchaseOrder(req, res) {
    try {
      const purchaseOrderId = safeParseId(req.params.purchaseOrderId);
      const { result } = await ManualVoucherService.generateFromPurchaseOrder(
        purchaseOrderId,
        req.user?.id
      );
      return respondGenerateResult(
        res,
        result,
        '应付发票与会计凭证生成成功',
        '该采购订单已生成应付发票'
      );
    } catch (error) {
      return respondServiceError(res, error, '从采购订单生成应付发票失败');
    }
  }

  // ==================== 期末处理功能 ====================

  // 期末结账方法已移除，统一使用主财务控制器的逻辑

  /**
   * 获取期间结账状态
   */
  static async getPeriodClosingStatus(req, res) {
    try {
      const periodId = safeParseId(req.params.periodId);

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

  // ==================== 三单匹配 / 业财状态 ====================

  static async createThreeWayMatchFromReceipt(req, res) {
    try {
      const ThreeWayMatchService = require('../../../services/finance/ThreeWayMatchService');
      const receiptId = safeParseId(req.params.receiptId);
      const data = await ThreeWayMatchService.createFromReceipt(receiptId, {
        userId: req.user?.id,
        supplierInvoiceNumber: req.body?.supplierInvoiceNumber,
        remark: req.body?.remark,
      });
      return ResponseHandler.success(res, data, '三单匹配单已创建');
    } catch (error) {
      return respondServiceError(res, error, '创建三单匹配失败');
    }
  }

  static async listThreeWayMatches(req, res) {
    try {
      const ThreeWayMatchService = require('../../../services/finance/ThreeWayMatchService');
      const data = await ThreeWayMatchService.list(req.query);
      return ResponseHandler.paginated(
        res,
        data.list,
        data.total,
        data.page,
        data.pageSize,
        '三单匹配列表'
      );
    } catch (error) {
      return respondServiceError(res, error, '获取三单匹配列表失败');
    }
  }

  static async getThreeWayMatch(req, res) {
    try {
      const ThreeWayMatchService = require('../../../services/finance/ThreeWayMatchService');
      const id = safeParseId(req.params.id);
      const data = await ThreeWayMatchService.getById(id);
      if (!data) return ResponseHandler.error(res, '匹配单不存在', 'NOT_FOUND', 404);
      return ResponseHandler.success(res, data, '三单匹配详情');
    } catch (error) {
      return respondServiceError(res, error, '获取三单匹配详情失败');
    }
  }

  static async confirmThreeWayMatch(req, res) {
    try {
      const ThreeWayMatchService = require('../../../services/finance/ThreeWayMatchService');
      const id = safeParseId(req.params.id);
      const data = await ThreeWayMatchService.confirm(id, req.user?.id, {
        forceVariance: req.body?.forceVariance === true || req.body?.force === true,
      });
      return ResponseHandler.success(res, data, '三单匹配已确认');
    } catch (error) {
      return respondServiceError(res, error, '确认三单匹配失败');
    }
  }

  static async updateThreeWayMatchLines(req, res) {
    try {
      const ThreeWayMatchService = require('../../../services/finance/ThreeWayMatchService');
      const id = safeParseId(req.params.id);
      const lines = req.body?.lines || req.body?.items || [];
      const data = await ThreeWayMatchService.updateInvoiceLines(id, lines, {
        userId: req.user?.id,
        remark: req.body?.remark,
      });
      return ResponseHandler.success(res, data, '发票量价已更新');
    } catch (error) {
      return respondServiceError(res, error, '更新三单匹配失败');
    }
  }

  static async cancelThreeWayMatch(req, res) {
    try {
      const ThreeWayMatchService = require('../../../services/finance/ThreeWayMatchService');
      const id = safeParseId(req.params.id);
      const data = await ThreeWayMatchService.cancel(
        id,
        req.user?.id,
        req.body?.reason || ''
      );
      return ResponseHandler.success(res, data, '三单匹配已取消');
    } catch (error) {
      return respondServiceError(res, error, '取消三单匹配失败');
    }
  }

  static async getPurchaseReceiptFinanceStatus(req, res) {
    try {
      const FinanceDocumentStatusService = require('../../../services/finance/FinanceDocumentStatusService');
      const id = safeParseId(req.params.receiptId);
      const data = await FinanceDocumentStatusService.getPurchaseReceiptStatus(id);
      if (!data) return ResponseHandler.error(res, '入库单不存在', 'NOT_FOUND', 404);
      return ResponseHandler.success(res, data, '采购入库业财状态');
    } catch (error) {
      return respondServiceError(res, error, '获取业财状态失败');
    }
  }

  static async getSalesOutboundFinanceStatus(req, res) {
    try {
      const FinanceDocumentStatusService = require('../../../services/finance/FinanceDocumentStatusService');
      const id = safeParseId(req.params.outboundId);
      const data = await FinanceDocumentStatusService.getSalesOutboundStatus(id);
      if (!data) return ResponseHandler.error(res, '出库单不存在', 'NOT_FOUND', 404);
      return ResponseHandler.success(res, data, '销售出库业财状态');
    } catch (error) {
      return respondServiceError(res, error, '获取业财状态失败');
    }
  }

  static async getBankReconciliationBalanceSheet(req, res) {
    try {
      const BankReconciliationReportService = require('../../../services/finance/BankReconciliationReportService');
      const data = await BankReconciliationReportService.getBalanceSheet({
        accountId: req.query.accountId || req.query.account_id,
        asOfDate: req.query.asOfDate || req.query.as_of_date,
      });
      return ResponseHandler.success(res, data, '银行余额调节表');
    } catch (error) {
      return respondServiceError(res, error, '获取银行余额调节表失败');
    }
  }

  // ==================== 成本核算功能 ====================
  // 注意：calculateStandardCost / calculateActualCost / analyzeCostVariance
  // 已由 costController 中的同名方法替代，此处不再重复定义。

  // ==================== 高级报表功能 ====================

  /**
   * 财务比率分析
   */
  static async generateFinancialRatioAnalysis(req, res) {
    try {
      const params = getDefaultReportRange(req.query);

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
      const params = getDefaultReportRange(req.query);

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
      const year = safeParseId(req.params.year);
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
      yearData.transferred_by = getRequestActorLabel(req);
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
      const pageNum = parsePositiveInteger(page, 1, 1000);
      const pageSizeNum = parsePositiveInteger(pageSize, 20, 100);
      const offset = (pageNum - 1) * pageSizeNum;

      // 从operation_logs表获取自动化相关的操作记录（使用参数化查询）
      const [rows] = await db.pool.query(`
        SELECT
          ol.id,
          ol.module,
          ol.operation,
          COALESCE(NULLIF(TRIM(u.real_name), ''), ol.username) as executed_by,
          ol.request_data,
          ol.status,
          ol.created_at as executed_at
        FROM operation_logs ol
        LEFT JOIN users u
          ON CONVERT(u.username USING utf8mb4) COLLATE utf8mb4_unicode_ci
           = CONVERT(ol.username USING utf8mb4) COLLATE utf8mb4_unicode_ci
        WHERE ol.operation IN (
          'depreciation', 'period_close', 'period_end',
          'year_end_transfer', 'year_end_freeze', 'year_end_execute',
          'production_cost'
        )
        ORDER BY ol.created_at DESC
        LIMIT ${pageSizeNum} OFFSET ${offset}
      `);

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
          executedBy: (row.executed_by || getRequestActorLabel(req) || null),
        };
      });

      ResponseHandler.paginated(res, history, countResult[0].total, pageNum, pageSizeNum, '获取执行历史成功', {
        items: history,
      });
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
      const { startDate, endDate } = getDefaultReportRange(req.query);

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
      // 表结构统一由 Knex migration 管理，此接口只补齐增强模块的基础配置数据。
      await CostAccountingService.initializeCostAccountingTables();
      ResponseHandler.success(res, null, '财务增强功能初始化完成');
    } catch (error) {
      logger.error('初始化财务增强功能失败:', error);
      ResponseHandler.error(res, error.message || '初始化财务增强功能失败', 'SERVER_ERROR', 500, error);
    }
  }
}

module.exports = FinanceEnhancementController;
