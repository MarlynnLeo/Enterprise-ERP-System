import { api } from '../services/axiosInstance';

export const userApi = {
    getProfile: () => api.get('/auth/profile'),
    updateProfile: (data) => api.put('/auth/profile', data),
    changePassword: (data) => api.put('/users/password', data),
    updateAvatar: (formData) => api.put('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    updateAvatarFrame: (frameId) => api.post('/auth/profile/avatar-frame', { frameId }),
    getUserMenus: () => api.get('/auth/menus'),
    getActivities: (params) => api.get('/user-activities', { params }),
    getStatistics: () => api.get('/user-activities/statistics'),
    exportActivities: (params) => api.get('/user-activities/export', { params }),
    getOnlineTimeRanking: (params) => api.get('/user-activities/online-time-ranking', { params })
};

export const todoApi = {
    getTodos: (params) => api.get('/todos', { params }),
    getAllTodos: (params) => api.get('/todos', { params }),
    getTodo: (id) => api.get(`/todos/${id}`),
    createTodo: (data) => api.post('/todos', data),
    updateTodo: (id, data) => api.put(`/todos/${id}`, data),
    deleteTodo: (id) => api.delete(`/todos/${id}`),
    updateTodoStatus: (id, status) => api.put(`/todos/${id}/status`, { status }),
    toggleTodoStatus: (id) => api.put(`/todos/${id}/toggle`, {}),
    getTodoStatistics: () => api.get('/todos/statistics'),
    getAvailableUsers: () => api.get('/todos/available-users')
};
