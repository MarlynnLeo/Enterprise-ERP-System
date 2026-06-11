/**
 * todoRoutes.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const todoController = require('../controllers/common/todoController');
const { authenticateToken } = require('../middleware/authEnhanced');

// 请求处理中间件

// 先添加身份验证中间件
router.use(authenticateToken);

// 获取所有待办事项
router.get('/', todoController.getAllTodos);

// 按条件过滤待办事项
router.get('/filter', todoController.filterTodos);

// 获取可选择的用户列表（用于协同任务）
router.get('/available-users', todoController.getAvailableUsers);

// 获取单个待办事项
router.get('/:id', todoController.getTodoById);

// 创建待办事项
router.post('/', todoController.createTodo);

// 更新待办事项
router.put('/:id', todoController.updateTodo);

// 删除待办事项
router.delete('/:id', todoController.deleteTodo);

// 切换待办事项状态
router.patch('/:id/toggle', todoController.toggleTodoStatus);
router.put('/:id/toggle', todoController.toggleTodoStatus); // 兼容PUT方法

module.exports = router;
