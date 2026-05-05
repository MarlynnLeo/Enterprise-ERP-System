/**
 * baseData.js
 * @description 路由定义文件
 * @date 2025-08-27
 * @version 1.0.0
 */

const express = require('express');
const router = express.Router();
const baseDataController = require('../controllers/common/baseDataController');
const productCategoryController = require('../controllers/common/productCategoryController');
const { authenticateToken } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const { FileUploadMiddlewares } = require('../middleware/unifiedFileUpload');

// 文件上传路由
router.post('/upload', authenticateToken, FileUploadMiddlewares.attachment, baseDataController.uploadFile);

// 文件下载路由 - 支持内网环境下的文件下载
router.get('/download-file', authenticateToken, baseDataController.downloadFile);

// 物料管理路由
router.get('/materials', authenticateToken, baseDataController.getAllMaterials);
router.get('/materials/options', authenticateToken, baseDataController.getMaterialOptions);
router.get('/materials/stats', authenticateToken, requirePermission('basedata:materials:view'), baseDataController.getMaterialStats); // 注册统计路由
router.get('/materials/next-code', authenticateToken, requirePermission('basedata:materials:create'), baseDataController.getNextMaterialCode);
// 添加物料导入模板下载路由（必须在:id路由之前）
router.get(
  '/materials/template',
  authenticateToken,
  requirePermission('basedata:materials:import'),
  baseDataController.downloadMaterialTemplate
);
// 添加导入物料的路由（使用内存存储 - 文件上传方式）
router.post(
  '/materials/import-file',
  authenticateToken,
  requirePermission('basedata:materials:import'),
  FileUploadMiddlewares.excel,
  baseDataController.importMaterials
);
// 添加导入物料的路由（JSON数据方式）
router.post(
  '/materials/import',
  authenticateToken,
  requirePermission('basedata:materials:import'),
  baseDataController.importMaterialsJson
);
// 添加导出物料的路由
router.post(
  '/materials/export',
  authenticateToken,
  requirePermission('basedata:materials:export'),
  baseDataController.exportMaterials
);
router.get('/materials/:id', authenticateToken, requirePermission('basedata:materials:view'), baseDataController.getMaterialById);
router.post('/materials', authenticateToken, requirePermission('basedata:materials:create'), baseDataController.createMaterial);
router.post('/materials/batch', authenticateToken, requirePermission('basedata:materials:view'), baseDataController.getMaterialsByIds); // 批量获取物料
router.put('/materials/:id', authenticateToken, requirePermission('basedata:materials:update'), baseDataController.updateMaterial);
router.put('/materials/:id/status', authenticateToken, requirePermission('basedata:materials:update'), baseDataController.updateMaterialStatus);
router.delete('/materials/:id', authenticateToken, requirePermission('basedata:materials:delete'), baseDataController.deleteMaterial);

// 物料附件路由
router.get(
  '/materials/:id/attachments',
  authenticateToken,
  requirePermission('basedata:materials:view'),
  baseDataController.getMaterialAttachments
);
router.post(
  '/materials/:id/attachments',
  authenticateToken,
  requirePermission('basedata:materials:update'),
  FileUploadMiddlewares.attachment,
  baseDataController.uploadMaterialAttachment
);
router.delete(
  '/materials/attachments/:attachmentId',
  authenticateToken,
  requirePermission('basedata:materials:delete'),
  baseDataController.deleteMaterialAttachment
);

// 🔥 物料价格历史路由
router.get(
  '/materials/:id/price-history',
  authenticateToken,
  baseDataController.getMaterialPriceHistory
);

// BOM管理路由
router.get('/boms', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.getAllBoms);
router.get('/boms/stats', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.getBomStats);
// 添加BOM导出路由（必须在:id路由之前）
router.get('/boms/export', authenticateToken, requirePermission('basedata:boms:export'), baseDataController.exportBoms);
// 添加BOM导入路由（使用内存存储）
router.post(
  '/boms/import',
  authenticateToken,
  requirePermission('basedata:boms:import'),
  FileUploadMiddlewares.excel,
  baseDataController.importBoms
);
// 添加BOM导入模板下载路由
router.get('/boms/template', authenticateToken, requirePermission('basedata:boms:import'), baseDataController.downloadBomTemplate);
// 添加BOM物料替换路由
router.post('/boms/replace', authenticateToken, requirePermission('basedata:boms:update'), baseDataController.replaceBom);
// 添加零部件定位路由
router.get('/boms/locate/:partCode', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.locatePart);
// 检测循环引用（必须在:id路由之前）
router.get('/boms/detect-circular', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.detectCircularReference);
router.get('/boms/:id', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.getBomById);
router.get('/boms/:id/details', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.getBomDetails);
// BOM展开 - 获取所有层级物料（引用式BOM核心功能）
router.get('/boms/:id/explode', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.explodeBom);
// 刷新BOM缓存
router.post('/boms/:id/refresh-cache', authenticateToken, requirePermission('basedata:boms:update'), baseDataController.refreshBomCache);
router.post('/boms', authenticateToken, requirePermission('basedata:boms:create'), baseDataController.createBom);
router.put('/boms/:id', authenticateToken, requirePermission('basedata:boms:update'), baseDataController.updateBom);
router.delete('/boms/:id', authenticateToken, requirePermission('basedata:boms:delete'), baseDataController.deleteBom);
// 添加BOM审核路由
router.put('/boms/:id/approve', authenticateToken, requirePermission('basedata:boms:approve'), baseDataController.approveBom);
// 添加BOM反审核路由
router.put('/boms/:id/unapprove', authenticateToken, requirePermission('basedata:boms:approve'), baseDataController.unapproveBom);

