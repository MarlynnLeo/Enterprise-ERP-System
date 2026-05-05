/**
 * printController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const printModel = require('../../models/printModel');
const { getCurrentUserName } = require('../../utils/userHelper');


// 打印控制器
const printController = {
  // 打印设置管理
  async getAllPrintSettings(req, res) {
    try {
      const { page = 1, limit = 10, ...filters } = req.query;
      const result = await printModel.getAllPrintSettings(parseInt(page), parseInt(limit), filters);

      ResponseHandler.paginated(res, result.list, result.total, parseInt(page), parseInt(limit), '获取打印设置列表成功');
    } catch (error) {
      logger.error('获取打印设置列表失败:', error);
      ResponseHandler.error(res, '获取打印设置列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getPrintSettingById(req, res) {
    try {
      const { id } = req.params;
      const printSetting = await printModel.getPrintSettingById(id);

      if (!printSetting) {
        return res.status(404).json({
          code: 404,
          message: '打印设置不存在',
        });
      }

      ResponseHandler.success(res, printSetting, '获取打印设置成功');
    } catch (error) {
      logger.error('获取打印设置失败:', error);
      ResponseHandler.error(res, '获取打印设置失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createPrintSetting(req, res) {
    try {
      const data = req.body;

      // 添加创建人信息
      data.created_by = await getCurrentUserName(req);

      const result = await printModel.createPrintSetting(data);

      ResponseHandler.success(
        res,
        {
          code: 201,
          data: result,
          message: '创建打印设置成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建打印设置失败:', error);
      ResponseHandler.error(res, '创建打印设置失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updatePrintSetting(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      // 添加更新人信息
      data.updated_by = await getCurrentUserName(req);

      const success = await printModel.updatePrintSetting(id, data);

      if (!success) {
        return res.status(404).json({
          code: 404,
          message: '打印设置不存在或更新失败',
        });
      }

      ResponseHandler.success(res, null, '更新打印设置成功');
    } catch (error) {
      logger.error('更新打印设置失败:', error);
      ResponseHandler.error(res, '更新打印设置失败', 'SERVER_ERROR', 500, error);
    }
  },

  async deletePrintSetting(req, res) {
    try {
      const { id } = req.params;
      const success = await printModel.deletePrintSetting(id);

      if (!success) {
        return res.status(404).json({
          code: 404,
          message: '打印设置不存在或删除失败',
        });
      }

      ResponseHandler.success(res, null, '删除打印设置成功');
    } catch (error) {
      logger.error('删除打印设置失败:', error);
      ResponseHandler.error(res, '删除打印设置失败', 'SERVER_ERROR', 500, error);
    }
  },

  // 打印模板管理
  async getAllPrintTemplates(req, res) {
    try {
      const { page = 1, limit = 10, ...filters } = req.query;
      const result = await printModel.getAllPrintTemplates(page, limit, filters);

      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize, '获取打印模板列表成功');
    } catch (error) {
      logger.error('获取打印模板列表失败:', error);
      ResponseHandler.error(res, '获取打印模板列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getPrintTemplateById(req, res) {
    try {
      const { id } = req.params;
      const printTemplate = await printModel.getPrintTemplateById(id);

      if (!printTemplate) {
        return res.status(404).json({
          code: 404,
          message: '打印模板不存在',
        });
      }

      ResponseHandler.success(res, printTemplate, '获取打印模板成功');
    } catch (error) {
      logger.error('获取打印模板失败:', error);
      ResponseHandler.error(res, '获取打印模板失败', 'SERVER_ERROR', 500, error);
    }
  },

  async getDefaultTemplateByType(req, res) {
    try {
      const { module, template_type } = req.query;

      if (!module || !template_type) {
        return res.status(400).json({
          code: 400,
          message: '缺少必要参数：module 和 template_type',
        });
      }

      const template = await printModel.getDefaultTemplateByType(module, template_type);

      if (!template) {
        return res.status(404).json({
          code: 404,
          message: '未找到默认打印模板',
        });
      }

      ResponseHandler.success(res, template, '获取默认打印模板成功');
    } catch (error) {
      logger.error('获取默认打印模板失败:', error);
      ResponseHandler.error(res, '获取默认打印模板失败', 'SERVER_ERROR', 500, error);
    }
  },

  async createPrintTemplate(req, res) {
    try {
      const data = req.body;

      // 添加创建人信息
      data.created_by = await getCurrentUserName(req);

      const result = await printModel.createPrintTemplate(data);

      ResponseHandler.success(
        res,
        {
          code: 201,
          data: result,
          message: '创建打印模板成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建打印模板失败:', error);
      ResponseHandler.error(res, '创建打印模板失败', 'SERVER_ERROR', 500, error);
    }
  },

  async updatePrintTemplate(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      // 添加更新时间
      data.updated_at = new Date();

      // 添加更新人信息
      data.updated_by = await getCurrentUserName(req);

      const success = await printModel.updatePrintTemplate(id, data);

      if (!success) {
        return res.status(404).json({
          code: 404,
          message: '打印模板不存在或更新失败',
        });
      }

      ResponseHandler.success(res, null, '更新打印模板成功');
    } catch (error) {
      logger.error('更新打印模板失败:', error);
      // 检查响应是否已发送
      if (!res.headersSent) {
        ResponseHandler.error(res, '更新打印模板失败', 'SERVER_ERROR', 500, error);
      }
    }
  },

  async deletePrintTemplate(req, res) {
    try {
      const { id } = req.params;
      const success = await printModel.deletePrintTemplate(id);

      if (!success) {
        return res.status(404).json({
          code: 404,
          message: '打印模板不存在或删除失败',
        });
      }

      ResponseHandler.success(res, null, '删除打印模板成功');
    } catch (error) {
      logger.error('删除打印模板失败:', error);
      ResponseHandler.error(res, '删除打印模板失败', 'SERVER_ERROR', 500, error);
    }
  },

  // 上传公司Logo
  async uploadLogo(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          code: 400,
          message: '没有上传文件',
        });
      }

      // 获取上传的文件信息
      const { filename } = req.file;

      // 返回文件路径
      ResponseHandler.success(res, { filename, path: `/uploads/logos/${filename}` }, '上传成功');
    } catch (error) {
      logger.error('上传Logo失败:', error);
      ResponseHandler.error(res, '上传Logo失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = printController;
