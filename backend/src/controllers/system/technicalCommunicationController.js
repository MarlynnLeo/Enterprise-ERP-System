/**
 * 即时通讯控制器
 * @description 处理即时通讯相关的业务逻辑
 */

const db = require('../../config/db');
const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const ALLOWED_STATUSES = new Set(['draft', 'published', 'archived']);
const ALLOWED_VISIBILITIES = new Set(['public', 'private']);

function normalizePagination(page, pageSize) {
  const normalizedPage = Math.max(parseInt(page, 10) || 1, 1);
  const normalizedPageSize = Math.min(
    Math.max(parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((id) => Number(id)).filter(Number.isInteger))];
}

class TechnicalCommunicationController {
  canManagePrivate(req) {
    const permissions = req.userPermissions || [];
    return permissions.includes('*') ||
      permissions.includes('system:tech-comm:*') ||
      permissions.includes('system:tech-comm:manage');
  }

  buildVisibilityCondition(req) {
    if (this.canManagePrivate(req)) {
      return { condition: null, params: [] };
    }

    return {
      condition: `(
        visibility <> 'private'
        OR author_id = ?
        OR EXISTS (
          SELECT 1 FROM technical_communication_recipients r
          WHERE r.communication_id = technical_communications.id
            AND r.user_id = ?
        )
        OR EXISTS (
          SELECT 1
          FROM technical_communication_department_recipients dr
          JOIN users u ON u.department_id = dr.department_id
          WHERE dr.communication_id = technical_communications.id
            AND u.id = ?
        )
      )`,
      params: [req.user.id, req.user.id, req.user.id],
    };
  }

  async canAccessCommunication(communication, req) {
    if (communication.visibility !== 'private' || this.canManagePrivate(req)) {
      return true;
    }

    const userId = req.user.id;
    if (communication.author_id === userId) {
      return true;
    }

    const [recipients] = await db.pool.query(
      `SELECT 1
       FROM technical_communication_recipients r
       WHERE r.communication_id = ? AND r.user_id = ?
       UNION
       SELECT 1
       FROM technical_communication_department_recipients dr
       JOIN users u ON u.department_id = dr.department_id
       WHERE dr.communication_id = ? AND u.id = ?
       LIMIT 1`,
      [communication.id, userId, communication.id, userId]
    );

    return recipients.length > 0;
  }

  async loadAccessibleCommunication(req, res, id) {
    const [communications] = await db.pool.query(
      'SELECT * FROM technical_communications WHERE id = ?',
      [id]
    );

    if (communications.length === 0) {
      ResponseHandler.error(res, '即时通讯不存在', 'NOT_FOUND', 404);
      return null;
    }

    const communication = communications[0];
    if (!(await this.canAccessCommunication(communication, req))) {
      ResponseHandler.error(res, '无权访问此私有通讯', 'FORBIDDEN', 403);
      return null;
    }

    return communication;
  }

  async refreshRecipientCount(communicationId) {
    const [rows] = await db.pool.query(
      'SELECT COUNT(DISTINCT user_id) AS total FROM technical_communication_recipients WHERE communication_id = ?',
      [communicationId]
    );

    await db.pool.query(
      'UPDATE technical_communications SET recipient_count = ? WHERE id = ?',
      [rows[0]?.total || 0, communicationId]
    );
  }

