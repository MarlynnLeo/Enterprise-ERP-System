'use strict';
/* global jest, describe, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), query: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
jest.mock('../../src/config/accountingConfig', () => ({ accountingConfig: {
  loadFromDatabase: jest.fn(), getAccountCode: key => ({ FIXED_ASSETS: '1601', CONSTRUCTION_IN_PROGRESS: '1604' })[key],
} }));
jest.mock('../../src/models/finance', () => ({ createEntry: jest.fn() }));
jest.mock('../../src/services/business/DocumentLinkService', () => ({ createLink: jest.fn(), tryAutoLink: jest.fn() }));
jest.mock('../../src/utils/userHelper', () => ({ getCurrentUserName: async req => req.user.username }));
jest.mock('../../src/services/business/CodeGeneratorService', () => ({}));

const db = require('../../src/config/db');
const finance = require('../../src/models/finance');
const links = require('../../src/services/business/DocumentLinkService');
const Source = require('../../src/services/business/AssetCostSourceService');
const assetsController = require('../../src/controllers/business/assets/assetsController');
const cip = require('../../src/models/cip');
const cipController = require('../../src/controllers/business/assets/cipController');
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const actor = { id: 8, username: 'reviewer' };

describe('posted cost evidence → assets/CIP → capitalization', () => {
  let state, connection, saved;
  const allocationRequest = overrides => ({ kind: 'asset', targetId: 1, targetCode: 'FA-1', sourceId: 11, amount: 100, actor: 8, ...overrides });
  beforeEach(() => {
    jest.clearAllMocks();
    state = {
      assets: [{ id: 1, asset_code: 'FA-1', asset_name: 'Machine', acquisition_cost: 100, acquisition_entry_item_id: 11, status: '在用', audit_status: 'draft', created_by: 'maker' }],
      projects: [{ id: 7, project_code: 'CIP-7', project_name: 'Production line', status: '建设中', accumulated_amount: 0 }],
      entries: [
        { id: 10, entry_number: 'GL-10', entry_date: '2026-10-01', posting_date: '2026-10-01', status: 'posted', is_posted: 1, is_reversed: 0, document_type: '手工凭证', transaction_type: 'manual', transaction_id: null },
        { id: 20, entry_number: 'GL-20', entry_date: '2026-10-01', posting_date: '2026-10-01', status: 'posted', is_posted: 1, is_reversed: 0, document_type: '手工凭证', transaction_type: 'manual', transaction_id: null },
      ],
      lines: [
        { id: 11, entry_id: 10, account_id: 1601, account_code: '1601', is_active: 1, debit_amount: 100, credit_amount: 0 },
        { id: 21, entry_id: 20, account_id: 1604, account_code: '1604', is_active: 1, debit_amount: 100, credit_amount: 0 },
      ], allocations: [], caps: [], links: [],
    };
    const query = jest.fn(async (raw, args = []) => {
      const sql = raw.replace(/\s+/g, ' ').trim();
      if (sql === 'SELECT COUNT(*) as count FROM fixed_assets') return [[{ count: state.assets.length }]];
      if (sql.startsWith('SELECT entry_id FROM gl_entry_items')) return [[state.lines.find(row => row.id === Number(args[0]))].filter(Boolean)];
      if (sql.startsWith('SELECT * FROM gl_entries')) return [[state.entries.find(row => row.id === Number(args[0]))].filter(Boolean)];
      if (sql.startsWith('SELECT i.*, g.account_code')) return [[state.lines.find(row => row.id === Number(args[0]))].filter(Boolean)];
      if (sql.startsWith('SELECT * FROM asset_cost_allocations WHERE gl_entry_item_id')) return [state.allocations.filter(row => row.gl_entry_item_id === Number(args[0]))];
      if (sql.startsWith('SELECT * FROM asset_cost_allocations WHERE target_type')) return [state.allocations.filter(row => row.target_type === args[0] && row.target_id === Number(args[1]))];
      if (sql.startsWith('SELECT COALESCE(SUM(amount)')) return [[{ amount: state.allocations.filter(row => row.target_type === args[0] && row.target_id === Number(args[1])).reduce((sum, row) => sum + row.amount, 0) }]];
      if (sql.startsWith('SELECT dl.id FROM document_links')) return [state.links.filter(row => {
        if (row.target_type !== 'finance_voucher' || row.target_id !== args[0] || !['asset', 'cip_project'].includes(row.source_type)) return false;
        if (row.source_type === args[1] && Number(row.source_id) === Number(args[2])) return false;
        if (state.allocations.some(allocation => allocation.gl_entry_id === row.target_id && allocation.target_id === row.source_id && allocation.target_type === (row.source_type === 'asset' ? 'asset' : 'cip'))) return false;
        const ownCapitalization = state.caps.some(cap => row.source_type === 'cip_project' && cap.project_id === row.source_id && cap.gl_entry_id === row.target_id && cap.asset_id === Number(args[4]));
        if (sql.includes('FROM cip_capitalizations c') && args[3] === 'asset' && ownCapitalization) return false;
        return true;
      })];
      if (sql.startsWith('INSERT INTO asset_cost_allocations')) {
        const [target_type, target_id, gl_entry_id, gl_entry_item_id, amount, source_date, reconciles_existing] = args;
        const row = { id: state.allocations.length + 1, target_type, target_id: Number(target_id), gl_entry_id, gl_entry_item_id: Number(gl_entry_item_id), amount, source_date, reconciles_existing };
        state.allocations.push(row); return [{ insertId: row.id }];
      }
      if (sql.startsWith('SELECT asset_id FROM cip_capitalizations')) return [state.caps.filter(row => row.project_id === Number(args[0]))];
      if (sql.startsWith('SELECT project_id FROM cip_capitalizations')) return [state.caps.filter(row => row.asset_id === Number(args[0]) && row.gl_entry_id === Number(args[1]))];
      if (sql.startsWith('SELECT gl_entry_id, amount FROM cip_capitalizations')) return [state.caps.filter(row => row.asset_id === Number(args[0]))];
      if (sql.startsWith('INSERT INTO cip_capitalizations')) {
        if (state.caps.some(row => row.project_id === args[0])) throw new Error('duplicate project');
        state.caps.push({ project_id: args[0], asset_id: args[1], gl_entry_id: args[2], amount: args[3] }); return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM cip_projects')) return [state.projects.filter(row => sql.includes('project_code = ?') ? row.project_code === args[0] : row.id === Number(args[0]))];
      if (sql.startsWith('INSERT INTO cip_projects')) {
        state.projects.push({ id: 8, project_code: args[0], project_name: args[1], budget: args[2], accumulated_amount: 0, status: '建设中', start_date: args[4], estimated_end_date: args[5] }); return [{ insertId: 8 }];
      }
      if (sql.startsWith('UPDATE cip_projects')) {
        const project = state.projects.find(row => row.id === Number(args[args.length - 1]));
        if (sql.includes('accumulated_amount = COALESCE')) project.accumulated_amount += args[0];
        else {
          const columns = sql.slice(sql.indexOf(' SET ') + 5, sql.indexOf(' WHERE ')).split(',').filter(column => column.includes('?')).map(column => column.trim().split(' ')[0]);
          columns.forEach((column, index) => { project[column] = args[index]; });
        }
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM fixed_assets')) return [state.assets.filter(row => sql.includes('asset_code = ?') ? row.asset_code === args[0] : row.id === Number(args[0]))];
      if (sql.startsWith('INSERT INTO fixed_assets')) {
        const row = { id: 2, asset_code: args[0], asset_name: args[1], acquisition_cost: args[5], audit_status: 'draft', created_by: 'maker', status: '在用' };
        if (sql.includes('acquisition_entry_item_id')) row.acquisition_entry_item_id = args[18];
        state.assets.push(row); return [{ insertId: 2 }];
      }
      if (sql.startsWith('UPDATE fixed_assets SET audit_status')) {
        const asset = state.assets.find(row => row.id === Number(args[3]));
        if (asset.audit_status !== args[4]) return [{ affectedRows: 0 }];
        asset.audit_status = args[0]; return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE fixed_assets SET acquisition_entry_item_id')) { state.assets.find(row => row.id === args[1]).acquisition_entry_item_id = args[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('INSERT INTO asset_change_logs')) return [{ insertId: 1 }];
      if (sql.includes('FROM gl_accounts')) return [[{ id: Number(args[0]) }]];
      if (sql.includes('FROM gl_periods')) return [[{ id: 10 }]];
      if (sql.startsWith('SELECT entry_number FROM gl_entries')) return [state.entries.filter(row => row.id === args[0])];
      if (sql.startsWith('SELECT id FROM gl_entry_items')) return [state.lines.filter(row => row.entry_id === args[0] && row.account_id === args[1] && row.debit_amount === args[2])];
      if (sql.includes('FROM departments')) return [[]];
      throw new Error('Unexpected SQL: ' + sql);
    });
    connection = { query, execute: query,
      beginTransaction: jest.fn(async () => { saved = structuredClone(state); }),
      commit: jest.fn(async () => { saved = null; }),
      rollback: jest.fn(async () => { if (saved) state = structuredClone(saved); saved = null; }), release: jest.fn(),
    };
    db.pool.getConnection.mockResolvedValue(connection);
    db.pool.query.mockImplementation(query);
    db.pool.execute.mockImplementation(query);
    links.createLink.mockImplementation(async link => { state.links.push(link); });
    links.tryAutoLink.mockImplementation(async (source_type, source_id, _source_code, target_type, target_id) => {
      state.links.push({ source_type, source_id, target_type, target_id });
    });
    finance.createEntry.mockImplementation(async (entry, lines, conn) => {
      expect(conn).toBe(connection);
      state.entries.push({ ...entry, id: 30, entry_number: 'GL-30', is_reversed: 0 });
      lines.forEach((line, index) => state.lines.push({ ...line, id: 31 + index, entry_id: 30, account_code: String(line.account_id), is_active: 1 }));
      return 30;
    });
  });

  test('public asset creation persists selected evidence while retaining draft status', async () => {
    const res = response();
    await assetsController.createAsset({ user: { id: 7, username: 'maker' }, body: {
      assetCode: 'FA-NEW', assetName: 'New machine', purchaseDate: '2026-10-01', originalValue: 100,
      usefulLife: 5, assetType: 'machine', depreciationMethod: 'straight_line', acquisitionEntryItemId: 11,
    } }, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(state.assets[1]).toMatchObject({ audit_status: 'draft', acquisition_entry_item_id: 11 });
    expect(finance.createEntry).not.toHaveBeenCalled();
  });

  test('approval atomically reserves the posted debit and required document link without a duplicate voucher', async () => {
    const res = response();
    await assetsController.auditAsset({ params: { id: '1' }, body: { action: 'approve' }, user: actor }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(state.assets[0].audit_status).toBe('approved');
    expect(state.allocations).toEqual([expect.objectContaining({ target_type: 'asset', target_id: 1, gl_entry_item_id: 11, amount: 100 })]);
    expect(state.links).toEqual([expect.objectContaining({ source_type: 'asset', source_id: 1, target_id: 10 })]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(finance.createEntry).not.toHaveBeenCalled();
    const again = response();
    await assetsController.auditAsset({ params: { id: '1' }, body: { action: 'approve' }, user: actor }, again);
    expect(again.status).toHaveBeenCalledWith(409);
    expect(state.allocations).toHaveLength(1);
  });

  test('a card with no accounting evidence cannot be approved', async () => {
    state.assets[0].acquisition_entry_item_id = null;
    const res = response();
    await assetsController.auditAsset({ params: { id: '1' }, body: { action: 'approve' }, user: actor }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(state.assets[0].audit_status).toBe('draft');
    expect(state.allocations).toHaveLength(0);
  });

  test.each([
    ['draft', entry => { entry.is_posted = 0; entry.status = 'draft'; }],
    ['reversed', entry => { entry.is_reversed = 1; }],
    ['business source', entry => { entry.transaction_type = 'purchase_receipt'; entry.transaction_id = 4; }],
  ])('rejects %s source before reserving cost', async (_name, mutate) => {
    mutate(state.entries[0]);
    await expect(Source.allocate(connection, allocationRequest())).rejects.toThrow();
    expect(state.allocations).toHaveLength(0);
  });

  test.each([
    ['wrong account', { account_code: '1604' }],
    ['credit line', { debit_amount: 0, credit_amount: 100 }],
    ['foreign amount', { currency_code: 'USD' }],
    ['non-unit exchange', { exchange_rate: 7 }],
  ])('rejects %s as asset acquisition evidence', async (_name, patch) => {
    Object.assign(state.lines[0], patch);
    await expect(Source.allocate(connection, allocationRequest())).rejects.toThrow();
    expect(state.allocations).toHaveLength(0);
  });

  test('source-line locking and reservations prevent a second asset from spending the same debit', async () => {
    await Source.allocate(connection, allocationRequest({ amount: 60 }));
    await expect(Source.allocate(connection, allocationRequest({ targetId: 2, amount: 50 }))).rejects.toThrow('可分配金额不足');
    expect(state.allocations).toHaveLength(1);
    const sqls = connection.query.mock.calls.map(([sql]) => sql);
    expect(sqls.find(sql => sql.includes('SELECT * FROM gl_entries'))).toContain('FOR UPDATE');
    expect(sqls.find(sql => sql.includes('SELECT * FROM asset_cost_allocations'))).toContain('FOR UPDATE');
  });

  test('an unreconciled historical business link cannot be reused for a different asset', async () => {
    state.links.push({ source_type: 'asset', source_id: 99, target_type: 'finance_voucher', target_id: 10 });
    await expect(Source.allocate(connection, allocationRequest())).rejects.toThrow('历史');
  });

  test('failed required evidence write rolls back asset approval and allocation', async () => {
    links.createLink.mockRejectedValueOnce(new Error('link unavailable'));
    const res = response();
    await assetsController.auditAsset({ params: { id: '1' }, body: { action: 'approve' }, user: actor }, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(state.allocations).toHaveLength(0);
    expect(state.assets[0].audit_status).toBe('draft');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('CIP cost records source/amount in one transaction and exact retries do not increment again', async () => {
    const source = { source_entry_item_id: 21, created_by: 8 };
    await expect(cip.addAccumulatedAmount(7, 100, source)).resolves.toMatchObject({ newAmount: 100, reused: false });
    await expect(cip.addAccumulatedAmount(7, 100, source)).resolves.toMatchObject({ newAmount: 100, reused: true });
    expect(state.projects[0].accumulated_amount).toBe(100);
    expect(state.allocations).toHaveLength(1);
    await expect(cip.addAccumulatedAmount(7, 50, source)).rejects.toThrow('不同金额');
    expect(state.projects[0].accumulated_amount).toBe(100);
  });

  test('CIP cost cannot increment without a valid posted debit source', async () => {
    await expect(cip.addAccumulatedAmount(7, 100)).rejects.toThrow('凭证明细');
    expect(state.projects[0].accumulated_amount).toBe(0);
    expect(state.allocations).toHaveLength(0);
  });

  test('historical reconciliation attaches real evidence without duplicating the opening cumulative amount', async () => {
    state.projects[0].accumulated_amount = 100;
    await expect(cip.addAccumulatedAmount(7, 100, { source_entry_item_id: 21, reconciles_existing: true, created_by: 8 })).resolves.toMatchObject({ previousAmount: 100, newAmount: 100 });
    expect(state.allocations[0]).toMatchObject({ amount: 100, reconciles_existing: 1 });
  });

  test('historical reconciliation cannot claim more evidence than the existing total', async () => {
    state.projects[0].accumulated_amount = 50;
    await expect(cip.addAccumulatedAmount(7, 100, { source_entry_item_id: 21, reconciles_existing: true })).rejects.toThrow('不能超过');
    expect(state.allocations).toHaveLength(0);
    expect(state.projects[0].accumulated_amount).toBe(50);
  });

  test('capitalization uses verified source balance and an immutable project identity; the asset reuses its generated debit', async () => {
    await cip.addAccumulatedAmount(7, 100, { source_entry_item_id: 21, created_by: 8 });
    await expect(cip.transferToFixedAsset(7, { asset_code: 'CIP-FA', asset_name: 'Machine', acquisition_date: '2026-10-15' }, { userId: 8, operatorName: 'maker' })).resolves.toBe(2);
    expect(finance.createEntry).toHaveBeenCalledWith(expect.objectContaining({ transaction_type: 'cip_capitalization', transaction_id: 7, document_number: 'CIP-ID-7' }), [expect.objectContaining({ debit_amount: 100 }), expect.objectContaining({ credit_amount: 100 })], connection);
    expect(state.caps).toEqual([{ project_id: 7, asset_id: 2, gl_entry_id: 30, amount: 100 }]);
    expect(state.assets[1].acquisition_entry_item_id).toBe(31);
    const res = response();
    await assetsController.auditAsset({ params: { id: '2' }, body: { action: 'approve' }, user: actor }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(finance.createEntry).toHaveBeenCalledTimes(1);
    state.projects[0].status = '建设中'; // Even damaged status cannot erase the immutable record.
    await expect(cip.transferToFixedAsset(7, { asset_code: 'DUP', asset_name: 'Duplicate' }, actor)).rejects.toThrow('不能重复操作');
    expect(finance.createEntry).toHaveBeenCalledTimes(1);
  });

  test('a cumulative number without recorded sources cannot manufacture an asset', async () => {
    state.projects[0].accumulated_amount = 100;
    await expect(cip.transferToFixedAsset(7, { asset_code: 'BAD', asset_name: 'Unbacked', acquisition_date: '2026-10-15' }, actor)).rejects.toThrow('成本凭证不一致');
    expect(state.assets).toHaveLength(1);
    expect(finance.createEntry).not.toHaveBeenCalled();
  });

  test.each([
    ['changed original cost', { acquisition_cost: 80 }],
    ['switched source', { acquisition_entry_item_id: 11 }],
  ])('a generated asset cannot approve with %s', async (_name, patch) => {
    await cip.addAccumulatedAmount(7, 100, { source_entry_item_id: 21, created_by: 8 });
    await cip.transferToFixedAsset(7, { asset_code: 'CIP-FA', asset_name: 'Machine', acquisition_date: '2026-10-15' }, { userId: 8 });
    Object.assign(state.assets[1], patch);
    const res = response();
    await assetsController.auditAsset({ params: { id: '2' }, body: { action: 'approve' }, user: actor }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(state.assets[1].audit_status).toBe('draft');
    expect(state.allocations).toHaveLength(1);
  });

  test('a failed capitalization voucher rolls back its asset and keeps the project available', async () => {
    await cip.addAccumulatedAmount(7, 100, { source_entry_item_id: 21, created_by: 8 });
    finance.createEntry.mockRejectedValueOnce(new Error('closed period race'));
    await expect(cip.transferToFixedAsset(7, { asset_code: 'FA-FAIL', asset_name: 'Machine', acquisition_date: '2026-10-15' }, { userId: 8 })).rejects.toThrow('closed period race');
    expect(state.assets).toHaveLength(1);
    expect(state.caps).toHaveLength(0);
    expect(state.projects[0]).toMatchObject({ status: '建设中', accumulated_amount: 100 });
    expect(state.allocations).toHaveLength(1);
  });

  test('failed capitalization links roll back the generated asset, voucher and immutable record', async () => {
    await cip.addAccumulatedAmount(7, 100, { source_entry_item_id: 21, created_by: 8 });
    links.createLink.mockRejectedValueOnce(new Error('capitalization link unavailable'));
    await expect(cip.transferToFixedAsset(7, { asset_code: 'FA-LINK-FAIL', asset_name: 'Machine', acquisition_date: '2026-10-15' }, { userId: 8 })).rejects.toThrow('capitalization link');
    expect(state.assets).toHaveLength(1);
    expect(state.entries).toHaveLength(2);
    expect(state.caps).toHaveLength(0);
    expect(state.projects[0]).toMatchObject({ status: '建设中', accumulated_amount: 100 });
    expect(state.links).toHaveLength(1);
  });

  test('capitalization cannot predate its cost or use a subsequently reversed cost voucher', async () => {
    await cip.addAccumulatedAmount(7, 100, { source_entry_item_id: 21 });
    await expect(cip.transferToFixedAsset(7, { acquisition_date: '2026-09-30' }, actor)).rejects.toThrow('早于');
    state.entries[1].is_reversed = 1;
    await expect(cip.transferToFixedAsset(7, { acquisition_date: '2026-10-15' }, actor)).rejects.toThrow('未冲销');
    expect(state.assets).toHaveLength(1);
  });

  test('camel create/edit controller payloads actually persist names and dates', async () => {
    const created = response();
    await cipController.createCipProject({ body: { projectCode: 'CIP-8', projectName: 'New project', startDate: '2026-10-01', estimatedEndDate: '2026-10-30' } }, created);
    expect(created.status).toHaveBeenCalledWith(201);
    const updated = response();
    await cipController.updateCipProject({ params: { id: '8' }, body: { projectCode: 'CIP-8', projectName: 'Renamed', startDate: '2026-10-02', estimatedEndDate: '2026-10-31' } }, updated);
    expect(updated.status).toHaveBeenCalledWith(200);
    expect(state.projects[1]).toMatchObject({ project_name: 'Renamed', start_date: '2026-10-02', estimated_end_date: '2026-10-31' });
  });

  test('public cost controller forwards source identity and historical mode to the atomic write', async () => {
    const res = response();
    await cipController.addCost({ params: { id: '7' }, user: actor, body: { amount: 100, sourceEntryItemId: 21, reconcilesExisting: false } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(state.allocations[0]).toMatchObject({ gl_entry_item_id: 21, amount: 100 });
  });

  test('ordinary edits cannot alter immutable project codes or a capitalized project', async () => {
    await expect(cip.updateCipProject(7, { project_code: 'RENAMED' })).rejects.toThrow('编号创建后不能修改');
    state.projects[0].status = '已转固';
    await expect(cip.updateCipProject(7, { status: '建设中', project_name: 'Reopen' })).rejects.toThrow('已转固');
    expect(state.projects[0]).toMatchObject({ project_code: 'CIP-7', status: '已转固' });
  });

  test('migration emits additive MySQL schema with unique source/target and project identities, without inventing history', async () => {
    const knex = require('knex')({ client: 'mysql2' });
    const statements = [];
    const schema = {
      hasColumn: async () => false, hasTable: async () => false,
      alterTable: async (name, callback) => { statements.push(...knex.schema.alterTable(name, callback).toSQL()); },
      createTable: async (name, callback) => { statements.push(...knex.schema.createTable(name, callback).toSQL()); },
    };
    await require('../../migrations/20261015000031_asset_capitalization_sources').up({ schema, fn: knex.fn });
    const sql = statements.map(statement => statement.sql).join('\n');
    expect(sql).toContain('acquisition_entry_item_id');
    expect(sql).toContain('asset_cost_target_source_uq');
    expect(sql).toContain('primary key (`project_id`)');
    expect(sql).toContain('cip_capitalizations_asset_id_unique');
    expect(sql).not.toMatch(/insert into|update `fixed_assets`/i);
    await knex.destroy();
  });
});
