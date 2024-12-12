const { resolve } = require('node:path');

module.exports = {
  root: true,
  // This tells ESLint to load the config from the package `eslint-config-custom`
  extends: ['custom'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    'import/no-default-export': 'off',
    '@typescript-eslint/no-confusing-void-expression': 'off',
  },
  parserOptions: {
    project: [
      resolve(__dirname, './packages/*/tsconfig.json'),
      resolve(__dirname, './tooling/*/tsconfig.json'),
      resolve(__dirname, './examples/*/tsconfig.json'),
      resolve(__dirname, './tests/*/tsconfig.json'),
    ],
  },
};
