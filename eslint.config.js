import configs from '@arcmantle/eslint-config';
import globals from 'globals';

export default [
	...configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
	},
	{
		ignores: [
			'**/node_modules/**',
			'**/out/**',
			'**/dist/**',
			'packages/playground/**',
			// Deliberately unusual sample components that the vendored
			// web-component-analyzer suite analyses as fixtures. They are input
			// data, not source, and several do not parse as plain TypeScript.
			'packages/*/dev/**',
			'packages/*/lib/**',
			'packages/*/out/**',
			'packages/*/scripts/**',
			'packages/*/test/**',
			'packages/*/index.*',
			'packages/vscode-lit-plugin/built/**',
			'**/.vscode-test/**',
		],
	},
];
