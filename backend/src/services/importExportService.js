/**
 * 导入导出服务
 * @description 提供基础数据的导入导出功能
 * @date 2025-11-24
 */

const ExcelHelper = require('../utils/excelHelper');
const categoryService = require('./categoryService');
const bomService = require('./bomService');
const supplierService = require('./supplierService');
const customerService = require('./customerService');
const unitService = require('./unitService');
const locationService = require('./locationService');
const { pool } = require('../config/db');

class ImportExportService {
  /**
   * 下载分类导入模板
   */
  static async downloadCategoryTemplate() {
    const columns = [
      { header: '分类编码*', key: 'code', width: 15 },
      { header: '分类名称*', key: 'name', width: 25 },
      { header: '父分类编码', key: 'parent_code', width: 15 },
      { header: '排序', key: 'sort_order', width: 10 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    const sampleData = [
      { code: 'RAW', name: '原材料', parent_code: '', sort_order: 1, remarks: '示例数据' },
      { code: 'FIN', name: '成品', parent_code: '', sort_order: 2, remarks: '示例数据' },
      { code: 'RAW-STEEL', name: '钢材', parent_code: 'RAW', sort_order: 1, remarks: '示例数据' },
    ];

    return ExcelHelper.createTemplate(columns, sampleData, '分类导入模板');
  }

  /**
   * 导入分类
   */
  static async importCategories(fileBuffer) {
    const data = await ExcelHelper.readExcel(fileBuffer);

    if (!data || data.length === 0) {
      throw new Error('Excel文件中没有数据');
    }

    const successList = [];
    const errorList = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;

      try {
        if (!row['分类编码*']) throw new Error('分类编码不能为空');
        if (!row['分类名称*']) throw new Error('分类名称不能为空');

        let parent_id = null;
        if (row['父分类编码']) {
          const parent = await categoryService.getCategoryByCode(row['父分类编码']);
          if (!parent) throw new Error(`父分类编码"${row['父分类编码']}"不存在`);
          parent_id = parent.id;
        }

        const categoryData = {
          code: row['分类编码*'],
          name: row['分类名称*'],
          parent_id,
          sort_order: row['排序'] || 0,
          remarks: row['备注'] || '',
        };

        await categoryService.createCategory(categoryData);
        successList.push({ row: rowNum, code: categoryData.code, name: categoryData.name });
      } catch (error) {
        errorList.push({ row: rowNum, code: row['分类编码*'] || '', error: error.message });
      }
    }

    return {
      total: data.length,
      success: successList.length,
      failed: errorList.length,
      successList,
      errorList,
    };
  }

  /**
   * 导出分类
   */
  static async exportCategories(filters = {}) {
    const result = await categoryService.getAllCategories(filters);

    if (!result || result.length === 0) {
      throw new Error('没有可导出的数据');
    }

    const columns = [
      { header: '分类编码', key: 'code', width: 15 },
      { header: '分类名称', key: 'name', width: 25 },
      { header: '父分类', key: 'parent_name', width: 20 },
      { header: '排序', key: 'sort_order', width: 10 },
      { header: '状态', key: 'status_text', width: 10 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    const exportData = result.map((item) => ({
      code: item.code,
      name: item.name,
      parent_name: item.parent_name || '',
      sort_order: item.sort_order || 0,
      status_text: item.status === 1 ? '启用' : '停用',
      remarks: item.remarks || '',
    }));

    return ExcelHelper.exportData(exportData, columns, '分类列表');
  }

  /**
   * 下载供应商导入模板
   */
  static async downloadSupplierTemplate() {
    const columns = [
      { header: '供应商编码*', key: 'code', width: 20 },
      { header: '供应商名称*', key: 'name', width: 25 },
      { header: '联系人', key: 'contact_person', width: 15 },
      { header: '联系电话', key: 'contact_phone', width: 15 },
      { header: '联系邮箱', key: 'contact_email', width: 25 },
      { header: '地址', key: 'address', width: 30 },
      { header: '信用等级', key: 'credit_rating', width: 12 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    const sampleData = [
      {
        code: 'SUP001',
        name: '某某钢材公司',
        contact_person: '张三',
        contact_phone: '13800138000',
        contact_email: 'zhangsan@example.com',
        address: '浙江省温州市乐清市',
        credit_rating: 'A',
        remarks: '示例数据',
      },
    ];

    return ExcelHelper.createTemplate(columns, sampleData, '供应商导入模板');
  }

  /**
   * 导入供应商
   */
  static async importSuppliers(fileBuffer) {
    const data = await ExcelHelper.readExcel(fileBuffer);

    if (!data || data.length === 0) {
      throw new Error('Excel文件中没有数据');
    }

    const successList = [];
    const errorList = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;

      try {
        if (!row['供应商编码*']) throw new Error('供应商编码不能为空');
        if (!row['供应商名称*']) throw new Error('供应商名称不能为空');

        const supplierData = {
          code: row['供应商编码*'],
          name: row['供应商名称*'],
          contact_person: row['联系人'] || '',
          contact_phone: row['联系电话'] || '',
          contact_email: row['联系邮箱'] || '',
          address: row['地址'] || '',
          credit_rating: row['信用等级'] || '',
          remarks: row['备注'] || '',
        };

        await supplierService.createSupplier(supplierData);
        successList.push({ row: rowNum, code: supplierData.code, name: supplierData.name });
      } catch (error) {
        errorList.push({ row: rowNum, code: row['供应商编码*'] || '', error: error.message });
      }
    }

    return {
      total: data.length,
      success: successList.length,
      failed: errorList.length,
      successList,
      errorList,
    };
  }

  /**
   * 导出供应商
   */
  static async exportSuppliers(filters = {}) {
    const result = await supplierService.getAllSuppliers(1, 100000, filters);

    if (!result.list || result.list.length === 0) {
      throw new Error('没有可导出的数据');
    }

    const columns = [
      { header: '供应商编码', key: 'code', width: 20 },
      { header: '供应商名称', key: 'name', width: 25 },
      { header: '联系人', key: 'contact_person', width: 15 },
      { header: '联系电话', key: 'contact_phone', width: 15 },
      { header: '联系邮箱', key: 'contact_email', width: 25 },
      { header: '地址', key: 'address', width: 30 },
      { header: '信用等级', key: 'credit_rating', width: 12 },
      { header: '状态', key: 'status_text', width: 10 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    const exportData = result.list.map((item) => ({
      code: item.code,
      name: item.name,
      contact_person: item.contact_person || '',
      contact_phone: item.contact_phone || '',
      contact_email: item.contact_email || '',
      address: item.address || '',
      credit_rating: item.credit_rating || '',
      status_text: item.status === 1 ? '启用' : '停用',
      remarks: item.remarks || '',
    }));

    return ExcelHelper.exportData(exportData, columns, '供应商列表');
  }

  /**
   * 下载BOM导入模板
   */
  static async downloadBomTemplate() {
    const columns = [
      { header: 'BOM编码*', key: 'bom_code', width: 20 },
      { header: '产品编码*', key: 'product_code', width: 20 },
      { header: '版本号', key: 'version', width: 12 },
      { header: '物料编码*', key: 'material_code', width: 20 },
      { header: '用量*', key: 'quantity', width: 12 },
      { header: '单位', key: 'unit', width: 10 },
      { header: '损耗率(%)', key: 'loss_rate', width: 12 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    const sampleData = [
      {
        bom_code: 'BOM001',
        product_code: 'M002',
        version: 'V1.0',
        material_code: 'M001',
        quantity: 2,
        unit: '张',
        loss_rate: 5,
        remarks: '示例数据',
      },
    ];

    return ExcelHelper.createTemplate(columns, sampleData, 'BOM导入模板');
  }

  /**
   * 导入BOM
   */
  static async importBoms(fileBuffer) {
    const data = await ExcelHelper.readExcel(fileBuffer);

    if (!data || data.length === 0) {
      throw new Error('Excel文件中没有数据');
    }

    const successList = [];
    const errorList = [];

    // 按BOM编码分组
    const bomGroups = {};
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const bomCode = row['BOM编码*'];

      if (!bomGroups[bomCode]) {
        bomGroups[bomCode] = {
          bomData: {
            code: bomCode,
            product_code: row['产品编码*'],
            version: row['版本号'] || 'V1.0',
          },
          details: [],
          rows: [],
        };
      }

      bomGroups[bomCode].details.push({
        material_code: row['物料编码*'],
        quantity: row['用量*'],
        unit: row['单位'] || '',
        loss_rate: row['损耗率(%)'] || 0,
        remarks: row['备注'] || '',
      });

      bomGroups[bomCode].rows.push(i + 2);
    }

    // 逐个BOM处理
    for (const bomCode in bomGroups) {
      const { bomData, details, rows } = bomGroups[bomCode];

      try {
        // 查询产品ID
        const [products] = await pool.query('SELECT id FROM materials WHERE code = ?', [
          bomData.product_code,
        ]);

        if (!products || products.length === 0) {
          throw new Error(`产品编码"${bomData.product_code}"不存在`);
        }

        bomData.product_id = products[0].id;

        // 查询物料ID（关联单位表获取单位名称）
        for (const detail of details) {
          const [materials] = await pool.query(
            `SELECT m.id, COALESCE(u.name, '') as unit
             FROM materials m
             LEFT JOIN units u ON m.unit_id = u.id
             WHERE m.code = ?`,
            [detail.material_code]
          );

          if (!materials || materials.length === 0) {
            throw new Error(`物料编码"${detail.material_code}"不存在`);
          }

          detail.material_id = materials[0].id;
          if (!detail.unit) {
            detail.unit = materials[0].unit;
          }
        }

        // 创建BOM
        await bomService.createBom(bomData, details);

        successList.push({
          rows: rows.join(','),
          code: bomCode,
          product_code: bomData.product_code,
        });
      } catch (error) {
        errorList.push({
          rows: rows.join(','),
          code: bomCode,
          error: error.message,
        });
      }
    }

    return {
      total: Object.keys(bomGroups).length,
      success: successList.length,
      failed: errorList.length,
      successList,
      errorList,
    };
  }

  /**
   * 导出BOM
   */
  static async exportBoms(filters = {}) {
    const result = await bomService.getAllBoms(1, 100000, filters);

    if (!result.data || result.data.length === 0) {
      throw new Error('没有可导出的数据');
    }

    const columns = [
      { header: 'BOM编码', key: 'code', width: 20 },
      { header: '产品编码', key: 'product_code', width: 20 },
      { header: '产品名称', key: 'product_name', width: 25 },
      { header: '版本号', key: 'version', width: 12 },
      { header: '物料编码', key: 'material_code', width: 20 },
      { header: '物料名称', key: 'material_name', width: 25 },
      { header: '用量', key: 'quantity', width: 12 },
      { header: '单位', key: 'unit', width: 10 },
      { header: '损耗率(%)', key: 'loss_rate', width: 12 },
      { header: '备注', key: 'remarks', width: 30 },
    ];

    const exportData = [];

    // 展开BOM明细
    for (const bom of result.data) {
      if (bom.details && bom.details.length > 0) {
        for (const detail of bom.details) {
          exportData.push({
            code: bom.code,
            product_code: bom.product_code,
            product_name: bom.product_name,
            version: bom.version || 'V1.0',
            material_code: detail.material_code,
            material_name: detail.material_name,
            quantity: detail.quantity,
            unit: detail.unit,
            loss_rate: detail.loss_rate || 0,
            remarks: detail.remarks || '',
          });
        }
      }
    }

    return ExcelHelper.exportData(exportData, columns, 'BOM列表');
  }

  /**
   * 导出单位
   */
  static async exportUnits(filters = {}) {
    const result = await unitService.getAllUnits(filters, 1, 100000);

    if (!result.data || result.data.length === 0) {
      throw new Error('没有可导出的数据');
    }

    const columns = [
      { header: '单位编码', key: 'code', width: 15 },
      { header: '单位名称', key: 'name', width: 20 },
      { header: '状态', key: 'status_text', width: 10 },
      { header: '备注', key: 'remark', width: 30 },
    ];

    const exportData = result.data.map((item) => ({
      code: item.code || '',
      name: item.name,
      status_text: item.status === 1 ? '启用' : '禁用',
      remark: item.remark || '',
    }));

    return ExcelHelper.exportData(exportData, columns, '单位列表');
  }

  /**
   * 导出库位
   */
  static async exportLocations(filters = {}) {
    const result = await locationService.getAllLocations(filters, 1, 100000);

    if (!result.data || result.data.length === 0) {
      throw new Error('没有可导出的数据');
    }

    const columns = [
      { header: '库位编码', key: 'code', width: 15 },
      { header: '库位名称', key: 'name', width: 20 },
      { header: '库位类型', key: 'type', width: 15 },
      { header: '状态', key: 'status_text', width: 10 },
      { header: '备注', key: 'remark', width: 30 },
    ];

    const exportData = result.data.map((item) => ({
      code: item.code || '',
      name: item.name,
      type: item.type || '',
      status_text: item.status === 1 ? '启用' : '禁用',
      remark: item.remark || '',
    }));

    return ExcelHelper.exportData(exportData, columns, '库位列表');
  }

  /**
   * 下载客户导入模板
   */
  static async downloadCustomerTemplate() {
    const columns = [
      { header: '客户编码', key: 'code', width: 20 },
      { header: '客户名称*', key: 'name', width: 25 },
      { header: '客户类型', key: 'customer_type', width: 15 },
      { header: '联系人', key: 'contact_person', width: 15 },
      { header: '联系电话', key: 'contact_phone', width: 15 },
      { header: '电子邮箱', key: 'email', width: 25 },
      { header: '地址', key: 'address', width: 30 },
      { header: '信用额度', key: 'credit_limit', width: 12 },
      { header: '备注', key: 'remark', width: 30 },
    ];

    const sampleData = [
      {
        code: '',
        name: '某某科技有限公司',
        customer_type: 'direct',
        contact_person: '李四',
        contact_phone: '13900139000',
        email: 'lisi@example.com',
        address: '浙江省杭州市',
        credit_limit: 50000,
        remark: '编码留空则自动生成；类型可选：direct/distributor/oem',
      },
    ];

    return ExcelHelper.createTemplate(columns, sampleData, '客户导入模板');
  }

  /**
   * 导入客户
   */
  static async importCustomers(fileBuffer) {
    const data = await ExcelHelper.readExcel(fileBuffer);

    if (!data || data.length === 0) {
      throw new Error('Excel文件中没有数据');
    }

    const successList = [];
    const errorList = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2;

      try {
        if (!row['客户名称*']) throw new Error('客户名称不能为空');

        const customerData = {
          code: row['客户编码'] || '', // 留空自动生成
          name: row['客户名称*'],
          customer_type: row['客户类型'] || 'direct',
          contact_person: row['联系人'] || '',
          contact_phone: row['联系电话'] || '',
          email: row['电子邮箱'] || '',
          address: row['地址'] || '',
          credit_limit: row['信用额度'] || 0,
          remark: row['备注'] || '',
          status: 'active',
        };

        await customerService.createCustomer(customerData);
        successList.push({ row: rowNum, code: customerData.code || '(auto)', name: customerData.name });
      } catch (error) {
        errorList.push({ row: rowNum, name: row['客户名称*'] || '', error: error.message });
      }
    }

    return {
      total: data.length,
      success: successList.length,
      failed: errorList.length,
      successList,
      errorList,
    };
  }

  /**
   * 导出客户
   */
  static async exportCustomers(filters = {}) {
    const result = await customerService.getAllCustomers(1, 100000, filters);

    if (!result.items || result.items.length === 0) {
      throw new Error('没有可导出的数据');
    }

    const columns = [
      { header: '客户编码', key: 'code', width: 20 },
      { header: '客户名称', key: 'name', width: 25 },
      { header: '客户类型', key: 'customer_type', width: 15 },
      { header: '联系人', key: 'contact_person', width: 15 },
      { header: '联系电话', key: 'contact_phone', width: 15 },
      { header: '电子邮箱', key: 'email', width: 25 },
      { header: '地址', key: 'address', width: 30 },
      { header: '信用额度', key: 'credit_limit', width: 12 },
      { header: '状态', key: 'status_text', width: 10 },
      { header: '备注', key: 'remark', width: 30 },
    ];

    const exportData = result.items.map((item) => ({
      code: item.code || '',
      name: item.name,
      customer_type: item.customer_type || 'direct',
      contact_person: item.contact_person || '',
      contact_phone: item.contact_phone || '',
      email: item.email || '',
      address: item.address || '',
      credit_limit: item.credit_limit || 0,
      status_text: item.status === 1 || item.status === 'active' ? '启用' : '停用',
      remark: item.remark || '',
    }));

    return ExcelHelper.exportData(exportData, columns, '客户列表');
  }

  /**
   * 导出工序模板
   */
  static async exportProcessTemplates(filters = {}) {
    const processTemplateService = require('./processTemplateService');
    const result = await processTemplateService.getAll(1, 100000, filters);

    if (!result.list || result.list.length === 0) {
      throw new Error('没有可导出的数据');
    }

    const columns = [
      { header: '模板编码', key: 'code', width: 20 },
      { header: '模板名称', key: 'name', width: 25 },
      { header: '产品编码', key: 'product_code', width: 20 },
      { header: '产品名称', key: 'product_name', width: 25 },
      { header: '工序名称', key: 'process_name', width: 20 },
      { header: '工序序号', key: 'order_num', width: 10 },
      { header: '标准工时(h)', key: 'standard_hours', width: 12 },
      { header: '部门', key: 'department', width: 15 },
      { header: '工序描述', key: 'description', width: 30 },
      { header: '状态', key: 'status_text', width: 10 },
    ];

    const exportData = [];

    // 展开工序模板详情
    for (const template of result.list) {
      if (template.details && template.details.length > 0) {
        for (const detail of template.details) {
          exportData.push({
            code: template.code || '',
            name: template.name,
            product_code: template.product_code || '',
            product_name: template.product_name || '',
            process_name: detail.name,
            order_num: detail.order_num,
            standard_hours: detail.standard_hours || 0,
            department: detail.department || '',
            description: detail.description || '',
            status_text: template.status === 1 ? '启用' : '禁用',
          });
        }
      } else {
        // 无详情的模板也输出一行
        exportData.push({
          code: template.code || '',
          name: template.name,
          product_code: template.product_code || '',
          product_name: template.product_name || '',
          process_name: '(无工序)',
          order_num: 0,
          standard_hours: 0,
          department: '',
          description: template.description || '',
          status_text: template.status === 1 ? '启用' : '禁用',
        });
      }
    }

    return ExcelHelper.exportData(exportData, columns, '工序模板列表');
  }
}

module.exports = ImportExportService;
