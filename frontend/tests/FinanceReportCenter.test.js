import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ReportCenter from '@/views/finance/reports/ReportCenter.vue';
import financeRoutes from '@/router/modules/finance';
import { financePerms } from '@/utils/permissions/financePerms';
import { getMenuLabel } from '@/utils/menuLabels';

const state = vi.hoisted(() => ({ permissions: [] }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: permission => state.permissions.includes(permission) }) }));

let wrapper;
const stubs = {
  ElCard: { template: '<div><slot /></div>' },
  ElIcon: { template: '<span><slot /></span>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  ElEmpty: { props: ['description'], template: '<div>{{ description }}<slot /></div>' },
  ElButton: { template: '<button><slot /></button>' },
  RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
};
const open = () => { wrapper = mount(ReportCenter, { global: { stubs } }); };
const links = () => wrapper.findAll('a').map(link => link.attributes('href'));

beforeEach(() => { state.permissions = ['finance:reports:view']; });
afterEach(() => wrapper?.unmount());

describe('financial report center', () => {
  test('makes the five requested ledgers and existing financial statements reachable with the reports permission', () => {
    open();
    for (const type of ['vat', 'quantity', 'general', 'cash', 'payable']) {
      const path = `/finance/reports/ledgers/${type}`;
      expect(links()).toContain(path);
      const route = financeRoutes.children.find(route => `/finance/${route.path}` === path);
      expect(route.props).toEqual({ type });
      expect(route.meta.permission).toBe('finance:reports:view');
      expect(route.component.toString()).toContain('LedgerReport.vue');
    }
    expect(links()).toEqual(expect.arrayContaining([
      '/finance/reports/balance-sheet', '/finance/reports/income-statement',
      '/finance/reports/cash-flow', '/finance/gl/trial-balance', '/finance/ar/aging', '/finance/ap/aging',
    ]));
    expect(links()).not.toContain('/finance/reports/standard-cash-flow');
    expect(links()).not.toContain('/finance/cost/ledger');
    expect(wrapper.findAll('.report-center__category').map(button => button.text())).not.toContain('经营分析');
  });

  test('every offered existing report uses a registered route with its exact viewing permission', () => {
    state.permissions = [
      'finance:reports:view', 'finance:reports:standard-cash-flow:view', 'finance:ar:view',
      'finance:ap:view', 'finance:assets:view', 'finance:budgets:view', 'finance:cost:view',
    ];
    open();
    expect(links()).toHaveLength(19);
    for (const path of links()) {
      const route = financeRoutes.children.find(route => `/finance/${route.path}` === path);
      expect(route, path).toBeDefined();
      expect(state.permissions).toContain(route.meta.permission);
    }
  });

  test('searches descriptions and combines keywords with category filtering', async () => {
    open();
    await wrapper.get('input').setValue('增值税 出口退税');
    expect(links()).toEqual(['/finance/reports/ledgers/vat']);
    await wrapper.get('input').setValue('');
    await wrapper.findAll('.report-center__category').find(button => button.text() === '财务报表').trigger('click');
    expect(links()).toHaveLength(4);
    expect(links()).not.toContain('/finance/reports/ledgers/vat');
    await wrapper.get('input').setValue('找不到的报表');
    expect(wrapper.text()).toContain('没有匹配的报表');
    await wrapper.findAll('button').find(button => button.text() === '清除筛选').trigger('click');
    await nextTick();
    expect(links()).toHaveLength(11);
  });

  test('never shows links without authorization, including when directly mounted', () => {
    state.permissions = [];
    open();
    expect(links()).toEqual([]);
    expect(wrapper.text()).toContain('暂无可查看的报表');
    expect(wrapper.text()).not.toContain('增值税多栏账');
  });

  test('exposes the report center in menu definitions and preserves the balance sheet route', () => {
    const menu = financePerms.find(menu => menu.path === '/finance/reports');
    expect(menu).toMatchObject({ permission: 'finance:reports:view', component: 'finance/reports/ReportCenter' });
    expect(getMenuLabel(menu, key => key)).toBe('menu.reportCenter');
    expect(financeRoutes.children.find(route => route.path === 'reports').meta.permission).toBe('finance:reports:view');
    expect(financeRoutes.children.find(route => route.path === 'reports/balance-sheet').component.toString()).toContain('BalanceSheet.vue');
  });
});
