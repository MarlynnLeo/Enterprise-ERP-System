export const getResponseList = (response) => {
  const data = response?.data ?? response

  if (Array.isArray(data)) return data
  if (Array.isArray(data?.list)) return data.list
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data)) return data.data
  if (Array.isArray(data?.data?.list)) return data.data.list
  if (Array.isArray(data?.data?.items)) return data.data.items

  return []
}

export const toPagedResponse = (list) => ({
  data: {
    list,
    total: list.length
  }
})

export const filterByKeyword = (list, keyword, fields) => {
  const normalizedKeyword = String(keyword || '').trim().toLowerCase()
  if (!normalizedKeyword) return list

  return list.filter((item) =>
    fields.some((field) =>
      String(item[field] ?? '').toLowerCase().includes(normalizedKeyword)
    )
  )
}
