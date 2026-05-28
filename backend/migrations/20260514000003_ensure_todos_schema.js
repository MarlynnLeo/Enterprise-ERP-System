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

async function addColumnIfMissing(knex, tableName, columnName, definition) {
  if (!(await knex.schema.hasColumn(tableName, columnName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
  }
}

async function addIndexIfMissing(knex, tableName, indexName, definition) {
  if (!(await indexExists(knex, tableName, indexName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD ${definition}`);
  }
}

async function addForeignKeyIfMissing(knex, tableName, columnName, referencedTableName, constraintName, definition) {
  if (!(await foreignKeyForColumnExists(knex, tableName, columnName, referencedTableName))) {
    await knex.raw(`ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${constraintName}\` ${definition}`);
  }
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('todos'))) {
    await knex.raw(`
      CREATE TABLE todos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL COMMENT '待办事项所属用户ID',
        creator_id INT NULL COMMENT '创建者用户ID',
        title VARCHAR(100) NOT NULL COMMENT '待办事项标题',
        description TEXT NULL COMMENT '待办事项描述',
        deadline DATETIME NULL COMMENT '截止日期',
        priority INT NOT NULL DEFAULT 2 COMMENT '优先级: 1低, 2中, 3高',
        completed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已完成',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        tags VARCHAR(255) NULL COMMENT '标签',
        is_shared TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为协同任务',
        parent_todo_id INT NULL COMMENT '父任务ID（协同任务的主任务ID）',
        INDEX todos_user_id_index (userId),
        INDEX idx_creator_id (creator_id),
        INDEX idx_parent_todo_id (parent_todo_id),
        UNIQUE KEY uk_todos_user_parent (userId, parent_todo_id),
        CONSTRAINT fk_todos_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_todos_creator FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_todos_parent FOREIGN KEY (parent_todo_id) REFERENCES todos(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='待办事项表'
    `);
  } else {
    await addColumnIfMissing(knex, 'todos', 'creator_id', 'INT NULL COMMENT \'创建者用户ID\' AFTER `userId`');
    await addColumnIfMissing(knex, 'todos', 'is_shared', 'TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'是否为协同任务\'');
    await addColumnIfMissing(knex, 'todos', 'parent_todo_id', 'INT NULL COMMENT \'父任务ID（协同任务的主任务ID）\'');

    await knex.raw('UPDATE `todos` SET `creator_id` = `userId` WHERE `creator_id` IS NULL');
    await knex.raw('UPDATE `todos` SET `is_shared` = 0 WHERE `is_shared` IS NULL');
    await knex.raw(
      'ALTER TABLE `todos` MODIFY COLUMN `is_shared` TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'是否为协同任务\''
    );
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

    await addIndexIfMissing(knex, 'todos', 'todos_user_id_index', 'INDEX `todos_user_id_index` (`userId`)');
    await addIndexIfMissing(knex, 'todos', 'idx_creator_id', 'INDEX `idx_creator_id` (`creator_id`)');
    await addIndexIfMissing(knex, 'todos', 'idx_parent_todo_id', 'INDEX `idx_parent_todo_id` (`parent_todo_id`)');
    await addIndexIfMissing(knex, 'todos', 'uk_todos_user_parent', 'UNIQUE KEY `uk_todos_user_parent` (`userId`, `parent_todo_id`)');

    await addForeignKeyIfMissing(knex, 'todos', 'userId', 'users', 'fk_todos_user', 'FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE');
    await addForeignKeyIfMissing(knex, 'todos', 'creator_id', 'users', 'fk_todos_creator', 'FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL');
    await addForeignKeyIfMissing(knex, 'todos', 'parent_todo_id', 'todos', 'fk_todos_parent', 'FOREIGN KEY (`parent_todo_id`) REFERENCES `todos`(`id`) ON DELETE SET NULL');
  }

  if (!(await knex.schema.hasTable('todo_participants'))) {
    await knex.raw(`
      CREATE TABLE todo_participants (
        id INT AUTO_INCREMENT PRIMARY KEY COMMENT '参与者记录ID',
        todo_id INT NOT NULL COMMENT '任务ID',
        user_id INT NOT NULL COMMENT '参与者用户ID',
        role ENUM('creator','participant') NOT NULL DEFAULT 'participant' COMMENT '角色：creator创建者，participant参与者',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '添加时间',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        UNIQUE KEY uk_todo_user (todo_id, user_id),
        INDEX idx_todo_id (todo_id),
        INDEX idx_user_id (user_id),
        CONSTRAINT fk_todo_participants_todo FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
        CONSTRAINT fk_todo_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='待办事项参与者表'
    `);
  } else {
    await knex.raw('UPDATE `todo_participants` SET `role` = \'participant\' WHERE `role` IS NULL');
    await knex.raw(`
      DELETE tp
      FROM todo_participants tp
      LEFT JOIN todos t ON t.id = tp.todo_id
      WHERE t.id IS NULL
    `);
    await knex.raw(`
      DELETE tp
      FROM todo_participants tp
      LEFT JOIN users u ON u.id = tp.user_id
      WHERE u.id IS NULL
    `);
    await knex.raw(
      'ALTER TABLE `todo_participants` MODIFY COLUMN `role` ENUM(\'creator\',\'participant\') NOT NULL DEFAULT \'participant\' COMMENT \'角色：creator创建者，participant参与者\''
    );
    await addIndexIfMissing(knex, 'todo_participants', 'uk_todo_user', 'UNIQUE KEY `uk_todo_user` (`todo_id`, `user_id`)');
    await addIndexIfMissing(knex, 'todo_participants', 'idx_todo_id', 'INDEX `idx_todo_id` (`todo_id`)');
    await addIndexIfMissing(knex, 'todo_participants', 'idx_user_id', 'INDEX `idx_user_id` (`user_id`)');
    await addForeignKeyIfMissing(knex, 'todo_participants', 'todo_id', 'todos', 'fk_todo_participants_todo', 'FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON DELETE CASCADE');
    await addForeignKeyIfMissing(knex, 'todo_participants', 'user_id', 'users', 'fk_todo_participants_user', 'FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE');
  }
};

exports.down = async function down() {
  // Schema safety migration: do not drop user todo data on rollback.
};
