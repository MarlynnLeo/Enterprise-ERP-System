const liveEnabled =
  process.env.RUN_LIVE_WORKFLOW_UAT === '1' && /(test|uat)/i.test(String(process.env.DB_NAME || ''));
const describeLive = liveEnabled ? describe : describe.skip;
const db = liveEnabled ? require('../../src/config/db') : null;
const workflowService = liveEnabled ? require('../../src/services/business/WorkflowService') : null;

jest.setTimeout(60000);

describeLive('Workflow permission and approval closure UAT', () => {
  const created = { userIds: [], templateIds: [], instanceId: null, contractId: null };
  let previouslyActiveTemplateIds = [];

  afterAll(async () => {
    if (!db) return;
    if (created.instanceId) {
      await db.pool.query('DELETE FROM workflow_instances WHERE id = ?', [created.instanceId]);
    }
    if (created.contractId) await db.pool.query('DELETE FROM contracts WHERE id = ?', [created.contractId]);
    if (created.templateIds.length) {
      await db.pool.query('DELETE FROM workflow_templates WHERE id IN (?)', [created.templateIds]);
    }
    if (previouslyActiveTemplateIds.length) {
      await db.pool.query(
        'UPDATE workflow_templates SET is_active = 1 WHERE id IN (?) AND deleted_at IS NULL',
        [previouslyActiveTemplateIds]
      );
    }
    if (created.userIds.length) {
      await db.pool.query('DELETE FROM user_roles WHERE user_id IN (?)', [created.userIds]);
      await db.pool.query('DELETE FROM users WHERE id IN (?)', [created.userIds]);
    }
    await db.pool.end();
  });

  test('all approvers are required and business status is updated atomically', async () => {
    const prefix = `WFUAT${Date.now()}`;
    const [activeTemplates] = await db.pool.query(
      `SELECT id FROM workflow_templates
       WHERE business_type = 'contract' AND is_active = 1 AND deleted_at IS NULL`
    );
    previouslyActiveTemplateIds = activeTemplates.map((row) => Number(row.id));

    for (const suffix of ['initiator', 'approver1', 'approver2']) {
      const [result] = await db.pool.query(
        `INSERT INTO users (username, password, real_name, role, status)
         VALUES (?, 'workflow-uat-disabled-login', ?, 'user', 1)`,
        [`${prefix}_${suffix}`, `${prefix} ${suffix}`]
      );
      created.userIds.push(Number(result.insertId));
    }
    const [initiatorId, approver1Id, approver2Id] = created.userIds;
    const [[workflowRole]] = await db.pool.query(
      `SELECT r.id
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       WHERE r.status = 1 AND (r.code = 'admin' OR p.code = 'system:workflow:use')
       GROUP BY r.id, r.code
       ORDER BY CASE WHEN r.code = 'admin' THEN 1 ELSE 0 END, r.id
       LIMIT 1`
    );
    expect(workflowRole).toBeTruthy();
    await db.pool.query(
      'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, NOW()), (?, ?, NOW())',
      [approver1Id, workflowRole.id, approver2Id, workflowRole.id]
    );

    const template = await workflowService.createTemplate({
      code: prefix,
      name: `${prefix} contract approval`,
      business_type: 'contract',
      is_active: 1,
      nodes: [{
        node_name: 'Joint approval',
        node_type: 'approval',
        sequence: 1,
        approver_type: 'user',
        approver_ids: [approver1Id, approver2Id],
        multi_approve_type: 'all',
        allow_self_approval: false,
      }],
    }, initiatorId);
    created.templateIds.push(Number(template.id));

    const [contractResult] = await db.pool.query(
      `INSERT INTO contracts
       (code, name, type, status, party_a, party_b, total_amount, created_by)
       VALUES (?, ?, 'service', 'pending_approval', 'UAT Party A', 'UAT Party B', 100, ?)`,
      [`${prefix}-CONTRACT`, `${prefix} Contract`, initiatorId]
    );
    created.contractId = Number(contractResult.insertId);

    const started = await workflowService.startWorkflow({
      business_type: 'contract',
      business_id: created.contractId,
      business_code: `${prefix}-CONTRACT`,
      title: `${prefix} Contract approval`,
      initiator_id: initiatorId,
    });
    created.instanceId = Number(started.instance_id);

    await expect(workflowService.startWorkflow({
      business_type: 'contract',
      business_id: created.contractId,
      business_code: `${prefix}-CONTRACT`,
      title: 'Duplicate',
      initiator_id: initiatorId,
    })).rejects.toThrow();

    let instance = await workflowService.getInstanceById(created.instanceId);
    const nodeId = Number(instance.current_node_id);
    expect(instance.nodes.find((node) => Number(node.id) === nodeId).approvers).toHaveLength(2);

    instance = await workflowService.handleApproval({
      instance_id: created.instanceId,
      node_id: nodeId,
      action: 'approve',
      comment: 'first approval',
      approver_id: approver1Id,
    });
    expect(instance.status).toBe('in_progress');
    let [[contract]] = await db.pool.query(
      'SELECT status, workflow_status, workflow_instance_id FROM contracts WHERE id = ?',
      [created.contractId]
    );
    expect(contract.status).toBe('pending_approval');
    expect(contract.workflow_status).toBe('in_progress');

    instance = await workflowService.handleApproval({
      instance_id: created.instanceId,
      node_id: nodeId,
      action: 'approve',
      comment: 'second approval',
      approver_id: approver2Id,
    });
    expect(instance.status).toBe('approved');
    [[contract]] = await db.pool.query(
      'SELECT status, workflow_status, workflow_instance_id FROM contracts WHERE id = ?',
      [created.contractId]
    );
    expect(contract.status).toBe('active');
    expect(contract.workflow_status).toBe('approved');
    expect(Number(contract.workflow_instance_id)).toBe(created.instanceId);

    const [[{ action_count: actionCount }]] = await db.pool.query(
      'SELECT COUNT(*) AS action_count FROM workflow_action_logs WHERE instance_id = ?',
      [created.instanceId]
    );
    expect(Number(actionCount)).toBeGreaterThanOrEqual(5);

    const nextTemplate = await workflowService.updateTemplate(template.id, {
      name: `${prefix} contract approval v2`,
      business_type: 'contract',
      is_active: 1,
      nodes: [{
        node_name: 'Sequential approval',
        node_type: 'approval',
        sequence: 1,
        approver_type: 'user',
        approver_ids: [approver1Id, approver2Id],
        multi_approve_type: 'sequential',
      }],
    }, initiatorId);
    created.templateIds.push(Number(nextTemplate.id));
    expect(Number(nextTemplate.id)).not.toBe(Number(template.id));
    const [[{ old_node_count: oldNodeCount }]] = await db.pool.query(
      'SELECT COUNT(*) AS old_node_count FROM workflow_template_nodes WHERE template_id = ?',
      [template.id]
    );
    expect(Number(oldNodeCount)).toBe(1);
  });
});
