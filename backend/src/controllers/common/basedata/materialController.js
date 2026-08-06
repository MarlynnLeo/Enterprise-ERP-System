/**
 * materialController.js - 物料管理
 * 从 baseDataController.js 拆分
 */

const { ResponseHandler } = require('../../../utils/responseHandler');
const { logger } = require('../../../utils/logger');
const { desensitizeData, hasFinancePermission } = require('../../../utils/desensitizer');
const { pool: dbPool } = require('../../../config/db');
const FileAccessService = require('../../../services/FileAccessService');
const { mapKeysToSnake } = require('../../../utils/fieldMap');

const materialService = require('../../../services/materialService');

const materialController = {

  async getAllMaterials(req, res) {
    try {
      const { page = 1, pageSize = 10, ...filters } = req.query;
      // HTTP camel query → service snake filters
      const result = await materialService.getAllMaterials(
        parseInt(page) || 1,
        parseInt(pageSize) || 10,
        mapKeysToSnake(filters)
      );

      // 🔒 权限过滤敏感价格字段 (AOP脱敏)
      // ✅ hasFinancePermission 已统一走 PermissionService，无需额外手动检查
      const hasPerm = await hasFinancePermission(req.user);

      const filteredData = desensitizeData(result.data, hasPerm);

      ResponseHandler.paginated(
        res,
        filteredData,
        result.pagination.total,
        result.pagination.page,
        result.pagination.pageSize,
        '获取物料列表成功'
      );
    } catch (error) {
      logger.error('获取物料列表失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialById(req, res) {
    try {
      const material = await materialService.getMaterialById(req.params.id);
      if (material) {
        // 🔒 权限过滤敏感价格字段 (AOP脱敏)
        const hasPerm = await hasFinancePermission(req.user);

        const filtered = desensitizeData(material, hasPerm);

        ResponseHandler.success(res, filtered, '获取物料详情成功');
      } else {
        ResponseHandler.error(res, '物料不存在', 'NOT_FOUND', 404);
      }
    } catch (error) {
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialsByIds(req, res) {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return ResponseHandler.error(res, '请提供有效的物料ID数组', 'VALIDATION_ERROR', 400);
      }
      if (ids.length > 100) {
        return ResponseHandler.error(res, '批量查询数量不能超过100条', 'VALIDATION_ERROR', 400);
      }

      // ✅ 批量查询替代 N 次循环调用
      const { pool: dbPool } = require('../../../config/db');
      const placeholders = ids.map(() => '?').join(',');
      const [materials] = await dbPool.query(
        `SELECT m.*, c.name as category_name, u.name as unit_name
         FROM materials m
         LEFT JOIN categories c ON m.category_id = c.id
         LEFT JOIN units u ON m.unit_id = u.id
         WHERE m.id IN (${placeholders})`,
        ids
      );

      const hasPerm = await hasFinancePermission(req.user);
      const filteredMaterials = desensitizeData(materials, hasPerm);

      ResponseHandler.success(res, filteredMaterials, '批量获取物料成功');
    } catch (error) {
      logger.error('批量获取物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialsByCodes(req, res) {
    try {
      const codes = Array.isArray(req.body?.codes)
        ? [...new Set(req.body.codes.map((code) => String(code || '').trim()).filter(Boolean))]
        : [];

      if (codes.length === 0) {
        return ResponseHandler.error(res, '请提供有效的物料编码数组', 'VALIDATION_ERROR', 400);
      }
      if (codes.length > 100) {
        return ResponseHandler.error(res, '批量查询数量不能超过100条', 'VALIDATION_ERROR', 400);
      }

      const { pool: dbPool } = require('../../../config/db');
      const placeholders = codes.map(() => '?').join(',');
      const [materials] = await dbPool.query(
        `SELECT m.*, c.name as category_name, u.name as unit_name
         FROM materials m
         LEFT JOIN categories c ON m.category_id = c.id
         LEFT JOIN units u ON m.unit_id = u.id
         WHERE m.code IN (${placeholders}) AND m.deleted_at IS NULL`,
        codes
      );

      const hasPerm = await hasFinancePermission(req.user);
      const filteredMaterials = desensitizeData(materials, hasPerm);

      ResponseHandler.success(res, filteredMaterials, '批量按编码获取物料成功');
    } catch (error) {
      logger.error('批量按编码获取物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async createMaterial(req, res) {
    try {
      // HTTP camel → service snake
      const newMaterial = await materialService.createMaterial(mapKeysToSnake(req.body || {}));
      ResponseHandler.success(res, newMaterial, '创建成功', 201);
    } catch (error) {
      logger.error('创建物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateMaterial(req, res) {
    try {
      const updatedMaterial = await materialService.updateMaterial(
        req.params.id,
        mapKeysToSnake(req.body || {})
      );
      ResponseHandler.success(res, updatedMaterial, '更新物料成功');
    } catch (error) {
      logger.error('更新物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async deleteMaterial(req, res) {
    try {
      await materialService.deleteMaterial(req.params.id);
      ResponseHandler.success(res, null, '删除物料成功', 204);
    } catch (error) {
      logger.error('删除物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateMaterialStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await materialService.updateStatus(id, status);
      ResponseHandler.success(res, null, '状态更新成功');
    } catch (error) {
      logger.error('状态更新失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialOptions(req, res) {
    try {
      const pageSize = Math.min(Math.max(parseInt(req.query.limit || req.query.pageSize, 10) || 50, 1), 100);
      const result = await materialService.getAllMaterials(1, pageSize, {
        search: req.query.keyword || req.query.search || '',
        status: req.query.status ?? 1,
      });
      const options = result.data.map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        specs: m.specification || m.specs,
        unit_id: m.unit_id,
        price: m.price,
      }));
      ResponseHandler.success(res, options, '获取物料选项成功');
    } catch (error) {
      logger.error('获取物料选项失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getNextMaterialCode(req, res) {
    try {
      const { prefix } = req.query;
      if (!prefix) {
        return ResponseHandler.error(res, '前缀不能为空', 'VALIDATION_ERROR', 400);
      }
      const nextSequence = await materialService.getNextMaterialSequence(prefix);
      ResponseHandler.success(res, { nextSequence }, '获取下一个编码成功');
    } catch (error) {
      logger.error('获取下一个物料编码失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialStats(req, res) {
    try {
      const { pool: dbPool } = require('../../../config/db');

      // ✅ 合并 4 次 SQL 为 1 次条件聚合查询
      const [result] = await dbPool.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as inactive,
          SUM(CASE WHEN min_stock > 0 AND min_stock >= (
            SELECT IFNULL(SUM(il.quantity), 0) FROM inventory_ledger il
            WHERE il.material_id = materials.id
            AND (materials.location_id IS NULL OR il.location_id = materials.location_id)
          ) THEN 1 ELSE 0 END) as lowStock
        FROM materials
      `);

      ResponseHandler.success(res, result[0], '获取物料统计成功');
    } catch (error) {
      logger.error('获取物料统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadMaterialTemplate(req, res) {
    try {
      const ExcelHelper = require('../../../utils/excelHelper');

      // 定义列（包含所有新增字段）
      const columns = [
        { header: '物料编码*', key: 'code', width: 20 },
        { header: '物料名称*', key: 'name', width: 25 },
        { header: '规格型号', key: 'specs', width: 20 },
        { header: '图号', key: 'drawing_no', width: 20 },
        { header: '色号', key: 'color_code', width: 15 },
        { header: '材质', key: 'material_type', width: 20 },
        { header: '物料分类编码*', key: 'category_code', width: 18 },
        { header: '计量单位*', key: 'unit', width: 12 },
        { header: '物料来源*', key: 'source_type', width: 15 },
        {
          header: '供应商编码', key: 'supplier_code', width: 18
        },
        {
          header: '生产组编码', key: 'production_group_code', width: 18
        },
        {
          header: '物料负责人工号', key: 'manager_code', width: 18
        },
        { header: '默认库位编码', key: 'location_code', width: 18 },
        { header: '库位详细位置', key: 'location_detail', width: 20 },
        {
          header: '参考价格', key: 'price', width: 12
        },
        { header: '安全库存', key: 'safety_stock', width: 12 },
        {
          header: '最小库存', key: 'min_stock', width: 12
        },
        {
          header: '最大库存', key: 'max_stock', width: 12
        },
        {
          header: '状态', key: 'status', width: 10
        },
        { header: '备注', key: 'remark', width: 30 },
      ];

      const templateRows = [
        {
          code: 'M001',
          name: '钢板Q235',
          specs: '1000*2000*5mm',
          drawing_no: 'DWG-001',
          color_code: '',
          material_type: 'Q235钢板',
          category_code: 'RAW',
          unit: '件',
          source_type: '采购',
          supplier_code: 'SUP001',
          production_group_code: '',
          manager_code: 'EMP001',
          location_code: 'A01-01-01',
          location_detail: 'A区1排2层3号',
          price: 150.0,
          safety_stock: 100,
          min_stock: 50,
          max_stock: 500,
          status: '启用',
          remark: '模板行-采购物料',
        },
        {
          code: 'M002',
          name: '成品A',
          specs: '标准件',
          drawing_no: 'DWG-002',
          color_code: 'RAL9016',
          material_type: '304不锈钢',
          category_code: 'FIN',
          unit: '件',
          source_type: '自制',
          supplier_code: '',
          production_group_code: 'PG001',
          manager_code: 'EMP002',
          location_code: 'B01-01-01',
          location_detail: 'B区2排1层5号',
          price: 500.0,
          safety_stock: 50,
          min_stock: 20,
          max_stock: 200,
          status: '启用',
          remark: '模板行-自产物料',
        },
      ];

      const workbook = ExcelHelper.createTemplate(columns, templateRows, '物料导入模板');

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=material_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载物料模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importMaterials(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'VALIDATION_ERROR', 400);
      }

      const ExcelHelper = require('../../../utils/excelHelper');

      // 读取Excel数据
      const data = await ExcelHelper.readExcel(req.file.buffer);

      if (!data || data.length === 0) {
        return ResponseHandler.error(res, 'Excel文件中没有数据', 'VALIDATION_ERROR', 400);
      }

      const successList = [];
      const errorList = [];

      const { pool: dbPool } = require('../../../config/db');
      const [allCategories] = await dbPool.query('SELECT id, code, name FROM categories WHERE deleted_at IS NULL');
      const categoryByCode = new Map(allCategories.map(c => [c.code, c.id]));

      const [allUnits] = await dbPool.query('SELECT id, name FROM units WHERE deleted_at IS NULL');
      const unitByName = new Map(allUnits.map(u => [u.name, u.id]));

      const [allSources] = await dbPool.query('SELECT id, type FROM material_sources WHERE deleted_at IS NULL');
      const sourceByType = new Map(allSources.map(s => [s.type, s.id]));

      const [allSuppliers] = await dbPool.query('SELECT id, code FROM suppliers WHERE deleted_at IS NULL');
      const supplierByCode = new Map(allSuppliers.map(s => [s.code, s.id]));

      const [allGroups] = await dbPool.query('SELECT id, code, name FROM departments WHERE status = 1');
      const groupByCode = new Map(allGroups.filter((g) => g.code).map((g) => [g.code, g.id]));
      const groupByName = new Map(allGroups.map((g) => [g.name, g.id]));

      const [allUsers] = await dbPool.query('SELECT id, username, real_name FROM users WHERE status = 1');
      const userByCode = new Map();
      for (const u of allUsers) {
        if (u.username) userByCode.set(u.username, u.id);
        if (u.real_name) userByCode.set(u.real_name, u.id);
      }

      const [allLocations] = await dbPool.query('SELECT id, code FROM locations WHERE deleted_at IS NULL');
      const locationByCode = new Map(allLocations.map(l => [l.code, l.id]));

      const [allExistingMaterials] = await dbPool.query('SELECT id, code FROM materials');
      const existingMaterialByCode = new Map(allExistingMaterials.map(m => [m.code, m.id]));

      // 逐行处理数据（仅做内存映射，无 SQL）
      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowNum = i + 2;
        try {
          // 验证必填字段
          if (!row['物料编码*']) throw new Error('物料编码不能为空');
          if (!row['物料名称*']) throw new Error('物料名称不能为空');
          if (!row['物料分类编码*']) throw new Error('物料分类编码不能为空');
          if (!row['计量单位*']) throw new Error('计量单位不能为空');
          if (!row['物料来源*']) throw new Error('物料来源不能为空');

          // 通过预加载的 Map 校验（内存查找，0 次 SQL）
          const categoryId = categoryByCode.get(row['物料分类编码*']);
          if (!categoryId) throw new Error(`物料分类编码"${row['物料分类编码*']}"不存在`);

          const sourceType = row['物料来源*'];
          const sourceTypeMap = { '自产': 'internal', '外购': 'external', '采购': 'external' };
          const materialSourceId = sourceByType.get(sourceTypeMap[sourceType]);
          if (!materialSourceId) throw new Error(`物料来源"${sourceType}"无效，请使用"自产"或"外购"`);

          const unitId = unitByName.get(row['计量单位*']);
          if (!unitId) throw new Error(`计量单位"${row['计量单位*']}"不存在`);

          let supplierId = null;
          if (row['供应商编码']) {
            supplierId = supplierByCode.get(row['供应商编码']);
            if (!supplierId) throw new Error(`供应商编码"${row['供应商编码']}"不存在`);
          }

          let productionGroupId = null;
          if (row['生产组编码']) {
            productionGroupId = groupByCode.get(row['生产组编码']) || groupByName.get(row['生产组编码']);
            if (!productionGroupId) throw new Error(`生产组编码"${row['生产组编码']}"不存在`);
          }

          let managerId = null;
          if (row['物料负责人工号']) {
            managerId = userByCode.get(row['物料负责人工号']);
            if (!managerId) throw new Error(`物料负责人工号"${row['物料负责人工号']}"不存在`);
          }

          let locationId = null;
          if (row['默认库位编码']) {
            locationId = locationByCode.get(row['默认库位编码']);
            if (!locationId) throw new Error(`库位编码"${row['默认库位编码']}"不存在`);
          }

          let status = 1; // 默认启用
          if (row['状态']) {
            if (row['状态'] === '启用' || row['状态'] === '1') status = 1;
            else if (row['状态'] === '禁用' || row['状态'] === '0') status = 0;
          }

          const materialData = {
            code: row['物料编码*'],
            name: row['物料名称*'],
            specs: row['规格型号'] || '',
            drawing_no: row['图号'] || '',
            color_code: row['色号'] || '',
            category_id: categoryId,
            unit_id: unitId,
            material_source_id: materialSourceId,
            supplier_id: supplierId,
            production_group_id: productionGroupId,
            manager_id: managerId,
            location_id: locationId,
            location_detail: row['库位详细位置'] || '',
            price: row['参考价格'] ? parseFloat(row['参考价格']) : 0,
            safety_stock: row['安全库存'] ? parseInt(row['安全库存']) : 0,
            min_stock: row['最小库存'] ? parseInt(row['最小库存']) : 0,
            max_stock: row['最大库存'] ? parseInt(row['最大库存']) : 0,
            status: status,
            remark: row['备注'] || '',
          };

          // 检查物料是否已存在（通过预加载 Map 查询，0 次 SQL）
          const existingMaterialId = existingMaterialByCode.get(materialData.code);

          let action = '';
          if (existingMaterialId) {
            await materialService.updateMaterial(existingMaterialId, materialData);
            action = '更新';
          } else {
            await materialService.createMaterial(materialData);
            // 新增的物料也加入 Map，防止同批次重复编码
            existingMaterialByCode.set(materialData.code, true);
            action = '新增';
          }

          successList.push({
            row: rowNum,
            code: materialData.code,
            name: materialData.name,
            action: action,
          });
        } catch (error) {
          errorList.push({
            row: rowNum,
            code: row['物料编码*'] || '',
            error: error.message,
          });
        }
      }

      ResponseHandler.success(
        res,
        {
          total: data.length,
          success: successList.length,
          failed: errorList.length,
          successList,
          errorList,
        },
        `导入完成，成功${successList.length}条，失败${errorList.length}条`
      );
    } catch (error) {
      logger.error('导入物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importMaterialsJson(req, res) {
    try {

      if (!req.body || !Array.isArray(req.body)) {
        return ResponseHandler.error(res, '无效的数据格式，应该是数据', 'VALIDATION_ERROR', 400);
      }

      if (req.body.length === 0) {
        return ResponseHandler.error(res, '没有可导入的数据', 'VALIDATION_ERROR', 400);
      }

      const successList = [];
      const errorList = [];

      logger.info(`Material import started: rowCount=${req.body.length}`);

      // 1. 批量加载所有分类（编码和名称映射）
      const [allCategories] = await dbPool.query('SELECT id, code, name FROM categories WHERE deleted_at IS NULL');
      const categoryByCode = new Map(allCategories.map((c) => [c.code, c.id]));
      const categoryByName = new Map(allCategories.map((c) => [c.name, c.id]));


      const [allUnits] = await dbPool.query('SELECT id, name FROM units WHERE deleted_at IS NULL');
      const unitByName = new Map(allUnits.map((u) => [u.name, u.id]));


      const [allSources] = await dbPool.query('SELECT id, name, code FROM material_sources WHERE deleted_at IS NULL');
      const sourceByName = new Map(allSources.map((s) => [s.name, s.id]));
      const sourceByCode = new Map(allSources.map((s) => [s.code, s.id]));

      // 4. 批量加载所有供应商
      const [allSuppliers] = await dbPool.query('SELECT id, code, name FROM suppliers WHERE deleted_at IS NULL');
      const supplierByCode = new Map(allSuppliers.map((s) => [s.code, s.id]));
      const supplierByName = new Map(allSuppliers.map((s) => [s.name, s.id]));

      // 5. 批量加载所有生产组（使用departments表）
      const [allGroups] = await dbPool.query('SELECT id, code, name FROM departments');
      const groupByCode = new Map(allGroups.filter((g) => g.code).map((g) => [g.code, g.id]));
      const groupByName = new Map(allGroups.map((g) => [g.name, g.id]));


      const [allUsers] = await dbPool.query('SELECT id, username, real_name FROM users WHERE status = 1');
      const userByUsername = new Map(allUsers.map((u) => [u.username, u.id]));
      const userByDisplayName = new Map();
      for (const user of allUsers) {
        if (user.real_name) userByDisplayName.set(user.real_name, user.id);
        if (user.name) userByDisplayName.set(user.name, user.id);
      }


      const [allLocations] = await dbPool.query('SELECT id, code, name FROM locations WHERE deleted_at IS NULL');
      const locationByCode = new Map(allLocations.map((l) => [l.code, l.id]));
      const locationByName = new Map(allLocations.map((l) => [l.name, l.id]));

      logger.info('关联数据预加载完成');

      // ========== 逐行处理数据（使用预加载的映射表）==========
      for (let i = 0; i < req.body.length; i++) {
        const row = req.body[i];
        const rowNum = i + 1;

        try {
          // 验证必填字段
          if (!row.code) {
            throw new Error('物料编码不能为空');
          }
          if (!row.name) {
            throw new Error('物料名称不能为空');
          }


          let categoryId = null;
          if (row.category_code) {
            categoryId =
              categoryByCode.get(row.category_code) || categoryByName.get(row.category_code);
            if (!categoryId) {
              throw new Error(`物料分类"${row.category_code}"不存在（请填写分类编码或分类名称）`);
            }
          }


          let materialSourceId = null;
          if (row.source_type) {
            materialSourceId =
              sourceByName.get(row.source_type) || sourceByCode.get(row.source_type);
            if (!materialSourceId) {
              throw new Error(
                `物料来源"${row.source_type}"不存在（请填写：采购、自制、外协或对应编码）`
              );
            }
          }


          let unitId = null;
          if (row.unit) {
            unitId = unitByName.get(row.unit);
            if (!unitId) {
              throw new Error(`计量单位"${row.unit}"不存在`);
            }
          }


          let supplierId = null;
          if (row.supplier_code) {
            supplierId =
              supplierByCode.get(row.supplier_code) || supplierByName.get(row.supplier_code);
            if (!supplierId) {
              throw new Error(`供应商"${row.supplier_code}"不存在（请填写供应商编码或名称）`);
            }
          }


          let productionGroupId = null;
          if (row.production_group_code) {
            productionGroupId =
              groupByCode.get(row.production_group_code) ||
              groupByName.get(row.production_group_code);
            if (!productionGroupId) {
              throw new Error(
                `生产组"${row.production_group_code}"不存在（请填写生产组编码或名称）`
              );
            }
          }


          let managerId = null;
          if (row.manager_code) {
            managerId =
              userByUsername.get(row.manager_code) || userByDisplayName.get(row.manager_code);
            if (!managerId) {
              throw new Error(`物料负责人"${row.manager_code}"不存在（请填写用户名或姓名）`);
            }
          }


          let locationId = null;
          if (row.location_code) {
            locationId =
              locationByCode.get(row.location_code) || locationByName.get(row.location_code);
            if (!locationId) {
              throw new Error(`库位"${row.location_code}"不存在（请填写库位编码或名称）`);
            }
          }


          let status = 1; // 默认启用
          if (row.status !== undefined) {
            if (row.status === '启用' || row.status === '1' || row.status === 1) {
              status = 1;
            } else if (row.status === '禁用' || row.status === '0' || row.status === 0) {
              status = 0;
            }
          }

          // 构建物料数据
          const materialData = {
            code: row.code,
            name: row.name,
            specs: row.specs || '',
            drawing_no: row.drawing_no || '',
            color_code: row.color_code || '',
            category_id: categoryId,
            unit_id: unitId,
            material_source_id: materialSourceId,
            supplier_id: supplierId,
            production_group_id: productionGroupId,
            manager_id: managerId,
            location_id: locationId,
            location_detail: row.location_detail || '',
            price: row.price ? parseFloat(row.price) : 0,
            safety_stock: row.safety_stock ? parseInt(row.safety_stock) : 0,
            min_stock: row.min_stock ? parseInt(row.min_stock) : 0,
            max_stock: row.max_stock ? parseInt(row.max_stock) : 0,
            status: status,
            remark: row.remark || '',
          };

          // 创建物料
          await materialService.createMaterial(materialData);

          successList.push({
            row: rowNum,
            code: materialData.code,
            name: materialData.name,
          });


          if (rowNum % 100 === 0) {
            logger.info(
              `导入进度: ${rowNum}/${req.body.length} (${Math.round((rowNum / req.body.length) * 100)}%)`
            );
          }
        } catch (error) {
          errorList.push({
            row: rowNum,
            data: { code: row.code || '', name: row.name || '' },
            error: error.message,
          });
        }
      }

      logger.info(`导入完成，成功${successList.length}条，失败${errorList.length}条`);

      ResponseHandler.success(
        res,
        {
          total: req.body.length,
          success: successList.length,
          failed: errorList.length,
          data: {
            successList,
            errors: errorList,
          },
        },
        `导入完成，成功${successList.length}条，失败${errorList.length}条`
      );
    } catch (error) {
      logger.error('导入物料JSON失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportMaterials(req, res) {
    try {
      const { filters = {} } = req.body || {};

      // 获取所有物料数据（不分页）
      const result = await materialService.getAllMaterials(1, null, filters);

      if (!result.data || result.data.length === 0) {
        return ResponseHandler.error(res, '没有可导出的数据', 'VALIDATION_ERROR', 400);
      }

      const ExcelHelper = require('../../../utils/excelHelper');


      const columns = [
        { header: '物料编码', key: 'code', width: 20 },
        { header: '物料名称', key: 'name', width: 25 },
        { header: '规格型号', key: 'specification', width: 20 },
        { header: '分类', key: 'category_name', width: 15 },
        { header: '单位', key: 'unit', width: 10 },
        { header: '物料来源', key: 'source_type', width: 15 },
        { header: '安全库存', key: 'safety_stock', width: 12 },
        { header: '最小库存', key: 'min_stock', width: 12 },
        { header: '最大库存', key: 'max_stock', width: 12 },
        { header: '当前库存', key: 'current_stock', width: 12 },
        { header: '状态', key: 'status_text', width: 10 },
        { header: '备注', key: 'remarks', width: 30 },
      ];

      // 处理数据
      const exportData = result.data.map((item) => ({
        code: item.code,
        name: item.name,
        specification: item.specification || '',
        category_name: item.category_name || '',
        unit: item.unit,
        source_type: item.source_type === 'internal' ? '自产' : '外购',
        safety_stock: item.safety_stock || 0,
        min_stock: item.min_stock || 0,
        max_stock: item.max_stock || 0,
        current_stock: item.current_stock || 0,
        status_text: item.status === 1 ? '启用' : '停用',
        remarks: item.remarks || '',
      }));

      const workbook = ExcelHelper.exportData(exportData, columns, '物料列表');


      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=materials_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialAttachments(req, res) {
    try {
      const { id } = req.params;
      const attachments = await materialService.getMaterialAttachments(id);
      ResponseHandler.success(res, attachments, '获取物料附件成功');
    } catch (error) {
      logger.error('获取物料附件失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async deleteMaterialAttachment(req, res) {
    try {
      const { attachmentId } = req.params;
      const [[attachment]] = await dbPool.execute(
        'SELECT file_path FROM material_attachments WHERE id = ?',
        [attachmentId]
      );
      await materialService.deleteMaterialAttachment(attachmentId);
      if (attachment?.file_path) {
        await FileAccessService.safeMarkDeleted(attachment.file_path);
      }
      ResponseHandler.success(res, null, '删除附件成功');
    } catch (error) {
      logger.error('删除物料附件失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialPriceHistory(req, res) {
    try {
      const { id } = req.params;
      const { type } = req.query; // 可选：'cost' 或 'sales'
      const history = await materialService.getMaterialPriceHistory(id, type);
      ResponseHandler.success(res, history, '获取价格历史成功');
    } catch (error) {
      logger.error('获取物料价格历史失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async uploadMaterialAttachment(req, res) {
    try {
      const { id } = req.params;
      if (!req.file) {
        return ResponseHandler.error(res, '没有上传文件', 'VALIDATION_ERROR', 400);
      }

      const attachmentData = {
        material_id: id,
        file_name: req.file.originalname,
        file_path: `/uploads/${req.file.filename}`,
        file_type: req.file.mimetype,
        file_size: req.file.size,
        description: req.body.description || '',
        uploader_id: req.user?.id || null,
        uploader_name: req.user?.realName || req.user?.username || '',
      };

      const attachment = await materialService.addMaterialAttachment(attachmentData);
      await FileAccessService.safeRecordUpload({
        fileUrl: attachmentData.file_path,
        businessType: 'material',
        businessId: id,
        source: 'material_attachments',
        uploadedBy: req.user?.id || req.user?.userId || null,
        metadata: {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
        },
      });
      ResponseHandler.success(res, attachment, '上传附件成功');
    } catch (error) {
      logger.error('上传物料附件失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async locatePart(req, res) {
    try {
      // 支持从URL参数或请求体获取物料编码
      const materialCode = req.params.partCode || req.body.materialCode;

      if (!materialCode) {
        return ResponseHandler.error(res, '物料编码不能为空', 'VALIDATION_ERROR', 400);
      }

      // 查询该物料在哪些BOM中被使用
      const { pool } = require('../../../config/db');
      const [results] = await pool.query(
        `
        SELECT
          b.id,
          b.version,
          m1.code as product_code,
          m1.name as product_name,
          bd.quantity,
          u.name as unit,
          m2.code as material_code,
          m2.name as material_name
        FROM bom_masters b
        INNER JOIN bom_details bd ON b.id = bd.bom_id
        INNER JOIN materials m1 ON b.product_id = m1.id
        INNER JOIN materials m2 ON bd.material_id = m2.id
        LEFT JOIN units u ON bd.unit_id = u.id
        WHERE m2.code = ? AND b.deleted_at IS NULL
        ORDER BY b.version DESC
      `,
        [materialCode]
      );

      ResponseHandler.success(res, results, `找到${results.length}个BOM使用了该物料`);
    } catch (error) {
      logger.error('零部件定位失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

};

module.exports = materialController;
