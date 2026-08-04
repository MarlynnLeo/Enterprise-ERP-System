const { pool } = require('../src/config/db');
const WorkflowService = require('../src/services/business/WorkflowService');

const rules = [
  {
    name: 'permission.menu_binding_matches_registry',
    sql: `SELECT COUNT(*) AS findings
          FROM menus m LEFT JOIN permissions p ON p.id = m.permission_id
          WHERE m.permission IS NOT NULL AND m.permission <> ''
            AND (m.permission_id IS NULL OR BINARY p.code <> BINARY m.permission OR p.status <> 1)`,
  },
  {
    name: 'permission.role_menu_grants_have_runtime_permission',
    sql: `SELECT COUNT(*) AS findings
          FROM role_menus rm
          JOIN menus m ON m.id = rm.menu_id AND m.permission_id IS NOT NULL
          LEFT JOIN role_permissions rp
            ON rp.role_id = rm.role_id AND rp.permission_id = m.permission_id
          WHERE rp.role_id IS NULL`,
  },
  {
    name: 'workflow.single_active_template_per_business_type',
    sql: `SELECT COUNT(*) AS findings FROM (
            SELECT business_type FROM workflow_templates
            WHERE is_active = 1 AND deleted_at IS NULL
            GROUP BY business_type HAVING COUNT(*) > 1
          ) x`,
  },
  {
    name: 'workflow.single_active_instance_per_document',
    sql: `SELECT COUNT(*) AS findings FROM (
            SELECT business_type, business_id FROM workflow_instances
            WHERE status IN ('pending','in_progress') AND deleted_at IS NULL
            GROUP BY business_type, business_id HAVING COUNT(*) > 1
          ) x`,
  },
  {
    name: 'workflow.active_nodes_have_pending_approver',
    sql: `SELECT COUNT(*) AS findings
          FROM workflow_instance_nodes win
          JOIN workflow_instances wi ON wi.id = win.instance_id
          WHERE win.status = 'in_progress' AND wi.status IN ('pending','in_progress')
            AND NOT EXISTS (
              SELECT 1 FROM workflow_node_approvers wna
              WHERE wna.instance_node_id = win.id AND wna.status = 'pending'
            )`,
  },
  {
    name: 'workflow.terminal_instances_have_no_active_nodes',
    sql: `SELECT COUNT(*) AS findings
          FROM workflow_instances wi JOIN workflow_instance_nodes win ON win.instance_id = wi.id
          WHERE wi.status IN ('approved','rejected','cancelled','withdrawn')
            AND win.status IN ('pending','in_progress')`,
  },
  {
    name: 'workflow.assignments_have_approval_permission',
    sql: `SELECT COUNT(*) AS findings
          FROM workflow_node_approvers wna
          JOIN users u ON u.id = wna.approver_id
          WHERE wna.status IN ('pending','waiting')
            AND u.role <> 'admin'
            AND NOT EXISTS (
              SELECT 1 FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id AND r.status = 1
              LEFT JOIN role_permissions rp ON rp.role_id = r.id
              LEFT JOIN permissions p ON p.id = rp.permission_id AND p.status = 1
              WHERE ur.user_id = u.id
                AND (r.is_super_admin = 1 OR p.code IN ('*','system:workflow:*','system:workflow:use'))
            )`,
  },
];

async function main() {
  const findings = [];
  console.log('Permission and workflow closure audit');
  for (const rule of rules) {
    const [[row]] = await pool.query(rule.sql);
    const count = Number(row.findings || 0);
    console.log(`${rule.name}: ${count}`);
    if (count) findings.push({ rule: rule.name, count });
  }

  const supportedTypes = Object.keys(WorkflowService.BUSINESS_STATUS_MAP);
  const [activeTemplates] = await pool.query(
    `SELECT business_type FROM workflow_templates
     WHERE is_active = 1 AND deleted_at IS NULL`
  );
  const activeTypes = new Set(activeTemplates.map((row) => row.business_type));
  const missingTypes = supportedTypes.filter((type) => !activeTypes.has(type));
  console.log(`workflow.supported_types_have_active_template: ${missingTypes.length}`);
  if (missingTypes.length) {
    findings.push({
      rule: 'workflow.supported_types_have_active_template',
      count: missingTypes.length,
      businessTypes: missingTypes,
    });
  }

  for (const [businessType, cfg] of Object.entries(WorkflowService.BUSINESS_STATUS_MAP)) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS findings
       FROM \`${cfg.table}\` b
       JOIN workflow_instances wi ON wi.id = b.workflow_instance_id
       WHERE wi.business_type = ? AND wi.business_id = b.id
         AND BINARY COALESCE(b.workflow_status, '') <> BINARY wi.status`,
      [businessType]
    );
    const count = Number(row.findings || 0);
    console.log(`workflow.${businessType}_link_status_matches: ${count}`);
    if (count) findings.push({ rule: `workflow.${businessType}_link_status_matches`, count });

    const [[activeRow]] = await pool.query(
      `SELECT COUNT(*) AS findings
       FROM \`${cfg.table}\` b
       JOIN workflow_instances wi ON wi.id = b.workflow_instance_id
       WHERE wi.business_type = ? AND wi.business_id = b.id
         AND wi.status IN ('pending','in_progress')
         AND b.status NOT IN (?)`,
      [businessType, cfg.pendingStatuses]
    );
    const activeCount = Number(activeRow.findings || 0);
    console.log(`workflow.${businessType}_active_business_is_pending: ${activeCount}`);
    if (activeCount) {
      findings.push({ rule: `workflow.${businessType}_active_business_is_pending`, count: activeCount });
    }
  }

  if (findings.length) {
    console.error(JSON.stringify(findings, null, 2));
    process.exitCode = 1;
  } else {
    console.log('Result: OK');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
