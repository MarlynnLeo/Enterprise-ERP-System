'use strict';

const { accountingConfig } = require('../../config/accountingConfig');
const { toCents, fromCents } = require('../../utils/finance/settlementMath');
const { toLocalDateString } = require('../../utils/dateUtils');
const DocumentLinkService = require('./DocumentLinkService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../../constants/documentLinkTypes');

const fail = (message) => {
  throw Object.assign(new Error(message), { code: 'VALIDATION_ERROR', statusCode: 400 });
};
const MANUAL_TYPES = [
  '',
  'manual',
  'manual_entry',
  '手工凭证',
  '记账凭证',
  '期初凭证',
  'opening_balance',
];
const idOf = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) fail('请选择有效的已过账成本来源凭证明细');
  return id;
};
const amountCents = (value) => {
  const cents = toCents(value);
  if (
    !Number.isFinite(Number(value)) ||
    !Number.isSafeInteger(cents) ||
    cents <= 0 ||
    Math.abs(Number(value) * 100 - cents) > 0.00001
  ) {
    fail('成本金额必须大于0且最多保留两位小数');
  }
  return cents;
};

class AssetCostSourceService {
  static async accountCode(connection, kind) {
    if (!['asset', 'cip'].includes(kind)) fail('成本来源类型无效');
    await accountingConfig.loadFromDatabase({ pool: connection });
    return accountingConfig.getAccountCode(
      kind === 'asset' ? 'FIXED_ASSETS' : 'CONSTRUCTION_IN_PROGRESS'
    );
  }

  static async list(connection, kind, search = '') {
    const code = await this.accountCode(connection, kind);
    const [rows] = await connection.query(
      `SELECT i.id, e.entry_number, e.document_number, e.entry_date, i.description, i.debit_amount,
              i.debit_amount - COALESCE((SELECT SUM(a.amount) FROM asset_cost_allocations a WHERE a.gl_entry_item_id = i.id), 0) AS available_amount
         FROM gl_entry_items i JOIN gl_entries e ON e.id = i.entry_id JOIN gl_accounts g ON g.id = i.account_id
        WHERE e.is_posted = 1 AND COALESCE(e.is_reversed, 0) = 0 AND e.status = 'posted'
          AND g.account_code = ? AND g.is_active = 1 AND i.debit_amount > 0 AND COALESCE(i.credit_amount, 0) = 0
          AND COALESCE(i.currency_code, 'CNY') = 'CNY' AND COALESCE(i.exchange_rate, 1) = 1
          AND COALESCE(e.document_type, '') IN (?) AND COALESCE(e.transaction_type, '') IN (?)
          AND e.transaction_id IS NULL AND e.entry_number LIKE ?
        HAVING available_amount > 0 ORDER BY e.entry_date DESC, i.id DESC LIMIT 100`,
      [code, MANUAL_TYPES, MANUAL_TYPES, `%${String(search).trim().slice(0, 80)}%`]
    );
    return rows;
  }

  static async read(connection, sourceId, kind, targetId) {
    const code = await this.accountCode(connection, kind);
    // Lock the header before the line, matching the GL reversal lock order.
    const [[ref]] = await connection.query('SELECT entry_id FROM gl_entry_items WHERE id = ?', [
      idOf(sourceId),
    ]);
    if (!ref) fail('成本来源凭证明细不存在');
    const [[entry]] = await connection.query('SELECT * FROM gl_entries WHERE id = ? FOR UPDATE', [
      ref.entry_id,
    ]);
    const [[line]] = await connection.query(
      `SELECT i.*, g.account_code, g.is_active FROM gl_entry_items i JOIN gl_accounts g ON g.id = i.account_id WHERE i.id = ? FOR UPDATE`,
      [idOf(sourceId)]
    );
    if (
      !entry ||
      !line ||
      Number(line.entry_id) !== Number(entry.id) ||
      Number(entry.is_posted) !== 1 ||
      Number(entry.is_reversed || 0) !== 0 ||
      entry.status !== 'posted'
    ) {
      fail('成本来源必须是未冲销的已过账凭证');
    }
    if (
      String(line.account_code) !== String(code) ||
      Number(line.is_active) !== 1 ||
      Number(line.credit_amount || 0) !== 0 ||
      Number(line.debit_amount) <= 0
    ) {
      fail(
        kind === 'cip'
          ? '归集来源必须为在建工程科目的有效借方明细'
          : '取得来源必须为固定资产科目的有效借方明细'
      );
    }
    if ((line.currency_code || 'CNY') !== 'CNY' || Number(line.exchange_rate ?? 1) !== 1)
      fail('成本来源必须使用已按本位币入账的金额');
    const manual =
      MANUAL_TYPES.includes(entry.document_type || '') &&
      MANUAL_TYPES.includes(entry.transaction_type || '') &&
      !entry.transaction_id;
    if (!manual) {
      // A converted asset may only consume its own immutable capitalization.
      const [caps] =
        kind === 'asset'
          ? await connection.query(
              'SELECT project_id FROM cip_capitalizations WHERE asset_id = ? AND gl_entry_id = ? FOR UPDATE',
              [targetId, entry.id]
            )
          : [[]];
      if (
        !caps.length ||
        entry.transaction_type !== 'cip_capitalization' ||
        Number(entry.transaction_id) !== Number(caps[0].project_id)
      ) {
        fail('该业务凭证已有专用资本化流程，不能作为手工取得或归集来源重复使用');
      }
    }
    return { entry, line, sourceDate: toLocalDateString(entry.posting_date || entry.entry_date) };
  }

