/**
 * expenseController.js
 * @description 费用管理控制器
 * @date 2026-01-17
 * @version 1.0.0
 */

const expenseModel = require('../../../models/expense');
const { ResponseHandler } = require('../../../utils/responseHandler');
const logger = require('../../../utils/logger');
const { getCurrentUserName } = require('../../../utils/userHelper');

const expenseController = {
  // ==================== 初始化 ====================

  /**
   * 初始化费用管理表
   */
  async initExpenseTables(req, res) {
    try {
      const result = await expenseModel.initTables();
      ResponseHandler.success(res, result, '费用管理表初始化成功');
    } catch (error) {
      logger.error('初始化费用管理表失败:', error);
      ResponseHandler.error(res, '初始化费用管理表失败', 'SERVER_ERROR', 500, error);
    }
  },

  // ==================== 费用类型管理 ====================

  /**
   * 获取费用类型列表
   */
  async getExpenseCategories(req, res) {
    try {
      const { status, parentId, tree } = req.query;

      if (tree === 'true') {
        const data = await expenseModel.getExpenseCategoryTree();
        return ResponseHandler.success(res, data, '获取费用类型树成功');
      }

      const filters = {};
      if (status !== undefined) filters.status = parseInt(status);
      if (parentId !== undefined) filters.parentId = parentId;

      const data = await expenseModel.getExpenseCategories(filters);
      ResponseHandler.success(res, data, '获取费用类型列表成功');
    } catch (error) {
      logger.error('获取费用类型列表失败:', error);
      ResponseHandler.error(res, '获取费用类型列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建费用类型
   */
  async createExpenseCategory(req, res) {
    try {
      const { code, name, parent_id, description, status, sort_order } = req.body;

      if (!code || !name) {
        return ResponseHandler.error(res, '编码和名称为必填项', 'VALIDATION_ERROR', 400);
      }

      const result = await expenseModel.createExpenseCategory({
        code,
        name,
        parent_id,
        description,
        status,
        sort_order,
      });

      ResponseHandler.success(res, result, '费用类型创建成功');
    } catch (error) {
      logger.error('创建费用类型失败:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return ResponseHandler.error(res, '类型编码已存在', 'VALIDATION_ERROR', 400);
      }
      ResponseHandler.error(res, '创建费用类型失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新费用类型
   */
  async updateExpenseCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.updateExpenseCategory(id, req.body);
      ResponseHandler.success(res, result, '费用类型更新成功');
    } catch (error) {
      logger.error('更新费用类型失败:', error);
      ResponseHandler.error(res, '更新费用类型失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除费用类型
   */
  async deleteExpenseCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.deleteExpenseCategory(id);
      ResponseHandler.success(res, result, '费用类型删除成功');
    } catch (error) {
      logger.error('删除费用类型失败:', error);
      ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
  },

  // ==================== 费用记录管理 ====================

  /**
   * 生成费用编号
   */
  async generateExpenseNumber(req, res) {
    try {
      const number = await expenseModel.generateExpenseNumber();
      ResponseHandler.success(res, { expense_number: number }, '生成费用编号成功');
    } catch (error) {
      logger.error('生成费用编号失败:', error);
      ResponseHandler.error(res, '生成费用编号失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取费用列表
   */
  async getExpenses(req, res) {
    try {
      const {
        page = 1,
        pageSize = 20,
        category_id,
        status,
        startDate,
        endDate,
        keyword,
        created_by,
      } = req.query;

      const filters = {};
      if (category_id) filters.category_id = parseInt(category_id);
      if (status) filters.status = status;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (keyword) filters.keyword = keyword;
      if (created_by) filters.created_by = parseInt(created_by);

      const result = await expenseModel.getExpenses(filters, parseInt(page), parseInt(pageSize));
      ResponseHandler.success(res, result, '获取费用列表成功');
    } catch (error) {
      logger.error('获取费用列表失败:', error);
      ResponseHandler.error(res, '获取费用列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取费用详情
   */
  async getExpenseById(req, res) {
    try {
      const { id } = req.params;
      const data = await expenseModel.getExpenseById(id);

      if (!data) {
        return ResponseHandler.error(res, '费用记录不存在', 'NOT_FOUND', 404);
      }

      // 确保金额字段是数字类型
      if (data.amount !== undefined) {
        data.amount = parseFloat(data.amount);
      }

      ResponseHandler.success(res, data, '获取费用详情成功');
    } catch (error) {
      logger.error('获取费用详情失败:', error);
      ResponseHandler.error(res, '获取费用详情失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建费用记录
   */
  async createExpense(req, res) {
    try {
      const { category_id, title, amount, expense_date } = req.body;

      if (!category_id || !title || !amount || !expense_date) {
        return ResponseHandler.error(res, '费用类型、标题、金额和日期为必填项', 'VALIDATION_ERROR', 400);
      }

      const data = {
        ...req.body,
        created_by: await getCurrentUserName(req),
      };

      const result = await expenseModel.createExpense(data);
      ResponseHandler.success(res, result, '费用创建成功');
    } catch (error) {
      logger.error('创建费用记录失败:', error);
      ResponseHandler.error(res, '创建费用记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新费用记录
   */
  async updateExpense(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.updateExpense(id, req.body);
      ResponseHandler.success(res, result, '费用更新成功');
    } catch (error) {
      logger.error('更新费用记录失败:', error);
      ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
  },

  /**
   * 提交审批
   * 同时发起钉钉审批流程
   */
  async submitExpense(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id || 1;
      const { useDingtalk = true, dingtalkUserId, deptId } = req.body;

      // 1. 获取费用详情
      const expense = await expenseModel.getExpenseById(id);
      if (!expense) {
        return ResponseHandler.error(res, '费用记录不存在', 'NOT_FOUND', 404);
      }

      // 2. 提交到本地审批
      const result = await expenseModel.submitExpense(id, userId);

      // 3. 如果启用钉钉审批，发起钉钉流程
      let dingtalkResult = null;
      if (useDingtalk) {
        try {
          const dingtalkService = require('../../../services/integrations/dingtalkService');
          const dingtalkConfig = require('../../../config/dingtalkConfig');

          // 准备表单数据
          const formData = {
            expense_number: expense.expense_number,
            title: expense.title,
            amount: expense.amount,
            category_name: expense.category_name || '',
            expense_date: expense.expense_date,
            remark: expense.description || '',
          };

          // 发起钉钉审批
          const approvalResult = await dingtalkService.createApprovalInstance({
            originatorUserId: dingtalkUserId || dingtalkConfig.defaultApprover.userId,
            deptId: deptId || dingtalkConfig.defaultApprover.deptId,
            formData,
          });

          if (approvalResult.success) {
            // 保存钉钉实例ID
            await expenseModel.saveDingtalkInstanceId(id, approvalResult.instanceId);
            dingtalkResult = {
              success: true,
              instanceId: approvalResult.instanceId,
              message: '已发起钉钉审批',
            };
            logger.info(`[Expense] 费用 ${id} 已提交钉钉审批: ${approvalResult.instanceId}`);
          }
        } catch (dingtalkError) {
          // 钉钉审批失败不影响本地提交
          logger.error('[Expense] 发起钉钉审批失败:', dingtalkError.message);
          dingtalkResult = {
            success: false,
            message: `钉钉审批发起失败: ${dingtalkError.message}`,
          };
        }
      }

      ResponseHandler.success(res, { ...result, dingtalk: dingtalkResult }, '已提交审批');
    } catch (error) {
      logger.error('提交审批失败:', error);
      ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
  },

  /**
   * 审批费用
   */
  async approveExpense(req, res) {
    try {
      const { id } = req.params;
      const { action, remark } = req.body; // action: 'approve' | 'reject'
      const userId = req.user?.id || 1;

      if (!['approve', 'reject'].includes(action)) {
        return ResponseHandler.error(res, '无效的审批操作', 'VALIDATION_ERROR', 400);
      }

      const result = await expenseModel.approveExpense(id, userId, action, remark || '');
      const message = action === 'approve' ? '审批通过' : '已驳回';
      ResponseHandler.success(res, result, message);
    } catch (error) {
      logger.error('审批费用失败:', error);
      ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
  },

  /**
   * 付款处理
   */
  async payExpense(req, res) {
    try {
      const { id } = req.params;
      const { bank_account_id, transaction_id } = req.body;

      if (!bank_account_id) {
        return ResponseHandler.error(res, '请选择付款账户', 'VALIDATION_ERROR', 400);
      }

      // 注意：GL 会计分录已在 expense model 的 payExpense 方法中自动生成（含事务保护），
      // 此处不再重复生成，避免双重记账
      const result = await expenseModel.payExpense(id, { bank_account_id, transaction_id });
      ResponseHandler.success(res, result, '付款成功，已自动生成会计凭证');
    } catch (error) {
      logger.error('付款处理失败:', error);
      ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
  },

  /**
   * 删除费用记录
   */
  async deleteExpense(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.deleteExpense(id);
      ResponseHandler.success(res, result, '费用删除成功');
    } catch (error) {
      logger.error('删除费用记录失败:', error);
      ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
  },

  /**
   * 取消费用
   */
  async cancelExpense(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.cancelExpense(id);
      ResponseHandler.success(res, result, '费用已取消');
    } catch (error) {
      logger.error('取消费用失败:', error);
      ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
    }
  },

  /**
   * 获取费用统计
   */
  async getExpenseStats(req, res) {
    try {
      const { startDate, endDate } = req.query;
      const filters = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const data = await expenseModel.getExpenseStats(filters);
      ResponseHandler.success(res, data, '获取费用统计成功');
    } catch (error) {
      logger.error('获取费用统计失败:', error);
      ResponseHandler.error(res, '获取费用统计失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = expenseController;
