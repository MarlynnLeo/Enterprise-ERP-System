#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('../src/config/database-config');

const rootDir = path.resolve(__dirname, '..', '..');
const outDir = path.join(rootDir, 'docs');
const jsonPath = path.join(outDir, 'functional-coverage-audit.json');
const mdPath = path.join(outDir, 'functional-coverage-audit.md');

const frontendDir = path.join(rootDir, 'frontend', 'src');
const backendDir = path.join(rootDir, 'backend', 'src');

const scanExtensions = new Set(['.js', '.vue', '.ts']);
const ignoredApiPrefixes = new Set(['/csrf-token']);

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, acc);
    } else if (scanExtensions.has(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function resolveFrontendImport(sourceFile, importPath) {
  let resolved = importPath;
  if (resolved.startsWith('@/')) {
    resolved = path.join(frontendDir, resolved.slice(2));
  } else if (resolved.startsWith('.')) {
    resolved = path.join(path.dirname(sourceFile), resolved);
  } else {
    return null;
  }
  return path.resolve(resolved);
}

function normalizeRoutePath(value) {
  if (!value) return '/';
  const withoutQuery = String(value).split('?')[0].replace(/\/+/g, '/');
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function normalizeApiTemplate(value) {
  const raw = String(value || '').split('${')[0];
  return normalizeRoutePath(raw);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function exactPathExists(filePath) {
  const resolved = path.resolve(filePath);
  const root = path.parse(resolved).root;
  const parts = path.relative(root, resolved).split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (!fs.existsSync(current)) return false;
    const entries = fs.readdirSync(current);
    if (!entries.includes(part)) return false;
    current = path.join(current, part);
  }
  return fs.existsSync(current);
}

function extractFrontendRouteComponents() {
  const routerFiles = [
    path.join(frontendDir, 'router', 'index.js'),
    ...walk(path.join(frontendDir, 'router', 'modules')),
  ].filter((file) => fs.existsSync(file));

  const imports = [];
  const dynamicImportPattern = /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const staticVueImportPattern = /import\s+[\w{}*,\s]+\s+from\s+['"`]([^'"`]+\.vue)['"`]/g;

  for (const file of routerFiles) {
    const content = readText(file);
    for (const pattern of [dynamicImportPattern, staticVueImportPattern]) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const resolved = resolveFrontendImport(file, match[1]);
        if (!resolved) continue;
        imports.push({
          source: toPosix(path.relative(rootDir, file)),
          importPath: match[1],
          resolved: toPosix(path.relative(rootDir, resolved)),
          exists: exactPathExists(resolved),
        });
      }
    }
  }

  return imports;
}

function extractFrontendRoutes() {
  const routerFiles = [
    path.join(frontendDir, 'router', 'index.js'),
    ...walk(path.join(frontendDir, 'router', 'modules')),
  ].filter((file) => fs.existsSync(file));

  const routes = [];
  const routeBlockPattern = /\{\s*path:\s*['"`]([^'"`]+)['"`][\s\S]*?(?=\n\s*\},|\n\s*\]\n|\n\s*\}\n)/g;
  for (const file of routerFiles) {
    const content = readText(file);
    let match;
    while ((match = routeBlockPattern.exec(content)) !== null) {
      const block = match[0];
      const name = block.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] || '';
      const permission = block.match(/permission:\s*['"`]([^'"`]+)['"`]/)?.[1] || '';
      routes.push({
        source: toPosix(path.relative(rootDir, file)),
        path: match[1],
        name,
        permission,
      });
    }
  }
  return routes;
}

function extractBackendMounts() {
  const appPath = path.join(backendDir, 'app.js');
  const content = readText(appPath);
  const mounts = new Set(['/public']);
  const mountPattern = /\[\s*['"`]([^'"`]+)['"`]\s*,\s*[\w$]+\s*\]/g;
  let match;
  while ((match = mountPattern.exec(content)) !== null) {
    mounts.add(match[1]);
  }
  return Array.from(mounts).sort((a, b) => b.length - a.length);
}

function extractFrontendApiCalls() {
  const files = [
    ...walk(path.join(frontendDir, 'api')),
    ...walk(path.join(frontendDir, 'services')),
    ...walk(path.join(frontendDir, 'views')),
    ...walk(path.join(frontendDir, 'composables')),
  ];

  const calls = [];
  const apiCallPattern = /\b(?:api|fastApi|axios)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`)]*)\2/g;
  for (const file of files) {
    const content = readText(file);
    let match;
    while ((match = apiCallPattern.exec(content)) !== null) {
      const endpoint = normalizeApiTemplate(match[3]);
      if (!endpoint || endpoint === '/' || /^https?:\/\//i.test(endpoint)) continue;
      calls.push({
        source: toPosix(path.relative(rootDir, file)),
        method: match[1].toUpperCase(),
        endpoint,
      });
    }
  }
  return calls;
}

function apiCallHasMountedPrefix(endpoint, mounts) {
  if (ignoredApiPrefixes.has(endpoint)) return true;
  return mounts.some((mount) => endpoint === mount || endpoint.startsWith(`${mount}/`));
}

function extractBackendHandlerReferences() {
  const routeFiles = walk(path.join(backendDir, 'routes'));
  const results = [];
  const requirePattern = /const\s+(\w+)\s*=\s*require\(['"`]([^'"`]+)['"`]\)/g;
  const handlerPattern = /router\.(get|post|put|patch|delete)\s*\([\s\S]*?(\w+)\.(\w+)\s*[\),]/g;

  for (const file of routeFiles) {
    const content = readText(file);
    const imports = new Map();
    let match;
    while ((match = requirePattern.exec(content)) !== null) {
      imports.set(match[1], match[2]);
    }

    while ((match = handlerPattern.exec(content)) !== null) {
      const [, method, objectName, functionName] = match;
      const importPath = imports.get(objectName);
      if (!importPath || !importPath.startsWith('.')) continue;

      let controllerPath = path.resolve(path.dirname(file), importPath);
      if (!path.extname(controllerPath)) {
        if (fs.existsSync(`${controllerPath}.js`)) {
          controllerPath = `${controllerPath}.js`;
        } else {
          controllerPath = path.join(controllerPath, 'index.js');
        }
      }
      const exists = fs.existsSync(controllerPath);
      let exported = false;
      if (exists) {
        const controllerContent = readText(controllerPath);
        exported = new RegExp(`\\b${functionName}\\b`).test(controllerContent);
      }
      results.push({
        source: toPosix(path.relative(rootDir, file)),
        method: method.toUpperCase(),
        handler: `${objectName}.${functionName}`,
        controller: toPosix(path.relative(rootDir, controllerPath)),
        exists,
        exported,
      });
    }
  }
  return results;
}

async function auditMenus() {
  const connection = await mysql.createConnection(getPoolConfig());
  try {
    const [columns] = await connection.query('SHOW COLUMNS FROM menus');
    const columnNames = new Set(columns.map((column) => column.Field));
    const pathColumn = columnNames.has('path') ? 'path' : null;
    const componentColumn = columnNames.has('component') ? 'component' : null;

    const [menus] = await connection.query(
      `SELECT id, parent_id, name, ${pathColumn || 'NULL'} AS path, ${componentColumn || 'NULL'} AS component, type, status, visible
       FROM menus
       WHERE COALESCE(status, 1) = 1 AND COALESCE(visible, 1) = 1 AND COALESCE(type, 0) <> 2`
    );

    return menus.map((menu) => ({
      id: menu.id,
      parent_id: menu.parent_id,
      name: menu.name,
      path: menu.path,
      component: menu.component,
    }));
  } finally {
    await connection.end();
  }
}

function possibleMenuComponentFiles(component) {
  const normalized = String(component || '').replace(/^@?\/?views\//, '').replace(/\\/g, '/');
  if (!normalized) return [];
  const candidates = [path.join(frontendDir, 'views', `${normalized}.vue`)];
  if (!normalized.includes('/')) {
    candidates.push(path.join(frontendDir, 'views', 'dashboard', `${normalized}.vue`));
  }
  return candidates;
}

function auditMenuComponents(menus) {
  return menus
    .filter((menu) => menu.component && String(menu.component).trim())
    .map((menu) => {
      const candidates = possibleMenuComponentFiles(menu.component);
      const matched = candidates.find((candidate) => exactPathExists(candidate));
      return {
        id: menu.id,
        name: menu.name,
        path: menu.path,
        component: menu.component,
        expected: candidates.map((candidate) => toPosix(path.relative(rootDir, candidate))),
        exists: Boolean(matched),
      };
    });
}

function renderMarkdown(report) {
  const lines = [
    '# ERP Functional Coverage Audit',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    `Overall result: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    '| Area | Result | Count |',
    '| --- | --- | --- |',
    `| Frontend route components | ${report.missingRouteComponents.length === 0 ? 'PASS' : 'FAIL'} | ${report.missingRouteComponents.length} missing |`,
    `| DB menu components | ${report.missingMenuComponents.length === 0 ? 'PASS' : 'FAIL'} | ${report.missingMenuComponents.length} missing |`,
    `| Frontend API mounted prefixes | ${report.unmountedApiCalls.length === 0 ? 'PASS' : 'FAIL'} | ${report.unmountedApiCalls.length} unmounted |`,
    `| Backend route handlers | ${report.invalidBackendHandlers.length === 0 ? 'PASS' : 'FAIL'} | ${report.invalidBackendHandlers.length} invalid |`,
    `| Visible DB menus | INFO | ${report.menus.length} menus |`,
  ];

  const sections = [
    ['Missing Route Components', report.missingRouteComponents],
    ['Missing DB Menu Components', report.missingMenuComponents],
    ['Unmounted Frontend API Calls', report.unmountedApiCalls],
    ['Invalid Backend Handlers', report.invalidBackendHandlers],
  ];

  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push('', `## ${title}`, '', '```json');
    lines.push(JSON.stringify(items.slice(0, 80), null, 2));
    lines.push('```');
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const routeComponents = extractFrontendRouteComponents();
  const frontendRoutes = extractFrontendRoutes();
  const backendMounts = extractBackendMounts();
  const frontendApiCalls = extractFrontendApiCalls();
  const backendHandlers = extractBackendHandlerReferences();
  const menus = await auditMenus();
  const menuComponents = auditMenuComponents(menus);

  const missingRouteComponents = routeComponents.filter((item) => !item.exists);
  const missingMenuComponents = menuComponents.filter((item) => !item.exists);
  const unmountedApiCalls = frontendApiCalls.filter((call) => !apiCallHasMountedPrefix(call.endpoint, backendMounts));
  const invalidBackendHandlers = backendHandlers.filter((handler) => !handler.exists || !handler.exported);

  const report = {
    passed: missingRouteComponents.length === 0 && missingMenuComponents.length === 0 && unmountedApiCalls.length === 0 && invalidBackendHandlers.length === 0,
    summary: {
      frontendRouteCount: frontendRoutes.length,
      routeComponentImportCount: routeComponents.length,
      frontendApiCallCount: frontendApiCalls.length,
      backendMountCount: backendMounts.length,
      backendHandlerReferenceCount: backendHandlers.length,
      visibleMenuCount: menus.length,
      menuComponentCount: menuComponents.length,
    },
    backendMounts,
    frontendRoutes,
    missingRouteComponents,
    menuComponents,
    missingMenuComponents,
    unmountedApiCalls,
    invalidBackendHandlers,
    menus,
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(report));

  console.log(`Functional coverage audit complete: ${report.passed ? 'PASS' : 'FAIL'}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
  process.exit(report.passed ? 0 : 2);
}

main().catch((error) => {
  console.error('Functional coverage audit failed to run:', error.message);
  process.exit(1);
});
