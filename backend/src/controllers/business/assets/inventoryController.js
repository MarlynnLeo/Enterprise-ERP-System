const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const assetInventoryModel = require('../../../models/assetInventory');

const inventoryController = {
    /**
     * 获取盘点单列表
     */
    getInventories: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const status = req.query.status || null;

            const result = await assetInventoryModel.getInventories({ status }, page, limit);

            return ResponseHandler.paginated(
                res,
                result.inventories || [],
                result.pagination?.total || 0,
                page,
                limit,
                '获取盘点单列表成功'
            );
        } catch (error) {
            logger.error('获取盘点单列表失败:', error);
            ResponseHandler.error(res, '获取盘点单列表失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取盘点单详情及明细
     */
    getInventoryById: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return ResponseHandler.error(res, '无效的盘点单ID', 'BAD_REQUEST', 400);
            }

            const inventory = await assetInventoryModel.getInventoryById(id);
            if (!inventory) {
                return res.status(404).json({
                    success: false,
                    message: `未找到ID为 ${id} 的盘点单`
                });
            }

            return ResponseHandler.success(res, inventory, '获取盘点单详情成功');
        } catch (error) {
            logger.error('获取盘点单详情失败:', error);
            ResponseHandler.error(res, '获取盘点单详情失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建盘点单并生成明细
     */
    createInventory: async (req, res) => {
        try {
            const { title, notes } = req.body;
            if (!title) {
                return ResponseHandler.error(res, '盘点单标题为必填项', 'BAD_REQUEST', 400);
            }

            const userId = req.user ? req.user.username : 'system';
            const id = await assetInventoryModel.createInventory({ title, notes }, userId);

            return ResponseHandler.success(res, { id }, '盘点单创建成功', 201);
        } catch (error) {
            logger.error('创建盘点单失败:', error);
            if (error.message.includes('存在未完成的盘点单')) {
                return ResponseHandler.error(res, error.message, 'BAD_REQUEST', 400);
            }
            ResponseHandler.error(res, '创建盘点单失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新单条盘点明细（实盘数据）
     */
    updateInventoryItem: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const itemId = parseInt(req.params.itemId);

            if (isNaN(id) || isNaN(itemId)) {
                return ResponseHandler.error(res, '无效的参数', 'BAD_REQUEST', 400);
            }

            const { actual_quantity, status, notes } = req.body;
            if (actual_quantity === undefined || !status) {
                return ResponseHandler.error(res, '实盘数量和盘点状态为必填项', 'BAD_REQUEST', 400);
            }

            await assetInventoryModel.updateInventoryItem(itemId, {
                actual_quantity: parseInt(actual_quantity),
                status,
                notes
            });

            return ResponseHandler.success(res, { itemId }, '更新盘点记录成功');
        } catch (error) {
            logger.error('更新盘点记录失败:', error);
            ResponseHandler.error(res, '更新盘点记录失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 完成盘点并计算盈亏
     */
    completeInventory: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return ResponseHandler.error(res, '无效的盘点单ID', 'BAD_REQUEST', 400);
            }

            const userId = req.user ? req.user.username : 'system';
            const result = await assetInventoryModel.completeInventory(id, userId);

            return ResponseHandler.success(res, result, '盘点完成');
        } catch (error) {
            logger.error('盘点完成操作失败:', error);
            if (error.message.includes('存在未确认实盘数量的资产明细')) {
                return ResponseHandler.error(res, error.message, 'BAD_REQUEST', 400);
            }
            ResponseHandler.error(res, '盘点完成操作失败', 'SERVER_ERROR', 500, error);
        }
    }
};

module.exports = inventoryController;
