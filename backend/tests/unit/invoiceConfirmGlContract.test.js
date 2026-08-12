/**
 * 业财契约：发票确认与总账凭证必须同事务路径（源码级门禁）
 * 防止再引入「只改 status 不写 GL」的旁路
 */
const fs = require('fs');
const path = require('path');

describe('invoice confirm ↔ GL same-transaction contract', () => {
  const read = (rel) =>
    fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');

  it('AP updateInvoiceStatus generates confirmation entry before status update', () => {
    const source = read('src/models/ap.js');
    const statusFn = source.indexOf('updateInvoiceStatus: async');
    expect(statusFn).toBeGreaterThan(-1);
    const slice = source.slice(statusFn, statusFn + 4500);
    const glCall = slice.indexOf('createInvoiceConfirmationEntry');
    const statusUpdate = slice.indexOf("SET status = ?");
    expect(glCall).toBeGreaterThan(-1);
    expect(statusUpdate).toBeGreaterThan(-1);
    expect(glCall).toBeLessThan(statusUpdate);
    expect(slice).toMatch(/beginTransaction/);
    expect(slice).toMatch(/commit/);
    expect(slice).toMatch(/rollback/);
  });

  it('AR updateInvoiceStatus generates confirmation entry before status update', () => {
    const source = read('src/models/ar.js');
    const statusFn = source.indexOf('updateInvoiceStatus: async');
    expect(statusFn).toBeGreaterThan(-1);
    const slice = source.slice(statusFn, statusFn + 4500);
    const glCall = slice.indexOf('createInvoiceConfirmationEntry');
    const statusUpdate = slice.indexOf("SET status = ?");
    expect(glCall).toBeGreaterThan(-1);
    expect(statusUpdate).toBeGreaterThan(-1);
    expect(glCall).toBeLessThan(statusUpdate);
    expect(slice).toMatch(/beginTransaction/);
    expect(slice).toMatch(/commit/);
  });

  it('create paths generate GL for confirmed invoices unless skip_gl_entry', () => {
    for (const rel of ['src/models/ap.js', 'src/models/ar.js']) {
      const source = read(rel);
      expect(source).toMatch(/skip_gl_entry/);
      expect(source).toMatch(/createInvoiceConfirmationEntry/);
      // 创建为已确认时走 createInvoiceConfirmationEntry
      const createIdx = source.indexOf('createInvoice: async');
      expect(createIdx).toBeGreaterThan(-1);
      const createSlice = source.slice(createIdx, createIdx + 8000);
      expect(createSlice).toMatch(/INVOICE_STATUS\.CONFIRMED/);
      expect(createSlice).toMatch(/createInvoiceConfirmationEntry/);
    }
  });

  it('exposes ensureConfirmationGlEntry without status-machine bypass', () => {
    for (const rel of ['src/models/ap.js', 'src/models/ar.js']) {
      const source = read(rel);
      expect(source).toMatch(/ensureConfirmationGlEntry\s*=\s*async/);
      const idx = source.indexOf('ensureConfirmationGlEntry');
      const slice = source.slice(idx, idx + 1200);
      expect(slice).toMatch(/createInvoiceConfirmationEntry/);
      // 禁止再通过「先改草稿再确认」旁路补凭证
      expect(slice).not.toMatch(/SET status\s*=\s*'草稿'/);
    }
  });
});
