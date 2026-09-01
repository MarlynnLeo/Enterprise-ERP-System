/**
 * 输入验证中间件
 * 用于验证API请求的参数
 * @date 2025-10-17
 */

const { ResponseHandler } = require('../utils/responseHandler');
const { isReservedRoleCode } = require('../authorization/superAdmin');

/**
 * 验证角色权限更新请求
 */
function validateRolePermissions(req, res, next) {
  const { id } = req.params;
  const { menuIds, halfCheckedIds, uncheckedIds } = req.body;

  const errors = [];

  // 1. 验证角色ID
  if (!id || !Number.isInteger(Number(id)) || Number(id) <= 0) {
    errors.push('角色ID必须是正整数');
  }

  // 2. 验证菜单IDs
  if (!Array.isArray(menuIds)) {
    errors.push('menuIds 必须是数组');
  } else if (menuIds.length > 0 && !menuIds.every((id) => Number.isInteger(id) && id > 0)) {
    errors.push('所有菜单ID必须是正整数');
  }

  // 3. 验证半选中IDs（可选）
  if (halfCheckedIds !== undefined && halfCheckedIds !== null) {
    if (!Array.isArray(halfCheckedIds)) {
      errors.push('halfCheckedIds 必须是数组');
    } else if (
      halfCheckedIds.length > 0 &&
      !halfCheckedIds.every((id) => Number.isInteger(id) && id > 0)
    ) {
      errors.push('所有半选中ID必须是正整数');
    }
  }

  // 4. 验证未选中IDs（可选）
  if (uncheckedIds !== undefined && uncheckedIds !== null) {
    if (!Array.isArray(uncheckedIds)) {
      errors.push('uncheckedIds 必须是数组');
    } else if (
      uncheckedIds.length > 0 &&
      !uncheckedIds.every((id) => Number.isInteger(id) && id > 0)
    ) {
      errors.push('所有未选中ID必须是正整数');
    }
  }

  // 如果有验证错误，返回错误响应
  if (errors.length > 0) {
    return ResponseHandler.validationError(res, '验证失败', errors);
  }

  next();
}

/**
 * 验证角色信息请求
 */
function validateRoleInfo(req, res, next) {
  const { name, code, description, status } = req.body;
  const errors = [];

  // 1. 验证角色名称
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('角色名称不能为空');
  } else if (name.length > 50) {
    errors.push('角色名称长度不能超过50个字符');
  }

  // 2. 验证角色编码
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    errors.push('角色编码不能为空');
  } else if (!/^[a-zA-Z0-9_]+$/.test(code)) {
    errors.push('角色编码只能包含字母、数字和下划线');
  } else if (code.length > 50) {
    errors.push('角色编码长度不能超过50个字符');
  } else if (isReservedRoleCode(code)) {
    errors.push('角色编码为系统保留字，请使用其他编码');
  }

  // 3. 验证角色描述（可选）
  if (description && typeof description !== 'string') {
    errors.push('角色描述必须是字符串');
  } else if (description && description.length > 500) {
    errors.push('角色描述长度不能超过500个字符');
  }

  // 4. 验证状态
  if (status !== undefined && status !== null) {
    if (![0, 1].includes(status)) {
      errors.push('状态必须为 0(禁用) 或 1(启用)');
    }
  }

  if (errors.length > 0) {
    return ResponseHandler.validationError(res, '验证失败', errors);
  }

  next();
}

/**
 * 验证菜单信息请求
 */
function validateMenuInfo(req, res, next) {
  const { name, path, permission, type, status } = req.body;
  const errors = [];

  // 1. 验证菜单名称
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('菜单名称不能为空');
  } else if (name.length > 50) {
    errors.push('菜单名称长度不能超过50个字符');
  }

  // 2. 验证菜单类型
  if (type === undefined || type === null) {
    errors.push('菜单类型不能为空');
  } else if (![0, 1, 2].includes(type)) {
    errors.push('菜单类型必须为 0(目录)、1(菜单) 或 2(按钮)');
  }

  // 3. 验证路由路径（仅菜单和目录需要）
  if (type < 2) {
    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      errors.push('路由路径不能为空');
    } else if (!/^\//.test(path)) {
      errors.push('路由路径必须以 / 开头');
    }
  }

  // 4. 验证权限标识（仅菜单和按钮需要）
  if (type > 0) {
    if (!permission || typeof permission !== 'string' || permission.trim().length === 0) {
      errors.push('权限标识不能为空');
    } else if (!/^[a-zA-Z0-9:_-]+$/.test(permission)) {
      errors.push('权限标识只能包含字母、数字、冒号、下划线和短横线');
    }
  }

  // 5. 验证状态
  if (status !== undefined && status !== null) {
    if (![0, 1].includes(status)) {
      errors.push('状态必须为 0(隐藏) 或 1(显示)');
    }
  }

  if (errors.length > 0) {
    return ResponseHandler.validationError(res, '验证失败', errors);
  }

  next();
}

/**
 * 验证ID参数
 */
function validateIdParam(req, res, next) {
  const { id } = req.params;

  if (!id || !Number.isInteger(Number(id)) || Number(id) <= 0) {
    return ResponseHandler.validationError(res, '验证失败', ['ID 必须是正整数']);
  }

  next();
}

module.exports = {
  validateRolePermissions,
  validateRoleInfo,
  validateMenuInfo,
  validateIdParam,
};
