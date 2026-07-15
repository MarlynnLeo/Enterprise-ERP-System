const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function walk(dir, predicate, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'coverage'].includes(entry.name)) {
        walk(fullPath, predicate, files);
      }
    } else if (!predicate || predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readCorpus(paths) {
  return paths
    .filter((file) => /\.(js|vue|ts|json)$/.test(file))
    .map((file) => `${file}\n${fs.readFileSync(file, 'utf8')}`)
    .join('\n')
    .toLowerCase();
}

function hasAll(corpus, tokens) {
  return tokens.every((token) => corpus.includes(String(token).toLowerCase()));
}

const backend = readCorpus([
  ...walk(path.join(repoRoot, 'backend', 'src')),
  ...walk(path.join(repoRoot, 'backend', 'scripts')),
]);
const frontend = readCorpus(walk(path.join(repoRoot, 'frontend', 'src')));
const mobile = readCorpus(walk(path.join(repoRoot, 'mobile', 'src')));
const tests = readCorpus(walk(path.join(repoRoot, 'backend', 'tests')));

const matrix = [
  { module: 'baseData', name: 'materials', backend: ['materialcontroller', '/materials'], frontend: ['materials.vue'], mobile: ['materials.vue'] },
  { module: 'baseData', name: 'bom', backend: ['bomcontroller', '/boms'], frontend: ['boms.vue'], mobile: ['boms.vue'] },
  { module: 'baseData', name: 'suppliers/customers', backend: ['suppliercustomercontroller'], frontend: ['suppliers.vue', 'customers.vue'], mobile: ['suppliers.vue', 'customers.vue'] },
  { module: 'baseData', name: 'process templates', backend: ['processtemplate'], frontend: ['processtemplates.vue'], mobile: ['processtemplates.vue'] },
  { module: 'baseData', name: 'categories/units/locations', backend: ['categories', 'units', 'locations'], frontend: ['categories.vue', 'units.vue', 'locations.vue'], mobile: ['categories.vue', 'units.vue', 'locations.vue'] },
  { module: 'baseData', name: 'ECN', backend: ['ecn_orders'], frontend: ['ecnmanagement.vue'] },

  { module: 'purchase', name: 'requisitions', backend: ['purchaserequisitioncontroller', '/requisitions'], frontend: ['purchaserequisitions.vue'], mobile: ['requisitions.vue'] },
  { module: 'purchase', name: 'orders', backend: ['purchaseordercontroller', '/orders'], frontend: ['purchaseorders.vue'], mobile: ['orders.vue'] },
  { module: 'purchase', name: 'receipts', backend: ['purchasereceiptcontroller', '/receipts'], frontend: ['purchasereceipts.vue'], mobile: ['receipts.vue'] },
  { module: 'purchase', name: 'returns', backend: ['purchasereturncontroller', '/returns'], frontend: ['purchasereturns.vue'], mobile: ['returns.vue'] },
  { module: 'purchase', name: 'outsourcing', backend: ['outsourced-processings', 'outsourced-receipts'], frontend: ['outsourcedprocessing.vue', '/purchase/outsourced-processings'], mobile: ['processing.vue', '/purchase/outsourced-processings'] },

  { module: 'inventory', name: 'stock', backend: ['inventorystockcontroller', '/stock'], frontend: ['inventorystock.vue'], mobile: ['stock.vue'] },
  { module: 'inventory', name: 'inbound/outbound', backend: ['inventoryinboundcontroller', 'inventoryoutboundcontroller'], frontend: ['inventoryinbound.vue', 'inventoryoutbound.vue'], mobile: ['inbound.vue', 'outbound.vue'] },
  { module: 'inventory', name: 'transfer/check/manual', backend: ['inventorytransfercontroller', 'inventorycheckcontroller', 'inventorymanualcontroller'], frontend: ['inventorytransfer.vue', 'inventorycheck.vue', 'manualtransaction.vue'], mobile: ['transfer.vue', 'check.vue'] },
  { module: 'inventory', name: 'batch ledger and reports', backend: ['inventorybatchcontroller', 'inventoryledgercontroller'], frontend: ['inventorytransaction.vue', 'inventoryreport.vue'], mobile: ['transaction.vue', 'report.vue'] },
  { module: 'inventory', name: 'consistency repair', backend: ['inventoryconsistencycontroller', 'inventoryconsistencyservice'], tests: ['inventoryconsistencyservice'] },

  { module: 'production', name: 'plans/tasks/reports', backend: ['plancontroller', 'taskcontroller', 'reportcontroller'], frontend: ['productionplan.vue', 'productiontask.vue', 'productionreport.vue'], mobile: ['plans.vue', 'tasks.vue', 'report.vue'] },
  { module: 'production', name: 'scheduling/calendar/gantt', backend: ['productionschedulecontroller', 'schedulingservice'], frontend: ['productioncalendar.vue', 'productiongantt.vue'] },
  { module: 'production', name: 'process routes/workstations', backend: ['processroutecontroller', 'workstationcontroller'], frontend: ['processroutes.vue', 'workstations.vue'] },
  { module: 'production', name: 'material readiness/shortage', backend: ['materialreadinessservice', 'productionassistcontroller'], frontend: ['materialreadiness.vue', 'materialshortage.vue'] },
  { module: 'production', name: 'assembly execution', backend: ['assemblyexecutioncontroller', 'assemblyverificationservice'], frontend: ['assemblyboard.vue'] },
  { module: 'production', name: 'anomaly reports', backend: ['anomalyreportcontroller'], frontend: ['anomalyreport.vue'], mobile: ['anomalyreport.vue'] },
  { module: 'production', name: 'equipment monitoring', backend: ['equipmentmonitoringcontroller'], frontend: ['equipmentmonitoring.vue'], mobile: ['equipmentlist.vue'] },

  { module: 'quality', name: 'incoming/process/final inspection', backend: ['inspectioncontroller', 'processinspectioncontroller'], frontend: ['incominginspection.vue', 'processinspection.vue', 'finalinspection.vue'], mobile: ['incoming.vue', 'process.vue', 'final.vue'] },
  { module: 'quality', name: 'first article/templates/standards/aql', backend: ['firstarticlecontroller', 'inspectiontemplatecontroller', 'qualitystandardcontroller', 'aqlcontroller'], frontend: ['firstarticleinspection.vue', 'inspectiontemplates.vue', 'aqlstandards.vue'], mobile: ['templates.vue', 'standards.vue'] },
  { module: 'quality', name: 'nonconformance/rework/scrap/8D', backend: ['nonconformingproductcontroller', 'reworktaskcontroller', 'scraprecordcontroller', 'eightdreportcontroller'], frontend: ['nonconformingproducts.vue', 'reworktasks.vue', 'scraprecords.vue', 'eightdreport.vue'], mobile: ['nonconformance.vue'] },
  { module: 'quality', name: 'SPC/gauge/supplier scorecard', backend: ['spccontroller', 'gaugecontroller', 'supplierqualitycontroller'], frontend: ['spccontrolchart.vue', 'gaugemanagement.vue', 'supplierqualityscorecard.vue'] },
  { module: 'quality', name: 'traceability/statistics/replacement', backend: ['batchtraceabilitycontroller', 'qualitystatisticscontroller', 'replacementordercontroller'], frontend: ['qualitystatistics.vue', 'replacementorders.vue'], mobile: ['traceability.vue', 'reportstatistics.vue'] },

  { module: 'sales', name: 'customers/quotations/orders', backend: ['salescustomercontroller', 'salesquotationcontroller', 'salesordercontroller'], frontend: ['salesquotations.vue', 'salesorders.vue'], mobile: ['salescustomers.vue', 'quotations.vue', 'orders.vue'] },
  { module: 'sales', name: 'outbound/packing/delivery', backend: ['salesoutboundcontroller', 'salespackingcontroller', 'deliverystatscontroller'], frontend: ['salesoutbound.vue', 'packinglists.vue', 'deliverystats.vue'], mobile: ['outbound.vue'] },
  { module: 'sales', name: 'returns/exchanges/contracts', backend: ['salesreturncontroller', 'salesexchangecontroller', 'contractcontroller'], frontend: ['salesreturns.vue', 'salesexchanges.vue', 'contractmanagement.vue'], mobile: ['returns.vue', 'exchanges.vue'] },

  { module: 'finance', name: 'GL accounts/entries/period close', backend: ['financecontroller', '/accounts', '/entries', 'period-closing'], frontend: ['accounts.vue', 'entries.vue', 'periodclosing.vue'], mobile: ['accounts.vue', 'entries.vue', 'periods.vue'] },
  { module: 'finance', name: 'AR/AP/cash/reconciliation', backend: ['arcontroller', 'apcontroller', 'banktransactioncontroller', 'reconciliationcontroller'], frontend: ['ar/invoices.vue', 'ap/invoices.vue', 'reconciliation.vue'], mobile: ['arinvoices.vue', 'apinvoices.vue', 'reconciliation.vue'] },
  { module: 'finance', name: 'tax/budget/expenses', backend: ['taxcontroller', 'budgetcontroller', 'expensecontroller'], frontend: ['taxinvoices.vue', 'budgetlist.vue', 'expenses.vue'] },
  { module: 'finance', name: 'costing/pricing/profitability', backend: ['costcontroller', 'standardcostversioncontroller', 'pricingcontroller', 'profitabilitycontroller'], frontend: ['costdashboard.vue', 'standardcost.vue', 'productpricing.vue', 'profitabilityanalysis.vue'] },
  { module: 'finance', name: 'assets/CIP/depreciation/inventory', backend: ['assetscontroller', 'cipcontroller', 'inventorycontroller'], frontend: ['assetslist.vue', 'ciplist.vue', 'depreciation.vue', 'assetinventory.vue'], mobile: ['assets.vue'] },
  { module: 'finance', name: 'statutory reports', backend: ['balancesheet', 'cashflow', 'incomestatement'], frontend: ['balancesheet.vue', 'cashflow.vue', 'incomestatement.vue'], mobile: ['balancesheet.vue', 'cashflowreport.vue', 'incomestatement.vue'] },

  { module: 'hr', name: 'employees/departments', backend: ['hrcontroller', '/employees'], frontend: ['employees.vue'], mobile: ['employees.vue', 'departments.vue'] },
  { module: 'hr', name: 'attendance/leave/overtime/salary', backend: ['/attendance', '/leave', '/overtime', '/salary'], frontend: ['attendance.vue', 'salary.vue'], mobile: ['attendance.vue', 'leave.vue', 'overtime.vue'] },
  { module: 'hr', name: 'performance/skills', backend: ['performance_evaluations', 'employeeskillcontroller'], frontend: ['performance.vue', 'employeeskills.vue'] },

  { module: 'equipment', name: 'equipment list/maintenance/inspection/status', backend: ['equipmentroutes', 'maintenance', 'inspection'], frontend: ['equipmentlist.vue', 'maintenance.vue', 'inspection.vue', 'status.vue'], mobile: ['equipmentlist.vue', 'maintenance.vue', 'check.vue'] },

  { module: 'system', name: 'users/roles/menus/permissions', backend: ['/users', '/roles', '/menus', 'rolepermissions'], frontend: ['users.vue', 'permissions.vue'], mobile: ['users.vue', 'roles.vue', 'permissions.vue'] },
  { module: 'system', name: 'departments/settings/business types', backend: ['/departments', '/settings', 'business-types'], frontend: ['departments.vue', 'businesstypes.vue'], mobile: ['departments.vue', 'config.vue'] },
  { module: 'system', name: 'backup lifecycle', backend: ['/backup', '/backups', 'verifybackup'], frontend: ['backup.vue', 'verifybackup'], mobile: ['backup.vue', 'verifybackup'], tests: ['backupservice.verifybackup'] },
  { module: 'system', name: 'audit logs/failed jobs/monitoring', backend: ['/logs', 'failed-jobs', '/monitoring'], frontend: ['getlogs', 'getfailedjobs'], mobile: ['logs.vue'] },
  { module: 'system', name: 'workflow/notifications/print/documents', backend: ['workflowcontroller', 'notificationcontroller', 'printcontroller', 'document'], frontend: ['workflowmanagement.vue', 'notifications.vue', 'print.vue', 'documentmanagement.vue'] },
  { module: 'system', name: 'technical communication/business alerts', backend: ['technicalcommunicationcontroller', 'alerts'], frontend: ['technicalcommunication.vue', 'businessalerts.vue'] },

  { module: 'crossModule', name: 'full business UAT', backend: ['costaccountingservice', 'dataconsistencyrules'], tests: ['uat-full-business-flow', 'purchase', 'production', 'quality', 'sales', 'finance'] },
  { module: 'crossModule', name: 'audit and permission gates', backend: ['auditloginterceptor', 'requirepermission', 'datascopeservice'], tests: ['production readiness audit', 'auditloginterceptor'] },
];

function evaluateCapability(capability) {
  const missing = [];
  if (capability.backend && !hasAll(backend, capability.backend)) missing.push('backend');
  if (capability.frontend && !hasAll(frontend, capability.frontend)) missing.push('frontend');
  if (capability.mobile && !hasAll(mobile, capability.mobile)) missing.push('mobile');
  if (capability.tests && !hasAll(tests, capability.tests)) missing.push('tests');
  return { ...capability, missing };
}

function main() {
  const results = matrix.map(evaluateCapability);
  const failed = results.filter((result) => result.missing.length > 0);
  const moduleCounts = results.reduce((acc, result) => {
    acc[result.module] = (acc[result.module] || 0) + 1;
    return acc;
  }, {});

  console.log('Module completeness audit');
  console.log(`capabilities checked: ${results.length}`);
  console.log(`modules checked: ${Object.keys(moduleCounts).length}`);
  console.log(`capabilities with gaps: ${failed.length}`);
  for (const [moduleName, count] of Object.entries(moduleCounts)) {
    console.log(`module: ${moduleName} capabilities=${count}`);
  }
  for (const result of failed) {
    console.log(`gap: ${result.module}.${result.name} missing=${result.missing.join(',')}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  } else {
    console.log('Result: OK');
  }
}

if (require.main === module) main();

module.exports = { matrix, evaluateCapability };
