const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const espree = require('espree');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(filename) : filename.endsWith('.js') ? [filename] : [];
  });
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') callback(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => visit(child, callback));
    else if (value && typeof value === 'object') visit(value, callback);
  }
}

test('every static relative backend module reference resolves, including deferred business branches', () => {
  const root = path.resolve(__dirname, '../../src');
  const unresolved = [];
  for (const filename of sourceFiles(root)) {
    const ast = espree.parse(fs.readFileSync(filename, 'utf8'), {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      loc: true,
    });
    const resolveFromFile = createRequire(filename).resolve;
    visit(ast, (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'Identifier' || node.callee.name !== 'require') return;
      const argument = node.arguments[0];
      if (argument?.type !== 'Literal' || typeof argument.value !== 'string' || !argument.value.startsWith('.')) return;
      try {
        resolveFromFile(argument.value);
      } catch (error) {
        if (error.code !== 'MODULE_NOT_FOUND') throw error;
        unresolved.push(`${path.relative(root, filename)}:${node.loc.start.line} -> ${argument.value}`);
      }
    });
  }
  expect(unresolved).toEqual([]);
});
