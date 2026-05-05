/**
 * cashTransactionService.js
 * @description 服务层文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const cashModel = require('../models/cash');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs').promises;

/**
 * 现金交易服务层
 * 处理业务逻辑和数据转换
 */
class CashTransactionService {
  /**
   * 获取现金交易列表
   */
  async getCashTransactions(filters) {
    try {
      const result = await cashModel.getCashTransactions(filters);

      // 格式化数据
      result.data = result.data.map((transaction) => ({
        ...transaction,
        amount: parseFloat(transaction.amount),
        categoryName: this.getCategoryName(transaction.category),
        typeName: this.getTypeName(transaction.type),
      }));

      return result;
    } catch (error) {
      throw new Error(`获取现金交易列表失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 获取现金交易统计
   */
  async getCashTransactionStats(filters) {
    try {
      const stats = await cashModel.getCashTransactionStats(filters);

      return {
        totalCount: parseInt(stats.totalCount),
        totalIncome: parseFloat(stats.totalIncome),
        totalExpense: parseFloat(stats.totalExpense),
        netAmount: parseFloat(stats.netAmount),
      };
    } catch (error) {
      throw new Error(`获取现金交易统计失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 创建现金交易
   */
  async createCashTransaction(transactionData, userId) {
    try {
      // 数据验证
      this.validateTransactionData(transactionData);

      // 添加创建者信息
      transactionData.created_by = userId;

      const result = await cashModel.createCashTransaction(transactionData);

      return result;
    } catch (error) {
      throw new Error(`创建现金交易失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 更新现金交易
   */
  async updateCashTransaction(id, transactionData) {
    try {
      // 数据验证
      this.validateTransactionData(transactionData);

      const result = await cashModel.updateCashTransaction(id, transactionData);

      return result;
    } catch (error) {
      throw new Error(`更新现金交易失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 删除现金交易
   */
  async deleteCashTransaction(id) {
    try {
      const result = await cashModel.deleteCashTransaction(id);

      return result;
    } catch (error) {
      throw new Error(`删除现金交易失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 根据ID获取现金交易
   */
  async getCashTransactionById(id) {
    try {
      const transaction = await cashModel.getCashTransactionById(id);

      if (!transaction) {
        throw new Error('现金交易不存在');
      }

      return {
        ...transaction,
        amount: parseFloat(transaction.amount),
        categoryName: this.getCategoryName(transaction.category),
        typeName: this.getTypeName(transaction.type),
      };
    } catch (error) {
      throw new Error(`获取现金交易失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 导出现金交易到Excel
   */
  async exportCashTransactions(filters) {
    try {
      // 获取所有数据（不分页）
      const exportFilters = { ...filters, page: 1, pageSize: 10000 };
      const result = await cashModel.getCashTransactions(exportFilters);

      // 创建Excel工作簿
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('现金交易记录');

      // 设置列标题
      worksheet.columns = [
        { header: '交易日期', key: 'transactionDate', width: 15 },
        { header: '交易号', key: 'transactionNumber', width: 20 },
        { header: '类型', key: 'type', width: 10 },
        { header: '分类', key: 'category', width: 15 },
        { header: '金额', key: 'amount', width: 15 },
        { header: '交易对方', key: 'counterparty', width: 20 },
        { header: '描述', key: 'description', width: 30 },
        { header: '凭证号', key: 'referenceNumber', width: 15 },
        { header: '创建时间', key: 'createdAt', width: 20 },
      ];

      // 添加数据行
      result.data.forEach((transaction) => {
        worksheet.addRow({
          transactionDate: transaction.transactionDate,
          transactionNumber: transaction.transactionNumber,
          type: this.getTypeName(transaction.type),
          category: this.getCategoryName(transaction.category),
          amount: parseFloat(transaction.amount),
          counterparty: transaction.counterparty,
          description: transaction.description,
          referenceNumber: transaction.referenceNumber,
          createdAt: transaction.createdAt,
        });
      });

      // 设置样式
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      // 生成文件
      const fileName = `现金交易记录_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const filePath = path.join(__dirname, '../temp', fileName);

      // 确保临时目录存在
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      await workbook.xlsx.writeFile(filePath);

      return {
        fileName,
        filePath,
        count: result.data.length,
      };
    } catch (error) {
      throw new Error(`导出现金交易失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 批量导入现金交易
   */
  async importCashTransactions(fileBuffer, userId) {
    try {
      if (!userId) {
        throw new Error('导入现金交易必须提供当前登录用户ID');
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);

      const worksheet = workbook.getWorksheet(1);
      const transactions = [];

      // 跳过标题行，从第二行开始读取
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);

        if (row.hasValues) {
          const transaction = {
            transaction_date: this.parseDate(row.getCell(1).value),
            transaction_type: this.parseType(row.getCell(3).value),
            category: this.parseCategory(row.getCell(4).value),
            amount: parseFloat(row.getCell(5).value) || 0,
            counterparty: row.getCell(6).value || '',
            description: row.getCell(7).value || '',
            reference_number: row.getCell(8).value || '',
            created_by: userId,
          };

          // 验证数据
          if (this.validateImportData(transaction)) {
            transactions.push(transaction);
          }
        }
      }

      if (transactions.length === 0) {
        throw new Error('没有找到有效的交易数据');
      }

      // 批量创建
      const result = await cashModel.batchCreateCashTransactions(transactions);

      return result;
    } catch (error) {
      throw new Error(`导入现金交易失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 获取分类统计
   */
  async getCashTransactionCategoryStats(filters) {
    try {
      const stats = await cashModel.getCashTransactionCategoryStats(filters);

      return stats.map((stat) => ({
        ...stat,
        total_amount: parseFloat(stat.total_amount),
        categoryName: this.getCategoryName(stat.category),
        typeName: this.getTypeName(stat.transaction_type),
      }));
    } catch (error) {
      throw new Error(`获取分类统计失败: ${error.message}`, { cause: error });
    }
  }

  /**
   * 数据验证
   */
  validateTransactionData(data) {
    if (!data.transaction_type || !['income', 'expense'].includes(data.transaction_type)) {
      throw new Error('交易类型不正确');
    }

    if (!data.transaction_date) {
      throw new Error('交易日期不能为空');
    }

    if (!data.amount || data.amount <= 0) {
      throw new Error('金额必须大于0');
    }

    if (!data.category) {
      throw new Error('分类不能为空');
    }

    if (!data.description) {
      throw new Error('描述不能为空');
    }

    return true;
  }

  /**
   * 验证导入数据
   */
  validateImportData(data) {
    try {
      this.validateTransactionData(data);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取分类名称
   */
  getCategoryName(category) {
    const categoryMap = {
      sales: '销售收入',
      other_income: '其他收入',
      office: '办公费用',
      travel: '差旅费',
      meal: '餐饮费',
      other_expense: '其他支出',
    };
    return categoryMap[category] || category;
  }

  /**
   * 获取类型名称
   */
  getTypeName(type) {
    const typeMap = {
      income: '收入',
      expense: '支出',
    };
    return typeMap[type] || type;
  }

  /**
   * 解析日期
   */
  parseDate(value) {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string') {
      return new Date(value).toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * 解析类型
   */
  parseType(value) {
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue.includes('收入') || lowerValue.includes('income')) {
        return 'income';
      }
      if (lowerValue.includes('支出') || lowerValue.includes('expense')) {
        return 'expense';
      }
    }
    return 'expense'; // 默认为支出
  }

  /**
   * 解析分类
   */
  parseCategory(value) {
    if (typeof value === 'string') {
      const categoryMap = {
        销售收入: 'sales',
        其他收入: 'other_income',
        办公费用: 'office',
        差旅费: 'travel',
        餐饮费: 'meal',
        其他支出: 'other_expense',
      };
      return categoryMap[value] || 'other_expense';
    }
    return 'other_expense';
  }
}

module.exports = new CashTransactionService();
