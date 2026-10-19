'use strict';

// Run only after the sales runner persisted its two financially approved deliveries.
// All positive business transitions in runFinance use the normal page controls.
const { createRuntime } = require('./runtime.cjs');
const { runFinance, resolveFinanceSourceIds } = require('./finance.cjs');

async function main() {
  const ctx = await createRuntime('finance');
  try {
    const chain = ctx.loadChain();
    const sources = resolveFinanceSourceIds(chain);
    const result = await runFinance(ctx, chain);
    console.log(JSON.stringify({ status: 'PASS', ...sources,
      matches: result.matches.map(row => row.id),
      invoices: Object.fromEntries(Object.entries(result.invoices).map(([side, rows]) => [side, rows.map(row => row.id)])),
      settlements: result.settlements, audit: result.audit }, null, 2));
  } finally { await ctx.close(); }
}

if (require.main === module) main().catch(error => { console.error(error.stack); process.exitCode = 1; });

module.exports = { main };
