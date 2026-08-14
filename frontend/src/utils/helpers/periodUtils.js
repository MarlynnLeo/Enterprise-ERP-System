export function periodLabel(period) {
  return period?.periodName || period?.period_name || ''
}

export function periodFieldDate(period, camel, snake) {
  const value = period?.[camel] ?? period?.[snake]
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isClosedPeriod(period) {
  const closed = period?.isClosed ?? period?.is_closed
  return closed === true || closed === 1 || closed === '1'
}

export function selectPeriodForDate(list = [], now = new Date()) {
  if (!list.length) return null

  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const padded = String(month).padStart(2, '0')
  const nameHints = [`${year}年${padded}月`, `${year}年${month}月`, `${year}-${padded}`]

  const currentMonth = list.find((period) => {
    const start = periodFieldDate(period, 'startDate', 'start_date')
    if (start && start.getFullYear() === year && start.getMonth() + 1 === month) {
      return true
    }
    const label = periodLabel(period)
    return nameHints.some((hint) => label.includes(hint))
  })
  if (currentMonth) return currentMonth

  return list.find((period) => {
    const start = periodFieldDate(period, 'startDate', 'start_date')
    const end = periodFieldDate(period, 'endDate', 'end_date')
    return start && end && now >= start && now <= end
  }) || null
}

export function selectDefaultOpenPeriod(list = [], now = new Date()) {
  const open = list.filter((period) => !isClosedPeriod(period))
  if (!open.length) return null

  const current = selectPeriodForDate(open, now)
  if (current) return current

  return [...open].sort((a, b) => {
    const startA = periodFieldDate(a, 'startDate', 'start_date')
    const startB = periodFieldDate(b, 'startDate', 'start_date')
    return (startA?.getTime() || 0) - (startB?.getTime() || 0)
  })[0]
}
