const db = require('../../config/db');

const EightDReport = {
  // 获取列表（支持分页和搜索条件）
  async findAll(params) {
    const { page = 1, pageSize = 10, keyword, status, priority, startDate, endDate } = params;
    const offset = (page - 1) * pageSize;
    
    let sql = `SELECT * FROM eight_d_reports WHERE 1=1 `;
    let countSql = `SELECT COUNT(*) as total FROM eight_d_reports WHERE 1=1 `;
    const queryParams = [];

    if (keyword) {
      sql += ` AND (report_no LIKE ? OR title LIKE ? OR material_name LIKE ? OR ncp_no LIKE ?) `;
      countSql += ` AND (report_no LIKE ? OR title LIKE ? OR material_name LIKE ? OR ncp_no LIKE ?) `;
      const likeKeyword = `%${keyword}%`;
      queryParams.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword);
    }

    if (status) {
      sql += ` AND status = ? `;
      countSql += ` AND status = ? `;
      queryParams.push(status);
    }

    if (priority) {
      sql += ` AND priority = ? `;
      countSql += ` AND priority = ? `;
      queryParams.push(priority);
    }

    if (startDate && endDate) {
      sql += ` AND DATE(created_at) BETWEEN ? AND ? `;
      countSql += ` AND DATE(created_at) BETWEEN ? AND ? `;
      queryParams.push(startDate, endDate);
    }

    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    try {
      const dbPool = db.pool || db;
      const [rows] = await dbPool.query(sql, [...queryParams, parseInt(pageSize), parseInt(offset)]);
      const [countRows] = await dbPool.query(countSql, queryParams);
      
      return {
        list: rows,
        total: countRows[0].total
      };
    } catch (error) {
      throw error;
    }
  },

  // 获取详情
  async findById(id) {
    let sql = `SELECT * FROM eight_d_reports WHERE id = ?`;
    const dbPool = db.pool || db;
    const [rows] = await dbPool.query(sql, [id]);
    
    if (rows.length === 0) return null;
    
    const record = rows[0];
    
    // 解析 JSON 字段
    try {
      if (typeof record.d1_team_members === 'string') record.d1_team_members = JSON.parse(record.d1_team_members || '[]');
      if (typeof record.d3_containment_actions === 'string') record.d3_containment_actions = JSON.parse(record.d3_containment_actions || '[]');
      if (typeof record.d4_contributing_factors === 'string') record.d4_contributing_factors = JSON.parse(record.d4_contributing_factors || '[]');
      if (typeof record.d5_corrective_actions === 'string') record.d5_corrective_actions = JSON.parse(record.d5_corrective_actions || '[]');
      if (typeof record.d7_preventive_actions === 'string') record.d7_preventive_actions = JSON.parse(record.d7_preventive_actions || '[]');
    } catch (e) {
      // JSON解析失败则保留原样
    }
    
    return record;
  },

  // 创建报告
  async create(data, userId) {
    const id = uuidv4();
    
    // 生成报告编号 8D-YYYYMMDD-XXXX
    const dateStr = new Date().toISOString().slice(0, 10).replace(/(|-)/g, '');
    const dbPool = db.pool || db;
    const [countRows] = await dbPool.query("SELECT COUNT(*) as count FROM eight_d_reports WHERE report_no LIKE ?", [`8D-${dateStr}-%`]);
    const sequence = String(countRows[0].count + 1).padStart(4, '0');
    const report_no = `8D-${dateStr}-${sequence}`;

    const insertData = {
      id,
      report_no,
      title: data.title,
      priority: data.priority || 'medium',
      ncp_id: data.ncp_id || null,
      ncp_no: data.ncp_no || null,
      supplier_id: data.supplier_id || null,
      supplier_name: data.supplier_name || null,
      material_id: data.material_id || null,
      material_code: data.material_code || null,
      material_name: data.material_name || null,
      status: 'draft',
      
      d1_team_leader: data.d1_team_leader || null,
      d1_team_members: data.d1_team_members ? JSON.stringify(data.d1_team_members) : '[]',
      d1_completed_at: data.d1_completed_at || null,
      
      d2_problem_description: data.d2_problem_description || null,
      d2_occurrence_date: data.d2_occurrence_date || null,
      d2_quantity_affected: data.d2_quantity_affected || 0,
      d2_defect_type: data.d2_defect_type || null,
      d2_responsible_person: data.d2_responsible_person || null,
      d2_completed_at: data.d2_completed_at || null,
      
      d3_containment_actions: data.d3_containment_actions ? JSON.stringify(data.d3_containment_actions) : '[]',
      d3_effective_date: data.d3_effective_date || null,
      d3_responsible_person: data.d3_responsible_person || null,
      d3_completed_at: data.d3_completed_at || null,
      
      d4_root_cause: data.d4_root_cause || null,
      d4_analysis_method: data.d4_analysis_method || null,
      d4_contributing_factors: data.d4_contributing_factors ? JSON.stringify(data.d4_contributing_factors) : '[]',
      d4_responsible_person: data.d4_responsible_person || null,
      d4_completed_at: data.d4_completed_at || null,
      
      d5_corrective_actions: data.d5_corrective_actions ? JSON.stringify(data.d5_corrective_actions) : '[]',
      d5_responsible_person: data.d5_responsible_person || null,
      d5_target_date: data.d5_target_date || null,
      d5_completed_at: data.d5_completed_at || null,
      
      d6_implementation_results: data.d6_implementation_results || null,
      d6_verification_method: data.d6_verification_method || null,
      d6_verification_result: data.d6_verification_result || 'pending',
      d6_responsible_person: data.d6_responsible_person || null,
      d6_completed_at: data.d6_completed_at || null,
      
      d7_preventive_actions: data.d7_preventive_actions ? JSON.stringify(data.d7_preventive_actions) : '[]',
      d7_standardization: data.d7_standardization || null,
      d7_responsible_person: data.d7_responsible_person || null,
      d7_completed_at: data.d7_completed_at || null,
      
      d8_summary: data.d8_summary || null,
      d8_lessons_learned: data.d8_lessons_learned || null,
      d8_team_recognition: data.d8_team_recognition || null,
      d8_responsible_person: data.d8_responsible_person || null,
      d8_completed_at: data.d8_completed_at || null,
      
      created_by: userId,
      created_at: new Date(),
      updated_at: new Date()
    };

    const keys = Object.keys(insertData);
    const values = Object.values(insertData);
    const placeholders = keys.map(() => '?').join(', ');
    
    await dbPool.query(`INSERT INTO eight_d_reports (${keys.join(', ')}) VALUES (${placeholders})`, values);
    
    return { id, report_no };
  },

  // 更新报告
  async update(id, data) {
    const updateFields = [];
    const values = [];

    const allowedFields = [
      'title', 'priority', 'ncp_id', 'ncp_no', 'supplier_id', 'supplier_name',
      'material_id', 'material_code', 'material_name', 'status', 'review_comments',
      'reviewed_by', 'reviewed_at',
      'd1_team_leader', 'd1_team_members', 'd1_completed_at',
      'd2_problem_description', 'd2_occurrence_date', 'd2_quantity_affected', 'd2_defect_type', 'd2_responsible_person', 'd2_completed_at',
      'd3_containment_actions', 'd3_effective_date', 'd3_responsible_person', 'd3_completed_at',
      'd4_root_cause', 'd4_analysis_method', 'd4_contributing_factors', 'd4_responsible_person', 'd4_completed_at',
      'd5_corrective_actions', 'd5_responsible_person', 'd5_target_date', 'd5_completed_at',
      'd6_implementation_results', 'd6_verification_method', 'd6_verification_result', 'd6_responsible_person', 'd6_completed_at',
      'd7_preventive_actions', 'd7_standardization', 'd7_responsible_person', 'd7_completed_at',
      'd8_summary', 'd8_lessons_learned', 'd8_team_recognition', 'd8_responsible_person', 'd8_completed_at'
    ];

    Object.keys(data).forEach(key => {
      if (allowedFields.includes(key) && data[key] !== undefined) {
        updateFields.push(`${key} = ?`);
        
        // 处理数组需要转JSON字符串的情况
        if (['d1_team_members', 'd3_containment_actions', 'd4_contributing_factors', 'd5_corrective_actions', 'd7_preventive_actions'].includes(key) && Array.isArray(data[key])) {
          values.push(JSON.stringify(data[key]));
        } else {
          values.push(data[key]);
        }
      }
    });

    if (updateFields.length === 0) return true;

    updateFields.push('updated_at = ?');
    values.push(new Date());
    values.push(id);

    const sql = `UPDATE eight_d_reports SET ${updateFields.join(', ')} WHERE id = ?`;
    const dbPool = db.pool || db;
    await dbPool.query(sql, values);
    
    return true;
  },

  // 删除报告
  async delete(id) {
    const sql = `DELETE FROM eight_d_reports WHERE id = ? AND status = 'draft'`;
    const dbPool = db.pool || db;
    const [result] = await dbPool.query(sql, [id]);
    return result.affectedRows > 0;
  },

  // 获取统计
  async getStatistics() {
    const dbPool = db.pool || db;
    
    const [totalRows] = await dbPool.query(`SELECT COUNT(*) as count FROM eight_d_reports`);
    const [statusRows] = await dbPool.query(`SELECT status, COUNT(*) as count FROM eight_d_reports GROUP BY status`);
    const [priorityRows] = await dbPool.query(`SELECT priority, COUNT(*) as count FROM eight_d_reports GROUP BY priority`);
    
    const stats = {
      total: totalRows[0].count,
      draft_count: 0,
      in_progress_count: 0,
      review_count: 0,
      completed_count: 0,
      closed_count: 0,
      critical_count: 0
    };
    
    statusRows.forEach(row => {
      stats[`${row.status}_count`] = row.count;
    });
    
    priorityRows.forEach(row => {
      if (row.priority === 'critical') stats.critical_count = row.count;
    });
    
    return stats;
  }
};

module.exports = EightDReport;
