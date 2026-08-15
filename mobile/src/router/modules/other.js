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
    meta: { title: '员工档案', permission: 'hr:employees' }
  },
  {
    path: '/hr/employees/create',
    name: 'CreateEmployee',
    component: () => import('@/views/hr/CreateEmployee.vue'),
    meta: { title: '新员工入职', permission: 'hr:employees:create' }
  },
  {
    path: '/hr/departments',
    name: 'HRDepartments',
    component: () => import('@/views/hr/Departments.vue'),
    meta: { title: '部门管理', permission: 'system:departments' }
  },
  {
    path: '/hr/departments/create',
    name: 'CreateDepartment',
    component: () => import('@/views/hr/CreateDepartment.vue'),
    meta: { title: '新增部门', permission: 'system:departments' }
  },
  {
    path: '/hr/attendance',
    name: 'HRAttendance',
    component: () => import('@/views/hr/Attendance.vue'),
    meta: { title: '考勤记录', permission: 'hr:attendance' }
  },
  {
    path: '/hr/attendance/manual',
    name: 'CreateAttendance',
    component: () => import('@/views/hr/CreateAttendance.vue'),
    meta: { title: '手动补卡', permission: 'hr:attendance:create' }
  },
  {
    path: '/hr/leave',
    name: 'HRLeave',
    component: () => import('@/views/hr/Leave.vue'),
    meta: { title: '请假审阅', permission: 'hr:attendance' }
  },
  {
    path: '/hr/overtime',
    name: 'HROvertime',
    component: () => import('@/views/hr/Overtime.vue'),
    meta: { title: '加班审批', permission: 'hr:attendance' }
  },
  {
    path: '/hr/leave/create',
    name: 'CreateLeave',
    component: () => import('@/views/hr/CreateLeave.vue'),
    meta: { title: '请假申请', permission: 'hr:attendance:create' }
  },
  {
    path: '/hr/overtime/create',
    name: 'CreateOvertime',
    component: () => import('@/views/hr/CreateOvertime.vue'),
    meta: { title: '加班申请', permission: 'hr:attendance:create' }
  },
  {
    path: '/hr/schedule',
    name: 'HRSchedule',
    component: () => import('@/views/hr/Schedule.vue'),
    meta: { title: '排班管理', permission: 'hr:attendance' }
  },

  // 扫码功能（需库存/生产/质检任一查看权限，避免任意登录可扫）
  {
    path: '/scan',
    name: 'Scan',
    component: () => import('@/views/Scan.vue'),
    meta: {
      title: '扫码功能',
      permission: [
        'inventory:stock:view',
        'inventory:outbound:view',
        'inventory:inbound:view',
        'inventory:check:view',
        'production:tasks:view',
        'quality:inspections:view',
        'quality:incoming:view',
        'quality:process:view',
        'quality:final:view',
        'basedata:materials:view'
      ]
    }
  },

  // 全局搜索（至少需要一个业务模块查看权）
  {
    path: '/search',
    name: 'GlobalSearch',
    component: () => import('@/views/GlobalSearch.vue'),
    meta: {
      title: '全局搜索',
      permission: [
        'basedata:materials:view',
        'sales:orders:view',
        'purchase:orders:view',
        'inventory:stock:view',
        'production:tasks:view',
        'quality:inspections:view',
        'quality:incoming:view',
        'quality:process:view',
        'quality:final:view'
      ]
    }
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

  // 我的审批（对接后端 workflow API）
  {
    path: '/workflow/approvals',
    name: 'WorkflowApprovals',
    component: () => import('@/views/workflow/Approvals.vue'),
    meta: { title: '我的审批', permission: 'system:workflow:use' }
  },

  // 系统 L3 控制台（角色/权限/备份/维护/配置）仅 PC — 见 MOBILE_PRODUCT_LAYER.md
  // 移动端仅保留通知、会话只读入口（可选）
  {
    path: '/system',
    name: 'SystemIndex',
    component: () => import('@/views/system/Index.vue'),
    meta: { title: '系统', permission: 'system:notifications' }
  },
  {
    path: '/system/hierarchy',
    name: 'SystemHierarchy',
    component: () => import('@/views/system/Hierarchy.vue'),
    meta: { title: '组织架构', permission: 'system:departments:view' }
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
