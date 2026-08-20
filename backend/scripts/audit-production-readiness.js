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
  'auth.js POST /mfa/setup',
  'auth.js POST /mfa/confirm',
  'auth.js POST /mfa/disable',
  'auth.js POST /mfa/recovery-codes/regenerate',
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
  // Password-authenticated MFA challenges intentionally remain unauthenticated
  // until the second factor succeeds.  They are still protected by the
  // /api/auth/mfa rate limiter and strict challenge validation in the service.
  'auth.js POST /mfa/verify',
  'auth.js POST /mfa/enroll',
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

function auditStaticGuards() {
  const findings = [];
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

  if (!/DataScopeService/.test(inventoryBatch) || !/scopeLocationFilter/.test(inventoryBatch)) {
    findings.push('inventory batch queries do not enforce DataScopeService location scope');
  }
  if (!/DataScopeService/.test(inventoryStock)) {
    findings.push('inventory stock queries do not use DataScopeService');
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
  auditStaticGuards,
  collectRouteDeclarations,
};
