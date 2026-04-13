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

// 获取当前用户的所有待办事项（包含协同任务信息）
exports.getAllTodos = async (req, res) => {
  try {
    const userId = req.user.id;

    const todos = await models.Todo.findAll({
      where: { userId }, // 使用驼峰形式
      order: [['deadline', 'ASC']],
      include: [
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
      ],
    });

    return res.status(200).json({
      success: true,
      data: todos,
    });
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
    });

    if (!todo) {
      return ResponseHandler.error(res, '待办事项不存在', 'NOT_FOUND', 404);
    }

    return res.status(200).json({
      success: true,
      data: todo,
    });
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

    // 验证必填字段
    if (!title) {
      return ResponseHandler.error(res, '标题不能为空', 'BAD_REQUEST', 400);
    }

    // 检查是否为协同任务
    const isShared = participants && Array.isArray(participants) && participants.length > 0;

    // 创建主任务
    const todo = await models.Todo.create({
      userId,
      creatorId: userId,
      title,
      description,
      deadline: deadline ? new Date(deadline) : null,
      priority: priority || 2,
      completed: false,
      isShared: isShared,
      parentTodoId: null,
    });

    // 如果是协同任务，为每个参与者创建副本并添加参与者记录
    if (isShared) {
      // 添加创建者到参与者表
      await models.TodoParticipant.create({
        todoId: todo.id,
        userId: userId,
        role: 'creator',
      });

      // 为每个参与者创建任务副本
      for (const participantId of participants) {
        // 跳过创建者自己
        if (participantId === userId) continue;

        // 为参与者创建任务副本
        const participantTodo = await models.Todo.create({
          userId: participantId,
          creatorId: userId,
          title: title,
          description: description,
          deadline: deadline ? new Date(deadline) : null,
          priority: priority || 2,
          completed: false,
          isShared: true,
          parentTodoId: todo.id, // 关联到主任务
        });

        // 添加参与者记录
        await models.TodoParticipant.create({
          todoId: todo.id,
          userId: participantId,
          role: 'participant',
        });

        logger.info(`为用户 ${participantId} 创建协同任务副本，任务ID: ${participantTodo.id}`);
      }
    }

    // 查询完整的任务数据（包含参与者信息）
    const fullTodo = await models.Todo.findByPk(todo.id, {
      include: [
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
      ],
    });

    return ResponseHandler.success(
      res,
      {
        success: true,
        message: isShared ? '协同任务创建成功' : '待办事项创建成功',
        data: fullTodo,
      },
      '创建成功',
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
    const { title, description, deadline, priority, completed } = req.body;

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

    // 更新待办事项
    const updatedTodo = await todo.update({
      title: title || todo.title,
      description: description !== undefined ? description : todo.description,
      deadline: deadline ? new Date(deadline) : todo.deadline,
      priority: priority !== undefined ? priority : todo.priority,
      completed: completed !== undefined ? completed : todo.completed,
    });

    return res.status(200).json({
      success: true,
      message: '待办事项更新成功',
      data: updatedTodo,
    });
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

    return res.status(200).json({
      success: true,
      message: '待办事项删除成功',
    });
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

    // 切换完成状态
    const updatedTodo = await todo.update({
      completed: !todo.completed,
    });

    return res.status(200).json({
      success: true,
      message: `待办事项已标记为${updatedTodo.completed ? '已完成' : '未完成'}`,
      data: updatedTodo,
    });
  } catch (error) {
    logger.error('更新待办事项状态失败:', error);
    return ResponseHandler.error(res, '更新待办事项状态失败', 'SERVER_ERROR', 500, error);
  }
};

// 获取可选择的用户列表（用于协同任务）
exports.getAvailableUsers = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    // 获取所有用户（排除当前用户）
    const users = await models.User.findAll({
      where: {
        id: {
          [Op.ne]: currentUserId,
        },
      },
      attributes: ['id', 'username', 'real_name', 'email', 'role'],
      order: [['real_name', 'ASC']],
    });

    return res.status(200).json({
      success: true,
      data: users,
    });
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
    if (priority) {
      whereClause.priority = priority;
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
    });

    return res.status(200).json({
      success: true,
      count: todos.length,
      data: todos,
    });
  } catch (error) {
    logger.error('过滤待办事项失败:', error);
    return ResponseHandler.error(res, '过滤待办事项失败', 'SERVER_ERROR', 500, error);
  }
};
