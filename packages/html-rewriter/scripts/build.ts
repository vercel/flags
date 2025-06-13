import { callMain, shell } from '@xmorse/deployment-utils';
import path from 'path';
import fs from 'fs-extra';

async function main() {
  await fs.rm(`dist`, { recursive: true, force: true });
  await shell(`wasm-pack build --target web`);
  // await shell(`wasm-pack build --target nodejs --out-dir node`)
  await fs.mkdirSync(`dist`, { recursive: true });
  await fs.copy(`pkg`, `dist`, {
    filter(p) {
      return (
        !p.endsWith('package.json') &&
        !p.endsWith('gitignore') &&
        !p.endsWith('README.md')
      );
    },
  });
  await fs.copy(`src`, `dist`, {
    filter(p) {
      // console.log(p)
      return !path.extname(p) || p.endsWith('.d.ts');
    },
  });
  await shell(`pnpm tsc `);
  await fs.copy(`src/asyncify.js`, `dist/asyncify.js`, {});

  // createa a file base64.js that exports the wasm as a base64 string
  // await fs.writeFile(
  //     `dist/base64.wasm.js`,
  //     `export default "${await fs.readFile(
  //         `dist/html_rewriter_bg.wasm`,
  //         {
  //             encoding: 'base64',
  //         },
  //     )}"`,
  // )
}

main();
