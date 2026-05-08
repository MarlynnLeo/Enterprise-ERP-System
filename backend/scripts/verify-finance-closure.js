require('dotenv').config();

const db = require('../src/config/db');
const expenseModel = require('../src/models/expense');
const budgetModel = require('../src/models/budget');
const taxModel = require('../src/models/tax');
const financeModel = require('../src/models/finance');
const BankTransactionModel = require('../src/models/cash/Transaction');
const financeController = require('../src/controllers/business/finance/financeController');
const taxController = require('../src/controllers/business/finance/taxController');
const cashController = require('../src/controllers/business/finance/cashController');
const PeriodEndService = require('../src/services/business/PeriodEndService');
const ScheduledTaskService = require('../src/services/business/ScheduledTaskService');
const { DOCUMENT_TYPE_MAPPING } = require('../src/constants/financeConstants');

const today = process.env.FINANCE_VERIFY_DATE || '2026-05-06';
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

const results = [];

function assert(condition, message, details = undefined) {
  if (!condition) {
    const error = new Error(message);
    if (details !== undefined) error.details = details;
    throw error;
  }
}

function toMoney(value) {
  return Math.round(Number.parseFloat(value || 0) * 100) / 100;
}

function assertMoney(actual, expected, message) {
  assert(Math.abs(toMoney(actual) - toMoney(expected)) < 0.01, message, { actual, expected });
}

function mark(name, data = undefined) {
  results.push({ name, data });
  console.log(`PASS ${name}${data ? ` ${JSON.stringify(data)}` : ''}`);
}

async function queryOne(sql, params = []) {
  const [rows] = await db.pool.execute(sql, params);
  return rows[0] || null;
}

async function ensureUser() {
  const user = await queryOne(
    "SELECT id FROM users WHERE status = 1 ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, id LIMIT 1"
  );
  assert(user?.id, '缺少可用用户，无法验证需要操作人的财务流程');
  return user.id;
}

async function ensureAccount({ code, name, accountType, englishType, isDebit }) {
  const existing = await queryOne('SELECT id, is_active FROM gl_accounts WHERE account_code = ?', [code]);
  if (existing) {
    if (!existing.is_active) {
      await db.pool.execute('UPDATE gl_accounts SET is_active = 1 WHERE id = ?', [existing.id]);
    }
    return existing.id;
  }

  const [result] = await db.pool.execute(
    `INSERT INTO gl_accounts
      (account_code, account_name, account_type, type, is_debit, is_active, currency_code, description)
     VALUES (?, ?, ?, ?, ?, 1, 'CNY', ?)`,
    [code, name, accountType, englishType, isDebit ? 1 : 0, 'finance closure verification']
  );
  return result.insertId;
}

