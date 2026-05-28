export const extractApiData = (res, defaultValue = {}) => {
  return res?.data?.data ?? res?.data ?? defaultValue
}

export const extractApiList = (res) => {
  const data = extractApiData(res, [])
  if (Array.isArray(data)) return data
  const list = data?.list || data?.items || data?.rows || data?.accounts
  if (Array.isArray(list)) return list

  if (data && typeof data === 'object') {
    const nested = data.data
    if (Array.isArray(nested)) return nested
    if (nested && typeof nested === 'object') {
      const nestedArrayKey = Object.keys(nested).find((key) => Array.isArray(nested[key]))
      if (nestedArrayKey) return nested[nestedArrayKey]
    }

    const arrayKey = Object.keys(data).find((key) => Array.isArray(data[key]))
    if (arrayKey) return data[arrayKey]
  }

  return []
}

export const getResponseList = extractApiList

export const toPagedResponse = (list = []) => ({
  data: {
    list,
    total: list.length
  }
})

export const filterByKeyword = (list = [], keyword, fields = []) => {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase()
  if (!normalizedKeyword) return list

  return list.filter((item) =>
    fields.some((field) =>
      String(item?.[field] ?? '').toLowerCase().includes(normalizedKeyword)
    )
  )
}

export const extractApiTotal = (res, fallback = -1) => {
  const data = extractApiData(res)
  const raw = res?.data ?? res
  const candidates = [
    data?.total,
    data?.count,
    data?.pagination?.total,
    raw?.total,
    raw?.count,
    raw?.pagination?.total,
    raw?.data?.total,
    raw?.data?.count,
    raw?.data?.pagination?.total
  ]
  const total = candidates.find((value) => value !== undefined && value !== null)
  return total === undefined ? fallback : Number(total)
}

export const extractApiPaginated = (res, options = {}) => {
  const data = extractApiData(res)
  const list = extractApiList(res)
  const totalFallback = Object.prototype.hasOwnProperty.call(options, 'totalFallback')
    ? options.totalFallback
    : list.length
  const total = extractApiTotal(res, totalFallback)

  return {
    list,
    total,
    page: data?.page,
    pageSize: data?.pageSize || data?.limit,
    payload: data
  }
}
