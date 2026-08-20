/**
 * processController.js - 工序模板管理
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { mapKeysToSnake } = require('../../../utils/fieldMap');

const processTemplateService = require('../../../services/processTemplateService');

const processController = {

  async getAllProcessTemplates(req, res) {
    try {
      const { page = 1, pageSize = 10, name, status } = req.query;
      const result = await processTemplateService.getAll(page, pageSize, { name, status });
      ResponseHandler.paginated(
        res,
        result.list,
        result.total,
        result.page,
        result.pageSize,
        '获取工序模板列表成功'
      );
    } catch (error) {
      logger.error('获取工序模板列表失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getProcessTemplateById(req, res) {
    try {
      const template = await processTemplateService.getById(req.params.id);
      if (!template) {
        return ResponseHandler.error(res, '工序模板不存在', 'NOT_FOUND', 404);
      }
      ResponseHandler.success(res, template, '获取工序模板详情成功');
    } catch (error) {
      logger.error('获取工序模板详情失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async createProcessTemplate(req, res) {
    try {
      const body = mapKeysToSnake(req.body || {});
      const { name } = body;
      if (!name) {
        return ResponseHandler.error(res, '模板名称不能为空', 'VALIDATION_ERROR', 400);
      }
      const result = await processTemplateService.create({
        ...body,
        created_by: req.user?.id || req.user?.userId || null,
      });
      ResponseHandler.success(res, result, '创建工序模板成功', 201);
    } catch (error) {
      logger.error('创建工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateProcessTemplate(req, res) {
    try {
      await processTemplateService.update(req.params.id, {
        ...mapKeysToSnake(req.body || {}),
        updated_by: req.user?.id || req.user?.userId || null,
      });
      ResponseHandler.success(res, null, '更新工序模板成功');
    } catch (error) {
      logger.error('更新工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async deleteProcessTemplate(req, res) {
    try {
      await processTemplateService.delete(req.params.id);
      ResponseHandler.success(res, null, '删除工序模板成功', 204);
    } catch (error) {
      logger.error('删除工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportProcessTemplates(req, res) {
    try {
      const ImportExportService = require('../../../services/importExportService');
      const workbook = await ImportExportService.exportProcessTemplates(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=process_templates_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateProcessTemplateStatus(req, res) {
    try {
      await processTemplateService.updateStatus(req.params.id, req.body.status);
      ResponseHandler.success(res, null, '更新工序模板状态成功');
    } catch (error) {
      logger.error('更新工序模板状态失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async getProcessTemplateByProductId(req, res) {
    try {
      const template = await processTemplateService.getByProductId(req.params.id);
      ResponseHandler.success(res, template, template ? '获取产品工序模板成功' : '该产品暂无作业指导书');
    } catch (error) {
      logger.error('获取产品工序模板失败:', error);
      ResponseHandler.error(res, '该产品暂无作业指导书', 'SERVER_ERROR', 500, error);
    }
  },

};

module.exports = processController;
