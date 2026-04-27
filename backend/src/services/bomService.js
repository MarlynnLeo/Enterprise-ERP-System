const { pool } = require('../config/db');
const { logger } = require('../utils/logger');
const { softDelete } = require('../utils/softDelete');

const bomService = {
  async getAllBoms(page = 1, pageSize = 10, filters = {}) {
    try {
      const offset = (page - 1) * pageSize;

      // 构建WHERE子句
      let whereClause = 'bm.deleted_at IS NULL';
      const params = [];

      // 默认不显示历史版本（status=2），除非明确请求
      if (!filters.includeHistory) {
        whereClause += ' AND bm.status != 2';
      }

      if (filters.productId) {
        whereClause += ' AND bm.product_id = ?';
        params.push(filters.productId);
      }
      if (filters.version) {
        whereClause += ' AND bm.version LIKE ?';
        params.push(`%${filters.version}%`);
      }
      if (filters.status !== undefined && filters.status !== '') {
        if (filters.status === 'active') {
          whereClause += ' AND bm.status = ?';
          params.push(1);
        } else if (filters.status === 'inactive') {
          whereClause += ' AND bm.status = ?';
          params.push(0);
        } else {
          whereClause += ' AND bm.status = ?';
          params.push(parseInt(filters.status));
        }
      }
      // 支持前端传递的 approved 参数（true/false），基于 approved_by 判断审核状态
      if (filters.approved !== undefined && filters.approved !== '') {
        const isApproved = filters.approved === 'true' || filters.approved === true;
        if (isApproved) {
          whereClause += ' AND bm.approved_by IS NOT NULL';
        } else {
          whereClause += ' AND bm.approved_by IS NULL';
        }
      }

      // 获取总数
      const countSql = `
        SELECT COUNT(*) as total
        FROM bom_masters bm
        WHERE ${whereClause}
      `;
      const [countResult] = await pool.query(countSql, params);
      const total =
        countResult && countResult[0] && countResult[0].total ? countResult[0].total : 0;

      // 数据查询 - 优化：使用单个查询获取BOM主表数据，并计算approved字段
      const dataSql = `
        SELECT
          bm.*,
          m.name as product_name,
          m.code as product_code,
          m.specs as product_specs,
          CAST(CASE WHEN bm.approved_by IS NOT NULL THEN 1 ELSE 0 END AS SIGNED) as approved
        FROM bom_masters bm
        LEFT JOIN materials m ON bm.product_id = m.id
        WHERE ${whereClause}
        ORDER BY bm.id DESC LIMIT ${parseInt(pageSize)} OFFSET ${parseInt(offset)}
      `;
      // 注意：LIMIT 和 OFFSET 不能使用参数绑定，必须直接嵌入 SQL
      const [bomMasters] = await pool.query(dataSql, params);

      // 优化：一次性获取所有BOM的明细数据（解决N+1查询问题）
      let dataWithDetails = bomMasters;
      if (bomMasters.length > 0) {
        const bomIds = bomMasters.map((bom) => bom.id);

        // 一次性查询所有明细
        const [allDetails] = await pool.query(
          `
          SELECT
            bd.*,
            m.name as material_name,
            m.code as material_code,
            m.specs as material_specs,
            u.name as unit_name,
            COALESCE(bd.level, 1) as level,
            COALESCE(bd.parent_id, 0) as parent_id
          FROM bom_details bd
          LEFT JOIN materials m ON bd.material_id = m.id
          LEFT JOIN units u ON bd.unit_id = u.id
          WHERE bd.bom_id IN (?)
          ORDER BY bd.bom_id, bd.level ASC, bd.id ASC
        `,
          [bomIds]
        );

        // 在内存中组装数据
        const detailsMap = {};
        allDetails.forEach((detail) => {
          if (!detailsMap[detail.bom_id]) {
            detailsMap[detail.bom_id] = [];
          }
          detailsMap[detail.bom_id].push(detail);
        });

        dataWithDetails = bomMasters.map((bom) => ({
          ...bom,
          details: detailsMap[bom.id] || [],
        }));
      }

      return {
        data: dataWithDetails,
        pagination: {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      logger.error('获取BOM列表失败:', error);
      throw error;
    }
  },

  async getBomById(id) {
    try {
      // 获取BOM主表信息，并计算approved字段
      const [bomMasters] = await pool.query(
        `
        SELECT
          bm.*,
          m.name as product_name,
          m.code as product_code,
          m.specs as product_specs,
          CAST(CASE WHEN bm.approved_by IS NOT NULL THEN 1 ELSE 0 END AS SIGNED) as approved
        FROM bom_masters bm
        LEFT JOIN materials m ON bm.product_id = m.id
        WHERE bm.id = ? AND bm.deleted_at IS NULL
      `,
        [id]
      );

      const bomMaster = bomMasters[0];

      if (!bomMaster) {
        return null;
      }

      // 获取BOM明细（支持多级），包含has_sub_bom字段
      const [detailRows] = await pool.query(
        `
        SELECT
          bd.*,
          m.name as material_name,
          m.code as material_code,
          m.specs as material_specs,
          u.name as unit_name,
          COALESCE(bd.level, 1) as level,
          COALESCE(bd.parent_id, 0) as parent_id,
          COALESCE(bd.has_sub_bom, 0) as has_sub_bom
        FROM bom_details bd
        LEFT JOIN materials m ON bd.material_id = m.id
        LEFT JOIN units u ON bd.unit_id = u.id
        WHERE bd.bom_id = ?
        ORDER BY bd.level ASC, bd.id ASC
      `,
        [id]
      );

      // 对明细进行层次排序，确保子级紧跟在父级后面
      const details = [];

      // 递归添加明细及其子级
      const addDetailWithChildren = (detail) => {
        details.push(detail);
        // 查找该明细的所有子级
        detailRows.forEach((child) => {
          if (child.parent_id == detail.id) {
            addDetailWithChildren(child);
          }
        });
      };

      // 先添加所有一级明细及其子级
      detailRows.forEach((detail) => {
        if (detail.level == 1 || detail.parent_id == 0) {
          // 检查是否已经添加过（避免重复）
          if (!details.find((d) => d.id === detail.id)) {
            addDetailWithChildren(detail);
          }
        }
      });

      // 格式化BOM数据，确保字段类型正确
      const formattedBom = {
        id: bomMaster.id,
        product_id: bomMaster.product_id,
        version: bomMaster.version,
        status: Number(bomMaster.status),
        approved: bomMaster.approved, // SQL CAST已确保为整数
        approved_by: bomMaster.approved_by || null,
        approved_at: bomMaster.approved_at || null,
        remark: bomMaster.remark || '',
        attachment: bomMaster.attachment || null,
        product_code: bomMaster.product_code,
        product_name: bomMaster.product_name,
        product_specs: bomMaster.product_specs || '',
        created_at: bomMaster.created_at,
        updated_at: bomMaster.updated_at,
        created_by: bomMaster.created_by || '',
        updated_by: bomMaster.updated_by || '',
        details: details.map((detail) => ({
          id: detail.id,
          bom_id: detail.bom_id,
          material_id: detail.material_id,
          quantity: Number(detail.quantity),
          unit_id: detail.unit_id,
          remark: detail.remark || '',
          material_code: detail.material_code,
          material_name: detail.material_name,
          material_specs: detail.material_specs || '',
          specs: detail.material_specs || '',
          unit_name: detail.unit_name,
          level: detail.level || 1,
          parent_id: detail.parent_id || 0,
        })),
        // 添加树形结构
        detailsTree: this.buildBomTree(
          details.map((detail) => ({
            id: detail.id,
            bom_id: detail.bom_id,
            material_id: detail.material_id,
            quantity: Number(detail.quantity),
            unit_id: detail.unit_id,
            remark: detail.remark || '',
            material_code: detail.material_code,
            material_name: detail.material_name,
            material_specs: detail.material_specs || '',
            specs: detail.material_specs || '',
            unit_name: detail.unit_name,
            level: detail.level || 1,
            parent_id: detail.parent_id || 0,
          }))
        ),
      };

      return formattedBom;
    } catch (error) {
      logger.error(`获取BOM详情失败 (ID: ${id}):`, error);
      throw error;
    }
  },

  async getBomDetails(bomId) {
    try {
      const [details] = await pool.query(
        `
        SELECT
          bd.*,
          m.name as material_name,
          m.code as material_code,
          m.specs as specification,
          u.name as unit_name,
          COALESCE(bd.level, 1) as level,
          COALESCE(bd.parent_id, 0) as parent_id
        FROM bom_details bd
        LEFT JOIN materials m ON bd.material_id = m.id
        LEFT JOIN units u ON bd.unit_id = u.id
        WHERE bd.bom_id = ?
        ORDER BY bd.level ASC, bd.id ASC
      `,
        [bomId]
      );
      return details;
    } catch (error) {
      logger.error(`获取BOM明细失败 (BOM ID: ${bomId}):`, error);
      throw error;
    }
  },

  async getMultiLevelBomDetails(bomId) {
    try {
      const details = await this.getBomDetails(bomId);
      return this.buildBomTree(details);
    } catch (error) {
      logger.error(`获取多级BOM结构失败 (BOM ID: ${bomId}):`, error);
      throw error;
    }
  },

  buildBomTree(details) {
    const tree = [];
    const map = {};

    if (!details || details.length === 0) {
      return tree;
    }

    details.forEach((item) => {
      map[item.id] = { ...item, children: [] };
    });

    details.forEach((item) => {
      const parentId = item.parent_id;
      if (parentId && parentId !== 0 && map[parentId]) {
        map[parentId].children.push(map[item.id]);
      } else {
        tree.push(map[item.id]);
      }
    });

    return tree;
  },

  // 自动递增版本号辅助方法（V1.1 → V1.2 → V1.3）
  async getNextVersion(connection, productId) {
    const [rows] = await connection.query(
      'SELECT version FROM bom_masters WHERE product_id = ? AND deleted_at IS NULL ORDER BY id DESC',
      [productId]
    );

    if (!rows || rows.length === 0) {
      return 'V1.1';
    }

    // 解析所有版本号，找到最大的 major.minor
    let maxMajor = 1;
    let maxMinor = 0;
    for (const row of rows) {
      // 匹配 V{major}.{minor} 格式
      const match = String(row.version).match(/V(\d+)\.(\d+)/i);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10);
        if (major > maxMajor || (major === maxMajor && minor > maxMinor)) {
          maxMajor = major;
          maxMinor = minor;
        }
      }
    }

    // 小版本号 +1
    return `V${maxMajor}.${maxMinor + 1}`;
  },

  // 参数验证和规范化函数
  validateAndNormalizeBomData(bomData) {
    // 验证必填字段
    if (!bomData.product_id) {
      throw new Error('产品ID不能为空');
    }
    if (!bomData.version) {
      throw new Error('版本号不能为空');
    }

    // 规范化参数
    return {
      status: bomData.status !== undefined ? Number(bomData.status) : 1,
      product_id: Number(bomData.product_id),
      version: String(bomData.version).trim(),
      remark: bomData.remark || null,
      attachment: bomData.attachment || null,
      created_by: bomData.created_by || null,
      updated_by: bomData.updated_by || null,
    };
  },

  // 验证和规范化明细数据
  validateAndNormalizeDetail(detail) {
    if (!detail.material_id) {
      throw new Error('物料ID不能为空');
    }

    return {
      material_id: Number(detail.material_id),
      quantity: Number(detail.quantity) || 0,
      unit_id: Number(detail.unit_id) || 1, // 默认使用单位ID 1，因为数据库不允许NULL
      remark: detail.remark || null,
      level: Number(detail.level) || 1,
      parent_id: detail.parent_id || 0,
    };
  },

  // ✅ 公共方法: BOM 明细批量插入（createBom/updateBom 共用）
  async _insertBomDetails(connection, bomId, details) {
    const idMapping = {};
    const sortedDetails = details.sort((a, b) => (a.level || 1) - (b.level || 1));

    for (const detail of sortedDetails) {
      const normalizedDetail = this.validateAndNormalizeDetail(detail);

      let actualParentId = 0;
      if (detail.parent_id && detail.parent_id !== 0 && detail.parent_id !== '0') {
        actualParentId = idMapping[detail.parent_id] || 0;
      }

      const [detailResult] = await connection.execute(
        'INSERT INTO bom_details (bom_id, material_id, quantity, unit_id, remark, level, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          bomId,
          normalizedDetail.material_id,
          normalizedDetail.quantity,
          normalizedDetail.unit_id,
          normalizedDetail.remark,
          normalizedDetail.level,
          actualParentId,
        ]
      );

      if (detail.id) {
        idMapping[detail.id] = detailResult.insertId;
      }
    }

    return idMapping;
  },

  // ✅ 公共方法: BOM 变更后异步重算标准成本
  _asyncRecalcStandardCost(productId) {
    setImmediate(async () => {
      try {
        const CostAccountingService = require('./business/CostAccountingService');
        const result = await CostAccountingService.calculateStandardCost(productId, 1);
        if (result && result.standardCost) {
          await pool.execute(
            `INSERT INTO standard_costs 
             (product_id, standard_price, effective_date, is_active, source_type)
             VALUES (?, ?, CURDATE(), 1, 'rollup')
             ON DUPLICATE KEY UPDATE
             standard_price = VALUES(standard_price), updated_at = NOW()`,
            [productId, result.standardCost.unitCost || 0]
          );
          logger.info(`[BOM变更] 产品 ${productId} 标准成本已自动重算: ${result.standardCost.unitCost}`);
        }
      } catch (e) {
        logger.warn('[BOM变更] 自动重算标准成本失败:', e.message);
      }
    });
  },

  async createBom(bomData, details) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 验证和规范化BOM数据
      const normalizedBomData = this.validateAndNormalizeBomData(bomData);

      const [result] = await connection.execute(
        'INSERT INTO bom_masters (product_id, version, status, remark, attachment, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          normalizedBomData.product_id,
          normalizedBomData.version,
          normalizedBomData.status,
          normalizedBomData.remark,
          normalizedBomData.attachment,
          normalizedBomData.created_by,
          normalizedBomData.updated_by,
        ]
      );

      const bomId = result.insertId;

      // ✅ 使用公共方法插入明细
      await this._insertBomDetails(connection, bomId, details);

      await connection.commit();

      const [productRows] = await connection.execute(
        'SELECT m.name as product_name, m.code as product_code FROM materials m WHERE m.id = ?',
        [normalizedBomData.product_id]
      );

      const product =
        productRows.length > 0 ? productRows[0] : { product_name: '', product_code: '' };

      const newBom = {
        id: bomId,
        ...normalizedBomData,
        product_name: product.product_name,
        product_code: product.product_code,
        details: details,
      };

      // 创建BOM后，更新该产品在其他BOM中的has_sub_bom标记
      try {
        const BomExplosionService = require('./BomExplosionService');
        await BomExplosionService.updateHasSubBomFlag(normalizedBomData.product_id);
      } catch (e) {
        logger.warn('更新has_sub_bom标记失败:', e.message);
      }

      // ✅ 使用公共方法异步重算标准成本
      this._asyncRecalcStandardCost(normalizedBomData.product_id);

      return newBom;
    } catch (error) {
      await connection.rollback();
      logger.error('创建BOM失败:', error);
      throw new Error(`创建BOM失败: ${error.message}`);
    } finally {
      connection.release();
    }
  },

  async updateBom(id, bomData, details) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // ① 查询旧 BOM 是否存在
      const [oldBomRows] = await connection.query(
        'SELECT * FROM bom_masters WHERE id = ? AND deleted_at IS NULL FOR UPDATE',
        [id]
      );
      if (!oldBomRows || oldBomRows.length === 0) {
        throw new Error('BOM不存在');
      }
      const oldBom = oldBomRows[0];
      
      const isApproved = oldBom.approved_by !== null && oldBom.approved_by !== undefined;

      if (isApproved) {
        // ==========================
        // 分支 A: 已审核 BOM -> 升版流程 (BOM Revision)
        // ==========================
        
        // 1. 删除该产品已有的更老的历史版本（只保留这一个即将成为历史的旧版本供对比）
        const [existingHistory] = await connection.query(
          'SELECT id FROM bom_masters WHERE product_id = ? AND status = 2 AND deleted_at IS NULL',
          [oldBom.product_id]
        );
        for (const hist of existingHistory) {
          if (hist.id !== oldBom.id) {
            await connection.execute('DELETE FROM bom_details WHERE bom_id = ?', [hist.id]);
            // ✅ 软删除历史BOM主表
            await softDelete(connection, 'bom_masters', 'id', hist.id);
          }
        }

        // 2. 将当前已审核 BOM 标记为历史版本 (status=2)
        // 保留 approved_by 数据作为历史存档记录，但修改 status
        await connection.execute(
          'UPDATE bom_masters SET status = 2 WHERE id = ?',
          [id]
        );

        // 3. 生成新版本号
        const newVersion = await this.getNextVersion(connection, oldBom.product_id);

        const normalizedBomData = this.validateAndNormalizeBomData({
          ...bomData,
          version: newVersion,
          product_id: oldBom.product_id
        });

        // 4. 创建新版本草稿 BOM 记录 (status=1, approved_by=NULL)
        const [result] = await connection.execute(
          'INSERT INTO bom_masters (product_id, version, status, remark, attachment, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            normalizedBomData.product_id,
            normalizedBomData.version,
            1, // 新版本为启用草稿
            normalizedBomData.remark,
            normalizedBomData.attachment,
            normalizedBomData.created_by || oldBom.created_by,
            normalizedBomData.updated_by,
          ]
        );

        const newBomId = result.insertId;

        // 5. 插入新版本明细
        await this._insertBomDetails(connection, newBomId, details);

        await connection.commit();

        try {
          const BomExplosionService = require('./BomExplosionService');
          await BomExplosionService.invalidateCache(id);
        } catch (e) {
          logger.warn('使BOM缓存失效失败:', e.message);
        }

        this._asyncRecalcStandardCost(normalizedBomData.product_id);

        logger.info(`[BOM升版] 历史版本 #${id}(${oldBom.version}) → 新版草稿 #${newBomId}(${newVersion})`);
        return { id: newBomId, ...normalizedBomData, version: newVersion, details };

      } else {
        // ==========================
        // 分支 B: 未审核草稿 BOM -> 原地更新 (In-Place Edit)
        // ==========================
        const normalizedBomData = this.validateAndNormalizeBomData({
          ...bomData,
          status: oldBom.status, 
          product_id: oldBom.product_id 
        });

        // 原地更新 BOM 主表
        await connection.execute(
          'UPDATE bom_masters SET version = ?, remark = ?, attachment = ?, updated_by = ? WHERE id = ?',
          [
            normalizedBomData.version,
            normalizedBomData.remark,
            normalizedBomData.attachment,
            normalizedBomData.updated_by,
            id
          ]
        );

        // 覆盖更新所有明细
        await connection.execute('DELETE FROM bom_details WHERE bom_id = ?', [id]);
        await this._insertBomDetails(connection, id, details);

        await connection.commit();

        try {
          const BomExplosionService = require('./BomExplosionService');
          await BomExplosionService.invalidateCache(id);
        } catch (e) {
          logger.warn('使BOM缓存失效失败:', e.message);
        }

        this._asyncRecalcStandardCost(normalizedBomData.product_id);

        logger.info(`[BOM编辑] 原地更新草稿BOM #${id} (${normalizedBomData.version})`);
        return { id: Number(id), ...normalizedBomData, details };
      }
    } catch (error) {
      await connection.rollback();
      logger.error('修改BOM失败:', error);
      throw new Error(`修改BOM失败: ${error.message}`);
    } finally {
      connection.release();
    }
  },

  async deleteBom(id) {
    try {
      // 检查 BOM 是否存在及审核状态
      const [bomInfo] = await pool.query(
        'SELECT product_id, approved_by FROM bom_masters WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
      if (!bomInfo || bomInfo.length === 0) {
        throw new Error('BOM不存在');
      }
      if (bomInfo[0].approved_by) {
        throw new Error('已审核的BOM不能删除，请先反审后再操作');
      }
      const productId = bomInfo[0].product_id;

      // 检查是否被生产计划引用
      const [plans] = await pool.query(
        'SELECT COUNT(*) as count FROM production_plans WHERE bom_id = ?',
        [id]
      );
      if (plans[0].count > 0) {
        throw new Error('该BOM已被生产计划引用，不能删除');
      }

      // 使缓存失效
      try {
        const BomExplosionService = require('./BomExplosionService');
        await BomExplosionService.invalidateCache(id);
      } catch (e) {
        logger.warn('使BOM缓存失效失败:', e.message);
      }

      await pool.query('DELETE FROM bom_details WHERE bom_id = ?', [id]);
      // ✅ 软删除BOM主表
      await softDelete(pool, 'bom_masters', 'id', id);

      // 更新该产品在其他BOM中的has_sub_bom标记
      if (productId) {
        try {
          const BomExplosionService = require('./BomExplosionService');
          await BomExplosionService.updateHasSubBomFlag(productId);
        } catch (e) {
          logger.warn('更新has_sub_bom标记失败:', e.message);
        }
      }

      return true;
    } catch (error) {
      logger.error('删除BOM失败:', error);
      throw error;
    }
  },

  async getLatestBomByProductId(productId, status) {
    try {
      let condition = 'bm.product_id = ? AND bm.deleted_at IS NULL';
      const params = [productId];

      if (status !== undefined && status !== null) {
        condition += ' AND bm.status = ?';
        params.push(parseInt(status));
      }

      const [bomMasters] = await pool.query(
        `
        SELECT bm.*, m.name as product_name, m.code as product_code, m.specs as product_specs
        FROM bom_masters bm
        LEFT JOIN materials m ON bm.product_id = m.id
        WHERE ${condition}
        ORDER BY bm.version DESC, bm.created_at DESC
      `,
        params
      );

      if (!bomMasters || bomMasters.length === 0) {
        return { data: [] };
      }

      // 优化：批量查询所有BOM的明细，避免N+1查询
      const bomIds = bomMasters.map((bom) => bom.id);
      const [allDetails] = await pool.query(
        `
                SELECT
                    bd.*,
                    m.name as material_name,
                    m.code as material_code,
                    m.specs as specification,
                    u.name as unit_name
                FROM bom_details bd
                LEFT JOIN materials m ON bd.material_id = m.id
                LEFT JOIN units u ON bd.unit_id = u.id
                WHERE bd.bom_id IN (?)
            `,
        [bomIds]
      );

      // 按bom_id分组明细
      const detailsMap = {};
      allDetails.forEach((detail) => {
        if (!detailsMap[detail.bom_id]) {
          detailsMap[detail.bom_id] = [];
        }
        detailsMap[detail.bom_id].push(detail);
      });

      // 组装结果
      const bomWithDetails = bomMasters.map((bom) => ({
        ...bom,
        details: detailsMap[bom.id] || [],
      }));

      return { data: bomWithDetails };
    } catch (error) {
      logger.error('获取产品BOM失败:', error);
      throw error;
    }
  },

  // ========== 统一命名别名 - 保持向后兼容 ==========
  getAll(page = 1, pageSize = 10, filters = {}) {
    return this.getAllBoms(page, pageSize, filters);
  },
  getById(id) {
    return this.getBomById(id);
  },
  
  // 批量替换BOM物料
  async replaceBom(oldMaterialCode, newMaterialCode) {
    let connection;
    try {
      connection = await pool.getConnection();

      // 1. 查找旧物料
      const [oldMaterials] = await connection.query('SELECT id FROM materials WHERE code = ?', [oldMaterialCode]);
      if (oldMaterials.length === 0) throw new Error(`找不到被替换物料编码: ${oldMaterialCode}`);
      const oldMaterialId = oldMaterials[0].id;

      // 2. 查找新物料
      const [newMaterials] = await connection.query('SELECT id, unit_id FROM materials WHERE code = ?', [newMaterialCode]);
      if (newMaterials.length === 0) throw new Error(`找不到新物料编码: ${newMaterialCode}`);
      const newMaterialId = newMaterials[0].id;
      const newUnitId = newMaterials[0].unit_id || null;

      if (oldMaterialId === newMaterialId) throw new Error('新旧物料不能相同');

      // 3. 查找受影响的BOM并检查循环引用
      const [affectedBoms] = await connection.query('SELECT DISTINCT bom_id FROM bom_details WHERE material_id = ?', [oldMaterialId]);
      
      if (affectedBoms.length === 0) {
        return { affectedRows: 0, bomsCount: 0, message: '没有找到使用该被替换物料的BOM' };
      }

      await connection.beginTransaction();

      let updateSql;
      let params;
      if (newUnitId) {
        updateSql = 'UPDATE bom_details SET material_id = ?, unit_id = ? WHERE material_id = ?';
        params = [newMaterialId, newUnitId, oldMaterialId];
      } else {
        updateSql = 'UPDATE bom_details SET material_id = ? WHERE material_id = ?';
        params = [newMaterialId, oldMaterialId];
      }

      const [result] = await connection.query(updateSql, params);

      await connection.commit();

      // 失效受影响的缓存
      try {
        const BomExplosionService = require('./BomExplosionService');
        for (const row of affectedBoms) {
          await BomExplosionService.invalidateCache(row.bom_id);
        }
      } catch (e) {
        logger.warn('替换物料后失效缓存失败:', e.message);
      }

      return { affectedRows: result.affectedRows, bomsCount: affectedBoms.length };
    } catch (error) {
      if (connection) await connection.rollback();
      logger.error('替换BOM物料失败:', error);
      throw error;
    } finally {
      if (connection) connection.release();
    }
  },

  create(data, details = []) {
    return this.createBom(data, details);
  },
  update(id, data, details = []) {
    return this.updateBom(id, data, details);
  },
  delete(id) {
    return this.deleteBom(id);
  },
};

module.exports = bomService;

