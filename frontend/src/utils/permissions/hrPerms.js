/**
 * 人力资源 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const hrPerms = [
// 12. 人力资源
  {
    id: 12,
    parentId: 0,
    name: '人力资源',
    path: '/hr',
    component: '',
    icon: 'icon-user-filled',
    type: 0,
    permission: 'hr',
    sort: 12,
    status: 1
  },
  {
    id: 121,
    parentId: 12,
    name: '员工管理',
    path: '/hr/employees',
    component: 'hr/Employees',
    icon: 'icon-user',
    type: 1,
    permission: 'hr:employees',
    sort: 1,
    status: 1
  },
  {
    id: 122,
    parentId: 12,
    name: '考勤管理',
    path: '/hr/attendance',
    component: 'hr/Attendance',
    icon: 'icon-calendar',
    type: 1,
    permission: 'hr:attendance',
    sort: 2,
    status: 1
  },
  {
    id: 123,
    parentId: 12,
    name: '薪资管理',
    path: '/hr/salary',
    component: 'hr/Salary',
    icon: 'icon-money',
    type: 1,
    permission: 'hr:salary',
    sort: 3,
    status: 1
  },
  {
    id: 124,
    parentId: 12,
    name: '绩效考核',
    path: '/hr/performance',
    component: 'hr/Performance',
    icon: 'icon-trophy',
    type: 1,
    permission: 'hr:performance',
    sort: 4,
    status: 1
  },
  {
    id: 9001,
    parentId: 7,
    name: '价格查看',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'finance:price:view',
    sort: 900,
    status: 1
  },
  {
    id: 9002,
    parentId: 7,
    name: '价格维护',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'finance:price:update',
    sort: 901,
    status: 1
  },
  {
    id: 9003,
    parentId: 7,
    name: '价格导出',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'finance:price:export',
    sort: 902,
    status: 1
  },
  {
    id: 9004,
    parentId: 5,
    name: '采购价格查看',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'purchase:price:view',
    sort: 900,
    status: 1
  },
  {
    id: 9005,
    parentId: 5,
    name: '采购价格维护',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'purchase:price:update',
    sort: 901,
    status: 1
  },
  {
    id: 9006,
    parentId: 5,
    name: '采购价格导出',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'purchase:price:export',
    sort: 902,
    status: 1
  },
  {
    id: 9007,
    parentId: 6,
    name: '销售价格查看',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'sales:price:view',
    sort: 900,
    status: 1
  },
  {
    id: 9008,
    parentId: 6,
    name: '销售价格维护',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'sales:price:update',
    sort: 901,
    status: 1
  },
  {
    id: 9009,
    parentId: 6,
    name: '销售价格导出',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'sales:price:export',
    sort: 902,
    status: 1
  },
  {
    id: 9010,
    parentId: 4,
    name: '库存金额查看',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'inventory:value:view',
    sort: 900,
    status: 1
  },
  {
    id: 9011,
    parentId: 4,
    name: '库存金额维护',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'inventory:value:update',
    sort: 901,
    status: 1
  },
  {
    id: 9012,
    parentId: 4,
    name: '库存金额导出',
    path: '',
    component: '',
    icon: '',
    type: 2,
    permission: 'inventory:value:export',
    sort: 902,
    status: 1
  }
];
