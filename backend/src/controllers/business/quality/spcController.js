/**
 * spcController.js
 * @description SPC 统计过程控制控制器
 * @date 2026-03-03
 *
 * 职责范围：控制计划 CRUD、数据采集、CPK计算、控制图数据
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const db = require('../../../config/db');
const CodeGeneratorService = require('../../../services/business/CodeGeneratorService');

/**
 * 计算 CPK 值
 * @param {number[]} values - 测量值数组
 * @param {number} usl - 规格上限
 * @param {number} lsl - 规格下限
 * @returns {object} CPK 相关统计量
 */
function calculateCpk(values, usl, lsl) {
    if (!values || values.length < 2 || usl === null || usl === undefined || lsl === null || lsl === undefined) {
        return { cpk: null, cp: null, mean: null, stddev: null, n: 0 };
    }

    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
    const stddev = Math.sqrt(variance);

    if (stddev === 0) {
        return { cpk: null, cp: null, mean, stddev: 0, n, message: '标准差为零，无法计算' };
    }

    const cp = (usl - lsl) / (6 * stddev);
    const cpu = (usl - mean) / (3 * stddev);
    const cpl = (mean - lsl) / (3 * stddev);
    const cpk = Math.min(cpu, cpl);

    return {
        cpk: parseFloat(cpk.toFixed(4)),
        cp: parseFloat(cp.toFixed(4)),
        cpu: parseFloat(cpu.toFixed(4)),
        cpl: parseFloat(cpl.toFixed(4)),
        mean: parseFloat(mean.toFixed(6)),
        stddev: parseFloat(stddev.toFixed(6)),
        n,
        usl,
        lsl,
    };
}

/**
 * 计算 X-bar R 控制图数据
 */
function calculateXbarRChart(subgroups) {
    if (!subgroups || subgroups.length === 0) return null;

    // A2, D3, D4 系数表 (subgroup size 2-10)
    const A2 = { 2: 1.880, 3: 1.023, 4: 0.729, 5: 0.577, 6: 0.483, 7: 0.419, 8: 0.373, 9: 0.337, 10: 0.308 };
    const D3 = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0.076, 8: 0.136, 9: 0.184, 10: 0.223 };
    const D4 = { 2: 3.267, 3: 2.575, 4: 2.282, 5: 2.115, 6: 2.004, 7: 1.924, 8: 1.864, 9: 1.816, 10: 1.777 };

    const xbars = [];
    const ranges = [];

    for (const sg of subgroups) {
        const vals = sg.values;
        if (vals.length === 0) continue;
        const xbar = vals.reduce((a, b) => a + b, 0) / vals.length;
        const r = Math.max(...vals) - Math.min(...vals);
        xbars.push(xbar);
        ranges.push(r);
    }

    if (xbars.length === 0) return null;

    const xbarBar = xbars.reduce((a, b) => a + b, 0) / xbars.length;
    const rBar = ranges.reduce((a, b) => a + b, 0) / ranges.length;

    const n = subgroups[0].values.length;
    const a2 = A2[n] || 0.577;
    const d3 = D3[n] || 0;
    const d4 = D4[n] || 2.115;

    return {
        xbarChart: {
            data: xbars.map((v, i) => ({ subgroup: i + 1, value: parseFloat(v.toFixed(6)) })),
            cl: parseFloat(xbarBar.toFixed(6)),
            ucl: parseFloat((xbarBar + a2 * rBar).toFixed(6)),
            lcl: parseFloat((xbarBar - a2 * rBar).toFixed(6)),
        },
        rChart: {
            data: ranges.map((v, i) => ({ subgroup: i + 1, value: parseFloat(v.toFixed(6)) })),
            cl: parseFloat(rBar.toFixed(6)),
            ucl: parseFloat((d4 * rBar).toFixed(6)),
            lcl: parseFloat((d3 * rBar).toFixed(6)),
        },
    };
}

