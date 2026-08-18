/**
 * ScopeGuard — 行级数据范围统一入口（SSOT）
 *
 * 上下游闭环：
 *   create → stampOwner（强制写入 owner）
 *   list   → applyListScope（SQL join/where）
 *   get/mutate → assertAccess / denyUnlessAccess
 *
 * 禁止在控制器里各自拼 scope 条件或信任 body.created_by。
 *
 * 财务共享策略（FINANCE_DATA_SCOPE_POLICY）：
 *   - all（默认）：financeShared 资源按 ALL（共享财务中心）
 *   - role|owner：与其它业务一致，按角色 data_scope 行级隔离
 */

const DataScopeService = require('../services/DataScopeService');
const { getResourcePolicy } = require('./resourcePolicies');
const { getAuthenticatedUserId } = require('../utils/authContext');
const { ResponseHandler } = require('../utils/responseHandler');
const { FINANCE_DATA_SCOPE_POLICY } = require('../constants/financeConstants');

const EMPTY_SCOPE_CLAUSE = Object.freeze({ join: '', where: '', params: [] });

class ScopeGuard {
  static getPolicy(key) {
    return getResourcePolicy(key);
  }

  /**
   * 财务共享中心是否对本资源强制 ALL
   */
  static isFinanceSharedAll(policy) {
    if (!policy?.financeShared) return false;
    const mode = String(FINANCE_DATA_SCOPE_POLICY || 'all').toLowerCase();
    // all = 共享；role/owner = 行级
    return mode !== 'role' && mode !== 'owner';
  }

  /**
   * 业务资源是否在“读取”场景下共享。
   *
   * 共享读取与写入范围分开：销售订单列表/详情对销售权限用户共享，
   * 但修改、删除、锁定等动作仍按原有 DataScope 校验，避免扩大写权限。
   */
  static isSharedRead(policy, options = {}) {
    return Boolean(
      policy?.sharedRead && String(options.accessMode || '').toLowerCase() === 'read'
    );
  }

  /**
   * 创建单据时写入 owner（永远取当前登录用户，忽略 body）
   * @returns {{ [ownerColumn]: number }}
   */
  static stampOwner(req, policyKey) {
    const policy = getResourcePolicy(policyKey);
    const userId = getAuthenticatedUserId(req);
    return { [policy.ownerColumn]: userId };
  }

  /**
   * 安全取用户 id；无登录时返回 null（用于系统任务等非 HTTP 路径）
   */
  static tryStampOwner(req, policyKey, fallbackUserId = null) {
    const policy = getResourcePolicy(policyKey);
    try {
      if (req?.user) {
        return { [policy.ownerColumn]: getAuthenticatedUserId(req) };
      }
    } catch {
      // fall through
    }
    if (fallbackUserId !== null && fallbackUserId !== undefined) {
      return { [policy.ownerColumn]: Number(fallbackUserId) };
    }
    return { [policy.ownerColumn]: null };
  }

  /**
   * 列表查询作用域片段
   * @returns {Promise<{ join: string, where: string, params: any[] }>}
   */
  static async applyListScope(req, policyKey, options = {}) {
    const policy = getResourcePolicy(policyKey);
    if (this.isFinanceSharedAll(policy) || this.isSharedRead(policy, options)) {
      return { ...EMPTY_SCOPE_CLAUSE };
    }
    return DataScopeService.buildRequestOwnerScopeClause(req, {
      tableAlias: options.tableAlias || 't',
      ownerColumn: policy.ownerColumn,
      ownerAlias: options.ownerAlias || `${policy.key}_owner_scope`,
      departmentColumn: policy.departmentColumn || null,
      locationColumn: policy.locationColumn || null,
      includeLocation: options.includeLocation !== false && Boolean(policy.locationColumn),
    });
  }

  /**
   * 单记录访问校验
   */
  static async assertAccess(connection, req, policyKey, recordId, options = {}) {
    const policy = getResourcePolicy(policyKey);
    if (this.isFinanceSharedAll(policy) || this.isSharedRead(policy, options)) {
      return true;
    }
    return DataScopeService.assertRecordAccess(connection, req, policy.table, recordId, {
      ownerColumn: policy.ownerColumn,
      departmentColumn: policy.departmentColumn || null,
      locationColumn: policy.locationColumn || null,
      deletedAtColumn: policy.deletedAtColumn === false ? false : (policy.deletedAtColumn || 'deleted_at'),
      extraSoftDelete: policy.extraSoftDelete || null,
    });
  }

  /**
   * Express 友好：无权限返回 403，返回是否放行
   */
  static async denyUnlessAccess(res, connection, req, policyKey, recordId, message, options = {}) {
    const ok = await this.assertAccess(connection, req, policyKey, recordId, options);
    if (!ok) {
      ResponseHandler.forbidden(res, message || '无权访问该业务单据');
      return false;
    }
    return true;
  }

  /**
   * 路由中间件：:id 资源访问校验
   * @param {string} policyKey
   * @param {{ param?: string, message?: string }} options
   */
  static requireRecordAccess(policyKey, options = {}) {
    const param = options.param || 'id';
    const message = options.message || '无权访问该业务单据';
    const { pool } = require('../config/db');

    return async (req, res, next) => {
      try {
        const recordId = req.params[param];
        if (recordId === undefined || recordId === null || recordId === '') {
          return ResponseHandler.error(res, '缺少资源 ID', 'BAD_REQUEST', 400);
        }
        const ok = await this.assertAccess(pool, req, policyKey, recordId);
        if (!ok) {
          return ResponseHandler.forbidden(res, message);
        }
        next();
      } catch (error) {
        return ResponseHandler.error(res, '数据范围校验失败', 'SERVER_ERROR', 500, error);
      }
    };
  }
}

module.exports = ScopeGuard;
