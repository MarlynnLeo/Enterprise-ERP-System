/**
 * todo.js
 * @description 数据模型文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { logger } = require('../utils/logger');
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Todo = sequelize.define(
    'Todo',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'userId',
        references: {
          model: 'users',
          key: 'id',
        },
        comment: '待办事项所属用户ID',
      },
      creatorId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'creator_id',
        references: {
          model: 'users',
          key: 'id',
        },
        comment: '创建者用户ID',
      },
      isShared: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_shared',
        comment: '是否为协同任务',
      },
      parentTodoId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        field: 'parent_todo_id',
        references: {
          model: 'todos',
          key: 'id',
        },
        comment: '父任务ID（协同任务的主任务ID）',
      },
      title: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: '待办事项标题',
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: '待办事项描述',
      },
      deadline: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: '截止日期',
      },
      priority: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 2,
        comment: '优先级: 1低, 2中, 3高',
      },
      completed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否已完成',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'createdAt',
        comment: '创建时间',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'updatedAt',
        comment: '更新时间',
      },
    },
    {
      tableName: 'todos',
      timestamps: true,
      underscored: false,
      indexes: [
        {
          name: 'todos_user_id_index',
          fields: ['userId'],
        },
        {
          name: 'idx_creator_id',
          fields: ['creator_id'],
        },
        {
          name: 'idx_parent_todo_id',
          fields: ['parent_todo_id'],
        },
        {
          name: 'uk_todos_user_parent',
          unique: true,
          fields: ['userId', 'parent_todo_id'],
        },
      ],
    }
  );

  Todo.associate = (models) => {
    // 与所属用户表关联
    if (models.User) {
      Todo.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
      });

      // 与创建者关联
      Todo.belongsTo(models.User, {
        foreignKey: 'creatorId',
        as: 'creator',
      });
    } else {
      logger.warn('警告: 找不到User模型，无法建立关联关系');
    }

    // 与父任务关联
    Todo.belongsTo(models.Todo, {
      foreignKey: 'parentTodoId',
      as: 'parentTodo',
    });

    // 与子任务关联
    Todo.hasMany(models.Todo, {
      foreignKey: 'parentTodoId',
      as: 'childTodos',
    });

    // 与参与者关联
    if (models.TodoParticipant) {
      Todo.hasMany(models.TodoParticipant, {
        foreignKey: 'todoId',
        as: 'participants',
      });
    }
  };

  return Todo;
};
