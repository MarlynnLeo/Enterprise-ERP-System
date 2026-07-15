/**
 * controllerFactory.js
 * @description Controller工厂函数 - 创建标准的CRUD Controller
 * @date 2025-11-24
 * @version 1.1.0
 * @purpose 减少重复代码，统一CRUD操作
 */

const { ResponseHandler } = require('./responseHandler');

/**
 * 异步 Controller 方法包装器
 * 自动捕获异步错误并交给 Express 错误处理中间件（unifiedErrorHandler）
 *
 * 使用方式：
 *   router.get('/items', asyncHandler(async (req, res) => {
 *     const data = await service.getAll();
 *     ResponseHandler.success(res, data);
 *   }));
 *
 * @param {Function} fn - 异步 Controller 方法 (req, res, next) => Promise
 * @returns {Function} Express 中间件
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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
    getAll: asyncHandler(async (req, res) => {
      const { page = 1, pageSize, limit, ...filters } = req.query;
      const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
      // 允许 all/0 表示不分页（用于下拉全量选项）
      const rawSize = pageSize ?? limit;
      const wantAll = rawSize === 'all' || rawSize === '0' || rawSize === 0;
      const requestedPageSize = wantAll ? null : (parseInt(rawSize, 10) || 10);
      const normalizedPageSize = wantAll
        ? null
        : Math.min(Math.max(requestedPageSize, 1), 500);
      const result = await service.getAll(normalizedPage, normalizedPageSize, filters);

      if (usePaginated && result.total !== undefined) {
        ResponseHandler.paginated(
          res,
          result.items || result.data || result.list || result,
          result.total,
          result.page || normalizedPage,
          result.pageSize || normalizedPageSize,
          `获取${resourceName}列表成功`
        );
      } else {
        ResponseHandler.success(res, result, `获取${resourceName}列表成功`);
      }
    }),

    /**
     * 根据ID获取单个资源
     */
    getById: asyncHandler(async (req, res) => {
      const item = await service.getById(req.params.id);

      if (checkExists && !item) {
        const message = notFoundMessage || `${resourceName}不存在`;
        return ResponseHandler.error(res, message, 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, item, `获取${resourceName}详情成功`);
    }),

    /**
     * 创建新资源
     */
    create: asyncHandler(async (req, res) => {
      const newItem = await service.create(req.body);
      ResponseHandler.success(res, newItem, `创建${resourceName}成功`, 201);
    }),

    /**
     * 更新资源
     */
    update: asyncHandler(async (req, res) => {
      const updatedItem = await service.update(req.params.id, req.body);
      ResponseHandler.success(res, updatedItem, `更新${resourceName}成功`);
    }),

    /**
     * 删除资源
     */
    delete: asyncHandler(async (req, res) => {
      await service.delete(req.params.id);
      ResponseHandler.success(res, null, `删除${resourceName}成功`, 204);
    }),
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
  asyncHandler,
  createCrudController,
  extendController,
};
