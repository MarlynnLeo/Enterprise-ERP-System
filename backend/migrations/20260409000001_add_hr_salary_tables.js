exports.up = function(knex) {
  return knex.schema
    // 1. 员工核心数据表 hr_employees
    .createTable('hr_employees', table => {
      table.increments('id').primary();
      table.string('employee_no', 50).notNullable().unique().comment('员工工号');
      table.integer('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.string('name', 100).notNullable().comment('姓名');
      table.integer('department_id').nullable().references('id').inTable('departments').onDelete('SET NULL');
      table.string('id_card', 50).nullable().comment('身份证号');
      table.date('join_date').nullable().comment('入职日期');
      table.date('leave_date').nullable().comment('离职日期');
      table.string('employment_status', 20).defaultTo('active').comment('在职状态：active, left');
      
      // 薪资基数
      table.decimal('base_salary', 10, 2).defaultTo(0).comment('核心基本工资');
      table.decimal('split_base_salary', 10, 2).defaultTo(0).comment('拆分基数（基本工资.1）');
      table.string('insurance_type', 50).nullable().comment('五险一金缴纳状态：有社有公等');

      table.timestamps(true, true);
    })
    
    // 2. 考勤数据表 hr_attendance (月度)
    .createTable('hr_attendance', table => {
      table.increments('id').primary();
      table.integer('employee_id').unsigned().notNullable().references('id').inTable('hr_employees').onDelete('CASCADE');
      table.string('period', 20).notNullable().comment('考勤周期，例如 2026-02');
      table.decimal('days_in_month', 5, 2).defaultTo(21.75).comment('该月计薪总天数');
      
      // 考勤细节
      table.decimal('leave_days', 5, 2).defaultTo(0).comment('请假/缺勤天数');
      table.decimal('vacation_days', 5, 2).defaultTo(0).comment('休假天数（计入扣减）');
      table.decimal('overtime_hours', 5, 2).defaultTo(0).comment('加班小时数');
      table.boolean('full_attendance').defaultTo(false).comment('是否有全勤奖');
      table.string('status', 20).defaultTo('pending').comment('考勤状态：pending, confirmed');
      
      table.timestamps(true, true);
      table.unique(['employee_id', 'period']);
    })
    
    // 3. 薪酬账单表 hr_salary_records
    .createTable('hr_salary_records', table => {
      table.increments('id').primary();
      table.integer('employee_id').unsigned().notNullable().references('id').inTable('hr_employees').onDelete('CASCADE');
      table.string('period', 20).notNullable().comment('账单周期，例如 2026-02');
      table.integer('attendance_id').unsigned().nullable().references('id').inTable('hr_attendance').onDelete('SET NULL');
      
      // Base calculation params
      table.decimal('base_salary', 10, 2).defaultTo(0).comment('基本工资');
      table.decimal('daily_wage', 10, 2).defaultTo(0).comment('日工资');
      table.decimal('hourly_wage', 10, 2).defaultTo(0).comment('小时工资');

      // Earnings
      table.decimal('piece_wage', 10, 2).defaultTo(0).comment('计件工资');
      table.decimal('overtime_pay', 10, 2).defaultTo(0).comment('加班工资');
      table.decimal('position_allowance', 10, 2).defaultTo(0).comment('职位/外检补贴');
      table.decimal('personal_performance', 10, 2).defaultTo(0).comment('个人绩效');
      table.decimal('team_performance', 10, 2).defaultTo(0).comment('团队绩效');
      table.decimal('housing_allowance', 10, 2).defaultTo(0).comment('住房补贴');
      table.decimal('transport_allowance', 10, 2).defaultTo(0).comment('交通补贴');
      table.decimal('meal_allowance', 10, 2).defaultTo(0).comment('伙食补');
      table.decimal('full_attendance_bonus', 10, 2).defaultTo(0).comment('月全勤奖');
      table.decimal('other_bonus', 10, 2).defaultTo(0).comment('超产奖/质量奖/其他加项');

      // Deductions
      table.decimal('leave_deduction', 10, 2).defaultTo(0).comment('请假缺勤扣除(负数)');
      table.decimal('pension', 10, 2).defaultTo(0).comment('养老保险社保扣款');
      table.decimal('housing_fund', 10, 2).defaultTo(0).comment('住房公积金扣款');
      table.decimal('tax', 10, 2).defaultTo(0).comment('个税的代扣');
      table.decimal('other_deductions', 10, 2).defaultTo(0).comment('其他扣款');

      // Totals
      table.decimal('gross_salary', 10, 2).defaultTo(0).comment('应发工资');
      table.decimal('net_salary', 10, 2).defaultTo(0).comment('实发工资');

      // Split record (right side of excel)
      table.json('split_details').nullable().comment('分账明细(如应发工资.1/代扣)');

      table.string('status', 20).defaultTo('draft').comment('状态：draft, approved, paid');
      table.timestamps(true, true);
      table.unique(['employee_id', 'period']);
    });
};

exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('hr_salary_records')
    .dropTableIfExists('hr_attendance')
    .dropTableIfExists('hr_employees');
};
