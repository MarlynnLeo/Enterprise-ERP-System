require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const systemModel = require('../src/models/system');
const BackupService = require('../src/services/system/BackupService');
const technicalCommunicationController = require('../src/controllers/system/technicalCommunicationController');
const businessTypeController = require('../src/controllers/system/businessTypeController');
const notificationController = require('../src/controllers/system/notificationController');
const { codingRules, documents, alerts } = require('../src/controllers/business/enhancedModulesController');
const CodeGeneratorService = require('../src/services/business/CodeGeneratorService');
const systemRoutes = require('../src/routes/system');

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const results = [];
const cleanup = {
  userIds: [],
  departmentIds: [],
  roleIds: [],
  menuIds: [],
  businessTypeIds: [],
  communicationIds: [],
  notificationIds: [],
  documentIds: [],
  codingRuleIds: [],
  codingBusinessTypes: [],
  backupFilenames: [],
};

function assert(condition, message, details = undefined) {
  if (!condition) {
    const error = new Error(message);
    if (details !== undefined) error.details = details;
    throw error;
  }
}

function mark(name, data = undefined) {
  results.push({ name, data });
  console.log(`PASS ${name}${data ? ` ${JSON.stringify(data)}` : ''}`);
}

async function queryOne(sql, params = []) {
  const [rows] = await db.pool.execute(sql, params);
  return rows[0] || null;
}

async function expectReject(fn, messageIncludes, name) {
  try {
    await fn();
  } catch (error) {
    assert(
      !messageIncludes || error.message.includes(messageIncludes),
      `${name} rejected with unexpected message`,
      { actual: error.message, expected: messageIncludes }
    );
    mark(name);
    return;
  }
  throw new Error(`${name} should have rejected`);
}

function createMockRes() {
  let resolveResponse;
  const promise = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      resolveResponse({ statusCode: this.statusCode, payload });
    },
    download(filePath, filename) {
      resolveResponse({ statusCode: this.statusCode, payload: { filePath, filename } });
    },
  };

  return { promise, res };
}

async function callController(handler, req) {
  const { promise, res } = createMockRes();
  await handler(req, res);
  return promise;
}

async function ensureAdminContext() {
  const user = await queryOne(
    "SELECT id, username FROM users WHERE status = 1 ORDER BY CASE WHEN username = 'admin' THEN 0 ELSE 1 END, id LIMIT 1"
  );
  assert(user?.id, 'missing active user for system verification');

  const role = await queryOne(
    "SELECT id FROM roles WHERE code = 'admin' OR id = 1 ORDER BY CASE WHEN code = 'admin' THEN 0 ELSE 1 END, id LIMIT 1"
  );
  assert(role?.id, 'missing admin role for system verification');
  return { user, roleId: role.id };
}

async function verifyUsers(adminRoleId, departmentId) {
  const username = `sys_verify_${stamp}`;
  const user = await systemModel.createUser({
    username,
    password: `SysVerify#${stamp}aA1!`,
    real_name: 'System Verify User',
    email: `${username}@example.test`,
    department_id: departmentId,
    roleIds: [adminRoleId],
  });
  cleanup.userIds.push(user.id);

  assert(!Object.prototype.hasOwnProperty.call(user, 'password'), 'createUser leaked password');
  const detail = await systemModel.getUserById(user.id);
  assert(!Object.prototype.hasOwnProperty.call(detail, 'password'), 'getUserById leaked password');

  const list = await systemModel.getAllUsers(1, 20, { username });
  assert(list.list.length === 1, 'created user missing from user list');
  assert(!Object.prototype.hasOwnProperty.call(list.list[0], 'password'), 'getAllUsers leaked password');

  await expectReject(
    () => systemModel.resetUserPassword(user.id, '123456'),
    '密码不符合安全要求',
    'weak password reset rejected'
  );
  await systemModel.resetUserPassword(user.id, `SysVerifyReset#${stamp}bB2!`);
  await systemModel.updateUserStatus(user.id, 0);
  await systemModel.updateUserStatus(user.id, 1);
  mark('user management sensitive-field and password flow closed', { userId: user.id });
  return user.id;
}

