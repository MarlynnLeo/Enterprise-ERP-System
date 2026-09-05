import { describe, expect, it, vi } from 'vitest'
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: {} }))
vi.mock('@/api', () => ({
  qualityApi: {},
  purchaseApi: {},
  baseDataApi: {}
}))
import { extractMaterialNameSimple } from '@/utils/inspectionHelpers'
import { autoFitPrintDocument, findPrintAutoFitCells } from '@/utils/printAutoFit'

describe('inspection material name compatibility', () => {
  it('uses the API itemName alias before falling back to other fields', () => {
    expect(extractMaterialNameSimple({
      itemName: '十一字米字圆柱头带内齿垫圈螺钉',
      materialCode: '3011001137'
    })).toBe('十一字米字圆柱头带内齿垫圈螺钉')
  })

  it('supports legacy snake_case material names and ignores placeholders', () => {
    expect(extractMaterialNameSimple({
      itemName: '未知物料',
      material_name: '历史物料名称'
    })).toBe('历史物料名称')
  })
})

describe('print table auto-fit', () => {
  it('finds QRZK columns by col class and custom columns by header text', () => {
    const documentWithClasses = document.implementation.createHTMLDocument('classes')
    documentWithClasses.body.innerHTML = `
      <table>
        <colgroup><col class="project"><col class="standard"><col class="method"></colgroup>
        <thead><tr><th>项目</th><th>检验要求/标准</th><th>检测方法</th></tr></thead>
        <tbody><tr><td>A</td><td>B</td><td>C</td></tr></tbody>
      </table>`
    expect(findPrintAutoFitCells(documentWithClasses).map(cell => cell.textContent)).toEqual(['A', 'B', 'C'])

    const documentWithHeaders = document.implementation.createHTMLDocument('headers')
    documentWithHeaders.body.innerHTML = `
      <table>
        <thead><tr><th>序号</th><th>项目名称</th><th>检验标准</th><th>检验方法</th></tr></thead>
        <tbody><tr><td>1</td><td>A</td><td>B</td><td>C</td></tr></tbody>
      </table>`
    expect(findPrintAutoFitCells(documentWithHeaders).map(cell => cell.textContent)).toEqual(['A', 'B', 'C'])
  })

  it('applies per-column rules without clipping content', () => {
    const printDocument = document.implementation.createHTMLDocument('fit')
    printDocument.body.innerHTML = `
      <table>
        <thead><tr><th>项目</th><th>检验要求/标准</th><th>检测方法</th><th>备注</th></tr></thead>
        <tbody><tr><td style="font-size:10px">短</td><td style="font-size:10px">检验要求文字超过十四个字后允许换行显示</td><td style="font-size:10px">方法</td><td>{无 }</td></tr></tbody>
      </table>`
    const cells = Array.from(printDocument.querySelectorAll('tbody td'))
    cells.forEach((cell, index) => {
      Object.defineProperty(cell, 'clientWidth', { configurable: true, value: index === 1 ? 45 : 100 })
      Object.defineProperty(cell, 'scrollWidth', {
        configurable: true,
        get: () => cell.textContent.length * Number.parseFloat(cell.style.fontSize || '10') * 2
      })
    })

    expect(autoFitPrintDocument(printDocument)).toBe(4)
    expect(Number.parseFloat(cells[0].style.fontSize || '10')).toBe(10)
    expect(cells[0].style.whiteSpace).toBe('nowrap')
    expect(cells[1].style.whiteSpace).toBe('normal')
    expect(cells[1].style.wordBreak).toBe('break-all')
    expect(Number.parseFloat(cells[1].style.fontSize || '10')).toBeGreaterThanOrEqual(10)
    expect(cells[2].style.whiteSpace).toBe('nowrap')
    expect(cells[3].style.whiteSpace).toBe('nowrap')
    cells.forEach(cell => {
      expect(cell.style.overflow).not.toBe('hidden')
      expect(cell.style.textOverflow).not.toBe('clip')
    })
  })

  it('shrinks projects only after five characters and wraps when the minimum still cannot fit', () => {
    const printDocument = document.implementation.createHTMLDocument('project-rules')
    printDocument.body.innerHTML = `
      <table>
        <thead><tr><th>项目</th><th>备注</th></tr></thead>
        <tbody><tr><td style="font-size:10px">六个字项目名称</td><td>{无 }</td></tr></tbody>
      </table>`
    const cells = Array.from(printDocument.querySelectorAll('tbody td'))
    cells.forEach((cell, index) => {
      Object.defineProperty(cell, 'clientWidth', { configurable: true, value: index === 0 ? 20 : 100 })
      Object.defineProperty(cell, 'scrollWidth', {
        configurable: true,
        get: () => cell.textContent.length * Number.parseFloat(cell.style.fontSize || '10') * 2
      })
    })

    autoFitPrintDocument(printDocument, { minFontSize: 5 })
    expect(Number.parseFloat(cells[0].style.fontSize)).toBeLessThan(10)
    expect(cells[0].style.overflow).toBe('visible')
    expect(cells[0].style.whiteSpace).toBe('normal')
    expect(cells[1].style.whiteSpace).toBe('nowrap')
  })
})
