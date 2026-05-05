const db = require('../../../config/db');
const pool = db.pool;
const { logger } = require('../../../utils/logger');

class SalaryService {
  /**
   * 薪酬核算引擎 (Salary Calculation Engine)
   * 基于 hr_attendance_rules 表动态加载规则，不硬编码业务参数。
   *
   * @param {string} period 'YYYY-MM'
   */
  static async calculatePeriodSalary(period) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 0. 加载考勤规则配置
      const [rulesRows] = await connection.query('SELECT rule_key, rule_value FROM hr_attendance_rules');
      const ruleMap = {};
      for (const r of rulesRows) {
        try { ruleMap[r.rule_key] = JSON.parse(r.rule_value); } catch { ruleMap[r.rule_key] = {}; }
      }

      // 从规则表读取关键参数（提供默认值兜底）
      const fullAttBonus = ruleMap.full_attendance_bonus?.amount ?? 100;
      const lateMaxCount = ruleMap.late_max_count?.count ?? 3;
      const lateTiers = [
        { min: ruleMap.late_fine_tier1?.min_minutes ?? 1,  max: ruleMap.late_fine_tier1?.max_minutes ?? 15,  fine: ruleMap.late_fine_tier1?.fine ?? 10 },
        { min: ruleMap.late_fine_tier2?.min_minutes ?? 15, max: ruleMap.late_fine_tier2?.max_minutes ?? 30,  fine: ruleMap.late_fine_tier2?.fine ?? 20 },
        { min: ruleMap.late_fine_tier3?.min_minutes ?? 30, max: ruleMap.late_fine_tier3?.max_minutes ?? 120, fine: ruleMap.late_fine_tier3?.fine ?? 30 },
      ];
      const cancelOnLate = ruleMap.late_cancel_allowance?.cancel ?? true;
      logger.info(`[薪酬] 加载规则: 满勤奖=${fullAttBonus}元, 迟到上限=${lateMaxCount}次, 迟到每次罚款=${lateTiers.map(t => t.fine).join('/')}`);

      // 1. 获取当月所有有效的考勤记录和对应的员工基数
      const [attendances] = await connection.query(`
        SELECT a.*, e.base_salary, e.split_base_salary, e.insurance_type, e.employment_status,
               e.position_allowance, e.housing_allowance, e.meal_allowance, e.overtime_rate
        FROM hr_attendance a
        JOIN hr_employees e ON a.employee_id = e.id
        WHERE a.period = ? AND e.employment_status = 'active'
      `, [period]);

      if (attendances.length === 0) {
        throw new Error('未找到该月相关的考勤基础数据，请先录入/确认考勤表。');
      }

      // 2. 清理当月未审批的旧账单（防止重复累加，幂等性）
      // [修复 B3] 删除所有非 approved 的记录，而非只删 draft
      await connection.query(`
        DELETE FROM hr_salary_records 
        WHERE period = ? AND status != 'approved'
      `, [period]);

      // 获取已确认的员工ID列表（跳过已 approved 的工资单）
      const [approvedRows] = await connection.query(
        'SELECT employee_id FROM hr_salary_records WHERE period = ? AND status = ?',
        [period, 'approved']
      );
      const approvedEmpIds = new Set(approvedRows.map(r => r.employee_id));

