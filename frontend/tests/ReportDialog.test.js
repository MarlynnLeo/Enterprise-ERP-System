import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ReportDialog from '@/views/quality/components/ReportDialog.vue'
import printService from '@/services/printService'

vi.mock('@/api', () => ({ qualityApi: {}, purchaseApi: {}, baseDataApi: {} }))
vi.mock('@/constants/systemConstants', () => ({ getQualityInspectionTypeText: type => type || '' }))
vi.mock('element-plus/es/components/message/index', () => ({ ElMessage: { error: vi.fn() } }))
vi.mock('@/services/printService', () => ({ default: {
  generateByDefaultTemplate: vi.fn().mockResolvedValue('<html>report</html>'),
  previewDocument: vi.fn(),
} }))

const Dialog = defineComponent({ template: '<section><slot /><slot name="footer" /></section>' })
const Button = defineComponent({ emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' })
let wrapper
afterEach(() => wrapper?.unmount())

const printReport = async (inspection) => {
  wrapper = mount(ReportDialog, {
    props: { visible: true, inspection: { id: 53, quantity: 1000, inspectionNo: 'QI-1000', ...inspection } },
    global: {
      stubs: { AppDialog: Dialog, ElButton: Button, ElTable: true, ElTableColumn: true, ElTag: true },
      directives: { permission: () => {} },
    },
  })
  await wrapper.findAllComponents(Button).find(button => button.text() === '打印报告').trigger('click')
  await flushPromises()
  return printService.generateByDefaultTemplate.mock.calls.at(-1)[2]
}

import { renderPrintTemplate } from '@/utils/cspSafePrintRenderer'

describe('incoming report sampling quantities', () => {
  it('prints 80 sampled pieces for a 1000-piece lot with the saved AQL plan', async () => {
    const data = await printReport({ sampleQuantity: 80, isAql: true, aqlStandardId: 22, samplingPlan: 'GB/T 2828.1 (II) AQL1.0 - 501~1200', aqlStandardName: '已改名的新方案', aqlLevel: 1, acceptLimit: 2, rejectLimit: 3 })
    expect(data).toMatchObject({ arrival_quantity: 1000, quantity: 1000, sample_quantity: 80, sampling_plan: 'GB/T 2828.1 (II) AQL1.0 - 501~1200，Ac=2，Re=3' })
    expect(wrapper.text()).toContain('抽样数量:80')
    expect(printService.previewDocument).toHaveBeenCalledWith('<html>report</html>')
  })

  it('leaves unrecorded sampling quantities blank instead of calculating a hypothetical plan', async () => {
    const data = await printReport({ sampleQuantity: null, isAql: false, inspectionQuantity: 1000, itemName: '螺钉' })
    expect(data).toMatchObject({ arrival_quantity: 1000, sample_quantity: '' })
    expect(printService.generateByDefaultTemplate).toHaveBeenCalledWith('quality', 'screw_inspection', expect.any(Object))
  })

  it('formats inspection item results to single result text and flags', async () => {
    const data = await printReport({
      items: [
        { itemName: '螺纹直径', result: 'passed', actualValue: 4.0 },
        { itemName: '螺钉长度', result: 'failed', actualValue: 12.5 },
        { itemName: '表面硬度', result: '合格', actualValue: 350 },
      ]
    })
    expect(data.inspection_items).toEqual(expect.arrayContaining([
      expect.objectContaining({ item_name: '螺纹直径', result: '合格', judgment: '合格', result_is_passed: true, result_is_failed: false }),
      expect.objectContaining({ item_name: '螺钉长度', result: '不合格', judgment: '不合格', result_is_passed: false, result_is_failed: true }),
      expect.objectContaining({ item_name: '表面硬度', result: '合格', judgment: '合格', result_is_passed: true, result_is_failed: false }),
    ]))
  })

  it('renders single result in template without checkbox symbols', () => {
    const template = `{{#each inspection_items}}<td class="judgment-cell">{{#if result_is_passed}}合格{{else}}{{#if result_is_failed}}不合格{{else}}{{default result "-"}}{{/if}}{{/if}}</td>{{/each}}`
    const rendered = renderPrintTemplate(template, {
      inspection_items: [
        { result_is_passed: true, result_is_failed: false, result: '合格' },
        { result_is_passed: false, result_is_failed: true, result: '不合格' },
      ]
    })
    expect(rendered).toContain('合格')
    expect(rendered).toContain('不合格')
    expect(rendered).not.toContain('√')
    expect(rendered).not.toContain('□')
    expect(rendered).not.toContain('×')
  })

  it('uses configured signature codes without replacing employee names and calculates recorded defect rates', async () => {
    const data = await printReport({
      inspector: '王晓敏',
      inspectorSignatureCode: 'p',
      reviewerName: '陈挺',
      reviewerSignatureCode: 'a',
      technicalName: '陈贤萍',
      technicalSignatureCode: 'c',
      approverName: '谢爱萍',
      approverSignatureCode: 'p',
      quantity: 500,
      unqualifiedQuantity: 5,
      status: 'failed',
      items: [{ itemName: '头部毛刺', result: 'failed' }]
    })

    expect(data.inspector_signature).toBe('P')
    expect(data.inspector_name).toBe('王晓敏')
    expect(data.reviewer_signature).toBe('A')
    expect(data.technical_signature).toBe('C')
    expect(data.approver_signature).toBe('P')
    expect(data.unqualified_quantity).toBe('5')
    expect(data.unqualified_rate).toBe('1') // (5 / 500) * 100 = 1.0% -> '1'
    expect(data.major_defect).toBe('头部毛刺')
  })

  it('renders names without signature glyphs and leaves unrecorded defects blank', async () => {
    const data = await printReport({ inspectorName: '王晓敏', reviewerName: 'Alice', unqualifiedQuantity: null })
    expect(data).toMatchObject({ inspector_name: '王晓敏', inspector_signature: '', reviewer_name: 'Alice', reviewer_signature: '', unqualified_rate: '' })
    expect(wrapper.findAll('.report-signature-val').map(span => span.text())).toEqual(['王晓敏', 'Alice'])
    expect(wrapper.findAll('.signature-font')).toHaveLength(0)
  })

  it('keeps zero measurements in both template item aliases', async () => {
    const data = await printReport({ items: [{ itemName: '尺寸', actualValue: 0, result: 'passed' }] })
    expect(data.items[0].quantity).toBe(0)
    expect(data.inspection_items).toEqual(data.items)
  })

  it('formats zero unqualified count with 0% rate and clean zero string', async () => {
    const data = await printReport({
      quantity: 1000,
      unqualifiedQuantity: 0,
      status: 'passed',
    })

    expect(data.unqualified_quantity).toBe('0')
    expect(data.unqualified_rate).toBe('0')
    expect(data.major_defect).toBe('')
  })
})
