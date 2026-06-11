/**
 * commonController.js - 通用功能（分类/单位/库位/文件等）
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { createCrudController } = require('../../../utils/controllerFactory');
const FileAccessService = require('../../../services/FileAccessService');

const path = require('path');
const categoryService = require('../../../services/categoryService');
const unitService = require('../../../services/unitService');
const locationService = require('../../../services/locationService');
const materialSourceService = require('../../../services/materialSourceService');
const inspectionMethodService = require('../../../services/inspectionMethodService');

const baseCategoryController = createCrudController(categoryService, '分类', { usePaginated: false });
const baseUnitController = createCrudController(unitService, '单位');
const baseLocationController = createCrudController(locationService, '库位');
const baseMaterialSourceController = createCrudController(materialSourceService, '物料来源');
const baseInspectionMethodController = createCrudController(inspectionMethodService, '检验方式');

const commonController = {
  getAllCategories: baseCategoryController.getAll,
  getCategoryById: baseCategoryController.getById,
  createCategory: baseCategoryController.create,
  updateCategory: baseCategoryController.update,
  deleteCategory: baseCategoryController.delete,
  getAllUnits: baseUnitController.getAll,
  getUnitById: baseUnitController.getById,
  createUnit: baseUnitController.create,
  updateUnit: baseUnitController.update,
  deleteUnit: baseUnitController.delete,
  getAllLocations: baseLocationController.getAll,
  getLocationById: baseLocationController.getById,
  createLocation: baseLocationController.create,
  updateLocation: baseLocationController.update,
  deleteLocation: baseLocationController.delete,
  getAllMaterialSources: baseMaterialSourceController.getAll,
  getMaterialSourceById: baseMaterialSourceController.getById,
  createMaterialSource: baseMaterialSourceController.create,
  updateMaterialSource: baseMaterialSourceController.update,
  deleteMaterialSource: baseMaterialSourceController.delete,
  getAllInspectionMethods: baseInspectionMethodController.getAll,
  getInspectionMethodById: baseInspectionMethodController.getById,
  createInspectionMethod: baseInspectionMethodController.create,
  updateInspectionMethod: baseInspectionMethodController.update,
  deleteInspectionMethod: baseInspectionMethodController.delete,

  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '没有上传文件', 'VALIDATION_ERROR', 400);
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      await FileAccessService.safeRecordUpload({
        fileUrl,
        businessType: req.body.business_type || req.body.businessType,
        businessId: req.body.business_id || req.body.businessId,
        source: 'baseData',
        uploadedBy: req.user?.id || req.user?.userId || null,
        isPublic: req.body.is_public || req.body.isPublic,
        metadata: {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      });
      ResponseHandler.success(res, { fileUrl, filename: req.file.filename }, '上传成功');
    } catch (error) {
      logger.error('文件上传失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadFile(req, res) {
    try {
      const { filePath } = req.query;
      if (!filePath) {
        return ResponseHandler.error(res, '文件路径不能为空', 'VALIDATION_ERROR', 400);
      }

      // 安全：只允许从uploads目录下载
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      const absolutePath = path.resolve(uploadsDir, path.basename(filePath));

      // 验证解析后的路径是否仍在uploads目录
      if (!absolutePath.startsWith(uploadsDir + path.sep)) {
        logger.warn('检测到路径穿越尝试:', { filePath, resolvedPath: absolutePath });
        return ResponseHandler.error(res, '文件路径无效', 'VALIDATION_ERROR', 400);
      }

      res.download(absolutePath);
    } catch (error) {
      logger.error('文件下载失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadCategoryTemplate(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.downloadCategoryTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=category_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载分类模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportCategories(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportCategories(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=categories_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出分类失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importCategories(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'VALIDATION_ERROR', 400);
      }

      const ImportExportService = require('../../../services/importExportService');
      const result = await ImportExportService.importCategories(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入分类失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importCategoriesJson(req, res) {
    try {
      if (!req.body || !Array.isArray(req.body)) {
        return ResponseHandler.error(res, '无效的数据格式', 'VALIDATION_ERROR', 400);
      }

      const successList = [];
      const errorList = [];

      for (let i = 0; i < req.body.length; i++) {
        const categoryData = req.body[i];
        try {
          await categoryService.createCategory(categoryData);
          successList.push({ index: i, code: categoryData.code });
        } catch (error) {
          errorList.push({ index: i, code: categoryData.code, error: error.message });
        }
      }

      ResponseHandler.success(
        res,
        {
          total: req.body.length,
          success: successList.length,
          failed: errorList.length,
          successList,
          errorList,
        },
        `导入完成，成功${successList.length}条，失败${errorList.length}条`
      );
    } catch (error) {
      logger.error('导入分类JSON失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getUnitStats(req, res) {
    try {
      const stats = await unitService.getUnitStats();
      ResponseHandler.success(res, stats, '获取单位统计成功');
    } catch (error) {
      logger.error('获取单位统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportUnits(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportUnits(req.body);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=units_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出单位失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportLocations(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportLocations(req.body);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=locations_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出库位失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getWarehouses(req, res) {
    try {
      const result = await locationService.getWarehouses();
      ResponseHandler.success(res, result, '获取仓库列表成功');
    } catch (error) {
      logger.error('获取仓库列表失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialSourceStatistics(req, res) {
    try {
      const stats = await materialSourceService.getStatistics();
      ResponseHandler.success(res, stats, '获取物料来源统计成功');
    } catch (error) {
      logger.error('获取物料来源统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

};

module.exports = commonController;
