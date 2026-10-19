const Precision = require('./precision');

// Stored standards are per workpiece; elapsed time covers the entire process.
// This is an actual/standard ratio (1 = on standard), matching the cost ledger.
function calculateProcessEfficiency(process) {
  const quantity = Number(process.quantity);
  const unitHours = Number(process.standard_hours);
  const standardHours =
    Number.isFinite(quantity) && quantity > 0 && Number.isFinite(unitHours) && unitHours >= 0
      ? Precision.mul(quantity, unitHours)
      : 0;
  const elapsed = process.actual_hours == null ? null : Number(process.actual_hours);
  const actualHours = elapsed !== null && Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
  const comparable =
    ['completed', 'qc_passed', 'qc_failed'].includes(process.status) &&
    standardHours > 0 &&
    actualHours !== null;
  return {
    standardHours,
    actualHours,
    comparable,
    hoursVariance: comparable ? Precision.sub(actualHours, standardHours) : null,
    efficiencyRate: comparable ? Precision.div(actualHours, standardHours) : null,
  };
}

module.exports = { calculateProcessEfficiency };
