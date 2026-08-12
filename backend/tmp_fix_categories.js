const mysql = require('mysql2/promise');

const MANUAL_NAMES = {
  '2001': '银点与灯管',
  '2002': '焊接',
  '2003': '手工装配',
  '2003011': '手工装配附件',
  '3001': '塑料件',
  '3002': '冲制件',
  '3003': '压铸件',
  '3004': '橡胶件',
  '3005': '机加工件',
  '3006': '线缆',
  '3007': '电子元器件',
  '3008': '陶瓷/粉末件',
  '3009': '弹簧',
  '3010': '银点',
  '3011': '标准件',
  '3012': '电气元器件',
  '3013': '线路板',
  '3014': '原材料',
  '3015': '绝缘件',
  '3016': '胶水',
  '3017': '焊锡',
  '3018': '油脂',
  '4001': '外箱',
  '4002': '内盒',
  '4003': '标签',
  '4004': '合格证',
  '4005': '包装袋',
  '4006': '干燥剂',
  '4007': '说明书',
  '4008': '泡沫盒',
  '4009': '吸塑盒',
  '4012': '胶带',
  '4016': '皮筋',
  '4017': '珍珠棉',
  '4018': '塑料框',
  '199901': '其它开关配件',
  '199908': '开关组件',
  '199911': '行程开关钥匙'
};

function isNumericName(name) {
  return /^[0-9]+$/.test(String(name || '').trim());
}

function deriveFromChildren(children) {
  if (!children.length) return null;
  // Prefer "其它XXX" style as group name
  const other = children.find(c => /^(其它|其他)/.test(c.name) && !isNumericName(c.name));
  if (other) {
    return other.name.replace(/^(其它|其他)/, '').replace(/件$/, '件') || other.name;
  }
  // If single meaningful child name group
  const named = children.filter(c => !isNumericName(c.name));
  if (named.length === 1) return named[0].name.split('、')[0].split('，')[0].slice(0, 30);
  if (named.length >= 2) {
    // take first short token from first two
    const a = named[0].name.split('、')[0].split('，')[0];
    const b = named[1].name.split('、')[0].split('，')[0];
    const joined = a + '/' + b;
    return joined.length <= 20 ? joined : a;
  }
  return null;
}

