/**
 * assets.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const db = require('../config/db');
const financeModel = require('./finance');
const { DOCUMENT_TYPE_MAPPING } = require('../constants/financeConstants');
const CodeGeneratorService = require('../services/business/CodeGeneratorService');
const DocumentLinkService = require('../services/business/DocumentLinkService');

async function getOpenAccountingPeriodId(connection, accountingDate = null) {
  const params = [];
  let sql = 'SELECT id FROM gl_periods WHERE is_closed = false';

  if (accountingDate) {
    sql += ' AND start_date <= ? AND end_date >= ?';
    params.push(accountingDate, accountingDate);
  }

  sql += ' ORDER BY start_date DESC LIMIT 1';

  const [periods] = await connection.execute(sql, params);

  if (periods.length === 0) {
    throw new Error(accountingDate
      ? `No open accounting period found for ${accountingDate}`
      : 'No open accounting period found');
  }

  return periods[0].id;
}

function requirePositiveInteger(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || String(value).trim() !== String(parsed)) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

function normalizeDepreciationMonth(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) {
    throw new Error('折旧日期格式不正确，请使用YYYY-MM或YYYY-MM-DD格式');
  }
  return `${match[1]}-${match[2]}`;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const DISPOSED_ASSET_STATUSES = new Set([
  '报废',
  '已处置',
  '已出售',
  '已转让',
  '已捐赠',
  'disposed',
  'sold',
  'transferred',
  'donated',
]);

const IMPAIRABLE_ASSET_STATUSES = new Set(['在用', '闲置', 'in_use', 'idle']);

function calculateAssetNetBookValue(asset) {
  const acquisitionCost = Number(asset.acquisition_cost) || 0;
  const accumulatedDepreciation = Number(asset.accumulated_depreciation) || 0;
  const impairmentAmount = Number(asset.impairment_amount) || 0;
  return roundMoney(Math.max(0, acquisitionCost - accumulatedDepreciation - impairmentAmount));
}

function isDisposedAsset(asset) {
  return DISPOSED_ASSET_STATUSES.has(String(asset?.status || '').trim());
}

function ensureAssetApprovedForFinanceAction(asset, actionName) {
  if (asset.audit_status !== 'approved') {
    throw new Error(`${actionName}失败：资产必须先审核通过`);
  }
}

function ensureAssetNotDisposed(asset, actionName) {
  if (isDisposedAsset(asset)) {
    throw new Error(`${actionName}失败：资产已处置，不能重复操作`);
  }
}

function ensureAssetReadyForFinanceAction(asset, actionName) {
  ensureAssetApprovedForFinanceAction(asset, actionName);
  ensureAssetNotDisposed(asset, actionName);
}

function hasPositiveAmount(item) {
  return roundMoney(item.debit_amount) > 0 || roundMoney(item.credit_amount) > 0;
}

const DEPRECIATION_METHOD_MAP = {
  直线法: 'straight_line',
  双倍余额递减法: 'double_declining',
  年数总和法: 'sum_of_years',
  工作量法: 'units_of_production',
  不计提: 'no_depreciation',
};

function calculateDepreciationSnapshot(asset, depreciationMonthStart, alreadySubmitted = false) {
  const originalValue = Number(asset.acquisition_cost) || 0;
  const accumulatedDepreciation = Number(asset.accumulated_depreciation) || 0;
  const impairmentAmount = Number(asset.impairment_amount) || 0;
  const salvageValue = Number(asset.salvage_value) || 0;
  const usefulLifeMonths = Math.max(Number(asset.useful_life) || 60, 1);
  const residualValue = Math.min(Math.max(salvageValue, 0), originalValue);
  const netValueBefore = roundMoney(
    Math.max(0, originalValue - accumulatedDepreciation - impairmentAmount)
  );
  const acquisitionDate = asset.acquisition_date ? new Date(asset.acquisition_date) : null;
  const targetDate = new Date(depreciationMonthStart);
  const usedMonths = acquisitionDate && !Number.isNaN(acquisitionDate.getTime())
    ? Math.max(
      0,
      (targetDate.getFullYear() - acquisitionDate.getFullYear()) * 12 +
        (targetDate.getMonth() - acquisitionDate.getMonth())
    )
    : 0;
  const normalizedMethod = DEPRECIATION_METHOD_MAP[asset.depreciation_method] || asset.depreciation_method;

  let depreciationAmount = 0;
  if (!alreadySubmitted && normalizedMethod !== 'no_depreciation' && netValueBefore > residualValue && usedMonths < usefulLifeMonths) {
    if (normalizedMethod === 'double_declining') {
      const remainingMonths = Math.max(usefulLifeMonths - usedMonths, 1);
      depreciationAmount = remainingMonths <= 24
        ? (netValueBefore - residualValue) / remainingMonths
        : netValueBefore * 2 / usefulLifeMonths;
    } else {
      depreciationAmount = (originalValue - residualValue) / usefulLifeMonths;
    }

    depreciationAmount = Math.min(Math.max(depreciationAmount, 0), netValueBefore - residualValue);
  }

  depreciationAmount = roundMoney(depreciationAmount);
  const netValueAfter = roundMoney(Math.max(residualValue, netValueBefore - depreciationAmount));

  return {
    originalValue: roundMoney(originalValue),
    netValueBefore,
    depreciationAmount,
    netValueAfter,
    usedMonths,
    usefulLifeMonths,
    residualValue,
    normalizedMethod,
  };
}

/**
 * 固定资产模块数据库操作
 */
