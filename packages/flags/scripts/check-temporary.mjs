// Stops a publish while the source contains values which are marked as
// temporary with "TEMPORARY:", e.g. a test issuer or an endpoint which does
// not exist yet.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = readdirSync('src', { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && !entry.name.includes('.test.'))
  .map((entry) => join(entry.parentPath, entry.name))
  .filter((file) => readFileSync(file, 'utf8').includes('TEMPORARY:'));

if (files.length > 0) {
  console.error(
    `Replace the temporary values before publishing. See "TEMPORARY:" in:\n${files.map((file) => `- ${file}`).join('\n')}`,
  );
  process.exit(1);
}
