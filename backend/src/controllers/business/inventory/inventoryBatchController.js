/**
 * inventoryController.js
 * @description 控制器文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { getMaterialBatchNumber } = require('./helpers');

const db = require('../../../config/db');
// const InventoryDeductionService = require('../../../services/business/InventoryDeductionService');

// 统一库存查询子查询（基于 inventory_ledger 单表架构聚合计算当前库存）
const STOCK_SUBQUERY = `(SELECT material_id, location_id, COALESCE(SUM(quantity), 0) as quantity, MAX(created_at) as updated_at FROM inventory_ledger GROUP BY material_id, location_id)`;
// DRY: 两处引用相同子查询，统一使用 STOCK_SUBQUERY


// 引入库存一致性校验服务

// 引入成本凭证服务（用于生成领料凭证）

// 引入重构后的入库处理服务

// 引入状态映射工具和状态常量


// ========== 出入库类型常量（全局唯一定义，消除重复） ==========


// 添加一个辅助函数来处理inventory_ledger插入

const getBatchMaterialStock = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { materials } = req.body; // 期望格式: [{ materialId: 1, locationId: 2 }, ...]

    if (!materials || !Array.isArray(materials) || materials.length === 0) {
      return ResponseHandler.error(res, '请提供有效的物料库存查询列表', 'BAD_REQUEST', 400);
    }

    // 限制批量查询数量
    if (materials.length > 50) {
      return ResponseHandler.error(res, '批量查询数量不能超过50个', 'BAD_REQUEST', 400);
    }

    // 构建批量查询SQL
    const materialConditions = materials.map(() => '(m.id = ? AND s.location_id = ?)').join(' OR ');
    const params = [];
    materials.forEach((item) => {
      params.push(item.materialId, item.locationId);
    });

    const query = `
      SELECT
        m.id as material_id,
        m.code as material_code,
        m.name as material_name,
        m.specs as specification,
        u.id as unit_id,
        u.name as unit_name,
        s.location_id,
        l.name as location_name,
        COALESCE(s.quantity, 0) as quantity,
        COALESCE(s.quantity, 0) as stock_quantity,
        0 as stock_id
      FROM materials m
      LEFT JOIN units u ON u.id = m.unit_id
      LEFT JOIN ${STOCK_SUBQUERY} s ON m.id = s.material_id
      LEFT JOIN locations l ON s.location_id = l.id
      WHERE (${materialConditions})
    `;

    const [rows] = await connection.execute(query, params);

    // 创建结果映射，确保每个请求的物料都有对应的结果
    const resultMap = new Map();

    // 先填充查询到的结果
    rows.forEach((row) => {
      const key = `${row.material_id}_${row.location_id}`;
      resultMap.set(key, {
        material_id: parseInt(row.material_id),
        material_code: row.material_code,
        material_name: row.material_name,
        specification: row.specification || '',
        unit_id: row.unit_id,
        unit_name: row.unit_name,
        location_id: parseInt(row.location_id),
        location_name: row.location_name || '默认库位',
        quantity: parseFloat(row.quantity || 0),
        stock_quantity: parseFloat(row.stock_quantity || 0),
        stock_id: parseInt(row.stock_id || 0),
        success: true,
      });
    });

    // 为没有查询到的物料补充默认值
    const results = materials.map((item) => {
      const key = `${item.materialId}_${item.locationId}`;
      if (resultMap.has(key)) {
        return resultMap.get(key);
      } else {
        // 返回默认值，表示该物料在该库位没有库存
        return {
          material_id: parseInt(item.materialId),
          location_id: parseInt(item.locationId),
          quantity: 0,
          stock_quantity: 0,
          success: false,
          message: '物料在该库位无库存记录',
        };
      }
    });

    ResponseHandler.success(res, results, '批量获取物料库存成功');
  } catch (error) {
    logger.error('批量获取物料库存失败:', error);
    ResponseHandler.error(res, '批量获取物料库存失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取物料库存详情

const getBatchInventory = async (req, res) => {
  const connection = await db.pool.getConnection();
  try {
    const { materialIds, locationIds } = req.body;

    if (!materialIds || !Array.isArray(materialIds) || materialIds.length === 0) {
      return ResponseHandler.error(res, '物料ID列表不能为空', 'BAD_REQUEST', 400);
    }

    // 构建批量查询SQL
    const materialIdList = materialIds.map((id) => parseInt(id)).filter((id) => !isNaN(id));
    const locationFilter =
      locationIds && locationIds.length > 0
        ? `AND location_id IN (${locationIds.map((id) => parseInt(id)).join(',')})`
        : '';

    // 优化的库存查询SQL - 优先使用事务记录聚合，库存表作为补充
    const inventoryQuery = `
      WITH transaction_inventory AS (
        SELECT
          material_id,
          location_id,
          SUM(quantity) as calculated_quantity
        FROM inventory_ledger
        WHERE material_id IN (${materialIdList.join(',')}) ${locationFilter}
        GROUP BY material_id, location_id
        HAVING calculated_quantity > 0
      ),
      stock_inventory AS (
        SELECT
          material_id,
          location_id,
          quantity as stock_quantity
        FROM ${STOCK_SUBQUERY} as current_stock
        WHERE material_id IN (${materialIdList.join(',')}) ${locationFilter}
        AND quantity > 0
      )
      SELECT
        COALESCE(t.material_id, s.material_id) as material_id,
        COALESCE(t.location_id, s.location_id) as location_id,
        COALESCE(t.calculated_quantity, s.stock_quantity, 0) as quantity,
        CASE
          WHEN t.material_id IS NOT NULL THEN 'transaction'
          ELSE 'stock'
        END as source,
        m.name as material_name,
        m.code as material_code,
        m.unit,
        l.name as location_name
      FROM transaction_inventory t
      FULL OUTER JOIN stock_inventory s ON t.material_id = s.material_id AND t.location_id = s.location_id
      LEFT JOIN materials m ON COALESCE(t.material_id, s.material_id) = m.id
      LEFT JOIN locations l ON COALESCE(t.location_id, s.location_id) = l.id
      ORDER BY material_id, location_id
    `;

    const [inventoryResults] = await connection.execute(inventoryQuery);

    // 构建结果映射
    const inventoryMap = {};
    inventoryResults.forEach((row) => {
      const key = `${row.material_id}_${row.location_id}`;
      inventoryMap[key] = {
        materialId: row.material_id,
        locationId: row.location_id,
        quantity: parseFloat(row.quantity) || 0,
        source: row.source,
        materialName: row.material_name,
        materialCode: row.material_code,
        unit: row.unit,
        locationName: row.location_name,
      };
    });

    // 预取物料和库位名称信息（消除双层循环内 N+1 查询）
    const matPlaceholders = materialIdList.map(() => '?').join(',');
    const [allMaterialInfo] = await connection.execute(
      `SELECT id, name, code, unit FROM materials WHERE id IN (${matPlaceholders})`,
      materialIdList
    );
    const materialNameMap = {};
    allMaterialInfo.forEach(m => {
      materialNameMap[m.id] = { name: m.name, code: m.code, unit: m.unit };
    });

    // 如果没有指定库位，查询所有启用的库位（只查一次）
    let resolvedLocations = locationIds && locationIds.length > 0 ? locationIds : null;
    if (!resolvedLocations) {
      const [activeLocations] = await connection.execute(
        'SELECT id FROM locations WHERE status = 1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 10'
      );
      resolvedLocations = activeLocations.map((loc) => loc.id);
    }

    // 预取所有相关库位名称
    const locPlaceholders = resolvedLocations.map(() => '?').join(',');
    const [allLocationInfo] = await connection.execute(
      `SELECT id, name FROM locations WHERE id IN (${locPlaceholders}) AND deleted_at IS NULL`,
      resolvedLocations
    );
    const locationNameMap = {};
    allLocationInfo.forEach(l => {
      locationNameMap[l.id] = l.name;
    });

    // 为请求的所有物料-库位组合填充结果（包括零库存）
    const results = [];
    for (const materialId of materialIdList) {
      for (const locationId of resolvedLocations) {
        const key = `${materialId}_${locationId}`;
        if (inventoryMap[key]) {
          results.push(inventoryMap[key]);
        } else {
          const matName = materialNameMap[materialId] || {};
          results.push({
            materialId: parseInt(materialId),
            locationId: parseInt(locationId),
            quantity: 0,
            source: 'none',
            materialName: matName.name || `物料${materialId}`,
            materialCode: matName.code || '',
            unit: matName.unit || '个',
            locationName: locationNameMap[locationId] || `库位${locationId}`,
          });
        }
      }
    }

    ResponseHandler.success(
      res,
      {
        data: results,
        summary: {
          totalMaterials: materialIdList.length,
          totalRecords: results.length,
          hasStock: results.filter((r) => r.quantity > 0).length,
          zeroStock: results.filter((r) => r.quantity === 0).length,
        },
      },
      '批量库存查询成功'
    );
  } catch (error) {
    ResponseHandler.error(res, '批量库存查询失败', 'SERVER_ERROR', 500, error);
  } finally {
    connection.release();
  }
};

// 获取物料库存台账

const getBatchInventoryDetail = async (req, res) => {
  try {
    const { material_id, location_id } = req.query;

    if (!material_id) {
      return ResponseHandler.error(res, '物料ID不能为空', 'BAD_REQUEST', 400);
    }

    // ✅ 单表架构：从 inventory_ledger 聚合查询批次库存
    // 修复：移除对 location_id 的强制聚合，使得同批次跨库位可以合并展示，并过滤掉数量<=0的无意义批次及错误的无批次负结存
    const query = `
      SELECT
        vbs.material_id,
        m.code as material_code,
        m.name as material_name,
        vbs.batch_number,
        ? as location_id,
        wl.name as location_name,
        vbs.current_quantity,
        vbs.current_quantity as available_quantity,
        0 as reserved_quantity,
        vbs.current_quantity as original_quantity,
        u.name as unit_name,
        vbs.receipt_date as first_in_date,
        vbs.last_transaction_date,
        vbs.expiry_date,
        'active' as status,
        vbs.unit_cost,
        (vbs.current_quantity * COALESCE(vbs.unit_cost, 0)) as total_cost,
        vbs.supplier_name
      FROM (
        SELECT 
          material_id, 
          COALESCE(batch_number, '[无批次]') as batch_number,
          SUM(quantity) as current_quantity,
          MIN(created_at) as receipt_date,
          MAX(created_at) as last_transaction_date,
          MAX(unit_cost) as unit_cost,
          MAX(supplier_name) as supplier_name,
          MAX(expiry_date) as expiry_date
        FROM inventory_ledger
        WHERE material_id = ? ${location_id ? 'AND location_id = ?' : ''}
        GROUP BY material_id, COALESCE(batch_number, '[无批次]')
        HAVING SUM(quantity) > 0
      ) vbs
      LEFT JOIN materials m ON vbs.material_id = m.id
      LEFT JOIN locations wl ON wl.id = ?
      LEFT JOIN units u ON m.unit_id = u.id
      ORDER BY vbs.receipt_date ASC
    `;

    const params = [location_id || null, material_id];
    if (location_id) params.push(location_id);
    params.push(location_id || null);

    const [rows] = await db.pool.execute(query, params);

    ResponseHandler.success(res, rows, '获取批次库存成功');
  } catch (error) {
    logger.error('获取批次库存失败:', error);
    ResponseHandler.error(res, '获取批次库存失败', 'SERVER_ERROR', 500, error);
  }
};

// 批次流水记录查询

const getBatchTransactionsDetail = async (req, res) => {
  try {
    const { material_id, batch_number } = req.query;

    if (!material_id || !batch_number) {
      return ResponseHandler.error(res, '物料ID和批次号不能为空', 'BAD_REQUEST', 400);
    }

    // 单表架构：直接查询 inventory_ledger
    const query = `
      SELECT
        il.id,
        il.batch_number,
        il.material_id,
        m.code as material_code,
        m.name as material_name,
        il.transaction_type,
        il.quantity,
        il.location_id,
        l.name as location_name,
        il.reference_no,
        il.reference_type,
        il.operator,
        il.remark,
        il.created_at as date,
        il.before_quantity,
        il.after_quantity
      FROM inventory_ledger il
      LEFT JOIN materials m ON il.material_id = m.id
      LEFT JOIN locations l ON il.location_id = l.id
      WHERE il.material_id = ? 
        AND (il.batch_number = ? OR (il.batch_number IS NULL AND ? = '[无批次]') OR (il.batch_number = '' AND ? = '[无批次]'))
      ORDER BY il.created_at DESC
    `;

    const [rows] = await db.pool.execute(query, [material_id, batch_number, batch_number, batch_number]);

    ResponseHandler.success(res, rows, '获取批次流水成功');
  } catch (error) {
    logger.error('获取批次流水失败:', error);
    ResponseHandler.error(res, '获取批次流水失败', 'SERVER_ERROR', 500, error);
  }
};

/**
 * 批量更新出库单状态
 */


module.exports = {
  getMaterialBatchNumber,
  getBatchMaterialStock,
  getBatchInventory,
  getBatchInventoryDetail,
  getBatchTransactionsDetail,
};
