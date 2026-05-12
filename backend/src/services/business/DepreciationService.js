/**
 * DepreciationService.js
 * @description 服务层文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../../utils/logger');
const db = require('../../config/db');
const financeModel = require('../../models/finance');
const { DOCUMENT_TYPE_MAPPING } = require('../../constants/financeConstants');
const DocumentLinkService = require('./DocumentLinkService');

function normalizePeriodMonth(value) {
  const periodMonth = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    throw new Error('折旧月份格式必须为YYYY-MM');
  }
  const month = Number(periodMonth.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new Error('折旧月份不是有效月份');
  }
  return periodMonth;
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function getUsefulLifeMonths(asset) {
  return Math.max(Number.parseInt(asset.useful_life_months || asset.useful_life || 60, 10), 1);
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  return Math.max(
    0,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth())
  );
}

/**
 * 固定资产折旧自动化服务
 * 处理固定资产折旧计提的自动化流程
 */
class DepreciationService {
  /**
   * 批量计提折旧
   * @param {string} periodMonth 折旧月份 (YYYY-MM)
   */
  static async calculateMonthlyDepreciation(periodMonth) {
    const normalizedPeriodMonth = normalizePeriodMonth(periodMonth);
    const periodStartDate = `${normalizedPeriodMonth}-01`;
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      const periodId = await this.getPeriodIdByDate(connection, periodStartDate);

      // 获取需要计提折旧的固定资产。同一事务内锁定资产行，并排除当月已计提资产，防止重复提交。
      const [assets] = await connection.execute(
        `
        SELECT fa.*
        FROM fixed_assets fa
        WHERE fa.status IN ('在用', '闲置')
          AND fa.audit_status = 'approved'
          AND COALESCE(fa.depreciation_method, '') != '不计提'
          AND acquisition_date <= LAST_DAY(?)
          AND NOT EXISTS (
            SELECT 1
            FROM fixed_asset_depreciation_details fad
            WHERE fad.asset_id = fa.id
              AND DATE_FORMAT(fad.depreciation_date, '%Y-%m') = ?
          )
        FOR UPDATE
      `,
        [periodStartDate, normalizedPeriodMonth]
      );

      if (assets.length === 0) {
        // 没有资产也要记录日志
        await connection.execute(
          `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [
            'finance',
            'depreciation',
            'system',
            JSON.stringify({
              period: normalizedPeriodMonth,
              assetCount: 0,
              totalAmount: 0,
              message: '没有需要计提折旧的固定资产',
            }),
          ]
        );
        await connection.commit();
        return {
          success: true,
          message: '没有需要计提折旧的固定资产',
          assetCount: 0,
          totalDepreciation: 0,
        };
      }

      let totalDepreciation = 0;
      const depreciationEntries = [];

      // 计算每个资产的折旧
      for (const asset of assets) {
        const monthlyDepreciation = await this.calculateAssetDepreciation(
          asset,
          normalizedPeriodMonth
        );

        if (monthlyDepreciation > 0) {
          depreciationEntries.push({
            asset,
            monthlyDepreciation,
          });
          totalDepreciation += monthlyDepreciation;
        }
      }

      if (depreciationEntries.length === 0) {
        // 资产已折旧完毕也要记录日志
        await connection.execute(
          `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [
            'finance',
            'depreciation',
            'system',
            JSON.stringify({
              period: normalizedPeriodMonth,
              assetCount: 0,
              totalAmount: 0,
              message: '所有资产折旧已计提完毕',
            }),
          ]
        );
        await connection.commit();
        return {
          success: true,
          message: '所有资产折旧已计提完毕',
          assetCount: 0,
          totalDepreciation: 0,
        };
      }

      // 生成折旧分录
      const entryInfo = await this.createDepreciationEntry(
        connection,
        depreciationEntries,
        normalizedPeriodMonth,
        totalDepreciation,
        periodId
      );

      // 更新资产折旧信息
      await this.updateAssetDepreciationInfo(
        connection,
        depreciationEntries,
        normalizedPeriodMonth,
        entryInfo
      );

      // 记录操作日志
      await connection.execute(
        `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'finance',
          'depreciation',
          'system',
          JSON.stringify({
            period: normalizedPeriodMonth,
            assetCount: depreciationEntries.length,
            totalAmount: totalDepreciation,
            message: '月度折旧计提完成',
          }),
        ]
      );

      await connection.commit();

      return {
        success: true,
        message: '月度折旧计提完成',
        periodMonth: normalizedPeriodMonth,
        assetCount: depreciationEntries.length,
        totalDepreciation,
        entry: entryInfo,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('月度折旧计提失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * 计算单个资产的月度折旧
   * @param {Object} asset 固定资产信息
   * @param {string} periodMonth 折旧月份
   */
  static async calculateAssetDepreciation(asset, periodMonth) {
    const depreciationMethod = this.mapDepreciationMethod(asset.depreciation_method);
    const usefulLifeMonths = getUsefulLifeMonths(asset);
    const acquisitionCost = Number(asset.acquisition_cost) || 0;
    const accumulatedDepreciation = Number(asset.accumulated_depreciation) || 0;
    const impairmentAmount = Number(asset.impairment_amount) || 0;
    const salvageValue = Math.min(Math.max(Number(asset.salvage_value) || 0, 0), acquisitionCost);
    const netValueBefore = roundMoney(
      Math.max(0, acquisitionCost - accumulatedDepreciation - impairmentAmount)
    );
    const depreciableAmount = Math.max(0, acquisitionCost - salvageValue);
    const periodDate = toDate(`${periodMonth}-01T00:00:00Z`);
    const startDate = toDate(asset.depreciation_start_date || asset.acquisition_date);
    const usedMonths = monthsBetween(startDate, periodDate);

    if (depreciableAmount <= 0 || netValueBefore <= salvageValue || usedMonths >= usefulLifeMonths) {
      return 0;
    }

    let depreciationAmount;
    switch (depreciationMethod) {
      case 'straight_line':
        depreciationAmount = depreciableAmount / usefulLifeMonths;
        break;

      case 'double_declining':
        depreciationAmount = this.calculateDoubleDecliningDepreciation(asset, periodMonth);
        break;

      case 'sum_of_years':
        depreciationAmount = this.calculateSumOfYearsDepreciation(asset, periodMonth);
        break;

      default:
        depreciationAmount = depreciableAmount / usefulLifeMonths;
        break;
    }

    return roundMoney(Math.min(Math.max(depreciationAmount, 0), netValueBefore - salvageValue));
  }

  /**
   * 映射折旧方法（中文到英文）
   */
  static mapDepreciationMethod(chineseMethod) {
    const methodMap = {
      直线法: 'straight_line',
      双倍余额递减法: 'double_declining',
      年数总和法: 'sum_of_years',
      工作量法: 'units_of_production',
      不计提: 'no_depreciation',
    };
    return methodMap[chineseMethod] || 'straight_line';
  }

  /**
   * 双倍余额递减法计算
   */
  static calculateDoubleDecliningDepreciation(asset, _periodMonth) {
    const usefulLifeMonths = getUsefulLifeMonths(asset);
    const acquisitionCost = Number(asset.acquisition_cost) || 0;
    const accumulatedDepreciation = Number(asset.accumulated_depreciation) || 0;
    const impairmentAmount = Number(asset.impairment_amount) || 0;
    const salvageValue = Math.min(Math.max(Number(asset.salvage_value) || 0, 0), acquisitionCost);
    const currentNetValue = Math.max(0, acquisitionCost - accumulatedDepreciation - impairmentAmount);
    const periodDate = toDate(`${_periodMonth}-01T00:00:00Z`);
    const startDate = toDate(asset.depreciation_start_date || asset.acquisition_date);
    const remainingMonths = Math.max(usefulLifeMonths - monthsBetween(startDate, periodDate), 1);

    if (remainingMonths <= 24) {
      return (currentNetValue - salvageValue) / remainingMonths;
    }

    return currentNetValue * (2 / usefulLifeMonths);
  }

  /**
   * 年数总和法计算
   */
  static calculateSumOfYearsDepreciation(asset, periodMonth) {
    const usefulLifeMonths = getUsefulLifeMonths(asset);
    const usefulLifeYears = Math.max(Math.ceil(usefulLifeMonths / 12), 1);
    const acquisitionCost = Number(asset.acquisition_cost) || 0;
    const salvageValue = Math.min(Math.max(Number(asset.salvage_value) || 0, 0), acquisitionCost);
    const depreciableAmount = Math.max(0, acquisitionCost - salvageValue);
    const startDate = toDate(asset.depreciation_start_date || asset.acquisition_date);
    const currentDate = toDate(`${periodMonth}-01T00:00:00Z`);
    const yearsUsed = Math.floor(monthsBetween(startDate, currentDate) / 12);
    const sumOfYears = (usefulLifeYears * (usefulLifeYears + 1)) / 2;
    const currentYearRate = Math.max(usefulLifeYears - yearsUsed, 0) / sumOfYears;

    return (depreciableAmount * currentYearRate) / 12;
  }

  /**
   * 创建折旧分录
   */
  static async createDepreciationEntry(
    connection,
    depreciationEntries,
    periodMonth,
    totalDepreciation,
    periodId
  ) {
    // 生成分录编号
    const entryNumber = await this.generateEntryNumber('DEP', connection);

    // 获取会计期间（根据折旧月份的第一天）
    const entryDate = `${periodMonth}-01`;

    // 获取系统默认创建人
    const { financeConfig } = require('../../config/financeConfig');
    await financeConfig.loadFromDatabase(db);
    const defaultCreator = financeConfig.get('system.defaultCreator', 'system');

    // 准备分录数据
    const entryData = {
      entry_number: entryNumber,
      entry_date: entryDate,
      posting_date: entryDate,
      document_type: DOCUMENT_TYPE_MAPPING.ASSET_DEPRECIATION,
      document_number: `DEP-${periodMonth}`,
      period_id: periodId,
      description: `${periodMonth} 固定资产折旧计提`,
      created_by: defaultCreator,
      status: 'posted',
      is_posted: 1,
    };

    const entryItems = [];

    // 借：折旧费用
    entryItems.push({
      account_id: await this.getDepreciationExpenseAccountId(connection),
      debit_amount: totalDepreciation,
      credit_amount: 0,
      description: `${periodMonth} 折旧费用`,
    });

    // 贷：累计折旧
    entryItems.push({
      account_id: await this.getAccumulatedDepreciationAccountId(connection),
      debit_amount: 0,
      credit_amount: totalDepreciation,
      description: `${periodMonth} 累计折旧`,
    });

    // 创建会计分录
    const entryId = await financeModel.createEntry(entryData, entryItems, connection);

    return { entryId, entryNumber };
  }

  /**
   * 更新资产折旧信息
   */
  static async updateAssetDepreciationInfo(connection, depreciationEntries, periodMonth, entryInfo) {
    for (const entry of depreciationEntries) {
      const { asset, monthlyDepreciation } = entry;

      // 更新累计折旧
      const acquisitionCost = Number(asset.acquisition_cost) || 0;
      const impairmentAmount = Number(asset.impairment_amount) || 0;
      const currentAccumulated = Number(asset.accumulated_depreciation) || 0;
      const bookValueBefore = roundMoney(
        Math.max(0, acquisitionCost - currentAccumulated - impairmentAmount)
      );
      const newAccumulatedDepreciation = roundMoney(currentAccumulated + monthlyDepreciation);
      const newNetValue = roundMoney(
        Math.max(0, acquisitionCost - newAccumulatedDepreciation - impairmentAmount)
      );

      await connection.execute(
        `UPDATE fixed_assets
         SET accumulated_depreciation = ?,
             current_value = ?,
             net_value = ?,
             last_depreciation_date = ?
         WHERE id = ?`,
        [newAccumulatedDepreciation, newNetValue, newNetValue, `${periodMonth}-01`, asset.id]
      );

      // 记录折旧明细
      const [depResult] = await connection.execute(
        `INSERT INTO fixed_asset_depreciation_details
         (asset_id, depreciation_date, depreciation_amount, accumulated_depreciation, net_value,
          book_value_before, book_value_after, voucher_no, entry_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          asset.id,
          `${periodMonth}-01`,
          roundMoney(monthlyDepreciation),
          newAccumulatedDepreciation,
          newNetValue,
          bookValueBefore,
          newNetValue,
          entryInfo.entryNumber,
          entryInfo.entryId,
          `${periodMonth}月度折旧计提`,
        ]
      );

      await DocumentLinkService.tryAutoLink(
        'asset',
        asset.id,
        asset.asset_code,
        'finance_voucher',
        entryInfo.entryId,
        entryInfo.entryNumber,
        null,
        connection
      );
      await DocumentLinkService.tryAutoLink(
        'asset_depreciation',
        depResult.insertId,
        `${asset.asset_code}-${periodMonth}`,
        'finance_voucher',
        entryInfo.entryId,
        entryInfo.entryNumber,
        null,
        connection
      );
    }
  }

  /**
   * 获取折旧费用科目ID
   */
  static async getDepreciationExpenseAccountId(connection) {
    const { accountingConfig } = require('../../config/accountingConfig');
    await accountingConfig.loadFromDatabase(db);

    const accountCode = accountingConfig.getAccountCode('DEPRECIATION_EXPENSE');
    if (!accountCode) {
      throw new Error('折旧费用科目配置未找到');
    }

    const [accounts] = await connection.execute(
      'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1',
      [accountCode]
    );

    if (accounts.length === 0) {
      throw new Error(`折旧费用科目 (编码: ${accountCode}) 在系统中不存在或未启用`);
    }

    return accounts[0].id;
  }

  /**
   * 获取累计折旧科目ID
   */
  static async getAccumulatedDepreciationAccountId(connection) {
    const { accountingConfig } = require('../../config/accountingConfig');
    await accountingConfig.loadFromDatabase(db);

    const accountCode = accountingConfig.getAccountCode('ACCUMULATED_DEPRECIATION');
    if (!accountCode) {
      throw new Error('累计折旧科目配置未找到');
    }

    const [accounts] = await connection.execute(
      'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = true LIMIT 1',
      [accountCode]
    );

    if (accounts.length === 0) {
      throw new Error(`累计折旧科目 (编码: ${accountCode}) 在系统中不存在或未启用`);
    }

    return accounts[0].id;
  }

  /**
   * 根据日期获取会计期间ID
   * @param {Object} connection - 数据库连接
   * @param {string} businessDate - 业务日期（格式：YYYY-MM-DD）
   * @returns {Promise<number>} 期间ID
   */
  static async getPeriodIdByDate(connection, businessDate) {
    const [periods] = await connection.execute(
      `SELECT id, period_name, is_closed
         FROM gl_periods
         WHERE ? BETWEEN start_date AND end_date
         ORDER BY start_date DESC
         LIMIT 1
         FOR UPDATE`,
      [businessDate]
    );

    if (periods.length === 0) {
      throw new Error(`[Depreciation] 未找到日期 ${businessDate} 对应的会计期间`);
    }

    const period = periods[0];
    if (period.is_closed === true || period.is_closed === 1 || period.is_closed === '1') {
      throw new Error(`[Depreciation] 日期 ${businessDate} 对应的期间 ${period.period_name} 已关闭`);
    }

    return period.id;
  }

  /**
   * 生成分录编号
   */
  static async generateEntryNumber(prefix, connection = db.pool) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const [result] = await connection.execute(
      `SELECT entry_number as max_no
       FROM gl_entries
       WHERE entry_number LIKE ?
       ORDER BY entry_number DESC
       LIMIT 1
       FOR UPDATE`,
      [`${prefix}${dateStr}%`]
    );

    const maxNo = result[0]?.max_no || `${prefix}${dateStr}000`;
    const nextNo = `${prefix}${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

    return nextNo;
  }
}

module.exports = DepreciationService;
