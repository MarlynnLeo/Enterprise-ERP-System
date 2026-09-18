'use strict';

const assert=require('node:assert/strict');

module.exports=async function operations(h){
  const {test,call,http,reject,need,evidence,one,rows,ctx,prefix,today,calendar,finance,reviewer,
    bankBalance,equalMoney,assertEntry,createInvoice,confirmInvoice}=h;
  const account=async code=>need(await one('SELECT id,account_code,account_name FROM gl_accounts WHERE account_code=? AND is_active=1',[code]),`会计科目 ${code}`);
  const {accountingConfig}=require('../../src/config/accountingConfig');
  await accountingConfig.loadFromDatabase(require('../../src/config/db'));
  const bank=await account(accountingConfig.getAccountCode('BANK_DEPOSIT'));
  const capital=await account(accountingConfig.getAccountCode('PAID_IN_CAPITAL'));
  const expense=await account(accountingConfig.getAccountCode('ADMIN_EXPENSE'));
  ctx.bankAccountId=bank.id;
  ctx.capitalAccountId=capital.id;
  const entryBody=(amount=100,extra={})=>({entryDate:today,postingDate:today,periodId:ctx.periodId,documentType:'记账凭证',documentNumber:`${prefix}-GL`,description:prefix,
    items:[{accountId:bank.id,debitAmount:amount,creditAmount:0,description:prefix},{accountId:capital.id,debitAmount:0,creditAmount:amount,description:prefix}],...extra});
  await test('GL-UNBALANCED','总账','借贷不平的凭证不能保存',async()=>{const body=entryBody();body.items[1].creditAmount=99;reject(await call('post','/api/finance/entries',body));});
  await test('GL-NEGATIVE','总账','凭证明细拒绝负金额',async()=>{reject(await call('post','/api/finance/entries',entryBody(-1)));});
  await test('GL-CREATE','总账','手工平衡凭证保存为草稿',async()=>{const d=http(await call('post','/api/finance/entries',entryBody()),201);ctx.manualEntryId=need(d.entryId||d.id,'凭证ID');assert.equal(Number((await one('SELECT is_posted FROM gl_entries WHERE id=?',[ctx.manualEntryId])).is_posted),0);});
  await test('GL-SELF-POST','总账','手工制单人不能自行过账',async()=>{reject(await call('patch',`/api/finance/entries/${need(ctx.manualEntryId,'手工凭证')}/post`,{}));});
  await test('GL-POST','总账','独立财务审核后过账',async()=>{http(await call('patch',`/api/finance/entries/${need(ctx.manualEntryId,'手工凭证')}/post`,{},finance.api));await assertEntry(ctx.manualEntryId,100);});
  await test('GL-POST-RETRY','总账','重复过账不重复分录',async()=>{const before=(await one('SELECT COUNT(*) n FROM gl_entry_items WHERE entry_id=?',[ctx.manualEntryId])).n;http(await call('patch',`/api/finance/entries/${ctx.manualEntryId}/post`,{},finance.api),[200,400,409]);assert.equal((await one('SELECT COUNT(*) n FROM gl_entry_items WHERE entry_id=?',[ctx.manualEntryId])).n,before);});
  await test('GL-POSTED-DELETE','总账','已过账凭证不能删除',async()=>{reject(await call('delete',`/api/finance/entries/${ctx.manualEntryId}`));});
  await test('GL-REVERSE','总账','冲销产生等额反向已过账凭证',async()=>{const d=http(await call('post',`/api/finance/entries/${ctx.manualEntryId}/reverse`,{entryDate:today,periodId:ctx.periodId,description:`${prefix} 冲销`},reviewer.api));ctx.manualReversalId=need(d.reversalEntryId,'反向凭证ID');await assertEntry(ctx.manualReversalId,100);const orig=await one('SELECT is_reversed,reversal_entry_id FROM gl_entries WHERE id=?',[ctx.manualEntryId]);assert.equal(Number(orig.is_reversed),1);assert.equal(Number(orig.reversal_entry_id),Number(ctx.manualReversalId));});
  await test('GL-REVERSE-RETRY','总账','已冲销凭证不能再次冲销',async()=>{reject(await call('post',`/api/finance/entries/${ctx.manualEntryId}/reverse`,{entryDate:today,periodId:ctx.periodId,description:prefix},reviewer.api));});
  await test('GL-OPENING-GUARD','总账','已有过账业务后阻止重做期初',async()=>{reject(await call('post','/api/finance/opening-balances/initialize',{asOfDate:calendar.previousPeriodEnd,periodId:ctx.periodId}));});

  await test('PAYMENT-LARGE-INVOICE','付款审批','建立需要独立审批的大额应付',async()=>{ctx.largeAp=await createInvoice('ap',{taxRate:0,items:[{materialId:ctx.materialId,description:prefix,quantity:1,unitPrice:60000}]});await confirmInvoice('ap',ctx.largeAp.id);equalMoney(ctx.largeAp.total_amount,60000);});
  const bigPayment=extra=>({invoiceId:need(ctx.largeAp,'大额应付').id,paymentDate:today,amount:60000,paymentMethod:'银行转账',bankAccountId:ctx.bankIds[0],notes:prefix,...extra});
  await test('PAYMENT-APPROVAL-REQUIRED','付款审批','超过阈值无审批不能付款',async()=>{const before=await bankBalance(ctx.bankIds[0]);reject(await call('post','/api/finance/ap/payments',bigPayment()));equalMoney(await bankBalance(ctx.bankIds[0]),before);});
  await test('PAYMENT-APPROVAL-CREATE','付款审批','申请绑定供应商和应付发票',async()=>{ctx.paymentApproval=http(await call('post','/api/finance/ap/payment-approvals',{approvalNo:`${prefix}-PAY`,amount:60000,supplierId:ctx.supplierId,invoiceIds:[ctx.largeAp.id],remark:prefix}),[200,201]);need(ctx.paymentApproval.id,'付款审批ID');});
  await test('PAYMENT-SELF-APPROVE','付款审批','申请人与审核人分离',async()=>{http(await call('post',`/api/finance/ap/payment-approvals/${need(ctx.paymentApproval,'付款审批').id}/approve`,{remark:prefix}),403);});
  await test('PAYMENT-APPROVE','付款审批','第二位财务审批通过',async()=>{http(await call('post',`/api/finance/ap/payment-approvals/${ctx.paymentApproval.id}/approve`,{remark:prefix},finance.api));});
  await test('PAYMENT-APPROVED-EXECUTE','付款审批','凭有效审批支付并消耗授权',async()=>{const before=await bankBalance(ctx.bankIds[0]);ctx.largePayment=http(await call('post','/api/finance/ap/payments',bigPayment({approvalNo:ctx.paymentApproval.approvalNo})),[200,201]);equalMoney(await bankBalance(ctx.bankIds[0]),before-60000);equalMoney((await one('SELECT balance_amount FROM ap_invoices WHERE id=?',[ctx.largeAp.id])).balance_amount,0);});
  await test('PAYMENT-APPROVAL-REUSE','付款审批','审批授权不能用于另一张发票',async()=>{const other=await createInvoice('ap',{taxRate:0,items:[{materialId:ctx.materialId,description:prefix,quantity:1,unitPrice:60000}]});await confirmInvoice('ap',other.id);reject(await call('post','/api/finance/ap/payments',bigPayment({invoiceId:other.id,approvalNo:ctx.paymentApproval.approvalNo})));});

  const budgetBody={budget:{budgetName:`${prefix} 费用预算`,budgetYear:calendar.fiscalYear,budgetType:'月度预算',startDate:calendar.periodStart,endDate:calendar.periodEnd,description:prefix},
    details:[{accountId:expense.id,departmentId:ctx.departmentId,budgetAmount:1000,warningThreshold:80,description:prefix}]};
  await test('BUDGET-CREATE','预算','预算主表和科目明细保存一致',async()=>{ctx.budget=http(await call('post','/api/finance/budgets',budgetBody),201);const d=http(await call('get',`/api/finance/budgets/${ctx.budget.id}`));evidence(d);assert.ok(d.details.length);equalMoney(d.details[0].budgetAmount,1000);});
  await test('BUDGET-DRAFT-START','预算','未审批预算不得直接执行',async()=>{reject(await call('post',`/api/finance/budgets/${need(ctx.budget,'预算').id}/start`,{}));});
  await test('BUDGET-SUBMIT','预算','预算提交后禁止改金额',async()=>{http(await call('post',`/api/finance/budgets/${ctx.budget.id}/submit`,{}));reject(await call('put',`/api/finance/budgets/${ctx.budget.id}`,budgetBody));});
  await test('BUDGET-SELF-APPROVE', '预算', '制单人不能审批自己的预算', async () => {
    const response = await call('post', `/api/finance/budgets/${ctx.budget.id}/approve`, { approved: true });
    reject(response); assert.match(response.body.message, /分离|不能.*自己/);
    assert.equal((await one('SELECT status FROM budgets WHERE id=?', [ctx.budget.id])).status, '待审批');
  });
  await test('BUDGET-APPROVE-START','预算','独立审核并启动执行',async()=>{http(await call('post',`/api/finance/budgets/${ctx.budget.id}/approve`,{approved:true},finance.api));http(await call('post',`/api/finance/budgets/${ctx.budget.id}/start`,{}));evidence(http(await call('get',`/api/finance/budgets/${ctx.budget.id}`)));});
  await test('BUDGET-ANALYSIS','预算','执行、差异和可用额度接口可用',async()=>{for(const endpoint of ['executions','analysis/execution','analysis/variance','analysis'])http(await call('get',`/api/finance/budgets/${ctx.budget.id}/${endpoint}?startDate=${calendar.periodStart}&endDate=${calendar.periodEnd}&date=${today}`));});

  const expenseBody=(amount=150)=>({categoryId:ctx.expenseCategoryId,title:`${prefix} 办公费用`,amount,expenseDate:today,description:prefix,payee:'隔离测试收款人'});
  await test('EXPENSE-NEGATIVE','费用','负数费用不能创建',async()=>{reject(await call('post','/api/finance/expenses',expenseBody(-1)));});
  await test('EXPENSE-CREATE','费用','新建费用草稿',async()=>{const d=http(await call('post','/api/finance/expenses',expenseBody()),[200,201]);ctx.expenseId=need(d.id,'费用ID');equalMoney((await one('SELECT amount FROM expenses WHERE id=?',[ctx.expenseId])).amount,150);});
  await test('EXPENSE-PAY-EARLY','费用','未审批费用禁止支付',async()=>{reject(await call('post',`/api/finance/expenses/${need(ctx.expenseId,'费用')}/pay`,{bankAccountId:ctx.bankIds[0],paymentDate:today}));});
  await test('EXPENSE-SUBMIT','费用','提交本地审批',async()=>{http(await call('post',`/api/finance/expenses/${ctx.expenseId}/submit`,{useDingtalk:false}));});
  await test('EXPENSE-SELF-APPROVE','费用','费用申请人与审核人分离',async()=>{reject(await call('post',`/api/finance/expenses/${ctx.expenseId}/approve`,{action:'approve',remark:prefix}));});
  await test('EXPENSE-REJECT-RESUBMIT','费用','驳回后修改金额并重新提交',async()=>{http(await call('post',`/api/finance/expenses/${ctx.expenseId}/approve`,{action:'reject',remark:prefix},finance.api));http(await call('put',`/api/finance/expenses/${ctx.expenseId}`,expenseBody(180)));http(await call('post',`/api/finance/expenses/${ctx.expenseId}/submit`,{useDingtalk:false}));http(await call('post',`/api/finance/expenses/${ctx.expenseId}/approve`,{action:'approve',remark:prefix},finance.api));});
  await test('EXPENSE-PAY','费用','付款同步银行流水和费用凭证',async()=>{const before=await bankBalance(ctx.bankIds[0]);http(await call('post',`/api/finance/expenses/${ctx.expenseId}/pay`,{bankAccountId:ctx.bankIds[0],paymentDate:today,costCenterId:ctx.costCenterId}));equalMoney(await bankBalance(ctx.bankIds[0]),before-180);const exp=await one('SELECT * FROM expenses WHERE id=?',[ctx.expenseId]);ctx.expenseNumber=exp.expense_number;const gl=await one('SELECT id FROM gl_entries WHERE document_number=? AND document_type=? ORDER BY id DESC LIMIT 1',[exp.expense_number,'expense']);await assertEntry(need(gl,'费用凭证').id,180);});
  await test('EXPENSE-PAY-RETRY','费用','重复付款返回原单且不重复扣款',async()=>{const before=await bankBalance(ctx.bankIds[0]);const d=http(await call('post',`/api/finance/expenses/${ctx.expenseId}/pay`,{bankAccountId:ctx.bankIds[0],paymentDate:today}));assert.equal(d.reused,true);equalMoney(await bankBalance(ctx.bankIds[0]),before);});
  await test('EXPENSE-VOID','费用','费用作废付款恢复账户余额',async()=>{const before=await bankBalance(ctx.bankIds[0]);http(await call('post',`/api/finance/expenses/${ctx.expenseId}/void-payment`,{voidReason:`${prefix} 撤销测试付款`},reviewer.api));equalMoney(await bankBalance(ctx.bankIds[0]),before+180);});
  await test('EXPENSE-REPAY','费用','付款作废后允许重新付款且原冲销记录保留',async()=>{const before=await bankBalance(ctx.bankIds[0]);http(await call('post',`/api/finance/expenses/${ctx.expenseId}/pay`,{bankAccountId:ctx.bankIds[0],paymentDate:today,costCenterId:ctx.costCenterId}));equalMoney(await bankBalance(ctx.bankIds[0]),before-180);http(await call('post',`/api/finance/expenses/${ctx.expenseId}/void-payment`,{voidReason:prefix},reviewer.api));equalMoney(await bankBalance(ctx.bankIds[0]),before);});

  const cashBody={type:'income',transactionDate:today,amount:50,category:'other_income',counterparty:'隔离测试往来',description:prefix,referenceNumber:prefix};
  await test('CASH-CREATE','现金','现金收支先形成草稿',async()=>{ctx.cash=http(await call('post','/api/finance/cash-transactions',cashBody),201);assert.equal((await one('SELECT status FROM cash_transactions WHERE id=?',[ctx.cash.id])).status,'draft');});
  await test('CASH-SUBMIT','现金','提交现金交易审批',async()=>{http(await call('put',`/api/finance/cash-transactions/${need(ctx.cash,'现金交易').id}/submit`,{}));});
  await test('CASH-SELF-APPROVE','现金','现金制单人与审核人分离',async()=>{reject(await call('put',`/api/finance/cash-transactions/${ctx.cash.id}/approve`,{}));});
  await test('CASH-REJECT-RESUBMIT','现金','驳回后修改并重新提交',async()=>{http(await call('put',`/api/finance/cash-transactions/${ctx.cash.id}/reject`,{reason:prefix},finance.api));http(await call('put',`/api/finance/cash-transactions/${ctx.cash.id}`,{...cashBody,amount:60}));http(await call('put',`/api/finance/cash-transactions/${ctx.cash.id}/submit`,{}));});
  await test('CASH-APPROVE','现金','独立审核生成现金凭证',async()=>{http(await call('put',`/api/finance/cash-transactions/${ctx.cash.id}/approve`,{},finance.api));const cash=await one('SELECT * FROM cash_transactions WHERE id=?',[ctx.cash.id]);assert.equal(cash.status,'approved');ctx.cashEntryId=cash.gl_entry_id;await assertEntry(cash.gl_entry_id,60);});
  await test('CASH-EDIT-APPROVED','现金','已审核现金交易不可直接改金额',async()=>{reject(await call('put',`/api/finance/cash-transactions/${ctx.cash.id}`,{...cashBody,amount:100}));});
  await test('CASH-VOID','现金','作废现金交易冲销总账',async()=>{const result=http(await call('post',`/api/finance/cash-transactions/${ctx.cash.id}/void`,{reason:prefix},reviewer.api));const cash=await one('SELECT status FROM cash_transactions WHERE id=?',[ctx.cash.id]);assert.equal(cash.status,'void');const orig=await one('SELECT is_reversed,reversal_entry_id FROM gl_entries WHERE id=?',[need(ctx.cashEntryId,'原现金凭证')]);assert.equal(Number(orig.is_reversed),1);assert.equal(Number(orig.reversal_entry_id),Number(result.reversalEntryId));await assertEntry(result.reversalEntryId,60);});

  const transferBody={fromAccountId:ctx.bankIds[0],toAccountId:ctx.bankIds[1],amount:250,transactionDate:today,transactionNumber:`${prefix}-TRANSFER`,description:prefix};
  await test('TRANSFER-CREATE','资金调拨','申请调拨尚不改变资金余额',async()=>{const before=await Promise.all(ctx.bankIds.slice(0,2).map(bankBalance));ctx.transfer=http(await call('post','/api/finance/bank-transactions/transfer',transferBody),[200,201]);need(ctx.transfer.id,'调拨申请ID');const after=await Promise.all(ctx.bankIds.slice(0,2).map(bankBalance));assert.deepEqual(after,before);});
  await test('TRANSFER-SELF-APPROVE','资金调拨','调拨申请人与审核人分离',async()=>{reject(await call('post',`/api/finance/bank-transactions/transfers/${need(ctx.transfer,'调拨').id}/approve`,{}));});
  await test('TRANSFER-APPROVE','资金调拨','审批后两账户等额收付并生成总账',async()=>{const before=await Promise.all(ctx.bankIds.slice(0,2).map(bankBalance));http(await call('post',`/api/finance/bank-transactions/transfers/${ctx.transfer.id}/approve`,{},finance.api));equalMoney(await bankBalance(ctx.bankIds[0]),before[0]-250);equalMoney(await bankBalance(ctx.bankIds[1]),before[1]+250);const transfer=await one('SELECT * FROM fund_transfer_requests WHERE id=?',[ctx.transfer.id]);assert.equal(transfer.status,'approved');await assertEntry(transfer.gl_entry_id,250);});
  await test('TRANSFER-RETRY','资金调拨','重复审核不重复划转',async()=>{const before=await bankBalance(ctx.bankIds[0]);reject(await call('post',`/api/finance/bank-transactions/transfers/${ctx.transfer.id}/approve`,{},finance.api));equalMoney(await bankBalance(ctx.bankIds[0]),before);});
  await test('TRANSFER-SAME-ACCOUNT','资金调拨','禁止同账户调拨',async()=>{reject(await call('post','/api/finance/bank-transactions/transfer',{...transferBody,toAccountId:ctx.bankIds[0],transactionNumber:`${prefix}-BAD-TRANSFER`}));});

  const assetBody={assetCode:`${prefix}-ASSET`,assetName:`${prefix} 测试设备`,assetType:'electronic',purchaseDate:calendar.previousPeriodEnd,originalValue:12000,depreciationMethod:'straight_line',usefulLife:3,salvageRate:0,location:'隔离测试室',status:'in_use',responsible:prefix,notes:prefix};
  await test('ASSET-CREATE','固定资产','资产卡片保存原值及折旧年限',async()=>{ctx.asset=http(await call('post','/api/finance/assets',assetBody),201);const a=need(await one('SELECT * FROM fixed_assets WHERE asset_code=?',[assetBody.assetCode]),'资产卡片');ctx.assetId=a.id;equalMoney(a.acquisition_cost,12000);assert.equal(Number(a.useful_life),36);assert.equal(a.audit_status,'draft');evidence(a);});
  await test('ASSET-EDIT-DATE', '固定资产', '编辑购入日期持久保存且编号保持不变', async () => {
    const editedDate = `${calendar.previousPeriodEnd.slice(0, 7)}-01`;
    http(await call('put', `/api/finance/assets/${ctx.assetId}`, { ...assetBody, purchaseDate: editedDate }));
    const asset = await one('SELECT asset_code,acquisition_date FROM fixed_assets WHERE id=?', [ctx.assetId]);
    assert.equal(require('../../src/utils/dateUtils').toLocalDateString(asset.acquisition_date), editedDate);
    assert.equal(asset.asset_code, assetBody.assetCode);
  });
  await test('ASSET-SELF-APPROVE','固定资产','资产制单人与审核人分离',async()=>{reject(await call('post',`/api/finance/assets/${need(ctx.assetId,'资产')}/audit`,{action:'approve'}));});
  await test('ASSET-APPROVE','固定资产','资产独立审核生效',async()=>{http(await call('post',`/api/finance/assets/${ctx.assetId}/audit`,{action:'approve'},finance.api));});
  await test('ASSET-DEPRECIATION-PREVIEW','固定资产','按直线法核对当月折旧',async()=>{const d=http(await call('get',`/api/finance/assets/depreciation/calculate?depreciationDate=${today.slice(0,7)}`));evidence(d);const list=Array.isArray(d)?d:d.assets||d.list||[];const a=need(list.find(x=>Number(x.id)===Number(ctx.assetId)),'当月待折旧资产');ctx.depreciationPreview=a;equalMoney(a.depreciationAmount,333.33);});
  await test('ASSET-DEPRECIATION','固定资产','计提折旧更新净值并记账',async()=>{const a=need(ctx.depreciationPreview,'折旧预览');http(await call('post','/api/finance/assets/depreciation/submit',{depreciationDate:today.slice(0,7),assets:[a]},finance.api));const current=await one('SELECT * FROM fixed_assets WHERE id=?',[ctx.assetId]);equalMoney(current.accumulated_depreciation,333.33);equalMoney(current.current_value,11666.67);evidence(current);const details=await rows('SELECT * FROM fixed_asset_depreciation_details WHERE asset_id=?',[ctx.assetId]);assert.ok(details.length);});
  await test('ASSET-DEPRECIATION-RETRY','固定资产','重复计提不会重复折旧',async()=>{const before=await one('SELECT accumulated_depreciation FROM fixed_assets WHERE id=?',[ctx.assetId]);http(await call('post','/api/finance/assets/depreciation/submit',{depreciationDate:today.slice(0,7),assets:[ctx.depreciationPreview]},finance.api),[200,400,409]);equalMoney((await one('SELECT accumulated_depreciation FROM fixed_assets WHERE id=?',[ctx.assetId])).accumulated_depreciation,before.accumulated_depreciation);});
  await test('ASSET-REVERSE-AUDIT-GUARD','固定资产','已计提折旧资产禁止直接反审核',async()=>{reject(await call('post',`/api/finance/assets/${ctx.assetId}/audit`,{action:'reject'},finance.api));});
};
