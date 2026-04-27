/**
 * socket/index.js
 * @description Socket.IO 服务初始化与事件管理
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');
const { pool } = require('../config/db');

let io = null;
// userId -> Set<socketId> 的映射，支持多端登录
const onlineUsers = new Map();

/**
 * 初始化 Socket.IO
 * @param {import('http').Server} httpServer
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  // JWT 鉴权中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('未提供认证令牌'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId || decoded.id;
      socket.userName = decoded.username || decoded.name;
      next();
    } catch (err) {
      return next(new Error('令牌无效或已过期'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`[Socket] 用户 ${userId} 已连接 (${socket.id})`);

    // 记录在线状态
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // 加入用户专属房间
    socket.join(`user:${userId}`);

    // 广播在线状态
    io.emit('user:online', { userId, online: true });

    // ==================== 聊天事件 ====================

    // 加入会话房间
    socket.on('chat:join', async (conversationId) => {
      socket.join(`conv:${conversationId}`);
      // 清零未读数
      try {
        await pool.query(
          'UPDATE chat_conversation_members SET unread_count = 0, last_read_at = NOW() WHERE conversation_id = ? AND user_id = ?',
          [conversationId, userId]
        );
      } catch (err) {
        logger.error('[Socket] 清零未读数失败:', err.message);
      }
    });

    // 离开会话房间
    socket.on('chat:leave', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
    });

    // 发送消息
    socket.on('chat:send', async (data, callback) => {
      try {
        const { conversationId, content, type = 'text' } = data;
        if (!conversationId || !content) {
          return callback?.({ error: '参数不完整' });
        }

        // 验证用户是否为会话成员
        const [memberRows] = await pool.query(
          'SELECT id FROM chat_conversation_members WHERE conversation_id = ? AND user_id = ?',
          [conversationId, userId]
        );
        if (memberRows.length === 0) {
          return callback?.({ error: '您不是该会话的成员' });
        }

        // 插入消息
        const [result] = await pool.query(
          'INSERT INTO chat_messages (conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
          [conversationId, userId, content, type]
        );

        // 获取发送者信息
        const [userRows] = await pool.query(
          'SELECT id, username, real_name, avatar FROM users WHERE id = ?',
          [userId]
        );
        const sender = userRows[0] || {};

        const preview = type === 'text' ? content.substring(0, 100) : `[${type === 'image' ? '图片' : '文件'}]`;

        // 更新会话最后消息
        await pool.query(
          'UPDATE chat_conversations SET last_message_at = NOW(), last_message_preview = ? WHERE id = ?',
          [preview, conversationId]
        );

        // 增加其他成员的未读数
        await pool.query(
          'UPDATE chat_conversation_members SET unread_count = unread_count + 1 WHERE conversation_id = ? AND user_id != ?',
          [conversationId, userId]
        );

        const message = {
          id: result.insertId,
          conversation_id: conversationId,
          sender_id: userId,
          sender_name: sender.real_name || sender.username,
          sender_avatar: sender.avatar,
          content,
          type,
          created_at: new Date().toISOString(),
        };

        // 广播给会话所有成员
        io.to(`conv:${conversationId}`).emit('chat:message', message);

        // 同时通知不在会话房间但在线的成员（通过用户专属房间）
        const [allMembers] = await pool.query(
          'SELECT user_id FROM chat_conversation_members WHERE conversation_id = ? AND user_id != ?',
          [conversationId, userId]
        );
        allMembers.forEach((m) => {
          io.to(`user:${m.user_id}`).emit('chat:new-message', {
            conversationId,
            preview,
            senderName: sender.real_name || sender.username,
          });
        });

        callback?.({ success: true, message });
      } catch (err) {
        logger.error('[Socket] 发送消息失败:', err.message);
        callback?.({ error: '发送失败' });
      }
    });

    // 正在输入
    socket.on('chat:typing', (conversationId) => {
      socket.to(`conv:${conversationId}`).emit('chat:typing', {
        userId,
        userName: socket.userName,
      });
    });

    // 断开连接
    socket.on('disconnect', () => {
      logger.info(`[Socket] 用户 ${userId} 已断开 (${socket.id})`);
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('user:online', { userId, online: false });
        }
      }
    });
  });

  logger.info('[Socket] Socket.IO 服务已初始化');
  return io;
}

/**
 * 获取 Socket.IO 实例
 */
function getIO() {
  return io;
}

/**
 * 获取在线用户列表
 */
function getOnlineUsers() {
  return Array.from(onlineUsers.keys());
}

module.exports = { initSocket, getIO, getOnlineUsers };
