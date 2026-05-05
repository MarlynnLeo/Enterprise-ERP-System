/**
 * baseDataController.js
 * @description 控制器文件- 重构版，使用Service层和Controller工厂
 * @date 2025-11-24
 * @version 3.0.0 - 使用Controller工厂函数减少重复代码
 */

const { ResponseHandler } = require('../../utils/responseHandler');
const { logger } = require('../../utils/logger');
const path = require('path');
const { createCrudController } = require('../../utils/controllerFactory');
const { desensitizeData, hasFinancePermission } = require('../../utils/desensitizer');
const { getCurrentUserName } = require('../../utils/userHelper');
const { getAuthenticatedUserId } = require('../../utils/authContext');
const { pool: dbPool } = require('../../config/db');
const DLQService = require('../../services/business/DLQService');

const categoryService = require('../../services/categoryService');
const unitService = require('../../services/unitService');
const materialService = require('../../services/materialService');
const bomService = require('../../services/bomService');
const supplierService = require('../../services/supplierService');
const customerService = require('../../services/customerService');
const locationService = require('../../services/locationService');
const materialSourceService = require('../../services/materialSourceService');
const inspectionMethodService = require('../../services/inspectionMethodService');
const processTemplateService = require('../../services/processTemplateService');

// ========== 使用工厂函数创建基础CRUD Controller ==========
// 这些Controller包含标准的getAll, getById, create, update, delete 方法
const baseCategoryController = createCrudController(categoryService, '分类', {
  usePaginated: false,
});
const baseUnitController = createCrudController(unitService, '单位');
const baseSupplierController = createCrudController(supplierService, '供应商');
const baseCustomerController = createCrudController(customerService, '客户');
const baseLocationController = createCrudController(locationService, '库位');
const baseMaterialSourceController = createCrudController(materialSourceService, '物料来源');
const baseInspectionMethodController = createCrudController(inspectionMethodService, '检验方式');