const assetsModel = {
  /**
   * 创建固定资产
   */
  createAsset: async (assetData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 插入固定资产
      const [result] = await connection.query(
        `INSERT INTO fixed_assets
        (asset_code, asset_name, asset_type, category_id, acquisition_date,
         acquisition_cost, depreciation_method, useful_life, salvage_value,
         current_value, net_value, accumulated_depreciation, location_id, department_id,
         custodian, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assetData.asset_code,
          assetData.asset_name,
          assetData.asset_type,
          assetData.category_id || null,
          assetData.acquisition_date,
          assetData.acquisition_cost,
          assetData.depreciation_method,
          assetData.useful_life,
          assetData.salvage_value || 0,
          assetData.acquisition_cost, // 初始当前价值等于取得成本
          assetData.acquisition_cost,
          0, // 初始累计折旧为0
          assetData.location_id || null,
          assetData.department_id || null,
          assetData.custodian || null,
          assetData.status || '在用',
          assetData.notes || null,
        ]
      );

      const assetId = result.insertId;
      logger.info(`固定资产创建成功，ID: ${assetId}`);

      // 如果提供了会计分录信息，创建资产购置会计分录
      if (assetData.gl_entry) {
        const entryData = {
          entry_number: assetData.gl_entry.entry_number,
          entry_date: assetData.acquisition_date,
          posting_date: assetData.acquisition_date,
          document_type: DOCUMENT_TYPE_MAPPING.ASSET_ACQUISITION,
          document_number: assetData.asset_code,
          period_id: assetData.gl_entry.period_id,
          description: `固定资产购置: ${assetData.asset_name}`,
          created_by: assetData.gl_entry.created_by,
          status: 'posted',
          is_posted: 1,
        };

        // 资产购置分录明细
        const entryItems = [
          // 借：固定资产
          {
            account_id: assetData.gl_entry.asset_account_id,
            debit_amount: assetData.acquisition_cost,
            credit_amount: 0,
            description: `固定资产购置 - ${assetData.asset_name}`,
          },
          // 贷：银行/应付账款
          {
            account_id: assetData.gl_entry.payment_account_id,
            debit_amount: 0,
            credit_amount: assetData.acquisition_cost,
            description: `固定资产购置付款 - ${assetData.asset_name}`,
          },
        ];

        // 创建会计分录
        const entryId = await financeModel.createEntry(entryData, entryItems, connection);
        await DocumentLinkService.tryAutoLink(
          'asset',
          assetId,
          assetData.asset_code,
          'finance_voucher',
          entryId,
          entryData.entry_number,
          assetData.gl_entry.created_by || null,
          connection
        );
      }

      await connection.commit();


      return assetId;
    } catch (error) {
      await connection.rollback();
      logger.error('创建固定资产失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 按ID获取固定资产
   */
  getAssetById: async (id) => {
    // 仅获取部门信息，不再获取locations
    const [departments] = await db.pool.query('SELECT id, name FROM departments');

    // 构建部门的ID到名称的映射
    const departmentMap = {};
    departments.forEach((dept) => {
      departmentMap[dept.id] = dept.name;
    });

    const [assets] = await db.pool.query(
      `SELECT a.*
       FROM fixed_assets a
       WHERE a.id = ?`,
      [id]
    );

    if (assets.length === 0) return null;

    const asset = assets[0];

    // 转换折旧方法为前端格式
    const depreciationMethodMap = {
      直线法: 'straight_line',
      双倍余额递减法: 'double_declining',
      年数总和法: 'sum_of_years',
      工作量法: 'units_of_production',
      不计提: 'no_depreciation',
    };

    // 转换资产类型为前端格式
    const assetTypeMap = {
      机器设备: 'machine',
      电子设备: 'electronic',
      办公家具: 'furniture',
      房屋建筑: 'building',
      车辆: 'vehicle',
      其他: 'other',
    };

    // 直接使用location_id作为location名称

    // 获取部门名称
    const department_name = asset.department_id ? departmentMap[asset.department_id] || '' : '';

    // 转换数据格式
    return {
      id: asset.id,
      asset_code: asset.asset_code,
      asset_name: asset.asset_name,
      asset_type: assetTypeMap[asset.asset_type] || 'other',
      category_id: asset.category_id,
      acquisition_date: asset.acquisition_date,
      acquisition_cost: parseFloat(asset.acquisition_cost),
      depreciation_method: depreciationMethodMap[asset.depreciation_method] || 'straight_line',
      useful_life: Math.ceil(asset.useful_life / 12), // 转换为年
      salvage_value: parseFloat(asset.salvage_value),
      current_value: calculateAssetNetBookValue(asset),
      net_value: calculateAssetNetBookValue(asset),
      accumulated_depreciation: parseFloat(asset.accumulated_depreciation),
      impairment_amount: parseFloat(asset.impairment_amount || 0),
      location_id: asset.location_id, // 直接使用location_id，现在是VARCHAR
      location_name: asset.location_id || '', // 使用location_id作为location_name
      department_id: asset.department_id,
      department_name: department_name,
      custodian: asset.custodian,
      status: asset.status,
      audit_status: asset.audit_status,
      notes: asset.notes || '',
    };
  },

  /**
   * 获取固定资产列表
   */
  getAssets: async (filters = {}, page = 1, pageSize = 20) => {
    try {
      // 转换参数为数字
      page = parseInt(page, 10) || 1;
      pageSize = parseInt(pageSize, 10) || 20;

      // 首先验证是否能获取到任何数据
      const testQuery = 'SELECT COUNT(*) as count FROM fixed_assets';
      const [testResult] = await db.pool.query(testQuery);
      // 固定资产表记录数查询日志已移除

      if (testResult[0].count === 0) {
        return {
          assets: [],
          pagination: {
            total: 0,
            page: page,
            pageSize: pageSize,
            totalPages: 0,
          },
        };
      }

      // 仅预先获取部门信息
      const [departments] = await db.pool.query('SELECT id, name FROM departments');

      // 构建部门的ID到名称的映射
      const departmentMap = {};
      departments.forEach((dept) => {
        departmentMap[dept.id] = dept.name;
      });

      // 表结构由 migrations/20260312000008 管理，无需运行时验证


      let query = 'SELECT fa.*, ac.name as category_name FROM fixed_assets fa LEFT JOIN asset_categories ac ON fa.category_id = ac.id';
      const whereConditions = [];
      const params = [];

      // 添加过滤条件
      if (filters.asset_code) {
        whereConditions.push('fa.asset_code LIKE ?');
        params.push(`%${filters.asset_code}%`);
      }

      if (filters.asset_name) {
        whereConditions.push('fa.asset_name LIKE ?');
        params.push(`%${filters.asset_name}%`);
      }

      if (filters.asset_type) {
        whereConditions.push('fa.asset_type = ?');
        params.push(filters.asset_type);
      }

      if (filters.category_id) {
        whereConditions.push('fa.category_id = ?');
        params.push(filters.category_id);
      }

      if (filters.status) {
        // 前端状态值映射到数据库状态值
        const statusMap = {
          in_use: '在用',
          idle: '闲置',
          under_repair: '维修',
          disposed: '报废',
        };
        const dbStatus = statusMap[filters.status] || filters.status;

        whereConditions.push('fa.status = ?');
        params.push(dbStatus);
      }

      // 添加WHERE子句
      if (whereConditions.length > 0) {
        query += ' WHERE ' + whereConditions.join(' AND ');
      }

      // 添加排序
      query += ' ORDER BY fa.id DESC';

      // 获取总记录数
      let countQuery = 'SELECT COUNT(*) as total FROM fixed_assets fa';
      if (whereConditions.length > 0) {
        countQuery += ' WHERE ' + whereConditions.join(' AND ');
      }

      const [countResult] = await db.pool.query(countQuery, params);
      const total = countResult && countResult[0] ? countResult[0].total : 0;

      // 添加分页（直接拼接，已验证）
      const offset = (page - 1) * pageSize;
      query += ` LIMIT ${pageSize} OFFSET ${offset}`;

      // 使用 query 避免 LIMIT/OFFSET 参数化问题
      const [assets] = await db.pool.query(query, params);

      // 折旧方法中文转英文映射
      const depreciationMethodMap = {
        '直线法': 'straight_line',
        '双倍余额递减法': 'double_declining',
        '年数总和法': 'sum_of_years',
        '工作量法': 'units_of_production',
        '不计提': 'no_depreciation',
      };

      // 创建一个安全的资产对象列表，确保即使数据库字段缺失也能返回所需的字段
      const formattedAssets = (assets || []).map((asset) => ({
        id: asset.id || 0,
        assetCode: asset.asset_code || '',
        assetName: asset.asset_name || '',
        categoryId: asset.category_id || null,
        categoryName: asset.category_name || '',
        purchaseDate: asset.acquisition_date || '',
        originalValue: parseFloat(asset.acquisition_cost || 0),
        netValue: calculateAssetNetBookValue(asset),
        accumulatedDepreciation: parseFloat(asset.accumulated_depreciation || 0),
        usefulLife: asset.useful_life ? Math.ceil(asset.useful_life / 12) : 5, // 月转年
        salvageValue: parseFloat(asset.salvage_value || 0),
        salvageRate: asset.salvage_value && asset.acquisition_cost
          ? parseFloat(((asset.salvage_value / asset.acquisition_cost) * 100).toFixed(2))
          : 5, // 默认5%
        depreciationMethod: depreciationMethodMap[asset.depreciation_method] || asset.depreciation_method || 'straight_line',
        location: asset.location_id || '',
        department: asset.department_id ? departmentMap[asset.department_id] || '' : '',
        responsible: asset.custodian || '',
        status: (() => {
          const statusDisplayMap = {
            '在用': 'in_use',
            '闲置': 'idle',
            '维修': 'under_repair',
            '报废': 'disposed',
            '已处置': 'disposed',
            '已出售': 'sold',
            '已转让': 'transferred',
            '已捐赠': 'donated',
          };
          return statusDisplayMap[asset.status] || asset.status || 'in_use';
        })(),
        auditStatus: asset.audit_status || 'draft',
        auditedBy: asset.audited_by || null,
        auditedAt: asset.audited_at || null,
      }));

      return {
        assets: formattedAssets,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch {
      // 出错时返回空结果而不是抛出异常
      return {
        assets: [],
        pagination: {
          total: 0,
          page: page,
          pageSize: pageSize,
          totalPages: 0,
        },
      };
    }
  },

  /**
   * 更新固定资产
   */
  updateAsset: async (id, assetData) => {
    try {
      const {
        getAssetTypeText,
        getDepreciationMethodText,
        getAssetStatusText,
      } = require('../constants/systemConstants');

      // 转换为数据库支持的格式
      const assetType = getAssetTypeText(assetData.asset_type) || '其他';
      const depreciationMethod = getDepreciationMethodText(assetData.depreciation_method) || '直线法';
      const status = getAssetStatusText(assetData.status) || '在用';

      // 将年转换为月
      const usefulLife = assetData.useful_life ? assetData.useful_life * 12 : 60; // 默认5年(60个月)

      // 构建动态更新字段
      let sql = `UPDATE fixed_assets SET
         asset_name = ?,
         asset_type = ?,
         category_id = ?,
         depreciation_method = ?,
         useful_life = ?,
         salvage_value = ?,
         location_id = ?,
         department_id = ?,
         custodian = ?,
         status = ?,
         notes = ?`;

      const params = [
        assetData.asset_name,
        assetType,
        assetData.category_id || null,
        depreciationMethod,
        usefulLife,
        assetData.salvage_value,
        assetData.location_id || null,
        assetData.department_id || null,
        assetData.custodian || null,
        status,
        assetData.notes || null,
      ];

      // 如果原值变化，同步更新acquisition_cost、current_value和accumulated_depreciation
      if (assetData.acquisition_cost !== undefined) {
        sql += `, acquisition_cost = ?, current_value = ?, net_value = ?, accumulated_depreciation = ?`;
        const nextCurrentValue = parseFloat(assetData.current_value || assetData.acquisition_cost);
        params.push(
          parseFloat(assetData.acquisition_cost),
          nextCurrentValue,
          nextCurrentValue,
          parseFloat(assetData.accumulated_depreciation || 0)
        );
      }

      sql += ` WHERE id = ?`;
      params.push(id);

      const [result] = await db.pool.query(sql, params);

      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新固定资产失败:', error);
      throw error;
    }
  },

  /**
   * 计算固定资产折旧
   * @param {Object} params 折旧参数
   * @param {Number} params.assetId 资产ID
   * @param {Number} params.periodId 会计期间ID
   * @param {String} params.depreciationDate 折旧日期
   * @param {Object} params.glEntry 会计分录信息
   */
  calculateDepreciation: async (params) => {
    const connection = await db.pool.getConnection();
    try {
      logger.info('开始计算折旧，参数:', params);
      await connection.beginTransaction();

      // 获取资产信息
      const [assets] = await connection.query('SELECT * FROM fixed_assets WHERE id = ? FOR UPDATE', [
        params.assetId,
      ]);
      if (assets.length === 0) {
        throw new Error(`资产ID ${params.assetId} 不存在`);
      }

      const asset = assets[0];
      ensureAssetReadyForFinanceAction(asset, '折旧计提');
      if (asset.status !== '在用') {
        throw new Error(`折旧计提失败：资产状态为${asset.status}`);
      }
      logger.info('获取到资产信息:', {
        id: asset.id,
        name: asset.asset_name,
        cost: asset.acquisition_cost,
      });

      // 检查当前期间是否已计提折旧
      try {
        const [existingDepreciation] = await connection.query(
          'SELECT * FROM asset_depreciation WHERE asset_id = ? AND period_id = ?',
          [params.assetId, params.periodId]
        );

        if (existingDepreciation.length > 0) {
          throw new Error('该资产在当前会计期间已计提折旧');
        }
      } catch (depError) {
        // 如果查询失败，检查是否是表不存在的错误
        if (depError.code === 'ER_NO_SUCH_TABLE') {
          // 表结构由 migrations/20260312000008_baseline_asset_bank_tables.js 管理
          // 如果表不存在，说明迁移尚未执行
          logger.error('asset_depreciation 表不存在，请确认 Knex 迁移已执行');
          throw new Error('asset_depreciation 表不存在，请先运行 npm run migrate', {
            cause: depError,
          });
        } else if (depError.message !== '该资产在当前会计期间已计提折旧') {
          throw depError;
        }
      }

      // 计算折旧金额
      let depreciationAmount = 0;
      const depreciableValue = asset.acquisition_cost - (asset.salvage_value || 0);
      logger.info('可计提折旧价值:', depreciableValue);

      switch (asset.depreciation_method) {
        case '直线法':
        case 'straight_line':
          // 每月折旧金额 = (原值 - 残值) / 使用年限(月)
          depreciationAmount = depreciableValue / (asset.useful_life || 60); // 默认5年
          break;

        case '双倍余额递减法':
        case 'double_declining': {
          // 每月折旧率 = 2 / 使用年限(月)
          // 每月折旧金额 = 账面净值 * 折旧率
          const monthlyRate = 2 / (asset.useful_life || 60);
          depreciationAmount = (asset.current_value - asset.accumulated_depreciation) * monthlyRate;

          // 确保不会折旧到低于残值
          if (
            asset.current_value - asset.accumulated_depreciation - depreciationAmount <
            asset.salvage_value
          ) {
            depreciationAmount =
              asset.current_value - asset.accumulated_depreciation - asset.salvage_value;
          }
          break;
        }

        case '年数总和法':
        case 'sum_of_years':
          // 这里简化为线性，实际实现会更复杂
          depreciationAmount = depreciableValue / (asset.useful_life || 60);
          break;

        case '工作量法':
        case 'units_of_production':
          // 工作量法需要额外参数，这里暂不实现
          logger.warn('工作量法暂不支持自动计算，使用直线法替代');
          depreciationAmount = depreciableValue / (asset.useful_life || 60);
          break;

        case '不计提':
        case 'no_depreciation':
          depreciationAmount = 0;
          break;

        default:
          logger.warn(`未知的折旧方法 ${asset.depreciation_method}，使用直线法`);
          depreciationAmount = depreciableValue / (asset.useful_life || 60);
      }

      // 确保折旧金额不为负
      depreciationAmount = Math.max(0, depreciationAmount);

      // 四舍五入到2位小数
      depreciationAmount = Math.round(depreciationAmount * 100) / 100;
      logger.info('计算出的折旧金额:', depreciationAmount);

      // 计算折旧前后的账面价值
      const bookValueBefore = calculateAssetNetBookValue(asset);
      const bookValueAfter = bookValueBefore - depreciationAmount;
      logger.info('折旧前账面价值:', bookValueBefore, '折旧后账面价值:', bookValueAfter);

      try {
        // 插入折旧记录
        const [depResult] = await connection.query(
          `INSERT INTO asset_depreciation
          (asset_id, period_id, depreciation_date, depreciation_amount,
           book_value_before, book_value_after, is_posted, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            params.assetId,
            params.periodId,
            params.depreciationDate,
            depreciationAmount,
            bookValueBefore,
            bookValueAfter,
            false, // 初始未过账
            params.notes || null,
          ]
        );

        const depreciationId = depResult.insertId;
        logger.info('折旧记录已创建，ID:', depreciationId);

        // 更新资产的累计折旧和当前价值 (当前价值 = 原值 - 新累计折旧 - 减值准备)
        await connection.query(
          `UPDATE fixed_assets
           SET accumulated_depreciation = accumulated_depreciation + ?,
               current_value = acquisition_cost - (accumulated_depreciation + ?) - IFNULL(impairment_amount, 0),
               net_value = acquisition_cost - (accumulated_depreciation + ?) - IFNULL(impairment_amount, 0)
           WHERE id = ?`,
          [depreciationAmount, depreciationAmount, depreciationAmount, params.assetId]
        );
        logger.info('资产记录已更新');

        // 如果提供了会计分录信息，创建折旧会计分录
        if (params.glEntry) {
          const entryData = {
            entry_number: params.glEntry.entry_number,
            entry_date: params.depreciationDate,
            posting_date: params.depreciationDate,
            document_type: '折旧单',
            document_number: `DEP-${asset.asset_code}-${new Date(params.depreciationDate).toISOString().slice(0, 7)}`,
            period_id: params.periodId,
            description: `固定资产折旧: ${asset.asset_name}`,
            created_by: params.glEntry.created_by,
            status: 'posted',
            is_posted: 1,
          };

          // 折旧分录明细
          const entryItems = [
            // 借：折旧费用
            {
              account_id: params.glEntry.expense_account_id,
              debit_amount: depreciationAmount,
              credit_amount: 0,
              description: `折旧费用 - ${asset.asset_name}`,
            },
            // 贷：累计折旧
            {
              account_id: params.glEntry.accumulated_depreciation_account_id,
              debit_amount: 0,
              credit_amount: depreciationAmount,
              description: `累计折旧 - ${asset.asset_name}`,
            },
          ];

          // 创建会计分录
          const entryId = await financeModel.createEntry(entryData, entryItems, connection);
          await DocumentLinkService.tryAutoLink(
            'asset',
            params.assetId,
            asset.asset_code,
            'finance_voucher',
            entryId,
            entryData.entry_number,
            params.glEntry.created_by || null,
            connection
          );
          await DocumentLinkService.tryAutoLink(
            'asset_depreciation',
            depreciationId,
            `${asset.asset_code}-${new Date(params.depreciationDate).toISOString().slice(0, 7)}`,
            'finance_voucher',
            entryId,
            entryData.entry_number,
            params.glEntry.created_by || null,
            connection
          );

          // 将折旧记录标记为已过账
          await connection.query('UPDATE asset_depreciation SET is_posted = true WHERE id = ?', [
            depreciationId,
          ]);
        }

        await connection.commit();
        logger.info('事务已提交，折旧计算完成');
        return depreciationId;
      } catch (error) {
        logger.error('插入折旧记录时出错:', error);
        throw error;
      }
    } catch (error) {
      await connection.rollback();
      logger.error('计算固定资产折旧失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 批量试算折旧，不落库。
   * @param {string} depreciationDate 折旧年月或日期
   * @param {string|number|null} categoryId 资产类别
   * @param {string|null} department 部门名称
   */
  calculateBatchDepreciation: async (depreciationDate, categoryId = null, department = null) => {
    const month = normalizeDepreciationMonth(depreciationDate);
    const depreciationMonthStart = `${month}-01`;
    const queryParams = [];
    const where = [
      "fa.status = '在用'",
      "fa.audit_status = 'approved'",
      "fa.depreciation_method <> '不计提'",
    ];

    if (categoryId) {
      where.push('fa.category_id = ?');
      queryParams.push(categoryId);
    }
    if (department) {
      where.push('d.name = ?');
      queryParams.push(department);
    }

    const [assets] = await db.pool.query(
      `SELECT fa.id, fa.asset_code, fa.asset_name, fa.category_id,
              ac.name as category_name, fa.acquisition_date, fa.acquisition_cost,
              fa.current_value, fa.accumulated_depreciation, fa.impairment_amount, fa.salvage_value,
              fa.useful_life, fa.depreciation_method, fa.location_id,
              fa.department_id, d.name as department_name, fa.status,
              fad.id as depreciation_detail_id
       FROM fixed_assets fa
       LEFT JOIN asset_categories ac ON fa.category_id = ac.id
       LEFT JOIN departments d ON fa.department_id = d.id
       LEFT JOIN fixed_asset_depreciation_details fad
              ON fad.asset_id = fa.id
             AND DATE_FORMAT(fad.depreciation_date, '%Y-%m') = ?
       WHERE ${where.join(' AND ')}
       ORDER BY fa.asset_code`,
      [month, ...queryParams]
    );

    return assets.map((asset) => {
      const snapshot = calculateDepreciationSnapshot(
        asset,
        depreciationMonthStart,
        Boolean(asset.depreciation_detail_id)
      );

      return {
        id: asset.id,
        assetCode: asset.asset_code,
        assetName: asset.asset_name,
        categoryId: asset.category_id,
        categoryName: asset.category_name || '',
        department: asset.department_name || '',
        location: asset.location_id || '',
        purchaseDate: asset.acquisition_date,
        originalValue: snapshot.originalValue,
        netValueBefore: snapshot.netValueBefore,
        depreciationAmount: snapshot.depreciationAmount,
        netValueAfter: snapshot.netValueAfter,
        usedMonths: snapshot.usedMonths,
        usefulLife: Math.ceil(snapshot.usefulLifeMonths / 12),
        salvageRate: snapshot.originalValue > 0 ? roundMoney((snapshot.residualValue / snapshot.originalValue) * 100) : 0,
        depreciationMethod: snapshot.normalizedMethod,
        status: asset.status,
        submitted: Boolean(asset.depreciation_detail_id),
      };
    });
  },

  /**
   * 批量提交折旧计提
   * @param {string} depreciationDate 折旧日期 (YYYY-MM格式)
   * @param {Array} assets 资产列表
   */
  submitDepreciation: async (depreciationDate, assets, options = {}) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();
      logger.info('开始批量提交折旧计提:', { depreciationDate, assetsCount: assets.length });

      const depreciationMonth = normalizeDepreciationMonth(depreciationDate);
      const depreciationDateFormatted = `${depreciationMonth}-01`;
      const periodId = await getOpenAccountingPeriodId(connection, depreciationDateFormatted);
      const createdBy = requirePositiveInteger(options.created_by, 'created_by');

      // 获取折旧相关的会计科目（通过配置获取，避免硬编码）
      const { accountingConfig } = require('../config/accountingConfig');
      const depExpCode = accountingConfig.getAccountCode('DEPRECIATION_EXPENSE') || '6602';
      const accDepCode = accountingConfig.getAccountCode('ACCUMULATED_DEPRECIATION') || '1602';

      const [expenseAccount] = await connection.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true',
        [depExpCode]
      );

      const [accumulatedDepreciationAccount] = await connection.execute(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true',
        [accDepCode]
      );

      if (expenseAccount.length === 0 || accumulatedDepreciationAccount.length === 0) {
        throw new Error('未找到折旧相关的会计科目，请检查科目设置');
      }

      const expenseAccountId = expenseAccount[0].id;
      const accumulatedDepreciationAccountId = accumulatedDepreciationAccount[0].id;

      let totalDepreciationAmount = 0;
      const depreciationRecords = [];
      const skippedAssets = [];

      // 处理每个资产的折旧
      for (const assetData of assets) {
        const { id: assetId, depreciationAmount, netValueAfter } = assetData;

        if (!assetId) {
          skippedAssets.push({ assetId: null, reason: '缺少资产ID' });
          continue;
        }

        // 获取资产信息
        const [assetInfo] = await connection.execute(
          'SELECT * FROM fixed_assets WHERE id = ? FOR UPDATE',
          [assetId]
        );

        if (assetInfo.length === 0) {
          skippedAssets.push({ assetId, reason: '资产不存在' });
          continue;
        }

        const asset = assetInfo[0];
        if (asset.audit_status !== 'approved') {
          skippedAssets.push({ assetId, assetName: asset.asset_name, reason: '资产未审核' });
          continue;
        }
        if (asset.status !== '在用') {
          skippedAssets.push({ assetId, assetName: asset.asset_name, reason: `资产状态为${asset.status}` });
          continue;
        }

        // 检查是否已经计提过当月折旧
        const [existingDepreciation] = await connection.execute(
          `SELECT id FROM fixed_asset_depreciation_details
           WHERE asset_id = ? AND DATE_FORMAT(depreciation_date, '%Y-%m') = ?`,
          [assetId, depreciationMonth]
        );

        if (existingDepreciation.length > 0) {
          skippedAssets.push({ assetId, assetName: asset.asset_name, reason: `${depreciationMonth}已计提折旧` });
          continue;
        }

        const snapshot = calculateDepreciationSnapshot(asset, depreciationDateFormatted);
        if (snapshot.depreciationAmount <= 0) {
          skippedAssets.push({ assetId, assetName: asset.asset_name, reason: '无可计提折旧金额' });
          continue;
        }

        const requestedDepreciationAmount = Number(depreciationAmount);
        if (
          Number.isFinite(requestedDepreciationAmount) &&
          requestedDepreciationAmount > 0 &&
          Math.abs(roundMoney(requestedDepreciationAmount) - snapshot.depreciationAmount) > 0.01
        ) {
          throw new Error(
            `资产 ${asset.asset_name} 折旧金额与服务端试算不一致：提交 ${roundMoney(requestedDepreciationAmount).toFixed(2)}，应为 ${snapshot.depreciationAmount.toFixed(2)}`
          );
        }

        const validDepreciationAmount = snapshot.depreciationAmount;
        const bookValueBefore = snapshot.netValueBefore;
        const newAccumulatedDepreciation = parseFloat(
          (parseFloat(asset.accumulated_depreciation || 0) + validDepreciationAmount).toFixed(2)
        );
        const bookValueAfter = snapshot.netValueAfter;
        const newNetValue = bookValueAfter;

        if (
          netValueAfter !== undefined &&
          Number.isFinite(Number(netValueAfter)) &&
          Math.abs(Number(netValueAfter) - bookValueAfter) > 0.01
        ) {
          throw new Error(
            `资产 ${asset.asset_name} 折旧后净值与服务端试算不一致：提交 ${roundMoney(netValueAfter).toFixed(2)}，应为 ${bookValueAfter.toFixed(2)}`
          );
        }

        // 插入折旧明细记录
        const [depResult] = await connection.execute(
          `INSERT INTO fixed_asset_depreciation_details
           (asset_id, depreciation_date, depreciation_amount, accumulated_depreciation,
            net_value, book_value_before, book_value_after, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            assetId,
            depreciationDateFormatted,
            validDepreciationAmount,
            newAccumulatedDepreciation,
            newNetValue,
            bookValueBefore,
            bookValueAfter,
            `${depreciationDate}月度折旧计提`,
          ]
        );

        await connection.execute(
          `UPDATE fixed_assets
           SET accumulated_depreciation = ?, current_value = ?, net_value = ?, last_depreciation_date = ?
           WHERE id = ?`,
          [newAccumulatedDepreciation, newNetValue, newNetValue, depreciationDateFormatted, assetId]
        );

        totalDepreciationAmount += validDepreciationAmount;
        depreciationRecords.push({
          assetId,
          assetName: asset.asset_name,
          assetCode: asset.asset_code,
          depreciationAmount: validDepreciationAmount,
          depreciationId: depResult.insertId,
        });

        logger.info(`资产 ${asset.asset_name} 折旧计提完成: ${validDepreciationAmount}元`);
      }

      totalDepreciationAmount = roundMoney(totalDepreciationAmount);
      if (depreciationRecords.length === 0) {
        throw new Error('没有可计提折旧的资产');
      }

      let depreciationEntry = null;

      // 如果有折旧金额，创建汇总的会计分录
      if (totalDepreciationAmount > 0) {
        const entryNumber = await CodeGeneratorService.nextCode('asset_depreciation', connection);

        const entryData = {
          entry_number: entryNumber,
          entry_date: depreciationDate + '-01',
          posting_date: depreciationDate + '-01',
          document_type: '调整单',
          document_number: entryNumber,
          period_id: periodId,
          description: `${depreciationDate}月度折旧计提汇总`,
          created_by: createdBy,
          status: 'posted',
          is_posted: 1,
        };

        const entryItems = [
          // 借：折旧费用
          {
            account_id: expenseAccountId,
            debit_amount: totalDepreciationAmount,
            credit_amount: 0,
            description: `${depreciationDate}月度折旧费用`,
          },
          // 贷：累计折旧
          {
            account_id: accumulatedDepreciationAccountId,
            debit_amount: 0,
            credit_amount: totalDepreciationAmount,
            description: `${depreciationDate}月度累计折旧`,
          },
        ];

        // 创建会计分录
        const financeModel = require('./finance');
        const entryId = await financeModel.createEntry(entryData, entryItems, connection);
        depreciationEntry = { entryId, entryNumber };

        logger.info(`创建折旧会计分录: ${entryNumber}, 金额: ${totalDepreciationAmount}元`);

        // 将生成的有效凭证号和分录主键回写到明细表，保证折旧明细到总账凭证可追溯
        const depIds = depreciationRecords.map(r => r.depreciationId);
        if (depIds.length > 0) {
          const placeholders = depIds.map(() => '?').join(',');
          await connection.execute(
            `UPDATE fixed_asset_depreciation_details
             SET voucher_no = ?, entry_id = ?
             WHERE id IN (${placeholders})`,
            [entryNumber, entryId, ...depIds]
          );

          for (const record of depreciationRecords) {
            await DocumentLinkService.tryAutoLink(
              'asset',
              record.assetId,
              record.assetCode,
              'finance_voucher',
              entryId,
              entryNumber,
              createdBy,
              connection
            );
            await DocumentLinkService.tryAutoLink(
              'asset_depreciation',
              record.depreciationId,
              `${record.assetCode}-${depreciationMonth}`,
              'finance_voucher',
              entryId,
              entryNumber,
              createdBy,
              connection
            );
          }
        }
      }

      await connection.commit();
      logger.info('批量折旧计提完成:', {
        processedAssets: depreciationRecords.length,
        totalAmount: totalDepreciationAmount,
      });

      return {
        success: true,
        processedAssets: depreciationRecords.length,
        totalAmount: totalDepreciationAmount,
        records: depreciationRecords,
        skippedAssets,
        entry: depreciationEntry,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('批量提交折旧计提失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 资产处置（自动生成标准会计凭证）
   * 标准三步处理：①转入清理 ②收到变卖款 ③结转损益
   */
  disposeAsset: async (id, disposalData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取资产信息
      const [assets] = await connection.query('SELECT * FROM fixed_assets WHERE id = ? FOR UPDATE', [id]);
      if (assets.length === 0) {
        throw new Error(`资产ID ${id} 不存在`);
      }

      const asset = assets[0];
      ensureAssetReadyForFinanceAction(asset, '资产处置');

      // 根据处置方式设置对应状态
      const statusMap = {
        '报废': '报废',
        '出售': '已出售',
        '转让': '已转让',
        '捐赠': '已捐赠',
        '其他': '已处置'
      };
      const newStatus = statusMap[disposalData.disposal_method] || '已处置';
      await connection.query(
        'UPDATE fixed_assets SET status = ?, current_value = 0, net_value = 0 WHERE id = ?',
        [newStatus, id]
      );

      // ========== 自动生成会计凭证 ==========
      const acquisitionCost = parseFloat(asset.acquisition_cost || 0);
      const accumulatedDep = parseFloat(asset.accumulated_depreciation || 0);
      const impairmentAmount = parseFloat(asset.impairment_amount || 0);
      const netBookValue = calculateAssetNetBookValue(asset); // 净值
      const disposalAmount = roundMoney(disposalData.disposal_amount || 0);
      const gainLoss = roundMoney(disposalAmount - netBookValue); // 正值=收益, 负值=损失

      // 动态查找会计科目
      const findAccount = async (code) => {
        const [rows] = await connection.query(
          'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1', [code]
        );
        return rows.length > 0 ? rows[0].id : null;
      };

      const fixedAssetAccountId = await findAccount('1601');    // 固定资产
      const accDepAccountId = await findAccount('1602');         // 累计折旧
      const impairmentAccountId = await findAccount('1603');     // 固定资产减值准备
      const clearingAccountId = await findAccount('1606');       // 固定资产清理
      const bankGlAccountId = await findAccount('1002');         // 银行存款总账科目
      const nonOpIncomeId = await findAccount('5401');           // 营业外收入
      const nonOpExpenseId = await findAccount('6501');          // 营业外支出

      // 检查必要科目是否存在
      if (!fixedAssetAccountId || !accDepAccountId || !clearingAccountId) {
        throw new Error('固定资产处置缺少必要会计科目(1601/1602/1606)');
      }

      if (impairmentAmount > 0 && !impairmentAccountId) {
        throw new Error('固定资产处置缺少固定资产减值准备科目(1603)');
      }

      if (disposalAmount > 0 && !bankGlAccountId) {
        throw new Error('固定资产处置收款缺少银行存款科目(1002)');
      }

      if (disposalAmount > 0 && !disposalData.bank_account_id) {
        throw new Error('资产处置有收款金额时必须选择实际收款银行账户');
      }

      if (gainLoss > 0.01 && !nonOpIncomeId) {
        throw new Error('固定资产处置收益缺少营业外收入科目(5401)');
      }

      if (gainLoss < -0.01 && !nonOpExpenseId) {
        throw new Error('固定资产处置损失缺少营业外支出科目(6501)');
      }

      {
        const periodId = await getOpenAccountingPeriodId(connection, disposalData.disposal_date);
        const createdBy = requirePositiveInteger(disposalData.created_by, 'created_by');

        const docNumber = await CodeGeneratorService.nextCode('asset_disposal', connection);
        const generatedEntries = [];
        let bankTransactionId = null;
        let bankTransactionNumber = null;

        // ① 凭证一：转入固定资产清理
        // 借：固定资产清理（净值）
        // 借：累计折旧（累计折旧金额）
        // 贷：固定资产（原值）
        const entry1Data = {
          entry_number: `${docNumber}-01`,
          entry_date: disposalData.disposal_date,
          posting_date: disposalData.disposal_date,
          document_type: '处置单',
          document_number: `${docNumber}-01`,
          period_id: periodId,
          description: `固定资产转入清理: ${asset.asset_name} (${asset.asset_code})`,
          created_by: createdBy,
          status: 'posted',
          is_posted: 1,
        };
        const entry1Items = [
          {
            account_id: clearingAccountId,
            debit_amount: netBookValue,
            credit_amount: 0,
            description: `固定资产清理-净值转入 - ${asset.asset_name}`,
          },
          {
            account_id: accDepAccountId,
            debit_amount: accumulatedDep,
            credit_amount: 0,
            description: `累计折旧转出 - ${asset.asset_name}`,
          },
          ...(impairmentAmount > 0
            ? [
                {
                  account_id: impairmentAccountId,
                  debit_amount: impairmentAmount,
                  credit_amount: 0,
                  description: `固定资产减值准备转出 - ${asset.asset_name}`,
                },
              ]
            : []),
          {
            account_id: fixedAssetAccountId,
            debit_amount: 0,
            credit_amount: acquisitionCost,
            description: `固定资产转出 - ${asset.asset_name}`,
          },
        ].filter(hasPositiveAmount);
        const entry1Id = await financeModel.createEntry(entry1Data, entry1Items, connection);
        generatedEntries.push({ entryId: entry1Id, entryNumber: entry1Data.entry_number });
        await DocumentLinkService.tryAutoLink(
          'asset_disposal',
          id,
          docNumber,
          'finance_voucher',
          entry1Id,
          entry1Data.entry_number,
          createdBy,
          connection
        );
        await DocumentLinkService.tryAutoLink(
          'asset',
          id,
          asset.asset_code,
          'finance_voucher',
          entry1Id,
          entry1Data.entry_number,
          createdBy,
          connection
        );
        logger.info(`资产处置凭证①(转入清理)已生成: ${entry1Data.entry_number}`);

        // ② 凭证二：收到变卖款（仅当处置金额 > 0 时）
        if (disposalAmount > 0 && bankGlAccountId) {
          const [bankAccounts] = await connection.execute(
            'SELECT id, account_name, bank_name FROM bank_accounts WHERE id = ? AND is_active = 1 FOR UPDATE',
            [disposalData.bank_account_id]
          );
          if (bankAccounts.length === 0) {
            throw new Error('资产处置收款银行账户不存在或已停用');
          }
          const entry2Data = {
            entry_number: `${docNumber}-02`,
            entry_date: disposalData.disposal_date,
            posting_date: disposalData.disposal_date,
            document_type: '处置单',
            document_number: `${docNumber}-02`,
            period_id: periodId,
            description: `固定资产${disposalData.disposal_method}收款: ${asset.asset_name}`,
            created_by: createdBy,
            status: 'posted',
            is_posted: 1,
          };
          const entry2Items = [
            {
              account_id: bankGlAccountId,
              debit_amount: disposalAmount,
              credit_amount: 0,
              description: `${disposalData.disposal_method}收款 - ${asset.asset_name}`,
            },
            {
              account_id: clearingAccountId,
              debit_amount: 0,
              credit_amount: disposalAmount,
              description: `固定资产清理-收到变卖款 - ${asset.asset_name}`,
            },
          ];
          const entry2Id = await financeModel.createEntry(entry2Data, entry2Items, connection);
          generatedEntries.push({ entryId: entry2Id, entryNumber: entry2Data.entry_number });

          bankTransactionNumber = `${docNumber}-BANK`;
          const [bankTxResult] = await connection.execute(
            `INSERT INTO bank_transactions
             (transaction_number, bank_account_id, transaction_date, transaction_type,
              amount, reference_number, description, is_reconciled, related_party, category,
              payment_method, created_by, status, gl_entry_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              bankTransactionNumber,
              disposalData.bank_account_id,
              disposalData.disposal_date,
              '存款',
              disposalAmount,
              docNumber,
              `固定资产${disposalData.disposal_method}收款: ${asset.asset_name} (${asset.asset_code})`,
              false,
              disposalData.handler || '资产处置',
              '资产处置',
              'bank_transfer',
              createdBy,
              'approved',
              entry2Id,
            ]
          );
          bankTransactionId = bankTxResult.insertId;
          await connection.execute(
            'UPDATE bank_accounts SET current_balance = current_balance + ?, last_transaction_date = ? WHERE id = ?',
            [disposalAmount, disposalData.disposal_date, disposalData.bank_account_id]
          );

          await DocumentLinkService.tryAutoLink(
            'asset_disposal',
            id,
            docNumber,
            'bank_transaction',
            bankTransactionId,
            bankTransactionNumber,
            createdBy,
            connection
          );
          await DocumentLinkService.tryAutoLink(
            'asset_disposal',
            id,
            docNumber,
            'finance_voucher',
            entry2Id,
            entry2Data.entry_number,
            createdBy,
            connection
          );
          await DocumentLinkService.tryAutoLink(
            'bank_transaction',
            bankTransactionId,
            bankTransactionNumber,
            'finance_voucher',
            entry2Id,
            entry2Data.entry_number,
            createdBy,
            connection
          );
          await DocumentLinkService.tryAutoLink(
            'asset',
            id,
            asset.asset_code,
            'bank_transaction',
            bankTransactionId,
            bankTransactionNumber,
            createdBy,
            connection
          );
          logger.info(`资产处置凭证②(收到变卖款)已生成: ${entry2Data.entry_number}`);
        }

        // ③ 凭证三：结转处置损益（当有差额时）
        if (Math.abs(gainLoss) > 0.01) {
          const entry3Data = {
            entry_number: `${docNumber}-03`,
            entry_date: disposalData.disposal_date,
            posting_date: disposalData.disposal_date,
            document_type: '处置单',
            document_number: `${docNumber}-03`,
            period_id: periodId,
            description: `固定资产处置${gainLoss > 0 ? '净收益' : '净损失'}: ${asset.asset_name} ¥${Math.abs(gainLoss).toFixed(2)}`,
            created_by: createdBy,
            status: 'posted',
            is_posted: 1,
          };
          let entry3Items;
          if (gainLoss > 0 && nonOpIncomeId) {
            // 处置收益: 借-固定资产清理, 贷-营业外收入
            entry3Items = [
              {
                account_id: clearingAccountId,
                debit_amount: gainLoss,
                credit_amount: 0,
                description: `固定资产清理-结转收益 - ${asset.asset_name}`,
              },
              {
                account_id: nonOpIncomeId,
                debit_amount: 0,
                credit_amount: gainLoss,
                description: `资产处置收益 - ${asset.asset_name}`,
              },
            ];
          } else if (gainLoss < 0 && nonOpExpenseId) {
            // 处置损失: 借-营业外支出, 贷-固定资产清理
            const lossAmount = Math.abs(gainLoss);
            entry3Items = [
              {
                account_id: nonOpExpenseId,
                debit_amount: lossAmount,
                credit_amount: 0,
                description: `资产处置损失 - ${asset.asset_name}`,
              },
              {
                account_id: clearingAccountId,
                debit_amount: 0,
                credit_amount: lossAmount,
                description: `固定资产清理-结转损失 - ${asset.asset_name}`,
              },
            ];
          }

          if (entry3Items) {
            const entry3Id = await financeModel.createEntry(entry3Data, entry3Items, connection);
            generatedEntries.push({ entryId: entry3Id, entryNumber: entry3Data.entry_number });
            await DocumentLinkService.tryAutoLink(
              'asset_disposal',
              id,
              docNumber,
              'finance_voucher',
              entry3Id,
              entry3Data.entry_number,
              createdBy,
              connection
            );
            await DocumentLinkService.tryAutoLink(
              'asset',
              id,
              asset.asset_code,
              'finance_voucher',
              entry3Id,
              entry3Data.entry_number,
              createdBy,
              connection
            );
            logger.info(`资产处置凭证③(结转损益)已生成: ${entry3Data.entry_number}, ${gainLoss > 0 ? '收益' : '损失'}: ¥${Math.abs(gainLoss).toFixed(2)}`);
          }
        }

        await connection.commit();
        return {
          success: true,
          documentNumber: docNumber,
          entries: generatedEntries,
          bankTransactionId,
          bankTransactionNumber,
        };
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 获取资产类别列表
   */
  getAssetCategories: async (page = 1, limit = 20) => {
    try {
      // 检查 asset_categories 表是否存在
      const [tables] = await db.pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'mes' AND table_name = 'asset_categories'"
      );

      // 如果表不存在，直接返回空结果
      if (tables.length === 0) {
        // 表结构由 migrations/20260312000008_baseline_asset_bank_tables.js 管理
        // 如果表不存在，说明迁移尚未执行
        logger.warn('asset_categories 表不存在，请确认 Knex 迁移已执行');
        return {
          data: [],
          total: 0,
          page: 1,
          limit: limit,
        };
      }

      // 转换参数为数字
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;

      // 构建查询
      let query = `
        SELECT c.*,
               (SELECT COUNT(*) FROM fixed_assets a WHERE a.category_id = c.id) AS asset_count
        FROM asset_categories c
      `;

      // 获取总记录数
      const [countResult] = await db.pool.query('SELECT COUNT(*) as total FROM asset_categories');
      const total = countResult && countResult[0] ? countResult[0].total : 0;

      // 添加分页（直接拼接，已验证）
      const offset = (pageNum - 1) * limitNum;
      query += ` LIMIT ${limitNum} OFFSET ${offset}`;

      // 使用 query 避免 LIMIT/OFFSET 参数化问题
      const [categories] = await db.pool.query(query);

      return {
        data: categories || [],
        total,
        page: pageNum,
        limit: limitNum,
      };
    } catch {
      // 出错时返回空结果而不是抛出异常
      return {
        data: [],
        total: 0,
        page: page,
        limit: limit,
      };
    }
  },

  /**
   * 获取单个资产类别
   */
  getAssetCategoryById: async (id) => {
    try {
      const [categories] = await db.pool.execute(
        `SELECT c.*,
                (SELECT COUNT(*) FROM fixed_assets a WHERE a.category_id = c.id) AS asset_count
         FROM asset_categories c
         WHERE c.id = ?`,
        [id]
      );
      return categories.length > 0 ? categories[0] : null;
    } catch (error) {
      logger.error('获取资产类别失败:', error);
      throw error;
    }
  },

  /**
   * 创建资产类别
   */
  createAssetCategory: async (categoryData) => {
    try {
      const [result] = await db.pool.execute(
        `INSERT INTO asset_categories
        (name, code, default_useful_life, default_depreciation_method, default_salvage_rate, description)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          categoryData.name,
          categoryData.code,
          categoryData.default_useful_life || 5,
          categoryData.default_depreciation_method || 'straight_line',
          categoryData.default_salvage_rate || 5.0,
          categoryData.description || null,
        ]
      );
      return result.insertId;
    } catch (error) {
      logger.error('创建资产类别失败:', error);
      throw error;
    }
  },

  /**
   * 更新资产类别
   */
  updateAssetCategory: async (id, categoryData) => {
    try {
      const [result] = await db.pool.execute(
        `UPDATE asset_categories
         SET name = ?,
             code = ?,
             default_useful_life = ?,
             default_depreciation_method = ?,
             default_salvage_rate = ?,
             description = ?
         WHERE id = ?`,
        [
          categoryData.name,
          categoryData.code,
          categoryData.default_useful_life || 5,
          categoryData.default_depreciation_method || 'straight_line',
          categoryData.default_salvage_rate || 5.0,
          categoryData.description || null,
          id,
        ]
      );
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('更新资产类别失败:', error);
      throw error;
    }
  },

  /**
   * 删除资产类别
   */
  deleteAssetCategory: async (id) => {
    try {
      // 先检查是否有资产使用此类别
      const [assets] = await db.pool.execute(
        'SELECT COUNT(*) as count FROM fixed_assets WHERE category_id = ?',
        [id]
      );

      if (assets[0].count > 0) {
        throw new Error(`无法删除类别，该类别下有 ${assets[0].count} 个资产`);
      }

      const [result] = await db.pool.execute('DELETE FROM asset_categories WHERE id = ?', [id]);
      return result.affectedRows > 0;
    } catch (error) {
      logger.error('删除资产类别失败:', error);
      throw error;
    }
  },


  /**
   * 查询固定资产总数
   */
  getAssetCount: async () => {
    try {
      const [result] = await db.pool.query('SELECT COUNT(*) as count FROM fixed_assets');
      return result[0].count;
    } catch (error) {
      logger.error('获取资产总数失败:', error);
      return 0;
    }
  },

  // 资产创建后的扩展钩子，保持无副作用，禁止在生产数据中自动插入示例资产
  createAssetCompleted: async (assetId) => {
    logger.info(`资产创建完成，ID: ${assetId}`);
    return true;
  },

  /**
   * 创建示例资产数据
   * @returns {Promise<Object>} 创建结果
   */
  createSampleAssets: async () => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // 检查是否已存在示例类别
      const [existingCategories] = await conn.query(
        'SELECT * FROM asset_categories WHERE name LIKE "示例类别%"'
      );

      let categoryIds = [];

      // 如果不存在示例类别，创建一些
      if (existingCategories.length === 0) {
        const categoryData = [
          {
            name: '示例类别1',
            code: 'SAMPLE1',
            default_useful_life: 36,
            default_depreciation_method: '直线法',
            default_salvage_rate: 5.0,
            description: '办公设备',
          },
          {
            name: '示例类别2',
            code: 'SAMPLE2',
            default_useful_life: 24,
            default_depreciation_method: '双倍余额递减法',
            default_salvage_rate: 10.0,
            description: '电子设备',
          },
          {
            name: '示例类别3',
            code: 'SAMPLE3',
            default_useful_life: 60,
            default_depreciation_method: '直线法',
            default_salvage_rate: 5.0,
            description: '家具',
          },
        ];

        for (const category of categoryData) {
          const [result] = await conn.query(
            `INSERT INTO asset_categories (name, code, default_useful_life, default_depreciation_method, default_salvage_rate, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              category.name,
              category.code,
              category.default_useful_life,
              category.default_depreciation_method,
              category.default_salvage_rate,
              category.description,
            ]
          );
          categoryIds.push(result.insertId);
        }
      } else {
        categoryIds = existingCategories.map((cat) => cat.id);
      }

      // 创建示例资产
      const assets = [];
      const assetData = [
        {
          assetName: '示例资产1',
          notes: '笔记本电脑',
          acquisitionCost: 8000,
          acquisitionDate: new Date(),
        },
        {
          assetName: '示例资产2',
          notes: '办公桌',
          acquisitionCost: 1200,
          acquisitionDate: new Date(),
        },
        {
          assetName: '示例资产3',
          notes: '打印机',
          acquisitionCost: 2500,
          acquisitionDate: new Date(),
        },
      ];

      for (let i = 0; i < assetData.length; i++) {
        const asset = assetData[i];
        const categoryId = categoryIds[i % categoryIds.length];

        const [result] = await conn.query(
          `INSERT INTO fixed_assets (
            asset_code, asset_name, asset_type, category_id, acquisition_date,
            acquisition_cost, depreciation_method, useful_life, salvage_value,
            current_value, net_value, accumulated_depreciation, status, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            await CodeGeneratorService.nextCode('asset', conn),
            asset.assetName,
            '示例类型',
            categoryId,
            asset.acquisitionDate,
            asset.acquisitionCost,
            '直线法',
            60, // 5年
            asset.acquisitionCost * 0.1, // 10%残值
            asset.acquisitionCost, // 初始当前价值与购买价格相同
            asset.acquisitionCost,
            0, // 初始累计折旧为0
            '在用',
            asset.notes,
          ]
        );

        assets.push({
          id: result.insertId,
          ...asset,
          category_id: categoryId,
        });
      }

      await conn.commit();
      return {

        categories: categoryIds.length,
        assets: assets,
      };
    } catch (error) {
      await conn.rollback();
      logger.error('创建示例资产数据失败:', error);
      throw error;
    } finally {
      conn.release();
    }
  },

  /**
   * 资产调拨
   * @param {Object} transferData 调拨数据
   * @returns {Promise<boolean>} 是否成功
   */
  transferAsset: async (transferData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      logger.info('开始执行资产调拨，参数:', transferData);

      const [assets] = await connection.query('SELECT * FROM fixed_assets WHERE id = ? FOR UPDATE', [
        transferData.assetId,
      ]);
      if (assets.length === 0) {
        throw new Error(`资产ID ${transferData.assetId} 不存在`);
      }

      const asset = assets[0];
      ensureAssetReadyForFinanceAction(asset, '资产调拨');

      // 1. 更新资产表中的部门、责任人和存放地点
      const updateResult = await connection.query(
        `UPDATE fixed_assets
         SET department_id = ?,
             custodian = ?,
             location_id = ?
         WHERE id = ?`,
        [
          transferData.newDepartment,
          transferData.newResponsible,
          transferData.newLocation,
          transferData.assetId,
        ]
      );

      logger.info('资产表更新结果:', updateResult);

      // 2. 创建资产调拨历史记录
      try {
        // 首先检查asset_transfers表是否存在
        const [tables] = await connection.query("SHOW TABLES LIKE 'asset_transfers'");

        // 如果表不存在，创建它
        // 如果表不存在，说明迁移尚未执行
        if (tables.length === 0) {
          // 表结构由 migrations/20260312000008_baseline_asset_bank_tables.js 管理
          logger.error('asset_transfers 表不存在，请确认 Knex 迁移已执行');
          throw new Error('asset_transfers 表不存在，请先运行 npm run migrate');
        }

        // 插入调拨记录
        const [insertResult] = await connection.query(
          `INSERT INTO asset_transfers
           (asset_id, transfer_date, from_department_id, to_department_id,
            from_responsible, to_responsible, from_location, to_location,
            reason, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transferData.assetId,
            transferData.transferDate,
            asset.department_id || null,
            transferData.newDepartment || null,
            asset.custodian,
            transferData.newResponsible,
            asset.location_id,
            transferData.newLocation,
            transferData.transferReason,
            transferData.notes,
          ]
        );

        await DocumentLinkService.tryAutoLink(
          'asset',
          asset.id,
          asset.asset_code,
          'asset_transfer',
          insertResult.insertId,
          `${asset.asset_code}-${transferData.transferDate}`,
          transferData.created_by || null,
          connection
        );

        logger.info('调拨记录已创建, ID:', insertResult.insertId);
      } catch (historyError) {
        logger.error('创建调拨历史记录失败:', historyError);
        throw historyError;
      }

      await connection.commit();
      return true;
    } catch (error) {
      await connection.rollback();
      logger.error('资产调拨失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 自动生成资产编号
   * 规则: 类别前缀-年份-4位序号 (如 ELE-2026-0001)
   */
  generateAssetCode: async (categoryId) => {
    try {
      let prefix = 'FA';
      if (categoryId) {
        const [categories] = await db.pool.query(
          'SELECT code, name FROM asset_categories WHERE id = ?', [categoryId]
        );
        if (categories.length > 0 && categories[0].code) {
          prefix = categories[0].code.toUpperCase();
        }
      }
      const year = new Date().getFullYear();
      const codePrefix = `${prefix}-${year}-`;
      const [maxCodes] = await db.pool.query(
        'SELECT asset_code FROM fixed_assets WHERE asset_code LIKE ? ORDER BY asset_code DESC LIMIT 1',
        [`${codePrefix}%`]
      );
      let nextSeq = 1;
      if (maxCodes.length > 0) {
        const lastSeq = parseInt(maxCodes[0].asset_code.split('-').pop(), 10);
        if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
      }
      return `${codePrefix}${String(nextSeq).padStart(4, '0')}`;
    } catch (error) {
      logger.error('生成资产编号失败:', error);
      return CodeGeneratorService.nextCode('asset');
    }
  },

  /**
   * 添加资产变动记录
   */
  addChangeLog: async (assetId, changeType, changedBy, details = [], remarks = '', conn = null) => {
    const dbConn = conn || db.pool;
    try {
      if (details.length === 0) {
        await dbConn.execute(
          'INSERT INTO asset_change_logs (asset_id, change_type, changed_by, remarks) VALUES (?, ?, ?, ?)',
          [assetId, changeType, changedBy || 'system', remarks]
        );
      } else {
        for (const d of details) {
          await dbConn.execute(
            'INSERT INTO asset_change_logs (asset_id, change_type, changed_by, field_name, old_value, new_value, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [assetId, changeType, changedBy || 'system', d.field, String(d.oldVal ?? ''), String(d.newVal ?? ''), remarks]
          );
        }
      }
    } catch (error) {
      logger.error('添加资产变动记录失败:', error);
    }
  },

  /**
   * 获取资产变动记录
   */
  getAssetChangeLogs: async (assetId, page = 1, pageSize = 50) => {
    try {
      const offset = (page - 1) * pageSize;
      const [total] = await db.pool.query(
        'SELECT COUNT(*) as count FROM asset_change_logs WHERE asset_id = ?', [assetId]
      );
      const [logs] = await db.pool.query(
        `SELECT id, asset_id, change_type, change_date, changed_by,
                field_name, old_value, new_value, remarks
         FROM asset_change_logs WHERE asset_id = ?
         ORDER BY change_date DESC LIMIT ? OFFSET ?`,
        [assetId, pageSize, offset]
      );
      return { logs, total: total[0].count };
    } catch (error) {
      logger.error('获取资产变动记录失败:', error);
      return { logs: [], total: 0 };
    }
  },

  /**
   * 获取折旧历史记录
   */
  getDepreciationHistory: async (assetId) => {
    try {
      const [records] = await db.pool.query(
        `SELECT id, asset_id, depreciation_date, depreciation_amount,
                book_value_before, book_value_after, voucher_no, notes, created_at
         FROM fixed_asset_depreciation_details
         WHERE asset_id = ? ORDER BY depreciation_date DESC`, [assetId]
      );
      return records;
    } catch (error) {
      logger.error('获取折旧历史记录失败:', error);
      return [];
    }
  },

  /**
   * 计提固定资产减值准备
   */
  createImpairment: async (assetId, impairmentData) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 验证资产是否存在
      const [assets] = await connection.query('SELECT * FROM fixed_assets WHERE id = ? FOR UPDATE', [assetId]);
      if (assets.length === 0) {
        throw new Error(`资产ID ${assetId} 不存在`);
      }

      const asset = assets[0];
      ensureAssetReadyForFinanceAction(asset, '资产减值');
      if (!IMPAIRABLE_ASSET_STATUSES.has(String(asset.status || '').trim())) {
        throw new Error(`资产减值失败：资产状态为${asset.status}，只有在用或闲置资产允许计提减值`);
      }

      const amount = roundMoney(impairmentData.impairment_amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('减值准备金额必须大于0');
      }

      // 当前净值
      const netValue = calculateAssetNetBookValue(asset);
      if (amount > netValue) {
        throw new Error('减值准备金额不能大于资产当前净值');
      }
      const newNetValue = roundMoney(netValue - amount);

      // 1. 插入减值记录
      const [insertResult] = await connection.query(
        `INSERT INTO asset_impairments
         (asset_id, impairment_date, impairment_amount, reason, handled_by)
         VALUES (?, ?, ?, ?, ?)`,
        [
          assetId,
          impairmentData.impairment_date,
          amount,
          impairmentData.reason || null,
          impairmentData.handled_by || null
        ]
      );

      // 2. 更新固定资产表：增加 impairment_amount，且降低 current_value
      await connection.query(
        `UPDATE fixed_assets
         SET impairment_amount = impairment_amount + ?,
             current_value = ?,
             net_value = ?
         WHERE id = ?`,
        [amount, newNetValue, newNetValue, assetId]
      );

      // 3. 记录变更日志
      const changeNotes = `计提减值准备：金额 ${amount}。原因：${impairmentData.reason || '无'}`;
      await connection.query(
        `INSERT INTO asset_change_logs
         (asset_id, change_type, changed_by, field_name, old_value, new_value, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          '计提减值',
          impairmentData.handled_by || 'system',
          'current_value',
          netValue,
          newNetValue,
          changeNotes
        ]
      );

      const [lossAccounts] = await connection.query(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1',
        ['6702']
      );
      const [allowanceAccounts] = await connection.query(
        'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1',
        ['1603']
      );

      if (lossAccounts.length === 0 || allowanceAccounts.length === 0) {
        throw new Error('Asset impairment is missing required GL accounts (6702/1603)');
      }

      const periodId = await getOpenAccountingPeriodId(connection, impairmentData.impairment_date);
      const documentNumber = `AIMP-${insertResult.insertId}`;
      const glEntryId = await financeModel.createEntry(
        {
          entry_number: documentNumber,
          entry_date: impairmentData.impairment_date,
          posting_date: impairmentData.impairment_date,
          document_type: DOCUMENT_TYPE_MAPPING.ASSET_IMPAIRMENT || DOCUMENT_TYPE_MAPPING.ASSET_DEPRECIATION,
          document_number: documentNumber,
          period_id: periodId,
          description: `Fixed asset impairment: ${asset.asset_name} (${asset.asset_code})`,
          created_by: requirePositiveInteger(impairmentData.created_by || 1, 'created_by'),
          status: 'posted',
          is_posted: 1,
        },
        [
          {
            account_id: lossAccounts[0].id,
            debit_amount: amount,
            credit_amount: 0,
            description: `Impairment loss - ${asset.asset_name}`,
          },
          {
            account_id: allowanceAccounts[0].id,
            debit_amount: 0,
            credit_amount: amount,
            description: `Fixed asset impairment allowance - ${asset.asset_name}`,
          },
        ],
        connection
      );

      await connection.query(
        'UPDATE asset_impairments SET gl_entry_id = ?, voucher_no = ? WHERE id = ?',
        [glEntryId, documentNumber, insertResult.insertId]
      );

      const createdBy = requirePositiveInteger(impairmentData.created_by || 1, 'created_by');
      await DocumentLinkService.tryAutoLink(
        'asset_impairment',
        insertResult.insertId,
        documentNumber,
        'finance_voucher',
        glEntryId,
        documentNumber,
        createdBy,
        connection
      );
      await DocumentLinkService.tryAutoLink(
        'asset',
        assetId,
        asset.asset_code,
        'asset_impairment',
        insertResult.insertId,
        documentNumber,
        createdBy,
        connection
      );
      await DocumentLinkService.tryAutoLink(
        'asset',
        assetId,
        asset.asset_code,
        'finance_voucher',
        glEntryId,
        documentNumber,
        createdBy,
        connection
      );

      await connection.commit();
      return insertResult.insertId;
    } catch (error) {
      await connection.rollback();
      logger.error('计提减值准备失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 获取资产的减值准备记录
   */
  getImpairments: async (assetId) => {
    try {
      const [records] = await db.pool.query(
        `SELECT id, asset_id, impairment_date, impairment_amount, reason, handled_by, created_at,
                gl_entry_id, voucher_no
         FROM asset_impairments
         WHERE asset_id = ? ORDER BY impairment_date DESC`,
        [assetId]
      );
      return records;
    } catch (error) {
      logger.error('获取资产减值记录失败:', error);
      return [];
    }
  },

  /**
   * 折旧预测 (未来N个月的折旧预测)
   */
  getDepreciationForecast: async (months = 6) => {
    try {
      const [assets] = await db.pool.query(
        `SELECT id, asset_name, acquisition_cost, current_value, accumulated_depreciation,
                impairment_amount, useful_life, salvage_value, depreciation_method, status
         FROM fixed_assets
         WHERE status = '在用' AND audit_status = 'approved' AND current_value > 0`
      );

      const forecast = [];
      const currentDate = new Date();
      currentDate.setDate(1); // Set to 1st of month to avoid edge case issues

      for (let i = 1; i <= months; i++) {
        const forecastDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + i, 1);
        const monthStr = forecastDate.toISOString().slice(0, 7); // YYYY-MM

        let monthTotal = 0;

        assets.forEach(asset => {
          let depAmount = 0;
          const netValue = calculateAssetNetBookValue(asset);
          const depreciableValue = netValue - (asset.salvage_value || 0);

          if (asset.depreciation_method === '直线法' || asset.depreciation_method === 'straight_line') {
            depAmount = depreciableValue / (asset.useful_life || 60);
          } else if (asset.depreciation_method === '双倍余额递减法' || asset.depreciation_method === 'double_declining') {
            const monthlyRate = 2 / (asset.useful_life || 60);
            // Basic estimation (doesn't account for accumulated depletion perfectly in forecast without tracking each month per asset)
            depAmount = netValue * monthlyRate;
          } else if (asset.depreciation_method === '年数总和法' || asset.depreciation_method === 'sum_of_years') {
            depAmount = depreciableValue / (asset.useful_life || 60);
          }

          if (depAmount > 0) {
            monthTotal += depAmount;
          }
        });

        forecast.push({
          month: monthStr,
          amount: Math.round(monthTotal * 100) / 100
        });
      }

      return forecast;
    } catch (error) {
      logger.error('获取折旧预测失败:', error);
      throw error;
    }
  },

  /**
   * 获取资产看板统计数据
   */
  getAssetDashboardStats: async () => {
    try {
      // 1. 按状态分类统计
      const [statusStats] = await db.pool.query(
        `SELECT status, COUNT(*) as count, SUM(acquisition_cost) as total_value
         FROM fixed_assets GROUP BY status`
      );

      // 2. 按类别统计
      const [categoryStats] = await db.pool.query(
        `SELECT c.name as category, COUNT(a.id) as count, SUM(a.acquisition_cost) as total_value
         FROM asset_categories c
         LEFT JOIN fixed_assets a ON c.id = a.category_id
         GROUP BY c.id, c.name`
      );

      // 3. 近12个月新增资产趋势
      const [trendStats] = await db.pool.query(
        `SELECT DATE_FORMAT(acquisition_date, '%Y-%m') as month, COUNT(*) as count, SUM(acquisition_cost) as total_value
         FROM fixed_assets
         WHERE acquisition_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY month ORDER BY month ASC`
      );

      return {
        statusStats,
        categoryStats,
        trendStats
      };
    } catch (error) {
      logger.error('获取资产看板统计失败:', error);
      throw error;
    }
  },

  /**
   * 资产拆分业务
   * 拆分是将一个具有一定价值和数量（可选记录）的资产拆分成两个资产
   * 通常用于将大型资产(如整套设备)中的部分拆解出来作为独立资产使用或处置
   */
  splitAsset: async (assetId, splitData, userId) => {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 获取原资产信息
      const [assets] = await connection.query('SELECT * FROM fixed_assets WHERE id = ? FOR UPDATE', [assetId]);
      if (assets.length === 0) {
        throw new Error(`资产ID ${assetId} 不存在`);
      }

      const originalAsset = assets[0];
      ensureAssetReadyForFinanceAction(originalAsset, '资产拆分');

      // 拆分值计算
      const splitCost = parseFloat(splitData.split_cost);
      if (isNaN(splitCost) || splitCost <= 0) {
        throw new Error('拆分金额必须大于0');
      }
      if (splitCost >= parseFloat(originalAsset.acquisition_cost)) {
        throw new Error('拆分金额不能大于或等于原资产总价值');
      }

      // 计算按比例分配的累计折旧和减值准备
      const splitRatio = splitCost / parseFloat(originalAsset.acquisition_cost);
      const splitDepreciation = roundMoney(parseFloat(originalAsset.accumulated_depreciation || 0) * splitRatio);
      const splitImpairment = roundMoney(parseFloat(originalAsset.impairment_amount || 0) * splitRatio);
      const splitCurrentValue = roundMoney(calculateAssetNetBookValue(originalAsset) * splitRatio);
      const remainingCost = roundMoney(parseFloat(originalAsset.acquisition_cost) - splitCost);
      const remainingDepreciation = roundMoney(parseFloat(originalAsset.accumulated_depreciation || 0) - splitDepreciation);
      const remainingImpairment = roundMoney(parseFloat(originalAsset.impairment_amount || 0) - splitImpairment);
      const remainingCurrentValue = roundMoney(calculateAssetNetBookValue(originalAsset) - splitCurrentValue);

      // 生成新资产编号
      const codePrefix = originalAsset.asset_code;
      // 找到这个资产已经拆分了多少次 (寻找类似 FA-2023-001-1 的编码)
      const [existingSplits] = await connection.query(
        'SELECT count(id) as count FROM fixed_assets WHERE asset_code LIKE ?',
        [`${codePrefix}-%`]
      );
      const splitSuffix = existingSplits[0].count + 1;
      const newAssetCode = `${codePrefix}-${splitSuffix}`;

      // 2. 创建新资产 (被拆分出来的新部分)
      const [insertResult] = await connection.query(
        `INSERT INTO fixed_assets
        (asset_code, asset_name, asset_type, category_id, acquisition_date,
         acquisition_cost, depreciation_method, useful_life, salvage_value,
         current_value, net_value, accumulated_depreciation, impairment_amount, location_id, department_id,
         custodian, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newAssetCode,
          splitData.new_asset_name || `${originalAsset.asset_name}-拆分${splitSuffix}`,
          originalAsset.asset_type,
          originalAsset.category_id,
          originalAsset.acquisition_date,
          splitCost,
          originalAsset.depreciation_method,
          originalAsset.useful_life,
          parseFloat(originalAsset.salvage_value || 0) * splitRatio,
          splitCurrentValue,
          splitCurrentValue,
          splitDepreciation,
          splitImpairment,
          splitData.location_id || originalAsset.location_id,
          splitData.department_id || originalAsset.department_id,
          splitData.custodian || originalAsset.custodian,
          originalAsset.status,
          `自资产 ${originalAsset.asset_code} 拆分而来。原因：${splitData.reason || '无'}`
        ]
      );

      const newAssetId = insertResult.insertId;

      // 3. 更新原资产 (扣除拆分部分)
      await connection.query(
        `UPDATE fixed_assets
         SET acquisition_cost = ?,
             accumulated_depreciation = ?,
             impairment_amount = ?,
             current_value = ?,
             net_value = ?
         WHERE id = ?`,
        [remainingCost, remainingDepreciation, remainingImpairment, remainingCurrentValue, remainingCurrentValue, assetId]
      );

      // 4. 记录拆分变更日志
      const changeNotes = `执行资产拆分：拆分出价值 ${splitCost}，新资产为 ${newAssetCode}。原因：${splitData.reason || '无'}`;

      // 原资产变更日志
      await connection.query(
        `INSERT INTO asset_change_logs
         (asset_id, change_type, changed_by, field_name, old_value, new_value, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          '资产拆分',
          userId || 'system',
          'acquisition_cost',
          originalAsset.acquisition_cost,
          remainingCost,
          changeNotes
        ]
      );

      // 新资产创建日志
      await connection.query(
        `INSERT INTO asset_change_logs
         (asset_id, change_type, changed_by, field_name, old_value, new_value, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          newAssetId,
          '资产拆入',
          userId || 'system',
          'status',
          '',
          originalAsset.status,
          `由资产 ${originalAsset.asset_code} 拆分形成，新原值：${splitCost}`
        ]
      );

      await DocumentLinkService.tryAutoLink(
        'asset',
        assetId,
        originalAsset.asset_code,
        'asset',
        newAssetId,
        newAssetCode,
        userId || null,
        connection
      );

      await connection.commit();
      return { newAssetId, newAssetCode };
    } catch (error) {
      await connection.rollback();
      logger.error('资产拆分失败模型层:', error);
      throw error;
    } finally {
      connection.release();
    }
  },
};

module.exports = assetsModel;
