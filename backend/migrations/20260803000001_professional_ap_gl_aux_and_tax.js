/**
 * 专业财务收口（记-291 审计五项）：
 * 1) 应付/应收/GR-IR 辅助核算开关
 * 2) 进项/销项税默认明细科目 222101/222102
 * 3) AP/AR 发票头未税、税额、税率字段
 * 4) 供应商默认账期（天）
 * 5) 种子科目确保 222101/222102 存在
 */

async function hasTable(knex, tableName) {
  return knex.schema.hasTable(tableName);
}

async function hasColumn(knex, tableName, columnName) {
  return knex.schema.hasColumn(tableName, columnName);
}

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await hasTable(knex, tableName))) return;
  if (await hasColumn(knex, tableName, columnName)) return;
  await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
}

async function ensureAccount(knex, account) {
  if (!(await hasTable(knex, 'gl_accounts'))) return;
  const existing = await knex('gl_accounts').where('account_code', account.account_code).first();
  if (existing) return existing.id;

  const available = new Set(Object.keys(await knex('gl_accounts').columnInfo()));
  const row = Object.fromEntries(
    Object.entries(account).filter(([col]) => available.has(col))
  );
  const [id] = await knex('gl_accounts').insert(row);
  return id;
}

exports.up = async function up(knex) {
  // --- 3) AP/AR 价税字段 ---
  await addColumnIfMissing(
    knex,
    'ap_invoices',
    'amount_excluding_tax',
    'DECIMAL(15,2) NULL DEFAULT NULL COMMENT \'未税金额\' AFTER `total_amount`'
  );
  await addColumnIfMissing(
    knex,
    'ap_invoices',
    'tax_amount',
    'DECIMAL(15,2) NULL DEFAULT NULL COMMENT \'税额\' AFTER `amount_excluding_tax`'
  );
  await addColumnIfMissing(
    knex,
    'ap_invoices',
    'tax_rate',
    'DECIMAL(10,6) NULL DEFAULT NULL COMMENT \'税率\' AFTER `tax_amount`'
  );

  await addColumnIfMissing(
    knex,
    'ar_invoices',
    'amount_excluding_tax',
    'DECIMAL(15,2) NULL DEFAULT NULL COMMENT \'未税金额\' AFTER `total_amount`'
  );
  await addColumnIfMissing(
    knex,
    'ar_invoices',
    'tax_amount',
    'DECIMAL(15,2) NULL DEFAULT NULL COMMENT \'税额\' AFTER `amount_excluding_tax`'
  );
  await addColumnIfMissing(
    knex,
    'ar_invoices',
    'tax_rate',
    'DECIMAL(10,6) NULL DEFAULT NULL COMMENT \'税率\' AFTER `tax_amount`'
  );

  // --- 4) 供应商默认账期 ---
  await addColumnIfMissing(
    knex,
    'suppliers',
    'payment_term_days',
    'INT NULL DEFAULT NULL COMMENT \'默认付款账期（天）\' AFTER `status`'
  );
  await addColumnIfMissing(
    knex,
    'customers',
    'payment_term_days',
    'INT NULL DEFAULT NULL COMMENT \'默认收款账期（天）\' AFTER `status`'
  );

  if (!(await hasTable(knex, 'gl_accounts'))) return;

  // --- 5) 确保进项/销项明细科目 ---
  await ensureAccount(knex, {
    account_code: '222101',
    account_name: '应交增值税-进项税额',
    account_type: '负债',
    type: 'liability',
    is_debit: 1,
    is_active: 1,
    currency_code: 'CNY',
    description: '增值税进项税额明细',
    has_supplier: 0,
    has_customer: 0,
  });
  await ensureAccount(knex, {
    account_code: '222102',
    account_name: '应交增值税-销项税额',
    account_type: '负债',
    type: 'liability',
    is_debit: 0,
    is_active: 1,
    currency_code: 'CNY',
    description: '增值税销项税额明细',
    has_supplier: 0,
    has_customer: 0,
  });
  await ensureAccount(knex, {
    account_code: '220201',
    account_name: '暂估应付（GR/IR）',
    account_type: '负债',
    type: 'liability',
    is_debit: 0,
    is_active: 1,
    currency_code: 'CNY',
    description: '材料入库未开票暂估',
    has_supplier: 1,
    has_customer: 0,
  });

  // --- 1) 辅助核算开关 ---
  const available = new Set(Object.keys(await knex('gl_accounts').columnInfo()));
  if (available.has('has_supplier')) {
    await knex('gl_accounts')
      .whereIn('account_code', ['2202', '220201'])
      .update({ has_supplier: 1 });
  }
  if (available.has('has_customer')) {
    await knex('gl_accounts')
      .whereIn('account_code', ['1122'])
      .update({ has_customer: 1 });
  }

  // --- 2) 更新 system_settings 中的进项/销项默认科目 ---
  if (await hasTable(knex, 'system_settings')) {
    const row = await knex('system_settings').where('key', 'accounting.account_codes').first();
    if (row && row.value) {
      try {
        let raw = row.value;
        if (typeof raw === 'string') {
          raw = raw.replace(
            // eslint-disable-next-line no-control-regex
            new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', 'g'),
            ''
          );
        }
        const codes = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (codes && typeof codes === 'object') {
          // 仅当仍指向总类 2221 时升级为明细，避免覆盖客户已配置的其他明细
          if (!codes.VAT_INPUT_TAX || codes.VAT_INPUT_TAX === '2221' || codes.VAT_INPUT_TAX === codes.TAX_PAYABLE) {
            codes.VAT_INPUT_TAX = '222101';
          }
          if (!codes.VAT_OUTPUT_TAX || codes.VAT_OUTPUT_TAX === '2221' || codes.VAT_OUTPUT_TAX === codes.TAX_PAYABLE) {
            codes.VAT_OUTPUT_TAX = '222102';
          }
          if (!codes.VAT_PAYABLE || codes.VAT_PAYABLE === '2221') {
            codes.VAT_PAYABLE = '222103';
          }
          if (!codes.GR_IR) codes.GR_IR = '220201';
          await knex('system_settings')
            .where('key', 'accounting.account_codes')
            .update({ value: JSON.stringify(codes) });
        }
      } catch {
        /* 配置损坏时不阻断迁移 */
      }
    } else {
      // 无配置行时写入最小必需映射，供 runtime 加载
      const minimal = {
        ACCOUNTS_PAYABLE: '2202',
        ACCOUNTS_RECEIVABLE: '1122',
        GR_IR: '220201',
        VAT_INPUT_TAX: '222101',
        VAT_OUTPUT_TAX: '222102',
        VAT_PAYABLE: '222103',
        TAX_PAYABLE: '2221',
        SALES_REVENUE: '6001',
        PURCHASE_COST: '1401',
      };
      const hasKey = await knex('system_settings').where('key', 'accounting.account_codes').first();
      if (!hasKey) {
        const cols = new Set(Object.keys(await knex('system_settings').columnInfo()));
        const insertRow = { key: 'accounting.account_codes', value: JSON.stringify(minimal) };
        if (cols.has('created_at')) insertRow.created_at = knex.fn.now();
        if (cols.has('updated_at')) insertRow.updated_at = knex.fn.now();
        await knex('system_settings').insert(insertRow);
      }
    }
  }
};

exports.down = async function down() {
  // 不回滚科目开关与价税列：已有业务数据依赖
};
