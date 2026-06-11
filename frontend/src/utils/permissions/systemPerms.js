/**
 * 系统管理 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const systemPerms = [
// 9. 系统管理
  {
    id: 9,
    parentId: 0,
    name: '系统管理',
    path: '/system',
    component: '',
    icon: 'icon-setting',
    type: 0,
    permission: 'system',
    sort: 9,
    status: 1
  },
  {
    id: 91,
    parentId: 9,
    name: '用户管理',
    path: '/system/users',
    component: 'system/Users',
    icon: 'icon-user',
    type: 1,
    permission: 'system:users',
    sort: 1,
    status: 1
  },
  {
    id: 92,
    parentId: 9,
    name: '部门管理',
    path: '/system/departments',
    component: 'system/Departments',
    icon: 'icon-office-building',
    type: 1,
    permission: 'system:departments',
    sort: 2,
    status: 1
  },
  {
    id: 93,
    parentId: 9,
    name: '权限设置',
    path: '/system/permissions',
    component: 'system/Permissions',
    icon: 'icon-lock',
    type: 1,
    permission: 'system:permissions',
    sort: 3,
    status: 1
  },
  {
    id: 94,
    parentId: 9,
    name: '技术通讯',
    path: '/system/technical-communication',
    component: 'system/TechnicalCommunication',
    icon: 'icon-document',
    type: 1,
    permission: 'system:tech-comm',
    sort: 4,
    status: 1
  },
  {
    id: 95,
    parentId: 9,
    name: '打印设置',
    path: '/system/print',
    component: 'system/Print',
    icon: 'icon-printer',
    type: 1,
    permission: 'system:print',
    sort: 5,
    status: 1
  },
  {
    id: 96,
    parentId: 9,
    name: '通知中心',
    path: '/system/notifications',
    component: 'system/Notifications',
    icon: 'icon-bell',
    type: 1,
    permission: 'system:notifications',
    sort: 6,
    status: 1
  },
  {
    id: 97,
    parentId: 9,
    name: '业务类型',
    path: '/system/business-types',
    component: 'system/BusinessTypes',
    icon: 'icon-folder',
    type: 1,
    permission: 'system:business-types',
    sort: 7,
    status: 1
  },
  {
    id: 98,
    parentId: 9,
    name: '审批工作流',
    path: '/system/workflow',
    component: 'system/WorkflowManagement',
    icon: 'icon-connection',
    type: 1,
    permission: 'system:workflow',
    sort: 8,
    status: 1
  },
  {
    id: 99,
    parentId: 9,
    name: '编码规则',
    path: '/system/coding-rules',
    component: 'system/CodingRules',
    icon: 'icon-stamp',
    type: 1,
    permission: 'system:settings',
    sort: 9,
    status: 1
  },
  {
    id: 910,
    parentId: 9,
    name: '文档管理',
    path: '/system/documents',
    component: 'system/DocumentManagement',
    icon: 'icon-files',
    type: 1,
    permission: 'system:documents',
    sort: 10,
    status: 1
  },
  {
    id: 911,
    parentId: 9,
    name: '业务告警',
    path: '/system/business-alerts',
    component: 'system/BusinessAlerts',
    icon: 'icon-warning',
    type: 1,
    permission: 'system:business-alerts',
    sort: 11,
    status: 1
  },
];
