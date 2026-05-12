/**
 * cipController.js
 * @description 在建工程(CIP)控制器文件
 * @date 2025-08-27
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const cipModel = require('../../../models/cip');
const db = require('../../../config/db');
const { getAuthenticatedUserId } = require('../../../utils/authContext');
const { getCurrentUserName } = require('../../../utils/userHelper');

const cipController = {
    /**
     * 获取在建工程列表
     */
    getCipProjects: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;

            const filters = {
                project_code: req.query.projectCode || null,
                project_name: req.query.projectName || null,
                status: req.query.status || null,
            };

            const result = await cipModel.getCipProjects(filters, page, limit);

            // 返回成功响应
            return ResponseHandler.paginated(
                res,
                result.projects || [],
                result.pagination?.total || 0,
                page,
                limit,
                '获取在建工程列表成功'
            );
        } catch (error) {
            logger.error('获取在建工程列表失败:', error);
            ResponseHandler.error(res, '获取在建工程列表失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 获取单个在建工程详情
     */
    getCipProjectById: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return ResponseHandler.error(res, '无效的工程ID', 'VALIDATION_ERROR', 400);
            }

            const project = await cipModel.getCipProjectById(id);

            if (!project) {
                return ResponseHandler.error(res, `未找到ID为 ${id} 的在建工程`, 'NOT_FOUND', 404);
            }

            return ResponseHandler.success(res, project, '获取在建工程详情成功');
        } catch (error) {
            logger.error('获取在建工程详情失败:', error);
            ResponseHandler.error(res, '获取在建工程详情失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建在建工程
     */
    createCipProject: async (req, res) => {
        try {
            const { project_code, project_name } = req.body;
            if (!project_code || !project_name) {
                return ResponseHandler.error(res, '项目编码和项目名称均为必填项', 'VALIDATION_ERROR', 400);
            }

            // 检查编号是否冲突
            const [existing] = await db.pool.query('SELECT id FROM cip_projects WHERE project_code = ?', [project_code]);
            if (existing.length > 0) {
                return ResponseHandler.error(res, `工程编号 ${project_code} 已存在`, 'VALIDATION_ERROR', 400);
            }

            const id = await cipModel.createCipProject(req.body);
            return ResponseHandler.success(res, { id }, '在建工程创建成功', 201);
        } catch (error) {
            logger.error('创建在建工程失败:', error);
            ResponseHandler.error(res, '创建在建工程失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新在建工程
     */
    updateCipProject: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return ResponseHandler.error(res, '无效的工程ID', 'VALIDATION_ERROR', 400);
            }

            await cipModel.updateCipProject(id, req.body);
            return ResponseHandler.success(res, { id }, '更新在建工程成功');
        } catch (error) {
            logger.error('更新在建工程失败:', error);
            ResponseHandler.error(res, '更新在建工程失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 删除在建工程
     */
    deleteCipProject: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return ResponseHandler.error(res, '无效的工程ID', 'VALIDATION_ERROR', 400);
            }

            await cipModel.deleteCipProject(id);
            return ResponseHandler.success(res, null, '删除在建工程成功');
        } catch (error) {
            logger.error('删除在建工程失败:', error);
            if (error.message.includes('不允许删除')) {
                return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
            }
            ResponseHandler.error(res, '删除在建工程失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 在建工程转固
     */
    transferToFixedAsset: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return ResponseHandler.error(res, '无效的工程ID', 'VALIDATION_ERROR', 400);
            }

            const { assetData } = req.body;
            if (!assetData || !assetData.asset_code || !assetData.asset_name) {
                return ResponseHandler.error(res, '必须提供固定资产的基本录入信息 (asset_code, asset_name 等)', 'VALIDATION_ERROR', 400);
            }

            const newAssetId = await cipModel.transferToFixedAsset(id, assetData, {
                userId: getAuthenticatedUserId(req),
                operatorName: await getCurrentUserName(req),
            });

            return ResponseHandler.success(res, { newAssetId }, '转固成功！在建工程已转为固定资产');
        } catch (error) {
            logger.error('在建工程转固失败:', error);
            if (error.message.includes('不能重复操作') || error.message.includes('不能转为无形/固定资产')) {
                return ResponseHandler.error(res, error.message, 'VALIDATION_ERROR', 400);
            }
            ResponseHandler.error(res, '转固执行失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 增加 / 归集在建工程费用金额
     */
    addCost: async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            if (isNaN(id)) {
                return ResponseHandler.error(res, '无效的工程ID', 'VALIDATION_ERROR', 400);
            }

            const amount = parseFloat(req.body.amount || 0);
            if (amount <= 0) {
                return ResponseHandler.error(res, '附加费用金额必须大于0', 'VALIDATION_ERROR', 400);
            }

            // 获取当前项目
            const project = await cipModel.getCipProjectById(id);
            if (!project || project.status !== '建设中') {
                return ResponseHandler.error(res, '工程不存在或已不可附加费用', 'VALIDATION_ERROR', 400);
            }

            const newAmount = parseFloat(project.accumulated_amount || 0) + amount;
            await cipModel.updateCipProject(id, { accumulated_amount: newAmount });

            return ResponseHandler.success(res, { newAmount }, '归集成本成功');
        } catch (error) {
            logger.error('归集在建工程成本失败:', error);
            ResponseHandler.error(res, '归集在建工程成本失败', 'SERVER_ERROR', 500, error);
        }
    }
};

module.exports = cipController;
