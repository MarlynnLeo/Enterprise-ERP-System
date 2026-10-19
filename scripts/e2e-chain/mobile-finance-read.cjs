'use strict';
process.env.CHAIN_MOBILE = '1';
const assert = require('node:assert/strict');
const { createRuntime } = require('./runtime.cjs');
const unwrap = body => body?.data ?? body;
const rowsOf = body => { const data = unwrap(body); return data.entries || data.list || data.invoices || data; };
const money = value => (Number(value) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function main() {
  const ctx = await createRuntime('mobile-finance-read');
  try {
    const page = ctx.page;
    const navigate = async (route, endpoint) => {
      const pending = page.waitForResponse(response => new URL(response.url()).pathname === endpoint && response.request().method() === 'GET');
      await page.goto(ctx.baseUrl + route);
      const response = await pending;
      assert.equal(response.status(), 200);
      await page.waitForLoadState('networkidle');
      return unwrap(await response.json());
    };
    const currentEntries = await navigate('/finance/gl/entries', '/api/finance/entries');
    const posted = rowsOf(currentEntries).find(row => row.isPosted && !row.isReversed && row.totalDebit > 0);
    assert.ok(posted, 'Fixture needs at least one posted voucher with a nonzero amount');
    await ctx.step('移动凭证过账筛选请求及卡片一致', async () => {
      for (const [label, value] of [['已过账', true], ['草稿', false]]) {
        const pending = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === '/api/finance/entries' && url.searchParams.get('isPosted') === String(value);
        });
        await page.locator('.filter-chip').filter({ hasText: new RegExp('^' + label) }).click();
        const response = await pending;
        assert.equal(response.status(), 200);
        const rows = rowsOf(await response.json());
        assert.ok(rows.length > 0);
        assert.ok(rows.every(row => row.isPosted === value));
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.list-card').count(), rows.length);
        const statuses = await page.locator('.status-tag').allTextContents();
        assert.ok(statuses.every(text => value ? ['已过账', '已冲销'].includes(text) : text === '草稿'));
        await ctx.record('posting-filter', { label, isPosted: value, ids: rows.map(row => row.id), statuses });
      }
    });
    await ctx.step('移动凭证按显示号摘要技术编号搜索', async () => {
      await page.locator('.filter-chip').filter({ hasText: /^全部/ }).click();
      await page.waitForLoadState('networkidle');
      for (const term of [posted.entryNumber, posted.description || posted.summary, posted.technicalId].filter(Boolean)) {
        const pending = page.waitForResponse(response => {
          const url = new URL(response.url());
          return url.pathname === '/api/finance/entries' && url.searchParams.get('search') === term;
        });
        await page.getByPlaceholder('搜索凭证号或摘要').fill(term);
        const response = await pending;
        const rows = rowsOf(await response.json());
        assert.equal(response.status(), 200);
        assert.ok(rows.some(row => row.id === posted.id));
        assert.ok(rows.every(row => [row.entryNumber, row.description, row.summary, row.technicalId].some(text => String(text || '').includes(term))));
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('.list-card').count(), rows.length);
        await ctx.record('search', { term, ids: rows.map(row => row.id) });
      }
    });
    await ctx.step('移动凭证详情金额状态和接口一致', async () => {
      const entryData = await navigate('/finance/gl/entries/' + posted.id, '/api/finance/entries/' + posted.id);
      const entry = entryData.entry || entryData;
      const sum = field => Math.round(entry.items.reduce((total, item) => total + Number(item[field]), 0) * 100) / 100;
      const debit = sum('debitAmount'), credit = sum('creditAmount');
      assert.ok(debit > 0, 'Detail must exercise real nonzero voucher lines');
      assert.equal(entry.totalDebit, debit, 'Detail debit total differs from its own lines');
      assert.equal(entry.totalCredit, credit, 'Detail credit total differs from its own lines');
      assert.equal(entry.totalDebit, posted.totalDebit, 'Detail debit differs from the list');
      assert.equal(entry.totalCredit, posted.totalCredit, 'Detail credit differs from the list');
      assert.equal((await page.locator('.entry-number').innerText()).trim(), entry.entryNumber);
      assert.deepEqual(await page.locator('.amount-value').allTextContents(), ['¥' + money(entry.totalDebit), '¥' + money(entry.totalCredit)]);
      assert.equal((await page.locator('.entry-status').innerText()).trim(), '已过账');
      assert.equal(await page.getByText('过账', { exact: true }).count(), 0);
      assert.ok(await page.locator('.item-account').count() > 0);
      await ctx.record('entry-detail', { id: entry.id, totalDebit: entry.totalDebit, totalCredit: entry.totalCredit, lineDebit: debit, lineCredit: credit, listDebit: posted.totalDebit, listCredit: posted.totalCredit });
    });
    await ctx.step('移动资产负债表金额与科目明细和接口一致', async () => {
      const data = await navigate('/finance/reports/balance-sheet', '/api/finance/reports/balance-sheet');
      const expected = [data.summary.assetsTotal, data.summary.liabilitiesTotal, data.summary.equityTotal].map(value => '¥' + money(value));
      assert.deepEqual(await page.locator('.metric-value').allTextContents(), expected);
      const groups = [data.assets, data.liabilities, data.equity];
      if (data.summary.isBalanced === false) {
        assert.ok((await page.locator('.balance-warning').innerText()).includes('差额 ¥' + money(data.summary.balanceDifference)));
      } else {
        assert.equal(await page.locator('.balance-warning').count(), 0);
      }
      assert.equal(await page.locator('.section-item').count(), groups.reduce((count, group) => count + group.items.length, 0));
      assert.deepEqual((await page.locator('.item-name').allTextContents()).map(text => text.trim()), groups.flatMap(group => group.items.map(row => row.name)));
      assert.deepEqual((await page.locator('.item-amount').allTextContents()).map(text => text.trim()), groups.flatMap(group => group.items.map(row => '¥' + money(row.amount))));
      await ctx.record('balance-sheet', { summary: data.summary, items: groups.map(group => ({ title: group.title, count: group.items.length })) });
    });
    await ctx.step('移动利润表金额及分层明细和接口一致', async () => {
      const data = await navigate('/finance/reports/income-statement', '/api/finance/reports/income-statement');
      const amount = code => data.find(row => row.code === code)?.amount || 0;
      const expected = [amount('INCOME'), -amount('COST'), amount('NET_INCOME')].map(value => '¥' + money(value));
      assert.deepEqual(await page.locator('.metric-value').allTextContents(), expected);
      assert.equal(await page.locator('.section-title').count(), data.length);
      assert.deepEqual(await page.locator('.section-title').allTextContents(), data.map(row => row.name));
      assert.deepEqual(await page.locator('.section-total > span:last-child').allTextContents(), data.map(row => '¥' + money(row.amount)));
      const detailRows = data.flatMap(row => row.children || []);
      assert.deepEqual((await page.locator('.item-name').allTextContents()).map(text => text.trim()), detailRows.map(row => row.name));
      assert.deepEqual((await page.locator('.item-amount').allTextContents()).map(text => text.trim()), detailRows.map(row => '¥' + money(row.amount)));
      await ctx.record('income-statement', { rows: data.map(row => ({ code: row.code, amount: row.amount })) });
    });
    for (const kind of ['ap', 'ar']) {
      await ctx.step(`移动${kind.toUpperCase()}发票金额与搜索筛选一致`, async () => {
        const endpoint = '/api/finance/' + kind + '/invoices';
        const data = await navigate('/finance/' + kind + '/invoices', endpoint);
        const initialRows = rowsOf(data);
        assert.ok(initialRows.length > 0, 'Invoice checks need real nonempty fixture data');
        const amounts = await page.locator('.detail-item').filter({ hasText: /^发票金额/ }).locator('.detail-value').allTextContents();
        assert.deepEqual(amounts, initialRows.map(row => '¥' + money(row.totalAmount)));
        if (kind === 'ar') {
          for (const [label, status] of [['待收款', '已确认'], ['部分收款', '部分付款'], ['已收款', '已付款'], ['逾期', '已逾期']]) {
            const pending = page.waitForResponse(response => {
              const url = new URL(response.url());
              return url.pathname === endpoint && url.searchParams.get('status') === status;
            });
            await page.locator('.filter-chip').filter({ hasText: new RegExp('^' + label) }).click();
            const response = await pending;
            assert.equal(response.status(), 200);
            const rows = rowsOf(await response.json());
            assert.ok(rows.every(row => row.status === status));
            await page.waitForLoadState('networkidle');
            assert.equal(await page.locator('.list-card').count(), rows.length);
            if (!rows.length) assert.ok(await page.getByText('暂无数据', { exact: true }).isVisible());
            await ctx.record('ar-status', { status, ids: rows.map(row => row.id) });
          }
          await page.locator('.filter-chip').filter({ hasText: /^全部/ }).click();
          await page.waitForLoadState('networkidle');
        }
        const target = initialRows[0];
        for (const term of [target.invoiceNumber, target[kind === 'ap' ? 'supplierName' : 'customerName']]) {
          assert.ok(term);
          const pending = page.waitForResponse(response => {
            const url = new URL(response.url());
            return url.pathname === endpoint && url.searchParams.get('keyword') === term;
          });
          await page.getByPlaceholder(kind === 'ap' ? '搜索供应商或发票号' : '搜索客户或发票号').fill(term);
          const response = await pending;
          assert.equal(response.status(), 200);
          const rows = rowsOf(await response.json());
          assert.ok(rows.some(row => row.id === target.id));
          assert.ok(rows.every(row => [row.invoiceNumber, row.supplierName, row.customerName, row.supplierInvoiceNumber, row.customerInvoiceNumber].some(value => String(value || '').includes(term))));
          await page.waitForLoadState('networkidle');
          assert.equal(await page.locator('.list-card').count(), rows.length);
          await ctx.record(kind + '-search', { term, ids: rows.map(row => row.id), amounts: rows.map(row => row.totalAmount) });
        }
      });
    }
    await ctx.step('320像素屏幕财务指标无重叠', async () => {
      await page.setViewportSize({ width: 320, height: 740 });
      await navigate('/finance/reports/balance-sheet', '/api/finance/reports/balance-sheet');
      const metrics = await page.locator('.metric-value').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      assert.ok(metrics.every(rect => rect.left >= 0 && rect.right <= 320));
      for (let index = 1; index < metrics.length; index++) {
        const previous = metrics[index - 1], current = metrics[index];
        assert.ok(current.top >= previous.bottom || current.left >= previous.right, 'Metric amounts overlap');
      }
    });
    assert.equal(ctx.network.filter(item => item.type === 'isolation-violation' || item.type === 'pageerror').length, 0);
    assert.equal(ctx.network.filter(item => item.method && item.method !== 'GET').length, 0, 'Read checks must not mutate business data');
  } finally {
    await ctx.close();
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
