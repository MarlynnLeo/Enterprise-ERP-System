const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(rootDir, '..');
const { legacyCleanupCandidates: cleanupCandidates } = require('../src/services/business/LegacyCodeCleanupRules');

function walk(dir, predicate, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.git'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, result);
    } else if (!predicate || predicate(fullPath)) {
      result.push(fullPath);
    }
  }
  return result;
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`);
}

function printMetric(name, value) {
  console.log(`${name}: ${value}`);
}

function requireOptional(modulePath) {
  try {
    return require(modulePath);
  } catch (error) {
    return { error };
  }
}

function auditBusinessClosure() {
  printHeader('Business Closure Audit');
  const { BUSINESS_CLOSURES } = require('../src/constants/businessClosureRegistry');
  const { STATUS_REGISTRY } = require('../src/constants/statusRegistry');
  const { consistencyRules } = require('../src/services/business/DataConsistencyRules');

  const closureIds = Object.keys(BUSINESS_CLOSURES);
  const rulesByClosure = new Map();
  for (const rule of consistencyRules) {
    rulesByClosure.set(rule.closure, (rulesByClosure.get(rule.closure) || 0) + 1);
  }

  const issues = [];
  for (const [id, closure] of Object.entries(BUSINESS_CLOSURES)) {
    if (!closure.start || !closure.end || !Array.isArray(closure.steps) || closure.steps.length < 3) {
      issues.push(`${id}: incomplete closure path`);
    }
    if (!rulesByClosure.has(id)) {
      issues.push(`${id}: no data consistency rule`);
    }
    for (const step of closure.steps || []) {
      if (step.statusDomain && !STATUS_REGISTRY[step.statusDomain]) {
        issues.push(`${id}: unknown status domain ${step.statusDomain}`);
      }
    }
  }

  printMetric('closures', closureIds.length);
  printMetric('status domains', Object.keys(STATUS_REGISTRY).length);
  printMetric('consistency rules', consistencyRules.length);
  printMetric('cleanup candidates', cleanupCandidates.length);

  if (issues.length) {
    console.error('\nIssues:');
    issues.forEach(issue => console.error(`- ${issue}`));
    process.exitCode = 1;
  } else {
    console.log('Result: OK');
  }
}

function auditFunctionalCoverage() {
  printHeader('Functional Coverage Audit');
  const backendRoutes = walk(path.join(rootDir, 'src', 'routes'), file => file.endsWith('.js'));
  const backendControllers = walk(path.join(rootDir, 'src', 'controllers'), file => file.endsWith('.js'));
  const backendServices = walk(path.join(rootDir, 'src', 'services'), file => file.endsWith('.js'));
  const frontendViews = walk(path.join(repoRoot, 'frontend', 'src', 'views'), file => file.endsWith('.vue'));
  const mobileViews = walk(path.join(repoRoot, 'mobile', 'src', 'views'), file => file.endsWith('.vue'));
  const tests = walk(path.join(rootDir, 'tests'), file => /\.test\.js$|\.spec\.js$/.test(file));

  printMetric('backend routes', backendRoutes.length);
  printMetric('backend controllers', backendControllers.length);
  printMetric('backend services', backendServices.length);
  printMetric('frontend views', frontendViews.length);
  printMetric('mobile views', mobileViews.length);
  printMetric('test files', tests.length);

  const requiredAreas = ['auth', 'purchase', 'sales', 'inventory', 'finance'];
  const missingTests = requiredAreas.filter(area => !tests.some(file => path.basename(file).includes(area)));
  if (missingTests.length) {
    console.warn(`Warning: missing named integration tests for ${missingTests.join(', ')}`);
  }

  console.log('Result: OK');
}

function auditStatusConsistency() {
  printHeader('Status Consistency Audit');
  const { STATUS_REGISTRY, getAllowedTransitions, isKnownStatus } = require('../src/constants/statusRegistry');
  const issues = [];

  for (const [domain, definition] of Object.entries(STATUS_REGISTRY)) {
    for (const [from, nextValues] of Object.entries(definition.transitions || {})) {
      if (!isKnownStatus(domain, from)) issues.push(`${domain}: unknown transition source ${from}`);
      for (const to of getAllowedTransitions(domain, from)) {
        if (!isKnownStatus(domain, to)) issues.push(`${domain}: unknown transition target ${from} -> ${to}`);
      }
      if (!Array.isArray(nextValues)) issues.push(`${domain}: transition ${from} is not an array`);
    }
  }

  printMetric('status domains', Object.keys(STATUS_REGISTRY).length);
  if (issues.length) {
    issues.forEach(issue => console.error(`- ${issue}`));
    process.exitCode = 1;
  } else {
    console.log('Result: OK');
  }
}

function auditLegacyCode() {
  printHeader('Legacy Code Audit');
  for (const candidate of cleanupCandidates) {
    const exists = fs.existsSync(path.join(repoRoot, candidate.path));
    console.log(`${exists ? 'present' : 'missing'}: ${candidate.path} -> ${candidate.replacement}`);
  }
  printMetric('candidates', cleanupCandidates.length);
  console.log('Result: OK');
}

async function auditDataConsistency() {
  printHeader('Data Consistency Audit');
  const missingDbVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter(name => !process.env[name]);
  if (missingDbVars.length) {
    console.warn(`Skipped: missing database env vars ${missingDbVars.join(', ')}`);
    return;
  }

  const db = require('../src/config/db');
  const { runDataConsistencyAudit } = require('../src/services/business/DataConsistencyRules');
  let connection;
  try {
    connection = await db.getConnection();
    const auditResult = await runDataConsistencyAudit(connection);
    const results = Array.isArray(auditResult) ? auditResult : auditResult?.results || [];
    const failed = results.filter(result => result.count > 0 || result.error);
    printMetric('rules executed', results.length);
    printMetric('rules with findings', failed.length);
    for (const result of failed) {
      console.log(`${result.id}: ${result.count || 0}${result.error ? ` (${result.error})` : ''}`);
    }
    if (failed.length) process.exitCode = 1;
  } finally {
    connection?.release?.();
  }
}

function auditDataApiUniformity() {
  printHeader('Data API Uniformity Audit');
  const app = fs.readFileSync(path.join(rootDir, 'src', 'app.js'), 'utf8');
  const routeMatches = new Set(
    [...app.matchAll(/\[\s*['"]([^'"]+)['"]/g)].map(match => `/api${match[1]}`)
  );
  for (const match of app.matchAll(/app\.use\(\s*['"](\/api\/[^'"]+)['"]/g)) {
    routeMatches.add(match[1]);
  }
  for (const match of app.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*['"](\/api\/[^'"]+)['"]/g)) {
    routeMatches.add(match[1]);
  }
  const frontendApiFiles = [
    ...walk(path.join(repoRoot, 'frontend', 'src'), file => /\.(js|vue)$/.test(file)),
    ...walk(path.join(repoRoot, 'mobile', 'src'), file => /\.(js|vue)$/.test(file)),
  ];
  const endpoints = new Set();
  const endpointPattern = /(?:api|fastApi)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*([`'"])(\/[^`'"]*)\1/g;
  const allowedDirectHttpFiles = new Set([
    'frontend/src/services/axiosInstance.js',
    'mobile/src/api/index.js',
  ]);
  const directHttpPattern = /\bfetch\s*\(|\bXMLHttpRequest\b|\buni\s*\.\s*request\b|import\s+axios\s+from\s+['"]axios['"]|require\(\s*['"]axios['"]\s*\)/g;
  const hardcodedApiPrefixPattern = /\b(?:api|fastApi)\s*\.\s*(?:get|post|put|patch|delete)\s*\(\s*([`'"])\/api\//g;
  const directHttpBypasses = [];
  const hardcodedApiPrefixes = [];
  for (const file of frontendApiFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(endpointPattern)) {
      endpoints.add(match[2]);
    }
    const rel = relative(file);
    for (const match of text.matchAll(directHttpPattern)) {
      if (!allowedDirectHttpFiles.has(rel)) {
        directHttpBypasses.push(`${rel}:${lineNumberAt(text, match.index)}`);
      }
    }
    for (const match of text.matchAll(hardcodedApiPrefixPattern)) {
      hardcodedApiPrefixes.push(`${rel}:${lineNumberAt(text, match.index)}`);
    }
  }
  const missing = [...endpoints].filter(endpoint => {
    const full = endpoint.startsWith('/api/') ? endpoint : `/api${endpoint}`;
    return ![...routeMatches].some(prefix => full === prefix || full.startsWith(`${prefix}/`));
  });

  const backendFiles = [
    ...walk(path.join(rootDir, 'src', 'controllers'), file => file.endsWith('.js')),
    ...walk(path.join(rootDir, 'src', 'routes'), file => file.endsWith('.js')),
  ];
  const manualPaginatedResponses = [];
  const manualPaginatedPattern = /ResponseHandler\.success\(\s*res\s*,\s*\{[\s\S]*?\}\s*(?:,\s*[^)]*)?\)/g;
  for (const file of backendFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(manualPaginatedPattern)) {
      const body = match[0];
      if (
        /\b(list|items|rows|data)\s*:/.test(body)
        && /\btotal\s*:/.test(body)
        && /\bpage\s*:/.test(body)
        && /\bpageSize\s*:/.test(body)
      ) {
        manualPaginatedResponses.push(`${relative(file)}:${lineNumberAt(text, match.index)}`);
      }
    }
  }

  printMetric('frontend/mobile literal endpoints', endpoints.size);
  printMetric('backend top-level api mounts', routeMatches.size);
  printMetric('unmatched endpoints', missing.length);
  printMetric('direct HTTP bypasses', directHttpBypasses.length);
  printMetric('hardcoded /api prefixes', hardcodedApiPrefixes.length);
  printMetric('manual paginated success responses', manualPaginatedResponses.length);
  console.warn('Note: this audit validates top-level API mount coverage only; concrete subroutes are not fully verified.');
  missing.slice(0, 20).forEach(endpoint => console.log(`unmatched: ${endpoint}`));
  directHttpBypasses.slice(0, 20).forEach(location => console.log(`direct-http-bypass: ${location}`));
  hardcodedApiPrefixes.slice(0, 20).forEach(location => console.log(`hardcoded-api-prefix: ${location}`));
  manualPaginatedResponses.slice(0, 20).forEach(location => console.log(`manual-paginated-response: ${location}`));
  if (missing.length || directHttpBypasses.length || hardcodedApiPrefixes.length || manualPaginatedResponses.length) process.exitCode = 1;
  else console.log('Result: OK');
}

function auditNamedArea(area) {
  printHeader(`${area} Audit`);
  const files = walk(path.join(rootDir, 'src'), file => file.endsWith('.js'))
    .filter(file => relative(file).toLowerCase().includes(area.toLowerCase()));
  printMetric('matching source files', files.length);
  files.slice(0, 20).forEach(file => console.log(relative(file)));
  console.log('Result: OK');
}

module.exports = {
  auditBusinessClosure,
  auditFunctionalCoverage,
  auditStatusConsistency,
  auditLegacyCode,
  auditDataConsistency,
  auditDataApiUniformity,
  auditNamedArea,
  requireOptional,
};
