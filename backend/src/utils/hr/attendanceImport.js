'use strict';

const COLUMNS = [
  ['employee_no', ['工号', '员工工号', '员工编号', '员工编码']],
  ['name', ['姓名', '员工姓名']],
  ['dept', ['部门']],
  ['full_work_days', ['全勤天数', '全勤天']],
  ['actual_work_days', ['在职天数', '在勤天数', '在职天', '在勤天']],
  ['absent_from_position', ['不在职天数', '不在职天', '不在职']],
  ['personal_leave_days', ['事假天数', '事假天', '事假']],
  ['sick_leave_days', ['病假天数', '病假天', '病假']],
  ['total_leave_days', ['天数合计']],
  ['public_holiday_days', ['公休天数', '公休']],
  ['late_count', ['迟到次数', '迟到']],
  ['missing_punch_count', ['缺卡次数', '缺卡']],
  ['total_violation_count', ['次数合计']],
  ['serious_late_overtime', ['严重迟到']],
  ['normal_overtime', ['正常加班', '正常晚', '加班']],
  ['saturday_overtime', ['周六加班', '周六']],
  ['weekend_overtime', ['周末加班', '周末']],
  ['remark', ['备注']],
];

const text = (value) => String(value ?? '').trim();
function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function buildAttendanceColumnMap(headers) {
  const mapping = {};
  const assigned = new Set();
  headers.forEach((value, index) => {
    const header = text(value).replace(/\s/g, '');
    const matches = COLUMNS.flatMap(([key, aliases]) =>
      aliases
        .filter((alias) => header.includes(alias))
        .map((alias) => ({ key, score: alias === header ? 10000 + alias.length : alias.length }))
    );
    if (!matches.length) return;
    matches.sort((a, b) => b.score - a.score);
    const best = matches[0];
    if (
      matches.some((match) => match.score === best.score && match.key !== best.key) ||
      assigned.has(best.key)
    ) {
      throw invalid(`第 ${index + 1} 列“${header}”与其他考勤列重复或含义不明确，请调整表头`);
    }
    assigned.add(best.key);
    mapping[index] = best.key;
  });
  if (!assigned.has('employee_no') && !assigned.has('name'))
    throw invalid('考勤表必须包含工号或姓名');
  return mapping;
}

function createEmployeeResolver(employees) {
  const byNumber = new Map();
  const byName = new Map();
  for (const employee of employees) {
    const number = text(employee.employee_no);
    const name = text(employee.name);
    if (number) byNumber.set(number, [...(byNumber.get(number) || []), employee]);
    if (name) byName.set(name, [...(byName.get(name) || []), employee]);
  }
  const seen = new Set();
  return (row, rowNumber) => {
    const number = text(row.employee_no);
    const name = text(row.name);
    if (!number && !name) return null;
    const matches = (number ? byNumber.get(number) : byName.get(name)) || [];
    if (number && !matches.length) throw invalid(`第 ${rowNumber} 行工号“${number}”不存在`);
    if (matches.length > 1)
      throw invalid(`第 ${rowNumber} 行员工“${name || number}”存在重名或重复工号，请使用唯一工号`);
    if (!matches.length) return null;
    const employee = matches[0];
    if (number && name && text(employee.name) !== name)
      throw invalid(`第 ${rowNumber} 行工号与姓名不一致`);
    if (seen.has(employee.id))
      throw invalid(`第 ${rowNumber} 行重复导入员工“${employee.name}”，请保留一条月度考勤`);
    seen.add(employee.id);
    return employee;
  };
}

module.exports = { buildAttendanceColumnMap, createEmployeeResolver };
