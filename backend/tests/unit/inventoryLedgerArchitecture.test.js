const fs = require('fs');
const path = require('path');

function collectFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'coverage') continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('inventory ledger architecture', () => {
  it('keeps runtime ledger inserts behind InventoryService.updateStock', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const runtimeRoots = ['src', 'scripts'].map((name) => path.join(backendRoot, name));
    const allowedFile = path.normalize(path.join(backendRoot, 'src/services/InventoryService.js'));

    const offenders = [];
    const allowedPrefixes = [
      path.normalize(path.join(backendRoot, 'scripts' + path.sep + 'e2e-')),
      path.normalize(path.join(backendRoot, 'scripts' + path.sep + 'seed')),
      path.normalize(path.join(backendRoot, 'scripts' + path.sep + 'test-')),
    ];
    for (const root of runtimeRoots) {
      for (const file of collectFiles(root)) {
        const normalized = path.normalize(file);
        if (normalized === allowedFile) continue;
        if (allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) continue;

        const source = fs.readFileSync(file, 'utf8');
        if (/insert\s+into\s+inventory_ledger/i.test(source)) {
          offenders.push(path.relative(backendRoot, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('does not pass batchNumber: null into InventoryService.updateStock call sites', () => {
    // 入库路径 batchNumber:null 会硬失败；出库路径应省略字段走 FIFO，而不是显式 null
    const backendRoot = path.resolve(__dirname, '../..');
    const srcRoot = path.join(backendRoot, 'src');
    const allowedRelative = new Set([
      // 成本归集内存对象字段，不调用 updateStock
      path.normalize('services/business/CostAccountingService.js'),
    ]);

    const offenders = [];
    for (const file of collectFiles(srcRoot)) {
      const relative = path.normalize(path.relative(path.join(backendRoot, 'src'), file));
      if (allowedRelative.has(relative)) continue;

      const source = fs.readFileSync(file, 'utf8');
      if (!/updateStock\s*\(/.test(source)) continue;
      if (/batchNumber\s*:\s*null/.test(source)) {
        offenders.push(relative.replace(/\\/g, '/'));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps print routes on canonical print permissions', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const source = fs.readFileSync(path.join(backendRoot, 'src/routes/printRoutes.js'), 'utf8');

    expect(source).toContain('system:print:create');
    expect(source).toContain('system:print:update');
    expect(source).not.toMatch(/system:print:(add|edit|template:)/);
  });

  it('keeps inspection receipts linked and reconciles after the status change', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const receiptService = fs.readFileSync(
      path.join(backendRoot, 'src/services/quality/PurchaseReceiptService.js'),
      'utf8'
    );
    const receiptController = fs.readFileSync(
      path.join(backendRoot, 'src/controllers/business/purchase/purchaseReceiptController.js'),
      'utf8'
    );
    const orderStatusService = fs.readFileSync(
      path.join(backendRoot, 'src/services/business/PurchaseOrderStatusService.js'),
      'utf8'
    );

    expect(receiptService).toContain('receipt_id, order_item_id, material_id');
    expect(receiptService).toContain('context.orderItemId');

    const statusUpdateIndex = receiptController.indexOf(
      'await client.query(updateQuery, updateParams);'
    );
    const reconciliationIndex = receiptController.indexOf(
      'PurchaseOrderStatusService.syncOrderItemReceivedFromReceipts('
    );
    expect(statusUpdateIndex).toBeGreaterThan(-1);
    expect(reconciliationIndex).toBeGreaterThan(statusUpdateIndex);
    expect(orderStatusService).toContain('FROM quality_inspections qi');
    expect(orderStatusService).toContain('SELECT GREATEST(');
  });

  it('keeps production cost periods stable when records are edited later', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    const costClosing = fs.readFileSync(
      path.join(backendRoot, 'src/services/business/CostClosingService.js'),
      'utf8'
    );
    const periodEnd = fs.readFileSync(
      path.join(backendRoot, 'src/services/business/PeriodEndService.js'),
      'utf8'
    );

    expect(costClosing).not.toContain(
      'COALESCE(completed_at, actual_end_date, updated_at)'
    );
    expect(costClosing).not.toContain(
      'COALESCE(pt.completed_at, pt.actual_end_date, pt.updated_at)'
    );
    expect(periodEnd).not.toContain(
      'COALESCE(pt.completed_at, pt.actual_end_date, pt.updated_at)'
    );
  });
});
