const fs = require('fs');
const file = 'f:/ERP/mobile/src/views/inventory/Stock.vue';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(
\    const response = await inventoryApi.getInventoryStock(params);
    
    if (response.data && Array.isArray(response.data)) {
      // 兼容返回数组的情况
      stockList.value = [...stockList.value, ...response.data];
      finished.value = response.data.length < pagination.limit;
    } else if (response.data && response.data.items) {
      // 兼容返回分页对象的情况
      stockList.value = [...stockList.value, ...response.data.items];
      pagination.total = response.data.total || 0;
      finished.value = stockList.value.length >= pagination.total;
    } else {
      finished.value = true;
    }\,
\    const response = await inventoryApi.getInventoryStock(params);
    const responseData = response.data;
    const pageData = responseData.data || responseData;
    const items = pageData.list || pageData.items || pageData.rows || [];
    
    if (pagination.page === 1) {
      stockList.value = items;
    } else {
      stockList.value.push(...items);
    }
    
    pagination.total = pageData.total || stockList.value.length;
    finished.value = stockList.value.length >= pagination.total || items.length === 0;\
);

// CSS tweaks
c = c.replace(/\\\-radius-md/g, 'var(--border-radius-md, 8px)');
c = c.replace(/\\\-radius-sm/g, 'var(--border-radius-sm, 4px)');
c = c.replace(/\\\-md/g, '16px');
c = c.replace(/\\\-sm/g, '8px');
c = c.replace(/\\\-xs/g, '4px');
c = c.replace(/\\\-md/g, '16px');
c = c.replace(/\\\-sm/g, '8px');
c = c.replace(/\\\-xs/g, '4px');
c = c.replace(/\\\-size-lg/g, '1.125rem');
c = c.replace(/\\\-size-md/g, '1rem');
c = c.replace(/\\\-size-sm/g, '0.875rem');
c = c.replace(/\\\-size-xs/g, '0.75rem');
c = c.replace(/\\\-color/g, 'var(--color-error)');
c = c.replace(/\\\-color/g, 'var(--color-success)');

fs.writeFileSync(file, c, 'utf8');

