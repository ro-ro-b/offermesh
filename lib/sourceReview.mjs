// Source review bundle — fleet standard: list app source files with per-file and bundle hashes.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE_DIRS = ['lib', 'scripts', 'data', 'template', 'public', 'api'];
const INCLUDE_ROOT_FILES = ['server.mjs', 'package.json', 'README.md', 'vercel.json'];

export function sourceReviewBundle(version) {
  const files = [];
  for (const f of INCLUDE_ROOT_FILES) addFile(files, join(ROOT, f));
  for (const dir of INCLUDE_DIRS) walk(files, join(ROOT, dir));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const bundleHash = '0x' + createHash('sha256').update(files.map((f) => f.path + ':' + f.sha256).join('\n')).digest('hex');
  return {
    service: 'revolv',
    product: 'revolv',
    engine: 'offermesh',
    service_version: version,
    file_count: files.length,
    files,
    bundle_hash: bundleHash,
    generated_at: new Date().toISOString(),
    note: 'Non-secret source listing. No env values, tokens, or state files included.'
  };
}

function walk(files, dir) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === 'state.json' || name.startsWith('.')) continue; // never include runtime state
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(files, p);
    else addFile(files, p);
  }
}

function addFile(files, p) {
  try {
    const content = readFileSync(p);
    files.push({
      path: relative(ROOT, p),
      bytes: content.length,
      sha256: '0x' + createHash('sha256').update(content).digest('hex')
    });
  } catch { /* skip unreadable */ }
}
