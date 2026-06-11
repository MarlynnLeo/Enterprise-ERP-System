/**
 * 基础数据路由
 */
export const baseDataRoutes = [
  {
    path: '/basedata',
    name: 'BaseData',
    component: () => import('@/views/baseData/Index.vue'),
    meta: { title: '基础数据', permission: 'basedata' }
  },
  {
    path: '/basedata/materials',
    name: 'Materials',
    component: () => import('@/views/baseData/Materials.vue'),
    meta: { title: '物料管理', permission: 'basedata' }
  },
  {
    path: '/basedata/materials/create',
    name: 'CreateMaterial',
    component: () => import('@/views/baseData/CreateMaterial.vue'),
    meta: { title: '新建物料', permission: 'basedata' }
  },
  {
    path: '/basedata/materials/:id/edit',
    name: 'EditMaterial',
    component: () => import('@/views/baseData/CreateMaterial.vue'),
    meta: { title: '编辑物料', permission: 'basedata' }
  },
  {
    path: '/basedata/materials/:id',
    name: 'MaterialDetail',
    component: () => import('@/views/baseData/MaterialDetail.vue'),
    meta: { title: '物料详情', permission: 'basedata' }
  },
  {
    path: '/basedata/boms',
    name: 'BOMs',
    component: () => import('@/views/baseData/BOMs.vue'),
    meta: { title: 'BOM管理', permission: 'basedata' }
  },
  {
    path: '/basedata/boms/:id',
    name: 'BOMDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: 'BOM详情', permission: 'basedata', resource: 'baseBom' }
  },
  {
    path: '/basedata/customers',
    name: 'Customers',
    component: () => import('@/views/baseData/Customers.vue'),
    meta: { title: '客户管理', permission: 'basedata' }
  },
  {
    path: '/basedata/customers/create',
    name: 'CreateCustomer',
    component: () => import('@/views/baseData/CreateCustomer.vue'),
    meta: { title: '新建客户', permission: 'basedata' }
  },
  {
    path: '/basedata/customers/:id/edit',
    name: 'EditCustomer',
    component: () => import('@/views/baseData/CreateCustomer.vue'),
    meta: { title: '编辑客户', permission: 'basedata' }
  },
  {
    path: '/basedata/customers/:id',
    name: 'CustomerDetail',
    component: () => import('@/views/baseData/CustomerDetail.vue'),
    meta: { title: '客户详情', permission: 'basedata' }
  },
  {
    path: '/basedata/suppliers',
    name: 'Suppliers',
    component: () => import('@/views/baseData/Suppliers.vue'),
    meta: { title: '供应商管理', permission: 'basedata' }
  },
  {
    path: '/basedata/suppliers/create',
    name: 'CreateSupplier',
    component: () => import('@/views/baseData/CreateSupplier.vue'),
    meta: { title: '新建供应商', permission: 'basedata' }
  },
  {
    path: '/basedata/suppliers/:id/edit',
    name: 'EditSupplier',
    component: () => import('@/views/baseData/CreateSupplier.vue'),
    meta: { title: '编辑供应商', permission: 'basedata' }
  },
  {
    path: '/basedata/suppliers/:id',
    name: 'SupplierDetail',
    component: () => import('@/views/baseData/SupplierDetail.vue'),
    meta: { title: '供应商详情', permission: 'basedata' }
  },
  {
    path: '/basedata/categories',
    name: 'Categories',
    component: () => import('@/views/baseData/Categories.vue'),
    meta: { title: '分类管理', permission: 'basedata' }
  },
  {
    path: '/basedata/categories/:id',
    name: 'CategoryDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '分类详情', permission: 'basedata', resource: 'baseCategory' }
  },
  {
    path: '/basedata/units',
    name: 'Units',
    component: () => import('@/views/baseData/Units.vue'),
    meta: { title: '单位管理', permission: 'basedata' }
  },
  {
    path: '/basedata/units/:id',
    name: 'UnitDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '单位详情', permission: 'basedata', resource: 'baseUnit' }
  },
  {
    path: '/basedata/locations',
    name: 'Locations',
    component: () => import('@/views/baseData/Locations.vue'),
    meta: { title: '库位管理', permission: 'basedata' }
  },
  {
    path: '/basedata/locations/:id',
    name: 'LocationDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '库位详情', permission: 'basedata', resource: 'baseLocation' }
  },
  {
    path: '/basedata/process-templates',
    name: 'ProcessTemplates',
    component: () => import('@/views/baseData/ProcessTemplates.vue'),
    meta: { title: '工序模板', permission: 'basedata' }
  },
  {
    path: '/basedata/process-templates/:id',
    name: 'ProcessTemplateDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '工序模板详情', permission: 'basedata', resource: 'baseProcessTemplate' }
  }
]
