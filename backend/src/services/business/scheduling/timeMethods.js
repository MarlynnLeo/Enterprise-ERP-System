/**
 * SchedulingService — time methods (mixin)
 */

const runtime = require('./runtime');
const {
  DEFAULT_WORK_START,
  SQL_DATE_TIME_PATTERN,
} = runtime;

module.exports = {
  _advanceWorkMinutes(start, minutes, calendar, overridesMap = new Map()) {
      const cursor = new Date(start);
      let remaining = minutes;
  
      // 解析全局默认班次时间
      const parseTime = (t) => t ? t.split(':').map(Number) : null;
      const defWs = parseTime(calendar.work_start);
      const defWe = parseTime(calendar.work_end);
      const defBs = parseTime(calendar.break_start || '12:00:00');
      const defBe = parseTime(calendar.break_end || '13:00:00');
      const defDs = parseTime(calendar.dinner_start);
      const defDe = parseTime(calendar.dinner_end);
  
      const toMin = (hm) => hm ? hm[0] * 60 + hm[1] : null;
      const setTime = (d, hm) => { d.setHours(hm[0], hm[1], 0, 0); };
  
      /**
       * 构建一天的工作时段列表（排除所有休息段）
       * @returns {Array<[number,number,number[]]>} [[startMin, endMin, endHM], ...]
       */
      const buildWorkSegments = (ws, we, bs, be, ds, de) => {
        const wsMin = toMin(ws), weMin = toMin(we);
        const breaks = [];
        if (bs && be) breaks.push([toMin(bs), toMin(be), be]);
        if (ds && de) breaks.push([toMin(ds), toMin(de), de]);
        breaks.sort((a, b) => a[0] - b[0]);
  
        const segments = [];
        let segStart = wsMin;
        for (const [bStart, bEnd, bEndHM] of breaks) {
          if (bEnd <= segStart || bStart >= weMin) {
            continue;
          }
          if (bStart > segStart && bStart < weMin) {
            segments.push({ start: segStart, end: Math.min(bStart, weMin), nextBreakEnd: bEndHM });
            segStart = Math.max(bEnd, segStart);
          } else if (bEnd > segStart && bStart < weMin) {
            segStart = Math.max(bEnd, segStart);
          }
          if (segStart >= weMin) break;
        }
        if (segStart < weMin) {
          segments.push({ start: segStart, end: weMin, nextBreakEnd: null });
        }
        return segments;
      };
  
      // 安全保护：最多循环2年，和覆盖日历预加载窗口保持一致
      let safetyCounter = 0;
  
      while (remaining > 0 && safetyCounter < 365 * 2) {
        safetyCounter++;
  
        // 获取当天日期 key
        const dateKey = this._formatDateOnly(cursor);
        const override = overridesMap.get(dateKey);
  
        // 确定当天的班次参数
        let dayWs = defWs, dayWe = defWe;
        let dayBs = defBs, dayBe = defBe;
        let dayDs = defDs, dayDe = defDe;
  
        if (override) {
          if (!override.is_workday) {
            cursor.setDate(cursor.getDate() + 1);
            setTime(cursor, defWs);
            continue;
          }
          if (override.work_start) dayWs = parseTime(override.work_start);
          if (override.work_end) dayWe = parseTime(override.work_end);
          if (override.break_start) dayBs = parseTime(override.break_start);
          if (override.break_end) dayBe = parseTime(override.break_end);
          if (override.dinner_start) dayDs = parseTime(override.dinner_start);
          if (override.dinner_end) dayDe = parseTime(override.dinner_end);
        } else {
          if (calendar.exclude_weekends) {
            const dow = cursor.getDay();
            if (dow === 0 || dow === 6) {
              cursor.setDate(cursor.getDate() + 1);
              setTime(cursor, defWs);
              continue;
            }
          }
        }
  
        const curMinOfDay = cursor.getHours() * 60 + cursor.getMinutes();
        const workStartMin = toMin(dayWs);
        const workEndMin = toMin(dayWe);
  
        // 上班前 → 跳到上班
        if (curMinOfDay < workStartMin) {
          setTime(cursor, dayWs);
          continue;
        }
  
        // 下班后 → 跳到下一天
        if (curMinOfDay >= workEndMin) {
          cursor.setDate(cursor.getDate() + 1);
          setTime(cursor, defWs);
          continue;
        }
  
        // 构建今天的工作时段
        const segments = buildWorkSegments(dayWs, dayWe, dayBs, dayBe, dayDs, dayDe);
  
        // 找到当前所在的时段
        let handled = false;
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
  
          // 在休息段内（当前时间在上一段结束和本段开始之间）
          if (curMinOfDay < seg.start) {
            // 跳到本段开始
            cursor.setHours(Math.floor(seg.start / 60), seg.start % 60, 0, 0);
            handled = true;
            break;
          }
  
          // 在本段内
          if (curMinOfDay >= seg.start && curMinOfDay < seg.end) {
            const availableMinutes = seg.end - curMinOfDay;
  
            if (remaining <= availableMinutes) {
              cursor.setMinutes(cursor.getMinutes() + remaining);
              remaining = 0;
            } else {
              remaining -= availableMinutes;
              // 跳到下一段
              if (i + 1 < segments.length) {
                const next = segments[i + 1];
                cursor.setHours(Math.floor(next.start / 60), next.start % 60, 0, 0);
              } else {
                // 今天最后一段用完，跳到明天
                cursor.setDate(cursor.getDate() + 1);
                setTime(cursor, defWs);
              }
            }
            handled = true;
            break;
          }
        }
  
        if (!handled) {
          // 不在任何工作段内（在最后一个休息段之后、下班之前），跳到下一天
          cursor.setDate(cursor.getDate() + 1);
          setTime(cursor, defWs);
        }
      }
  
      return cursor;
    },

  /**
     * 格式化日期时间为 MySQL 格式
     */
    _formatDateTime(date) {
      if (!(date instanceof Date) || isNaN(date)) return null;
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    },

  /**
     * 格式化日期为 YYYY-MM-DD
     */
    _formatDateOnly(date) {
      if (!(date instanceof Date) || isNaN(date)) return null;
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    },

  _addDays(date, days) {
      const next = new Date(date);
      next.setDate(next.getDate() + days);
      return next;
    },

  _normalizeSqlTime(value, fallback = DEFAULT_WORK_START) {
      if (!value) return fallback;
      const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(value));
      if (!match) return fallback;
      return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}`;
    },

  _isValidDateOnlyString(value) {
      const text = String(value || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
      const parsed = this._parseScheduleDateTime(`${text} 00:00:00`);
      return Boolean(parsed && this._formatDateOnly(parsed) === text);
    },

  _normalizeTaskIds(taskIds) {
      return [...new Set(
        (Array.isArray(taskIds) ? taskIds : [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      )];
    },

  _parseScheduleDateTime(value) {
      if (value instanceof Date) {
        return isNaN(value) ? null : new Date(value);
      }
  
      const text = String(value || '').trim();
      const match = SQL_DATE_TIME_PATTERN.exec(text);
      if (match) {
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
        const date = new Date(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
          0
        );
        if (
          date.getFullYear() === Number(year) &&
          date.getMonth() === Number(month) - 1 &&
          date.getDate() === Number(day)
        ) {
          return date;
        }
        return null;
      }
  
      const parsed = new Date(value);
      return isNaN(parsed) ? null : parsed;
    },

  _parseDateTimeMs(value) {
      if (!value) return NaN;
      const parsed = this._parseScheduleDateTime(value);
      return parsed ? parsed.getTime() : NaN;
    },

  _toIsoFromSqlDateTime(value) {
      const time = this._parseDateTimeMs(value);
      return Number.isFinite(time) ? new Date(time).toISOString() : null;
    },
};
