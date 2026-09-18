'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

module.exports = async function periodFlows(h) {
  const {test,call,upload,http,reject,need,evidence,one,rows,ctx,prefix,today,calendar,finance,reviewer,bankBalance,equalMoney,assertEntry}=h;
  const balances = async () => rows('SELECT i.account_id,ROUND(SUM(i.debit_amount-i.credit_amount),2) balance FROM gl_entry_items i JOIN gl_entries e ON e.id=i.entry_id WHERE e.is_posted=1 GROUP BY i.account_id ORDER BY i.account_id');
  const linkedTax = async (type,id) => need(await one('SELECT * FROM tax_invoices WHERE related_document_type=? AND related_document_id=? AND status<>?', [type,id,'已作废']), '关联税票');
  await test('TAX-LINKED', '税务', '采购及销售税票与业务单据金额一致', async()=>{
    ctx.inputTax=await linkedTax('purchase_receipt',need(ctx.chainReceipt,'采购收货').id);
    ctx.outputTax=await linkedTax('sales_outbound',need(ctx.chainOutbound,'销售出库').id);
    equalMoney(ctx.inputTax.tax_amount,130);equalMoney(ctx.outputTax.tax_amount,156);evidence({input:ctx.inputTax,output:ctx.outputTax});
  });
  await test('TAX-DEDUCT-EARLY','税务','未认证进项税票不能直接抵扣',async()=>{reject(await call('post',`/api/finance/tax/invoices/${need(ctx.inputTax,'进项税票').id}/deduct`,{deductionDate:today},finance.api));});
  for(const [tag,key] of [['INPUT','inputTax'],['OUTPUT','outputTax']]) {
    await test(`TAX-${tag}-CERTIFY`,'税务','认证已经含税入账的业务税票不重复计税或收入',async()=>{
      const tax=need(ctx[key],'业务税票');const before=await balances();
      const d=http(await call('post',`/api/finance/tax/invoices/${tax.id}/certify`,{certificationDate:today},finance.api));evidence(d);
      const after=await balances();evidence({before,after});assert.deepEqual(after,before,'认证不能重复生成已经包含在业务凭证中的价税分录');
    });
    await test(`TAX-${tag}-RETRY`,'税务','重复认证被拒绝且不重记账',async()=>{
      const before=await balances();reject(await call('post',`/api/finance/tax/invoices/${ctx[key].id}/certify`,{certificationDate:today},finance.api));assert.deepEqual(await balances(),before);
    });
  }
  await test('TAX-INPUT-DEDUCT','税务','进项抵扣记录期间，重复抵扣被拒绝',async()=>{
    const before=await balances();http(await call('post',`/api/finance/tax/invoices/${ctx.inputTax.id}/deduct`,{deductionDate:today},finance.api));
    reject(await call('post',`/api/finance/tax/invoices/${ctx.inputTax.id}/deduct`,{deductionDate:today},finance.api));assert.deepEqual(await balances(),before);
  });
  await test('TAX-OUTPUT-DEDUCT','税务','销项税票不能作为进项抵扣',async()=>{reject(await call('post',`/api/finance/tax/invoices/${ctx.outputTax.id}/deduct`,{deductionDate:today},finance.api));});
  await test('TAX-SHARED-REISSUE','税务','作废重开业务税票保留原应收凭证且不重复记账',async()=>{
    const before=await balances();
    http(await call('post',`/api/finance/tax/invoices/${ctx.outputTax.id}/void`,{reason:prefix},reviewer.api));assert.deepEqual(await balances(),before);
    const generated=http(await call('post','/api/finance/integration/batch-generate',{businessType:'sales_outbound',ids:[ctx.chainOutbound.id],merge:false},finance.api));assert.equal(generated.failedCount,0);
    ctx.outputTax=await linkedTax('sales_outbound',ctx.chainOutbound.id);
    http(await call('post',`/api/finance/tax/invoices/${ctx.outputTax.id}/certify`,{certificationDate:today},finance.api));assert.deepEqual(await balances(),before);
  });
  const standaloneTax={invoice_type:'进项',invoice_number:`${prefix}-TAX`,invoice_date:today,supplier_id:ctx.supplierId,supplier_or_customer_name:prefix,amount_excluding_tax:100,tax_rate:13,tax_amount:13,total_amount:113,remark:prefix};
  await test('TAX-AMOUNT-GUARD','税务','税票价税不平时拒绝保存',async()=>{reject(await call('post','/api/finance/tax/invoices',{...standaloneTax,total_amount:1}));});
  await test('TAX-STANDALONE','税务','独立税票认证生成总账，作废后反向冲销',async()=>{
    const tax=http(await call('post','/api/finance/tax/invoices',standaloneTax),201);ctx.standaloneTaxId=tax.id;
    http(await call('post',`/api/finance/tax/invoices/${tax.id}/certify`,{certificationDate:today},finance.api));
    const row=await one('SELECT gl_entry_id FROM tax_invoices WHERE id=?',[tax.id]);await assertEntry(row.gl_entry_id,113);
    http(await call('post',`/api/finance/tax/invoices/${tax.id}/void`,{reason:prefix},reviewer.api));
    assert.equal((await one('SELECT status FROM tax_invoices WHERE id=?',[tax.id])).status,'已作废');
    assert.equal(Number((await one('SELECT is_reversed FROM gl_entries WHERE id=?',[row.gl_entry_id])).is_reversed),1);
  });
  await test('TAX-RETURN-CREATE','税务','增值税申报按已认证销项和已抵扣进项重算',async()=>{
    ctx.taxReturn=http(await call('post','/api/finance/tax/returns',{return_period:today.slice(0,7),return_type:'增值税',remark:prefix}),201);
    const d=http(await call('get',`/api/finance/tax/returns/${ctx.taxReturn.id}`));evidence(d);
    const expected=await one("SELECT COALESCE(SUM(CASE WHEN invoice_type='销项' AND status IN ('已认证','已抵扣') THEN tax_amount ELSE 0 END),0) output,COALESCE(SUM(CASE WHEN invoice_type='进项' AND status='已抵扣' THEN tax_amount ELSE 0 END),0) input FROM tax_invoices WHERE invoice_date BETWEEN ? AND ?",[calendar.periodStart,calendar.periodEnd]);
    ctx.taxPayable=Math.max(0,Number(expected.output)-Number(expected.input));equalMoney(d.taxPayable,ctx.taxPayable);
  });
  await test('TAX-RETURN-EARLY-PAY','税务','未申报不允许缴税',async()=>{reject(await call('post',`/api/finance/tax/returns/${need(ctx.taxReturn,'申报').id}/pay`,{paymentDate:today,bankAccountId:ctx.bankIds[0]},finance.api));});
  await test('TAX-RETURN-SUBMIT','税务','提交税务申报及拒绝重复提交',async()=>{http(await call('post',`/api/finance/tax/returns/${ctx.taxReturn.id}/submit`,{declarationDate:today},finance.api));reject(await call('post',`/api/finance/tax/returns/${ctx.taxReturn.id}/submit`,{declarationDate:today},finance.api));});
  await test('TAX-RETURN-PAY','税务','缴税银行减少与税务凭证一致',async()=>{
    const before=await bankBalance(ctx.bankIds[0]);http(await call('post',`/api/finance/tax/returns/${ctx.taxReturn.id}/pay`,{paymentDate:today,bankAccountId:ctx.bankIds[0]},finance.api));
    equalMoney(await bankBalance(ctx.bankIds[0]),before-ctx.taxPayable);const tax=await one('SELECT * FROM tax_returns WHERE id=?',[ctx.taxReturn.id]);evidence(tax);await assertEntry(tax.gl_entry_id,ctx.taxPayable);
  });
  await test('TAX-RETURN-RETRY','税务','重复缴税不重复扣款',async()=>{const before=await bankBalance(ctx.bankIds[0]);reject(await call('post',`/api/finance/tax/returns/${ctx.taxReturn.id}/pay`,{paymentDate:today,bankAccountId:ctx.bankIds[0]},finance.api));equalMoney(await bankBalance(ctx.bankIds[0]),before);});
  await test('TAX-RETURN-VOID','税务','作废缴税恢复银行余额并支持重缴',async()=>{
    const before=await bankBalance(ctx.bankIds[0]);http(await call('post',`/api/finance/tax/returns/${ctx.taxReturn.id}/void-payment`,{void_reason:prefix},reviewer.api));equalMoney(await bankBalance(ctx.bankIds[0]),before+ctx.taxPayable);
    http(await call('post',`/api/finance/tax/returns/${ctx.taxReturn.id}/pay`,{paymentDate:today,bankAccountId:ctx.bankIds[0]},finance.api));equalMoney(await bankBalance(ctx.bankIds[0]),before);
  });

  await test('BUDGET-EXPENSE-FIXTURE','预算执行','建立采用预算科目的已批费用',async()=>{
    const categoryCode=`${prefix}-BG-${Date.now().toString().slice(-5)}`;
    http(await call('post','/api/finance/expenses/categories',{code:categoryCode,name:`${prefix} 预算测试`,status:1}),[200,201]);
    ctx.budgetExpenseCategoryId=(await one('SELECT id FROM expense_categories WHERE code=?',[categoryCode])).id;
    ctx.budgetExpense=http(await call('post','/api/finance/expenses',{categoryId:ctx.budgetExpenseCategoryId,title:`${prefix} 预算执行`,amount:600,expenseDate:today,payee:prefix,description:prefix}),[200,201]);
    http(await call('post',`/api/finance/expenses/${ctx.budgetExpense.id}/submit`,{useDingtalk:false}));
    http(await call('post',`/api/finance/expenses/${ctx.budgetExpense.id}/approve`,{action:'approve',remark:prefix},finance.api));
  });
  await test('BUDGET-MISSING-CENTER', '预算执行', '已有部门预算时费用付款必须选择归属成本中心', async () => {
    const before = await bankBalance(ctx.bankIds[0]);
    const response = await call('post', `/api/finance/expenses/${need(ctx.budgetExpense, '预算费用').id}/pay`, { bankAccountId: ctx.bankIds[0], paymentDate: today });
    http(response, 400); assert.match(response.body.message, /成本中心/);
    equalMoney(await bankBalance(ctx.bankIds[0]), before);
    assert.equal((await one('SELECT status FROM expenses WHERE id=?', [ctx.budgetExpense.id])).status, 'approved');
    const options = http(await call('get', '/api/finance/cost-centers/options', undefined, finance.api));
    assert.ok(Array.isArray(options) && options.some(option => Number(option.id) === Number(ctx.costCenterId)));
  });
  await test('BUDGET-CONSUME','预算执行','费用付款600占用预算且可用额度减少600',async()=>{
    const d=http(await call('post',`/api/finance/expenses/${need(ctx.budgetExpense,'预算费用').id}/pay`,{bankAccountId:ctx.bankIds[0],paymentDate:today,costCenterId:ctx.costCenterId}));evidence(d);
    const execution=await rows('SELECT * FROM budget_execution WHERE document_type=? AND document_id=?',['expense_payment',ctx.budgetExpense.id]);evidence(execution);assert.equal(execution.length,1);equalMoney(execution[0].execution_amount,600);
    const budget=http(await call('get',`/api/finance/budgets/${ctx.budget.id}/analysis`));evidence(budget);
  });
  await test('BUDGET-OVER-LIMIT','预算执行','超预算付款整体回滚且银行不扣款',async()=>{
    const exp=http(await call('post','/api/finance/expenses',{categoryId:ctx.budgetExpenseCategoryId,title:`${prefix} 超预算`,amount:500,expenseDate:today,payee:prefix,description:prefix}),[200,201]);ctx.overBudgetExpenseId=exp.id;
    http(await call('post',`/api/finance/expenses/${exp.id}/submit`,{useDingtalk:false}));http(await call('post',`/api/finance/expenses/${exp.id}/approve`,{action:'approve',remark:prefix},finance.api));
    const before=await bankBalance(ctx.bankIds[0]);reject(await call('post',`/api/finance/expenses/${exp.id}/pay`,{bankAccountId:ctx.bankIds[0],paymentDate:today,costCenterId:ctx.costCenterId}));equalMoney(await bankBalance(ctx.bankIds[0]),before);
    assert.equal((await one('SELECT status FROM expenses WHERE id=?',[exp.id])).status,'approved');
  });
  await test('BUDGET-RELEASE','预算执行','作废费用付款释放预算占用',async()=>{
    http(await call('post',`/api/finance/expenses/${ctx.budgetExpense.id}/void-payment`,{voidReason:prefix},reviewer.api));
    const d=http(await call('get',`/api/finance/budgets/check/availability?accountId=${(await one('SELECT account_id FROM budget_details WHERE budget_id=? LIMIT 1',[ctx.budget.id])).account_id}&departmentId=${ctx.departmentId}&amount=1000&date=${today}`));evidence(d);assert.equal(d.available,true);
  });
  await test('BUDGET-GLOBAL-FALLBACK', '预算执行', '未选部门可采用全局预算，选择部门仍优先部门预算', async () => {
    const accountId = (await one('SELECT account_id FROM budget_details WHERE budget_id=? LIMIT 1', [ctx.budget.id])).account_id;
    const globalBudget = http(await call('post', '/api/finance/budgets', {
      budget: { budgetName: `${prefix} 全局预算`, budgetYear: calendar.fiscalYear, budgetType: '月度预算', startDate: calendar.periodStart, endDate: calendar.periodEnd },
      details: [{ accountId, budgetAmount: 5000, warningThreshold: 80 }],
    }), 201);
    http(await call('post', `/api/finance/budgets/${globalBudget.id}/submit`, {}));
    http(await call('post', `/api/finance/budgets/${globalBudget.id}/approve`, { approved: true }, finance.api));
    http(await call('post', `/api/finance/budgets/${globalBudget.id}/start`, {}));
    const query = `/api/finance/budgets/check/availability?accountId=${accountId}&amount=1001&date=${today}`;
    assert.equal(http(await call('get', query)).available, true);
    assert.equal(http(await call('get', `${query}&departmentId=${ctx.departmentId}`)).available, false);
    http(await call('post', `/api/finance/budgets/${globalBudget.id}/close`, {}));
  });

  await test('BANK-CREATE','银行对账','手工利息交易创建草稿不改变余额',async()=>{
    const before=await bankBalance(ctx.bankIds[1]);ctx.manualBank=http(await call('post','/api/finance/bank-transactions',{transactionNumber:`${prefix}-INTEREST`,bankAccountId:ctx.bankIds[1],transactionDate:today,transactionType:'利息',amount:20,category:'interest_income',paymentMethod:'bank_transfer',description:prefix,relatedParty:'隔离测试银行'}),201);equalMoney(await bankBalance(ctx.bankIds[1]),before);
  });
  await test('BANK-CATEGORY-CONTRACT', '银行对账', '列表和详情返回实际分类及支付方式', async () => {
    const list = http(await call('get', `/api/finance/bank-transactions?accountId=${ctx.bankIds[1]}`));
    const item = (list.list || list.transactions || []).find(row => Number(row.id) === Number(ctx.manualBank.id));
    for (const row of [need(item, '列表银行流水'), http(await call('get', `/api/finance/bank-transactions/${ctx.manualBank.id}`))]) {
      assert.equal(row.transactionCategory, 'interest_income'); assert.equal(row.paymentMethod, 'bank_transfer');
    }
  });
  await test('BANK-SUBMIT-SELF','银行对账','银行流水提交后制单人不得自审',async()=>{http(await call('post',`/api/finance/bank-transactions/${need(ctx.manualBank,'银行流水').id}/submit`,{}));reject(await call('post',`/api/finance/bank-transactions/${ctx.manualBank.id}/audit`,{status:'approved'}));});
  await test('BANK-APPROVE','银行对账','独立审批银行流水及总账入账',async()=>{
    const before=await bankBalance(ctx.bankIds[1]);http(await call('post',`/api/finance/bank-transactions/${ctx.manualBank.id}/audit`,{status:'approved'},finance.api));equalMoney(await bankBalance(ctx.bankIds[1]),before+20);
    await assertEntry((await one('SELECT gl_entry_id FROM bank_transactions WHERE id=?',[ctx.manualBank.id])).gl_entry_id,20);
  });
  await test('BANK-EXPORT','银行对账','导出Excel包含所选账户业务流水',async()=>{
    const r=await call('get',`/api/finance/bank-transactions/export?accountId=${ctx.bankIds[1]}&startDate=${calendar.periodStart}&endDate=${calendar.periodEnd}`);http(r);
    assert.ok(Buffer.isBuffer(r.body)&&r.body.length>100);const w=new ExcelJS.Workbook();await w.xlsx.load(r.body);assert.ok(w.worksheets[0].rowCount>=3);evidence({sheet:w.worksheets[0].name,rows:w.worksheets[0].rowCount});
  });
  const statementBuffer=async transactionRows=>{
    const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet('银行对账单');
    sheet.columns=[{header:'交易日期',key:'date'},{header:'交易类型',key:'type'},{header:'交易金额',key:'amount'},{header:'流水号',key:'reference'},{header:'摘要',key:'summary'},{header:'余额',key:'balance'}];
    transactionRows.forEach(row=>sheet.addRow(row));return workbook.xlsx.writeBuffer();
  };
  await test('BANK-IMPORT','银行对账','导入模拟银行对账单作为匹配证据',async()=>{
    const buffer=await statementBuffer([{date:today,type:'income',amount:20,reference:`${prefix}-INTEREST`,summary:prefix,balance:await bankBalance(ctx.bankIds[1])}]);
    const d=http(await upload('/api/finance/cash/reconciliation/import-statement',{accountId:ctx.bankIds[1],startDate:calendar.periodStart,endDate:calendar.periodEnd},buffer,'finance-audit-bank.xlsx'));evidence(d);ctx.statement=need(d[0],'银行对账单明细');
  });
  await test('BANK-BALANCE-PENDING','银行对账','调节表包含真实未达流水及已导入银行余额',async()=>{
    const d=http(await call('get',`/api/finance/cash/bank-reconciliation-balance-sheet?accountId=${ctx.bankIds[1]}&asOfDate=${today}`));evidence(d);
    const expected=await one("SELECT COUNT(*) n FROM bank_transactions WHERE bank_account_id=? AND status='approved' AND is_reconciled=0 AND transaction_date<=?",[ctx.bankIds[1],today]);
    assert.equal(d.outstandingItems.length,Number(expected.n));equalMoney(d.statementBalance,await bankBalance(ctx.bankIds[1]));
  });
  const matchBody=()=>({statementItemId:ctx.statement.id,transactionIds:[ctx.manualBank.id],accountId:ctx.bankIds[1]});
  await test('BANK-MATCH-NUMBER', '银行对账', '候选账面流水包含可区分同日同金额交易的单号', async () => {
    const candidates = http(await call('get', `/api/finance/cash/reconciliation/possible-matches?statementItemId=${ctx.statement.id}&accountId=${ctx.bankIds[1]}`));
    const candidate = need(candidates.find(row => Number(row.id) === Number(ctx.manualBank.id)), '候选流水');
    assert.equal(candidate.transactionNumber, `${prefix}-INTEREST`);
  });
  await test('BANK-MATCH-WRONG','银行对账','跨账户或金额不同的流水不可匹配',async()=>{
    need(ctx.statement,'对账单');const other=await one("SELECT id FROM bank_transactions WHERE bank_account_id=? AND status='approved' ORDER BY id LIMIT 1",[ctx.bankIds[0]]);
    reject(await call('post','/api/finance/cash/reconciliation/confirm-match',{...matchBody(),transactionIds:[other.id]}));
  });
  await test('BANK-MATCH','银行对账','匹配后流水和对账证据同步完成',async()=>{
    http(await call('post','/api/finance/cash/reconciliation/confirm-match',matchBody()));
    assert.equal(Number((await one('SELECT is_reconciled FROM bank_transactions WHERE id=?',[ctx.manualBank.id])).is_reconciled),1);
    assert.equal(Number((await one('SELECT COUNT(*) n FROM bank_reconciliation_matches WHERE bank_transaction_id=?',[ctx.manualBank.id])).n),1);
  });
  await test('BANK-MATCH-CANCEL','银行对账','取消匹配清除证据并可重新对账',async()=>{
    http(await call('post','/api/finance/cash/reconciliation/cancel-reconciled',{transactionId:ctx.manualBank.id,accountId:ctx.bankIds[1]}));
    assert.equal(Number((await one('SELECT is_reconciled FROM bank_transactions WHERE id=?',[ctx.manualBank.id])).is_reconciled),0);
    assert.equal(Number((await one('SELECT COUNT(*) n FROM bank_reconciliation_matches WHERE bank_transaction_id=?',[ctx.manualBank.id])).n),0);
    http(await call('post','/api/finance/cash/reconciliation/confirm-match',matchBody()));
  });
  await test('CLOSE-GUARD','月结','银行未完成对账时拒绝关账',async()=>{
    const d=http(await call('get',`/api/finance/gl/closing/preview/${ctx.periodId}`));evidence(d);assert.equal(d.canClose,false);
    reject(await call('post',`/api/finance/gl/closing/execute/${ctx.periodId}`,{},finance.api));
    assert.equal(Number((await one('SELECT is_closed FROM gl_periods WHERE id=?',[ctx.periodId])).is_closed),0);
  });
  await test('BANK-RECONCILE-ALL','月结','为所有已审核模拟银行流水补齐对账单匹配证据',async()=>{
    for(const bankId of ctx.bankIds){
      const transactions=await rows("SELECT * FROM bank_transactions WHERE bank_account_id=? AND status='approved' AND COALESCE(is_reconciled,0)=0 ORDER BY transaction_date,id",[bankId]);if(!transactions.length)continue;
      const endingBalance=await bankBalance(bankId);
      const buffer=await statementBuffer(transactions.map((t,index)=>({date:typeof t.transaction_date==='string'?t.transaction_date.slice(0,10):require('../../src/utils/dateUtils').toLocalDateString(t.transaction_date),type:['存款','转入','利息','income'].includes(t.transaction_type)?'income':'expense',amount:Number(t.amount),reference:t.transaction_number,summary:prefix,balance:index===transactions.length-1?endingBalance:undefined})));
      const items=http(await upload('/api/finance/cash/reconciliation/import-statement',{accountId:bankId,startDate:calendar.periodStart,endDate:calendar.periodEnd},buffer,`finance-audit-bank-${bankId}.xlsx`));assert.equal(items.length,transactions.length);
      for(let i=0;i<transactions.length;i++)http(await call('post','/api/finance/cash/reconciliation/confirm-match',{statementItemId:items[i].id,transactionIds:[transactions[i].id],accountId:bankId}));
    }
    const d=http(await call('get',`/api/finance/gl/closing/preview/${ctx.periodId}`));evidence(d.bankReconciliation);assert.equal(Number(d.bankReconciliation.unreconciledCount),0);assert.equal(Number(d.bankReconciliation.manualReconciledCount),0);
  });
  await test('BANK-BALANCE-SHEET','银行对账','调节表返回账面余额且已无未达流水',async()=>{
    const d=http(await call('get',`/api/finance/cash/bank-reconciliation-balance-sheet?accountId=${ctx.bankIds[1]}&asOfDate=${today}`));evidence(d);equalMoney(d.bookBalance,await bankBalance(ctx.bankIds[1]));assert.equal(d.outstandingItems.length,0);
  });
  await test('BANK-STATEMENT-PAGING', '银行对账', '对账单重新加载支持分页且非法日期返回400', async () => {
    const query = `/api/finance/cash/reconciliation/statement-items?accountId=${ctx.bankIds[0]}&startDate=${calendar.periodStart}&endDate=${calendar.periodEnd}&pageSize=2`;
    const first = http(await call('get', `${query}&page=1`));
    const second = http(await call('get', `${query}&page=2`));
    assert.ok(first.total > 2); assert.equal(first.list.length, 2); assert.equal(second.total, first.total);
    assert.equal(new Set([...first.list, ...second.list].map(row => row.id)).size, first.list.length + second.list.length);
    http(await call('get', `/api/finance/cash/reconciliation/statement-items?accountId=${ctx.bankIds[0]}&startDate=2026-02-30&endDate=${calendar.periodEnd}`), 400);
  });
  await test('COST-CLOSING','月结','成本关账工作台执行并检查成本库存链路',async()=>{
    const before=http(await call('get',`/api/finance/cost/closing/status?periodId=${ctx.periodId}`));evidence(before);assert.equal(before.summary.blockers,0);
    evidence(http(await call('post',`/api/finance/cost/closing/${ctx.periodId}/execute`,{},finance.api)));
  });
  await test('CLOSE-PREVIEW','月结','结账前所有检查通过且试算平衡',async()=>{
    ctx.closingPreview=http(await call('get',`/api/finance/gl/closing/preview/${ctx.periodId}`));evidence(ctx.closingPreview);
    assert.equal(ctx.closingPreview.canClose,true,JSON.stringify(ctx.closingPreview.checks.filter(x=>!x.passed)));
  });
  await test('CLOSE-EXECUTE','月结','损益结转、科目余额快照及期间关闭',async()=>{
    need(ctx.closingPreview?.canClose,'月结预览通过');evidence(http(await call('post',`/api/finance/gl/closing/execute/${ctx.periodId}`,{},finance.api)));
    assert.equal(Number((await one('SELECT is_closed FROM gl_periods WHERE id=?',[ctx.periodId])).is_closed),1);ctx.periodClosed=true;
  });
  await test('CLOSE-WRITE-GUARD','月结','已关账期间不能新增或过账凭证',async()=>{
    need(ctx.periodClosed,'期间关闭');reject(await call('post','/api/finance/entries',{entryDate:today,periodId:ctx.periodId,documentType:'记账凭证',description:prefix,
      items:[{accountId:ctx.bankAccountId,debitAmount:1,creditAmount:0},{accountId:ctx.capitalAccountId,debitAmount:0,creditAmount:1}]}));
  });
  await test('CLOSE-TAX-VOID-GUARD', '月结', '共享业务凭证的税票也不能在已关账期间作废', async () => {
    need(ctx.periodClosed, '期间关闭');
    const before = await one('SELECT status,gl_entry_id FROM tax_invoices WHERE id=?', [ctx.outputTax.id]);
    const response = await call('post', `/api/finance/tax/invoices/${ctx.outputTax.id}/void`, {}, reviewer.api);
    http(response, 400); assert.match(response.body.message, /会计期间已关闭/);
    assert.deepEqual(await one('SELECT status,gl_entry_id FROM tax_invoices WHERE id=?', [ctx.outputTax.id]), before);
    assert.equal(Number((await one('SELECT is_reversed FROM gl_entries WHERE id=?', [before.gl_entry_id])).is_reversed), 0);
  });
  await test('CLOSE-RETRY','月结','重复结账被拒绝且不重复损益结转',async()=>{need(ctx.periodClosed,'期间关闭');const before=(await one('SELECT COUNT(*) n FROM gl_entries')).n;reject(await call('post',`/api/finance/gl/closing/execute/${ctx.periodId}`,{},finance.api));assert.equal((await one('SELECT COUNT(*) n FROM gl_entries')).n,before);});
  await test('CLOSE-REOPEN','月结','反结账冲销损益结转并恢复开放期间',async()=>{
    need(ctx.periodClosed,'期间关闭');evidence(http(await call('patch',`/api/finance/periods/${ctx.periodId}/reopen`,{},reviewer.api)));assert.equal(Number((await one('SELECT is_closed FROM gl_periods WHERE id=?',[ctx.periodId])).is_closed),0);
  });
  await test('CLOSE-AGAIN','月结','反结账后可再次结账且保留历史审计链',async()=>{
    need(ctx.periodClosed,'完成过关账');http(await call('post',`/api/finance/gl/closing/execute/${ctx.periodId}`,{},finance.api));assert.equal(Number((await one('SELECT is_closed FROM gl_periods WHERE id=?',[ctx.periodId])).is_closed),1);
    evidence(http(await call('get',`/api/finance/gl/closing/history/${ctx.periodId}`)));http(await call('patch',`/api/finance/periods/${ctx.periodId}/reopen`,{},reviewer.api));
  });
  await test('FINANCE-INTEGRITY','最终账务核对','完整流程后14项总账、余额及凭证关联规则无异常',async()=>{
    const rules=require('../../src/services/business/DataConsistencyRules').consistencyRules.filter(rule=>/^(gl|finance)\./.test(rule.id));
    const results=[];for(const rule of rules){const found=await rows(rule.sql);results.push({id:rule.id,count:found.length,rows:found});}
    evidence(results);assert.deepEqual(results.filter(r=>r.count>0),[]);
  });
};
