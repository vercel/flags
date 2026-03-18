import { readFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { resolve } from 'node:path';

const MAX_DESCRIPTION_LENGTH = 1024;
const REQUIRED_FIELDS = ['name', 'description'];

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fields = {};
  let currentKey = null;
  let isMultiline = false;

  for (const line of match[1].split('\n')) {
    const keyMatch = line.match(/^(\w+):\s*(.*)$/);
    if (keyMatch) {
      const [, key, rest] = keyMatch;
      if (rest.trim() === '>') {
        currentKey = key;
        isMultiline = true;
        fields[key] = '';
      } else {
        currentKey = key;
        isMultiline = false;
        fields[key] = rest.trim();
      }
    } else if (isMultiline && currentKey && line.startsWith('  ')) {
      fields[currentKey] += (fields[currentKey] ? ' ' : '') + line.trim();
    }
  }
  return fields;
}

let hasErrors = false;

function error(file, message) {
  console.error(`\x1b[31m✗\x1b[0m ${file}: ${message}`);
  hasErrors = true;
}

function ok(file, message) {
  console.log(`\x1b[32m✓\x1b[0m ${file}: ${message}`);
}

const root = resolve(import.meta.dirname, '..');
const pattern = resolve(root, 'skills/*/SKILL.md');
const files = [];

for await (const entry of glob(pattern)) {
  files.push(entry);
}

if (files.length === 0) {
  console.log('No SKILL.md files found — skipping validation.');
  process.exit(0);
}

for (const file of files) {
  const relPath = file.replace(`${root}/`, '');
  const content = readFileSync(file, 'utf8');

  const fields = parseFrontmatter(content);
  if (!fields) {
    error(relPath, 'Missing YAML frontmatter (--- block)');
    continue;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!fields[field]) {
      error(relPath, `Missing required field: ${field}`);
    }
  }

  if (fields.description) {
    const len = fields.description.length;
    if (len > MAX_DESCRIPTION_LENGTH) {
      error(
        relPath,
        `Description is ${len} characters (max ${MAX_DESCRIPTION_LENGTH})`,
      );
    } else {
      ok(relPath, `Description length ${len}/${MAX_DESCRIPTION_LENGTH}`);
    }
  }
}

if (hasErrors) {
  console.error('\nSkill validation failed.');
  process.exit(1);
} else {
  console.log('\nAll skills valid.');
}
