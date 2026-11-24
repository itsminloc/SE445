/**
 * Cross-platform SE445 ORI Test Runner (cloned from CyberRig pattern)
 * Expands `services` and `tests` *.spec.ts files deterministically so `npm test`
 * works identically on Windows PowerShell, Node 20+, and Linux CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function collectSpecFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSpecFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }

  return results.sort();
}

const specFiles = [...collectSpecFiles('services'), ...collectSpecFiles('tests')];
if (specFiles.length === 0) {
  console.error('No *.spec.ts files found.');
  process.exit(1);
}

const isWin = process.platform === 'win32';
const tsxBin = path.resolve('node_modules', '.bin', isWin ? 'tsx.cmd' : 'tsx');

const result = spawnSync(
  tsxBin,
  ['--test', '--test-concurrency=1', ...specFiles],
  {
    stdio: 'inherit',
    shell: isWin,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'test',
    },
  }
);

process.exit(result.status ?? 1);
