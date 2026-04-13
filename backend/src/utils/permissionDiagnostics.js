/**
 * 权限诊断工具
 * 用于排查权限系统问题
 * @date 2025-12-15
 */

const { pool } = require('../config/db');
const cacheService = require('../services/cacheService');
const PermissionService = require('../services/PermissionService');

/**
 * 权限诊断工具类
 */
class PermissionDiagnostics {
  /**
   * 诊断用户权限
   * @param {number} userId - 用户ID
   * @param {string} username - 用户名（可选，用于日志）
   */
  static async diagnoseUserPermissions(userId, username = null) {
    console.log('\n' + '='.repeat(80));
    console.log(`🔍 权限诊断报告 - 用户ID: ${userId}${username ? ` (${username})` : ''}`);
    console.log('='.repeat(80) + '\n');

    try {
      // 1. 检查用户基本信息
      console.log('📋 1. 用户基本信息');
      const [users] = await pool.execute(
        'SELECT id, username, status FROM users WHERE id = ?',
        [userId]
      );

      if (!users.length) {
        console.log('❌ 用户不存在!');
        return;
      }

      const user = users[0];
      console.log(`   用户名: ${user.username}`);
      console.log(`   状态: ${user.status === 1 ? '✅ 启用' : '❌ 禁用'}`);
      console.log('');

      // 2. 检查用户角色关联
      console.log('👥 2. 用户角色关联');
      const [userRoles] = await pool.execute(
        `SELECT r.id, r.name, r.code, r.status, ur.created_at
         FROM roles r
         JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId]
      );

      if (!userRoles.length) {
        console.log('   ⚠️ 用户没有分配任何角色!');
      } else {
        userRoles.forEach((role) => {
          console.log(
            `   - ${role.name} (${role.code}) [ID:${role.id}] ${role.status === 1 ? '✅' : '❌禁用'}`
          );
        });
      }
      console.log('');

      // 3. 检查是否是管理员
      console.log('👑 3. 管理员检查');
      const isAdmin = await PermissionService.isAdmin(userId);
      console.log(`   是否管理员: ${isAdmin ? '✅ 是' : '❌ 否'}`);
      console.log('');

      // 4. 检查数据库中的权限
      console.log('💾 4. 数据库权限（实时查询）');
      const dbPermissions = await PermissionService.getUserRolePermissions(userId);
      console.log(`   权限数量: ${dbPermissions.length}`);
      if (dbPermissions.length > 0) {
        console.log(`   前10个权限: ${dbPermissions.slice(0, 10).join(', ')}`);
        if (dbPermissions.length > 10) {
          console.log(`   ... 还有 ${dbPermissions.length - 10} 个权限`);
        }
      }
      console.log('');

      // 5. 检查缓存状态
      console.log('🗄️ 5. 缓存状态');
      const cacheKey = `user_permissions:${userId}`;
      const hasCachedPermissions = cacheService.has(cacheKey);

      if (hasCachedPermissions) {
        const cachedPermissions = cacheService.get(cacheKey);
        console.log('   ✅ 缓存存在');
        console.log(`   缓存权限数: ${cachedPermissions.length}`);
        console.log(`   前10个权限: ${cachedPermissions.slice(0, 10).join(', ')}`);

        // 比较缓存和数据库
        if (cachedPermissions.length !== dbPermissions.length) {
          console.log(
            `   ⚠️ 警告: 缓存权限数(${cachedPermissions.length})与数据库(${dbPermissions.length})不一致!`
          );
        }
      } else {
        console.log('   ❌ 缓存不存在');
      }
      console.log('');

      // 6. 检查特定权限
      console.log('🔐 6. 常用权限检查');
      const commonPermissions = [
        'system:users',
        'system:permissions',
        'production:tasks',
        'production:process',
        'dashboard',
      ];

      commonPermissions.forEach((perm) => {
        const hasInDb = dbPermissions.includes(perm);
        const hasInCache = hasCachedPermissions && cacheService.get(cacheKey).includes(perm);
        const status = hasInDb ? '✅' : '❌';
        const cacheStatus = hasCachedPermissions ? (hasInCache ? '✅' : '❌') : '⚪';
        console.log(`   ${status} ${perm.padEnd(25)} (缓存: ${cacheStatus})`);
      });
      console.log('');

      // 7. 检查角色菜单关联
      console.log('📑 7. 角色菜单关联统计');
      for (const role of userRoles) {
        const [menuCount] = await pool.execute(
          'SELECT COUNT(*) as count FROM role_menus WHERE role_id = ?',
          [role.id]
        );
        const [permCount] = await pool.execute(
          `SELECT COUNT(DISTINCT m.permission) as count
           FROM menus m
           JOIN role_menus rm ON m.id = rm.menu_id
           WHERE rm.role_id = ? AND m.permission IS NOT NULL AND m.permission != ''`,
          [role.id]
        );
        console.log(`   角色 ${role.name}:`);
        console.log(`     - 关联菜单数: ${menuCount[0].count}`);
        console.log(`     - 有效权限数: ${permCount[0].count}`);
      }
      console.log('');

      // 8. 建议
      console.log('💡 8. 诊断建议');
      if (!userRoles.length) {
        console.log('   ⚠️ 用户没有分配角色，请先分配角色');
      } else if (dbPermissions.length === 0) {
        console.log('   ⚠️ 用户的角色没有分配任何权限，请为角色分配权限');
      } else if (
        hasCachedPermissions &&
        cacheService.get(cacheKey).length !== dbPermissions.length
      ) {
        console.log('   ⚠️ 缓存与数据库不一致，建议清除缓存');
        console.log('   执行: PermissionService.clearUserPermissionsCache(' + userId + ')');
      } else {
        console.log('   ✅ 权限系统正常');
      }
    } catch (error) {
      console.error('❌ 诊断过程出错:', error);
    }

    console.log('\n' + '='.repeat(80));
    console.log('诊断完成');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * 清除用户缓存并重新加载
   * @param {number} userId - 用户ID
   */
  static async refreshUserPermissions(userId) {
    console.log(`🔄 刷新用户 ${userId} 的权限缓存...`);
    PermissionService.clearUserPermissionsCache(userId);
    const permissions = await PermissionService.getUserPermissions(userId, true);
    console.log(`✅ 刷新完成，当前权限数: ${permissions.length}`);
    return permissions;
  }
}

module.exports = PermissionDiagnostics;
