/**
 * Shared runtime deps for WorkflowService mixins.
 */

const { pool } = require('../../../config/db');
const { logger } = require('../../../utils/logger');
const { softDelete } = require('../../../utils/softDelete');
const { parsePagination, appendPaginationSQL } = require('../../../utils/safePagination');
const PermissionService = require('../../PermissionService');

const BUSINESS_STATUS_MAP = {
  purchase_order: {
    table: 'purchase_orders',
    ownerColumn: 'created_by',
    approved: 'approved',
    rejected: 'draft',
    withdrawn: 'draft',
    pendingStatuses: ['pending'],
    extra: '',
  },
  purchase_requisition: {
    table: 'purchase_requisitions',
    ownerColumn: 'created_by',
    approved: 'approved',
    rejected: 'draft',
    withdrawn: 'draft',
    pendingStatuses: ['submitted'],
    extra: '',
  },
  contract: {
    table: 'contracts',
    ownerColumn: 'created_by',
    approved: 'active',
    rejected: 'draft',
    withdrawn: 'draft',
    pendingStatuses: ['pending_approval'],
    extra: '',
  },
  ecn: {
    table: 'ecn_orders',
    ownerColumn: 'requested_by',
    approved: 'approved',
    rejected: 'rejected',
    withdrawn: 'draft',
    pendingStatuses: ['pending_approval'],
    extra: ', approved_by = ?, approved_at = NOW()',
  },
  hr_leave: {
    table: 'hr_leave_requests',
    ownerColumn: 'applicant_user_id',
    approved: 'approved',
    rejected: 'rejected',
    withdrawn: 'withdrawn',
    pendingStatuses: ['pending'],
    hasDeletedAt: false,
    extra: '',
  },
  hr_overtime: {
    table: 'hr_overtime_requests',
    ownerColumn: 'applicant_user_id',
    approved: 'approved',
    rejected: 'rejected',
    withdrawn: 'withdrawn',
    pendingStatuses: ['pending'],
    hasDeletedAt: false,
    extra: '',
  },
};

module.exports = {
  pool,
  logger,
  softDelete,
  parsePagination,
  appendPaginationSQL,
  PermissionService,
  BUSINESS_STATUS_MAP,
};
