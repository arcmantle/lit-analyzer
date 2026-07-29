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
			'dev/**',
			'packages/*/lib/**',
			'packages/*/out/**',
			'packages/*/scripts/**',
			'packages/*/test/**',
			'packages/*/index.*',
			'packages/vscode-lit-plugin/built/**',
			'**/.vscode-test/**',
			// Subtreed upstream source (git subtree add), kept verbatim so its
			// history stays inspectable. Follows its own repo's style, not ours.
			'packages/ts-simple-type/**',
		],
	},
];
