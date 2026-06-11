/**
 * supplierCustomerController.js - 供应商和客户管理
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { createCrudController } = require('../../../utils/controllerFactory');

const supplierService = require('../../../services/supplierService');
const customerService = require('../../../services/customerService');

const baseSupplierController = createCrudController(supplierService, '供应商');
const baseCustomerController = createCrudController(customerService, '客户');

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

  async getSupplierOptions(req, res) {
    try {

      const pageSize = Math.min(Math.max(parseInt(req.query.limit || req.query.pageSize, 10) || 50, 1), 100);
      const keyword = req.query.search || req.query.keyword || req.query.name || '';
      const result = await supplierService.getAllSuppliers(1, pageSize, {
        status: 1,
        keyword,
      });
      const options = result.list.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
      }));
      ResponseHandler.success(res, options, '获取供应商选项成功');
    } catch (error) {
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

};

module.exports = supplierCustomerController;
