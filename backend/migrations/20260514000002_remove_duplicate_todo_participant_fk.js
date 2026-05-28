async function getTodoParticipantTodoForeignKeys(knex) {
  const [rows] = await knex.raw(
    `SELECT constraint_name AS constraintName
     FROM information_schema.key_column_usage
     WHERE constraint_schema = DATABASE()
       AND table_name = 'todo_participants'
       AND column_name = 'todo_id'
       AND referenced_table_name = 'todos'
     ORDER BY constraint_name`
  );

  return rows.map((row) => row.constraintName);
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('todo_participants'))) {
    return;
  }

  const constraintNames = await getTodoParticipantTodoForeignKeys(knex);
  if (constraintNames.length <= 1 || !constraintNames.includes('fk_todo_participants_todo')) {
    return;
  }

  await knex.raw('ALTER TABLE `todo_participants` DROP FOREIGN KEY `fk_todo_participants_todo`');
};

exports.down = async function down() {
  // No-op: the previous migration adds the missing todo_id foreign key when none exists.
};
