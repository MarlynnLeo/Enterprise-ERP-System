import { describe, expect, test } from 'vitest'
import { auditCsv, formatAmount, lastReview, normalizePosting, separationReason, signedMovementValue, sourceTarget } from '@/views/finance/inventoryPostingModel'

const posting = (id, extra = {}) => ({
  id, postingNo: `PST-${id}`, postingKind: 'movement', sourceType: 'inbound', sourceId: id,
  sourceNo: `IN-${id}`, financeStatus: 'pending', businessApprovedById: 2,
  businessApprovedBy: '业务甲', lines: [], events: [], relatedPostings: [], ...extra,
})

describe('inventory posting data semantics', () => {
  test.each([
    ['normal receipt', 2, '20', '20.00'], ['normal issue', -2, '20', '-20.00'],
    ['reversed receipt', -2, '-20', '-20.00'], ['reversed issue', 2, '-20', '20.00'],
    ['missing cost', 2, null, '-'], ['zero cost', -2, 0, '0.00'],
  ])('shows %s value using the quantity direction', (_, signedQuantity, totalValue, expected) => {
    expect(formatAmount(signedMovementValue({ signedQuantity, totalValue }))).toBe(expected)
  })

  test('normalizes once and preserves missing and signed costs', () => {
    const row = normalizePosting({ posting_no: 'P1', finance_status: 'reversed', total_value: null, lines: [{ signed_quantity: -2, unit_cost: '0.123456', total_value: '-0.246912' }] })
    expect(row.postingNo).toBe('P1')
    expect(row).not.toHaveProperty('posting_no')
    expect(row.lines[0].signedQuantity).toBe(-2)
    expect(formatAmount(row.totalValue)).toBe('-')
    expect(formatAmount(row.lines[0].unitCost, 6)).toBe('0.123456')
    expect(formatAmount(row.lines[0].totalValue)).toBe('-0.25')
    expect(formatAmount(0)).toBe('0.00')
  })

  test('uses the current lifecycle event actor and timestamp for exports', () => {
    const row = posting(1, { financeStatus: 'reversed', financeApprovedLabel: '旧审核人', financeApprovedAt: '2026-01-01', reversedLabel: '冲销审核人', reversedAt: '2026-10-12' })
    expect(lastReview(row)).toEqual({ label: '冲销审核人', time: '2026-10-12' })
    expect(auditCsv([row])).toContain('冲销审核人')
    expect(auditCsv([row])).not.toContain('旧审核人')
  })

  test.each([
    { businessApprovedById: 9 }, { originalBusinessApprovedById: 9 }, { originalFinanceApprovedBy: 9 },
    { originalBusinessApprovedLabel: '财务乙' }, { originalFinanceApprovedLabel: '财务乙' },
  ])('enforces reversal actor separation: %j', identity => {
    expect(separationReason(posting(1, { postingKind: 'reversal', ...identity }), { id: 9, realName: '财务乙' })).toContain('分离')
  })

  test('uses the original business identity when linking a reversal document', () => {
    const reversal = posting(3, { postingKind: 'reversal', originalPostingDocumentId: 1, sourceNo: 'IN-1-REV-1', relatedPostings: [posting(1)] })
    expect(sourceTarget(reversal)).toEqual({ path: '/inventory/inbound', query: { sourceType: 'inbound', sourceId: '1', sourceNo: 'IN-1' } })
    expect(sourceTarget({ ...reversal, relatedPostings: [] })).toBeNull()
    expect(sourceTarget(posting(4, { sourceType: 'outsourced_processing_receipt' })).path).toBe('/purchase/processing-receipts')
  })

  test('escapes CSV delimiters and formulas while retaining negative amounts', () => {
    const text = auditCsv([posting(1, { postingNo: '=HYPERLINK("example")', sourceNo: '含,逗号\n换行', totalValue: '-12.5' })])
    expect(text).toContain('"\'=HYPERLINK(""example"")"')
    expect(text).toContain('"含,逗号\n换行"')
    expect(text).toContain('"-12.5"')
    expect(text.startsWith('\uFEFF')).toBe(true)
  })

  test('normalizes frozen material and warehouse details without losing precision', () => {
    const row = normalizePosting({ id: 1, posting_no: 'PST-1', lines: [{
      line_no: 1, material_id: 100, material_code: 'MAT-001', material_name: '物料A',
      material_specs: 'SPEC-A', unit_name: '个', location_name: '成品仓',
      signed_quantity: 10, unit_cost: '5.123456', total_value: '51.23456',
    }] })
    expect(row.lines[0]).toMatchObject({
      lineNo: 1, materialCode: 'MAT-001', materialName: '物料A', materialSpecs: 'SPEC-A',
      unitName: '个', locationName: '成品仓', unitCost: '5.123456', totalValue: '51.23456',
    })
  })
})
