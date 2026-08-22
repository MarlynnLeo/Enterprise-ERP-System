/**
 * CSP-safe vue-i18n message compiler.
 * Production nginx CSP sets script-src 'self' without 'unsafe-eval'.
 * vue-i18n's default compiler uses `new Function`, which crashes Layout/Dashboard
 * under that policy (ElAside / $t). This compiler only supports plain text and
 * simple named placeholders like `{min}` / `{max}` used by our locale files.
 */

/**
 * @param {unknown} message
 * @returns {(ctx: { named?: (key: string) => unknown, values?: Record<string, unknown> }) => string}
 */
export function compileI18nMessage(message) {
  if (typeof message !== 'string') {
    return () => (message == null ? '' : String(message))
  }

  if (!message.includes('{')) {
    return () => message
  }

  const segments = []
  const tokenRe = /\{(\w+)\}/g
  let lastIndex = 0
  let match = tokenRe.exec(message)

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: message.slice(lastIndex, match.index) })
    }
    segments.push({ type: 'named', value: match[1] })
    lastIndex = match.index + match[0].length
    match = tokenRe.exec(message)
  }

  if (lastIndex < message.length) {
    segments.push({ type: 'text', value: message.slice(lastIndex) })
  }

  return (ctx = {}) => {
    let out = ''
    for (const segment of segments) {
      if (segment.type === 'text') {
        out += segment.value
        continue
      }
      const named =
        typeof ctx.named === 'function'
          ? ctx.named(segment.value)
          : ctx.values?.[segment.value]
      out += named == null ? '' : String(named)
    }
    return out
  }
}

export default compileI18nMessage
