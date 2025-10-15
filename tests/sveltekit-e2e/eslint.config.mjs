import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname
});

const eslintConfig = [
	{
		ignores: ['node_modules', '.vercel', '.turbo', 'dist', '.svelte-kit'],
		rules: {
			'no-console': 'off'
		}
	},
	...compat.eslintConfig
];

export default eslintConfig;
