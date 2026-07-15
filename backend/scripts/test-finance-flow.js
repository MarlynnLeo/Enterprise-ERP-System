/**
 * 财务主流程冒烟测试（真实 API + 数据库）
 *
 * 覆盖：
 * 1. 登录 / 认证
 * 2. 编码规则 nextCode
 * 3. 开放会计期间 / 科目 / 银行账户
 * 4. AR 发票创建→确认→收款→作废收款
 * 5. AP 发票创建→确认→付款（余额不足拦截）→付款成功→作废付款
 * 6. 批量收款原子失败（非法发票）
 *
 * 用法：node scripts/test-finance-flow.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DISABLE_CRON = 'true';
process.env.ENABLE_RATE_LIMIT = 'false';

const { assertSafeLiveDatabase } = require('./lib/assert-safe-live-database');
assertSafeLiveDatabase({
  enableFlag: 'RUN_DESTRUCTIVE_FINANCE_FLOW',
  expectedFlag: 'I_UNDERSTAND_THIS_WRITES_DATA',
  scriptName: 'test-finance-flow',
});

const request = require('supertest');
const dayjs = require('dayjs');
const db = require('../src/config/db');
const CodeGeneratorService = require('../src/services/business/CodeGeneratorService');

const app = require('../src/app');

const results = [];
let pass = 0;
let fail = 0;

function ok(name, detail = '') {
  pass += 1;
  results.push({ status: 'PASS', name, detail });
  console.log(`✅ PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail = '') {
  fail += 1;
  results.push({ status: 'FAIL', name, detail });
  console.error(`❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function step(name, fn, { fatal = false } = {}) {
  try {
    const detail = await fn();
    ok(name, typeof detail === 'string' ? detail : detail && detail._detail ? detail._detail : '');
    return detail;
  } catch (error) {
    bad(name, error.message || String(error));
    if (fatal) throw error;
    return null;
  }
}

async function q(sql, params = []) {
  const [rows] = await db.pool.execute(sql, params);
  return rows;
}

async function createAuthClient() {
  const agent = request.agent(app);
  const username = process.env.TEST_ADMIN_USERNAME || 'admin';
  const password = process.env.TEST_ADMIN_PASSWORD || '123456';

  const loginRes = await agent.post('/api/auth/login').send({ username, password });
  if (loginRes.status !== 200) {
    throw new Error(`登录失败 HTTP ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }

  const csrfRes = await agent.get('/api/csrf-token');
  const csrf =
    csrfRes.body.csrfToken || csrfRes.body.token || csrfRes.body.data?.csrfToken || '';
  if (!csrf) {
    throw new Error(`无法获取 CSRF: ${JSON.stringify(csrfRes.body)}`);
  }

  const api = {
    get: (url) => agent.get(url),
    post: (url, body) =>
      agent.post(url).set('Content-Type', 'application/json').set('X-CSRF-Token', csrf).send(body),
    put: (url, body) =>
      agent.put(url).set('Content-Type', 'application/json').set('X-CSRF-Token', csrf).send(body),
    patch: (url, body) =>
      agent
        .patch(url)
        .set('Content-Type', 'application/json')
        .set('X-CSRF-Token', csrf)
        .send(body),
  };
  return api;
}

function assertStatus(res, expected, label) {
  const list = Array.isArray(expected) ? expected : [expected];
  if (!list.includes(res.status)) {
    throw new Error(
      `${label} 期望 HTTP ${list.join('/')}, 实际 ${res.status}: ${JSON.stringify(res.body).slice(0, 500)}`
    );
  }
}

async function main() {
  console.log('\n========== 财务主流程测试开始 ==========\n');
  const today = dayjs().format('YYYY-MM-DD');
  let api;

  // 0. 基础环境
  await step('数据库可连接', async () => {
    await q('SELECT 1 AS ok');
    return 'SELECT 1';
  });

  await step('编码规则齐全且可取号', async () => {
    const types = [
      'ar_invoice',
      'ap_invoice',
      'ar_receipt',
      'ap_payment',
      'budget',
      'tax_payment',
      'bank_transaction',
    ];
    for (const t of types) {
      const code = await CodeGeneratorService.nextCode(t);
      if (!code) throw new Error(`${t} 生成空号`);
    }
    return types.join(', ');
  });

  await step('管理员登录 + CSRF', async () => {
    api = await createAuthClient();
    const res = await api.get('/api/finance/settings');
    assertStatus(res, [200, 204], 'finance settings');
    return `settings HTTP ${res.status}`;
  });

  // 1. 期间 / 科目 / 主数据
  const period = await step('存在开放会计期间覆盖今天', async () => {
    const rows = await q(
      `SELECT id, period_name, start_date, end_date
       FROM gl_periods
       WHERE is_closed = 0 AND start_date <= ? AND end_date >= ?
       ORDER BY start_date DESC LIMIT 1`,
      [today, today]
    );
    if (!rows.length) {
      throw new Error(`没有覆盖 ${today} 的开放会计期间，请先维护 gl_periods`);
    }
    return `${rows[0].period_name}#${rows[0].id}`;
  });

  const bank = await step('存在可用银行账户', async () => {
    const rows = await q(
      `SELECT id, account_name, current_balance
       FROM bank_accounts
       WHERE is_active = 1
       ORDER BY current_balance DESC
       LIMIT 1`
    );
    if (!rows.length) throw new Error('没有启用中的银行账户');
    return rows[0];
  });

  const customer = await step('存在客户主数据', async () => {
    const rows = await q(
      `SELECT id, name FROM customers
       WHERE deleted_at IS NULL
       ORDER BY id ASC LIMIT 1`
    );
    if (!rows.length) throw new Error('没有客户，无法测应收');
    return rows[0];
  });

  const supplier = await step('存在供应商主数据', async () => {
    const rows = await q(`SELECT id, name FROM suppliers ORDER BY id ASC LIMIT 1`);
    if (!rows.length) throw new Error('没有供应商，无法测应付');
    return rows[0];
  });

  const material = await step('存在物料主数据', async () => {
    try {
      const rows = await q(
        `SELECT id, code, name FROM materials WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1`
      );
      if (!rows.length) throw new Error('没有物料');
      return rows[0];
    } catch (error) {
      const rows = await q(`SELECT id, code, name FROM materials ORDER BY id ASC LIMIT 1`);
      if (!rows.length) throw new Error('没有物料，无法测应付明细');
      return rows[0];
    }
  });

  // 2. AR 流程
  let arInvoiceId;
  let arInvoiceNumber;
  let arReceiptId;

  await step('AR 生成发票号 + 创建草稿发票', async () => {
    const numRes = await api.get('/api/finance/ar/invoices/generate-number');
    assertStatus(numRes, 200, 'generate AR number');
    arInvoiceNumber =
      numRes.body.data?.invoiceNumber ||
      numRes.body.data?.invoice_number ||
      numRes.body.invoiceNumber;
    if (!arInvoiceNumber) throw new Error('未返回 invoiceNumber');

    const payload = {
      invoiceNumber: arInvoiceNumber,
      customerId: customer.id,
      invoiceDate: today,
      dueDate: today,
      tax_rate: 0.13,
      notes: 'finance-flow-test',
      // 故意传错合计，验证服务端按明细+税率重算 = 200 + 26
      amount: 1,
      items: [
        {
          description: '流程测试物料',
          quantity: 2,
          unit_price: 100,
        },
      ],
    };

    const createRes = await api.post('/api/finance/ar/invoices', payload);
    assertStatus(createRes, [200, 201], 'create AR invoice');
    arInvoiceId =
      createRes.body.data?.id ||
      createRes.body.data?.invoiceId ||
      createRes.body.id;
    if (!arInvoiceId) {
      // some APIs return only message; query by number
      const rows = await q('SELECT id, total_amount FROM ar_invoices WHERE invoice_number = ?', [
        arInvoiceNumber,
      ]);
      if (!rows.length) throw new Error('创建后查不到发票');
      arInvoiceId = rows[0].id;
    }

    const rows = await q(
      'SELECT id, total_amount, paid_amount, balance_amount, status FROM ar_invoices WHERE id = ?',
      [arInvoiceId]
    );
    const inv = rows[0];
    if (Number(inv.total_amount) !== 226) {
      throw new Error(`服务端重算失败 total=${inv.total_amount}, 期望 226`);
    }
    if (inv.status !== '草稿') throw new Error(`状态应为草稿, 实际 ${inv.status}`);
    return `${arInvoiceNumber} total=${inv.total_amount}`;
  });

  await step('AR 确认发票', async () => {
    const res = await api.put(`/api/finance/ar/invoices/${arInvoiceId}/status`, {
      status: '已确认',
    });
    assertStatus(res, [200, 201], 'confirm AR');
    const rows = await q('SELECT status FROM ar_invoices WHERE id = ?', [arInvoiceId]);
    if (rows[0].status !== '已确认') throw new Error(`确认后状态=${rows[0].status}`);
    return rows[0].status;
  });

  await step('AR 收款成功并更新余额/银行', async () => {
    const bankBefore = await q('SELECT current_balance FROM bank_accounts WHERE id = ?', [
      bank.id,
    ]);
    const balBefore = Number(bankBefore[0].current_balance);

    const res = await api.post('/api/finance/ar/receipts', {
      invoiceId: arInvoiceId,
      receiptDate: today,
      amount: 226,
      paymentMethod: '银行转账',
      bankAccountId: bank.id,
      notes: 'finance-flow-test receipt',
    });
    assertStatus(res, [200, 201], 'create receipt');
    arReceiptId = res.body.data?.id || res.body.id;
    if (!arReceiptId) {
      const rows = await q(
        `SELECT r.id FROM ar_receipts r
         JOIN ar_receipt_items i ON i.receipt_id = r.id
         WHERE i.invoice_id = ?
         ORDER BY r.id DESC LIMIT 1`,
        [arInvoiceId]
      );
      arReceiptId = rows[0]?.id;
    }
    if (!arReceiptId) throw new Error('未拿到收款单 ID');

    const inv = (
      await q('SELECT status, paid_amount, balance_amount FROM ar_invoices WHERE id = ?', [
        arInvoiceId,
      ])
    )[0];
    if (inv.status !== '已付款') throw new Error(`收款后状态=${inv.status}`);
    if (Number(inv.balance_amount) > 0.001) {
      throw new Error(`收款后余额应为0, 实际 ${inv.balance_amount}`);
    }

    const bankAfter = await q('SELECT current_balance FROM bank_accounts WHERE id = ?', [bank.id]);
    const balAfter = Number(bankAfter[0].current_balance);
    if (Math.round((balAfter - balBefore) * 100) !== 22600) {
      throw new Error(`银行余额变化 ${balAfter - balBefore}, 期望 +226`);
    }
    return `receipt#${arReceiptId} bank ${balBefore} -> ${balAfter}`;
  });

  await step('AR 作废收款恢复发票与银行', async () => {
    const bankBefore = await q('SELECT current_balance FROM bank_accounts WHERE id = ?', [
      bank.id,
    ]);
    const res = await api.post(`/api/finance/ar/receipts/${arReceiptId}/void`, {
      void_reason: 'finance-flow-test void',
    });
    assertStatus(res, [200, 201], 'void receipt');

    const inv = (
      await q('SELECT status, paid_amount, balance_amount FROM ar_invoices WHERE id = ?', [
        arInvoiceId,
      ])
    )[0];
    if (Number(inv.paid_amount) > 0.001) throw new Error(`作废后 paid=${inv.paid_amount}`);
    if (Math.abs(Number(inv.balance_amount) - 226) > 0.01) {
      throw new Error(`作废后 balance=${inv.balance_amount}`);
    }

    const bankAfter = await q('SELECT current_balance FROM bank_accounts WHERE id = ?', [bank.id]);
    const delta = Number(bankBefore[0].current_balance) - Number(bankAfter[0].current_balance);
    if (Math.round(delta * 100) !== 22600) {
      throw new Error(`作废后银行应回退 226, 实际变化 ${delta}`);
    }

    const gl = await q(
      `SELECT id, is_reversed, document_type FROM gl_entries
       WHERE document_number = (SELECT receipt_number FROM ar_receipts WHERE id = ?)
         AND document_type = 'collection'`,
      [arReceiptId]
    );
    if (!gl.length) throw new Error('未找到收款凭证');
    if (!gl.some((g) => Number(g.is_reversed) === 1)) {
      throw new Error('收款凭证未被标记冲销');
    }
    return `invoice status=${inv.status}, gl reversed`;
  });

  // 3. AP 流程
  let apInvoiceId;
  let apInvoiceNumber;
  let apPaymentId;

  await step('AP 创建并确认发票', async () => {
    if (!supplier || !material) throw new Error('缺少供应商或物料，跳过 AP');
    const numRes = await api.get('/api/finance/ap/invoices/generate-number');
    assertStatus(numRes, 200, 'generate AP number');
    apInvoiceNumber =
      numRes.body.data?.invoiceNumber ||
      numRes.body.data?.invoice_number ||
      numRes.body.invoiceNumber;

    const payload = {
      invoiceNumber: apInvoiceNumber,
      supplierId: supplier.id,
      invoiceDate: today,
      dueDate: today,
      tax_rate: 0.13,
      notes: 'finance-flow-test',
      amount: 1,
      items: [
        {
          materialId: material.id,
          material_id: material.id,
          description: material.name || '采购测试',
          quantity: 1,
          unitPrice: 50,
          unit_price: 50,
        },
      ],
    };
    const createRes = await api.post('/api/finance/ap/invoices', payload);
    assertStatus(createRes, [200, 201], 'create AP');
    const rows = await q('SELECT id, total_amount FROM ap_invoices WHERE invoice_number = ?', [
      apInvoiceNumber,
    ]);
    if (!rows.length) throw new Error('AP 发票未写入');
    apInvoiceId = rows[0].id;
    if (Number(rows[0].total_amount) !== 56.5) {
      throw new Error(`AP total=${rows[0].total_amount}, 期望 56.5`);
    }

    const conf = await api.put(`/api/finance/ap/invoices/${apInvoiceId}/status`, {
      status: '已确认',
    });
    assertStatus(conf, [200, 201], 'confirm AP');
    return `${apInvoiceNumber}#${apInvoiceId}`;
  });

  await step('AP 余额不足应拒绝付款', async () => {
    if (!apInvoiceId) throw new Error('无 AP 发票，跳过');
    const original = (
      await q('SELECT current_balance FROM bank_accounts WHERE id = ?', [bank.id])
    )[0].current_balance;
    await q('UPDATE bank_accounts SET current_balance = 1 WHERE id = ?', [bank.id]);
    const res = await api.post('/api/finance/ap/payments', {
      invoiceId: apInvoiceId,
      paymentDate: today,
      amount: 56.5,
      paymentMethod: '银行转账',
      bankAccountId: bank.id,
      notes: 'finance-flow-test insufficient',
    });
    await q('UPDATE bank_accounts SET current_balance = ? WHERE id = ?', [original, bank.id]);

    if (res.status === 200 || res.status === 201) {
      throw new Error('余额不足时不应付款成功');
    }
    const msg = res.body?.message || res.body?.error || JSON.stringify(res.body);
    return `HTTP ${res.status}: ${msg}`;
  });

  await step('AP 付款成功', async () => {
    if (!apInvoiceId) throw new Error('无 AP 发票，跳过');
    const original = (
      await q('SELECT current_balance FROM bank_accounts WHERE id = ?', [bank.id])
    )[0].current_balance;
    if (Number(original) < 56.5) {
      await q('UPDATE bank_accounts SET current_balance = ? WHERE id = ?', [
        Number(original) + 1000,
        bank.id,
      ]);
    }
    const res = await api.post('/api/finance/ap/payments', {
      invoiceId: apInvoiceId,
      paymentDate: today,
      amount: 56.5,
      paymentMethod: '银行转账',
      bankAccountId: bank.id,
      notes: 'finance-flow-test payment',
    });
    assertStatus(res, [200, 201], 'create payment');
    apPaymentId = res.body.data?.id || res.body.id;
    if (!apPaymentId) {
      const rows = await q(
        `SELECT p.id FROM ap_payments p
         JOIN ap_payment_items i ON i.payment_id = p.id
         WHERE i.invoice_id = ?
         ORDER BY p.id DESC LIMIT 1`,
        [apInvoiceId]
      );
      apPaymentId = rows[0]?.id;
    }
    if (!apPaymentId) throw new Error('未拿到付款单 ID');

    const inv = (
      await q('SELECT status, balance_amount FROM ap_invoices WHERE id = ?', [apInvoiceId])
    )[0];
    if (inv.status !== '已付款') throw new Error(`付款后状态=${inv.status}`);
    return `payment#${apPaymentId}`;
  });

  await step('AP 作废付款', async () => {
    if (!apPaymentId) throw new Error('无付款单，跳过');
    const res = await api.post(`/api/finance/ap/payments/${apPaymentId}/void`, {
      void_reason: 'finance-flow-test void payment',
    });
    assertStatus(res, [200, 201], 'void payment');
    const inv = (
      await q('SELECT status, paid_amount, balance_amount FROM ap_invoices WHERE id = ?', [
        apInvoiceId,
      ])
    )[0];
    if (Number(inv.paid_amount) > 0.001) throw new Error(`作废后 paid=${inv.paid_amount}`);
    return `invoice status=${inv.status}`;
  });

  await step('批量收款原子失败不产生半成功', async () => {
    // ensure AR invoice confirmed again for a valid first item path; use invalid second
    await api.put(`/api/finance/ar/invoices/${arInvoiceId}/status`, { status: '已确认' }).catch(() => {});
    // re-confirm if void left it confirmed
    const inv = (await q('SELECT status FROM ar_invoices WHERE id = ?', [arInvoiceId]))[0];
    if (inv.status === '草稿') {
      await api.put(`/api/finance/ar/invoices/${arInvoiceId}/status`, { status: '已确认' });
    }

    const beforeCount = (
      await q('SELECT COUNT(*) AS c FROM ar_receipts WHERE notes LIKE ?', ['%atomic-fail-test%'])
    )[0].c;

    const res = await api.post('/api/finance/ar/receipts/batch', {
      receiptDate: today,
      paymentMethod: '银行转账',
      bankAccountId: bank.id,
      notes: 'atomic-fail-test',
      atomic: true,
      receipts: [
        { invoiceId: arInvoiceId, amount: 10 },
        { invoiceId: 99999999, amount: 10 },
      ],
    });

    // should fail overall
    if (res.status === 200 && res.body?.data?.successCount > 0 && res.body?.data?.errorCount === 0) {
      throw new Error('原子批处理不应全部成功');
    }

    const afterCount = (
      await q('SELECT COUNT(*) AS c FROM ar_receipts WHERE notes LIKE ?', ['%atomic-fail-test%'])
    )[0].c;
    if (Number(afterCount) !== Number(beforeCount)) {
      throw new Error(`原子失败后不应新增收款单 before=${beforeCount} after=${afterCount}`);
    }
    return `HTTP ${res.status}`;
  });

  await step('权限：未登录访问应收应 401', async () => {
    const res = await request(app).get('/api/finance/ar/invoices');
    if (res.status !== 401) throw new Error(`期望 401, 实际 ${res.status}`);
    return '401';
  });

  console.log('\n========== 测试结果汇总 ==========\n');
  console.log(`通过: ${pass}`);
  console.log(`失败: ${fail}`);
  console.log(`期间: ${period}`);
  console.log(`银行: ${bank.account_name || bank.id}`);
  console.log(`AR 发票: ${arInvoiceNumber}#${arInvoiceId}`);
  console.log(`AP 发票: ${apInvoiceNumber}#${apInvoiceId}`);
  console.log('\n说明: 测试数据 notes 含 finance-flow-test，可手工清理。');

  process.exitCode = fail > 0 ? 1 : 0;
  process.exit(process.exitCode);
}

main().catch((error) => {
  console.error('\n测试脚本异常:', error);
  process.exit(1);
});
