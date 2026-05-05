const https = require('https');
const db = require('../../../config/db');
const pool = db.pool;
const dingtalkConfig = require('../../../config/dingtalkConfig');
const { logger } = require('../../../utils/logger');

const DINGTALK_ROOT_DEPT_ID = 1;

// 注意：钉钉 HTTPS 请求单独设置 rejectUnauthorized: false（见 requestJSON 方法第29行）

class DingtalkSyncService {

  // 通用 HTTPS 请求封装
  static requestJSON(method, urlString, queryParams = {}, bodyObj = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlString);

      Object.entries(queryParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });

      const body = bodyObj ? JSON.stringify(bodyObj) : null;
      const options = {
        method,
        hostname: url.hostname,
        path: url.pathname + url.search,
        port: url.port || 443,
        rejectUnauthorized: false,
        headers: {},
      };

      if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = https.request(options, (res) => {
        let chunks = '';
        res.on('data', (d) => chunks += d);
        res.on('end', () => {
          try {
            const json = JSON.parse(chunks || '{}');
            resolve(json);
          } catch (err) {
            reject(new Error(`JSON 解析失败: ${err.message}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      if (body) req.write(body);
      req.end();
    });
  }

  // 获取 Access Token
  static async getAccessToken() {
    // 采用与 expense 相同的 dingtalkConfig
    const { appKey, appSecret } = dingtalkConfig;
    if (!appKey || !appSecret) {
      throw new Error('未配置钉钉参数 (appKey或appSecret)，请检查 dingtalkConfig 配置！');
    }

    const url = 'https://oapi.dingtalk.com/gettoken';
    const resp = await this.requestJSON('GET', url, { appkey: appKey, appsecret: appSecret });

    if (resp.errcode !== 0) {
      throw new Error(`获取 access_token 失败: errcode=${resp.errcode}, errmsg=${resp.errmsg}`);
    }
    return resp.access_token;
  }

  // 获取子部门
  static async listSubDepartments(accessToken, deptId) {
    const url = 'https://oapi.dingtalk.com/topapi/v2/department/listsub';
    const resp = await this.requestJSON('POST', url, { access_token: accessToken }, { dept_id: deptId });
    if (resp.errcode !== 0) throw new Error(`获取子部门失败: errcode=${resp.errcode}, errmsg=${resp.errmsg}`);

    const result = resp.result;
    logger.info(`[钉钉] 部门 ${deptId} 的子部门原始返回: ${JSON.stringify(result)}`);

    // 兼容多种返回格式
    // 格式1: result 直接是部门对象数组 [{dept_id:123, name:'xxx'}, ...]
    if (Array.isArray(result)) {
      return result.map(d => Number(d.dept_id));
    }
    // 格式2: result.dept_id_list 是 ID 数组
    if (result && Array.isArray(result.dept_id_list)) {
      return result.dept_id_list.map(id => Number(id));
    }
    // 格式3: result.department 是部门对象数组（兼容旧版）
    if (result && Array.isArray(result.department)) {
      return result.department.map(d => Number(d.dept_id));
    }
    return [];
  }

  // 递归获取所有部门 (根节点一般为1)
  static async getAllDepartmentIds(accessToken, rootDeptId = 1) {
    const allIds = new Set();
    const queue = [rootDeptId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (allIds.has(current)) continue;
      allIds.add(current);

      const children = await this.listSubDepartments(accessToken, current);
      for (const childId of children) {
        if (childId === -7) continue; // 剔除家校通讯录部门
        if (!allIds.has(childId)) queue.push(childId);
      }
    }
    return Array.from(allIds);
  }

  // 获取某个部门下用户
  static async listUsersInDepartment(accessToken, deptId, pageSize = 100) {
    const url = 'https://oapi.dingtalk.com/topapi/v2/user/list';
    const users = [];
    let cursor = 0;
    let hasMore = true;

    while (hasMore) {
      const resp = await this.requestJSON('POST', url, { access_token: accessToken }, {
        dept_id: deptId, cursor, size: pageSize, language: 'zh_CN',
      });
      if (resp.errcode !== 0) throw new Error(`获取部门用户失败: errcode=${resp.errcode}, errmsg=${resp.errmsg}`);

      const result = resp.result || {};
      const list = result.list || [];
      users.push(...list);

      hasMore = result.has_more === true || result.hasMore === true;
      if (hasMore) cursor = result.next_cursor !== null && result.next_cursor !== undefined ? result.next_cursor : result.nextCursor;
    }
    return users;
  }

  // 主流程拉取并写入数据库（含部门同步）
  static async syncAllUsersToDb() {
    logger.info('开始请求钉钉 Access Token...');
    const accessToken = await this.getAccessToken();

    logger.info('开始获取钉钉全公司部门结构...');
    const deptIds = await this.getAllDepartmentIds(accessToken, DINGTALK_ROOT_DEPT_ID);

    // 获取每个部门的名称和父子关系
    const deptNameMap = {};   // deptId -> deptName
    const deptParentMap = {}; // deptId -> parentDeptId
    for (const deptId of deptIds) {
      try {
        const resp = await this.requestJSON('POST', 'https://oapi.dingtalk.com/topapi/v2/department/get',
          { access_token: accessToken }, { dept_id: deptId });
        if (resp.errcode === 0 && resp.result) {
          deptNameMap[deptId] = (resp.result.name || '').trim();
          deptParentMap[deptId] = resp.result.parent_id || DINGTALK_ROOT_DEPT_ID;
        }
      } catch { /* 忽略 */ }
    }
    logger.info(`获取到 ${Object.keys(deptNameMap).length} 个部门名称`);

    // 获取本地 departments 表做名称映射
    const [localDepts] = await pool.query('SELECT id, name FROM departments');
    const localDeptMap = {}; // 部门名 -> 本地id
    for (const d of localDepts) localDeptMap[d.name.trim()] = d.id;

    // 智能匹配函数：精确 -> 去括号/空格模糊 -> 归属父部门 -> 自动创建
    const matchLocalDept = async (deptId) => {
      const name = deptNameMap[deptId] || '';
      if (!name) return null;

      // 1. 精确匹配
      if (localDeptMap[name]) return localDeptMap[name];

      // 2. 去掉中文括号、英文括号后匹配
      const normalized = name.replace(/[（）()]/g, '').trim();
      for (const [localName, localId] of Object.entries(localDeptMap)) {
        const localNorm = localName.replace(/[（）()]/g, '').trim();
        // 精确去括号匹配
        if (normalized === localNorm) return localId;
        // 模糊包含匹配：要求被包含方至少2个字符，且长度不低于另一方的一半
        const minLen = Math.min(normalized.length, localNorm.length);
        if (minLen >= 2 && minLen >= Math.max(normalized.length, localNorm.length) / 2) {
          if (normalized.includes(localNorm) || localNorm.includes(normalized)) {
            return localId;
          }
        }
      }

      // 3. 如果是子部门，尝试归到父部门
      const parentId = deptParentMap[deptId];
      if (parentId && parentId !== DINGTALK_ROOT_DEPT_ID && deptNameMap[parentId]) {
        const parentName = deptNameMap[parentId];
        if (localDeptMap[parentName]) return localDeptMap[parentName];
      }

      // 4. 自动创建本地部门
      try {
        const [result] = await pool.query('INSERT INTO departments (name, status) VALUES (?, ?)', [name, 1]);
        const newId = result.insertId;
        localDeptMap[name] = newId;
        logger.info(`[部门] 自动创建本地部门: ${name} (ID: ${newId})`);
        return newId;
      } catch (e) {
        logger.warn(`[部门] 创建部门 ${name} 失败: ${e.message}`);
        return null;
      }
    };

    logger.info(`获取到 ${deptIds.length} 个部门，开始拉取人员...`);
    const userMap = new Map(); // userId -> { user, _dingDeptId }

    for (const deptId of deptIds) {
      const users = await this.listUsersInDepartment(accessToken, deptId, 100);
      for (const u of users) {
        const userId = u.userid || u.userId;
        if (!userId) continue;
        if (!userMap.has(userId)) {
          userMap.set(userId, { ...u, _dingDeptId: deptId });
        }
      }
    }

    const allUsers = Array.from(userMap.values());
    logger.info(`钉钉全公司去重后成员总数: ${allUsers.length}，准备同步到 HR 花名册...`);

    let newCount = 0;
    let upCount = 0;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const user of allUsers) {
        const userId = user.userid || user.userId;
        const name = user.name || '';
        if (!name) continue;

        // 通过智能匹配找到本地部门ID
        const departmentId = await matchLocalDept(user._dingDeptId);

        const [existing] = await connection.query('SELECT id FROM hr_employees WHERE employee_no = ?', [userId]);

        if (existing.length > 0) {
          // 更新人员名称/状态/部门
          await connection.query(
            'UPDATE hr_employees SET name = ?, employment_status = ?, department_id = COALESCE(?, department_id) WHERE employee_no = ?',
            [name, 'active', departmentId, userId]
          );
          upCount++;
        } else {
          // 新增人员（含部门）
          await connection.query(`
            INSERT INTO hr_employees (employee_no, name, department_id, base_salary, split_base_salary, insurance_type, employment_status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `, [userId, name, departmentId, 3070.0, 1215.0, '有社有公', 'active']);
          newCount++;
        }
      }

      await connection.commit();
      return { total: allUsers.length, newCount, upCount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }


  // ==================== 考勤同步 ====================

  // 通过 getupdatedata 逐用户逐日获取考勤结果
  static async fetchUserDayAttendance(accessToken, userId, dateStr) {
    const url = 'https://oapi.dingtalk.com/topapi/attendance/getupdatedata';
    const resp = await this.requestJSON('POST', url, { access_token: accessToken }, {
      userid: userId,
      work_date: dateStr,
    });
    if (resp.errcode !== 0) return null;
    return resp.result || null;
  }

  // 获取某月所有工作日列表 (YYYY-MM-DD 格式)
  static getWorkdaysInMonth(year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const workdays = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        const pad = n => (n < 10 ? '0' + n : '' + n);
        workdays.push(`${year}-${pad(month)}-${pad(d)}`);
      }
    }
    // 只取到今天为止（不查未来日期）
    const todayStr = new Date().toISOString().split('T')[0];
    return workdays.filter(d => d <= todayStr);
  }

  // 主流程：从钉钉拉取考勤，写入 hr_attendance
  static async syncAttendanceToDb(period) {
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      throw new Error('period 格式必须是 YYYY-MM');
    }

    logger.info(`[考勤] 开始同步 ${period} 月考勤数据...`);
    const accessToken = await this.getAccessToken();

    // 1. 获取全部在职员工
    const [employees] = await pool.query(
      "SELECT id, employee_no, name FROM hr_employees WHERE employment_status = 'active'"
    );
    if (employees.length === 0) throw new Error('没有在职员工，请先同步花名册');

    const userIdList = employees.map(e => e.employee_no).filter(Boolean);
    logger.info(`[考勤] 在职员工 ${userIdList.length} 人`);

    // 2. 获取工作日列表
    const [year, month] = period.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const workdays = this.getWorkdaysInMonth(year, month);
    logger.info(`[考勤] ${period} 月有效工作日 ${workdays.length} 天 (截至今日)`);

    if (workdays.length === 0) {
      throw new Error('该月份尚无可查询的工作日（未来月份或全部为周末）');
    }

    // 3. 逐用户逐日拉取考勤 (使用 getupdatedata API)
    const userStats = {};
    let apiCalls = 0;
    const empNoToId = new Map(employees.map(e => [e.employee_no, e.id]));

    for (let i = 0; i < userIdList.length; i++) {
      const userId = userIdList[i];
      if (i % 10 === 0) {
        logger.info(`[考勤] 正在处理第 ${i + 1}/${userIdList.length} 位员工...`);
      }

      userStats[userId] = {
        employee_id: empNoToId.get(userId),
        normalDays: 0,     // 正常出勤天数
        lateDays: 0,       // 迟到次数
        earlyDays: 0,      // 早退次数
        absentDays: 0,     // 缺卡/旷工次数
        leaveDays: 0,      // 请假天数
        overtimeHours: 0,  // 加班时数
      };

      for (const dateStr of workdays) {
        const result = await this.fetchUserDayAttendance(accessToken, userId, dateStr);
        apiCalls++;

        if (!result) continue;

        // 解析考勤结果列表
        const attResults = result.attendance_result_list || [];
        for (const att of attResults) {
          // check_type: OnDuty(上班) / OffDuty(下班)
          // time_result: Normal/Late/SeriousLate/Early/Absenteeism/NotSigned
          const timeResult = att.time_result || att.timeResult || '';
          if (timeResult === 'Normal') {
            userStats[userId].normalDays += 0.5; // 上班/下班各算0.5天
          } else if (timeResult === 'Late' || timeResult === 'SeriousLate') {
            userStats[userId].lateDays++;
            userStats[userId].normalDays += 0.5;
          } else if (timeResult === 'Early') {
            userStats[userId].earlyDays++;
            userStats[userId].normalDays += 0.5;
          } else if (timeResult === 'Absenteeism' || timeResult === 'NotSigned') {
            userStats[userId].absentDays++;
          }
        }

        // 解析审批列表（请假/加班）
        const approveList = result.approve_list || [];
        for (const appr of approveList) {
          const tagName = appr.tag_name || '';
          const duration = parseFloat(appr.duration || 0);
          if (tagName.includes('请假') || tagName.includes('假')) {
            userStats[userId].leaveDays += (duration / 8); // 时长换算天
          }
          if (tagName.includes('加班')) {
            userStats[userId].overtimeHours += duration;
          }
        }
      }
    }

    logger.info(`[考勤] 共调用 ${apiCalls} 次 API，开始写入数据库...`);

    // 4. 写入数据库
    const weekdays = this.countWeekdays(year, month);
    const connection = await pool.getConnection();
    let savedCount = 0;

    try {
      await connection.beginTransaction();

      for (const emp of employees) {
        const stat = userStats[emp.employee_no] || {};
        const leaveDays = Math.round((stat.leaveDays || 0) * 10) / 10;
        const absentCount = Math.round(((stat.absentDays || 0) / 2) * 10) / 10; // 上下班各一次，除2
        const totalLeave = leaveDays + absentCount;
        const hasAbnormal = (stat.lateDays || 0) > 0 || (stat.earlyDays || 0) > 0 || (stat.absentDays || 0) > 0;
        // 满勤：无异常且无请假
        const fullAttendance = (hasAbnormal || totalLeave > 0) ? 0 : 1;
        const publicHolidays = daysInMonth - weekdays; // 公休天数

        await connection.query(`
          INSERT INTO hr_attendance (employee_id, period, days_in_month, leave_days, vacation_days, overtime_hours, full_attendance, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed')
          ON DUPLICATE KEY UPDATE
            days_in_month = VALUES(days_in_month),
            leave_days = VALUES(leave_days),
            vacation_days = VALUES(vacation_days),
            overtime_hours = VALUES(overtime_hours),
            full_attendance = VALUES(full_attendance),
            status = 'confirmed'
        `, [emp.id, period, 21.75, totalLeave, publicHolidays, stat.overtimeHours || 0, fullAttendance]);
        savedCount++;
      }

      await connection.commit();
      logger.info(`[考勤] ${period} 月考勤同步完成，共处理 ${savedCount} 人`);
      return { period, totalRecords: apiCalls, savedCount };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  // 计算某月工作日数（排除周末）
  static countWeekdays(year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    let weekdays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const day = new Date(year, month - 1, d).getDay();
      if (day !== 0 && day !== 6) weekdays++;
    }
    return weekdays;
  }

}

module.exports = DingtalkSyncService;