async function ensureTaxConfig(configKey, configName, fallbackAccountId) {
  const config = await queryOne(
    `SELECT tac.id, tac.account_id, ga.is_active
     FROM tax_account_config tac
     LEFT JOIN gl_accounts ga ON ga.id = tac.account_id
     WHERE tac.config_key = ?`,
    [configKey]
  );

  if (!config) {
    await db.pool.execute(
      `INSERT INTO tax_account_config (config_key, config_name, account_id, description, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [configKey, configName, fallbackAccountId, 'finance closure verification']
    );
    return fallbackAccountId;
  }

  if (!config.account_id || !config.is_active) {
    await db.pool.execute(
      'UPDATE tax_account_config SET account_id = ?, is_active = 1 WHERE id = ?',
      [fallbackAccountId, config.id]
    );
    return fallbackAccountId;
  }

  return config.account_id;
}

function monthRange(dateString) {
  const [year, month] = dateString.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    fiscalYear: year,
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

async function ensureOpenPeriod(dateString) {
  const period = await queryOne(
    `SELECT id
     FROM gl_periods
     WHERE ? BETWEEN start_date AND end_date AND is_closed = 0
     ORDER BY start_date DESC, id DESC
     LIMIT 1`,
    [dateString]
  );
  if (period) return period.id;

  const range = monthRange(dateString);
  const [result] = await db.pool.execute(
    `INSERT INTO gl_periods (period_name, start_date, end_date, is_closed, fiscal_year, status)
     VALUES (?, ?, ?, 0, ?, 'open')`,
    [`${range.fiscalYear}年${dateString.slice(5, 7)}月-审计验证`, range.start, range.end, range.fiscalYear]
  );
  return result.insertId;
}

async function ensureExpenseCategory(accountCode) {
  const code = 'AUDIT-FIN-CLOSURE';
  const category = await queryOne(
    'SELECT id FROM expense_categories WHERE code = ? AND deleted_at IS NULL',
    [code]
  );
  if (category) {
    await db.pool.execute(
      'UPDATE expense_categories SET status = 1, gl_account_code = ? WHERE id = ?',
      [accountCode, category.id]
    );
    return category.id;
  }

  const [result] = await db.pool.execute(
    `INSERT INTO expense_categories
      (code, name, description, status, sort_order, gl_account_code)
     VALUES (?, ?, ?, 1, 0, ?)`,
    [code, '审计验证费用', 'finance closure verification', accountCode]
  );
  return result.insertId;
}

async function createAuditBankAccount(userId) {
  const accountNumber = `AUDIT${stamp}`;
  const [result] = await db.pool.execute(
    `INSERT INTO bank_accounts
      (account_number, account_name, bank_name, branch_name, currency_code,
       current_balance, opening_balance, account_type, is_active, notes, created_by)
     VALUES (?, ?, ?, ?, 'CNY', ?, ?, '活期', 1, ?, ?)`,
    [
      accountNumber,
      `财务闭环验证账户${stamp}`,
      '审计验证银行',
      '自动化验证支行',
      100000,
      100000,
      'finance closure verification',
      userId,
    ]
  );
  return result.insertId;
}

async function getBankBalance(bankAccountId) {
  const account = await queryOne('SELECT current_balance FROM bank_accounts WHERE id = ?', [bankAccountId]);
  assert(account, `银行账户不存在: ${bankAccountId}`);
  return toMoney(account.current_balance);
}

async function assertLink(sourceType, sourceId, targetType, targetId, label) {
  const link = await queryOne(
    `SELECT COUNT(*) AS count
     FROM document_links
     WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?`,
    [sourceType, sourceId, targetType, targetId]
  );
  assert(Number(link?.count || 0) > 0, `单据链缺失: ${label}`);
}

async function assertPostedBalancedEntry(entryId, label) {
  const entry = await queryOne('SELECT id, entry_number, is_posted FROM gl_entries WHERE id = ?', [entryId]);
  assert(entry, `${label} 凭证不存在`);
  assert(Number(entry.is_posted) === 1, `${label} 凭证未过账`, entry);

  const totals = await queryOne(
    `SELECT SUM(debit_amount) AS debit, SUM(credit_amount) AS credit
     FROM gl_entry_items WHERE entry_id = ?`,
    [entryId]
  );
  assertMoney(totals.debit, totals.credit, `${label} 凭证借贷不平衡`);
  return entry.entry_number;
}

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return payload;
    },
  };
}

async function invokePayTaxReturn({ taxReturnId, bankAccountId, userId, paymentDate = today }) {
  const req = {
    params: { id: taxReturnId },
    body: {
      payment_date: paymentDate,
      ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
    },
    user: { id: userId },
  };
  const res = createRes();
  await taxController.payTaxReturn(req, res);
  return { statusCode: res.statusCode, body: res.body };
}

async function invokeController(handler, { params = {}, body = {}, query = {}, userId }) {
  const req = {
    params,
    body,
    query,
    user: { id: userId },
  };
  const res = createRes();
  await handler(req, res);
  return { statusCode: res.statusCode, body: res.body };
}

async function verifyBankAccountOperations({ userId, bankAccountId }) {
  const updatedAccountNumber = `AUDITU${stamp.slice(1)}`;
  const updateResponse = await invokeController(cashController.updateBankAccount, {
    params: { id: bankAccountId },
    userId,
    body: {
      account_number: updatedAccountNumber,
      account_name: `财务闭环验证账户-已编辑${stamp}`,
      bank_name: '审计验证银行',
      branch_name: '自动化验证支行',
      currency_code: 'CNY',
      account_type: '定期',
      is_active: true,
      notes: 'bank account operation verification',
    },
  });
  assert(updateResponse.statusCode === 200 && updateResponse.body?.success, '银行账户编辑接口未成功', updateResponse);
  assert(updateResponse.body?.data?.accountType === '定期', '银行账户编辑响应未返回真实账户类型', updateResponse);

  let account = await queryOne('SELECT account_number, account_type, is_active FROM bank_accounts WHERE id = ?', [bankAccountId]);
  assert(account.account_number === updatedAccountNumber, '银行账号编辑后未落库', account);
  assert(account.account_type === '定期', '银行账户类型编辑后未落库', account);
  assert(Number(account.is_active) === 1, '银行账户编辑不应误改为冻结', account);

  const frozenResponse = await invokeController(cashController.updateBankAccountStatus, {
    params: { id: bankAccountId },
    userId,
    body: { status: 'frozen' },
  });
  assert(frozenResponse.statusCode === 200 && frozenResponse.body?.data?.status === 'frozen', '银行账户冻结接口未成功', frozenResponse);
  account = await queryOne('SELECT is_active FROM bank_accounts WHERE id = ?', [bankAccountId]);
  assert(Number(account.is_active) === 0, '银行账户冻结后 is_active 应为 0', account);

  const invalidStatusResponse = await invokeController(cashController.updateBankAccountStatus, {
    params: { id: bankAccountId },
    userId,
    body: { status: 'closed' },
  });
  assert(invalidStatusResponse.statusCode === 400 && !invalidStatusResponse.body?.success, '银行账户不支持的状态应被拦截', invalidStatusResponse);
  account = await queryOne('SELECT is_active FROM bank_accounts WHERE id = ?', [bankAccountId]);
  assert(Number(account.is_active) === 0, '无效状态请求不应改变银行账户状态', account);

  const activeResponse = await invokeController(cashController.updateBankAccountStatus, {
    params: { id: bankAccountId },
    userId,
    body: { status: 'active' },
  });
  assert(activeResponse.statusCode === 200 && activeResponse.body?.data?.status === 'active', '银行账户激活接口未成功', activeResponse);
  account = await queryOne('SELECT is_active FROM bank_accounts WHERE id = ?', [bankAccountId]);
  assert(Number(account.is_active) === 1, '银行账户激活后 is_active 应为 1', account);

  mark('银行账户编辑-冻结-非法状态拦截-激活闭环', { bankAccountId });
}

async function verifyExpenseLifecycle({ userId, bankAccountId, categoryId }) {
  const beforeBalance = await getBankBalance(bankAccountId);
  const created = await expenseModel.createExpense({
    category_id: categoryId,
    title: `财务闭环验证费用${stamp}`,
    amount: 123.45,
    expense_date: today,
    payee: '审计验证供应商',
    invoice_number: `AUD-EXP-${stamp}`,
    description: 'expense lifecycle verification',
    status: 'paid',
    created_by: userId,
  });

  let expense = await expenseModel.getExpenseById(created.id);
  assert(expense.status === 'draft', '费用创建必须强制为草稿，不能被前端状态绕过', expense);

  await expenseModel.submitExpense(created.id, userId);
  expense = await expenseModel.getExpenseById(created.id);
  assert(expense.status === 'pending', '费用提交后状态应为 pending', expense);

  await expenseModel.approveExpense(created.id, userId, 'approve', 'finance closure verification');
  expense = await expenseModel.getExpenseById(created.id);
  assert(expense.status === 'approved', '费用审批后状态应为 approved', expense);

  const payment = await expenseModel.payExpense(created.id, {
    payment_date: today,
    bank_account_id: bankAccountId,
    created_by: userId,
  });

  expense = await expenseModel.getExpenseById(created.id);
  assert(expense.status === 'paid', '费用付款后状态应为 paid', expense);
  assert(Number(expense.payment_transaction_id) === Number(payment.transactionId), '费用未回写付款流水ID');
  assert(expense.payment_transaction_number, '费用详情未返回付款流水号');
  assert(expense.payment_voucher_number, '费用详情未返回付款凭证号');

  const transaction = await queryOne('SELECT * FROM bank_transactions WHERE id = ?', [payment.transactionId]);
  assert(transaction, '费用付款银行流水不存在');
  assert(transaction.status === 'approved', '费用付款流水应为 approved', transaction);
  assert(Number(transaction.gl_entry_id) === Number(payment.glEntryId), '费用付款流水未回写凭证ID', transaction);
  assertMoney(await getBankBalance(bankAccountId), beforeBalance - 123.45, '费用付款后银行余额未正确减少');

  await assertPostedBalancedEntry(payment.glEntryId, '费用付款');
  await assertLink('expense', created.id, 'bank_transaction', payment.transactionId, '费用 -> 银行流水');
  await assertLink('expense', created.id, 'finance_voucher', payment.glEntryId, '费用 -> 凭证');
  await assertLink('bank_transaction', payment.transactionId, 'finance_voucher', payment.glEntryId, '银行流水 -> 凭证');

  mark('费用申请-审批-付款-凭证-银行流水闭环', {
    expenseId: created.id,
    bankTransactionId: payment.transactionId,
    glEntryId: payment.glEntryId,
  });
}

async function verifyManualBankTransaction({ userId, bankAccountId }) {
  const beforeBalance = await getBankBalance(bankAccountId);
  const transactionNumber = `ABK${stamp.slice(2)}1`;
  const created = await BankTransactionModel.createBankTransaction({
    transaction_number: transactionNumber,
    bank_account_id: bankAccountId,
    transaction_date: today,
    transaction_type: '费用',
    amount: 10.11,
    reference_number: `REF-${stamp}`,
    description: 'manual bank draft verification',
    related_party: '审计验证往来方',
    created_by: userId,
  });

  assertMoney(created.newBalance, beforeBalance, '手工新增草稿流水不应改变余额');
  assertMoney(await getBankBalance(bankAccountId), beforeBalance, '手工新增草稿流水后账户余额被改变');

  let transaction = await BankTransactionModel.getBankTransactionById(created.transactionId);
  assert(transaction.status === 'draft', '手工新增银行流水应为 draft', transaction);

  await BankTransactionModel.updateBankTransaction(created.transactionId, {
    bank_account_id: bankAccountId,
    transaction_date: today,
    transaction_type: '费用',
    amount: 12.34,
    reference_number: `REF-UPD-${stamp}`,
    description: 'manual bank draft update verification',
    related_party: '审计验证往来方',
    category: '审计',
    payment_method: 'bank_transfer',
    updated_by: userId,
  });
  assertMoney(await getBankBalance(bankAccountId), beforeBalance, '草稿流水编辑不应改变余额');

  await BankTransactionModel.submitForAudit(created.transactionId);
  transaction = await BankTransactionModel.getBankTransactionById(created.transactionId);
  assert(transaction.status === 'pending', '银行流水提交审核后应为 pending', transaction);
  assertMoney(await getBankBalance(bankAccountId), beforeBalance, '待审核流水不应改变余额');

  const approved = await BankTransactionModel.approveTransaction(created.transactionId, userId);
  assertMoney(approved.newBalance, beforeBalance - 12.34, '银行流水审核通过返回余额不正确');
  transaction = await BankTransactionModel.getBankTransactionById(created.transactionId);
  assert(transaction.status === 'approved', '银行流水审核通过后应为 approved', transaction);
  assertMoney(await getBankBalance(bankAccountId), beforeBalance - 12.34, '银行流水审核通过后余额未正确入账');

  let deleteBlocked = false;
  try {
    await BankTransactionModel.deleteBankTransaction(created.transactionId);
  } catch {
    deleteBlocked = true;
  }
  assert(deleteBlocked, '已审核银行流水不应允许删除');

  const rejectNumber = `ABK${stamp.slice(2)}2`;
  const rejectedCreated = await BankTransactionModel.createBankTransaction({
    transaction_number: rejectNumber,
    bank_account_id: bankAccountId,
    transaction_date: today,
    transaction_type: '存款',
    amount: 5,
    description: 'manual bank reject verification',
    related_party: '审计验证往来方',
    created_by: userId,
  });
  const afterApprovedBalance = await getBankBalance(bankAccountId);
  await BankTransactionModel.submitForAudit(rejectedCreated.transactionId);
  await BankTransactionModel.rejectTransaction(rejectedCreated.transactionId, userId, 'finance closure verification');
  transaction = await BankTransactionModel.getBankTransactionById(rejectedCreated.transactionId);
  assert(transaction.status === 'rejected', '银行流水驳回后应为 rejected', transaction);
  assertMoney(await getBankBalance(bankAccountId), afterApprovedBalance, '驳回流水不应改变余额');

  await BankTransactionModel.updateBankTransaction(rejectedCreated.transactionId, {
    bank_account_id: bankAccountId,
    transaction_date: today,
    transaction_type: '存款',
    amount: 6.66,
    reference_number: `REF-REJ-${stamp}`,
    description: 'manual bank rejected update verification',
    related_party: '审计验证往来方',
    category: '审计',
    payment_method: 'bank_transfer',
    updated_by: userId,
  });
  transaction = await BankTransactionModel.getBankTransactionById(rejectedCreated.transactionId);
  assert(transaction.status === 'draft', '驳回流水编辑后应回到 draft', transaction);
  assertMoney(await getBankBalance(bankAccountId), afterApprovedBalance, '驳回流水编辑不应改变余额');

  await BankTransactionModel.deleteBankTransaction(rejectedCreated.transactionId);
  transaction = await BankTransactionModel.getBankTransactionById(rejectedCreated.transactionId);
  assert(!transaction, '草稿银行流水删除后不应继续存在');
  assertMoney(await getBankBalance(bankAccountId), afterApprovedBalance, '删除未入账流水不应改变余额');

  mark('手工银行流水草稿-提交-审批/驳回-删除控制闭环', {
    approvedTransactionId: created.transactionId,
    approvedBalance: await getBankBalance(bankAccountId),
  });
}

async function createSubmittedTaxReturn(data) {
  return await taxModel.createTaxReturn({
    ...data,
    status: '已申报',
    declaration_date: today,
  });
}

async function verifyTaxPayment({ userId, bankAccountId }) {
  const beforeBalance = await getBankBalance(bankAccountId);
  const vatReturnId = await createSubmittedTaxReturn({
    return_period: `V${stamp.slice(2, 14)}`,
    return_type: '增值税',
    sales_amount: 1000,
    sales_output_tax: 60,
    purchase_amount: 500,
    purchase_input_tax: 40,
    input_tax_deduction: 40,
    tax_payable: 20,
    tax_balance: 20,
    remark: 'finance closure verification',
    created_by: userId,
  });

  const vatResponse = await invokePayTaxReturn({ taxReturnId: vatReturnId, bankAccountId, userId });
  assert(vatResponse.statusCode === 200 && vatResponse.body?.success, '增值税非零缴纳接口未成功', vatResponse);

  const taxReturn = await queryOne('SELECT * FROM tax_returns WHERE id = ?', [vatReturnId]);
  assert(taxReturn.status === '已缴纳', '增值税缴纳后状态应为已缴纳', taxReturn);
  assertMoney(taxReturn.tax_paid, 20, '增值税缴纳金额未回写');
  assert(taxReturn.gl_entry_id, '增值税缴纳未回写凭证ID');

  const bankTransaction = await queryOne('SELECT * FROM bank_transactions WHERE tax_return_id = ?', [vatReturnId]);
  assert(bankTransaction, '增值税缴纳未生成银行流水');
  assert(bankTransaction.status === 'approved', '增值税缴纳银行流水应为 approved', bankTransaction);
  assert(Number(bankTransaction.gl_entry_id) === Number(taxReturn.gl_entry_id), '增值税缴纳银行流水未关联凭证');
  assertMoney(await getBankBalance(bankAccountId), beforeBalance - 20, '增值税缴纳后银行余额未正确减少');

  await assertPostedBalancedEntry(taxReturn.gl_entry_id, '增值税缴纳');
  await assertLink('tax_return', vatReturnId, 'bank_transaction', bankTransaction.id, '税务申报 -> 银行流水');
  await assertLink('tax_return', vatReturnId, 'finance_voucher', taxReturn.gl_entry_id, '税务申报 -> 凭证');
  await assertLink('bank_transaction', bankTransaction.id, 'finance_voucher', taxReturn.gl_entry_id, '银行流水 -> 凭证');

  const nonVatReturnId = await createSubmittedTaxReturn({
    return_period: `I${stamp.slice(2, 14)}`,
    return_type: '企业所得税',
    total_revenue: 1000,
    taxable_income: 100,
    income_tax_payable: 25,
    tax_payable: 25,
    tax_balance: 25,
    remark: 'finance closure verification',
    created_by: userId,
  });
  const balanceBeforeRejectedPayment = await getBankBalance(bankAccountId);
  const nonVatResponse = await invokePayTaxReturn({
    taxReturnId: nonVatReturnId,
    bankAccountId,
    userId,
  });
  assert(nonVatResponse.statusCode === 400 && !nonVatResponse.body?.success, '未配置规则的非增值税非零缴款应被拦截', nonVatResponse);
  assertMoney(await getBankBalance(bankAccountId), balanceBeforeRejectedPayment, '非增值税缴款被拦截后不应扣减余额');
  const nonVatBankTransaction = await queryOne('SELECT id FROM bank_transactions WHERE tax_return_id = ?', [nonVatReturnId]);
  assert(!nonVatBankTransaction, '非增值税缴款被拦截后不应生成银行流水');

  const zeroVatReturnId = await createSubmittedTaxReturn({
    return_period: `Z${stamp.slice(2, 14)}`,
    return_type: '增值税',
    tax_payable: 0,
    tax_balance: 0,
    remark: 'finance closure verification',
    created_by: userId,
  });
  const zeroResponse = await invokePayTaxReturn({ taxReturnId: zeroVatReturnId, userId });
  assert(zeroResponse.statusCode === 200 && zeroResponse.body?.success, '零元申报标记已缴纳应成功', zeroResponse);
  assert(zeroResponse.body?.data?.bankTransactionId === null, '零元申报不应返回银行流水ID', zeroResponse);
  assert(!String(zeroResponse.body?.message || '').includes('银行流水'), '零元申报成功提示不应声称生成银行流水', zeroResponse);

  mark('税务非零缴纳/非增值税拦截/零元申报闭环', {
    vatReturnId,
    vatBankTransactionId: bankTransaction.id,
    vatGlEntryId: taxReturn.gl_entry_id,
    nonVatReturnId,
    zeroVatReturnId,
  });
}

async function verifyBudgetWorkflow({ userId, expenseAccountId }) {
  let invalidDateRejected = false;
  try {
    await budgetModel.createBudget(
      {
        budget_no: `BAD-DATE-${stamp}`,
        budget_name: '无效日期预算',
        budget_year: 2026,
        budget_type: '年度预算',
        start_date: '2026-12-31',
        end_date: '2026-01-01',
        total_amount: 1,
        created_by: userId,
      },
      []
    );
  } catch {
    invalidDateRejected = true;
  }
  assert(invalidDateRejected, '预算开始日期晚于结束日期应被拦截');

  const budgetId = await budgetModel.createBudget(
    {
      budget_no: `AUD-BUD-${stamp}`,
      budget_name: `财务闭环验证预算${stamp}`,
      budget_year: 2026,
      budget_type: '年度预算',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      total_amount: 999999,
      status: '执行中',
      description: 'finance closure verification',
      created_by: userId,
    },
    [
      {
        account_id: expenseAccountId,
        budget_amount: 500,
        warning_threshold: 80,
        description: '预算明细1',
      },
      {
        account_id: expenseAccountId,
        budget_amount: 700,
        warning_threshold: 90,
        description: '预算明细2',
      },
    ]
  );

  let budget = await budgetModel.getBudgetById(budgetId);
  assert(budget.status === '草稿', '预算创建必须强制为草稿，不能被前端状态绕过', budget);
  assertMoney(budget.total_amount, 1200, '预算总额应以后端明细汇总为准');
  assert(budget.details.length === 2, '预算明细未完整保存', budget.details);

  await budgetModel.updateBudgetStatus(budgetId, '待审批', { approval_status: '审批中' });
  budget = await budgetModel.getBudgetById(budgetId);
  assert(budget.status === '待审批', '预算提交后应为待审批', budget);

  await budgetModel.updateBudgetStatus(budgetId, '已审批', {
    approval_status: '已通过',
    approved_by: userId,
  });
  budget = await budgetModel.getBudgetById(budgetId);
  assert(budget.status === '已审批', '预算审批后应为已审批', budget);
  assert(Number(budget.approved_by) === Number(userId), '预算审批人未回写', budget);

  await budgetModel.updateBudgetStatus(budgetId, '执行中');
  budget = await budgetModel.getBudgetById(budgetId);
  assert(budget.status === '执行中', '预算启动后应为执行中', budget);

  await budgetModel.updateBudgetStatus(budgetId, '已关闭');
  budget = await budgetModel.getBudgetById(budgetId);
  assert(budget.status === '已关闭', '预算关闭后应为已关闭', budget);

  mark('预算创建-提交-审批-执行-关闭闭环', { budgetId });
}

async function verifyScheduledTasks() {
  ScheduledTaskService.stopAllTasks();
  ScheduledTaskService.startAllTasks();
  const startedStatus = ScheduledTaskService.getTaskStatus();
  const taskNames = Object.keys(startedStatus);
  assert(taskNames.length >= 6, '定时任务启动后任务数量不完整', startedStatus);
  for (const taskName of taskNames) {
    assert(
      startedStatus[taskName].scheduled || startedStatus[taskName].running,
      `定时任务未处于可调度状态: ${taskName}`,
      startedStatus[taskName]
    );
  }

  ScheduledTaskService.stopAllTasks();
  const stoppedStatus = ScheduledTaskService.getTaskStatus();
  assert(Object.keys(stoppedStatus).length === 0, '定时任务停止后应清空任务注册表', stoppedStatus);

  mark('自动化定时任务启动-状态查询-停止闭环', { taskCount: taskNames.length });
}

function periodRange(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return {
    fiscalYear: year,
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    name: `${year}年${mm}月关账审计`,
  };
}

async function findFreePeriodWindow() {
  for (let year = 2099; year <= 2199; year += 1) {
    const existingFiscalYear = await queryOne(
      'SELECT id FROM gl_periods WHERE fiscal_year = ? LIMIT 1',
      [year]
    );
    if (existingFiscalYear) continue;

    for (let month = 1; month <= 10; month += 1) {
      const first = periodRange(year, month);
      const third = periodRange(year, month + 2);
      const overlap = await queryOne(
        `SELECT id FROM gl_periods
         WHERE start_date <= ? AND end_date >= ?
         LIMIT 1`,
        [third.end, first.start]
      );
      if (!overlap) {
        return {
          first,
          second: periodRange(year, month + 1),
          third,
        };
      }
    }
  }
  throw new Error('未找到可用于期间关闭/重开验证的空闲日期窗口');
}

async function createVerificationPeriod(range, suffix, forceClosed = false) {
  const periodId = await financeModel.createPeriod({
    period_name: `${range.name}-${suffix}-${stamp}`,
    start_date: range.start,
    end_date: range.end,
    is_closed: forceClosed,
    is_adjusting: false,
    fiscal_year: range.fiscalYear,
  });
  return periodId;
}

async function getPeriod(periodId) {
  const period = await queryOne('SELECT * FROM gl_periods WHERE id = ?', [periodId]);
  assert(period, `会计期间不存在 ${periodId}`);
  return period;
}

async function getPnlBalance(periodId, accountId, expression) {
  const row = await queryOne(
    `SELECT COALESCE(SUM(${expression}), 0) AS balance
     FROM gl_entry_items item
     JOIN gl_entries entry ON entry.id = item.entry_id
     WHERE entry.period_id = ?
       AND entry.is_posted = 1
       AND item.account_id = ?`,
    [periodId, accountId]
  );
  return toMoney(row?.balance);
}

async function verifyPeriodCloseReopenWorkflow({
  userId,
  bankAccountAccountId,
  revenueAccountId,
  expenseAccountId,
}) {
  const ranges = await findFreePeriodWindow();
  const firstPeriodId = await createVerificationPeriod(ranges.first, 'P1');
  const secondPeriodId = await createVerificationPeriod(ranges.second, 'P2');
  const forceClosedPeriodId = await createVerificationPeriod(ranges.third, 'FORCE-CLOSED', true);

  const forceClosedPeriod = await getPeriod(forceClosedPeriodId);
  assert(Number(forceClosedPeriod.is_closed) === 0, '新增会计期间不能绕过结账流程直接创建为已关闭', forceClosedPeriod);

  let sequentialCloseBlocked = false;
  try {
    await PeriodEndService.closePeriod({
      period_id: secondPeriodId,
      closed_by: userId,
      closing_date: ranges.second.end,
    });
  } catch (error) {
    sequentialCloseBlocked = /前序|prior|sequence|顺序/i.test(error.message || '');
  }
  assert(sequentialCloseBlocked, '后续期间不应允许在前序期间未关闭时先关闭');

  const draftEntryNumber = `AUD-DRAFT-${stamp}`;
  const [draftEntry] = await db.pool.execute(
    `INSERT INTO gl_entries
      (entry_number, entry_date, posting_date, document_type, document_number, period_id, description, is_posted, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'draft', ?)`,
    [
      draftEntryNumber,
      ranges.first.start,
      ranges.first.start,
      DOCUMENT_TYPE_MAPPING.MANUAL_ADJUSTMENT,
      `AUD-DRAFT-${stamp}`,
      secondPeriodId,
      'period integrity verification',
      userId,
    ]
  );

  let unpostedDateGuardBlocked = false;
  try {
    await PeriodEndService.closePeriod({
      period_id: firstPeriodId,
      closed_by: userId,
      closing_date: ranges.first.end,
    });
  } catch (error) {
    unpostedDateGuardBlocked = /未过账|unposted/i.test(error.message || '');
  }
  assert(unpostedDateGuardBlocked, '日期落在期间内但期间归属异常的未过账凭证应阻止关账');
  await db.pool.execute('DELETE FROM gl_entries WHERE id = ?', [draftEntry.insertId]);

  const saleEntryId = await financeModel.createEntry(
    {
      entry_date: ranges.first.start,
      posting_date: ranges.first.start,
      period_id: firstPeriodId,
      document_type: DOCUMENT_TYPE_MAPPING.BANK_DEPOSIT,
      document_number: `AUD-PER-SALE-${stamp}`,
      description: 'period close sale verification',
      created_by: userId,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: bankAccountAccountId,
        debit_amount: 1000,
        credit_amount: 0,
        description: 'period close sale debit',
      },
      {
        account_id: revenueAccountId,
        debit_amount: 0,
        credit_amount: 1000,
        description: 'period close sale credit',
      },
    ]
  );

  const expenseEntryId = await financeModel.createEntry(
    {
      entry_date: ranges.first.end,
      posting_date: ranges.first.end,
      period_id: firstPeriodId,
      document_type: DOCUMENT_TYPE_MAPPING.BANK_WITHDRAWAL,
      document_number: `AUD-PER-EXP-${stamp}`,
      description: 'period close expense verification',
      created_by: userId,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: expenseAccountId,
        debit_amount: 400,
        credit_amount: 0,
        description: 'period close expense debit',
      },
      {
        account_id: bankAccountAccountId,
        debit_amount: 0,
        credit_amount: 400,
        description: 'period close expense credit',
      },
    ]
  );

  await assertPostedBalancedEntry(saleEntryId, '期间关闭收入凭证');
  await assertPostedBalancedEntry(expenseEntryId, '期间关闭费用凭证');

  const preview = await PeriodEndService.getClosingPreview(firstPeriodId);
  assert(preview.canClose, '期间关闭预览应允许关闭', preview.checks);
  assert(preview.unpostedCount === 0, '期间关闭预览未过账数量应为0', preview);

  const closeResponse = await invokeController(financeController.closePeriod, {
    params: { id: firstPeriodId },
    userId,
  });
  assert(closeResponse.statusCode === 200 && closeResponse.body?.success, '关闭期间接口应成功', closeResponse);
  const closeResult = closeResponse.body.data;
  assert(closeResult.transferResult?.entryId, '关闭期间应生成损益结转凭证', closeResult);
  await assertPostedBalancedEntry(closeResult.transferResult.entryId, '期间损益结转');

  let firstPeriod = await getPeriod(firstPeriodId);
  assert(Number(firstPeriod.is_closed) === 1, '关闭后期间状态应为已关闭', firstPeriod);
  assert(firstPeriod.closed_at, '关闭后应写入closed_at', firstPeriod);
  assert(firstPeriod.closing_date, '关闭后应写入closing_date', firstPeriod);

  const balanceRows = await queryOne(
    'SELECT COUNT(*) AS count FROM gl_period_balances WHERE period_id = ?',
    [firstPeriodId]
  );
  assert(Number(balanceRows?.count || 0) > 0, '关闭后应生成期末余额快照');

  assertMoney(
    await getPnlBalance(firstPeriodId, revenueAccountId, 'item.credit_amount - item.debit_amount'),
    0,
    '收入科目关闭后本期余额应结平'
  );
  assertMoney(
    await getPnlBalance(firstPeriodId, expenseAccountId, 'item.debit_amount - item.credit_amount'),
    0,
    '费用科目关闭后本期余额应结平'
  );

  let closedPeriodEntryBlocked = false;
  try {
    await financeModel.createEntry(
      {
        entry_date: ranges.first.start,
        posting_date: ranges.first.start,
        period_id: firstPeriodId,
        document_type: DOCUMENT_TYPE_MAPPING.MANUAL_ADJUSTMENT,
        document_number: `AUD-CLOSED-BLOCK-${stamp}`,
        description: 'closed period entry guard',
        created_by: userId,
        status: 'posted',
        is_posted: 1,
      },
      [
        {
          account_id: bankAccountAccountId,
          debit_amount: 1,
          credit_amount: 0,
          description: 'closed period guard debit',
        },
        {
          account_id: revenueAccountId,
          debit_amount: 0,
          credit_amount: 1,
          description: 'closed period guard credit',
        },
      ]
    );
  } catch (error) {
    closedPeriodEntryBlocked = /关闭|closed/i.test(error.message || '');
  }
  assert(closedPeriodEntryBlocked, '已关闭期间不应允许继续创建已过账凭证');

  await PeriodEndService.closePeriod({
    period_id: secondPeriodId,
    closed_by: userId,
    closing_date: ranges.second.end,
  });
  let secondPeriod = await getPeriod(secondPeriodId);
  assert(Number(secondPeriod.is_closed) === 1, '前序期间关闭后后续期间应可关闭', secondPeriod);

  let reopenBlocked = false;
  try {
    await PeriodEndService.reopenPeriod({
      period_id: firstPeriodId,
      reopened_by: userId,
    });
  } catch (error) {
    reopenBlocked = /后续|later/i.test(error.message || '');
  }
  assert(reopenBlocked, '存在已关闭后续期间时不应允许重开前序期间');

  await PeriodEndService.reopenPeriod({
    period_id: secondPeriodId,
    reopened_by: userId,
  });
  secondPeriod = await getPeriod(secondPeriodId);
  assert(Number(secondPeriod.is_closed) === 0, '后续期间重开后状态应为未关闭', secondPeriod);

  const reopenResponse = await invokeController(financeController.reopenPeriod, {
    params: { id: firstPeriodId },
    userId,
  });
  assert(reopenResponse.statusCode === 200 && reopenResponse.body?.success, '重新开启期间接口应成功', reopenResponse);
  firstPeriod = await getPeriod(firstPeriodId);
  assert(Number(firstPeriod.is_closed) === 0, '重开后期间状态应为未关闭', firstPeriod);
  assert(!firstPeriod.closed_at, '重开后应清空closed_at', firstPeriod);
  assert(!firstPeriod.closing_date, '重开后应清空closing_date', firstPeriod);

  const closingEntryAfterReopen = await queryOne('SELECT id FROM gl_entries WHERE id = ?', [
    closeResult.transferResult.entryId,
  ]);
  assert(!closingEntryAfterReopen, '重开后应删除本期损益结转凭证');

  const balanceAfterReopen = await queryOne(
    'SELECT COUNT(*) AS count FROM gl_period_balances WHERE period_id = ?',
    [firstPeriodId]
  );
  assert(Number(balanceAfterReopen?.count || 0) === 0, '重开后应删除期末余额快照');

  const reopenedEntryId = await financeModel.createEntry(
    {
      entry_date: ranges.first.start,
      posting_date: ranges.first.start,
      period_id: firstPeriodId,
      document_type: DOCUMENT_TYPE_MAPPING.MANUAL_ADJUSTMENT,
      document_number: `AUD-REOPENED-${stamp}`,
      description: 'reopened period entry verification',
      created_by: userId,
      status: 'posted',
      is_posted: 1,
    },
    [
      {
        account_id: bankAccountAccountId,
        debit_amount: 2,
        credit_amount: 0,
        description: 'reopened period debit',
      },
      {
        account_id: revenueAccountId,
        debit_amount: 0,
        credit_amount: 2,
        description: 'reopened period credit',
      },
    ]
  );
  await assertPostedBalancedEntry(reopenedEntryId, '重开后新增凭证');

  mark('会计期间关闭-损益结转-余额快照-后续期间限制-重新开启闭环', {
    firstPeriodId,
    secondPeriodId,
    forceClosedPeriodId,
    closingEntryId: closeResult.transferResult.entryId,
    reopenedEntryId,
  });
}

async function main() {
  const userId = await ensureUser();
  const bankAccountAccountId = await ensureAccount({
    code: '1002',
    name: '银行存款',
    accountType: '资产',
    englishType: 'asset',
    isDebit: true,
  });
  const expenseAccountId = await ensureAccount({
    code: '6602',
    name: '管理费用',
    accountType: '费用',
    englishType: 'expense',
    isDebit: true,
  });
  const revenueAccountId = await ensureAccount({
    code: '6001',
    name: '主营业务收入',
    accountType: '收入',
    englishType: 'revenue',
    isDebit: false,
  });
  await ensureAccount({
    code: '3103',
    name: '本年利润',
    accountType: '权益',
    englishType: 'equity',
    isDebit: false,
  });
  const taxPayableAccountId = await ensureAccount({
    code: '2221',
    name: '应交税费',
    accountType: '负债',
    englishType: 'liability',
    isDebit: false,
  });

  await ensureTaxConfig('BANK_DEPOSITS', '银行存款', bankAccountAccountId);
  await ensureTaxConfig('VAT_PAYABLE', '应交增值税', taxPayableAccountId);
  await ensureOpenPeriod(today);

  const categoryId = await ensureExpenseCategory('6602');
  const bankAccountId = await createAuditBankAccount(userId);

  await verifyBankAccountOperations({ userId, bankAccountId });
  await verifyExpenseLifecycle({ userId, bankAccountId, categoryId });
  await verifyManualBankTransaction({ userId, bankAccountId });
  await verifyTaxPayment({ userId, bankAccountId });
  await verifyBudgetWorkflow({ userId, expenseAccountId });
  await verifyScheduledTasks();
  await verifyPeriodCloseReopenWorkflow({
    userId,
    bankAccountAccountId,
    revenueAccountId,
    expenseAccountId,
  });

  console.log(`\nFINANCE_CLOSURE_VERIFICATION_PASSED ${results.length} checks`);
}

main()
  .catch((error) => {
    console.error('\nFINANCE_CLOSURE_VERIFICATION_FAILED');
    console.error(error.message);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      ScheduledTaskService.stopAllTasks();
      if (db.pool && typeof db.pool.end === 'function') {
        await db.pool.end();
      }
    } catch (error) {
      console.error(`Cleanup warning: ${error.message}`);
    } finally {
      process.exit(process.exitCode || 0);
    }
  });
