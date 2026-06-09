const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthLengths[month - 1] || 0;
}

function isValidDateOnly(value) {
  const match = DATE_ONLY_PATTERN.exec(value || '');
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

function getMonthRange(monthValue) {
  const match = MONTH_PATTERN.exec(monthValue || '');
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  const monthText = String(month).padStart(2, '0');
  return {
    start: `${year}-${monthText}-01`,
    end: `${year}-${monthText}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
  };
}

module.exports = {
  isValidDateOnly,
  getMonthRange,
};
