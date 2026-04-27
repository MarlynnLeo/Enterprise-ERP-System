/**
 * expense.js
 * @description 费用管理数据模型
 * @date 2026-01-17
 * @version 1.0.0
 */

const logger = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');
const db = require('../config/db');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');

/**
 * 费用管理模块数据库操作
 */
const expenseModel = {
  /**
   * @deprecated 费用管理表结构已迁移至 Knex 迁移文件 20260312000009 管理
   * 此函数仅保留检查和插入默认分类数据的逻辑
   */
  async initTables() {
    const connection = await db.getConnection();
    try {
      // 表结构由 migrations/20260312000009_baseline_misc_tables.js 管理
      // 仅检查是否需要插入预设数据
      const [categories] = await connection.query(
        'SELECT COUNT(*) as count FROM expense_categories'
      );
      if (categories[0].count === 0) {
        await this.insertDefaultCategories(connection);
      }

      logger.info('费用管理表初始化成功');
      return { success: true };
    } catch (error) {
      logger.error('初始化费用管理表失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 插入预设费用类型
   */
  async insertDefaultCategories(connection) {
    const defaultCategories = [
      // 认证费用
      {
        code: 'CERT',
        name: '认证费用',
        parent_id: null,
        sort_order: 1,
        description: '各类资质认证费用',
      },
      {
        code: 'CERT_ISO',
        name: 'ISO认证',
        parent_id: 1,
        sort_order: 1,
        description: 'ISO体系认证费用',
      },
      {
        code: 'CERT_PROD',
        name: '产品认证',
        parent_id: 1,
        sort_order: 2,
        description: '产品认证费用',
      },
      {
        code: 'CERT_SYS',
        name: '体系认证',
        parent_id: 1,
        sort_order: 3,
        description: '管理体系认证费用',
      },

      // 模具费用
      {
        code: 'MOLD',
        name: '模具费用',
        parent_id: null,
        sort_order: 2,
        description: '生产模具相关费用',
      },
      {
        code: 'MOLD_DEV',
        name: '模具开发',
        parent_id: 5,
        sort_order: 1,
        description: '新模具开发费用',
      },
      {
        code: 'MOLD_REPAIR',
        name: '模具维修',
        parent_id: 5,
        sort_order: 2,
        description: '模具维修保养费用',
      },
      {
        code: 'MOLD_DEPREC',
        name: '模具折旧',
        parent_id: 5,
        sort_order: 3,
        description: '模具折旧费用',
      },

      // 设备费用
      {
        code: 'EQUIP',
        name: '设备费用',
        parent_id: null,
        sort_order: 3,
        description: '非固定资产设备费用',
      },
      {
        code: 'EQUIP_PURCH',
        name: '设备采购',
        parent_id: 9,
        sort_order: 1,
        description: '小型设备采购费用',
      },
      {
        code: 'EQUIP_REPAIR',
        name: '设备维修',
        parent_id: 9,
        sort_order: 2,
        description: '设备维修保养费用',
      },
      {
        code: 'EQUIP_RENT',
        name: '设备租赁',
        parent_id: 9,
        sort_order: 3,
        description: '设备租赁费用',
      },

      // 办公费用
      {
        code: 'OFFICE',
        name: '办公费用',
        parent_id: null,
        sort_order: 4,
        description: '日常办公开销',
      },
      {
        code: 'OFFICE_SUPPLY',
        name: '办公用品',
        parent_id: 13,
        sort_order: 1,
        description: '办公用品采购',
      },
      {
        code: 'OFFICE_COMM',
        name: '通讯费',
        parent_id: 13,
        sort_order: 2,
        description: '电话网络等通讯费用',
      },
      {
        code: 'OFFICE_UTIL',
        name: '水电费',
        parent_id: 13,
        sort_order: 3,
        description: '水电燃气费用',
      },

      // 差旅费用
      {
        code: 'TRAVEL',
        name: '差旅费用',
        parent_id: null,
        sort_order: 5,
        description: '出差相关费用',
      },
      {
        code: 'TRAVEL_TRANS',
        name: '交通费',
        parent_id: 17,
        sort_order: 1,
        description: '机票火车票等',
      },
      {
        code: 'TRAVEL_HOTEL',
        name: '住宿费',
        parent_id: 17,
        sort_order: 2,
        description: '酒店住宿费用',
      },
      {
        code: 'TRAVEL_MEAL',
        name: '餐饮补贴',
        parent_id: 17,
        sort_order: 3,
        description: '出差餐饮补贴',
      },

      // 其他费用
      {
        code: 'OTHER',
        name: '其他费用',
        parent_id: null,
        sort_order: 6,
        description: '其他杂项费用',
      },
      {
        code: 'OTHER_TRAIN',
        name: '培训费',
        parent_id: 21,
        sort_order: 1,
        description: '员工培训费用',
      },
      {
        code: 'OTHER_CONSULT',
        name: '咨询费',
        parent_id: 21,
        sort_order: 2,
        description: '咨询服务费用',
      },
      {
        code: 'OTHER_MISC',
        name: '其他',
        parent_id: 21,
        sort_order: 3,
        description: '其他杂项费用',
      },
    ];

    for (const cat of defaultCategories) {
      await connection.query(
        'INSERT INTO expense_categories (code, name, parent_id, sort_order, description) VALUES (?, ?, ?, ?, ?)',
        [cat.code, cat.name, cat.parent_id, cat.sort_order, cat.description]
      );
    }
    logger.info('预设费用类型插入成功');
  },

  // ==================== 费用类型管理 ====================

  /**
   * 获取费用类型列表
   */
  async getExpenseCategories(filters = {}) {
    try {
      let sql = `
        SELECT 
          c.*,
          pc.name as parent_name
        FROM expense_categories c
        LEFT JOIN expense_categories pc ON c.parent_id = pc.id
        WHERE c.deleted_at IS NULL
      `;
      const params = [];

      if (filters.status !== undefined) {
        sql += ' AND c.status = ?';
        params.push(filters.status);
      }

      if (filters.parentId !== undefined) {
        if (filters.parentId === null || filters.parentId === 'null') {
          sql += ' AND c.parent_id IS NULL';
        } else {
          sql += ' AND c.parent_id = ?';
          params.push(filters.parentId);
        }
      }

      sql += ' ORDER BY c.sort_order, c.id';

      const [rows] = await db.pool.execute(sql, params);
      return rows;
    } catch (error) {
      logger.error('获取费用类型列表失败:', error);
      throw error;
    }
  },

  /**
   * 获取费用类型树形结构
   */
  async getExpenseCategoryTree() {
    try {
      const [rows] = await db.pool.execute(`
        SELECT * FROM expense_categories 
        WHERE status = 1 AND deleted_at IS NULL
        ORDER BY sort_order, id
      `);

      // 构建树形结构
      const buildTree = (items, parentId = null) => {
        return items
          .filter((item) => item.parent_id === parentId)
          .map((item) => ({
            ...item,
            children: buildTree(items, item.id),
          }));
      };

      return buildTree(rows);
    } catch (error) {
      logger.error('获取费用类型树形结构失败:', error);
      throw error;
    }
  },

  /**
   * 创建费用类型
   */
  async createExpenseCategory(data) {
    try {
      const [result] = await db.pool.execute(
        `INSERT INTO expense_categories (code, name, parent_id, description, status, sort_order) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          data.code,
          data.name,
          data.parent_id || null,
          data.description || '',
          data.status || 1,
          data.sort_order || 0,
        ]
      );
      return { id: result.insertId, ...data };
    } catch (error) {
      logger.error('创建费用类型失败:', error);
      throw error;
    }
  },

  /**
   * 更新费用类型
   */
  async updateExpenseCategory(id, data) {
    try {
      const fields = [];
      const params = [];

      if (data.name !== undefined) {
        fields.push('name = ?');
        params.push(data.name);
      }
      if (data.code !== undefined) {
        fields.push('code = ?');
        params.push(data.code);
      }
      if (data.parent_id !== undefined) {
        fields.push('parent_id = ?');
        params.push(data.parent_id);
      }
      if (data.description !== undefined) {
        fields.push('description = ?');
        params.push(data.description);
      }
      if (data.status !== undefined) {
        fields.push('status = ?');
        params.push(data.status);
      }
      if (data.sort_order !== undefined) {
        fields.push('sort_order = ?');
        params.push(data.sort_order);
      }

      if (fields.length === 0) {
        return { success: true, message: '无需更新' };
      }

      params.push(id);
      await db.pool.execute(
        `UPDATE expense_categories SET ${fields.join(', ')} WHERE id = ?`,
        params
      );
      return { success: true };
    } catch (error) {
      logger.error('更新费用类型失败:', error);
      throw error;
    }
  },

  /**
   * 删除费用类型
   */
  async deleteExpenseCategory(id) {
    try {
      // 检查是否有子类型
      const [children] = await db.pool.execute(
        'SELECT COUNT(*) as count FROM expense_categories WHERE parent_id = ? AND deleted_at IS NULL',
        [id]
      );
      if (children[0].count > 0) {
        throw new Error('该类型下存在子类型，无法删除');
      }

      // 检查是否有关联的费用记录
      const [expenses] = await db.pool.execute(
        'SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND deleted_at IS NULL',
        [id]
      );
      if (expenses[0].count > 0) {
        throw new Error('该类型下存在费用记录，无法删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(db.pool, 'expense_categories', 'id', id);
      return { success: true };
    } catch (error) {
      logger.error('删除费用类型失败:', error);
      throw error;
    }
  },

  // ==================== 费用记录管理 ====================

  /**
   * 生成费用编号
   */
  async generateExpenseNumber() {
    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `EXP-${dateStr}-`;

      const [rows] = await db.pool.execute(
        `SELECT expense_number FROM expenses 
         WHERE expense_number LIKE ? 
         ORDER BY expense_number DESC LIMIT 1`,
        [`${prefix}%`]
      );

      let nextNum = 1;
      if (rows.length > 0) {
        const lastNum = parseInt(rows[0].expense_number.split('-').pop(), 10);
        nextNum = lastNum + 1;
      }

      return `${prefix}${String(nextNum).padStart(3, '0')}`;
    } catch (error) {
      logger.error('生成费用编号失败:', error);
      throw error;
    }
  },

  /**
   * 创建费用记录
   */
  async createExpense(data) {
    try {
      const expenseNumber = data.expense_number || (await this.generateExpenseNumber());

      const [result] = await db.pool.execute(
        `INSERT INTO expenses (
          expense_number, category_id, title, amount, expense_date,
          payee, invoice_number, description, attachment_path,
          status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          expenseNumber,
          data.category_id,
          data.title,
          data.amount,
          data.expense_date,
          data.payee || null,
          data.invoice_number || null,
          data.description || null,
          data.attachment_path || null,
          data.status || 'draft',
          data.created_by,
        ]
      );

      return { id: result.insertId, expense_number: expenseNumber };
    } catch (error) {
      logger.error('创建费用记录失败:', error);
      throw error;
    }
  },

  /**
   * 获取费用列表
   */
  async getExpenses(filters = {}, page = 1, pageSize = 20) {
    try {
      let whereClause = 'WHERE e.deleted_at IS NULL';
      const params = [];

      if (filters.category_id) {
        whereClause += ' AND e.category_id = ?';
        params.push(filters.category_id);
      }

      if (filters.status) {
        whereClause += ' AND e.status = ?';
        params.push(filters.status);
      }

      if (filters.startDate) {
        whereClause += ' AND e.expense_date >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND e.expense_date <= ?';
        params.push(filters.endDate);
      }

      if (filters.keyword) {
        whereClause += ' AND (e.title LIKE ? OR e.expense_number LIKE ? OR e.payee LIKE ?)';
        const kw = `%${filters.keyword}%`;
        params.push(kw, kw, kw);
      }

      if (filters.created_by) {
        whereClause += ' AND e.created_by = ?';
        params.push(filters.created_by);
      }

      // 获取总数
      const [countResult] = await db.pool.execute(
        `SELECT COUNT(*) as total FROM expenses e ${whereClause}`,
        params
      );
      // MySQL BigInt 返回字符串，需转换为数字
      const total = parseInt(countResult[0].total, 10) || 0;

      // 获取列表 — 使用安全分页工具
      const { limit: safeLimit, offset: safeOffset } = parsePagination(page, pageSize);
      const paginatedSql = appendPaginationSQL(
        `SELECT 
          e.*,
          c.name as category_name,
          c.code as category_code,
          pc.name as parent_category_name,
          u.real_name as created_by_name,
          au.real_name as approved_by_name
        FROM expenses e
        LEFT JOIN expense_categories c ON e.category_id = c.id
        LEFT JOIN expense_categories pc ON c.parent_id = pc.id
        LEFT JOIN users u ON e.created_by = u.id
        LEFT JOIN users au ON e.approved_by = au.id
        ${whereClause}
        ORDER BY e.created_at DESC`,
        safeLimit, safeOffset
      );
      const [rows] = await db.pool.execute(paginatedSql, params);

      return { data: rows, total, page, pageSize };
    } catch (error) {
      logger.error('获取费用列表失败:', error);
      throw error;
    }
  },

  /**
   * 获取费用详情
   */
  async getExpenseById(id) {
    try {
      const [rows] = await db.pool.execute(
        `SELECT 
          e.*,
          c.name as category_name,
          c.code as category_code,
          pc.name as parent_category_name,
          u.real_name as created_by_name,
          su.real_name as submitted_by_name,
          au.real_name as approved_by_name,
          ba.account_name as payment_bank_account_name
        FROM expenses e
        LEFT JOIN expense_categories c ON e.category_id = c.id
        LEFT JOIN expense_categories pc ON c.parent_id = pc.id
        LEFT JOIN users u ON e.created_by = u.id
        LEFT JOIN users su ON e.submitted_by = su.id
        LEFT JOIN users au ON e.approved_by = au.id
        LEFT JOIN bank_accounts ba ON e.payment_bank_account_id = ba.id
        WHERE e.id = ?`,
        [id]
      );

      return rows[0] || null;
    } catch (error) {
      logger.error('获取费用详情失败:', error);
      throw error;
    }
  },

  /**
   * 更新费用记录
   */
  async updateExpense(id, data) {
    try {
      // 只有草稿和驳回状态可以编辑
      const [current] = await db.pool.execute('SELECT status FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!current[0] || !['draft', 'rejected'].includes(current[0].status)) {
        throw new Error('当前状态不允许编辑');
      }

      const fields = [];
      const params = [];

      const allowedFields = [
        'category_id',
        'title',
        'amount',
        'expense_date',
        'payee',
        'invoice_number',
        'description',
        'attachment_path',
      ];
      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          fields.push(`${field} = ?`);
          params.push(data[field]);
        }
      }

      if (fields.length === 0) {
        return { success: true, message: '无需更新' };
      }

      // 如果是驳回状态被编辑，重置为草稿
      if (current[0].status === 'rejected') {
        fields.push('status = ?');
        params.push('draft');
      }

      params.push(id);
      await db.pool.execute(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`, params);
      return { success: true };
    } catch (error) {
      logger.error('更新费用记录失败:', error);
      throw error;
    }
  },

  /**
   * 提交审批
   */
  async submitExpense(id, userId) {
    try {
      const [current] = await db.pool.execute('SELECT status FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!current[0] || !['draft', 'rejected'].includes(current[0].status)) {
        throw new Error('当前状态不允许提交审批');
      }

      await db.pool.execute(
        "UPDATE expenses SET status = 'pending', submitted_by = ?, submitted_at = NOW() WHERE id = ?",
        [userId, id]
      );
      return { success: true };
    } catch (error) {
      logger.error('提交审批失败:', error);
      throw error;
    }
  },

  /**
   * 审批费用
   */
  async approveExpense(id, userId, action, remark = '') {
    try {
      const [current] = await db.pool.execute('SELECT status FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!current[0] || current[0].status !== 'pending') {
        throw new Error('当前状态不允许审批');
      }

      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      await db.pool.execute(
        'UPDATE expenses SET status = ?, approved_by = ?, approved_at = NOW(), approval_remark = ? WHERE id = ?',
        [newStatus, userId, remark, id]
      );
      return { success: true, status: newStatus };
    } catch (error) {
      logger.error('审批费用失败:', error);
      throw error;
    }
  },

  /**
   * 付款处理
   * 包含：银行交易记录、银行余额更新、会计凭证生成
   */
  async payExpense(id, paymentData) {
    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 验证费用状态
      const [current] = await connection.execute('SELECT * FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!current[0]) {
        throw new Error('费用记录不存在');
      }
      if (current[0].status !== 'approved') {
        throw new Error('只有已审批的费用可以付款');
      }
      const expense = current[0];

      // 2. 验证银行账户
      if (!paymentData.bank_account_id) {
        throw new Error('请选择付款账户');
      }
      const [bankAccounts] = await connection.execute('SELECT * FROM bank_accounts WHERE id = ?', [
        paymentData.bank_account_id,
      ]);
      if (bankAccounts.length === 0) {
        throw new Error('付款账户不存在');
      }
      const bankAccount = bankAccounts[0];

      // 检查余额是否足够
      const expenseAmount = parseFloat(expense.amount);
      if (parseFloat(bankAccount.current_balance) < expenseAmount) {
        throw new Error(
          `账户余额不足，当前余额: ${bankAccount.current_balance}, 需付款: ${expense.amount}`
        );
      }

      // 3. 生成交易流水号
      const txNumber = `EXP${Date.now()}`;

      // 4. 创建银行交易记录
      await connection.execute(
        `INSERT INTO bank_transactions 
                (transaction_number, bank_account_id, transaction_date, transaction_type, 
                amount, reference_number, description, is_reconciled, related_party) 
                VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
        [
          txNumber,
          paymentData.bank_account_id,
          '费用', // 交易类型
          expenseAmount,
          expense.expense_number,
          `费用付款: ${expense.title}`,
          false, // 未对账
          expense.payee || '内部费用',
        ]
      );

      // 5. 更新银行账户余额
      const newBalance = parseFloat(bankAccount.current_balance) - expenseAmount;
      await connection.execute('UPDATE bank_accounts SET current_balance = ? WHERE id = ?', [
        newBalance,
        paymentData.bank_account_id,
      ]);

      // 6. 更新费用状态
      await connection.execute(
        `UPDATE expenses SET 
                status = 'paid', 
                paid_at = NOW(), 
                payment_bank_account_id = ?,
                payment_transaction_id = ?
                WHERE id = ?`,
        [paymentData.bank_account_id, txNumber, id]
      );

      // 7. 生成会计凭证（如果需要）
      try {
        const financeModel = require('./finance');

        // 获取费用类型以确定借方科目
        const [categories] = await connection.execute(
          'SELECT * FROM expense_categories WHERE id = ?',
          [expense.category_id]
        );

        // 使用 accountingConfig 获取科目编码，避免硬编码
        const { accountingConfig } = require('../config/accountingConfig');
        let debitAccountCode = accountingConfig.getAccountCode('ADMIN_EXPENSE') || '6602'; // 管理费用
        if (categories.length > 0 && categories[0].gl_account_code) {
          debitAccountCode = categories[0].gl_account_code;
        }

        // 查找对应的借方科目
        const [debitAccounts] = await connection.execute(
          'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1',
          [debitAccountCode]
        );

        // 查找银行存款科目（1002）
        const [creditAccounts] = await connection.execute(
          'SELECT id FROM gl_accounts WHERE account_code = ? AND is_active = 1',
          [accountingConfig.getAccountCode('BANK_DEPOSIT') || '1002'] // 银行存款
        );

        if (debitAccounts.length > 0 && creditAccounts.length > 0) {
          // 获取当前会计期间
          const [periods] = await connection.execute(
            'SELECT id FROM gl_periods WHERE is_closed = 0 ORDER BY start_date DESC LIMIT 1'
          );

          if (periods.length > 0) {
            const entryData = {
              entry_date: new Date().toISOString().split('T')[0],
              posting_date: new Date().toISOString().split('T')[0],
              document_type: '费用单',
              document_number: expense.expense_number,
              period_id: periods[0].id,
              description: `费用付款: ${expense.title}`,
              created_by: 'system',
            };

            const entryItems = [
              {
                account_id: debitAccounts[0].id,
                debit_amount: expenseAmount,
                credit_amount: 0,
                description: `费用: ${expense.title}`,
              },
              {
                account_id: creditAccounts[0].id,
                debit_amount: 0,
                credit_amount: expenseAmount,
                description: `银行付款: ${bankAccount.account_name}`,
              },
            ];

            await financeModel.createEntry(entryData, entryItems, connection);
            logger.info(`[费用付款] 会计凭证已生成: ${expense.expense_number}`);
          } else {
            logger.warn(`[费用付款] 没有开放的会计期间，跳过凭证生成: ${expense.expense_number}`);
          }
        } else {
          // 科目缺失时记录明确警告
          logger.warn(`[费用付款] 会计科目缺失，跳过凭证生成: 借方科目(${debitAccountCode})找到${debitAccounts.length}个, 贷方科目(1002)找到${creditAccounts.length}个`);
        }
      } catch (entryError) {
        // 凭证生成失败记录错误但不阻止付款（银行已扣款）
        logger.error(`[费用付款] 会计凭证生成失败: ${entryError.message}，付款已完成但无凭证，请手动补录`);
      }

      await connection.commit();
      logger.info(
        `[费用付款] 付款成功: 费用ID=${id}, 金额=${expenseAmount}, 银行账户余额=${newBalance}`
      );

      return {
        success: true,
        transactionNumber: txNumber,
        newBankBalance: newBalance,
      };
    } catch (error) {
      await connection.rollback();
      logger.error('付款处理失败:', error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * 删除费用记录
   */
  async deleteExpense(id) {
    try {
      const [current] = await db.pool.execute('SELECT status FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!current[0] || !['draft', 'rejected', 'cancelled'].includes(current[0].status)) {
        throw new Error('当前状态不允许删除');
      }

      // ✅ 软删除替代硬删除
      await softDelete(db.pool, 'expenses', 'id', id);
      return { success: true };
    } catch (error) {
      logger.error('删除费用记录失败:', error);
      throw error;
    }
  },

  /**
   * 取消费用
   */
  async cancelExpense(id) {
    try {
      const [current] = await db.pool.execute('SELECT status FROM expenses WHERE id = ? AND deleted_at IS NULL', [id]);
      if (!current[0] || current[0].status === 'paid') {
        throw new Error('已付款的费用无法取消');
      }

      await db.pool.execute("UPDATE expenses SET status = 'cancelled' WHERE id = ?", [id]);
      return { success: true };
    } catch (error) {
      logger.error('取消费用失败:', error);
      throw error;
    }
  },

  /**
   * 获取费用统计
   */
  async getExpenseStats(filters = {}) {
    try {
      let whereClause = 'WHERE deleted_at IS NULL';
      const params = [];

      if (filters.startDate) {
        whereClause += ' AND expense_date >= ?';
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        whereClause += ' AND expense_date <= ?';
        params.push(filters.endDate);
      }

      // 总体统计
      const [overview] = await db.pool.execute(
        `SELECT 
          COUNT(*) as total_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
          SUM(CASE WHEN status != 'cancelled' THEN amount ELSE 0 END) as total_amount,
          SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
          SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
          SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid_amount
        FROM expenses ${whereClause}`,
        params
      );

      // 按类型统计
      const [byCategory] = await db.pool.execute(
        `SELECT 
          c.id,
          c.name as category_name,
          c.code as category_code,
          COUNT(e.id) as count,
          SUM(e.amount) as amount
        FROM expense_categories c
        LEFT JOIN expenses e ON c.id = e.category_id AND e.status != 'cancelled'
          ${filters.startDate ? 'AND e.expense_date >= ?' : ''}
          ${filters.endDate ? 'AND e.expense_date <= ?' : ''}
        WHERE c.parent_id IS NULL AND c.status = 1 AND c.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY amount DESC`,
        params
      );

      // 月度趋势（最近6个月）
      const [monthlyTrend] = await db.pool.execute(
        `SELECT 
          DATE_FORMAT(expense_date, '%Y-%m') as month,
          COUNT(*) as count,
          SUM(amount) as amount
        FROM expenses
        WHERE status != 'cancelled' AND deleted_at IS NULL
          AND expense_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(expense_date, '%Y-%m')
        ORDER BY month`
      );

      return {
        overview: overview[0],
        byCategory,
        monthlyTrend,
      };
    } catch (error) {
      logger.error('获取费用统计失败:', error);
      throw error;
    }
  },

  // ==================== 钉钉审批集成 ====================

  /**
   * 根据钉钉实例ID获取费用记录
   * @param {string} instanceId 钉钉审批实例ID
   */
  async getExpenseByDingtalkInstanceId(instanceId) {
    try {
      const [rows] = await db.pool.execute(
        'SELECT * FROM expenses WHERE dingtalk_instance_id = ? AND deleted_at IS NULL',
        [instanceId]
      );
      return rows[0] || null;
    } catch (error) {
      logger.error('根据钉钉实例ID获取费用失败:', error);
      throw error;
    }
  },

  /**
   * 保存钉钉审批实例ID
   * @param {number} expenseId 费用ID
   * @param {string} instanceId 钉钉审批实例ID
   */
  async saveDingtalkInstanceId(expenseId, instanceId) {
    try {
      await db.pool.execute(
        `UPDATE expenses SET 
                    dingtalk_instance_id = ?,
                    dingtalk_status = 'RUNNING',
                    dingtalk_submit_time = NOW()
                WHERE id = ?`,
        [instanceId, expenseId]
      );
      return { success: true };
    } catch (error) {
      logger.error('保存钉钉实例ID失败:', error);
      throw error;
    }
  },

  /**
   * 从钉钉回调更新费用状态
   * @param {number} expenseId 费用ID
   * @param {Object} data 更新数据
   */
  async updateExpenseFromDingtalk(expenseId, data) {
    try {
      const fields = [];
      const params = [];

      if (data.status !== undefined) {
        fields.push('status = ?');
        params.push(data.status);
      }
      if (data.dingtalk_status !== undefined) {
        fields.push('dingtalk_status = ?');
        params.push(data.dingtalk_status);
      }
      if (data.dingtalk_result !== undefined) {
        fields.push('dingtalk_result = ?');
        params.push(data.dingtalk_result);
      }
      if (data.approved_at !== undefined) {
        fields.push('approved_at = ?');
        params.push(data.approved_at);
      }

      if (fields.length === 0) {
        return { success: true };
      }

      params.push(expenseId);
      await db.pool.execute(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`, params);

      logger.info(`[Dingtalk] 费用 ${expenseId} 状态已更新: ${JSON.stringify(data)}`);
      return { success: true };
    } catch (error) {
      logger.error('从钉钉更新费用状态失败:', error);
      throw error;
    }
  },

  /**
   * @deprecated 钉钉相关字段已迁移至 Knex 迁移文件 20260312000010 管理
   */
  async addDingtalkFields() {
    // 字段由 migrations/20260312000010_add_runtime_alter_columns.js 管理
    return { success: true };
  },
};

module.exports = expenseModel;

