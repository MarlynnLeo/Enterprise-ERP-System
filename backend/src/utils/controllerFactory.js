/**
 * controllerFactory.js
 * @description Controller工厂函数 - 创建标准的CRUD Controller
 * @date 2025-11-24
 * @version 1.0.0
 * @purpose 减少重复代码，统一CRUD操作
 */

const { ResponseHandler } = require('./responseHandler');
const { logger } = require('./logger');

/**
 * 创建标准的CRUD Controller
 * @param {Object} service - Service实例
 * @param {String} resourceName - 资源名称（如"物料"、"客户"、"分类"）
 * @param {Object} options - 可选配置
 * @param {Boolean} options.usePaginated - 是否使用分页响应（默认true）
 * @param {Boolean} options.checkExists - 是否检查资源存在（默认true）
 * @param {String} options.notFoundMessage - 自定义不存在消息
 * @returns {Object} - Controller对象，包含标准CRUD方法
 */
function createCrudController(service, resourceName, options = {}) {
  const { usePaginated = true, checkExists = true, notFoundMessage = null } = options;

  return {
    /**
     * 获取资源列表
     * 支持分页和过滤
     */
    async getAll(req, res) {
      try {
        const { page = 1, pageSize, limit, ...filters } = req.query;
        const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
        const requestedPageSize = parseInt(pageSize || limit, 10) || 10;
        const normalizedPageSize = Math.min(Math.max(requestedPageSize, 1), 100);
        const result = await service.getAll(normalizedPage, normalizedPageSize, filters);

        if (usePaginated && result.total !== undefined) {
          // 使用分页响应
          ResponseHandler.paginated(
            res,
            result.items || result.data || result.list || result,
            result.total,
            result.page || normalizedPage,
            result.pageSize || normalizedPageSize,
            `获取${resourceName}列表成功`
          );
        } else {
          // 使用普通响应
          ResponseHandler.success(res, result, `获取${resourceName}列表成功`);
        }
      } catch (error) {
        logger.error(`获取${resourceName}列表失败:`, error);
        ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
      }
    },

    /**
     * 根据ID获取单个资源
     */
    async getById(req, res) {
      try {
        const item = await service.getById(req.params.id);

        if (checkExists && !item) {
          const message = notFoundMessage || `${resourceName}不存在`;
          return ResponseHandler.error(res, message, 'NOT_FOUND', 404);
        }

        ResponseHandler.success(res, item, `获取${resourceName}详情成功`);
      } catch (error) {
        logger.error(`获取${resourceName}详情失败:`, error);
        ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
      }
    },

    /**
     * 创建新资源
     */
    async create(req, res) {
      try {
        const newItem = await service.create(req.body);
        ResponseHandler.success(res, newItem, `创建${resourceName}成功`, 201);
      } catch (error) {
        logger.error(`创建${resourceName}失败:`, error);
        ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
      }
    },

    /**
     * 更新资源
     */
    async update(req, res) {
      try {
        const updatedItem = await service.update(req.params.id, req.body);
        ResponseHandler.success(res, updatedItem, `更新${resourceName}成功`);
      } catch (error) {
        logger.error(`更新${resourceName}失败:`, error);
        ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
      }
    },

    /**
     * 删除资源
     */
    async delete(req, res) {
      try {
        await service.delete(req.params.id);
        ResponseHandler.success(res, null, `删除${resourceName}成功`, 204);
      } catch (error) {
        logger.error(`删除${resourceName}失败:`, error);
        ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
      }
    },
  };
}

/**
 * 扩展Controller - 为基础CRUD添加额外方法
 * @param {Object} baseController - 基础Controller
 * @param {Object} customMethods - 自定义方法对象
 * @returns {Object} - 扩展后的Controller
 */
function extendController(baseController, customMethods = {}) {
  return {
    ...baseController,
    ...customMethods,
  };
}

module.exports = {
  createCrudController,
  extendController,
};
