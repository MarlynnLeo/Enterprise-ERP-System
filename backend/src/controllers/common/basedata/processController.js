/**
 * processController.js - 产品工艺路线管理
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { mapKeysToSnake } = require('../../../utils/fieldMap');

const processTemplateService = require('../../../services/processTemplateService');
const BusinessError = require('../../../utils/BusinessError');

const processController = {
  async getProcessMaterialOptions(req, res) {
    try {
      ResponseHandler.success(res, await processTemplateService.getMaterialOptions(req.query));
    } catch (error) {
      BusinessError.handleError(res, error, '获取工艺物料选项失败', ResponseHandler);
    }
  },

  async getAllProcessTemplates(req, res) {
    try {
      const { page = 1, pageSize = 10, name, status, productId } = req.query;
      const result = await processTemplateService.getAll(page, pageSize, { name, status, productId });
      ResponseHandler.paginated(
        res,
        result.list,
        result.total,
        result.page,
        result.pageSize,
        '获取产品工艺路线列表成功'
      );
    } catch (error) {
      logger.error('获取产品工艺路线列表失败:', error);
      BusinessError.handleError(res, error, '产品工艺操作失败', ResponseHandler);
    }
  },

  async getProcessTemplateById(req, res) {
    try {
      const template = await processTemplateService.getById(req.params.id);
      if (!template) {
        return ResponseHandler.error(res, '产品工艺路线不存在', 'NOT_FOUND', 404);
      }
      ResponseHandler.success(res, template, '获取产品工艺路线详情成功');
    } catch (error) {
      logger.error('获取产品工艺路线详情失败:', error);
      BusinessError.handleError(res, error, '产品工艺操作失败', ResponseHandler);
    }
  },

  async createProcessTemplate(req, res) {
    try {
      const body = mapKeysToSnake(req.body || {});
      const { name } = body;
      if (!name) {
        return ResponseHandler.error(res, '工艺名称不能为空', 'VALIDATION_ERROR', 400);
      }
      const result = await processTemplateService.create({
        ...body,
        created_by: req.user?.id || req.user?.userId || null,
      });
      ResponseHandler.success(res, result, '创建产品工艺路线成功', 201);
    } catch (error) {
      logger.error('创建产品工艺路线失败:', error);
      BusinessError.handleError(res, error, '产品工艺操作失败', ResponseHandler);
    }
  },

  async updateProcessTemplate(req, res) {
    try {
      const updated = await processTemplateService.update(req.params.id, {
        ...mapKeysToSnake(req.body || {}),
        updated_by: req.user?.id || req.user?.userId || null,
      });
      ResponseHandler.success(res, updated, '更新产品工艺路线成功');
    } catch (error) {
      logger.error('更新产品工艺路线失败:', error);
      BusinessError.handleError(res, error, '产品工艺操作失败', ResponseHandler);
    }
  },

  async deleteProcessTemplate(req, res) {
    try {
      await processTemplateService.delete(req.params.id);
      ResponseHandler.success(res, null, '删除产品工艺路线成功', 204);
    } catch (error) {
      logger.error('删除产品工艺路线失败:', error);
      BusinessError.handleError(res, error, '产品工艺操作失败', ResponseHandler);
    }
  },

  async exportProcessTemplates(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportProcessTemplates({ ...req.query, ...req.body });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=product_process_routes_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出产品工艺路线失败:', error);
      BusinessError.handleError(res, error, '产品工艺操作失败', ResponseHandler);
    }
  },

  async updateProcessTemplateStatus(req, res) {
    try {
      const updated = await processTemplateService.updateStatus(req.params.id, req.body.status);
      ResponseHandler.success(res, updated, '更新产品工艺路线状态成功');
    } catch (error) {
      logger.error('更新产品工艺路线状态失败', error);
      BusinessError.handleError(res, error, '产品工艺操作失败', ResponseHandler);
    }
  },


  async getProcessTemplateByProductId(req, res) {
    try {
      const template = await processTemplateService.getByProductId(req.params.id);
      ResponseHandler.success(res, template, template ? '获取产品工艺路线成功' : '该产品暂无生效工艺');
    } catch (error) {
      logger.error('获取产品工艺路线失败:', error);
      BusinessError.handleError(res, error, '获取产品工艺路线失败', ResponseHandler);
    }
  },

};

module.exports = processController;
