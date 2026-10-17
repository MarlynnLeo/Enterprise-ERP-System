import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))


const businessPages = [
  ['../src/views/inventory/InventoryInbound.vue', 'inbound'],
  ['../src/views/inventory/InventoryOutbound.vue', 'outbound'],
  ['../src/views/inventory/InventoryTransfer.vue', 'transfer'],
  ['../src/views/inventory/ManualTransaction.vue', 'manual_transaction'],
  ['../src/views/inventory/InventoryCheck.vue', 'check'],
  ['../src/views/purchase/PurchaseReceipts.vue', 'purchase_receipt'],
  ['../src/views/sales/SalesOutbound.vue', 'sales_outbound'],
  ['../src/views/sales/SalesReturns.vue', 'sales_return'],
  ['../src/views/purchase/PurchaseReturns.vue', 'purchase_return'],
  ['../src/views/sales/SalesExchanges.vue', 'sales_exchange'],
  ['../src/views/quality/ScrapRecords.vue', 'scrap_record'],
  ['../src/views/purchase/OutsourcedProcessing.vue', 'outsourced_processing_material'],
  ['../src/views/purchase/ReceiptDialog.vue', 'outsourced_processing_receipt']
]

describe('business document inline finance approval', () => {
  test.each(businessPages)('is embedded in %s with source type %s', (relativePath, sourceType) => {
    const source = fs.readFileSync(path.resolve(testDir, relativePath), 'utf8')

    expect(source).toContain('<InventoryApprovalPanel')
    expect(source).toContain(`source-type="${sourceType}"`)
    expect(source).not.toContain('审批流')
  })

  test.each(businessPages)('keeps finance mutations out of the source document in %s', (relativePath) => {
    const source = fs.readFileSync(path.resolve(testDir, relativePath), 'utf8')

    expect(source).not.toContain('v-permission="\'finance:inventory:approve\'"')
  })

  test('only shows the outsourced receipt approval shortcut when a posting record exists', () => {
    const source = fs.readFileSync(
      path.resolve(testDir, '../src/views/purchase/OutsourcedReceipts.vue'),
      'utf8'
    )

    expect(source).toContain('approval_status')
    expect(source).toContain('approvalStatus')
    expect(source).toContain(
      'authStore.canViewInventoryApproval && scope.row.approvalStatus'
    )
  })

  test('does not expose a non-finance approval action for transfers', () => {
    const source = fs.readFileSync(
      path.resolve(testDir, '../src/views/inventory/InventoryTransfer.vue'),
      'utf8'
    )

    expect(source).not.toContain('批准调拨单')
    expect(source).toContain("['pending', 'approved'].includes(scope.row.status)")
  })

  test('keeps transfer list, detail, and form fields aligned with the camelCase API contract', () => {
    const source = fs.readFileSync(
      path.resolve(testDir, '../src/views/inventory/InventoryTransfer.vue'),
      'utf8'
    )

    expect(source).toContain('prop="fromLocationName"')
    expect(source).toContain('prop="toLocationName"')
    expect(source).toContain('transferDetail.transferNo')
    expect(source).toContain('transferDetail.transferDate')
    expect(source).toContain('transferDetail.fromLocationName')
    expect(source).toContain('transferDetail.toLocationName')
    expect(source).toContain('transferNo: searchForm.transfer_no')
    expect(source).toContain('transferDate: transferForm.transfer_date')
    expect(source).toContain('fromLocationId: transferForm.from_location_id')
    expect(source).toContain('toLocationId: transferForm.to_location_id')
    expect(source).toContain('inventoryApi.updateTransfer(transferForm.id, formData)')
  })
})
