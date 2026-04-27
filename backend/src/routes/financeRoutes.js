/**
 * financeRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const financeController = require('../controllers/business/finance/financeController');
const arController = require('../controllers/business/finance/arController');
const apController = require('../controllers/business/finance/apController');
const assetsController = require('../controllers/business/assets/assetsController');
const cipController = require('../controllers/business/assets/cipController');
const inventoryController = require('../controllers/business/assets/inventoryController');
const cashController = require('../controllers/business/finance/cashController');
const financeSettingsController = require('../controllers/business/finance/financeSettingsController');
const taxController = require('../controllers/business/finance/taxController');
const pricingController = require('../controllers/business/finance/pricingController');
const arBatchController = require('../controllers/business/finance/arBatchController');
const apBatchController = require('../controllers/business/finance/apBatchController');
const overdueController = require('../controllers/business/finance/overdueController');
const bomPriceAdjustmentController = require('../controllers/business/finance/bomPriceAdjustmentController');
const expenseController = require('../controllers/business/finance/expenseController');
const budgetController = require('../controllers/business/finance/budgetController');
// 注意:原reportsController已被enhancedReportsController替代,使用真实数据
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');

// 所有财务路由都必须经过认证
router.use(authenticateToken);

// 配置文件上传中间件
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 限制10MB
  fileFilter: function (req, file, cb) {
    // 只接受Excel文件
    if (!file.originalname.match(/\.(xlsx|xls|csv)$/)) {
      return cb(new Error('只允许上传Excel或CSV文件!'), false);
    }
    cb(null, true);
  },
});

// 系统初始化路由
router.post('/init', requirePermission('system:settings:update'), financeController.initFinanceTables);
router.post('/expenses/init', requirePermission('system:settings:update'), expenseController.initExpenseTables);

// 费用管理模块路由
// 1. 费用类型管理
router.get('/expenses/categories', requirePermission('finance:expenses:view'), expenseController.getExpenseCategories);
router.post('/expenses/categories', requirePermission('finance:expenses:create'), expenseController.createExpenseCategory);
router.put('/expenses/categories/:id', requirePermission('finance:expenses:update'), expenseController.updateExpenseCategory);
router.delete('/expenses/categories/:id', requirePermission('finance:expenses:delete'), expenseController.deleteExpenseCategory);

// 2. 费用记录管理
router.get('/expenses/generate-number', requirePermission('finance:expenses:create'), expenseController.generateExpenseNumber);
router.get('/expenses/stats', requirePermission('finance:expenses:view'), expenseController.getExpenseStats);
router.get('/expenses', requirePermission('finance:expenses:view'), expenseController.getExpenses);
router.get('/expenses/:id', requirePermission('finance:expenses:view'), expenseController.getExpenseById);
router.post('/expenses', requirePermission('finance:expenses:create'), expenseController.createExpense);
router.put('/expenses/:id', requirePermission('finance:expenses:update'), expenseController.updateExpense);
router.post('/expenses/:id/submit', requirePermission('finance:expenses:update'), expenseController.submitExpense);
router.post('/expenses/:id/approve', requirePermission('finance:expenses:approve'), expenseController.approveExpense);
router.post('/expenses/:id/pay', requirePermission('finance:expenses:pay'), expenseController.payExpense);
router.post('/expenses/:id/cancel', requirePermission('finance:expenses:update'), expenseController.cancelExpense);
router.delete('/expenses/:id', requirePermission('finance:expenses:delete'), expenseController.deleteExpense);

// 财务系统设置路由
router.get('/settings', requirePermission('finance:settings:view'), financeSettingsController.getSettings);
router.put('/settings', requirePermission('finance:settings:update'), financeSettingsController.updateSettings);
router.get('/settings/default', requirePermission('finance:settings:view'), financeSettingsController.getDefaultSettings);
router.post('/settings/reset', requirePermission('finance:settings:update'), financeSettingsController.resetSettings);

// 总账模块路由
// 1. 会计科目管理
router.get('/accounts/options', financeController.getAccountOptions);
router.get('/accounts', requirePermission('finance:accounts:view'), financeController.getAllAccounts);
router.post('/accounts', requirePermission('finance:accounts:create'), financeController.createAccount);
router.get('/accounts/:id', requirePermission('finance:accounts:view'), financeController.getAccountById);
router.put('/accounts/:id', requirePermission('finance:accounts:update'), financeController.updateAccount);
router.patch('/accounts/:id/deactivate', requirePermission('finance:accounts:update'), financeController.deactivateAccount);
router.patch('/accounts/:id/status', requirePermission('finance:accounts:update'), financeController.toggleAccountStatus);

// 期初余额管理
router.get('/opening-balances', requirePermission('finance:accounts:view'), financeController.getOpeningBalances);
router.post('/opening-balances/batch', requirePermission('finance:accounts:update'), financeController.setBatchOpeningBalance);
router.post('/opening-balances/:id', requirePermission('finance:accounts:update'), financeController.setOpeningBalance);

// 2. 会计分录管理
router.get('/entries', requirePermission('finance:entries:view'), financeController.getEntries);
router.get('/entries/:id', requirePermission('finance:entries:view'), financeController.getEntryById);
router.get('/entries/:id/items', requirePermission('finance:entries:view'), financeController.getEntryItems);
router.post('/entries', requirePermission('finance:entries:create'), financeController.createEntry);
router.patch('/entries/:id/post', requirePermission('finance:entries:approve'), financeController.postEntry);
router.post('/entries/:id/reverse', requirePermission('finance:entries:update'), financeController.reverseEntry);

// 3. 会计期间管理
router.get('/periods', requirePermission('finance:periods:view'), financeController.getAllPeriods);
router.get('/periods/:id', requirePermission('finance:periods:view'), financeController.getPeriodById);
router.post('/periods', requirePermission('finance:periods:create'), financeController.createPeriod);
router.patch('/periods/:id/close', requirePermission('finance:periods:update'), financeController.closePeriod);
router.patch('/periods/:id/reopen', requirePermission('finance:periods:update'), financeController.reopenPeriod);

// 3. 试算平衡表
router.get('/gl/trial-balance', requirePermission('finance:reports:view'), financeController.getTrialBalance);

// 4. 期末结转
router.get('/gl/closing/preview/:id', requirePermission('finance:closing:view'), financeController.getClosingPreview);
router.post('/gl/closing/execute/:id', requirePermission('finance:closing:execute'), financeController.executeClosing);
router.get('/gl/closing/history/:id', requirePermission('finance:closing:view'), financeController.getClosingHistory);

// 应付账款模块路由
// 1. 应付账款发票管理
router.get('/ap/invoices/generate-number', requirePermission('finance:ap:create'), apController.generateInvoiceNumber); // 生成发票编号
router.get('/ap/invoices', requirePermission('finance:ap:view'), apController.getInvoices);
router.get('/ap/invoices/unpaid', requirePermission('finance:ap:view'), apController.getUnpaidInvoices);
router.get('/ap/invoices/overdue', requirePermission('finance:ap:view'), overdueController.getOverdueAPInvoices);
router.get('/ap/invoices/:id/edit', requirePermission('finance:ap:update'), apController.getInvoiceForEdit);
router.get('/ap/invoices/:id', requirePermission('finance:ap:view'), apController.getInvoiceById);
router.get('/ap/invoices/:id/payments', requirePermission('finance:ap:view'), apController.getInvoicePayments);
router.post('/ap/invoices', requirePermission('finance:ap:create'), apController.createInvoice);
router.put('/ap/invoices/:id', requirePermission('finance:ap:update'), apController.updateInvoice);
router.put('/ap/invoices/:id/status', requirePermission('finance:ap:update'), apController.updateInvoiceStatus);

// 2. 付款管理
router.get('/ap/payments', requirePermission('finance:ap:view'), apController.getPayments);
router.get('/ap/payments/:id', requirePermission('finance:ap:view'), apController.getPaymentById);
router.post('/ap/payments', requirePermission('finance:ap:pay'), apController.createPayment);
router.post('/ap/payments/:id/void', requirePermission('finance:ap:update'), apController.voidPayment); // 作废付款记录
// 批量付款
router.post('/ap/payments/batch', requirePermission('finance:ap:pay'), apBatchController.batchPayments);
// AP付款冲销
router.post('/ap/payments/:id/reverse', requirePermission('finance:ap:update'), overdueController.reversePayment);

// 3. 应付账款分析
router.get('/ap/supplier-payables', requirePermission('finance:reports:view'), apController.getSupplierPayables);
router.get('/ap/supplier-payables/:id', requirePermission('finance:reports:view'), apController.getSupplierPayablesById);
router.get('/ap/aging', requirePermission('finance:reports:view'), apController.getPayablesAging);
router.get('/ap/aging/:id', requirePermission('finance:reports:view'), apController.getPayablesAgingById);

// 应收账款模块路由
// 1. 应收账款发票管理
router.get('/ar/invoices/generate-number', requirePermission('finance:ar:create'), arController.generateInvoiceNumber); // 生成发票编号
router.get('/ar/invoices', requirePermission('finance:ar:view'), arController.getInvoices);
router.get('/ar/invoices/overdue', requirePermission('finance:ar:view'), overdueController.getOverdueARInvoices);
router.get('/ar/invoices/:id', requirePermission('finance:ar:view'), arController.getInvoiceById);
router.get('/ar/invoices/:id/edit', requirePermission('finance:ar:update'), arController.getInvoiceForEdit);
router.get('/ar/invoices/:id/payments', requirePermission('finance:ar:view'), arController.getInvoicePayments);
router.post('/ar/invoices', requirePermission('finance:ar:create'), arController.createInvoice);
router.put('/ar/invoices/:id', requirePermission('finance:ar:update'), arController.updateInvoice);
router.put('/ar/invoices/:id/status', requirePermission('finance:ar:update'), arController.updateInvoiceStatus);

// 2. 收款管理
router.get('/ar/receipts/generate-number', requirePermission('finance:ar:create'), arController.generateReceiptNumber); // 生成收款编号
router.get('/ar/receipts/unpaid-invoices', requirePermission('finance:ar:view'), arController.getUnpaidInvoices); // 获取未付清的发票
router.get('/ar/receipts', requirePermission('finance:ar:view'), arController.getReceipts);
router.get('/ar/receipts/:id', requirePermission('finance:ar:view'), arController.getReceiptById);
router.post('/ar/receipts', requirePermission('finance:ar:receive'), arController.createReceipt);
router.post('/ar/receipts/:id/void', requirePermission('finance:ar:update'), arController.voidReceipt); // 作废收款记录
// 批量收款
router.post('/ar/receipts/batch', requirePermission('finance:ar:receive'), arBatchController.batchReceipts);
// AR收款冲销
router.post('/ar/receipts/:id/reverse', requirePermission('finance:ar:update'), overdueController.reverseReceipt);

// 3. 应收账款分析
router.get('/ar/customer-receivables', requirePermission('finance:reports:view'), arController.getCustomerReceivables);
router.get('/ar/customer-receivables/:id', requirePermission('finance:reports:view'), arController.getCustomerReceivablesById);
router.get('/ar/aging', requirePermission('finance:reports:view'), arController.getReceivablesAging);
router.get('/ar/aging/:id', requirePermission('finance:reports:view'), arController.getReceivablesAgingById);

// 固定资产模块路由
// 1. 固定资产管理
router.get('/assets', requirePermission('finance:assets:view'), assetsController.getAssets);

// 资产类别管理
router.get('/assets/categories', requirePermission('finance:assets:view'), assetsController.getAssetCategories);
router.get('/assets/categories/:id', requirePermission('finance:assets:view'), assetsController.getAssetCategoryById);
router.post('/assets/categories', requirePermission('finance:assets:create'), assetsController.createAssetCategory);
router.put('/assets/categories/:id', requirePermission('finance:assets:update'), assetsController.updateAssetCategory);
router.delete('/assets/categories/:id', requirePermission('finance:assets:delete'), assetsController.deleteAssetCategory);

// 基础数据API (供前端用于表单选择)
router.get('/baseData/bankAccounts', requirePermission('finance:cash:view'), cashController.getBankAccounts);

// 自动编号生成
router.get('/assets/generate-code', requirePermission('finance:assets:view'), assetsController.generateAssetCode);

// 折旧管理
router.get('/assets/depreciation/records', requirePermission('finance:assets:view'), assetsController.getDepreciationRecords);
router.get('/assets/depreciation/calculate', requirePermission('finance:assets:execute'), assetsController.calculateBatchDepreciation);
router.post('/assets/depreciation/submit', requirePermission('finance:assets:execute'), assetsController.submitDepreciation);
router.get('/assets/depreciation/export', requirePermission('finance:assets:export'), assetsController.exportDepreciation);

// 资产统计
router.get('/assets/statistics/summary', requirePermission('finance:assets:view'), assetsController.getAssetStatistics);
router.get('/assets/stats', requirePermission('finance:assets:view'), assetsController.getAssetStatistics);

// 资产看板数据与折旧预测
router.get('/assets/dashboard/stats', requirePermission('finance:assets:view'), assetsController.getDashboardStats);
router.get('/assets/depreciation/forecast', requirePermission('finance:assets:view'), assetsController.getDepreciationForecast);

// 资产操作
router.get('/assets/:id', requirePermission('finance:assets:view'), assetsController.getAssetById);
router.post('/assets', requirePermission('finance:assets:create'), assetsController.createAsset);
router.put('/assets/:id', requirePermission('finance:assets:update'), assetsController.updateAsset);
router.post('/assets/:id/depreciation', requirePermission('finance:assets:execute'), assetsController.calculateDepreciation);
router.post('/assets/:id/dispose', requirePermission('finance:assets:update'), assetsController.disposeAsset);
router.post('/assets/:id/transfer', requirePermission('finance:assets:update'), assetsController.transferAsset);
router.post('/assets/:id/split', requirePermission('finance:assets:update'), assetsController.splitAsset);
router.post('/assets/:id/audit', requirePermission('finance:assets:update'), assetsController.auditAsset);

// 资产变动记录与折旧/减值历史
router.get('/assets/:id/change-logs', requirePermission('finance:assets:view'), assetsController.getAssetChangeLogs);
router.get('/assets/:id/depreciation-history', requirePermission('finance:assets:view'), assetsController.getDepreciationHistory);
router.get('/assets/:id/impairments', requirePermission('finance:assets:view'), assetsController.getImpairments);
router.post('/assets/:id/impairments', requirePermission('finance:assets:update'), assetsController.createImpairment);

// 2. 在建工程(CIP)管理
router.get('/assets-cip', requirePermission('finance:assets:view'), cipController.getCipProjects);
router.get('/assets-cip/:id', requirePermission('finance:assets:view'), cipController.getCipProjectById);
router.post('/assets-cip', requirePermission('finance:assets:create'), cipController.createCipProject);
router.put('/assets-cip/:id', requirePermission('finance:assets:update'), cipController.updateCipProject);
router.delete('/assets-cip/:id', requirePermission('finance:assets:delete'), cipController.deleteCipProject);
router.post('/assets-cip/:id/cost', requirePermission('finance:assets:update'), cipController.addCost);
router.post('/assets-cip/:id/transfer', requirePermission('finance:assets:update'), cipController.transferToFixedAsset);

// 3. 资产盘点管理
router.get('/assets-inventory', requirePermission('finance:assets:view'), inventoryController.getInventories);
router.get('/assets-inventory/:id', requirePermission('finance:assets:view'), inventoryController.getInventoryById);
router.post('/assets-inventory', requirePermission('finance:assets:create'), inventoryController.createInventory);
router.put('/assets-inventory/:id/items/:itemId', requirePermission('finance:assets:update'), inventoryController.updateInventoryItem);
router.post('/assets-inventory/:id/complete', requirePermission('finance:assets:update'), inventoryController.completeInventory);

// 现金管理模块路由
// 1. 银行账户管理
router.get('/bank-accounts', requirePermission('finance:cash:view'), cashController.getBankAccounts);
router.get('/bank-accounts/stats', requirePermission('finance:cash:view'), cashController.getBankAccountsStats);
router.get('/bank-accounts/:id', requirePermission('finance:cash:view'), cashController.getBankAccountById);
router.post('/bank-accounts', requirePermission('finance:cash:create'), cashController.createBankAccount);
router.put('/bank-accounts/:id', requirePermission('finance:cash:update'), cashController.updateBankAccount);
router.patch('/bank-accounts/:id/status', requirePermission('finance:cash:update'), cashController.updateBankAccountStatus);

// 2. 银行交易管理
// 注意：具体路径必须在参数路径之前定义
router.get('/bank-transactions', requirePermission('finance:cash:view'), cashController.getBankTransactions);
router.get('/bank-transactions/export', requirePermission('finance:cash:export'), cashController.exportBankTransactions);
router.post(
  '/bank-transactions/import',
  requirePermission('finance:cash:create'),
  upload.single('file'),
  cashController.importBankTransactions
);
router.post('/bank-transactions', requirePermission('finance:cash:create'), cashController.createBankTransaction);
// 参数路由放在最后
router.get('/bank-transactions/:id', requirePermission('finance:cash:view'), cashController.getBankTransactionById);
router.put('/bank-transactions/:id', requirePermission('finance:cash:update'), cashController.updateBankTransaction);
router.delete('/bank-transactions/:id', requirePermission('finance:cash:delete'), cashController.deleteBankTransaction);
router.patch('/bank-transactions/:id/reconcile', requirePermission('finance:cash:reconcile'), cashController.reconcileBankTransaction);
router.post('/bank-transactions/:id/submit', requirePermission('finance:cash:update'), cashController.submitForAudit);
router.post('/bank-transactions/:id/audit', requirePermission('finance:cash:approve'), cashController.auditTransaction);

// 3. 现金交易管理（已整合到主控制器）
const {
  createCashTransactionValidation,
  updateCashTransactionValidation,
  deleteCashTransactionValidation,
  getCashTransactionsValidation,
  getCashTransactionByIdValidation,
  importCashTransactionsValidation,
  exportCashTransactionsValidation,
  getCashTransactionStatsValidation,
} = require('../middleware/validation/cashTransactionValidation');

// 现金交易路由 - 使用主控制器的现金交易方法
router.get('/cash-transactions', requirePermission('finance:cash:view'), getCashTransactionsValidation, cashController.getCashTransactions);
router.get(
  '/cash-transactions/stats',
  requirePermission('finance:cash:view'),
  getCashTransactionStatsValidation,
  cashController.getCashTransactionStats
);
router.get(
  '/cash-transactions/export',
  requirePermission('finance:cash:export'),
  exportCashTransactionsValidation,
  cashController.exportCashTransactions
);
router.post(
  '/cash-transactions/import',
  requirePermission('finance:cash:create'),
  upload.single('file'),
  importCashTransactionsValidation,
  cashController.importCashTransactions
);
router.post(
  '/cash-transactions',
  requirePermission('finance:cash:create'),
  createCashTransactionValidation,
  cashController.createCashTransaction
);
router.get(
  '/cash-transactions/:id',
  requirePermission('finance:cash:view'),
  getCashTransactionByIdValidation,
  cashController.getCashTransactionById
);
router.put(
  '/cash-transactions/:id',
  requirePermission('finance:cash:update'),
  updateCashTransactionValidation,
  cashController.updateCashTransaction
);
router.delete(
  '/cash-transactions/:id',
  requirePermission('finance:cash:delete'),
  deleteCashTransactionValidation,
  cashController.deleteCashTransaction
);
// 现金交易审核路由
router.put('/cash-transactions/:id/submit', requirePermission('finance:cash:update'), cashController.submitCashTransactionForAudit);
router.put('/cash-transactions/:id/approve', requirePermission('finance:cash:approve'), cashController.approveCashTransaction);
router.put('/cash-transactions/:id/reject', requirePermission('finance:cash:approve'), cashController.rejectCashTransaction);

// 银行对账模块路由
router.get('/cash/reconciliation/unreconciled', requirePermission('finance:cash:reconcile'), cashController.getUnreconciledTransactions);
router.get('/cash/reconciliation/reconciled', requirePermission('finance:cash:reconcile'), cashController.getReconciledTransactions);
router.get('/cash/reconciliation/stats', requirePermission('finance:cash:reconcile'), cashController.getReconciliationStats);
router.post('/cash/reconciliation/mark-reconciled', requirePermission('finance:cash:reconcile'), cashController.markTransactionAsReconciled);
router.post(
  '/cash/reconciliation/cancel-reconciled',
  requirePermission('finance:cash:reconcile'),
  cashController.cancelTransactionReconciliation
);
router.post('/cash/reconciliation/import-statement', requirePermission('finance:cash:reconcile'), cashController.importBankStatement);

// 3. 统计相关路由
router.get('/statistics/cash-flow', requirePermission('finance:reports:view'), cashController.getCashFlowStatistics);

// 4. 修复工具路由
router.post('/cash/fix/recalculate-balances', requirePermission('system:settings:update'), cashController.recalculateBankAccountBalances);

// 财务报表模块路由（基于真实数据）
const enhancedReportsController = require('../controllers/common/enhancedReportsController');

// 1. 资产负债表
router.get('/reports/balance-sheet', requirePermission('finance:reports:view'), enhancedReportsController.getBalanceSheet);

// 2. 利润表
router.get('/reports/income-statement', requirePermission('finance:reports:view'), enhancedReportsController.getIncomeStatement);

// 3. 现金流量表（出纳报表）
router.get('/reports/cash-flow', requirePermission('finance:reports:view'), enhancedReportsController.getCashFlowStatement);

// 4. 标准现金流量表（间接法）
router.get('/reports/standard-cash-flow', requirePermission('finance:reports:view'), enhancedReportsController.getStandardCashFlowStatement);

// 5. 财务报表汇总
router.get('/reports/summary', requirePermission('finance:reports:view'), enhancedReportsController.getReportsSummary);



// 税务模块路由
// 1. 税务发票管理
router.get('/tax/invoices', requirePermission('finance:tax:view'), taxController.getTaxInvoices);
router.post('/tax/invoices', requirePermission('finance:tax:create'), taxController.createTaxInvoice);
router.get('/tax/invoices/:id', requirePermission('finance:tax:view'), taxController.getTaxInvoiceById);
router.post('/tax/invoices/:id/certify', requirePermission('finance:tax:update'), taxController.certifyTaxInvoice);
router.post('/tax/invoices/:id/deduct', requirePermission('finance:tax:update'), taxController.deductTaxInvoice);
router.post('/tax/invoices/:id/link', requirePermission('finance:tax:update'), taxController.linkTaxInvoice);
router.post('/tax/invoices/:id/unlink', requirePermission('finance:tax:update'), taxController.unlinkTaxInvoice);
router.get('/tax/available-documents', requirePermission('finance:tax:view'), taxController.getAvailableDocuments);

// 2. 税务申报管理
router.get('/tax/returns', requirePermission('finance:tax:view'), taxController.getTaxReturns);
router.post('/tax/returns', requirePermission('finance:tax:create'), taxController.createTaxReturn);
router.get('/tax/returns/:id', requirePermission('finance:tax:view'), taxController.getTaxReturnById);
router.post('/tax/returns/:id/submit', requirePermission('finance:tax:update'), taxController.submitTaxReturn);
router.post('/tax/returns/:id/pay', requirePermission('finance:tax:pay'), taxController.payTaxReturn);

// 3. 税务科目配置
router.get('/tax/account-config', requirePermission('finance:tax:view'), taxController.getTaxAccountConfigs);
router.post('/tax/account-config', requirePermission('finance:tax:create'), taxController.createTaxAccountConfig);
router.put('/tax/account-config/:id', requirePermission('finance:tax:update'), taxController.updateTaxAccountConfig);
router.delete('/tax/account-config/:id', requirePermission('finance:tax:delete'), taxController.deleteTaxAccountConfig);

// 6. 预算管理模块路由
router.post('/budgets', requirePermission('finance:budgets:create'), budgetController.createBudget);
router.get('/budgets', requirePermission('finance:budgets:view'), budgetController.getBudgets);
// ⚠️ 具体路由必须在 /budgets/:id 之前注册，否则会被参数路由拦截
// 预算预警
router.get('/budgets/warnings', requirePermission('finance:budgets:view'), budgetController.getBudgetWarnings);
router.put('/budgets/warnings/:id/read', requirePermission('finance:budgets:update'), budgetController.markWarningAsRead);
// 预算检查
router.get('/budgets/check', requirePermission('finance:budgets:view'), budgetController.checkBudgetAvailability);
// 部门对比（无 :id）
router.get('/budgets/analysis/department-comparison', requirePermission('finance:budgets:view'), budgetController.getDepartmentBudgetComparison);
// AI 预算分析（无 :id 的路由）
router.get('/budgets/ai/recommendation', requirePermission('finance:budgets:view'), budgetController.getAIRecommendation);
router.post('/budgets/ai/create-from-ai', requirePermission('finance:budgets:create'), budgetController.createBudgetFromAI);
router.get('/budgets/ai/year-comparison', requirePermission('finance:budgets:view'), budgetController.getAIYearComparison);
router.get('/budgets/ai/usage-stats', requirePermission('finance:budgets:view'), budgetController.getAIUsageStats);
// 参数路由 — 必须在所有具体 GET /budgets/xxx 之后
router.get('/budgets/:id', requirePermission('finance:budgets:view'), budgetController.getBudgetById);
router.put('/budgets/:id', requirePermission('finance:budgets:update'), budgetController.updateBudget);
router.delete('/budgets/:id', requirePermission('finance:budgets:delete'), budgetController.deleteBudget);
router.post('/budgets/:id/submit', requirePermission('finance:budgets:update'), budgetController.submitBudget);
router.post('/budgets/:id/approve', requirePermission('finance:budgets:approve'), budgetController.approveBudget);
router.post('/budgets/:id/start', requirePermission('finance:budgets:update'), budgetController.startBudgetExecution);
router.post('/budgets/:id/close', requirePermission('finance:budgets:update'), budgetController.closeBudget);
// 预算执行分析（含 :id 的路由）
router.get('/budgets/:id/analysis', requirePermission('finance:budgets:view'), budgetController.getRealTimeBudgetAnalysis);
router.get('/budgets/:id/analysis/execution', requirePermission('finance:budgets:view'), budgetController.getBudgetExecutionAnalysis);
router.get('/budgets/:id/analysis/variance', requirePermission('finance:budgets:view'), budgetController.getBudgetVarianceAnalysis);
router.get('/budgets/:id/executions', requirePermission('finance:budgets:view'), budgetController.getBudgetExecutions);
router.get('/budgets/:id/ai/anomalies', requirePermission('finance:budgets:view'), budgetController.getAIAnomalies);
router.get('/budgets/:id/ai/optimization', requirePermission('finance:budgets:view'), budgetController.getAIOptimization);
router.get('/budgets/:id/ai/comprehensive-report', requirePermission('finance:budgets:view'), budgetController.getAIComprehensiveReport);

// 5. 产品定价管理
const pricingExportController = require('../controllers/business/finance/pricingExportController');
const pricingStrategyController = require('../controllers/business/finance/pricingStrategyController');

// 定价策略字段管理
router.get('/pricing/strategy-fields', requirePermission('finance:pricing:view'), pricingStrategyController.getStrategyFields);
router.post('/pricing/strategy-fields', requirePermission('finance:pricing:create'), pricingStrategyController.createStrategyField);
router.put('/pricing/strategy-fields/:id', requirePermission('finance:pricing:update'), pricingStrategyController.updateStrategyField);
router.delete('/pricing/strategy-fields/:id', requirePermission('finance:pricing:delete'), pricingStrategyController.deleteStrategyField);
router.patch('/pricing/strategy-fields/:id/toggle', requirePermission('finance:pricing:update'), pricingStrategyController.toggleStrategyField);

// 定价设置 (必须在 /pricing/:productId 之前，否则 settings 会被误匹配为 productId)
router.get('/pricing/settings', requirePermission('finance:pricing:view'), pricingController.getPricingSettings);
router.put('/pricing/settings', requirePermission('finance:pricing:update'), pricingController.updatePricingSettings);

// 产品定价
router.get('/pricing', requirePermission('finance:pricing:view'), pricingController.getPricingList);
router.post('/pricing', requirePermission('finance:pricing:create'), pricingController.createPricing); // 创建产品定价
router.get('/pricing/export', requirePermission('finance:pricing:export'), pricingExportController.exportPricingList); // 导出功能
router.get('/pricing/calculate-bom/:productId', requirePermission('finance:pricing:view'), pricingController.calculateBomCost); // 必须在 /:productId 之前
router.get('/pricing/:productId', requirePermission('finance:pricing:view'), pricingController.getPricingDetail); // 获取单个产品定价详情
router.get('/pricing/:productId/history', requirePermission('finance:pricing:view'), pricingController.getPricingHistory); // 获取产品定价历史
router.get('/pricing/:productId/bom', requirePermission('finance:pricing:view'), pricingController.getBomDetails); // 获取BOM明细

// BOM价格调整路由
router.get('/bom-price-adjustments/:productId', requirePermission('finance:pricing:view'), bomPriceAdjustmentController.getAdjustments); // 获取产品的价格调整列表
router.post('/bom-price-adjustments', requirePermission('finance:pricing:update'), bomPriceAdjustmentController.saveAdjustment); // 保存价格调整
router.get(
  '/bom-price-adjustments/:productId/:materialId/history',
  requirePermission('finance:pricing:view'),
  bomPriceAdjustmentController.getAdjustmentHistory
); // 获取调整历史
router.delete('/bom-price-adjustments/:id', requirePermission('finance:pricing:delete'), bomPriceAdjustmentController.deleteAdjustment); // 删除调整

// 逾期检查触发路由（全局）
router.get('/overdue/check', requirePermission('finance:reports:view'), overdueController.checkOverdueInvoices);

// 盈利分析路由 — 使用独立控制器（符合 SRP 原则）
const profitabilityController = require('../controllers/business/finance/profitabilityController');

router.get('/profitability/summary', requirePermission('finance:reports:view'), profitabilityController.getProfitSummary);
router.get('/profitability/products', requirePermission('finance:reports:view'), profitabilityController.getProductProfitability);
router.get('/profitability/customers', requirePermission('finance:reports:view'), profitabilityController.getCustomerProfitability);
router.get('/profitability/trend', requirePermission('finance:reports:view'), profitabilityController.getProfitTrend);

module.exports = router;