  /**
   * 获取即时通讯列表
   */
  async getCommunications(req, res) {
    try {
      const {
        page = 1,
        pageSize = 10,
        category,
        status, // 移除默认值，允许查询所有状态
        keyword,
      } = req.query;

      if (status && !ALLOWED_STATUSES.has(status)) {
        return ResponseHandler.error(res, '无效的通讯状态', 'VALIDATION_ERROR', 400);
      }

      const pagination = normalizePagination(page, pageSize);
      const whereConditions = [];
      const params = [];
      const visibilityScope = this.buildVisibilityCondition(req);

      if (visibilityScope.condition) {
        whereConditions.push(visibilityScope.condition);
        params.push(...visibilityScope.params);
      }

      if (category) {
        whereConditions.push('category = ?');
        params.push(category);
      }

      // 只有明确传入status参数时才筛选
      if (status !== undefined && status !== null && status !== '') {
        whereConditions.push('status = ?');
        params.push(status);
      }

      if (keyword) {
        // 使用全文索引优化搜索性能
        whereConditions.push('MATCH(title, summary, content) AGAINST(? IN NATURAL LANGUAGE MODE)');
        params.push(keyword);
      }

      const whereClause =
        whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';

      // 获取总数
      const [countResult] = await db.pool.query(
        `SELECT COUNT(*) as total FROM technical_communications ${whereClause}`,
        params
      );

      // 获取列表（添加点赞数和收藏数）
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const [communications] = await db.pool.query(
        `SELECT id, title, category, tags, summary, author_id, author_name,
                status, published_at, view_count, like_count, favorite_count,
                is_pinned, visibility, recipient_count, read_count,
                created_at, updated_at
         FROM technical_communications
         ${whereClause}
         ORDER BY is_pinned DESC, published_at DESC
         LIMIT ${pagination.pageSize} OFFSET ${pagination.offset}`,
        params
      );

      ResponseHandler.success(res, {
        list: communications,
        total: countResult[0].total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      });
    } catch (error) {
      logger.error('获取即时通讯列表失败:', error);
      ResponseHandler.error(res, '获取即时通讯列表失败');
    }
  }

