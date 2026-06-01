#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');
const backendDir = path.join(rootDir, 'backend', 'src');
const frontendDir = path.join(rootDir, 'frontend', 'src');
const docsDir = path.join(rootDir, 'docs');
const jsonPath = path.join(docsDir, 'data-api-uniformity-audit.json');
const mdPath = path.join(docsDir, 'data-api-uniformity-audit.md');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const NON_BLOCKING_DIRECT_API_ALLOWLIST = [
  'frontend/src/api/',
  'frontend/src/services/axiosInstance.js',
  'frontend/src/services/api.js',
  'frontend/src/services/notificationApi.js',
  'frontend/src/services/technicalCommunicationApi.js',
  'frontend/src/services/printService.js',
  'frontend/src/stores/auth.js',
  'frontend/src/stores/theme.js',
];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', 'coverage', 'logs', 'uploads'].includes(entry.name)) continue;
      files.push(...walk(fullPath, predicate));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeRoute(route) {
  return route
    .replace(/\?.*$/, '')
    .replace(/\/+/g, '/')
    .replace(/\/:([A-Za-z0-9_]+)/g, '/{id}')
    .replace(/\$\{[^}]+\}/g, '{id}')
    .replace(/\/\{id\}\/\{id\}/g, '/{id}/{id}')
    .replace(/\/$/, '') || '/';
}

function extractStaticStringExpression(source, startIndex) {
  let i = startIndex;
  while (i < source.length && /\s/.test(source[i])) i += 1;
  const quote = source[i];
  if (!['"', "'", '`'].includes(quote)) return null;
  let value = '';
  i += 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      value += char + (source[i + 1] || '');
      i += 2;
      continue;
    }
    if (char === quote) return value;
    value += char;
    i += 1;
  }
  return null;
}

function extractFrontendCalls() {
  const files = walk(frontendDir, (file) => /\.(js|vue)$/.test(file));
  const calls = [];
  const callRegex = /\b(api|fastApi)\s*\.\s*(get|post|put|patch|delete)\s*\(/g;

  for (const file of files) {
    const source = read(file);
    let match;
    while ((match = callRegex.exec(source))) {
      const method = match[2].toUpperCase();
      const url = extractStaticStringExpression(source, callRegex.lastIndex);
      if (!url || (!url.startsWith('/') && !url.startsWith('${'))) continue;
      const rel = toPosix(path.relative(rootDir, file));
      calls.push({
        file: rel,
        method,
        url,
        normalized: normalizeRoute(url),
      });
    }
  }
  return calls;
}

function extractBackendMounts() {
  const appPath = path.join(backendDir, 'app.js');
  const source = read(appPath);
  const mounts = [];
  const modulesBlockMatch = source.match(/const apiRouteModules = \[([\s\S]*?)\];/);
  if (!modulesBlockMatch) return mounts;
  const mountRegex = /\[\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z0-9_]+)\s*\]/g;
  let match;
  while ((match = mountRegex.exec(modulesBlockMatch[1]))) {
    mounts.push({
      basePath: `/api${match[1]}`.replace(/\/+/g, '/'),
      moduleName: match[2],
    });
  }
  return mounts;
}

