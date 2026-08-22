import { describe, expect, it } from 'vitest'
import { renderPrintTemplate } from '@/utils/cspSafePrintRenderer'

describe('cspSafePrintRenderer', () => {
  it('interpolates simple paths and escapes HTML', () => {
    const html = renderPrintTemplate('<div>{{name}} {{missing}}</div>', {
      name: '<b>Acme</b>',
    })
    expect(html).toBe('<div>&lt;b&gt;Acme&lt;/b&gt; </div>')
  })

  it('renders each blocks with index', () => {
    const html = renderPrintTemplate(
      '<ul>{{#each items}}<li>{{index}}:{{name}}</li>{{/each}}</ul>',
      { items: [{ name: 'A' }, { name: 'B' }] }
    )
    expect(html).toBe('<ul><li>0:A</li><li>1:B</li></ul>')
  })

  it('supports if/else and unless', () => {
    expect(
      renderPrintTemplate('{{#if ok}}Y{{else}}N{{/if}}', { ok: true })
    ).toBe('Y')
    expect(
      renderPrintTemplate('{{#if ok}}Y{{else}}N{{/if}}', { ok: false })
    ).toBe('N')
    expect(
      renderPrintTemplate('{{#unless ok}}hidden{{/unless}}', { ok: false })
    ).toBe('hidden')
  })

  it('supports helpers eq/default/formatNumber', () => {
    expect(renderPrintTemplate('{{eq a b}}', { a: 1, b: 1 })).toBe('true')
    expect(renderPrintTemplate('{{default title "单据"}}', {})).toBe('单据')
    expect(renderPrintTemplate('{{formatNumber amount 2}}', { amount: 12.3 })).toBe(
      '12.30'
    )
  })

  it('supports triple-stash unescaped output', () => {
    expect(renderPrintTemplate('{{{html}}}', { html: '<b>x</b>' })).toBe('<b>x</b>')
  })
})
