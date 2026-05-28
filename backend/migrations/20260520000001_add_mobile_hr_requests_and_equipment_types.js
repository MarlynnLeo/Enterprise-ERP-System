exports.up = async function(knex) {
  const hasEquipmentTypes = await knex.schema.hasTable('equipment_types');
  if (!hasEquipmentTypes) {
    await knex.schema.createTable('equipment_types', table => {
      table.increments('id').primary();
      table.string('code', 50).notNullable().unique().comment('类别编码');
      table.string('name', 100).notNullable().unique().comment('类别名称');
      table.string('manufacturer', 100).nullable().comment('默认厂商');
      table.text('description').nullable().comment('类别说明');
      table.string('status', 20).notNullable().defaultTo('active').comment('状态: active/inactive');
      table.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.integer('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
      table.index(['status']);
    });
  }

  const hasLeaveRequests = await knex.schema.hasTable('hr_leave_requests');
  if (!hasLeaveRequests) {
    await knex.schema.createTable('hr_leave_requests', table => {
      table.increments('id').primary();
      table.string('request_no', 60).notNullable().unique().comment('申请编号');
      table.integer('applicant_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.integer('employee_id').unsigned().nullable().references('id').inTable('hr_employees').onDelete('SET NULL');
      table.string('leave_type', 50).notNullable().comment('请假类型');
      table.date('start_date').notNullable().comment('开始日期');
      table.date('end_date').notNullable().comment('结束日期');
      table.decimal('duration', 8, 2).notNullable().defaultTo(0).comment('请假天数');
      table.text('reason').notNullable().comment('请假事由');
      table.string('status', 20).notNullable().defaultTo('pending').comment('状态: pending/approved/rejected/withdrawn');
      table.integer('workflow_instance_id').nullable().comment('工作流实例ID');
      table.string('workflow_status', 30).notNullable().defaultTo('not_started').comment('工作流状态');
      table.text('workflow_error').nullable().comment('工作流启动错误');
      table.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.integer('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
      table.index(['status']);
      table.index(['applicant_user_id']);
      table.index(['employee_id']);
      table.index(['workflow_instance_id']);
    });
  }

  const hasOvertimeRequests = await knex.schema.hasTable('hr_overtime_requests');
  if (!hasOvertimeRequests) {
    await knex.schema.createTable('hr_overtime_requests', table => {
      table.increments('id').primary();
      table.string('request_no', 60).notNullable().unique().comment('申请编号');
      table.integer('applicant_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.integer('employee_id').unsigned().nullable().references('id').inTable('hr_employees').onDelete('SET NULL');
      table.date('overtime_date').notNullable().comment('加班日期');
      table.string('start_time', 20).nullable().comment('开始时间');
      table.string('end_time', 20).nullable().comment('结束时间');
      table.decimal('hours', 8, 2).notNullable().defaultTo(0).comment('加班小时');
      table.string('overtime_type', 50).notNullable().comment('加班类型');
      table.text('reason').notNullable().comment('加班原因');
      table.string('status', 20).notNullable().defaultTo('pending').comment('状态: pending/approved/rejected/withdrawn');
      table.integer('workflow_instance_id').nullable().comment('工作流实例ID');
      table.string('workflow_status', 30).notNullable().defaultTo('not_started').comment('工作流状态');
      table.text('workflow_error').nullable().comment('工作流启动错误');
      table.integer('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.integer('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL');
      table.timestamps(true, true);
      table.index(['status']);
      table.index(['applicant_user_id']);
      table.index(['employee_id']);
      table.index(['workflow_instance_id']);
    });
  }
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('hr_overtime_requests');
  await knex.schema.dropTableIfExists('hr_leave_requests');
  await knex.schema.dropTableIfExists('equipment_types');
};
