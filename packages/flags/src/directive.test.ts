import { describe, expect, it } from 'vitest';
import { hasUseFlagsDirective } from './directive';

describe('hasUseFlagsDirective', () => {
  it.each([
    "'use flags';\nexport const a = 1;",
    '"use flags"\nexport const a = 1;',
    "// The flags of the shop\n'use flags';",
    "/* comment */ 'use strict'; 'use flags';",
    "#!/usr/bin/env node\n'use flags';",
  ])('finds the directive in %j', (source) => {
    expect(hasUseFlagsDirective(source)).toBe(true);
  });

  it.each([
    "import x from 'y';\n'use flags';",
    "const a = 'use flags';",
    "'use client';",
    '',
    "'use flagsx';",
  ])('does not find the directive in %j', (source) => {
    expect(hasUseFlagsDirective(source)).toBe(false);
  });
});