const baseDataController = {
  // ========== 分类管理 - 使用工厂函数 ==========
  // 标准CRUD方法由工厂函数生成
  getAllCategories: baseCategoryController.getAll,
  getCategoryById: baseCategoryController.getById,
  createCategory: baseCategoryController.create,
  updateCategory: baseCategoryController.update,
  deleteCategory: baseCategoryController.delete,

  // 文件上传下载（通用功能）
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '没有上传文件', 'BAD_REQUEST', 400);
      }
      const fileUrl = `/uploads/${req.file.filename}`;
      ResponseHandler.success(res, { fileUrl, filename: req.file.filename }, '上传成功');
    } catch (error) {
      logger.error('文件上传失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadFile(req, res) {
    try {
      const { filePath } = req.query;
      if (!filePath) {
        return ResponseHandler.error(res, '文件路径不能为空', 'BAD_REQUEST', 400);
      }

      // 安全：只允许从uploads目录下载
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      const absolutePath = path.resolve(uploadsDir, path.basename(filePath));

      // 验证解析后的路径是否仍在uploads目录
      if (!absolutePath.startsWith(uploadsDir + path.sep)) {
        logger.warn('检测到路径穿越尝试:', { filePath, resolvedPath: absolutePath });
        return ResponseHandler.error(res, '文件路径无效', 'BAD_REQUEST', 400);
      }

      res.download(absolutePath);
    } catch (error) {
      logger.error('文件下载失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 分类特殊方法：导入导出
  async downloadCategoryTemplate(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.downloadCategoryTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=category_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载分类模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportCategories(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.exportCategories(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=categories_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出分类失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importCategories(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'BAD_REQUEST', 400);
      }

      const ImportExportService = require('../../services/importExportService');
      const result = await ImportExportService.importCategories(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入分类失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importCategoriesJson(req, res) {
    try {
      if (!req.body || !Array.isArray(req.body)) {
        return ResponseHandler.error(res, '无效的数据格式', 'BAD_REQUEST', 400);
      }

      const successList = [];
      const errorList = [];

      for (let i = 0; i < req.body.length; i++) {
        const categoryData = req.body[i];
        try {
          await categoryService.createCategory(categoryData);
          successList.push({ index: i, code: categoryData.code });
        } catch (error) {
          errorList.push({ index: i, code: categoryData.code, error: error.message });
        }
      }

      ResponseHandler.success(
        res,
        {
          total: req.body.length,
          success: successList.length,
          failed: errorList.length,
          successList,
          errorList,
        },
        `导入完成，成功${successList.length}条，失败${errorList.length}条`
      );
    } catch (error) {
      logger.error('导入分类JSON失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // ========== 单位管理 - 使用工厂函数 ==========
  // 标准CRUD方法由工厂函数生成
  getAllUnits: baseUnitController.getAll,
  getUnitById: baseUnitController.getById,
  createUnit: baseUnitController.create,
  updateUnit: baseUnitController.update,
  deleteUnit: baseUnitController.delete,

  // 单位导出
  async exportUnits(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.exportUnits(req.body);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=units_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出单位失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 物料管理
  async getAllMaterials(req, res) {
    try {
      const { page = 1, pageSize = 10, ...filters } = req.query;
      const result = await materialService.getAllMaterials(
        parseInt(page) || 1,
        parseInt(pageSize) || 10,
        filters
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
        return ResponseHandler.error(res, '请提供有效的物料ID数组', 'BAD_REQUEST', 400);
      }
      if (ids.length > 100) {
        return ResponseHandler.error(res, '批量查询数量不能超过100条', 'BAD_REQUEST', 400);
      }

      // ✅ 批量查询替代 N 次循环调用
      const { pool: dbPool } = require('../../config/db');
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

  async createMaterial(req, res) {
    try {
      const newMaterial = await materialService.createMaterial(req.body);
      ResponseHandler.success(res, newMaterial, '创建成功', 201);
    } catch (error) {
      logger.error('创建物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateMaterial(req, res) {
    try {
      const updatedMaterial = await materialService.updateMaterial(req.params.id, req.body);
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

  // 获取物料选项列表 (用于下拉选择)
  async getMaterialOptions(req, res) {
    try {
      const result = await materialService.getAllMaterials(1, 1000, {});
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
        return ResponseHandler.error(res, '前缀不能为空', 'BAD_REQUEST', 400);
      }
      const nextSequence = await materialService.getNextMaterialSequence(prefix);
      ResponseHandler.success(res, { nextSequence }, '获取下一个编码成功');
    } catch (error) {
      logger.error('获取下一个物料编码失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 获取物料统计信息
  async getMaterialStats(req, res) {
    try {
      const { pool: dbPool } = require('../../config/db');

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

  // 获取BOM统计信息
  async getBomStats(req, res) {
    try {
      const { pool: dbPool } = require('../../config/db');

      // 统计：「已审核」基于 approved_by 字段（非 status），与前端 UI 对齐
      const [bomResult] = await dbPool.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN approved_by IS NOT NULL THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN approved_by IS NULL THEN 1 ELSE 0 END) as inactive,
          (SELECT COUNT(*) FROM bom_details) as detailsCount,
          (SELECT COALESCE(SUM(sc.standard_price), 0) FROM standard_costs sc 
           JOIN bom_masters bm ON sc.product_id = bm.product_id WHERE bm.status != 2) as totalCost
        FROM bom_masters
        WHERE status != 2 AND deleted_at IS NULL
      `);

      ResponseHandler.success(res, bomResult[0], '获取BOM统计成功');
    } catch (error) {
      logger.error('获取BOM统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 批量替换BOM物料
  async replaceBom(req, res) {
    try {
      const { oldMaterialCode, newMaterialCode } = req.body;
      if (!oldMaterialCode || !newMaterialCode) {
        return ResponseHandler.error(res, '必须提供被替换和用于替换的物料编码', 'VALIDATION_ERROR', 400);
      }

      const bomService = require('../../services/bomService');
      const result = await bomService.replaceBom(oldMaterialCode, newMaterialCode);

      ResponseHandler.success(res, result, `成功在 ${result.bomsCount} 个BOM中替换了 ${result.affectedRows} 条明细`);
    } catch (error) {
      logger.error('替换BOM物料失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 下载物料导入模板
  async downloadMaterialTemplate(req, res) {
    try {
      const ExcelHelper = require('../../utils/excelHelper');

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
        return ResponseHandler.error(res, '请上传Excel文件', 'BAD_REQUEST', 400);
      }

      const ExcelHelper = require('../../utils/excelHelper');

      // 读取Excel数据
      const data = await ExcelHelper.readExcel(req.file.buffer);

      if (!data || data.length === 0) {
        return ResponseHandler.error(res, 'Excel文件中没有数据', 'BAD_REQUEST', 400);
      }

      const successList = [];
      const errorList = [];

      const { pool: dbPool } = require('../../config/db');
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

      const [allUsers] = await dbPool.query('SELECT id, username, real_name, name FROM users WHERE status = 1');
      const userByCode = new Map();
      for (const u of allUsers) {
        if (u.username) userByCode.set(u.username, u.id);
        if (u.real_name) userByCode.set(u.real_name, u.id);
        if (u.name) userByCode.set(u.name, u.id);
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
        return ResponseHandler.error(res, '无效的数据格式，应该是数据', 'BAD_REQUEST', 400);
      }

      if (req.body.length === 0) {
        return ResponseHandler.error(res, '没有可导入的数据', 'BAD_REQUEST', 400);
      }

      const successList = [];
      const errorList = [];

      logger.info(`开始导入物料，共${req.body.length} 条数据`);

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


      const [allUsers] = await dbPool.query('SELECT id, username, real_name, name FROM users WHERE status = 1');
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
      const result = await materialService.getAllMaterials(1, 100000, filters);

      if (!result.data || result.data.length === 0) {
        return ResponseHandler.error(res, '没有可导出的数据', 'BAD_REQUEST', 400);
      }

      const ExcelHelper = require('../../utils/excelHelper');


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

  // BOM管理
  async getAllBoms(req, res) {
    try {
      const { page = 1, pageSize = 10, ...filters } = req.query;

      // 兼容前端发送的 product_id 参数，转换为 productId
      if (filters.product_id && !filters.productId) {
        filters.productId = filters.product_id;
        delete filters.product_id;
      }

      const result = await bomService.getAllBoms(
        parseInt(page) || 1,
        parseInt(pageSize) || 10,
        filters
      );
      ResponseHandler.paginated(
        res,
        result.data,
        result.pagination.total,
        result.pagination.page,
        result.pagination.pageSize,
        '获取BOM列表成功'
      );
    } catch (error) {
      logger.error('获取BOM列表失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getBomById(req, res) {
    try {
      const bom = await bomService.getBomById(req.params.id);
      if (bom) {
        ResponseHandler.success(res, bom, '获取BOM详情成功');
      } else {
        ResponseHandler.error(res, 'BOM不存在', 'NOT_FOUND', 404);
      }
    } catch (error) {
      logger.error('获取BOM详情失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async createBom(req, res) {
    try {
      // 兼容两种数据格式
      let bomData, details;
      if (req.body.bomData && req.body.details) {
        // 格式1: { bomData: {...}, details: [...] }
        bomData = req.body.bomData;
        details = req.body.details;
      } else {
        // 格式2: { product_id, version, ..., details: [...] }
        const { details: detailsArray, ...restData } = req.body;
        bomData = restData;
        details = detailsArray;
      }

      // 控制器级输入校验
      if (!bomData || !bomData.product_id) {
        return ResponseHandler.error(res, '产品ID为必填项', 'VALIDATION_ERROR', 400);
      }
      if (!bomData.version || !String(bomData.version).trim()) {
        return ResponseHandler.error(res, '版本号为必填项', 'VALIDATION_ERROR', 400);
      }
      if (!details || !Array.isArray(details) || details.length === 0) {
        return ResponseHandler.error(res, 'BOM明细不能为空', 'VALIDATION_ERROR', 400);
      }

      // 注入当前操作人真实姓名
      const currentUser = await getCurrentUserName(req);
      bomData.created_by = currentUser;
      bomData.updated_by = currentUser;

      const newBom = await bomService.createBom(bomData, details);
      ResponseHandler.success(res, newBom, '创建BOM成功', 201);
    } catch (error) {
      logger.error('创建BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateBom(req, res) {
    try {
      // 兼容两种数据格式
      let bomData, details;
      if (req.body.bomData && req.body.details) {
        // 格式1: { bomData: {...}, details: [...] }
        bomData = req.body.bomData;
        details = req.body.details;
      } else {
        // 格式2: { product_id, version, ..., details: [...] }
        const { details: detailsArray, ...restData } = req.body;
        bomData = restData;
        details = detailsArray;
      }

      // 控制器级输入校验
      if (!details || !Array.isArray(details) || details.length === 0) {
        return ResponseHandler.error(res, 'BOM明细不能为空', 'VALIDATION_ERROR', 400);
      }

      // 注入当前操作人真实姓名
      const currentUser = await getCurrentUserName(req);
      bomData.updated_by = currentUser;

      const updatedBom = await bomService.updateBom(req.params.id, bomData, details);
      ResponseHandler.success(res, updatedBom, '更新BOM成功');
    } catch (error) {
      logger.error('更新BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async deleteBom(req, res) {
    try {
      await bomService.deleteBom(req.params.id);
      ResponseHandler.success(res, null, '删除BOM成功', 204);
    } catch (error) {
      logger.error('删除BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async exportBoms(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.exportBoms(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=boms_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importBoms(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'BAD_REQUEST', 400);
      }

      const ImportExportService = require('../../services/importExportService');
      const result = await ImportExportService.importBoms(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadBomTemplate(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.downloadBomTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=bom_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载BOM模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async locatePart(req, res) {
    try {
      // 支持从URL参数或请求体获取物料编码
      const materialCode = req.params.partCode || req.body.materialCode;

      if (!materialCode) {
        return ResponseHandler.error(res, '物料编码不能为空', 'BAD_REQUEST', 400);
      }

      // 查询该物料在哪些BOM中被使用
      const { pool } = require('../../config/db');
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

  async approveBom(req, res) {
    try {
      const { pool } = require('../../config/db');
      const bomId = parseInt(req.params.id, 10);
      if (!Number.isInteger(bomId) || bomId <= 0) {
        return ResponseHandler.error(res, '无效的BOM ID', 'BAD_REQUEST', 400);
      }

      // 审核BOM：同步设置 status=1 + approved_at + approved_by（INT字段，存用户ID）
      await pool.query(
        'UPDATE bom_masters SET status = 1, approved_at = NOW(), approved_by = ? WHERE id = ?',
        [getAuthenticatedUserId(req), bomId]
      );

      // 审核后触发关键后处理（与 createBom/deleteBom 保持一致）
      try {
        const BomExplosionService = require('../../services/BomExplosionService');
        const [bomInfo] = await pool.query('SELECT product_id FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [bomId]);
        if (bomInfo.length > 0) {
          // 更新该产品在其他BOM中的 has_sub_bom 标记
          await BomExplosionService.updateHasSubBomFlag(bomInfo[0].product_id);
          // 级联失效自身及所有祖先BOM的缓存
          await BomExplosionService.invalidateCache(bomId);
        }
      } catch (e) {
        await DLQService.recordSideEffectFailure(
          'BOM:approvePostProcess',
          { bomId },
          e
        );
      }

      ResponseHandler.success(res, null, 'BOM审核成功');
    } catch (error) {
      logger.error('BOM审核失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async unapproveBom(req, res) {
    try {
      const { pool } = require('../../config/db');
      const bomId = parseInt(req.params.id, 10);
      if (!Number.isInteger(bomId) || bomId <= 0) {
        return ResponseHandler.error(res, '无效的BOM ID', 'BAD_REQUEST', 400);
      }

      // 反审前获取产品ID用于后处理
      const [bomInfo] = await pool.query('SELECT product_id FROM bom_masters WHERE id = ? AND deleted_at IS NULL', [bomId]);

      await pool.query(
        'UPDATE bom_masters SET status = 0, approved_at = NULL, approved_by = NULL WHERE id = ?',
        [bomId]
      );

      // 反审后触发关键后处理
      try {
        const BomExplosionService = require('../../services/BomExplosionService');
        if (bomInfo.length > 0) {
          // 反审后该产品可能不再有已审核BOM，更新 has_sub_bom 标记
          await BomExplosionService.updateHasSubBomFlag(bomInfo[0].product_id);
          // 级联失效自身及所有祖先BOM的缓存
          await BomExplosionService.invalidateCache(bomId);
        }
      } catch (e) {
        await DLQService.recordSideEffectFailure(
          'BOM:unapprovePostProcess',
          { bomId },
          e
        );
      }

      ResponseHandler.success(res, null, 'BOM反审核成功');
    } catch (error) {
      logger.error('BOM反审核失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMaterialBom(req, res) {
    try {
      const { materialId } = req.params;

      // 查询该物料作为产品的BOM
      const { pool } = require('../../config/db');
      const [results] = await pool.query(
        `
        SELECT
          b.id,
          b.version,
          CASE WHEN b.approved_by IS NOT NULL THEN 1 ELSE 0 END as is_approved,
          b.approved_by,
          b.approved_at,
          m.code as product_code,
          m.name as product_name
        FROM bom_masters b
        INNER JOIN materials m ON b.product_id = m.id
        WHERE b.product_id = ? AND b.deleted_at IS NULL
        ORDER BY b.version DESC
      `,
        [materialId]
      );

      ResponseHandler.success(res, results, '获取物料BOM成功');
    } catch (error) {
      logger.error('获取物料BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getBomByProductId(req, res) {
    try {
      const { productId } = req.params;

      // 查询该产品的最新BOM
      const { pool } = require('../../config/db');
      const [results] = await pool.query(
        `
        SELECT
          b.id,
          b.version,
          CASE WHEN b.approved_by IS NOT NULL THEN 1 ELSE 0 END as is_approved,
          b.approved_by,
          b.approved_at,
          m.code as product_code,
          m.name as product_name
        FROM bom_masters b
        INNER JOIN materials m ON b.product_id = m.id
        WHERE b.product_id = ? AND b.deleted_at IS NULL
        ORDER BY b.version DESC
        LIMIT 1
      `,
        [productId]
      );

      if (results.length === 0) {
        return ResponseHandler.error(res, '未找到该产品的BOM', 'NOT_FOUND', 404);
      }

      // 获取BOM详情
      const bom = await bomService.getBomById(results[0].id);

      ResponseHandler.success(res, bom, '获取产品BOM成功');
    } catch (error) {
      logger.error('根据产品ID获取BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getLatestBomByProductId(req, res) {
    try {
      const { productId } = req.params;
      const { status } = req.query;
      const result = await bomService.getLatestBomByProductId(productId, status);
      ResponseHandler.success(res, result, '获取产品BOM成功');
    } catch (error) {
      logger.error('获取产品BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getBomDetails(req, res) {
    try {
      const details = await bomService.getBomDetails(req.params.id);
      ResponseHandler.success(res, details, '获取BOM明细成功');
    } catch (error) {
      logger.error('获取BOM明细失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getMultiLevelBomDetails(req, res) {
    try {
      const tree = await bomService.getMultiLevelBomDetails(req.params.id);
      ResponseHandler.success(res, tree, '获取多级BOM结构成功');
    } catch (error) {
      logger.error('获取多级BOM结构失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // ========== 供应商管理- 使用工厂函数 ==========
  // 标准CRUD方法由工厂函数生成
  getAllSuppliers: baseSupplierController.getAll,
  getSupplierById: baseSupplierController.getById,
  createSupplier: baseSupplierController.create,
  updateSupplier: baseSupplierController.update,
  deleteSupplier: baseSupplierController.delete,


  async getSupplierOptions(req, res) {
    try {

      const result = await supplierService.getAllSuppliers(1, 10000, { status: 1 });
      const options = result.list.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
      }));
      ResponseHandler.success(res, options, '获取供应商选项成功');
    } catch (error) {
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async downloadSupplierTemplate(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.downloadSupplierTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=supplier_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载供应商模板失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async importSuppliers(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'BAD_REQUEST', 400);
      }

      const ImportExportService = require('../../services/importExportService');
      const result = await ImportExportService.importSuppliers(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入供应商失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async exportSuppliers(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.exportSuppliers(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=suppliers_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出供应商失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // ========== 客户管理 - 使用工厂函数 ==========
  // 标准CRUD方法由工厂函数生成
  getAllCustomers: baseCustomerController.getAll,
  getCustomerById: baseCustomerController.getById,
  createCustomer: baseCustomerController.create,
  updateCustomer: baseCustomerController.update,
  deleteCustomer: baseCustomerController.delete,

  // 获取客户统计数据（避免前端全量加载）
  async getCustomerStats(req, res) {
    try {
      const stats = await customerService.getCustomerStats();
      ResponseHandler.success(res, stats, '获取客户统计成功');
    } catch (error) {
      logger.error('获取客户统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 客户导出
  async exportCustomers(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.exportCustomers(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=customers_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出客户失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 客户导入模板下载
  async downloadCustomerTemplate(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.downloadCustomerTemplate();

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=customer_import_template.xlsx');

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('下载客户模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 客户导入
  async importCustomers(req, res) {
    try {
      if (!req.file) {
        return ResponseHandler.error(res, '请上传Excel文件', 'BAD_REQUEST', 400);
      }

      const ImportExportService = require('../../services/importExportService');
      const result = await ImportExportService.importCustomers(req.file.buffer);

      ResponseHandler.success(
        res,
        result,
        `导入完成，成功${result.success}条，失败${result.failed}条`
      );
    } catch (error) {
      logger.error('导入客户失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // ========== 库位管理 - 使用工厂函数 ==========
  // 标准CRUD方法由工厂函数生成
  getAllLocations: baseLocationController.getAll,
  getLocationById: baseLocationController.getById,
  createLocation: baseLocationController.create,
  updateLocation: baseLocationController.update,
  deleteLocation: baseLocationController.delete,

  // 库位导出
  async exportLocations(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.exportLocations(req.body);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=locations_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出库位失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async getWarehouses(req, res) {
    try {
      const result = await locationService.getWarehouses();
      ResponseHandler.success(res, result, '获取仓库列表成功');
    } catch (error) {
      logger.error('获取仓库列表失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async getAllProcessTemplates(req, res) {
    try {
      const { page = 1, pageSize = 10, name, status } = req.query;
      const result = await processTemplateService.getAll(page, pageSize, { name, status });
      ResponseHandler.paginated(res, result.list, result.total, result.page, result.pageSize, '获取工序模板列表成功');
    } catch (error) {
      logger.error('获取工序模板列表失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getProcessTemplateById(req, res) {
    try {
      const template = await processTemplateService.getById(req.params.id);
      if (!template) {
        return ResponseHandler.error(res, '工序模板不存在', 'NOT_FOUND', 404);
      }
      ResponseHandler.success(res, template, '获取工序模板详情成功');
    } catch (error) {
      logger.error('获取工序模板详情失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async createProcessTemplate(req, res) {
    try {
      const { name } = req.body;
      if (!name) {
        return ResponseHandler.error(res, '模板名称不能为空', 'BAD_REQUEST', 400);
      }
      const result = await processTemplateService.create(req.body);
      ResponseHandler.success(res, result, '创建工序模板成功', 201);
    } catch (error) {
      logger.error('创建工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateProcessTemplate(req, res) {
    try {
      await processTemplateService.update(req.params.id, req.body);
      ResponseHandler.success(res, null, '更新工序模板成功');
    } catch (error) {
      logger.error('更新工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async deleteProcessTemplate(req, res) {
    try {
      await processTemplateService.delete(req.params.id);
      ResponseHandler.success(res, null, '删除工序模板成功', 204);
    } catch (error) {
      logger.error('删除工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async updateProcessTemplateStatus(req, res) {
    try {
      await processTemplateService.updateStatus(req.params.id, req.body.status);
      ResponseHandler.success(res, null, '更新工序模板状态成功');
    } catch (error) {
      logger.error('更新工序模板状态失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  async getProcessTemplateByProductId(req, res) {
    try {
      const template = await processTemplateService.getByProductId(req.params.id);
      ResponseHandler.success(res, template, template ? '获取产品工序模板成功' : '该产品暂无作业指导书');
    } catch (error) {
      logger.error('获取产品工序模板失败:', error);
      ResponseHandler.error(res, '该产品暂无作业指导书', 'SERVER_ERROR', 500, error);
    }
  },

  // 导出工序模板
  async exportProcessTemplates(req, res) {
    try {
      const ImportExportService = require('../../services/importExportService');
      const workbook = await ImportExportService.exportProcessTemplates(req.query);

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename=process_templates_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      logger.error('导出工序模板失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // ========== 物料来源管理 - 使用工厂函数 ==========
  // 标准CRUD方法由工厂函数生成
  getAllMaterialSources: baseMaterialSourceController.getAll,
  getMaterialSourceById: baseMaterialSourceController.getById,
  createMaterialSource: baseMaterialSourceController.create,
  updateMaterialSource: baseMaterialSourceController.update,
  deleteMaterialSource: baseMaterialSourceController.delete,


  async getMaterialSourceStatistics(req, res) {
    try {
      const stats = await materialSourceService.getStatistics();
      ResponseHandler.success(res, stats, '获取物料来源统计成功');
    } catch (error) {
      logger.error('获取物料来源统计失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // ========== 检验方式管理 - 使用工厂函数 ==========
  // 标准CRUD方法由工厂函数生成
  getAllInspectionMethods: baseInspectionMethodController.getAll,
  getInspectionMethodById: baseInspectionMethodController.getById,
  createInspectionMethod: baseInspectionMethodController.create,
  updateInspectionMethod: baseInspectionMethodController.update,
  deleteInspectionMethod: baseInspectionMethodController.delete,

  // 获取物料附件列表
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

  // 上传物料附件
  async uploadMaterialAttachment(req, res) {
    try {
      const { id } = req.params;
      if (!req.file) {
        return ResponseHandler.error(res, '没有上传文件', 'BAD_REQUEST', 400);
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
      ResponseHandler.success(res, attachment, '上传附件成功');
    } catch (error) {
      logger.error('上传物料附件失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 删除物料附件
  async deleteMaterialAttachment(req, res) {
    try {
      const { attachmentId } = req.params;
      await materialService.deleteMaterialAttachment(attachmentId);
      ResponseHandler.success(res, null, '删除附件成功');
    } catch (error) {
      logger.error('删除物料附件失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 🔥 获取物料价格历史
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

  // ========== BOM展开相关API ==========


  async explodeBom(req, res) {
    try {
      const { id } = req.params;
      const { quantity = 1, useCache = true } = req.query;

      const BomExplosionService = require('../../services/BomExplosionService');

      // 获取BOM信息
      const bom = await bomService.getBomById(id);
      if (!bom) {
        return ResponseHandler.error(res, 'BOM不存在', 'NOT_FOUND', 404);
      }

      const result = await BomExplosionService.explodeBom(
        bom.product_id,
        parseInt(id),
        parseFloat(quantity),
        useCache !== 'false'
      );

      ResponseHandler.success(
        res,
        {
          bom_id: parseInt(id),
          product_id: bom.product_id,
          product_name: bom.product_name,
          version: bom.version,
          quantity: parseFloat(quantity),
          explosion: result,
          total_materials: result.length,
          max_level: result.length > 0 ? Math.max(...result.map((r) => r.level)) : 0,
        },
        '展开BOM成功'
      );
    } catch (error) {
      logger.error('展开BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },


  async detectCircularReference(req, res) {
    try {
      const { productId, materialId } = req.query;

      if (!productId || !materialId) {
        return ResponseHandler.error(res, '缺少必要参数', 'BAD_REQUEST', 400);
      }

      const BomExplosionService = require('../../services/BomExplosionService');
      const result = await BomExplosionService.detectCircularReference(
        parseInt(productId),
        parseInt(materialId)
      );

      ResponseHandler.success(res, result, '检测完成');
    } catch (error) {
      logger.error('检测循环引用失败', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 获取物料的子BOM信息
  async getMaterialSubBom(req, res) {
    try {
      const { materialId } = req.params;

      const BomExplosionService = require('../../services/BomExplosionService');
      const result = await BomExplosionService.getMaterialSubBom(parseInt(materialId));

      if (!result) {
        return ResponseHandler.success(res, null, '该物料没有子BOM');
      }

      ResponseHandler.success(res, result, '获取子BOM成功');
    } catch (error) {
      logger.error('获取物料子BOM失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },

  // 刷新BOM缓存
  async refreshBomCache(req, res) {
    try {
      const { id } = req.params;

      const BomExplosionService = require('../../services/BomExplosionService');

      // 先使缓存失效
      await BomExplosionService.invalidateCache(parseInt(id));


      const bom = await bomService.getBomById(id);
      if (!bom) {
        return ResponseHandler.error(res, 'BOM不存在', 'NOT_FOUND', 404);
      }

      const result = await BomExplosionService.explodeBom(
        bom.product_id,
        parseInt(id),
        1,
        false // 不使用缓存，强制重新展开
      );

      ResponseHandler.success(
        res,
        {
          bom_id: parseInt(id),
          total_materials: result.length,
          max_level: result.length > 0 ? Math.max(...result.map((r) => r.level)) : 0,
        },
        'BOM缓存已刷新'
      );
    } catch (error) {
      logger.error('刷新BOM缓存失败:', error);
      ResponseHandler.error(res, error.message, 'SERVER_ERROR', 500, error);
    }
  },
};

module.exports = baseDataController;
