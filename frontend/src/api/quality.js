import { api } from '../services/axiosInstance';

export const qualityApi = {

    // 获取来料检验单列表
    getIncomingInspections: (params) => api.get('/quality/inspections/incoming', { params }),
    getIncomingInspection: (id, params) => api.get(`/quality/inspections/${id}`, params),
    createIncomingInspection: (data) => api.post('/quality/inspections', data),
    updateIncomingInspection: (id, data) => api.put(`/quality/inspections/${id}`, data),

    // 获取过程检验单列表
    getProcessInspections: (params) => api.get('/quality/inspections/process', { params }),
    getProcessInspection: (id) => api.get(`/quality/inspections/${id}`),
    createProcessInspection: (data) => api.post('/quality/inspections', data),
    updateProcessInspection: (id, data) => api.put(`/quality/inspections/${id}`, data),
    deleteProcessInspection: (id) => api.delete(`/quality/inspections/${id}`),

    // 获取成品检验单列表
    getFinalInspections: (params) => api.get('/quality/inspections/final', { params }),
    getFinalInspection: (id) => api.get(`/quality/inspections/${id}`),
    createFinalInspection: (data) => api.post('/quality/inspections', data),
    updateFinalInspection: (id, data) => api.put(`/quality/inspections/${id}`, data),
    deleteFinalInspection: (id) => api.delete(`/quality/inspections/${id}`),

    // 首检管理
    getFirstArticleInspections: (params) => api.get('/quality/inspections/first-article', { params }),
    getFirstArticleStats: () => api.get('/quality/inspections/first-article/stats'),
    createFirstArticleInspection: (data) => api.post('/quality/inspections/first-article', data),
    updateFirstArticleResult: (id, data) => api.put(`/quality/inspections/first-article/${id}/result`, data),
    getFirstArticleInspection: (id) => api.get(`/quality/inspections/${id}`),

    // 首检规则配置
    getFirstArticleRules: () => api.get('/quality/first-article-rules'),
    getFirstArticleRuleByProduct: (productId) => api.get(`/quality/first-article-rules/${productId}`),
    createFirstArticleRule: (data) => api.post('/quality/first-article-rules', data),
    updateFirstArticleRule: (id, data) => api.put(`/quality/first-article-rules/${id}`, data),
    deleteFirstArticleRule: (id) => api.delete(`/quality/first-article-rules/${id}`),

    // 获取物料默认检验模板
    getMaterialDefaultTemplate: (materialId) => api.get('/quality/templates', { params: { material_id: materialId, is_general: 0, status: 'active' } }),
    // 获取模板列表
    getTemplates: (params) => api.get('/quality/templates', { params }),
    // 获取模板详情
    getTemplate: (id) => api.get(`/quality/templates/${id}`),
    // 创建模板
    createTemplate: (data) => api.post('/quality/templates', data),
    // 更新模板
    updateTemplate: (id, data) => api.put(`/quality/templates/${id}`, data),
    // 删除模板
    deleteTemplate: (id) => api.delete(`/quality/templates/${id}`),
    // 更改模板状态
    updateTemplateStatus: (id, status) => api.put(`/quality/templates/${id}/status`, { status }),
    // 复制模板
    copyTemplate: (id) => api.post(`/quality/templates/${id}/copy`),
    // 获取可复用的检验项目
    getReusableItems: (params) => api.get('/quality/templates/reusable-items', { params }),

    // 创建可复用的检验标准项目
    createReusableItem: (data) => api.post('/quality/templates/reusable-items', data),


    // 获取可追溯性记录
    getTraceabilityRecords: (params) => api.get('/quality/traceability', { params }),
    getTraceabilityRecord: (id) => api.get(`/quality/traceability/${id}`),
    createTraceabilityRecord: (data) => api.post('/quality/traceability', data),
    updateTraceabilityRecord: (id, data) => api.put(`/quality/traceability/${id}`, data),
    deleteTraceabilityRecord: (id) => api.delete(`/quality/traceability/${id}`),

    // 获取追溯记录关联的质检记录
    getQualityRecords: async (traceabilityId) => {
        try {
            // 尝试直接使用关联API
            const response = await api.get(`/quality/traceability/${traceabilityId}/quality`);
            return response;
        } catch (error) {
            console.error('获取质检记录API调用失败:', error);
            // 如果直接API调用失败，尝试获取追溯记录详情再查询相关质检记录
            const traceResponse = await api.get(`/quality/traceability/${traceabilityId}`);
            if (traceResponse.data) {
                const traceData = traceResponse.data;
                const batchNumber = traceData.batchNumber || traceData.batch_number;

                if (batchNumber) {
                    const inspectionResponse = await api.get(`/quality/inspections`, {
                        params: { batch_no: batchNumber }
                    });
                    return inspectionResponse;
                }
            }
            throw error;
        }
    },

    // 获取质检记录的检验项目详情
    getInspectionItems: async (inspectionId) => {
        try {
            const response = await api.get(`/quality/inspections/${inspectionId}/items`);
            return response;
        } catch (error) {
            console.error(`获取检验单${inspectionId}的检验项目失败:`, error);
            // 尝试备选API路径
            const altResponse = await api.get(`/quality/inspection-items`, {
                params: { inspection_id: inspectionId }
            });
            return altResponse;
        }
    },

    // 获取全链路追溯数据
    getFullTraceability: (data) => api.post('/quality/traceability/full', data),


    // 获取质量检验数据统计信息
    getQualityStatistics: async (params = {}) => {
        const response = await api.get('/quality/statistics', { params });
        return response.data;
    },

    // 获取不合格项目列表
    getDefectItems: async (params = {}) => {
        const response = await api.get('/quality/defect-items', { params });
        return response.data;
    },

    // 获取质量趋势数据
    getQualityTrends: async (params = {}) => {
        const response = await api.get('/quality/trends', { params });
        return response.data;
    },


    // 根据批次号查询检验单详情（包括检验项目）
    getInspectionByBatchNo: (batchNo) => api.get(`/quality/inspections/batch/${batchNo}`),

    // 批次号追溯相关API
    getPurchaseByBatch: (batchNumber) => api.get(`/quality/traceability/purchase/${batchNumber}`),
    getProductionByBatch: (batchNumber) => api.get(`/quality/traceability/production/${batchNumber}`),
    getMaterialByBatch: (batchNumber) => api.get(`/quality/traceability/material/${batchNumber}`),

    // （旧版单向创建物料追溯接口功能已移交控制台静默处理）
    // 追溯图数据
    getTraceabilityChart: (id) => api.get(`/quality/traceability/${id}/chart`),

    // 自动生成追溯
    generateAutoTraceability: () => api.post('/quality/traceability/auto-generate'),


    // 过程检验规则配置
    getProcessInspectionRules: () => api.get('/quality/process-inspection/rules'),
    createProcessInspectionRule: (data) => api.post('/quality/process-inspection/rules', data),
    updateProcessInspectionRule: (id, data) => api.put(`/quality/process-inspection/rules/${id}`, data),
    deleteProcessInspectionRule: (id) => api.delete(`/quality/process-inspection/rules/${id}`),

    // 过程检验打卡
    getProcessInspectionPunchToday: () => api.get('/quality/process-inspection/punch/today'),
    getProcessInspectionPunchList: (params) => api.get('/quality/process-inspection/punch/list', { params }),
    createProcessInspectionPunch: (data) => api.post('/quality/process-inspection/punch', data),

    // 对指定检验单打卡（标记检验员已到达开始检验）
    punchProcessInspection: (id, data) => api.post(`/quality/inspections/process/${id}/punch`, data),

    // AQL 抽样标准相关
    getAqlStandards: (params) => api.get('/quality/aql-standards', { params }),
    createAqlStandard: (data) => api.post('/quality/aql-standards', data),
    updateAqlStandard: (id, data) => api.put(`/quality/aql-standards/${id}`, data),
    deleteAqlStandard: (id) => api.delete(`/quality/aql-standards/${id}`),
    getAqlLevels: () => api.get('/quality/aql-levels'),
    calculateAqlSampling: (data) => api.post('/quality/aql-sampling/calculate', {
        batch_size: data.batchSize || data.batch_size,
        aql_level: data.aqlLevel || data.aql_level
    }),

    // ==================== 量具管理 ====================
    getGauges: (params) => api.get('/quality/gauges', { params }),
    getGaugeById: (id) => api.get(`/quality/gauges/${id}`),
    getDueGauges: () => api.get('/quality/gauges/due'),
    createGauge: (data) => api.post('/quality/gauges', data),
    updateGauge: (id, data) => api.put(`/quality/gauges/${id}`, data),
    deleteGauge: (id) => api.delete(`/quality/gauges/${id}`),
    getCalibrationRecords: (params) => api.get('/quality/calibrations', { params }),
    createCalibrationRecord: (data) => api.post('/quality/calibrations', data),

    // ==================== SPC 控制图 ====================
    getSpcPlans: (params) => api.get('/quality/spc/plans', { params }),
    createSpcPlan: (data) => api.post('/quality/spc/plans', data),
    updateSpcPlan: (id, data) => api.put(`/quality/spc/plans/${id}`, data),
    deleteSpcPlan: (id) => api.delete(`/quality/spc/plans/${id}`),
    addSpcDataPoints: (data) => api.post('/quality/spc/data', data),
    getSpcCpk: (planId) => api.get(`/quality/spc/plans/${planId}/cpk`),
    getSpcChart: (planId) => api.get(`/quality/spc/plans/${planId}/chart`),

    // ==================== 供应商质量计分卡 ====================
    getSupplierScores: (params) => api.get('/quality/supplier-quality/scores', { params }),
    getSupplierRanking: (params) => api.get('/quality/supplier-quality/ranking', { params }),
    getSupplierTrend: (supplierId, params) => api.get(`/quality/supplier-quality/trend/${supplierId}`, { params }),
    calculateSupplierScores: (data) => api.post('/quality/supplier-quality/calculate', data),
};

