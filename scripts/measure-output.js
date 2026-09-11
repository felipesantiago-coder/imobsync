#!/usr/bin/env node
/**
 * Inventário de bytes do output de build do ImobSync.
 * Uso: node scripts/measure-output.js
 * Mede somas de bytes por diretório (base decimal) e analisa manifests .nft.json.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function dirBytes(dir, { skipNft = false } = {}) {
  let total = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        if (skipNft && e.name.endsWith('.nft.json')) continue;
        let st;
        try { st = fs.statSync(p); } catch { continue; }
        if (st.isFile()) { total += st.size; files += 1; }
      }
    }
  }
  return { total, files };
}

function walk(dir, cb) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else cb(p);
    }
  }
}

function fmt(bytes) {
  return (bytes / 1e6).toFixed(3) + ' MB';
}

const targets = {
  'public': path.join(ROOT, 'public'),
  '.next/static': path.join(ROOT, '.next/static'),
  '.next/server': path.join(ROOT, '.next/server'),
  '.next/standalone (após cópia)': path.join(ROOT, '.next/standalone'),
};

console.log('== Inventário de output (soma de bytes, MB decimal) ==');
for (const [name, dir] of Object.entries(targets)) {
  if (!fs.existsSync(dir)) { console.log(`${name}: AUSENTE`); continue; }
  const { total, files } = dirBytes(dir);
  console.log(`${name}: ${fmt(total)} (${files} arquivos)`);
}

// Análise dos manifests .nft.json em .next/server
const serverDir = path.join(ROOT, '.next/server');
if (fs.existsSync(serverDir)) {
  const manifests = [];
  walk(serverDir, (p) => { if (p.endsWith('.nft.json')) manifests.push(p); });
  const union = new Set();
  let sumNoDedup = 0;
  for (const m of manifests) {
    try {
      const list = JSON.parse(fs.readFileSync(m, 'utf8')).files || [];
      for (const f of list) {
        const rel = typeof f === 'string' ? f : f.path;
        const abs = path.resolve(path.dirname(m), rel);
        const st = fs.existsSync(abs) ? fs.statSync(abs) : null;
        const size = st && st.isFile() ? st.size : 0;
        sumNoDedup += size;
        union.add(abs + '::' + size);
      }
    } catch { /* ignore */ }
  }
  let unionBytes = 0;
  for (const key of union) unionBytes += Number(key.split('::')[1]);
  console.log(`\n== Manifests .nft.json (em .next/server) ==`);
  console.log(`Manifests: ${manifests.length}`);
  console.log(`União de arquivos citados: ${fmt(unionBytes)}`);
  console.log(`Soma sem deduplicação: ${fmt(sumNoDedup)}`);

  // Maiores pacotes na união (por prefixo node_modules/<pkg>[@scope])
  const perPkg = new Map();
  for (const key of union) {
    const abs = key.split('::')[0];
    const mAbs = abs.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
    const pkg = mAbs ? mAbs[1] : '(app)';
    perPkg.set(pkg, (perPkg.get(pkg) || 0) + Number(key.split('::')[1]));
  }
  const top = [...perPkg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('\nTop pacotes na união traceada:');
  for (const [pkg, bytes] of top) console.log(`  ${pkg}: ${fmt(bytes)}`);

  // TypeScript e Sharp/@img na união
  const has = (re) => {
    let b = 0;
    for (const key of union) {
      const abs = key.split('::')[0];
      if (re.test(abs)) b += Number(key.split('::')[1]);
    }
    return b;
  };
  console.log(`\nTypeScript na união: ${fmt(has(/node_modules\/typescript\//))}`);
  console.log(`Sharp + @img na união: ${fmt(has(/node_modules\/(sharp|@img)\//))}`);
}
