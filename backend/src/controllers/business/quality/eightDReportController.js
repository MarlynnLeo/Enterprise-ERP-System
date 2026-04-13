/**
 * 8D报告控制器（P0重构版）
 * @description 8D问题解决报告的CRUD操作、阶段门控、状态流转
 * 8D方法论步骤: D1团队 → D2问题描述 → D3临时措施 → D4根因分析 → D5纠正措施 → D6实施验证 → D7预防措施 → D8总结关闭
 * 
 * 流程阶段:
 *   draft → d1_d3(立案) → [初审] → d4_d7(整改) → [结案审核] → d8(总结) → completed → closed
 */

const { logger } = require('../../../utils/logger');
const { ResponseHandler } = require('../../../utils/responseHandler');
const db = require('../../../config/db');
const pool = db.pool;
const EightDAIService = require('../../../services/business/EightDAIService');
const { getCurrentUserName } = require('../../../utils/userHelper');

// ===================== 辅助工具 =====================

/**
 * 生成8D报告编号
 */
const generateReportNo = async () => {
    const date = new Date();
    const dateStr = date.toISOString().slice(2, 10).replace(/-/g, '');
    const prefix = `8D${dateStr}`;

    const [maxNoResult] = await pool.query(
        'SELECT MAX(report_no) as max_no FROM eight_d_reports WHERE report_no LIKE ?',
        [`${prefix}%`]
    );

    let sequence = 1;
    if (maxNoResult[0] && maxNoResult[0].max_no) {
        sequence = parseInt(maxNoResult[0].max_no.slice(-3)) + 1;
    }

    return `${prefix}${String(sequence).padStart(3, '0')}`;
};

/**
 * 插入8D操作审计日志
 */
const insertAuditLog = async (conn, reportId, action, oldPhase, newPhase, comments, operator) => {
    try {
        await conn.query(
            `INSERT INTO eight_d_logs (report_id, action, old_phase, new_phase, comments, operator) VALUES (?, ?, ?, ?, ?, ?)`,
            [reportId, action, oldPhase, newPhase, comments, operator]
        );
    } catch (error) {
        logger.error(`[8D] 写入审计日志失败 (ReportID: ${reportId}):`, error.message);
    }
};

/**
 * 阶段门控校验：检查指定阶段的必填字段是否已填写
 * @param {Object} report - 报告数据
 * @param {String} targetPhase - 目标阶段
 * @returns {{ pass: boolean, missing: string[] }}
 */
const validatePhaseGate = (report, targetPhase) => {
    const missing = [];

    if (targetPhase === 'd1_d3' || targetPhase === 'd4_d7') {
        // 进入D1-D3阶段或更高，D1-D3必填
        if (!report.d1_team_leader) missing.push('D1-团队组长');
        if (!report.d2_problem_description) missing.push('D2-问题描述');
        if (!report.title) missing.push('报告标题');
    }

    if (targetPhase === 'd4_d7' || targetPhase === 'd8') {
        // 进入D4-D7阶段或更高，D4必填
        if (!report.d4_root_cause) missing.push('D4-根本原因');
    }

    if (targetPhase === 'd8' || targetPhase === 'completed') {
        // 进入D8/完成阶段，D5-D6验证结果必填
        if (!report.d6_verification_result || report.d6_verification_result === 'pending') {
            missing.push('D6-验证结果');
        }
    }

    return { pass: missing.length === 0, missing };
};

// ===================== CRUD 操作 =====================

/**
 * 获取8D报告列表
 */
