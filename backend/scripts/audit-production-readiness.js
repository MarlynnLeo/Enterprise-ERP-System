const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(backendRoot, 'src');

const SELF_SERVICE_ROUTES = new Set([
  'auth.js POST /logout',
  'auth.js POST /refresh',
  'auth.js GET /profile',
  'auth.js PUT /profile',
  'auth.js GET /permissions',
  'auth.js GET /menus',
  'auth.js PUT /users/avatar',
  'auth.js PUT /change-password',
  'auth.js POST /profile/avatar-frame',
  'auth.js GET /theme',
  'auth.js POST /theme',
  'auth.js DELETE /theme',
  'business/workflowRoutes.js POST /instances/:id/approve',
  'business/workflowRoutes.js POST /instances/:id/withdraw',
  'business/workflowRoutes.js GET /instances/:id',
  'business/workflowRoutes.js GET /my/initiated',
  'business/workflowRoutes.js GET /my/pending',
  'business/workflowRoutes.js GET /business',
  'common.js GET /enums/:type',
  'system/notificationRoutes.js GET /',
  'system/notificationRoutes.js GET /unread-count',
  'system/notificationRoutes.js GET /:id',
  'system/notificationRoutes.js PUT /:id/read',
  'system/notificationRoutes.js PUT /mark-all-read',
  'system/notificationRoutes.js DELETE /:id',
  'system/notificationRoutes.js POST /batch-delete',
  'system.js POST /client-errors',
  'system.js GET /business-types/dictionary',
  'todoRoutes.js GET /',
  'todoRoutes.js GET /dashboard-summary',
  'todoRoutes.js GET /filter',
  'todoRoutes.js GET /available-users',
  'todoRoutes.js GET /:id',
  'todoRoutes.js POST /',
  'todoRoutes.js PUT /:id',
  'todoRoutes.js DELETE /:id',
  'todoRoutes.js PATCH /:id/toggle',
  'todoRoutes.js PUT /:id/toggle',
  'userActivityRoutes.js POST /log',
  'userActivityRoutes.js GET /',
  'userActivityRoutes.js GET /statistics',
  'userActivityRoutes.js GET /export',
  'weather.js GET /current',
]);

const PUBLIC_ROUTES = new Set([
  'auth.js POST /login',
  'health.js GET /ping',
  'health.js GET /ready',
  'health.js GET /live',
  'integrations/dingtalkRoutes.js POST /callback',
]);

