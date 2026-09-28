import { describe, expect, test } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { getNavigationTabTitle } from '../src/utils/navigationTabLabels'
import financeRoute from '../src/router/modules/finance'
import zhCN from '../src/locales/zhCN'
import en from '../src/locales/en'
import ko from '../src/locales/ko'

const page = { render: () => null }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: page },
    { path: '/production/calendar', component: page, meta: { title: '生产日历' } },
    { path: '/finance/settings', component: page, meta: { title: '财务设置' } },
    { path: '/finance/budget/edit/:id', component: page, meta: { permission: 'finance:budgets:update' } },
    { path: '/profile', component: page, meta: { title: '个人中心', titleKey: 'user.profile' } },
    ...['receipt', 'payment', 'transfer', 'general'].map((type) => ({
      path: `/finance/gl/entries/${type}`, component: page,
      meta: financeRoute.children.find((route) => route.path === `gl/entries/${type}`).meta
    })),
    { path: '/finance/cost/standard', component: page, meta: { permission: 'finance:cost:view' } },
    { path: '/finance/cost/versions', component: page, meta: financeRoute.children.find((route) => route.path === 'cost/versions').meta },
    { path: '/finance/cost/closing', component: page, meta: financeRoute.children.find((route) => route.path === 'cost/closing').meta },
    { path: '/finance/assets/detail/:id', component: page, meta: { title: '固定资产详情' } },
    { path: '/localized-detail/:id', component: page, meta: { titleKey: 'menu.materials' } },
    { path: '/custom-report', name: 'custom-report', component: page, meta: { title: '专项报表', permission: 'finance:reports:view' } },
    { path: '/localized-report', component: page, meta: { title: '旧标题', titleKey: 'menu.productionCalendar' } },
    { path: '/extension-page', name: 'extension-page', component: page }
  ]
})
const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  messages: { 'zh-CN': zhCN, en, ko }
})
const menuByPath = new Map([
  ['/production/calendar', { path: '/production/calendar', name: '生产日历' }],
  ['/finance/settings', { path: '/finance/settings', name: '财务设置' }],
  ['/finance/settings?tab=automation', { path: '/finance/settings?tab=automation', name: '财务自动化' }],
  ['/custom-report', { path: '/custom-report', name: 'Custom', permission: 'finance:reports' }],
  ['/extension-page', { path: '/extension-page', name: 'Extension page' }]
])
const queryMenus = [...menuByPath.values()].filter((menu) => menu.path.includes('?'))
const titleFor = (fullPath, options = {}) => getNavigationTabTitle({
  path: router.resolve(fullPath).path,
  fullPath,
  ...options
}, { router, menuByPath, queryMenus, t: i18n.global.t })

describe('navigation tab labels', () => {
  test.each([
    ['zh-CN', '生产日历'],
    ['en', 'Production Calendar'],
    ['ko', '생산 캘린더']
  ])('uses the %s menu translation instead of a static route title', (locale, expected) => {
    i18n.global.locale.value = locale
    expect(titleFor('/production/calendar')).toBe(expected)
  })

  test('updates an already opened page title when the language changes', () => {
    i18n.global.locale.value = 'en'
    expect(titleFor('/production/calendar')).toBe(en.menu.productionCalendar)
    i18n.global.locale.value = 'ko'
    expect(titleFor('/production/calendar')).toBe(ko.menu.productionCalendar)
  })

  test('keeps query menu titles while allowing extra filters and a hash', () => {
    i18n.global.locale.value = 'en'
    expect(titleFor('/finance/settings?page=2&tab=automation#rules')).toBe(en.menu.financeAutomation)
    expect(titleFor('/finance/settings?tab=general')).toBe(en.menu.financeSettings)
    expect(titleFor('/finance/settings/')).toBe(en.menu.financeSettings)
    expect(titleFor('/finance/settings/?tab=automation')).toBe(en.menu.financeAutomation)
  })

  test('preserves explicit title keys, unknown route titles, and menu-name fallbacks', () => {
    i18n.global.locale.value = 'en'
    expect(titleFor('/localized-report')).toBe(en.menu.productionCalendar)
    expect(titleFor('/custom-report')).toBe('专项报表')
    expect(titleFor('/extension-page')).toBe('Extension page')
  })

  test('uses a translated home label and includes the record id on detail tabs', () => {
    i18n.global.locale.value = 'en'
    expect(titleFor('/', { pinned: true })).toBe(en.menu.dashboard)
    expect(titleFor('/finance/budget/edit/12')).toBe(`${en.menu.budgetManagement} · 12`)
    expect(titleFor('/finance/budget/edit/13')).toBe(`${en.menu.budgetManagement} · 13`)
    expect(titleFor('/finance/budget/edit/13/')).toBe(`${en.menu.budgetManagement} · 13`)
    expect(titleFor('/finance/assets/detail/27')).toBe('固定资产详情 · 27')
    expect(titleFor('/localized-detail/42')).toBe(`${en.menu.materials} · 42`)
  })

  test.each([
    ['zh-CN', zhCN], ['en', en], ['ko', ko]
  ])('keeps specific finance page titles distinct in %s', (locale, messages) => {
    i18n.global.locale.value = locale
    const voucherTitles = ['receipt', 'payment', 'transfer', 'general']
      .map((type) => titleFor(`/finance/gl/entries/${type}`))
    expect(voucherTitles).toEqual([
      messages.navigationPages.receiptVoucher, messages.navigationPages.paymentVoucher,
      messages.navigationPages.transferVoucher, messages.navigationPages.generalVoucher
    ])
    expect(new Set(voucherTitles).size).toBe(4)
    expect(titleFor('/finance/cost/versions')).toBe(messages.navigationPages.costVersions)
    expect(titleFor('/finance/cost/versions')).not.toBe(titleFor('/finance/cost/standard'))
    expect(titleFor('/finance/cost/closing')).toBe(messages.navigationPages.costClosing)
    expect(titleFor('/profile')).toBe(messages.user.profile)
  })

  test.each([
    ['zh-CN', zhCN, '关闭 生产日历'],
    ['en', en, 'Close Production Calendar'],
    ['ko', ko, '생산 캘린더 닫기']
  ])('provides every tab control and an interpolated close label in %s', (locale, messages, closeLabel) => {
    i18n.global.locale.value = locale
    for (const key of ['openPages', 'pageTabs', 'scrollLeft', 'scrollRight', 'closeTab', 'closeOthers', 'keepCurrentAndHome']) {
      expect(messages.navigationTabs[key]).toBeTruthy()
    }
    expect(i18n.global.t('navigationTabs.closeTab', { title: messages.menu.productionCalendar })).toBe(closeLabel)
  })
})