const getReports = async (req, res) => {
    try {
        const {
            page = 1, pageSize = 10,
            status, priority, keyword,
            startDate, endDate, ncp_no, current_phase
        } = req.query;

        let sql = 'SELECT * FROM eight_d_reports WHERE 1=1';
        const params = [];

        if (status) {
            sql += ' AND status = ?';
            params.push(status);
        }
        if (current_phase) {
            sql += ' AND current_phase = ?';
            params.push(current_phase);
        }
        if (priority) {
            sql += ' AND priority = ?';
            params.push(priority);
        }
        if (ncp_no) {
            sql += ' AND ncp_no LIKE ?';
            params.push(`%${ncp_no}%`);
        }
        if (keyword) {
            sql += ' AND (report_no LIKE ? OR title LIKE ? OR material_name LIKE ? OR supplier_name LIKE ? OR owner LIKE ? OR initiated_by LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        if (startDate) {
            sql += ' AND created_at >= ?';
            params.push(startDate);
        }
        if (endDate) {
            sql += ' AND created_at <= ?';
            params.push(endDate + ' 23:59:59');
        }

        // 获取总数
        const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
        const [countResult] = await pool.query(countSql, params);
        const total = countResult[0].total;

        // 分页
        const offset = (parseInt(page) - 1) * parseInt(pageSize);
        sql += ` ORDER BY created_at DESC LIMIT ${parseInt(pageSize, 10)} OFFSET ${offset}`;


        const [rows] = await pool.query(sql, params);

        return ResponseHandler.success(res, {
            list: rows,
            total,
            page: parseInt(page),
            pageSize: parseInt(pageSize)
        });
    } catch (error) {
        logger.error('获取8D报告列表失败:', error);
        return ResponseHandler.error(res, '获取8D报告列表失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 获取8D报告详情
 */
const getReportById = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM eight_d_reports WHERE id = ?', [id]);

        if (rows.length === 0) {
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        const report = rows[0];
        // 解析JSON字段
        const jsonFields = ['d1_team_members', 'd3_containment_actions', 'd4_contributing_factors', 'd5_corrective_actions', 'd7_preventive_actions', 'd7_standardization', 'd3_attachments', 'd5_attachments', 'd6_attachments'];
        for (const field of jsonFields) {
            if (report[field] && typeof report[field] === 'string') {
                try { report[field] = JSON.parse(report[field]); } catch (e) { /* 保留原始值 */ }
              // 静默忽略该错误
            }
        }

        return ResponseHandler.success(res, report);
    } catch (error) {
        logger.error('获取8D报告详情失败:', error);
        return ResponseHandler.error(res, '获取8D报告详情失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 获取8D报告的流转与审批日志
 */
const getReportLogs = async (req, res) => {
    try {
        const { id } = req.params;
        const [logs] = await pool.query(
            'SELECT * FROM eight_d_logs WHERE report_id = ? ORDER BY created_at ASC',
            [id]
        );
        return ResponseHandler.success(res, logs);
    } catch (error) {
        logger.error('获取8D报告日志失败:', error);
        return ResponseHandler.error(res, '获取8D报告日志失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 创建8D报告（完整字段版）
 */
const createReport = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const data = req.body;
        const reportNo = await generateReportNo();
        const createdBy = await getCurrentUserName(req);

        // 必填校验
        if (!data.title) {
            return ResponseHandler.error(res, '报告标题不能为空', 'BAD_REQUEST', 400);
        }

        // JSON字段序列化
        const jsonFields = ['d1_team_members', 'd3_containment_actions', 'd4_contributing_factors', 'd5_corrective_actions', 'd7_preventive_actions', 'd7_standardization', 'd3_attachments', 'd5_attachments', 'd6_attachments'];
        for (const field of jsonFields) {
            if (data[field] && Array.isArray(data[field])) {
                data[field] = JSON.stringify(data[field]);
            }
        }

        // 统一处理ISO日期字符串
        for (const key in data) {
            if (data[key] && typeof data[key] === 'string' && data[key].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                data[key] = new Date(data[key]);
            }
        }

        const now = new Date();
        


        // 使用键值对动态构建 INSERT，杜绝列数/值数不匹配
        const insertMap = {
            report_no: reportNo,
            title: data.title,
            ncp_id: data.ncp_id || null,
            ncp_no: data.ncp_no || null,
            inspection_id: data.inspection_id || null,
            inspection_no: data.inspection_no || null,
            material_id: data.material_id || null,
            material_code: data.material_code || null,
            material_name: data.material_name || null,
            supplier_id: data.supplier_id || null,
            supplier_name: data.supplier_name || null,
            priority: data.priority || 'medium',
            status: 'draft',
            current_phase: 'draft',
            initiated_by: data.initiated_by || createdBy,
            initiated_at: data.initiated_at || now,
            owner: data.owner || data.d1_team_leader || createdBy,
            owner_department: data.owner_department || null,
            customer_contact: data.customer_contact || null,
            target_close_date: data.target_close_date || null,
            d3_deadline: data.d3_deadline || null,
            d1_team_leader: data.d1_team_leader || createdBy,
            d1_team_members: data.d1_team_members || '[]',
            d1_completed_at: data.d1_completed_at || null,
            d2_problem_description: data.d2_problem_description || null,
            d2_occurrence_date: data.d2_occurrence_date || null,
            d2_quantity_affected: data.d2_quantity_affected || null,
            d2_defect_type: data.d2_defect_type || null,
            d2_responsible_person: data.d2_responsible_person || null,
            d2_completed_at: data.d2_completed_at || null,
            d3_containment_actions: data.d3_containment_actions || '[]',
            d3_effective_date: data.d3_effective_date || null,
            d3_responsible_person: data.d3_responsible_person || null,
            d3_completed_at: data.d3_completed_at || null,
            d4_root_cause: data.d4_root_cause || null,
            d4_analysis_method: data.d4_analysis_method || null,
            d4_contributing_factors: data.d4_contributing_factors || '[]',
            d4_responsible_person: data.d4_responsible_person || null,
            d4_completed_at: data.d4_completed_at || null,
            d5_corrective_actions: data.d5_corrective_actions || '[]',
            d5_responsible_person: data.d5_responsible_person || null,
            d5_target_date: data.d5_target_date || null,
            d5_completed_at: data.d5_completed_at || null,
            d6_implementation_results: data.d6_implementation_results || null,
            d6_verification_method: data.d6_verification_method || null,
            d6_verification_result: data.d6_verification_result || 'pending',
            d6_responsible_person: data.d6_responsible_person || null,
            d6_completed_at: data.d6_completed_at || null,
            d7_preventive_actions: data.d7_preventive_actions || '[]',
            d7_standardization: data.d7_standardization || null,
            d7_responsible_person: data.d7_responsible_person || null,
            d7_completed_at: data.d7_completed_at || null,
            d8_summary: data.d8_summary || null,
            d8_lessons_learned: data.d8_lessons_learned || null,
            d8_team_recognition: data.d8_team_recognition || null,
            d8_responsible_person: data.d8_responsible_person || null,
            d8_completed_at: data.d8_completed_at || null,
            d3_attachments: data.d3_attachments || '[]',
            d5_attachments: data.d5_attachments || '[]',
            d6_attachments: data.d6_attachments || '[]',
            created_by: createdBy,
            created_at: now,
        };

        const columns = Object.keys(insertMap);
        const values = Object.values(insertMap);
        const placeholders = columns.map(() => '?').join(', ');
        const insertSql = `INSERT INTO eight_d_reports (${columns.join(', ')}) VALUES (${placeholders})`;

        let result;
        try {
            [result] = await conn.query(insertSql, values);
        } catch (queryErr) {
            if (queryErr.code === 'ER_WRONG_VALUE_COUNT_ON_ROW') {
                logger.error('=== INSERT SQL ERROR DUMP ===');
                values.forEach((v, i) => {
                    const isArr = Array.isArray(v);
                    const t = typeof v;
                    if (isArr || t === 'object') {
                        logger.error(`[${i}] ${columns[i]} => TYPE: ${isArr ? 'Array' : t}, VAL: ${JSON.stringify(v)}`);
                    }
                });
                logger.error('=============================');
            }
            throw queryErr;
        }

        await insertAuditLog(conn, result.insertId, 'create', null, 'draft', '新建8D报告', createdBy);

        await conn.commit();

        return ResponseHandler.success(res, {
            id: result.insertId,
            report_no: reportNo
        }, '8D报告创建成功');
    } catch (error) {
        await conn.rollback();
        logger.error('创建8D报告失败:', error);
        return ResponseHandler.error(res, '创建8D报告失败', 'OPERATION_ERROR', 500, error);
    } finally {
        conn.release();
    }
};

/**
 * 更新8D报告（分步骤更新 + 阶段门控）
 */
const updateReport = async (req, res) => {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const { id } = req.params;
        const data = req.body;

        // 检查报告是否存在
        const [existing] = await conn.query('SELECT * FROM eight_d_reports WHERE id = ?', [id]);
        if (existing.length === 0) {
            conn.release();
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        if (existing[0].status === 'closed') {
            conn.release();
            return ResponseHandler.error(res, '已关闭的报告不可修改', 'BAD_REQUEST', 400);
        }

        // JSON字段序列化
        const jsonFields = ['d1_team_members', 'd3_containment_actions', 'd4_contributing_factors', 'd5_corrective_actions', 'd7_preventive_actions', 'd7_standardization', 'd3_attachments', 'd5_attachments', 'd6_attachments'];
        for (const field of jsonFields) {
            if (data[field] && typeof data[field] !== 'string') {
                data[field] = JSON.stringify(data[field]);
            }
        }

        // 统一处理ISO日期字符串
        for (const key in data) {
            if (data[key] && typeof data[key] === 'string' && data[key].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
                data[key] = new Date(data[key]);
            }
        }

        // 构建动态更新SQL — 白名单字段
        const allowedFields = [
            'title', 'priority', 'status', 'current_phase',
            'initiated_by', 'initiated_at', 'owner', 'owner_department', 'customer_contact',
            'target_close_date', 'd3_deadline',
            'd1_team_leader', 'd1_team_members', 'd1_completed_at',
            'd2_problem_description', 'd2_occurrence_date', 'd2_quantity_affected', 'd2_defect_type', 'd2_responsible_person', 'd2_completed_at',
            'd3_containment_actions', 'd3_effective_date', 'd3_responsible_person', 'd3_completed_at',
            'd4_root_cause', 'd4_analysis_method', 'd4_contributing_factors', 'd4_responsible_person', 'd4_completed_at',
            'd5_corrective_actions', 'd5_responsible_person', 'd5_target_date', 'd5_completed_at',
            'd6_implementation_results', 'd6_verification_method', 'd6_verification_result', 'd6_responsible_person', 'd6_completed_at',
            'd7_preventive_actions', 'd7_standardization', 'd7_responsible_person', 'd7_completed_at',
            'd8_summary', 'd8_lessons_learned', 'd8_team_recognition', 'd8_responsible_person', 'd8_completed_at',
            'd3_attachments', 'd5_attachments', 'd6_attachments'
        ];

        const updates = [];
        const values = [];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(data[field]);
            }
        }

        if (updates.length === 0) {
            conn.release();
            return ResponseHandler.error(res, '没有可更新的字段', 'BAD_REQUEST', 400);
        }

        values.push(id);
        await conn.query(
            `UPDATE eight_d_reports SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        const currentPhase = existing[0].current_phase;
        const newPhase = data.current_phase || currentPhase;
        const userName = await getCurrentUserName(req);
        await insertAuditLog(conn, id, 'update', currentPhase, newPhase, '更新了报告内容', userName);

        await conn.commit();
        return ResponseHandler.success(res, null, '8D报告更新成功');
    } catch (error) {
        await conn.rollback();
        logger.error('更新8D报告失败:', error);
        return ResponseHandler.error(res, '更新8D报告失败', 'OPERATION_ERROR', 500, error);
    } finally {
        conn.release();
    }
};

/**
 * 提交审核（含阶段门控校验）
 */
const submitReview = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await pool.query('SELECT * FROM eight_d_reports WHERE id = ?', [id]);
        if (existing.length === 0) {
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        const report = existing[0];

        // 状态校验：只有进行中/被驳回的才能提交审核
        if (!['in_progress', 'draft'].includes(report.status)) {
            return ResponseHandler.error(res, `当前状态"${report.status}"不允许提交审核`, 'BAD_REQUEST', 400);
        }

        // 解析JSON字段用于门控校验
        const jsonFields = ['d1_team_members', 'd3_containment_actions', 'd4_contributing_factors', 'd5_corrective_actions', 'd7_preventive_actions', 'd7_standardization', 'd3_attachments', 'd5_attachments', 'd6_attachments'];
        for (const field of jsonFields) {
            if (report[field] && typeof report[field] === 'string') {
                try { report[field] = JSON.parse(report[field]); } catch (e) { /* 忽略 */ }
              // 静默忽略该错误
            }
        }

        // 阶段门控校验
        const gate = validatePhaseGate(report, 'd1_d3');
        if (!gate.pass) {
            return ResponseHandler.error(res, `以下必填项未完成：${gate.missing.join('、')}`, 'BAD_REQUEST', 400);
        }

        await pool.query(
            'UPDATE eight_d_reports SET status = ?, current_phase = ? WHERE id = ?',
            ['review', 'd1_d3', id]
        );

        const userName = await getCurrentUserName(req);
        await insertAuditLog(pool, id, 'submit_review', report.current_phase, 'd1_d3', '提交了报告初审', userName);

        return ResponseHandler.success(res, null, '已提交审核');
    } catch (error) {
        logger.error('提交审核失败:', error);
        return ResponseHandler.error(res, '提交审核失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 审核8D报告（支持两阶段审批：初审 D1-D3 / 结案审核 D4-D7）
 */
const reviewReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { approved, comments } = req.body;
        const reviewer = await getCurrentUserName(req);

        const [existing] = await pool.query('SELECT * FROM eight_d_reports WHERE id = ?', [id]);
        if (existing.length === 0) {
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        const report = existing[0];

        if (report.status !== 'review') {
            return ResponseHandler.error(res, '只有"待审核"状态的报告才能审核', 'BAD_REQUEST', 400);
        }

        let newStatus, newPhase, msg;

        // 根据当前阶段判断是初审还是结案审核
        if (report.current_phase === 'd1_d3') {
            // 初审（D1-D3阶段提交的）
            if (approved) {
                newStatus = 'in_progress';
                newPhase = 'd4_d7';
                msg = '初审通过，进入D4-D7整改阶段';
                await pool.query(
                    `UPDATE eight_d_reports SET status = ?, current_phase = ?, phase1_approved_by = ?, phase1_approved_at = NOW(), review_comments = ? WHERE id = ?`,
                    [newStatus, newPhase, reviewer, comments || '', id]
                );
            } else {
                newStatus = 'in_progress';
                newPhase = 'd1_d3';
                msg = '初审驳回，已退回修改D1-D3';
                await pool.query(
                    `UPDATE eight_d_reports SET status = ?, current_phase = ?, review_comments = ? WHERE id = ?`,
                    [newStatus, newPhase, comments || '', id]
                );
            }
            await insertAuditLog(pool, id, approved ? 'review_approve' : 'review_reject', report.current_phase, newPhase, comments || msg, reviewer);
        } else if (report.current_phase === 'd4_d7') {
            // 结案审核
            if (approved) {
                newStatus = 'in_progress';
                newPhase = 'd8';
                msg = '结案审核通过，进入D8总结阶段';
                await pool.query(
                    `UPDATE eight_d_reports SET status = ?, current_phase = ?, phase2_approved_by = ?, phase2_approved_at = NOW(), reviewed_by = ?, reviewed_at = NOW(), review_comments = ? WHERE id = ?`,
                    [newStatus, newPhase, reviewer, reviewer, comments || '', id]
                );
            } else {
                newStatus = 'in_progress';
                newPhase = 'd4_d7';
                msg = '结案审核驳回，退回修改D4-D7';
                await pool.query(
                    `UPDATE eight_d_reports SET status = ?, current_phase = ?, review_comments = ? WHERE id = ?`,
                    [newStatus, newPhase, comments || '', id]
                );
            }
            await insertAuditLog(pool, id, approved ? 'review_approve' : 'review_reject', report.current_phase, newPhase, comments || msg, reviewer);
        } else {
            // 兼容旧逻辑
            newStatus = approved ? 'completed' : 'in_progress';
            newPhase = report.current_phase; // keep same phase
            await pool.query(
                `UPDATE eight_d_reports SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_comments = ? WHERE id = ?`,
                [newStatus, reviewer, comments || '', id]
            );
            msg = approved ? '审核通过' : '审核驳回';
            await insertAuditLog(pool, id, approved ? 'review_approve' : 'review_reject', report.current_phase, newPhase, comments || msg, reviewer);
        }

        return ResponseHandler.success(res, null, msg);
    } catch (error) {
        logger.error('审核8D报告失败:', error);
        return ResponseHandler.error(res, '审核8D报告失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 提交结案审核（D4-D7阶段完成后提交）
 */
const submitPhase2Review = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await pool.query('SELECT * FROM eight_d_reports WHERE id = ?', [id]);
        if (existing.length === 0) {
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        const report = existing[0];

        if (report.current_phase !== 'd4_d7') {
            return ResponseHandler.error(res, '当前阶段不是D4-D7，不能提交结案审核', 'BAD_REQUEST', 400);
        }

        // 解析JSON字段用于门控校验
        const jsonFields = ['d1_team_members', 'd3_containment_actions', 'd4_contributing_factors', 'd5_corrective_actions', 'd7_preventive_actions', 'd3_attachments', 'd5_attachments', 'd6_attachments'];
        for (const field of jsonFields) {
            if (report[field] && typeof report[field] === 'string') {
                try { report[field] = JSON.parse(report[field]); } catch (e) { /* 忽略 */ }
              // 静默忽略该错误
            }
        }

        const gate = validatePhaseGate(report, 'd4_d7');
        if (!gate.pass) {
            return ResponseHandler.error(res, `以下必填项未完成：${gate.missing.join('、')}`, 'BAD_REQUEST', 400);
        }

        await pool.query(
            'UPDATE eight_d_reports SET status = ?, current_phase = ? WHERE id = ?',
            ['review', 'd4_d7', id]
        );

        return ResponseHandler.success(res, null, '已提交结案审核');
    } catch (error) {
        logger.error('提交结案审核失败:', error);
        return ResponseHandler.error(res, '提交结案审核失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 完成8D报告（D8总结后关闭）
 */
const completeReport = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await pool.query('SELECT * FROM eight_d_reports WHERE id = ?', [id]);
        if (existing.length === 0) {
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        const report = existing[0];

        if (report.current_phase !== 'd8') {
            return ResponseHandler.error(res, '当前阶段不是D8，不能完成报告', 'BAD_REQUEST', 400);
        }

        if (!report.d8_summary) {
            return ResponseHandler.error(res, '请先填写D8总结内容', 'BAD_REQUEST', 400);
        }

        await pool.query(
            'UPDATE eight_d_reports SET status = ?, current_phase = ? WHERE id = ?',
            ['completed', 'completed', id]
        );

        const userName = await getCurrentUserName(req);
        await insertAuditLog(pool, id, 'complete', report.current_phase, 'completed', '标记报告为完成', userName);

        return ResponseHandler.success(res, null, '报告已完成，等待最终验证与关闭');
    } catch (error) {
        logger.error('完成8D报告失败:', error);
        return ResponseHandler.error(res, '完成报告失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 关闭8D报告（归档）
 */
const closeReport = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await pool.query('SELECT id, status FROM eight_d_reports WHERE id = ?', [id]);
        if (existing.length === 0) {
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        if (existing[0].status !== 'completed') {
            return ResponseHandler.error(res, '只有已完成的报告才能关闭归档', 'BAD_REQUEST', 400);
        }

        await pool.query('UPDATE eight_d_reports SET status = ?, current_phase = ? WHERE id = ?', ['closed', 'closed', id]);
        return ResponseHandler.success(res, null, '8D报告已归档关闭');
    } catch (error) {
        logger.error('关闭8D报告失败:', error);
        return ResponseHandler.error(res, '关闭8D报告失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 删除8D报告
 */
const deleteReport = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await pool.query('SELECT id, status FROM eight_d_reports WHERE id = ?', [id]);
        if (existing.length === 0) {
            return ResponseHandler.error(res, '8D报告不存在', 'NOT_FOUND', 404);
        }

        if (existing[0].status !== 'draft') {
            return ResponseHandler.error(res, '只有草稿状态的报告才能删除', 'BAD_REQUEST', 400);
        }

        await pool.query('DELETE FROM eight_d_reports WHERE id = ?', [id]);
        return ResponseHandler.success(res, null, '8D报告已删除');
    } catch (error) {
        logger.error('删除8D报告失败:', error);
        return ResponseHandler.error(res, '删除8D报告失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * 获取8D报告统计数据
 */
const getStatistics = async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
                SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) as review_count,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
                SUM(CASE WHEN priority = 'critical' THEN 1 ELSE 0 END) as critical_count,
                SUM(CASE WHEN priority = 'high' THEN 1 ELSE 0 END) as high_count,
                SUM(CASE WHEN target_close_date IS NOT NULL AND target_close_date < CURDATE() AND status NOT IN ('completed', 'closed') THEN 1 ELSE 0 END) as overdue_count
            FROM eight_d_reports
        `);

        return ResponseHandler.success(res, stats[0]);
    } catch (error) {
        logger.error('获取8D报告统计失败:', error);
        return ResponseHandler.error(res, '获取统计失败', 'OPERATION_ERROR', 500, error);
    }
};

/**
 * AI智能分析 — 根据问题描述自动生成8D报告内容
 */
const aiAnalyze = async (req, res) => {
    try {
        const { problemDescription, materialName, supplierName, defectType, quantityAffected, priority } = req.body;

        if (!problemDescription) {
            return ResponseHandler.error(res, '请输入问题描述', 'BAD_REQUEST', 400);
        }

        const userName = await getCurrentUserName(req);
        logger.info(`[8D-AI] 用户 ${userName} 请求AI分析`);

        // 获取真实的部门负责人名单作为AI的上下文 (保障关联真实且精确)
        const [deptManagers] = await pool.query(
            `SELECT d.name as dept_name, u.real_name as manager_name 
             FROM departments d 
             INNER JOIN users u ON d.manager_id = u.id 
             WHERE d.status = 1 AND u.status = 1`
        );
        
        // 整理为准确的部门负责人字符串，例如："品质部负责人：张三 \n 技术部负责人：李四"
        const usersListStr = deptManagers.map(d => `${d.dept_name}负责人：${d.manager_name}`).join('\n');

        const result = await EightDAIService.generateFullReport({
            problemDescription,
            materialName,
            supplierName,
            defectType,
            quantityAffected,
            priority,
            usersListStr, // 传递真实花名册
        });

        return ResponseHandler.success(res, result, 'AI分析完成');
    } catch (error) {
        logger.error('AI分析8D报告失败:', error);
        const msg = error.message?.includes('API Key') ? error.message : 'AI分析失败，请稍后重试';
        return ResponseHandler.error(res, msg, 'OPERATION_ERROR', 500, error);
    }
};

module.exports = {
    getReports,
    getReportById,
    createReport,
    updateReport,
    submitReview,
    submitPhase2Review,
    reviewReport,
    completeReport,
    closeReport,
    deleteReport,
    getStatistics,
    getReportLogs,
    aiAnalyze,
};
