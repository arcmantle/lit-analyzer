import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include:     [ 'src/test/**/*.test.ts' ],
		// Several tests spawn the compiled server as a real child process and
		// boot a full `ts.LanguageService`. That cold start is comfortably
		// under a second on its own, but can push past the 5s default when
		// the whole suite runs under CPU contention (many workers, CI).
		testTimeout: 15_000,
	},
});
