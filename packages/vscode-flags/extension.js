// @ts-check
/**
 * The VS Code extension for flags files. The grammar, the snippets and the
 * language configuration are in package.json. This file registers the
 * content mapper of `flags` with TypeScript 7 (the extension
 * "TypeScriptTeam.native-preview"), so that the editor knows the imports of
 * flags files, e.g. `import { summerSale } from './app.flags'`, in projects
 * whose tsconfig.json has the content mapper:
 *
 *   "contentMappers": [{ "package": "flags", "extensions": [".flags"] }]
 *
 * Without TypeScript 7, the extension still highlights the files.
 */
const vscode = require('vscode');

/** @param {import('vscode').ExtensionContext} context */
async function activate(context) {
  const typescript = vscode.extensions.getExtension(
    'TypeScriptTeam.native-preview',
  );
  if (!typescript) {
    return;
  }
  try {
    const api = await typescript.activate();
    const registration = api?.registerContentMappers?.('vercel.vscode-flags', [
      { extensions: ['.flags'] },
    ]);
    if (registration) {
      context.subscriptions.push(registration);
    }
  } catch (error) {
    console.error('Flags files: could not register the content mapper', error);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
