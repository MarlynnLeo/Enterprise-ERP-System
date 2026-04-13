/**
 * productCategoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const productCategoryModel = require('../../models/productCategory');

/**
 * 产品大类控制器
 */
const productCategoryController = {
  /**
   * 获取所有产品大类
   */
  async getAllProductCategories(req, res) {
    try {
      const filters = {
        name: req.query.name,
        code: req.query.code,
        status: req.query.status !== undefined ? parseInt(req.query.status, 10) || 1 : undefined,
      };

      // 添加分页参数 - 支持 pageSize 和 limit 两种参数名
      const page = parseInt(req.query.page, 10) || 1;
      const pageSize = parseInt(req.query.pageSize, 10) || parseInt(req.query.limit, 10) || 20;

      const result = await productCategoryModel.getAllProductCategories(filters, page, pageSize);

      // 返回统一的分页格式
      res.json({
        success: true,
        data: {
          list: result.data,
          total: result.total,
          page: page,
          pageSize: pageSize,
          totalPages: Math.ceil(result.total / pageSize),
        },
        message: '获取产品大类列表成功',
      });
    } catch (error) {
      logger.error('获取产品大类列表失败:', error);
      ResponseHandler.error(res, '获取产品大类列表失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 根据ID获取产品大类
   */
  async getProductCategoryById(req, res) {
    try {
      const { id } = req.params;
      const category = await productCategoryModel.getProductCategoryById(id);

      if (!category) {
        return ResponseHandler.error(res, '产品大类不存在', 'NOT_FOUND', 404);
      }

      ResponseHandler.success(res, category, '获取产品大类详情成功');
    } catch (error) {
      logger.error('获取产品大类详情失败:', error);
      ResponseHandler.error(res, '获取产品大类详情失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 创建产品大类
   */
  async createProductCategory(req, res) {
    try {
      const categoryData = req.body;

      // 验证必填字段
      if (!categoryData.name || !categoryData.code) {
        return ResponseHandler.error(res, '分类名称和编码不能为空', 'BAD_REQUEST', 400);
      }

      const newCategory = await productCategoryModel.createProductCategory(categoryData);

      ResponseHandler.success(
        res,
        {
          success: true,
          data: newCategory,
          message: '创建产品大类成功',
        },
        '创建成功',
        201
      );
    } catch (error) {
      logger.error('创建产品大类失败:', error);

      // 处理唯一约束错误
      if (error.code === 'ER_DUP_ENTRY') {
        return ResponseHandler.error(res, '分类编码已存在', 'BAD_REQUEST', 400);
      }

      ResponseHandler.error(res, '创建产品大类失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 更新产品大类
   */
  async updateProductCategory(req, res) {
    try {
      const { id } = req.params;
      const categoryData = req.body;

      // 验证必填字段
      if (!categoryData.name || !categoryData.code) {
        return ResponseHandler.error(res, '分类名称和编码不能为空', 'BAD_REQUEST', 400);
      }

      // 检查分类是否存在
      const existingCategory = await productCategoryModel.getProductCategoryById(id);
      if (!existingCategory) {
        return ResponseHandler.error(res, '产品大类不存在', 'NOT_FOUND', 404);
      }

      const updatedCategory = await productCategoryModel.updateProductCategory(id, categoryData);

      ResponseHandler.success(res, updatedCategory, '更新产品大类成功');
    } catch (error) {
      logger.error('更新产品大类失败:', error);

      // 处理唯一约束错误
      if (error.code === 'ER_DUP_ENTRY') {
        return ResponseHandler.error(res, '分类编码已存在', 'BAD_REQUEST', 400);
      }

      ResponseHandler.error(res, '更新产品大类失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 删除产品大类
   */
  async deleteProductCategory(req, res) {
    try {
      const { id } = req.params;

      // 检查分类是否存在
      const existingCategory = await productCategoryModel.getProductCategoryById(id);
      if (!existingCategory) {
        return ResponseHandler.error(res, '产品大类不存在', 'NOT_FOUND', 404);
      }

      await productCategoryModel.deleteProductCategory(id);

      ResponseHandler.success(res, null, '删除产品大类成功');
    } catch (error) {
      logger.error('删除产品大类失败:', error);
      ResponseHandler.error(res, error.message || '删除产品大类失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取产品大类选项
   */
  async getProductCategoryOptions(req, res) {
    try {
      const options = await productCategoryModel.getProductCategoryOptions();

      ResponseHandler.success(res, options, '获取产品大类选项成功');
    } catch (error) {
      logger.error('获取产品大类选项失败:', error);
      ResponseHandler.error(res, '获取产品大类选项失败', 'SERVER_ERROR', 500, error);
    }
  },

  /**
   * 获取统计信息
   */
  async getStatistics(req, res) {
    try {
      const stats = await productCategoryModel.getStatistics();

      ResponseHandler.success(res, stats, '获取统计信息成功');
    } catch (error) {
      logger.error('获取产品大类统计信息失败:', error);
      ResponseHandler.error(res, '获取统计信息失败', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = productCategoryController;