  /**
   * 获取即时通讯详情
   */
  async getCommunicationDetail(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const communication = await this.loadAccessibleCommunication(req, res, id);
      if (!communication) {
        return;
      }

      // 增加浏览次数
      await db.pool.query(
        'UPDATE technical_communications SET view_count = view_count + 1 WHERE id = ?',
        [id]
      );

      // 记录阅读记录
      if (userId) {
        await db.pool.query(
          `INSERT INTO technical_communication_reads (communication_id, user_id)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE read_at = NOW()`,
          [id, userId]
        );
      }

      // 获取评论
      const [comments] = await db.pool.query(
        `SELECT * FROM technical_communication_comments 
         WHERE communication_id = ? 
         ORDER BY created_at DESC`,
        [id]
      );

      ResponseHandler.success(res, {
        ...communication,
        comments,
      });
    } catch (error) {
      logger.error('获取即时通讯详情失败:', error);
      ResponseHandler.error(res, '获取即时通讯详情失败');
    }
  }

  /**
   * 创建即时通讯
   */
  async createCommunication(req, res) {
    try {
      const {
        title,
        category,
        tags,
        summary,
        content,
        status = 'draft',
        isPinned = 0,
        attachments,
        visibility = 'public',
      } = req.body;
      const recipients = normalizeIdList(req.body.recipients);
      const departmentRecipients = normalizeIdList(req.body.departmentRecipients);

      if (!title || !category || !content) {
        return ResponseHandler.error(res, '标题、分类和内容不能为空', 'VALIDATION_ERROR', 400);
      }

      if (!ALLOWED_STATUSES.has(status)) {
        return ResponseHandler.error(res, '无效的通讯状态', 'VALIDATION_ERROR', 400);
      }

      if (!ALLOWED_VISIBILITIES.has(visibility)) {
        return ResponseHandler.error(res, '无效的可见范围', 'VALIDATION_ERROR', 400);
      }

      const userId = req.user.id;
      const userName = req.user.real_name || req.user.username;

      const [result] = await db.pool.query(
        `INSERT INTO technical_communications
         (title, category, tags, summary, content, author_id, author_name, status,
          published_at, is_pinned, attachments, visibility, recipient_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          category,
          tags ? JSON.stringify(tags) : null,
          summary,
          content,
          userId,
          userName,
          status,
          status === 'published' ? new Date() : null,
          isPinned,
          attachments ? JSON.stringify(attachments) : null,
          visibility,
          recipients.length,
        ]
      );

      const communicationId = result.insertId;

      // 添加抄送人员
      if (recipients && recipients.length > 0) {
        await this.addRecipients(communicationId, recipients);
      }

      // 添加部门抄送
      if (departmentRecipients && departmentRecipients.length > 0) {
        await this.addDepartmentRecipients(communicationId, departmentRecipients);
      }

      await this.refreshRecipientCount(communicationId);

      // 如果是发布状态，发送通知
      if (status === 'published') {
        if (visibility === 'private' && recipients.length > 0) {
          // 私有通讯，只通知抄送人员
          await this.sendNotificationToRecipients(
            communicationId,
            title,
            summary,
            category,
            recipients
          );
        } else {
          // 公开通讯，通知所有用户
          await this.sendNotificationToAllUsers(communicationId, title, summary, category);
        }
      }

      ResponseHandler.success(res, { id: communicationId }, '创建成功');
    } catch (error) {
      logger.error('创建即时通讯失败:', error);
      ResponseHandler.error(res, '创建失败');
    }
  }

  /**
   * 更新即时通讯
   */
  async updateCommunication(req, res) {
    try {
      const { id } = req.params;
      const {
        title,
        category,
        tags,
        summary,
        content,
        status,
        isPinned,
        attachments,
        visibility,
      } = req.body;
      const recipientsProvided = Object.prototype.hasOwnProperty.call(req.body, 'recipients');
      const departmentRecipientsProvided = Object.prototype.hasOwnProperty.call(
        req.body,
        'departmentRecipients'
      );
      const recipients = normalizeIdList(req.body.recipients);
      const departmentRecipients = normalizeIdList(req.body.departmentRecipients);

      // 先获取原有状态
      const [oldData] = await db.pool.query(
        'SELECT status, title, summary, category, visibility FROM technical_communications WHERE id = ?',
        [id]
      );

      if (oldData.length === 0) {
        return ResponseHandler.error(res, '即时通讯不存在', 'NOT_FOUND', 404);
      }

      if (status !== undefined && !ALLOWED_STATUSES.has(status)) {
        return ResponseHandler.error(res, '无效的通讯状态', 'VALIDATION_ERROR', 400);
      }

      if (visibility !== undefined && !ALLOWED_VISIBILITIES.has(visibility)) {
        return ResponseHandler.error(res, '无效的可见范围', 'VALIDATION_ERROR', 400);
      }

      const updateFields = [];
      const params = [];

      if (title !== undefined) {
        updateFields.push('title = ?');
        params.push(title);
      }
      if (category !== undefined) {
        updateFields.push('category = ?');
        params.push(category);
      }
      if (tags !== undefined) {
        updateFields.push('tags = ?');
        params.push(JSON.stringify(tags));
      }
      if (summary !== undefined) {
        updateFields.push('summary = ?');
        params.push(summary);
      }
      if (content !== undefined) {
        updateFields.push('content = ?');
        params.push(content);
      }
      if (status !== undefined) {
        updateFields.push('status = ?');
        params.push(status);
        if (status === 'published') {
          updateFields.push('published_at = NOW()');
        }
      }
      if (isPinned !== undefined) {
        updateFields.push('is_pinned = ?');
        params.push(isPinned);
      }
      if (attachments !== undefined) {
        updateFields.push('attachments = ?');
        params.push(JSON.stringify(attachments));
      }
      if (visibility !== undefined) {
        updateFields.push('visibility = ?');
        params.push(visibility);
      }

      // 更新抄送人数
      const finalVisibility = visibility || oldData[0].visibility || 'public';
      const shouldUpdateRecipients =
        finalVisibility === 'private' && (recipientsProvided || departmentRecipientsProvided);
      if (shouldUpdateRecipients) {
        updateFields.push('recipient_count = ?');
        params.push(recipients.length);
      }

      if (updateFields.length === 0 && !shouldUpdateRecipients) {
        return ResponseHandler.error(res, '没有可更新的字段', 'VALIDATION_ERROR', 400);
      }

      params.push(id);

      if (updateFields.length > 0) {
        await db.pool.query(
          `UPDATE technical_communications SET ${updateFields.join(', ')} WHERE id = ?`,
          params
        );
      }

      // 更新抄送人员（先删除旧的，再添加新的）
      if (shouldUpdateRecipients) {
        // 删除旧的抄送记录
        await db.pool.query(
          'DELETE FROM technical_communication_recipients WHERE communication_id = ?',
          [id]
        );
        await db.pool.query(
          'DELETE FROM technical_communication_department_recipients WHERE communication_id = ?',
          [id]
        );

        // 添加新的抄送人员
        if (recipients && recipients.length > 0) {
          await this.addRecipients(id, recipients);
        }

        // 添加新的部门抄送
        if (departmentRecipients && departmentRecipients.length > 0) {
          await this.addDepartmentRecipients(id, departmentRecipients);
        }

        await this.refreshRecipientCount(id);
      }

      // 如果从非发布状态改为发布状态，发送通知
      if (oldData.length > 0 && oldData[0].status !== 'published' && status === 'published') {
        if (finalVisibility === 'private' && recipients.length > 0) {
          // 私有通讯，只通知抄送人员
          await this.sendNotificationToRecipients(
            id,
            title || oldData[0].title,
            summary || oldData[0].summary,
            category || oldData[0].category,
            recipients
          );
        } else {
          // 公开通讯，通知所有用户
          await this.sendNotificationToAllUsers(
            id,
            title || oldData[0].title,
            summary || oldData[0].summary,
            category || oldData[0].category
          );
        }
      }

      ResponseHandler.success(res, null, '更新成功');
    } catch (error) {
      logger.error('更新即时通讯失败:', error);
      ResponseHandler.error(res, '更新失败');
    }
  }

  /**
   * 删除即时通讯（使用事务确保原子性）
   */
  async deleteCommunication(req, res) {
    const connection = await db.pool.getConnection();
    try {
      const { id } = req.params;

      await connection.beginTransaction();

      const [existing] = await connection.query(
        'SELECT id FROM technical_communications WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        await connection.rollback();
        return ResponseHandler.error(res, '即时通讯不存在', 'NOT_FOUND', 404);
      }

      // 按依赖顺序删除关联数据
      await connection.query(
        'DELETE FROM technical_communication_reads WHERE communication_id = ?',
        [id]
      );
      await connection.query(
        'DELETE FROM technical_communication_comments WHERE communication_id = ?',
        [id]
      );
      await connection.query(
        'DELETE FROM technical_communication_recipients WHERE communication_id = ?',
        [id]
      );
      await connection.query(
        'DELETE FROM technical_communication_department_recipients WHERE communication_id = ?',
        [id]
      );
      await connection.query(
        'DELETE FROM technical_communication_likes WHERE communication_id = ?',
        [id]
      );
      await connection.query(
        'DELETE FROM technical_communication_favorites WHERE communication_id = ?',
        [id]
      );
      // 最后删除主表记录
      await connection.query('DELETE FROM technical_communications WHERE id = ?', [id]);

      await connection.commit();
      ResponseHandler.success(res, null, '删除成功');
    } catch (error) {
      await connection.rollback();
      logger.error('删除即时通讯失败:', error);
      ResponseHandler.error(res, '删除失败');
    } finally {
      connection.release();
    }
  }

  /**
   * 添加评论
   */
  async addComment(req, res) {
    try {
      const { id } = req.params;
      const { content, parentId } = req.body;
      const userId = req.user.id;
      const userName = req.user.real_name || req.user.username;

      if (!content || !String(content).trim()) {
        return ResponseHandler.error(res, '评论内容不能为空', 'VALIDATION_ERROR', 400);
      }

      const communication = await this.loadAccessibleCommunication(req, res, id);
      if (!communication) {
        return null;
      }

      const [result] = await db.pool.query(
        `INSERT INTO technical_communication_comments 
         (communication_id, user_id, user_name, content, parent_id)
         VALUES (?, ?, ?, ?, ?)`,
        [id, userId, userName, content, parentId || null]
      );

      ResponseHandler.success(res, { id: result.insertId }, '评论成功');
    } catch (error) {
      logger.error('添加评论失败:', error);
      ResponseHandler.error(res, '评论失败');
    }
  }

  /**
   * 删除评论
   */
  async deleteComment(req, res) {
    try {
      const { commentId } = req.params;
      const userId = req.user.id;

      const [comments] = await db.pool.query(
        'SELECT id, communication_id, user_id FROM technical_communication_comments WHERE id = ?',
        [commentId]
      );

      if (comments.length === 0) {
        return ResponseHandler.error(res, '评论不存在', 'NOT_FOUND', 404);
      }

      if (!(await this.loadAccessibleCommunication(req, res, comments[0].communication_id))) {
        return null;
      }

      if (comments[0].user_id !== userId && !this.canManagePrivate(req)) {
        return ResponseHandler.error(res, '只能删除自己的评论', 'FORBIDDEN', 403);
      }

      await db.pool.query(
        'DELETE FROM technical_communication_comments WHERE id = ?',
        [commentId]
      );

      ResponseHandler.success(res, null, '删除评论成功');
    } catch (error) {
      logger.error('删除评论失败:', error);
      ResponseHandler.error(res, '删除评论失败');
    }
  }

  /**
   * 给所有用户发送即时通讯通知
   */
  async sendNotificationToAllUsers(communicationId, title, summary, category) {
    try {
      // 获取所有用户ID
      const [users] = await db.pool.query('SELECT id FROM users WHERE status = 1');

      if (users.length === 0) {
        logger.info('没有活跃用户，跳过发送通知');
        return;
      }

      // 分类文本映射
      const categoryMap = {
        update: '更新日志',
        guide: '操作指南',
        specification: '技术规范',
        announcement: '公告',
      };

      const categoryText = categoryMap[category] || category;

      // 批量创建通知
      const notifications = users.map((user) => [
        user.id, // user_id
        'info', // type
        `新即时通讯：${title}`, // title
        `${categoryText} - ${summary}`, // content
        '/system/technical-communication', // link (跳转到技术通讯列表页)
        JSON.stringify({ id: communicationId }), // link_params (传递ID参数)
        0, // priority (普通)
        'technical_communication', // source_type
        communicationId, // source_id
        null, // created_by
      ]);

      await db.pool.query(
        `INSERT INTO notifications
         (user_id, type, title, content, link, link_params, priority, source_type, source_id, created_by)
         VALUES ?`,
        [notifications]
      );

      logger.info(`即时通讯通知已发送给 ${users.length} 个用户`);
    } catch (error) {
      logger.error('发送即时通讯通知失败:', error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 切换点赞状态
   */
  async toggleLike(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      if (!(await this.loadAccessibleCommunication(req, res, id))) {
        return null;
      }

      // 检查是否已点赞
      const [existing] = await db.pool.query(
        'SELECT id FROM technical_communication_likes WHERE communication_id = ? AND user_id = ?',
        [id, userId]
      );

      if (existing.length > 0) {
        // 取消点赞
        await db.pool.query('DELETE FROM technical_communication_likes WHERE id = ?', [
          existing[0].id,
        ]);
        await db.pool.query(
          'UPDATE technical_communications SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?',
          [id]
        );
        ResponseHandler.success(res, { liked: false, action: 'unliked' });
      } else {
        // 点赞
        await db.pool.query(
          'INSERT INTO technical_communication_likes (communication_id, user_id) VALUES (?, ?)',
          [id, userId]
        );
        await db.pool.query(
          'UPDATE technical_communications SET like_count = like_count + 1 WHERE id = ?',
          [id]
        );
        ResponseHandler.success(res, { liked: true, action: 'liked' });
      }
    } catch (error) {
      logger.error('切换点赞状态失败:', error);
      ResponseHandler.error(res, '操作失败');
    }
  }

  /**
   * 切换收藏状态
   */
  async toggleFavorite(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      if (!(await this.loadAccessibleCommunication(req, res, id))) {
        return null;
      }

      // 检查是否已收藏
      const [existing] = await db.pool.query(
        'SELECT id FROM technical_communication_favorites WHERE communication_id = ? AND user_id = ?',
        [id, userId]
      );

      if (existing.length > 0) {
        // 取消收藏
        await db.pool.query('DELETE FROM technical_communication_favorites WHERE id = ?', [
          existing[0].id,
        ]);
        await db.pool.query(
          'UPDATE technical_communications SET favorite_count = GREATEST(favorite_count - 1, 0) WHERE id = ?',
          [id]
        );
        ResponseHandler.success(res, { favorited: false, action: 'unfavorited' });
      } else {
        // 收藏
        await db.pool.query(
          'INSERT INTO technical_communication_favorites (communication_id, user_id) VALUES (?, ?)',
          [id, userId]
        );
        await db.pool.query(
          'UPDATE technical_communications SET favorite_count = favorite_count + 1 WHERE id = ?',
          [id]
        );
        ResponseHandler.success(res, { favorited: true, action: 'favorited' });
      }
    } catch (error) {
      logger.error('切换收藏状态失败:', error);
      ResponseHandler.error(res, '操作失败');
    }
  }

  /**
   * 获取用户的点赞和收藏状态
   */
  async getUserInteraction(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      if (!(await this.loadAccessibleCommunication(req, res, id))) {
        return null;
      }

      const [liked] = await db.pool.query(
        'SELECT id FROM technical_communication_likes WHERE communication_id = ? AND user_id = ?',
        [id, userId]
      );

      const [favorited] = await db.pool.query(
        'SELECT id FROM technical_communication_favorites WHERE communication_id = ? AND user_id = ?',
        [id, userId]
      );

      ResponseHandler.success(res, {
        liked: liked.length > 0,
        favorited: favorited.length > 0,
      });
    } catch (error) {
      logger.error('获取用户互动状态失败:', error);
      ResponseHandler.error(res, '获取失败');
    }
  }

  /**
   * 添加抄送人员
   */
  async addRecipients(communicationId, recipients) {
    if (!recipients || recipients.length === 0) return;

    const values = recipients.map((userId) => [communicationId, userId, 'cc']);
    await db.pool.query(
      'INSERT IGNORE INTO technical_communication_recipients (communication_id, user_id, recipient_type) VALUES ?',
      [values]
    );
  }

  /**
   * 添加部门抄送
   */
  async addDepartmentRecipients(communicationId, departmentIds) {
    if (!departmentIds || departmentIds.length === 0) return;

    // 先记录部门抄送关系
    const deptValues = departmentIds.map((deptId) => [communicationId, deptId]);
    await db.pool.query(
      'INSERT IGNORE INTO technical_communication_department_recipients (communication_id, department_id) VALUES ?',
      [deptValues]
    );

    // 获取这些部门的所有启用用户
    const [users] = await db.pool.query(
      'SELECT id FROM users WHERE department_id IN (?) AND status = 1',
      [departmentIds]
    );

    if (users.length > 0) {
      const userIds = users.map((u) => u.id);
      await this.addRecipients(communicationId, userIds);
    }
  }

  /**
   * 获取抄送人员列表
   */
  async getRecipients(req, res) {
    try {
      const { id } = req.params;

      if (!(await this.loadAccessibleCommunication(req, res, id))) {
        return null;
      }

      const [recipients] = await db.pool.query(
        `SELECT r.id, r.user_id, r.recipient_type, r.is_read, r.read_at,
                u.real_name, u.username, d.name as department, u.position
         FROM technical_communication_recipients r
         LEFT JOIN users u ON r.user_id = u.id
         LEFT JOIN departments d ON u.department_id = d.id
         WHERE r.communication_id = ?
         ORDER BY r.recipient_type, r.created_at`,
        [id]
      );

      const [departments] = await db.pool.query(
        `SELECT dr.id, dr.department_id, d.name as department_name
         FROM technical_communication_department_recipients dr
         LEFT JOIN departments d ON dr.department_id = d.id
         WHERE dr.communication_id = ?`,
        [id]
      );

      ResponseHandler.success(res, {
        recipients,
        departments,
        stats: {
          total: recipients.length,
          read: recipients.filter((r) => r.is_read).length,
          unread: recipients.filter((r) => !r.is_read).length,
        },
      });
    } catch (error) {
      logger.error('获取抄送人员列表失败:', error);
      ResponseHandler.error(res, '获取失败');
    }
  }

  /**
   * 标记为已读
   */
  async markAsRead(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      if (!(await this.loadAccessibleCommunication(req, res, id))) {
        return null;
      }

      // 检查是否是抄送人员
      const [recipient] = await db.pool.query(
        'SELECT id, is_read FROM technical_communication_recipients WHERE communication_id = ? AND user_id = ?',
        [id, userId]
      );

      if (recipient.length === 0) {
        // 不是抄送人员，直接返回成功（公开通讯）
        return ResponseHandler.success(res, { message: '标记成功' });
      }

      if (!recipient[0].is_read) {
        // 更新为已读
        await db.pool.query(
          'UPDATE technical_communication_recipients SET is_read = 1, read_at = NOW() WHERE communication_id = ? AND user_id = ?',
          [id, userId]
        );

        // 更新已读计数
        await db.pool.query(
          'UPDATE technical_communications SET read_count = read_count + 1 WHERE id = ?',
          [id]
        );
      }

      ResponseHandler.success(res, { message: '标记成功' });
    } catch (error) {
      logger.error('标记已读失败:', error);
      ResponseHandler.error(res, '操作失败');
    }
  }

  /**
   * 发送通知给抄送人员（私有通讯）
   */
  async sendNotificationToRecipients(communicationId, title, summary, category, recipients) {
    try {
      if (!recipients || recipients.length === 0) return;

      // 分类文本映射
      const categoryMap = {
        update: '更新日志',
        guide: '操作指南',
        specification: '技术规范',
        announcement: '公告',
      };
      const categoryText = categoryMap[category] || category;

      const notificationValues = recipients.map((userId) => [
        userId,                                       // user_id
        'info',                                       // type
        `新即时通讯：${title}`,                        // title
        `${categoryText} - ${summary || ''}`,         // content
        '/system/technical-communication',            // link
        JSON.stringify({ id: communicationId }),       // link_params
        0,                                            // priority
        'technical_communication',                    // source_type
        communicationId,                              // source_id
        null,                                         // created_by
      ]);

      await db.pool.query(
        `INSERT INTO notifications
         (user_id, type, title, content, link, link_params, priority, source_type, source_id, created_by)
         VALUES ?`,
        [notificationValues]
      );

      logger.info(`私有即时通讯通知已发送给 ${recipients.length} 个抄送人员`);
    } catch (error) {
      logger.error('发送抄送通知失败:', error);
    }
  }
}

const controller = new TechnicalCommunicationController();

module.exports = {
  getCommunications: controller.getCommunications.bind(controller),
  getCommunicationDetail: controller.getCommunicationDetail.bind(controller),
  createCommunication: controller.createCommunication.bind(controller),
  updateCommunication: controller.updateCommunication.bind(controller),
  deleteCommunication: controller.deleteCommunication.bind(controller),
  addComment: controller.addComment.bind(controller),
  deleteComment: controller.deleteComment.bind(controller),
  toggleLike: controller.toggleLike.bind(controller),
  toggleFavorite: controller.toggleFavorite.bind(controller),
  getUserInteraction: controller.getUserInteraction.bind(controller),
  getRecipients: controller.getRecipients.bind(controller),
  markAsRead: controller.markAsRead.bind(controller),
};
