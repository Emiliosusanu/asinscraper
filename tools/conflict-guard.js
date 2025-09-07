#!/usr/bin/env node
/* Conflict Guard: scan and optionally fix Git conflict markers.
 * Behavior:
 *  - check (default): exits non-zero if any markers are found; prints a list with locations
 *  - fix: keeps the HEAD section and discards the other section, removing markers
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MODE = (process.argv[2] || 'check').toLowerCase();

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.vercel',
  '.next',
  '.output',
  '.cache',
  '.tmp',
]);

const ALLOWED_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.json', '.css', '.scss', '.sass', '.less',
  '.html', '.md', '.markdown', '.txt', '.svg',
  '.yml', '.yaml', '.toml', '.env', '.env.local',
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ALLOWED_EXTS.has(ext)) return true;
  // include some root config files without extensions
  const base = path.basename(filePath);
  return ['.env', '.env.local'].includes(base);
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full));
    } else if (entry.isFile() && isTextFile(full)) {
      files.push(full);
    }
  }
  return files;
}

function findConflictMarkers(content) {
  const lines = content.split('\n');
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('<<<<<<<')) results.push({ line: i + 1, marker: '<<<<<<<' });
    else if (line.startsWith('=======')) results.push({ line: i + 1, marker: '=======' });
    else if (line.startsWith('>>>>>>>')) results.push({ line: i + 1, marker: '>>>>>>>' });
  }
  // Heuristic: require at least one <<<<<<< and one >>>>>>> to treat as a true conflict segment
  const hasStart = results.some(r => r.marker === '<<<<<<<');
  const hasEnd = results.some(r => r.marker === '>>>>>>>' );
  return hasStart && hasEnd ? results : [];
}

function fixConflicts(content) {
  const lines = content.split('\n');
  const out = [];
  let state = 'normal';
  let headBuf = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (state === 'normal') {
      if (line.startsWith('<<<<<<<')) {
        state = 'in_head';
        headBuf = [];
        changed = true;
        continue; // skip marker
      }
      out.push(line);
      continue;
    }
    if (state === 'in_head') {
      if (line.startsWith('=======')) {
        state = 'in_other';
        continue; // skip separator
      }
      headBuf.push(line);
      continue;
    }
    if (state === 'in_other') {
      if (line.startsWith('>>>>>>>')) {
        // end of conflict: keep the headBuf content
        out.push(...headBuf);
        state = 'normal';
        continue; // skip end marker
      }
      // discard other version lines
      continue;
    }
  }

  if (state !== 'normal') {
    throw new Error('Unbalanced conflict markers detected; manual resolution required.');
  }

  return { content: out.join('\n'), changed };
}

function main() {
  const files = listFiles(ROOT);
  const offenders = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const markers = findConflictMarkers(raw);
      if (markers.length) {
        if (MODE === 'fix') {
          const { content: fixed, changed } = fixConflicts(raw);
          if (changed) {
            fs.writeFileSync(file, fixed, 'utf8');
            console.log(`[fixed] ${path.relative(ROOT, file)}`);
          }
        } else {
          offenders.push({ file, markers });
        }
      }
    } catch (e) {
      // ignore unreadable files
    }
  }

  if (MODE === 'fix') {
    console.log('Conflict auto-fix completed.');
    process.exit(0);
  }

  if (offenders.length) {
    console.error('\nGit conflict markers detected in the following files (keep HEAD, delete other):');
    for (const o of offenders) {
      console.error(`- ${path.relative(ROOT, o.file)} @ lines: ${o.markers.map(m => m.line).join(', ')}`);
    }
    console.error('\nResolve (or run: npm run fix:conflicts) and re-run the build.');
    process.exit(1);
  }

  process.exit(0);
}

main();