      // 3. 执行单条核算（跳过已确认的工资单）
      const salaryRecords = [];
      for (const att of attendances) {
        // 已审批的员工跳过，不重复生成
        if (approvedEmpIds.has(att.employee_id)) continue;

        // --- A. 基本常数转换 ---
        const base = parseFloat(att.base_salary || 0);
        const daysInMonth = parseFloat(att.days_in_month || 21.75);
        const dailyWage = daysInMonth > 0 ? (base / daysInMonth) : 0;
        const hourlyWage = parseFloat(att.overtime_rate || 20.0);

        // --- B. 请假扣款（仅扣请假天数，不扣公休天数） ---
        // [修复 L2+L3] vacation_days 是公休天数（周末/法定假日），不应扣工资
        const leaveDays = parseFloat(att.leave_days || 0);
        const leaveDeduction = -(leaveDays * dailyWage);

        // --- C. 迟到罚款计算（联动 hr_attendance_rules 三档规则） ---
        // [修复 L4] 从考勤表读取迟到次数，按规则梯度扣款
        const lateCount = parseInt(att.late_count) || 0;
        const missingCount = parseInt(att.missing_punch_count) || 0;
        // 注意：目前 Excel 只导入了「迟到次数」，无具体分钟数，暂按最低档罚款计算
        // 后续如有分钟级数据可按梯度细化
        const lateFine = lateCount > 0 ? -(lateCount * (lateTiers[0]?.fine || 10)) : 0;

        // --- D. 加项 ---
        const overtimePay = parseFloat(att.overtime_hours || 0) * hourlyWage;
        const positionAllowance = parseFloat(att.position_allowance || 150.0);
        const housingAllowance = parseFloat(att.housing_allowance || 78.57);
        const mealAllowance = parseFloat(att.meal_allowance || 102.14);
        const personalPerf = 0;
        const teamPerf = 0;

        // --- E. 满勤判断 ---
        // [修复 L1] 基于实际迟到/缺卡数据判断，不依赖 Excel 中的 full_attendance 标记
        let fullAttendance = 0;
        if (lateCount === 0 && missingCount === 0 && leaveDays === 0) {
          // 完全无异常：发满勤奖
          fullAttendance = fullAttBonus;
        } else if (lateCount > 0 && lateCount <= lateMaxCount && missingCount === 0) {
          // 迟到在允许次数内：根据 cancelOnLate 规则决定是否发满勤
          fullAttendance = cancelOnLate ? 0 : fullAttBonus;
        }
        // 迟到超过上限 或 有缺卡：不发满勤 (fullAttendance 保持 0)

        // --- F. 汇总（四舍五入到分，防止浮点误差） ---
        const round2 = v => Math.round(v * 100) / 100;
        const grossSalary = round2(base + overtimePay + positionAllowance + housingAllowance
                          + mealAllowance + fullAttendance + personalPerf + teamPerf
                          + leaveDeduction + lateFine);

        // 五险一金 按基数比例计算
        let pension = 0;
        let housingFund = 0;
        if (att.insurance_type === '有社有公') {
          pension = round2(-(base * 0.105));     // 社保个人部分约10.5%
          housingFund = round2(-(base * 0.05));   // 公积金个人5%
        } else if (att.insurance_type === '有社无公') {
          pension = round2(-(base * 0.105));
        }

        const netSalary = round2(grossSalary + pension + housingFund);

        // --- G. 拆分明细 ---
        const splitBase = parseFloat(att.split_base_salary || base / 2);
        const splitBonus = round2(grossSalary - splitBase - overtimePay - mealAllowance - housingAllowance);
        const splitDetails = JSON.stringify({
          '基本工资.1': splitBase.toFixed(2),
          '加班费': overtimePay.toFixed(2),
          '餐补': mealAllowance.toFixed(2),
          '交通补/房补': housingAllowance.toFixed(2),
          '迟到罚款': lateFine.toFixed(2),
          '奖金': splitBonus.toFixed(2),
          '满勤奖': fullAttendance.toFixed(2),
          '应发工资.1': grossSalary.toFixed(2),
          '代扣社保费': pension.toFixed(2),
          '代扣住房公积金': housingFund.toFixed(2),
          '实发工资.1': netSalary.toFixed(2)
        });

        salaryRecords.push([
          att.employee_id, period, att.id, base, round2(dailyWage), hourlyWage,
          round2(overtimePay), positionAllowance, personalPerf, teamPerf,
          housingAllowance, 0, mealAllowance, fullAttendance, 0,
          round2(leaveDeduction + lateFine), pension, housingFund, 0, 0,
          grossSalary, netSalary, splitDetails, 'draft'
        ]);
      }

      // 4. 批量保存到DB
      if (salaryRecords.length > 0) {
        const query = `
          INSERT INTO hr_salary_records (
            employee_id, period, attendance_id, base_salary, daily_wage, hourly_wage,
            overtime_pay, position_allowance, personal_performance, team_performance,
            housing_allowance, transport_allowance, meal_allowance, full_attendance_bonus,
            other_bonus, leave_deduction, pension, housing_fund, tax, other_deductions,
            gross_salary, net_salary, split_details, status
          ) VALUES ?
        `;
        await connection.query(query, [salaryRecords]);
      }

      await connection.commit();
      return salaryRecords.length;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = SalaryService;

