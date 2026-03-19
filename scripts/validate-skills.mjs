import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import matter from 'gray-matter';

const LIMITS = {
  name: 64,
  description: 1024,
  compatibility: 500,
  bodyLines: 500,
};

const ALLOWED_NAME_CHARS = new Set('abcdefghijklmnopqrstuvwxyz0123456789-');

let hasErrors = false;

function error(file, message) {
  console.error(`\x1b[31m✗\x1b[0m ${file}: ${message}`);
  hasErrors = true;
}

function ok(file, message) {
  console.log(`\x1b[32m✓\x1b[0m ${file}: ${message}`);
}

function warn(file, message) {
  console.log(`\x1b[33m⚠\x1b[0m ${file}: ${message}`);
}

const root = resolve(import.meta.dirname, '..');
const skillsDir = resolve(root, 'skills');

let dirs;
try {
  dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  );
} catch {
  console.log('No skills/ directory found — skipping validation.');
  process.exit(0);
}

const files = dirs
  .map((d) => ({ dir: d.name, path: resolve(skillsDir, d.name, 'SKILL.md') }))
  .filter(({ path }) => existsSync(path));

if (files.length === 0) {
  console.log('No SKILL.md files found — skipping validation.');
  process.exit(0);
}

for (const { dir, path: file } of files) {
  const relPath = file.replace(`${root}/`, '');
  const content = readFileSync(file, 'utf8');

  let fields;
  let body;
  try {
    const parsed = matter(content);
    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      error(relPath, 'Missing YAML frontmatter (--- block)');
      continue;
    }
    fields = parsed.data;
    body = parsed.content.trim();
  } catch (e) {
    error(relPath, `Invalid frontmatter: ${e.message}`);
    continue;
  }

  // name: required, max 64 chars, format constraints, must match directory
  if (!fields.name) {
    error(relPath, 'Missing required field: name');
  } else {
    const name = fields.name;
    if (name.length > LIMITS.name) {
      error(relPath, `Name is ${name.length} chars (max ${LIMITS.name})`);
    }
    if ([...name].some((ch) => !ALLOWED_NAME_CHARS.has(ch))) {
      error(
        relPath,
        'Name must only contain lowercase alphanumeric characters and hyphens',
      );
    }
    if (name.startsWith('-') || name.endsWith('-')) {
      error(relPath, 'Name must not start or end with a hyphen');
    }
    if (name.includes('--')) {
      error(relPath, 'Name must not contain consecutive hyphens (--)');
    }
    if (name !== dir) {
      error(relPath, `Name "${name}" does not match parent directory "${dir}"`);
    } else {
      ok(relPath, `Name "${name}" is valid`);
    }
  }

  // description: required, 1-1024 chars
  if (!fields.description) {
    error(relPath, 'Missing required field: description');
  } else {
    const len = fields.description.length;
    if (len > LIMITS.description) {
      error(relPath, `Description is ${len} chars (max ${LIMITS.description})`);
    } else {
      ok(relPath, `Description length ${len}/${LIMITS.description}`);
    }
  }

  // compatibility: optional, max 500 chars
  if (fields.compatibility) {
    const len = fields.compatibility.length;
    if (len > LIMITS.compatibility) {
      error(
        relPath,
        `Compatibility is ${len} chars (max ${LIMITS.compatibility})`,
      );
    }
  }

  // body: recommended < 500 lines
  const bodyLines = body.split('\n').length;
  if (bodyLines > LIMITS.bodyLines) {
    warn(
      relPath,
      `Body is ${bodyLines} lines (recommended max ${LIMITS.bodyLines})`,
    );
  } else {
    ok(relPath, `Body length ${bodyLines}/${LIMITS.bodyLines} lines`);
  }
}

if (hasErrors) {
  console.error('\nSkill validation failed.');
  process.exit(1);
} else {
  console.log('\nAll skills valid.');
}
