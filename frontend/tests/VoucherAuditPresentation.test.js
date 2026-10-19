import { expect, test } from 'vitest'
import { appendVoucherPrintAudit } from '@/views/finance/gl/entries/voucherPrintAudit'
import { reversalUnavailableReason, normalizeVoucherPeriod, isOpenVoucherPeriod, voucherStatus } from '@/views/finance/gl/entries/voucherPresentation'

test.each([
  { documentType: 'invoice' }, { transactionType: 'ar_receipt' }, { transactionId: 123 },
  { hasBusinessLinks: true }, { hasBusinessLinks: '1' }, { rawDocumentType: 'payment', documentType: '付款单' },
])('business provenance disables manual reversal: %j', provenance => {
  expect(reversalUnavailableReason({ isPosted: true, documentType: 'manual', ...provenance })).toContain('原业务')
})

test('only a posted unreversed manual voucher is eligible for reversal', () => {
  const entry = { isPosted: true, documentType: 'manual_entry', transactionType: 'manual' }
  expect(reversalUnavailableReason(entry)).toBe('')
  expect(reversalUnavailableReason({ ...entry, isPosted: '0' })).toContain('未过账')
  expect(reversalUnavailableReason({ ...entry, reversalEntryId: 8 })).toContain('已经冲销')
  expect(reversalUnavailableReason({ ...entry, reversalOfEntryId: 8 })).toContain('不能再次')
  expect(voucherStatus({ ...entry, reversalOfEntryId: 8 })).toBe('冲销凭证（已过账）')
})

test.each([
  { periodName: '2026-10', isClosed: true }, { period_name: '2026-10', is_closed: '1' },
  { periodName: '2026-10', isLocked: 1 }, { period_name: '2026-10', is_locked: true },
])('closed and locked periods cannot be offered for reversal: %j', period => {
  const normalized = normalizeVoucherPeriod({ id: 1, start_date: '2026-10-01', endDate: '2026-10-31', ...period })
  expect(normalized.periodName).toBe('2026-10')
  expect(normalized.startDate).toBe('2026-10-01')
  expect(isOpenVoucherPeriod(normalized)).toBe(false)
})

test('string zero period flags stay open', () => {
  expect(isOpenVoucherPeriod(normalizeVoucherPeriod({ isClosed: '0', isLocked: '0' }))).toBe(true)
})

test('print supplement preserves the template, every line, exact FX and missing audit evidence', () => {
  const entry = { entryNumber: '记-1', isPosted: true, reversalEntryId: 7, postingMethod: 'automatic', attachmentCount: 0 }
  const items = Array.from({ length: 26 }, (_, i) => ({ accountCode: `1002${i}`, currencyCode: 'USD', foreignAmount: i === 0 ? 0 : 100, exchangeRate: 6.50000001, baseRoundingAdjustment: i === 0 ? 0 : null }))
  const html = appendVoucherPrintAudit('<html><body><h1>自定义凭证</h1></body></html>', entry, items)
  const document = new DOMParser().parseFromString(html, 'text/html')
  expect(document.querySelector('h1').textContent).toBe('自定义凭证')
  expect(document.querySelectorAll('tbody tr')).toHaveLength(26)
  expect(document.body.textContent).toContain('已冲销')
  expect(document.body.textContent).toContain('附单据：0')
  expect(document.body.textContent).toContain('过账人：未记录')
  expect(document.body.textContent).toContain('自动过账')
  expect(document.querySelector('tbody tr').textContent).toContain('0.006.500000010.00')
  expect(document.querySelectorAll('tbody tr')[1].textContent).toContain('100.006.50000001—')
  expect(html.indexOf('voucher-print-audit')).toBeLessThan(html.indexOf('</body>'))
})

test('print evidence escapes all free text without creating executable markup', () => {
  const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>'
  const html = appendVoucherPrintAudit('<p>原模板</p>', { entryNumber: payload, createdBy: payload, postedBy: payload }, [{ accountName: payload, departmentName: payload, invoiceNumber: payload, currencyCode: payload }])
  const document = new DOMParser().parseFromString(html, 'text/html')
  expect(document.querySelectorAll('img,script')).toHaveLength(0)
  expect(document.body.textContent).toContain(payload)
})

test('print free text preserves replacement tokens and opts out of shrinking long cells', () => {
  const value = "项目 $& $` $' $$ 复核"
  const document = new DOMParser().parseFromString(appendVoucherPrintAudit('<html><body>模板</body></html>', { entryNumber: value }, [{ accountName: '现金', projectName: value }]), 'text/html')
  expect(document.querySelector('h2').textContent).toContain(value)
  expect(document.querySelector('tbody').textContent).toContain(value)
  expect(document.querySelector('td').closest('[data-print-autofit="false"]')).not.toBeNull()
})
