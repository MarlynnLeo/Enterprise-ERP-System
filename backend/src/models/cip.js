/**
 * cip.js
 * @description 在建工程(CIP)数据模型
 * @date 2025-08-27
 */

const db = require('../config/db');
const { toCents, fromCents } = require('../utils/finance/settlementMath');
const { validateBusinessDate } = require('../utils/finance/businessDate');
const { logger } = require('../utils/logger');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');
const financeModel = require('./finance');
const DocumentLinkService = require('../services/business/DocumentLinkService');
const { DOCUMENT_LINK_TYPES: DocType } = require('../constants/documentLinkTypes');
const { accountingConfig } = require('../config/accountingConfig');
const { currentDateString } = require('../utils/dateUtils');
const { resolveActorLabel } = require('../utils/userUtils');
const { getAssetTypeText, getDepreciationMethodText } = require('../constants/systemConstants');
const AssetCostSourceService = require('../services/business/AssetCostSourceService');

function mapAssetType(value) {
  return getAssetTypeText(value) || value || '其他';
}

function mapDepreciationMethod(value) {
  return getDepreciationMethodText(value) || value || '直线法';
}

async function getOpenAccountingPeriodId(connection, accountingDate) {
  const [periods] = await connection.execute(
    `SELECT id FROM gl_periods
         WHERE is_closed = 0
           AND start_date <= ?
           AND end_date >= ?
         ORDER BY start_date DESC
         LIMIT 1`,
    [accountingDate, accountingDate]
  );

  if (periods.length === 0) {
    throw new Error(`未找到日期 ${accountingDate} 对应的开放会计期间`);
  }

  return periods[0].id;
}

async function getRequiredAccountId(connection, accountCode, accountName) {
  if (!accountCode) {
    throw new Error(`在建工程转固${accountName}科目编码未配置`);
  }
  const [rows] = await connection.execute(
    'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1 LIMIT 1',
    [accountCode]
  );

  if (rows.length === 0) {
    throw new Error(`在建工程转固缺少${accountName}科目(${accountCode})`);
  }

  return rows[0].id;
}

async function getEntryNumberById(connection, entryId) {
  const [entries] = await connection.execute('SELECT entry_number FROM gl_entries WHERE id = ?', [
    entryId,
  ]);
  return entries[0]?.entry_number || null;
}

