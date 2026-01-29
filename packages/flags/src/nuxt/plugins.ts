import type { Node, Program } from 'estree';
import MagicString from 'magic-string';
import { hash } from 'ohash';
import tsBlankSpace from 'ts-blank-space';
import { createUnplugin } from 'unplugin';

const FLAG_RE = /defineFlag[^(]*\(\s*{[\s\S]*?}\s*/;

interface FlagsPluginOptions {
  dir?: string | false;
  injectAllFlags: boolean;
}

/**
 * This plugin removes the content of the flag definition object on the client side
 */
export const FlagsPlugin = (opts: FlagsPluginOptions) => {
  const keys = new Set<string>();
  const server = createUnplugin((_opts, meta) => ({
    name: 'flags:server',
    transform: {
      filter: {
        code: FLAG_RE,
      },
      handler(code, id) {
        // nitro build calls rollup plugins with raw TypeScript, which acorn can't parse
        if (meta.framework === 'rollup' && /\.(?:ts|cts|mts|tsx)$/.test(id)) {
          code = tsBlankSpace(code);
        }

        const ast = this.parse(code, {
          ecmaVersion: 'latest',
          sourceType: 'module',
        });

        const s = annotateWithKeys(id, code, ast as unknown as Program, {
          mode: 'append',
          stripImports: false,
          keys,
        });
        if (s.hasChanged()) {
          return {
            code: s.toString(),
            map: s.generateMap({ hires: true }),
          };
        }
      },
    },
  }));

  const client = createUnplugin(() => {
    return {
      name: 'flags:client',
      transform: {
        filter: {
          code: FLAG_RE,
        },
        async handler(code, id) {
          const ast = this.parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module',
          });

          const s = annotateWithKeys(id, code, ast as unknown as Program, {
            mode: 'replace',
            stripImports: !!opts.dir && id.startsWith(opts.dir),
            keys,
          });
          if (s.hasChanged()) {
            return {
              code: s.toString(),
              map: s.generateMap({ hires: true }),
            };
          }
        },
      },
    };
  });

  return { client, server };
};

interface WalkerOptions {
  enter: (node: Node, parent: Node | null | undefined) => void;
}

function walk(ast: Node, { enter }: WalkerOptions) {
  const parents: (Node | null)[] = [null];

  function visit(node: Node) {
    const parent = parents[parents.length - 1];
    enter(node, parent);
    parents.push(node);
    for (const key in node) {
      if (Object.hasOwn(node, key)) {
        const child = (node as any)[key];
        if (Array.isArray(child)) {
          child.forEach((c) => {
            if (c && typeof c.type === 'string') {
              visit(c);
            }
          });
        } else if (child && typeof child.type === 'string') {
          visit(child);
        }
      }
    }
    parents.pop();
  }

  visit(ast);
}

// should be stable across runs and based on file path and number of calls within the path
function generateHash(id: string, count = 0): string {
  return hash(`${id}-${count}`);
}

function withRanges<T extends Node>(node: T) {
  return node as T & { start: number; end: number };
}

interface AnnotationOptions {
  keys: Set<string>;
  stripImports: boolean;
  mode: 'append' | 'replace';
}

function annotateWithKeys(
  id: string,
  code: string,
  ast: Program,
  opts: AnnotationOptions,
) {
  const s = new MagicString(code);
  let count = 0;
  walk(ast, {
    enter(node) {
      // strip any imports that are not of 'flags/nuxt/runtime' or '#imports'
      if (opts.stripImports && node.type === 'ImportDeclaration') {
        const source = node.source.value;
        const validImports = ['flags/nuxt/runtime', '#imports'];
        if (
          source &&
          typeof source === 'string' &&
          !validImports.some((i) => source.startsWith(i))
        ) {
          s.remove(withRanges(node).start, withRanges(node).end);
        }
      }
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'defineFlag'
      ) {
        const args = node.arguments;
        if (args.length === 1) {
          const key = generateHash(id, ++count);
          if (opts.mode === 'append' && !opts.keys.has(key)) {
            console.error(
              'Warning: Flag key not found during client annotation:',
              key,
            );
          }
          opts.keys.add(key);
          if (opts.mode === 'append') {
            s.appendLeft(
              withRanges(args.at(-1)!).end,
              `, ${JSON.stringify(key)}`,
            );
          } else {
            s.overwrite(
              withRanges(args[0]!).start,
              withRanges(args.at(-1)!).end,
              `{}, ${JSON.stringify(key)}`,
            );
          }
        }
      }
    },
  });
  return s;
}
