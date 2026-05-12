import request from '@/utils/request'

/**
 * Get NCP list
 */
export function getList(params) {
  return request({
    url: '/nonconforming-products',
    method: 'get',
    params
  })
}

/**
 * Get NCP details
 */
export function getDetails(id) {
  return request({
    url: `/nonconforming-products/${id}`,
    method: 'get'
  })
}

/**
 * Get NCPs by inspection ID
 */
export function getByInspectionId(inspectionId) {
  return request({
    url: `/nonconforming-products/inspection/${inspectionId}`,
    method: 'get'
  })
}

/**
 * Create NCP
 */
export function create(data) {
  return request({
    url: '/nonconforming-products',
    method: 'post',
    data
  })
}

/**
 * Update NCP
 */
export function update(id, data) {
  return request({
    url: `/nonconforming-products/${id}`,
    method: 'put',
    data
  })
}

/**
 * Update disposition
 */
export function updateDisposition(id, data) {
  return request({
    url: `/nonconforming-products/${id}/disposition`,
    method: 'put',
    data
  })
}

/**
 * Complete handling
 */
export function completeHandling(id, data) {
  return request({
    url: `/nonconforming-products/${id}/complete`,
    method: 'put',
    data
  })
}

/**
 * Apply concession handling
 */
export function applyConcession(id, data) {
  return request({
    url: `/quality/ncp/${id}/concession/apply`,
    method: 'post',
    data
  })
}

/**
 * Approve or reject concession handling
 */
export function approveConcession(id, data) {
  return request({
    url: `/quality/ncp/${id}/concession/approve`,
    method: 'post',
    data
  })
}

/**
 * Delete NCP
 */
export function deleteNcp(id) {
  return request({
    url: `/nonconforming-products/${id}`,
    method: 'delete'
  })
}

/**
 * Get statistics
 */
export function getStatistics(params) {
  return request({
    url: '/nonconforming-products/statistics',
    method: 'get',
    params
  })
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

