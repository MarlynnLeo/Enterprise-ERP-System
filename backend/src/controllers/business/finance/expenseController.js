/**
 * expenseController.js
 * @description 费用管理控制器
 * @date 2026-01-17
 * @version 1.0.0
 */

const expenseModel = require('../../../models/expense');
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
      res.json({ success: true, message: '费用管理表初始化成功', data: result });
    } catch (error) {
      logger.error('初始化费用管理表失败:', error);
      res.status(500).json({ success: false, message: error.message });
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
        return res.json({ success: true, data });
      }

      const filters = {};
      if (status !== undefined) filters.status = parseInt(status);
      if (parentId !== undefined) filters.parentId = parentId;

      const data = await expenseModel.getExpenseCategories(filters);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('获取费用类型列表失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * 创建费用类型
   */
  async createExpenseCategory(req, res) {
    try {
      const { code, name, parent_id, description, status, sort_order } = req.body;

      if (!code || !name) {
        return res.status(400).json({ success: false, message: '编码和名称为必填项' });
      }

      const result = await expenseModel.createExpenseCategory({
        code,
        name,
        parent_id,
        description,
        status,
        sort_order,
      });

      res.json({ success: true, message: '费用类型创建成功', data: result });
    } catch (error) {
      logger.error('创建费用类型失败:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: '类型编码已存在' });
      }
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * 更新费用类型
   */
  async updateExpenseCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.updateExpenseCategory(id, req.body);
      res.json({ success: true, message: '费用类型更新成功', data: result });
    } catch (error) {
      logger.error('更新费用类型失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * 删除费用类型
   */
  async deleteExpenseCategory(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.deleteExpenseCategory(id);
      res.json({ success: true, message: '费用类型删除成功', data: result });
    } catch (error) {
      logger.error('删除费用类型失败:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  // ==================== 费用记录管理 ====================

  /**
   * 生成费用编号
   */
  async generateExpenseNumber(req, res) {
    try {
      const number = await expenseModel.generateExpenseNumber();
      res.json({ success: true, data: { expense_number: number } });
    } catch (error) {
      logger.error('生成费用编号失败:', error);
      res.status(500).json({ success: false, message: error.message });
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
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('获取费用列表失败:', error);
      res.status(500).json({ success: false, message: error.message });
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
        return res.status(404).json({ success: false, message: '费用记录不存在' });
      }

      // 确保金额字段是数字类型
      if (data.amount !== undefined) {
        data.amount = parseFloat(data.amount);
      }

      res.json({ success: true, data });
    } catch (error) {
      logger.error('获取费用详情失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * 创建费用记录
   */
  async createExpense(req, res) {
    try {
      const { category_id, title, amount, expense_date } = req.body;

      if (!category_id || !title || !amount || !expense_date) {
        return res
          .status(400)
          .json({ success: false, message: '费用类型、标题、金额和日期为必填项' });
      }

      const data = {
        ...req.body,
        created_by: await getCurrentUserName(req),
      };

      const result = await expenseModel.createExpense(data);
      res.json({ success: true, message: '费用创建成功', data: result });
    } catch (error) {
      logger.error('创建费用记录失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * 更新费用记录
   */
  async updateExpense(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.updateExpense(id, req.body);
      res.json({ success: true, message: '费用更新成功', data: result });
    } catch (error) {
      logger.error('更新费用记录失败:', error);
      res.status(400).json({ success: false, message: error.message });
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
        return res.status(404).json({ success: false, message: '费用记录不存在' });
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

      res.json({
        success: true,
        message: '已提交审批',
        data: { ...result, dingtalk: dingtalkResult },
      });
    } catch (error) {
      logger.error('提交审批失败:', error);
      res.status(400).json({ success: false, message: error.message });
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
        return res.status(400).json({ success: false, message: '无效的审批操作' });
      }

      const result = await expenseModel.approveExpense(id, userId, action, remark || '');
      const message = action === 'approve' ? '审批通过' : '已驳回';
      res.json({ success: true, message, data: result });
    } catch (error) {
      logger.error('审批费用失败:', error);
      res.status(400).json({ success: false, message: error.message });
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
        return res.status(400).json({ success: false, message: '请选择付款账户' });
      }

      // 注意：GL 会计分录已在 expense model 的 payExpense 方法中自动生成（含事务保护），
      // 此处不再重复生成，避免双重记账
      const result = await expenseModel.payExpense(id, { bank_account_id, transaction_id });
      res.json({ success: true, message: '付款成功，已自动生成会计凭证', data: result });
    } catch (error) {
      logger.error('付款处理失败:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  /**
   * 删除费用记录
   */
  async deleteExpense(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.deleteExpense(id);
      res.json({ success: true, message: '费用删除成功', data: result });
    } catch (error) {
      logger.error('删除费用记录失败:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  },

  /**
   * 取消费用
   */
  async cancelExpense(req, res) {
    try {
      const { id } = req.params;
      const result = await expenseModel.cancelExpense(id);
      res.json({ success: true, message: '费用已取消', data: result });
    } catch (error) {
      logger.error('取消费用失败:', error);
      res.status(400).json({ success: false, message: error.message });
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
      res.json({ success: true, data });
    } catch (error) {
      logger.error('获取费用统计失败:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
};

module.exports = expenseController;
