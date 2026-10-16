import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import SidebarMenu from '@/components/layout/SidebarMenu.vue';
import ReportCenter from '@/views/finance/reports/ReportCenter.vue';
import financeRoutes from '@/router/modules/finance';
import { financePerms } from '@/utils/permissions/financePerms';
import { buildMenuTree, menuPermissions } from '@/utils/menuPermissions';
import { getMenuLabel } from '@/utils/menuLabels';
import { prepareMenuTree, resolveMenuNavigationState } from '@/utils/menuTree';
import zhCN from '@/locales/zhCN';

const state = vi.hoisted(() => ({ permissions: [] }));
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ hasPermission: permission => state.permissions.includes(permission) }) }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }));

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

describe('legacy financial report center', () => {
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

});

describe('financial report directory', () => {
  const reportPaths = [
    '/finance/reports/balance-sheet',
    '/finance/reports/income-statement',
    '/finance/reports/standard-cash-flow',
    '/finance/reports/cash-flow',
    ...['vat', 'quantity', 'general', 'cash', 'payable'].map(type => `/finance/reports/ledgers/${type}`),
  ];

  test('keeps four existing reports and five ledgers directly under one directory', () => {
    const menu = financePerms.find(menu => menu.path === '/finance/reports');
    expect(menu).toMatchObject({ name: '财务报表', type: 0, permission: 'finance:reports', component: '' });
    expect(getMenuLabel(menu, key => zhCN.menu[key.slice('menu.'.length)])).toBe('财务报表');
    expect(getMenuLabel({ permission: 'finance:reports' }, key => zhCN.menu[key.slice('menu.'.length)])).toBe('财务报表');
    const children = financePerms.filter(child => child.parentId === menu.id).sort((a, b) => a.sort - b.sort);
    expect(children.map(child => child.path)).toEqual(reportPaths);
    expect(children.slice(0, 4).map(child => child.id)).toEqual([716, 717, 718, 7205]);
    for (const reportMenu of [menu, ...children]) {
      expect(menuPermissions.filter(item => item.id === reportMenu.id)).toHaveLength(1);
    }
    for (const child of children) {
      expect(child.type).toBe(1);
      expect(financePerms.filter(item => item.path === child.path)).toHaveLength(1);
      const route = financeRoutes.children.find(route => `/finance/${route.path}` === child.path);
      expect(route, child.path).toBeDefined();
      expect(route.meta.permission).toBe(child.permission);
    }
    expect(financeRoutes.children.find(route => route.path === 'reports/balance-sheet').component.toString()).toContain('BalanceSheet.vue');
  });

  test('expands the sidebar directory and navigates directly to each report', async () => {
    const menus = prepareMenuTree(buildMenuTree(financePerms));
    const financeMenu = menus.find(menu => menu.path === '/finance');
    const reportsMenu = financeMenu.children.find(menu => menu.path === '/finance/reports');
    wrapper = mount(SidebarMenu, { props: { menus }, global: { stubs: { ElIcon: stubs.ElIcon } } });
    await wrapper.get(`[data-menu-index="${financeMenu.menuIndex}"] > button`).trigger('click');
    const directory = wrapper.get(`[data-menu-index="${reportsMenu.menuIndex}"] > button`);
    expect(directory.attributes('aria-expanded')).toBe('false');
    await directory.trigger('click');
    expect(directory.attributes('aria-expanded')).toBe('true');
    expect(wrapper.emitted('navigate')).toBeUndefined();
    for (const path of reportPaths) {
      const link = wrapper.get(`[data-menu-index="${path}"] > button`);
      expect(link.element.parentElement.hidden).toBe(false);
      await link.trigger('click');
      expect(wrapper.emitted('navigate').at(-1)).toEqual([path]);
      expect(resolveMenuNavigationState(menus, path)).toMatchObject({
        activePath: path, openeds: [financeMenu.menuIndex, reportsMenu.menuIndex],
      });
    }
    await directory.trigger('click');
    expect(wrapper.get(`[data-menu-index="${reportPaths[0]}"]`).element.hidden).toBe(true);
    expect(wrapper.emitted('navigate')).toHaveLength(reportPaths.length);
  });

  test('redirects the old reports URL to the balance sheet and preserves direct report routes', async () => {
    const index = financeRoutes.children.find(route => route.path === 'reports');
    expect(index.component).toBeUndefined();
    expect(index.redirect).toBe('/finance/reports/balance-sheet');
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{
        ...financeRoutes,
        path: '/finance',
        component: { template: '<router-view />' },
        children: financeRoutes.children.map(route => ({
          ...route, component: route.component ? { template: '<div />' } : undefined,
        })),
      }],
    });
    await router.push('/finance/reports?period=2026-10');
    expect(router.currentRoute.value.fullPath).toBe('/finance/reports/balance-sheet?period=2026-10');
    for (const path of reportPaths) {
      await router.push(path);
      expect(router.currentRoute.value.path).toBe(path);
    }
  });
});