const CUSTOM_PERMISSION_MIDDLEWARES = new Set([
  'requireDocumentLinkView',
  'requireDefaultTemplatePermission',
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativeRouteFile(filePath) {
  return toPosix(path.relative(path.join(srcRoot, 'routes'), filePath));
}

function walk(dir, predicate, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, files);
    } else if (!predicate || predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function findMatchingParen(text, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function extractMethodBody(text, methodName) {
  const escapedName = methodName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const methodPattern = new RegExp(
    `^\\s*(?:static\\s+)?(?:async\\s+)?${escapedName}\\s*\\(`,
    'm'
  );
  const match = methodPattern.exec(text);
  if (!match) return null;

  const openParen = text.indexOf('(', match.index);
  const closeParen = findMatchingParen(text, openParen);
  if (closeParen < 0) return null;

  const openBrace = text.indexOf('{', closeParen);
  if (openBrace < 0) return null;
  const closeBrace = findMatchingBrace(text, openBrace);
  if (closeBrace < 0) return null;
  return text.slice(openBrace + 1, closeBrace);
}

function collectRouteDeclarations(text) {
  const declarations = [];
  const routePattern = /router\.(get|post|put|delete|patch)\s*\(/g;
  let match;
  while ((match = routePattern.exec(text))) {
    const lineStart = text.lastIndexOf('\n', match.index) + 1;
    if (text.slice(lineStart, match.index).trim().startsWith('//')) continue;

    const openIndex = text.indexOf('(', match.index);
    const closeIndex = findMatchingParen(text, openIndex);
    if (closeIndex < 0) continue;
    const declaration = text.slice(match.index, closeIndex + 1);
    const pathMatch = declaration.match(/router\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/);
    declarations.push({
      method: match[1].toUpperCase(),
      path: pathMatch ? pathMatch[1] : '<dynamic>',
      text: declaration,
      start: match.index,
      line: lineNumberAt(text, match.index),
    });
  }
  return declarations;
}

function collectMiddlewareAliases(text) {
  const aliases = new Map();
  const constPattern = /const\s+([A-Za-z_$][\w$]*)\s*=/g;
  let match;
  while ((match = constPattern.exec(text))) {
    const statementEnd = text.indexOf(';', match.index);
    if (statementEnd < 0) continue;
    const body = text.slice(match.index, statementEnd + 1);
    aliases.set(match[1], {
      auth: /authenticate(?:Token|RefreshToken)/.test(body),
      permission: /requirePermission\s*\(/.test(body),
    });
  }

  for (const middlewareName of CUSTOM_PERMISSION_MIDDLEWARES) {
    if (text.includes(middlewareName)) {
      aliases.set(middlewareName, { auth: false, permission: true });
    }
  }

  return aliases;
}

function declarationUsesAlias(declaration, aliases, kind) {
  for (const [name, flags] of aliases.entries()) {
    if (flags[kind] && new RegExp(`\\b${name}\\b`).test(declaration)) {
      return true;
    }
  }
  return false;
}

function hasPriorRouterUse(text, routeStart, pattern) {
  return pattern.test(text.slice(0, routeStart));
}

function routeKey(filePath, declaration) {
  return `${relativeRouteFile(filePath)} ${declaration.method} ${declaration.path}`;
}

function collectPermissionCodes(text) {
  const permissions = new Set();
  const requirePattern = /requirePermission\s*\(([\s\S]*?)\)/g;
  let match;
  while ((match = requirePattern.exec(text))) {
    for (const stringMatch of match[1].matchAll(/['"`]([A-Za-z0-9:_-]+)['"`]/g)) {
      if (stringMatch[1].includes(':')) permissions.add(stringMatch[1]);
    }
  }
  return permissions;
}

function auditRoutes() {
  const routeFiles = walk(path.join(srcRoot, 'routes'), (file) => file.endsWith('.js'));
  const missingAuth = [];
  const missingPermission = [];
  const permissions = new Set();

  for (const file of routeFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const aliases = collectMiddlewareAliases(text);
    for (const permission of collectPermissionCodes(text)) permissions.add(permission);

    for (const declaration of collectRouteDeclarations(text)) {
      const key = routeKey(file, declaration);
      const publicRoute = PUBLIC_ROUTES.has(key);
      const selfServiceRoute = SELF_SERVICE_ROUTES.has(key);
      const hasAuth =
        /authenticate(?:Token|RefreshToken)/.test(declaration.text)
        || declarationUsesAlias(declaration.text, aliases, 'auth')
        || hasPriorRouterUse(text, declaration.start, /router\.use\(\s*authenticateToken\s*\)/);
      const hasPermission =
        /requirePermission\s*\(/.test(declaration.text)
        || declarationUsesAlias(declaration.text, aliases, 'permission')
        || hasPriorRouterUse(text, declaration.start, /router\.use\(\s*requirePermission\s*\(/);

      if (!publicRoute && !hasAuth) {
        missingAuth.push(`${key}:${declaration.line}`);
      }
      if (!publicRoute && !selfServiceRoute && !hasPermission) {
        missingPermission.push(`${key}:${declaration.line}`);
      }
    }
  }

  return { missingAuth, missingPermission, permissions: [...permissions].sort() };
}

function auditRowLevelDataScopeGuards(sourceOverrides = {}) {
  const findings = [];
  const scopeGuard = sourceOverrides.scopeGuard ?? fs.readFileSync(
    path.join(srcRoot, 'authorization/ScopeGuard.js'),
    'utf8'
  );
  const dataScopeService = sourceOverrides.dataScopeService ?? fs.readFileSync(
    path.join(srcRoot, 'services/DataScopeService.js'),
    'utf8'
  );
  const workflowInstances = sourceOverrides.workflowInstances ?? fs.readFileSync(
    path.join(srcRoot, 'services/business/workflow/instanceMethods.js'),
    'utf8'
  );
  const technicalCommunicationRoutes = sourceOverrides.technicalCommunicationRoutes
    ?? fs.readFileSync(path.join(srcRoot, 'routes/system/technicalCommunicationRoutes.js'), 'utf8');
  const technicalCommunicationController = sourceOverrides.technicalCommunicationController
    ?? fs.readFileSync(
      path.join(srcRoot, 'controllers/system/technicalCommunicationController.js'),
      'utf8'
    );

  const applyListScope = extractMethodBody(scopeGuard, 'applyListScope');
  if (!applyListScope) {
    findings.push('ScopeGuard.applyListScope is missing from the row-level authorization SSOT');
  } else if (!/buildRequestOwnerScopeClause|isFinanceSharedAll|isSharedRead/.test(applyListScope)) {
    findings.push('ScopeGuard.applyListScope must apply DataScope owner clauses (with finance/shared-read exceptions)');
  }

  const assertAccess = extractMethodBody(scopeGuard, 'assertAccess');
  if (!assertAccess) {
    findings.push('ScopeGuard.assertAccess is missing from the row-level authorization SSOT');
  } else if (!/assertRecordAccess/.test(assertAccess)) {
    findings.push('ScopeGuard.assertAccess must delegate to DataScopeService.assertRecordAccess');
  } else if (!/isFinanceSharedAll|isSharedRead/.test(assertAccess)) {
    findings.push('ScopeGuard.assertAccess must honour finance-shared and shared-read policies');
  }

  if (!/assertAllAccess/.test(scopeGuard)) {
    findings.push('ScopeGuard must expose assertAllAccess for batch mutations');
  }

  const loadUserDataScope = extractMethodBody(dataScopeService, 'loadUserDataScope');
  if (!loadUserDataScope) {
    findings.push('DataScopeService.loadUserDataScope is missing');
  } else if (
    !/\bdata_scope\b/.test(loadUserDataScope)
    || !/\buser_roles\b/.test(loadUserDataScope)
  ) {
    findings.push('DataScopeService must derive visibility from role data_scope / user_roles');
  } else if (!/is_super_admin/.test(loadUserDataScope)) {
    findings.push('DataScopeService must grant ALL to super-admin roles');
  }

  const isAllScope = extractMethodBody(dataScopeService, 'isAllScope');
  if (
    !isAllScope
    || !/DATA_SCOPE\.ALL/.test(isAllScope)
    || !/scope\.type/.test(isAllScope)
  ) {
    findings.push('DataScopeService.isAllScope must only treat explicit DATA_SCOPE.ALL as unrestricted');
  }

  // Check the full source (not extractMethodBody): template-literal `${...}` braces
  // truncate brace-matching mid-method and would false-fail row-level checks.
  if (!/static buildOwnerScopeClause\s*\(/.test(dataScopeService)) {
    findings.push('DataScopeService.buildOwnerScopeClause is missing');
  } else if (
    !/DATA_SCOPE\.SELF/.test(dataScopeService)
    || !/departmentIds/.test(dataScopeService)
    || !/(ownerColumn|created_by)/.test(dataScopeService)
    || !/locationIds/.test(dataScopeService)
  ) {
    findings.push('DataScopeService.buildOwnerScopeClause must emit owner/department/location filters');
  }

  if (!/assertRecordExists/.test(dataScopeService)) {
    findings.push('DataScopeService must expose assertRecordExists for existence-only checks');
  }

  const canAccessInstance = extractMethodBody(workflowInstances, 'canAccessInstance');
  if (
    !canAccessInstance
    || !/WHERE\s+wi\.id\s*=\s*\?/i.test(canAccessInstance)
    || !/wi\.deleted_at\s+IS\s+NULL/i.test(canAccessInstance)
  ) {
    findings.push('workflow instance visibility must be based on authenticated access and record existence');
  } else if (
    /initiator_id\s*=\s*\?|approver_id\s*=\s*\?|workflow_node_approvers|\[\s*instanceId\s*,\s*userId/i.test(
      canAccessInstance
    )
  ) {
    findings.push('workflow instance details must not be limited to the initiator or assigned approver');
  }

  const deleteCommentRoute = collectRouteDeclarations(technicalCommunicationRoutes).find(
    (declaration) => declaration.method === 'DELETE' && declaration.path === '/comments/:commentId'
  );
  if (
    !deleteCommentRoute
    || !/requirePermission\(\s*['"]system:tech-comm:delete['"]\s*\)/.test(deleteCommentRoute.text)
  ) {
    findings.push('technical communication comment deletion must require system:tech-comm:delete');
  }

  const deleteComment = extractMethodBody(technicalCommunicationController, 'deleteComment');
  if (!deleteComment) {
    findings.push('technical communication deleteComment controller is missing');
  } else if (/req\.user|\buser_id\b|\bauthor_id\b/.test(deleteComment)) {
    findings.push('technical communication comments must not be deletable only by their creator');
  }

  return findings;
}

function auditStaticGuards() {
  const findings = auditRowLevelDataScopeGuards();
  const inventoryBatch = fs.readFileSync(
    path.join(srcRoot, 'controllers/business/inventory/inventoryBatchController.js'),
    'utf8'
  );
  const inventoryStock = fs.readFileSync(
    path.join(srcRoot, 'controllers/business/inventory/inventoryStockController.js'),
    'utf8'
  );
  const auditInterceptor = fs.readFileSync(path.join(srcRoot, 'middleware/auditLogInterceptor.js'), 'utf8');
  const auditLogService = fs.readFileSync(path.join(srcRoot, 'services/system/AuditLogService.js'), 'utf8');
  const backupService = fs.readFileSync(path.join(srcRoot, 'services/system/BackupService.js'), 'utf8');
  const systemRoutes = fs.readFileSync(path.join(srcRoot, 'routes/system.js'), 'utf8');
  const restoreScript = fs.readFileSync(path.join(backendRoot, 'scripts/restore-backup.js'), 'utf8');
  const composeFile = fs.readFileSync(path.resolve(backendRoot, '..', 'docker-compose.yml'), 'utf8');

  if (/scopeLocationFilter|scopedLocationIds|DataScopeService|DATA_SCOPE|CUSTOM/.test(inventoryBatch)) {
    findings.push('inventory batch queries still contain a legacy location-level data scope filter');
  }
  if (/DataScopeService|scopedLocationIds|DATA_SCOPE/.test(inventoryStock)) {
    findings.push('inventory stock queries still contain a legacy row-level data scope guard');
  }
  if (!/res\.on\(\s*['"]finish['"]/.test(auditInterceptor)) {
    findings.push('audit interceptor must write after response finish');
  }
  if (!/audit-failures\.ndjson/.test(auditLogService)) {
    findings.push('audit log failures need durable fallback logging');
  }
  if (!/verifyBackup/.test(backupService) || !/sha256File/.test(backupService)) {
    findings.push('backup service does not expose checksum-based restore preflight verification');
  }
  if (!/\/backups\/:filename\/verify/.test(systemRoutes)) {
    findings.push('backup verification route is not registered before backup download route');
  }
  if (!/BACKUP_RETENTION_DAYS/.test(backupService) || !/pruneBackups/.test(backupService)) {
    findings.push('backup service does not enforce a configurable retention policy');
  }
  if (!/erp-backups:\/app\/backups/.test(composeFile) || !/BACKUP_DIR=\/app\/backups/.test(composeFile)) {
    findings.push('database backups are not mounted to a persistent Docker volume');
  }
  if (!/checksum mismatch/i.test(restoreScript) || !/non-empty database/i.test(restoreScript)) {
    findings.push('offline restore script lacks checksum or empty-target safety guards');
  }

  const runtimeFiles = walk(path.join(srcRoot), (file) => file.endsWith('.js'));
  const allowedLedgerWriter = path.normalize(path.join(srcRoot, 'services/InventoryService.js'));
  const directLedgerWriters = runtimeFiles
    .filter((file) => path.normalize(file) !== allowedLedgerWriter)
    .filter((file) => /insert\s+into\s+inventory_ledger/i.test(fs.readFileSync(file, 'utf8')))
    .map((file) => toPosix(path.relative(backendRoot, file)));
  if (directLedgerWriters.length > 0) {
    findings.push(`inventory ledger writes bypass InventoryService: ${directLedgerWriters.join(', ')}`);
  }

  return findings;
}

async function auditPermissionRegistry(permissions) {
  if (!process.argv.includes('--db')) return [];

  const PermissionService = require('../src/services/PermissionService');
  const { closeRedis } = require('../src/config/redisClient');
  const poolFactory = require('../src/database/ConnectionPoolFactory');
  try {
    const registered = new Set(await PermissionService.getAllSystemPermissions());
    return permissions.filter((permission) => !registered.has(permission));
  } finally {
    await closeRedis().catch(() => {});
    await poolFactory.closeAll().catch(() => {});
  }
}

async function main() {
  const routeAudit = auditRoutes();
  const staticFindings = auditStaticGuards();
  const missingRegisteredPermissions = await auditPermissionRegistry(routeAudit.permissions);

  console.log('Production readiness audit');
  console.log(`route permissions discovered: ${routeAudit.permissions.length}`);
  console.log(`missing auth routes: ${routeAudit.missingAuth.length}`);
  console.log(`missing permission routes: ${routeAudit.missingPermission.length}`);
  console.log(`static guard findings: ${staticFindings.length}`);
  console.log(`missing registered permissions: ${missingRegisteredPermissions.length}`);

  for (const finding of routeAudit.missingAuth) console.log(`missing-auth: ${finding}`);
  for (const finding of routeAudit.missingPermission) console.log(`missing-permission: ${finding}`);
  for (const finding of staticFindings) console.log(`static-finding: ${finding}`);
  for (const permission of missingRegisteredPermissions.slice(0, 100)) {
    console.log(`missing-registered-permission: ${permission}`);
  }

  if (
    routeAudit.missingAuth.length
    || routeAudit.missingPermission.length
    || staticFindings.length
    || missingRegisteredPermissions.length
  ) {
    process.exitCode = 1;
  } else {
    console.log('Result: OK');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  auditRoutes,
  auditRowLevelDataScopeGuards,
  auditStaticGuards,
  collectRouteDeclarations,
};
