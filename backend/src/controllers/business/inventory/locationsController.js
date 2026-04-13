/**
 * locationsController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');

const Locations = require('../../../models/locations');

const locationsController = {
  // 获取所有仓库
  getWarehouses: async (req, res) => {
    try {
      const warehouses = await Locations.getWarehouses();
      res.json(warehouses);
    } catch (error) {
      logger.error('Error getting warehouses:', error);
      ResponseHandler.error(res, 'Error getting warehouses', 'SERVER_ERROR', 500, error);
    }
  },

  // 获取所有库位
  getAll: async (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const pageSize = parseInt(req.query.pageSize, 10) || 10;
      const search = req.query.search || '';
      const result = await Locations.getAll(search, page, pageSize);
      res.json(result);
    } catch (error) {
      logger.error('Error getting locations:', error);
      ResponseHandler.error(res, 'Error getting locations', 'SERVER_ERROR', 500, error);
    }
  },

  // 获取单个库位
  getById: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 1;
      const location = await Locations.getById(id);
      if (location) {
        res.json(location);
      } else {
        ResponseHandler.error(res, 'Location not found', 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('Error getting location:', error);
      ResponseHandler.error(res, 'Error getting location', 'SERVER_ERROR', 500, error);
    }
  },

  // 创建库位
  create: async (req, res) => {
    try {
      const locationData = req.body;

      // 验证必要字段
      const requiredFields = ['code', 'name'];
      const missingFields = requiredFields.filter((field) => !locationData[field]);

      if (missingFields.length > 0) {
        return ResponseHandler.error(res, 'Missing required fields', 'BAD_REQUEST', 400);
      }

      const id = await Locations.create(locationData);
      ResponseHandler.success(res, { id, ...locationData }, '创建成功', 201);
    } catch (error) {
      logger.error('Error creating location:', error);
      ResponseHandler.error(res, 'Error creating location', 'SERVER_ERROR', 500, error);
    }
  },

  // 更新库位
  update: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 1;
      const locationData = { ...req.body };

      // 移除 created_at 和 updated_at 字段，让数据库自动处理这些字段
      delete locationData.created_at;
      delete locationData.updated_at;

      const affectedRows = await Locations.update(id, locationData);
      if (affectedRows) {
        res.json({ id, ...locationData });
      } else {
        ResponseHandler.error(res, 'Location not found', 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('Error updating location:', error);
      ResponseHandler.error(res, 'Error updating location', 'SERVER_ERROR', 500, error);
    }
  },

  // 删除库位
  delete: async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 1;
      const affectedRows = await Locations.delete(id);
      if (affectedRows) {
        res.json({ message: 'Location deleted successfully' });
      } else {
        ResponseHandler.error(res, 'Location not found', 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('Error deleting location:', error);
      ResponseHandler.error(res, 'Error deleting location', 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = locationsController;
