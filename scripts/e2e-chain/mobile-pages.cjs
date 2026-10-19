'use strict';

// Read-only real-browser coverage for mobile route content and layout.
// This does not approve, create, or mutate business documents.
process.env.CHAIN_MOBILE = '1';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRuntime } = require('./runtime.cjs');
const headingAliases = {
  '/': '数据运行概览',
  '/production/tasks/create': '新建任务',
  '/purchase/receipts/create': '创建收货单',
  '/quality/process': '制程检验',
  '/quality/standards': 'AQL 抽样标准',
  '/equipment/types': '设备类别',
  '/equipment/repair': '维修记录',
  '/hr/leave': '请假记录',
  '/hr/overtime': '加班记录',
  '/tasks': '生产任务',
  '/inventory': '仓库管理',
};

async function main() {
  const ctx = await createRuntime('mobile-pages');
  const results = [];
  try {
    const routes = await ctx.page.evaluate(async () => {
      const router = (await import('/src/router/index.js')).default;
      return router.getRoutes().filter(route => route.components?.default && !route.redirect && !route.path.includes(':'))
        .map(route => ({ path: route.path, title: route.meta.title || route.name }));
    });
    const excluded = new Set(['/login', '/force-password', '/diagnose', '/scan']);
    const selected = new Set(process.argv.slice(2));
    const unique = [...new Map(routes.map(route => [route.path, route])).values()]
      .filter(route => !excluded.has(route.path) && (!selected.size || selected.has(route.path)));
    for (const route of unique) {
      const errors = [], api = [];
      const onError = error => errors.push(error.message);
      const onResponse = response => {
        const url = new URL(response.url());
        if (url.pathname.startsWith('/api/')) api.push({ path: url.pathname, status: response.status(), method: response.request().method() });
      };
      ctx.page.on('pageerror', onError);
      ctx.page.on('response', onResponse);
      let result = { ...route };
      try {
        await ctx.page.goto(ctx.baseUrl + route.path, { waitUntil: 'domcontentloaded' });
        await ctx.page.waitForLoadState('networkidle', { timeout: 15000 });
        await ctx.page.locator('main > *').first().waitFor({ state: 'visible' });
        const info = await ctx.page.evaluate(() => {
          const visible = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
          };
          const texts = selector => [...document.querySelectorAll(selector)].filter(visible).map(element => element.innerText.trim()).filter(Boolean);
          const main = document.querySelector('main');
          return {
            actualPath: location.pathname,
            headings: texts('.van-nav-bar__title, main h1, main h2, .module-title'),
            content: main.innerText,
            emptyStates: texts('.van-empty__description'),
            loading: [...document.querySelectorAll('.van-loading, .van-list__loading, .skeleton-list')].filter(visible).map(element => element.className),
            errorStates: texts('.van-list__error-text, .error-boundary > .error-container, .van-toast--fail'),
            formControls: [...main.querySelectorAll('input, textarea, select')].filter(visible).length,
            cards: main.querySelectorAll('.list-card').length,
            isUniversalList: Boolean(main.querySelector('.universal-page')),
            buttons: texts('main button'),
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: Math.max(document.documentElement.scrollWidth, main.scrollWidth),
          };
        });
        result = { ...result, ...info, errors, api };
        assert.equal(info.actualPath, route.path, 'Unexpected redirect');
        assert.equal(errors.length, 0, 'Uncaught browser errors');
        assert.equal(api.filter(item => item.status >= 400).length, 0, 'Failed API response');
        assert.equal(info.loading.length, 0, 'Loading state remained after API completion');
        assert.equal(info.errorStates.length, 0, 'Visible page error');
        assert.ok(info.content.trim().length > 0, 'Missing route content');
        if (route.path === '/profile') {
          assert.ok(info.content.includes('个人信息') && info.content.includes('功能设置'), 'Missing profile content');
        } else {
          assert.ok(info.headings.includes(headingAliases[route.path] || route.title), 'Unexpected page heading');
        }
        if (info.isUniversalList) {
          assert.ok(info.cards > 0 || info.emptyStates.length > 0, 'List has neither records nor an empty state');
          assert.ok(api.some(item => !/auth|csrf|permissions|dictionary|notifications/.test(item.path)), 'List never requested business data');
        }
        assert.ok(info.scrollWidth <= info.clientWidth + 1, `Horizontal overflow: ${info.scrollWidth} > ${info.clientWidth}`);
        result.status = 'PASS';
      } catch (error) {
        result = { ...result, status: 'FAIL', error: error.message, errors, api };
      } finally {
        await ctx.snapshot('page-' + route.path);
        ctx.page.off('pageerror', onError);
        ctx.page.off('response', onResponse);
      }
      results.push(result);
      fs.writeFileSync(path.join(ctx.evidenceDir, 'pages.json'), JSON.stringify({
        scope: 'Read-only mobile route navigation at 390x844: page content, real API responses, loading/empty/error state, horizontal layout, screenshot and ARIA snapshot. Not workflow acceptance.',
        results,
      }, null, 2));
      console.log(`${results.length}/${unique.length} ${result.status} ${route.path}${result.error ? ' ' + result.error : ''}`);
    }
    const failures = results.filter(result => result.status === 'FAIL');
    console.log(JSON.stringify({ pages: results.length, passed: results.length - failures.length, failures: failures.map(({ path, error }) => ({ path, error })) }, null, 2));
    if (failures.length) process.exitCode = 1;
  } finally {
    await ctx.close();
  }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; });
