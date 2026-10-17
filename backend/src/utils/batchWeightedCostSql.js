'use strict';

// Shared by posting and historical audit. Positive ledger entries are the
// batch cost basis; sales prices and the latest single receipt are not.
function batchWeightedUnitCostSql(alias = '') {
  if (alias && !/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid SQL alias');
  const p = alias ? `${alias}.` : '';
  return `SUM(CASE WHEN ${p}quantity > 0 THEN ${p}quantity * COALESCE(NULLIF(${p}unit_cost, 0), NULLIF(${p}total_value / NULLIF(${p}quantity, 0), 0), 0) ELSE 0 END)
    / NULLIF(SUM(CASE WHEN ${p}quantity > 0 THEN ${p}quantity ELSE 0 END), 0)`;
}

module.exports = { batchWeightedUnitCostSql };
