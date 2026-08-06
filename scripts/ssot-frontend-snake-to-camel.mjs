/**
 * Bulk-rewrite frontend/mobile property reads from snake_case to camelCase
 * for common API fields. Skips node_modules, api request builders carefully.
 *
 * Safe transforms:
 *   .material_id  -> .materialId
 *   prop="material_id" -> prop="materialId"
 *   field: 'material_id' -> field: 'materialId'
 *
 * Does NOT rewrite bare object keys in { material_id: x } submit payloads
 * unless they are clearly display-only (prop= / field:).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PAIRS = [
  ['material_id', 'materialId'],
  ['material_code', 'materialCode'],
  ['material_name', 'materialName'],
  ['location_id', 'locationId'],
  ['location_name', 'locationName'],
  ['category_id', 'categoryId'],
  ['category_name', 'categoryName'],
  ['unit_id', 'unitId'],
  ['unit_name', 'unitName'],
  ['product_id', 'productId'],
  ['product_code', 'productCode'],
  ['product_name', 'productName'],
  ['supplier_id', 'supplierId'],
  ['supplier_name', 'supplierName'],
  ['customer_id', 'customerId'],
  ['customer_name', 'customerName'],
  ['order_no', 'orderNo'],
  ['order_id', 'orderId'],
  ['order_number', 'orderNumber'],
  ['batch_no', 'batchNo'],
  ['batch_number', 'batchNumber'],
  ['created_at', 'createdAt'],
  ['updated_at', 'updatedAt'],
  ['real_name', 'realName'],
  ['department_id', 'departmentId'],
  ['department_name', 'departmentName'],
  ['employee_id', 'employeeId'],
  ['employee_no', 'employeeNo'],
  ['inspection_no', 'inspectionNo'],
  ['process_id', 'processId'],
  ['process_name', 'processName'],
  ['task_id', 'taskId'],
  ['plan_id', 'planId'],
  ['warehouse_id', 'warehouseId'],
  ['receipt_no', 'receiptNo'],
  ['outbound_no', 'outboundNo'],
  ['return_no', 'returnNo'],
  ['requisition_no', 'requisitionNo'],
  ['invoice_no', 'invoiceNo'],
  ['expense_number', 'expenseNumber'],
  ['bank_account_id', 'bankAccountId'],
  ['cost_center_id', 'costCenterId'],
  ['parent_id', 'parentId'],
  ['manager_id', 'managerId'],
  ['is_active', 'isActive'],
  ['is_read', 'isRead'],
  ['min_stock', 'minStock'],
  ['max_stock', 'maxStock'],
  ['unit_price', 'unitPrice'],
  ['total_amount', 'totalAmount'],
  ['planned_date', 'plannedDate'],
  ['actual_date', 'actualDate'],
  ['start_date', 'startDate'],
  ['end_date', 'endDate'],
  ['due_date', 'dueDate'],
  ['qualified_quantity', 'qualifiedQuantity'],
  ['unqualified_quantity', 'unqualifiedQuantity'],
  ['available_quantity', 'availableQuantity'],
  ['reference_no', 'referenceNo'],
  ['reference_id', 'referenceId'],
  ['document_no', 'documentNo'],
  ['transaction_type', 'transactionType'],
  ['operator_name', 'operatorName'],
  ['inspector_name', 'inspectorName'],
  ['approver_id', 'approverId'],
  ['approver_name', 'approverName'],
  ['business_type', 'businessType'],
  ['business_id', 'businessId'],
  ['business_code', 'businessCode'],
  ['instance_id', 'instanceId'],
  ['node_id', 'nodeId'],
  ['node_name', 'nodeName'],
  ['ncp_no', 'ncpNo'],
  ['scrap_no', 'scrapNo'],
  ['rework_no', 'reworkNo'],
  ['gauge_no', 'gaugeNo'],
  ['first_article_qty', 'firstArticleQty'],
  ['author_name', 'authorName'],
  ['acted_at', 'actedAt'],
  ['check_no', 'checkNo'],
  ['source_id', 'sourceId'],
  ['source_type', 'sourceType'],
  ['period_key', 'periodKey'],
  ['current_value', 'currentValue'],
  ['sort_order', 'sortOrder'],
  ['group_code', 'groupCode'],
  ['tag_type', 'tagType'],
  ['is_system', 'isSystem'],
  ['data_scope', 'dataScope'],
  ['avatar_frame', 'avatarFrame'],
  ['role_name', 'roleName'],
  ['role_names', 'roleNames'],
  ['check_interval_minutes', 'checkIntervalMinutes'],
  ['condition_params', 'conditionParams'],
  ['notify_roles', 'notifyRoles'],
  ['notify_users', 'notifyUsers'],
  ['last_checked_at', 'lastCheckedAt'],
  ['date_format', 'dateFormat'],
  ['sequence_length', 'sequenceLength'],
  ['reset_cycle', 'resetCycle'],
  ['initial_value', 'initialValue'],
  ['event_type', 'eventType'],
  ['recipient_type', 'recipientType'],
  ['recipient_config', 'recipientConfig'],
  ['title_template', 'titleTemplate'],
  ['content_template', 'contentTemplate'],
  ['link_template', 'linkTemplate'],
  ['default_title', 'defaultTitle'],
  ['default_content', 'defaultContent'],
  ['default_link', 'defaultLink'],
  ['multi_approve_type', 'multiApproveType'],
  ['allow_self_approval', 'allowSelfApproval'],
  ['approver_type', 'approverType'],
  ['approver_ids', 'approverIds'],
  ['node_type', 'nodeType'],
  ['initiator_name', 'initiatorName'],
  ['is_pinned', 'isPinned'],
  ['view_count', 'viewCount'],
  ['like_count', 'likeCount'],
  ['favorite_count', 'favoriteCount'],
  ['published_at', 'publishedAt'],
  ['recipient_count', 'recipientCount'],
  ['read_count', 'readCount'],
  ['defect_description', 'defectDescription'],
  ['defect_type', 'defectType'],
  ['defect_quantity', 'defectQuantity'],
  ['scrap_cost', 'scrapCost'],
  ['scrap_date', 'scrapDate'],
  ['rework_cost', 'reworkCost'],
  ['rework_instructions', 'reworkInstructions'],
  ['ncp_id', 'ncpId'],
  ['ncp_status', 'ncpStatus'],
  ['has_ncp', 'hasNcp'],
  ['has_rework', 'hasRework'],
  ['rework_status', 'reworkStatus'],
  ['rework_completed', 'reworkCompleted'],
  ['allow_reinspection', 'allowReinspection'],
  ['days_until_due', 'daysUntilDue'],
  ['next_calibration_date', 'nextCalibrationDate'],
  ['calibration_cycle_days', 'calibrationCycleDays'],
  ['last_calibration_date', 'lastCalibrationDate'],
  ['gauge_name', 'gaugeName'],
  ['gauge_type', 'gaugeType'],
  ['measurement_range', 'measurementRange'],
  ['aql_level', 'aqlLevel'],
  ['batch_min', 'batchMin'],
  ['batch_max', 'batchMax'],
  ['sample_size', 'sampleSize'],
  ['accept_limit', 'acceptLimit'],
  ['reject_limit', 'rejectLimit'],
  ['stock_status', 'stockStatus'],
  ['min_quantity', 'minQuantity'],
  ['max_quantity', 'maxQuantity'],
  ['sort_field', 'sortField'],
  ['sort_order', 'sortOrder'],
  ['page_size', 'pageSize'],
  ['show_all', 'showAll'],
  ['before_quantity', 'beforeQuantity'],
  ['after_quantity', 'afterQuantity'],
  ['reference_type', 'referenceType'],
  ['source_table', 'sourceTable'],
  ['cost_price', 'costPrice'],
  ['safety_stock', 'safetyStock'],
  ['tax_rate', 'taxRate'],
  ['drawing_no', 'drawingNo'],
  ['color_code', 'colorCode'],
  ['material_type', 'materialType'],
  ['material_source_id', 'materialSourceId'],
  ['material_source_name', 'materialSourceName'],
  ['inspection_method_id', 'inspectionMethodId'],
  ['inspection_method_name', 'inspectionMethodName'],
  ['production_group_id', 'productionGroupId'],
  ['product_category_id', 'productCategoryId'],
  ['product_category_name', 'productCategoryName'],
  ['location_detail', 'locationDetail'],
  ['manager_name', 'managerName'],
  ['full_inspection_threshold', 'fullInspectionThreshold'],
  ['is_mandatory', 'isMandatory'],
  ['is_default', 'isDefault'],
  ['is_full_inspection', 'isFullInspection'],
  ['first_article_result', 'firstArticleResult'],
  ['production_can_continue', 'productionCanContinue'],
  ['punch_interval', 'punchInterval'],
  ['sample_rate', 'sampleRate'],
  ['inspection_interval', 'inspectionInterval'],
  ['template_id', 'templateId'],
  ['template_name', 'templateName'],
  ['punch_id', 'punchId'],
  ['punch_time', 'punchTime'],
  ['today_count', 'todayCount'],
  ['production_line_id', 'productionLineId'],
  ['production_line_name', 'productionLineName'],
  ['inspector_id', 'inspectorId'],
  ['plan_no', 'planNo'],
  ['plan_name', 'planName'],
  ['subgroup_no', 'subgroupNo'],
  ['subgroup_size', 'subgroupSize'],
  ['chart_type', 'chartType'],
  ['target_value', 'targetValue'],
  ['measured_value', 'measuredValue'],
  ['measured_by', 'measuredBy'],
  ['data_count', 'dataCount'],
  ['subgroup_count', 'subgroupCount'],
  ['total_samples', 'totalSamples'],
  ['received_quantity', 'receivedQuantity'],
  ['expected_date', 'expectedDate'],
  ['replacement_no', 'replacementNo'],
  ['ip_address', 'ipAddress'],
  ['entity_type', 'entityType'],
  ['entity_id', 'entityId'],
  ['user_id', 'userId'],
  ['token_version', 'tokenVersion'],
  ['last_message_at', 'lastMessageAt'],
  ['last_message_preview', 'lastMessagePreview'],
  ['unread_count', 'unreadCount'],
  ['display_name', 'displayName'],
  ['display_avatar', 'displayAvatar'],
  ['other_online', 'otherOnline'],
  ['sender_id', 'senderId'],
  ['sender_name', 'senderName'],
  ['sender_real_name', 'senderRealName'],
  ['sender_avatar', 'senderAvatar'],
  ['conversation_id', 'conversationId'],
  ['file_url', 'fileUrl'],
  ['file_name', 'fileName'],
];

// Longer snake first to avoid partial replace
PAIRS.sort((a, b) => b[0].length - a[0].length);

const SCAN = [
  'frontend/src/views',
  'frontend/src/components',
  'frontend/src/stores',
  'frontend/src/utils',
  'mobile/src/views',
  'mobile/src/stores',
  'mobile/src/utils',
];

const EXT = new Set(['.vue', '.js', '.ts']);
const SKIP = new Set(['node_modules', 'dist']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (EXT.has(path.extname(name))) files.push(full);
  }
  return files;
}

function transform(content) {
  let s = content;
  let count = 0;
  for (const [snake, camel] of PAIRS) {
    // .snake_field -> .camelField (property access)
    const dotRe = new RegExp(`\\.${snake}\\b`, 'g');
    const d1 = (s.match(dotRe) || []).length;
    s = s.replace(dotRe, `.${camel}`);
    count += d1;

    // prop="snake" / prop='snake'
    const propRe = new RegExp(`prop=(["'])${snake}\\1`, 'g');
    const d2 = (s.match(propRe) || []).length;
    s = s.replace(propRe, `prop=$1${camel}$1`);
    count += d2;

    // field: 'snake' or field: "snake" (mobile RecordDetail configs)
    const fieldRe = new RegExp(`(field:\\s*)(['"])${snake}\\2`, 'g');
    const d3 = (s.match(fieldRe) || []).length;
    s = s.replace(fieldRe, `$1$2${camel}$2`);
    count += d3;

    // optional chaining ?.snake
    const optRe = new RegExp(`\\?\\.${snake}\\b`, 'g');
    const d4 = (s.match(optRe) || []).length;
    s = s.replace(optRe, `?.${camel}`);
    count += d4;
  }
  return { s, count };
}

let filesChanged = 0;
let totalReplacements = 0;

for (const d of SCAN) {
  for (const file of walk(path.join(root, d))) {
    const before = fs.readFileSync(file, 'utf8');
    const { s, count } = transform(before);
    if (count > 0 && s !== before) {
      fs.writeFileSync(file, s);
      filesChanged++;
      totalReplacements += count;
      console.log(`OK ${path.relative(root, file)} x${count}`);
    }
  }
}

console.log(`\nDone: files=${filesChanged} replacements=${totalReplacements}`);