// 获取物料的BOM信息
router.get('/materials/:id/bom', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.getMaterialBom);
// 获取物料的子BOM信息（引用式BOM）
router.get(
  '/materials/:materialId/sub-bom',
  authenticateToken,
  requirePermission('basedata:boms:view'),
  baseDataController.getMaterialSubBom
);
// 根据产品ID获取BOM信息
router.get('/products/:id/bom', authenticateToken, requirePermission('basedata:boms:view'), baseDataController.getBomByProductId);

// 客户管理路由
router.get('/customers', authenticateToken, requirePermission('basedata:customers:view'), baseDataController.getAllCustomers);
// 客户统计接口（必须在:id路由之前）
router.get('/customers/stats', authenticateToken, requirePermission('basedata:customers:view'), baseDataController.getCustomerStats);
// 客户导入模板下载路由（必须在:id路由之前）
router.get('/customers/template', authenticateToken, requirePermission('basedata:customers:import'), baseDataController.downloadCustomerTemplate);
// 客户导出
router.post('/customers/export', authenticateToken, requirePermission('basedata:customers:export'), baseDataController.exportCustomers);
// 客户导入（使用内存存储）
router.post(
  '/customers/import',
  authenticateToken,
  requirePermission('basedata:customers:import'),
  FileUploadMiddlewares.excel,
  baseDataController.importCustomers
);
router.get('/customers/:id', authenticateToken, requirePermission('basedata:customers:view'), baseDataController.getCustomerById);
router.post('/customers', authenticateToken, requirePermission('basedata:customers:create'), baseDataController.createCustomer);
router.put('/customers/:id', authenticateToken, requirePermission('basedata:customers:update'), baseDataController.updateCustomer);
router.delete('/customers/:id', authenticateToken, requirePermission('basedata:customers:delete'), baseDataController.deleteCustomer);

// 供应商管理路由
router.get('/suppliers', authenticateToken, baseDataController.getAllSuppliers);
router.get('/suppliers/options', authenticateToken, baseDataController.getSupplierOptions);
// 添加供应商导入模板下载路由（必须在:id路由之前）
router.get('/suppliers/template', authenticateToken, requirePermission('basedata:suppliers:import'), baseDataController.downloadSupplierTemplate);
// 添加导入供应商的路由（使用内存存储）
router.post(
  '/suppliers/import',
  authenticateToken,
  requirePermission('basedata:suppliers:import'),
  FileUploadMiddlewares.excel,
  baseDataController.importSuppliers
);
// 添加导出供应商的路由
router.post('/suppliers/export', authenticateToken, requirePermission('basedata:suppliers:export'), baseDataController.exportSuppliers);
router.get('/suppliers/:id', authenticateToken, requirePermission('basedata:suppliers:view'), baseDataController.getSupplierById);
router.post('/suppliers', authenticateToken, requirePermission('basedata:suppliers:create'), baseDataController.createSupplier);
router.put('/suppliers/:id', authenticateToken, requirePermission('basedata:suppliers:update'), baseDataController.updateSupplier);
router.delete('/suppliers/:id', authenticateToken, requirePermission('basedata:suppliers:delete'), baseDataController.deleteSupplier);

// 产品分类管理路由
router.get('/categories/template', authenticateToken, requirePermission('basedata:categories:import'), baseDataController.downloadCategoryTemplate);
router.get('/categories/export', authenticateToken, requirePermission('basedata:categories:export'), baseDataController.exportCategories);
router.post(
  '/categories/import',
  authenticateToken,
  requirePermission('basedata:categories:import'),
  FileUploadMiddlewares.excel,
  baseDataController.importCategories
);
router.post('/categories/import-json', authenticateToken, requirePermission('basedata:categories:import'), baseDataController.importCategoriesJson);
router.get('/categories', authenticateToken, baseDataController.getAllCategories);
router.get('/categories/:id', authenticateToken, requirePermission('basedata:categories:view'), baseDataController.getCategoryById);
router.post('/categories', authenticateToken, requirePermission('basedata:categories:create'), baseDataController.createCategory);
router.put('/categories/:id', authenticateToken, requirePermission('basedata:categories:update'), baseDataController.updateCategory);
router.delete('/categories/:id', authenticateToken, requirePermission('basedata:categories:delete'), baseDataController.deleteCategory);

