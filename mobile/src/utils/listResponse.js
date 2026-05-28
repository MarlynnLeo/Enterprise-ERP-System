import { extractApiList } from './apiHelper'

export const getResponseList = extractApiList

export const filterByKeyword = (list = [], keyword = '', fields = []) => {
  const text = String(keyword || '').trim().toLowerCase()
  if (!text) return list

  return list.filter((item) =>
    fields.some((field) => String(item?.[field] || '').toLowerCase().includes(text))
  )
}

export const toPagedResponse = (list = []) => ({
  data: {
    list,
    total: list.length,
    page: 1,
    pageSize: list.length || 20
  }
})