const cipModel = {
  /**
   * 获取在建工程列表
   */
  getCipProjects: async (filters = {}, page = 1, limit = 10) => {
    try {
      const pagination = parsePagination(page, limit, { defaultPageSize: 10, maxPageSize: 100 });
      let query =
        'SELECT id, project_code, project_name, budget, accumulated_amount, start_date, estimated_end_date, status, responsible, department, notes, created_at, updated_at FROM cip_projects WHERE 1=1';
      const queryParams = [];

      if (filters.project_code) {
        query += ' AND project_code LIKE ?';
        queryParams.push(`%${filters.project_code}%`);
      }
      if (filters.project_name) {
        query += ' AND project_name LIKE ?';
        queryParams.push(`%${filters.project_name}%`);
      }
      if (filters.status) {
        query += ' AND status = ?';
        queryParams.push(filters.status);
      }

      // 获取总数 — 使用子查询包裹，避免依赖 SELECT * 替换
      const [countResult] = await db.pool.query(
        `SELECT COUNT(*) as total FROM (${query}) as _count_t`,
        queryParams
      );
      const total = countResult[0].total;

      // 分页
      query = appendPaginationSQL(
        query + ' ORDER BY created_at DESC',
        pagination.limit,
        pagination.offset
      );

      const [projects] = await db.pool.query(query, queryParams);

      return {
        projects,
        pagination: {
          total,
          page: pagination.page,
          limit: pagination.pageSize,
          totalPages: Math.ceil(total / pagination.pageSize),
        },
      };
    } catch (error) {
      logger.error('获取在建工程列表失败:', error);
      throw error;
    }
  },

  /**
   * 获取单个在建工程详情
   */
  getCipProjectById: async (id) => {
    try {
      const [projects] = await db.pool.query(
        'SELECT id, project_code, project_name, budget, accumulated_amount, start_date, estimated_end_date, status, responsible, department, notes, created_at, updated_at FROM cip_projects WHERE id = ?',
        [id]
      );
      if (!projects.length) return null;
      const [costSources] = await db.pool.query(
        `SELECT a.id, a.gl_entry_item_id, a.amount, a.source_date, a.reconciles_existing, e.entry_number
           FROM asset_cost_allocations a JOIN gl_entries e ON e.id = a.gl_entry_id
          WHERE a.target_type = 'cip' AND a.target_id = ? ORDER BY a.id`, [id]
      );
      return { ...projects[0], cost_sources: costSources };
    } catch (error) {
      logger.error('获取在建工程详情失败:', error);
      throw error;
    }
  },

  /**
   * 创建在建工程（累计金额强制 0，仅允许白名单字段）
   */
  createCipProject: async (data) => {
    try {
      if (data.status && data.status !== '建设中') {
        throw Object.assign(new Error('新建工程必须为建设中状态，转固请使用转固操作'), { code: 'VALIDATION_ERROR' });
      }
      const [result] = await db.pool.query(
        `INSERT INTO cip_projects
         (project_code, project_name, budget, accumulated_amount, start_date, estimated_end_date, status, responsible, department, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.project_code,
          data.project_name,
          data.budget || 0,
          0, // 累计金额只允许由过账推导，禁止客户端写入
          data.start_date || null,
          data.estimated_end_date || null,
          '建设中',
          data.responsible || null,
          data.department || null,
          data.notes || null,
        ]
      );
      return result.insertId;
    } catch (error) {
      logger.error('创建在建工程失败:', error);
      throw error;
    }
  },

  /**
   * 更新在建工程 — 列白名单，禁止 mass assignment / 标识符注入
   * 注意：accumulated_amount 不在白名单内，归集请用 addAccumulatedAmount
   */
  updateCipProject: async (id, data) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[project]] = await connection.query('SELECT id, project_code, status FROM cip_projects WHERE id = ? FOR UPDATE', [id]);
      if (!project || project.status !== '建设中') throw Object.assign(new Error('工程不存在或已转固，不能修改'), { code: 'VALIDATION_ERROR' });
      if (data.project_code !== undefined && data.project_code !== project.project_code) throw Object.assign(new Error('工程编号创建后不能修改'), { code: 'VALIDATION_ERROR' });
      if (data.status && data.status !== '建设中') {
        throw Object.assign(new Error('工程状态只能通过转固操作变更'), { code: 'VALIDATION_ERROR' });
      }
      const ALLOWED_UPDATE_COLUMNS = new Set([
        'project_name',
        'budget',
        'start_date',
        'estimated_end_date',
        'responsible',
        'department',
        'notes',
      ]);
      // 禁止客户端改写累计金额（由服务端 addAccumulatedAmount / 过账维护）
      const fields = [];
      const values = [];

      Object.keys(data || {}).forEach((key) => {
        if (!ALLOWED_UPDATE_COLUMNS.has(key)) return;
        fields.push(`${key} = ?`);
        values.push(data[key]);
      });

      if (fields.length === 0) { await connection.commit(); return true; }

      values.push(id);

      const [result] = await connection.query(
        `UPDATE cip_projects SET ${fields.join(', ')} WHERE id = ? AND status = '建设中'`,
        values
      );
      if (!result.affectedRows) {
        throw Object.assign(new Error('工程不存在或已转固，不能修改'), { code: 'VALIDATION_ERROR' });
      }
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('更新在建工程失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 原子归集在建工程成本（服务端专用，不经通用 update 白名单）
   * @param {number} id 工程 ID
   * @param {number} delta 增加金额（必须 > 0）
   * @param {object} source 已过账借方明细、操作人及历史核对标记
   * @param {object} [connection] 可选外层事务连接
   * @returns {Promise<{ previousAmount: number, newAmount: number }>}
   */
  addAccumulatedAmount: async (id, delta, source = {}, connection = null) => {
    const cents = toCents(delta);
    const amount = fromCents(cents);
    if (!Number.isFinite(Number(delta)) || !Number.isSafeInteger(cents) || cents <= 0) {
      throw new Error('归集金额必须大于 0');
    }

    const ownConnection = !connection;
    let conn = connection;

    try {
      if (ownConnection) {
        conn = await db.pool.getConnection();
        await conn.beginTransaction();
      }

      const [projects] = await conn.query(
        'SELECT id, project_code, status, accumulated_amount FROM cip_projects WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!projects.length) {
        throw new Error('在建工程不存在');
      }
      if (projects[0].status !== '建设中') {
        throw new Error('工程不存在或已不可附加费用');
      }

      const previousAmount = parseFloat(projects[0].accumulated_amount || 0);
      const allocation = await AssetCostSourceService.allocate(conn, {
        kind: 'cip', targetId: id, targetCode: projects[0].project_code,
        sourceId: source.source_entry_item_id, amount: delta, actor: source.created_by,
        reconcilesExisting: source.reconciles_existing === true,
      });
      if (allocation.reused) {
        if (ownConnection) await conn.commit();
        return { previousAmount, newAmount: previousAmount, allocationId: allocation.id, reused: true };
      }
      if (source.reconciles_existing === true) {
        const [[totals]] = await conn.query('SELECT COALESCE(SUM(amount), 0) AS amount FROM asset_cost_allocations WHERE target_type = ? AND target_id = ? FOR UPDATE', ['cip', id]);
        if (toCents(totals.amount) > toCents(previousAmount)) throw Object.assign(new Error('关联历史来源金额不能超过原有累计归集金额'), { code: 'VALIDATION_ERROR' });
      } else {
        const [result] = await conn.query(
          `UPDATE cip_projects
             SET accumulated_amount = COALESCE(accumulated_amount, 0) + ?,
                 updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = '建设中'`,
          [amount, id]
        );
        if (!result.affectedRows) {
          throw new Error('归集成本失败：工程状态已变更');
        }
      }

      const newAmount = source.reconciles_existing === true ? previousAmount : fromCents(toCents(previousAmount) + cents);
      if (ownConnection) {
        await conn.commit();
      }
      return { previousAmount, newAmount, allocationId: allocation.id, reused: false };
    } catch (error) {
      if (ownConnection && conn) {
        try {
          await conn.rollback();
        } catch {
          /* ignore */
        }
      }
      logger.error('原子归集在建工程成本失败:', error);
      throw error;
    } finally {
      if (ownConnection && conn) {
        conn.release();
      }
    }
  },

  /**
   * 删除在建工程
   */
  deleteCipProject: async (id) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      // 检查状态，只有建设中且无发生成本的才允许删除
      const [project] = await connection.query(
        'SELECT id, status, accumulated_amount FROM cip_projects WHERE id = ? FOR UPDATE',
        [id]
      );
      if (project.length === 0) throw new Error('在建工程不存在');

      if (project[0].status !== '建设中' || project[0].accumulated_amount > 0) {
        throw new Error('该工程已有发生成本或已转固，不允许删除');
      }

      const [result] = await connection.query(
        "DELETE FROM cip_projects WHERE id = ? AND status = '建设中' AND COALESCE(accumulated_amount, 0) = 0",
        [id]
      );
      if (!result.affectedRows) throw new Error('工程状态或归集成本已变更，不能删除');
      await connection.commit();
      return result.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      logger.error('删除在建工程失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 将在建工程转为固定资产
   */
  transferToFixedAsset: async (id, assetData, operator = {}) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 检查工程状态
      const [projects] = await connection.query(
        'SELECT id, project_code, project_name, budget, accumulated_amount, start_date, estimated_end_date, status, responsible, department, notes, created_at, updated_at FROM cip_projects WHERE id = ? FOR UPDATE',
        [id]
      );
      if (projects.length === 0) throw new Error('在建工程不存在');

      const project = projects[0];
      const [capitalizations] = await connection.query('SELECT asset_id FROM cip_capitalizations WHERE project_id = ? FOR UPDATE', [id]);
      if (project.status !== '建设中' || capitalizations.length) {
        throw new Error('该工程已经转固，不能重复操作');
      }

      // 强制资产原值等于工程归集成本
      const assetCost = parseFloat(project.accumulated_amount || 0);
      if (assetCost <= 0) {
        throw new Error('在建工程归集成本为0，不能转为无形/固定资产');
      }

      assetData.acquisition_cost = assetCost;
      assetData.current_value = assetCost;
      const acquisitionDate = validateBusinessDate(assetData.acquisition_date || currentDateString(), '转固日期');
      await AssetCostSourceService.assertCipBalance(connection, project, acquisitionDate);
      const lifeYears = Number(assetData.useful_life ?? 5);
      if (!Number.isSafeInteger(lifeYears) || lifeYears <= 0 || !Number.isSafeInteger(lifeYears * 12)) {
        throw Object.assign(new Error('资产使用年限必须为正整数'), { code: 'VALIDATION_ERROR' });
      }
      const usefulLifeMonths = lifeYears * 12;
      const salvageValue = Number(assetData.salvage_value ?? 0);
      if (!Number.isFinite(salvageValue) || salvageValue < 0 || toCents(salvageValue) > toCents(assetCost)) {
        throw Object.assign(new Error('资产残值必须介于0和转固成本之间'), { code: 'VALIDATION_ERROR' });
      }
      const assetType = mapAssetType(assetData.asset_type);
      const depreciationMethod = mapDepreciationMethod(assetData.depreciation_method);
      const operatorName =
        operator.operatorName ||
        String(operator.userId || (await resolveActorLabel(null, operator)));
      const createdBy = operator.userId || operator.id || null;

      // 2. 插入新固定资产 (复用 assetsModel 的构建逻辑，或者直接执行 INSERT)
      // 为保持独立性，自己执行INSERT
      const [assetResult] = await connection.query(
        `INSERT INTO fixed_assets
         (asset_code, asset_name, category_id, asset_type, acquisition_date, acquisition_cost,
           salvage_value, current_value, net_value, useful_life, depreciation_method, status,
           location_id, department_id, custodian, notes, created_by, audit_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '在用', ?, ?, ?, ?, ?, 'draft')`,
        [
          assetData.asset_code,
          assetData.asset_name,
          assetData.category_id || null,
          assetType,
          acquisitionDate,
          assetCost,
          fromCents(toCents(salvageValue)),
          assetCost,
          assetCost,
          usefulLifeMonths,
          depreciationMethod,
          assetData.location_id || null, // 文本
          assetData.department_id || null,
          assetData.custodian || null,
          `由在建工程 [${project.project_code}] ${project.project_name} 结转生成。${assetData.notes || ''}`,
          operatorName,
        ]
      );

      const newAssetId = assetResult.insertId;

      // 3. 记录固定资产变更日志
      await connection.query(
        `INSERT INTO asset_change_logs
         (asset_id, change_type, change_date, changed_by, field_name, old_value, new_value, remarks)
         VALUES (?, '在建工程转固', ?, ?, 'status', null, '在用', ?)`,
        [
          newAssetId,
          acquisitionDate,
          operatorName,
          `从在建工程 ${project.project_name} 结转而来，结转金额: ${assetCost}`,
        ]
      );

      await accountingConfig.loadFromDatabase({ pool: connection });
      const fixedAssetAccountId = await getRequiredAccountId(
        connection,
        accountingConfig.getAccountCode('FIXED_ASSETS'),
        '固定资产'
      );
      const cipAccountId = await getRequiredAccountId(
        connection,
        accountingConfig.getAccountCode('CONSTRUCTION_IN_PROGRESS'),
        '在建工程'
      );
      const periodId = await getOpenAccountingPeriodId(connection, acquisitionDate);

      const entryId = await financeModel.createEntry(
        {
          entry_date: acquisitionDate,
          posting_date: acquisitionDate,
          document_type: '转固单',
          document_number: `CIP-ID-${project.id}`,
          transaction_type: 'cip_capitalization',
          transaction_id: project.id,
          period_id: periodId,
          description: `在建工程转固: ${project.project_name} -> ${assetData.asset_name}`,
          created_by: createdBy,
          status: 'posted',
          is_posted: 1,
        },
        [
          {
            account_id: fixedAssetAccountId,
            debit_amount: assetCost,
            credit_amount: 0,
            description: `固定资产转入 - ${assetData.asset_name}`,
          },
          {
            account_id: cipAccountId,
            debit_amount: 0,
            credit_amount: assetCost,
            description: `在建工程转出 - ${project.project_name}`,
          },
        ],
        connection
      );
      const entryNumber = await getEntryNumberById(connection, entryId);
      await connection.query(
        'INSERT INTO cip_capitalizations (project_id, asset_id, gl_entry_id, amount, capitalization_date, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [project.id, newAssetId, entryId, assetCost, acquisitionDate, createdBy]
      );
      const [[assetLine]] = await connection.query('SELECT id FROM gl_entry_items WHERE entry_id = ? AND account_id = ? AND debit_amount = ? AND credit_amount = 0', [entryId, fixedAssetAccountId, assetCost]);
      if (!assetLine) throw new Error('转固凭证缺少固定资产借方明细');
      await connection.query('UPDATE fixed_assets SET acquisition_entry_item_id = ? WHERE id = ?', [assetLine.id, newAssetId]);

      await DocumentLinkService.createLink({
        source_type: DocType.CIP_PROJECT, source_id: project.id, source_code: project.project_code,
        target_type: DocType.ASSET, target_id: newAssetId, target_code: assetData.asset_code,
        created_by: createdBy,
      }, connection);
      await DocumentLinkService.createLink({
        source_type: DocType.CIP_PROJECT, source_id: project.id, source_code: project.project_code,
        target_type: DocType.FINANCE_VOUCHER, target_id: entryId, target_code: entryNumber,
        created_by: createdBy,
      }, connection);
      await DocumentLinkService.createLink({
        source_type: DocType.ASSET, source_id: newAssetId, source_code: assetData.asset_code,
        target_type: DocType.FINANCE_VOUCHER, target_id: entryId, target_code: entryNumber,
        created_by: createdBy,
      }, connection);

      // 4. 更新在建工程状态
      await connection.query(
        'UPDATE cip_projects SET status = ?, updated_at = NOW() WHERE id = ?',
        ['已转固', id]
      );

      await connection.commit();
      return newAssetId;
    } catch (error) {
      await connection.rollback();
      logger.error('在建工程转固失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = cipModel;
