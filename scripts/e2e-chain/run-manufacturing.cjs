'use strict';

const { createRuntime } = require('./runtime.cjs');
const manufacturing = require('./manufacturing.cjs');
const inventory = require('./inventory.cjs');
const finance = require('./finance.cjs');

async function runManufacturingFlow(ctx, chain) {
  await ctx.asActor('business');
  await manufacturing.issueProductionMaterials(ctx, chain);
  await inventory.completeInventoryDocument(ctx, 'outbound', chain.outbound);
  await finance.approveInventoryPosting(ctx, chain.outbound.outbound_no);
  await ctx.asActor('business');
  await manufacturing.runManufacturing(ctx, chain);
  await inventory.completeInventoryDocument(ctx, 'inbound', chain.inbound);
  await finance.approveInventoryPosting(ctx, chain.inbound.inbound_no);
  await ctx.asActor('business');
  await manufacturing.verifyManufacturingClosure(ctx, chain);
  chain.manufacturingComplete = true;
  ctx.saveChain(chain);
  return chain;
}

if (require.main === module) {
  (async () => {
    const ctx = await createRuntime('production-execution');
    try { await runManufacturingFlow(ctx, ctx.loadChain()); }
    finally { await ctx.close(); }
  })().catch(error => { console.error(error.stack); process.exitCode = 1; });
}

module.exports = { runManufacturingFlow };
