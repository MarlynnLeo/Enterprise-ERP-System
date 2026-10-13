import { describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'
import { PREVIEW_DATA } from '@/constants/printConstants'
import { buildPurchaseOrderPrintData } from '@/utils/purchaseOrderPrint'
import { normalizePreviewTemplateSyntax, previewTemplate, processTemplate } from '@/utils/helpers/templateUtils'
import printService from '@/services/printService'

const { templateContent: referenceBaseTemplate } = createRequire(import.meta.url)(
  '../../../backend/migrations/20261010000001_match_purchase_order_reference.js'
)
const { transformContent: addApprovalSignature } = createRequire(import.meta.url)(
  '../../../backend/migrations/20261010000002_add_purchase_order_approval_signature.js'
)
const referenceTemplate = addApprovalSignature(referenceBaseTemplate)

vi.mock('@/api/print', () => ({ printApi: {} }))
vi.mock('@/api/system', () => ({ systemApi: {} }))
vi.mock('@/stores/finance', () => ({ useFinanceStore: () => ({}) }))

const pagedTemplate = `
  {{#each print_pages}}
  <section data-page="{{page_number}}">
    <h1>{{order_no}} / {{supplier_name}}</h1>
    <table><tbody>{{#each items}}
      <tr data-row="{{index}}"><td>{{material_name}}</td><td>{{quantity}}</td><td>{{tax_inclusive_unit_price}}</td><td>{{tax_inclusive_amount}}</td></tr>
    {{/each}}</tbody></table>
    {{#if is_last_page}}<footer>{{subtotal}} / {{tax_amount}} / {{total_amount}} / {{amount_upper}}</footer>{{/if}}
  </section>
  {{/each}}
`

describe('purchase order template preview', () => {
  it('uses the reference order for both API camelCase and editor snake_case template types', () => {
    const apiPreview = previewTemplate({ templateType: 'purchase_order', content: pagedTemplate })
    const editorPreview = previewTemplate({ template_type: 'purchase_order', content: pagedTemplate })
    expect(apiPreview).toBe(editorPreview)
    const document = new DOMParser().parseFromString(apiPreview, 'text/html')
    expect(document.querySelector('h1').textContent).toContain('G2610060022 / 浙江久制电气有限公司')
    expect(document.querySelectorAll('tr')).toHaveLength(8)
    expect(Array.from(document.querySelector('tr').children, cell => cell.textContent)).toEqual([
      'SL 40（红）', '5,000', '2.9085', '14,542.50'
    ])
    expect(document.querySelector('tr[data-row="8"]').textContent).toBe('')
    expect(document.querySelector('footer').textContent).toContain('12,869.47 / 1,673.03 / 14,542.50')
    expect(apiPreview).not.toContain('{{')
  })

  it('normalizes page and row aliases, keeps order fields in nested loops, and shows totals on the final page', () => {
    const data = buildPurchaseOrderPrintData({
      orderNo: 'PO-PAGED', supplierName: '分页供应商',
      items: Array.from({ length: 9 }, (_, index) => ({
        materialName: `物料 ${index + 1}`, quantity: 2, price: 10, taxRate: 13
      }))
    })
    const document = new DOMParser().parseFromString(processTemplate(pagedTemplate, data), 'text/html')
    const pages = document.querySelectorAll('section')
    expect(pages).toHaveLength(2)
    expect(pages[0].querySelector('h1').textContent).toBe('PO-PAGED / 分页供应商')
    expect(pages[1].querySelector('h1').textContent).toBe('PO-PAGED / 分页供应商')
    expect(pages[1].querySelector('tr').dataset.row).toBe('9')
    expect(pages[1].querySelector('tr td').textContent).toBe('物料 9')
    expect(pages[0].querySelector('footer')).toBeNull()
    expect(pages[1].querySelector('footer').textContent).toContain('180.00 / 23.40 / 203.40')
    expect(document.querySelectorAll('tr')).toHaveLength(16)
  })

  it('renders the same sample values through the full print document generator and honors configured margins', () => {
    const html = printService.generatePrintContent({
      name: '采购订购单', content: pagedTemplate,
      paperSize: 'A4', orientation: 'portrait', marginTop: 8, marginRight: 9, marginBottom: 8, marginLeft: 9
    }, PREVIEW_DATA.purchase_order)
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(document.querySelectorAll('tr')).toHaveLength(8)
    expect(document.querySelector('tr').textContent).toContain('2.908514,542.50')
    expect(document.head.textContent).toContain('padding: 8mm 9mm 8mm 9mm')
    expect(document.body.textContent).not.toContain('{{')
  })

  it('preserves legacy preview loops and treats field contents as escaped text', () => {
    const data = { items: [{ index: 1, materialName: '<b>零件</b> $&' }] }
    const content = '{{#items}}{{index}}:{{item.material_name}};{{/items}}{{#each}}{{material_name}}{{/each}}'
    const inlineDocument = new DOMParser().parseFromString(processTemplate(content, data), 'text/html')
    const fullDocument = new DOMParser().parseFromString(printService.generatePrintContent({
      content: normalizePreviewTemplateSyntax(content)
    }, data), 'text/html')
    expect(inlineDocument.body.textContent).toBe('1:<b>零件</b> $&;<b>零件</b> $&')
    expect(fullDocument.body.textContent.trim()).toBe(inlineDocument.body.textContent)
    expect(fullDocument.querySelector('b')).toBeNull()
  })
})

describe('purchase order reference template', () => {
  it.each([
    ['configured signature', 'C', 'approved', 'C', '', '10/09/26'],
    ['unconfigured signature', null, 'approved', null, '陈贤萍', '10/09/26'],
    ['awaiting approval', 'C', 'pending', null, '', ''],
    ['returned to draft', 'C', 'draft', null, '', '']
  ])('renders the approver and approval day only in buyer confirmation: %s', (_label, code, status, signature, name, date) => {
    const data = buildPurchaseOrderPrintData({
      ...PREVIEW_DATA.purchase_order, status, approverId: 42, approverName: '陈贤萍',
      approverSignatureCode: code, approvedAt: '2026-10-09 00:15:00'
    })
    const html = printService.generatePrintContent({ content: referenceTemplate }, data)
    const document = new DOMParser().parseFromString(html, 'text/html')
    const [buyer, supplier] = document.querySelectorAll('.kacon-confirmations > section')
    expect(buyer.querySelector('.signature-handwritten')?.textContent ?? null).toBe(signature)
    expect(buyer.querySelector('.kacon-approver-name')?.textContent ?? '').toBe(name)
    expect(buyer.querySelector('.kacon-approval-date').textContent).toBe(date)
    expect(Array.from(supplier.querySelectorAll('.kacon-signature-line'), line => line.textContent)).toEqual(['', ''])
    expect(document.querySelector('.kacon-meta').textContent).toContain('10/06/26')
    expect(html).not.toContain('{{')
  })

  it('applies the approval binding once and leaves unrelated templates intact', () => {
    expect(addApprovalSignature(referenceTemplate)).toBe(referenceTemplate)
    expect(addApprovalSignature('<p>采购订单自定义模板</p>')).toBe('<p>采购订单自定义模板</p>')
  })

  it.each([
    [1, '20.00', '2.60', '22.60', '贰拾贰元陆角整'],
    [8, '160.00', '20.80', '180.80', '壹佰捌拾元捌角整'],
    [9, '180.00', '23.40', '203.40', '贰佰零叁元肆角整']
  ])('renders all %i lines with ten columns, padded pages and final-page totals', (count, subtotal, tax, total, uppercase) => {
    const order = {
      orderNo: `PO-${count} <em data-injected="order">动态订单</em> &`,
      supplierCode: `SUP-${count}`,
      supplierName: `<b data-injected="supplier">动态供应商 ${count}</b> & 加工厂`,
      contactPerson: '采购联系人', supplierFax: '0577-12345678', senderName: '采购发件人',
      orderDate: '2026-10-06', expectedDeliveryDate: '2026-10-30',
      technicalRequirements: '<mark data-injected="requirements">按图纸执行</mark>\n逐件包装',
      items: Array.from({ length: count }, (_, index) => ({
        materialName: `物料 ${index + 1} <i data-injected="material">红色</i>`,
        specification: `规格 ${index + 1}`,
        remarks: `备注 ${index + 1}\n& 请复核`,
        materialCode: `M-${index + 1}`, unitName: '个',
        quantity: 2, unitPrice: 10, taxRate: 13, deliveryDate: '2026-11-02'
      }))
    }
    const html = printService.generatePrintContent({
      name: '采购订购单', content: referenceTemplate, paperSize: 'A4', orientation: 'portrait'
    }, buildPurchaseOrderPrintData(order))
    const document = new DOMParser().parseFromString(html, 'text/html')
    const pages = Array.from(document.querySelectorAll('.kacon-order'))
    expect(pages).toHaveLength(Math.ceil(count / 8))

    pages.forEach((page, pageIndex) => {
      expect(page.dataset.page).toBe(String(pageIndex + 1))
      expect(page.querySelectorAll('.kacon-items tbody tr')).toHaveLength(8)
      const meta = page.querySelector('.kacon-meta').textContent
      for (const field of ['orderNo', 'supplierCode', 'supplierName', 'contactPerson', 'supplierFax', 'senderName']) {
        expect(meta).toContain(order[field])
      }
      expect(meta).toContain('10/06/26')
      expect(page.querySelector('.kacon-technical-text').textContent).toBe(order.technicalRequirements)
      if (pageIndex < pages.length - 1) {
        expect(page.querySelector('.kacon-total-values')).toBeNull()
        expect(page.querySelector('.kacon-items tfoot').textContent).toContain('订单合计见末页')
      }
    })

    const rows = Array.from(document.querySelectorAll('.kacon-items tbody tr'))
    expect(rows).toHaveLength(pages.length * 8)
    rows.forEach((row, index) => {
      const cells = Array.from(row.cells, cell => cell.textContent)
      expect(cells).toHaveLength(10)
      if (index < count) {
        const item = order.items[index]
        expect(cells).toEqual([
          String(index + 1), item.materialName, item.specification, item.remarks,
          item.materialCode, '个', '2', '11.3', '22.60', '11/02/26'
        ])
      } else {
        expect(cells).toEqual([String(index + 1), ...Array(9).fill('')])
      }
    })

    expect(document.querySelectorAll('.kacon-total-values')).toHaveLength(1)
    const finalPage = pages[pages.length - 1]
    expect(finalPage.querySelector('.kacon-continuation')).toBeNull()
    expect(finalPage.querySelector('.kacon-total-values').textContent.replace(/\s+/g, '')).toBe(
      `${subtotal}税额合计：￥${tax}价税合计：￥${total}${uppercase}`
    )
    expect(document.querySelector('[data-injected]')).toBeNull()
    expect(html).not.toContain('{{')
    expect(html).not.toContain('}}')
  })
})