const spcController = {
    // ==================== 控制计划 ====================

    /**
     * 获取控制计划列表
     */
    async getControlPlans(req, res) {
        try {
            const { page = 1, pageSize = 20, keyword, is_active } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(pageSize);

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (keyword) {
                whereClause += ' AND (sp.plan_no LIKE ? OR sp.plan_name LIKE ? OR sp.product_name LIKE ? OR sp.characteristic LIKE ?)';
                params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
            }

            if (is_active !== undefined) {
                whereClause += ' AND sp.is_active = ?';
                params.push(is_active === 'true' ? 1 : 0);
            }

            const countResult = await db.query(
                `SELECT COUNT(*) as total FROM spc_control_plans sp ${whereClause}`, params
            );
            const total = (countResult.rows && countResult.rows[0]?.total) || 0;

            const actualPageSize = parseInt(pageSize);
            const result = await db.query(
                `
        SELECT sp.*,
          (SELECT COUNT(*) FROM spc_data_points WHERE plan_id = sp.id) as data_count
        FROM spc_control_plans sp
        ${whereClause}
        ORDER BY sp.created_at DESC
        LIMIT ${actualPageSize} OFFSET ${offset}
      `,
                params
            );

            ResponseHandler.success(res, {
                list: result.rows || [],
                total: parseInt(total),
                page: parseInt(page),
                pageSize: actualPageSize,
            }, '获取控制计划列表成功');
        } catch (error) {
            logger.error('获取控制计划列表失败:', error);
            ResponseHandler.error(res, '获取控制计划列表失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 创建控制计划
     */
    async createControlPlan(req, res) {
        try {
            const data = req.body;

            if (!data.plan_name || !data.characteristic) {
                return ResponseHandler.error(res, '计划名称和监控特性不能为空', 'BAD_REQUEST', 400);
            }

            if (!data.plan_no) {
                data.plan_no = await CodeGeneratorService.nextCode('spc_plan');
            }

            const result = await db.query('INSERT INTO spc_control_plans SET ?', [data]);

            ResponseHandler.success(res, { id: result.insertId }, '控制计划创建成功', 201);
        } catch (error) {
            logger.error('创建控制计划失败:', error);
            ResponseHandler.error(res, '创建控制计划失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 更新控制计划
     */
    async updateControlPlan(req, res) {
        try {
            const { id } = req.params;
            const data = req.body;

            delete data.id;
            await db.query('UPDATE spc_control_plans SET ? WHERE id = ?', [data, id]);

            ResponseHandler.success(res, { id }, '控制计划更新成功');
        } catch (error) {
            logger.error('更新控制计划失败:', error);
            ResponseHandler.error(res, '更新控制计划失败', 'SERVER_ERROR', 500, error);
        }
    },

    /**
     * 删除控制计划
     */
    async deleteControlPlan(req, res) {
        try {
            const { id } = req.params;
            await db.query('DELETE FROM spc_control_plans WHERE id = ?', [id]);
            ResponseHandler.success(res, { id }, '控制计划删除成功');
        } catch (error) {
            logger.error('删除控制计划失败:', error);
            ResponseHandler.error(res, '删除控制计划失败', 'SERVER_ERROR', 500, error);
        }
    },

    // ==================== 数据采集 ====================

    /**
     * 批量录入SPC数据
     */
    async addDataPoints(req, res) {
        try {
            const { plan_id, subgroup_no, samples } = req.body;

            if (!plan_id || !subgroup_no || !samples || !Array.isArray(samples)) {
                return ResponseHandler.error(res, '控制计划ID、子组号和样本数据不能为空', 'BAD_REQUEST', 400);
            }

            const plan = await db.query('SELECT * FROM spc_control_plans WHERE id = ?', [plan_id]);
            if (!plan.rows || plan.rows.length === 0) {
                return ResponseHandler.error(res, '控制计划不存在', 'NOT_FOUND', 404);
            }

            const insertedIds = [];
            for (let i = 0; i < samples.length; i++) {
                const s = samples[i];
                const result = await db.query(
                    `INSERT INTO spc_data_points (plan_id, subgroup_no, sample_no, measured_value, measured_by, batch_no, inspection_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [plan_id, subgroup_no, i + 1, s.measured_value, s.measured_by || null, s.batch_no || null, s.inspection_id || null]
                );
                insertedIds.push(result.insertId);
            }

            ResponseHandler.success(res, { ids: insertedIds, count: insertedIds.length }, 'SPC数据录入成功', 201);
        } catch (error) {
            logger.error('录入SPC数据失败:', error);
            ResponseHandler.error(res, '录入SPC数据失败', 'SERVER_ERROR', 500, error);
        }
    },

    // ==================== CPK 计算 ====================

    /**
     * 计算指定控制计划的 CPK
     */
    async getCpk(req, res) {
        try {
            const { id } = req.params;

            const planResult = await db.query('SELECT * FROM spc_control_plans WHERE id = ?', [id]);
            if (!planResult.rows || planResult.rows.length === 0) {
                return ResponseHandler.error(res, '控制计划不存在', 'NOT_FOUND', 404);
            }

            const plan = planResult.rows[0];

            const dataResult = await db.query(
                'SELECT measured_value FROM spc_data_points WHERE plan_id = ? ORDER BY subgroup_no, sample_no',
                [id]
            );

            const values = (dataResult.rows || []).map(r => parseFloat(r.measured_value));

            const cpkResult = calculateCpk(values, parseFloat(plan.usl), parseFloat(plan.lsl));

            ResponseHandler.success(res, {
                plan_id: parseInt(id),
                plan_name: plan.plan_name,
                characteristic: plan.characteristic,
                ...cpkResult,
            }, '获取CPK计算结果成功');
        } catch (error) {
            logger.error('计算CPK失败:', error);
            ResponseHandler.error(res, '计算CPK失败', 'SERVER_ERROR', 500, error);
        }
    },

    // ==================== 控制图 ====================

    /**
     * 获取控制图数据
     */
    async getControlChart(req, res) {
        try {
            const { id } = req.params;

            const planResult = await db.query('SELECT * FROM spc_control_plans WHERE id = ?', [id]);
            if (!planResult.rows || planResult.rows.length === 0) {
                return ResponseHandler.error(res, '控制计划不存在', 'NOT_FOUND', 404);
            }

            const plan = planResult.rows[0];

            const dataResult = await db.query(
                'SELECT subgroup_no, sample_no, measured_value FROM spc_data_points WHERE plan_id = ? ORDER BY subgroup_no, sample_no',
                [id]
            );

            // 按子组分组
            const subgroupMap = {};
            for (const row of (dataResult.rows || [])) {
                if (!subgroupMap[row.subgroup_no]) {
                    subgroupMap[row.subgroup_no] = { subgroup_no: row.subgroup_no, values: [] };
                }
                subgroupMap[row.subgroup_no].values.push(parseFloat(row.measured_value));
            }

            const subgroups = Object.values(subgroupMap).sort((a, b) => a.subgroup_no - b.subgroup_no);

            const chartData = calculateXbarRChart(subgroups);

            // 同时计算 CPK
            const allValues = subgroups.flatMap(sg => sg.values);
            const cpkResult = calculateCpk(allValues, parseFloat(plan.usl), parseFloat(plan.lsl));

            ResponseHandler.success(res, {
                plan,
                chart: chartData,
                cpk: cpkResult,
                subgroup_count: subgroups.length,
                total_samples: allValues.length,
            }, '获取控制图数据成功');
        } catch (error) {
            logger.error('获取控制图数据失败:', error);
            ResponseHandler.error(res, '获取控制图数据失败', 'SERVER_ERROR', 500, error);
        }
    },
};

module.exports = spcController;
