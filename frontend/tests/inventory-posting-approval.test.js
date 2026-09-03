import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(
  testDir,
  '../src/views/finance/inventory/InventoryPostingApproval.vue'
)

describe('InventoryPostingApproval API field contract', () => {
  test('uses the camelCase fields returned by the API interceptor', () => {
    const source = fs.readFileSync(componentPath, 'utf8')

    for (const field of [
      'postingNo',
      'sourceType',
      'sourceNo',
      'transactionDate',
      'financeStatus',
      'lineCount',
      'businessApprovedBy',
      'financeApprovedLabel',
      'postingKind',
      'signedQuantity',
      'batchNumber',
      'snapshotHash'
    ]) {
      expect(source).toContain(field)
    }

    expect(source).not.toMatch(/row\.finance_status/)
    expect(source).not.toMatch(/row\.posting_kind/)
    expect(source).not.toMatch(/row\.source_no/)
    expect(source).not.toMatch(/detail\.posting_no/)
    expect(source).not.toMatch(/prop="(?:posting_no|source_no|finance_status|line_count)"/)
  })
})