async function verifyDepartments() {
  const parent = await systemModel.createDepartment({
    name: `验证父部门${stamp}`,
    code: `VERIFY_PARENT_${stamp}`,
    status: 1,
  });
  const child = await systemModel.createDepartment({
    name: `验证子部门${stamp}`,
    code: `VERIFY_CHILD_${stamp}`,
    parent_id: parent.id,
    status: 1,
  });
  cleanup.departmentIds.push(child.id, parent.id);

  await expectReject(
    () => systemModel.updateDepartment(parent.id, {
      name: parent.name,
      code: parent.code,
      parent_id: child.id,
      status: 1,
    }),
    '部门不能挂到自己的下级部门下面',
    'department hierarchy cycle rejected'
  );
  await expectReject(
    () => systemModel.deleteDepartment(parent.id),
    'BLOCK_DELETE',
    'department delete blocked while child exists'
  );

  mark('department hierarchy and delete guards closed', { parentId: parent.id, childId: child.id });
}

async function createDepartmentForUser() {
  const department = await systemModel.createDepartment({
    name: `验证通讯部门${stamp}`,
    code: `VERIFY_COMM_${stamp}`,
    status: 1,
  });
  cleanup.departmentIds.push(department.id);
  return department.id;
}

async function verifyRoles() {
  const roleA = await systemModel.createRole({
    name: `验证角色A${stamp}`,
    code: `verify_role_a_${stamp}`,
    description: 'system verification',
    status: 1,
  });
  const roleB = await systemModel.createRole({
    name: `验证角色B${stamp}`,
    code: `verify_role_b_${stamp}`,
    description: 'system verification',
    status: 1,
  });
  cleanup.roleIds.push(roleA.id, roleB.id);

  await expectReject(
    () => systemModel.createRole({
      name: roleA.name,
      code: `verify_role_dup_${stamp}`,
      description: 'duplicate',
      status: 1,
    }),
    '角色名称已存在',
    'role duplicate create rejected'
  );
  await expectReject(
    () => systemModel.updateRole(roleB.id, {
      name: roleB.name,
      code: roleA.code,
      description: roleB.description,
      status: 1,
    }),
    '角色编码已存在',
    'role duplicate update rejected'
  );
  await systemModel.updateRoleStatus(roleB.id, 0);
  await systemModel.updateRoleStatus(roleB.id, 1);
  mark('role uniqueness and status flow closed');
}

async function verifyMenus() {
  const parent = await systemModel.createMenu({
    parentId: 0,
    name: `验证菜单${stamp}`,
    path: `/verify-system-${stamp}`,
    component: 'system/Verify',
    permission: `verify:system:${stamp}`,
    type: 1,
    sort: 901,
    status: 1,
  });
  const child = await systemModel.createMenu({
    parentId: parent.id,
    name: `验证按钮${stamp}`,
    path: '',
    permission: `verify:system:${stamp}:button`,
    type: 2,
    sort: 1,
    status: 1,
  });
  cleanup.menuIds.push(child.id, parent.id);

  const childRow = await queryOne('SELECT parent_id FROM menus WHERE id = ?', [child.id]);
  assert(Number(childRow.parent_id) === Number(parent.id), 'menu parentId was not persisted');

  await expectReject(
    () => systemModel.updateMenu(parent.id, {
      ...parent,
      parentId: child.id,
      sort: parent.sort_order || 901,
    }),
    '菜单不能挂到自己的子菜单下面',
    'menu hierarchy cycle rejected'
  );
  await systemModel.updateMenuStatus(parent.id, 0);
  await systemModel.updateMenuStatus(parent.id, 1);
  await expectReject(
    () => systemModel.deleteMenu(parent.id),
    '子菜单',
    'menu delete blocked while child exists'
  );
  mark('menu parent/status/delete flow closed', { parentId: parent.id, childId: child.id });
}