  static async allocate(
    connection,
    { kind, targetId, targetCode, sourceId, amount, actor, reconcilesExisting = false }
  ) {
    const cents = amountCents(amount);
    const { entry, line, sourceDate } = await this.read(connection, sourceId, kind, targetId);
    if (kind === 'asset') {
      const [[capitalization]] = await connection.query(
        'SELECT gl_entry_id, amount FROM cip_capitalizations WHERE asset_id = ? FOR UPDATE',
        [targetId]
      );
      if (
        capitalization &&
        (Number(capitalization.gl_entry_id) !== Number(entry.id) ||
          toCents(capitalization.amount) !== cents)
      ) {
        fail('转固资产必须保留原转固凭证和金额，不能改用其他取得来源');
      }
    }
    // The locked source header serializes allocation across different assets/projects.
    const [allocations] = await connection.query(
      'SELECT * FROM asset_cost_allocations WHERE gl_entry_item_id = ? FOR UPDATE',
      [sourceId]
    );
    const [unreconciledLinks] = await connection.query(
      `SELECT dl.id FROM document_links dl WHERE dl.target_type = 'finance_voucher' AND dl.target_id = ?
         AND dl.source_type IN ('asset', 'cip_project')
         AND NOT (dl.source_type = ? AND dl.source_id = ?)
         AND NOT EXISTS (SELECT 1 FROM asset_cost_allocations a WHERE a.gl_entry_id = dl.target_id
           AND a.target_id = dl.source_id AND a.target_type = IF(dl.source_type = 'asset', 'asset', 'cip'))
         AND NOT EXISTS (SELECT 1 FROM cip_capitalizations c WHERE ? = 'asset' AND c.asset_id = ?
           AND c.gl_entry_id = dl.target_id AND dl.source_type = 'cip_project' AND c.project_id = dl.source_id)
         LIMIT 1 FOR UPDATE`,
      [entry.id, kind === 'asset' ? DocType.ASSET : DocType.CIP_PROJECT, targetId, kind, targetId]
    );
    if (unreconciledLinks.length)
      fail('该凭证已有未核对的历史资产或工程关联，请先核对来源分配，不能重复资本化');
    const existing = allocations.find(
      (row) => row.target_type === kind && Number(row.target_id) === Number(targetId)
    );
    if (existing) {
      if (
        toCents(existing.amount) !== cents ||
        Boolean(Number(existing.reconciles_existing)) !== Boolean(reconcilesExisting)
      )
        fail('相同成本来源已归集，不能用不同金额或模式重复提交');
      return { id: existing.id, entryId: entry.id, reused: true, sourceDate };
    }
    const allocated = allocations.reduce((sum, row) => sum + toCents(row.amount), 0);
    if (allocated + cents > toCents(line.debit_amount))
      fail('成本来源可分配金额不足，不能重复资本化');
    const [result] = await connection.query(
      `INSERT INTO asset_cost_allocations (target_type, target_id, gl_entry_id, gl_entry_item_id, amount, source_date, reconciles_existing, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kind,
        targetId,
        entry.id,
        sourceId,
        fromCents(cents),
        sourceDate,
        reconcilesExisting ? 1 : 0,
        actor || null,
      ]
    );
    // Required evidence: do not swallow a failed link write. It also prevents
    // independent public GL reversal of a voucher already consumed by a subledger.
    await DocumentLinkService.createLink(
      {
        source_type: kind === 'asset' ? DocType.ASSET : DocType.CIP_PROJECT,
        source_id: targetId,
        source_code: targetCode,
        target_type: DocType.FINANCE_VOUCHER,
        target_id: entry.id,
        target_code: entry.entry_number,
        created_by: actor,
        remark: `成本来源明细 ${sourceId}，分配金额 ${fromCents(cents)}`,
      },
      connection
    );
    return { id: result.insertId, entryId: entry.id, reused: false, sourceDate };
  }

  static async assertCipBalance(connection, project, capitalizationDate) {
    const [sources] = await connection.query(
      'SELECT * FROM asset_cost_allocations WHERE target_type = ? AND target_id = ? ORDER BY gl_entry_id, gl_entry_item_id FOR UPDATE',
      ['cip', project.id]
    );
    const total = sources.reduce((sum, row) => sum + toCents(row.amount), 0);
    if (total <= 0 || total !== toCents(project.accumulated_amount))
      fail('归集累计与已关联成本凭证不一致，请先核对历史归集来源');
    for (const source of sources) {
      const { sourceDate } = await this.read(
        connection,
        source.gl_entry_item_id,
        'cip',
        project.id
      );
      if (sourceDate > capitalizationDate) fail('转固日期不能早于已归集成本的入账日期');
    }
    return fromCents(total);
  }
}

module.exports = AssetCostSourceService;
