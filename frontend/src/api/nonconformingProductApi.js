import { api } from '@/services/axiosInstance'

/**
 * Get NCP list
 */
export function getList(params) {
  return api.get('/quality/nonconforming-products', { params })
}

/**
 * Get NCP details
 */
export function getDetails(id) {
  return api.get(`/quality/nonconforming-products/${id}`)
}

/**
 * Get NCPs by inspection ID
 */
export function getByInspectionId(inspectionId) {
  return api.get(`/quality/nonconforming-products/inspection/${inspectionId}`)
}

/**
 * Create NCP
 */
export function create(data) {
  return api.post('/quality/nonconforming-products', data)
}

/**
 * Update NCP
 */
export function update(id, data) {
  return api.put(`/quality/nonconforming-products/${id}`, data)
}

/**
 * Update disposition
 */
export function updateDisposition(id, data) {
  return api.put(`/quality/nonconforming-products/${id}/disposition`, data)
}

/**
 * Complete handling
 */
export function completeHandling(id, data) {
  return api.put(`/quality/nonconforming-products/${id}/complete`, data)
}

/**
 * Apply concession handling
 */
export function applyConcession(id, data) {
  return api.post(`/quality/ncp/${id}/concession/apply`, data)
}

/**
 * Approve or reject concession handling
 */
export function approveConcession(id, data) {
  return api.post(`/quality/ncp/${id}/concession/approve`, data)
}

/**
 * Delete NCP
 */
export function deleteNcp(id) {
  return api.delete(`/quality/nonconforming-products/${id}`)
}

/**
 * Get statistics
 */
export function getStatistics(params) {
  return api.get('/quality/nonconforming-products/statistics', { params })
}

export default {
  getList,
  getDetails,
  getByInspectionId,
  create,
  update,
  updateDisposition,
  completeHandling,
  applyConcession,
  approveConcession,
  deleteNcp,
  getStatistics
}
