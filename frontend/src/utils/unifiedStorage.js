/**
 * 统一存储工具
 *
 * 合并了 storage.js 和 secureStorage.js 的功能
 * 提供统一的、安全的客户端数据存储方案
 *
 * 功能特性：
 * - 支持 localStorage 和 sessionStorage
 * - 自动过期处理
 * - 键名前缀保护
 * - 错误处理和降级
 * - 权限相关存储的专用方法
 * - Token 管理的专用方法
 *
 * @author 系统开发团队
 * @version 2.0.0 - 合并存储工具
 * @since 2025-09-17
 */

// 存储键名前缀，避免冲突
const STORAGE_PREFIX = 'erp_unified_';

/**
 * 统一存储工具类
 */
class UnifiedStorage {
  constructor() {
    this.isSupported = this.checkSupport();
    this.prefix = STORAGE_PREFIX;
  }

  /**
   * 检查浏览器是否支持所需功能
   */
  checkSupport() {
    try {
      return 'localStorage' in window && 'sessionStorage' in window;
    } catch {
      return false;
    }
  }

  /**
   * 生成存储键名
   */
  getKey(key, usePrefix = true) {
    return usePrefix ? `${this.prefix}${key}` : key;
  }

  /**
   * 通用存储方法
   * @param {string} key - 键名
   * @param {any} value - 值
   * @param {Object} options - 选项
   */
  set(key, value, options = {}) {
    if (!this.isSupported) {
      return false;
    }

    try {
      const {
        expires = null,           // 过期时间（毫秒）
        session = false,          // 是否使用 sessionStorage
        usePrefix = true,         // 是否使用前缀
        secure = false            // 是否为敏感数据（预留加密功能）
      } = options;

      const storageKey = this.getKey(key, usePrefix);
      const data = {
        value,
        timestamp: Date.now(),
        expires: expires ? Date.now() + expires : null,
        secure
      };

      const storage = session ? sessionStorage : localStorage;
      storage.setItem(storageKey, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('存储数据失败:', error);
      return false;
    }
  }

  /**
   * 通用获取方法
   * @param {string} key - 键名
   * @param {Object} options - 选项
   */
  get(key, options = {}) {
    if (!this.isSupported) {
      return null;
    }

    try {
      const {
        defaultValue = null,
        session = false,
        usePrefix = true
      } = options;

      const storageKey = this.getKey(key, usePrefix);
      const storage = session ? sessionStorage : localStorage;
      const item = storage.getItem(storageKey);

      if (!item) {
        return defaultValue;
      }

      const data = JSON.parse(item);

      // 检查是否过期
      if (data.expires && Date.now() > data.expires) {
        this.remove(key, { session, usePrefix });
        return defaultValue;
      }

      return data.value;
    } catch (error) {
      console.error('获取数据失败:', error);
      return options.defaultValue || null;
    }
  }

  /**
   * 移除数据
   * @param {string} key - 键名
   * @param {Object} options - 选项
   */
  remove(key, options = {}) {
    if (!this.isSupported) {
      return false;
    }

    try {
      const {
        session = false,
        usePrefix = true
      } = options;

      const storageKey = this.getKey(key, usePrefix);
      const storage = session ? sessionStorage : localStorage;
      storage.removeItem(storageKey);
      return true;
    } catch (error) {
      console.error('移除数据失败:', error);
      return false;
    }
  }

  /**
   * 检查数据是否存在
   * @param {string} key - 键名
   * @param {Object} options - 选项
   */
  has(key, options = {}) {
    return this.get(key, options) !== null;
  }

  /**
   * 清空所有数据
   * @param {Object} options - 选项
   */
  clear(options = {}) {
    if (!this.isSupported) {
      return false;
    }

    try {
      const { session = false, onlyPrefixed = true } = options;
      const storage = session ? sessionStorage : localStorage;

      if (onlyPrefixed) {
        // 只清除带前缀的数据
        const keys = Object.keys(storage);
        keys.forEach(key => {
          if (key.startsWith(this.prefix)) {
            storage.removeItem(key);
          }
        });
      } else {
        // 清除所有数据
        storage.clear();
      }
      return true;
    } catch (error) {
      console.error('清空数据失败:', error);
      return false;
    }
  }

  /**
   * 获取所有键名
   * @param {Object} options - 选项
   */
  keys(options = {}) {
    if (!this.isSupported) {
      return [];
    }

    try {
      const { session = false, onlyPrefixed = true } = options;
      const storage = session ? sessionStorage : localStorage;
      const keys = Object.keys(storage);

      if (onlyPrefixed) {
        return keys
          .filter(key => key.startsWith(this.prefix))
          .map(key => key.replace(this.prefix, ''));
      }

      return keys;
    } catch (error) {
      console.error('获取键名失败:', error);
      return [];
    }
  }

}

/**
 * Token 管理器
 * 专门用于管理认证相关的 token
 */
class TokenManager {
  constructor(storage) {
    this.storage = storage;
    this.tokenKey = 'auth_token';
    this.refreshTokenKey = 'refresh_token';
    this.userKey = 'user_info';
    this.removeRefreshToken();
  }

