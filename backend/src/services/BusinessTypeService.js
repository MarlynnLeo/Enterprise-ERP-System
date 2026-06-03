/**
 * 业务类型服务
 * @description 统一管理业务类型，从数据库动态获取，替代硬编码
 * @author AI Assistant
 * @date 2025-11-22
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');

class BusinessTypeService {
  constructor() {
    // 缓存业务类型数据
    this.cache = {
      types: null,
      typeMap: null,
      categoryMap: null,
      lastUpdate: null,
    };

    // 缓存有效期（5分钟）
    this.CACHE_TTL = 5 * 60 * 1000;
  }

  /**
   * 获取所有启用的业务类型
   * @returns {Promise<Array>} 业务类型列表
   */
  async getAllTypes() {
    // 检查缓存
    if (this.isCacheValid()) {
      return this.cache.types;
    }

    try {
      const [types] = await pool.execute(
        'SELECT id, code, name, category, group_code, description, icon, color, tag_type, sort_order, is_system, status, created_at, updated_at, created_by, updated_by FROM business_types WHERE status = 1 ORDER BY group_code, category, sort_order, id'
      );

      // 更新缓存
      this.cache.types = types;
      this.cache.lastUpdate = Date.now();

      // 构建映射表
      this.buildMaps(types);

      return types;
    } catch (error) {
      logger.error('获取业务类型失败:', error);
      // 如果有缓存，返回缓存数据
      if (this.cache.types) {
        logger.warn('使用缓存的业务类型数据');
        return this.cache.types;
      }
      throw error;
    }
  }

  /**
   * 根据编码获取业务类型名称
   * @param {string} code - 业务类型编码
   * @returns {Promise<string>} 业务类型名称
   */
  async getTypeName(code) {
    if (!this.cache.typeMap || !this.isCacheValid()) {
      await this.getAllTypes();
    }
    return this.cache.typeMap[code] || code;
  }

  /**
   * 根据分类获取业务类型列表（保留向后兼容，建议后续使用 group_code 替代）
   * @param {string} category - 分类 (in/out/transfer/adjust)
   * @returns {Promise<Array>} 业务类型列表
   */
  async getTypesByCategory(category) {
    const types = await this.getAllTypes();
    return types.filter((t) => t.category === category && t.group_code === 'inventory_transaction');
  }

  /**
   * 根据字典分组获取业务类型列表
   * @param {string} groupCode - 字典分组编码
   * @returns {Promise<Array>} 业务类型列表
   */
  async getTypesByGroup(groupCode) {
    const types = await this.getAllTypes();
    return types.filter((t) => t.group_code === groupCode);
  }

  /**
   * 获取指定分组的 业务类型 -> 名称 映射表
   * @param {string} groupCode - 字典分组编码
   * @returns {Promise<Object>} 映射表，如 { in: "入库", out: "出库" }
   */
  async getGroupMap(groupCode) {
    const types = await this.getTypesByGroup(groupCode);
    const map = {};
    for (const t of types) {
      map[t.code] = t.name;
    }
    return map;
  }

  /**
   * 获取所有业务类型编码列表
   * @returns {Promise<Array<string>>} 编码列表
   */
  async getAllCodes() {
    const types = await this.getAllTypes();
    return types.map((t) => t.code);
  }

  /**
   * 检查业务类型编码是否有效
   * @param {string} code - 业务类型编码
   * @returns {Promise<boolean>} 是否有效
   */
  async isValidCode(code) {
    const codes = await this.getAllCodes();
    return codes.includes(code);
  }

  /**
   * 获取业务类型的分类
   * @param {string} code - 业务类型编码
   * @returns {Promise<string|null>} 分类
   */
  async getCategory(code) {
    if (!this.cache.typeMap || !this.isCacheValid()) {
      await this.getAllTypes();
    }
    const type = this.cache.types?.find((t) => t.code === code);
    return type?.category || null;
  }

  /**
   * 判断是否为入库类型
   * @param {string} code - 业务类型编码
   * @returns {Promise<boolean>}
   */
  async isInboundType(code) {
    const category = await this.getCategory(code);
    return category === 'in';
  }

  /**
   * 判断是否为出库类型
   * @param {string} code - 业务类型编码
   * @returns {Promise<boolean>}
   */
  async isOutboundType(code) {
    const category = await this.getCategory(code);
    return category === 'out';
  }

  /**
   * 判断是否为调拨类型
   * @param {string} code - 业务类型编码
   * @returns {Promise<boolean>}
   */
  async isTransferType(code) {
    const category = await this.getCategory(code);
    return category === 'transfer';
  }

  /**
   * 判断是否为调整类型
   * @param {string} code - 业务类型编码
   * @returns {Promise<boolean>}
   */
  async isAdjustType(code) {
    const category = await this.getCategory(code);
    return category === 'adjust';
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache = {
      types: null,
      typeMap: null,
      categoryMap: null,
      lastUpdate: null,
    };
    logger.info('业务类型缓存已清除');
  }

  // ========== 私有方法 ==========

  /**
   * 检查缓存是否有效
   * @private
   */
  isCacheValid() {
    if (!this.cache.types || !this.cache.lastUpdate) {
      return false;
    }
    return Date.now() - this.cache.lastUpdate < this.CACHE_TTL;
  }

  /**
   * 构建映射表
   * @private
   */
  buildMaps(types) {
    // 编码 -> 名称映射
    this.cache.typeMap = {};
    types.forEach((t) => {
      this.cache.typeMap[t.code] = t.name;
    });

    // 分类 -> 类型列表映射
    this.cache.categoryMap = {
      in: [],
      out: [],
      transfer: [],
      adjust: [],
    };
    types.forEach((t) => {
      if (this.cache.categoryMap[t.category]) {
        this.cache.categoryMap[t.category].push(t);
      }
    });
  }
}

// 导出单例
module.exports = new BusinessTypeService();
