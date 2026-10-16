// Node 25+ also defines Web Storage globals. Browser tests must use the
// origin-scoped jsdom Storage so they behave like the application in a tab.
for (const name of globalThis.jsdom?.window ? ['localStorage', 'sessionStorage'] : []) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: globalThis.jsdom.window[name]
  })
}
