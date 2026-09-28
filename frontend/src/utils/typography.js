import { SPPLM_FONT_FACE_CSS } from '@/assets/fonts/signatureFont'

// 与桌面和移动端的 --font-ui 保持一致；独立打印窗口也可使用此兜底。
export const APP_FONT_FAMILY = "'Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Noto Sans SC', sans-serif"

export function getAppFontFamily() {
  if (typeof document === 'undefined') return APP_FONT_FAMILY
  return getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim()
    || APP_FONT_FAMILY
}

// 图标、字体条码以及电子签名手写字体承载的是图形与特殊签名字形，应保留原有字体。
export const isSymbolFont = (family) =>
  /icon|barcode|code\s*(?:39|128)|wingdings|webdings|symbol|awesome|spplmfont/i.test(family)

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
      if (rule.type === 1) {
        updateStyle(rule.style)
      }
      if (rule.cssRules) updateRules(rule.cssRules)
    }
  }

  // Embed the font once; the print lifecycle still waits for the browser to decode it.
  let spplmStyle = printDocument.getElementById('erp-print-spplmfont')
  if (!spplmStyle) {
    spplmStyle = printDocument.createElement('style')
    spplmStyle.id = 'erp-print-spplmfont'
    spplmStyle.textContent = SPPLM_FONT_FACE_CSS
    ;(printDocument.head || printDocument.body)?.appendChild(spplmStyle)
  }

  for (const styleElement of printDocument.querySelectorAll('style')) {
    if (styleElement.id === 'erp-print-spplmfont') continue
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
    .signature-handwritten, .signature-font {
      font-family: 'SPPLMFONT', sans-serif !important;
    }
  `
}
