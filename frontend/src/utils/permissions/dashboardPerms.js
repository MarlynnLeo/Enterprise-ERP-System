/**
 * 仪表盘 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const dashboardPerms = [
// 1. 仪表盘
  {
    id: 1,
    parentId: 0,
    name: '仪表盘',
    path: '/',
    component: 'dashboard/Dashboard',
    icon: 'icon-dashboard',
    type: 1, // 1-菜单
    permission: 'dashboard',
    sort: 1,
    status: 1
  },
];
