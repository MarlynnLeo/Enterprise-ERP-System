/**
 * bomController.js - BOM管理
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getCurrentUserName } = require('../../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { safeParseId } = require('../../../utils/safeParseId');
const DLQService = require('../../../services/business/DLQService');
const { mapKeysToSnake } = require('../../../utils/fieldMap');

const bomService = require('../../../services/bomService');

const bomController = {

  async getBomOptions(req, res) {
    try {
      const pageSize = Math.min(
        Math.max(parseInt(req.query.limit || req.query.pageSize, 10) || 50, 1),
        100
      );
      const options = await bomService.getBomOptions({
        keyword: req.query.keyword || req.query.search || '',
        includeHistory: req.query.includeHistory === 'true' || req.query.includeHistory === true,
        pageSize,
      });

      ResponseHandler.success(res, options, '获取BOM选项成功');
    } catch (error) {
      logger.error('获取BOM选项失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getAllBoms(req, res) {
    try {
      const { page = 1, pageSize = 10, ...filters } = req.query;
      // HTTP camel → service snake
      const serviceFilters = mapKeysToSnake(filters);
      if (serviceFilters.product_id == null && filters.productId != null) {
        serviceFilters.product_id = filters.productId;
      }

      const result = await bomService.getAllBoms(
        parseInt(page) || 1,
        parseInt(pageSize) || 10,
        serviceFilters
      );
      ResponseHandler.paginated(
        res,
        result.data,
        result.pagination.total,
        result.pagination.page,
        result.pagination.pageSize,
        '获取BOM列表成功'
      );
    } catch (error) {
      logger.error('获取BOM列表失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getBomById(req, res) {
    try {
      const bom = await bomService.getBomById(req.params.id);
      if (bom) {
        ResponseHandler.success(res, bom, '获取BOM详情成功');
      } else {
        ResponseHandler.error(res, 'BOM不存在', 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('获取BOM详情失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async createBom(req, res) {
    try {
      // 兼容两种数据格式；HTTP camel → snake
      let bomData, details;
      if (req.body.bomData && req.body.details) {
        bomData = mapKeysToSnake(req.body.bomData);
        details = Array.isArray(req.body.details)
          ? req.body.details.map((d) => mapKeysToSnake(d))
          : req.body.details;
      } else {
        const { details: detailsArray, ...restData } = req.body;
        bomData = mapKeysToSnake(restData);
        details = Array.isArray(detailsArray)
          ? detailsArray.map((d) => mapKeysToSnake(d))
          : detailsArray;
      }

      // 控制器级输入校验（只认 snake 内部）
      if (!bomData || !bomData.product_id) {
        return ResponseHandler.error(res, '产品ID为必填项', 'VALIDATION_ERROR', 400);
      }
      if (!bomData.version || !String(bomData.version).trim()) {
        return ResponseHandler.error(res, '版本号为必填项', 'VALIDATION_ERROR', 400);
      }
      if (!details || !Array.isArray(details) || details.length === 0) {
        return ResponseHandler.error(res, 'BOM明细不能为空', 'VALIDATION_ERROR', 400);
      }

      // 注入当前操作人真实姓名
      const currentUser = await getCurrentUserName(req);
      bomData.created_by = currentUser;
      bomData.updated_by = currentUser;

      const newBom = await bomService.createBom(bomData, details);
      ResponseHandler.success(res, newBom, '创建BOM成功', 201);
    } catch (error) {
      logger.error('创建BOM失败:', error);
      // 参数/业务校验类错误返回 400，避免前端只看到笼统 500
      // createBom 会包装为「创建BOM失败: xxx」，以及 MySQL 唯一键冲突
      const raw = error.cause?.message || error.message || '创建BOM失败';
      const msg = String(raw).replace(/^创建BOM失败:\s*/, '');
      const isDup = error.code === 'ER_DUP_ENTRY' || /Duplicate entry|已存在版本|不能重复/.test(msg);
      const isValidation =
        isDup || /不能为空|必填|无效|未维护|循环|不存在|已删除/.test(msg);
      ResponseHandler.error(
        res,
        isDup && !/已存在版本/.test(msg)
          ? '该产品下版本号已存在，请更换版本号后重试'
          : msg,
        isValidation ? 'VALIDATION_ERROR' : 'SERVER_ERROR',
        isValidation ? 400 : 500,
        error
      );
    }
  },

  async updateBom(req, res) {
    try {
      // 兼容两种数据格式；HTTP camel → snake
      let bomData, details;
      if (req.body.bomData && req.body.details) {
        bomData = mapKeysToSnake(req.body.bomData);
        details = Array.isArray(req.body.details)
          ? req.body.details.map((d) => mapKeysToSnake(d))
          : req.body.details;
      } else {
        const { details: detailsArray, ...restData } = req.body;
        bomData = mapKeysToSnake(restData);
        details = Array.isArray(detailsArray)
          ? detailsArray.map((d) => mapKeysToSnake(d))
          : detailsArray;
      }

      // 控制器级输入校验
      if (!details || !Array.isArray(details) || details.length === 0) {
        return ResponseHandler.error(res, 'BOM明细不能为空', 'VALIDATION_ERROR', 400);
      }

      // 注入当前操作人真实姓名
      const currentUser = await getCurrentUserName(req);
      bomData.updated_by = currentUser;

      const updatedBom = await bomService.updateBom(req.params.id, bomData, details);
      ResponseHandler.success(res, updatedBom, '更新BOM成功');
    } catch (error) {
      logger.error('更新BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async deleteBom(req, res) {
    try {
      await bomService.deleteBom(req.params.id);
      ResponseHandler.success(res, null, '删除BOM成功', 204);
    } catch (error) {
      logger.error('删除BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getBomStats(req, res) {
    try {
      const { pool: dbPool } = require('../../../config/db');

      // 统计：「已审核」基于 approved_by 字段（非 status），与前端 UI 对齐
      const [bomResult] = await dbPool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN approved_by IS NOT NULL THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN approved_by IS NULL THEN 1 ELSE 0 END) as inactive,
          (SELECT COUNT(*) FROM bom_details) as detailsCount,
          (SELECT COALESCE(SUM(sc.standard_price), 0) FROM standard_costs sc
           JOIN bom_masters bm ON sc.product_id = bm.product_id WHERE bm.status != 2) as totalCost
        FROM bom_masters
        WHERE status != 2 AND deleted_at IS NULL
      `);

      ResponseHandler.success(res, bomResult[0], '获取BOM统计成功');
    } catch (error) {
      logger.error('获取BOM统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async replaceBom(req, res) {
    try {
      const { oldMaterialCode, newMaterialCode } = req.body;
      if (!oldMaterialCode || !newMaterialCode) {
        return ResponseHandler.error(res, '必须提供被替换和用于替换的物料编码', 'VALIDATION_ERROR', 400);
      }

      const bomService = require('../../../services/bomService');
      const result = await bomService.replaceBom(oldMaterialCode, newMaterialCode);

      ResponseHandler.success(res, result, `成功在 ${result.bomsCount} 个BOM中替换了 ${result.affectedRows} 条明细`);
    } catch (error) {
      logger.error('替换BOM物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportBoms(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportBoms(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=boms_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importBoms(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'VALIDATION_ERROR', 400);
      }

      const ImportExportService = require('../../../services/importExportService');
      const result = await ImportExportService.importBoms(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadBomTemplate(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.downloadBomTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=bom_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载BOM模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async approveBom(req, res) {
    try {
      const { pool } = require('../../../config/db');
      const bomId = safeParseId(req.params.id);
      if (!Number.isInteger(bomId) || bomId <= 0) {
        return ResponseHandler.error(res, '无效的BOM ID', 'VALIDATION_ERROR', 400);
      }

      // 审核BOM：同步设置 status=1 + approved_at + approved_by（INT字段，存用户ID）
      await pool.query(
        'UPDATE bom_masters SET status = 1, approved_at = NOW(), approved_by = ? WHERE id = ?',
        [getAuthenticatedUserId(req), bomId]
      );

      // 审核后触发关键后处理（与 createBom/deleteBom 保持一致）
      try {
        const BomExplosionService = require('../../../services/BomExplosionService');
        const [bomInfo] = await pool.query('SELECT product_id FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [bomId]);
        if (bomInfo.length > 0) {
          // 更新该产品在其他BOM中的 has_sub_bom 标记
          await BomExplosionService.updateHasSubBomFlag(bomInfo[0].product_id);
          // 级联失效自身及所有祖先BOM的缓存
          await BomExplosionService.invalidateCache(bomId);
        }
      } catch (e) {
        await DLQService.recordSideEffectFailure(
          'BOM:approvePostProcess',
          { bomId },
          e
        );
      }

      ResponseHandler.success(res, null, 'BOM审核成功');
    } catch (error) {
      logger.error('BOM审核失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getLatestBomByProductId(req, res) {
    try {
      const { productId } = req.params;
      const { status } = req.query;
      const result = await bomService.getLatestBomByProductId(productId, status);
      ResponseHandler.success(res, result, '获取产品BOM成功');
    } catch (error) {
      logger.error('获取产品BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getBomDetails(req, res) {
    try {
      const details = await bomService.getBomDetails(req.params.id);
      ResponseHandler.success(res, details, '获取BOM明细成功');
    } catch (error) {
      logger.error('获取BOM明细失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMultiLevelBomDetails(req, res) {
    try {
      const tree = await bomService.getMultiLevelBomDetails(req.params.id);
      ResponseHandler.success(res, tree, '获取多级BOM结构成功');
    } catch (error) {
      logger.error('获取多级BOM结构失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async explodeBom(req, res) {
    try {
      const { id } = req.params;
      const { quantity = 1, useCache = true } = req.query;

      const BomExplosionService = require('../../../services/BomExplosionService');

      // 获取BOM信息
      const bom = await bomService.getBomById(id);
      if (!bom) {
        return ResponseHandler.error(res, 'BOM不存在', 'NOT_FOUND', 404);
      }

      const result = await BomExplosionService.explodeBom(
        bom.product_id,
        parseInt(id),
        parseFloat(quantity),
        useCache !== 'false'
      );

      ResponseHandler.success(
        res,
        {
          bom_id: parseInt(id),
          product_id: bom.product_id,
          product_name: bom.product_name,
          version: bom.version,
          quantity: parseFloat(quantity),
          explosion: result,
          total_materials: result.length,
          max_level: result.length > 0 ? Math.max(...result.map((r) => r.level)) : 0,
        },
        '展开BOM成功'
      );
    } catch (error) {
      logger.error('展开BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async detectCircularReference(req, res) {
    try {
      const { productId, materialId } = req.query;

      if (!productId || !materialId) {
        return ResponseHandler.error(res, '缺少必要参数', 'VALIDATION_ERROR', 400);
      }

      const BomExplosionService = require('../../../services/BomExplosionService');
      const result = await BomExplosionService.detectCircularReference(
        parseInt(productId),
        parseInt(materialId)
      );

      ResponseHandler.success(res, result, '检测完成');
    } catch (error) {
      logger.error('检测循环引用失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialSubBom(req, res) {
    try {
      const { materialId } = req.params;

      const BomExplosionService = require('../../../services/BomExplosionService');
      const result = await BomExplosionService.getMaterialSubBom(parseInt(materialId));

      if (!result) {
        return ResponseHandler.success(res, null, '该物料没有子BOM');
      }

      ResponseHandler.success(res, result, '获取子BOM成功');
    } catch (error) {
      logger.error('获取物料子BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async refreshBomCache(req, res) {
    try {
      const { id } = req.params;

      const BomExplosionService = require('../../../services/BomExplosionService');

      // 先使缓存失效
      await BomExplosionService.invalidateCache(parseInt(id));


      const bom = await bomService.getBomById(id);
      if (!bom) {
        return ResponseHandler.error(res, 'BOM不存在', 'NOT_FOUND', 404);
      }

      const result = await BomExplosionService.explodeBom(
        bom.product_id,
        parseInt(id),
        1,
        false // 不使用缓存，强制重新展开
      );

      ResponseHandler.success(
        res,
        {
          bom_id: parseInt(id),
          total_materials: result.length,
          max_level: result.length > 0 ? Math.max(...result.map((r) => r.level)) : 0,
        },
        'BOM缓存已刷新'
      );
    } catch (error) {
      logger.error('刷新BOM缓存失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async unapproveBom(req, res) {
    try {
      const { pool } = require('../../../config/db');
      const bomId = safeParseId(req.params.id);
      if (!Number.isInteger(bomId) || bomId <= 0) {
        return ResponseHandler.error(res, '无效的BOM ID', 'VALIDATION_ERROR', 400);
      }

      // 反审前获取产品ID用于后处理
      const [bomInfo] = await pool.query('SELECT product_id FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [bomId]);

      await pool.query(
        'UPDATE bom_masters SET status = 0, approved_at = NULL, approved_by = NULL WHERE id = ?',
        [bomId]
      );

      // 反审后触发关键后处理
      try {
        const BomExplosionService = require('../../../services/BomExplosionService');
        if (bomInfo.length > 0) {
          // 反审后该产品可能不再有已审核BOM，更新 has_sub_bom 标记
          await BomExplosionService.updateHasSubBomFlag(bomInfo[0].product_id);
          // 级联失效自身及所有祖先BOM的缓存
          await BomExplosionService.invalidateCache(bomId);
        }
      } catch (e) {
        await DLQService.recordSideEffectFailure(
          'BOM:unapprovePostProcess',
          { bomId },
          e
        );
      }

      ResponseHandler.success(res, null, 'BOM反审核成功');
    } catch (error) {
      logger.error('BOM反审核失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async getMaterialBom(req, res) {
    try {
      const materialId = safeParseId(req.params.materialId || req.params.id, 'materialId');

      // 查询该物料作为产品的BOM
      const { pool } = require('../../../config/db');
      const [results] = await pool.query(
        `
        SELECT
          b.id,
          b.version,
          CASE WHEN b.approved_by IS NOT NULL THEN 1 ELSE 0 END as is_approved,
          b.approved_by,
          b.approved_at,
          m.code as product_code,
          m.name as product_name
        FROM bom_masters b
        INNER JOIN materials m ON b.product_id = m.id
        WHERE b.product_id = ? AND b.deleted_at IS NULL
        ORDER BY b.version DESC
      `,
        [materialId]
      );

      ResponseHandler.success(res, results, '获取物料BOM成功');
    } catch (error) {
      if (error.statusCode === 400) {
        return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
      }
      logger.error('获取物料BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async getBomByProductId(req, res) {
    try {
      const { productId } = req.params;

      // 查询该产品的最新BOM
      const { pool } = require('../../../config/db');
      const [results] = await pool.query(
        `
        SELECT
          b.id,
          b.version,
          CASE WHEN b.approved_by IS NOT NULL THEN 1 ELSE 0 END as is_approved,
          b.approved_by,
          b.approved_at,
          m.code as product_code,
          m.name as product_name
        FROM bom_masters b
        INNER JOIN materials m ON b.product_id = m.id
        WHERE b.product_id = ? AND b.deleted_at IS NULL
        ORDER BY b.version DESC
        LIMIT 1
      `,
        [productId]
      );

      if (results.length === 0) {
        return ResponseHandler.error(res, '未找到该产品的BOM', 'NOT_FOUND', 404);
      }

      // 获取BOM详情
      const bom = await bomService.getBomById(results[0].id);

      ResponseHandler.success(res, bom, '获取产品BOM成功');
    } catch (error) {
      logger.error('根据产品ID获取BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

};

module.exports = bomController;
