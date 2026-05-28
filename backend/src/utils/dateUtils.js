function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseLocalDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'string') {
    const datePart = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
  }

  return new Date(value);
}

function toLocalDateString(value = new Date()) {
  const date = value === undefined || value === null || value === ''
    ? new Date()
    : parseLocalDate(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function currentDateString() {
  return toLocalDateString(new Date());
}

function addDaysToDateString(value, days) {
  const date = parseLocalDate(value || new Date());
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }

  date.setDate(date.getDate() + Number(days || 0));
  return toLocalDateString(date);
}

module.exports = {
  addDaysToDateString,
  currentDateString,
  toLocalDateString,
};
