/**
 * 预算管理控制器
 *
 * @module controllers/business/finance/budgetController
 */

const budgetModel = require('../../../models/budget');
const BudgetControlService = require('../../../services/business/BudgetControlService');
const BudgetAnalysisService = require('../../../services/business/BudgetAnalysisService');
const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getCurrentUserName } = require('../../../utils/userHelper');
const db = require('../../../config/db');

const budgetController = {
  /**
   * 创建预算
   */
  createBudget: async (req, res) => {
    try {
      const { budget, details } = req.body;

      // 验证必填字段
      if (
        !budget ||
        !budget.budget_name ||
        !budget.budget_year ||
        !budget.start_date ||
        !budget.end_date
      ) {
        return ResponseHandler.error(res, '缺少必填字段', 'VALIDATION_ERROR', 400);
      }

      // 生成预算编号
      const budgetNo = await BudgetControlService.generateBudgetNo(budget.budget_year);

      // 创建预算
      const budgetId = await budgetModel.createBudget(
        {
          ...budget,
          budget_no: budgetNo,
          created_by: await getCurrentUserName(req),
        },
        details || []
      );

      return ResponseHandler.success(
        res,
        { id: budgetId, budget_no: budgetNo },
        '创建预算成功',
        201
      );
    } catch (error) {
      logger.error('创建预算失败:', error);
      return ResponseHandler.error(res, '创建预算失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取预算列表
   */
  getBudgets: async (req, res) => {
    try {
      const { page = 1, pageSize = 20, ...filters } = req.query;

      const offset = (page - 1) * pageSize;
      const budgets = await budgetModel.getBudgets({
        ...filters,
        limit: parseInt(pageSize),
        offset: offset,
      });

      const total = await budgetModel.getBudgetsCount(filters);

      return ResponseHandler.success(res, {
        list: budgets,
        total: total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
      });
    } catch (error) {
      logger.error('获取预算列表失败:', error);
      return ResponseHandler.error(res, '获取预算列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取预算详情
   */
  getBudgetById: async (req, res) => {
    try {
      const { id } = req.params;

      const budget = await budgetModel.getBudgetById(id);

      if (!budget) {
        return ResponseHandler.error(res, '预算不存在', 'NOT_FOUND', 404);
      }

      return ResponseHandler.success(res, budget);
    } catch (error) {
      logger.error('获取预算详情失败:', error);
      return ResponseHandler.error(res, '获取预算详情失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新预算（主表+明细同步更新）
   */
  updateBudget: async (req, res) => {
    try {
      const { id } = req.params;
      const { budget: budgetData, details } = req.body;
      // 兼容直接传主表字段的旧格式
      const mainData = budgetData || req.body;

      // 检查预算是否存在
      const existingBudget = await budgetModel.getBudgetById(id);
      if (!existingBudget) {
        return ResponseHandler.error(res, '预算不存在', 'NOT_FOUND', 404);
      }

      // 只有草稿和已驳回状态允许修改
      if (!['草稿', '待审批'].includes(existingBudget.status)) {
        return ResponseHandler.error(res, '该状态的预算不允许修改', 'VALIDATION_ERROR', 400);
      }

      // 使用事务同步更新主表和明细
      const connection = await db.pool.getConnection();
      try {
        await connection.beginTransaction();

        // 1. 更新主表
        await connection.execute(
          `UPDATE budgets SET budget_name = ?, budget_year = ?, budget_type = ?, department_id = ?,
           start_date = ?, end_date = ?, total_amount = ?, description = ? WHERE id = ?`,
          [
            mainData.budget_name, mainData.budget_year, mainData.budget_type,
            mainData.department_id || null, mainData.start_date, mainData.end_date,
            mainData.total_amount || 0, mainData.description || null, id
          ]
        );

        // 2. 如果提供了明细，先删旧再插新
        if (details && Array.isArray(details)) {
          await connection.execute('DELETE FROM budget_details WHERE budget_id = ?', [id]);
          for (const detail of details) {
            await connection.execute(
              `INSERT INTO budget_details (budget_id, account_id, department_id, budget_amount, warning_threshold, description)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [id, detail.account_id, detail.department_id || null, detail.budget_amount,
                detail.warning_threshold || 80.0, detail.description || null]
            );
          }
        }

        await connection.commit();
        return ResponseHandler.success(res, null, '更新预算成功');
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    } catch (error) {
      logger.error('更新预算失败:', error);
      return ResponseHandler.error(res, '更新预算失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除预算
   */
  deleteBudget: async (req, res) => {
    try {
      const { id } = req.params;

      // 检查预算是否存在
      const existingBudget = await budgetModel.getBudgetById(id);
      if (!existingBudget) {
        return ResponseHandler.error(res, '预算不存在', 'NOT_FOUND', 404);
      }

      // 检查状态是否允许删除
      if (existingBudget.status !== '草稿') {
        return ResponseHandler.error(res, '只有草稿状态的预算才能删除', 'VALIDATION_ERROR', 400);
      }

      const success = await budgetModel.deleteBudget(id);

      if (success) {
        return ResponseHandler.success(res, null, '删除预算成功');
      } else {
        return ResponseHandler.error(res, '删除预算失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('删除预算失败:', error);
      return ResponseHandler.error(res, '删除预算失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 提交预算审批（只有草稿状态可提交）
   */
  submitBudget: async (req, res) => {
    try {
      const { id } = req.params;

      // 校验当前状态
      const budget = await budgetModel.getBudgetById(id);
      if (!budget) {
        return ResponseHandler.error(res, '预算不存在', 'NOT_FOUND', 404);
      }
      if (budget.status !== '草稿') {
        return ResponseHandler.error(res, '只有草稿状态的预算才能提交审批', 'VALIDATION_ERROR', 400);
      }

      // 校验必须有明细
      if (!budget.details || budget.details.length === 0) {
        return ResponseHandler.error(res, '预算没有明细项，无法提交审批', 'VALIDATION_ERROR', 400);
      }

      const success = await budgetModel.updateBudgetStatus(id, '待审批', {
        approval_status: '审批中',
      });

      if (success) {
        return ResponseHandler.success(res, null, '提交审批成功');
      } else {
        return ResponseHandler.error(res, '提交审批失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('提交预算审批失败:', error);
      return ResponseHandler.error(res, '提交预算审批失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 审批预算（只有待审批状态可审批）
   */
  approveBudget: async (req, res) => {
    try {
      const { id } = req.params;
      const { approved } = req.body;

      // 校验当前状态
      const budget = await budgetModel.getBudgetById(id);
      if (!budget) {
        return ResponseHandler.error(res, '预算不存在', 'NOT_FOUND', 404);
      }
      if (budget.status !== '待审批') {
        return ResponseHandler.error(res, '只有待审批状态的预算才能审批', 'VALIDATION_ERROR', 400);
      }

      const status = approved ? '已审批' : '草稿';
      const approvalStatus = approved ? '已通过' : '已驳回';

      const success = await budgetModel.updateBudgetStatus(id, status, {
        approval_status: approvalStatus,
        approved_by: req.user.id,
      });

      if (success) {
        return ResponseHandler.success(res, null, approved ? '审批通过' : '审批驳回');
      } else {
        return ResponseHandler.error(res, '审批失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('审批预算失败:', error);
      return ResponseHandler.error(res, '审批预算失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 启动预算执行
   */
  startBudgetExecution: async (req, res) => {
    try {
      const { id } = req.params;

      // 检查预算状态
      const budget = await budgetModel.getBudgetById(id);
      if (!budget) {
        return ResponseHandler.error(res, '预算不存在', 'NOT_FOUND', 404);
      }

      if (budget.status !== '已审批') {
        return ResponseHandler.error(res, '只有已审批的预算才能启动执行', 'VALIDATION_ERROR', 400);
      }

      const success = await budgetModel.updateBudgetStatus(id, '执行中');

      if (success) {
        return ResponseHandler.success(res, null, '启动预算执行成功');
      } else {
        return ResponseHandler.error(res, '启动预算执行失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('启动预算执行失败:', error);
      return ResponseHandler.error(res, '启动预算执行失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 关闭预算（只有执行中状态可关闭）
   */
  closeBudget: async (req, res) => {
    try {
      const { id } = req.params;

      // 校验当前状态
      const budget = await budgetModel.getBudgetById(id);
      if (!budget) {
        return ResponseHandler.error(res, '预算不存在', 'NOT_FOUND', 404);
      }
      if (budget.status !== '执行中') {
        return ResponseHandler.error(res, '只有执行中的预算才能关闭', 'VALIDATION_ERROR', 400);
      }

      const success = await budgetModel.updateBudgetStatus(id, '已关闭');

      if (success) {
        return ResponseHandler.success(res, null, '关闭预算成功');
      } else {
        return ResponseHandler.error(res, '关闭预算失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('关闭预算失败:', error);
      return ResponseHandler.error(res, '关闭预算失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 检查预算可用性
   */
  checkBudgetAvailability: async (req, res) => {
    try {
      const { accountId, departmentId, amount, date } = req.query;

      if (!accountId || !amount || !date) {
        return ResponseHandler.error(res, '缺少必填参数', 'VALIDATION_ERROR', 400);
      }

      const result = await BudgetControlService.checkBudgetAvailability(
        parseInt(accountId),
        departmentId ? parseInt(departmentId) : null,
        parseFloat(amount),
        date
      );

      return ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('检查预算可用性失败:', error);
      return ResponseHandler.error(res, '检查预算可用性失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取预算执行记录
   */
  getBudgetExecutions: async (req, res) => {
    try {
      const { id } = req.params;

      const executions = await budgetModel.getBudgetExecutions(id);

      return ResponseHandler.success(res, executions);
    } catch (error) {
      logger.error('获取预算执行记录失败:', error);
      return ResponseHandler.error(res, '获取预算执行记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取预算执行率分析
   */
  getBudgetExecutionAnalysis: async (req, res) => {
    try {
      const { id } = req.params;

      const analysis = await BudgetAnalysisService.getBudgetExecutionAnalysis(parseInt(id));

      return ResponseHandler.success(res, analysis);
    } catch (error) {
      logger.error('获取预算执行率分析失败:', error);
      return ResponseHandler.error(res, '获取预算执行率分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取预算差异分析
   */
  getBudgetVarianceAnalysis: async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return ResponseHandler.error(res, '缺少日期参数', 'VALIDATION_ERROR', 400);
      }

      const analysis = await BudgetAnalysisService.getBudgetVarianceAnalysis(
        parseInt(id),
        startDate,
        endDate
      );

      return ResponseHandler.success(res, analysis);
    } catch (error) {
      logger.error('获取预算差异分析失败:', error);
      return ResponseHandler.error(res, '获取预算差异分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取部门预算对比分析
   */
  getDepartmentBudgetComparison: async (req, res) => {
    try {
      const { budgetYear } = req.query;

      if (!budgetYear) {
        return ResponseHandler.error(res, '缺少预算年度参数', 'VALIDATION_ERROR', 400);
      }

      const comparison = await BudgetAnalysisService.getDepartmentBudgetComparison(
        parseInt(budgetYear)
      );

      return ResponseHandler.success(res, comparison);
    } catch (error) {
      logger.error('获取部门预算对比分析失败:', error);
      return ResponseHandler.error(res, '获取部门预算对比分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取预算预警列表
   */
  getBudgetWarnings: async (req, res) => {
    try {
      const filters = req.query;

      const warnings = await budgetModel.getBudgetWarnings(filters);

      return ResponseHandler.success(res, warnings);
    } catch (error) {
      logger.error('获取预算预警列表失败:', error);
      return ResponseHandler.error(res, '获取预算预警列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 标记预警为已读
   */
  markWarningAsRead: async (req, res) => {
    try {
      const { id } = req.params;

      const success = await budgetModel.markWarningAsRead(id);

      if (success) {
        return ResponseHandler.success(res, null, '标记成功');
      } else {
        return ResponseHandler.error(res, '标记失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      logger.error('标记预警为已读失败:', error);
      return ResponseHandler.error(res, '标记预警为已读失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取实时预算执行分析
   */
  getRealTimeBudgetAnalysis: async (req, res) => {
    try {
      const { id } = req.params;

      const analysis = await budgetModel.getBudgetAnalysis(parseInt(id));

      return ResponseHandler.success(res, analysis);
    } catch (error) {
      logger.error('获取实时预算分析失败:', error);
      return ResponseHandler.error(res, '获取实时预算分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ==================== AI 预算分析 ====================

  /**
   * 获取AI预算编制建议
   */
  getAIRecommendation: async (req, res) => {
    try {
      const BudgetAIService = require('../../../services/business/BudgetAIService');
      const { year, departmentId } = req.query;

      const targetYear = parseInt(year) || new Date().getFullYear() + 1;
      const result = await BudgetAIService.generateBudgetRecommendation(
        targetYear,
        departmentId ? parseInt(departmentId) : null
      );

      return ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取AI预算建议失败:', error);
      return ResponseHandler.error(res, '获取AI预算建议失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取AI异常检测
   */
  getAIAnomalies: async (req, res) => {
    try {
      const BudgetAIService = require('../../../services/business/BudgetAIService');
      const { id } = req.params;

      const result = await BudgetAIService.detectAnomalies(parseInt(id));

      return ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取AI异常检测失败:', error);
      return ResponseHandler.error(res, '获取AI异常检测失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取AI预算优化建议
   */
  getAIOptimization: async (req, res) => {
    try {
      const BudgetAIService = require('../../../services/business/BudgetAIService');
      const { id } = req.params;

      const result = await BudgetAIService.optimizeBudgetAllocation(parseInt(id));

      return ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取AI预算优化建议失败:', error);
      return ResponseHandler.error(res, '获取AI预算优化建议失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取AI年度对比分析
   */
  getAIYearComparison: async (req, res) => {
    try {
      const BudgetAIService = require('../../../services/business/BudgetAIService');
      const { year1, year2 } = req.query;

      if (!year1 || !year2) {
        return ResponseHandler.error(res, '缺少年度参数(year1, year2)', 'VALIDATION_ERROR', 400);
      }

      const result = await BudgetAIService.compareYearlyBudgets(parseInt(year1), parseInt(year2));

      return ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取AI年度对比分析失败:', error);
      return ResponseHandler.error(res, '获取AI年度对比分析失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取AI综合报告
   */
  getAIComprehensiveReport: async (req, res) => {
    try {
      const BudgetAIService = require('../../../services/business/BudgetAIService');
      const { id } = req.params;

      const result = await BudgetAIService.generateComprehensiveReport(parseInt(id));

      return ResponseHandler.success(res, result);
    } catch (error) {
      logger.error('获取AI综合报告失败:', error);
      return ResponseHandler.error(res, '获取AI综合报告失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取AI Token用量统计
   */
  getAIUsageStats: async (req, res) => {
    try {
      const BudgetAIService = require('../../../services/business/BudgetAIService');
      const stats = BudgetAIService.getUsageStats();
      return ResponseHandler.success(res, stats);
    } catch (error) {
      logger.error('获取AI用量统计失败:', error);
      return ResponseHandler.error(res, '获取AI用量统计失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 从AI建议一键创建预算
   */
  createBudgetFromAI: async (req, res) => {
    try {
      const { budget_name, budget_year, recommendations } = req.body;

      if (!budget_year || !recommendations?.length) {
        return ResponseHandler.error(res, '缺少年度或建议数据', 'VALIDATION_ERROR', 400);
      }

      // 查找科目代码对应的account_id
      const codes = recommendations.map(r => r.account_code);
      const placeholders = codes.map(() => '?').join(',');
      const [accounts] = await db.pool.execute(
        `SELECT id, account_code FROM gl_accounts WHERE account_code IN (${placeholders})`,
        codes
      );
      const codeToId = {};
      accounts.forEach(a => { codeToId[a.account_code] = a.id; });

      // 计算总预算
      const totalAmount = recommendations.reduce((sum, r) => sum + (parseFloat(r.recommended_budget) || 0), 0);

      // 构建预算数据
      const budgetData = {
        budget_name: budget_name || `${budget_year}年AI智能预算`,
        budget_year,
        budget_type: '年度预算',
        department_id: null,
        start_date: `${budget_year}-01-01`,
        end_date: `${budget_year}-12-31`,
        total_amount: Math.round(totalAmount * 100) / 100,
        status: '草稿',
        description: `由AI智能分析自动生成 (${new Date().toLocaleDateString('zh-CN')})`,
        created_by: await getCurrentUserName(req),
      };

      // 构建明细数据
      const details = recommendations.map(r => ({
        account_id: codeToId[r.account_code],
        budget_amount: parseFloat(r.recommended_budget) || 0,
        warning_threshold: 80,
        description: `${r.account_name || r.account_code} - AI建议 (置信度:${r.confidence || '中'})`,
      })).filter(d => d.account_id); // 过滤掉找不到的科目

      // 生成预算编号并创建
      const budgetNo = await BudgetControlService.generateBudgetNo(budget_year);
      budgetData.budget_no = budgetNo;

      const budgetId = await budgetModel.createBudget(budgetData, details);

      logger.info(`AI预算创建成功: 预算#${budgetId} ${budgetNo}，${details.length}个明细`);
      return ResponseHandler.success(res, { id: budgetId, budget_no: budgetNo }, 'AI预算创建成功', 201);
    } catch (error) {
      logger.error('AI预算创建失败:', error);
      return ResponseHandler.error(res, 'AI预算创建失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = budgetController;
