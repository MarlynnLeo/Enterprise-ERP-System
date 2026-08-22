/**
 * CSP-safe print template renderer.
 * Production nginx CSP sets script-src 'self' without 'unsafe-eval'.
 * Handlebars.compile() uses new Function and crashes under that policy.
 *
 * Supports the subset used by ERP print templates:
 * - {{path.to.value}}
 * - {{{rawHtml}}} (unescaped — content is still sanitized after render)
 * - {{#each items}}...{{/each}}
 * - {{#if cond}}...{{else}}...{{/if}}
 * - {{#unless cond}}...{{/unless}}
 * - Helpers: eq, not, default, formatNumber
 */

function isTruthy(value) {
  if (Array.isArray(value)) return value.length > 0
  return Boolean(value)
}

function resolvePath(ctx, path) {
  if (path == null || path === '') return undefined
  if (path === 'this' || path === '.') return ctx?.this ?? ctx
  const parts = String(path).split('.')
  let cur = ctx
  for (const part of parts) {
    if (cur == null) return undefined
    if (part === 'this') {
      cur = cur.this ?? cur
      continue
    }
    cur = cur[part]
  }
  return cur
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const HELPERS = {
  eq: (left, right) => left === right,
  not: (value) => !value,
  default: (value, fallback) => (value == null || value === '' ? fallback ?? '' : value),
  formatNumber: (value, decimals = 2) => {
    const normalizedDecimals = Number.isFinite(Number(decimals)) ? Number(decimals) : 2
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric.toFixed(normalizedDecimals) : ''
  },
}

function parseArgs(argText, ctx) {
  if (!argText || !argText.trim()) return []
  const tokens = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match = re.exec(argText)
  while (match) {
    if (match[1] !== undefined) tokens.push(match[1])
    else if (match[2] !== undefined) tokens.push(match[2])
    else {
      const raw = match[3]
      if (raw === 'true') tokens.push(true)
      else if (raw === 'false') tokens.push(false)
      else if (raw === 'null') tokens.push(null)
      else if (/^-?\d+(\.\d+)?$/.test(raw)) tokens.push(Number(raw))
      else tokens.push(resolvePath(ctx, raw))
    }
    match = re.exec(argText)
  }
  return tokens
}

function evaluateExpression(expr, ctx) {
  const trimmed = String(expr || '').trim()
  if (!trimmed) return undefined

  const helperMatch = trimmed.match(/^(\w+)(?:\s+([\s\S]+))?$/)
  if (helperMatch && HELPERS[helperMatch[1]]) {
    const args = parseArgs(helperMatch[2] || '', ctx)
    return HELPERS[helperMatch[1]](...args)
  }
  return resolvePath(ctx, trimmed)
}

function findBlockEnd(template, startIndex, openName) {
  const openRe = new RegExp(`\\{\\{#${openName}\\b`, 'g')
  const closeRe = new RegExp(`\\{\\{\\/${openName}\\}\\}`, 'g')
  let depth = 1
  let i = startIndex
  while (i < template.length && depth > 0) {
    openRe.lastIndex = i
    closeRe.lastIndex = i
    const openMatch = openRe.exec(template)
    const closeMatch = closeRe.exec(template)
    if (!closeMatch) return -1
    if (openMatch && openMatch.index < closeMatch.index) {
      depth += 1
      i = openMatch.index + openMatch[0].length
    } else {
      depth -= 1
      if (depth === 0) return closeMatch.index
      i = closeMatch.index + closeMatch[0].length
    }
  }
  return -1
}

function splitElse(blockBody) {
  let depth = 0
  const re = /\{\{(#each|#if|#unless|\/each|\/if|\/unless|else)\b[^}]*\}\}/g
  let match = re.exec(blockBody)
  while (match) {
    const tag = match[1]
    if (tag === '#each' || tag === '#if' || tag === '#unless') depth += 1
    else if (tag === '/each' || tag === '/if' || tag === '/unless') depth -= 1
    else if (tag === 'else' && depth === 0) {
      return {
        primary: blockBody.slice(0, match.index),
        alternate: blockBody.slice(match.index + match[0].length),
      }
    }
    match = re.exec(blockBody)
  }
  return { primary: blockBody, alternate: '' }
}

/**
 * @param {string} template
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
export function renderPrintTemplate(template, data = {}) {
  if (template == null) return ''
  const source = String(template)
  const rootCtx = { ...data, this: data }

  function render(fragment, ctx) {
    let out = ''
    let i = 0
    while (i < fragment.length) {
      const open = fragment.indexOf('{{', i)
      if (open === -1) {
        out += fragment.slice(i)
        break
      }
      out += fragment.slice(i, open)

      if (fragment.startsWith('{{{', open)) {
        const close = fragment.indexOf('}}}', open + 3)
        if (close === -1) {
          out += fragment.slice(open)
          break
        }
        const expr = fragment.slice(open + 3, close).trim()
        const value = evaluateExpression(expr, ctx)
        out += value == null ? '' : String(value)
        i = close + 3
        continue
      }

      const close = fragment.indexOf('}}', open + 2)
      if (close === -1) {
        out += fragment.slice(open)
        break
      }

      const rawExpr = fragment.slice(open + 2, close).trim()
      i = close + 2

      if (rawExpr.startsWith('!')) {
        continue
      }

      if (rawExpr.startsWith('#each')) {
        const eachExpr = rawExpr.slice(5).trim()
        const bodyStart = i
        const bodyEnd = findBlockEnd(fragment, bodyStart, 'each')
        if (bodyEnd === -1) {
          out += `{{${rawExpr}}}`
          continue
        }
        const body = fragment.slice(bodyStart, bodyEnd)
        i = bodyEnd + '{{/each}}'.length
        const list = evaluateExpression(eachExpr, ctx)
        const items = Array.isArray(list) ? list : []
        items.forEach((item, index) => {
          const itemCtx =
            item != null && typeof item === 'object'
              ? { ...ctx, ...item, this: item, index, '@index': index }
              : { ...ctx, this: item, index, '@index': index }
          out += render(body, itemCtx)
        })
        continue
      }

      if (rawExpr.startsWith('#if') || rawExpr.startsWith('#unless')) {
        const isUnless = rawExpr.startsWith('#unless')
        const condExpr = rawExpr.slice(isUnless ? 8 : 3).trim()
        const blockName = isUnless ? 'unless' : 'if'
        const bodyStart = i
        const bodyEnd = findBlockEnd(fragment, bodyStart, blockName)
        if (bodyEnd === -1) {
          out += `{{${rawExpr}}}`
          continue
        }
        const body = fragment.slice(bodyStart, bodyEnd)
        i = bodyEnd + `{{/${blockName}}}`.length
        const { primary, alternate } = splitElse(body)
        const cond = isTruthy(evaluateExpression(condExpr, ctx))
        const takePrimary = isUnless ? !cond : cond
        out += render(takePrimary ? primary : alternate, ctx)
        continue
      }

      if (rawExpr.startsWith('/') || rawExpr === 'else') {
        // Orphan close/else tags are ignored (malformed templates).
        continue
      }

      const value = evaluateExpression(rawExpr, ctx)
      out += escapeHtml(value == null ? '' : value)
    }
    return out
  }

  return render(source, rootCtx)
}

export default renderPrintTemplate
