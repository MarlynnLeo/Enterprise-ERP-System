/**
 * 设备管理 - 菜单权限数据
 * 从 menuPermissions.js 拆分
 */

export const equipmentPerms = [
// 11. 设备管理
  {
    id: 11,
    parentId: 0,
    name: '设备管理',
    path: '/equipment',
    component: '',
    icon: 'icon-cpu',
    type: 0,
    permission: 'equipment',
    sort: 11,
    status: 1
  },
  {
    id: 111,
    parentId: 11,
    name: '设备台账',
    path: '/equipment/list',
    component: 'equipment/EquipmentList',
    icon: 'icon-list',
    type: 1,
    permission: 'equipment:list',
    sort: 1,
    status: 1
  },
  {
    id: 112,
    parentId: 11,
    name: '设备维护',
    path: '/equipment/maintenance',
    component: 'equipment/Maintenance',
    icon: 'icon-tools',
    type: 1,
    permission: 'equipment:maintenance',
    sort: 2,
    status: 1
  },
  {
    id: 113,
    parentId: 11,
    name: '设备检修',
    path: '/equipment/inspection',
    component: 'equipment/Inspection',
    icon: 'icon-search',
    type: 1,
    permission: 'equipment:inspection',
    sort: 3,
    status: 1
  },
  {
    id: 114,
    parentId: 11,
    name: '设备状态',
    path: '/equipment/status',
    component: 'equipment/Status',
    icon: 'icon-monitor',
    type: 1,
    permission: 'equipment:status',
    sort: 4,
    status: 1
  },
];
