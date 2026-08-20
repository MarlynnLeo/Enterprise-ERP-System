import { api, fastApi } from '../services/axiosInstance';

export const userApi = {
    login: (credentials) => api.post('/auth/login', credentials),
    verifyMfa: (data) => api.post('/auth/mfa/verify', data),
    enrollMfa: (data) => api.post('/auth/mfa/enroll', data),
    setupMfa: (data) => api.post('/auth/mfa/setup', data),
    confirmMfa: (data) => api.post('/auth/mfa/confirm', data),
    disableMfa: (data) => api.post('/auth/mfa/disable', data),
    regenerateMfaRecoveryCodes: (data) => api.post('/auth/mfa/recovery-codes/regenerate', data),
    logout: () => api.post('/auth/logout'),
    getProfile: () => api.get('/auth/profile'),
    getProfileFast: (config = {}) => fastApi.get('/auth/profile', config),
    updateProfile: (data) => api.put('/auth/profile', data),
    changePassword: (data) => api.put('/auth/change-password', data),
    updateAvatar: (formData) => api.put('/auth/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    updateAvatarFrame: (frameId) => api.post('/auth/profile/avatar-frame', { frameId }),
    getUserMenus: () => api.get('/auth/menus'),
    getPermissions: (timestamp = Date.now()) => api.get('/auth/permissions', { params: { _t: timestamp } }),
    getTheme: () => api.get('/auth/theme'),
    updateTheme: (data) => api.post('/auth/theme', data),
    getActivities: (params) => api.get('/user-activities', { params }),
    getStatistics: () => api.get('/user-activities/statistics'),
    exportActivities: (params) => api.get('/user-activities/export', { params }),
    getOnlineTimeRanking: (params) => api.get('/user-activities/online-time-ranking', { params })
};

export const todoApi = {
    getTodos: (params) => api.get('/todos', { params }),
    getAllTodos: (params) => api.get('/todos', { params }),
    getDashboardSummary: (params) => api.get('/todos/dashboard-summary', { params }),
    getTodo: (id) => api.get(`/todos/${id}`),
    createTodo: (data) => api.post('/todos', data),
    updateTodo: (id, data) => api.put(`/todos/${id}`, data),
    deleteTodo: (id) => api.delete(`/todos/${id}`),
    toggleTodoStatus: (id) => api.put(`/todos/${id}/toggle`, {}),
    getAvailableUsers: () => api.get('/todos/available-users')
};
