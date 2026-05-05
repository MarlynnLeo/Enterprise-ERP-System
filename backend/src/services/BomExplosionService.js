/**
 * BomExplosionService.js
 * @description BOM展开服务 - 实现引用式BOM的展开、缓存和循环检测
 * @date 2025-12-11
 * @version 2.0.0
 *
 * v2.0.0 重大优化：
 * - 修复循环引用检测缺陷：使用祖先路径数组替代Set副本，避免菱形依赖和跨BOM循环绕过
 * - 添加展开深度上限（MAX_DEPTH=20），防御性编程避免无限递归
 * - 重写缓存失效策略：递归级联向上失效所有祖先BOM缓存
 * - 统一缓存策略为 DELETE+INSERT，移除 is_valid 混用
 * - 循环引用检测兼顾草稿BOM，防止审核后才发现循环
 * - 展开结果添加 is_leaf 动态标记
 */

const { pool } = require('../config/db');
const { logger } = require('../utils/logger');

// BOM展开最大深度限制（防御性编程）
const MAX_DEPTH = 20;

class BomExplosionService {
  /**
   * 展开BOM - 递归获取所有层级物料
   * @param {number} productId - 产品物料ID
   * @param {number} bomId - 可选，指定BOM ID（不指定则取最新已审核版本）
   * @param {number} quantity - 产品数量（用于计算物料用量）
   * @param {boolean} useCache - 是否使用缓存
   * @returns {Promise<Array>} - 展开后的物料列表
   */
  static async explodeBom(productId, bomId = null, quantity = 1, useCache = true, options = {}) {
    const { netStockMap = null } = options;
    if (netStockMap) useCache = false; // 净推演强依赖实时查库存，禁用静态缓存

    try {
      if (useCache && bomId) {
        const cached = await this.getFromCache(bomId);
        if (cached && cached.length > 0) {
          return cached.map((item) => ({
            ...item,
            required_quantity: parseFloat(item.quantity_per) * quantity,
          }));
        }
      }

      const bom = bomId ? await this.getBomById(bomId) : await this.getLatestApprovedBom(productId);

      if (!bom) {
        logger.warn(`未找到产品 ${productId} 的BOM`);
        return [];
      }

      const ancestorPath = [];
      const baseQuantity = netStockMap ? quantity : 1;

      const explosionResult = await this.recursiveExplode(
        bom.id,
        bom.product_id,
        '',
        1,
        baseQuantity,
        ancestorPath,
        options
      );

      if (!netStockMap) {
        const parentIds = new Set(explosionResult.map(item => item.parent_material_id));
        for (const item of explosionResult) {
          item.is_leaf = !item.has_sub_bom && !parentIds.has(item.material_id);
        }

        if (explosionResult.length > 0 && useCache) {
          await this.saveToCache(bom.id, bom.version, explosionResult);
        }

        return explosionResult.map((item) => ({
          ...item,
          required_quantity: parseFloat(item.quantity_per) * quantity,
        }));
      }

      return explosionResult;
    } catch (error) {
      logger.error('展开BOM失败:', error);
      throw error;
    }
  }

