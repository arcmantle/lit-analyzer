import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: [ 'src/test/**/*.test.ts' ],

		// Several tests spawn the compiled server as a real child process and
		// boot a full `ts.LanguageService`, so the pool is bounded the same way as
		// its sibling packages. The root config groups projects by their worker
		// settings, so a project that leaves this at the default cannot run beside
		// one that bounds it.
		pool:       'forks',
		maxWorkers: 4,

		// That cold start is comfortably under a second on its own, but can push
		// past the 5s default when the whole suite runs under CPU contention.
		testTimeout: 15_000,
	},
});
