'use strict';
const {createRuntime}=require('./runtime.cjs');
async function main(){
  const phase=process.argv[2]||'sales';const ctx=await createRuntime(phase);
  try{
    if(phase==='sales'){
      const chain=await require('./sales.cjs').runSales(ctx);ctx.saveChain(chain);
    }else if(phase==='production-plan'){
      const chain=ctx.loadChain();Object.assign(chain,await require('./manufacturing.cjs').prepareProduction(ctx,chain));ctx.saveChain(chain);
    }else if(phase==='purchase'){
      const chain=ctx.loadChain();const p=require('./purchase.cjs');
      Object.assign(chain,await p.submitRequisitions(ctx,chain.requisitions.map(r=>r.id)));ctx.saveChain(chain);
    }else throw new Error('Unknown phase: '+phase);
  }finally{await ctx.close();}
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
