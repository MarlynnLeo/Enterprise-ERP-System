async function indexExists(knex, tableName, indexName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND index_name = ?`,
    [tableName, indexName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function foreignKeyExists(knex, tableName, constraintName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = ?`,
    [tableName, constraintName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function foreignKeyForColumnExists(knex, tableName, columnName, referencedTableName) {
  const [rows] = await knex.raw(
    `SELECT COUNT(*) AS count
     FROM information_schema.key_column_usage
     WHERE constraint_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
       AND referenced_table_name = ?`,
    [tableName, columnName, referencedTableName]
  );

  return Number(rows[0]?.count || 0) > 0;
}

async function addIndexIfMissing(knex, tableName, indexName, definition) {
  if (!(await indexExists(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

async function addForeignKeyIfMissing(knex, tableName, constraintName, columnName, referencedTableName, definition) {
  const hasConstraint = await foreignKeyExists(knex, tableName, constraintName);
  const hasColumnConstraint = await foreignKeyForColumnExists(knex, tableName, columnName, referencedTableName);

  if (!hasConstraint && !hasColumnConstraint) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`);
  }
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('todos')) || !(await knex.schema.hasTable('todo_participants'))) {
    return;
  }

  if (await knex.schema.hasColumn('todos', 'is_shared')) {
    await knex.raw('UPDATE `todos` SET `is_shared` = 0 WHERE `is_shared` IS NULL');
    await knex.raw(
      'ALTER TABLE `todos` MODIFY COLUMN `is_shared` TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'是否为协同任务\''
    );
  }

  if (await knex.schema.hasColumn('todo_participants', 'role')) {
    await knex.raw(
      'UPDATE `todo_participants` SET `role` = \'participant\' WHERE `role` IS NULL'
    );
    await knex.raw(
      'ALTER TABLE `todo_participants` MODIFY COLUMN `role` ENUM(\'creator\',\'participant\') NOT NULL DEFAULT \'participant\' COMMENT \'角色：creator创建者，participant参与者\''
    );
  }

  await knex.raw(`
    DELETE t1
    FROM todos t1
    JOIN todos t2
      ON t1.userId = t2.userId
     AND t1.parent_todo_id = t2.parent_todo_id
     AND t1.parent_todo_id IS NOT NULL
     AND t1.id > t2.id
  `);

  await knex.raw(`
    UPDATE todos t
    LEFT JOIN users u ON u.id = t.creator_id
    SET t.creator_id = NULL
    WHERE t.creator_id IS NOT NULL
      AND u.id IS NULL
  `);

  await knex.raw(`
    UPDATE todos child
    LEFT JOIN todos parent ON parent.id = child.parent_todo_id
    SET child.parent_todo_id = NULL
    WHERE child.parent_todo_id IS NOT NULL
      AND parent.id IS NULL
  `);

  await knex.raw(`
    DELETE tp
    FROM todo_participants tp
    LEFT JOIN todos t ON t.id = tp.todo_id
    WHERE t.id IS NULL
  `);

  await addIndexIfMissing(
    knex,
    'todos',
    'uk_todos_user_parent',
    'UNIQUE KEY `uk_todos_user_parent` (`userId`, `parent_todo_id`)'
  );

  await addForeignKeyIfMissing(
    knex,
    'todos',
    'fk_todos_creator',
    'creator_id',
    'users',
    'FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL'
  );

  await addForeignKeyIfMissing(
    knex,
    'todos',
    'fk_todos_parent',
    'parent_todo_id',
    'todos',
    'FOREIGN KEY (`parent_todo_id`) REFERENCES `todos`(`id`) ON DELETE SET NULL'
  );

  await addForeignKeyIfMissing(
    knex,
    'todo_participants',
    'fk_todo_participants_todo',
    'todo_id',
    'todos',
    'FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON DELETE CASCADE'
  );
};

exports.down = async function down(knex) {
  if (await foreignKeyExists(knex, 'todo_participants', 'fk_todo_participants_todo')) {
    await knex.raw('ALTER TABLE `todo_participants` DROP FOREIGN KEY `fk_todo_participants_todo`');
  }

  if (await foreignKeyExists(knex, 'todos', 'fk_todos_parent')) {
    await knex.raw('ALTER TABLE `todos` DROP FOREIGN KEY `fk_todos_parent`');
  }

  if (await foreignKeyExists(knex, 'todos', 'fk_todos_creator')) {
    await knex.raw('ALTER TABLE `todos` DROP FOREIGN KEY `fk_todos_creator`');
  }

  if (await indexExists(knex, 'todos', 'uk_todos_user_parent')) {
    await knex.raw('ALTER TABLE `todos` DROP INDEX `uk_todos_user_parent`');
  }

  if (await knex.schema.hasColumn('todo_participants', 'role')) {
    await knex.raw(
      'ALTER TABLE `todo_participants` MODIFY COLUMN `role` ENUM(\'creator\',\'participant\') DEFAULT \'participant\' COMMENT \'角色：creator创建者，participant参与者\''
    );
  }

  if (await knex.schema.hasColumn('todos', 'is_shared')) {
    await knex.raw(
      'ALTER TABLE `todos` MODIFY COLUMN `is_shared` TINYINT(1) DEFAULT 0 COMMENT \'是否为协同任务\''
    );
  }
};
