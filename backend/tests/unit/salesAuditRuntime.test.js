const { getAuditCalendar, summarizeCases, auditExitCode, canSkipPrintTemplate, formatCaseResult } = require('../../scripts/lib/sales-audit-runtime');

describe('sales audit dates', () => {
  it('uses the execution day and constructs the same date as a browser date picker', () => {
    const calendar = getAuditCalendar(new Date(2026, 8, 15, 8, 2));
    expect(calendar.today).toBe('2026-09-15');
    expect(calendar.validityDate).toBe('2026-10-15');
    const input = new Date(calendar.isoDateInput);
    expect([input.getFullYear(), input.getMonth(), input.getDate(), input.getHours()]).toEqual([2026, 8, 15, 0]);
  });

  it.each([
    [new Date(2026, 8, 30), '2026-09-01', '2026-09-30', '2026-10-01', 2026],
    [new Date(2026, 11, 31), '2026-12-01', '2026-12-31', '2027-01-01', 2026],
    [new Date(2027, 0, 1), '2027-01-01', '2027-01-31', '2027-02-01', 2027],
    [new Date(2028, 1, 29), '2028-02-01', '2028-02-29', '2028-03-01', 2028],
  ])('keeps finance and quotation month boundaries correct for %s', (date, start, end, next, year) => {
    const calendar = getAuditCalendar(date);
    expect([calendar.periodStart, calendar.periodEnd, calendar.nextPeriodStart, calendar.fiscalYear]).toEqual([start, end, next, year]);
  });
});

describe('sales audit result reporting', () => {
  it.each([
    [['PASS', 'SKIP'], 0],
    [['PASS', 'FAIL'], 1],
    [['PASS', 'BLOCKED'], 1],
    [['RUNNING'], 1],
    [[], 1],
  ])('returns a reliable command exit code for %j', (results, exitCode) => {
    expect(auditExitCode({ cases: results.map(result => ({ result })) })).toBe(exitCode);
  });

  it('does not hide a fatal setup error behind retained passing cases', () => {
    expect(auditExitCode({ cases: [{ result: 'PASS' }], fatal: 'Database unavailable' })).toBe(1);
  });

  it('keeps skipped capability probes separate from passed and blocked tests', () => {
    expect(summarizeCases(['PASS', 'PASS', 'SKIP', 'BLOCKED'].map(result => ({ result })))).toEqual({ PASS: 2, SKIP: 1, BLOCKED: 1 });
    expect(canSkipPrintTemplate('sales_exchange', 404)).toBe(true);
    expect(canSkipPrintTemplate('sales_quotation', 404)).toBe(true);
    expect(canSkipPrintTemplate('packing_list', 404)).toBe(true);
    expect(canSkipPrintTemplate('sales_order', 404)).toBe(false);
    expect(canSkipPrintTemplate('sales_outbound', 404)).toBe(false);
    expect(canSkipPrintTemplate('sales_return', 404)).toBe(false);
    expect(canSkipPrintTemplate('sales_exchange', 500)).toBe(false);
  });

  it('labels validated negative cases without treating unexpected server errors as expected', () => {
    const passing = formatCaseResult({ id: 'NEGATIVE-QTY', name: '非正数量校验', result: 'PASS', requests: [{ status: 400, expectedStatuses: [400, 422] }] });
    expect(passing).toContain('[PASS]');
    expect(passing).toContain('已验证 1 次预期拦截');
    const failing = formatCaseResult({ id: 'CREATE', name: '新增', result: 'FAIL', error: '预期 201\n实际 500', requests: [{ status: 500, expectedStatuses: [201] }] });
    expect(failing).toContain('[FAIL]');
    expect(failing).toContain('实际 500');
    expect(failing).not.toContain('预期拦截');
  });
});