// 质量统计报表API（QualityStatistics.vue 使用）
export const qualityStatisticsApi = {
    // 获取综合统计概览
    getOverview: (params) => api.get('/quality-statistics/overview', { params }),
    // 获取处理方式统计
    getDispositionStatistics: (params) => api.get('/quality-statistics/disposition', { params }),
    // 获取趋势分析
    getTrendAnalysis: (params) => api.get('/quality-statistics/trend', { params }),
    // 获取供应商质量分析
    getSupplierQualityAnalysis: (params) => api.get('/quality-statistics/supplier', { params }),
    // 获取物料缺陷分析
    getMaterialDefectAnalysis: (params) => api.get('/quality-statistics/material', { params }),
    // 获取成本分析
    getCostAnalysis: (params) => api.get('/quality-statistics/cost', { params })
};

// 8D报告管理API
export const eightDReportApi = {
    getReports: (params) => api.get('/eight-d-reports', { params }),
    getReportById: (id) => api.get(`/eight-d-reports/${id}`),
    getReportLogs: (id) => api.get(`/eight-d-reports/${id}/logs`),
    createReport: (data) => api.post('/eight-d-reports', data),
    updateReport: (id, data) => api.put(`/eight-d-reports/${id}`, data),
    submitReview: (id) => api.post(`/eight-d-reports/${id}/submit-review`),
    submitPhase2Review: (id) => api.post(`/eight-d-reports/${id}/submit-phase2-review`),
    reviewReport: (id, data) => api.post(`/eight-d-reports/${id}/review`, data),
    completeReport: (id) => api.post(`/eight-d-reports/${id}/complete`),
    closeReport: (id) => api.post(`/eight-d-reports/${id}/close`),
    deleteReport: (id) => api.delete(`/eight-d-reports/${id}`),
    getStatistics: () => api.get('/eight-d-reports/statistics'),
    aiAnalyze: (data) => api.post('/eight-d-reports/ai-analyze', data, { timeout: 60000 })
};