async function verifyBusinessTypes(adminUser) {
  const code = `verify_bt_${stamp}`;
  const create = await callController(businessTypeController.createBusinessType, {
    user: adminUser,
    body: {
      group_code: `verify_group_${stamp}`,
      code,
      name: `验证业务类型${stamp}`,
      status: 1,
    },
  });
  assert(create.statusCode === 201 && create.payload.success, 'business type create failed', create);
  const businessTypeId = create.payload.data.id;
  cleanup.businessTypeIds.push(businessTypeId);

  const update = await callController(businessTypeController.updateBusinessType, {
    user: adminUser,
    params: { id: businessTypeId },
    body: { status: 0, name: `验证业务类型更新${stamp}` },
  });
  assert(update.statusCode === 200 && update.payload.success, 'business type update failed', update);

  const routePaths = systemRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));
  const sortIndex = routePaths.findIndex((route) => route.path === '/business-types/sort' && route.methods.includes('put'));
  const idIndex = routePaths.findIndex((route) => route.path === '/business-types/:id' && route.methods.includes('put'));
  assert(sortIndex >= 0 && idIndex >= 0 && sortIndex < idIndex, 'business type sort route is after :id route');

  mark('business type create/update/sort route flow closed', { businessTypeId });
}

async function verifyTechnicalCommunication(adminUser, departmentId, recipientUserId) {
  const response = await callController(technicalCommunicationController.createCommunication, {
    user: {
      id: adminUser.id,
      username: adminUser.username,
      real_name: adminUser.username,
    },
    body: {
      title: `验证私有通讯${stamp}`,
      category: 'announcement',
      summary: 'private department notification verification',
      content: '<p>system verification</p>',
      status: 'published',
      visibility: 'private',
      departmentRecipients: [departmentId],
      recipients: [],
    },
  });
  assert(response.statusCode === 200 && response.payload.success, 'technical communication create failed', response);
  const communicationId = response.payload.data.id;
  cleanup.communicationIds.push(communicationId);

  const [notifications] = await db.pool.execute(
    `SELECT user_id FROM notifications
     WHERE source_type = 'technical_communication' AND source_id = ?`,
    [communicationId]
  );
  assert(notifications.length === 1, 'private technical communication notified unexpected users', notifications);
  assert(Number(notifications[0].user_id) === Number(recipientUserId), 'private technical communication missed department recipient');
  mark('private technical communication notification chain closed', { communicationId });
}

async function verifyBackup(adminUser) {
  const backup = await BackupService.createBackup(adminUser.id);
  cleanup.backupFilenames.push(backup.filename);
  assert(backup.filename && backup.file_size > 0 && backup.checksum, 'backup did not produce a real file', backup);

  const file = await BackupService.getBackupFile(backup.filename);
  assert(fs.existsSync(file.file_path), 'backup file missing on disk', file);
  const backups = await BackupService.listBackups();
  assert(backups.some((item) => item.filename === backup.filename), 'backup missing from list');
  mark('real backup create/list/download path closed', { filename: backup.filename, size: backup.file_size });
}

async function verifyNotifications(adminUser) {
  const create = await callController(notificationController.createNotification, {
    user: adminUser,
    body: {
      userId: adminUser.id,
      type: 'system',
      title: `System verify notification ${stamp}`,
      content: 'system notification verification',
      priority: 1,
      sourceType: 'system_verify',
      sourceId: Number(stamp.slice(-8)),
    },
  });
  assert(create.statusCode === 200 && create.payload.success, 'notification create failed', create);
  const notificationId = create.payload.data.id;
  cleanup.notificationIds.push(notificationId);

  const list = await callController(notificationController.getNotifications, {
    user: adminUser,
    query: { type: 'system', page: '0', pageSize: '10000' },
  });
  assert(list.statusCode === 200 && list.payload.success, 'notification list failed', list);
  assert(list.payload.data.page === 1 && list.payload.data.pageSize === 100, 'notification pagination was not normalized', list.payload.data);

  const markRead = await callController(notificationController.markAsRead, {
    user: adminUser,
    params: { id: notificationId },
  });
  assert(markRead.statusCode === 200 && markRead.payload.success, 'notification mark-read failed', markRead);

  const remove = await callController(notificationController.deleteNotification, {
    user: adminUser,
    params: { id: notificationId },
  });
  assert(remove.statusCode === 200 && remove.payload.success, 'notification delete failed', remove);
  mark('notification create/list/read/delete flow closed', { notificationId });
}

