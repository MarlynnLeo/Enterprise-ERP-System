import { extractApiList, extractApiTotal } from './apiHelper'

// List search endpoints can return prefix matches or paginate an exact match.
// Never use the first search hit as the identity of a scanned business record.
export async function findExactScanMatch(fetchPage, code, { field = 'code', filter = 'code' } = {}) {
  const scannedCode = String(code ?? '').trim()
  if (!scannedCode) return null
  const pageSize = 100
  const seenPages = new Set()

  for (let page = 1; ; page++) {
    const response = await fetchPage({ [filter]: scannedCode, page, pageSize })
    const items = extractApiList(response)
    const match = items.find((item) => String(item?.[field] ?? '').trim() === scannedCode)
    if (match) return match

    const total = extractApiTotal(response)
    const pageKey = JSON.stringify(items.map((item) => [item.id, item[field]]))
    if (
      items.length < pageSize ||
      (Number.isFinite(total) && total >= 0 && page * pageSize >= total) ||
      seenPages.has(pageKey)
    ) return null
    seenPages.add(pageKey)
  }
}