// 产品单位管理路由
router.get('/units', authenticateToken, baseDataController.getAllUnits);
router.post('/units/export', authenticateToken, requirePermission('basedata:units:export'), baseDataController.exportUnits);
router.get('/units/:id', authenticateToken, requirePermission('basedata:units:view'), baseDataController.getUnitById);
router.post('/units', authenticateToken, requirePermission('basedata:units:create'), baseDataController.createUnit);
router.put('/units/:id', authenticateToken, requirePermission('basedata:units:update'), baseDataController.updateUnit);
router.delete('/units/:id', authenticateToken, requirePermission('basedata:units:delete'), baseDataController.deleteUnit);

// 库位管理路由
router.get('/locations', authenticateToken, baseDataController.getAllLocations);
router.post('/locations/export', authenticateToken, requirePermission('basedata:locations:export'), baseDataController.exportLocations);
router.get('/locations/:id', authenticateToken, requirePermission('basedata:locations:view'), baseDataController.getLocationById);
router.post('/locations', authenticateToken, requirePermission('basedata:locations:create'), baseDataController.createLocation);
router.put('/locations/:id', authenticateToken, requirePermission('basedata:locations:update'), baseDataController.updateLocation);
router.delete('/locations/:id', authenticateToken, requirePermission('basedata:locations:delete'), baseDataController.deleteLocation);

// 仓库管理路由
router.get('/warehouses', authenticateToken, baseDataController.getWarehouses);

// 工序模板管理路由
router.get('/process-templates', authenticateToken, requirePermission('basedata:processtemplates:view'), baseDataController.getAllProcessTemplates);
// 工序模板导出（必须在:id路由之前）
router.post('/process-templates/export', authenticateToken, requirePermission('basedata:processtemplates:export'), baseDataController.exportProcessTemplates);
router.get('/process-templates/:id', authenticateToken, requirePermission('basedata:processtemplates:view'), baseDataController.getProcessTemplateById);
router.post('/process-templates', authenticateToken, requirePermission('basedata:processtemplates:create'), baseDataController.createProcessTemplate);
router.put('/process-templates/:id', authenticateToken, requirePermission('basedata:processtemplates:update'), baseDataController.updateProcessTemplate);
router.put(
  '/process-templates/:id/status',
  authenticateToken,
  requirePermission('basedata:processtemplates:update'),
  baseDataController.updateProcessTemplateStatus
);
router.delete(
  '/process-templates/:id',
  authenticateToken,
  requirePermission('basedata:processtemplates:delete'),
  baseDataController.deleteProcessTemplate
);
router.get(
  '/products/:id/process-template',
  authenticateToken,
  requirePermission('basedata:processtemplates:view'),
  baseDataController.getProcessTemplateByProductId
);

// 产品大类管理路由
router.get(
  '/product-categories',
  authenticateToken,
  productCategoryController.getAllProductCategories
);
router.get(
  '/product-categories/options',
  authenticateToken,
  productCategoryController.getProductCategoryOptions
);
router.get(
  '/product-categories/statistics',
  authenticateToken,
  requirePermission('basedata:productcategories:view'),
  productCategoryController.getStatistics
);
router.get(
  '/product-categories/:id',
  authenticateToken,
  requirePermission('basedata:productcategories:view'),
  productCategoryController.getProductCategoryById
);
router.post(
  '/product-categories',
  authenticateToken,
  requirePermission('basedata:productcategories:create'),
  productCategoryController.createProductCategory
);
router.put(
  '/product-categories/:id',
  authenticateToken,
  requirePermission('basedata:productcategories:update'),
  productCategoryController.updateProductCategory
);
router.delete(
  '/product-categories/:id',
  authenticateToken,
  requirePermission('basedata:productcategories:delete'),
  productCategoryController.deleteProductCategory
);

// 物料来源管理路由
router.get('/material-sources', authenticateToken, baseDataController.getAllMaterialSources);
router.get(
  '/material-sources/statistics',
  authenticateToken,
  requirePermission('basedata:materialsources:view'),
  baseDataController.getMaterialSourceStatistics
);
router.get('/material-sources/:id', authenticateToken, requirePermission('basedata:materialsources:view'), baseDataController.getMaterialSourceById);
router.post('/material-sources', authenticateToken, requirePermission('basedata:materialsources:create'), baseDataController.createMaterialSource);
router.put('/material-sources/:id', authenticateToken, requirePermission('basedata:materialsources:update'), baseDataController.updateMaterialSource);
router.delete('/material-sources/:id', authenticateToken, requirePermission('basedata:materialsources:delete'), baseDataController.deleteMaterialSource);

// 检验方式管理路由
router.get('/inspection-methods', authenticateToken, baseDataController.getAllInspectionMethods);
router.get('/inspection-methods/:id', authenticateToken, requirePermission('basedata:materialsources:view'), baseDataController.getInspectionMethodById);
router.post('/inspection-methods', authenticateToken, requirePermission('basedata:materialsources:create'), baseDataController.createInspectionMethod);
router.put('/inspection-methods/:id', authenticateToken, requirePermission('basedata:materialsources:update'), baseDataController.updateInspectionMethod);
router.delete('/inspection-methods/:id', authenticateToken, requirePermission('basedata:materialsources:delete'), baseDataController.deleteInspectionMethod);

module.exports = router;
