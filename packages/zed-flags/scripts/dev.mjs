/**
 * Prepares the Zed extension for "zed: install dev extension". Zed builds a
 * grammar from a commit of a Git repository, and only from the committed
 * files. So the dev extension points to:
 *
 * - this repository at HEAD (file://, with `path`), if
 *   packages/tree-sitter-flags has no uncommitted changes;
 * - else a snapshot: a copy of packages/tree-sitter-flags in a new Git
 *   repository, with one commit. Thus a change of the grammar can be tried
 *   before it is committed.
 *
 * The extension is copied into a new temporary directory, because its
 * `repository` is an absolute path of this machine. Run
 * `pnpm --filter tree-sitter-flags generate` first if you changed
 * grammar.js.
 *
 *   node packages/zed-flags/scripts/dev.mjs
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const extension = fileURLToPath(new URL('..', import.meta.url));
const grammar = fileURLToPath(
  new URL('../../tree-sitter-flags', import.meta.url),
);

const git = (cwd, ...args) =>
  execFileSync(
    'git',
    ['-c', 'user.name=flags', '-c', 'user.email=flags@localhost', ...args],
    { cwd, encoding: 'utf8' },
  ).trim();

const out = mkdtempSync(join(tmpdir(), 'zed-flags-dev-'));
const extensionCopy = join(out, 'zed-flags');

/** The grammar in this repository at HEAD, if it is committed */
function committedGrammar() {
  const root = git(grammar, 'rev-parse', '--show-toplevel');
  const path = relative(root, grammar).split('\\').join('/');
  const committed =
    git(root, 'ls-files', '--', `${path}/src/parser.c`) !== '' &&
    git(root, 'status', '--porcelain', '--untracked-files=all', '--', path) ===
      '';
  if (!committed) {
    return undefined;
  }
  return { repository: root, rev: git(root, 'rev-parse', 'HEAD'), path };
}

/** A copy of the grammar in a new Git repository, with one commit */
function snapshotGrammar() {
  const repository = join(out, 'tree-sitter-flags');
  for (const part of [
    'grammar.js',
    'tree-sitter.json',
    'package.json',
    'src',
    'queries',
  ]) {
    cpSync(join(grammar, part), join(repository, part), { recursive: true });
  }
  git(repository, 'init', '--quiet');
  git(repository, 'add', '.');
  git(repository, 'commit', '--quiet', '-m', 'tree-sitter-flags');
  return { repository, rev: git(repository, 'rev-parse', 'HEAD') };
}

const source = committedGrammar() ?? snapshotGrammar();

cpSync(join(extension, 'languages'), join(extensionCopy, 'languages'), {
  recursive: true,
});
const grammarSection = [
  '[grammars.flags]',
  `repository = "file://${source.repository}"`,
  `rev = "${source.rev}"`,
  ...(source.path ? [`path = "${source.path}"`] : []),
  '',
].join('\n');
const manifest = readFileSync(
  join(extension, 'extension.toml'),
  'utf8',
).replace(/\[grammars\.flags\][\s\S]*$/, grammarSection);
writeFileSync(join(extensionCopy, 'extension.toml'), manifest);

console.log(`The dev extension is in ${extensionCopy}
Its grammar is ${source.path ? `this repository at ${source.rev.slice(0, 7)} (HEAD)` : 'a snapshot of the uncommitted grammar'}.

In Zed, run "zed: install dev extension" from the command palette, and
select that directory. Then open a .flags file.`);