async function verifyCodingRules() {
  const businessType = `verify_code_${stamp}`;
  const create = await callController(codingRules.create, {
    body: {
      business_type: businessType,
      name: `System Verify Code ${stamp}`,
      prefix: 'VC',
      date_format: '',
      separator: '-',
      sequence_length: 4,
      reset_cycle: 'none',
      initial_value: 1,
      step: 1,
      is_active: 1,
    },
  });
  assert(create.statusCode === 200 && create.payload.success, 'coding rule create failed', create);
  const ruleId = create.payload.data.id;
  cleanup.codingRuleIds.push(ruleId);
  cleanup.codingBusinessTypes.push(businessType);

  const generatedCode = await CodeGeneratorService.nextCode(businessType);
  assert(generatedCode === 'VC-0001', 'coding rule did not generate expected code', generatedCode);

  const sequences = await callController(codingRules.getSequences, {
    params: { type: businessType },
  });
  assert(sequences.statusCode === 200 && sequences.payload.success && sequences.payload.data.length === 1, 'coding sequences were not created', sequences);

  const reset = await callController(codingRules.resetSequence, {
    body: { business_type: businessType },
  });
  assert(reset.statusCode === 200 && reset.payload.success, 'coding sequence reset failed', reset);

  const afterReset = await callController(codingRules.getSequences, {
    params: { type: businessType },
  });
  assert(afterReset.statusCode === 200 && afterReset.payload.success && afterReset.payload.data.length === 0, 'coding sequences were not reset', afterReset);

  const remove = await callController(codingRules.deleteRule, {
    params: { id: ruleId },
  });
  assert(remove.statusCode === 200 && remove.payload.success, 'coding rule delete failed', remove);
  mark('coding rule create/generate/sequence/reset/delete flow closed', { ruleId, businessType });
}

async function verifyDocuments(adminUser) {
  const create = await callController(documents.create, {
    user: adminUser,
    body: {
      name: `System Verify Document ${stamp}`,
      category: 'other',
      file_url: `/uploads/system-verify-${stamp}.txt`,
      file_name: `system-verify-${stamp}.txt`,
      file_size: 12,
      file_type: 'text/plain',
      version: '1.0',
      description: 'system verification',
    },
  });
  assert(create.statusCode === 200 && create.payload.success, 'document create failed', create);
  const documentId = create.payload.data.id;
  cleanup.documentIds.push(documentId);

  const list = await callController(documents.getList, {
    query: { keyword: `System Verify Document ${stamp}`, page: 0, pageSize: 10000 },
  });
  assert(list.statusCode === 200 && list.payload.success, 'document list failed', list);
  assert(list.payload.data.page === 1 && list.payload.data.pageSize === 100, 'document pagination was not normalized', list.payload.data);
  assert(list.payload.data.list.some((doc) => Number(doc.id) === Number(documentId)), 'created document missing from list');

  const download = await callController(documents.download, {
    params: { id: documentId },
  });
  assert(download.statusCode === 200 && download.payload.success && download.payload.data.file_url, 'document download metadata failed', download);

  const remove = await callController(documents.delete, {
    params: { id: documentId },
  });
  assert(remove.statusCode === 200 && remove.payload.success, 'document delete failed', remove);
  mark('document create/list/download/delete flow closed', { documentId });
}

