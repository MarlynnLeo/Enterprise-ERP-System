/**
 * routes/chat.js
 * @description 即时通讯 REST API 路由
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/db');
const { getOnlineUsers } = require('../socket/index');
const { logger } = require('../utils/logger');

router.use(authenticateToken);

// ==================== 会话管理 ====================

// 获取当前用户的会话列表
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
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

    res.json({ list: rows });
  } catch (error) {
    logger.error('获取会话列表失败:', error);
    res.status(500).json({ message: '获取会话列表失败' });
  }
});

// 创建或获取私聊会话
router.post('/conversations/private', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { targetUserId } = req.body;
    if (!targetUserId || targetUserId === userId) {
      return res.status(400).json({ message: '无效的目标用户' });
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
      return res.json({ conversationId: existing[0].id, isNew: false });
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
      res.json({ conversationId, isNew: true });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    logger.error('创建私聊会话失败:', error);
    res.status(500).json({ message: '创建会话失败' });
  }
});

// 创建群聊会话
router.post('/conversations/group', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { name, memberIds = [] } = req.body;
    if (!name || memberIds.length === 0) {
      return res.status(400).json({ message: '请提供群名和成员列表' });
    }

    const allMembers = [...new Set([userId, ...memberIds])];
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
      res.json({ conversationId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    logger.error('创建群聊失败:', error);
    res.status(500).json({ message: '创建群聊失败' });
  }
});

// ==================== 消息管理 ====================

// 获取会话消息历史
router.get('/conversations/:id/messages', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const conversationId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 30;
    const offset = (page - 1) * pageSize;

    // 验证成员
    const [memberCheck] = await pool.query(
      'SELECT id FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    if (memberCheck.length === 0) {
      return res.status(403).json({ message: '无权访问该会话' });
    }

    const [messages] = await pool.query(`
      SELECT 
        m.id, m.conversation_id, m.sender_id, m.content, m.type, 
        m.file_url, m.file_name, m.created_at,
        u.username AS sender_name, u.real_name AS sender_real_name, u.avatar AS sender_avatar
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ? AND m.deleted_at IS NULL
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `, [conversationId, pageSize, offset]);

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM chat_messages WHERE conversation_id = ? AND deleted_at IS NULL',
      [conversationId]
    );

    // 清零当前用户未读数
    await pool.query(
      'UPDATE chat_conversation_members SET unread_count = 0, last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );

    res.json({
      list: messages.reverse(),
      total: countRows[0].total,
      page,
      pageSize,
    });
  } catch (error) {
    logger.error('获取消息历史失败:', error);
    res.status(500).json({ message: '获取消息失败' });
  }
});

// ==================== 用户列表（聊天可选联系人） ====================

router.get('/contacts', async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const search = req.query.search || '';
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

    res.json({ list: users });
  } catch (error) {
    logger.error('获取联系人列表失败:', error);
    res.status(500).json({ message: '获取联系人失败' });
  }
});

module.exports = router;
