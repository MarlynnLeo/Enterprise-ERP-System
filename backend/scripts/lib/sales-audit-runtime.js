'use strict';

const OPTIONAL_PRINT_TYPES = new Set(['sales_exchange', 'sales_quotation', 'packing_list']);

function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getAuditCalendar(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('审计日期无效');
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  return {
    today: formatLocalDate(now),
    isoDateInput: new Date(year, month, day).toISOString(),
    validityDate: formatLocalDate(new Date(year, month, day + 30)),
    fiscalYear: year,
    periodStart: formatLocalDate(new Date(year, month, 1)),
    periodEnd: formatLocalDate(new Date(year, month + 1, 0)),
    previousPeriodEnd: formatLocalDate(new Date(year, month, 0)),
    nextPeriodStart: formatLocalDate(new Date(year, month + 1, 1)),
  };
}

function summarizeCases(cases) {
  return cases.reduce((counts, item) => {
    counts[item.result] = (counts[item.result] || 0) + 1;
    return counts;
  }, {});
}

function auditExitCode(report) {
  if (report.fatal || !report.cases.length) return 1;
  return report.cases.some(item => !['PASS', 'SKIP'].includes(item.result)) ? 1 : 0;
}

function canSkipPrintTemplate(type, status) {
  return status === 404 && OPTIONAL_PRINT_TYPES.has(type);
}

function formatCaseResult(item) {
  const expectedRejections = (item.requests || []).filter(request =>
    request.status >= 400 && request.expectedStatuses?.includes(request.status)
  ).length;
  const note = item.result === 'PASS' && expectedRejections ? `（已验证 ${expectedRejections} 次预期拦截）` : '';
  const detail = item.error ? `：${item.error.replace(/\s+/g, ' ').slice(0, 500)}` : '';
  return `[${item.result}] ${item.id} ${item.name}${note}${detail}`;
}

module.exports = { getAuditCalendar, summarizeCases, auditExitCode, canSkipPrintTemplate, formatCaseResult };
