const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const NotificationRecipientService = require('./NotificationRecipientService');

function normalizeIdList(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map(Number).filter(Number.isInteger))];
}

function toJson(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function buildNotificationValue(userId, notification, sourceType, sourceId) {
  return [
    userId,
    notification.type || 'business',
    notification.title,
    notification.content || '',
    notification.link || null,
    toJson(notification.linkParams),
    notification.priority || 0,
    sourceType,
    sourceId,
    notification.createdBy || null,
    0,
    new Date(),
  ];
}

class NotificationService {
  static async getUserIdsByPermissions(permissionCodes, { includeAdmins = false } = {}) {
    return NotificationRecipientService.getUserIdsByPermissions(permissionCodes, { includeAdmins });
  }

  static async getAdminUserIds() {
    return this.getUserIdsByPermissions([], { includeAdmins: true });
  }

  static async notifyByPermissions(permissionCodes, notification, options = {}) {
    const userIds = await this.getUserIdsByPermissions(permissionCodes, {
      includeAdmins: options.includeAdmins === true,
    });
    return this.notifyUsers(userIds, notification, options);
  }

  static async notifyUsers(userIds, notification, options = {}) {
    if (!notification?.title || !String(notification.title).trim()) {
      throw new Error('通知标题不能为空');
    }

    const requestedUserIds = normalizeIdList(userIds);
    const targetUserIds = await NotificationRecipientService.filterActiveUserIds(requestedUserIds);
    const inactiveSkipped = requestedUserIds.length - targetUserIds.length;
    if (!targetUserIds.length) {
      logger.warn('Notification skipped because no target users were resolved.', {
        title: notification?.title,
        type: notification?.type,
        sourceType: notification?.sourceType,
        sourceId: notification?.sourceId,
      });
      return { inserted: 0, skipped: requestedUserIds.length, updated: 0 };
    }

    const sourceType = notification.sourceType || options.sourceType || null;
    const sourceId = notification.sourceId ?? options.sourceId ?? null;
    const hasSource = sourceType && sourceId !== null && sourceId !== undefined;
    const dedupeBySource = options.dedupeBySource === true && hasSource;
    const dedupeByDay = options.dedupeByDay !== false && hasSource;
    let existingByUserId = new Map();

    if (dedupeByDay || dedupeBySource) {
      const [existing] = await pool.query(
        `SELECT id, user_id
         FROM notifications
         WHERE source_type = ?
           AND source_id = ?
           AND user_id IN (?)
           AND is_suppressed = 0
           ${dedupeBySource ? '' : 'AND created_at >= CURDATE()'}`,
        [sourceType, sourceId, targetUserIds]
      );
      existingByUserId = new Map(existing.map((row) => [Number(row.user_id), row.id]));
    }

    const existingIds = [...existingByUserId.values()];
    if (existingIds.length) {
      await pool.query(
        `UPDATE notifications
         SET type = ?,
             title = ?,
             content = ?,
             link = ?,
             link_params = ?,
             priority = ?,
             updated_at = NOW()
         WHERE id IN (?)`,
        [
          notification.type || 'business',
          notification.title,
          notification.content || '',
          notification.link || null,
          toJson(notification.linkParams),
          notification.priority || 0,
          existingIds,
        ]
      );
    }

    const insertedUserIds = targetUserIds
      .filter((userId) => !existingByUserId.has(Number(userId)));
    const values = insertedUserIds
      .map((userId) => buildNotificationValue(userId, notification, sourceType, sourceId));

    if (values.length) {
      await pool.query(
        `INSERT INTO notifications
         (user_id, type, title, content, link, link_params, priority, source_type, source_id, created_by, is_read, created_at)
         VALUES ?`,
        [values]
      );
    }

    return {
      inserted: values.length,
      skipped: targetUserIds.length - values.length + inactiveSkipped,
      updated: existingIds.length,
      insertedUserIds,
    };
  }

  static async notifyMany(jobs, options = {}) {
    const inputJobs = Array.isArray(jobs) ? jobs : [];
    const allRequestedUserIds = inputJobs.flatMap((job) => normalizeIdList(job.userIds));
    const activeUserIds = new Set(
      await NotificationRecipientService.filterActiveUserIds(allRequestedUserIds)
    );
    let inactiveSkipped = 0;

    const normalizedJobs = inputJobs
      .map((job) => {
        const notification = job.notification || job;
        const requestedUserIds = normalizeIdList(job.userIds);
        const userIds = requestedUserIds.filter((userId) => activeUserIds.has(userId));
        inactiveSkipped += requestedUserIds.length - userIds.length;
        const sourceType = notification.sourceType || job.sourceType || options.sourceType || null;
        const sourceId = notification.sourceId ?? job.sourceId ?? options.sourceId ?? null;
        const hasSource = sourceType && sourceId !== null && sourceId !== undefined;
        return {
          userIds,
          notification,
          sourceType,
          sourceId,
          dedupeBySource: (job.dedupeBySource === true || options.dedupeBySource === true) && hasSource,
          dedupeByDay:
            job.dedupeByDay !== false &&
            options.dedupeByDay !== false &&
            hasSource,
        };
      })
      .filter((job) => job.userIds.length && job.notification?.title);

    if (!normalizedJobs.length) {
      return { inserted: 0, skipped: inactiveSkipped, updated: 0 };
    }

    const existingKeys = new Set();
    const dedupeGroups = new Map();

    for (const job of normalizedJobs) {
      if (!job.dedupeByDay && !job.dedupeBySource) continue;
      const group = dedupeGroups.get(job.sourceType) || {
        sourceIds: new Set(),
        userIds: new Set(),
        dedupeBySource: false,
      };
      group.dedupeBySource = group.dedupeBySource || job.dedupeBySource;
      group.sourceIds.add(job.sourceId);
      for (const userId of job.userIds) {
        group.userIds.add(userId);
      }
      dedupeGroups.set(job.sourceType, group);
    }

    for (const [sourceType, group] of dedupeGroups.entries()) {
      const sourceIds = [...group.sourceIds];
      const userIds = [...group.userIds];
      const [existing] = await pool.query(
        `SELECT source_type, source_id, user_id
         FROM notifications
         WHERE source_type = ?
           AND source_id IN (?)
           AND user_id IN (?)
           AND is_suppressed = 0
           ${group.dedupeBySource ? '' : 'AND created_at >= CURDATE()'}`,
        [sourceType, sourceIds, userIds]
      );

      for (const row of existing) {
        existingKeys.add(`${row.source_type}:${row.source_id}:${row.user_id}`);
      }
    }

    const values = [];
    const pendingKeys = new Set();
    let skipped = 0;

    for (const job of normalizedJobs) {
      for (const userId of job.userIds) {
        const key = job.dedupeByDay || job.dedupeBySource ? `${job.sourceType}:${job.sourceId}:${userId}` : null;
        if (key && (existingKeys.has(key) || pendingKeys.has(key))) {
          skipped += 1;
          continue;
        }

        if (key) pendingKeys.add(key);
        values.push(buildNotificationValue(userId, job.notification, job.sourceType, job.sourceId));
      }
    }

    if (values.length) {
      await pool.query(
        `INSERT INTO notifications
         (user_id, type, title, content, link, link_params, priority, source_type, source_id, created_by, is_read, created_at)
         VALUES ?`,
        [values]
      );
    }

    return { inserted: values.length, skipped: skipped + inactiveSkipped, updated: 0 };
  }
}

module.exports = NotificationService;
