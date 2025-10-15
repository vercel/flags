import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig([
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    // When ignores is used without any other keys (besides name) in the configuration object,
    // then the patterns act as global ignores. This means they apply to every configuration
    // object (not only to the configuration object in which it is defined).
    //
    // Global ignores allows you not to have to copy and keep the ignores property
    // synchronized in more than one configuration object.
    ignores: [
      "**/node_modules/**",
      "**/.vercel/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/.svelte-kit/**",
      "**/.next/**",
      "**/vite.config.ts.timestamp*",
    ],
  },
  {
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "import/no-default-export": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "no-var": "error",
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
]);
