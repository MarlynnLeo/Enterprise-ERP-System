/**
 * baseDataController.js
 * @description 控制器文件 - 汇总导出层
 * @date 2025-11-24
 * @version 4.0.0 - 按实体拆分到 basedata/ 子目录
 *
 * 拆分结构:
 *   basedata/materialController.js      - 物料管理
 *   basedata/bomController.js           - BOM管理
 *   basedata/supplierCustomerController.js - 供应商和客户管理
 *   basedata/commonController.js        - 通用功能（分类/单位/库位/文件等）
 *   basedata/processController.js       - 工序模板管理
 */

const materialController = require('./basedata/materialController');
const bomController = require('./basedata/bomController');
const supplierCustomerController = require('./basedata/supplierCustomerController');
const commonController = require('./basedata/commonController');
const processController = require('./basedata/processController');

const baseDataController = {
  ...commonController,
  ...materialController,
  ...bomController,
  ...supplierCustomerController,
  ...processController,
};

module.exports = baseDataController;
