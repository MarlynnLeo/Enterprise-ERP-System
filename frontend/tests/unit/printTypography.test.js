import { afterEach, describe, expect, test } from 'vitest'
import { writeSafeHtmlDocument } from '@/utils/htmlSecurity'
import { applyPrintTypography } from '@/utils/typography'

afterEach(() => {
  document.querySelectorAll('iframe').forEach((frame) => frame.remove())
})

const renderPrint = (html) => {
  const frame = document.createElement('iframe')
  document.body.appendChild(frame)
  writeSafeHtmlDocument(frame.contentWindow, html)
  return frame.contentDocument
}

describe('print typography', () => {
  test('converts legacy stylesheet, inline, shorthand and SVG fonts while keeping print layout', () => {
    const printDocument = renderPrint(`<!doctype html><html><head><style>
      @page { size: A4; margin: 10mm; }
      .legacy { font-family: Arial !important; font-size: 14px; font-weight: 700; }
      @media print { td { font-family: 'SimSun'; padding: 5px; } }
    </style></head><body>
      <p class="legacy">产品工艺路线 ABC123</p>
      <table><tr><td style="font: italic 12px Arial; text-shadow: 0 1px 2px black">检验要求</td></tr></table>
      <font face="Consolas">2026</font>
      <svg><text font-family="Arial">产品</text></svg>
    </body></html>`)
    const rules = printDocument.querySelector('style').sheet.cssRules
    const inline = printDocument.querySelector('td').style

    expect(rules[1].style.getPropertyValue('font-family')).toContain('Microsoft YaHei')
    expect(rules[1].style.getPropertyPriority('font-family')).toBe('important')
    expect(rules[1].style.getPropertyValue('font-size')).toBe('14px')
    expect(rules[1].style.getPropertyValue('font-weight')).toBe('700')
    expect(rules[2].cssRules[0].style.getPropertyValue('font-family')).toContain('Microsoft YaHei')
    expect(rules[2].cssRules[0].style.getPropertyValue('padding')).toBe('5px')
    expect(rules[0].style.getPropertyValue('margin')).toBe('10mm')
    expect(inline.fontFamily).toContain('Microsoft YaHei')
    expect(inline.fontSize).toBe('12px')
    expect(inline.fontStyle).toBe('italic')
    expect(inline.textShadow).toBe('none')
    expect(printDocument.querySelector('font').getAttribute('face')).toContain('Microsoft YaHei')
    expect(printDocument.querySelector('text').getAttribute('font-family')).toContain('Microsoft YaHei')
  })

  test('preserves opted-in template fonts through sanitization and nested rules while removing shadows', () => {
    const printDocument = renderPrint(`<html><head>
      <style id="template-fonts" data-print-preserve-fonts="true">
        .kacon-order { font-family: 'SimSun', 'Times New Roman', serif !important; text-shadow: 0 1px 2px black !important; }
        @media print { .kacon-order .brand { font-family: Arial; text-shadow: 0 1px 2px black; } }
      </style>
      <style id="legacy-fonts">.legacy { font-family: Arial; }</style>
    </head><body>
      <div class="kacon-order"><span class="brand">KACON</span></div>
      <p class="legacy" style="font-family: Arial">旧模板</p>
    </body></html>`)
    applyPrintTypography(printDocument)

    const templateStyle = printDocument.getElementById('template-fonts')
    const rules = templateStyle.sheet.cssRules
    expect(templateStyle.getAttribute('data-print-preserve-fonts')).toBe('true')
    expect(rules[0].style.getPropertyValue('font-family')).toBe("'SimSun', 'Times New Roman', serif")
    expect(rules[0].style.getPropertyPriority('font-family')).toBe('important')
    expect(rules[0].style.getPropertyValue('text-shadow')).toBe('none')
    expect(rules[0].style.getPropertyPriority('text-shadow')).toBe('important')
    expect(rules[1].cssRules[0].style.getPropertyValue('font-family')).toBe('Arial')
    expect(rules[1].cssRules[0].style.getPropertyValue('text-shadow')).toBe('none')
    expect(printDocument.getElementById('legacy-fonts').sheet.cssRules[0].style.getPropertyValue('font-family')).toContain('Microsoft YaHei')
    expect(printDocument.querySelector('p').style.fontFamily).toContain('Microsoft YaHei')
    expect(printDocument.querySelectorAll('#erp-print-typography')).toHaveLength(1)
  })

  test.each(['false', '', 'TRUE', '1'])('keeps standard typography for a non-true preserve-fonts marker: %j', (marker) => {
    const printDocument = renderPrint(`<html><head>
      <style data-print-preserve-fonts="${marker}">
        .legacy { font-family: 'SimSun'; }
      </style>
    </head><body><p class="legacy">订购单</p></body></html>`)

    expect(printDocument.querySelector('style').sheet.cssRules[0].style.getPropertyValue('font-family')).toContain('Microsoft YaHei')
  })

  test('preserves icon and barcode glyph fonts, sanitization and repeated preview rendering', () => {
    const printDocument = renderPrint(`<!doctype html><html><head><style>
      @font-face { font-family: 'ERP Icons'; src: local('ERP Icons'); }
      .barcode { font-family: 'Libre Barcode 128'; }
    </style></head><body>
      <span class="barcode">ABC123</span>
      <i style="font-family: 'ERP Icons'">&#xe001;</i>
      <p onclick="alert(1)">产品名称</p><script>alert(1)</script>
    </body></html>`)
    applyPrintTypography(printDocument)

    const rules = printDocument.querySelector('style').sheet.cssRules
    expect(rules[0].style.getPropertyValue('font-family')).toBe("'ERP Icons'")
    expect(rules[1].style.getPropertyValue('font-family')).toBe("'Libre Barcode 128'")
    expect(printDocument.querySelector('i').style.fontFamily).toContain('ERP Icons')
    expect(printDocument.querySelector('script')).toBeNull()
    expect(printDocument.querySelector('p').hasAttribute('onclick')).toBe(false)
    expect(printDocument.querySelectorAll('#erp-print-typography')).toHaveLength(1)
  })

  test('preserves explicit template backgrounds and only applies glyph fonts to signature values', () => {
    const printDocument = renderPrint(`<html><head><style>
      .signature-label { font-family: Arial; }
      .signature-handwritten { font-family: SPPLMFONT; }
      td { background: #e0e0e0; }
    </style></head><body>
      <table><tr><td>表头</td></tr></table>
      <span class="signature-label">检验员</span><span class="signature-handwritten">O</span>
    </body></html>`)
    applyPrintTypography(printDocument)
    const rules = printDocument.querySelector('style').sheet.cssRules
    expect(rules[0].style.getPropertyValue('font-family')).toContain('Microsoft YaHei')
    expect(rules[1].style.getPropertyValue('font-family')).toBe('SPPLMFONT')
    expect(rules[2].style.getPropertyValue('background')).toBe('#e0e0e0')
    expect(printDocument.querySelector('#erp-print-typography').textContent).not.toContain('background')
    expect(printDocument.querySelectorAll('#erp-print-spplmfont')).toHaveLength(1)
    expect(printDocument.querySelector('#erp-print-spplmfont').textContent).toContain('data:')
  })
})
