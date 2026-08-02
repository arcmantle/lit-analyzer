import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [ 'src/test/**/*.test.ts' ],

		// Every test file here launches a real VS Code instance, so they must not
		// run concurrently and they need a long timeout: the first run downloads
		// VS Code, and the TypeScript language server takes a while to produce
		// diagnostics.
		fileParallelism: false,
		maxWorkers:      1,
		testTimeout:     300_000,
		hookTimeout:     300_000,

		// This is the only project with a different worker count. The root config
		// refuses to group projects that disagree about it, so this one gets its
		// own group and runs after the others.
		sequence: { groupOrder: 1 },
	},
});
