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
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取需要计提折旧的固定资产
      const [assets] = await connection.execute(
        `
        SELECT * FROM fixed_assets
        WHERE status IN ('在用', '闲置')
          AND depreciation_method != '不计提'
          AND acquisition_date <= LAST_DAY(?)
          AND (depreciation_end_date IS NULL OR depreciation_end_date >= ?)
      `,
        [periodMonth + '-01', periodMonth + '-01']
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
              period: periodMonth,
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
        const monthlyDepreciation = await this.calculateAssetDepreciation(asset, periodMonth);

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
              period: periodMonth,
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
      await this.createDepreciationEntry(
        connection,
        depreciationEntries,
        periodMonth,
        totalDepreciation
      );

      // 更新资产折旧信息
      await this.updateAssetDepreciationInfo(connection, depreciationEntries, periodMonth);

      // 记录操作日志
      await connection.execute(
        `INSERT INTO operation_logs (module, operation, username, request_data, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [
          'finance',
          'depreciation',
          'system',
          JSON.stringify({
            period: periodMonth,
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
        periodMonth,
        assetCount: depreciationEntries.length,
        totalDepreciation,
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
    // 适配实际表结构
    const depreciationMethod = this.mapDepreciationMethod(asset.depreciation_method);
    const usefulLifeYears = asset.useful_life || 10;
    const acquisitionCost = parseFloat(asset.acquisition_cost) || 0;
    const salvageValue = parseFloat(asset.salvage_value) || 0;

    // 计算折旧基数
    const depreciableAmount = acquisitionCost - salvageValue;

    if (depreciableAmount <= 0) {
      return 0;
    }

    switch (depreciationMethod) {
      case 'straight_line':
        // 直线法：(原值 - 残值) / 使用年限 / 12
        return depreciableAmount / usefulLifeYears / 12;

      case 'double_declining':
        // 双倍余额递减法
        return this.calculateDoubleDecliningDepreciation(asset, periodMonth);

      case 'sum_of_years':
        // 年数总和法
        return this.calculateSumOfYearsDepreciation(asset, periodMonth);

      default:
        // 默认使用直线法
        return depreciableAmount / usefulLifeYears / 12;
    }
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
    const usefulLifeYears = asset.useful_life || 10;
    const rate = 2 / usefulLifeYears;

    // 计算已使用月数


    // 计算当前净值
    const acquisitionCost = parseFloat(asset.acquisition_cost) || 0;
    const accumulatedDepreciation = parseFloat(asset.accumulated_depreciation) || 0;
    const currentNetValue = acquisitionCost - accumulatedDepreciation;

    // 月折旧率
    const monthlyRate = rate / 12;

    return currentNetValue * monthlyRate;
  }

  /**
   * 年数总和法计算
   */
  static calculateSumOfYearsDepreciation(asset, periodMonth) {
    const usefulLifeYears = asset.useful_life_years || 10;
    const residualValueRate = asset.residual_value_rate || 0.05;
    const depreciableAmount = asset.original_value * (1 - residualValueRate);

    const startDate = new Date(asset.depreciation_start_date);
    const currentDate = new Date(periodMonth + '-01');

    // 计算已使用年数
    const yearsUsed = Math.floor(
      (currentDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );

    // 年数总和
    const sumOfYears = (usefulLifeYears * (usefulLifeYears + 1)) / 2;

    // 当年折旧率
    const currentYearRate = (usefulLifeYears - yearsUsed) / sumOfYears;

    return (depreciableAmount * currentYearRate) / 12;
  }

  /**
   * 创建折旧分录
   */
  static async createDepreciationEntry(
    connection,
    depreciationEntries,
    periodMonth,
    totalDepreciation
  ) {
    // 生成分录编号
    const entryNumber = await this.generateEntryNumber('DEP');

    // 获取会计期间（根据折旧月份的第一天）
    const entryDate = new Date(periodMonth + '-01').toISOString().split('T')[0];
    const periodId = await this.getPeriodIdByDate(connection, entryDate);

    // 获取系统默认创建人
    const { financeConfig } = require('../../config/financeConfig');
    await financeConfig.loadFromDatabase(db);
    const defaultCreator = financeConfig.get('system.defaultCreator', 'system');

    // 准备分录数据
    const entryData = {
      entry_number: entryNumber,
      entry_date: entryDate,
      posting_date: new Date().toISOString().split('T')[0],
      document_type: DOCUMENT_TYPE_MAPPING.ASSET_DEPRECIATION,
      document_number: `DEP-${periodMonth}`,
      period_id: periodId,
      description: `${periodMonth} 固定资产折旧计提`,
      created_by: defaultCreator,
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

    return entryId;
  }

  /**
   * 更新资产折旧信息
   */
  static async updateAssetDepreciationInfo(connection, depreciationEntries, periodMonth) {
    for (const entry of depreciationEntries) {
      const { asset, monthlyDepreciation } = entry;

      // 更新累计折旧
      const currentAccumulated = parseFloat(asset.accumulated_depreciation) || 0;
      const newAccumulatedDepreciation =
        Math.round((currentAccumulated + monthlyDepreciation) * 100) / 100;

      await connection.execute(
        `UPDATE fixed_assets
         SET accumulated_depreciation = ?,
             net_value = acquisition_cost - ?,
             last_depreciation_date = ?
         WHERE id = ?`,
        [newAccumulatedDepreciation, newAccumulatedDepreciation, periodMonth + '-01', asset.id]
      );

      // 记录折旧明细
      await connection.execute(
        `INSERT INTO fixed_asset_depreciation_details 
         (asset_id, depreciation_date, depreciation_amount, accumulated_depreciation, net_value)
         VALUES (?, ?, ?, ?, ?)`,
        [
          asset.id,
          periodMonth + '-01',
          Math.round(monthlyDepreciation * 100) / 100,
          newAccumulatedDepreciation,
          Math.round((parseFloat(asset.acquisition_cost) - newAccumulatedDepreciation) * 100) / 100,
        ]
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
    try {
      const [periods] = await connection.execute(
        `SELECT id, period_name, is_closed
         FROM gl_periods
         WHERE ? BETWEEN start_date AND end_date
         ORDER BY is_closed ASC, start_date DESC
         LIMIT 1`,
        [businessDate]
      );

      if (periods.length > 0) {
        const period = periods[0];

        // 如果期间已关闭，记录警告但仍然使用该期间
        if (period.is_closed) {
          logger.warn(
            `[Depreciation] 日期 ${businessDate} 对应的期间 ${period.period_name} 已关闭`
          );
        }

        return period.id;
      }

      // 如果没有找到匹配的期间，记录错误并返回null
      logger.error(`[Depreciation] 未找到日期 ${businessDate} 对应的会计期间`);
      return null;
    } catch (error) {
      logger.error('[Depreciation] 获取会计期间失败:', error);
      return null;
    }
  }

  /**
   * 生成分录编号
   */
  static async generateEntryNumber(prefix) {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    const [result] = await db.pool.execute(
      'SELECT MAX(entry_number) as max_no FROM gl_entries WHERE entry_number LIKE ?',
      [`${prefix}${dateStr}%`]
    );

    const maxNo = result[0].max_no || `${prefix}${dateStr}000`;
    const nextNo = `${prefix}${dateStr}${(parseInt(maxNo.slice(-3)) + 1).toString().padStart(3, '0')}`;

    return nextNo;
  }
}

module.exports = DepreciationService;
