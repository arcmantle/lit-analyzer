import { defineConfig } from 'vitest/config';

// The VS Code Vitest extension discovers tests by looking for a vitest config
// at the workspace root. Each package's own vitest.config.ts stays in place --
// lit-analyzer and ts-simple-type bound worker memory (they build real
// TypeScript Programs) and vscode-lit-plugin must run sequentially against a
// real VS Code instance -- so this root config just points Vitest's own
// monorepo mechanism at them, rather than merging configs with incompatible
// pool settings into one.
export default defineConfig({
	test: {
		projects: [
			'packages/lit-analyzer',
			'packages/lit-language-server',
			'packages/ts-simple-type',
			'packages/vscode-lit-plugin',
		],
	},
});
