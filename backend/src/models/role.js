/**
 * 角色模型 - 权限关联专用
 * ✅ 重构: 仅保留 getRoleMenus / setRoleMenus（权限分配相关）
 * 角色 CRUD 由 models/system.js 统一管理，此处不再重复实现
 */

const { pool } = require('../config/db');
const logger = require('../utils/logger');
const DBManager = require('../utils/dbManager');

/**
 * 获取角色的菜单权限
 * @param {number} roleId 角色ID
 * @returns {Promise<Array>} 菜单ID列表
 */
const getRoleMenus = async (roleId) => {
  try {
    const [rows] = await pool.execute(
      'SELECT menu_id FROM role_menus WHERE role_id = ? ORDER BY menu_id',
      [roleId]
    );
    return rows.map((row) => row.menu_id);
  } catch (error) {
    logger.error(`获取角色菜单失败，角色ID: ${roleId}`, error);
    throw error;
  }
};

/**
 * 分配角色菜单/权限
 * ✅ 已集成事务处理
 * @param {number} roleId - 角色ID
 * @param {Array} menuIds - 菜单ID数组
 * @returns {Promise<boolean>} 是否成功
 */
const setRoleMenus = async (roleId, menuIds = []) => {
  try {
    const normalizedMenuIds = [...new Set((Array.isArray(menuIds) ? menuIds : []).map((id) => Number(id)))].filter(
      (id) => Number.isInteger(id) && id > 0
    );

    // ✅ 使用事务处理确保数据一致性
    const result = await DBManager.executeTransaction(async (connection) => {
      // 步骤1: 先删除该角色的所有菜单关联
      const [deleteResult] = await connection.execute('DELETE FROM role_menus WHERE role_id = ?', [
        roleId,
      ]);
      logger.info(`[事务] 删除角色 ${roleId} 的菜单关联: ${deleteResult.affectedRows} 行`);

      // 步骤2: 如果有新的菜单ID，则插入新关联
      if (normalizedMenuIds.length > 0) {
        const placeholders = normalizedMenuIds.map(() => '?').join(',');
        const [existingMenus] = await connection.execute(
          `SELECT id FROM menus WHERE id IN (${placeholders})`,
          normalizedMenuIds
        );
        const existingIds = new Set(existingMenus.map((row) => Number(row.id)));
        const missingIds = normalizedMenuIds.filter((menuId) => !existingIds.has(menuId));
        if (missingIds.length > 0) {
          throw new Error(`invalid menuIds: ${missingIds.join(',')}`);
        }

        const values = normalizedMenuIds.map(() => '(?, ?)').join(',');
        const params = [];

        for (const menuId of normalizedMenuIds) {
          params.push(roleId, menuId);
        }

        const [insertResult] = await connection.execute(
          `INSERT INTO role_menus (role_id, menu_id) VALUES ${values}`,
          params
        );
        logger.info(`[事务] 为角色 ${roleId} 添加菜单关联: ${insertResult.affectedRows} 行`);
      }

      return true;
    });

    logger.info(`[事务成功] 角色 ${roleId} 的菜单关联更新完成`);

    // ✅ 缓存清除由调用方(systemController)统一管理

    return result;
  } catch (error) {
    logger.error('[事务失败] 设置角色菜单失败:', error);
    throw error;
  }
};

module.exports = {
  getRoleMenus,
  setRoleMenus,
};
