/**
 * 基础数据管理 API 模块
 */
import api from '../client'

export const baseDataApi = {
  // 分类与单位
  getCategories(params) {
    return api.get('/base-data/categories', { params })
  },
  getUnits(params) {
    return api.get('/base-data/units', { params })
  },

  // 产品大类选项（树形结构）
  getProductCategoryOptions() {
    return api.get('/base-data/product-categories/options')
  },

  // 物料来源
  getMaterialSources() {
    return api.get('/base-data/material-sources')
  },

  // 检验方式
  getInspectionMethods() {
    return api.get('/base-data/inspection-methods')
  },

  // 供应商搜索
  getSuppliersList(params) {
    return api.get('/base-data/suppliers', { params })
  },

  // 用户列表（物料负责人）
  getUsersList() {
    return api.get('/system/users/list')
  },

  // 物料管理
  getMaterials(params) {
    return api.get('/base-data/materials', { params })
  },

  getMaterial(id) {
    return api.get(`/base-data/materials/${id}`)
  },

  createMaterial(data) {
    return api.post('/base-data/materials', data)
  },

  updateMaterial(id, data) {
    return api.put(`/base-data/materials/${id}`, data)
  },

  deleteMaterial(id) {
    return api.delete(`/base-data/materials/${id}`)
  },

  getMaterialOptions() {
    return api.get('/base-data/materials/options')
  },

  getNextMaterialCode(params) {
    return api.get('/base-data/materials/next-code', { params })
  },

  getMaterialsByIds(ids) {
    return api.post('/base-data/materials/batch', { ids })
  },

  // BOM管理
  getBoms(params) {
    return api.get('/base-data/boms', { params })
  },

  getBom(id) {
    return api.get(`/base-data/boms/${id}`)
  },

  createBom(data) {
    return api.post('/base-data/boms', data)
  },

  updateBom(id, data) {
    return api.put(`/base-data/boms/${id}`, data)
  },

  deleteBom(id) {
    return api.delete(`/base-data/boms/${id}`)
  },

  approveBom(id) {
    return api.put(`/base-data/boms/${id}/approve`)
  },

  unapproveBom(id) {
    return api.put(`/base-data/boms/${id}/unapprove`)
  },

  // 客户管理
  getCustomers(params) {
    return api.get('/base-data/customers', { params })
  },

  getCustomer(id) {
    return api.get(`/base-data/customers/${id}`)
  },

  createCustomer(data) {
    return api.post('/base-data/customers', data)
  },

  updateCustomer(id, data) {
    return api.put(`/base-data/customers/${id}`, data)
  },

  deleteCustomer(id) {
    return api.delete(`/base-data/customers/${id}`)
  },

  // 供应商管理
  getSuppliers(params) {
    return api.get('/base-data/suppliers', { params })
  },

  getSupplier(id) {
    return api.get(`/base-data/suppliers/${id}`)
  },

  createSupplier(data) {
    return api.post('/base-data/suppliers', data)
  },

  updateSupplier(id, data) {
    return api.put(`/base-data/suppliers/${id}`, data)
  },

  deleteSupplier(id) {
    return api.delete(`/base-data/suppliers/${id}`)
  },

  // 库位管理
  getLocations(params) {
    return api.get('/base-data/locations', { params })
  },

  getLocation(id) {
    return api.get(`/base-data/locations/${id}`)
  },

  createLocation(data) {
    return api.post('/base-data/locations', data)
  },

  updateLocation(id, data) {
    return api.put(`/base-data/locations/${id}`, data)
  },

  deleteLocation(id) {
    return api.delete(`/base-data/locations/${id}`)
  },

  // 工序模板管理
  getProcessTemplates(params) {
    return api.get('/base-data/process-templates', { params })
  },

  getProcessTemplate(id) {
    return api.get(`/base-data/process-templates/${id}`)
  },

  createProcessTemplate(data) {
    return api.post('/base-data/process-templates', data)
  },

  updateProcessTemplate(id, data) {
    return api.put(`/base-data/process-templates/${id}`, data)
  },

  deleteProcessTemplate(id) {
    return api.delete(`/base-data/process-templates/${id}`)
  },

  updateProcessTemplateStatus(id, status) {
    return api.put(`/base-data/process-templates/${id}/status`, { status })
  },

  getProcessTemplateByProductId(productId) {
    return api.get(`/base-data/products/${productId}/process-template`)
  }
}
