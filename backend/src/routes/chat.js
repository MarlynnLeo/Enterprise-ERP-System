/**
 * routes/chat.js
 * @description 即时通讯 REST API 路由
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { pool } = require('../config/db');
const { getOnlineUsers } = require('../socket/index');
const { logger } = require('../utils/logger');
const { ResponseHandler } = require('../utils/responseHandler');
const { parsePagination, appendPaginationSQL } = require('../utils/safePagination');

router.use(authenticateToken);

const CHAT_ACCESS_PERMISSIONS = ['chat:access', 'system:notifications'];
const CHAT_SEND_PERMISSIONS = ['chat:send', 'chat:access', 'system:notifications'];
const CHAT_MANAGE_PERMISSIONS = ['chat:manage', 'chat:access', 'system:notifications'];
const MAX_GROUP_NAME_LENGTH = 100;
const MAX_GROUP_MEMBERS = 100;

router.use(requirePermission(CHAT_ACCESS_PERMISSIONS));

const getRequestUserId = (req) => req.user.userId || req.user.id;

const parsePositiveUserId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && String(value).trim() === String(parsed)
    ? parsed
    : null;
};

const getActiveUserIdSet = async (userIds, connection = pool) => {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return new Set();

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM users WHERE id IN (${placeholders}) AND status = 1`,
    ids
  );
  return new Set(rows.map((row) => row.id));
};

// ==================== 会话管理 ====================

// 获取当前用户的会话列表
router.get('/conversations', async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const [rows] = await pool.query(`
      SELECT
        c.id, c.name, c.type, c.last_message_at, c.last_message_preview, c.created_at,
        cm.unread_count,
        cm.last_read_at
      FROM chat_conversations c
      JOIN chat_conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = ? AND c.deleted_at IS NULL
      ORDER BY c.last_message_at DESC
    `, [userId]);

    // 批量查出所有会话的成员信息（消除 N+1）
    const onlineUserIds = getOnlineUsers();
    if (rows.length > 0) {
      const convIds = rows.map(c => c.id);
      const ph = convIds.map(() => '?').join(',');
      const [allMembers] = await pool.query(`
        SELECT cm.conversation_id, u.id, u.username, u.real_name, u.avatar
        FROM chat_conversation_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id IN (${ph})
      `, convIds);
      // 按会话 ID 分组
      const memberMap = new Map();
      for (const m of allMembers) {
        if (!memberMap.has(m.conversation_id)) memberMap.set(m.conversation_id, []);
        memberMap.get(m.conversation_id).push(m);
      }
      for (const conv of rows) {
        conv.members = memberMap.get(conv.id) || [];
        if (conv.type === 'private') {
          const other = conv.members.find(m => m.id !== userId);
          if (other) {
            conv.display_name = other.real_name || other.username;
            conv.display_avatar = other.avatar;
            conv.other_online = onlineUserIds.includes(other.id);
          }
        }
      }
    }

    ResponseHandler.success(res, { list: rows });
  } catch (error) {
    logger.error('获取会话列表失败:', error);
    ResponseHandler.error(res, '获取会话列表失败', 'SERVER_ERROR', 500, error);
  }
});

// 创建或获取私聊会话
router.post('/conversations/private', requirePermission(CHAT_SEND_PERMISSIONS), async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const targetUserId = parsePositiveUserId(req.body.targetUserId);
    if (!targetUserId || targetUserId === userId) {
      return ResponseHandler.error(res, '无效的目标用户', 'VALIDATION_ERROR', 400);
    }

    const activeUserIds = await getActiveUserIdSet([targetUserId]);
    if (!activeUserIds.has(targetUserId)) {
      return ResponseHandler.error(res, '目标用户不存在或已停用', 'VALIDATION_ERROR', 400);
    }

    // 查找是否已有私聊会话
    const [existing] = await pool.query(`
      SELECT c.id FROM chat_conversations c
      JOIN chat_conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
      JOIN chat_conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
      WHERE c.type = 'private' AND c.deleted_at IS NULL
      LIMIT 1
    `, [userId, targetUserId]);

    if (existing.length > 0) {
      return ResponseHandler.success(res, { conversationId: existing[0].id, isNew: false });
    }

    // 创建新会话
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [convResult] = await conn.query(
        'INSERT INTO chat_conversations (type, created_by) VALUES (?, ?)',
        ['private', userId]
      );
      const conversationId = convResult.insertId;
      await conn.query(
        'INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)',
        [conversationId, userId, conversationId, targetUserId]
      );
      await conn.commit();
      ResponseHandler.success(res, { conversationId, isNew: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    logger.error('创建私聊会话失败:', error);
    ResponseHandler.error(res, '创建会话失败', 'SERVER_ERROR', 500, error);
  }
});

// 创建群聊会话
router.post('/conversations/group', requirePermission(CHAT_MANAGE_PERMISSIONS), async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const name = String(req.body.name || '').trim();
    const memberIds = req.body.memberIds || [];
    if (!name || name.length > MAX_GROUP_NAME_LENGTH || !Array.isArray(memberIds) || memberIds.length === 0) {
      return ResponseHandler.error(res, '请提供群名和成员列表', 'VALIDATION_ERROR', 400);
    }
    if (memberIds.length > MAX_GROUP_MEMBERS) {
      return ResponseHandler.error(res, '群聊成员数量超出限制', 'VALIDATION_ERROR', 400);
    }

    const parsedMemberIds = memberIds.map(parsePositiveUserId);
    if (parsedMemberIds.some((id) => !id)) {
      return ResponseHandler.error(res, '成员列表包含无效用户ID', 'VALIDATION_ERROR', 400);
    }

    const allMembers = [...new Set([userId, ...parsedMemberIds])];
    const activeUserIds = await getActiveUserIdSet(allMembers);
    if (activeUserIds.size !== allMembers.length) {
      return ResponseHandler.error(res, '成员列表包含不存在或已停用的用户', 'VALIDATION_ERROR', 400);
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [convResult] = await conn.query(
        'INSERT INTO chat_conversations (name, type, created_by) VALUES (?, ?, ?)',
        [name, 'group', userId]
      );
      const conversationId = convResult.insertId;
      const values = allMembers.map(id => [conversationId, id]);
      await conn.query(
        'INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES ?',
        [values]
      );
      // 插入系统消息
      await conn.query(
        'INSERT INTO chat_messages (conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
        [conversationId, userId, '群聊已创建', 'system']
      );
      await conn.query(
        'UPDATE chat_conversations SET last_message_at = NOW(), last_message_preview = ? WHERE id = ?',
        ['群聊已创建', conversationId]
      );
      await conn.commit();
      ResponseHandler.success(res, { conversationId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    logger.error('创建群聊失败:', error);
    ResponseHandler.error(res, '创建群聊失败', 'SERVER_ERROR', 500, error);
  }
});

// ==================== 消息管理 ====================

// 获取会话消息历史
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const conversationId = req.params.id;
    const pagination = parsePagination(req.query.page, req.query.pageSize || req.query.limit, {
      defaultPageSize: 30,
      maxPageSize: 100,
    });

    // 验证成员
    const [memberCheck] = await pool.query(
      'SELECT id FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    if (memberCheck.length === 0) {
      return ResponseHandler.error(res, '无权访问该会话', 'FORBIDDEN', 403);
    }

    const messageSql = appendPaginationSQL(`
      SELECT
        m.id, m.conversation_id, m.sender_id, m.content, m.type,
        m.file_url, m.file_name, m.created_at,
        u.username AS sender_name, u.real_name AS sender_real_name, u.avatar AS sender_avatar
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ? AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
    `, pagination.limit, pagination.offset);
    const [messages] = await pool.query(messageSql, [conversationId]);

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM chat_messages WHERE conversation_id = ? AND deleted_at IS NULL',
      [conversationId]
    );

    // 清零当前用户未读数
    await pool.query(
      'UPDATE chat_conversation_members SET unread_count = 0, last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    ResponseHandler.success(res, {
      list: messages.reverse(),
      total: countRows[0].total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  } catch (error) {
    logger.error('获取消息历史失败:', error);
    ResponseHandler.error(res, '获取消息失败', 'SERVER_ERROR', 500, error);
  }
});

// ==================== 用户列表（聊天可选联系人） ====================

router.get('/contacts', requirePermission(CHAT_SEND_PERMISSIONS), async (req, res) => {
  try {
    const userId = getRequestUserId(req);
    const search = String(req.query.search || '').trim().slice(0, 50);
    let query = `
      SELECT id, username, real_name, avatar, department AS department_name
      FROM users
      WHERE id != ? AND status = 1
    `;
    const params = [userId];
    if (search) {
      query += ' AND (username LIKE ? OR real_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    query += ' ORDER BY real_name ASC LIMIT 50';

    const [users] = await pool.query(query, params);
    const onlineUserIds = getOnlineUsers();
    users.forEach(u => { u.online = onlineUserIds.includes(u.id); });

    ResponseHandler.success(res, { list: users });
  } catch (error) {
    logger.error('获取联系人列表失败:', error);
    ResponseHandler.error(res, '获取联系人失败', 'SERVER_ERROR', 500, error);
  }
});

module.exports = router;