function parseJsonColumn(value) {
  if (!value) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function verifyBusinessAlerts() {
  const alert = await queryOne('SELECT * FROM business_alerts ORDER BY id LIMIT 1');
  assert(alert?.id, 'missing business alert seed for verification');

  const buildBody = (row, interval) => ({
    name: row.name,
    condition_params: parseJsonColumn(row.condition_params),
    severity: row.severity,
    notify_roles: parseJsonColumn(row.notify_roles),
    notify_users: parseJsonColumn(row.notify_users),
    is_active: row.is_active,
    check_interval_minutes: interval,
  });
  const originalInterval = Number(alert.check_interval_minutes || 60);
  const updatedInterval = originalInterval + 1;

  const update = await callController(alerts.update, {
    params: { id: alert.id },
    body: buildBody(alert, updatedInterval),
  });
  assert(update.statusCode === 200 && update.payload.success, 'business alert update failed', update);
  const updated = await queryOne('SELECT check_interval_minutes FROM business_alerts WHERE id = ?', [alert.id]);
  assert(Number(updated.check_interval_minutes) === updatedInterval, 'business alert update did not persist', updated);

  await callController(alerts.update, {
    params: { id: alert.id },
    body: buildBody(alert, originalInterval),
  });
  mark('business alert update and restore flow closed', { alertId: alert.id });
}

async function verifyPermissionSeeds() {
  const permissions = [
    'system:users:create',
    'system:departments:update',
    'system:business-types:update',
    'system:notifications:delete',
    'system:workflow:use',
    'system:documents:view',
    'system:backup:create',
  ];
  const [rows] = await db.pool.query(
    `SELECT permission FROM menus WHERE permission IN (${permissions.map(() => '?').join(',')})`,
    permissions
  );
  const found = new Set(rows.map((row) => row.permission));
  const missing = permissions.filter((permission) => !found.has(permission));
  assert(missing.length === 0, 'missing system permission seeds', missing);
  mark('system permission seeds present', { count: permissions.length });
}

function verifyFrontendActionPermissions() {
  const systemViewPath = (...segments) => path.resolve(__dirname, '../../frontend/src/views/system', ...segments);
  const readView = (filename) => fs.readFileSync(systemViewPath(filename), 'utf8');

  const checks = [
    [readView('WorkflowManagement.vue'), [
      "v-permission=\"'system:workflow:create'\"",
      "v-permission=\"'system:workflow:edit'\"",
      "v-permission=\"'system:workflow:delete'\"",
      "v-permission=\"'system:workflow:use'\"",
    ]],
    [readView('CodingRules.vue'), [
      "v-permission=\"'system:settings:edit'\"",
      "v-permission=\"'system:settings:view'\"",
    ]],
    [readView('DocumentManagement.vue'), [
      "v-permission=\"'system:documents:create'\"",
      "v-permission=\"'system:documents:view'\"",
      "v-permission=\"'system:documents:delete'\"",
    ]],
    [readView('BusinessAlerts.vue'), [
      "v-permission=\"'system:settings:edit'\"",
    ]],
    [readView('Print.vue'), [
      "v-permission=\"'system:settings:write'\"",
      "v-permission=\"currentTemplate.id ? 'system:print:update' : 'system:print:create'\"",
    ]],
    [readView('TechnicalCommunication.vue'), [
      "v-permission=\"dialogType === 'create' ? 'system:tech-comm:create' : 'system:tech-comm:edit'\"",
    ]],
    [readView('BusinessTypes.vue'), [
      "v-permission=\"dialogType === 'create' ? 'system:business-types:create' : 'system:business-types:update'\"",
    ]],
    [readView('Users.vue'), [
      "v-permission=\"userForm.id ? 'system:users:update' : 'system:users:create'\"",
    ]],
    [readView('Departments.vue'), [
      "v-permission=\"departmentForm.id ? 'system:departments:update' : 'system:departments:create'\"",
    ]],
    [readView('Permissions.vue'), [
      "v-permission=\"'system:permissions:manage'\"",
    ]],
  ];

  let count = 0;
  for (const [source, expectedSnippets] of checks) {
    for (const snippet of expectedSnippets) {
      assert(source.includes(snippet), 'missing frontend system action permission binding', snippet);
      count += 1;
    }
  }
  mark('frontend system action permission bindings closed', { count });
}

async function cleanupCreatedData() {
  for (const communicationId of cleanup.communicationIds.reverse()) {
    await db.pool.execute('DELETE FROM notifications WHERE source_type = ? AND source_id = ?', ['technical_communication', communicationId]);
    await db.pool.execute('DELETE FROM technical_communication_reads WHERE communication_id = ?', [communicationId]);
    await db.pool.execute('DELETE FROM technical_communication_comments WHERE communication_id = ?', [communicationId]);
    await db.pool.execute('DELETE FROM technical_communication_recipients WHERE communication_id = ?', [communicationId]);
    await db.pool.execute('DELETE FROM technical_communication_department_recipients WHERE communication_id = ?', [communicationId]);
    await db.pool.execute('DELETE FROM technical_communication_likes WHERE communication_id = ?', [communicationId]);
    await db.pool.execute('DELETE FROM technical_communication_favorites WHERE communication_id = ?', [communicationId]);
    await db.pool.execute('DELETE FROM technical_communications WHERE id = ?', [communicationId]);
  }
  for (const id of cleanup.notificationIds.reverse()) {
    await db.pool.execute('DELETE FROM notifications WHERE id = ?', [id]);
  }
  for (const id of cleanup.documentIds.reverse()) {
    await db.pool.execute('DELETE FROM documents WHERE id = ?', [id]);
  }
  for (const businessType of cleanup.codingBusinessTypes.reverse()) {
    await db.pool.execute('DELETE FROM coding_sequences WHERE business_type = ?', [businessType]);
  }
  for (const id of cleanup.codingRuleIds.reverse()) {
    await db.pool.execute('DELETE FROM coding_rules WHERE id = ?', [id]);
  }
  for (const id of cleanup.userIds.reverse()) {
    await db.pool.execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await db.pool.execute('DELETE FROM users WHERE id = ?', [id]);
  }
  for (const id of cleanup.menuIds) {
    await db.pool.execute('DELETE FROM role_menus WHERE menu_id = ?', [id]);
    await db.pool.execute('DELETE FROM menus WHERE id = ?', [id]);
  }
  for (const id of cleanup.roleIds.reverse()) {
    await db.pool.execute('DELETE FROM role_menus WHERE role_id = ?', [id]);
    await db.pool.execute('DELETE FROM roles WHERE id = ?', [id]);
  }
  for (const id of cleanup.businessTypeIds.reverse()) {
    await db.pool.execute('DELETE FROM business_types WHERE id = ?', [id]);
  }
  for (const id of cleanup.departmentIds) {
    await db.pool.execute('UPDATE users SET department_id = NULL WHERE department_id = ?', [id]);
    await db.pool.execute('DELETE FROM departments WHERE id = ?', [id]);
  }
}

async function main() {
  const { user: adminUser, roleId: adminRoleId } = await ensureAdminContext();

  await verifyDepartments();
  const communicationDepartmentId = await createDepartmentForUser();
  const testUserId = await verifyUsers(adminRoleId, communicationDepartmentId);
  await verifyRoles();
  await verifyMenus();
  await verifyBusinessTypes(adminUser);
  await verifyTechnicalCommunication(adminUser, communicationDepartmentId, testUserId);
  await verifyNotifications(adminUser);
  await verifyCodingRules();
  await verifyDocuments(adminUser);
  await verifyBusinessAlerts();
  await verifyBackup(adminUser);
  await verifyPermissionSeeds();
  verifyFrontendActionPermissions();

  console.log(`\nSYSTEM_MANAGEMENT_VERIFICATION_PASSED ${results.length} checks`);
}

main()
  .catch((error) => {
    console.error('\nSYSTEM_MANAGEMENT_VERIFICATION_FAILED');
    console.error(error.message);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanupCreatedData();
      if (db.pool && typeof db.pool.end === 'function') {
        await db.pool.end();
      }
    } catch (error) {
      console.error(`Cleanup warning: ${error.message}`);
    } finally {
      process.exit(process.exitCode || 0);
    }
  });
