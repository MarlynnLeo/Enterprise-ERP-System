/**
 * todoController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');

const models = require('../../models');
const { Op } = require('sequelize');

const VALID_PRIORITIES = new Set([1, 2, 3]);

// 状态常量
const STATUS = {
  TODO: {
    COMPLETED: 'completed',
    ACTIVE: 'active',
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    CANCELLED: 'cancelled',
  },
};

const DEFAULT_TODO_PAGE_SIZE = 100;
const MAX_TODO_PAGE_SIZE = 100;
const AVAILABLE_USERS_LIMIT = 200;

function getBoundedLimit(value, defaultValue = DEFAULT_TODO_PAGE_SIZE, maxValue = MAX_TODO_PAGE_SIZE) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, maxValue);
}

function getBoundedOffset(page, pageSize) {
  const parsedPage = Number.parseInt(page, 10);
  const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  return (safePage - 1) * pageSize;
}

function normalizeParticipantIds(participants, creatorId) {
  if (!Array.isArray(participants)) return [];

  return [...new Set(
    participants
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0 && id !== Number(creatorId))
  )];
}

function normalizePriority(priority, defaultValue = 2) {
  if (priority === undefined || priority === null || priority === '') {
    return defaultValue;
  }

  const normalizedPriority = Number(priority);
  return VALID_PRIORITIES.has(normalizedPriority) ? normalizedPriority : null;
}

function normalizeDeadline(deadline) {
  if (deadline === undefined) {
    return {
      provided: false,
      value: null,
      valid: true,
    };
  }

  if (deadline === null || deadline === '') {
    return {
      provided: true,
      value: null,
      valid: true,
    };
  }

  const normalizedDeadline = new Date(deadline);
  return {
    provided: true,
    value: normalizedDeadline,
    valid: !Number.isNaN(normalizedDeadline.getTime()),
  };
}

function normalizeDescription(description, fallback = null) {
  if (description === undefined) return fallback;
  if (description === null) return null;
  return String(description).trim();
}

function normalizeCompleted(completed, fallback) {
  if (completed === undefined) return fallback;
  if (typeof completed === 'boolean') return completed;
  if (completed === 1 || completed === '1' || completed === 'true') return true;
  if (completed === 0 || completed === '0' || completed === 'false') return false;
  return null;
}

async function findMissingParticipantIds(participantIds) {
  if (participantIds.length === 0) return [];

  const users = await models.User.findAll({
    where: {
      id: {
        [Op.in]: participantIds,
      },
    },
    attributes: ['id'],
  });
  const existingIds = new Set(users.map((user) => Number(user.id)));

  return participantIds.filter((participantId) => !existingIds.has(participantId));
}

async function syncTodoParticipants(todo, participantIds, transaction) {
  await models.TodoParticipant.destroy({
    where: {
      todoId: todo.id,
      role: 'participant',
    },
    transaction,
  });

  await models.TodoParticipant.findOrCreate({
    where: {
      todoId: todo.id,
      userId: todo.userId,
    },
    defaults: {
      role: 'creator',
    },
    transaction,
  });

  if (participantIds.length > 0) {
    await models.TodoParticipant.bulkCreate(
      participantIds.map((participantId) => ({
        todoId: todo.id,
        userId: participantId,
        role: 'participant',
      })),
      {
        transaction,
        ignoreDuplicates: true,
      }
    );
  }
}

async function clearTodoParticipants(todoId, transaction) {
  await models.TodoParticipant.destroy({
    where: { todoId },
    transaction,
  });
}

function getTodoIncludes() {
  return [
    {
      model: models.User,
      as: 'creator',
      attributes: ['id', 'username', 'real_name', 'email'],
    },
    {
      model: models.TodoParticipant,
      as: 'participants',
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['id', 'username', 'real_name', 'email'],
        },
      ],
    },
  ];
}

async function findTodoWithRelations(id, transaction) {
  return models.Todo.findByPk(id, {
    include: getTodoIncludes(),
    transaction,
  });
}

async function dispatchCollaborativeTodos(todo, transaction) {
  if (!todo.isShared || todo.parentTodoId) {
    return [];
  }

  const participants = await models.TodoParticipant.findAll({
    where: {
      todoId: todo.id,
      role: 'participant',
    },
    attributes: ['userId'],
    transaction,
    raw: true,
  });

  const participantIds = [...new Set(
    participants
      .map(participant => Number(participant.userId))
      .filter(userId => Number.isInteger(userId) && userId > 0)
  )];

  if (participantIds.length === 0) {
    return [];
  }

  const existingTodos = await models.Todo.findAll({
    where: {
      userId: { [Op.in]: participantIds },
      parentTodoId: todo.id,
    },
    attributes: ['userId'],
    transaction,
    raw: true,
  });
  const existingUserIds = new Set(existingTodos.map(existingTodo => Number(existingTodo.userId)));

  const todosToCreate = participantIds
    .filter(userId => !existingUserIds.has(userId))
    .map(userId => ({
      userId,
      creatorId: todo.creatorId || todo.userId,
      title: todo.title,
      description: todo.description,
      deadline: todo.deadline,
      priority: todo.priority,
      completed: false,
      isShared: true,
      parentTodoId: todo.id,
    }));

  if (todosToCreate.length === 0) {
    return [];
  }

  const dispatchedTodos = await models.Todo.bulkCreate(todosToCreate, {
    transaction,
    ignoreDuplicates: true,
  });

  logger.info(`协同待办已批量流转，源任务ID: ${todo.id}，目标用户数: ${todosToCreate.length}`);
  return dispatchedTodos;
}

// 获取当前用户的所有待办事项（包含协同任务信息）
exports.getAllTodos = async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = getBoundedLimit(req.query.pageSize || req.query.limit);
    const offset = getBoundedOffset(req.query.page, limit);

    const todos = await models.Todo.findAll({
      where: { userId }, // 使用驼峰形式
      order: [['deadline', 'ASC']],
      include: getTodoIncludes(),
      limit,
      offset,
    });

    return ResponseHandler.success(res, todos);
  } catch (error) {
    logger.error('获取待办事项失败:', error);
    return ResponseHandler.error(res, '获取待办事项失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取单个待办事项
exports.getTodoById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const todo = await models.Todo.findOne({
      where: {
        id,
        userId,
      },
      include: getTodoIncludes(),
    });

    if (!todo) {
      return ResponseHandler.error(res, '待办事项不存在', 'NOT_FOUND', 404);
    }

    return ResponseHandler.success(res, todo);
  } catch (error) {
    logger.error('获取待办事项详情失败:', error);
    return ResponseHandler.error(res, '获取待办事项详情失败', 'SERVER_ERROR', 500, error);
  }
};

// 创建待办事项（支持协同）
exports.createTodo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, description, deadline, priority, participants } = req.body;
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    const participantIds = normalizeParticipantIds(participants, userId);
    const normalizedPriority = normalizePriority(priority);
    const normalizedDeadline = normalizeDeadline(deadline);
    const isShared = participantIds.length > 0;

    if (!normalizedTitle) {
      return ResponseHandler.error(res, '标题不能为空', 'VALIDATION_ERROR', 400);
    }

    if (participants !== undefined && !Array.isArray(participants)) {
      return ResponseHandler.error(res, '协同人员格式不正确', 'VALIDATION_ERROR', 400);
    }

    if (normalizedPriority === null) {
      return ResponseHandler.error(res, '优先级不正确', 'VALIDATION_ERROR', 400);
    }

    if (!normalizedDeadline.valid) {
      return ResponseHandler.error(res, '截止时间格式不正确', 'VALIDATION_ERROR', 400);
    }

    const missingParticipantIds = await findMissingParticipantIds(participantIds);
    if (missingParticipantIds.length > 0) {
      return ResponseHandler.error(res, '协同人员不存在', 'VALIDATION_ERROR', 400);
    }

    const fullTodo = await models.sequelize.transaction(async (transaction) => {
      const todo = await models.Todo.create({
        userId,
        creatorId: userId,
        title: normalizedTitle,
        description: normalizeDescription(description),
        deadline: normalizedDeadline.provided ? normalizedDeadline.value : null,
        priority: normalizedPriority,
        completed: false,
        isShared,
        parentTodoId: null,
      }, {
        transaction,
      });

      if (isShared) {
        await syncTodoParticipants(todo, participantIds, transaction);
      }

      return findTodoWithRelations(todo.id, transaction);
    });

    return ResponseHandler.success(
      res,
      fullTodo,
      isShared ? '协同任务创建成功，完成后将流转给协同人员' : '待办事项创建成功',
      201
    );
  } catch (error) {
    logger.error('创建待办事项失败:', error);
    return ResponseHandler.error(res, '创建待办事项失败', 'SERVER_ERROR', 500, error);
  }
};

// 更新待办事项
exports.updateTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, description, deadline, priority, completed, participants } = req.body;
    const hasTitle = title !== undefined;
    const normalizedTitle = hasTitle && typeof title === 'string' ? title.trim() : '';
    const normalizedPriority = priority !== undefined ? normalizePriority(priority) : undefined;
    const normalizedDeadline = normalizeDeadline(deadline);
    const normalizedCompleted = normalizeCompleted(completed, undefined);
    const shouldSyncParticipants = participants !== undefined;
    const participantIds = shouldSyncParticipants ? normalizeParticipantIds(participants, userId) : [];

    if (hasTitle && !normalizedTitle) {
      return ResponseHandler.error(res, '标题不能为空', 'VALIDATION_ERROR', 400);
    }

    if (shouldSyncParticipants && !Array.isArray(participants)) {
      return ResponseHandler.error(res, '协同人员格式不正确', 'VALIDATION_ERROR', 400);
    }

    if (normalizedPriority === null) {
      return ResponseHandler.error(res, '优先级不正确', 'VALIDATION_ERROR', 400);
    }

    if (!normalizedDeadline.valid) {
      return ResponseHandler.error(res, '截止时间格式不正确', 'VALIDATION_ERROR', 400);
    }

    if (normalizedCompleted === null) {
      return ResponseHandler.error(res, '完成状态不正确', 'VALIDATION_ERROR', 400);
    }

    const missingParticipantIds = await findMissingParticipantIds(participantIds);
    if (missingParticipantIds.length > 0) {
      return ResponseHandler.error(res, '协同人员不存在', 'VALIDATION_ERROR', 400);
    }

    const updatedTodo = await models.sequelize.transaction(async (transaction) => {
      const todo = await models.Todo.findOne({
        where: {
          id,
          userId,
        },
        transaction,
      });

      if (!todo) {
        return null;
      }

      if (shouldSyncParticipants && todo.parentTodoId) {
        return {
          errorCode: 'DERIVED_TODO_PARTICIPANTS_READONLY',
        };
      }

      const wasCompleted = todo.completed;
      const nextValues = {
        title: hasTitle ? normalizedTitle : todo.title,
        description: normalizeDescription(description, todo.description),
        deadline: normalizedDeadline.provided ? normalizedDeadline.value : todo.deadline,
        priority: normalizedPriority !== undefined ? normalizedPriority : todo.priority,
        completed: normalizedCompleted !== undefined ? normalizedCompleted : todo.completed,
      };

      if (shouldSyncParticipants) {
        nextValues.isShared = participantIds.length > 0;

        await todo.update(nextValues, { transaction });

        if (participantIds.length > 0) {
          await syncTodoParticipants(todo, participantIds, transaction);
        } else {
          await clearTodoParticipants(todo.id, transaction);
        }
      } else {
        await todo.update(nextValues, { transaction });
      }

      if (!todo.parentTodoId && todo.completed && todo.isShared && (!wasCompleted || shouldSyncParticipants)) {
        await dispatchCollaborativeTodos(todo, transaction);
      }

      return findTodoWithRelations(todo.id, transaction);
    });

    if (!updatedTodo) {
      return ResponseHandler.error(res, '待办事项不存在', 'NOT_FOUND', 404);
    }

    if (updatedTodo.errorCode === 'DERIVED_TODO_PARTICIPANTS_READONLY') {
      return ResponseHandler.error(res, '协同派生待办不能维护协同人员', 'VALIDATION_ERROR', 400);
    }

    return ResponseHandler.success(res, updatedTodo, '待办事项更新成功');
  } catch (error) {
    logger.error('更新待办事项失败:', error);
    return ResponseHandler.error(res, '更新待办事项失败', 'SERVER_ERROR', 500, error);
  }
};

// 删除待办事项
exports.deleteTodo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 查找待办事项
    const todo = await models.Todo.findOne({
      where: {
        id,
        userId,
      },
    });

    if (!todo) {
      return ResponseHandler.error(res, '待办事项不存在', 'NOT_FOUND', 404);
    }

    // 删除待办事项
    await todo.destroy();

    return ResponseHandler.success(res, null, '待办事项删除成功');
  } catch (error) {
    logger.error('删除待办事项失败:', error);
    return ResponseHandler.error(res, '删除待办事项失败', 'SERVER_ERROR', 500, error);
  }
};

// 切换待办事项完成状态
exports.toggleTodoStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    let dispatchedCount = 0;

    const updatedTodo = await models.sequelize.transaction(async (transaction) => {
      const todo = await models.Todo.findOne({
        where: {
          id,
          userId,
        },
        transaction,
      });

      if (!todo) {
        return null;
      }

      const willComplete = !todo.completed;
      await todo.update({
        completed: willComplete,
      }, {
        transaction,
      });

      if (willComplete && todo.isShared && !todo.parentTodoId) {
        const dispatchedTodos = await dispatchCollaborativeTodos(todo, transaction);
        dispatchedCount = dispatchedTodos.length;
      }

      return findTodoWithRelations(todo.id, transaction);
    });

    if (!updatedTodo) {
      return ResponseHandler.error(res, '待办事项不存在', 'NOT_FOUND', 404);
    }

    const responseTodo = {
      ...updatedTodo.get({ plain: true }),
      dispatchedCount,
    };

    return ResponseHandler.success(res, responseTodo, `待办事项已标记为${updatedTodo.completed ? '已完成' : '未完成'}`);
  } catch (error) {
    logger.error('更新待办事项状态失败:', error);
    return ResponseHandler.error(res, '更新待办事项状态失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取可选择的用户列表（用于协同任务）— 脱敏 + DataScope
exports.getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const DataScopeService = require('../../services/DataScopeService');
    const scope = await DataScopeService.getRequestScope(req);

    const where = {
      id: { [Op.ne]: currentUserId },
      status: 1,
    };

    // 非全量数据范围：仅本部门（及下级）或无法解析时仅本人不可见他人
    if (!DataScopeService.isAllScope(scope)) {
      if (scope.departmentIds && scope.departmentIds.length > 0) {
        where.department_id = { [Op.in]: scope.departmentIds };
      } else if (Number(scope.type) === DataScopeService.DATA_SCOPE.SELF) {
        // 本人范围：协同场景仅允许选同部门，无部门则返回空列表
        if (scope.departmentId) {
          where.department_id = scope.departmentId;
        } else {
          return ResponseHandler.success(res, []);
        }
      } else {
        return ResponseHandler.success(res, []);
      }
    }

    const users = await models.User.findAll({
      where,
      // 不返回 email / role 等敏感字段
      attributes: ['id', 'username', 'real_name', 'department_id'],
      order: [['real_name', 'ASC']],
      limit: AVAILABLE_USERS_LIMIT,
    });

    const safe = users.map((u) => ({
      id: u.id,
      username: u.username,
      real_name: u.realName || u.username,
      department_id: u.department_id || null,
    }));

    return ResponseHandler.success(res, safe);
  } catch (error) {
    logger.error('获取用户列表失败:', error);
    return ResponseHandler.error(res, '获取用户列表失败', 'SERVER_ERROR', 500, error);
  }
};

// 根据条件过滤待办事项
exports.filterTodos = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, priority, search, fromDate, toDate } = req.query;
    const limit = getBoundedLimit(req.query.pageSize || req.query.limit);
    const offset = getBoundedOffset(req.query.page, limit);

    const whereClause = { userId };

    // 根据状态过滤
    if (status) {
      if (status === STATUS.TODO.COMPLETED) {
        whereClause.completed = true;
      } else if (status === 'active') {
        whereClause.completed = false;
      } else if (status === 'overdue') {
        whereClause.completed = false;
        whereClause.deadline = {
          [Op.lt]: new Date(),
        };
      } else if (status === 'today') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        whereClause.completed = false;
        whereClause.deadline = {
          [Op.gte]: startOfDay,
          [Op.lt]: endOfDay,
        };
      } else if (status === 'upcoming') {
        const now = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        whereClause.completed = false;
        whereClause.deadline = {
          [Op.gte]: now,
          [Op.lt]: tomorrow,
        };
      }
    }

    // 根据优先级过滤
    if (priority && priority !== 'all') {
      const normalizedPriority = normalizePriority(priority, null);
      if (normalizedPriority === null) {
        return ResponseHandler.error(res, '优先级不正确', 'VALIDATION_ERROR', 400);
      }
      whereClause.priority = normalizedPriority;
    }

    // 根据标题搜索
    if (search) {
      whereClause.title = {
        [Op.like]: `%${search}%`,
      };
    }

    // 根据日期范围搜索
    if (fromDate || toDate) {
      whereClause.deadline = {};

      if (fromDate) {
        whereClause.deadline[Op.gte] = new Date(fromDate);
      }

      if (toDate) {
        whereClause.deadline[Op.lte] = new Date(toDate);
      }
    }

    const todos = await models.Todo.findAll({
      where: whereClause,
      order: [['deadline', 'ASC']],
      include: getTodoIncludes(),
      limit,
      offset,
    });

    return ResponseHandler.success(res, todos);
  } catch (error) {
    logger.error('过滤待办事项失败:', error);
    return ResponseHandler.error(res, '过滤待办事项失败', 'SERVER_ERROR', 500, error);
  }
};
