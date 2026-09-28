const subscribers = new Set()
let observer

/** Observe the applied CSS theme, including custom colors and font changes. */
export function observeChartTheme(refresh) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  subscribers.add(refresh)
  if (!observer) {
    observer = new MutationObserver(() => {
      for (const subscriber of subscribers) subscriber()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class', 'style']
    })
  }
  return () => {
    subscribers.delete(refresh)
    if (subscribers.size === 0) {
      observer?.disconnect()
      observer = undefined
    }
  }
}
