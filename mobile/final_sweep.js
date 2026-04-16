const fs = require('fs');
const path = require('path');

function getVueFiles(dir) {
  let results = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(getVueFiles(full));
    else if (entry.name.endsWith('.vue')) results.push(full);
  });
  return results;
}

const vueFiles = getVueFiles('f:/ERP/mobile/src');
let fixedCount = 0;

vueFiles.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  let originalC = c;

  // 1. 替换基础架子中的 Vant 蓝 #1989fa
  if (['App.vue', 'IOSInstallPrompt.vue'].includes(path.basename(f))) {
    c = c.replace(/#1989fa/g, 'var(--van-primary-color)');
  }

  // 2. 替换 Accounts.vue 中的资产类别硬编码
  if (f.endsWith('Accounts.vue')) {
    c = c.replace(/#A48BE0/g, 'var(--color-info)');
    c = c.replace(/#FFC759/g, 'var(--color-warning)');
  }

  // 3. 替换 Scan.vue 中的纯黑背景为更规范的设定
  if (f.endsWith('Scan.vue')) {
    c = c.replace(/background:\s*#000;/g, 'background: var(--bg-black, #000);');
  }

  // 4. 替换 Home.vue 里面遗漏的颜色
  if (f.endsWith('Home.vue')) {
     c = c.replace(/#eff6ff/g, 'var(--bg-secondary)');
     c = c.replace(/#2563eb/g, 'var(--color-info)');
     c = c.replace(/#ecfeff/g, 'var(--bg-secondary)');
     c = c.replace(/#0891b2/g, 'var(--color-primary)');
     c = c.replace(/#eef2ff/g, 'var(--bg-secondary)');
     c = c.replace(/#4f46e5/g, 'var(--color-info)');
     c = c.replace(/#ecfdf5/g, 'var(--bg-secondary)');
     c = c.replace(/#059669/g, 'var(--color-success)');
     c = c.replace(/#fff7ed/g, 'var(--bg-secondary)');
     c = c.replace(/#ea580c/g, 'var(--color-warning)');
     c = c.replace(/#faf5ff/g, 'var(--bg-secondary)');
     c = c.replace(/#9333ea/g, 'var(--color-info)');
     c = c.replace(/#fdf2f8/g, 'var(--bg-secondary)');
     c = c.replace(/#db2777/g, 'var(--color-error)');
     c = c.replace(/#f0fdfa/g, 'var(--bg-secondary)');
     c = c.replace(/#0d9488/g, 'var(--color-primary)');
     c = c.replace(/#fffbeb/g, 'var(--bg-secondary)');
     c = c.replace(/#d97706/g, 'var(--color-warning)');
     c = c.replace(/#fefce8/g, 'var(--bg-secondary)');
     c = c.replace(/#ca8a04/g, 'var(--color-warning)');
  }

  // 5. 将 font-size: xxxpx 转换为 rem (仅在 views 目录下执行，避免影响核心组件)
  if (f.includes('views') || f.includes('components')) {
    c = c.replace(/font-size:\s*(\d+)px/gi, (match, pxValue) => {
      // 16px = 1rem, 14px = 0.875rem, etc.
      const remValue = (parseInt(pxValue) / 16);
      return 'font-size: ' + remValue + 'rem';
    });
  }

  if (c !== originalC) {
    fs.writeFileSync(f, c, 'utf8');
    fixedCount++;
    console.log('Final fixed: ' + path.basename(f));
  }
});

console.log('Total files cleaned in final sweep: ' + fixedCount);

