/**
 * 设备管理、人事管理、系统管理、个人中心、扫码搜索等路由
 */
export const otherRoutes = [
  // 设备资产管理
  {
    path: '/equipment',
    name: 'Equipment',
    component: () => import('@/views/equipment/Index.vue'),
    meta: { title: '设备管理', permission: 'equipment' }
  },
  {
    path: '/equipment/list',
    name: 'EquipmentList',
    component: () => import('@/views/equipment/EquipmentList.vue'),
    meta: { title: '设备台账', permission: 'equipment' }
  },
  {
    path: '/equipment/create',
    name: 'CreateEquipment',
    component: () => import('@/views/equipment/CreateEquipment.vue'),
    meta: { title: '新增设备', permission: 'equipment' }
  },
  {
    path: '/equipment/detail/:id',
    name: 'EquipmentDetail',
    component: () => import('@/views/equipment/EquipmentDetail.vue'),
    meta: { title: '设备详情', permission: 'equipment' }
  },
  {
    path: '/equipment/types',
    name: 'EquipmentTypes',
    component: () => import('@/views/equipment/Types.vue'),
    meta: { title: '设备类型', permission: 'equipment' }
  },
  {
    path: '/equipment/check',
    name: 'EquipmentCheck',
    component: () => import('@/views/equipment/Check.vue'),
    meta: { title: '日常点检', permission: 'equipment' }
  },
  {
    path: '/equipment/maintenance',
    name: 'EquipmentMaintenance',
    component: () => import('@/views/equipment/Maintenance.vue'),
    meta: { title: '保养计划', permission: 'equipment' }
  },
  {
    path: '/equipment/maintenance/create',
    name: 'CreateEquipmentMaintenance',
    component: () => import('@/views/equipment/CreateMaintenance.vue'),
    meta: { title: '制定保养计划', permission: 'equipment' }
  },
  {
    path: '/equipment/repair',
    name: 'EquipmentRepair',
    component: () => import('@/views/equipment/Repair.vue'),
    meta: { title: '故障维修', permission: 'equipment' }
  },
  {
    path: '/equipment/check/create',
    name: 'CreateEquipmentCheck',
    component: () => import('@/views/equipment/CreateCheck.vue'),
    meta: { title: '新建点检', permission: 'equipment' }
  },
  {
    path: '/equipment/repair/create',
    name: 'CreateEquipmentRepair',
    component: () => import('@/views/equipment/CreateRepair.vue'),
    meta: { title: '新建报修', permission: 'equipment' }
  },

  // 人事管理
  {
    path: '/hr',
    name: 'HR',
    component: () => import('@/views/hr/Index.vue'),
    meta: { title: '人事管理', permission: 'hr' }
  },
  {
    path: '/hr/employees',
    name: 'HREmployees',
    component: () => import('@/views/hr/Employees.vue'),
    meta: { title: '员工档案', permission: 'hr' }
  },
  {
    path: '/hr/employees/create',
    name: 'CreateEmployee',
    component: () => import('@/views/hr/CreateEmployee.vue'),
    meta: { title: '新员工入职', permission: 'hr' }
  },
  {
    path: '/hr/departments',
    name: 'HRDepartments',
    component: () => import('@/views/hr/Departments.vue'),
    meta: { title: '部门管理', permission: 'hr' }
  },
  {
    path: '/hr/departments/create',
    name: 'CreateDepartment',
    component: () => import('@/views/hr/CreateDepartment.vue'),
    meta: { title: '新增部门', permission: 'hr' }
  },
  {
    path: '/hr/attendance',
    name: 'HRAttendance',
    component: () => import('@/views/hr/Attendance.vue'),
    meta: { title: '考勤记录', permission: 'hr' }
  },
  {
    path: '/hr/attendance/manual',
    name: 'CreateAttendance',
    component: () => import('@/views/hr/CreateAttendance.vue'),
    meta: { title: '手动补卡', permission: 'hr' }
  },
  {
    path: '/hr/leave',
    name: 'HRLeave',
    component: () => import('@/views/hr/Leave.vue'),
    meta: { title: '请假审阅', permission: 'hr' }
  },
  {
    path: '/hr/overtime',
    name: 'HROvertime',
    component: () => import('@/views/hr/Overtime.vue'),
    meta: { title: '加班审批', permission: 'hr' }
  },
  {
    path: '/hr/leave/create',
    name: 'CreateLeave',
    component: () => import('@/views/hr/CreateLeave.vue'),
    meta: { title: '请假申请', permission: 'hr' }
  },
  {
    path: '/hr/overtime/create',
    name: 'CreateOvertime',
    component: () => import('@/views/hr/CreateOvertime.vue'),
    meta: { title: '加班申请', permission: 'hr' }
  },
  {
    path: '/hr/schedule',
    name: 'HRSchedule',
    component: () => import('@/views/hr/Schedule.vue'),
    meta: { title: '排班管理', permission: 'hr' }
  },

  // 扫码功能
  {
    path: '/scan',
    name: 'Scan',
    component: () => import('@/views/Scan.vue'),
    meta: { title: '扫码功能' }
  },

  // 全局搜索
  {
    path: '/search',
    name: 'GlobalSearch',
    component: () => import('@/views/GlobalSearch.vue'),
    meta: { title: '全局搜索' }
  },

  // 消息通知
  {
    path: '/system/notifications',
    name: 'Notifications',
    component: () => import('@/views/Notifications.vue'),
    meta: { title: '消息通知', permission: 'system:notifications' }
  },
  {
    path: '/system/notifications/:id',
    name: 'NotificationDetail',
    component: () => import('@/views/notifications/NotificationDetail.vue'),
    meta: { title: '消息详情', permission: 'system:notifications' }
  },

  // 即时通讯
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/Chat.vue'),
    meta: { title: '即时通讯', permission: ['chat:access', 'system:notifications'] }
  },

  // 系统管理
  {
    path: '/system',
    name: 'SystemIndex',
    component: () => import('@/views/system/Index.vue'),
    meta: { title: '系统管理', permission: 'system' }
  },
  {
    path: '/system/users',
    name: 'SystemUsers',
    component: () => import('@/views/system/Users.vue'),
    meta: { title: '用户管理', permission: 'system' }
  },
  {
    path: '/system/users/create',
    name: 'CreateUser',
    component: () => import('@/views/system/Users.vue'),
    meta: { title: '创建用户', permission: 'system' }
  },
  {
    path: '/system/users/:id',
    name: 'UserDetail',
    component: () => import('@/views/system/Users.vue'),
    meta: { title: '用户详情', permission: 'system' }
  },
  {
    path: '/system/departments',
    name: 'SystemDepartments',
    component: () => import('@/views/system/Departments.vue'),
    meta: { title: '部门管理', permission: 'system' }
  },
  {
    path: '/system/departments/:id',
    name: 'SystemDepartmentDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '部门详情', permission: 'system', resource: 'systemDepartment' }
  },
  {
    path: '/system/roles',
    name: 'SystemRoles',
    component: () => import('@/views/system/Roles.vue'),
    meta: { title: '角色管理', permission: 'system' }
  },
  {
    path: '/system/roles/:id',
    name: 'SystemRoleDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '角色详情', permission: 'system', resource: 'systemRole' }
  },
  {
    path: '/system/permissions',
    name: 'SystemPermissions',
    component: () => import('@/views/system/Permissions.vue'),
    meta: { title: '权限管理', permission: 'system' }
  },
  {
    path: '/system/permissions/:id',
    name: 'SystemPermissionDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '权限详情', permission: 'system', resource: 'systemPermission' }
  },
  {
    path: '/system/config',
    name: 'SystemConfig',
    component: () => import('@/views/system/Config.vue'),
    meta: { title: '系统配置', permission: 'system' }
  },
  {
    path: '/system/logs',
    name: 'SystemLogs',
    component: () => import('@/views/system/Logs.vue'),
    meta: { title: '系统日志', permission: 'system' }
  },
  {
    path: '/system/logs/:id',
    name: 'SystemLogDetail',
    component: () => import('@/views/common/RecordDetail.vue'),
    meta: { title: '日志详情', permission: 'system', resource: 'systemLog' }
  },
  {
    path: '/system/access-control',
    name: 'SystemAccessControl',
    component: () => import('@/views/system/AccessControl.vue'),
    meta: { title: '访问控制', permission: 'system' }
  },
  {
    path: '/system/backup',
    name: 'SystemBackup',
    component: () => import('@/views/system/Backup.vue'),
    meta: { title: '数据备份', permission: 'system' }
  },
  {
    path: '/system/hierarchy',
    name: 'SystemHierarchy',
    component: () => import('@/views/system/Hierarchy.vue'),
    meta: { title: '组织架构', permission: 'system' }
  },
  {
    path: '/system/maintenance',
    name: 'SystemMaintenance',
    component: () => import('@/views/system/SystemMaintenance.vue'),
    meta: { title: '系统维护', permission: 'system' }
  },
  {
    path: '/system/positions',
    name: 'SystemPositions',
    component: () => import('@/views/system/Positions.vue'),
    meta: { title: '岗位管理', permission: 'system' }
  },
  {
    path: '/system/profiles',
    name: 'SystemProfiles',
    component: () => import('@/views/system/Profiles.vue'),
    meta: { title: '配置文件', permission: 'system' }
  },
  {
    path: '/system/sessions',
    name: 'SystemSessions',
    component: () => import('@/views/system/Sessions.vue'),
    meta: { title: '会话管理', permission: 'system' }
  },

  // 个人中心
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/Profile.vue'),
    meta: { title: '个人资料' }
  },
  {
    path: '/profile/edit',
    name: 'EditProfile',
    component: () => import('@/views/profile/EditProfile.vue'),
    meta: { title: '编辑资料' }
  },
  {
    path: '/profile/password',
    name: 'ChangePassword',
    component: () => import('@/views/profile/ChangePassword.vue'),
    meta: { title: '修改密码' }
  },
  {
    path: '/profile/theme',
    name: 'ThemeSettings',
    component: () => import('@/views/profile/Theme.vue'),
    meta: { title: '主题设置' }
  },

  // 404
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: {
      title: '页面未找到',
      allowGuest: true
    }
  }
]
