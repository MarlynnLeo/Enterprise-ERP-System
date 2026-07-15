/**
 * bankTransactionController.js
 * @description 从 cashController.js 拆分的子控制器 — bankTransaction
 * @date 2026-06-15
 */

/**
 * cashController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../../utils/responseHandler');
const { logger } = require('../../../../utils/logger');
const { parsePagination } = require('../../../../utils/safePagination');
const cash = require('../../../../models/cash');
const { validationResult } = require('express-validator');
const BankAccountModel = require('../../../../models/cash/Account');
const BankTransactionModel = require('../../../../models/cash/Transaction');
const ReconciliationModel = require('../../../../models/cash/Reconciliation');
const { getAuthenticatedUserId } = require('../../../../utils/authContext');
const { currentDateString, toLocalDateString } = require('../../../../utils/dateUtils');
const { safeParseId } = require('../../../../utils/safeParseId');
const ScopeGuard = require('../../../../authorization/ScopeGuard');
const db = require('../../../../config/db');

/**
 * 安全的 parseFloat，返回 NaN 时抛出明确错误
 * @param {*} value - 待解析的值
 * @param {string} label - 字段名，用于错误提示
 * @returns {number}
 */
const {
  getFirstValue,
  normalizeBankTransactionTypeFilter,
  normalizeExcelDate,
  normalizeStatementType,
  parseStatementAmount,
  parseStatementSignedAmount,
  readStatementRows,
  sendCashBusinessError,
} = require('./helpers');

