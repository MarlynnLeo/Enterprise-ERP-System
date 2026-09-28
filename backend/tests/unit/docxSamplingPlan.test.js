const Parser = require('../../src/services/business/quality/DocxInspectionTemplateParser');
const Resolver = require('../../src/services/business/InspectionTemplateResolverService');

afterEach(() => jest.restoreAllMocks());

function parsePlan(plan) {
  const rows = [
    ...(Array.isArray(plan) ? plan.map((line) => [line]) : [[`抽样方案：${plan}`]]),
    ['项目', '检验要求/标准', '检测方法'],
    ['外观', '无破损', '目视'],
  ];
  const xml = `<w:tbl>${rows.map((row) => `<w:tr>${row.map((cell) => `<w:tc><w:p><w:r><w:t>${cell}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
  jest.spyOn(Parser, 'extractDocxDocumentXml').mockReturnValue(xml);
  return Parser.parseQualityInspectionDocx(Buffer.alloc(0), 'test.docx');
}

test('separates numeric AQL from the GB standard and general inspection level', () => {
  const parsed = parsePlan('GB/T 2828.1 一般检验水平 II AQL=1.0');
  expect(parsed).toMatchObject({ isAql: true, aqlLevel: '1', samplingWarning: '' });
  expect(parsed.description).toContain('GB/T 2828.1');
});

test('preserves all CR/MAJ/MIN values and does not silently select one', () => {
  const parsed = parsePlan('GB/T 2828.1 II CR AQL=0.065 MAJ AQL=1.0 MIN AQL=2.5');
  expect(parsed.aqlLevel).toBeNull();
  expect(parsed.samplingWarning).toContain('多个 AQL');
  expect(parsed.description).toContain('CR AQL=0.065 MAJ AQL=1.0 MIN AQL=2.5');
});

test('does not invent an AQL when the document only states an inspection level', () => {
  const parsed = parsePlan('GB/T 2828.1 一般检验水平 II');
  expect(parsed.aqlLevel).toBeNull();
  expect(parsed.samplingWarning).toContain('未给出数值 AQL');
});

test('keeps AQL categories distributed over multiple document rows', () => {
  const parsed = parsePlan(['抽样方案：GB/T 2828.1 II', 'CR AQL=0.065', 'MAJ aql=1.0']);
  expect(parsed.aqlLevel).toBeNull();
  expect(parsed.description).toContain('CR AQL=0.065');
  expect(parsed.description).toContain('MAJ aql=1.0');
  expect(parsed.samplingWarning).toContain('多个 AQL');
});

test('refuses saving an enabled template with a standard name instead of numeric AQL', () => {
  expect(() =>
    Resolver.validateTemplateDefinition({
      template_name: '来料',
      inspection_type: 'incoming',
      version: '1',
      is_general: true,
      is_aql: true,
      aql_level: 'GB/T 2828.1 II',
      items: [{ item_name: '外观', standard: '无破损' }],
    })
  ).toThrow('数值 AQL');
});
