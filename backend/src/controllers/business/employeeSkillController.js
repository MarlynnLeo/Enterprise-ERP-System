/**
 * 员工技能矩阵控制器
 */
const EmployeeSkillService = require('../../services/business/EmployeeSkillService');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

module.exports = {
  async getList(req, res) {
    try {
      const result = await EmployeeSkillService.getList(req.query);
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize);
    } catch (error) {
      logger.error('获取技能列表失败:', error);
      ResponseHandler.error(res, '获取技能列表失败');
    }
  },

  async getById(req, res) {
    try {
      const data = await EmployeeSkillService.getById(req.params.id);
      if (!data) return ResponseHandler.notFound(res, '技能记录不存在');
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取技能详情失败:', error);
      ResponseHandler.error(res, '获取详情失败');
    }
  },

  async create(req, res) {
    try {
      const data = await EmployeeSkillService.create(req.body);
      ResponseHandler.success(res, data, '创建成功');
    } catch (error) {
      logger.error('创建技能失败:', error);
      const isDuplicate = error.message?.includes('Duplicate');
      ResponseHandler.error(res, isDuplicate ? '该员工已有同名技能记录' : '创建失败', isDuplicate ? 'VALIDATION_ERROR' : undefined, isDuplicate ? 400 : 500);
    }
  },

  async update(req, res) {
    try {
      const data = await EmployeeSkillService.update(req.params.id, req.body);
      if (!data) return ResponseHandler.notFound(res, '技能记录不存在');
      ResponseHandler.success(res, data, '更新成功');
    } catch (error) {
      logger.error('更新技能失败:', error);
      ResponseHandler.error(res, '更新失败');
    }
  },

  async delete(req, res) {
    try {
      await EmployeeSkillService.delete(req.params.id);
      ResponseHandler.success(res, null, '删除成功');
    } catch (error) {
      logger.error('删除技能失败:', error);
      ResponseHandler.error(res, '删除失败');
    }
  },

  async getMatrix(req, res) {
    try {
      const data = await EmployeeSkillService.getMatrix(req.query);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取技能矩阵失败:', error);
      ResponseHandler.error(res, '获取矩阵失败');
    }
  },

  async getCategories(req, res) {
    try {
      const categories = await EmployeeSkillService.getCategories();
      ResponseHandler.success(res, categories);
    } catch (error) {
      logger.error('获取技能类别失败:', error);
      ResponseHandler.error(res, '获取类别失败');
    }
  },

  async getExpiring(req, res) {
    try {
      const data = await EmployeeSkillService.getExpiringSkills(Number(req.query.days) || 30);
      ResponseHandler.success(res, data);
    } catch (error) {
      logger.error('获取到期技能失败:', error);
      ResponseHandler.error(res, '获取失败');
    }
  },
};
