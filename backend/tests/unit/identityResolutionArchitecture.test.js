const fs = require('fs');
const path = require('path');

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith('.js') ? [absolutePath] : [];
  });
}

describe('identity resolution architecture', () => {
  test('runtime code never resolves ownership by matching a display name', () => {
    const sourceRoot = path.join(__dirname, '../../src');
    const unsafeQueries = [];
    const displayNameLookup = /(?:username\s*=\s*\?\s+OR\s+real_name\s*=\s*\?|real_name\s*=\s*\?\s+OR\s+username\s*=\s*\?)/i;

    for (const file of collectJavaScriptFiles(sourceRoot)) {
      const source = fs.readFileSync(file, 'utf8');
      if (displayNameLookup.test(source)) {
        unsafeQueries.push(path.relative(sourceRoot, file));
      }
    }

    expect(unsafeQueries).toEqual([]);
  });
});
