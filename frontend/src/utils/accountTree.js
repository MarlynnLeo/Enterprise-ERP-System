// Keep the stored parent relationship when available; older accounts may only
// encode their hierarchy in the account code (1002 -> 100201 -> 10020101).
export function buildAccountTree(accounts) {
  const nodes = accounts.map(account => ({
    ...account,
    fullName: `${account.accountCode} - ${account.accountName}`,
  })).sort((a, b) => String(a.accountCode).localeCompare(String(b.accountCode)));
  const byId = new Map(nodes.map(node => [String(node.id), node]));
  const byCode = new Map();
  for (const node of nodes) {
    const code = String(node.accountCode);
    // A duplicate code cannot identify a parent unambiguously.
    byCode.set(code, byCode.has(code) ? null : node);
  }
  const parents = new Map();
  const roots = [];

  for (const node of nodes) {
    delete node.children;
    let parent = node.parentId == null ? null : byId.get(String(node.parentId));
    if (!parent || parent === node) {
      parent = null;
      const code = String(node.accountCode);
      for (let length = code.length - 1; length > 0; length--) {
        const prefix = code.slice(0, length);
        if (byCode.has(prefix)) {
          parent = byCode.get(prefix);
          break;
        }
      }
    }
    if (parent) parents.set(node, parent);
  }

  // Break malformed cycles so every account remains reachable in the table.
  for (const node of nodes) {
    const visited = new Set([node]);
    let ancestor = parents.get(node);
    while (ancestor) {
      if (visited.has(ancestor)) {
        parents.delete(node);
        break;
      }
      visited.add(ancestor);
      ancestor = parents.get(ancestor);
    }
  }

  for (const node of nodes) {
    const parent = parents.get(node);
    if (parent) (parent.children ??= []).push(node);
    else roots.push(node);
  }
  return roots;
}

export function filterAccountTree(tree, filters) {
  const code = String(filters.account_code || '').trim().toLowerCase();
  const name = String(filters.account_name || '').trim().toLowerCase();
  const type = filters.account_type;
  if (!code && !name && !type) return tree;

  const filterNodes = nodes => nodes.flatMap(node => {
    const matches = String(node.accountCode).toLowerCase().includes(code)
      && String(node.accountName).toLowerCase().includes(name)
      && (!type || node.accountType === type);
    if (matches) return [node];
    const children = filterNodes(node.children || []);
    return children.length ? [{ ...node, children }] : [];
  });
  return filterNodes(tree);
}

export function getAccountBranchKeys(tree) {
  return tree.flatMap(node => node.children?.length
    ? [String(node.id), ...getAccountBranchKeys(node.children)]
    : []);
}
