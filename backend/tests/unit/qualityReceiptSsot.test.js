/**
 * 收货/来料计入口径 SSOT：服务层与一致性规则必须同源
 */
const fs = require('fs');
const path = require('path');
const {
  INCOMING_INSPECTION_COUNTED_STATUSES,
  PURCHASE_RECEIPT_COUNTED_STATUSES,
  sqlStringList,
} = require('../../src/constants/qualityReceipt');

describe('quality receipt SSOT', () => {
  it('exports terminal inspection statuses without pending', () => {
    expect(INCOMING_INSPECTION_COUNTED_STATUSES).toEqual(
      expect.arrayContaining(['passed', 'completed'])
    );
    expect(INCOMING_INSPECTION_COUNTED_STATUSES).not.toEqual(
      expect.arrayContaining(['pending', 'draft', 'cancelled'])
    );
    expect(PURCHASE_RECEIPT_COUNTED_STATUSES).toEqual(
      expect.arrayContaining(['confirmed', 'completed'])
    );
  });

  it('PurchaseOrderStatusService and DataConsistencyRules share status lists', () => {
    const root = path.join(__dirname, '../..');
    const service = fs.readFileSync(
      path.join(root, 'src/services/business/PurchaseOrderStatusService.js'),
      'utf8'
    );
    const rules = fs.readFileSync(
      path.join(root, 'src/services/business/DataConsistencyRules.js'),
      'utf8'
    );
    expect(service).toMatch(/constants\/qualityReceipt/);
    expect(rules).toMatch(/constants\/qualityReceipt/);
    expect(service).toMatch(/INCOMING_INSPECTION_COUNTED_STATUSES/);
    expect(rules).toMatch(/INCOMING_INSPECTION_COUNTED_STATUSES/);
    // 禁止服务层再写死 pending 也计入
    expect(service).not.toMatch(/status NOT IN \('cancelled', 'rejected'\)/);
    const list = sqlStringList(INCOMING_INSPECTION_COUNTED_STATUSES);
    expect(list).toContain("'passed'");
    expect(list).not.toContain("'pending'");
  });
});