const bankTransactionController = {
  /**
   * 获取银行交易列表
   */
  getBankTransactions: async (req, res) => {
    try {
      const isReconciled =
        req.query.isReconciled !== undefined
          ? ['true', '1', true, 1].includes(req.query.isReconciled)
          : req.query.is_reconciled !== undefined
            ? ['true', '1', true, 1].includes(req.query.is_reconciled)
            : undefined;

      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        transaction_type: normalizeBankTransactionTypeFilter(req.query.transactionType),
        bank_account_id: req.query.accountId ? parseInt(req.query.accountId) : null,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : null,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : null,
        is_reconciled: isReconciled,
        status: req.query.status || null,
      };
      filters.scopeClause = await ScopeGuard.applyListScope(req, 'bank_transaction', {
        tableAlias: 't',
        ownerAlias: 'bank_txn_owner_scope',
      });

      const pagination = parsePagination(req.query.page, req.query.limit || req.query.pageSize, {
        defaultPageSize: 10,
        maxPageSize: 100,
      });
      const page = pagination.page;
      const limit = pagination.pageSize;

      const result = await BankTransactionModel.getBankTransactions(filters, page, limit);


      ResponseHandler.paginated(
        res,
        result.transactions,
        result.pagination.total,
        page,
        limit,
        '获取银行交易成功'
      );
    } catch (error) {
      logger.error('Error fetching bank transactions:', error);
      ResponseHandler.error(res, '获取银行交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单笔银行交易详情
   */
  getBankTransactionsForPrint: async (req, res) => {
    try {
      const isReconciled =
        req.query.isReconciled !== undefined
          ? ['true', '1', true, 1].includes(req.query.isReconciled)
          : req.query.is_reconciled !== undefined
            ? ['true', '1', true, 1].includes(req.query.is_reconciled)
            : undefined;

      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        transaction_type: normalizeBankTransactionTypeFilter(req.query.transactionType),
        bank_account_id: req.query.accountId ? parseInt(req.query.accountId) : null,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : null,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : null,
        is_reconciled: isReconciled,
        status: req.query.status || null,
        noPagination: true,
      };
      filters.scopeClause = await ScopeGuard.applyListScope(req, 'bank_transaction', {
        tableAlias: 't',
        ownerAlias: 'bank_txn_owner_scope',
      });

      const result = await BankTransactionModel.getBankTransactions(filters);
      ResponseHandler.success(res, { list: result.transactions || [] }, '获取银行交易打印数据成功');
    } catch (error) {
      logger.error('Error fetching bank transaction print data:', error);
      ResponseHandler.error(res, '获取银行交易打印数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  getBankTransactionById: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'bank_transaction', id, '无权访问该银行交易'))) {
        return;
      }

      // 调用正确的银行交易查询方法
      const transaction = await BankTransactionModel.getBankTransactionById(id);

      if (!transaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, transaction, '操作成功');
    } catch (error) {
      logger.error('Error fetching bank transaction:', error);
      ResponseHandler.error(res, '获取银行交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建银行交易
   */
  createBankTransaction: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const transactionData = {
        bank_account_id: parseInt(req.body.bank_account_id),
        transaction_date: req.body.transaction_date,
        transaction_type: req.body.transaction_type,
        amount: req.body.amount,
        description: req.body.description,
        reference_number: req.body.reference_number,
        transaction_number: req.body.transaction_number,
        is_reconciled: req.body.is_reconciled !== undefined ? req.body.is_reconciled : false,
        reconciliation_date: req.body.reconciliation_date || null,
        related_party: req.body.related_party || null,
        category: req.body.category || null,
        payment_method: req.body.payment_method || null,
        ...ScopeGuard.stampOwner(req, 'bank_transaction'),
      };

      // 检查必要字段
      if (!transactionData.transaction_number) {
        logger.error('缺少交易编号');
        return ResponseHandler.error(res, '缺少交易编号', 'VALIDATION_ERROR', 400);
      }

      if (!transactionData.bank_account_id || isNaN(transactionData.bank_account_id)) {
        return ResponseHandler.error(res, '无效的银行账户ID', 'VALIDATION_ERROR', 400);
      }

      // gl_entry 字段不在此创建流程中处理
      transactionData.gl_entry = null;

      const result = await BankTransactionModel.createBankTransaction(transactionData);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '银行交易创建成功',
          data: {
            id: result.transactionId,
            newBalance: result.newBalance,
            status: 'draft',
            ...transactionData,
          },
        },
        '创建成功，待审核通过后入账',
        201
      );
    } catch (error) {
      logger.error('创建银行交易失败:', error);
      return ResponseHandler.error(res, '创建银行交易失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新银行交易
   */
  updateBankTransaction: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'bank_transaction', id, '无权修改该银行交易'))) {
        return;
      }

      // 检查交易是否存在
      const existingTransaction = await cash.getBankTransactionById(id);
      if (!existingTransaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      const transactionData = {
        bank_account_id: parseInt(req.body.bank_account_id),
        transaction_date: req.body.transaction_date,
        transaction_type: req.body.transaction_type,
        amount: parseFloat(req.body.amount),
        description: req.body.description,
        reference_number: req.body.reference_number,
        transaction_number: req.body.transaction_number,
        is_reconciled: req.body.is_reconciled !== undefined ? req.body.is_reconciled : false,
        reconciliation_date: req.body.reconciliation_date || null,
        related_party: req.body.related_party || null,
        category: req.body.category || null,
        payment_method: req.body.payment_method || null,
        updated_by: getAuthenticatedUserId(req),
      };

      const result = await cash.updateBankTransaction(id, transactionData);

      return ResponseHandler.success(
        res,
        {
          id: result.transactionId,
          newBalance: result.newBalance,
          ...transactionData,
        },
        '银行交易更新成功'
      );
    } catch (error) {
      logger.error('更新银行交易失败:', error);
      return sendCashBusinessError(res, error, '更新银行交易失败');
    }
  },

  /**
   * 删除银行交易
   */
  deleteBankTransaction: async (req, res) => {
    try {
      const id = safeParseId(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的交易ID', 'VALIDATION_ERROR', 400);
      }

      if (!(await ScopeGuard.denyUnlessAccess(res, db.pool, req, 'bank_transaction', id, '无权删除该银行交易'))) {
        return;
      }

      // 检查交易是否存在
      const transaction = await cash.getBankTransactionById(id);
      if (!transaction) {
        return ResponseHandler.error(res, '交易记录不存在', 'NOT_FOUND', 404);
      }

      // 删除交易并恢复余额
      await cash.deleteBankTransaction(id);

      return ResponseHandler.success(res, { id }, '银行交易删除成功');
    } catch (error) {
      logger.error('删除银行交易失败:', error);
      return sendCashBusinessError(res, error, '删除银行交易失败');
    }
  },

  /**
   * 资金调拨
   */
  transferFunds: async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHandler.error(res, '验证失败', 'VALIDATION_ERROR', 400, {
          errors: errors.array(),
        });
      }

      const transferData = {
        transaction_number: req.body.transaction_number,
        from_account_id: parseInt(req.body.from_account_id),
        to_account_id: parseInt(req.body.to_account_id),
        amount: parseFloat(req.body.amount),
        transaction_date: req.body.transaction_date,
        description: req.body.description,
        reference_number: req.body.reference_number,
        created_by: getAuthenticatedUserId(req),
      };

      if (!transferData.transaction_number) {
        return ResponseHandler.error(res, '缺少交易编号', 'VALIDATION_ERROR', 400);
      }
      if (!transferData.from_account_id || !transferData.to_account_id) {
        return ResponseHandler.error(res, '源账户和目标账户不能为空', 'VALIDATION_ERROR', 400);
      }
      if (transferData.from_account_id === transferData.to_account_id) {
        return ResponseHandler.error(res, '源账户和目标账户不能相同', 'VALIDATION_ERROR', 400);
      }
      if (!transferData.amount || transferData.amount <= 0) {
        return ResponseHandler.error(res, '调拨金额必须大于0', 'VALIDATION_ERROR', 400);
      }

      const result = await cash.transferFunds(transferData);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '资金调拨成功',
          data: result,
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('Error transferring funds:', error);
      if (
        error.message &&
        (error.message.includes('资金调拨') ||
          error.message.includes('账户') ||
          error.message.includes('余额不足') ||
          error.message.includes('币种') ||
          error.message.includes('会计期间') ||
          error.message.includes('No open accounting period'))
      ) {
        return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
      }
      ResponseHandler.error(res, '资金调拨失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导出银行交易数据
   */
  exportBankTransactions: async (req, res) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        transaction_type: normalizeBankTransactionTypeFilter(req.query.transactionType),
        bank_account_id: req.query.accountId ? parseInt(req.query.accountId) : null,
        minAmount: req.query.minAmount ? parseFloat(req.query.minAmount) : null,
        maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount) : null,
      };

      // 获取所有符合条件的交易数据（不分页）
      const result = await BankTransactionModel.getBankTransactions({ ...filters, noPagination: true });
      const transactions = result.transactions || [];

      if (transactions.length === 0) {
        return ResponseHandler.error(res, '没有找到符合条件的交易数据', 'VALIDATION_ERROR', 400);
      }

      // 使用 ExcelJS 创建工作簿
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('银行交易数据');

      // 设置列
      worksheet.columns = [
        { header: '序号', key: 'index', width: 8 },
        { header: '交易日期', key: 'transaction_date', width: 12 },
        { header: '账户名称', key: 'account_name', width: 20 },
        { header: '交易类型', key: 'transaction_type', width: 10 },
        { header: '交易金额', key: 'amount', width: 15 },
        { header: '交易对方', key: 'related_party', width: 20 },
        { header: '交易描述', key: 'description', width: 30 },
        { header: '参考号', key: 'reference_number', width: 15 },
        { header: '对账状态', key: 'is_reconciled', width: 10 },
        { header: '对账日期', key: 'reconciliation_date', width: 12 },
        { header: '创建时间', key: 'created_at', width: 12 },
      ];

      // 添加数据
      transactions.forEach((transaction, index) => {
        worksheet.addRow({
          index: index + 1,
          transaction_date: transaction.transaction_date
            ? transaction.transaction_date.split('T')[0]
            : '',
          account_name: transaction.account_name || '',
          transaction_type: transaction.transaction_type || '',
          amount: parseFloat(transaction.amount) || 0,
          related_party: transaction.related_party || '',
          description: transaction.description || '',
          reference_number: transaction.reference_number || '',
          is_reconciled: transaction.is_reconciled ? '已对账' : '未对账',
          reconciliation_date: transaction.reconciliation_date
            ? transaction.reconciliation_date.split('T')[0]
            : '',
          created_at: transaction.created_at ? transaction.created_at.split('T')[0] : '',
        });
      });

      // 生成Excel缓冲区
      const buffer = await workbook.xlsx.writeBuffer();

      // 设置响应头
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename="bank_transactions.xlsx"');

      // 发送文件
      res.send(buffer);
    } catch (error) {
      logger.error('导出银行交易数据失败:', error);
      ResponseHandler.error(res, '导出银行交易数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导入银行交易数据
   */
  importBankTransactions: async (req, res) => {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请选择要导入的Excel文件', 'VALIDATION_ERROR', 400);
      }

      const ExcelJS = require('exceljs');

      // 读取Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      const worksheet = workbook.worksheets[0];
      const data = [];
      const headers = [];

      worksheet.getRow(1).eachCell((cell, colNumber) => {
        headers[colNumber - 1] = cell.value;
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // 跳过表头
        const rowData = {};
        row.eachCell((cell, colNumber) => {
          rowData[headers[colNumber - 1]] = cell.value;
        });
        data.push(rowData);
      });

      if (data.length === 0) {
        return ResponseHandler.error(res, '文件中没有有效数据', 'VALIDATION_ERROR', 400);
      }

      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      const importedTransactions = [];

      // 获取银行账户列表用于验证
      const bankAccounts = await cash.getBankAccounts();

      const accountMap = new Map();
      bankAccounts.forEach((account) => {
        // 使用正确的字段名
        accountMap.set(account.account_name, account.id);
        accountMap.set(account.account_number, account.id);
        // 同时支持驼峰命名（兼容性）
        if (account.accountName) {
          accountMap.set(account.accountName, account.id);
        }
        if (account.accountNumber) {
          accountMap.set(account.accountNumber, account.id);
        }
      });

      // 处理每一行数据
      for (let i = 0; i < data.length; i++) {
        try {
          const row = data[i];

          // 验证必填字段
          if (!row['交易日期'] || !row['账户名称'] || !row['交易类型'] || !row['交易金额']) {
            errors.push(`第${i + 2}行：缺少必填字段（交易日期、账户名称、交易类型、交易金额）`);
            errorCount++;
            continue;
          }

          // 查找银行账户ID
          const accountId = accountMap.get(row['账户名称']);
          if (!accountId) {
            errors.push(`第${i + 2}行：找不到账户"${row['账户名称']}"`);
            errorCount++;
            continue;
          }

          // 验证交易类型
          const validTypes = ['存款', '取款', '转账', '转入', '转出', '利息', '费用'];
          if (!validTypes.includes(row['交易类型'])) {
            errors.push(`第${i + 2}行：无效的交易类型"${row['交易类型']}"`);
            errorCount++;
            continue;
          }

          // 验证金额
          const amount = parseFloat(row['交易金额']);
          if (isNaN(amount) || amount <= 0) {
            errors.push(`第${i + 2}行：无效的交易金额"${row['交易金额']}"`);
            errorCount++;
            continue;
          }

          // 格式化日期
          let transactionDate;
          try {
            if (row['交易日期'] instanceof Date) {
              // 已经是Date对象
              transactionDate = toLocalDateString(row['交易日期']);
            } else if (typeof row['交易日期'] === 'number') {
              // Excel日期序列号，需要转换
              // Excel的日期基准是1900年1月1日，但实际上是1899年12月30日
              const excelEpoch = new Date(1899, 11, 30); // 1899年12月30日
              const date = new Date(excelEpoch.getTime() + row['交易日期'] * 24 * 60 * 60 * 1000);
              transactionDate = toLocalDateString(date);
            } else if (typeof row['交易日期'] === 'string') {
              // 字符串格式的日期
              const dateStr = row['交易日期'].trim();
              if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                // YYYY-MM-DD格式
                transactionDate = dateStr;
              } else if (dateStr.match(/^\d{4}\/\d{1,2}\/\d{1,2}$/)) {
                // YYYY/M/D格式
                const parts = dateStr.split('/');
                transactionDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
              } else if (dateStr.includes('T')) {
                // ISO格式
                transactionDate = dateStr.split('T')[0];
              } else {
                // 尝试用Date构造函数解析
                const parsedDate = new Date(dateStr);
                if (isNaN(parsedDate.getTime())) {
                  throw new Error('无法解析日期');
                }
                transactionDate = toLocalDateString(parsedDate);
              }
            } else {
              throw new Error('不支持的日期格式');
            }

            // 验证日期格式
            if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
              throw new Error('日期格式不正确');
            }
          } catch (error) {
            errors.push(`第${i + 2}行：无效的交易日期格式"${row['交易日期']}" (${error.message})`);
            errorCount++;
            continue;
          }

          // 生成交易编号
          const now = new Date();
          const transactionNumber = `TX${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(i).padStart(3, '0')}`;

          // 准备交易数据
          const transactionData = {
            bank_account_id: accountId,
            transaction_date: transactionDate,
            transaction_type: row['交易类型'],
            amount: amount,
            description: row['交易描述'] || '',
            reference_number: row['参考号'] || '',
            related_party: row['交易对方'] || '',
            transaction_number: transactionNumber,
            is_reconciled: false,
            reconciliation_date: null,
            gl_entry: null,
            created_by: getAuthenticatedUserId(req),
          };

          // 创建交易记录
          const result = await cash.createBankTransaction(transactionData);

          importedTransactions.push({
            ...transactionData,
            id: result.transactionId,
            newBalance: result.newBalance,
          });

          successCount++;
        } catch (error) {
          logger.error(`处理第${i + 2}行数据失败:`, error);
          errors.push(`第${i + 2}行：${error.message}`);
          errorCount++;
        }
      }

      return ResponseHandler.success(
        res,
        {
          successCount,
          errorCount,
          errors: errors.slice(0, 10), // 只返回前10个错误
          importedTransactions: importedTransactions.slice(0, 5), // 只返回前5条成功导入的记录
          summary: {
            totalRecords: data.length,
            successCount,
            errorCount,
            importDate: currentDateString(),
          },
        },
        `导入完成！成功：${successCount}条，失败：${errorCount}条`
      );
    } catch (error) {
      logger.error('导入银行交易数据失败:', error);
      ResponseHandler.error(res, '导入银行交易数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导入银行对账单
   */
  importBankStatement: async (req, res) => {
    try {
      const accountId = req.body.accountId ? parseInt(req.body.accountId, 10) : null;
      const startDate = req.body.startDate || null;
      const endDate = req.body.endDate || null;

      if (!accountId) {
        return ResponseHandler.error(res, '缺少银行账户ID', 'VALIDATION_ERROR', 400);
      }
      if (!req.file) {
        return ResponseHandler.error(res, '缺少银行对账单文件', 'VALIDATION_ERROR', 400);
      }

      const account = await BankAccountModel.getBankAccountById(accountId);
      if (!account) {
        return ResponseHandler.error(res, '银行账户不存在', 'NOT_FOUND', 404);
      }

      const rows = await readStatementRows(req.file);
      if (rows.length === 0) {
        return ResponseHandler.error(res, '对账单文件没有可导入的数据', 'VALIDATION_ERROR', 400);
      }

      const errors = [];
      const items = rows.map((row, index) => {
        const rowNo = index + 2;
        const transactionDate = normalizeExcelDate(getFirstValue(row, [
          'transactionDate',
          'transaction_date',
          'Date',
          '日期',
          '交易日期',
          '记账日期',
          '入账日期',
        ]));
        const amount = parseStatementAmount(row);
        const signedAmount = parseStatementSignedAmount(row);
        const typeValue = getFirstValue(row, [
          'type',
          'transactionType',
          'transaction_type',
          '交易类型',
          '收支类型',
          '借贷方向',
        ]);
        const incomeValue = getFirstValue(row, ['收入', '收入金额', '贷方金额', 'credit']);
        const expenseValue = getFirstValue(row, ['支出', '支出金额', '借方金额', 'debit']);
        const inferredType =
          incomeValue !== null && incomeValue !== undefined && incomeValue !== ''
            ? 'income'
            : expenseValue !== null && expenseValue !== undefined && expenseValue !== ''
              ? 'expense'
              : normalizeStatementType(typeValue, signedAmount ?? amount ?? 0);

        if (!transactionDate) {
          errors.push(`第 ${rowNo} 行：缺少或无法识别交易日期`);
        }
        if (!amount || amount <= 0) {
          errors.push(`第 ${rowNo} 行：缺少或无法识别交易金额`);
        }
        if (startDate && transactionDate && transactionDate < startDate) {
          errors.push(`第 ${rowNo} 行：交易日期早于对账开始日期`);
        }
        if (endDate && transactionDate && transactionDate > endDate) {
          errors.push(`第 ${rowNo} 行：交易日期晚于对账结束日期`);
        }

        const balanceValue = getFirstValue(row, ['balance', 'Balance', '余额', '账户余额']);
        const balance =
          balanceValue === null || balanceValue === undefined || balanceValue === ''
            ? null
            : parseFloat(String(balanceValue).replace(/,/g, ''));

        return {
          transaction_date: transactionDate,
          transaction_type: inferredType,
          amount,
          summary: getFirstValue(row, ['summary', '摘要', '说明', '用途', '备注']) || '',
          reference_number: getFirstValue(row, ['referenceNumber', 'reference_no', '参考号', '流水号', '凭证号']) || '',
          counterparty: getFirstValue(row, ['counterparty', '交易对方', '对方户名', '对方账户', '客户名称']) || '',
          balance: Number.isNaN(balance) ? null : balance,
        };
      });

      if (errors.length > 0) {
        return ResponseHandler.error(
          res,
          `对账单导入校验失败：${errors.slice(0, 5).join('；')}`,
          'VALIDATION_ERROR',
          400
        );
      }

      const result = await ReconciliationModel.createStatementImport(
        {
          bank_account_id: accountId,
          statement_start_date: startDate,
          statement_end_date: endDate,
          file_name: req.file.originalname,
          imported_by: getAuthenticatedUserId(req),
        },
        items
      );

      return ResponseHandler.success(
        res,
        result.items,
        `对账单导入成功，共导入 ${result.items.length} 条明细`
      );
    } catch (error) {
      ResponseHandler.error(res, '导入银行对账单失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = bankTransactionController;