function extractBackendRoutes() {
  const routeFiles = walk(path.join(backendDir, 'routes'), (file) => file.endsWith('.js'));
  const appSource = read(path.join(backendDir, 'app.js'));
  const mounts = extractBackendMounts();
  const requireMap = new Map();
  const requireRegex = /const\s+([A-Za-z0-9_]+)\s*=\s*require\(['"]([^'"]+)['"]\)/g;
  let requireMatch;
  while ((requireMatch = requireRegex.exec(appSource))) {
    const resolved = path.resolve(path.dirname(path.join(backendDir, 'app.js')), `${requireMatch[2]}.js`);
    requireMap.set(path.normalize(resolved), requireMatch[1]);
  }

  const mountByFile = new Map();
  for (const file of routeFiles) {
    const moduleName = requireMap.get(path.normalize(file));
    const mount = mounts.find((item) => item.moduleName === moduleName);
    if (mount) mountByFile.set(file, mount.basePath);
  }

  const routes = [];
  const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  for (const file of routeFiles) {
    const source = read(file);
    let match;
    while ((match = routeRegex.exec(source))) {
      const mount = mountByFile.get(file);
      if (!mount) continue;
      const method = match[1].toUpperCase();
      const routePath = `${mount}/${match[2]}`.replace(/\/+/g, '/');
      routes.push({
        file: toPosix(path.relative(rootDir, file)),
        method,
        route: routePath,
        normalized: normalizeRoute(routePath.replace(/^\/api/, '')),
      });
    }
  }
  return routes;
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function isDirectApiCall(call) {
  if (NON_BLOCKING_DIRECT_API_ALLOWLIST.some((prefix) => call.file.startsWith(prefix))) {
    return false;
  }
  return !call.file.startsWith('frontend/src/api/');
}

function buildReport() {
  const frontendCalls = extractFrontendCalls();
  const backendRoutes = extractBackendRoutes();
  const frontendApiFiles = walk(path.join(frontendDir, 'api'), (file) => /\.(js|vue)$/.test(file))
    .map((file) => toPosix(path.relative(rootDir, file)));

  const duplicateFrontend = Array.from(groupBy(frontendCalls, (call) => `${call.method} ${call.normalized}`))
    .filter(([, items]) => new Set(items.map((item) => item.file)).size > 1)
    .map(([endpoint, items]) => ({ endpoint, count: items.length, files: [...new Set(items.map((item) => item.file))] }));

  const apiModuleCalls = frontendCalls.filter((call) => call.file.startsWith('frontend/src/api/'));
  const duplicateApiModuleEndpoints = Array.from(groupBy(apiModuleCalls, (call) => `${call.method} ${call.normalized}`))
    .filter(([, items]) => new Set(items.map((item) => item.file)).size > 1)
    .map(([endpoint, items]) => ({ endpoint, count: items.length, files: [...new Set(items.map((item) => item.file))] }));

  const duplicateBackend = Array.from(groupBy(backendRoutes, (route) => `${route.method} ${route.normalized}`))
    .filter(([, items]) => items.length > 1)
    .map(([endpoint, items]) => ({ endpoint, count: items.length, routes: items }));

  const backendSet = new Set(backendRoutes.map((route) => `${route.method} ${route.normalized}`));
  const frontendWithoutBackend = frontendCalls
    .filter((call) => !backendSet.has(`${call.method} ${call.normalized}`))
    .filter((call) => !call.normalized.startsWith('/public') && !call.normalized.startsWith('/uploads'))
    .map((call) => ({ endpoint: `${call.method} ${call.normalized}`, file: call.file, rawUrl: call.url }));

  const directCalls = frontendCalls.filter(isDirectApiCall)
    .map((call) => ({ endpoint: `${call.method} ${call.normalized}`, file: call.file, rawUrl: call.url }));

  const servicesApiSource = read(path.join(frontendDir, 'services', 'api.js'));
  const apiIndexSource = read(path.join(frontendDir, 'api', 'index.js'));
  const canonicalEntryOk =
    apiIndexSource.includes('Canonical frontend API entry') &&
    servicesApiSource.includes('Backward-compatible API entry') &&
    servicesApiSource.includes("export * from '../api'");

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      frontendCallCount: frontendCalls.length,
      backendRouteCount: backendRoutes.length,
      frontendApiFileCount: frontendApiFiles.length,
      duplicateFrontendCount: duplicateFrontend.length,
      duplicateApiModuleEndpointCount: duplicateApiModuleEndpoints.length,
      duplicateBackendCount: duplicateBackend.length,
      frontendWithoutBackendCount: frontendWithoutBackend.length,
      directCallCount: directCalls.length,
      canonicalEntryOk,
    },
    duplicateFrontend,
    duplicateApiModuleEndpoints,
    duplicateBackend,
    frontendWithoutBackend,
    directCalls,
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Data API Uniformity Audit',
    '',
    `Generated at: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Frontend static API calls: ${report.summary.frontendCallCount}`,
    `- Backend registered routes: ${report.summary.backendRouteCount}`,
    `- Frontend API modules: ${report.summary.frontendApiFileCount}`,
    `- Duplicate frontend endpoint usages: ${report.summary.duplicateFrontendCount}`,
    `- Duplicate API module endpoint definitions: ${report.summary.duplicateApiModuleEndpointCount}`,
    `- Duplicate backend route definitions: ${report.summary.duplicateBackendCount}`,
    `- Frontend calls without detected backend route: ${report.summary.frontendWithoutBackendCount}`,
    `- Direct page/service calls outside canonical API modules: ${report.summary.directCallCount}`,
    `- Canonical API entry is clean: ${report.summary.canonicalEntryOk ? 'yes' : 'no'}`,
    '',
  ];

  const sections = [
    ['Duplicate API Module Endpoint Definitions', report.duplicateApiModuleEndpoints],
    ['Duplicate Frontend Endpoint Usages', report.duplicateFrontend],
    ['Duplicate Backend Route Definitions', report.duplicateBackend],
    ['Frontend Calls Without Detected Backend Route', report.frontendWithoutBackend],
    ['Direct Calls Outside Canonical API Modules', report.directCalls],
  ];

  for (const [title, items] of sections) {
    lines.push(`## ${title}`, '');
    if (items.length === 0) {
      lines.push('None.', '');
      continue;
    }
    lines.push('```json');
    lines.push(JSON.stringify(items.slice(0, 100), null, 2));
    lines.push('```', '');
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  fs.mkdirSync(docsDir, { recursive: true });
  const report = buildReport();
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(mdPath, renderMarkdown(report));

  console.log(`Data API uniformity audit written to ${mdPath}`);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!report.summary.canonicalEntryOk || report.summary.duplicateBackendCount > 0) {
    process.exitCode = 1;
  }
}

main();
