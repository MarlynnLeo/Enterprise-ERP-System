require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mes'
  });

  await c.query(`
    CREATE TABLE IF NOT EXISTS hr_attendance_rules (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      rule_key VARCHAR(100) NOT NULL UNIQUE COMMENT '规则键',
      rule_name VARCHAR(200) NOT NULL COMMENT '规则名称',
      rule_value TEXT NOT NULL COMMENT '规则值(JSON)',
      rule_group VARCHAR(50) DEFAULT '通用' COMMENT '规则分组',
      description TEXT COMMENT '规则说明',
      sort_order INT DEFAULT 0 COMMENT '排序',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考勤规则配置'
  `);

  const rules = [
    ['personal_leave_threshold', '事假扣全勤阈值', JSON.stringify({days: 0.5, desc: '事假超过0.5天扣全勤'}), '请假规则', '事假半天不扣全勤，超过半天扣全勤', 1],
    ['sick_leave_threshold', '病假扣全勤阈值', JSON.stringify({days: 1, desc: '病假超过1天扣全勤'}), '请假规则', '病假1天不扣勤，超过1天扣全勤', 2],
    ['unapproved_leave_policy', '未请假/未批准处理', JSON.stringify({treatment: '旷工', desc: '未请假或请假未批准按旷工处理'}), '请假规则', '未请假或请假未批准按旷工处理', 3],
    ['late_fine_tier1', '迟到罚款1档', JSON.stringify({min_minutes: 1, max_minutes: 15, fine: 10}), '迟到早退', '1~15分钟扣10元', 4],
    ['late_fine_tier2', '迟到罚款2档', JSON.stringify({min_minutes: 15, max_minutes: 30, fine: 20}), '迟到早退', '15~30分钟扣20元', 5],
    ['late_fine_tier3', '迟到罚款3档', JSON.stringify({min_minutes: 30, max_minutes: 120, fine: 30}), '迟到早退', '30分钟~2小时扣30元', 6],
    ['late_cancel_allowance', '迟到取消满勤', JSON.stringify({cancel: true, desc: '迟到早退不发当月满勤100元'}), '迟到早退', '迟到早退不发当月满勤100元', 7],
    ['late_max_count', '迟到上限次数', JSON.stringify({count: 3, desc: '迟到早退超过3次不发满勤'}), '迟到早退', '迟到早退超过3次以上不计发满勤', 8],
    ['full_attendance_bonus', '满勤奖金额', JSON.stringify({amount: 100}), '满勤', '每月满勤奖100元', 9],
    ['weekend_overtime_unit', '周末加班计算', JSON.stringify({unit: '天', desc: '周末加班按天数计算'}), '加班', '周末加班按天数计算', 10],
  ];

  for (const r of rules) {
    await c.query('INSERT IGNORE INTO hr_attendance_rules (rule_key, rule_name, rule_value, rule_group, description, sort_order) VALUES (?,?,?,?,?,?)', r);
  }
  console.log('考勤规则表创建完成，初始规则已插入');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
