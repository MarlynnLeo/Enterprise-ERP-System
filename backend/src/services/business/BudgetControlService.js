/**
 * 预算控制服务
 *
 * 提供预算控制、预算检查、预算预警等功能
 *
 * @module services/business/BudgetControlService
 */

const budgetModel = require('../../models/budget');
const { logger } = require('../../utils/logger');
const db = require('../../config/db');

class BudgetControlService {
  /**
   * 生成预算编号（防并发冲突：基于MAX编号+1）
   * @param {number} year - 年度
   * @returns {Promise<string>} 预算编号
   */
  static async generateBudgetNo(year) {
    try {
      const prefix = `BG${year}`;
      const [result] = await db.pool.execute(
        `SELECT MAX(budget_no) as max_no FROM budgets WHERE budget_no LIKE ?`,
        [`${prefix}%`]
      );

      let nextSeq = 1;
      if (result[0].max_no) {
        // 提取末尾数字部分
        const currentSeq = parseInt(result[0].max_no.replace(prefix, ''), 10);
        nextSeq = (currentSeq || 0) + 1;
      }

      return `${prefix}${String(nextSeq).padStart(3, '0')}`;
    } catch (error) {
      logger.error('生成预算编号失败:', error);
      throw error;
    }
  }

  /**
   * 检查预算是否充足
   * @param {number} accountId - 会计科目ID
   * @param {number} departmentId - 部门ID（可选）
   * @param {number} amount - 金额
   * @param {Date} date - 日期
   * @returns {Promise<Object>} 检查结果
   */
  static async checkBudgetAvailability(accountId, departmentId, amount, date) {
    try {
      // 查找适用的预算
      let query = `
        SELECT
          b.id as budget_id,
          b.budget_no,
          b.budget_name,
          bd.id as detail_id,
          bd.budget_amount,
          bd.used_amount,
          bd.remaining_amount,
          bd.warning_threshold
        FROM budgets b
        JOIN budget_details bd ON b.id = bd.budget_id
        WHERE b.status IN ('已审批', '执行中')
          AND bd.account_id = ?
          AND b.start_date <= ?
          AND b.end_date >= ?
      `;

      const params = [accountId, date, date];

      if (departmentId) {
        query += ' AND (bd.department_id = ? OR bd.department_id IS NULL)';
        params.push(departmentId);
      }

      query += ' ORDER BY bd.department_id DESC, b.budget_year DESC LIMIT 1';

      const [budgets] = await db.pool.execute(query, params);

      if (budgets.length === 0) {
        return {
          available: false,
          reason: '未找到适用的预算',
          budget: null,
        };
      }

      const budget = budgets[0];

      // 检查剩余金额是否充足
      if (budget.remaining_amount < amount) {
        return {
          available: false,
          reason: '预算余额不足',
          budget: budget,
          shortage: amount - budget.remaining_amount,
        };
      }

      // 检查是否接近预警阈值
      const usageRate = ((budget.used_amount + amount) / budget.budget_amount) * 100;
      const warningLevel =
        usageRate >= budget.warning_threshold
          ? 'high'
          : usageRate >= budget.warning_threshold - 10
            ? 'medium'
            : 'low';

      return {
        available: true,
        budget: budget,
        usageRate: usageRate,
        warningLevel: warningLevel,
        needWarning: usageRate >= budget.warning_threshold,
      };
    } catch (error) {
      logger.error('检查预算可用性失败:', error);
      throw error;
    }
  }

  /**
   * 执行预算控制（扣减预算）
   * @param {Object} params - 参数
   * @returns {Promise<Object>} 执行结果
   */
  static async executeBudgetControl(params) {
    const connection = await db.pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        accountId,
        departmentId,
        amount,
        date,
        documentType,
        documentId,
        documentNo,
        glEntryId,
        description,
        userId,
      } = params;

      // 检查预算可用性
      const checkResult = await this.checkBudgetAvailability(accountId, departmentId, amount, date);

      if (!checkResult.available) {
        throw new Error(checkResult.reason);
      }

      const budget = checkResult.budget;

      // 更新预算明细的已使用金额
      await budgetModel.updateBudgetDetailUsedAmount(budget.detail_id, amount, connection);

      // 同步更新主表的已使用金额和剩余金额
      await connection.execute(
        `UPDATE budgets SET
           used_amount = COALESCE(used_amount, 0) + ?,
           remaining_amount = total_amount - (COALESCE(used_amount, 0) + ?)
         WHERE id = ?`,
        [amount, amount, budget.budget_id]
      );

      // 创建预算执行记录
      const executionId = await budgetModel.createBudgetExecution(
        {
          budget_id: budget.budget_id,
          budget_detail_id: budget.detail_id,
          execution_date: date,
          execution_amount: amount,
          document_type: documentType,
          document_id: documentId,
          document_no: documentNo,
          gl_entry_id: glEntryId,
          description: description,
          created_by: userId,
        },
        connection
      );

      // 如果需要预警，创建预警记录
      if (checkResult.needWarning) {
        await budgetModel.createBudgetWarning({
          budget_id: budget.budget_id,
          budget_detail_id: budget.detail_id,
          warning_type: '接近预算',
          warning_level: checkResult.warningLevel === 'high' ? '高' : '中',
          warning_message: `预算 ${budget.budget_no} 使用率已达 ${checkResult.usageRate.toFixed(2)}%`,
        });
      }

      await connection.commit();

      logger.info('预算控制执行成功', { executionId, amount });

      return {
        success: true,
        executionId: executionId,
        usageRate: checkResult.usageRate,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('执行预算控制失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = BudgetControlService;
