/**
 * Whether a module starts with the `'use flags'` directive. It reads only the
 * directive prologue: comments, whitespace and string literals at the start
 * of the module, as for `'use client'`. It is not a parser.
 */
export function hasUseFlagsDirective(source: string): boolean {
  let rest = source.replace(/^#![^\n]*/, '');
  for (;;) {
    rest = rest.replace(/^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/, '');
    const directive = /^(['"])([^'"\n]*)\1\s*;?/.exec(rest);
    if (!directive) return false;
    if (directive[2] === 'use flags') return true;
    rest = rest.slice(directive[0].length);
  }
}
