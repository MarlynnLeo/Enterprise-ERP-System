/**
 * assetsController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { validateRequiredFields } = require('../../../utils/validationHelper');

const assetsModel = require('../../../models/assets');
const db = require('../../../config/db');
const { getCurrentUserName } = require('../../../utils/userHelper');

/**
 * 固定资产控制器
 */
const assetsController = {
  /**
   * 获取固定资产列表
   */
  getAssets: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const filters = {
        asset_code: req.query.assetCode || null,
        asset_name: req.query.assetName || null,
        asset_type: req.query.assetType || null,
        category_id: req.query.categoryId || null,
        status: req.query.status || null,
      };

      // 调用model方法获取固定资产列表
      const result = await assetsModel.getAssets(filters, page, limit);

      // 返回成功响应
      return ResponseHandler.paginated(
        res,
        result.assets || [],
        result.pagination?.total || 0,
        page,
        limit,
        '获取固定资产成功'
      );
    } catch (error) {
      // 即使出错也返回一个有效的JSON响应
      ResponseHandler.error(res, '获取固定资产失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个固定资产
   */
  getAssetById: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }

      // 获取固定资产详情
      const asset = await assetsModel.getAssetById(assetId);

      if (!asset) {
        return res.status(404).json({
          success: false,
          message: `未找到ID为${assetId}的资产`,
        });
      }

      // 转换字段名为前端期望的驼峰式
      const formattedAsset = {
        id: asset.id,
        assetCode: asset.asset_code,
        assetName: asset.asset_name,
        assetType: asset.asset_type,
        categoryId: asset.category_id,
        purchaseDate: asset.acquisition_date,
        originalValue: parseFloat(asset.acquisition_cost),
        netValue: parseFloat(asset.current_value - asset.accumulated_depreciation),
        location: asset.location_id || '',
        department: asset.department_name || '',
        responsible: asset.custodian || '',
        usefulLife: asset.useful_life,
        salvageRate: asset.salvage_value
          ? ((asset.salvage_value / asset.acquisition_cost) * 100).toFixed(2)
          : 0,
        depreciationMethod: asset.depreciation_method,
        notes: asset.notes || '',
        auditStatus: asset.audit_status || 'draft',
      };

      return ResponseHandler.success(res, formattedAsset, '获取固定资产详情成功');
    } catch (error) {
      ResponseHandler.error(res, '获取固定资产失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建固定资产
   */
  createAsset: async (req, res) => {
    try {
      const {
        getAssetTypeText,
        getDepreciationMethodText,
        getAssetStatusText,
      } = require('../../../constants/systemConstants');

      // 使用统一验证工具检查必填字段
      const validationError = validateRequiredFields(
        req.body,
        ['assetCode', 'assetName', 'purchaseDate', 'originalValue'],
        {
          assetCode: '资产编码',
          assetName: '资产名称',
          purchaseDate: '购入日期',
          originalValue: '原值',
        }
      );

      if (validationError) {
        return ResponseHandler.error(res, validationError.message, 'VALIDATION_ERROR', 400);
      }

      // 检查资产编码是否已存在
      try {
        const [existingAssets] = await db.pool.query(
          'SELECT id FROM fixed_assets WHERE asset_code = ?',
          [req.body.assetCode]
        );

        if (existingAssets && existingAssets.length > 0) {
          return res.status(400).json({
            success: false,
            message: `资产编码 ${req.body.assetCode} 已存在`,
          });
        }
      } catch (checkError) {
        // 继续执行，不中断流程
      }

      // 如果未提供assetType，则根据categoryId获取类别信息
      let assetType = req.body.assetType;
      if (!assetType && req.body.categoryId) {
        try {
          const [categories] = await db.pool.query('SELECT * FROM asset_categories WHERE id = ?', [
            req.body.categoryId,
          ]);

          if (categories && categories.length > 0) {
            // 根据类别设置默认的资产类型
            assetType = 'electronic'; // 默认为电子设备
          }
        } catch (categoryError) {
          logger.error('获取资产类别失败:', categoryError);
          // 继续执行，使用默认值
        }
      }

      // 处理location（存放地点）
      let locationId = null;
      if (req.body.location) {
        // 不再创建或查询locations表记录，直接将位置信息作为字符串保存
        locationId = req.body.location;
      }

      // 处理department（使用部门）
      let departmentId = null;
      if (req.body.department) {
        try {
          // 查找是否已有此部门
          const [departments] = await db.pool.query('SELECT id FROM departments WHERE name = ?', [
            req.body.department,
          ]);

          if (departments && departments.length > 0) {
            departmentId = departments[0].id;
          } else {
            // 创建新部门
            const [insertResult] = await db.pool.query(
              'INSERT INTO departments (name) VALUES (?)',
              [req.body.department]
            );
            departmentId = insertResult.insertId;
          }
        } catch (departmentError) {
          logger.error('处理部门信息失败:', departmentError);
          // 继续执行，不中断流程
        }
      }

      // 构建资产数据对象，从前端的驼峰式字段名转换为数据库的下划线格式
      const assetData = {
        asset_code: req.body.assetCode,
        asset_name: req.body.assetName,
        asset_type: getAssetTypeText(assetType),
        category_id: req.body.categoryId || null,
        acquisition_date: req.body.purchaseDate,
        acquisition_cost: parseFloat(req.body.originalValue),
        depreciation_method: getDepreciationMethodText(req.body.depreciationMethod),
        useful_life: parseInt(req.body.usefulLife) * 12 || 60, // 将年转换为月
        salvage_value:
          parseFloat(req.body.originalValue) * (parseFloat(req.body.salvageRate) / 100) || 0,
        location_id: locationId,
        department_id: departmentId,
        custodian: req.body.responsible || null,
        status: getAssetStatusText(req.body.status),
        notes: req.body.notes || null,
      };

      // 调用模型方法创建资产
      const assetId = await assetsModel.createAsset(assetData);

      // 记录变动日志
      await assetsModel.addChangeLog(assetId, '创建', await getCurrentUserName(req), [], `新建资产: ${assetData.asset_name}`);

      // 获取创建的资产完整信息
      const asset = await assetsModel.getAssetById(assetId);

      if (!asset) {
        return ResponseHandler.success(
          res,
          {
            success: true,
            message: '资产创建成功，但无法获取详细信息',
            data: { id: assetId },
          },
          '创建成功',
          201
        );
      }

      // 获取资产总数
      const assetCount = await assetsModel.getAssetCount();

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '资产创建成功',
          data: asset,
          meta: {
            totalCount: assetCount,
          },
        },
        '创建成功',
        201
      );
    } catch (error) {
      ResponseHandler.error(res, '创建固定资产失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新固定资产
   */
  updateAsset: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }

      logger.info('更新数据:', req.body);

      // 检查资产是否存在
      const existingAsset = await assetsModel.getAssetById(assetId);
      if (!existingAsset) {
        return res.status(404).json({
          success: false,
          message: `未找到ID为${assetId}的资产`,
        });
      }

      // 检查审核状态，已审核资产不允许编辑
      if (existingAsset.audit_status === 'approved') {
        return ResponseHandler.error(res, '已审核的资产不允许编辑，请先反审核', 'FORBIDDEN', 403);
      }

      // 处理location（存放地点）
      let locationId = existingAsset.location_id;
      if (req.body.location) {
        // 不再创建或查询locations表记录，直接将位置信息作为字符串保存
        locationId = req.body.location;
      }

      // 处理department（使用部门）
      let departmentId = existingAsset.department_id;
      if (req.body.department) {
        try {
          // 查找是否已有此部门
          const [departments] = await db.pool.query('SELECT id FROM departments WHERE name = ?', [
            req.body.department,
          ]);

          if (departments && departments.length > 0) {
            departmentId = departments[0].id;
          } else {
            // 创建新部门
            const [insertResult] = await db.pool.query(
              'INSERT INTO departments (name) VALUES (?)',
              [req.body.department]
            );
            departmentId = insertResult.insertId;
          }
        } catch (departmentError) {
          logger.error('处理部门信息失败:', departmentError);
          // 继续执行，不中断流程
        }
      }

      // 将前端数据转换为资产数据对象
      // 如果未提供assetType，则使用默认值
      const assetType = req.body.assetType || existingAsset.asset_type;

      const assetData = {
        asset_name: req.body.assetName,
        asset_type: assetType,
        category_id: req.body.categoryId || existingAsset.category_id,
        acquisition_date: req.body.purchaseDate || existingAsset.acquisition_date,
        depreciation_method: req.body.depreciationMethod || existingAsset.depreciation_method,
        useful_life: parseInt(req.body.usefulLife) || existingAsset.useful_life,
        salvage_value:
          parseFloat(req.body.originalValue) * (parseFloat(req.body.salvageRate) / 100) ||
          existingAsset.salvage_value,
        location_id: locationId,
        department_id: departmentId,
        custodian: req.body.responsible || existingAsset.custodian,
        status: req.body.status || existingAsset.status,
        notes: req.body.notes || existingAsset.notes,
      };

      // 如果原值变化，更新当前价值
      if (
        req.body.originalValue &&
        parseFloat(req.body.originalValue) !== parseFloat(existingAsset.acquisition_cost)
      ) {
        assetData.acquisition_cost = parseFloat(req.body.originalValue);
        assetData.current_value = parseFloat(req.body.originalValue);
        assetData.accumulated_depreciation = 0; // 重置累计折旧
      }

      // 调用模型更新资产
      const success = await assetsModel.updateAsset(assetId, assetData);

      if (!success) {
        return ResponseHandler.error(res, '资产更新失败', 'SERVER_ERROR', 500);
      }

      // 获取更新后的资产
      const updatedAsset = await assetsModel.getAssetById(assetId);

      // 转换为前端格式
      const formattedAsset = {
        id: updatedAsset.id,
        assetCode: updatedAsset.asset_code,
        assetName: updatedAsset.asset_name,
        categoryId: updatedAsset.category_id,
        purchaseDate: updatedAsset.acquisition_date,
        originalValue: parseFloat(updatedAsset.acquisition_cost || 0),
        netValue: parseFloat(
          (updatedAsset.current_value || 0) - (updatedAsset.accumulated_depreciation || 0)
        ),
        location: updatedAsset.location_id || '',
        department: updatedAsset.department_name || '',
        responsible: updatedAsset.custodian || '',
        usefulLife: updatedAsset.useful_life || 0,
        salvageRate: updatedAsset.salvage_value
          ? ((updatedAsset.salvage_value / updatedAsset.acquisition_cost) * 100).toFixed(2)
          : 0,
        depreciationMethod: updatedAsset.depreciation_method || 'straight_line',
        status:
          updatedAsset.status === '在用'
            ? 'in_use'
            : updatedAsset.status === '闲置'
              ? 'idle'
              : updatedAsset.status === '维修'
                ? 'under_repair'
                : updatedAsset.status === '报废'
                  ? 'disposed'
                  : 'in_use',
        notes: updatedAsset.notes || '',
      };

      return ResponseHandler.success(res, formattedAsset, '资产更新成功');
    } catch (error) {
      ResponseHandler.error(res, '更新固定资产失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 计算折旧
   */
  calculateDepreciation: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);

      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }

      // 首先检查资产是否存在
      const asset = await assetsModel.getAssetById(assetId);
      if (!asset) {
        return res.status(404).json({
          success: false,
          message: `未找到ID为${assetId}的资产`,
        });
      }

      // 获取当前日期作为折旧日期
      const today = new Date();
      const depreciationDate = today.toISOString().slice(0, 10); // YYYY-MM-DD格式

      let currentPeriod = null;
      let periodId = 1; // 默认使用ID为1的期间

      try {
        // 尝试获取当前会计期间
        currentPeriod = await financeModel.getCurrentPeriod();
        if (currentPeriod) {
          periodId = currentPeriod.id;
        } else {
          logger.warn('未找到当前会计期间');
        }
      } catch (periodError) {
        logger.warn('获取会计期间失败:', periodError);
      }

      // 准备折旧参数
      const params = {
        assetId: assetId,
        periodId: periodId,
        depreciationDate: depreciationDate,
        notes: `资产${assetId}的手动折旧计提`,
      };

      // 调用模型方法计算折旧
      try {
        const depreciationId = await assetsModel.calculateDepreciation(params);

        // 获取更新后的资产信息
        const updatedAsset = await assetsModel.getAssetById(assetId);

        return ResponseHandler.success(
          res,
          {
            depreciationId: depreciationId,
            assetId: assetId,
            depreciationDate: depreciationDate,
            currentValue: parseFloat(updatedAsset.current_value || 0),
            accumulatedDepreciation: parseFloat(updatedAsset.accumulated_depreciation || 0),
          },
          '折旧计算成功'
        );
      } catch (modelError) {
        // 检查是否是已经计提折旧的错误
        if (modelError.message && modelError.message.includes('已计提折旧')) {
          return ResponseHandler.error(res, modelError.message, 'BAD_REQUEST', 400);
        }

        // 其他错误
        return ResponseHandler.error(res, '计算折旧失败', 'SERVER_ERROR', 500, modelError);
      }
    } catch (error) {
      logger.error('计算折旧失败:', error);
      ResponseHandler.error(res, '计算折旧失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 批量计算折旧
   */
  calculateBatchDepreciation: async (req, res) => {
    try {
      const { depreciationDate, categoryId, department } = req.query;

      if (!depreciationDate) {
        return ResponseHandler.error(res, '缺少折旧日期参数', 'BAD_REQUEST', 400);
      }

      // 调用模型方法计算折旧
      const assetsList = await assetsModel.calculateBatchDepreciation(
        depreciationDate,
        categoryId,
        department
      );

      return ResponseHandler.success(res, assetsList, '批量计算折旧成功');
    } catch (error) {
      logger.error('批量计算折旧失败:', error);
      ResponseHandler.error(res, '批量计算折旧失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 查询折旧记录（检查某月是否已计提）
   */
  getDepreciationRecords: async (req, res) => {
    try {
      const { depreciationDate } = req.query;
      if (!depreciationDate) {
        return ResponseHandler.error(res, '缺少计提年月参数', 'BAD_REQUEST', 400);
      }
      const [records] = await db.pool.query(
        `SELECT id, asset_id, depreciation_date, depreciation_amount
         FROM fixed_asset_depreciation_details
         WHERE DATE_FORMAT(depreciation_date, '%Y-%m') = ?
         LIMIT 10`,
        [depreciationDate]
      );
      ResponseHandler.success(res, records, '查询成功');
    } catch (error) {
      // 如果表不存在，返回空数组
      if (error.code === 'ER_NO_SUCH_TABLE') {
        return ResponseHandler.success(res, [], '查询成功');
      }
      logger.error('查询折旧记录失败:', error);
      ResponseHandler.error(res, '查询折旧记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 提交折旧
   */
  submitDepreciation: async (req, res) => {
    try {
      const { depreciationDate, assets } = req.body;

      if (!depreciationDate || !assets || !Array.isArray(assets) || assets.length === 0) {
        return ResponseHandler.error(res, '缺少必要参数', 'BAD_REQUEST', 400);
      }

      // 调用模型方法提交折旧
      await assetsModel.submitDepreciation(depreciationDate, assets);

      return ResponseHandler.success(
        res,
        {
          depreciationDate,
          assetsCount: assets.length,
          totalDepreciationAmount: assets.reduce((sum, asset) => sum + asset.depreciationAmount, 0),
        },
        '折旧提交成功'
      );
    } catch (error) {
      logger.error('提交折旧失败:', error);
      ResponseHandler.error(res, '提交折旧失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 导出折旧数据
   */
  exportDepreciation: async (req, res) => {
    try {
      const { depreciationDate, categoryId, department } = req.query;

      if (!depreciationDate) {
        return ResponseHandler.error(res, '缺少折旧日期参数', 'BAD_REQUEST', 400);
      }

      // 查询折旧数据
      let query = `
        SELECT 
          fa.asset_code AS '资产编号',
          fa.asset_name AS '资产名称', 
          fa.asset_type AS '资产类型',
          d.name AS '使用部门',
          fa.acquisition_cost AS '原值',
          fa.current_value AS '当前净值',
          fa.accumulated_depreciation AS '累计折旧',
          fa.depreciation_method AS '折旧方法',
          fa.useful_life AS '使用寿命(月)',
          fa.salvage_value AS '残值',
          fa.status AS '状态'
        FROM fixed_assets fa
        LEFT JOIN departments d ON fa.department_id = d.id
        WHERE fa.status != '已处置'
      `;
      const params = [];

      if (categoryId) {
        query += ' AND fa.category_id = ?';
        params.push(categoryId);
      }
      if (department) {
        query += ' AND (d.name LIKE ? OR fa.department_id = ?)';
        params.push(`%${department}%`, department);
      }

      query += ' ORDER BY fa.asset_code';

      const [rows] = await db.pool.query(query, params);

      // 使用 ExcelJS 生成文件
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'ERP系统';
      workbook.created = new Date();

      const sheet = workbook.addWorksheet('折旧数据');

      // 设置列定义
      sheet.columns = [
        { header: '资产编号', key: 'asset_code', width: 15 },
        { header: '资产名称', key: 'asset_name', width: 25 },
        { header: '资产类型', key: 'asset_type', width: 12 },
        { header: '使用部门', key: 'department', width: 15 },
        { header: '原值', key: 'cost', width: 15 },
        { header: '当前净值', key: 'current_value', width: 15 },
        { header: '累计折旧', key: 'depreciation', width: 15 },
        { header: '折旧方法', key: 'method', width: 12 },
        { header: '使用寿命(月)', key: 'life', width: 12 },
        { header: '残值', key: 'salvage', width: 12 },
        { header: '状态', key: 'status', width: 10 },
      ];

      // 设置表头样式
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };

      // 填充数据
      rows.forEach((row) => {
        sheet.addRow({
          asset_code: row['资产编号'],
          asset_name: row['资产名称'],
          asset_type: row['资产类型'],
          department: row['使用部门'] || '',
          cost: parseFloat(row['原值']) || 0,
          current_value: parseFloat(row['当前净值']) || 0,
          depreciation: parseFloat(row['累计折旧']) || 0,
          method: row['折旧方法'] || '',
          life: row['使用寿命(月)'] || 0,
          salvage: parseFloat(row['残值']) || 0,
          status: row['状态'] || '',
        });
      });

      // 设置响应头
      const fileName = `折旧数据_${depreciationDate}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

      // 写入响应流
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出折旧数据失败:', error);
      ResponseHandler.error(res, '导出折旧数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 审核/反审核资产
   */
  auditAsset: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      const { action } = req.body; // 'approve' or 'reject'

      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }

      if (!['approve', 'reject'].includes(action)) {
        return ResponseHandler.error(res, '无效的审核操作', 'BAD_REQUEST', 400);
      }

      const asset = await assetsModel.getAssetById(assetId);
      if (!asset) {
        return ResponseHandler.error(res, '资产不存在', 'NOT_FOUND', 404);
      }

      const auditStatus = action === 'approve' ? 'approved' : 'draft';
      const auditedBy = action === 'approve' ? (await getCurrentUserName(req)) : null;
      const auditedAt = action === 'approve' ? new Date() : null;

      await db.pool.query(
        'UPDATE fixed_assets SET audit_status = ?, audited_by = ?, audited_at = ? WHERE id = ?',
        [auditStatus, auditedBy, auditedAt, assetId]
      );

      const message = action === 'approve' ? '资产审核通过' : '资产已反审核';
      return ResponseHandler.success(res, { auditStatus, auditedBy, auditedAt }, message);
    } catch (error) {
      ResponseHandler.error(res, '审核操作失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建示例资产数据
   * @param {Object} req - 请求对象
   * @param {Object} res - 响应对象
   * @returns {Promise<Object>} 响应结果
   */
  createSampleAssets: async (req, res) => {
    try {
      const result = await assetsModel.createSampleAssets();
      return ResponseHandler.success(res, result, '创建示例资产数据成功');
    } catch (error) {
      logger.error('创建示例资产数据失败:', error);
      return ResponseHandler.error(res, '创建示例资产数据失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 处置资产
   */
  disposeAsset: async (req, res) => {
    try {
      const assetId = req.params.id;
      const { disposalDate, disposalAmount, disposalReason, disposalMethod, handler, notes } =
        req.body;

      // 验证必填字段
      const validationError = validateRequiredFields(
        req.body,
        ['disposalDate', 'disposalReason'],
        { disposalDate: '处置日期', disposalReason: '处置原因' }
      );

      if (validationError) {
        return ResponseHandler.validationError(res, '参数验证失败', validationError.fields);
      }

      // 验证处置方式
      const validMethods = ['报废', '出售', '转让', '捐赠', '其他'];
      if (disposalMethod && !validMethods.includes(disposalMethod)) {
        return ResponseHandler.validationError(res, '无效的处置方式', [
          {
            field: 'disposalMethod',
            message: `处置方式必须是以下之一: ${validMethods.join(', ')}`,
          },
        ]);
      }

      // 获取资产信息
      const asset = await assetsModel.getAssetById(assetId);
      if (!asset) {
        return res.status(404).json({ error: '资产不存在' });
      }

      // 检查资产状态
      const disposedStatuses = ['已处置', '报废', '已出售', '已转让', '已捐赠'];
      if (disposedStatuses.includes(asset.status)) {
        return res.status(400).json({ error: '该资产已经处置，不能重复处置' });
      }

      // 准备处置数据
      const disposalData = {
        disposal_date: disposalDate,
        disposal_amount: parseFloat(disposalAmount || 0),
        disposal_reason: disposalReason,
        disposal_method: disposalMethod || '报废',
        handler: handler || 'system',
        notes: notes || '',
        asset_code: asset.asset_code,
      };

      // 调用模型方法处置资产（传递id作为第一个参数）
      await assetsModel.disposeAsset(assetId, disposalData);

      // 计算处置损益
      const netBookValue = parseFloat(asset.net_book_value || asset.current_value || 0);
      const disposalGainLoss = parseFloat(disposalAmount || 0) - netBookValue;

      ResponseHandler.success(
        res,
        {
          id: assetId,
          assetCode: asset.asset_code,
          assetName: asset.asset_name,
          disposalDate: disposalDate,
          disposalAmount: parseFloat(disposalAmount || 0),
          netBookValue: netBookValue,
          disposalGainLoss: disposalGainLoss,
          message: '资产处置成功',
        },
        '资产处置成功'
      );
    } catch (error) {
      logger.error('处置资产失败:', error);
      ResponseHandler.error(res, '处置资产失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 转移资产
   */
  transferAsset: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);

      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }

      // 检查资产是否存在
      const asset = await assetsModel.getAssetById(assetId);
      if (!asset) {
        return res.status(404).json({
          success: false,
          message: `未找到ID为${assetId}的资产`,
        });
      }

      // 检查资产状态是否允许调拨
      if (asset.asset_type === '报废' || asset.asset_type === '已处置') {
        return ResponseHandler.error(res, '已报废或已处置的资产不能进行调拨', 'BAD_REQUEST', 400);
      }

      // 获取调拨参数
      const { newDepartment, newResponsible, newLocation, transferDate, transferReason, notes } =
        req.body;

      // 验证必要参数
      if (!newDepartment || !newResponsible || !newLocation || !transferDate) {
        return ResponseHandler.error(
          res,
          '缺少必要参数：新部门、新责任人、新存放地点或调拨日期',
          'BAD_REQUEST',
          400
        );
      }

      // 调用模型方法执行调拨
      const transferData = {
        assetId,
        originalDepartment: asset.department_id,
        originalResponsible: asset.custodian,
        originalLocation: asset.location_id,
        newDepartment,
        newResponsible,
        newLocation,
        transferDate,
        transferReason: transferReason || '',
        notes: notes || '',
      };

      // 执行调拨并获取结果
      await assetsModel.transferAsset(transferData);

      // 返回成功响应
      return ResponseHandler.success(
        res,
        {
          assetId,
          assetCode: asset.asset_code,
          assetName: asset.asset_name,
          newDepartment,
          newResponsible,
          newLocation,
          transferDate,
        },
        '资产调拨成功'
      );
    } catch (error) {
      logger.error('转移资产失败:', error);
      ResponseHandler.error(res, '转移资产失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取资产统计
   */
  getAssetStatistics: async (req, res) => {
    try {
      // 查询资产总数和总价值
      const [totalResult] = await db.pool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(acquisition_cost) as totalValue,
          SUM(current_value - accumulated_depreciation) as netValue
        FROM fixed_assets
      `);

      // 查询各种状态的资产数量
      const [statusResult] = await db.pool.query(`
        SELECT 
          status,
          COUNT(*) as count,
          SUM(acquisition_cost) as value
        FROM fixed_assets
        GROUP BY status
      `);

      // 将结果转换为前端需要的格式
      const stats = {
        total: totalResult[0].total || 0,
        totalValue: totalResult[0].totalValue || 0,
        netValue: totalResult[0].netValue || 0,
        inUseCount: 0,
        idleCount: 0,
        underRepairCount: 0,
        disposedCount: 0,
      };

      // 填充各种状态的资产数量
      statusResult.forEach((item) => {
        if (item.status === '在用') {
          stats.inUseCount = item.count;
          stats.inUseValue = item.value;
        } else if (item.status === '闲置') {
          stats.idleCount = item.count;
          stats.idleValue = item.value;
        } else if (item.status === '维修') {
          stats.underRepairCount = item.count;
          stats.underRepairValue = item.value;
        } else if (item.status === '报废' || item.status === '已处置') {
          stats.disposedCount = (stats.disposedCount || 0) + item.count;
          stats.disposedValue = (stats.disposedValue || 0) + item.value;
        }
      });

      return ResponseHandler.success(res, stats, '获取资产统计成功');
    } catch (error) {
      ResponseHandler.error(res, '获取资产统计失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取资产类别列表
   */
  getAssetCategories: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;

      const categories = await assetsModel.getAssetCategories(page, limit);

      // 确保返回一个统一的数据格式
      return ResponseHandler.paginated(
        res,
        categories.data || [],
        categories.total || 0,
        categories.page || page,
        categories.limit || limit,
        '获取资产类别列表成功'
      );
    } catch (error) {
      // 即使出错也返回一个结构化的响应，确保前端接收到有效JSON
      return ResponseHandler.error(res, '获取资产类别列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取单个资产类别
   */
  getAssetCategoryById: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的类别ID', 'BAD_REQUEST', 400);
      }

      const category = await assetsModel.getAssetCategoryById(id);

      if (!category) {
        return ResponseHandler.error(res, '资产类别不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, category, '操作成功');
    } catch (error) {
      logger.error('获取资产类别失败:', error);
      ResponseHandler.error(res, '获取资产类别失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建资产类别
   */
  createAssetCategory: async (req, res) => {
    try {
      const categoryData = {
        name: req.body.name,
        code: req.body.code,
        default_useful_life: req.body.default_useful_life,
        default_depreciation_method: req.body.default_depreciation_method,
        default_salvage_rate: req.body.default_salvage_rate,
        description: req.body.description,
      };

      if (!categoryData.name || !categoryData.code) {
        return ResponseHandler.error(res, '类别名称和编码为必填项', 'BAD_REQUEST', 400);
      }

      const categoryId = await assetsModel.createAssetCategory(categoryData);

      const newCategory = await assetsModel.getAssetCategoryById(categoryId);

      ResponseHandler.success(
        res,
        {
          success: true,
          message: '资产类别创建成功',
          data: newCategory,
        },
        '创建成功',
        201
      );
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('Duplicate entry'))) {
        return ResponseHandler.error(res, `类别编码 '${req.body.code}' 已存在，请使用其他编码`, 'BAD_REQUEST', 400);
      }
      logger.error('创建资产类别失败:', error);
      ResponseHandler.error(res, '创建资产类别失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新资产类别
   */
  updateAssetCategory: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的类别ID', 'BAD_REQUEST', 400);
      }

      const categoryData = {
        name: req.body.name,
        code: req.body.code,
        default_useful_life: req.body.default_useful_life,
        default_depreciation_method: req.body.default_depreciation_method,
        default_salvage_rate: req.body.default_salvage_rate,
        description: req.body.description,
      };

      if (!categoryData.name || !categoryData.code) {
        return ResponseHandler.error(res, '类别名称和编码为必填项', 'BAD_REQUEST', 400);
      }

      // 检查类别是否存在
      const existingCategory = await assetsModel.getAssetCategoryById(id);
      if (!existingCategory) {
        return ResponseHandler.error(res, '资产类别不存在', 'NOT_FOUND', 404);
      }

      const success = await assetsModel.updateAssetCategory(id, categoryData);

      if (success) {
        const updatedCategory = await assetsModel.getAssetCategoryById(id);

        ResponseHandler.success(res, updatedCategory, '资产类别更新成功');
      } else {
        ResponseHandler.error(res, '资产类别更新失败', 'SERVER_ERROR', 500);
      }
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('Duplicate entry'))) {
        return ResponseHandler.error(res, `类别编码 '${req.body.code}' 已存在，请使用其他编码`, 'BAD_REQUEST', 400);
      }
      logger.error('更新资产类别失败:', error);
      ResponseHandler.error(res, '更新资产类别失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除资产类别
   */
  deleteAssetCategory: async (req, res) => {
    try {
      const id = parseInt(req.params.id);

      if (isNaN(id)) {
        return ResponseHandler.error(res, '无效的类别ID', 'BAD_REQUEST', 400);
      }

      // 检查类别是否存在
      const existingCategory = await assetsModel.getAssetCategoryById(id);
      if (!existingCategory) {
        return ResponseHandler.error(res, '资产类别不存在', 'NOT_FOUND', 404);
      }

      await assetsModel.deleteAssetCategory(id);

      ResponseHandler.success(res, null, '资产类别删除成功');
    } catch (error) {
      logger.error('删除资产类别失败:', error);
      ResponseHandler.error(res, error.message || '删除资产类别失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 生成资产编号
   */
  generateAssetCode: async (req, res) => {
    try {
      const categoryId = req.query.categoryId || null;
      const code = await assetsModel.generateAssetCode(categoryId);
      return ResponseHandler.success(res, { code }, '生成资产编号成功');
    } catch (error) {
      logger.error('生成资产编号失败:', error);
      ResponseHandler.error(res, '生成资产编号失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取资产变动记录
   */
  getAssetChangeLogs: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 50;
      const result = await assetsModel.getAssetChangeLogs(assetId, page, pageSize);
      return ResponseHandler.success(res, result, '获取变动记录成功');
    } catch (error) {
      logger.error('获取变动记录失败:', error);
      ResponseHandler.error(res, '获取变动记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取折旧历史记录
   */
  getDepreciationHistory: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }
      const records = await assetsModel.getDepreciationHistory(assetId);
      return ResponseHandler.success(res, records, '获取折旧历史成功');
    } catch (error) {
      logger.error('获取折旧历史失败:', error);
      ResponseHandler.error(res, '获取折旧历史失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 计提资产减值准备
   */
  createImpairment: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }

      const { impairment_amount, impairment_date, reason } = req.body;
      if (!impairment_amount || !impairment_date) {
        return ResponseHandler.error(res, '缺少必填字段(impairment_amount, impairment_date)', 'BAD_REQUEST', 400);
      }

      const impairmentData = {
        impairment_amount,
        impairment_date,
        reason,
        handled_by: await getCurrentUserName(req)
      };

      const id = await assetsModel.createImpairment(assetId, impairmentData);
      return ResponseHandler.success(res, { id }, '计提减值准备成功', 201);
    } catch (error) {
      if (error.message.includes('不能大于资产当前净值')) {
        return ResponseHandler.error(res, error.message, 'BAD_REQUEST', 400);
      }
      logger.error('计提减值准备失败:', error);
      ResponseHandler.error(res, '计提减值准备失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 资产拆分
   */
  splitAsset: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }

      const splitData = req.body;
      const validationError = validateRequiredFields(
        splitData,
        ['split_cost'],
        { split_cost: '拆分金额' }
      );

      if (validationError) {
        return ResponseHandler.validationError(res, '参数验证失败', validationError.fields);
      }

      const userId = req.user ? req.user.username : 'system';
      const result = await assetsModel.splitAsset(assetId, splitData, userId);

      return ResponseHandler.success(res, result, '资产拆分成功');
    } catch (error) {
      logger.error('资产拆分失败:', error);
      if (error.message && (error.message.includes('不能拆分') || error.message.includes('拆分金额'))) {
        return ResponseHandler.error(res, error.message, 'BAD_REQUEST', 400);
      }
      ResponseHandler.error(res, '资产拆分失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取某资产全部减值准备历史记录
   */
  getImpairments: async (req, res) => {
    try {
      const assetId = parseInt(req.params.id);
      if (isNaN(assetId)) {
        return ResponseHandler.error(res, '无效的资产ID', 'BAD_REQUEST', 400);
      }
      const records = await assetsModel.getImpairments(assetId);
      return ResponseHandler.success(res, records, '获取减值记录成功');
    } catch (error) {
      logger.error('获取资产减值记录失败:', error);
      ResponseHandler.error(res, '获取减值记录失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 资产看板数据与折旧预测
   */
  getDashboardStats: async (req, res) => {
    try {
      const stats = await assetsModel.getAssetDashboardStats();
      return ResponseHandler.success(res, stats, '获取资产看板统计成功');
    } catch (error) {
      logger.error('获取资产看板统计失败:', error);
      ResponseHandler.error(res, '获取资产看板统计失败', 'SERVER_ERROR', 500, error);
    }
  },

  getDepreciationForecast: async (req, res) => {
    try {
      const months = parseInt(req.query.months) || 6;
      if (months <= 0 || months > 60) {
        return ResponseHandler.error(res, '月数必须在 1 到 60 之间', 'BAD_REQUEST', 400);
      }
      const forecast = await assetsModel.getDepreciationForecast(months);
      return ResponseHandler.success(res, forecast, '获取折旧预测成功');
    } catch (error) {
      logger.error('获取折旧预测失败:', error);
      ResponseHandler.error(res, '获取折旧预测失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = assetsController;
