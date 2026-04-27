/**
 * AccountMappingService.js
 * @description 会计科目映射服务
 * @date 2026-01-19
 * @version 1.0.0
 */

const db = require('../../config/db');
const logger = require('../../utils/logger');
const { softDelete } = require('../../utils/softDelete');

class AccountMappingService {
  /**
   * 获取业务类型的默认科目映射
   * @param {string} businessType - 业务类型 purchase_invoice, purchase_payment等
   * @param {Object} filters - 可选过滤条件 {supplier_category_id, material_category_id}
   * @returns {Promise<Object|null>} 科目映射对象
   */
  static async getDefaultMapping(businessType, filters = {}) {
    try {
      let query = `
        SELECT id, business_type, debit_account_id, credit_account_id, 
               supplier_category_id, material_category_id, description
        FROM finance_account_mapping
        WHERE business_type = ? AND status = TRUE AND deleted_at IS NULL
      `;
      const params = [businessType];

      // 如果提供了供应商分类，优先匹配
      if (filters.supplier_category_id) {
        query += ' AND (supplier_category_id = ? OR supplier_category_id IS NULL)';
        params.push(filters.supplier_category_id);
        query += ' ORDER BY supplier_category_id DESC'; // 优先返回有分类匹配的
      } else if (filters.material_category_id) {
        query += ' AND (material_category_id = ? OR material_category_id IS NULL)';
        params.push(filters.material_category_id);
        query += ' ORDER BY material_category_id DESC';
      } else {
        // 没有过滤条件，返回默认配置
        query += ' AND is_default = TRUE';
      }

      query += ' LIMIT 1';

      const [rows] = await db.pool.execute(query, params);

      if (rows.length === 0) {
        logger.warn('[AccountMapping] 未找到科目映射配置:', { businessType, filters });
        return null;
      }

      return rows[0];
    } catch (error) {
      logger.error('[AccountMapping] 获取默认映射失败:', { businessType, error: error.message });
      return null;
    }
  }

  /**
   * 创建科目映射
   * @param {Object} mappingData - 映射数据
   * @returns {Promise<number>} 新创建的映射ID
   */
  static async createMapping(mappingData) {
    try {
      const {
        business_type,
        debit_account_id,
        credit_account_id,
        supplier_category_id = null,
        material_category_id = null,
        description = '',
        is_default = false,
      } = mappingData;

      // 如果设置为默认，先取消同类型的其他默认配置
      if (is_default) {
        await db.pool.execute(
          'UPDATE finance_account_mapping SET is_default = FALSE WHERE business_type = ?',
          [business_type]
        );
      }

      const [result] = await db.pool.execute(
        `INSERT INTO finance_account_mapping 
        (business_type, debit_account_id, credit_account_id, supplier_category_id, 
         material_category_id, description, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          business_type,
          debit_account_id,
          credit_account_id,
          supplier_category_id,
          material_category_id,
          description,
          is_default,
        ]
      );

      logger.info('[AccountMapping] 创建科目映射成功:', { id: result.insertId, business_type });
      return result.insertId;
    } catch (error) {
      logger.error('[AccountMapping] 创建科目映射失败:', error);
      throw error;
    }
  }

  /**
   * 更新科目映射
   * @param {number} id - 映射ID
   * @param {Object} mappingData - 更新的数据
   * @returns {Promise<boolean>} 是否成功
   */
  static async updateMapping(id, mappingData) {
    try {
      const {
        business_type,
        debit_account_id,
        credit_account_id,
        supplier_category_id,
        material_category_id,
        description,
        is_default,
        status,
      } = mappingData;

      // 如果设置为默认，先取消同类型的其他默认配置
      if (is_default && business_type) {
        await db.pool.execute(
          'UPDATE finance_account_mapping SET is_default = FALSE WHERE business_type = ? AND id != ?',
          [business_type, id]
        );
      }

      const updateFields = [];
      const updateValues = [];

      if (business_type !== undefined) {
        updateFields.push('business_type = ?');
        updateValues.push(business_type);
      }
      if (debit_account_id !== undefined) {
        updateFields.push('debit_account_id = ?');
        updateValues.push(debit_account_id);
      }
      if (credit_account_id !== undefined) {
        updateFields.push('credit_account_id = ?');
        updateValues.push(credit_account_id);
      }
      if (supplier_category_id !== undefined) {
        updateFields.push('supplier_category_id = ?');
        updateValues.push(supplier_category_id);
      }
      if (material_category_id !== undefined) {
        updateFields.push('material_category_id = ?');
        updateValues.push(material_category_id);
      }
      if (description !== undefined) {
        updateFields.push('description = ?');
        updateValues.push(description);
      }
      if (is_default !== undefined) {
        updateFields.push('is_default = ?');
        updateValues.push(is_default);
      }
      if (status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(status);
      }

      if (updateFields.length === 0) {
        return true;
      }

      updateValues.push(id);

      await db.pool.execute(
        `UPDATE finance_account_mapping SET ${updateFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        updateValues
      );

      logger.info('[AccountMapping] 更新科目映射成功:', { id });
      return true;
    } catch (error) {
      logger.error('[AccountMapping] 更新科目映射失败:', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 删除科目映射
   * @param {number} id - 映射ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async deleteMapping(id) {
    try {
      // ✅ 软删除替代硬删除
      await softDelete(db.pool, 'finance_account_mapping', 'id', id);

      logger.info('[AccountMapping] 删除科目映射成功:', { id });
      return true;
    } catch (error) {
      logger.error('[AccountMapping] 删除科目映射失败:', { id, error: error.message });
      throw error;
    }
  }

  /**
   * 获取所有科目映射列表
   * @param {string} businessType - 可选的业务类型过滤
   * @returns {Promise<Array>} 映射列表
   */
  static async getAllMappings(businessType = null) {
    try {
      let query = `
        SELECT m.id, m.business_type, m.debit_account_id, m.credit_account_id,
               m.supplier_category_id, m.material_category_id, m.description,
               m.is_default, m.status,
               d.account_code as debit_code, d.account_name as debit_name,
               c.account_code as credit_code, c.account_name as credit_name
        FROM finance_account_mapping m
        LEFT JOIN gl_accounts d ON m.debit_account_id = d.id
        LEFT JOIN gl_accounts c ON m.credit_account_id = c.id
        WHERE m.deleted_at IS NULL
      `;
      const params = [];

      if (businessType) {
        query += ' AND m.business_type = ?';
        params.push(businessType);
      }

      query += ' ORDER BY m.business_type, m.is_default DESC, m.id';

      const [rows] = await db.pool.execute(query, params);
      return rows;
    } catch (error) {
      logger.error('[AccountMapping] 获取映射列表失败:', error);
      return [];
    }
  }
}

module.exports = AccountMappingService;
