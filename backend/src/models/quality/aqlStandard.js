const { pool } = require('../../config/db');
const logger = require('../../utils/logger');

class AqlStandard {
    /**
     * 创建新的 AQL 标准
     * @param {Object} data AQL标准数据
     * @returns {Object} 刚创建的标准记录
     */
    static async create(data) {
        const {
            code, name, batch_min, batch_max,
            sample_size, aql_level, accept_limit, reject_limit,
            status = 'active', creator_id
        } = data;

        try {
            const [result] = await pool.query(
                `INSERT INTO quality_aql_standards
        (code, name, batch_min, batch_max, sample_size, aql_level, accept_limit, reject_limit, status, creator_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [code, name, batch_min, batch_max, sample_size, aql_level, accept_limit, reject_limit, status, creator_id]
            );

            return this.findById(result.insertId);
        } catch (error) {
            logger.error('Error creating AQL standard:', error);
            throw error;
        }
    }

    /**
     * 根据ID查找AQL标准
     */
    static async findById(id) {
        const [rows] = await pool.query('SELECT * FROM quality_aql_standards WHERE id = ?', [id]);
        return rows[0] || null;
    }

    /**
     * 更新 AQL 标准
     */
    static async update(id, data) {
        const allowedFields = ['name', 'batch_min', 'batch_max', 'sample_size', 'aql_level', 'accept_limit', 'reject_limit', 'status'];
        const updateFields = [];
        const values = [];

        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (updateFields.length === 0) return this.findById(id);

        values.push(id);
        const query = `UPDATE quality_aql_standards SET ${updateFields.join(', ')} WHERE id = ?`;

        try {
            await pool.query(query, values);
            return this.findById(id);
        } catch (error) {
            logger.error('Error updating AQL standard:', error);
            throw error;
        }
    }

    /**
     * 删除 AQL 标准
     */
    static async delete(id) {
        try {
            const [result] = await pool.query('DELETE FROM quality_aql_standards WHERE id = ?', [id]);
            return result.affectedRows > 0;
        } catch (error) {
            logger.error('Error deleting AQL standard:', error);
            throw error;
        }
    }

    /**
     * 获取 AQL 标准列表 (支持简单过滤)
     */
    static async findAll(params = {}) {
        let query = 'SELECT * FROM quality_aql_standards WHERE 1=1';
        const values = [];

        if (params.status) {
            query += ' AND status = ?';
            values.push(params.status);
        }

        if (params.keyword) {
            query += ' AND (code LIKE ? OR name LIKE ?)';
            values.push(`%${params.keyword}%`, `%${params.keyword}%`);
        }

        query += ' ORDER BY code ASC, aql_level ASC, batch_min ASC';

        // 分页
        if (params.limit && params.offset !== undefined) {
            query += ' LIMIT ? OFFSET ?';
            values.push(Number(params.limit), Number(params.offset));
        }

        const [rows] = await pool.query(query, values);
        return rows;
    }

    /**
     * 统计总数
     */
    static async count(params = {}) {
        let query = 'SELECT COUNT(*) as total FROM quality_aql_standards WHERE 1=1';
        const values = [];

        if (params.status) {
            query += ' AND status = ?';
            values.push(params.status);
        }
        if (params.keyword) {
            query += ' AND (code LIKE ? OR name LIKE ?)';
            values.push(`%${params.keyword}%`, `%${params.keyword}%`);
        }

        const [rows] = await pool.query(query, values);
        return rows[0].total;
    }

    /**
     * 核心业务：根据 批量 和 AQL级别 自动推算检验参数
     * @param {number} batchSize 进料批量
     * @param {number|string} aqlLevel AQL等级 (如 0.65, 1.0)
     * @returns {Object} 抽样参数 { sample_size, accept_limit, reject_limit, aql_standard_id }
     */
    static async calculateSampling(batchSize, aqlLevel) {
        if (!batchSize || batchSize <= 0) {
            throw new Error('批量必须大于0');
        }

        try {
            const [rows] = await pool.query(
                `SELECT id as aql_standard_id, sample_size, accept_limit, reject_limit, code, name
         FROM quality_aql_standards
         WHERE status = 'active'
           AND aql_level = ?
           AND batch_min <= ?
           AND batch_max >= ?
         LIMIT 1`,
                [aqlLevel, batchSize, batchSize]
            );

            return rows[0] || null;
        } catch (error) {
            logger.error('Error calculating AQL sampling:', error);
            throw error;
        }
    }
}

module.exports = AqlStandard;
