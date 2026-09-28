import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import printService, { normalizePrintData } from '@/services/printService'
import { renderPrintTemplate } from '@/utils/cspSafePrintRenderer'

vi.mock('@/api/print', () => ({ printApi: {} }))
vi.mock('@/api/system', () => ({ systemApi: {} }))
vi.mock('@/utils/cspSafePrintRenderer', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual, renderPrintTemplate: vi.fn(actual.renderPrintTemplate) }
})

afterEach(() => {
  vi.useRealTimers()
  document.querySelectorAll('iframe').forEach(frame => frame.remove())
})

describe('print data and template generation', () => {
  it('preserves names and prefers configured glyphs over legacy signature values', () => {
    expect(normalizePrintData({ inspectorName: '王晓敏', inspectorSignatureCode: 'p', inspectorSignature: 'O' }))
      .toMatchObject({ inspector_name: '王晓敏', inspector_signature: 'P', inspector_signature_code: 'P' })
    expect(normalizePrintData({ inspectorName: '王晓敏' }).inspector_signature).toBeUndefined()
    expect(normalizePrintData({ inspectorName: 'Alice', inspectorSignatureCode: '' }).inspector_signature).toBe('')
    expect(normalizePrintData({ inspector_signature_code: 'c', inspectorSignatureCode: 'p' }).inspector_signature).toBe('C')
  })

  it('keeps zero margins and escapes the title while rendering conditional rows', () => {
    const html = printService.generatePrintContent({ name: '</title><p>unsafe</p>', marginTop: 0, content: '{{#each items}}<p>{{quantity}}</p>{{/each}}' }, { items: [{ quantity: 0 }] })
    const result = new DOMParser().parseFromString(html, 'text/html')
    expect(result.title).toBe('</title><p>unsafe</p>')
    expect(result.body.textContent.trim()).toBe('0')
    expect(result.querySelectorAll('#erp-print-spplmfont')).toHaveLength(1)
    expect(result.head.textContent).toContain('padding: 0mm 10mm 10mm 10mm')
  })

  it('propagates rendering failures instead of printing a partially substituted template', () => {
    renderPrintTemplate.mockImplementationOnce(() => { throw new Error('template error') })
    expect(() => printService.generatePrintContent({ content: '<p>{{quantity}}</p>' }, { quantity: 0 }))
      .toThrow('template error')
  })
})

describe('print document lifecycle', () => {
  const setupPrint = (fonts) => {
    const createElement = document.createElement.bind(document)
    const print = vi.fn(function () { this.dispatchEvent(new Event('afterprint')) })
    vi.spyOn(document, 'createElement').mockImplementation((name, options) => {
      const element = createElement(name, options)
      if (name === 'iframe') {
        const appendChild = document.body.appendChild.bind(document.body)
        vi.spyOn(document.body, 'appendChild').mockImplementationOnce(child => {
          const appended = appendChild(child)
          child.contentWindow.print = print
          child.contentWindow.focus = vi.fn()
          Object.defineProperty(child.contentDocument, 'fonts', { value: fonts, configurable: true })
          return appended
        })
      }
      return element
    })
    return print
  }

  it('waits for font decoding beyond the old 600 ms cutoff and observes synchronous afterprint', async () => {
    vi.useFakeTimers()
    let finishFont
    const fontReady = new Promise(resolve => { finishFont = resolve })
    const print = setupPrint({ load: vi.fn(() => fontReady), ready: Promise.resolve() })
    const result = printService.printDocument('<span class="signature-font">O</span>')
    await vi.advanceTimersByTimeAsync(1000)
    expect(print).not.toHaveBeenCalled()
    await expect(printService.printDocument('<p>another</p>')).rejects.toThrow('已有打印任务')
    finishFont([{}])
    await result
    expect(print).toHaveBeenCalledOnce()
    expect(document.getElementById('__erp_print_frame__')).toBeNull()
  })

  it('rejects failed fonts and cleans up without printing substitute glyphs', async () => {
    const print = setupPrint({ load: vi.fn().mockRejectedValue(new Error('font failed')), ready: Promise.resolve() })
    await expect(printService.printDocument('<span class="signature-font">O</span>')).rejects.toThrow('font failed')
    expect(print).not.toHaveBeenCalled()
    expect(document.getElementById('__erp_print_frame__')).toBeNull()
  })

  it('cleans up when the browser rejects the print call', async () => {
    const print = setupPrint({ load: vi.fn().mockResolvedValue([]), ready: Promise.resolve() })
    print.mockImplementation(() => { throw new Error('printer unavailable') })
    await expect(printService.printDocument('<p>report</p>')).rejects.toThrow('printer unavailable')
    await flushPromises()
    expect(document.getElementById('__erp_print_frame__')).toBeNull()
  })
})
