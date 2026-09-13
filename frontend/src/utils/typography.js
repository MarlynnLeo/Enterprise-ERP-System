// 与桌面和移动端的 --font-ui 保持一致；独立打印窗口也可使用此兜底。
export const APP_FONT_FAMILY = "'Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif"

export function getAppFontFamily() {
  if (typeof document === 'undefined') return APP_FONT_FAMILY
  return getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
    || APP_FONT_FAMILY
}

// 图标和字体条码承载的是图形，应保留原有字体。
const isSymbolFont = (family) => /icon|barcode|code\s*(?:39|128)|wingdings|webdings|symbol|awesome/i.test(family)

/** 在打印布局测量之前统一旧模板字体，保留字号、字重、纸张和图形字体。 */
export function applyPrintTypography(printDocument) {
  const family = getAppFontFamily()
  const updateStyle = (style) => {
    const previousFamily = style.getPropertyValue('font-family')
    if (previousFamily && !isSymbolFont(previousFamily)) {
      style.setProperty('font-family', family, style.getPropertyPriority('font-family'))
    }
    if (style.getPropertyValue('text-shadow')) {
      style.setProperty('text-shadow', 'none', style.getPropertyPriority('text-shadow'))
    }
  }
  const updateRules = (rules) => {
    for (const rule of rules) {
      // 仅改样式规则，不改 @font-face；同时处理 @media print 等嵌套规则。
      if (rule.type === 1) updateStyle(rule.style)
      if (rule.cssRules) updateRules(rule.cssRules)
    }
  }

  for (const styleElement of printDocument.querySelectorAll('style')) {
    if (styleElement.sheet) updateRules(styleElement.sheet.cssRules)
  }
  for (const element of printDocument.querySelectorAll('[style]')) {
    updateStyle(element.style)
  }
  for (const element of printDocument.querySelectorAll('font[face]')) {
    if (!isSymbolFont(element.getAttribute('face'))) {
      element.setAttribute('face', family)
    }
  }
  for (const element of printDocument.querySelectorAll('[font-family]')) {
    if (!isSymbolFont(element.getAttribute('font-family'))) {
      element.setAttribute('font-family', family)
    }
  }

  let baseStyle = printDocument.getElementById('erp-print-typography')
  if (!baseStyle) {
    baseStyle = printDocument.createElement('style')
    baseStyle.id = 'erp-print-typography'
    printDocument.head.appendChild(baseStyle)
  }
  baseStyle.textContent = `
    :root { --font-ui: ${family}; }
    html, body { font-family: var(--font-ui); }
    button, input, select, textarea, code, kbd, pre, samp { font-family: inherit; }
  `
}
