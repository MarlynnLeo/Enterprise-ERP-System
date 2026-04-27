/**
 * 即时通讯功能 - 数据库表
 * @description 创建聊天会话和消息表
 */

exports.up = async function (knex) {
  // 聊天会话表（支持单聊和群聊）
  await knex.schema.createTable('chat_conversations', (table) => {
    table.increments('id').primary();
    table.string('name', 100).nullable().comment('会话名称（群聊用）');
    table.enum('type', ['private', 'group']).defaultTo('private').comment('会话类型');
    table.integer('created_by').unsigned().notNullable().comment('创建者');
    table.timestamp('last_message_at').nullable().comment('最后消息时间');
    table.string('last_message_preview', 200).nullable().comment('最后消息预览');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['last_message_at'], 'idx_conv_last_msg');
    table.index(['created_by'], 'idx_conv_creator');
  });

  // 会话成员表
  await knex.schema.createTable('chat_conversation_members', (table) => {
    table.increments('id').primary();
    table.integer('conversation_id').unsigned().notNullable();
    table.integer('user_id').unsigned().notNullable();
    table.integer('unread_count').unsigned().defaultTo(0).comment('未读消息数');
    table.timestamp('last_read_at').nullable().comment('最后阅读时间');
    table.timestamp('joined_at').defaultTo(knex.fn.now());

    table.foreign('conversation_id').references('chat_conversations.id').onDelete('CASCADE');
    table.unique(['conversation_id', 'user_id']);
    table.index(['user_id'], 'idx_member_user');
  });

  // 聊天消息表
  await knex.schema.createTable('chat_messages', (table) => {
    table.increments('id').primary();
    table.integer('conversation_id').unsigned().notNullable();
    table.integer('sender_id').unsigned().notNullable();
    table.text('content').notNullable().comment('消息内容');
    table.enum('type', ['text', 'image', 'file', 'system']).defaultTo('text').comment('消息类型');
    table.string('file_url', 500).nullable().comment('文件URL');
    table.string('file_name', 200).nullable().comment('文件名');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.foreign('conversation_id').references('chat_conversations.id').onDelete('CASCADE');
    table.index(['conversation_id', 'created_at'], 'idx_msg_conv_time');
    table.index(['sender_id'], 'idx_msg_sender');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('chat_conversation_members');
  await knex.schema.dropTableIfExists('chat_conversations');
};
