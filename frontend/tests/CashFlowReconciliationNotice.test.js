import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Notice from '@/views/finance/reports/CashFlowReconciliationNotice.vue';

const mountNotice = (summary, unitText = '元') => mount(Notice, {
  props: { summary, unitText },
  global: { stubs: { 'el-alert': {
    props: ['title'], template: '<section role="alert"><h3>{{ title }}</h3><slot /></section>',
  } } },
});

describe('cash-flow reconciliation result', () => {
  it('keeps unresolved differences and mixed-purpose vouchers visible in the report unit', () => {
    const wrapper = mountNotice({ isReconciled: false, reconciliationDifference: -25.5, ambiguousEntryIds: [7, 8] }, '万元');
    expect(wrapper.get('[role="alert"]').text()).toContain('-25.50 万元');
    expect(wrapper.text()).toContain('2 张混合用途凭证');
    expect(wrapper.text()).toContain('期末现金余额取自总账');
  });
  it('still warns when unresolved classification has no net monetary difference', () => {
    expect(mountNotice({ isReconciled: false, reconciliationDifference: 0, ambiguousEntryIds: [7] }).find('[role="alert"]').exists()).toBe(true);
  });
  it.each([null, {}, { isReconciled: true }])('does not assert an error without an unreconciled result', summary => {
    expect(mountNotice(summary).find('[role="alert"]').exists()).toBe(false);
  });
});