  /**
   * 设置访问token
   * @param {string} token - 访问token
   */
  setToken(token) {
    // Access tokens are delivered by the backend through HttpOnly cookies.
    // Keep this method as a compatibility no-op so older callers do not
    // accidentally reintroduce browser-readable bearer tokens.
    void token;
    return this.removeToken();
  }

  /**
   * 获取访问token
   */
  getToken() {
    return null;
  }

  /**
   * 移除访问token
   */
  removeToken() {
    return this.storage.remove(this.tokenKey, { session: true });
  }

  /**
   * 设置刷新token
   * @param {string} refreshToken - 刷新token
   */
  setRefreshToken(_refreshToken) {
    return this.removeRefreshToken();
  }

  /**
   * 获取刷新token
   */
  getRefreshToken() {
    return null;
  }

  /**
   * 移除刷新token
   */
  removeRefreshToken() {
    return this.storage.remove(this.refreshTokenKey);
  }

  /**
   * 设置用户信息
   * @param {Object} user - 用户信息
   */
  setUser(user) {
    return this.storage.set(this.userKey, user, { session: true });
  }

  /**
   * 获取用户信息
   */
  getUser() {
    return this.storage.get(this.userKey, { session: true });
  }

  /**
   * 移除用户信息
   */
  removeUser() {
    return this.storage.remove(this.userKey, { session: true });
  }

  /**
   * 清除所有认证信息
   */
  clearAll() {
    this.removeToken();
    this.removeRefreshToken();
    this.removeUser();
  }

  /**
   * 检查token是否有效
   * @returns {boolean} token是否有效
   */
  isTokenValid() {
    return Boolean(this.getUser());
  }
}

/**
 * 权限存储管理器
 * 专门用于管理权限相关的缓存数据
 */
class PermissionManager {
  constructor(storage) {
    this.storage = storage;
    this.userPermissionsKey = 'user_permissions';
    this.clearLegacyAuthorityCaches();
  }

  clearLegacyAuthorityCaches() {
    const legacyExactKeys = ['cachedMenus', 'cached_menus'];
    const removeLegacyKey = (key, options = {}) => this.storage.remove(key, options);

    legacyExactKeys.forEach((key) => {
      removeLegacyKey(key);
      removeLegacyKey(key, { usePrefix: false });
    });

    this.storage.keys().forEach((key) => {
      if (key.startsWith('role_permissions_')) {
        removeLegacyKey(key);
      }
    });

    this.storage.keys({ onlyPrefixed: false }).forEach((key) => {
      if (key.startsWith('role_permissions_')) {
        removeLegacyKey(key, { usePrefix: false });
      }
    });
  }

  /**
   * 设置用户权限缓存
   * @param {Array} permissions - 权限列表
   */
  setUserPermissions(permissions) {
    return this.storage.set(this.userPermissionsKey, permissions, { expires: 30 * 60 * 1000 }); // 30分钟过期
  }

  /**
   * 获取用户权限缓存
   */
  getUserPermissions() {
    return this.storage.get(this.userPermissionsKey);
  }

  /**
   * 清除用户权限缓存
   */
  clearUserPermissions() {
    return this.storage.remove(this.userPermissionsKey);
  }

  /**
   * 清除所有权限相关缓存
   */
  clearAll() {
    this.clearLegacyAuthorityCaches();
    this.clearUserPermissions();
  }
}

// 创建全局实例
const unifiedStorage = new UnifiedStorage();
const tokenManager = new TokenManager(unifiedStorage);
const permissionManager = new PermissionManager(unifiedStorage);

export {
  UnifiedStorage,
  TokenManager,
  PermissionManager,
  unifiedStorage,
  tokenManager,
  permissionManager
};

// 默认导出统一存储实例
export default unifiedStorage;
