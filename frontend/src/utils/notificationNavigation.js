// The HTTP response uses camelCase; accept old snake_case records as well.
export function resolveNotificationLocation(notification) {
  const link = notification?.link?.trim()
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null
  const url = new URL(link, 'https://notification.local')
  let params = notification.linkParams ?? notification.link_params ?? {}
  try {
    if (typeof params === 'string') params = JSON.parse(params)
  } catch {
    params = {}
  }
  const query = Object.fromEntries(url.searchParams)
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    for (const [key, value] of Object.entries(params)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
        query[key] = value === null ? null : String(value)
      }
    }
  }
  return { path: url.pathname, query, hash: url.hash }
}
