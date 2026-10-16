'use strict';

const { toLocalDateString } = require('../../utils/dateUtils');

function invalid(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  return error;
}

// Always acquire before tax invoice/return rows. A seeded row also serializes
// the first return of a period (there may be no return row to lock yet).
async function lock(connection) {
  const [rows] = await connection.execute('SELECT id FROM tax_ledger_locks WHERE id = 1 FOR UPDATE');
  if (!rows.length) throw invalid('税务锁未初始化，请先执行增值税留抵迁移');
}

async function assertMutable(connection, dates) {
  const periods = [...new Set(dates.filter(Boolean).map(date => toLocalDateString(date).slice(0, 7)))].sort();
  if (!periods.length) return;
  // A prior-period change can invalidate every later carryforward, including
  // a documented legacy opening balance; require later returns to be reopened.
  const [rows] = await connection.execute(
    `SELECT id, return_period FROM tax_returns
     WHERE return_type = '增值税' AND status IN ('已申报', '已缴纳')
       AND return_period >= ? ORDER BY return_period LIMIT 1 FOR UPDATE`, [periods[0]]
  );
  if (rows.length) throw invalid(`税期 ${rows[0].return_period} 已申报，请先按从后到前的顺序撤回相关申报再变更税票`);
}

async function assertNoLaterDeclaration(connection, returnPeriod) {
  const [rows] = await connection.execute(
    `SELECT id, return_period FROM tax_returns
     WHERE return_type = '增值税' AND status IN ('已申报', '已缴纳')
       AND return_period > ? ORDER BY return_period LIMIT 1 FOR UPDATE`, [returnPeriod]
  );
  if (rows.length) throw invalid(`后续税期 ${rows[0].return_period} 已申报，请先撤回后续申报`);
}

module.exports = { lock, assertMutable, assertNoLaterDeclaration, invalid };
