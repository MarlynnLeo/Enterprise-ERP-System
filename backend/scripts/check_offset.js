const fs = require('fs');
const path = require('path');

function findAll(dir) {
  let r = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) r.push(...findAll(p));
    else if (e.name.endsWith('.js')) r.push(p);
  }
  return r;
}

const base = path.join(process.cwd(), 'src', 'controllers');
const files = findAll(base);
let issues = 0;

for (const f of files) {
  const c = fs.readFileSync(f, 'utf-8');
  const rel = path.relative(base, f);
  const lines = c.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/OFFSET\s+\$\{(\w+)\}/);
    if (!m) continue;
    const varName = m[1];

    let defined = false;
    for (let j = i - 1; j >= Math.max(0, i - 200); j--) {
      const line = lines[j];
      if (line.includes(varName) && (/const |let |var |= /.test(line) || /req\.query/.test(line))) {
        defined = true;
        break;
      }
    }
    if (!defined) {
      issues++;
      console.log(`WARN: undefined offset var "${varName}" at ${rel}:L${i + 1}`);
    }
  }
}

console.log(`\nTotal offset issues: ${issues}`);
