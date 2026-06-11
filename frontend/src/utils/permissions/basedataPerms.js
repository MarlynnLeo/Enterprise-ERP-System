/**
 * 基础数据 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const basedataPerms = [
// 3. 基础数据
  {
    id: 3,
    parentId: 0,
    name: '基础数据',
    path: '/basedata',
    component: '',
    icon: 'icon-base',
    type: 0,
    permission: 'basedata',
    sort: 3,
    status: 1
  },
  {
    id: 31,
    parentId: 3,
    name: '物料管理',
    path: '/basedata/materials',
    component: 'baseData/Materials',
    icon: 'icon-material',
    type: 1,
    permission: 'basedata:materials',
    sort: 1,
    status: 1
  },
  {
    id: 32,
    parentId: 3,
    name: 'BOM管理',
    path: '/basedata/boms',
    component: 'baseData/Boms',
    icon: 'icon-bom',
    type: 1,
    permission: 'basedata:boms',
    sort: 2,
    status: 1
  },
  {
    id: 33,
    parentId: 3,
    name: '客户管理',
    path: '/basedata/customers',
    component: 'baseData/Customers',
    icon: 'icon-customer',
    type: 1,
    permission: 'basedata:customers',
    sort: 3,
    status: 1
  },
  {
    id: 34,
    parentId: 3,
    name: '供应商管理',
    path: '/basedata/suppliers',
    component: 'baseData/Suppliers',
    icon: 'icon-supplier',
    type: 1,
    permission: 'basedata:suppliers',
    sort: 4,
    status: 1
  },
  {
    id: 35,
    parentId: 3,
    name: '产品大类',
    path: '/basedata/categories',
    component: 'baseData/Categories',
    icon: 'icon-category',
    type: 1,
    permission: 'basedata:categories',
    sort: 5,
    status: 1
  },
  {
    id: 36,
    parentId: 3,
    name: '单位管理',
    path: '/basedata/units',
    component: 'baseData/Units',
    icon: 'icon-unit',
    type: 1,
    permission: 'basedata:units',
    sort: 6,
    status: 1
  },
  {
    id: 37,
    parentId: 3,
    name: '库位管理',
    path: '/basedata/locations',
    component: 'baseData/Locations',
    icon: 'icon-location',
    type: 1,
    permission: 'basedata:locations',
    sort: 7,
    status: 1
  },
  {
    id: 38,
    parentId: 3,
    name: '工序模板',
    path: '/basedata/process-templates',
    component: 'baseData/ProcessTemplates',
    icon: 'icon-set-up',
    type: 1,
    permission: 'basedata:processtemplates',
    sort: 8,
    status: 1
  },
  {
    id: 310,
    parentId: 3,
    name: '物料类型',
    path: '/basedata/product-categories',
    component: 'baseData/ProductCategories',
    icon: 'icon-category',
    type: 1,
    permission: 'basedata:productcategories',
    sort: 9,
    status: 1
  },
  {
    id: 311,
    parentId: 3,
    name: '工程变更(ECN)',
    path: '/basedata/ecn',
    component: 'baseData/ECNManagement',
    icon: 'icon-edit',
    type: 1,
    permission: 'basedata:ecn',
    sort: 10,
    status: 1
  },
];
