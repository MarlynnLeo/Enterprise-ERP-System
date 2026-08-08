/**
 * Shared runtime deps for SchedulingService mixins.
 */
const { pool } = require('../../../config/db');
const { logger } = require('../../../utils/logger');

const MAX_SCHEDULE_LOOKAHEAD_DAYS = 365 * 2;
const DEFAULT_CALENDAR_IMPACT_DAYS = 180;
const DEFAULT_WORK_START = '08:00:00';
const DEFAULT_WORK_END = '17:30:00';
const SQL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const SCHEDULABLE_STATUSES = new Set(['pending', 'allocated', 'preparing']);

module.exports = {
  pool,
  logger,
  MAX_SCHEDULE_LOOKAHEAD_DAYS,
  DEFAULT_CALENDAR_IMPACT_DAYS,
  DEFAULT_WORK_START,
  DEFAULT_WORK_END,
  SQL_DATE_TIME_PATTERN,
  SCHEDULABLE_STATUSES,
};
