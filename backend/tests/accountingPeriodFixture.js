/** Create the missing current period inside the caller's rollback-only fixture. */
async function ensureCurrentAccountingPeriod(connection) {
  await connection.query(`
    INSERT INTO gl_periods
      (period_name, start_date, end_date, is_closed, is_adjusting, fiscal_year, is_locked)
    SELECT CONCAT('TEST-', DATE_FORMAT(CURRENT_DATE, '%Y-%m')),
           DATE_FORMAT(CURRENT_DATE, '%Y-%m-01'), LAST_DAY(CURRENT_DATE), 0, 0,
           YEAR(CURRENT_DATE), 0
     WHERE NOT EXISTS (
       SELECT 1 FROM gl_periods
        WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
     )
  `);
}

module.exports = { ensureCurrentAccountingPeriod };
