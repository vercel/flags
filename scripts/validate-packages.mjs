import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

let hasErrors = false;

const root = resolve(import.meta.dirname, '..');
const packagesDir = resolve(root, 'packages');

const dirs = readdirSync(packagesDir, { withFileTypes: true }).filter((d) =>
  d.isDirectory(),
);

const files = dirs
  .map((d) => ({
    dir: d.name,
    path: resolve(packagesDir, d.name, 'package.json'),
  }))
  .filter(({ path }) => existsSync(path));

if (files.length === 0) {
  console.log('No package.json files found under packages/.');
  process.exit(0);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkPackage(pkg) {
  const checks = [];

  if (typeof pkg.description !== 'string' || pkg.description.trim() === '') {
    checks.push({
      ok: false,
      label: 'description',
      detail: 'must be a non-empty string',
    });
  } else {
    checks.push({ ok: true, label: 'description', detail: 'non-empty string' });
  }

  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
    checks.push({
      ok: false,
      label: 'keywords',
      detail: 'must be a non-empty array',
    });
  } else {
    checks.push({
      ok: true,
      label: 'keywords',
      detail: `${pkg.keywords.length} entries`,
    });
  }

  if (pkg.license !== 'MIT') {
    checks.push({
      ok: false,
      label: 'license',
      detail: `must be "MIT" (got ${JSON.stringify(pkg.license)})`,
    });
  } else {
    checks.push({ ok: true, label: 'license', detail: '"MIT"' });
  }

  if (isPlainObject(pkg.author)) {
    checks.push({ ok: true, label: 'author', detail: 'object' });
  } else if (typeof pkg.author === 'string' && pkg.author.trim() !== '') {
    checks.push({ ok: true, label: 'author', detail: 'non-empty string' });
  } else {
    checks.push({
      ok: false,
      label: 'author',
      detail: 'must be an object or non-empty string',
    });
  }

  if (!isPlainObject(pkg.repository)) {
    checks.push({
      ok: false,
      label: 'repository',
      detail: 'must be an object',
    });
  } else {
    checks.push({ ok: true, label: 'repository', detail: 'object' });
  }

  return checks;
}

for (const { dir, path: file } of files) {
  const relPath = file.replace(`${root}/`, '');

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`\n${BOLD}${dir}${RESET} ${DIM}(${relPath})${RESET}`);
    console.error(`  ${RED}✗${RESET} Invalid JSON: ${e.message}`);
    hasErrors = true;
    continue;
  }

  const checks = checkPackage(pkg);
  const failed = checks.filter((c) => !c.ok).length;
  const status =
    failed === 0
      ? `${GREEN}all ${checks.length} checks passed${RESET}`
      : `${RED}${failed}/${checks.length} failed${RESET}`;

  console.log(`\n${BOLD}${dir}${RESET} ${DIM}(${relPath})${RESET} — ${status}`);
  for (const c of checks) {
    const icon = c.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${c.label}: ${c.detail}`);
  }

  if (failed > 0) hasErrors = true;
}

if (hasErrors) {
  console.error(`\n${RED}Package validation failed.${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}All packages valid.${RESET}`);
}