  /**
   * 递归展开BOM
   * @param {number} bomId - 当前BOM ID
   * @param {number} productId - 当前BOM的产品物料ID
   * @param {string} parentPath - 父级路径字符串（如 "产品A/组件B"）
   * @param {number} level - 当前展开层级
   * @param {number} parentQuantity - 父级累乘用量（单位基准）
   * @param {Array<number>} ancestorPath - 祖先产品ID路径数组（用于循环引用检测）
   * @returns {Promise<Array>} - 展开后的物料列表
   */
  static async recursiveExplode(bomId, productId, parentPath, level, parentQuantity, ancestorPath, options = {}) {
    const { netStockMap = null, netReqMap = null } = options;
    const results = [];

    if (level > MAX_DEPTH) {
      logger.error(`BOM展开深度超过${MAX_DEPTH}层，疑似数据异常。BOM ID: ${bomId}, 产品ID: ${productId}`);
      return results;
    }

    if (ancestorPath.includes(productId)) {
      logger.warn(`检测到循环引用: ${ancestorPath.join(' → ')} → ${productId}`);
      return results;
    }

    ancestorPath.push(productId);

    try {
      const [details] = await pool.query(
        `
        SELECT 
          bd.*,
          m.code as material_code,
          m.name as material_name,
          m.specs as material_specs,
          u.name as unit_name
        FROM bom_details bd
        LEFT JOIN materials m ON bd.material_id = m.id
        LEFT JOIN units u ON bd.unit_id = u.id
        WHERE bd.bom_id = ?
        ORDER BY bd.level ASC, bd.id ASC
        `,
        [bomId]
      );

      const detailIds = new Set(details.map(d => d.id));
      const rootDetails = details.filter(d => !d.parent_id || d.parent_id === 0 || d.parent_id === '0' || !detailIds.has(d.parent_id));

      const traverseInternalTree = async (currentDetail, internalParentPath, internalLevel, internalParentQty, outputParentId) => {
        const currentPath = internalParentPath
          ? `${internalParentPath}/${currentDetail.material_code}`
          : currentDetail.material_code;

        const quantityPer = parseFloat(currentDetail.quantity) * internalParentQty;

        let qtyFromStock;
        let childNetDemand = quantityPer;

        if (netStockMap) {
          const stockQty = netStockMap.get(currentDetail.material_id) || 0;
          qtyFromStock = Math.min(childNetDemand, stockQty);
          childNetDemand = childNetDemand - qtyFromStock;

          netStockMap.set(currentDetail.material_id, stockQty - qtyFromStock);

          if (qtyFromStock > 0 && netReqMap) {
             if (!netReqMap.has(currentDetail.material_id)) {
                 netReqMap.set(currentDetail.material_id, { requiredQuantity: 0, level: internalLevel });
             }
             netReqMap.get(currentDetail.material_id).requiredQuantity += qtyFromStock;
          }
        } else {
          results.push({
            material_id: currentDetail.material_id,
            material_code: currentDetail.material_code,
            material_name: currentDetail.material_name,
            material_specs: currentDetail.material_specs,
            level: internalLevel,
            quantity_per: quantityPer,
            unit_id: currentDetail.unit_id,
            unit_name: currentDetail.unit_name,
            parent_material_id: outputParentId,
            bom_path: currentPath,
            source_bom_id: bomId,
            has_sub_bom: currentDetail.has_sub_bom || 0,
            ref_bom_id: currentDetail.ref_bom_id,
          });
        }

        if (childNetDemand > 0) {
            const inlineChildren = details.filter(c => c.parent_id === currentDetail.id);
            const hasExternal = currentDetail.has_sub_bom;
            const hasInternal = inlineChildren.length > 0;

            if (hasExternal) {
                const childBom = currentDetail.ref_bom_id
                    ? await this.getBomById(currentDetail.ref_bom_id)
                    : await this.getLatestApprovedBom(currentDetail.material_id);

                if (childBom) {
                  const externalChildren = await this.recursiveExplode(
                      childBom.id,
                      currentDetail.material_id,
                      currentPath,
                      internalLevel + 1,
                      childNetDemand,
                      ancestorPath,
                      options
                  );
                  if (!netStockMap) results.push(...externalChildren);
                }
            }

            if (hasInternal) {
                for (const child of inlineChildren) {
                    await traverseInternalTree(child, currentPath, internalLevel + 1, childNetDemand, currentDetail.material_id);
                }
            }

            if (netStockMap && netReqMap && !hasExternal && !hasInternal) {
                if (!netReqMap.has(currentDetail.material_id)) {
                     netReqMap.set(currentDetail.material_id, { requiredQuantity: 0, level: internalLevel });
                }
                netReqMap.get(currentDetail.material_id).requiredQuantity += childNetDemand;
            }
        }
      };

      for (const root of rootDetails) {
        await traverseInternalTree(root, parentPath, level, parentQuantity, productId);
      }
    } finally {
      ancestorPath.pop();
    }
    return results;
  }

  /**
   * 获取最新已审核的BOM
   */
  static async getLatestApprovedBom(productId) {
    const [rows] = await pool.query(
      `
      SELECT * FROM bom_masters 
      WHERE product_id = ? AND approved_by IS NOT NULL AND deleted_at IS NULL
      ORDER BY approved_at DESC, id DESC
      LIMIT 1
    `,
      [productId]
    );
    return rows[0] || null;
  }

  /**
   * 根据ID获取BOM
   */
  static async getBomById(bomId) {
    const [rows] = await pool.query('SELECT * FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [bomId]);
    return rows[0] || null;
  }

  /**
   * 从缓存获取展开结果
   * 统一使用 DELETE+INSERT 策略，缓存存在即有效
   */
  static async getFromCache(bomId) {
    try {
      const [rows] = await pool.query(
        `
        SELECT * FROM bom_explosion_cache
        WHERE bom_id = ?
        ORDER BY level ASC, id ASC
      `,
        [bomId]
      );
      return rows;
    } catch (error) {
      logger.warn('获取BOM缓存失败:', error.message);
      return null;
    }
  }

  /**
   * 保存展开结果到缓存
   */
  static async saveToCache(bomId, bomVersion, explosionResult) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 获取产品信息
      const [bomInfo] = await connection.query('SELECT product_id FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [
        bomId,
      ]);
      const productId = bomInfo[0]?.product_id;

