/**
 * supplierCustomerController.js - 供应商和客户管理
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { createCrudController } = require('../../../utils/controllerFactory');
const { pool } = require('../../../config/db');

const supplierService = require('../../../services/supplierService');
const SupplierMetalRangePriceService = require('../../../services/business/SupplierMetalRangePriceService');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const customerService = require('../../../services/customerService');

// camelOut：列表/详情/写操作统一 HTTP camel ↔ DB snake
const baseSupplierController = createCrudController(supplierService, '供应商', { camelOut: true });
const baseCustomerController = createCrudController(customerService, '客户', { camelOut: true });

const supplierCustomerController = {
  getAllSuppliers: baseSupplierController.getAll,
  getSupplierById: baseSupplierController.getById,
  createSupplier: baseSupplierController.create,
  updateSupplier: baseSupplierController.update,
  deleteSupplier: baseSupplierController.delete,
  getAllCustomers: baseCustomerController.getAll,
  getCustomerById: baseCustomerController.getById,
  createCustomer: baseCustomerController.create,
  updateCustomer: baseCustomerController.update,
  deleteCustomer: baseCustomerController.delete,

  async downloadSupplierTemplate(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.downloadSupplierTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=supplier_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载供应商模板失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importSuppliers(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'VALIDATION_ERROR', 400);
      }

      const ImportExportService = require('../../../services/importExportService');
      const result = await ImportExportService.importSuppliers(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入供应商失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportSuppliers(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportSuppliers(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=suppliers_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出供应商失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getCustomerStats(req, res) {
    try {
      const stats = await customerService.getCustomerStats();
      ResponseHandler.success(res, stats, '获取客户统计成功');
    } catch (error) {
      logger.error('获取客户统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportCustomers(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportCustomers(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=customers_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出客户失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadCustomerTemplate(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.downloadCustomerTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=customer_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载客户模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importCustomers(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'VALIDATION_ERROR', 400);
      }

      const ImportExportService = require('../../../services/importExportService');
      const result = await ImportExportService.importCustomers(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入客户失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async listSupplierMetalPriceSchemes(req, res) {
    try {
      const schemes = await SupplierMetalRangePriceService.listSchemes(req.params.id, {
        metalSymbol: req.query.metal_symbol || req.query.metalSymbol,
        enabledOnly: String(req.query.enabled_only || '').toLowerCase() === 'true',
      });
      return ResponseHandler.success(res, schemes, '获取供应商区间报价方案成功');
    } catch (error) {
      logger.error('获取供应商区间报价方案失败:', error);
      return ResponseHandler.error(res, error.message || '获取供应商区间报价方案失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getSupplierMetalPriceScheme(req, res) {
    try {
      const scheme = await SupplierMetalRangePriceService.getSchemeById(req.params.schemeId);
      if (!scheme || Number(scheme.supplier_id) !== Number(req.params.id)) {
        return ResponseHandler.notFound(res, '区间报价方案不存在');
      }
      return ResponseHandler.success(res, scheme, '获取供应商区间报价详情成功');
    } catch (error) {
      logger.error('获取供应商区间报价详情失败:', error);
      return ResponseHandler.error(res, error.message || '获取供应商区间报价详情失败', 'SERVER_ERROR', 500, error);
    }
  },

  async saveSupplierMetalPriceScheme(req, res) {
    try {
      const actorId = getAuthenticatedUserId(req);
      const scheme = await SupplierMetalRangePriceService.saveScheme(
        req.params.id,
        { ...req.body, id: req.params.schemeId || req.body.id },
        actorId
      );
      return ResponseHandler.success(res, scheme, '保存供应商区间报价成功');
    } catch (error) {
      logger.error('保存供应商区间报价失败:', error);
      return ResponseHandler.error(res, error.message || '保存供应商区间报价失败', 'VALIDATION_ERROR', 400, error);
    }
  },

  async deleteSupplierMetalPriceScheme(req, res) {
    try {
      const deleted = await SupplierMetalRangePriceService.deleteScheme(req.params.id, req.params.schemeId);
      if (!deleted) {
        return ResponseHandler.notFound(res, '区间报价方案不存在');
      }
      return ResponseHandler.success(res, true, '删除供应商区间报价成功');
    } catch (error) {
      logger.error('删除供应商区间报价失败:', error);
      return ResponseHandler.error(res, error.message || '删除供应商区间报价失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getSupplierOptions(req, res) {
    try {
      const keyword = String(req.query.search || req.query.keyword || req.query.name || '').trim();
      const requestedLimit = parseInt(req.query.limit || req.query.pageSize, 10);
      
      let query = 'SELECT id, code, name, contact_person, contact_phone FROM suppliers WHERE deleted_at IS NULL AND status = 1';
      const params = [];

      if (keyword) {
        query += ' AND (code LIKE ? OR name LIKE ? OR contact_person LIKE ?)';
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
      }

      query += ' ORDER BY name, code';

      if (!isNaN(requestedLimit) && requestedLimit > 0) {
        const safeLimit = Math.min(requestedLimit, 1000);
        query += ` LIMIT ${safeLimit}`;
      } else if (!keyword) {
        // 未传 limit 且无搜索关键字时，默认返回全部活跃供应商（上限1000）
        query += ' LIMIT 1000';
      } else {
        query += ' LIMIT 200';
      }

      const [rows] = await pool.query(query, params);
      const options = rows.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        contactPerson: s.contact_person,
        contactPhone: s.contact_phone,
      }));
      ResponseHandler.success(res, options, '获取供应商选项成功');
    } catch (error) {
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

};

module.exports = supplierCustomerController;
