/**
 * 出纳管理模块工具函数
 *
 * 提供出纳管理模块通用的工具函数，包括：
 * - 金额计算和格式化
 * - 日期处理
 * - 数据验证
 * - 业务逻辑辅助函数
 *
 * @author 系统开发团队
 * @version 2.0.0
 * @since 2025-01-01
 */

const {
  BANK_TRANSACTION_GROUPS,
  BUSINESS_RULES,
  VALIDATION_RULES,
} = require('../constants/cashierConstants');

/**
 * 金额处理工具类
 */
class AmountUtils {
  /**
   * 格式化金额为指定精度
   * @param {number|string} amount - 金额
   * @param {number} precision - 精度（小数位数）
   * @returns {number} 格式化后的金额
   */
  static formatAmount(amount, precision = BUSINESS_RULES.AMOUNT_PRECISION) {
    const num = parseFloat(amount);
    if (isNaN(num)) {
      throw new Error('无效的金额格式');
    }
    return Math.round(num * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  /**
   * 验证金额是否有效
   * @param {number|string} amount - 金额
   * @returns {boolean} 是否有效
   */
  static isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num >= VALIDATION_RULES.AMOUNT.min && num <= VALIDATION_RULES.AMOUNT.max;
  }

  /**
   * 格式化金额显示（添加千分位分隔符）
   * @param {number} amount - 金额
   * @param {string} currency - 货币符号
   * @returns {string} 格式化后的金额字符串
   */
  static formatAmountDisplay(amount, currency = '¥') {
    if (!this.isValidAmount(amount)) {
      return `${currency}0.00`;
    }
    const formatted = this.formatAmount(amount);
    return `${currency}${formatted.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * 计算银行账户余额变化
   * @param {number} currentBalance - 当前余额
   * @param {number} amount - 交易金额
   * @param {string} transactionType - 交易类型
   * @returns {number} 新余额
   */
  static calculateNewBalance(currentBalance, amount, transactionType) {
    const current = this.formatAmount(currentBalance);
    const transactionAmount = this.formatAmount(amount);

    if (BANK_TRANSACTION_GROUPS.INCOME.includes(transactionType)) {
      return this.formatAmount(current + transactionAmount);
    } else if (BANK_TRANSACTION_GROUPS.EXPENSE.includes(transactionType)) {
      return this.formatAmount(current - transactionAmount);
    } else {
      throw new Error(`不支持的交易类型: ${transactionType}`);
    }
  }
}

/**
 * 日期处理工具类
 */
class DateUtils {
  /**
   * 格式化日期为 YYYY-MM-DD 格式
   * @param {Date|string} date - 日期
   * @returns {string} 格式化后的日期字符串
   */
  static formatDate(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      throw new Error('无效的日期格式');
    }
    return d.toISOString().split('T')[0];
  }

  /**
   * 获取月份的第一天
   * @param {Date|string} date - 日期
   * @returns {string} 月份第一天的日期字符串
   */
  static getMonthStart(date) {
    const d = new Date(date);
    return this.formatDate(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  /**
   * 获取月份的最后一天
   * @param {Date|string} date - 日期
   * @returns {string} 月份最后一天的日期字符串
   */
  static getMonthEnd(date) {
    const d = new Date(date);
    return this.formatDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  /**
   * 获取上个月的日期范围
   * @param {Date|string} date - 基准日期
   * @returns {Object} 包含start和end的对象
   */
  static getLastMonthRange(date = new Date()) {
    const d = new Date(date);
    const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return {
      start: this.getMonthStart(lastMonth),
      end: this.getMonthEnd(lastMonth),
    };
  }

  /**
   * 验证日期格式是否正确
   * @param {string} dateString - 日期字符串
   * @returns {boolean} 是否有效
   */
  static isValidDate(dateString) {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === this.formatDate(date);
  }
}

/**
 * 数据验证工具类
 */
class ValidationUtils {
  /**
   * 验证分页参数
   * @param {number} page - 页码
   * @param {number} pageSize - 每页记录数
   * @returns {Object} 验证结果
   */
  static validatePagination(page, pageSize) {
    const errors = [];

    if (!Number.isInteger(page) || page < 1) {
      errors.push('页码必须是大于0的整数');
    }

    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      errors.push('每页记录数必须是1-100之间的整数');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证银行账号格式
   * @param {string} accountNumber - 银行账号
   * @returns {Object} 验证结果
   */
  static validateAccountNumber(accountNumber) {
    const errors = [];

    if (!accountNumber || typeof accountNumber !== 'string') {
      errors.push('银行账号不能为空');
    } else {
      if (
        accountNumber.length < VALIDATION_RULES.ACCOUNT_NUMBER.minLength ||
        accountNumber.length > VALIDATION_RULES.ACCOUNT_NUMBER.maxLength
      ) {
        errors.push(
          `银行账号长度必须在${VALIDATION_RULES.ACCOUNT_NUMBER.minLength}-${VALIDATION_RULES.ACCOUNT_NUMBER.maxLength}位之间`
        );
      }

      if (!VALIDATION_RULES.ACCOUNT_NUMBER.pattern.test(accountNumber)) {
        errors.push('银行账号只能包含数字');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 验证必填字段
   * @param {Object} data - 数据对象
   * @param {Array} requiredFields - 必填字段数组
   * @returns {Object} 验证结果
   */
  static validateRequiredFields(data, requiredFields) {
    const errors = [];

    requiredFields.forEach((field) => {
      if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
        errors.push(`${field} 是必填字段`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

/**
 * 业务逻辑工具类
 */
class BusinessUtils {
  /**
   * 计算统计数据
   * @param {Array} transactions - 交易记录数组
   * @returns {Object} 统计结果
   */
  static calculateStatistics(transactions) {
    const stats = {
      totalCount: transactions.length,
      totalIncome: 0,
      totalExpense: 0,
      netAmount: 0,
    };

    transactions.forEach((transaction) => {
      const amount = AmountUtils.formatAmount(transaction.amount);
      if (transaction.transaction_type === 'income') {
        stats.totalIncome += amount;
      } else if (transaction.transaction_type === 'expense') {
        stats.totalExpense += amount;
      }
    });

    stats.totalIncome = AmountUtils.formatAmount(stats.totalIncome);
    stats.totalExpense = AmountUtils.formatAmount(stats.totalExpense);
    stats.netAmount = AmountUtils.formatAmount(stats.totalIncome - stats.totalExpense);

    return stats;
  }

  /**
   * 构建查询条件
   * @param {Object} filters - 过滤条件
   * @returns {Object} 包含查询语句和参数的对象
   */
  static buildQueryConditions(filters) {
    const conditions = [];
    const params = [];

    Object.keys(filters).forEach((key) => {
      const value = filters[key];
      if (value !== undefined && value !== null && value !== '') {
        switch (key) {
          case 'startDate':
            conditions.push('transaction_date >= ?');
            params.push(value);
            break;
          case 'endDate':
            conditions.push('transaction_date <= ?');
            params.push(value);
            break;
          case 'search':
            conditions.push(
              '(description LIKE ? OR counterparty LIKE ? OR reference_number LIKE ?)'
            );
            params.push(`%${value}%`, `%${value}%`, `%${value}%`);
            break;
          default: {
            // ✅ 安全修复：添加列名白名单，防止用户传入的 key 成为 SQL 注入向量
            // 只有预定义的数据库列名才允许拼入 SQL 的 WHERE 子句
            const ALLOWED_FILTER_COLUMNS = [
              'account_id', 'bank_account_id', 'transaction_type',
              'status', 'category', 'bank_id', 'currency_code',
              'created_by', 'approved_by'
            ];
            if (ALLOWED_FILTER_COLUMNS.includes(key)) {
              conditions.push(`${key} = ?`);
              params.push(value);
            }
            // 不在白名单中的 key 会被静默忽略，不会拼入 SQL
          }
        }
      }
    });

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }
}

/**
 * 日志工具类
 */
class LogUtils {
  /**
   * 记录操作日志
   * @param {string} level - 日志级别
   * @param {string} module - 模块名称
   * @param {string} operation - 操作名称
   * @param {Object} data - 相关数据
   * @param {Error} error - 错误对象（可选）
   */
  static log(level, module, operation, _data = {}, _error = null) {


    // 静默记录，不输出到控制台
    // 可以在这里添加日志文件写入或远程日志发送逻辑
  }
}

module.exports = {
  AmountUtils,
  DateUtils,
  ValidationUtils,
  BusinessUtils,
  LogUtils,
};
