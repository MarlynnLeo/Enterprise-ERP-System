/**
 * 比较 mobile 和 frontend 的 API 路径，生成索引文件
 */
const fs = require('fs');
const path = require('path');

function extractRoutes(content) {
  const routes = new Set();
  const regex = /\.(get|post|put|delete|patch)\s*\(\s*[`'"](\/[^`'"]+)[`'"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const route = match[2].replace(/\$\{[^}]+\}/g, ':id');
    routes.add(route);
  }
  return routes;
}

// Mobile
const mobileContent = fs.readFileSync('mobile/src/services/api.js', 'utf8');
const mobileRoutes = extractRoutes(mobileContent);

// Frontend
const frontendDir = 'frontend/src/api';
const frontendRoutes = new Set();
const files = fs.readdirSync(frontendDir).filter(f => f.endsWith('.js'));
for (const file of files) {
  const content = fs.readFileSync(path.join(frontendDir, file), 'utf8');
  const routes = extractRoutes(content);
  for (const r of routes) frontendRoutes.add(r);
}

const mobileArr = [...mobileRoutes].sort();
const frontendArr = [...frontendRoutes].sort();
const shared = mobileArr.filter(r => frontendRoutes.has(r));
const mobileOnly = mobileArr.filter(r => !frontendRoutes.has(r));
const frontendOnly = frontendArr.filter(r => !mobileRoutes.has(r));

// Generate markdown
let md = `# API 路径同步索引

> **用途**：当后端 API 变更时，参照此文件检查移动端和PC端是否需要同步修改。
>
> **生成时间**：${new Date().toISOString().split('T')[0]}
>
> **统计**：共享 ${shared.length} 条 | 仅移动端 ${mobileOnly.length} 条 | 仅PC端 ${frontendOnly.length} 条

---

## 共享路径（${shared.length} 条）

两端都引用了以下 API 路径，变更时 **必须双端同步修改**：

| 路径 |
|------|
${shared.map(r => `| \`${r}\` |`).join('\n')}

---

## 仅移动端（${mobileOnly.length} 条）

以下路径仅在 \`mobile/src/services/api.js\` 中定义：

| 路径 |
|------|
${mobileOnly.map(r => `| \`${r}\` |`).join('\n')}

---

## 仅PC端（${frontendOnly.length} 条）

以下路径仅在 \`frontend/src/api/\` 目录中定义：

| 路径 |
|------|
${frontendOnly.map(r => `| \`${r}\` |`).join('\n')}

---

## 维护指南

1. 后端新增/修改/删除 API 时，查找此文件确认影响范围
2. 如果是共享路径，两端都需要修改
3. 定期执行 \`node shared/generate-api-index.js\` 重新生成此文件
`;

fs.writeFileSync('shared/api-index.md', md, 'utf8');
console.log(`Generated shared/api-index.md`);
console.log(`  Shared: ${shared.length}`);
console.log(`  Mobile only: ${mobileOnly.length}`);
console.log(`  Frontend only: ${frontendOnly.length}`);
