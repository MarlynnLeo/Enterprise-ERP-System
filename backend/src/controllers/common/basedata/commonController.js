/**
 * commonController.js - 通用功能（分类/单位/库位/文件等）
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { createCrudController } = require('../../../utils/controllerFactory');
const { mapKeysToSnake } = require('../../../utils/fieldMap');
const FileAccessService = require('../../../services/FileAccessService');

const path = require('path');
const fs = require('fs');
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
    let fileUrl = null;
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '没有上传文件', 'VALIDATION_ERROR', 400);
      }
      fileUrl = `/uploads/${req.file.filename}`;
      const body = mapKeysToSnake(req.body || {});
      const binding = FileAccessService.validateBusinessBinding(
        body.business_type,
        body.business_id
      );
      if (!binding.valid) {
        FileAccessService.removeLocalFile(fileUrl);
        return ResponseHandler.error(
          res,
          '业务类型和业务 ID 必须成对提供，且业务类型必须受支持',
          'VALIDATION_ERROR',
          400
        );
      }
      if (
        binding.bound &&
        !(await FileAccessService.assertBusinessObjectAccess(
          req,
          binding.businessType,
          binding.businessId,
          'write'
        ))
      ) {
        FileAccessService.removeLocalFile(fileUrl);
        return ResponseHandler.forbidden(res, '无权向该业务对象上传文件');
      }
      await FileAccessService.safeRecordUpload({
        fileUrl,
        businessType: binding.businessType,
        businessId: binding.businessId,
        source: 'baseData',
        uploadedBy: req.user?.id || req.user?.userId || null,
        isPublic: FileAccessService.normalizePublicFlag(body.is_public, req.userPermissions),
        metadata: {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      });
      ResponseHandler.success(res, { fileUrl, filename: req.file.filename }, '上传成功');
    } catch (error) {
      if (fileUrl) FileAccessService.removeLocalFile(fileUrl);
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

      const normalizedPath = FileAccessService.normalizeUploadUrl(filePath);
      if (!normalizedPath) {
        return ResponseHandler.error(res, '文件路径无效', 'VALIDATION_ERROR', 400);
      }

      const decision = await FileAccessService.authorize({
        userId: req.user?.id || req.user?.userId,
        fileUrl: normalizedPath,
        req,
        userPermissions: req.userPermissions,
      });
      if (!decision.known || !decision.allowed) {
        return ResponseHandler.forbidden(res, '无权下载该文件');
      }

      // Resolve the complete controlled upload path; basename-only lookup is
      // deliberately avoided because it can select an unrelated file.
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      const relativePath = normalizedPath.slice('/uploads/'.length);
      const absolutePath = path.resolve(uploadsDir, relativePath);

      if (!absolutePath.startsWith(uploadsDir + path.sep)) {
        logger.warn('检测到路径穿越尝试', { filePath });
        return ResponseHandler.error(res, '文件路径无效', 'VALIDATION_ERROR', 400);
      }
      if (!fs.existsSync(absolutePath)) {
        return ResponseHandler.error(res, '文件不存在', 'NOT_FOUND', 404);
      }

      return res.download(absolutePath, path.basename(absolutePath), (error) => {
        if (error && !res.headersSent) {
          ResponseHandler.error(res, '文件下载失败', 'SERVER_ERROR', 500, error);
        }
      });
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
