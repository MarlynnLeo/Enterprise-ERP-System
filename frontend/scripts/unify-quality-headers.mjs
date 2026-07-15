/**
 * 质量模块：在 module-page 顶部插入 PageHeader
 * 从 el-card header 中的 <span>标题</span> 提取标题，并把主操作按钮上移到 PageHeader
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/views/quality');

const FALLBACK_TITLES = {
  'AQLStandards.vue': { title: 'AQL 抽样标准', subtitle: '维护抽样方案与合格判定标准' },
  'EightDReport.vue': { title: '8D 问题解决报告', subtitle: '闭环跟踪质量问题纠正与预防' },
  'FinalInspection.vue': { title: '成品检验', subtitle: '成品检验任务与结果管理' },
  'FirstArticleInspection.vue': { title: '首件检验', subtitle: '首件检验记录与放行管理' },
  'GaugeManagement.vue': { title: '量具管理', subtitle: '量具台账、校准与状态管理' },
  'IncomingInspection.vue': { title: '来料检验', subtitle: '来料检验单创建、执行与判定' },
  'InspectionTemplates.vue': { title: '检验模板', subtitle: '检验项目模板与默认规则' },
  'NonconformingProducts.vue': { title: '不合格品', subtitle: '不合格品登记、处置与闭环' },
  'ProcessInspection.vue': { title: '过程检验', subtitle: '过程检验任务与结果管理' },
  'QualityManagement.vue': { title: '质量管理', subtitle: '质量业务总览' },
  'QualityStatistics.vue': { title: '质量统计', subtitle: '质量指标汇总与趋势分析' },
  'ReplacementOrders.vue': { title: '换货单', subtitle: '不合格换货业务处理' },
  'ReworkTasks.vue': { title: '返工任务', subtitle: '返工任务创建与执行跟踪' },
  'ScrapRecords.vue': { title: '报废记录', subtitle: '报废登记与审核' },
  'SPCControlChart.vue': { title: 'SPC 控制图', subtitle: '过程能力与控制图分析' },
  'SupplierQualityScorecard.vue': { title: '供应商质量计分卡', subtitle: '供应商质量绩效评估' },
};

function extractTitleFromCard(content) {
  // <span>来料检验管理</span> inside card-header near top
  const m = content.match(
    /<div class="card-header">\s*<span>([^<]+)<\/span>/
  );
  if (m) return m[1].trim();
  const m2 = content.match(/<template #header>[\s\S]*?<span>([^<]+)<\/span>/);
  if (m2) return m2[1].trim();
  return null;
}

function extractPrimaryButton(content) {
  // first el-button type="primary" inside first card-header block
  const headerBlock = content.match(
    /<div class="card-header">([\s\S]*?)<\/div>/
  );
  if (!headerBlock) return { button: null, content };
  const block = headerBlock[1];
  const btn = block.match(/<el-button[\s\S]*?<\/el-button>/);
  if (!btn) return { button: null, content };
  // remove button from card-header (keep title span)
  const newBlock = block.replace(btn[0], '').replace(/\n\s*\n/g, '\n');
  const newContent = content.replace(headerBlock[0], `<div class="card-header">${newBlock}</div>`);
  return { button: btn[0], content: newContent };
}

let changed = 0;
const report = [];

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.vue'))) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, 'utf8');
  if (c.includes('<PageHeader')) {
    report.push(`${file}: skip`);
    continue;
  }
  if (!c.includes('module-page')) {
    // ensure module-page
    c = c.replace(/(<template>\s*<div\s+class=")([^"]*)(")/, (_, a, b, d) => {
      if (b.includes('module-page')) return _;
      return `${a}module-page ${b}${d}`;
    });
  }

  const fallback = FALLBACK_TITLES[file] || { title: file.replace('.vue', ''), subtitle: '' };
  const cardTitle = extractTitleFromCard(c);
  const title = cardTitle || fallback.title;
  const subtitle = fallback.subtitle || '';

  let button = null;
  const extracted = extractPrimaryButton(c);
  if (extracted.button) {
    button = extracted.button;
    c = extracted.content;
  }

  const header = button
    ? `<PageHeader title="${title}"${subtitle ? ` subtitle="${subtitle}"` : ''}>\n      <template #actions>\n        ${button}\n      </template>\n    </PageHeader>`
    : `<PageHeader title="${title}"${subtitle ? ` subtitle="${subtitle}"` : ''} />`;

  // insert after root opening div of module-page
  const n = c.replace(
    /(<template>\s*<div[^>]*class="[^"]*module-page[^"]*"[^>]*>)/,
    `$1\n    ${header}\n`
  );

  if (n !== c) {
    fs.writeFileSync(p, n, 'utf8');
    changed += 1;
    report.push(`${file}: ok (${title})`);
  } else {
    report.push(`${file}: fail`);
  }
}

console.log(JSON.stringify({ changed, report }, null, 2));
