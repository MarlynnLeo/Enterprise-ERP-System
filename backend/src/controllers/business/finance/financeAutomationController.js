/**
 * financeAutomationController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

// const ProductionCostService = require('../../../services/business/ProductionCostService'); // 已废弃
const PeriodEndService = require('../../../services/business/PeriodEndService');
const DepreciationService = require('../../../services/business/DepreciationService');
const ScheduledTaskService = require('../../../services/business/ScheduledTaskService');

/**
 * 财务自动化控制器
 * 处理财务自动化相关的API请求
 */
class FinanceAutomationController {
  /**
   * 生产完工自动生成成本分录
   */
  static async generateProductionCostEntry(req, res) {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return ResponseHandler.error(res, '生产任务ID不能为空', 'BAD_REQUEST', 400);
      }

      const CostAccountingService = require('../../../services/business/CostAccountingService');
      const result = await CostAccountingService.calculateActualCost(parseInt(taskId));

      ResponseHandler.success(res, result, '生产完工成本分录生成成功');
    } catch (error) {
      logger.error('生产完工成本分录生成失败:', error);
      ResponseHandler.error(
        res,
        error.message || '生产完工成本分录生成失败',
        'SERVER_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 生产领料自动生成分录
   */
  static async generateMaterialIssueEntry(req, res) {
    // 已废弃单独生成领料凭证的操作
    return ResponseHandler.success(res, null, '生产领料凭证现已在完工时自动统筹生成，无需单独触发');
  }

  /**
   * 执行期末自动结转
   */
  static async executePeriodEndClosing(req, res) {
    try {
      const { periodId } = req.params;

      if (!periodId) {
        return ResponseHandler.error(res, '期间ID不能为空', 'BAD_REQUEST', 400);
      }

      const result = await PeriodEndService.executeAutoClosing(parseInt(periodId), {
        closed_by: req.user?.id || 'system',
      });

      ResponseHandler.success(res, result, '期末自动结转完成');
    } catch (error) {
      logger.error('期末自动结转失败:', error);
      ResponseHandler.error(res, error.message || '期末自动结转失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 计提月度折旧
   */
  static async calculateMonthlyDepreciation(req, res) {
    try {
      const { periodMonth } = req.params;

      if (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth)) {
        return ResponseHandler.error(res, '期间月份格式错误，应为 YYYY-MM', 'BAD_REQUEST', 400);
      }

      const result = await DepreciationService.calculateMonthlyDepreciation(periodMonth);

      ResponseHandler.success(res, result, '月度折旧计提完成');
    } catch (error) {
      logger.error('月度折旧计提失败:', error);
      ResponseHandler.error(res, error.message || '月度折旧计提失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 获取定时任务状态
   */
  static async getScheduledTaskStatus(req, res) {
    try {
      const status = ScheduledTaskService.getTaskStatus();

      ResponseHandler.success(res, status, '获取定时任务状态成功');
    } catch (error) {
      logger.error('获取定时任务状态失败:', error);
      ResponseHandler.error(
        res,
        error.message || '获取定时任务状态失败',
        'SERVER_ERROR',
        500,
        error
      );
    }
  }

  /**
   * 启动定时任务
   */
  static async startScheduledTasks(req, res) {
    try {
      ScheduledTaskService.startAllTasks();

      ResponseHandler.success(res, null, '定时任务启动成功');
    } catch (error) {
      logger.error('启动定时任务失败:', error);
      ResponseHandler.error(res, error.message || '启动定时任务失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 停止定时任务
   */
  static async stopScheduledTasks(req, res) {
    try {
      ScheduledTaskService.stopAllTasks();

      ResponseHandler.success(res, null, '定时任务停止成功');
    } catch (error) {
      logger.error('停止定时任务失败:', error);
      ResponseHandler.error(res, error.message || '停止定时任务失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 重启特定定时任务
   */
  static async restartScheduledTask(req, res) {
    try {
      const { taskName } = req.params;

      if (!taskName) {
        return ResponseHandler.error(res, '任务名称不能为空', 'BAD_REQUEST', 400);
      }

      const result = ScheduledTaskService.restartTask(taskName);

      if (result) {
        ResponseHandler.success(res, null, `任务 ${taskName} 重启成功`);
      } else {
        ResponseHandler.error(res, `任务 ${taskName} 不存在`, 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('重启定时任务失败:', error);
      ResponseHandler.error(res, error.message || '重启定时任务失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 手动执行月度折旧
   */
  static async executeDepreciationManually(req, res) {
    try {
      const { periodMonth } = req.params;

      if (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth)) {
        return ResponseHandler.error(res, '期间月份格式错误，应为 YYYY-MM', 'BAD_REQUEST', 400);
      }

      const result = await ScheduledTaskService.executeDepreciationManually(periodMonth);

      ResponseHandler.success(res, result, '手动折旧计提完成');
    } catch (error) {
      logger.error('手动折旧计提失败:', error);
      ResponseHandler.error(res, error.message || '手动折旧计提失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 手动执行期末结转
   */
  static async executePeriodEndManually(req, res) {
    try {
      const { periodId } = req.params;

      if (!periodId) {
        return ResponseHandler.error(res, '期间ID不能为空', 'BAD_REQUEST', 400);
      }

      const result = await ScheduledTaskService.executePeriodEndManually(parseInt(periodId));

      ResponseHandler.success(res, result, '手动期末结转完成');
    } catch (error) {
      logger.error('手动期末结转失败:', error);
      ResponseHandler.error(res, error.message || '手动期末结转失败', 'SERVER_ERROR', 500, error);
    }
  }

  // ==================== 成本闭环模块 ====================

  /**
   * 计算期末在制品成本
   * GET /api/finance/automation/wip/calculate?periodId=&snapshotDate=
   */
  static async calculateWIPCost(req, res) {
    try {
      const { periodId, snapshotDate } = req.query;

      const CostAccountingService = require('../../../services/business/CostAccountingService');
      const result = await CostAccountingService.calculateWIPCost(
        periodId ? parseInt(periodId) : null,
        snapshotDate || null
      );

      ResponseHandler.success(res, result, '在制品成本计算完成');
    } catch (error) {
      logger.error('在制品成本计算失败:', error);
      ResponseHandler.error(res, error.message || '在制品成本计算失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 生成在制品月末凭证
   * POST /api/finance/automation/wip/voucher/:periodId
   */
  static async generateWIPVoucher(req, res) {
    try {
      const { periodId } = req.params;

      if (!periodId) {
        return ResponseHandler.error(res, '期间ID不能为空', 'BAD_REQUEST', 400);
      }

      const CostAccountingService = require('../../../services/business/CostAccountingService');
      const result = await CostAccountingService.generateWIPVoucher(parseInt(periodId));

      ResponseHandler.success(res, result, 'WIP凭证生成完成');
    } catch (error) {
      logger.error('WIP凭证生成失败:', error);
      ResponseHandler.error(res, error.message || 'WIP凭证生成失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 计算并分摊成本差异
   * POST /api/finance/automation/variance/:periodId
   */
  static async allocateVariance(req, res) {
    try {
      const { periodId } = req.params;

      if (!periodId) {
        return ResponseHandler.error(res, '期间ID不能为空', 'BAD_REQUEST', 400);
      }

      const CostAccountingService = require('../../../services/business/CostAccountingService');
      const result = await CostAccountingService.allocateVariance(parseInt(periodId));

      ResponseHandler.success(res, result, '成本差异分摊完成');
    } catch (error) {
      logger.error('成本差异分摊失败:', error);
      ResponseHandler.error(res, error.message || '成本差异分摊失败', 'SERVER_ERROR', 500, error);
    }
  }

  /**
   * 执行完整的月末成本结转流程
   * POST /api/finance/automation/cost-closing/:periodId
   */
  static async executeCostClosing(req, res) {
    try {
      const { periodId } = req.params;

      if (!periodId) {
        return ResponseHandler.error(res, '期间ID不能为空', 'BAD_REQUEST', 400);
      }

      const pid = parseInt(periodId);
      const CostAccountingService = require('../../../services/business/CostAccountingService');
      const results = {
        wip: null,
        wipVoucher: null,
        variance: null,
      };

      // 1. 计算在制品成本
      logger.info(`[成本结转] 期间 ${pid}: 开始计算在制品成本...`);
      results.wip = await CostAccountingService.calculateWIPCost(pid);

      // 2. 生成 WIP 凭证
      logger.info(`[成本结转] 期间 ${pid}: 开始生成WIP凭证...`);
      results.wipVoucher = await CostAccountingService.generateWIPVoucher(pid);

      // 3. 计算并分摊差异
      logger.info(`[成本结转] 期间 ${pid}: 开始差异分摊...`);
      results.variance = await CostAccountingService.allocateVariance(pid);

      logger.info(`[成本结转] 期间 ${pid}: 月末成本结转完成`);

      ResponseHandler.success(res, results, '月末成本结转完成');
    } catch (error) {
      // 检查是否为重复结转错误
      if (
        error.code === 'ER_DUP_ENTRY' ||
        (error.message && error.message.includes('Duplicate entry'))
      ) {
        logger.warn(`[成本结转] 期间 ${req.params.periodId}: 重复结转尝试被阻止`);
        return ResponseHandler.error(
          res,
          '该期间已执行过结转，请勿重复操作。如需重新结转，请先删除已有凭证。',
          'DUPLICATE_CLOSING',
          400,
          error
        );
      }

      logger.error('月末成本结转失败:', error);
      ResponseHandler.error(res, error.message || '月末成本结转失败', 'SERVER_ERROR', 500, error);
    }
  }
}

module.exports = FinanceAutomationController;