function deriveFromMaterials(names) {
  if (!names.length) return null;
  // common prefix/suffix cleanup - use most frequent base word
  const cleaned = names.map(n => String(n).replace(/[（(].*$/, '').replace(/(停用)/g, '').trim()).filter(Boolean);
  if (!cleaned.length) return null;
  // if many share same name
  const freq = new Map();
  for (const n of cleaned) freq.set(n, (freq.get(n) || 0) + 1);
  const top = [...freq.entries()].sort((a,b) => b[1]-a[1])[0];
  if (top && (top[1] >= Math.ceil(cleaned.length * 0.4) || cleaned.length <= 3)) {
    return top[0].slice(0, 30);
  }
  // generic
  return (top[0] + '类').slice(0, 30);
}

(async () => {
  const conn = await mysql.createConnection({
    host: '192.168.1.251', user: 'root', password: 'mysql_n3cEDY', database: 'mes',
    multipleStatements: true
  });

  const [allCats] = await conn.query('SELECT id, parent_id, code, name, level FROM categories WHERE deleted_at IS NULL');
  const byId = new Map(allCats.map(c => [c.id, c]));
  const childrenByParent = new Map();
  for (const c of allCats) {
    const pid = c.parent_id || 0;
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(c);
  }

  const numeric = allCats.filter(c => isNumericName(c.name));
  const renames = [];

  for (const cat of numeric) {
    let newName = MANUAL_NAMES[cat.code] || null;
    if (!newName) {
      const kids = (childrenByParent.get(cat.id) || []).filter(k => !isNumericName(k.name));
      newName = deriveFromChildren(kids);
    }
    if (!newName) {
      const [mats] = await conn.query('SELECT name FROM materials WHERE category_id=? AND deleted_at IS NULL LIMIT 50', [cat.id]);
      newName = deriveFromMaterials(mats.map(m => m.name));
    }
    if (!newName) newName = cat.code + '类';
    // avoid duplicate names under same parent if possible
    const siblings = (childrenByParent.get(cat.parent_id || 0) || []).filter(s => s.id !== cat.id);
    if (siblings.some(s => s.name === newName)) {
      newName = newName + '(' + cat.code + ')';
    }
    if (newName !== cat.name) {
      renames.push({ id: cat.id, code: cat.code, from: cat.name, to: newName });
    }
  }

  await conn.beginTransaction();
  try {
    for (const r of renames) {
      await conn.query(
        "UPDATE categories SET name=?, remark=CONCAT(COALESCE(remark,''), CASE WHEN remark IS NULL OR remark='' THEN '' ELSE '; ' END, 'numeric-name-fixed'), updated_at=NOW() WHERE id=?",
        [r.to, r.id]
      );
    }

    // Refresh cats after rename
    const [cats2] = await conn.query('SELECT id, parent_id, code, name, level FROM categories WHERE deleted_at IS NULL');
    const catMap = new Map(cats2.map(c => [c.id, c]));

    function ancestorAtLevel(catId, targetLevel) {
      let cur = catMap.get(catId);
      while (cur) {
        if (cur.level === targetLevel) return cur;
        if (!cur.parent_id) break;
        cur = catMap.get(cur.parent_id);
      }
      return null;
    }
    function parentOf(catId) {
      const c = catMap.get(catId);
      if (!c || !c.parent_id) return null;
      return catMap.get(c.parent_id) || null;
    }

    // Fill product_category_id
    // Rule: product_category = level-3 ancestor when available; else level-2; else parent; else self
    const [mats] = await conn.query('SELECT id, category_id, product_category_id, code FROM materials WHERE deleted_at IS NULL');
    let updatedPc = 0;
    let missingCat = 0;
    const batch = [];
    for (const m of mats) {
      const leaf = catMap.get(m.category_id);
      if (!leaf) { missingCat++; continue; }
      let pc = ancestorAtLevel(leaf.id, 3);
      if (!pc) pc = ancestorAtLevel(leaf.id, 2);
      if (!pc) pc = parentOf(leaf.id);
      if (!pc) pc = leaf;
      // If leaf itself is level<=3, product category can be leaf (大类即类型)
      if (leaf.level <= 3) pc = leaf;
      else {
        // leaf level>=4: product category is parent preferably level3
        pc = parentOf(leaf.id) || pc;
        const l3 = ancestorAtLevel(leaf.id, 3);
        if (l3) pc = l3;
      }
      if (m.product_category_id !== pc.id) {
        batch.push([pc.id, m.id]);
      }
    }
    // bulk update in chunks
    for (let i = 0; i < batch.length; i += 500) {
      const chunk = batch.slice(i, i + 500);
      // use CASE update
      const ids = chunk.map(x => x[1]);
      const caseSql = chunk.map(() => 'WHEN ? THEN ?').join(' ');
      const params = [];
      for (const [pcid, mid] of chunk) { params.push(mid, pcid); }
      params.push(...ids);
      await conn.query(
        `UPDATE materials SET product_category_id = CASE id ${chunk.map(() => 'WHEN ? THEN ?').join(' ')} END, updated_at=NOW() WHERE id IN (${ids.map(()=>'?').join(',')})`,
        params
      );
      updatedPc += chunk.length;
    }

    await conn.commit();

    const [numLeft] = await conn.query("SELECT COUNT(*) cnt FROM categories WHERE name REGEXP '^[0-9]+$' AND deleted_at IS NULL");
    const [pcStats] = await conn.query(`
      SELECT SUM(product_category_id IS NULL) null_pc, SUM(product_category_id IS NOT NULL) has_pc, COUNT(*) total
      FROM materials WHERE deleted_at IS NULL
    `);
    const [samples] = await conn.query(`
      SELECT m.code, m.name, c.code cat_code, c.name cat_name, pc.code pc_code, pc.name pc_name
      FROM materials m
      LEFT JOIN categories c ON c.id = m.category_id
      LEFT JOIN categories pc ON pc.id = m.product_category_id
      WHERE m.code IN ('100601001','100104001','3001002002','4017001002','199999001','103899010')
      ORDER BY m.code
    `);
    const [matNum] = await conn.query(`
      SELECT COUNT(*) cnt FROM materials m
      JOIN categories c ON c.id=m.category_id
      WHERE c.name REGEXP '^[0-9]+$'
    `);

    console.log(JSON.stringify({
      renames: renames.length,
      renameSamples: renames.slice(0, 20),
      numericLeft: numLeft[0].cnt,
      materialsWithNumericCat: matNum[0].cnt,
      productCategoryStats: pcStats[0],
      updatedProductCategory: updatedPc,
      missingCat,
      samples
    }, null, 2));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    await conn.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
