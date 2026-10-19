'use strict';
const assert=require('node:assert/strict');
const rowBy=(page,no)=>page.locator('.el-table__body-wrapper tr.el-table__row:visible').filter({hasText:no}).first();
async function completeInventoryDocument(ctx,kind,doc){
  assert(['inbound','outbound'].includes(kind));
  const table=`inventory_${kind}`,no=doc[`${kind}_no`]||doc[kind==='inbound'?'inboundNo':'outboundNo'];
  assert(doc.id&&no,'An explicit source document ID and number are required');
  await ctx.asActor('business');
  await ctx.step(`仓库${kind==='inbound'?'入库':'出库'}确认并完成 ${no}`,async()=>{
    const [[current]]=await ctx.db.query(`SELECT status FROM ${table} WHERE id=?`,[doc.id]);
    if(current.status==='completed'){await ctx.record('恢复：业务单据已完成',{id:doc.id,no});return;}
    await ctx.page.goto(`${ctx.baseUrl}/inventory/${kind}`);
    await ctx.page.getByRole('button',{name:'高级筛选',exact:true}).click();
    const input=ctx.page.getByPlaceholder(kind==='inbound'?'入库单号':'出库单号',{exact:true});
    await input.fill(no);
    await ctx.page.getByRole('button',{name:/^查\s*询$|^搜\s*索$/}).first().click();
    await rowBy(ctx.page,no).waitFor();
    for(const [status,button]of [['confirmed','确认'],['completed','完成']]){
      if(status==='confirmed'&&current.status==='confirmed')continue;
      const endpoint=kind==='inbound'?`/api/inventory/inbound/status/${doc.id}`:`/api/inventory/outbound/${doc.id}/status`;
      const wait=ctx.page.waitForResponse(r=>r.request().method()==='PUT'&&new URL(r.url()).pathname===endpoint);
      wait.catch(()=>{});
      await rowBy(ctx.page,no).getByRole('button',{name:button,exact:true}).click();
      const pop=ctx.page.locator('.el-popconfirm:visible');await pop.waitFor();
      await pop.getByRole('button',{name:/确\s*定|确\s*认/}).click();
      const response=await wait,body=await response.json();
      assert(response.ok()&&body.success!==false,JSON.stringify(body));
      await ctx.record('库存前端状态变更',{kind,id:doc.id,status,httpStatus:response.status()});
    }
    const [[saved]]=await ctx.db.query(`SELECT status FROM ${table} WHERE id=?`,[doc.id]);assert.equal(saved.status,'completed');
    const [[posting]]=await ctx.db.query("SELECT * FROM inventory_posting_documents WHERE source_no=? AND posting_kind='movement' ORDER BY id DESC LIMIT 1",[no]);
    assert(posting);assert.equal(posting.finance_status,'pending');
    const [[ledger]]=await ctx.db.query('SELECT COUNT(*) AS count FROM inventory_ledger WHERE posting_document_id=?',[posting.id]);
    assert.equal(Number(ledger.count),0,'Business completion alone must not alter formal inventory');
    const denied=await ctx.api('POST',`/api/finance/inventory-postings/${posting.id}/approve`,{},'business');
    assert.equal(denied.status,403,'Maker must not approve their own inventory posting');
    await ctx.record('制单与财审分离',{postingId:posting.id,businessActor:ctx.actors.business.id,sameActorApproval:denied.status,formalLedgerRows:0});
  });
  return doc;
}
async function assertInventoryBalances(ctx,expected){
  const [rows]=await ctx.db.query(`SELECT material_id,SUM(quantity) AS quantity FROM inventory_ledger WHERE material_id IN (${Object.keys(expected).map(()=>'?').join(',')}) GROUP BY material_id`,Object.keys(expected));
  for(const [id,quantity]of Object.entries(expected))assert.equal(Number(rows.find(r=>Number(r.material_id)===Number(id))?.quantity||0),quantity,`Inventory balance for material ${id}`);
  await ctx.record('库存数量守恒',rows);
}
module.exports={completeInventoryDocument,assertInventoryBalances};