      // 清除旧缓存（统一使用 DELETE 策略）
      await connection.query('DELETE FROM bom_explosion_cache WHERE bom_id = ?', [bomId]);

      // 插入新缓存
      if (explosionResult.length > 0) {
        const values = explosionResult.map((item) => [
          productId,
          bomId,
          bomVersion,
          item.material_id,
          item.material_code,
          item.material_name,
          item.level,
          item.quantity_per,
          item.parent_material_id,
          item.bom_path,
          item.source_bom_id,
          item.unit_id,
          item.unit_name,
        ]);

        await connection.query(
          `
          INSERT INTO bom_explosion_cache
          (product_id, bom_id, bom_version, material_id, material_code, material_name,
           level, quantity_per, parent_material_id, bom_path, source_bom_id, unit_id, unit_name)
          VALUES ?
        `,
          [values]
        );
      }

      await connection.commit();
      logger.info(`BOM ${bomId} 展开缓存已更新，共 ${explosionResult.length} 条记录`);
    } catch (error) {
      await connection.rollback();
      logger.error('保存BOM缓存失败:', error);
    } finally {
      connection.release();
    }
  }

  /**
   * 使BOM缓存失效（当BOM变更时调用）
   * 优化：递归级联向上失效所有祖先BOM的缓存，解决多级场景下底层变更上层不失效的问题
   */
  static async invalidateCache(bomId) {
    try {
      const invalidated = new Set();
      const queue = [bomId];

      while (queue.length > 0) {
        const currentBomId = queue.shift();

        // 防止重复处理
        if (invalidated.has(currentBomId)) continue;
        invalidated.add(currentBomId);

        // 1. 删除该BOM的缓存（统一使用DELETE策略）
        await pool.query('DELETE FROM bom_explosion_cache WHERE bom_id = ?', [currentBomId]);

        // 2. 获取该BOM的产品ID
        const [bomInfo] = await pool.query('SELECT product_id FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [
          currentBomId,
        ]);

        if (bomInfo.length > 0) {
          const productId = bomInfo[0].product_id;

          // 3. 查找所有引用该产品作为子组件的父级BOM，加入队列继续向上失效
          const [parentBoms] = await pool.query(
            `
            SELECT DISTINCT bd.bom_id 
            FROM bom_details bd
            WHERE bd.material_id = ? AND bd.has_sub_bom = 1
          `,
            [productId]
          );

          for (const parent of parentBoms) {
            if (!invalidated.has(parent.bom_id)) {
              queue.push(parent.bom_id);
            }
          }
        }
      }

      logger.info(`BOM ${bomId} 及所有祖先缓存已失效，共清除 ${invalidated.size} 个BOM缓存`);
    } catch (error) {
      logger.error('使BOM缓存失效失败:', error);
      throw error;
    }
  }

  /**
   * 检测循环引用
   * 优化：同时检查已审核和草稿状态的BOM，防止审核后才发现循环
   * @param {number} productId - 产品ID
   * @param {number} materialId - 要添加的物料ID
   * @returns {Promise<{hasCircle: boolean, path: string}>}
   */
  static async detectCircularReference(productId, materialId) {
    const visited = new Set();
    const path = [];

    const detect = async (currentId) => {
      if (currentId === productId) {
        return true; // 发现循环
      }

      if (visited.has(currentId)) {
        return false;
      }
      visited.add(currentId);
      path.push(currentId);

      // 获取该物料作为产品的可用BOM（同时检查已审核和启用状态的草稿BOM）
      const bom = await this.getAnyActiveBom(currentId);
      if (!bom) {
        path.pop();
        return false;
      }

      // 拉取本 BOM 下所有的物料（包含各层级内嵌物料）
      const [details] = await pool.query('SELECT material_id FROM bom_details WHERE bom_id = ?', [
        bom.id,
      ]);

      for (const detail of details) {
        if (await detect(detail.material_id)) {
          return true;
        }
      }

      path.pop();
      return false;
    };

    const hasCircle = await detect(materialId);

    return {
      hasCircle,
      path: hasCircle ? path.join(' -> ') + ` -> ${productId}` : '',
    };
  }

  /**
   * 获取物料的任意可用BOM（已审核优先，草稿兜底）
   * 用于循环引用检测，确保草稿状态的BOM也被纳入检测范围
   */
  static async getAnyActiveBom(productId) {
    // 优先查找已审核的BOM
    const approved = await this.getLatestApprovedBom(productId);
    if (approved) return approved;

    // 兜底查找启用状态的草稿BOM（status=1 且未审核）
    const [rows] = await pool.query(
      `
      SELECT * FROM bom_masters 
      WHERE product_id = ? AND status = 1 AND approved_by IS NULL AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT 1
    `,
      [productId]
    );
    return rows[0] || null;
  }

  /**
   * 更新物料的has_sub_bom标记
   */
  static async updateHasSubBomFlag(materialId) {
    try {
      // 检查该物料是否有已审核的BOM
      const bom = await this.getLatestApprovedBom(materialId);
      const hasSubBom = bom ? 1 : 0;

      // 更新所有使用该物料的BOM明细
      await pool.query(
        `
        UPDATE bom_details SET has_sub_bom = ? WHERE material_id = ?
      `,
        [hasSubBom, materialId]
      );

      logger.info(`物料 ${materialId} 的 has_sub_bom 标记已更新为 ${hasSubBom}`);
    } catch (error) {
      logger.error('更新has_sub_bom标记失败:', error);
      throw error;
    }
  }

  /**
   * 获取物料的子BOM信息
   */
  static async getMaterialSubBom(materialId) {
    try {
      const bom = await this.getLatestApprovedBom(materialId);
      if (!bom) {
        return null;
      }

      const [details] = await pool.query(
        `
        SELECT
          bd.*,
          m.code as material_code,
          m.name as material_name,
          m.specs as material_specs,
          u.name as unit_name
        FROM bom_details bd
        LEFT JOIN materials m ON bd.material_id = m.id
        LEFT JOIN units u ON bd.unit_id = u.id
        WHERE bd.bom_id = ? AND (bd.level = 1 OR bd.parent_id = 0 OR bd.parent_id IS NULL)
        ORDER BY bd.id ASC
      `,
        [bom.id]
      );

      return {
        bom_id: bom.id,
        version: bom.version,
        product_id: bom.product_id,
        details: details,
      };
    } catch (error) {
      logger.error('获取物料子BOM失败:', error);
      return null;
    }
  }

  /**
   * 计算多层BOM卷积成本
   * @param {number} productId - 产品物料ID
   * @param {number} bomId - 可选，指定BOM ID
   * @param {number} quantity - 产品数量，默认1
   * @returns {Promise<{totalCost: number, breakdown: Array}>} - 总成本和明细
   */
  static async calculateRolledUpCost(productId, bomId = null, quantity = 1) {
    try {
      // 1. 展开BOM获取所有物料
      const explodedItems = await this.explodeBom(productId, bomId, quantity, true);

      if (explodedItems.length === 0) {
        // 无BOM，返回物料自身成本
        const [materials] = await pool.query(
          'SELECT cost_price, price FROM materials WHERE id = ?',
          [productId]
        );
        const materialCost =
          materials.length > 0
            ? parseFloat(materials[0].cost_price) || parseFloat(materials[0].price) || 0
            : 0;
        return {
          totalCost: parseFloat((materialCost * quantity).toFixed(2)),
          breakdown: [],
          hasBom: false,
        };
      }

      // 2. 获取所有叶子节点物料（没有子BOM的物料）的价格
      const leafMaterialIds = explodedItems
        .filter((item) => !item.has_sub_bom)
        .map((item) => item.material_id);

      const uniqueMaterialIds = [...new Set(leafMaterialIds)];

      const priceMap = new Map();
      if (uniqueMaterialIds.length > 0) {
        const placeholders = uniqueMaterialIds.map(() => '?').join(',');
        const [prices] = await pool.query(
          `SELECT id, COALESCE(cost_price, price, 0) as unit_cost FROM materials WHERE id IN (${placeholders})`,
          uniqueMaterialIds
        );
        prices.forEach((p) => priceMap.set(p.id, parseFloat(p.unit_cost) || 0));
      }

      // 3. 计算卷积成本 - 只计算叶子节点
      let totalCost = 0;
      const breakdown = [];

      for (const item of explodedItems) {
        // 只计算叶子节点（没有子BOM的物料）
        if (!item.has_sub_bom) {
          const unitCost = priceMap.get(item.material_id) || 0;
          const itemCost = item.required_quantity * unitCost;
          totalCost += itemCost;

          breakdown.push({
            material_id: item.material_id,
            material_code: item.material_code,
            material_name: item.material_name,
            level: item.level,
            quantity: item.required_quantity,
            unit_cost: unitCost,
            subtotal: parseFloat(itemCost.toFixed(2)),
            bom_path: item.bom_path,
          });
        }
      }

      return {
        totalCost: parseFloat(totalCost.toFixed(2)),
        breakdown,
        hasBom: true,
        leafMaterialCount: breakdown.length,
      };
    } catch (error) {
      logger.error('计算BOM卷积成本失败:', error);
      throw error;
    }
  }
}

module.exports = BomExplosionService;
