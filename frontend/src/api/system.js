import { api } from '../services/axiosInstance';

const normalizeUserParams = (params = {}) => {
    const next = { ...(params?.params || params || {}) };
    if (next.pageSize !== undefined && next.limit === undefined) {
        next.limit = next.pageSize;
    }
    return next;
};

// 系统相关API
export const systemApi = {
    // 角色管理
    getRoles: (params) => api.get('/system/roles', { params }),
    getRolesList: () => api.get('/system/roles/list'),
    getRole: (id) => api.get(`/system/roles/${id}`),
    createRole: (data) => api.post('/system/roles', data),
    updateRole: (id, data) => api.put(`/system/roles/${id}`, data),
    deleteRole: (id) => api.delete(`/system/roles/${id}`),
    updateRoleStatus: (id, data) => api.put(`/system/roles/${id}/status`, data),
    getRolePermissions: (id) => api.get(`/system/roles/${id}/permissions`),
    updateRolePermissions: (id, data) => api.put(`/system/roles/${id}/permissions`, data),
    /** 权限码注册表 SSOT */
    getPermissionCodes: (params) => api.get('/system/permission-codes', { params }),

    // 菜单管理
    getMenus: (params) => api.get('/system/menus', { params }),
    getMenu: (id) => api.get(`/system/menus/${id}`),
    createMenu: (data) => api.post('/system/menus', data),
    updateMenu: (id, data) => api.put(`/system/menus/${id}`, data),
    updateMenuStatus: (id, data) => api.put(`/system/menus/${id}/status`, data),
    deleteMenu: (id) => api.delete(`/system/menus/${id}`),
    getMenusDirect: () => api.get('/system/menus/direct'),
    importMenus: (menus) => api.post('/system/menus/import', { menus }),

    // 部门管理
    getDepartments: (params) => api.get('/system/departments', { params }),
    getDepartmentsList: () => api.get('/system/departments/list'),
    getDepartment: (id) => api.get(`/system/departments/${id}`),
    createDepartment: (data) => api.post('/system/departments', data),
    updateDepartment: (id, data) => api.put(`/system/departments/${id}`, data),
    updateDepartmentStatus: (id, data) => api.put(`/system/departments/${id}/status`, data),
    deleteDepartment: (id) => api.delete(`/system/departments/${id}`),

    // 用户管理
    getUsers: (params) => api.get('/system/users', { params: normalizeUserParams(params) }),
    getUsersList: () => api.get('/system/users/list'),
    getUser: (id) => api.get(`/system/users/${id}`),
    createUser: (data) => api.post('/system/users', data),
    updateUser: (id, data) => api.put(`/system/users/${id}`, data),
    updateUserStatus: (id, data) => api.put(`/system/users/${id}/status`, data),
    resetUserPassword: (id, data) => api.put(`/system/users/${id}/password/reset`, data),

    // 系统日志
    getLogs: (params) => api.get('/system/logs', { params }),

    // System settings / operations
    getSettings: () => api.get('/system/settings'),
    updateSettings: (data) => api.put('/system/settings', data),
    getAccountingCodes: () => api.get('/system/accounting/account-codes'),
    updateAccountingCodes: (data) => api.put('/system/accounting/account-codes', data),
    getSystemInfo: () => api.get('/system/info'),
    getFailedJobs: (params) => api.get('/system/failed-jobs', { params }),
    retryFailedJobs: (data) => api.post('/system/failed-jobs/retry', data),
    resolveFailedJob: (id) => api.put(`/system/failed-jobs/${id}/resolve`),
    createBackup: () => api.post('/system/backup'),
    getBackups: () => api.get('/system/backups'),
    verifyBackup: (filename) => api.get(`/system/backups/${encodeURIComponent(filename)}/verify`),
    downloadBackup: (filename) => api.get(`/system/backups/${encodeURIComponent(filename)}`, { responseType: 'blob' }),

    // 业务类型管理
    getBusinessTypeGroups: () => api.get('/system/business-types/groups'),
    getBusinessTypeDictionary: () => api.get('/system/business-types/dictionary'),
    getBusinessTypes: (params) => api.get('/system/business-types', { params }),
    getBusinessTypesByCategory: (category) => api.get(`/system/business-types/category/${category}`),
    getBusinessType: (id) => api.get(`/system/business-types/${id}`),
    createBusinessType: (data) => api.post('/system/business-types', data),
    updateBusinessType: (id, data) => api.put(`/system/business-types/${id}`, data),
    deleteBusinessType: (id) => api.delete(`/system/business-types/${id}`),
    updateBusinessTypesSort: (data) => api.put('/system/business-types/sort', data)
};
